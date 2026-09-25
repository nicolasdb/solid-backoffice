import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Admin side of the handshake. The pure parts are tested as they are; the
 * writes are tested for their ORDER, which is what keeps a failure halfway
 * recoverable. The protocol against a real server is in test/pods/admin.test.ts.
 */
const calls: string[] = [];
let inherited = false;
let failAt: string | null = null;
let rosterText = "";

function step(name: string): void {
  calls.push(name);
  if (failAt && name.startsWith(failAt)) throw new Error(`${name} failed`);
}

vi.mock("./auth", () => ({
  authFetch: async (url: string, init?: RequestInit) => {
    step(`${init?.method ?? "GET"} ${url}`);
    return new Response(null, { status: 205 });
  },
}));
vi.mock("./pod", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./pod")>()),
  exists: async (url: string) => url.endsWith("depots/"),
}));
vi.mock("./acl", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./acl")>()),
  getAccess: async () => ({ agents: [], inherited }),
  setAgentAccess: async (url: string, _o: string, agent: string, modes: string[]) =>
    step(`acl ${url} ${agent} ${modes.join(",") || "none"}`),
}));
vi.mock("./conditional", () => ({
  updateDocument: async (url: string, transform: (t: string) => string) => {
    step(`roster ${url}`);
    rosterText = transform(rosterText);
  },
}));
vi.mock("./collective", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./collective")>()),
  sendToInbox: async (inbox: string, turtle: string) => {
    step(`send ${inbox} ${turtle.match(/as:(Accept|Reject|Remove)/)?.[1]}`);
    return null;
  },
}));

const admin = await import("./admin");
const { buildJoin, buildAnnounce } = await import("./activity");
const { NS } = await import("./vocab");

const POD = "https://pod.example/hs/";
const COLLECTIVE = {
  configUrl: POD + "config.ttl",
  group: POD + "config.ttl#hs",
  name: "HyperScope",
  roster: POD + "membres.ttl",
  inbox: POD + "inbox/",
  agent: POD + "agent#me",
  bundleFolder: "output2/hs/",
};
const OWNER = POD + "profile/card#me";
const INES = "https://pod.example/ines/profile/card#me";
const JOIN_URL = POD + "inbox/j1";
const ines = (over: Partial<{ memberOf: string[]; inbox: string | null; name: string | null }> = {}) => ({
  webId: INES,
  profile: { name: "Inès", memberOf: [COLLECTIVE.group], delegates: [], inbox: "https://pod.example/ines/inbox/", ...over },
  problem: null,
});

beforeEach(() => {
  calls.length = 0;
  inherited = false;
  failAt = null;
  rosterText = "# written by hand\n<config.ttl#hs> <http://xmlns.com/foaf/0.1/member> <https://pod.example/amina#me> .\n";
});

describe("parseActivity", () => {
  it("reads back what the member side sends", () => {
    const join = admin.parseActivity(buildJoin(INES, COLLECTIVE.group, "Inès", new Date("2026-09-25T10:00:00Z")), JOIN_URL);
    expect(join).toMatchObject({ type: "Join", actor: INES, object: COLLECTIVE.group, summary: "Inès asks to join.", problem: null });
    expect(join.published).toBe("2026-09-25T10:00:00.000Z");
    const ann = admin.parseActivity(buildAnnounce(INES, "https://pod.example/ines/output2/hs/", COLLECTIVE.group), JOIN_URL);
    expect(ann).toMatchObject({ type: "Announce", object: "https://pod.example/ines/output2/hs/", target: COLLECTIVE.group });
  });

  it("keeps a message it does not understand, naming its type", () => {
    const like = admin.parseActivity(`<> a <${NS.as}Like>; <${NS.as}actor> <${INES}>.`, JOIN_URL);
    expect(like).toMatchObject({ type: "other", rawType: NS.as + "Like", actor: INES, problem: null });
    expect(admin.parseActivity("not turtle {", JOIN_URL)).toMatchObject({ type: "other" });
    expect(admin.parseActivity("not turtle {", JOIN_URL).problem).toMatch(/Turtle/);
  });

  it("lists an inbox's contents", () => {
    const listing = `<> <${NS.ldp}contains> <j1>, <j2>.`;
    expect(admin.parseInboxListing(listing, COLLECTIVE.inbox)).toEqual([POD + "inbox/j1", POD + "inbox/j2"]);
  });
});

describe("requestFlags", () => {
  const join = { url: JOIN_URL, type: "Join" as const, rawType: null, actor: INES, object: COLLECTIVE.group, target: null, summary: null, published: null, problem: null };

  it("says nothing when both sides agree", () => {
    expect(admin.requestFlags(join, ines(), COLLECTIVE)).toEqual([]);
  });

  it("flags a request the profile does not back, or aimed elsewhere, or unreadable", () => {
    expect(admin.requestFlags(join, ines({ memberOf: [] }), COLLECTIVE)[0]).toMatch(/does not say/);
    expect(admin.requestFlags({ ...join, object: "https://x.example/c#c" }, ines(), COLLECTIVE)[0]).toMatch(/another collective/);
    expect(admin.requestFlags(join, { webId: INES, profile: null, problem: "404" }, COLLECTIVE)[0]).toMatch(/could not be read/);
  });

  it("suggests a nick from the name, else the pod segment", () => {
    expect(admin.suggestNick(ines())).toBe("ines");
    expect(admin.suggestNick(ines({ name: null }))).toBe("ines");
  });
});

describe("roster text", () => {
  const add = (text: string, webId: string, nick: string) => admin.addMemberText(text, COLLECTIVE.roster, COLLECTIVE.group, webId, nick);
  const members = (text: string) => admin.parseRosterEntries(text, COLLECTIVE.roster, COLLECTIVE.group).members;

  it("appends member and nick, keeping comments", () => {
    const next = add(rosterText, INES, "ines");
    expect(next.startsWith(rosterText)).toBe(true);
    expect(members(next)).toContainEqual({ webId: INES, nick: "ines" });
  });

  it("is idempotent, and keeps an existing nick for a returning member", () => {
    const once = add(rosterText, INES, "ines");
    expect(add(once, INES, "other")).toBe(once);
    const removed = admin.removeMemberText(once, COLLECTIVE.roster, COLLECTIVE.group, INES);
    const back = add(removed, INES, "other");
    expect(members(back)).toContainEqual({ webId: INES, nick: "ines" });
  });

  it("refuses a taken or unusable nick", () => {
    const once = add(rosterText, INES, "ines");
    expect(() => add(once, "https://pod.example/other#me", "ines")).toThrow(/already used/);
    expect(() => add(rosterText, INES, "Inès!")).toThrow(/cannot be used/);
  });

  it("removes only the member line, keeping the nick and the comments", () => {
    const once = add(rosterText, INES, "ines");
    const next = admin.removeMemberText(once, COLLECTIVE.roster, COLLECTIVE.group, INES);
    expect(members(next).map((m) => m.webId)).toEqual(["https://pod.example/amina#me"]);
    expect(next).toContain("# written by hand");
    expect(next).toContain('"ines"');
  });

  it("refuses to remove a member written in a form it cannot edit", () => {
    const packed = `<config.ttl#hs> <http://xmlns.com/foaf/0.1/member> <${INES}>, <https://pod.example/amina#me> .\n`;
    expect(() => admin.removeMemberText(packed, COLLECTIVE.roster, COLLECTIVE.group, INES)).toThrow(/by hand/);
  });
});

describe("order of writes", () => {
  const join = { url: JOIN_URL, type: "Join" as const, rawType: null, actor: INES, object: COLLECTIVE.group, target: null, summary: null, published: null, problem: null };

  it("accepts: roster, then grants, then as:Accept, then deletes the request", async () => {
    await admin.accept(COLLECTIVE, OWNER, join, ines(), "ines");
    expect(calls).toEqual([
      `roster ${COLLECTIVE.roster}`,
      `acl ${COLLECTIVE.roster} ${INES} read`,
      `acl ${POD}depots/ ${INES} read`,
      "send https://pod.example/ines/inbox/ Accept",
      `DELETE ${JOIN_URL}`,
    ]);
  });

  it("keeps the request when a grant fails, so accepting again finishes it", async () => {
    failAt = "acl";
    await expect(admin.accept(COLLECTIVE, OWNER, join, ines(), "ines")).rejects.toThrow();
    expect(calls.some((c) => c.startsWith("DELETE"))).toBe(false);
    failAt = null;
    calls.length = 0;
    await admin.accept(COLLECTIVE, OWNER, join, ines(), "ines");
    expect(admin.parseRosterEntries(rosterText, COLLECTIVE.roster, COLLECTIVE.group).members.filter((m) => m.webId === INES)).toHaveLength(1);
    expect(calls.at(-1)).toBe(`DELETE ${JOIN_URL}`);
  });

  it("writes nothing when an access rule is inherited", async () => {
    inherited = true;
    await expect(admin.accept(COLLECTIVE, OWNER, join, ines(), "ines")).rejects.toThrow(/access rules of its own/);
    expect(calls).toEqual([]);
  });

  it("accepts someone without an inbox, and says the answer was not sent", async () => {
    const out = await admin.accept(COLLECTIVE, OWNER, join, ines({ inbox: null }), "ines");
    expect(out.answered).toBe(false);
    expect(calls.some((c) => c.startsWith("send"))).toBe(false);
  });

  it("refuses: as:Reject, then deletes the request; the roster is untouched", async () => {
    await admin.refuse(COLLECTIVE, OWNER, join, ines());
    expect(calls).toEqual(["send https://pod.example/ines/inbox/ Reject", `DELETE ${JOIN_URL}`]);
  });

  it("removes: grants first, then the roster, then as:Remove", async () => {
    rosterText = admin.addMemberText(rosterText, COLLECTIVE.roster, COLLECTIVE.group, INES, "ines");
    await admin.removeMember(COLLECTIVE, OWNER, ines());
    expect(calls).toEqual([
      `acl ${COLLECTIVE.roster} ${INES} none`,
      `acl ${POD}depots/ ${INES} none`,
      `roster ${COLLECTIVE.roster}`,
      "send https://pod.example/ines/inbox/ Remove",
    ]);
  });
});
