import { describe, it, expect, vi } from "vitest";
import { Parser } from "n3";

vi.mock("./auth", () => ({ authFetch: vi.fn() }));

const {
  parseCollectiveConfig,
  parseProfile,
  parseRoster,
  membershipState,
  profileDocOf,
  buildJoin,
  buildAnnounce,
  NS,
} = await import("./collective");

const CONFIG_URL = "https://pod.example/hyperscope/config.ttl";
const CONFIG = `
@prefix hs:   <${NS.hs}> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix ldp:  <http://www.w3.org/ns/ldp#> .
<#hyperscope> a hs:Collective ;
  foaf:name "HyperScope" ;
  hs:roster <membres.ttl> ;
  ldp:inbox <inbox/> ;
  hs:agent <agents/agent#me> ;
  hs:bundleFolder "output2/hyperscope/" .
`;

describe("parseCollectiveConfig", () => {
  it("resolves every IRI against the config's own location; the collective IS the group", () => {
    expect(parseCollectiveConfig(CONFIG, CONFIG_URL)).toEqual({
      configUrl: CONFIG_URL,
      group: "https://pod.example/hyperscope/config.ttl#hyperscope",
      name: "HyperScope",
      roster: "https://pod.example/hyperscope/membres.ttl",
      inbox: "https://pod.example/hyperscope/inbox/",
      agent: "https://pod.example/hyperscope/agents/agent#me",
      bundleFolder: "output2/hyperscope/",
    });
  });

  it("picks the collective a memberOf link names, when a document declares several", () => {
    const two = CONFIG + `<#other> a hs:Collective ; foaf:name "Other" ; hs:roster <o.ttl> ;
      ldp:inbox <o/> ; hs:agent <o#me> ; hs:bundleFolder "o/" .`;
    expect(parseCollectiveConfig(two, CONFIG_URL, CONFIG_URL + "#other").name).toBe("Other");
    expect(() => parseCollectiveConfig(two, CONFIG_URL)).toThrow(/several/);
  });

  it("refuses a config with no agent rather than guessing one", () => {
    const noAgent = CONFIG.replace("hs:agent <agents/agent#me> ;", "");
    expect(() => parseCollectiveConfig(noAgent, CONFIG_URL)).toThrow(/hs:agent/);
  });

  it("accepts a folder path inside the member's pod, and nothing that climbs out of it", () => {
    const at = (folder: string) => CONFIG.replace('"output2/hyperscope/"', `"${folder}"`);
    expect(parseCollectiveConfig(at("output2/hyperscope/"), CONFIG_URL).bundleFolder).toBe("output2/hyperscope/");
    for (const bad of ["../private/", "output2/../settings/", "/output2/", "output2/hyperscope", "./x/", "a//b/"]) {
      expect(() => parseCollectiveConfig(at(bad), CONFIG_URL), bad).toThrow(/bundleFolder/);
    }
  });

  it("refuses a document that declares no collective", () => {
    expect(() => parseCollectiveConfig("<#x> <#y> <#z> .", CONFIG_URL)).toThrow(/no hs:Collective/);
  });
});

describe("parseProfile and parseRoster", () => {
  const WEBID = "https://pod.example/alice/profile/card#me";
  const GROUP = "https://pod.example/hyperscope/membres.ttl#hyperscope";

  it("reads the member-side declarations", () => {
    const turtle = `
      @prefix foaf: <http://xmlns.com/foaf/0.1/> . @prefix org: <http://www.w3.org/ns/org#> .
      @prefix acl: <http://www.w3.org/ns/auth/acl#> . @prefix ldp: <http://www.w3.org/ns/ldp#> .
      <#me> foaf:name "Alice" ; org:memberOf <${GROUP}> ;
        acl:delegates <https://pod.example/alice_agent/profile/card#me> ; ldp:inbox </alice/inbox/> .`;
    expect(parseProfile(turtle, profileDocOf(WEBID), WEBID)).toEqual({
      name: "Alice",
      memberOf: [GROUP],
      delegates: ["https://pod.example/alice_agent/profile/card#me"],
      inbox: "https://pod.example/alice/inbox/",
    });
  });

  it("reads the roster, whose subject is the collective's IRI in config.ttl", () => {
    const turtle = `
      @prefix foaf: <http://xmlns.com/foaf/0.1/> .
      <config.ttl#hyperscope> foaf:member <${WEBID}> .`;
    expect(
      parseRoster(turtle, "https://pod.example/hyperscope/membres.ttl", "https://pod.example/hyperscope/config.ttl#hyperscope")
    ).toEqual([WEBID]);
  });

  it("finds the profile document by dropping the fragment, not by guessing a layout", () => {
    expect(profileDocOf(WEBID)).toBe("https://pod.example/alice/profile/card");
  });
});

describe("membershipState — the ADR 006 table", () => {
  it.each([
    [true, true, "member"],
    [true, false, "pending"],
    [false, true, "left"],
    [false, false, "none"],
  ] as const)("declares=%s listed=%s → %s", (declares, listed, state) => {
    expect(membershipState(declares, listed)).toBe(state);
  });

  it("an unreadable roster is not a refusal: a pending applicant cannot read it", () => {
    expect(membershipState(true, null)).toBe("pending");
    expect(membershipState(false, null)).toBe("unknown");
  });
});

describe("activities", () => {
  const ACTOR = "https://pod.example/alice/profile/card#me";
  const GROUP = "https://pod.example/hyperscope/membres.ttl#hyperscope";
  const AT = new Date("2026-09-24T12:00:00Z");
  const base = "https://pod.example/hyperscope/inbox/abc";

  function triples(turtle: string) {
    return new Parser({ baseIRI: base })
      .parse(turtle)
      .map((q) => [q.predicate.value.split(/[#/]/).pop(), q.object.value]);
  }

  it("builds a Join about the created resource itself", () => {
    const t = triples(buildJoin(ACTOR, GROUP, "Alice", AT));
    expect(t).toContainEqual(["type", NS.as + "Join"]);
    expect(t).toContainEqual(["actor", ACTOR]);
    expect(t).toContainEqual(["object", GROUP]);
    expect(t).toContainEqual(["published", "2026-09-24T12:00:00.000Z"]);
  });

  it("escapes a name with quotes instead of breaking the Turtle", () => {
    const t = triples(buildJoin(ACTOR, GROUP, 'Al "the" ice', AT));
    expect(t).toContainEqual(["summary", 'Al "the" ice asks to join.']);
  });

  it("builds an Announce naming the bundle and the collective", () => {
    const bundle = "https://pod.example/alice/output2/hyperscope/";
    const t = triples(buildAnnounce(ACTOR, bundle, GROUP, AT));
    expect(t).toContainEqual(["type", NS.as + "Announce"]);
    expect(t).toContainEqual(["object", bundle]);
    expect(t).toContainEqual(["target", GROUP]);
  });
});

describe("docs/examples — the files to upload", () => {
  it("membres.ttl lists members under the group IRI that config.ttl declares", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const turtle = readFileSync(resolve(process.cwd(), "docs/examples/hyperscope-membres.ttl"), "utf8");
    expect(
      parseRoster(turtle, "https://pod.nicolasdb.eu/hyperscope/membres.ttl", "https://pod.nicolasdb.eu/hyperscope/config.ttl#hyperscope")
    ).toEqual(["https://pod.nicolasdb.eu/hyperscope_ndb/profile/card#me"]);
  });

  it("is the file to upload, so it must parse to the live HyperScope values", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const turtle = readFileSync(resolve(process.cwd(), "docs/examples/hyperscope-config.ttl"), "utf8");
    const url = "https://pod.nicolasdb.eu/hyperscope/config.ttl";
    expect(parseCollectiveConfig(turtle, url)).toEqual({
      configUrl: url,
      group: "https://pod.nicolasdb.eu/hyperscope/config.ttl#hyperscope",
      name: "HyperScope",
      roster: "https://pod.nicolasdb.eu/hyperscope/membres.ttl",
      inbox: "https://pod.nicolasdb.eu/hyperscope/inbox/",
      agent: "https://pod.nicolasdb.eu/hyperscope/agents/agent#me",
      bundleFolder: "output2/hyperscope/",
    });
  });
});
