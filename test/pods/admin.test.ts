import { describe, it, expect, vi, inject } from "vitest";
import { current, actAs } from "./as";
import type { InboxMessage } from "../../src/lib/admin";

vi.mock("../../src/lib/auth", () => ({
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => current.fetch(input, init),
}));

const { loadCollective, isListed, membershipState, sendToInbox, buildJoin, profileEdits, updateOwnProfile } =
  await import("../../src/lib/collective");
const admin = await import("../../src/lib/admin");

const cast = inject("cast");
const hsConfig = cast.hyperscope.pod + "config.ttl";
const owner = cast.hyperscope.webId;

const status = async (url: string) => (await current.fetch(url)).status;

async function inboxOf(role: "ines"): Promise<InboxMessage[]> {
  const listing = await (await current.fetch(cast[role].pod + "inbox/", { headers: { Accept: "text/turtle" } })).text();
  const urls = admin.parseInboxListing(listing, cast[role].pod + "inbox/");
  return Promise.all(urls.map(async (u) => admin.parseActivity(await (await current.fetch(u)).text(), u)));
}

/**
 * J3 and J5 (admin side), in order: the collective reads Inès's request,
 * accepts it, sees her from both sides, then removes her. The file runs as one
 * story because each step starts from the pods the previous one left.
 */
describe("the collective answers requests (J3)", () => {
  it("reads the inbox as the collective: Inès's request, and a message it does not understand", async () => {
    await actAs("outsider");
    const hs = await loadCollective(hsConfig);
    await current.fetch(hs.inbox, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "hello?" });

    await actAs("hyperscope");
    const messages = await admin.readInbox(hs);
    const join = messages.find((m) => m.type === "Join" && m.actor === cast.ines.webId);
    expect(join).toMatchObject({ object: hs.group, summary: "Inès asks to join." });
    expect(messages.some((m) => m.type === "other" && m.problem)).toBe(true);
  });

  it("checks each requester's own profile, and flags a request it does not back", async () => {
    await actAs("outsider");
    const hs = await loadCollective(hsConfig);
    await sendToInbox(hs.inbox, buildJoin(cast.outsider.webId, hs.group, null));

    await actAs("hyperscope");
    const messages = await admin.readInbox(hs);
    const joinOf = (webId: string) => messages.find((m) => m.type === "Join" && m.actor === webId)!;
    const ines = await admin.readPerson(cast.ines.webId);
    expect(ines.profile).toMatchObject({ name: "Inès", inbox: cast.ines.pod + "inbox/" });
    expect(admin.requestFlags(joinOf(cast.ines.webId), ines, hs)).toEqual([]);
    const outsider = await admin.readPerson(cast.outsider.webId);
    expect(admin.requestFlags(joinOf(cast.outsider.webId), outsider, hs)[0]).toMatch(/does not say/);
  });

  it("accepts Inès: listed, able to read the roster, answered, request gone", async () => {
    await actAs("hyperscope");
    const hs = await loadCollective(hsConfig);
    const join = (await admin.readInbox(hs)).find((m) => m.type === "Join" && m.actor === cast.ines.webId)!;
    const person = await admin.readPerson(cast.ines.webId);
    const out = await admin.accept(hs, owner, join, person, admin.suggestNick(person));
    expect(out.answered).toBe(true);
    expect(await status(join.url)).toBe(404);
    const { members } = await admin.readRoster(hs);
    expect(members).toContainEqual({ webId: cast.ines.webId, nick: "ines" });

    await actAs("ines");
    expect(await isListed(hs, cast.ines.webId)).toBe(true);
    expect(membershipState(true, true)).toBe("member");
    const answer = (await inboxOf("ines")).find((m) => m.rawType?.endsWith("Accept"));
    expect(answer).toMatchObject({ actor: owner, object: join.url, target: hs.group });
  });

  it("refuses the outsider: request gone, roster untouched, no inbox to answer", async () => {
    await actAs("hyperscope");
    const hs = await loadCollective(hsConfig);
    const join = (await admin.readInbox(hs)).find((m) => m.type === "Join" && m.actor === cast.outsider.webId)!;
    const out = await admin.refuse(hs, owner, join, await admin.readPerson(cast.outsider.webId));
    expect(out.answered).toBe(false);
    expect(await status(join.url)).toBe(404);
    expect((await admin.readRoster(hs)).members.map((m) => m.webId)).not.toContain(cast.outsider.webId);
  });
});

describe("members, from both sides", () => {
  it("shows Amina and Inès as members who can read the roster, and Amina's announcement", async () => {
    await actAs("amina");
    const hs = await loadCollective(hsConfig);
    const { buildAnnounce } = await import("../../src/lib/activity");
    await sendToInbox(hs.inbox, buildAnnounce(cast.amina.webId, cast.amina.pod + "output2/hyperscope/", hs.group));

    await actAs("hyperscope");
    const members = await admin.readMembers(hs, owner, await admin.readInbox(hs));
    const amina = members.find((m) => m.webId === cast.amina.webId)!;
    expect(amina).toMatchObject({ state: "member", nick: "amina", canReadRoster: true });
    expect(amina.announced).toContain(cast.amina.pod + "output2/hyperscope/");
    expect(members.find((m) => m.webId === cast.ines.webId)).toMatchObject({ state: "member", canReadRoster: true });
  });

  it("shows a member whose profile no longer declares it as left", async () => {
    await actAs("ines");
    const hs = await loadCollective(hsConfig);
    await updateOwnProfile(cast.ines.webId, profileEdits.leave(hs.group));
    await actAs("hyperscope");
    const members = await admin.readMembers(hs, owner, []);
    expect(members.find((m) => m.webId === cast.ines.webId)?.state).toBe("left");

    await actAs("ines");
    await updateOwnProfile(cast.ines.webId, profileEdits.join(hs.group));
  });
});

describe("removing a member (J5, admin side)", () => {
  it("revokes Inès's Read, unlists her, keeps her nick, and tells her", async () => {
    await actAs("hyperscope");
    const hs = await loadCollective(hsConfig);
    const out = await admin.removeMember(hs, owner, await admin.readPerson(cast.ines.webId));
    expect(out.answered).toBe(true);
    const { members, nicks } = await admin.readRoster(hs);
    expect(members.map((m) => m.webId)).not.toContain(cast.ines.webId);
    expect(nicks.get(cast.ines.webId)).toBe("ines");

    await actAs("ines");
    expect(await status(hs.roster)).toBe(403);
    // Her side still declares it and cannot read the roster: pending, never refused.
    expect(membershipState(true, await isListed(hs, cast.ines.webId))).toBe("pending");
    expect((await inboxOf("ines")).some((m) => m.rawType?.endsWith("Remove"))).toBe(true);
  });
});
