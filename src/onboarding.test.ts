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
  group: "https://pod.example/hs/config.ttl#hs",
  name: "HyperScope",
  roster: "https://pod.example/hs/membres.ttl",
  inbox: "https://pod.example/hs/inbox/",
  agent: "https://pod.example/hs/agents/agent#me",
  bundleFolder: "output2/hyperscope/",
};

let profile = { name: null as string | null, memberOf: [] as string[], delegates: [] as string[], inbox: null as string | null };
let listed: boolean | null = null;
let agentGrants: { webId: string; modes: string[] }[] = [];
let failInbox = false;
let inboxFolderExists = false;
let configStatus: number | null = null;
let runs: typeof COLLECTIVE | null = null;
/** What readRoster returns to this member; null: it refuses (not a member yet). */
let rosterEntries: { webId: string; nick: string | null }[] | null = null;

vi.mock("./lib/auth", () => ({ authFetch: vi.fn() }));
vi.mock("./lib/pod", () => ({
  ensureContainer: async (url: string) => void calls.push(`ensure ${url}`),
  exists: async () => inboxFolderExists,
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
    loadCollective: async (address: string) => {
      if (configStatus !== null) {
        throw Object.assign(new Error(`Could not read ${address} (${configStatus}).`), { status: configStatus, address });
      }
      if (address === COLLECTIVE.configUrl || address === COLLECTIVE.group) return COLLECTIVE;
      throw Object.assign(new Error("not a collective"), { address });
    },
    isListed: async () => listed,
    findRunCollective: async () => runs,
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

vi.mock("./lib/admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/admin")>()),
  readInbox: async () => [],
  readMembers: async () => [],
  readRoster: async () => {
    if (!rosterEntries) throw new Error("Could not read the roster (403).");
    return { members: rosterEntries, nicks: new Map(rosterEntries.map((e) => [e.webId, e.nick ?? ""])) };
  },
  readPerson: async (webId: string) => ({
    webId,
    profile: webId === WEBID ? { name: "Neil", memberOf: [], delegates: [], inbox: null } : null,
    problem: null,
  }),
}));

const { renderMembership } = await import("./onboarding");
const { captureInvite } = await import("./invite");
const tab = (c: { configUrl: string }) => `#/c/${encodeURIComponent(c.configUrl)}`;

/** Arrive through an invitation link, as a newcomer would. */
function invitedTo(address: string): void {
  window.history.replaceState(null, "", `/?collective=${encodeURIComponent(address)}`);
  captureInvite();
  window.history.replaceState(null, "", "/");
}

/** Render the tab the hash names: home by default, `tab(COLLECTIVE)` for a collective's own. */
async function render(hash = "#/"): Promise<HTMLElement> {
  // replaceState, not location.hash: no hashchange, so no second render racing the test.
  window.history.replaceState(null, "", `/${hash}`);
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
  rosterEntries = [];
  agentGrants = [];
  failInbox = false;
  inboxFolderExists = false;
  configStatus = null;
  runs = null;
  sessionStorage.clear();
  invitedTo(COLLECTIVE.configUrl);
});

describe("slice A — the member's side of the handshake", () => {
  it("assumes no collective: without an invitation or a membership, it only offers to look one up", async () => {
    sessionStorage.clear();
    const app = await render();
    expect(app.querySelector("#join-0")).toBeNull();
    expect(app.textContent).toContain("Join a collective");
    expect(app.querySelector("#find-form")).not.toBeNull();
  });

  it("finds a member's collectives from the org:memberOf in their profile", async () => {
    sessionStorage.clear();
    profile.memberOf = [COLLECTIVE.group, "https://example.org/some-club#org"];
    listed = true;
    const app = await render();
    expect(app.textContent).toContain("You are a member.");
    expect(app.textContent).toContain("not managed here");
  });

  it("says who can fix a collective whose description is closed to newcomers", async () => {
    configStatus = 403;
    const app = await render();
    expect(app.textContent).toContain("not open to newcomers yet");
    expect(app.textContent).toContain("Nothing on your side is wrong.");
  });

  it("offers an existing inbox/ the profile does not advertise, instead of a new one", async () => {
    inboxFolderExists = true;
    const app = await render();
    expect(app.textContent).toContain("Use this inbox");
    await click(app, "#make-inbox");
    expect(calls).toEqual([
      `ensure ${POD}inbox/`,
      `acl ${POD}inbox/ authenticated append`,
      "profile edit",
    ]);
  });

  it("shows the collective an account runs, and never offers it to join itself", async () => {
    runs = COLLECTIVE;
    const app = await render();
    expect(app.textContent).toContain("You run");
    expect(app.textContent).toContain("0 members · 0 requests");
    expect(app.querySelector("#join-0")).toBeNull();
    expect(app.textContent).not.toContain("Join HyperScope");
    // The invitation to itself is dropped, not kept for later.
    expect(sessionStorage.getItem("solid-backoffice.invite")).toBeNull();
  });

  it("suggests a collective account's own agent, from its config.ttl", async () => {
    runs = COLLECTIVE;
    const app = await render();
    expect(app.querySelector(`[data-add-agent="${COLLECTIVE.agent}"]`)).not.toBeNull();
    await click(app, `[data-add-agent="${COLLECTIVE.agent}"]`);
    expect(calls).toEqual(["profile edit"]);
  });

  it("says plainly when you belong to no collective", async () => {
    sessionStorage.clear();
    const app = await render();
    expect(app.textContent).toContain("No collective yet.");
  });

  it("lets a collective belong to another collective", async () => {
    runs = { ...COLLECTIVE, configUrl: "https://pod.example/net/config.ttl", group: "https://pod.example/net/config.ttl#net", name: "Network" };
    const app = await render();
    expect(app.textContent).toContain("You run");
    expect(app.textContent).toContain("Join HyperScope");
  });

  it("shows nobody a \"You run\" section unless their pod holds a config.ttl", async () => {
    const app = await render();
    expect(app.textContent).not.toContain("You run");
  });

  it("confirms a membership the collective already listed, without asking again", async () => {
    profile.inbox = POD + "inbox/";
    listed = true;
    const app = await render();
    expect(app.textContent).toContain("Not joined yet");
    expect(app.textContent).toContain("HyperScope lists you as a member");
    expect(app.querySelector("#join-0")!.textContent).toBe("Confirm membership");
    await click(app, "#join-0");
    expect(calls).toEqual(["profile edit"]);
  });

  it("files a collective you only looked up under Not joined yet", async () => {
    const app = await render();
    const belong = [...app.querySelectorAll("h2.section-title")].map((h) => h.textContent);
    expect(belong).toEqual(["You belong to", "Not joined yet", "You"]);
    expect(app.textContent).toContain("No collective yet.");
  });

  it("folds finished steps to their title", async () => {
    profile.inbox = POD + "inbox/";
    const app = await render();
    const inbox = [...app.querySelectorAll("details.step")].find((d) => d.textContent!.includes("Your inbox"));
    expect(inbox).toBeTruthy();
    expect(inbox!.hasAttribute("open")).toBe(false);
  });

  it("says an invitation link from a development server works only on this computer", async () => {
    runs = COLLECTIVE;
    const app = await render(tab(COLLECTIVE));
    expect(app.querySelector<HTMLElement>(".run-head [data-copy]")!.dataset.copy).toContain("?collective=");
    expect(app.textContent).toContain("works only on this computer");
  });

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
    const app = await render(tab(COLLECTIVE));
    expect(app.textContent).toContain("You are a member.");
    await click(app, "#publish-0");
    expect(calls).toEqual([
      `ensure ${POD}output2/hyperscope/`,
      `acl ${POD}output2/hyperscope/ ${COLLECTIVE.agent} read`,
      "inbox Announce",
    ]);
  });

  it("says plainly that stopping does not recall copies", async () => {
    profile.memberOf = [COLLECTIVE.group];
    listed = true;
    agentGrants = [{ webId: COLLECTIVE.agent, modes: ["read"] }];
    const app = await render(tab(COLLECTIVE));
    expect(app.textContent).toContain("does not remove copies already made");
    await click(app, "#unpublish-0");
    expect(calls).toEqual([`acl ${POD}output2/hyperscope/ ${COLLECTIVE.agent} `]);
  });

  it("treats an unreadable roster as pending, not as refused", async () => {
    profile.memberOf = [COLLECTIVE.group];
    listed = null;
  rosterEntries = [];
    const app = await render(tab(COLLECTIVE));
    expect(app.textContent).toContain("Waiting for the collective to accept it.");
    expect(app.querySelector("#resend-0")).not.toBeNull();
  });
});

describe("layout A — tabs", () => {
  const tabLabels = (app: HTMLElement) => [...app.querySelectorAll(".tab")].map((t) => t.querySelector(".tab-label")!.textContent);

  it("gives a collective a tab only once you have asked to join it", async () => {
    let app = await render();
    expect(tabLabels(app)).toEqual(["Home", "Places"]);
    profile.memberOf = [COLLECTIVE.group];
    app = await render();
    expect(tabLabels(app)).toEqual(["Home", "HyperScope", "Places"]);
  });

  it("keeps sharing and leaving on the collective's tab, joining on home", async () => {
    profile.inbox = POD + "inbox/";
    profile.memberOf = [COLLECTIVE.group];
    listed = true;
    const home = await render();
    expect(home.querySelector("#publish-0")).toBeNull();
    expect(home.querySelector(`a[href="${tab(COLLECTIVE)}"]`)).not.toBeNull();
    const member = await render(tab(COLLECTIVE));
    expect(member.querySelector("[data-view-title]")!.textContent).toBe("HyperScope");
    expect(member.querySelector("#publish-0")).not.toBeNull();
    expect(member.querySelector("#leave-0")).not.toBeNull();
  });

  it("shows a member the roster, marking them, and the collective's agent", async () => {
    profile.memberOf = [COLLECTIVE.group];
    listed = true;
    const AMINA = "https://pod.example/amina/profile/card#me";
    rosterEntries = [{ webId: WEBID, nick: "neil" }, { webId: AMINA, nick: "amina" }];
    const app = await render(tab(COLLECTIVE));
    const roster = [...app.querySelectorAll(".roster li strong")].map((s) => s.textContent!.trim());
    expect(roster).toEqual(["Neil (you)", "amina"]);
    expect(app.textContent).toContain("Its roster lists you as neil.");
    expect(app.textContent).toContain(COLLECTIVE.agent);
  });

  it("tells someone who has asked that the roster opens once accepted, never that they were refused", async () => {
    profile.memberOf = [COLLECTIVE.group];
    listed = null;
    rosterEntries = null;
    const app = await render(tab(COLLECTIVE));
    expect(app.querySelector(".roster")).toBeNull();
    expect(app.textContent).toContain("once HyperScope accepts you");
    expect(app.textContent).not.toMatch(/refused/i);
  });

  it("goes home when the tab's collective is not one you belong to", async () => {
    const app = await render(tab(COLLECTIVE));
    expect(window.location.hash).toBe("#/");
    expect(app.querySelector("#join-0")).not.toBeNull();
  });

  it("opens the collective you run on its own tab, with its requests", async () => {
    runs = COLLECTIVE;
    const home = await render();
    expect(tabLabels(home)).toEqual(["Home", "HyperScope", "Places"]);
    const own = await render(tab(COLLECTIVE));
    expect(own.textContent).toContain("You run");
    expect(own.textContent).toContain("Members");
  });
});

describe("J1 — a new account comes back from the provider", () => {
  const newcomer = (webId: string) =>
    sessionStorage.setItem("solid-backoffice.newcomer", JSON.stringify({ webId, name: "Neil Armstrong" }));

  it("gets its inbox (in the button's order) and its name, once", async () => {
    profile.name = null;
    newcomer(WEBID);
    const app = await render();
    expect(calls).toEqual([`ensure ${POD}inbox/`, `acl ${POD}inbox/ authenticated append`, "profile edit", "profile edit"]);
    expect(sessionStorage.getItem("solid-backoffice.newcomer")).toBeNull();
    expect(app.querySelector("#join-0")).not.toBeNull();
    calls.length = 0;
    await render();
    expect(calls).toEqual([]);
  });

  it("writes nothing for a record left by another account", async () => {
    newcomer("https://pod.example/someone-else/profile/card#me");
    await render();
    expect(calls).toEqual([]);
    expect(sessionStorage.getItem("solid-backoffice.newcomer")).not.toBeNull();
  });
});
