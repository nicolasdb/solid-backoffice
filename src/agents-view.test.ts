// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://test.nicolasdb.eu/"}
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The agents section on You (slice D), against a mocked provider: what it
 * says when the server offers no agents or only to its own site (ADR 010),
 * the way back when the account session has ended (no password here), each
 * agent with its connector and folders, and the drawer's steps.
 * The writes themselves are pinned in src/lib/agents.test.ts.
 */
const POD = "https://pod.nicolasdb.eu/amina/";
const ME = POD + "profile/card#me";
const CLAUDE = POD + "profile/claude#me";

const lib = vi.hoisted(() => ({
  ended: false,
  connectorsDown: false,
  calls: [] as string[],
  descriptor: null as unknown,
}));
const OVERLAY = { layout: "suffix", capabilities: { account: { path: "/.account/" }, onboard: { path: "/onboard/" } } };

vi.mock("./lib/auth", () => ({
  discoverOidcIssuer: async () => "https://pod.nicolasdb.eu/",
}));
vi.mock("./lib/provider", async (original) => {
  const real = await original<typeof import("./lib/provider")>();
  return {
    ...real,
    readDescriptor: async (issuer: string) => (lib.descriptor ? real.parseDescriptor(issuer, lib.descriptor) : null),
  };
});

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
    listConnectors: async () => {
      if (lib.connectorsDown) throw new real.AccountSessionError("provider", "The connector service did not answer this site.");
      return [];
    },
    walkRules: async () => ({
      complete: true,
      folders: [
        { url: POD, depth: 0, own: null },
        { url: POD + "notes/", depth: 1, own: { agents: [{ webId: CLAUDE, modes: ["read"] }], public: [], authenticated: [], unknown: [], folderOnly: [], aclUrl: "", etag: null, inherited: false } },
        { url: POD + "profile/", depth: 1, own: null },
        { url: POD + "projects/", depth: 1, own: null },
      ],
    }),
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
  document.body.innerHTML = `<div id="app">${view.agentsSlot()}</div>`;
  const app = document.getElementById("app")!;
  view.mountAgents(app, { webId: ME, podUrl: POD, profile, rerender: () => view.mountAgents(app, { webId: ME, podUrl: POD, profile, rerender: () => undefined }) });
  await vi.waitFor(() => expect(app.textContent).not.toMatch(/Reading your agents|^\s*Your agents[^]*An agent is a WebID[^.]*\.\s*$/));
  return app;
}

beforeEach(() => {
  view.forgetAgents();
  lib.ended = false;
  lib.connectorsDown = false;
  lib.calls = [];
  lib.descriptor = OVERLAY;
});

describe("your agents on You", () => {
  it("says the provider does not offer agents when it has no descriptor, and calls no account", async () => {
    lib.descriptor = null;
    const app = await mount();
    expect(app.textContent).toContain("Your provider does not offer agents. Servers running solid-css-overlay do.");
    expect(app.querySelector("#agent-new")).toBeNull();
  });

  it("offers agents without a connector, and then no Connect to AI", async () => {
    lib.descriptor = { capabilities: { account: { path: "/.account/" } } };
    const app = await mount();
    expect(app.querySelector("[data-agent]")).not.toBeNull();
    expect(app.querySelector("[data-agent-connect]")).toBeNull();
    expect(app.textContent).toContain("does not run a connector");
    expect(app.textContent).not.toContain("unknown");
  });

  it("names a pod by its folder or by its subdomain", () => {
    expect(view.podName("https://pod.nicolasdb.eu/amina/")).toBe("amina");
    expect(view.podName("https://amina.pod.mapsofmaking.org/")).toBe("amina");
  });

  it("shows each agent as on the canvas: who, whether an AI can use it, how much it reaches, the next step", async () => {
    const app = await mount();
    const cards = app.querySelectorAll("[data-agent]");
    expect(cards).toHaveLength(1);
    const card = cards[0] as HTMLElement;
    expect(card.querySelector(".agent-foot")!.textContent).toContain("Acts for you");
    expect(card.querySelector(".agent-foot")!.textContent).toContain("profile/claude#me");
    expect(card.querySelector(".agent-status")!.textContent).toContain("Not connected yet");
    expect(card.querySelector(".agent-summary")!.textContent).toBe("Can read 1 folder, once connected.");
    // The folders themselves are one level down, in Choose folders.
    expect(card.textContent).not.toContain("notes/");
    expect(card.querySelector<HTMLButtonElement>("[data-agent-connect]")!.className).not.toContain("ghost");
    expect(card.querySelector('[aria-current="step"]')!.textContent).toContain("Connect to AI");
    expect(app.textContent).toContain("on your pod: 4 folders");
  });

  it("counts what an agent reaches, and says when it was used", () => {
    const r = (modes: string[]) => ({ url: "x", modes: modes as never });
    expect(view.reachSummary([r(["read", "append", "write"]), r(["read"])])).toBe("Can edit 1 folder and read 1, with what is inside them.");
    expect(view.reachSummary([r(["read"]), r(["read"])])).toBe("Can read 2 folders, with what is inside them.");
    const now = new Date("2026-09-27T12:00:00Z");
    expect(view.ago("2026-09-27T10:00:00Z", now)).toBe("2 h ago");
    expect(view.ago("2026-09-27T11:59:30Z", now)).toBe("just now");
    expect(view.shortDate("2026-09-23T08:00:00Z", now)).toBe("23 Sep");
  });

  it("still offers Connect to AI when the connectors cannot be read, and says why", async () => {
    lib.connectorsDown = true;
    const app = await mount();
    const card = app.querySelector<HTMLElement>("[data-agent]")!;
    expect(card.textContent).toContain("unknown right now");
    expect(card.querySelector("[data-agent-connect]")).not.toBeNull();
    expect(app.textContent).toContain("did not answer this site");
    card.querySelector<HTMLButtonElement>("[data-agent-menu]")!.click();
    expect(app.querySelector(".agent-menu [data-agent-connect]")).not.toBeNull();
  });

  it("closes the ··· menu on a click elsewhere or Escape", async () => {
    const app = await mount();
    app.querySelector<HTMLButtonElement>("[data-agent-menu]")!.click();
    expect(app.querySelector(".agent-menu")).not.toBeNull();
    app.querySelector<HTMLElement>("#agent-menu-scrim")!.click();
    expect(app.querySelector(".agent-menu")).toBeNull();
    app.querySelector<HTMLButtonElement>("[data-agent-menu]")!.click();
    app.querySelector(".agent-menu")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(app.querySelector(".agent-menu")).toBeNull();
    expect(document.activeElement).toBe(app.querySelector("[data-agent-menu]"));
  });

  it("sends you to the provider's own page when the account session has ended, never asks for a password", async () => {
    lib.ended = true;
    const app = await mount();
    expect(app.querySelector("input[type=password]")).toBeNull();
    const link = app.querySelector<HTMLAnchorElement>('a[href="https://pod.nicolasdb.eu/.account/"]')!;
    expect(link.target).toBe("_blank");
    lib.ended = false;
    app.querySelector<HTMLButtonElement>("#agents-retry")!.click();
    await vi.waitFor(() => expect(app.querySelector("[data-agent]")).not.toBeNull());
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
