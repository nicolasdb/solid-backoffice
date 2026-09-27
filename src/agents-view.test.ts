// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The agents section on You (slice D), against a mocked provider: shown only
 * for our provider's WebIDs, the unlock form when the account session has
 * ended, each agent with its connector and folders, and the drawer's steps.
 * The writes themselves are pinned in src/lib/agents.test.ts.
 */
const POD = "https://pod.nicolasdb.eu/amina/";
const ME = POD + "profile/card#me";
const CLAUDE = POD + "profile/claude#me";

const lib = vi.hoisted(() => ({
  ended: false,
  calls: [] as string[],
}));

vi.mock("./lib/agents", async (original) => {
  const real = await original<typeof import("./lib/agents")>();
  return {
    ...real,
    linkedWebIds: async () => {
      if (lib.ended) throw new real.AccountSessionError("ended", "ended");
      return [
        { webId: ME, resource: "r0" },
        { webId: CLAUDE, resource: "r1" },
      ];
    },
    listConnectors: async () => [],
    walkRules: async () => ({
      complete: true,
      folders: [
        { url: POD, depth: 0, own: null },
        { url: POD + "notes/", depth: 1, own: { agents: [{ webId: CLAUDE, modes: ["read"] }], public: [], authenticated: [], unknown: [], folderOnly: [], aclUrl: "", etag: null, inherited: false } },
        { url: POD + "profile/", depth: 1, own: null },
        { url: POD + "projects/", depth: 1, own: null },
      ],
    }),
    unlockWithPassword: async () => {
      lib.ended = false;
      lib.calls.push("unlock");
      return { issuer: "https://pod.nicolasdb.eu/", token: "t" };
    },
    connectAgent: async () => {
      lib.calls.push("mint");
      return "https://solid-mcp.nicolasdb.eu/mcp/secret-slug";
    },
  };
});
vi.mock("./lib/read", () => ({
  readTurtle: async () => new Response('<#me> <http://xmlns.com/foaf/0.1/name> "Claude".', { status: 200 }),
  forgetReads: () => undefined,
}));

const view = await import("./agents-view");
const profile = { name: "Amina", delegates: [CLAUDE], memberOf: [], inbox: null } as never;

async function mount(): Promise<HTMLElement> {
  document.body.innerHTML = `<div id="app">${view.agentsSlot(ME)}</div>`;
  const app = document.getElementById("app")!;
  view.mountAgents(app, { webId: ME, podUrl: POD, profile, rerender: () => view.mountAgents(app, { webId: ME, podUrl: POD, profile, rerender: () => undefined }) });
  await vi.waitFor(() => expect(app.textContent).not.toContain("Reading your agents"));
  return app;
}

beforeEach(() => {
  view.forgetAgents();
  lib.ended = false;
  lib.calls = [];
});

describe("your agents on You", () => {
  it("is not there for a WebID from another provider", () => {
    expect(view.agentsSlot("https://elsewhere.example/me/profile/card#me")).toBe("");
    expect(view.onProvider(ME)).toBe(true);
  });

  it("lists each agent with its connector and the folders it reaches, not your own WebID", async () => {
    const app = await mount();
    const cards = app.querySelectorAll("[data-agent]");
    expect(cards).toHaveLength(1);
    const card = cards[0] as HTMLElement;
    expect(card.textContent).toContain("Claude");
    expect(card.textContent).toContain("No connector");
    expect(card.querySelector(".reach")!.textContent).toContain("notes/");
    expect(card.textContent).toContain("may act for you");
    expect(card.querySelector("[data-agent-connect]")).not.toBeNull();
    expect(app.textContent).toContain("on your pod: 4 folders");
  });

  it("asks for the password when the account session has ended, and reads again once open", async () => {
    lib.ended = true;
    const app = await mount();
    const form = app.querySelector<HTMLFormElement>("#agents-unlock")!;
    expect(form).not.toBeNull();
    (form.elements.namedItem("email") as HTMLInputElement).value = "amina@example.org";
    (form.elements.namedItem("password") as HTMLInputElement).value = "secret";
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    await vi.waitFor(() => expect(app.querySelector("[data-agent]")).not.toBeNull());
    expect(lib.calls).toEqual(["unlock"]);
  });

  it("opens the drawer on its first step, with 'may act for me' ticked", async () => {
    const app = await mount();
    app.querySelector<HTMLButtonElement>("#agent-new")!.click();
    const drawer = app.querySelector("#agent-drawer")!;
    expect(drawer.querySelector('[aria-current="step"]')!.textContent).toContain("Name it");
    expect(drawer.querySelector<HTMLInputElement>('input[name="delegate"]')!.checked).toBe(true);
    const name = drawer.querySelector<HTMLInputElement>("#agent-name")!;
    name.value = "Card";
    name.dispatchEvent(new Event("input"));
    expect(drawer.querySelector("#agent-address code")!.textContent).toBe("…/amina/profile/card-agent#me");
  });

  it("shows the connector URL once, then offers the folders, never profile/", async () => {
    const app = await mount();
    app.querySelector<HTMLButtonElement>("[data-agent-connect]")!.click();
    expect(app.querySelector('[aria-current="step"]')!.textContent).toContain("Connect to AI");
    app.querySelector<HTMLButtonElement>("#agent-mint")!.click();
    await vi.waitFor(() => expect(app.querySelector(".urlbox")).not.toBeNull());
    expect(app.querySelector(".urlbox")!.textContent).toContain("secret-slug");
    app.querySelector<HTMLButtonElement>("[data-agent-step]")!.click();
    const rows = [...app.querySelectorAll<HTMLInputElement>("input[name=folder]")].map((b) => [b.value, b.checked]);
    expect(rows).toEqual([
      [POD + "notes/", true],
      [POD + "projects/", false],
    ]);
    // Closed: the URL is gone for good.
    app.querySelector<HTMLButtonElement>("#agent-close")!.click();
    expect(app.textContent).not.toContain("secret-slug");
  });
});
