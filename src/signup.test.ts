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
const { authFetch } = await import("./lib/auth");
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
  type(app, "confirm", "long-enough");
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
    expect(app.querySelector("#switch-mode")!.textContent).toBe("Sign in instead");
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

  it("refuses two passphrases that differ, without calling the provider", async () => {
    setInvite("https://pod.example/hs/config.ttl");
    const app = render();
    fill(app);
    type(app, "confirm", "long-enough-x");
    app.querySelector<HTMLFormElement>("#signup-form")!.requestSubmit();
    await tick();
    expect(calls).toEqual([]);
    expect(app.querySelector("#confirm-error")!.textContent).toMatch(/do not match/);
  });

  it("can show and hide the passphrase, both fields together", () => {
    setInvite("https://pod.example/hs/config.ttl");
    const app = render();
    const types = () => ["password", "confirm"].map((id) => app.querySelector<HTMLInputElement>(`#${id}`)!.type);
    expect(types()).toEqual(["password", "password"]);
    app.querySelector<HTMLButtonElement>("#reveal")!.click();
    expect(types()).toEqual(["text", "text"]);
    expect(app.querySelector("#reveal")!.textContent).toBe("Hide passphrase");
    app.querySelector<HTMLButtonElement>("#reveal")!.click();
    expect(types()).toEqual(["password", "password"]);
  });

  it("shows a taken username on its field, and keeps the saved email and passphrase", async () => {
    setInvite("https://pod.example/hs/config.ttl");
    refuse = { code: "username-taken", message: "This username is taken. Choose another one.", nothingCreated: false };
    const app = render();
    fill(app);
    app.querySelector<HTMLFormElement>("#signup-form")!.requestSubmit();
    await tick();
    expect(app.querySelector("#username-error")!.textContent).toContain("taken");
    expect(app.querySelector<HTMLInputElement>("#email")!.readOnly).toBe(true);
    expect(app.textContent).toContain("Your email and passphrase are saved.");
    expect(calls).not.toContain(`login ${PROVIDER}`);
  });
});

describe("the landing", () => {
  const CONFIG_URL = "https://pod.example/hs/config.ttl";
  const config = (extra = "") => `
    @prefix hs: <https://pod.nicolasdb.eu/hyperscope/vocab#> .
    @prefix foaf: <http://xmlns.com/foaf/0.1/> .
    @prefix ldp: <http://www.w3.org/ns/ldp#> .
    @prefix schema: <http://schema.org/> .
    <#hs> a hs:Collective ; foaf:name "HyperScope" ; hs:roster <membres.ttl> ;
      ldp:inbox <inbox/> ; hs:agent <agent#me> ; hs:bundleFolder "output2/hs/" ${extra} .`;
  const serve = (body: string | null) =>
    vi.mocked(authFetch).mockImplementation(async () =>
      body === null ? new Response("", { status: 401 }) : new Response(body, { status: 200 })
    );
  const settle = async () => {
    for (let i = 0; i < 5; i++) await tick();
  };

  it("explains the backoffice to someone who was not invited, and says joining starts with a link", () => {
    const app = render();
    expect(app.querySelector("h1")!.textContent).toBe("Your pod, and the collectives you belong to.");
    expect(app.textContent).toContain("Open the invitation link its people send you");
    expect(app.querySelector("#how")).not.toBeNull();
    expect(app.querySelector(".ladder")!.textContent).toContain("A COLLECTIVE");
  });

  it("names the collective and its folder once its config.ttl is read, keeping what was typed", async () => {
    serve(config());
    setInvite(CONFIG_URL + "?fresh=1");
    const app = render();
    type(app, "name", "Zoé");
    await settle();
    expect(app.querySelector(".invite-card")!.textContent).toContain("HyperScope");
    expect(app.textContent).toContain("HyperScope invited you.");
    expect(app.textContent).toContain("output2/hs/");
    expect(app.querySelector<HTMLInputElement>("#name")!.value).toBe("Zoé");
  });

  it("uses the collective's own slogan and description when it has them", async () => {
    serve(config('; schema:slogan "Look closer, together." ; schema:description "People who read slowly."'));
    setInvite(CONFIG_URL + "?fresh=2");
    const app = render();
    await settle();
    expect(app.querySelector("h1")!.textContent).toBe("Look closer, together.");
    expect(app.textContent).toContain("People who read slowly.");
  });

  it("keeps the backoffice's words and names the host when config.ttl cannot be read", async () => {
    serve(null);
    setInvite(CONFIG_URL + "?fresh=3");
    const app = render();
    await settle();
    expect(app.querySelector("h1")!.textContent).toBe("Your work stays yours.");
    expect(app.textContent).toContain("pod.example");
    expect(app.querySelector(".invite-card")).toBeNull();
  });
});
