import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.mock("./auth", () => ({ authFetch: (...args: unknown[]) => mockFetch(...args) }));

const { parseListing, parentOf, nameOf, kindOf, effectiveAccess, readFile, PREVIEW_LIMIT, nameProblem, childUrl, typeFor, createFolder, createFile, uploadFile, saveFile } =
  await import("./files");
const { readAccess, forgetAclLocations } = await import("./acl");
const { forgetReads } = await import("./read");

const POD = "https://pod.example/amina/";
const OWNER = POD + "profile/card#me";
const AGENT = "https://pod.example/hs/agent#me";

/** CSS 7's listing of a folder, as the pod tests saw it. */
const LISTING = `@prefix dc: <http://purl.org/dc/terms/>.
@prefix ldp: <http://www.w3.org/ns/ldp#>.
@prefix posix: <http://www.w3.org/ns/posix/stat#>.
@prefix xsd: <http://www.w3.org/2001/XMLSchema#>.
<> a ldp:Container, ldp:BasicContainer, ldp:Resource; dc:modified "2026-09-26T11:35:40.473Z"^^xsd:dateTime.
<readme.md> a ldp:Resource; dc:modified "2026-09-26T11:35:40.115Z"^^xsd:dateTime;
    <http://www.w3.org/ns/ma-ont#format> "text/markdown"; posix:size "33".
<Notes%2010.txt> a ldp:Resource; <http://www.w3.org/ns/ma-ont#format> "text/plain".
<notes%202.txt> a ldp:Resource.
<drafts/> a ldp:Container, ldp:BasicContainer, ldp:Resource; dc:modified "2026-09-26T11:35:40.525Z"^^xsd:dateTime.
<> ldp:contains <readme.md>, <Notes%2010.txt>, <notes%202.txt>, <drafts/>.`;

const res = (status: number, body = "", headers: Record<string, string> = {}) =>
  new Response(status === 304 || status === 204 || status === 205 ? null : body, { status, headers });
const aclHead = (acl: string) => res(200, "", { Link: `<${acl}>; rel="acl"` });
const ownAcl = (target: string, extra = "") =>
  `@prefix acl: <http://www.w3.org/ns/auth/acl#>.
<#owner> a acl:Authorization; acl:agent <${OWNER}>; acl:accessTo <${target}>; acl:default <${target}>; acl:mode acl:Read, acl:Write, acl:Control.
${extra}`;

beforeEach(() => {
  mockFetch.mockReset();
  forgetReads();
  forgetAclLocations();
});

describe("a folder's listing", () => {
  it("lists folders first, then files in the order people sort, with what CSS says of each", () => {
    const items = parseListing(LISTING, POD + "projects/");
    expect(items.map((i) => i.name)).toEqual(["drafts/", "notes 2.txt", "Notes 10.txt", "readme.md"]);
    const readme = items.find((i) => i.name === "readme.md")!;
    expect(readme).toMatchObject({ isFolder: false, size: 33, type: "text/markdown" });
    expect(readme.modified?.toISOString()).toBe("2026-09-26T11:35:40.115Z");
    expect(items[0]).toMatchObject({ isFolder: true, type: null, size: null });
    expect(items.find((i) => i.name === "notes 2.txt")).toMatchObject({ modified: null, type: null });
  });

  it("names and climbs addresses", () => {
    expect(nameOf(POD + "a%20b/")).toBe("a b/");
    expect(parentOf(POD + "projects/readme.md")).toBe(POD + "projects/");
    expect(parentOf(POD + "projects/")).toBe(POD);
    expect(parentOf("https://pod.example/")).toBeNull();
  });

  it("tells what can be shown from the media type, never SVG inline", () => {
    expect(kindOf("text/markdown; charset=utf-8")).toBe("markdown");
    expect(kindOf("application/octet-stream", "x/README.md")).toBe("markdown");
    expect(kindOf("application/ld+json")).toBe("json");
    expect(kindOf("text/turtle")).toBe("text");
    expect(kindOf("image/png")).toBe("image");
    expect(kindOf("image/svg+xml")).toBe("other");
    expect(kindOf("application/pdf")).toBe("other");
  });
});

describe("which rules apply", () => {
  it("asks where an .acl lives once, and reads the .acl again every time", async () => {
    const url = POD + "projects/";
    mockFetch
      .mockResolvedValueOnce(aclHead(url + ".acl"))
      .mockResolvedValueOnce(res(200, ownAcl("./"), { ETag: '"a1"' }))
      .mockResolvedValueOnce(res(304));
    expect((await readAccess(url, OWNER)).inherited).toBe(false);
    expect((await readAccess(url, OWNER)).inherited).toBe(false);
    const methods = mockFetch.mock.calls.map(([, init]) => (init as RequestInit | undefined)?.method ?? "GET");
    expect(methods).toEqual(["HEAD", "GET", "GET"]);
  });

  it("walks up to the nearest folder with rules, once for all the items of a listing", async () => {
    const root = POD;
    const routes: Record<string, () => Response> = {
      [`HEAD ${POD}projects/a.md`]: () => aclHead(POD + "projects/a.md.acl"),
      [`HEAD ${POD}projects/b.md`]: () => aclHead(POD + "projects/b.md.acl"),
      [`HEAD ${POD}projects/`]: () => aclHead(POD + "projects/.acl"),
      [`HEAD ${POD}`]: () => aclHead(POD + ".acl"),
      [`GET ${POD}projects/a.md.acl`]: () => res(404),
      [`GET ${POD}projects/b.md.acl`]: () => res(404),
      [`GET ${POD}projects/.acl`]: () => res(404),
      [`GET ${POD}.acl`]: () =>
        res(200, ownAcl("./", `<#g> a acl:Authorization; acl:agent <${AGENT}>; acl:accessTo <./>; acl:default <./>; acl:mode acl:Read.`), { ETag: '"r"' }),
    };
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => routes[`${init?.method ?? "GET"} ${url}`]());
    const memo = new Map();
    const [a, b] = await Promise.all([
      effectiveAccess(POD + "projects/a.md", OWNER, root, memo),
      effectiveAccess(POD + "projects/b.md", OWNER, root, memo),
    ]);
    expect(a?.from).toBe(POD);
    expect(b?.access.agents).toEqual([{ webId: AGENT, modes: ["read"] }]);
    const rootReads = mockFetch.mock.calls.filter(([url]) => url === POD + ".acl");
    expect(rootReads).toHaveLength(1);
  });

  it("never looks above your pod", async () => {
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) =>
      init?.method === "HEAD" ? aclHead(url + ".acl") : res(404)
    );
    expect(await effectiveAccess(POD + "x/", OWNER, POD)).toBeNull();
    expect(mockFetch.mock.calls.some(([url]) => !String(url).startsWith(POD))).toBe(false);
  });
});

describe("a file's contents", () => {
  it("reads text kinds as text, fresh from the pod", async () => {
    mockFetch.mockResolvedValueOnce(res(200, "# Hi", { "Content-Type": "text/markdown", ETag: '"f1"' }));
    const file = await readFile(POD + "readme.md");
    expect(file).toMatchObject({ kind: "markdown", text: "# Hi", etag: '"f1"', blob: null });
    expect(mockFetch.mock.calls[0][1].cache).toBe("no-store");
  });

  it("offers a text file too large to show as a download", async () => {
    mockFetch.mockResolvedValueOnce(
      res(200, "x", { "Content-Type": "text/plain", "Content-Length": String(PREVIEW_LIMIT + 1) })
    );
    const file = await readFile(POD + "big.txt");
    expect(file.text).toBeNull();
    expect(file.blob).not.toBeNull();
  });

  it("says why a file cannot be read", async () => {
    mockFetch.mockResolvedValueOnce(res(403));
    await expect(readFile(POD + "x.md")).rejects.toMatchObject({ status: 403 });
  });
});

describe("writing files (C3)", () => {
  const sentTo = (i: number) => mockFetch.mock.calls[i] as [string, RequestInit];
  const headers = (i: number) => sentTo(i)[1].headers as Record<string, string>;

  it("refuses names that are not one path segment or belong to the server", () => {
    expect(nameProblem("  ")).toMatch(/name/);
    expect(nameProblem("a/b")).toMatch(/slash/);
    expect(nameProblem("..")).toBeTruthy();
    expect(nameProblem("notes.md.acl")).toMatch(/server/);
    expect(nameProblem("x.meta")).toMatch(/server/);
    expect(nameProblem("Notes été.md")).toBeNull();
    expect(childUrl(POD, "Notes été.md", false)).toBe(POD + "Notes%20%C3%A9t%C3%A9.md");
    expect(childUrl(POD, "drafts", true)).toBe(POD + "drafts/");
  });

  it("types a new file from its name", () => {
    expect(typeFor("a.md")).toBe("text/markdown");
    expect(typeFor("a.JSON")).toBe("application/json");
    expect(typeFor("README")).toBe("text/plain");
    expect(typeFor("a.bin")).toBe("application/octet-stream");
  });

  it("creates folders and files only where nothing is yet", async () => {
    mockFetch.mockResolvedValueOnce(res(201)).mockResolvedValueOnce(res(201)).mockResolvedValueOnce(res(412));
    expect(await createFolder(POD, "drafts")).toBe(POD + "drafts/");
    expect(await createFile(POD, "idea.md", "# Idea")).toBe(POD + "idea.md");
    expect(headers(0)["If-None-Match"]).toBe("*");
    expect(headers(1)).toMatchObject({ "If-None-Match": "*", "Content-Type": "text/markdown" });
    await expect(createFile(POD, "idea.md")).rejects.toMatchObject({ code: "exists" });
    await expect(createFolder(POD, "a/b")).rejects.toMatchObject({ code: "bad-name" });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("uploads a file under its own name and type", async () => {
    mockFetch.mockResolvedValueOnce(res(201));
    const file = new File(["png"], "logo.png", { type: "image/png" });
    expect(await uploadFile(POD, file)).toBe(POD + "logo.png");
    expect(headers(0)).toMatchObject({ "If-None-Match": "*", "Content-Type": "image/png" });
    expect(sentTo(0)[1].body).toBe(file);
  });

  it("saves over the version opened, and says so when someone changed it", async () => {
    mockFetch.mockResolvedValueOnce(res(205)).mockResolvedValueOnce(res(412));
    await saveFile(POD + "a.md", "new", '"v1"', "text/markdown");
    expect(headers(0)["If-Match"]).toBe('"v1"');
    await expect(saveFile(POD + "a.md", "newer", '"v1"', "text/markdown")).rejects.toMatchObject({ code: "conflict" });
    await expect(saveFile(POD + "a.md", "x", null, "text/markdown")).rejects.toMatchObject({ code: "conflict" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
