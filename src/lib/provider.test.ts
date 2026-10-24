import { describe, it, expect, beforeEach } from "vitest";
import { agentsOffer, forgetDescriptors, parseDescriptor, podAddress, readDescriptor, sameSite } from "./provider";

const MOM = "https://pod.mapsofmaking.org/";
const overlay = {
  software: "solid-css-overlay",
  version: "7.2.0-6",
  layout: "subdomain",
  capabilities: { account: { path: "/.account/" }, onboard: { path: "/onboard/" }, connector: { url: "https://mcp.pod.mapsofmaking.org/" } },
};

beforeEach(() => forgetDescriptors());

describe("parseDescriptor", () => {
  it("resolves the paths on the issuer's origin", () => {
    const d = parseDescriptor(MOM, overlay)!;
    expect(d.account).toBe("https://pod.mapsofmaking.org/.account/");
    expect(d.onboard).toBe("https://pod.mapsofmaking.org/onboard/");
    expect(d.connector).toBe("https://mcp.pod.mapsofmaking.org/");
    expect(d.layout).toBe("subdomain");
  });

  it("refuses a path that leaves the issuer's origin: it would be called with the cookie", () => {
    const d = parseDescriptor(MOM, { capabilities: { account: { path: "https://evil.example/.account/" }, onboard: { path: "//evil.example/x" } } })!;
    expect(d.account).toBeNull();
    expect(d.onboard).toBeNull();
  });
});

describe("readDescriptor", () => {
  it("is null when the server has none (stock CSS answers 401)", async () => {
    expect(await readDescriptor(MOM, async () => new Response("", { status: 401 }))).toBeNull();
  });

  it("asks once per issuer, without credentials", async () => {
    const calls: RequestInit[] = [];
    const f = async (_: unknown, init?: RequestInit) => (calls.push(init!), Response.json(overlay));
    await readDescriptor(MOM, f as typeof fetch);
    await readDescriptor(MOM, f as typeof fetch);
    expect(calls).toHaveLength(1);
    expect(calls[0].credentials).toBe("omit");
    // CSS says max-age=86400: a cached copy would hide a capability turned on today.
    expect(calls[0].cache).toBe("no-cache");
  });
});

describe("sameSite", () => {
  it("joins a backoffice and its pod server, folder and subdomain WebIDs alike", () => {
    expect(sameSite("https://backoffice.mapsofmaking.org", "https://pod.mapsofmaking.org/")).toBe(true);
    expect(sameSite("https://test.nicolasdb.eu", "https://pod.nicolasdb.eu/")).toBe(true);
  });

  it("parts different sites and schemes", () => {
    expect(sameSite("https://backoffice.nicolasdb.eu", "https://pod.mapsofmaking.org/")).toBe(false);
    expect(sameSite("http://pod.mapsofmaking.org", "https://pod.mapsofmaking.org/")).toBe(false);
  });
});

describe("agentsOffer", () => {
  const d = parseDescriptor(MOM, overlay);

  it("offers on the same site", () => {
    expect(agentsOffer(MOM, d, "https://backoffice.mapsofmaking.org").kind).toBe("offered");
  });

  it("points elsewhere across sites, and makes no account call", () => {
    expect(agentsOffer(MOM, d, "https://backoffice.nicolasdb.eu")).toEqual({ kind: "elsewhere", issuer: MOM, account: MOM + ".account/" });
  });

  it("is not offered without a descriptor, or without account in it", () => {
    expect(agentsOffer(MOM, null, "https://backoffice.mapsofmaking.org").kind).toBe("not-offered");
    expect(agentsOffer(MOM, parseDescriptor(MOM, { capabilities: {} }), "https://backoffice.mapsofmaking.org").kind).toBe("not-offered");
  });
});

describe("podAddress", () => {
  it("follows the server's layout", () => {
    expect(podAddress(MOM, "amina", "subdomain")).toBe("https://amina.pod.mapsofmaking.org/");
    expect(podAddress("https://pod.nicolasdb.eu/", "amina", "suffix")).toBe("https://pod.nicolasdb.eu/amina/");
    expect(podAddress("https://pod.nicolasdb.eu/", "amina", null)).toBe("https://pod.nicolasdb.eu/amina/");
  });
});
