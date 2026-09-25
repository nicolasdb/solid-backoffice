/**
 * Before sign-in: sign in, or create an account on our provider (journey J1).
 *
 * Replaces the kit's login view. Two modes, one primary action each: someone
 * who arrives through an invitation most likely has no account, so they see
 * "Create an account" first; anyone else sees the sign-in form first. The
 * other mode is one click away.
 *
 * Account creation is the CSS account API (`lib/css-account.ts`), which only
 * our provider has: with no `provider` the screen is the plain sign-in form.
 * Everything after the account exists is ordinary Solid: the provider's own
 * page signs the person in, and the home screen sets their name and inbox from
 * the record left here (`invite.ts`).
 */
import { loginWithIdentifier } from "./lib/auth";
import { AccountError, createAccount, emailProblem, passwordProblem, podAddress, usernameProblem } from "./lib/css-account";
import { slugify } from "./lib/pod";
import { APP_NAME, DEFAULT_IDENTIFIER } from "./config";
import { pendingInvite, rememberNewcomer } from "./invite";
import { esc } from "./ui/patterns";
import { focusView } from "./ui/a11y";

export interface WelcomeOptions {
  /** Where accounts are created; null hides account creation. */
  provider: string | null;
  message?: string;
  mode?: "signin" | "signup";
}

/** The host an invitation points to, or null when there is none, or it is not an address. */
function invitationHost(): string | null {
  const address = pendingInvite();
  if (!address) return null;
  try {
    return new URL(address).host;
  } catch {
    return null;
  }
}

export function renderWelcome(app: HTMLElement, options: WelcomeOptions): void {
  const { provider, message } = options;
  const host = invitationHost();
  const mode = provider ? options.mode ?? (host ? "signup" : "signin") : "signin";

  const heading = host ? "You're invited to join a collective" : APP_NAME;
  const intro = host
    ? `<p class="lead">
         The invitation comes from <code>${esc(host)}</code>. Your work stays in
         a pod of your own; the collective only reads what you choose to share.
       </p>`
    : "";

  app.innerHTML = `
    <main class="screen stack">
      <h1 data-view-title>${esc(heading)}</h1>
      ${intro}
      ${mode === "signup" && provider ? signUpForm(provider) : signInForm()}
      ${message ? `<p class="error">${esc(message)}</p>` : ""}
      ${
        provider
          ? `<p><button id="switch-mode" class="ghost" type="button">${
              mode === "signup" ? "I already have a Solid account" : "Create an account"
            }</button></p>`
          : ""
      }
    </main>`;

  app.querySelector("#switch-mode")?.addEventListener("click", () =>
    renderWelcome(app, { provider, mode: mode === "signup" ? "signin" : "signup" })
  );
  if (mode === "signup" && provider) bindSignUp(app, provider);
  else bindSignIn(app, options);
  focusView(app);
}

/* ── Sign in ───────────────────────────────────────────────────────────── */

function signInForm(): string {
  return `
    <p class="lead">
      Sign in with your pod's address, or with your WebID if you don't know
      which provider hosts it — it will be discovered from your profile.
    </p>
    <form id="login-form" class="stack">
      <div class="field">
        <label for="identifier">Pod or WebID</label>
        <input id="identifier" name="identifier" type="url"
               value="${esc(DEFAULT_IDENTIFIER)}" required />
      </div>
      <div><button type="submit">Sign in</button></div>
    </form>`;
}

function bindSignIn(app: HTMLElement, options: WelcomeOptions): void {
  const form = app.querySelector<HTMLFormElement>("#login-form")!;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = form.querySelector<HTMLInputElement>("#identifier")!;
    const button = form.querySelector("button")!;
    button.disabled = true;
    button.textContent = "Redirecting…";
    try {
      await loginWithIdentifier(input.value.trim());
    } catch (err) {
      renderWelcome(app, { ...options, mode: "signin", message: err instanceof Error ? err.message : String(err) });
    }
  });
}

/* ── Create an account ─────────────────────────────────────────────────── */

const FIELDS = ["name", "username", "email", "password", "confirm"] as const;
type Field = (typeof FIELDS)[number];

const FIELD_OF: Record<string, Field | null> = {
  "bad-username": "username",
  "username-taken": "username",
  "bad-email": "email",
  "email-taken": "email",
  "bad-password": "password",
  provider: null,
};

function signUpForm(provider: string): string {
  const field = (id: Field, label: string, input: string, hint = "") => `
    <div class="field">
      <label for="${id}">${label}</label>
      ${input}
      ${hint}
      <p class="error" id="${id}-error" role="alert" hidden></p>
    </div>`;
  return `
    <p class="lead">An account on <code>${esc(new URL(provider).host)}</code>, with a pod of your own.</p>
    <form id="signup-form" class="stack" novalidate>
      ${field("name", "Your name", `<input id="name" name="name" type="text" autocomplete="name" required />`,
        `<p class="meta">Shown next to your work, in the collectives you join.</p>`)}
      ${field("username", "Username",
        `<input id="username" name="username" type="text" autocomplete="username"
                autocapitalize="none" spellcheck="false" required />`,
        `<p class="meta">Your pod's address: <code id="pod-address">${esc(podAddress(provider, "…"))}</code></p>`)}
      ${field("email", "Email", `<input id="email" name="email" type="email" autocomplete="email" required />`)}
      ${field("password", `Set a passphrase <span class="meta">— a regular password still works</span>`,
        `<input id="password" name="password" type="password" autocomplete="new-password"
                placeholder="four random words you'll remember" required />`,
        `<p class="meta">A passphrase, like <code>correct-horse-battery-staple</code>, is easier to
           remember and far harder to guess than a short password. Length beats symbols.
           At least 8 characters.</p>`)}
      ${field("confirm", "Type it again",
        `<input id="confirm" name="confirm" type="password" autocomplete="new-password" required />`)}
      <div><button type="submit">Create my account</button></div>
      <p class="meta">
        Next, your provider's page asks for this email and passphrase once, to
        sign you in. There is no way to recover it if you lose it, so keep it
        somewhere safe.
      </p>
      <p class="error" id="signup-error" role="alert" hidden></p>
    </form>`;
}

function bindSignUp(app: HTMLElement, provider: string): void {
  const form = app.querySelector<HTMLFormElement>("#signup-form")!;
  const input = (id: Field) => form.querySelector<HTMLInputElement>(`#${id}`)!;
  const address = form.querySelector<HTMLElement>("#pod-address")!;
  const showAddress = () => (address.textContent = podAddress(provider, input("username").value.trim() || "…"));

  // The username follows the name until the person types one of their own.
  let usernameEdited = false;
  input("name").addEventListener("input", () => {
    if (usernameEdited) return;
    input("username").value = slugify(input("name").value, "").slice(0, 40).replace(/-$/, "");
    showAddress();
  });
  input("username").addEventListener("input", () => {
    usernameEdited = true;
    showAddress();
  });

  const say = (id: Field | "signup", text: string | null) => {
    const line = form.querySelector<HTMLElement>(`#${id}-error`)!;
    line.textContent = text ?? "";
    line.hidden = !text;
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(FIELDS.map((f) => [f, input(f).value.trim()])) as Record<Field, string>;
    values.password = input("password").value;
    values.confirm = input("confirm").value;
    const locked = input("email").readOnly;
    const problems: Record<Field, string | null> = {
      name: values.name ? null : "Write the name people know you by.",
      username: usernameProblem(values.username),
      email: locked ? null : emailProblem(values.email),
      password: locked ? null : passwordProblem(values.password),
      confirm: locked || values.confirm === values.password ? null : "The two do not match.",
    };
    FIELDS.forEach((f) => say(f, problems[f]));
    say("signup", null);
    const first = FIELDS.find((f) => problems[f]);
    if (first) {
      input(first).focus();
      return;
    }

    const button = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
    button.disabled = true;
    button.textContent = "Creating your account…";
    let created = false;
    try {
      const made = await createAccount(provider, values);
      created = true;
      rememberNewcomer({ webId: made.webId, name: values.name });
      button.textContent = "Redirecting…";
      await loginWithIdentifier(provider);
    } catch (err) {
      if (created) {
        const reason = err instanceof Error ? err.message : String(err);
        renderWelcome(app, {
          provider,
          mode: "signin",
          message: `Your account is ready, but the sign-in did not start: ${reason} Sign in with your email and password.`,
        });
        return;
      }
      button.disabled = false;
      button.textContent = "Create my account";
      if (!(err instanceof AccountError)) {
        say("signup", `${err instanceof Error ? err.message : String(err)} Nothing was lost; try again.`);
        return;
      }
      const field = FIELD_OF[err.code];
      if (field) {
        say(field, err.message);
        input(field).focus();
      } else {
        say("signup", err.message);
      }
      if (err.nothingCreated) return;
      // The provider holds a login already: a retry only changes what failed.
      if (err.code === "username-taken") {
        input("email").readOnly = true;
        input("password").readOnly = true;
        input("confirm").readOnly = true;
        say("signup", "Your email and passphrase are saved. Choose another username to finish.");
      }
    }
  });
}
