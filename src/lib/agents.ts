/**
 * Your agents on our provider (slice D, docs/layout-brief-d.md): a WebID of
 * their own on your pod, at `profile/<name>#me`, linked to your account so a
 * connector can sign in as it, and granted the folders you choose.
 *
 * PROVIDER-SPECIFIC, like `css-account.ts`: the account API (`/.account/`)
 * and the connector (`/onboard/`) are Community Solid Server and pocpod0,
 * not Solid protocol. The screen offers none of this to a WebID from another
 * provider. The folder grants are plain WAC (`acl.ts`) and would work
 * anywhere; they live here because only an agent made here uses them.
 *
 * The account session is the provider's own cookie (`css-account`), set when
 * you signed in there, sent because the app and the provider are the same
 * site. When it has lapsed, your password opens a new one (a token kept in
 * memory only, never stored). The connector reads the cookie alone.
 *
 * Orders of writes (pinned in `agents.test.ts` and on CSS in
 * `test/pods/agents.test.ts`):
 *
 * - create: its document → public Read on it → read back anonymously → link
 *   it to the account (answering the ownership check with a token triple,
 *   then removing it). A failure undoes what was written and names the step.
 * - delete: revoke its connectors → remove it from the rules found → from
 *   your `acl:delegates` → unlink it → retire its document (kept without
 *   `solid:oidcIssuer`, so nobody signs in as it and its address is never
 *   given to another agent: the next one of that name gets `<name>-2`).
 */
import { authFetch } from "./auth";
import { getAccess, isValidWebId, readAccess, setAccess, setAgentAccess, type AgentGrant, type Mode, type ResourceAccess } from "./acl";
import { effectiveAccess, listFolder, parentOf } from "./files";
import { profileEdits, updateOwnProfile } from "./collective";
import { slugify } from "./pod";

/* ── The account session ───────────────────────────────────────────────── */

export interface AccountSession {
  issuer: string;
  /** A `CSS-Account-Token` from a password login; null means the cookie alone. */
  token: string | null;
}

export class AccountSessionError extends Error {
  /** "ended": sign in again, or unlock with the password. */
  readonly code: "ended" | "provider";
  constructor(code: "ended" | "provider", message: string) {
    super(message);
    this.name = "AccountSessionError";
    this.code = code;
  }
}

/** Plain fetch, never authFetch: the account API knows the account, not the WebID. Tests replace it. */
export const net: { fetch: typeof fetch } = { fetch: (...args) => fetch(...args) };

const ended = () =>
  new AccountSessionError("ended", "Your account session on the provider has ended.");

/** A request to the account API: the cookie always, the token when there is one. */
function account(session: AccountSession, url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (session.token) headers.set("Authorization", `CSS-Account-Token ${session.token}`);
  return net.fetch(url, { ...init, headers, credentials: "include" });
}

async function problem(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const body = JSON.parse(text);
    if (typeof body?.message === "string") return body.message;
    if (typeof body?.error === "string") return body.error;
  } catch {
    /* not JSON */
  }
  return text.slice(0, 300) || `status ${res.status}`;
}

interface Controls {
  webId: string;
  pod: string;
}

const known = new WeakMap<AccountSession, Controls>();

/**
 * The account's own addresses, from the index read with the session. A GET
 * with a content type makes CSS answer without `controls` (and CSS 7 answers
 * 500 to a JSON one with no body), so none is sent.
 */
async function controls(session: AccountSession): Promise<Controls> {
  const kept = known.get(session);
  if (kept) return kept;
  const res = await account(session, new URL(".account/", session.issuer).href);
  if (res.status === 401 || res.status === 403) throw ended();
  if (!res.ok) throw new AccountSessionError("provider", `The provider's account service answered ${res.status}.`);
  const body = await res.json().catch(() => null);
  const c = body?.controls?.account;
  // Without a session, the index answers 200 with no account controls.
  if (!c?.webId || !c?.pod) throw ended();
  const found = { webId: c.webId, pod: c.pod };
  known.set(session, found);
  return found;
}

/** The session the provider set at sign-in. Whether it is still open shows on the first call. */
export function cookieSession(issuer: string): AccountSession {
  return { issuer, token: null };
}

/** Opens a new account session with the password; the cookie comes back too. */
export async function unlockWithPassword(issuer: string, email: string, password: string): Promise<AccountSession> {
  const index = await net.fetch(new URL(".account/", issuer).href, { credentials: "include" });
  const login = (await index.json().catch(() => null))?.controls?.password?.login;
  if (!index.ok || !login) throw new AccountSessionError("provider", "The provider offers no password login.");
  const res = await net.fetch(login, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim(), password }),
  });
  if (!res.ok) {
    const message = await problem(res);
    throw new AccountSessionError(
      "provider",
      /invalid|incorrect|password|email/i.test(message) ? "That email and password do not match an account." : message
    );
  }
  const { authorization } = await res.json();
  return { issuer, token: authorization ?? null };
}

/** Whether the session is open: true, or throws why not. */
export async function checkSession(session: AccountSession): Promise<true> {
  await controls(session);
  return true;
}

/* ── Linked WebIDs ─────────────────────────────────────────────────────── */

export interface Link {
  webId: string;
  /** Where to DELETE to unlink. */
  resource: string;
}

/** The WebIDs linked to the account: `{webIdLinks: {<webId>: <resource>}}`. */
export async function linkedWebIds(session: AccountSession): Promise<Link[]> {
  const { webId: linkUrl } = await controls(session);
  const res = await account(session, linkUrl);
  if (res.status === 401) throw ended();
  if (!res.ok) throw new AccountSessionError("provider", `Could not list the account's WebIDs (${res.status}).`);
  const map = (await res.json())?.webIdLinks ?? {};
  return Object.entries(map).map(([webId, resource]) => ({ webId, resource: String(resource) }));
}

/** Agents are the linked WebIDs on this pod other than your own. Those the old app made in `agents/` count too. */
export function agentsOf(links: Link[], podUrl: string, owner: string): Link[] {
  return links.filter((l) => l.webId !== owner && l.webId.startsWith(podUrl));
}

/* ── Creating an agent ─────────────────────────────────────────────────── */

export type AgentStep = "document" | "public" | "check" | "link";

const STEP_WORDS: Record<AgentStep, string> = {
  document: "writing its document",
  public: "giving it public Read",
  check: "checking from outside that anyone can read it",
  link: "linking it to your account",
};

export class AgentCreateError extends Error {
  readonly step: AgentStep;
  /** False when undoing the steps before also failed: a document may be left over. */
  readonly cleanedUp: boolean;
  constructor(step: AgentStep, detail: string, cleanedUp: boolean, docUrl: string) {
    super(
      `Stopped while ${STEP_WORDS[step]}: ${detail}. ` +
        (cleanedUp ? "Nothing was left behind." : `Its document at ${docUrl} could not be removed; delete it in Pods.`)
    );
    this.name = "AgentCreateError";
    this.step = step;
    this.cleanedUp = cleanedUp;
  }
}

export const AGENT_NAME_MAX = 64;
/** Names `profile/` already uses, never given to an agent. */
const RESERVED = new Set(["card", "index", "settings"]);

export function agentNameProblem(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Give the agent a name, for example Claude.";
  if (trimmed.length > AGENT_NAME_MAX) return `A name has at most ${AGENT_NAME_MAX} characters.`;
  return null;
}

/** The address a name asks for: `profile/<slug>`; `card` and the like are taken by your own profile. */
export function agentSlug(name: string): string {
  const slug = slugify(name.trim(), "agent");
  return RESERVED.has(slug) ? `${slug}-agent` : slug;
}

/**
 * The first free document for `name` on the pod: `profile/claude`, then
 * `profile/claude-2`… A retired agent's document stays, so its address is
 * never handed to a new agent that would inherit rules the app never found.
 */
export async function freeAgentDoc(podUrl: string, name: string): Promise<string> {
  const slug = agentSlug(name);
  for (let n = 1; n < 100; n++) {
    const url = `${podUrl}profile/${n === 1 ? slug : `${slug}-${n}`}`;
    const res = await authFetch(url, { method: "HEAD" });
    if (res.status === 404) return url;
    if (!res.ok) throw new Error(`Could not check ${url} (${res.status}).`);
  }
  throw new Error("Too many agents of that name. Choose another name.");
}

function literal(value: string): string {
  return JSON.stringify(value);
}

/**
 * The agent's document: who it is and which provider signs it in, like CSS's
 * own `card`. `token` adds the ownership proof the link step asks for.
 */
export function agentDocument(issuer: string, name: string, token?: string): string {
  return [
    "@prefix solid: <http://www.w3.org/ns/solid/terms#>.",
    "@prefix foaf: <http://xmlns.com/foaf/0.1/>.",
    "",
    "<#me>",
    "    a foaf:Person;",
    `    solid:oidcIssuer <${issuer}>;`,
    // The validator compares a plain literal: no datatype, no language.
    ...(token ? [`    solid:oidcIssuerRegistrationToken ${literal(token)};`] : []),
    `    foaf:name ${literal(name.trim())}.`,
    "",
  ].join("\n");
}

/** A retired agent: its name kept, no issuer, so nobody can sign in as it. */
export function retiredDocument(name: string, on: string): string {
  return [
    "@prefix foaf: <http://xmlns.com/foaf/0.1/>.",
    "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>.",
    "",
    "<#me>",
    "    a foaf:Person;",
    `    foaf:name ${literal(name.trim())};`,
    `    rdfs:comment ${literal(`Retired on ${on}. This address no longer signs in, and is not given to another agent.`)}.`,
    "",
  ].join("\n");
}

/** CSS's ownership check says, in its message, which token triple it wants. */
export function ownershipToken(message: string): string | null {
  return /oidcIssuerRegistrationToken>?\s*"([0-9a-fA-F-]{36})"/.exec(message)?.[1] ?? null;
}

async function put(url: string, body: string, init: HeadersInit = {}): Promise<void> {
  const res = await authFetch(url, { method: "PUT", headers: { "Content-Type": "text/turtle", ...init }, body });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
}

export interface NewAgent {
  webId: string;
  name: string;
  link: Link;
}

/**
 * Creates an agent named `name` on `podUrl`, in four writes (see the top of
 * this file). `anonymous` reads the document with no credentials at all: a
 * server checking the agent's identity does exactly that.
 */
export async function createAgent(
  session: AccountSession,
  podUrl: string,
  owner: string,
  name: string,
  anonymous: typeof fetch = (url, init) => net.fetch(url, { ...init, credentials: "omit" })
): Promise<NewAgent> {
  const problemText = agentNameProblem(name);
  if (problemText) throw new Error(problemText);
  const { webId: linkUrl } = await controls(session);
  const doc = await freeAgentDoc(podUrl, name);
  const webId = `${doc}#me`;
  const issuer = session.issuer;

  let written = false;
  const fail = async (step: AgentStep, err: unknown): Promise<never> => {
    const detail = err instanceof Error ? err.message : String(err);
    let cleanedUp = true;
    if (written) {
      const res = await authFetch(doc, { method: "DELETE" }).catch(() => null);
      cleanedUp = Boolean(res && (res.ok || res.status === 404));
    }
    throw new AgentCreateError(step, detail, cleanedUp, doc);
  };

  try {
    // Create only: an agent's document is never written over.
    await put(doc, agentDocument(issuer, name), { "If-None-Match": "*" });
    written = true;
  } catch (err) {
    return fail("document", err);
  }

  try {
    await setAccess(doc, owner, { agents: [], public: ["read"], authenticated: [] }, null);
  } catch (err) {
    return fail("public", err);
  }

  try {
    const res = await anonymous(doc, { headers: { Accept: "text/turtle" } });
    if (!res.ok) throw new Error(`it answered ${res.status} to a reader who is not signed in`);
    if (!(await res.text()).includes("oidcIssuer")) throw new Error("it is readable but does not name its provider");
  } catch (err) {
    return fail("check", err);
  }

  let link: Link;
  try {
    const post = () =>
      account(session, linkUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webId }),
      });
    let res = await post();
    if (res.status === 401) throw ended();
    if (!res.ok) {
      // One root storage (our provider, and CSS's default): the account is
      // never the creator of the WebID's storage, so CSS asks for proof.
      const message = await problem(res);
      const token = ownershipToken(message);
      if (!token) throw new Error(message);
      await put(doc, agentDocument(issuer, name, token));
      res = await post();
      if (!res.ok) throw new Error(await problem(res));
      // Linked; the proof is spent. Leaving it in is untidy, not unsafe.
      await put(doc, agentDocument(issuer, name)).catch(() => undefined);
    }
    const body = await res.json();
    link = { webId, resource: String(body.resource) };
  } catch (err) {
    return fail("link", err);
  }

  return { webId, name: name.trim(), link };
}

/* ── The agent's name, read from its document ──────────────────────────── */

/** `foaf:name` from an agent's document; its address's last part when there is none. */
export function agentName(turtle: string, webId: string): string {
  const m = /foaf:name\s+"((?:[^"\\]|\\.)*)"/.exec(turtle) ?? /<http:\/\/xmlns\.com\/foaf\/0\.1\/name>\s+"((?:[^"\\]|\\.)*)"/.exec(turtle);
  if (m) {
    try {
      return JSON.parse(`"${m[1]}"`);
    } catch {
      return m[1];
    }
  }
  return decodeURIComponent(webId.split("#")[0].split("/").pop() || webId);
}

/* ── What an agent can reach ───────────────────────────────────────────── */

export interface FolderRules {
  url: string;
  /** Folders below the pod root: the root is 0. */
  depth: number;
  /** Its own rules; null when it inherits. */
  own: ResourceAccess | null;
}

export interface Walk {
  folders: FolderRules[];
  /** False when the walk stopped at its limit: deeper rules were not read. */
  complete: boolean;
}

/**
 * Reads the folders of your own pod and each one's own rules, breadth first,
 * one level at a time in parallel, up to `maxFolders`. Only your pod: nothing
 * lands in anyone else's log. Rules of single files are not read (a listing
 * does not show them), so an agent granted one file by hand is not found.
 */
export async function walkRules(podUrl: string, owner: string, maxFolders = 200, maxDepth = 4): Promise<Walk> {
  const folders: FolderRules[] = [];
  let level = [podUrl];
  let complete = true;
  for (let depth = 0; level.length > 0; depth++) {
    const read = await Promise.all(
      level.map(async (url) => {
        const [own, items] = await Promise.all([
          readAccess(url, owner).catch(() => null),
          depth < maxDepth ? listFolder(url).catch(() => []) : Promise.resolve([]),
        ]);
        return { url, own: own && !own.inherited ? own : null, items };
      })
    );
    const next: string[] = [];
    for (const f of read) {
      folders.push({ url: f.url, depth, own: f.own });
      next.push(...f.items.filter((i) => i.isFolder).map((i) => i.url));
    }
    if (depth + 1 > maxDepth && next.length) complete = false;
    if (folders.length + next.length > maxFolders) {
      complete = false;
      level = next.slice(0, Math.max(0, maxFolders - folders.length));
    } else {
      level = depth + 1 > maxDepth ? [] : next;
    }
  }
  return { folders, complete };
}

export interface Reach {
  url: string;
  modes: Mode[];
}

/** The folders whose own rules name `webId`, from a walk. What is inside them follows unless it has rules of its own. */
export function reachOf(walk: Walk, webId: string): Reach[] {
  return walk.folders.flatMap((f) => {
    const grant = f.own?.agents.find((a) => a.webId === webId);
    return grant ? [{ url: f.url, modes: grant.modes }] : [];
  });
}

/* ── Choosing folders ──────────────────────────────────────────────────── */

/**
 * Gives `webId` `modes` on a folder, or takes it away (`[]`). A folder with
 * rules of its own keeps them all and gains or loses the agent. A folder that
 * inherits gets rules of its own copied from the ones it follows, plus the
 * agent, so nobody who could reach it loses or gains anything else.
 */
export async function setFolderAccess(folder: string, owner: string, podUrl: string, webId: string, modes: Mode[]): Promise<void> {
  if (!isValidWebId(webId)) throw new Error(`Not a valid WebID: ${webId}`);
  const current = await getAccess(folder, owner);
  if (!current.inherited) return setAgentAccess(folder, owner, webId, modes);
  if (!modes.length) return;
  const parent = parentOf(folder);
  const followed = parent && folder !== podUrl ? await effectiveAccess(parent, owner, podUrl) : null;
  const from = followed?.access;
  if (from && from.unknown.length) {
    throw new Error(
      `The rules ${folder} follows include something this app cannot copy. Give it rules of its own in Pods first.`
    );
  }
  const agents: AgentGrant[] = [...(from?.agents ?? []).filter((a) => a.webId !== webId && a.webId !== owner), { webId, modes }];
  await setAccess(folder, owner, { agents, public: from?.public ?? [], authenticated: from?.authenticated ?? [] }, null);
}

/* ── The connector (pocpod0 mcp-connector, /onboard/) ──────────────────── */

export interface Connector {
  grantId: string;
  label: string;
  webId: string;
  createdAt: string | null;
  revoked: boolean;
}

/** The connector reads the cookie only: no token header, which its CORS would refuse. */
function onboard(session: AccountSession, path: string, body?: unknown): Promise<Response> {
  return net.fetch(new URL(`onboard/${path}`, session.issuer).href, {
    credentials: "include",
    ...(body === undefined
      ? {}
      : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
}

export async function listConnectors(session: AccountSession): Promise<Connector[]> {
  const res = await onboard(session, "grants");
  if (res.status === 401) throw ended();
  if (!res.ok) throw new AccountSessionError("provider", `Could not list the connectors (${res.status}).`);
  const grants = (await res.json())?.grants ?? [];
  return grants
    .filter((g: Connector) => g.grantId && g.webId)
    .map((g: Connector) => ({ grantId: g.grantId, label: g.label ?? "", webId: g.webId, createdAt: g.createdAt ?? null, revoked: Boolean(g.revoked) }));
}

/** Mints a connector acting as `webId`. The URL is its only key: shown once, never stored. */
export async function connectAgent(session: AccountSession, webId: string, label: string): Promise<string> {
  const res = await onboard(session, "mint", { webId, label });
  if (res.status === 401) throw ended();
  if (!res.ok) throw new AccountSessionError("provider", `Could not make the connector: ${await problem(res)}`);
  const { connectorUrl } = await res.json();
  if (!connectorUrl) throw new AccountSessionError("provider", "The connector was made but its URL did not come back. Revoke it and connect again.");
  return String(connectorUrl);
}

export async function revokeConnector(session: AccountSession, grantId: string): Promise<void> {
  const res = await onboard(session, "revoke", { grantId });
  if (res.status === 401) throw ended();
  if (!res.ok && res.status !== 404) throw new AccountSessionError("provider", `Could not revoke the connector: ${await problem(res)}`);
}

/* ── Deleting an agent ─────────────────────────────────────────────────── */

export type DeleteStep = "connector" | "rules" | "delegates" | "unlink" | "retire";

const DELETE_WORDS: Record<DeleteStep, string> = {
  connector: "revoking its connector",
  rules: "taking it out of the folders' rules",
  delegates: "taking it out of your profile",
  unlink: "unlinking it from your account",
  retire: "retiring its document",
};

export class AgentDeleteError extends Error {
  readonly step: DeleteStep;
  constructor(step: DeleteStep, detail: string) {
    super(`Stopped while ${DELETE_WORDS[step]}: ${detail}. The steps before it are done; deleting again carries on.`);
    this.name = "AgentDeleteError";
    this.step = step;
  }
}

export interface AgentToDelete {
  webId: string;
  name: string;
  link: Link;
  /** Folders whose own rules name it, from the last walk. */
  reach: Reach[];
  /** Whether your profile names it in `acl:delegates`. */
  delegate: boolean;
}

/**
 * Deletes an agent in the order at the top of this file. Each step can be run
 * again: a revoked connector, a removed grant or an unlinked WebID is
 * already the outcome wanted. `today` is the date written in its document.
 */
export async function deleteAgent(session: AccountSession, owner: string, podUrl: string, agent: AgentToDelete, today: string): Promise<void> {
  const step = async (name: DeleteStep, run: () => Promise<void>) => {
    try {
      await run();
    } catch (err) {
      if (err instanceof AccountSessionError && err.code === "ended") throw err;
      throw new AgentDeleteError(name, err instanceof Error ? err.message : String(err));
    }
  };
  await step("connector", async () => {
    for (const c of await listConnectors(session)) {
      if (c.webId === agent.webId && !c.revoked) await revokeConnector(session, c.grantId);
    }
  });
  await step("rules", async () => {
    for (const r of agent.reach) await setFolderAccess(r.url, owner, podUrl, agent.webId, []);
  });
  if (agent.delegate) await step("delegates", () => updateOwnProfile(owner, profileEdits.removeDelegate(agent.webId)));
  await step("unlink", async () => {
    const res = await account(session, agent.link.resource, { method: "DELETE" });
    if (res.status === 401) throw ended();
    if (!res.ok && res.status !== 404) throw new Error(`the provider answered ${res.status}`);
  });
  await step("retire", () => put(agent.webId.split("#")[0], retiredDocument(agent.name, today)));
}
