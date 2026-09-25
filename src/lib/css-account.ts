/**
 * Creating an account and a pod on our provider, through the Community Solid
 * Server account API (`/.account/`).
 *
 * PROVIDER-SPECIFIC. None of this is Solid protocol: another provider has no
 * such API, so the screen only offers it when `SIGNUP_PROVIDER` is set. The
 * steps and field names were first recorded in the old backoffice
 * (`pocpod0/backoffice/pod-api.js`, `registerAccount`) and are exercised
 * against a real CSS 7 by `npm run test:pods`, which builds its whole cast
 * with this function.
 *
 * Two things about the API shape the code:
 *
 * - An empty pod name is not an error to CSS: it means "claim the server
 *   root". The name is checked here before any request is made.
 * - Creating an account is not idempotent: every `account.create` makes a new
 *   one. A step that fails later (email already used, name already taken)
 *   is retried on the SAME account, which this module remembers for the life
 *   of the page. So a retry never leaves a second, half-built account.
 *
 * Plain `fetch`, never `authFetch`: nobody is signed in yet.
 */

export type AccountErrorCode =
  | "bad-username"
  | "username-taken"
  | "bad-email"
  | "email-taken"
  | "bad-password"
  | "provider";

export class AccountError extends Error {
  readonly code: AccountErrorCode;
  /** True when nothing exists on the provider yet because of this attempt. */
  readonly nothingCreated: boolean;
  constructor(code: AccountErrorCode, message: string, nothingCreated = false) {
    super(message);
    this.name = "AccountError";
    this.code = code;
    this.nothingCreated = nothingCreated;
  }
}

export interface SignUp {
  username: string;
  email: string;
  password: string;
}

export interface NewAccount {
  webId: string;
  pod: string;
  /** The email the account signs in with: the first one the provider accepted. */
  email: string;
}

const USERNAME = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function usernameProblem(username: string): string | null {
  if (!username) return "Choose a username: it becomes your pod's address.";
  if (username.length < 2) return "A username has at least 2 characters.";
  if (username.length > 40) return "A username has at most 40 characters.";
  if (!USERNAME.test(username)) {
    return "Use lowercase letters, digits and hyphens, not at the start or the end.";
  }
  return null;
}

export function emailProblem(email: string): string | null {
  return EMAIL.test(email) ? null : "That does not look like an email address.";
}

export function passwordProblem(password: string): string | null {
  return password.length >= 8 ? null : "Use at least 8 characters.";
}

/** Where the pod will live: shown under the username field. */
export function podAddress(issuer: string, username: string): string {
  return new URL(`${username}/`, issuer).href;
}

/** One registration in progress, so a retry resumes it instead of starting over. */
interface Pending {
  issuer: string;
  token: string;
  /** Set once the provider accepted a password login: the email it holds. */
  email: string | null;
}
let pending: Pending | null = null;

/** Forget a registration in progress. Tests, and nothing else. */
export function resetPendingSignUp(): void {
  pending = null;
}

async function problem(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const body = JSON.parse(text);
    if (typeof body?.message === "string") return body.message;
  } catch {
    /* not JSON: use the text */
  }
  return text.slice(0, 200) || `status ${res.status}`;
}

/**
 * Account → password login → pod, in that order.
 *
 * The password comes before the pod on purpose. If the pod step fails (the
 * name is taken), the account already has a login, and the retry picks
 * another name on the same account. The other order would leave a claimed
 * pod name with no way to sign in to it if the email step then failed.
 */
export async function createAccount(
  issuer: string,
  input: SignUp,
  fetchImpl: typeof fetch = (...args) => fetch(...args)
): Promise<NewAccount> {
  const username = input.username.trim();
  const email = input.email.trim();
  const fresh = !pending || pending.issuer !== issuer;
  // Once the provider holds a login, a retry only changes the username.
  const checks: [AccountErrorCode, string | null][] = [
    ["bad-username", usernameProblem(username)],
    ["bad-email", pending?.email ? null : emailProblem(email)],
    ["bad-password", pending?.email ? null : passwordProblem(input.password)],
  ];
  const invalid = checks.find(([, p]) => p);
  if (invalid) throw new AccountError(invalid[0], invalid[1]!, fresh);

  const accountIndex = new URL(".account/", issuer).href;
  const fail = async (res: Response, what: string) =>
    new AccountError("provider", `${what}: ${await problem(res)}`, fresh);

  if (fresh) {
    const index = await fetchImpl(accountIndex);
    if (!index.ok) throw await fail(index, "The provider's account service did not answer");
    const createUrl = (await index.json())?.controls?.account?.create;
    if (!createUrl) throw new AccountError("provider", "The provider does not offer account creation.", true);
    // `credentials: "include"` lets the provider set its own sign-in cookie,
    // which may spare the person typing their password again at sign-in.
    const created = await fetchImpl(createUrl, { method: "POST", credentials: "include" });
    if (!created.ok) throw await fail(created, "Could not create the account");
    const { authorization } = await created.json();
    if (!authorization) throw new AccountError("provider", "The provider created no account session.", true);
    pending = { issuer, token: authorization, email: null };
  }
  const state = pending!;
  const token = { Authorization: `CSS-Account-Token ${state.token}` };
  const json = { ...token, "Content-Type": "application/json" };
  const later = async (res: Response, what: string) =>
    new AccountError("provider", `${what}: ${await problem(res)}`);

  // A GET with a JSON content type and no body makes CSS 7 answer 500.
  const controlsRes = await fetchImpl(accountIndex, { headers: token });
  if (!controlsRes.ok) throw await later(controlsRes, "Could not open the new account");
  const controls = (await controlsRes.json())?.controls;
  if (!controls?.password?.create || !controls?.account?.pod) {
    throw new AccountError("provider", "The provider's account service is missing a step.");
  }

  if (!state.email) {
    const res = await fetchImpl(controls.password.create, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ email, password: input.password }),
    });
    if (!res.ok) {
      const message = await problem(res);
      throw /already|exist/i.test(message)
        ? new AccountError("email-taken", "An account already uses this email. Sign in instead, or use another one.")
        : new AccountError("provider", `Could not set the password: ${message}`);
    }
    state.email = email;
  }

  const res = await fetchImpl(controls.account.pod, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ name: username }),
  });
  if (!res.ok) {
    const message = await problem(res);
    throw /already|exist/i.test(message)
      ? new AccountError("username-taken", "This username is taken. Choose another one.")
      : new AccountError("provider", `Could not create the pod: ${message}`);
  }
  const { pod, webId } = await res.json();
  if (!pod || !webId) throw new AccountError("provider", "The provider created the pod but did not say where.");
  pending = null;
  return { webId, pod, email: state.email };
}
