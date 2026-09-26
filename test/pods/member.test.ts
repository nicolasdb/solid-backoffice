import { describe, it, expect, vi, inject } from "vitest";
import { current, actAs } from "./as";

vi.mock("../../src/lib/auth", () => ({
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => current.fetch(input, init),
}));

const { loadCollective, readOwnProfile, updateOwnProfile, profileEdits, sendToInbox, buildJoin } =
  await import("../../src/lib/collective");
const { ensureContainer } = await import("../../src/lib/pod");
const { getAccess, setAgentAccess, setAuthenticatedAccess } = await import("../../src/lib/acl");
const admin = await import("../../src/lib/admin");

const cast = inject("cast");
const neil = cast.neil;
const status = async (url: string) => (await current.fetch(url)).status;

/**
 * Slice A's steps that the other pod tests do not run through the app's own
 * code: name, agent, inbox, stop sharing — plus `as:Reject` reaching an inbox.
 * One story, as Neil (an account and nothing else), each step starting from
 * what the last one left.
 */
describe("a member sets themselves up (slice A)", () => {
  it("saves a name and changes nothing else in the profile", async () => {
    await actAs("neil");
    const before = await readOwnProfile(neil.webId);
    await updateOwnProfile(neil.webId, profileEdits.setName("Neil"));
    expect(await readOwnProfile(neil.webId)).toEqual({ ...before, name: "Neil" });
  });

  it("declares an agent once, removes it, and puts it back", async () => {
    await actAs("neil");
    const agent = cast.hsagent.webId;
    await updateOwnProfile(neil.webId, profileEdits.addDelegate(agent));
    await updateOwnProfile(neil.webId, profileEdits.addDelegate(agent));
    expect((await readOwnProfile(neil.webId)).delegates).toEqual([agent]);
    await updateOwnProfile(neil.webId, profileEdits.removeDelegate(agent));
    expect((await readOwnProfile(neil.webId)).delegates).toEqual([]);
    await updateOwnProfile(neil.webId, profileEdits.addDelegate(agent));
    expect((await readOwnProfile(neil.webId)).delegates).toEqual([agent]);
  });

  it("makes an inbox in the screen's order: anyone signed in may Append, only Neil reads", async () => {
    await actAs("neil");
    const inbox = neil.pod + "inbox/";
    await ensureContainer(inbox);
    await setAuthenticatedAccess(inbox, neil.webId, ["append"]);
    await updateOwnProfile(neil.webId, profileEdits.setInbox(inbox));
    expect((await readOwnProfile(neil.webId)).inbox).toBe(inbox);
    expect((await getAccess(inbox, neil.webId)).authenticated).toEqual(["append"]);

    await actAs("outsider");
    const post = await current.fetch(inbox, { method: "POST", headers: { "Content-Type": "text/turtle" }, body: "<> a <#x>." });
    expect(post.status).toBe(201);
    expect(await status(inbox)).toBe(403);
    expect(await current.fetch(cast.neil.pod + "inbox/").then((r) => r.status)).toBe(403);
  });

  it("stops sharing, then undoes it: the agent loses Read, then gets it back", async () => {
    await actAs("neil");
    const folder = neil.pod + "output2/hyperscope/";
    await ensureContainer(folder);
    await current.fetch(folder + "share.md", { method: "PUT", headers: { "Content-Type": "text/markdown" }, body: "shared" });
    const agent = cast.hsagent.webId;
    const agentStatus = async () => {
      await actAs("hsagent");
      const s = await status(folder + "share.md");
      await actAs("neil");
      return s;
    };
    await setAgentAccess(folder, neil.webId, agent, ["read"]);
    expect(await agentStatus()).toBe(200);
    await setAgentAccess(folder, neil.webId, agent, []);
    expect(await agentStatus()).toBe(403);
    await setAgentAccess(folder, neil.webId, agent, ["read"]);
    expect(await agentStatus()).toBe(200);
  });
});

describe("the collective refuses a request (slice B)", () => {
  it("sends as:Reject to the requester's inbox and deletes the request", async () => {
    await actAs("neil");
    const hs = await loadCollective(cast.hyperscope.pod + "config.ttl");
    await sendToInbox(hs.inbox, buildJoin(neil.webId, hs.group, "Neil"));

    await actAs("hyperscope");
    const join = (await admin.readInbox(hs)).find((m) => m.type === "Join" && m.actor === neil.webId)!;
    const person = await admin.readPerson(neil.webId);
    expect(person.profile?.inbox).toBe(neil.pod + "inbox/");
    const out = await admin.refuse(hs, cast.hyperscope.webId, join, person);
    expect(out.answered).toBe(true);
    expect(await status(join.url)).toBe(404);

    await actAs("neil");
    const listing = await (await current.fetch(neil.pod + "inbox/", { headers: { Accept: "text/turtle" } })).text();
    const messages = await Promise.all(
      admin.parseInboxListing(listing, neil.pod + "inbox/").map(async (u) => admin.parseActivity(await (await current.fetch(u)).text(), u))
    );
    expect(messages.find((m) => m.rawType?.endsWith("Reject"))).toMatchObject({
      actor: cast.hyperscope.webId,
      object: join.url,
      target: hs.group,
    });
  });
});

/**
 * Layout L4: a member's tab lists the roster as the member reads it. Amina is
 * a member from the cast; Neil has asked and nothing more, so the roster
 * refuses him, which the screen shows as "once accepted", never "refused".
 */
describe("a member's view of the roster (layout L4)", () => {
  it("lets an accepted member read the roster, and refuses someone who has only asked", async () => {
    await actAs("amina");
    const hs = await loadCollective(cast.hyperscope.pod + "config.ttl");
    const { members } = await admin.readRoster(hs);
    expect(members.map((m) => m.webId)).toContain(cast.amina.webId);

    await actAs("neil");
    await expect(admin.readRoster(hs)).rejects.toThrow(/\((401|403)\)/);
  });
});
