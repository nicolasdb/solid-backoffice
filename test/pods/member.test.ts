import { describe, it, expect, vi, inject } from "vitest";
import { current, actAs } from "./as";

vi.mock("../../src/lib/auth", () => ({
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => current.fetch(input, init),
}));

const { loadCollective, readOwnProfile, updateOwnProfile, profileEdits, sendToInbox, buildJoin } =
  await import("../../src/lib/collective");
const { ensureContainer } = await import("../../src/lib/pod");
const { getAccess, setAccess, setAuthenticatedAccess } = await import("../../src/lib/acl");
const { shareFolder, stopSharing, sharedWith } = await import("../../src/lib/sharing");
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

  it("shares with its own rules (your agents edit, the collective's reads); stopping deletes them", async () => {
    await actAs("neil");
    const output2 = neil.pod + "output2/";
    const folder = output2 + "story/";
    const agent = cast.hsagent.webId;
    const mine = cast.ines.webId; // stands in for Neil's own agent
    await ensureContainer(folder);
    await updateOwnProfile(neil.webId, profileEdits.addDelegate(mine));
    const { delegates } = await readOwnProfile(neil.webId);
    expect(delegates).toContain(mine);
    // output2/ gives something else entirely: stopping must bring it back.
    await setAccess(output2, neil.webId, { agents: [], public: ["read"], authenticated: [] }, null);
    const as = async (role: "hsagent" | "ines", url: string, init?: RequestInit) => {
      await actAs(role);
      const s = (await current.fetch(url, init)).status;
      await actAs("neil");
      return s;
    };
    const put = (name: string) => ({ method: "PUT", headers: { "Content-Type": "text/markdown" }, body: name });

    await shareFolder(folder, neil.webId, agent, delegates);
    const own = await getAccess(folder, neil.webId);
    expect(own.inherited).toBe(false);
    expect(own.public).toEqual([]);
    expect(await as("hsagent", folder)).toBe(200);
    expect(await as("hsagent", folder + "x.md", put("x"))).toBe(403); // the collective's agent reads only
    expect(await as("ines", folder + "a.md", put("a"))).toBe(201); // your agent edits
    expect(await sharedWith(folder, neil.webId, neil.pod, agent)).toBe(true);

    await stopSharing(folder, neil.webId);
    expect((await getAccess(folder, neil.webId)).inherited).toBe(true);
    expect(await as("hsagent", folder)).toBe(200); // output2/'s public read
    expect(await as("ines", folder + "b.md", put("b"))).toBe(403); // output2/ gives reading only
    expect(await sharedWith(folder, neil.webId, neil.pod, agent)).toBe(true); // public read, inherited

    // Rules set by hand on the folder go too: it is the app's folder.
    await shareFolder(folder, neil.webId, agent, delegates);
    const set = await getAccess(folder, neil.webId);
    await setAccess(folder, neil.webId, { ...set, authenticated: ["read"] }, set.etag);
    await stopSharing(folder, neil.webId);
    expect((await getAccess(folder, neil.webId)).inherited).toBe(true);
    await stopSharing(folder, neil.webId); // already inheriting: nothing to do

    await setAccess(output2, neil.webId, { agents: [], public: [], authenticated: [] }, (await getAccess(output2, neil.webId)).etag);
    expect(await sharedWith(folder, neil.webId, neil.pod, agent)).toBe(false);
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
