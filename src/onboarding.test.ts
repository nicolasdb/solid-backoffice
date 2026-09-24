import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The screen's own logic: which step offers what, and the ORDER of writes —
 * the order is what keeps a half-finished step recoverable. The protocol code
 * underneath is tested in lib/.
 */
const calls: string[] = [];
const WEBID = "https://pod.example/neil/profile/card#me";
const POD = "https://pod.example/neil/";
const COLLECTIVE = {
  configUrl: "https://pod.example/hs/config.ttl",
  group: "https://pod.example/hs/membres.ttl#hs",
  name: "HyperScope",
  inbox: "https://pod.example/hs/inbox/",
  agent: "https://pod.example/hs/agents/agent#me",
  bundleFolder: "output2hyperscope/",
};

let profile = { name: null as string | null, memberOf: [] as string[], delegates: [] as string[], inbox: null as string | null };
let listed: boolean | null = null;
let agentGrants: { webId: string; modes: string[] }[] = [];
let failInbox = false;

vi.mock("./lib/auth", () => ({ authFetch: vi.fn() }));
vi.mock("./config", () => ({ COLLECTIVE_CONFIGS: ["https://pod.example/hs/config.ttl"] }));
vi.mock("./lib/pod", () => ({
  ensureContainer: async (url: string) => void calls.push(`ensure ${url}`),
  describePodError: (err: unknown) => (err instanceof Error ? err.message : String(err)),
  isAuthError: () => false,
}));
vi.mock("./lib/acl", () => ({
  isValidWebId: (v: string) => v.startsWith("https://"),
  getAccess: async () => ({ agents: agentGrants }),
  setAgentAccess: async (url: string, _o: string, agent: string, modes: string[]) =>
    void calls.push(`acl ${url} ${agent} ${modes.join(",")}`),
  setAuthenticatedAccess: async (url: string, _o: string, modes: string[]) =>
    void calls.push(`acl ${url} authenticated ${modes.join(",")}`),
}));
vi.mock("./lib/collective", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/collective")>();
  return {
    ...actual,
    readOwnProfile: async () => profile,
    loadCollective: async () => COLLECTIVE,
    isListed: async () => listed,
    updateOwnProfile: async (_w: string, edit: (t: unknown) => unknown) => {
      calls.push(`profile ${edit.name || "edit"}`);
    },
    sendToInbox: async (inbox: string, turtle: string) => {
      if (failInbox) throw new Error(`The inbox at ${inbox} refused the message (403).`);
      calls.push(`inbox ${turtle.includes("Announce") ? "Announce" : "Join"}`);
      return null;
    },
  };
});

const { renderMembership } = await import("./onboarding");

async function render(): Promise<HTMLElement> {
  const app = document.createElement("div");
  document.body.replaceChildren(app);
  await renderMembership(app, WEBID, POD, () => {});
  return app;
}

async function click(app: HTMLElement, selector: string): Promise<void> {
  app.querySelector<HTMLButtonElement>(selector)!.click();
  await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  calls.length = 0;
  profile = { name: "Neil", memberOf: [], delegates: [], inbox: null };
  listed = null;
  agentGrants = [];
  failInbox = false;
});

describe("slice A — the member's side of the handshake", () => {
  it("will not send a join request before there is an inbox for the answer", async () => {
    const app = await render();
    expect(app.querySelector<HTMLButtonElement>("#join-0")!.disabled).toBe(true);
  });

  it("creates the inbox, opens it to signed-in agents, and only then advertises it", async () => {
    const app = await render();
    await click(app, "#make-inbox");
    expect(calls).toEqual([
      `ensure ${POD}inbox/`,
      `acl ${POD}inbox/ authenticated append`,
      "profile edit",
    ]);
  });

  it("joins by declaring in the profile first, then sending the request", async () => {
    profile.inbox = POD + "inbox/";
    const app = await render();
    await click(app, "#join-0");
    expect(calls).toEqual(["profile edit", "inbox Join"]);
  });

  it("shows a failed request in its own step and keeps the screen", async () => {
    profile.inbox = POD + "inbox/";
    failInbox = true;
    const app = await render();
    await click(app, "#join-0");
    const error = app.querySelector<HTMLElement>(".step-error:not([hidden])")!;
    expect(error.textContent).toMatch(/refused the message \(403\)/);
    expect(app.querySelector<HTMLButtonElement>("#join-0")!.disabled).toBe(false);
  });

  it("offers to share only after asking to join", async () => {
    const app = await render();
    expect(app.querySelector("#publish-0")).toBeNull();
  });

  it("shares by creating the folder, granting the agent Read, then announcing", async () => {
    profile.inbox = POD + "inbox/";
    profile.memberOf = [COLLECTIVE.group];
    listed = true;
    const app = await render();
    expect(app.textContent).toContain("You are a member.");
    await click(app, "#publish-0");
    expect(calls).toEqual([
      `ensure ${POD}output2hyperscope/`,
      `acl ${POD}output2hyperscope/ ${COLLECTIVE.agent} read`,
      "inbox Announce",
    ]);
  });

  it("says plainly that stopping does not recall copies", async () => {
    profile.memberOf = [COLLECTIVE.group];
    listed = true;
    agentGrants = [{ webId: COLLECTIVE.agent, modes: ["read"] }];
    const app = await render();
    expect(app.textContent).toContain("does not remove copies already made");
    await click(app, "#unpublish-0");
    expect(calls).toEqual([`acl ${POD}output2hyperscope/ ${COLLECTIVE.agent} `]);
  });

  it("treats an unreadable roster as pending, not as refused", async () => {
    profile.memberOf = [COLLECTIVE.group];
    listed = null;
    const app = await render();
    expect(app.textContent).toContain("Waiting for the collective to accept it.");
    expect(app.querySelector("#resend-0")).not.toBeNull();
  });
});
