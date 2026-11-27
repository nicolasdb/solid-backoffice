import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The extended profile (solid-kit ADR 002, amendment of 2026-11-26;
 * solid-backoffice#26). A tier-1 WebID is a static file on its owner's domain
 * that no app can write: the steps write to `profile/about.ttl` in the pod
 * instead, and readers that decide something follow the profile's links only
 * into the pod the profile itself names.
 *
 * The server is faked at ./auth, by method and URL. solid-client's own read
 * and PATCH are replaced, so the test sees which document a step writes; the
 * `.acl` goes through acl.ts unchanged.
 */
type Reply = { status: number; body?: string; headers?: Record<string, string> };
let routes: Record<string, Reply | (() => Reply)> = {};
let calls: string[] = [];
let saved: { url: string; dataset: unknown }[] = [];
let unreachable = false;

vi.mock("./auth", () => ({
  authFetch: async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url}`);
    if (unreachable) throw new TypeError("Failed to fetch");
    const route = routes[`${method} ${url}`] ?? (method === "GET" ? routes[url] : undefined);
    const reply = typeof route === "function" ? route() : route ?? { status: 404 };
    if (method === "PUT") puts.set(url, String(init?.body ?? ""));
    return new Response(method === "HEAD" || reply.status === 204 ? null : reply.body ?? "", {
      status: reply.status,
      headers: { "content-type": "text/turtle", ...reply.headers },
    });
  },
}));
const puts = new Map<string, string>();

vi.mock("@inrupt/solid-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@inrupt/solid-client")>();
  return {
    ...actual,
    getSolidDataset: async (url: string) => {
      calls.push(`read ${url}`);
      return actual.createSolidDataset();
    },
    saveSolidDatasetAt: async (url: string, dataset: unknown) => {
      calls.push(`save ${url}`);
      saved.push({ url, dataset });
      return dataset;
    },
  };
});

const collective = await import("./collective");
const { forgetReads } = await import("./read");
const { forgetAclLocations } = await import("./acl");
const admin = await import("./admin");
const solid = await import("@inrupt/solid-client");
const { answersWritable, updateOwnProfile, profileEdits, readProfile, readOwnProfile, readName, declaresMembership, linkLines, NS } = collective;

/** OpenFab's shape: a WebID on its own domain, the pod on the provider. */
const WEBID = "https://id.openfab.example/profile/card#me";
const CARD = "https://id.openfab.example/profile/card";
const POD = "https://openfab.pod.example/";
const ABOUT = POD + "profile/about.ttl";
const GROUP = "https://pod.example/maakbib/config.ttl#maakbib";

const card = (extra = "") => `
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix pim: <http://www.w3.org/ns/pim/space#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<#me> a foaf:Organization ;
  foaf:name "OpenFab" ;
  pim:storage <${POD}> ${extra}.
`;
const linked = `; rdfs:seeAlso <${ABOUT}> ; foaf:isPrimaryTopicOf <${ABOUT}> `;
const STATIC = {}; // a static file: no WAC-Allow, no Allow
const CSS_OWNER = { "wac-allow": 'user="read write append control",public="read"', allow: "OPTIONS, HEAD, GET, PATCH, PUT" };

beforeEach(() => {
  routes = {};
  calls = [];
  saved = [];
  puts.clear();
  unreachable = false;
  forgetReads();
  forgetAclLocations();
});

describe("answersWritable", () => {
  it("reads WAC-Allow's user modes first, then Allow; a static file has neither", () => {
    expect(answersWritable(new Headers(CSS_OWNER))).toBe(true);
    expect(answersWritable(new Headers({ "wac-allow": 'user="read append"' }))).toBe(true);
    // CSS lists PATCH in Allow whatever you may do: WAC-Allow decides.
    expect(answersWritable(new Headers({ "wac-allow": 'user="read",public="read"', allow: "GET, PATCH, PUT" }))).toBe(false);
    expect(answersWritable(new Headers({ allow: "GET, HEAD, PATCH" }))).toBe(true);
    expect(answersWritable(new Headers({ allow: "GET, HEAD" }))).toBe(false);
    expect(answersWritable(new Headers())).toBe(false);
  });
});

describe("writing your profile", () => {
  it("writes the profile itself when it answers as writable (tier 0: nothing changes)", async () => {
    routes[CARD] = { status: 200, body: card(), headers: CSS_OWNER };
    const result = await updateOwnProfile(WEBID, profileEdits.setName("OpenFab asbl"));
    expect(result).toEqual({ document: CARD, linkToAdd: null });
    expect(calls).toEqual([`GET ${CARD}`, `read ${CARD}`, `save ${CARD}`]);
    const thing = solid.getThing(saved[0].dataset as never, WEBID)!;
    expect(solid.getStringNoLocale(thing, NS.foaf + "name")).toBe("OpenFab asbl");
  });

  it("writes the linked about.ttl in your storage when the profile is a static file", async () => {
    routes[CARD] = { status: 200, body: card(linked), headers: STATIC };
    routes[`HEAD ${ABOUT}`] = { status: 200 };
    const result = await updateOwnProfile(WEBID, profileEdits.setInbox(POD + "inbox/"));
    expect(result).toEqual({ document: ABOUT, linkToAdd: null });
    expect(calls).toEqual([`GET ${CARD}`, `HEAD ${ABOUT}`, `read ${ABOUT}`, `save ${ABOUT}`]);
    expect(calls.filter((c) => c.startsWith("PUT") || c.startsWith("PATCH"))).toEqual([]);
    const thing = solid.getThing(saved[0].dataset as never, WEBID)!;
    expect(solid.getUrl(thing, NS.ldp + "inbox")).toBe(POD + "inbox/");
  });

  it("with no extended profile, creates about.ttl and its rules, writes there, and gives the two lines to add", async () => {
    let created = false;
    routes[CARD] = { status: 200, body: card(), headers: STATIC };
    routes[`HEAD ${ABOUT}`] = () =>
      created ? { status: 200, headers: { link: `<${ABOUT}.acl>; rel="acl"` } } : { status: 404 };
    routes[`PUT ${ABOUT}`] = () => ((created = true), { status: 201 });
    routes[`PUT ${ABOUT}.acl`] = { status: 201 };

    const result = await updateOwnProfile(WEBID, profileEdits.setInbox(POD + "inbox/"));

    // The document first (its .acl is found from it), then its rules, then the edit.
    expect(calls).toEqual([
      `GET ${CARD}`,
      `HEAD ${ABOUT}`,
      `PUT ${ABOUT}`,
      `HEAD ${ABOUT}`,
      `GET ${ABOUT}.acl`,
      `PUT ${ABOUT}.acl`,
      `read ${ABOUT}`,
      `save ${ABOUT}`,
    ]);
    expect(puts.get(ABOUT)).toContain(`<${WEBID}>`);
    const acl = puts.get(ABOUT + ".acl")!;
    expect(acl).toContain(`acl:agent <${WEBID}>`);
    expect(acl).toContain("acl:mode acl:Read, acl:Write, acl:Control.");
    expect(acl).toMatch(/acl:agentClass foaf:Agent;\s+acl:accessTo <\.\/about\.ttl>;\s+acl:mode acl:Read\./);
    expect(result.document).toBe(ABOUT);
    expect(result.linkToAdd).toBe(linkLines(WEBID, ABOUT));
    expect(result.linkToAdd!.split("\n")).toEqual([
      `<${WEBID}> <http://www.w3.org/2000/01/rdf-schema#seeAlso> <${ABOUT}> .`,
      `<${WEBID}> <http://xmlns.com/foaf/0.1/isPrimaryTopicOf> <${ABOUT}> .`,
    ]);
  });

  it("refuses to remove a line the static card holds itself, instead of saying it is done", async () => {
    const agent = POD + "profile/claude#me";
    routes[CARD] = { status: 200, body: card(`${linked}; <${NS.acl}delegates> <${agent}> `), headers: STATIC };
    routes[`HEAD ${ABOUT}`] = { status: 200 };
    await expect(updateOwnProfile(WEBID, profileEdits.removeDelegate(agent))).rejects.toThrow(/where the file is hosted/);
    await expect(updateOwnProfile(WEBID, profileEdits.leave(GROUP))).resolves.toEqual({ document: ABOUT, linkToAdd: null });
    expect(calls.filter((c) => c.startsWith("save"))).toEqual([`save ${ABOUT}`]);
  });

  it("refuses, naming the missing line, when a static profile declares no storage", async () => {
    routes[CARD] = { status: 200, body: `<#me> <http://xmlns.com/foaf/0.1/name> "OpenFab".`, headers: STATIC };
    await expect(updateOwnProfile(WEBID, profileEdits.setName("x"))).rejects.toThrow(/pim:storage/);
    expect(calls).toEqual([`GET ${CARD}`]);
  });

  it("never shows the browser's Failed to fetch", async () => {
    unreachable = true;
    const err = await updateOwnProfile(WEBID, profileEdits.setName("x")).catch((e: Error) => e);
    expect((err as Error).message).toContain(CARD);
    expect((err as Error).message).not.toMatch(/Failed to fetch|NetworkError/);
  });
});

describe("reading a profile and its extended profile", () => {
  it("a membership found only in about.ttl counts", async () => {
    routes[CARD] = { status: 200, body: card(linked), headers: { etag: '"c"' } };
    routes[ABOUT] = { status: 200, body: `<${WEBID}> <${NS.org}memberOf> <${GROUP}> .`, headers: { etag: '"a"' } };
    const person = await admin.readPerson(WEBID);
    expect(person.profile!.name).toBe("OpenFab");
    expect(declaresMembership(person.profile!, GROUP)).toBe(true);
    expect(admin.memberState(person, GROUP)).toBe("member");
    const message = { url: "x", type: "Join", rawType: null, actor: WEBID, object: GROUP, target: null, summary: null, published: null, problem: null };
    const flags = admin.requestFlags(message as never, person, { group: GROUP, name: "Maakbib" } as never);
    expect(flags).toEqual([]);
  });

  it("ignores a linked document outside the profile's storage, without reading it", async () => {
    const elsewhere = "https://elsewhere.example/claims.ttl";
    routes[CARD] = { status: 200, body: card(`; rdfs:seeAlso <${elsewhere}> `) };
    routes[elsewhere] = { status: 200, body: `<${WEBID}> <${NS.org}memberOf> <${GROUP}> .` };
    const profile = await readProfile(WEBID);
    expect(profile.memberOf).toEqual([]);
    expect(calls).toEqual([`GET ${CARD}`]);
  });

  it("skips a linked document that fails to load, and follows one level only", async () => {
    const deeper = POD + "profile/deeper.ttl";
    routes[CARD] = { status: 200, body: card(`; rdfs:seeAlso <${POD}profile/broken.ttl>, <${ABOUT}> `) };
    routes[POD + "profile/broken.ttl"] = { status: 500 };
    routes[ABOUT] = { status: 200, body: `<${WEBID}> <http://www.w3.org/2000/01/rdf-schema#seeAlso> <${deeper}> ; <${NS.acl}delegates> <${POD}profile/claude#me> .` };
    routes[deeper] = { status: 200, body: `<${WEBID}> <${NS.org}memberOf> <${GROUP}> .` };
    const profile = await readProfile(WEBID);
    expect(profile.delegates).toEqual([POD + "profile/claude#me"]);
    expect(profile.memberOf).toEqual([]);
    expect(calls).not.toContain(`GET ${deeper}`);
    expect(await readName(WEBID)).toBe("OpenFab");
  });

  it("shows the name the step saved in about.ttl, not the one the static card was written with", async () => {
    routes[CARD] = { status: 200, body: card(linked), headers: STATIC };
    routes[ABOUT] = { status: 200, body: `<${WEBID}> <${NS.foaf}name> "OpenFab asbl" .` };
    expect((await readOwnProfile(WEBID)).name).toBe("OpenFab asbl");
    expect((await admin.readPerson(WEBID)).profile!.name).toBe("OpenFab asbl");
  });

  it("a profile with no links costs one request, as before", async () => {
    routes[CARD] = { status: 200, body: card(), headers: CSS_OWNER };
    await readOwnProfile(WEBID);
    expect(calls).toEqual([`GET ${CARD}`]);
  });

  it("shows you what the steps wrote to an about.ttl your profile does not link yet, and says so", async () => {
    routes[CARD] = { status: 200, body: card(), headers: STATIC };
    routes[ABOUT] = { status: 200, body: `<${WEBID}> <${NS.ldp}inbox> <${POD}inbox/> .` };
    const profile = await readOwnProfile(WEBID);
    expect(profile.inbox).toBe(POD + "inbox/");
    expect(profile.unlinked).toBe(ABOUT);
    // Others do not read it: it is not linked.
    forgetReads();
    expect((await admin.readPerson(WEBID)).profile!.inbox).toBeNull();
  });
});
