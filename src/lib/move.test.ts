import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The order of a move is the design: copy top down (own rules before
 * content), check, then delete bottom up. Pinned here against a small server
 * that keeps documents in memory and lists folders from what it holds.
 */
const POD = "https://pod.example/amina/";
const OWNER = POD + "profile/card#me";
const AGENT = "https://pod.example/hs/agent#me";

type Doc = { body: string; type: string; etag: string };
let store: Map<string, Doc>;
let log: string[];
let version: number;
/** Fails the nth PUT (1-based), to stop a move halfway. */
let failPut: number | null;
let failDelete: string | null;
let puts: number;

const isAcl = (url: string) => url.endsWith(".acl");

function listing(folder: string): string {
  const children = [...store.keys()].filter((u) => u !== folder && u.startsWith(folder) && !isAcl(u) && !u.slice(folder.length).replace(/\/$/, "").includes("/"));
  return `@prefix ldp: <http://www.w3.org/ns/ldp#>.\n<> ldp:contains ${children.map((c) => `<${c}>`).join(", ") || "<#none>"}.`;
}

async function server(url: string, init: RequestInit = {}): Promise<Response> {
  const method = init.method ?? "GET";
  const headers = (init.headers ?? {}) as Record<string, string>;
  const doc = store.get(url);
  const link = { Link: `<${url}.acl>; rel="acl"` };
  if (method === "PUT") {
    puts++;
    log.push(`PUT ${url.slice(POD.length)}${init.body === "" ? " (empty)" : ""}`);
    if (failPut === puts) return new Response(null, { status: 500 });
    if (headers["If-None-Match"] === "*" && doc) return new Response(null, { status: 412 });
    if (headers["If-Match"] && doc?.etag !== headers["If-Match"]) return new Response(null, { status: 412 });
    const raw = init.body as { text?: () => Promise<string> } | string | undefined;
    const body = typeof raw === "object" && raw?.text ? await raw.text() : String(raw ?? "");
    store.set(url, { body, type: headers["Content-Type"], etag: `"e${++version}"` });
    return new Response(null, { status: 201 });
  }
  if (method === "DELETE") {
    log.push(`DELETE ${url.slice(POD.length)}`);
    if (failDelete === url) return new Response(null, { status: 500 });
    if (!doc) return new Response(null, { status: 404 });
    store.delete(url);
    if (!isAcl(url)) store.delete(url + ".acl");
    return new Response(null, { status: 205 });
  }
  if (!doc) return new Response(null, { status: 404, headers: link });
  const body = url.endsWith("/") ? listing(url) : doc.body;
  return new Response(method === "HEAD" ? null : body, { status: 200, headers: { ...link, ETag: doc.etag, "Content-Type": url.endsWith("/") ? "text/turtle" : doc.type } });
}
vi.mock("./auth", () => ({ authFetch: (url: string, init?: RequestInit) => server(url, init) }));

const { move, deleteTree, countInside, protectedReason } = await import("./move");
const { forgetAclLocations } = await import("./acl");
const { forgetReads } = await import("./read");

const aclFor = (target: string, folder: boolean, extra = "") => `@prefix acl: <http://www.w3.org/ns/auth/acl#>.
<#owner> a acl:Authorization; acl:agent <${OWNER}>; acl:accessTo <${target}>; ${folder ? `acl:default <${target}>;` : ""} acl:mode acl:Read, acl:Write, acl:Control.
${extra}`;

beforeEach(() => {
  version = 0;
  puts = 0;
  failPut = null;
  failDelete = null;
  log = [];
  forgetAclLocations();
  forgetReads();
  const put = (path: string, body = "", type = "text/plain") => store.set(POD + path, { body, type, etag: `"s${++version}"` });
  store = new Map();
  put("", "", "text/turtle");
  put(".acl", aclFor("./", true), "text/turtle");
  put("projects/", "", "text/turtle");
  put("projects/drafts/", "", "text/turtle");
  put("projects/drafts/.acl", aclFor("./", true, `<#g> a acl:Authorization; acl:agent <${AGENT}>; acl:accessTo <./>; acl:default <./>; acl:mode acl:Read.`), "text/turtle");
  put("projects/drafts/idea.md", "# Idea", "text/markdown");
  put("projects/drafts/secret.txt", "secret");
  put("projects/drafts/secret.txt.acl", aclFor("secret.txt", false), "text/turtle");
  put("archive/", "", "text/turtle");
});

const paths = () => [...store.keys()].map((u) => u.slice(POD.length)).sort();

describe("moving a folder with what is inside and its rules (C4)", () => {
  it("copies top down, own rules before content, checks, then deletes bottom up", async () => {
    await move(POD + "projects/drafts/", POD + "archive/drafts/", OWNER, POD);
    const writes = log.filter((l) => l.startsWith("PUT") || l.startsWith("DELETE"));
    expect(writes).toEqual([
      "PUT archive/drafts/ (empty)",
      "PUT archive/drafts/.acl",
      "PUT archive/drafts/idea.md",
      "PUT archive/drafts/secret.txt (empty)",
      "PUT archive/drafts/secret.txt.acl",
      "PUT archive/drafts/secret.txt",
      "DELETE projects/drafts/secret.txt",
      "DELETE projects/drafts/secret.txt.acl",
      "DELETE projects/drafts/idea.md",
      "DELETE projects/drafts/",
      "DELETE projects/drafts/.acl",
    ]);
    expect(paths()).toEqual([
      "", ".acl", "archive/", "archive/drafts/", "archive/drafts/.acl", "archive/drafts/idea.md",
      "archive/drafts/secret.txt", "archive/drafts/secret.txt.acl", "projects/",
    ]);
    // The rules name the new place, and keep the agent's grant.
    const acl = store.get(POD + "archive/drafts/.acl")!.body;
    expect(acl).toContain("acl:accessTo <./>");
    expect(acl).toContain(AGENT);
    expect(store.get(POD + "archive/drafts/secret.txt.acl")!.body).toContain("acl:accessTo <./secret.txt>");
    expect(store.get(POD + "archive/drafts/secret.txt")!.body).toBe("secret");
  });

  it("leaves the source whole and removes the partial copy when a write fails halfway", async () => {
    failPut = 4; // secret.txt, created empty
    const before = paths();
    await expect(move(POD + "projects/drafts/", POD + "archive/drafts/", OWNER, POD)).rejects.toMatchObject({ code: "copy-failed" });
    expect(paths()).toEqual(before);
    expect(log.some((l) => l.startsWith("DELETE projects/"))).toBe(false);
  });

  it("says what is left at the old place when deleting it fails, and loses nothing", async () => {
    failDelete = POD + "projects/drafts/idea.md";
    const err = await move(POD + "projects/drafts/", POD + "archive/drafts/", OWNER, POD).catch((e) => e);
    expect(err.code).toBe("delete-failed");
    expect(err.left).toEqual([POD + "projects/drafts/idea.md", POD + "projects/drafts/"]);
    expect(store.has(POD + "archive/drafts/idea.md")).toBe(true);
    expect(store.has(POD + "projects/drafts/idea.md")).toBe(true);
  });

  it("refuses before any write: a name already there, inside itself, protected, unknown rules", async () => {
    const refused = async (from: string, to: string) => (await move(POD + from, POD + to, OWNER, POD).catch((e) => e)).code;
    expect(await refused("projects/drafts/", "archive/")).toBe("exists");
    expect(await refused("projects/", "projects/drafts/projects/")).toBe("refused");
    expect(await refused("profile/", "archive/profile/")).toBe("refused");
    expect(await refused("projects/drafts/idea.md", "archive/idea/")).toBe("refused");
    store.get(POD + "projects/drafts/.acl")!.body += `\n<#x> a acl:Authorization; acl:agentGroup <https://x.example/g#t>; acl:accessTo <./>; acl:mode acl:Read.`;
    expect(await refused("projects/drafts/", "archive/drafts/")).toBe("refused");
    expect(log.filter((l) => l.startsWith("PUT") || l.startsWith("DELETE"))).toEqual([]);
  });

  it("renames a file to a name that starts with its own (README to README.md)", async () => {
    await move(POD + "projects/drafts/idea.md", POD + "projects/drafts/idea.md.txt", OWNER, POD);
    expect(store.has(POD + "projects/drafts/idea.md.txt")).toBe(true);
    expect(store.has(POD + "projects/drafts/idea.md")).toBe(false);
  });

  it("renames a file within its folder, rules included", async () => {
    await move(POD + "projects/drafts/secret.txt", POD + "projects/drafts/private.txt", OWNER, POD);
    expect(store.get(POD + "projects/drafts/private.txt.acl")!.body).toContain("<./private.txt>");
    expect(store.has(POD + "projects/drafts/secret.txt")).toBe(false);
  });
});

describe("deleting (C4)", () => {
  it("counts what is inside, then deletes bottom up", async () => {
    expect(await countInside(POD + "projects/", OWNER)).toBe(3);
    await deleteTree(POD + "projects/", POD);
    expect(paths()).toEqual(["", ".acl", "archive/"]);
    const deletes = log.filter((l) => l.startsWith("DELETE"));
    expect(deletes.at(-1)).toBe("DELETE projects/");
  });

  it("never deletes the pod, its profile, inbox or settings", async () => {
    for (const path of ["", "profile/", "profile/card", "inbox/", "settings/", "config.ttl"]) {
      expect(protectedReason(POD + path, POD)).not.toBeNull();
    }
    expect(protectedReason(POD + "projects/", POD)).toBeNull();
    await expect(deleteTree(POD, POD)).rejects.toMatchObject({ code: "refused" });
  });
});
