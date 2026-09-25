import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The screen before sign-in: which mode comes first, the username following
 * the name, and the order sign-up → record for the home screen → sign-in.
 * The account API itself is tested in lib/css-account.test.ts and against CSS.
 */
const calls: string[] = [];
let refuse: { code: string; message: string; nothingCreated: boolean } | null = null;

vi.mock("./lib/auth", () => ({
  authFetch: vi.fn(),
  loginWithIdentifier: async (id: string) => void calls.push(`login ${id}`),
}));
vi.mock("./lib/css-account", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/css-account")>();
  return {
    ...actual,
    createAccount: async (issuer: string, input: { username: string; email: string }) => {
      calls.push(`create ${issuer} ${input.username} ${input.email}`);
      if (refuse) throw new actual.AccountError(refuse.code as never, refuse.message, refuse.nothingCreated);
      return { webId: `${issuer}${input.username}/profile/card#me`, pod: `${issuer}${input.username}/`, email: input.email };
    },
  };
});

const { renderWelcome } = await import("./signup");
const { setInvite } = await import("./invite");
const PROVIDER = "https://pod.example/";

function render(provider: string | null = PROVIDER): HTMLElement {
  const app = document.createElement("div");
  document.body.replaceChildren(app);
  renderWelcome(app, { provider });
  return app;
}

function type(app: HTMLElement, id: string, value: string): void {
  const input = app.querySelector<HTMLInputElement>(`#${id}`)!;
  input.value = value;
  input.dispatchEvent(new Event("input"));
}

function fill(app: HTMLElement): void {
  type(app, "name", "Zoé Durand");
  type(app, "email", "zoe@example.org");
  type(app, "password", "long-enough");
}

const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  calls.length = 0;
  refuse = null;
  sessionStorage.clear();
});

describe("before sign-in", () => {
  it("offers account creation first to someone arriving with an invitation", () => {
    setInvite("https://pod.example/hs/config.ttl");
    const app = render();
    expect(app.textContent).toContain("You're invited to join a collective");
    expect(app.textContent).toContain("pod.example");
    expect(app.querySelector("#signup-form")).not.toBeNull();
    expect(app.querySelector("#switch-mode")!.textContent).toBe("I already have a Solid account");
  });

  it("offers sign-in first otherwise, and account creation one click away", () => {
    const app = render();
    expect(app.querySelector("#login-form")).not.toBeNull();
    app.querySelector<HTMLButtonElement>("#switch-mode")!.click();
    expect(app.querySelector("#signup-form")).not.toBeNull();
  });

  it("offers no account creation when no provider is set", () => {
    setInvite("https://pod.example/hs/config.ttl");
    const app = render(null);
    expect(app.querySelector("#signup-form")).toBeNull();
    expect(app.querySelector("#switch-mode")).toBeNull();
  });

  it("suggests the username from the name, and shows the pod's address, until the person types one", () => {
    setInvite("https://pod.example/hs/config.ttl");
    const app = render();
    type(app, "name", "Zoé Durand");
    expect(app.querySelector<HTMLInputElement>("#username")!.value).toBe("zoe-durand");
    expect(app.querySelector("#pod-address")!.textContent).toBe("https://pod.example/zoe-durand/");
    type(app, "username", "zoe");
    type(app, "name", "Zoé D.");
    expect(app.querySelector<HTMLInputElement>("#username")!.value).toBe("zoe");
  });

  it("creates the account, leaves the name for the home screen, then signs in", async () => {
    setInvite("https://pod.example/hs/config.ttl");
    const app = render();
    fill(app);
    app.querySelector<HTMLFormElement>("#signup-form")!.requestSubmit();
    await tick();
    expect(calls).toEqual([`create ${PROVIDER} zoe-durand zoe@example.org`, `login ${PROVIDER}`]);
    expect(JSON.parse(sessionStorage.getItem("solid-backoffice.newcomer")!)).toEqual({
      webId: `${PROVIDER}zoe-durand/profile/card#me`,
      name: "Zoé Durand",
    });
  });

  it("refuses a bad field next to it, without calling the provider", async () => {
    setInvite("https://pod.example/hs/config.ttl");
    const app = render();
    fill(app);
    type(app, "password", "short");
    app.querySelector<HTMLFormElement>("#signup-form")!.requestSubmit();
    await tick();
    expect(calls).toEqual([]);
    expect(app.querySelector("#password-error")!.textContent).toMatch(/at least 8/);
  });

  it("shows a taken username on its field, and keeps the saved email and password", async () => {
    setInvite("https://pod.example/hs/config.ttl");
    refuse = { code: "username-taken", message: "This username is taken. Choose another one.", nothingCreated: false };
    const app = render();
    fill(app);
    app.querySelector<HTMLFormElement>("#signup-form")!.requestSubmit();
    await tick();
    expect(app.querySelector("#username-error")!.textContent).toContain("taken");
    expect(app.querySelector<HTMLInputElement>("#email")!.readOnly).toBe(true);
    expect(app.textContent).toContain("Your email and password are saved.");
    expect(calls).not.toContain(`login ${PROVIDER}`);
  });
});
