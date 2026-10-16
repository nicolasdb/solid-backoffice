import { describe, it, expect, vi, inject } from "vitest";
import { current, actAs } from "./as";

vi.mock("../../src/lib/auth", () => ({
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => current.fetch(input, init),
}));

const { loadCollective, readOwnProfile, updateOwnProfile, profileEdits, sendToInbox, buildJoin } =
  await import("../../src/lib/collective");
const { ensureContainer } = await import("../../src/lib/pod");
const { getAccess, setAccess, setAuthenticatedAccess } = await import("../../src/lib/acl");
const { restoreRules, shareFolder, stopPlan, stopSharing, stopSharingAs, sharedWith } = await import("../../src/lib/sharing");
const { chooseFolder, choicesUrl, readChoices } = await import("../../src/lib/shared-folders");
const admin = await import("../../src/lib/admin");
const { setFolderAccess } = await import("../../src/lib/agents");

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

  const as = async (role: "hsagent" | "ines" | "outsider" | "network", url: string, init?: RequestInit) => {
    await actAs(role);
    const s = (await current.fetch(url, init)).status;
    await actAs("neil");
    return s;
  };
  const put = (name: string) => ({ method: "PUT", headers: { "Content-Type": "text/markdown" }, body: name });

  it("shares a folder Neil picked: its rules merged, not replaced; stopping takes out that agent only (slice G)", async () => {
    await actAs("neil");
    const agent = cast.hsagent.webId;
    const other = cast.network.webId; // a second collective's agent
    const mine = cast.ines.webId; // stands in for Neil's own agent
    await updateOwnProfile(neil.webId, profileEdits.removeDelegate(agent)); // a collective's agent, not his
    await updateOwnProfile(neil.webId, profileEdits.addDelegate(mine));
    const { delegates } = await readOwnProfile(neil.webId);
    expect(delegates).toContain(mine);

    const folder = neil.pod + "notes/";
    await ensureContainer(folder);
    await setAccess(folder, neil.webId, { agents: [{ webId: cast.outsider.webId, modes: ["read"] }], public: [], authenticated: [] }, null);

    await shareFolder(folder, neil.webId, neil.pod, agent, delegates);
    const own = await getAccess(folder, neil.webId);
    expect(own.agents).toContainEqual({ webId: cast.outsider.webId, modes: ["read"] }); // kept
    expect(own.agents).toContainEqual({ webId: agent, modes: ["read"] });
    expect(own.agents).toContainEqual({ webId: mine, modes: ["read", "append", "write"] });
    expect(await as("hsagent", folder)).toBe(200);
    expect(await as("hsagent", folder + "x.md", put("x"))).toBe(403); // the collective's agent reads only
    expect(await as("ines", folder + "a.md", put("a"))).toBe(201); // your agent edits
    const before = (await getAccess(folder, neil.webId)).etag;
    await shareFolder(folder, neil.webId, neil.pod, agent, delegates); // again: nothing to write
    expect((await getAccess(folder, neil.webId)).etag).toBe(before);

    await shareFolder(folder, neil.webId, neil.pod, other, delegates);
    await stopSharing(folder, neil.webId, agent);
    expect(await as("hsagent", folder)).toBe(403);
    expect(await sharedWith(folder, neil.webId, neil.pod, agent)).toBe(false);
    expect(await sharedWith(folder, neil.webId, neil.pod, other)).toBe(true); // the other collective keeps it
    expect(await as("outsider", folder)).toBe(200); // and so does everyone else the folder named
    await stopSharing(folder, neil.webId, other);
    await stopSharing(folder, neil.webId, other); // already out: nothing to do

    // Stopping asks what the rules become: each choice, written as planned.
    await shareFolder(folder, neil.webId, neil.pod, agent, delegates);
    const plan = await stopPlan(folder, neil.webId, neil.pod, agent, delegates);
    expect(plan.options.map((o) => o.choice)).toEqual(["keep", "follow", "only"]); // the outsider is still named
    expect(plan.options[1].from).toBe(neil.pod);
    await stopSharingAs(plan, neil.webId, "only");
    expect(await as("hsagent", folder)).toBe(403);
    expect(await as("outsider", folder)).toBe(403); // only Neil and his agent now
    expect(await as("ines", folder)).toBe(200);
    await restoreRules(plan, neil.webId); // the toast's Undo: back as it was, the agent too
    expect(await as("hsagent", folder)).toBe(200);
    expect(await as("outsider", folder)).toBe(200);

    const again = await stopPlan(folder, neil.webId, neil.pod, agent, delegates);
    await setAccess(folder, neil.webId, { agents: [], public: [], authenticated: [] }, again.basedOn); // changed meanwhile
    await expect(stopSharingAs(again, neil.webId, "follow")).rejects.toMatchObject({ status: 412 });
    const fresh = await stopPlan(folder, neil.webId, neil.pod, agent, delegates);
    expect(fresh.options.map((o) => o.choice)).toEqual(["keep", "follow"]); // nobody else named: no "only"
    await stopSharingAs(fresh, neil.webId, "follow");
    expect((await getAccess(folder, neil.webId)).inherited).toBe(true);
  });

  it("never makes public a folder that follows the pod root: the root's public Read is the root's only", async () => {
    await actAs("neil");
    const anon = async (url: string) => (await fetch(url)).status;
    const root = await getAccess(neil.pod, neil.webId);
    expect(root.public).toEqual(["read"]); // CSS: the root itself is public…
    expect(root.inherits.public).toEqual([]); // …what is inside is not
    const folder = neil.pod + "plain/";
    await ensureContainer(folder);
    await current.fetch(folder + "a.md", put("a"));
    expect(await anon(folder + "a.md")).toBe(401);
    expect(await sharedWith(folder, neil.webId, neil.pod, cast.hsagent.webId)).toBe(false);

    await shareFolder(folder, neil.webId, neil.pod, cast.hsagent.webId, []);
    expect((await getAccess(folder, neil.webId)).public).toEqual([]);
    expect(await anon(folder + "a.md")).toBe(401);
    expect(await as("hsagent", folder + "a.md")).toBe(200);

    const plan = await stopPlan(folder, neil.webId, neil.pod, cast.hsagent.webId, []);
    const follow = plan.options.find((o) => o.choice === "follow")!;
    expect(follow.from).toBe(neil.pod);
    expect(follow.rules.public).toEqual([]); // what it would follow: not public
    await stopSharingAs(plan, neil.webId, "follow");
    expect(await anon(folder + "a.md")).toBe(401);
    expect(await as("hsagent", folder + "a.md")).toBe(403);

    // An agent given the folder (slice D) copies the same rules: not public either.
    await setFolderAccess(folder, neil.webId, neil.pod, cast.ines.webId, ["read"]);
    expect((await getAccess(folder, neil.webId)).public).toEqual([]);
    expect(await anon(folder + "a.md")).toBe(401);
  });

  it("a public folder is shared only while the agent is named: stopping works, and it stays public", async () => {
    await actAs("neil");
    const agent = cast.hsagent.webId;
    const folder = neil.pod + "open/";
    await ensureContainer(folder);
    await setAccess(folder, neil.webId, { agents: [], public: ["read"], authenticated: [] }, null);
    expect(await sharedWith(folder, neil.webId, neil.pod, agent)).toBe(false); // readable, not shared

    await shareFolder(folder, neil.webId, neil.pod, agent, []);
    expect(await sharedWith(folder, neil.webId, neil.pod, agent)).toBe(true);

    await stopSharingAs(await stopPlan(folder, neil.webId, neil.pod, agent, []), neil.webId, "keep");
    expect(await sharedWith(folder, neil.webId, neil.pod, agent)).toBe(false);
    expect((await fetch(folder)).status).toBe(200); // still public, as Neil chose
  });

  it("gives a folder that follows the one above a copy of those rules, plus the grant", async () => {
    await actAs("neil");
    const parent = neil.pod + "work/";
    const folder = parent + "story/";
    await ensureContainer(folder);
    await setAccess(parent, neil.webId, { agents: [{ webId: cast.outsider.webId, modes: ["read"] }], public: [], authenticated: [] }, null);
    expect((await getAccess(folder, neil.webId)).inherited).toBe(true);

    await shareFolder(folder, neil.webId, neil.pod, cast.hsagent.webId, []);
    const own = await getAccess(folder, neil.webId);
    expect(own.inherited).toBe(false);
    expect(own.agents).toContainEqual({ webId: cast.outsider.webId, modes: ["read"] });
    expect(await as("outsider", folder)).toBe(200); // nobody lost what they had
    expect(await as("hsagent", folder)).toBe(200);
  });

  it("creates a missing folder, and nothing on the way is public, before or after", async () => {
    await actAs("neil");
    const parent = neil.pod + "fresh/";
    const folder = parent + "story/";
    const mine = cast.ines.webId;
    const root = await getAccess(neil.pod, neil.webId);
    // Put back as it was, byte for byte: setAccess would re-emit the root's
    // public Read WITH acl:default, and the whole pod would turn public.
    const original = await (await current.fetch(root.aclUrl)).text();
    await setAccess(neil.pod, neil.webId, { ...root, public: ["read"] }, root.etag); // public all the way down
    const anon = async (url: string) => (await fetch(url)).status;
    try {
      await shareFolder(folder, neil.webId, neil.pod, cast.hsagent.webId, [mine]);
      const above = await getAccess(parent, neil.webId);
      expect(above.public).toEqual([]);
      expect(above.agents).toEqual([{ webId: mine, modes: ["read", "append", "write"] }]);
      expect((await getAccess(folder, neil.webId)).public).toEqual([]);
      expect(await anon(folder)).toBe(401);
      expect(await as("hsagent", folder)).toBe(200);

      await stopSharing(folder, neil.webId, cast.hsagent.webId);
      expect(await anon(folder)).toBe(401);
      expect(await as("hsagent", folder)).toBe(403);
      expect((await getAccess(neil.pod, neil.webId)).public).toEqual(["read"]); // the root is never touched
    } finally {
      await current.fetch(root.aclUrl, { method: "PUT", headers: { "Content-Type": "text/turtle" }, body: original });
    }
  });

  it("never shares the pod root, profile/, settings/ or inbox/", async () => {
    await actAs("neil");
    for (const path of ["", "profile/", "settings/", "inbox/", "settings/sub/"]) {
      await expect(shareFolder(neil.pod + path, neil.webId, neil.pod, cast.hsagent.webId, [])).rejects.toThrow(/cannot be shared/);
    }
  });

  it("keeps the folder picked for each collective in settings/, readable by Neil's agents, with a README", async () => {
    await actAs("neil");
    const group = cast.hyperscope.pod + "config.ttl#hyperscope";
    const second = cast.network.pod + "config.ttl#network";
    await chooseFolder(neil.pod, neil.webId, group, neil.pod + "notes/", []); // creates it
    expect(await as("ines", choicesUrl(neil.pod))).toBe(403); // its own rules: you only
    expect(await as("outsider", choicesUrl(neil.pod))).toBe(403);
    await chooseFolder(neil.pod, neil.webId, second, neil.pod + "work/story/", [cast.ines.webId]);
    await chooseFolder(neil.pod, neil.webId, group, neil.pod + "work/", [cast.ines.webId]);
    expect([...(await readChoices(neil.pod))]).toEqual([
      [group, neil.pod + "work/"],
      [second, neil.pod + "work/story/"],
    ]);
    const readme = await current.fetch(neil.pod + "settings/README.md");
    expect(await readme.text()).toContain("can break the app that wrote it");

    expect(await as("ines", choicesUrl(neil.pod))).toBe(200); // Neil's agent reads it
    expect(await as("ines", choicesUrl(neil.pod), put("x"))).toBe(403); // and only reads
    expect(await as("outsider", choicesUrl(neil.pod))).toBe(403);

    await chooseFolder(neil.pod, neil.webId, second, null, []);
    expect([...(await readChoices(neil.pod)).keys()]).toEqual([group]);
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
