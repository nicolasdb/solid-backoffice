import { describe, it, expect, vi, inject, beforeEach } from "vitest";
import { current, actAs } from "./as";
import { credentialsOf } from "./accounts";

vi.mock("../../src/lib/auth", () => ({
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => current.fetch(input, init),
}));

const agents = await import("../../src/lib/agents");
const { readOwnProfile, updateOwnProfile, profileEdits } = await import("../../src/lib/collective");
const { getAccess, setAccess, forgetAclLocations } = await import("../../src/lib/acl");
const { forgetReads } = await import("../../src/lib/read");
const { Session } = await import("@inrupt/solid-client-authn-node");

const base = inject("base");
const cast = inject("cast");
const me = cast.outsider;

/**
 * The provider's connector (pocpod0 `/onboard/`) is not part of CSS: an
 * in-memory one stands in for it, keeping what was minted and revoked.
 * Everything else is the real account API.
 */
const grants: { grantId: string; label: string; webId: string; revoked: boolean; createdAt: string }[] = [];
const realFetch = agents.net.fetch;
agents.net.fetch = async (input, init) => {
  const url = String(input);
  if (!url.startsWith(base + "onboard/")) return realFetch(input, init);
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  if (url.endsWith("/grants")) return Response.json({ grants });
  if (url.endsWith("/mint")) {
    grants.push({ grantId: `g${grants.length}`, label: body.label, webId: body.webId, revoked: false, createdAt: "2026-09-27" });
    return Response.json({ connectorUrl: `https://solid-mcp.test/mcp/slug${grants.length}` }, { status: 201 });
  }
  const g = grants.find((x) => x.grantId === body.grantId);
  if (g) g.revoked = true;
  return Response.json({ revoked: true });
};

async function session() {
  const { email, password } = credentialsOf("outsider");
  return agents.unlockWithPassword(base, email, password);
}

beforeEach(async () => {
  forgetReads();
  forgetAclLocations();
  await actAs("outsider");
});

/** Slice D on a real CSS 7 with one root storage, like our provider. */
describe("an agent on your pod (D)", () => {
  it("refuses a lapsed account session, and opens one with the password", async () => {
    await expect(agents.checkSession(agents.cookieSession(base))).rejects.toMatchObject({ code: "ended" });
    await expect(agents.unlockWithPassword(base, "outsider@test.invalid", "wrong-password")).rejects.toThrow(/do not match/);
    const s = await session();
    expect(s.token).toBeTruthy();
    const links = await agents.linkedWebIds(s);
    expect(links.map((l) => l.webId)).toContain(me.webId);
    expect(agents.agentsOf(links, me.pod, me.webId)).toEqual([]);
  });

  it("creates one in four writes: document, public Read, checked anonymously, linked", async () => {
    const s = await session();
    const posts: string[] = [];
    const counting = agents.net.fetch;
    agents.net.fetch = (input, init) => {
      if (init?.method === "POST") posts.push(String(input));
      return counting(input, init);
    };
    const agent = await agents.createAgent(s, me.pod, me.webId, "Claude").finally(() => (agents.net.fetch = counting));
    // One root storage: CSS asked for the ownership proof, so the link was posted twice.
    expect(posts).toHaveLength(2);
    expect(agent.webId).toBe(`${me.pod}profile/claude#me`);

    // Anyone can read who it is, and the ownership proof is gone again.
    const doc = await (await fetch(`${me.pod}profile/claude`)).text();
    expect(doc).toContain(`<${base}>`);
    expect(doc).toContain('"Claude"');
    expect(doc).not.toContain("RegistrationToken");
    const acl = await getAccess(`${me.pod}profile/claude`, me.webId);
    expect(acl.public).toEqual(["read"]);

    const listed = agents.agentsOf(await agents.linkedWebIds(s), me.pod, me.webId);
    expect(listed.map((l) => l.webId)).toEqual([agent.webId]);
    expect(agents.agentName(doc, agent.webId)).toBe("Claude");

    // A linked agent can be given a credential: what the connector mints.
    const cc = await fetch((await (await fetch(base + ".account/", { headers: { Authorization: `CSS-Account-Token ${s.token}` } })).json()).controls.account.clientCredentials, {
      method: "POST",
      headers: { Authorization: `CSS-Account-Token ${s.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "claude-test", webId: agent.webId }),
    });
    expect(cc.ok).toBe(true);
  });

  it("never gives an address twice: a second Claude is claude-2", async () => {
    expect(await agents.freeAgentDoc(me.pod, "Claude")).toBe(`${me.pod}profile/claude-2`);
    expect(await agents.freeAgentDoc(me.pod, "card")).toBe(`${me.pod}profile/card-agent`);
  });

  it("undoes the document when the link fails, and names the step", async () => {
    const s = await session();
    const before = agents.agentsOf(await agents.linkedWebIds(s), me.pod, me.webId);
    const realLink = agents.net.fetch;
    agents.net.fetch = async (input, init) =>
      init?.method === "POST" && String(input).includes(".account/") ? new Response("nope", { status: 400 }) : realLink(input, init);
    try {
      await expect(agents.createAgent(s, me.pod, me.webId, "Broken")).rejects.toMatchObject({ step: "link", cleanedUp: true });
    } finally {
      agents.net.fetch = realLink;
    }
    expect((await current.fetch(`${me.pod}profile/broken`, { method: "HEAD" })).status).toBe(404);
    expect(agents.agentsOf(await agents.linkedWebIds(s), me.pod, me.webId)).toEqual(before);
  });

  it("is given folders without losing anyone who could reach them", async () => {
    const claude = `${me.pod}profile/claude#me`;
    const notes = `${me.pod}notes/`;
    const inside = `${notes}ideas/`;
    for (const url of [notes, inside]) {
      const res = await current.fetch(url + "readme.md", { method: "PUT", headers: { "Content-Type": "text/markdown" }, body: "# hi\n" });
      expect(res.ok).toBe(true);
    }
    // notes/ has rules of its own naming someone; ideas/ inherits them.
    await setAccess(notes, me.webId, { agents: [{ webId: cast.amina.webId, modes: ["read"] }], public: [], authenticated: [] }, null);

    await agents.setFolderAccess(inside, me.webId, me.pod, claude, ["read", "append", "write"]);
    const own = await getAccess(inside, me.webId);
    expect(own.inherited).toBe(false);
    expect(own.agents).toEqual([
      { webId: cast.amina.webId, modes: ["read"] },
      { webId: claude, modes: ["read", "append", "write"] },
    ]);
    await agents.setFolderAccess(notes, me.webId, me.pod, claude, ["read"]);

    const walk = await agents.walkRules(me.pod, me.webId);
    expect(walk.complete).toBe(true);
    expect(agents.reachOf(walk, claude)).toEqual([
      { url: notes, modes: ["read"] },
      { url: inside, modes: ["read", "append", "write"] },
    ]);

    // The agent really reaches them, signed in as itself.
    const s = await session();
    const idx = await (await fetch(base + ".account/", { headers: { Authorization: `CSS-Account-Token ${s.token}` } })).json();
    const cred = await (await fetch(idx.controls.account.clientCredentials, {
      method: "POST",
      headers: { Authorization: `CSS-Account-Token ${s.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "claude-reach", webId: claude }),
    })).json();
    const as = new Session();
    await as.login({ clientId: cred.id, clientSecret: cred.secret, oidcIssuer: base });
    expect((await as.fetch(inside + "readme.md")).status).toBe(200);
    expect((await as.fetch(`${me.pod}private-nothing/`)).status).not.toBe(200);
    await as.logout();
  });

  it("connects, then is deleted in order: connector, rules, profile, link, document", async () => {
    const s = await session();
    const claude = `${me.pod}profile/claude#me`;
    await updateOwnProfile(me.webId, profileEdits.addDelegate(claude));
    const url = await agents.connectAgent(s, claude, "Claude · outsider");
    expect(url).toMatch(/^https:\/\/solid-mcp\.test\/mcp\//);
    expect((await agents.listConnectors(s)).filter((c) => c.webId === claude && !c.revoked)).toHaveLength(1);

    const walk = await agents.walkRules(me.pod, me.webId);
    const link = (await agents.linkedWebIds(s)).find((l) => l.webId === claude)!;
    await agents.deleteAgent(s, me.webId, me.pod, { webId: claude, name: "Claude", link, reach: agents.reachOf(walk, claude), delegate: true }, "2026-09-27");

    expect((await agents.listConnectors(s)).filter((c) => c.webId === claude && !c.revoked)).toEqual([]);
    forgetReads();
    expect(agents.reachOf(await agents.walkRules(me.pod, me.webId), claude)).toEqual([]);
    // ideas/ keeps Amina: only the agent left its rules.
    expect((await getAccess(`${me.pod}notes/ideas/`, me.webId)).agents).toEqual([{ webId: cast.amina.webId, modes: ["read"] }]);
    expect((await readOwnProfile(me.webId)).delegates).toEqual([]);
    expect((await agents.linkedWebIds(s)).map((l) => l.webId)).not.toContain(claude);
    const doc = await (await fetch(`${me.pod}profile/claude`)).text();
    expect(doc).not.toContain("oidcIssuer");
    expect(doc).toContain("Retired on 2026-09-27");
    expect(await agents.freeAgentDoc(me.pod, "Claude")).toBe(`${me.pod}profile/claude-2`);
  });
});
