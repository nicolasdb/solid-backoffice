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

const { renderRunView, bindRun } = await import("./admin");
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
  app.innerHTML = renderRunView(view);
  bindRun(app, view, () => calls.push("rerender"));
  return app;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("You run", () => {
  it("shows a request with the requester's own declarations and a suggested short name", () => {
    const app = render();
    expect(app.textContent).toContain("Inès asks to join");
    expect(app.textContent).toContain("Profile says they belong to HyperScope");
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
    expect(app.querySelector("[data-member] code")!.textContent).toBe("output2/hs/");
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

  it("puts the name, the invitation link and the counts in the header", () => {
    const app = render();
    const head = app.querySelector(".run-head")!;
    expect(head.querySelector("h1")!.textContent).toBe("HyperScope");
    expect(head.textContent).toContain(`?collective=${COLLECTIVE.configUrl}`);
    expect(head.textContent).toContain("1 request");
    expect(head.textContent).toContain("1 member");
  });

  it("copies the invitation link when it is clicked", async () => {
    let copied = "";
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (t: string) => void (copied = t) }, configurable: true });
    render().querySelector<HTMLButtonElement>(".run-head [data-copy]")!.click();
    await tick();
    expect(copied).toContain(`?collective=${COLLECTIVE.configUrl}`);
  });

  it("copies a member's whole WebID from the members table, like the invitation link", async () => {
    let copied = "";
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (t: string) => void (copied = t) }, configurable: true });
    render().querySelector<HTMLButtonElement>("[data-member] [data-copy]")!.click();
    await tick();
    expect(copied).toBe(AMINA);
  });

  it("gives the invitation link on localhost too, saying it works only on this computer", () => {
    const head = render().querySelector(".run-head")!;
    expect(head.querySelector<HTMLElement>("[data-copy]")!.dataset.copy).toContain(`?collective=${COLLECTIVE.configUrl}`);
    expect(head.textContent).toContain("works only on this computer");
  });

  it("gives the invitation link to copy once served online, with no local note", () => {
    const real = window.location;
    Object.defineProperty(window, "location", { value: new URL("https://test.example/"), configurable: true });
    try {
      const head = render().querySelector(".run-head")!;
      const copy = head.querySelectorAll<HTMLElement>("[data-copy]");
      expect(copy.length).toBe(1);
      expect(copy[0].dataset.copy).toBe(`https://test.example/?collective=${COLLECTIVE.configUrl}`);
      expect(head.textContent).not.toContain("only on this computer");
      expect(new URL(copy[0].dataset.copy!).searchParams.get("collective")).toBe(COLLECTIVE.configUrl);
    } finally {
      Object.defineProperty(window, "location", { value: real, configurable: true });
    }
  });

  it("filters the members on screen by name, short name or address", () => {
    view.members.push({ ...view.members[0], webId: INES, profile: profile("Inès"), nick: "ines", announced: [] });
    const app = render();
    const find = app.querySelector<HTMLInputElement>("#find-member")!;
    const visible = () => [...app.querySelectorAll<HTMLElement>("[data-member]")].filter((r) => !r.hidden).map((r) => r.querySelector("strong")!.textContent);

    find.value = "amin";
    find.dispatchEvent(new Event("input"));
    expect(visible()).toEqual(["Amina"]);

    find.value = "pod.example";
    find.dispatchEvent(new Event("input"));
    expect(visible()).toEqual([]);

    find.value = "/ines/";
    find.dispatchEvent(new Event("input"));
    expect(visible()).toEqual(["Inès"]);

    find.value = "nobody";
    find.dispatchEvent(new Event("input"));
    expect(visible()).toEqual([]);
    expect(app.querySelector<HTMLElement>("#find-none")!.hidden).toBe(false);
  });

  it("jumps between sections with buttons, leaving the address to the router", () => {
    const app = render();
    const before = location.hash;
    const chips = [...app.querySelectorAll<HTMLButtonElement>("[data-jump]")];
    expect(chips.map((c) => c.textContent!.replace(/\s+/g, " ").trim())).toEqual(["Requests 1", "Members 1", "Other 1"]);
    Element.prototype.scrollIntoView = () => {};
    chips[1].click();
    expect(document.activeElement!.id).toBe("run-members");
    expect(location.hash).toBe(before);
  });
});
