import { describe, it, expect, vi, inject, beforeEach } from "vitest";
import { current, actAs } from "./as";

vi.mock("../../src/lib/auth", () => ({
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => current.fetch(input, init),
}));

const { loadCollective, isListed, membershipState, readOwnProfile, sendToInbox, buildJoin } =
  await import("../../src/lib/collective");
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

  it("keeps config.ttl from anonymous visitors", async () => {
    expect((await fetch(hsConfig)).status).toBe(401);
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

  it("writes a grant with acl.ts that the server then enforces", async () => {
    await actAs("neil");
    const folder = cast.neil.pod + "output2/hyperscope/";
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
