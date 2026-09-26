import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Places against a pod held in memory: the real files.ts, acl.ts and read.ts
 * run, only authFetch answers from `pod` below. What is pinned: the list
 * never waits for rules, memory draws first, nothing is redrawn under someone
 * typing, and what a file holds is shown safely.
 */
const POD = "https://pod.example/amina/";
const WEBID = POD + "profile/card#me";
const AGENT = "https://pod.example/hs/agent#me";

type Doc = { status?: number; body?: string; type?: string; etag?: string };
let pod: Record<string, Doc> = {};
/** URLs whose answers wait until `release()`. */
let held: ((url: string) => boolean) | null = null;
let waiting: (() => void)[] = [];
const release = () => {
  held = null;
  waiting.splice(0).forEach((go) => go());
};
const requests: string[] = [];

async function answer(url: string, init: RequestInit = {}): Promise<Response> {
  const method = init.method ?? "GET";
  requests.push(`${method} ${url}`);
  if (held?.(url)) await new Promise<void>((go) => waiting.push(go));
  const doc = pod[url];
  const headers: Record<string, string> = { Link: `<${url}.acl>; rel="acl"` };
  if (!doc || doc.status === 404) return new Response(null, { status: 404, headers });
  if (doc.status && doc.status >= 400) return new Response(null, { status: doc.status, headers });
  if (doc.etag) headers.ETag = doc.etag;
  headers["Content-Type"] = doc.type ?? "text/turtle";
  const match = (init.headers as Record<string, string> | undefined)?.["If-None-Match"];
  if (match && match === doc.etag) return new Response(null, { status: 304, headers });
  return new Response(method === "HEAD" ? null : (doc.body ?? ""), { status: 200, headers });
}
vi.mock("./lib/auth", () => ({ authFetch: (url: string, init?: RequestInit) => answer(url, init) }));

const { mountPlaces, showPlaces, forgetPlaces, whoCanRead, when } = await import("./places");
const { forgetReads } = await import("./lib/read");

const acl = (target: string, folder: boolean, extra = "") => `@prefix acl: <http://www.w3.org/ns/auth/acl#>.
<#owner> a acl:Authorization; acl:agent <${WEBID}>; acl:accessTo <${target}>; ${folder ? `acl:default <${target}>;` : ""} acl:mode acl:Read, acl:Write, acl:Control.
${extra}`;
const listing = (names: string[]) =>
  `@prefix ldp: <http://www.w3.org/ns/ldp#>. @prefix dc: <http://purl.org/dc/terms/>.
${names.map((n) => `<${n}> a ldp:Resource; dc:modified "2026-09-25T10:00:00Z".`).join("\n")}
<> ldp:contains ${names.map((n) => `<${n}>`).join(", ")}.`;

function standardPod(): Record<string, Doc> {
  return {
    [POD]: { body: listing(["projects/", "README"]), etag: '"root1"' },
    [POD + ".acl"]: { body: acl("./", true), etag: '"racl"' },
    [POD + "projects/"]: { body: listing(["drafts/", "readme.md", "data.json", "logo.png", "public.md", "report.pdf"]), etag: '"p1"' },
    [POD + "projects/drafts/"]: { body: listing([]), etag: '"d1"' },
    [POD + "projects/drafts/.acl"]: {
      body: acl("./", true, `<#g> a acl:Authorization; acl:agent <${AGENT}>; acl:accessTo <./>; acl:default <./>; acl:mode acl:Read.`),
      etag: '"dacl"',
    },
    [POD + "projects/readme.md"]: { body: "# Projects\n\n<script>alert(1)</script>[x](javascript:alert(2))", type: "text/markdown", etag: '"m"' },
    [POD + "projects/data.json"]: { body: '{"a":1}', type: "application/json", etag: '"j"' },
    [POD + "projects/logo.png"]: { body: "png", type: "image/png", etag: '"i"' },
    [POD + "projects/report.pdf"]: { body: "%PDF", type: "application/pdf", etag: '"pdf"' },
    [POD + "projects/public.md"]: { body: "# Public", type: "text/markdown", etag: '"pub"' },
    [POD + "projects/public.md.acl"]: {
      body: acl("public.md", false, `<#p> a acl:Authorization; acl:agentClass <http://xmlns.com/foaf/0.1/Agent>; acl:accessTo <public.md>; acl:mode acl:Read.`),
      etag: '"pacl"',
    },
  };
}

const settle = () => new Promise((r) => setTimeout(r, 0));
let app: HTMLElement;

async function open(path: string): Promise<void> {
  window.history.replaceState(null, "", `/#/p/${path}`);
  await showPlaces({ name: "places", path });
}

function row(name: string): HTMLElement {
  return [...app.querySelectorAll<HTMLElement>("tr[data-url]")].find((r) => r.querySelector(".item-name")!.textContent!.trim() === name)!;
}

beforeEach(() => {
  pod = standardPod();
  held = null;
  waiting = [];
  requests.length = 0;
  forgetPlaces();
  forgetReads();
  app = document.createElement("div");
  document.body.replaceChildren(app);
  URL.createObjectURL = vi.fn(() => "blob:fake");
  URL.revokeObjectURL = vi.fn();
});

async function mount(path = ""): Promise<void> {
  window.history.replaceState(null, "", `/#/p/${path}`);
  mountPlaces(app, { name: "places", path }, { webId: WEBID, podUrl: POD, names: new Map([[AGENT, "HyperScope's agent"]]) });
  await settle();
}

describe("C1 — a folder of your pod", () => {
  it("shows the list before any rule has arrived, then fills each row in", async () => {
    held = (url) => url.endsWith(".acl") || !url.endsWith("/");
    await mount("projects/");
    await settle();
    expect(row("readme.md")).toBeTruthy();
    expect(row("readme.md").querySelector("[data-rules]")!.textContent).toContain("Reading");

    release();
    await showPlaces({ name: "places", path: "projects/" });
    expect(row("public.md").querySelector("[data-rules]")!.textContent).toBe("Anyone");
    expect(row("public.md").querySelector("[data-pill]")!.textContent).toBe("Own");
    expect(row("drafts/").querySelector("[data-rules]")!.textContent).toBe("You · HyperScope's agent");
    expect(row("readme.md").querySelector("[data-rules]")!.textContent).toBe("Only you");
    expect(row("readme.md").querySelector("[data-pill]")!.textContent).toBe("From parent");
  });

  it("walks up to the pod's rules once for the whole folder", async () => {
    await mount("projects/");
    await showPlaces({ name: "places", path: "projects/" });
    expect(requests.filter((r) => r === `GET ${POD}.acl`).length).toBeLessThanOrEqual(2);
  });

  it("draws a folder seen before at once, asks where each .acl lives only once, and revalidates", async () => {
    await mount("projects/");
    await showPlaces({ name: "places", path: "projects/" });
    await open("");
    requests.length = 0;
    held = () => true;
    const back = open("projects/");
    await settle();
    expect(row("readme.md")).toBeTruthy(); // from memory, while the pod is asked
    release();
    await back;
    expect(requests.some((r) => r.startsWith("HEAD"))).toBe(false);
    expect(requests).toContain(`GET ${POD}projects/`);
  });

  it("never redraws under someone using a field", async () => {
    await mount("projects/");
    await showPlaces({ name: "places", path: "projects/" });
    pod[POD + "projects/"] = { body: listing(["newer.md"]), etag: '"p3"' };
    held = (url) => url === POD + "projects/";
    const read = showPlaces({ name: "places", path: "projects/" }, false);
    await settle();
    app.querySelector<HTMLSelectElement>("#place-picker")!.focus(); // drawn from memory; now in use
    release();
    await read;
    expect(row("newer.md")).toBeUndefined();
    expect(row("readme.md")).toBeTruthy();

    (document.activeElement as HTMLElement).blur();
    await showPlaces({ name: "places", path: "projects/" }, false);
    expect(row("newer.md")).toBeTruthy();
  });

  it("says a folder cannot be read, with a way to try again", async () => {
    pod[POD + "projects/"] = { status: 403 };
    await mount("projects/");
    await showPlaces({ name: "places", path: "projects/" });
    expect(app.querySelector('[role="alert"]')!.textContent).toMatch(/403/);
    expect(app.querySelector("#places-retry")).toBeTruthy();
  });

  it("shows an item in the panel, and the pod root never offers a way up", async () => {
    await mount("");
    await showPlaces({ name: "places", path: "" });
    expect(app.querySelector(".places-panel h2")!.textContent).toBe("My pod");
    app.querySelector<HTMLButtonElement>(`[data-select="${POD}projects/"]`)!.click();
    expect(app.querySelector(".places-panel h2")!.textContent).toBe("projects/");
    expect(app.querySelector(".places-panel")!.classList.contains("is-open")).toBe(true);
    expect(app.querySelector(".crumbs")!.textContent!.trim()).toBe("My pod");
  });
});

describe("C1 — a file opens in Preview", () => {
  it("renders Markdown without what could run", async () => {
    await mount("projects/readme.md");
    await showPlaces({ name: "places", path: "projects/readme.md" });
    const preview = app.querySelector(".preview")!;
    expect(preview.querySelector("h1")!.textContent).toBe("Projects");
    expect(preview.innerHTML).not.toMatch(/<script|href="javascript:/);
  });

  it("pretty-prints JSON, shows images, and offers the rest as a download", async () => {
    await mount("projects/data.json");
    await showPlaces({ name: "places", path: "projects/data.json" });
    expect(app.querySelector("pre.preview")!.textContent).toBe('{\n  "a": 1\n}');

    await open("projects/logo.png");
    expect(app.querySelector<HTMLImageElement>(".preview img")!.src).toBe("blob:fake");

    await open("projects/report.pdf");
    expect(app.querySelector(".preview")!.textContent).toMatch(/No preview for application\/pdf/);
    app.querySelector<HTMLButtonElement>("#download")!.click();
    await settle();
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it("says who can read the file and closes back to its folder", async () => {
    await mount("projects/public.md");
    await showPlaces({ name: "places", path: "projects/public.md" });
    expect(app.querySelector(".file-status")!.textContent).toMatch(/who can read it: Anyone/);
    expect(app.querySelector<HTMLAnchorElement>(".places-head a.button-link")!.getAttribute("href")).toBe("#/p/projects/");
  });
});

describe("C1 — words", () => {
  const names = new Map([[AGENT, "HyperScope's agent"]]);
  const none = { agents: [], public: [], authenticated: [] };
  it("says who can read in a few words", () => {
    expect(whoCanRead(none, names)).toBe("Only you");
    expect(whoCanRead({ ...none, public: ["read"] }, names)).toBe("Anyone");
    expect(whoCanRead({ ...none, authenticated: ["append"] }, names)).toBe("You · anyone signed in can leave a message");
    expect(whoCanRead({ ...none, agents: [{ webId: AGENT, modes: ["read"] }, { webId: "https://x.example/me", modes: ["read"] }] }, names)).toBe("You · 2 people");
  });

  it("dates like a person would", () => {
    const now = new Date("2026-09-26T12:00:00");
    expect(when(new Date("2026-09-26T09:05:00"), now)).toBe("Today, 09:05");
    expect(when(new Date("2026-09-25T18:40:00"), now)).toBe("Yesterday, 18:40");
    expect(when(new Date("2026-09-01T10:00:00"), now)).toBe("1 Sept 2026");
  });
});
