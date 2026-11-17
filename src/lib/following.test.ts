import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.mock("./auth", () => ({ authFetch: (...args: unknown[]) => mockFetch(...args) }));

const { parseFollowing, serializeFollowing, markdownSummary, sortFollowing, followedFor, follow, recordVisit, followingUrl } =
  await import("./following");
const { forgetReads } = await import("./read");

const POD = "https://pod.example/amina/";
const DOC = followingUrl(POD);
const X = "https://pod.example/xavier/shared/";
const res = (status: number, body = "", headers: Record<string, string> = {}) =>
  new Response([204, 205, 304].includes(status) ? null : body, { status, headers });

const entry = (address: string, extra: Partial<ReturnType<typeof parseFollowing>[number]> = {}) => ({
  address,
  title: "Shared",
  excerpt: "",
  modified: null,
  lastSeen: null,
  favourite: false,
  unreadableSince: null,
  ...extra,
});

beforeEach(() => {
  mockFetch.mockReset();
  forgetReads();
});

describe("settings/following.ttl", () => {
  it("round-trips entries, with titles that would break hand-written Turtle", () => {
    const entries = [
      entry(X, { title: 'Xavier\'s "shared" folder\n', excerpt: "3 items: a.md, b/", modified: new Date("2026-09-25T10:00:00Z"), favourite: true }),
      entry("https://other.example/feed.md", { unreadableSince: new Date("2026-09-24T08:00:00Z") }),
    ];
    const turtle = serializeFollowing(entries, DOC);
    expect(turtle).toContain("<#f-");
    expect(parseFollowing(turtle, DOC)).toEqual(entries);
  });

  // solid-kit ADR 006 §7: read both namespaces, write sc: only.
  const HS = "https://pod.nicolasdb.eu/hyperscope/vocab#";
  const SC = "https://w3id.org/solid-collective/vocab#";

  it("reads a list still in the old namespace, and writes it back in sc: only", () => {
    const old = `@prefix hs: <${HS}>. @prefix schema: <http://schema.org/>. @prefix dct: <http://purl.org/dc/terms/>.
<#x> a hs:Followed; schema:url <${X}>; dct:title "Xavier"; hs:favourite true;
  hs:lastSeen "2026-09-26T09:12:00.000Z"^^<http://www.w3.org/2001/XMLSchema#dateTime>.`;
    const read = parseFollowing(old, DOC);
    expect(read).toEqual([entry(X, { title: "Xavier", favourite: true, lastSeen: new Date("2026-09-26T09:12:00Z") })]);
    const written = serializeFollowing(read, DOC);
    expect(written).toContain(`@prefix sc: <${SC}>`);
    expect(written).toMatch(/sc:Followed[\s\S]*sc:lastSeen[\s\S]*sc:favourite/);
    expect(written).not.toContain(HS);
    expect(parseFollowing(written, DOC)).toEqual(read);
  });

  it("reads every entry of a list holding both namespaces once", () => {
    const Y = "https://pod.example/yann/notes.md";
    const mixed = `@prefix hs: <${HS}>. @prefix sc: <${SC}>. @prefix schema: <http://schema.org/>. @prefix dct: <http://purl.org/dc/terms/>.
<#x> a hs:Followed, sc:Followed; schema:url <${X}>; dct:title "Xavier"; hs:favourite true; sc:favourite false.
<#x2> a hs:Followed; schema:url <${X}>; dct:title "Xavier, again".
<#y> a sc:Followed; schema:url <${Y}>; dct:title "Yann"; sc:favourite true.`;
    expect(parseFollowing(mixed, DOC)).toEqual([entry(X, { title: "Xavier" }), entry(Y, { title: "Yann", favourite: true })]);
  });

  it("ignores entries without an http(s) address", () => {
    const turtle = `@prefix hs: <https://pod.nicolasdb.eu/hyperscope/vocab#>. @prefix schema: <http://schema.org/>.
<#a> a hs:Followed; schema:url <javascript:alert(1)>.`;
    expect(parseFollowing(turtle, DOC)).toEqual([]);
  });
});

describe("what the list shows", () => {
  it("takes a Markdown file's first heading and first lines", () => {
    expect(markdownSummary("# Guide\n\nHow the **network** works.\n\n## More")).toEqual({ title: "Guide", excerpt: "How the network works." });
    expect(markdownSummary("no heading").title).toBeNull();
  });

  it("sorts by latest change, or favourites first", () => {
    const a = entry("https://a.example/", { modified: new Date("2026-09-20") });
    const b = entry("https://b.example/", { modified: new Date("2026-09-25") });
    const c = entry("https://c.example/", { modified: new Date("2026-09-01"), favourite: true });
    expect(sortFollowing([a, b, c], "latest").map((f) => f.address[8])).toEqual(["b", "a", "c"]);
    expect(sortFollowing([a, b, c], "favourites").map((f) => f.address[8])).toEqual(["c", "b", "a"]);
  });

  it("finds the followed folder an address is inside", () => {
    const entries = [entry(X), entry(X + "deep/")];
    expect(followedFor(X + "notes.md", entries)?.address).toBe(X);
    expect(followedFor(X + "deep/a.md", entries)?.address).toBe(X + "deep/");
    expect(followedFor("https://pod.example/xavier/other.md", entries)).toBeNull();
  });
});

describe("following an address", () => {
  it("keeps nothing it could not read with your WebID", async () => {
    mockFetch.mockResolvedValueOnce(res(404)).mockResolvedValueOnce(res(403));
    await expect(follow(POD, X)).rejects.toMatchObject({ code: "unreadable", status: 403 });
    expect(mockFetch.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
  });

  it("takes an address pasted without https:// as https", async () => {
    mockFetch.mockResolvedValueOnce(res(404)).mockResolvedValueOnce(res(403));
    await expect(follow(POD, X.replace(/^https:\/\//, ""))).rejects.toMatchObject({ code: "unreadable" });
    expect(mockFetch.mock.calls.map(([url]) => String(url))).toContain(X);
  });

  it("refuses what is not an address", async () => {
    await expect(follow(POD, "javascript:alert(1)")).rejects.toMatchObject({ code: "bad-address" });
    await expect(follow(POD, "not a url")).rejects.toMatchObject({ code: "bad-address" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("creates the list on first follow, only if nobody did meanwhile", async () => {
    const listing = `@prefix ldp: <http://www.w3.org/ns/ldp#>. <> ldp:contains <guide.md>.`;
    mockFetch
      .mockResolvedValueOnce(res(404)) // readFollowing: no list yet
      .mockResolvedValueOnce(res(200, listing, { "Content-Type": "text/turtle", ETag: '"l"' })) // the address
      .mockResolvedValueOnce(res(404)) // updateDocument's read
      .mockResolvedValueOnce(res(201)) // create
      .mockResolvedValueOnce(res(412)); // settings/README.md: already there
    const followed = await follow(POD, X, new Date("2026-09-26T10:00:00Z"));
    expect(followed).toMatchObject({ title: "shared", excerpt: "1 item: guide.md" });
    const [url, init] = mockFetch.mock.calls[3];
    expect(url).toBe(DOC);
    expect(init.headers["If-None-Match"]).toBe("*");
    expect(parseFollowing(init.body, DOC)[0].address).toBe(X);
    const [readme, put] = mockFetch.mock.calls[4];
    expect(readme).toBe(POD + "settings/README.md");
    expect(put.headers["If-None-Match"]).toBe("*"); // never over what is there
  });
});

describe("after a visit", () => {
  const summary = { title: "Shared", excerpt: "", modified: null, items: null };

  it("writes nothing when nothing changed and the last visit is recent", async () => {
    const now = new Date("2026-09-26T10:30:00Z");
    await recordVisit(POD, entry(X, { lastSeen: new Date("2026-09-26T10:00:00Z") }), { summary }, now);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("keeps what changed, conditionally", async () => {
    const doc = serializeFollowing([entry(X, { favourite: true })], DOC);
    mockFetch.mockResolvedValueOnce(res(200, doc, { ETag: '"v1"' })).mockResolvedValueOnce(res(205));
    await recordVisit(POD, entry(X), { summary: { ...summary, title: "Renamed" } });
    const [, init] = mockFetch.mock.calls[1];
    expect(init.headers["If-Match"]).toBe('"v1"');
    expect(parseFollowing(init.body, DOC)[0]).toMatchObject({ title: "Renamed", favourite: true });
  });

  it("marks an address that cannot be read any more, once", async () => {
    const doc = serializeFollowing([entry(X)], DOC);
    mockFetch.mockResolvedValueOnce(res(200, doc, { ETag: '"v1"' })).mockResolvedValueOnce(res(205));
    await recordVisit(POD, entry(X), { unreadable: true }, new Date("2026-09-26T10:00:00Z"));
    expect(parseFollowing(mockFetch.mock.calls[1][1].body, DOC)[0].unreadableSince).toEqual(new Date("2026-09-26T10:00:00Z"));
    mockFetch.mockReset();
    await recordVisit(POD, entry(X, { unreadableSince: new Date("2026-09-26T10:00:00Z") }), { unreadable: true });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
