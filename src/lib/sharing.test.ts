import { describe, it, expect } from "vitest";
import { shareable, sharingRules, withGrants, withoutAgent } from "./sharing";
import { parseChoices, serializeChoices } from "./shared-folders";

const POD = "https://pod.example/neil/";
const AGENT = "https://pod.example/hs/agents/agent#me";
const MINE = "https://pod.example/neil/profile/claude#me";

describe("which folders may be shared", () => {
  it("a folder of your own pod, never the root, profile/, settings/ or inbox/", () => {
    expect(shareable(POD + "notes/", POD)).toBe(true);
    expect(shareable(POD + "notes/hyperscope/", POD)).toBe(true);
    for (const path of ["", "profile/", "settings/", "settings/x/", "inbox/"]) expect(shareable(POD + path, POD)).toBe(false);
    expect(shareable(POD + "notes.md", POD)).toBe(false); // a file
    expect(shareable("https://pod.example/other/notes/", POD)).toBe(false); // someone else's pod
  });
});

describe("rules are merged, never set whole", () => {
  const rules = {
    agents: [{ webId: "https://pod.example/ines/profile/card#me", modes: ["read" as const] }],
    public: [],
    authenticated: ["append" as const],
  };

  it("adds the agent's Read and your agents' Edit, keeping everything else", () => {
    const next = withGrants(rules, sharingRules(AGENT, [MINE]));
    expect(next.agents).toEqual([
      ...rules.agents,
      { webId: MINE, modes: ["read", "append", "write"] },
      { webId: AGENT, modes: ["read"] },
    ]);
    expect(next.authenticated).toEqual(["append"]);
  });

  it("joins modes, never takes one away", () => {
    const next = withGrants({ ...rules, agents: [{ webId: AGENT, modes: ["read", "write"] }] }, [{ webId: AGENT, modes: ["read"] }]);
    expect(next.agents).toEqual([{ webId: AGENT, modes: ["read", "write"] }]);
  });

  it("a collective's agent declared as yours still only reads", () => {
    expect(sharingRules(AGENT, [AGENT, MINE]).filter((g) => g.webId === AGENT)).toEqual([{ webId: AGENT, modes: ["read"] }]);
  });

  it("stopping takes out that agent only", () => {
    const shared = withGrants(rules, sharingRules(AGENT, []));
    expect(withoutAgent(shared, AGENT)).toEqual(rules);
  });
});

describe("settings/collectives.ttl", () => {
  const DOC = POD + "settings/collectives.ttl";
  it("round-trips one folder per collective, and keeps only folders of your own pod", () => {
    const choices = new Map([
      ["https://pod.example/hs/config.ttl#hs", POD + "notes/"],
      ["https://pod.example/mom/config.ttl#mom", POD + "work/maps/"],
    ]);
    expect(parseChoices(serializeChoices(choices, DOC), DOC, POD)).toEqual(choices);
    const elsewhere = new Map([["https://pod.example/hs/config.ttl#hs", "https://pod.example/other/notes/"]]);
    expect(parseChoices(serializeChoices(elsewhere, DOC), DOC, POD).size).toBe(0);
  });

  // solid-kit ADR 006 §7: read both namespaces, write sc: only.
  const HS = "https://pod.nicolasdb.eu/hyperscope/vocab#";
  const SC = "https://w3id.org/solid-collective/vocab#";

  it("reads a file still in the old namespace, and writes it back in sc: only", () => {
    const old = `@prefix hs: <${HS}>.
<#a> a hs:SharedFolder; hs:collective <https://pod.example/hs/config.ttl#hs>; hs:folder <${POD}notes/>.`;
    const read = parseChoices(old, DOC, POD);
    expect(read).toEqual(new Map([["https://pod.example/hs/config.ttl#hs", POD + "notes/"]]));
    const written = serializeChoices(read, DOC);
    expect(written).toContain(`@prefix sc: <${SC}>`);
    expect(written).toContain("sc:SharedFolder");
    expect(written).not.toContain(HS);
  });

  it("reads every entry of a file holding both namespaces once, the sc: one winning", () => {
    const mixed = `@prefix hs: <${HS}>. @prefix sc: <${SC}>.
<#a> a hs:SharedFolder; hs:collective <https://pod.example/hs/config.ttl#hs>; hs:folder <${POD}old/>.
<#b> a sc:SharedFolder; sc:collective <https://pod.example/hs/config.ttl#hs>; sc:folder <${POD}new/>.
<#c> a hs:SharedFolder; hs:collective <https://pod.example/mom/config.ttl#mom>; hs:folder <${POD}maps/>.
<#d> a sc:SharedFolder, hs:SharedFolder; sc:collective <https://pod.example/of/config.ttl#of>; sc:folder <${POD}of/>.`;
    expect(parseChoices(mixed, DOC, POD)).toEqual(
      new Map([
        ["https://pod.example/hs/config.ttl#hs", POD + "new/"],
        ["https://pod.example/mom/config.ttl#mom", POD + "maps/"],
        ["https://pod.example/of/config.ttl#of", POD + "of/"],
      ])
    );
  });
});
