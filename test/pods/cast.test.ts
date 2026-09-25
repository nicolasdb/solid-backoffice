import { describe, it, expect, vi, inject, beforeEach } from "vitest";
import { current, actAs } from "./as";

vi.mock("../../src/lib/auth", () => ({
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => current.fetch(input, init),
}));

const { loadCollective, isListed, membershipState, readOwnProfile, sendToInbox, buildJoin, findRunCollective, summarise } =
  await import("../../src/lib/collective");
const { ensureContainer } = await import("../../src/lib/pod");
const { getAccess, setAgentAccess } = await import("../../src/lib/acl");

const cast = inject("cast");
const hsConfig = cast.hyperscope.pod + "config.ttl";
const hsGroup = hsConfig + "#hyperscope";

const status = async (url: string) => (await current.fetch(url)).status;

/**
 * First: the cast is what docs/how-to/set-up-a-collective.md says a collective
 * looks like. If one of these fails, the guide or the server changed.
 */
describe("the cast, set up by the how-to", () => {
  beforeEach(() => actAs("outsider"));

  it("lets anyone signed in read config.ttl, and nothing else of the collective", async () => {
    expect(await status(hsConfig)).toBe(200);
    expect(await status(cast.hyperscope.pod + "membres.ttl")).toBe(403);
    expect(await status(cast.hyperscope.pod + "inbox/")).toBe(403);
  });

  it("lets anonymous visitors read config.ttl, for the welcome screen", async () => {
    expect((await fetch(hsConfig)).status).toBe(200);
  });

  it("lets the collective's agent read what a member shares, and nobody else", async () => {
    const note = cast.amina.pod + "output2/hyperscope/notes.md";
    expect(await status(note)).toBe(403);
    await actAs("hsagent");
    expect(await status(note)).toBe(200);
  });
});

/** The app's own code, against a real server. */
describe("src/lib against the test server", () => {
  it("loads a collective from its IRI or its config address, for an outsider", async () => {
    await actAs("outsider");
    const byIri = await loadCollective(hsGroup);
    expect(byIri).toMatchObject({ group: hsGroup, name: "HyperScope", agent: cast.hsagent.webId });
    expect((await loadCollective(hsConfig)).group).toBe(hsGroup);
  });

  it("reads an unreadable roster as unknown, never as refused", async () => {
    await actAs("neil");
    const hs = await loadCollective(hsConfig);
    expect(await isListed(hs, cast.neil.webId)).toBeNull();
    expect(membershipState(true, null)).toBe("pending");
  });

  it("finds a member from both sides", async () => {
    await actAs("amina");
    const profile = await readOwnProfile(cast.amina.webId);
    expect(profile.memberOf).toContain(hsGroup);
    const hs = await loadCollective(profile.memberOf[0]);
    expect(await isListed(hs, cast.amina.webId)).toBe(true);
  });

  it("lets a newcomer post a join request, which only the collective can read", async () => {
    await actAs("neil");
    const hs = await loadCollective(hsConfig);
    const location = await sendToInbox(hs.inbox, buildJoin(cast.neil.webId, hs.group, "Neil"));
    expect(location).toBeTruthy();
    expect(await status(location!)).toBe(403);
    await actAs("hyperscope");
    const body = await (await current.fetch(location!)).text();
    expect(body).toContain(cast.neil.webId);
  });

  it("shares the way the Share button does: nested folder, grant, then the agent can read", async () => {
    await actAs("neil");
    const hs = await loadCollective(hsConfig);
    const folder = new URL(hs.bundleFolder, cast.neil.pod).href;
    expect(folder).toBe(cast.neil.pod + "output2/hyperscope/");
    await ensureContainer(folder);
    const put = await current.fetch(folder + "draft.md", {
      method: "PUT", headers: { "Content-Type": "text/markdown" }, body: "draft",
    });
    expect(put.ok).toBe(true);
    await setAgentAccess(folder, cast.neil.webId, cast.hsagent.webId, ["read"]);
    const access = await getAccess(folder, cast.neil.webId);
    expect(access.agents).toContainEqual({ webId: cast.hsagent.webId, modes: ["read"] });

    await actAs("hsagent");
    expect(await status(folder + "draft.md")).toBe(200);
    await actAs("outsider");
    expect(await status(folder + "draft.md")).toBe(403);
  });
});

/** Roles, read from the pods (docs/explanation/membership.md#roles). */
describe("who runs what", () => {
  it("finds the collective an account runs from config.ttl at its own pod root", async () => {
    await actAs("hyperscope");
    const own = await findRunCollective(cast.hyperscope.pod);
    expect(own?.group).toBe(hsGroup);
    const summary = await summarise(own!);
    expect(summary.members).toBeGreaterThanOrEqual(1);
    expect(summary.inboxItems).toBeGreaterThanOrEqual(0);
  });

  it("finds none for a person's account", async () => {
    await actAs("amina");
    expect(await findRunCollective(cast.amina.pod)).toBeNull();
  });

  it("lets a collective see another collective it could join (J6)", async () => {
    await actAs("hyperscope");
    const net = await loadCollective(cast.network.pod + "config.ttl");
    expect(net.name).toBe("Fablab network");
    expect(net.group).not.toBe(hsGroup);
  });

  it("gives a member only counts they may read: the inbox stays closed", async () => {
    await actAs("amina");
    const summary = await summarise(await loadCollective(hsConfig));
    expect(summary.members).toBeGreaterThanOrEqual(1);
    expect(summary.inboxItems).toBeNull();
  });
});
