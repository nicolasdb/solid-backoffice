import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The "You run" screen: what it shows about each request and member, and
 * which lib call each button makes. The order of writes inside those calls is
 * pinned in lib/admin.test.ts.
 */
const calls: string[] = [];

vi.mock("./lib/auth", () => ({ authFetch: vi.fn() }));
vi.mock("./lib/admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/admin")>()),
  accept: async (_c: unknown, _o: string, m: { url: string }, _p: unknown, nick: string) => {
    calls.push(`accept ${m.url} ${nick}`);
    return { answered: true };
  },
  refuse: async (_c: unknown, _o: string, m: { url: string }) => {
    calls.push(`refuse ${m.url}`);
    return { answered: true };
  },
  removeMember: async (_c: unknown, _o: string, p: { webId: string }) => {
    calls.push(`remove ${p.webId}`);
    return { answered: true };
  },
  deleteMessage: async (url: string) => void calls.push(`delete ${url}`),
}));

const { sectionRun, bindRun } = await import("./admin");
type RunView = import("./admin").RunView;

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
const INES = "https://pod.example/ines/profile/card#me";
const AMINA = "https://pod.example/amina/profile/card#me";
const message = (over = {}) => ({
  url: POD + "inbox/j1", type: "Join" as const, rawType: null, actor: INES, object: COLLECTIVE.group,
  target: null, summary: null, published: null, problem: null, ...over,
});
const profile = (name: string, over = {}) => ({ name, memberOf: [COLLECTIVE.group], delegates: [], inbox: "https://x/inbox/", ...over });

let view: RunView;

beforeEach(() => {
  calls.length = 0;
  view = {
    collective: COLLECTIVE,
    owner: POD + "profile/card#me",
    requests: [{ message: message(), person: { webId: INES, profile: profile("Inès"), problem: null }, flags: [], listed: false, knownNick: null }],
    members: [{
      webId: AMINA, profile: profile("Amina"), problem: null, nick: "amina", state: "member",
      canReadRoster: true, announced: ["https://pod.example/amina/output2/hs/"],
    }],
    others: [message({ url: POD + "inbox/x", type: "other", actor: null, problem: "Not an activity: text/plain." })],
    inboxError: null,
    membersError: null,
  };
});

function render(): HTMLElement {
  const app = document.createElement("div");
  document.body.replaceChildren(app);
  app.innerHTML = sectionRun(view, "");
  bindRun(app, view, () => calls.push("rerender"));
  return app;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("You run", () => {
  it("shows a request with the requester's own declarations and a suggested short name", () => {
    const app = render();
    expect(app.textContent).toContain("Inès asks to join");
    expect(app.textContent).toContain("Profile says they belong to HyperScope: yes");
    expect(app.querySelector<HTMLInputElement>("#accept-0 input[name=nick]")!.value).toBe("ines");
  });

  it("accepts with the short name typed, then re-renders from the pods", async () => {
    const app = render();
    app.querySelector<HTMLInputElement>("#accept-0 input[name=nick]")!.value = "ines-b";
    app.querySelector<HTMLFormElement>("#accept-0")!.requestSubmit();
    await tick();
    expect(calls).toEqual([`accept ${POD}inbox/j1 ines-b`, "rerender"]);
  });

  it("refuses", async () => {
    const app = render();
    app.querySelector<HTMLButtonElement>("#refuse-0")!.click();
    await tick();
    expect(calls).toEqual([`refuse ${POD}inbox/j1`, "rerender"]);
  });

  it("shows flags, and keeps the short name a returning member already has", () => {
    view.requests[0] = { ...view.requests[0], flags: ["Their profile does not say they belong to HyperScope."], knownNick: "ines" };
    const app = render();
    expect(app.textContent).toContain("does not say they belong");
    expect(app.querySelector<HTMLInputElement>("#accept-0 input[name=nick]")!.readOnly).toBe(true);
  });

  it("lists members with their state and announcements, and asks before removing", async () => {
    const app = render();
    expect(app.textContent).toContain("Member: both sides agree.");
    expect(app.textContent).toContain("only their pod can confirm");
    const remove = app.querySelector<HTMLButtonElement>("[data-remove='0']")!;
    remove.click();
    await tick();
    expect(calls).toEqual([]);
    expect(remove.textContent).toBe("Yes, remove Amina");
    remove.click();
    await tick();
    expect(calls).toEqual([`remove ${AMINA}`, "rerender"]);
  });

  it("offers to finish an acceptance when a member cannot read the roster", () => {
    view.members[0] = { ...view.members[0], canReadRoster: false };
    const app = render();
    expect(app.querySelector("[data-grant='0']")).not.toBeNull();
  });

  it("keeps messages it does not understand visible, and deletable", async () => {
    const app = render();
    expect(app.textContent).toContain("Not an activity: text/plain.");
    app.querySelector<HTMLButtonElement>("[data-delete='0']")!.click();
    await tick();
    expect(calls).toEqual([`delete ${POD}inbox/x`, "rerender"]);
  });

  it("says what could not be read instead of showing an empty list", () => {
    view = { ...view, requests: [], members: [], inboxError: "Could not read the inbox (403).", membersError: "Could not read the roster (403)." };
    const app = render();
    expect(app.textContent).toContain("Could not read the inbox (403).");
    expect(app.textContent).toContain("members: could not be read");
  });
});
