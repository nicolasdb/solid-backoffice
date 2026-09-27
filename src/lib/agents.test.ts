import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The orders of writes for an agent are the design (top of agents.ts):
 * create is document → public Read → anonymous check → link, undone on
 * failure; delete is connector → rules → profile → link → document. Pinned
 * here against a pod and an account service kept in memory.
 */
const ISSUER = "https://pod.example/";
const POD = ISSUER + "amina/";
const OWNER = POD + "profile/card#me";

let store: Map<string, string>;
let log: string[];
let failLink: "always" | "token" | null;

async function pod(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = String(input);
  const method = init.method ?? "GET";
  const headers = new Headers(init.headers);
  const doc = store.get(url);
  const link = { Link: `<${url}.acl>; rel="acl"`, ETag: `"${(doc ?? "").length}"` };
  if (method === "PUT") {
    log.push(`PUT ${url.slice(POD.length)}${String(init.body).includes("RegistrationToken") ? " (with proof)" : ""}`);
    if (headers.get("If-None-Match") === "*" && doc !== undefined) return new Response(null, { status: 412 });
    store.set(url, String(init.body));
    return new Response(null, { status: 201 });
  }
  if (method === "DELETE") {
    log.push(`DELETE ${url.slice(POD.length)}`);
    store.delete(url);
    store.delete(url + ".acl");
    return new Response(null, { status: 205 });
  }
  if (doc === undefined) return new Response(null, { status: 404, headers: link });
  return new Response(method === "HEAD" ? null : doc, { status: 200, headers: { ...link, "Content-Type": "text/turtle" } });
}

async function provider(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = String(input);
  if (!url.startsWith(ISSUER + ".account/") && !url.startsWith(ISSUER + "onboard/")) {
    // The anonymous check reads the pod with no session.
    return pod(input, init);
  }
  const method = init.method ?? "GET";
  if (url === ISSUER + ".account/") {
    return Response.json({ controls: { account: { webId: ISSUER + ".account/webid/", pod: ISSUER + ".account/pod/" } } });
  }
  if (url === ISSUER + ".account/webid/" && method === "POST") {
    log.push("LINK");
    const webId = JSON.parse(String(init.body)).webId as string;
    if (failLink === "always") return Response.json({ message: "refused" }, { status: 400 });
    if (!store.get(webId.split("#")[0])?.includes("RegistrationToken")) {
      return Response.json(
        { message: `Verify ownership by adding <${webId}> <http://www.w3.org/ns/solid/terms#oidcIssuerRegistrationToken> "0f3c5d2a-1111-4222-8333-944455556666".` },
        { status: 400 }
      );
    }
    return Response.json({ resource: ISSUER + ".account/webid/1/" });
  }
  if (url.endsWith("onboard/grants")) {
    return Response.json({ grants: [{ grantId: "g1", label: "Claude", webId: POD + "profile/claude#me", revoked: false }] });
  }
  if (url.endsWith("onboard/revoke")) {
    log.push("REVOKE connector");
    return Response.json({ revoked: true });
  }
  if (method === "DELETE") {
    log.push("UNLINK");
    return new Response(null, { status: 200 });
  }
  return new Response(null, { status: 404 });
}

vi.mock("./auth", () => ({ authFetch: (input: RequestInfo | URL, init?: RequestInit) => pod(input, init) }));
vi.mock("./collective", () => ({
  profileEdits: { removeDelegate: (agent: string) => agent },
  updateOwnProfile: async (_webId: string, agent: unknown) => void log.push(`PROFILE without ${String(agent).slice(POD.length)}`),
}));

const agents = await import("./agents");
const { forgetAclLocations } = await import("./acl");
const { forgetReads } = await import("./read");
agents.net.fetch = provider as typeof fetch;

beforeEach(() => {
  store = new Map([[POD + "profile/card", "<#me> a <http://xmlns.com/foaf/0.1/Person>."]]);
  log = [];
  failLink = null;
  forgetAclLocations();
  forgetReads();
});

const session = () => agents.cookieSession(ISSUER);

describe("creating an agent", () => {
  it("writes its document, its public rules, checks, then links with the proof and removes it", async () => {
    const agent = await agents.createAgent(session(), POD, OWNER, "Claude");
    expect(agent.webId).toBe(POD + "profile/claude#me");
    expect(log).toEqual([
      "PUT profile/claude",
      "PUT profile/claude.acl",
      "LINK",
      "PUT profile/claude (with proof)",
      "LINK",
      "PUT profile/claude",
    ]);
    expect(store.get(POD + "profile/claude.acl")).toContain("acl:agentClass foaf:Agent");
    expect(store.get(POD + "profile/claude")).not.toContain("RegistrationToken");
  });

  it("undoes the document when a step fails, and says which", async () => {
    failLink = "always";
    await expect(agents.createAgent(session(), POD, OWNER, "Claude")).rejects.toMatchObject({ step: "link", cleanedUp: true });
    expect(log.at(-1)).toBe("DELETE profile/claude");
    expect(store.has(POD + "profile/claude")).toBe(false);
  });

  it("never takes your own card, and never an address already used", async () => {
    expect(agents.agentSlug("Card")).toBe("card-agent");
    store.set(POD + "profile/claude", "retired");
    expect(await agents.freeAgentDoc(POD, "Claude")).toBe(POD + "profile/claude-2");
    expect(agents.agentNameProblem(" ")).toMatch(/name/);
    expect(agents.agentNameProblem("x".repeat(65))).toMatch(/64/);
  });
});

describe("deleting an agent", () => {
  it("revokes, removes its rules, its place in your profile, its link, then retires its document", async () => {
    const webId = POD + "profile/claude#me";
    store.set(POD + "profile/claude", agents.agentDocument(ISSUER, "Claude"));
    store.set(
      POD + "notes/.acl",
      `@prefix acl: <http://www.w3.org/ns/auth/acl#>.
<#owner> a acl:Authorization; acl:agent <${OWNER}>; acl:accessTo <./>; acl:default <./>; acl:mode acl:Read, acl:Write, acl:Control.
<#c> a acl:Authorization; acl:agent <${webId}>; acl:accessTo <./>; acl:default <./>; acl:mode acl:Read.`
    );
    store.set(POD + "notes/", "");
    await agents.deleteAgent(
      session(),
      OWNER,
      POD,
      { webId, name: "Claude", link: { webId, resource: ISSUER + ".account/webid/1/" }, reach: [{ url: POD + "notes/", modes: ["read"] }], delegate: true },
      "2026-09-27"
    );
    expect(log).toEqual(["REVOKE connector", "PUT notes/.acl", "PROFILE without profile/claude#me", "UNLINK", "PUT profile/claude"]);
    expect(store.get(POD + "notes/.acl")).not.toContain("claude");
    expect(store.get(POD + "profile/claude")).not.toContain("oidcIssuer");
  });

  it("reads the token CSS asks for, and nothing else", () => {
    expect(agents.ownershipToken('<x> <http://www.w3.org/ns/solid/terms#oidcIssuerRegistrationToken> "0f3c5d2a-1111-4222-8333-944455556666".')).toBe(
      "0f3c5d2a-1111-4222-8333-944455556666"
    );
    expect(agents.ownershipToken('oidcIssuerRegistrationToken "a"; <#evil>')).toBeNull();
    expect(agents.agentName('<#me> foaf:name "Cl\\"aude".', "x")).toBe('Cl"aude');
  });
});
