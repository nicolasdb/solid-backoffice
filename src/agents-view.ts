/**
 * Your agents, on You (slice D, canvas page "You · agents"): each agent's
 * name, WebID, connector and the folders it can reach; "New agent" opens a
 * drawer that names it, connects it to an AI and chooses its folders; the
 * `···` menu revokes the connector or deletes the agent.
 *
 * Our provider only (`onProvider`): hidden, never greyed out, for a WebID
 * from anywhere else. The writes are `src/lib/agents.ts`; this file draws
 * them. What it keeps is in memory and forgotten at sign-out: the account
 * session, the last read of your agents, and where the drawer is. Nothing of
 * it is stored; a connector URL is shown once and never kept.
 */
import {
  AccountSessionError,
  agentName,
  agentNameProblem,
  agentSlug,
  agentsOf,
  connectAgent,
  cookieSession,
  createAgent,
  deleteAgent,
  linkedWebIds,
  listConnectors,
  reachOf,
  revokeConnector,
  setFolderAccess,
  unlockWithPassword,
  walkRules,
  type AccountSession,
  type Connector,
  type Link,
  type Reach,
  type Walk,
} from "./lib/agents";
import { PRESETS, presetOf, type Mode } from "./lib/acl";
import { profileEdits, updateOwnProfile, type MemberDeclaration } from "./lib/collective";
import { readTurtle } from "./lib/read";
import { SIGNUP_PROVIDER } from "./config";
import { announce } from "./ui/a11y";
import { esc, toast } from "./ui/patterns";
import { trimAddress } from "./ui/address";
import { run } from "./bind";
import { bindCopy, copyable } from "./steps";
import { isoDate } from "./lib/pod";

/** The pod's own name (`amina` for `…/amina/`), for a connector's label. */
function podName(podUrl: string): string {
  const url = new URL(podUrl);
  return url.pathname.split("/").filter(Boolean).pop() ?? url.host;
}

/** The provider as people say it: `pod.nicolasdb.eu`. */
const providerHost = () => new URL(SIGNUP_PROVIDER!).host;

/** Whether the signed-in WebID is one of our provider's: the only case D shows. */
export function onProvider(webId: string): boolean {
  return Boolean(SIGNUP_PROVIDER && webId.startsWith(SIGNUP_PROVIDER));
}

export interface AgentRow {
  webId: string;
  name: string;
  link: Link;
  /** Its live connector; undefined when the connector service could not be read. */
  connector: Connector | null | undefined;
  /** It had a connector, now revoked, and has no live one. */
  revoked: boolean;
  reach: Reach[];
}

interface Read {
  agents: AgentRow[];
  walk: Walk;
  at: number;
  /** Why the connectors could not be read, when they could not. */
  connectorProblem: string | null;
}

type Drawer =
  | { step: "name" }
  | { step: "connect"; webId: string; url: string | null }
  | { step: "folders"; webId: string };

interface Ctx {
  webId: string;
  podUrl: string;
  profile: MemberDeclaration;
  rerender: () => void;
}

let session: AccountSession | null = null;
let read: Read | null = null;
let failure: string | null = null;
let drawer: Drawer | null = null;
let menu: string | null = null;
let deleting: { webId: string; armed: boolean } | null = null;
let loading: Promise<void> | null = null;

/** Sign-out: nothing about the account stays in the page. */
export function forgetAgents(): void {
  session = null;
  read = null;
  failure = null;
  drawer = null;
  menu = null;
  deleting = null;
  loading = null;
}

/** Where You puts the section; filled by `mountAgents`. */
export function agentsSlot(webId: string): string {
  return onProvider(webId) ? `<section class="stack agents step-host" id="agents" aria-labelledby="agents-title"></section>` : "";
}

/** Reads your agents, their connectors and the rules of your pod's folders. */
async function load(ctx: Ctx): Promise<void> {
  session ??= cookieSession(SIGNUP_PROVIDER!);
  const s = session;
  try {
    let connectorProblem: string | null = null;
    const [links, connectors, walk] = await Promise.all([
      linkedWebIds(s),
      listConnectors(s).catch((err) => {
        if (err instanceof AccountSessionError && err.code === "ended") throw err;
        connectorProblem = err instanceof Error ? err.message : String(err);
        return undefined;
      }),
      walkRules(ctx.podUrl, ctx.webId),
    ]);
    const mine = agentsOf(links, ctx.podUrl, ctx.webId);
    const agents = await Promise.all(
      mine.map(async (link): Promise<AgentRow> => {
        const res = await readTurtle(link.webId.split("#")[0]).catch(() => null);
        const text = res?.ok ? await res.text() : "";
        return {
          webId: link.webId,
          name: agentName(text, link.webId),
          link,
          connector: connectors === undefined ? undefined : connectors.find((c) => c.webId === link.webId && !c.revoked) ?? null,
          revoked: Boolean(connectors?.some((c) => c.webId === link.webId && c.revoked)),
          reach: reachOf(walk, link.webId),
        };
      })
    );
    agents.sort((a, b) => a.name.localeCompare(b.name));
    read = { agents, walk, at: Date.now(), connectorProblem };
    failure = null;
  } catch (err) {
    if (err instanceof AccountSessionError && err.code === "ended") {
      session = null;
      read = null;
      failure = "ended";
    } else {
      failure = err instanceof Error ? err.message : String(err);
    }
  }
}

/** Draws from memory at once, then reads again when the last read is older than a minute (or there is none). */
export function mountAgents(root: HTMLElement, ctx: Ctx): void {
  const slot = root.querySelector<HTMLElement>("#agents");
  if (!slot) return;
  const draw = () => {
    if (!slot.isConnected) return;
    slot.innerHTML = renderAgents(ctx);
    bindAgents(slot, ctx, draw);
  };
  draw();
  if (loading || (read && Date.now() - read.at < 60_000) || failure === "ended") return;
  loading = load(ctx).finally(() => (loading = null));
  void loading.then(draw);
}

/* ── Drawing ───────────────────────────────────────────────────────────── */


function head(): string {
  return `
    <div class="agents-head">
      <h2 class="agents-title" id="agents-title">Your agents</h2>
    </div>
    <p class="meta">An agent is a WebID of its own, in <code>profile/</code> on your pod, beside your own card. It reaches only the folders you give it. A connector lets an AI sign in as it.</p>`;
}

function renderAgents(ctx: Ctx): string {
  if (failure === "ended") return head() + unlockForm();
  if (!read) {
    return head() + (failure
      ? `<p class="error" role="alert">Could not read your agents: ${esc(failure)}</p><div><button type="button" class="ghost small" id="agents-retry">Try again</button></div>`
      : `<p class="meta" role="status">Reading your agents…</p>`);
  }
  const list = read.agents.length
    ? read.agents.map((a) => agentCard(a, ctx)).join("")
    : `<p class="lead">No agent yet. Make one for each AI you use, so each can be stopped on its own.</p>`;
  const count = read.walk.folders.length;
  return `${head()}
    ${list}
    ${read.connectorProblem ? `<p class="meta" role="status">Whether an agent is connected is unknown: ${esc(read.connectorProblem)}</p>` : ""}
    <div><button type="button" class="small" id="agent-new">New agent</button></div>
    <p class="meta">Folders counted from the rules the app has read on your pod: ${count} folder${count === 1 ? "" : "s"}${read.walk.complete ? "" : ", not all of them"}, no single files.</p>
    <p class="step-error error" role="alert" hidden></p>
    ${menu ? `<div class="menu-scrim" id="agent-menu-scrim"></div>` : ""}
    ${drawerHtml(ctx)}
    ${deleteHtml(ctx)}`;
}

function unlockForm(): string {
  return `
    <div class="inherit-card step-host">
      <p class="lead">Your account session on ${esc(providerHost())} has ended, so your agents cannot be read. Your email and password open a new one, kept in this page only.</p>
      <form id="agents-unlock" class="stack">
        <div class="field"><label for="unlock-email">Email</label><input id="unlock-email" name="email" type="email" autocomplete="username" required /></div>
        <div class="field"><label for="unlock-password">Password</label><input id="unlock-password" name="password" type="password" autocomplete="current-password" required /></div>
        <div><button type="submit">Open my account</button></div>
      </form>
      <p class="step-error error" role="alert" hidden></p>
    </div>`;
}

/** A date as people say it: "23 Sep", with the year when it is not this one. */
export function shortDate(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()];
  return `${d.getDate()} ${month}${d.getFullYear() === now.getFullYear() ? "" : ` ${d.getFullYear()}`}`;
}

/** How long ago: "just now", "5 min ago", "2 h ago", "3 days ago", then the date. */
export function ago(iso: string, now = new Date()): string {
  const minutes = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (Number.isNaN(minutes)) return iso;
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h ago`;
  if (minutes < 60 * 24 * 14) return `${Math.round(minutes / 60 / 24)} days ago`;
  return `on ${shortDate(iso, now)}`;
}

/** "Can edit 1 folder and read 2": what it reaches, counted. The folders themselves are in Choose folders. */
export function reachSummary(reach: Reach[]): string {
  const edit = reach.filter((r) => presetOf(r.modes) === "edit").length;
  const read = reach.filter((r) => presetOf(r.modes) === "read").length;
  const other = reach.length - edit - read;
  const n = (k: number) => `${k} folder${k === 1 ? "" : "s"}`;
  const parts = [edit ? `edit ${n(edit)}` : "", read ? `read ${edit ? read : n(read)}` : "", other ? `${n(other)} with other rules` : ""].filter(Boolean);
  const text = parts.join(parts.length > 2 ? ", " : " and ").replace(/, ([^,]*)$/, " and $1");
  return `Can ${text}, with what is inside them.`;
}

type Step = "connect" | "folders";

/**
 * The card, as on the canvas ("An agent's card, second pass"): who it is,
 * whether an AI can use it now, how much it reaches, and the next step. The
 * folders themselves are one level down, in Choose folders (the iceberg).
 */
function agentCard(a: AgentRow, ctx: Ctx): string {
  const delegate = ctx.profile.delegates.includes(a.webId);
  const live = a.connector;
  const reached = a.reach.length > 0;
  const open = menu === a.webId;

  const foot = `
    <div class="agent-foot">
      <span>${delegate ? "Acts for you" : "Does not act for you"}</span>
      ${copyable(a.webId, "WebID copied.", a.webId.startsWith(ctx.podUrl) ? a.webId.slice(ctx.podUrl.length) : trimAddress(a.webId, ctx.podUrl))}
      ${live?.createdAt ? `<span>Connector made ${esc(shortDate(live.createdAt))}</span>` : ""}
    </div>`;

  let status: string;
  if (a.connector === undefined) status = `<span class="dot is-off" aria-hidden="true"></span><span>Whether an AI is connected is unknown right now.</span>`;
  else if (live) {
    const name = live.label ? ` as "${esc(live.label)}"` : "";
    const used = live.lastUsedAt ? `last used ${esc(ago(live.lastUsedAt))}` : "never used yet";
    status = `<span class="dot" aria-hidden="true"></span><span><strong>Connected</strong>${name} · ${used}</span>`;
  } else if (a.revoked) status = `<span class="dot is-off" aria-hidden="true"></span><span>Not connected · its connector was revoked</span>`;
  else if (!reached) status = `<span class="dot is-off" aria-hidden="true"></span><span>Not set up yet: no AI can use it.</span>`;
  else status = `<span class="dot is-off" aria-hidden="true"></span><span>Not connected yet</span>`;

  const summary = reached
    ? `<p class="agent-summary">${esc(live === null ? reachSummary(a.reach).replace(/, with what is inside them\.$/, a.revoked ? ", if connected again." : ", once connected.") : reachSummary(a.reach))}</p>`
    : "";
  const warn = live && !reached ? `<p class="agent-warn"><span aria-hidden="true">!</span> It can sign in, but reaches no folder yet: the AI will see nothing.</p>` : "";

  // The drawer's steps come back while it is not usable: never connected, or connected to nothing.
  const next: Step | null = live === null ? "connect" : live && !reached ? "folders" : null;
  const setup = next && !(a.revoked && reached)
    ? `<ol class="agent-steps" aria-label="Setting it up">
        <li class="is-done">✓ Named</li>
        <li class="${next === "connect" ? "is-on" : "is-done"}"${next === "connect" ? ' aria-current="step"' : ""}>${next === "connect" ? "2 · Connect to AI" : "✓ Connected"}</li>
        <li class="${next === "folders" ? "is-on" : ""}"${next === "folders" ? ' aria-current="step"' : ""}>${reached ? "✓ Folders" : "3 · Choose folders"}</li>
      </ol>`
    : "";

  const connectPrimary = live === null || a.connector === undefined;
  const buttons = [
    connectPrimary ? `<button type="button" class="small" data-agent-connect="${esc(a.webId)}">Connect to AI</button>` : "",
    `<button type="button" class="${live && !reached ? "" : "ghost "}small" data-agent-folders="${esc(a.webId)}">${connectPrimary && !reached ? "Choose folders first" : "Choose folders"}</button>`,
  ].join("");

  return `
    <article class="agent-card" data-agent="${esc(a.webId)}">
      <div class="agent-head">
        <strong>${esc(a.name)}</strong>
        <span class="grow"></span>
        <button type="button" class="ghost small" data-agent-menu="${esc(a.webId)}" aria-label="More for ${esc(a.name)}" aria-expanded="${open}">···</button>
      </div>
      ${foot}
      <p class="agent-status">${status}</p>
      ${summary}
      ${warn}
      ${setup}
      <div class="row-actions">${buttons}</div>
      ${open ? agentMenu(a, delegate) : ""}
    </article>`;
}

function agentMenu(a: AgentRow, delegate: boolean): string {
  return `
    <div class="agent-menu" role="menu" aria-label="${esc(a.name)}">
      <div class="menu-sec">
        ${a.connector
          ? `<button class="menu-item" role="menuitem" type="button" data-agent-revoke="${esc(a.connector.grantId)}">Revoke the connector</button>`
          : `<button class="menu-item" role="menuitem" type="button" data-agent-connect="${esc(a.webId)}">Connect to AI</button>`}
        <button class="menu-item" role="menuitem" type="button" data-agent-folders="${esc(a.webId)}">Choose folders</button>
        <button class="menu-item" role="menuitem" type="button" data-agent-delegate="${esc(a.webId)}" data-on="${delegate ? "" : "1"}">${delegate ? "Stop it acting for you" : "Let it act for you"}</button>
      </div>
      ${a.connector ? `<div class="menu-sec"><p class="meta">Revoking stops the AI signing in as this agent. The agent and its folders stay: connect again for a new URL.</p></div>` : ""}
      <div class="menu-sec">
        <button class="menu-item is-warn" role="menuitem" type="button" data-agent-delete="${esc(a.webId)}">Delete the agent…</button>
      </div>
    </div>`;
}

function stepsRail(step: Drawer["step"]): string {
  const steps: [Drawer["step"], string][] = [["name", "Name it"], ["connect", "Connect to AI"], ["folders", "Choose folders"]];
  const at = steps.findIndex(([s]) => s === step);
  return `<ol class="agent-steps" aria-label="Steps">${steps
    .map(([, label], i) => `<li class="${i < at ? "is-done" : i === at ? "is-on" : ""}"${i === at ? ' aria-current="step"' : ""}>${i + 1} · ${label}</li>`)
    .join("")}</ol>`;
}

function drawerHtml(ctx: Ctx): string {
  if (!drawer || !read) return "";
  const d = drawer;
  const agent = "webId" in d ? read.agents.find((a) => a.webId === d.webId) : undefined;
  const title = drawer.step === "name" ? "New agent" : esc(agent?.name ?? "Agent");
  let body = "";
  if (drawer.step === "name") body = nameStep(ctx);
  else if (drawer.step === "connect") body = connectStep(drawer, agent, ctx);
  else body = foldersStep(agent, ctx);
  return `
    <div class="drawer-scrim" id="agent-scrim"></div>
    <aside class="drawer step-host" role="dialog" aria-modal="true" aria-labelledby="agent-drawer-title" id="agent-drawer">
      <div class="drawer-head"><h2 id="agent-drawer-title" tabindex="-1">${title}</h2><button class="ghost small" type="button" id="agent-close" aria-label="Close">✕</button></div>
      ${stepsRail(drawer.step)}
      ${body}
      <p class="step-error error" role="alert" hidden></p>
    </aside>`;
}

function nameStep(ctx: Ctx): string {
  return `
    <form id="agent-create" class="stack">
      <div class="field">
        <label for="agent-name">Name</label>
        <input id="agent-name" name="name" type="text" maxlength="64" required placeholder="Claude" />
        <p class="meta" id="agent-address">Its address: <code>${esc(trimAddress(ctx.podUrl + "profile/", ctx.podUrl))}…#me</code>. The name can change later; the address cannot. <code>card</code> is taken: it is you.</p>
      </div>
      <label class="opt opt-top"><input type="checkbox" name="delegate" checked /><span>It may act for me<br /><span class="meta">Adds it to your profile (<code>acl:delegates</code>). Folders you share with a collective then give it Can edit too.</span></span></label>
      <div class="inherit-card">
        <span class="label-mono">Creating it writes, in order</span>
        <ol class="writes">
          <li>its document, in <code>profile/</code></li>
          <li>public Read on it, so servers can check who it is</li>
          <li>a check from outside that anyone can read it</li>
          <li>its link to your account on ${esc(providerHost())}</li>
        </ol>
        <p class="meta">If a step fails, what was written is undone and the step is named.</p>
      </div>
      <div class="row-actions"><button type="submit">Create the agent</button><button type="button" class="ghost" data-agent-cancel>Cancel</button></div>
    </form>`;
}

function connectStep(d: Extract<Drawer, { step: "connect" }>, agent: AgentRow | undefined, ctx: Ctx): string {
  const who = `<code>${esc(trimAddress(d.webId, ctx.podUrl))}</code>`;
  if (!d.url) {
    const has = agent?.connector;
    return `
      <p class="lead">${has ? "This agent already has a connector. Revoke it first for a new URL." : `Let an AI sign in as ${who}. This makes a connector URL for it.`}</p>
      <div class="inherit-card">
        <strong>What it can do</strong>
        <p class="meta">The AI acts as this agent, with exactly the agent's access, never yours. Anyone who has the URL can do the same, until you revoke it.</p>
      </div>
      <div class="row-actions">
        ${has ? "" : `<button type="button" id="agent-mint">Make the connector URL</button>`}
        <button type="button" class="ghost" data-agent-step="folders">Choose folders</button>
      </div>`;
  }
  const reach = agent?.reach.length ?? 0;
  return `
    <p class="lead">Connector ready for ${who}. Copy it now: it is shown once.</p>
    <span class="label-mono">Connector URL</span>
    <div class="urlbox">${copyable(d.url, "Connector URL copied. Keep it private.")}</div>
    <ol class="writes">
      <li>In claude.ai: Settings → Connectors → Add custom connector.</li>
      <li>Paste the URL; name it "${esc(agent?.name ?? "Agent")} · ${esc(podName(ctx.podUrl))}".</li>
    </ol>
    <p class="meta">Keep it private: the URL is the key. Lost it? Revoke the connector and connect again.</p>
    <div class="inherit-card"><p class="meta">The AI acts as this agent, with its access only. Right now that is ${reach ? `${reach} folder${reach === 1 ? "" : "s"}` : "no folder: choose them next"}.</p></div>
    <div class="row-actions"><button type="button" data-agent-step="folders">Choose folders</button><button type="button" class="ghost" data-agent-cancel>Later</button></div>`;
}

/** Folders offered: the first two levels below the root, and any deeper one the agent already reaches. Never the root, `profile/` or `settings/`. */
function pickable(ctx: Ctx, reach: Reach[]): Walk["folders"] {
  const skip = [ctx.podUrl + "profile/", ctx.podUrl + "settings/"];
  return read!.walk.folders
    .filter((f) => f.depth > 0 && !skip.some((s) => f.url.startsWith(s)))
    .filter((f) => f.depth <= 2 || reach.some((r) => r.url === f.url))
    .sort((a, b) => a.url.localeCompare(b.url));
}

function foldersStep(agent: AgentRow | undefined, ctx: Ctx): string {
  const reach = agent?.reach ?? [];
  const rows = pickable(ctx, reach)
    .map((f) => {
      const has = reach.find((r) => r.url === f.url);
      const mode = has ? presetOf(has.modes) : null;
      const path = f.url.slice(ctx.podUrl.length);
      const shared = /^output2\/([^/]+)\/$/.exec(path)?.[1];
      const note = [shared ? `shared with ${shared}` : "", f.own ? "" : "follows the folder above"].filter(Boolean).join(" · ");
      return `
        <div class="folder-row" style="--depth: ${f.depth - 1}">
          <input type="checkbox" name="folder" value="${esc(f.url)}" id="f-${esc(path)}"${has ? " checked" : ""}${has && !mode ? " disabled" : ""} />
          <label for="f-${esc(path)}"><code>${esc(path)}</code>${note ? ` <span class="meta">${note}</span>` : ""}</label>
          <select name="mode:${esc(f.url)}" aria-label="Access for ${esc(path)}"${has && !mode ? " disabled" : ""}>
            <option value="read"${mode === "edit" ? "" : " selected"}>Can read</option>
            <option value="edit"${mode === "edit" ? " selected" : ""}>Can edit</option>
          </select>
        </div>`;
    })
    .join("");
  return `
    <form id="agent-folders" class="stack">
      <p class="lead">Which folders may ${esc(agent?.name ?? "it")} use? Each one gets the agent's WebID in its rules. Nothing to copy or paste.</p>
      <div class="folder-list">${rows || `<p class="meta">No folder on your pod yet. Make one in Pods.</p>`}</div>
      <p class="meta">A folder that follows the one above gets rules of its own: everyone who could reach it still can, and the agent is added. What is inside follows it. Can edit is Read, Append and Write; Control is never given.</p>
      <div class="row-actions"><button type="submit">Save access</button><button type="button" class="ghost" data-agent-cancel>Close</button></div>
    </form>`;
}

function deleteHtml(ctx: Ctx): string {
  if (!deleting || !read) return "";
  const a = read.agents.find((x) => x.webId === deleting!.webId);
  if (!a) return "";
  const folders = a.reach.map((r) => `<code>${esc(trimAddress(r.url, ctx.podUrl) || "/")}</code>`).join(", ");
  const delegate = ctx.profile.delegates.includes(a.webId);
  return `
    <div class="drawer-scrim" id="agent-scrim"></div>
    <aside class="drawer step-host" role="alertdialog" aria-modal="true" aria-labelledby="agent-delete-title" id="agent-drawer">
      <div class="drawer-head"><h2 id="agent-delete-title" tabindex="-1">Delete the agent ${esc(a.name)}?</h2><button class="ghost small" type="button" id="agent-close" aria-label="Close">✕</button></div>
      <p class="lead">There is no rename: rules name the agent's address, so a new name is a new agent. Deleting does this, in order:</p>
      <ol class="writes">
        <li>Revokes its connector: no AI can sign in as it any more.</li>
        <li>${a.reach.length ? `Takes it out of the rules of the ${a.reach.length} folder${a.reach.length === 1 ? "" : "s"} found: ${folders}.` : "No folder found naming it: no rules to change."}</li>
        ${delegate ? "<li>Takes it out of your profile (may act for you).</li>" : ""}
        <li>Unlinks it from your account.</li>
        <li>Retires its document: kept, without the provider that signs it in, so nobody signs in as it and the address is never given again.</li>
      </ol>
      <p class="meta">Rules the app has not read (single files, folders deeper than it looked) may still name it; with nobody able to sign in as it, they give nothing. What it already read or wrote stays where it is.</p>
      <div class="row-actions">
        <button type="button" class="${deleting.armed ? "warn" : "ghost"}" id="agent-delete-go">${deleting.armed ? `Delete ${esc(a.name)}: I am sure` : `Delete ${esc(a.name)}`}</button>
        <button type="button" class="ghost" data-agent-cancel>Cancel</button>
      </div>
      ${deleting.armed ? `<p class="meta">Second step: nothing is changed until you tap again.</p>` : `<p class="meta">Asks once more.</p>`}
      <p class="step-error error" role="alert" hidden></p>
    </aside>`;
}

/* ── Wiring ────────────────────────────────────────────────────────────── */

function bindAgents(slot: HTMLElement, ctx: Ctx, draw: () => void): void {
  bindCopy(slot);
  const on = (selector: string, handler: (el: HTMLElement) => void) =>
    slot.querySelectorAll<HTMLElement>(selector).forEach((el) => el.addEventListener("click", () => handler(el)));

  /** After a write: read again, then redraw the whole page (the profile may have changed). */
  const reload = async () => {
    await load(ctx);
    if (failure === "ended") throw new AccountSessionError("ended", "Your account session on the provider has ended.");
  };
  const after = () => ctx.rerender();
  const guard = (action: () => Promise<void>) => async () => {
    try {
      await action();
    } catch (err) {
      if (err instanceof AccountSessionError && err.code === "ended") {
        session = null;
        failure = "ended";
        drawer = null;
        deleting = null;
        draw();
        announce("Your account session has ended.");
        return;
      }
      throw err;
    }
  };

  on("#agents-retry", () => {
    failure = null;
    read = null;
    draw();
    mountAgents(slot.parentElement ?? slot, ctx);
  });

  const unlock = slot.querySelector<HTMLFormElement>("#agents-unlock");
  unlock?.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = (unlock.elements.namedItem("email") as HTMLInputElement).value;
    const password = (unlock.elements.namedItem("password") as HTMLInputElement).value;
    void run(unlock.querySelector("button")!, async () => {
      session = await unlockWithPassword(SIGNUP_PROVIDER!, email, password);
      failure = null;
      await load(ctx);
      announce("Account open.");
    }, draw);
  });

  on("#agent-new", () => {
    drawer = { step: "name" };
    menu = null;
    draw();
    slot.querySelector<HTMLInputElement>("#agent-name")?.focus();
  });
  // A click anywhere else, or Escape, closes the ··· menu (as in Pods).
  const closeMenu = () => {
    const back = menu;
    menu = null;
    draw();
    if (back) slot.querySelector<HTMLElement>(`[data-agent-menu="${CSS.escape(back)}"]`)?.focus();
  };
  on("#agent-menu-scrim", closeMenu);
  slot.querySelector(".agent-menu")?.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Escape") closeMenu();
  });
  slot.querySelector<HTMLElement>(".agent-menu .menu-item")?.focus();
  on("[data-agent-menu]", (el) => {
    menu = menu === el.dataset.agentMenu ? null : el.dataset.agentMenu!;
    draw();
  });
  on("[data-agent-connect]", (el) => {
    drawer = { step: "connect", webId: el.dataset.agentConnect!, url: null };
    draw();
    slot.querySelector<HTMLElement>("#agent-drawer-title")?.focus();
  });
  on("[data-agent-folders]", (el) => {
    drawer = { step: "folders", webId: el.dataset.agentFolders! };
    draw();
    slot.querySelector<HTMLElement>("#agent-drawer-title")?.focus();
  });
  on("[data-agent-step]", () => {
    if (drawer && "webId" in drawer) drawer = { step: "folders", webId: drawer.webId };
    draw();
    slot.querySelector<HTMLElement>("#agent-drawer-title")?.focus();
  });
  const close = () => {
    const back = drawer && "webId" in drawer ? drawer.webId : null;
    drawer = null;
    deleting = null;
    draw();
    const target = back ? slot.querySelector<HTMLElement>(`[data-agent-menu="${CSS.escape(back)}"]`) : slot.querySelector<HTMLElement>("#agent-new");
    target?.focus();
  };
  on("#agent-close", close);
  on("#agent-scrim", close);
  on("[data-agent-cancel]", close);
  slot.querySelector("#agent-drawer")?.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Escape") close();
  });

  const name = slot.querySelector<HTMLInputElement>("#agent-name");
  name?.addEventListener("input", () => {
    const hint = slot.querySelector("#agent-address code");
    const slug = name.value.trim() ? agentSlug(name.value) : "";
    if (hint) hint.textContent = `${trimAddress(ctx.podUrl + "profile/", ctx.podUrl)}${slug || "…"}#me`;
  });

  const create = slot.querySelector<HTMLFormElement>("#agent-create");
  create?.addEventListener("submit", (e) => {
    e.preventDefault();
    const agentNameValue = (create.elements.namedItem("name") as HTMLInputElement).value;
    const delegate = (create.elements.namedItem("delegate") as HTMLInputElement).checked;
    void run(create.querySelector<HTMLButtonElement>("button[type=submit]")!, guard(async () => {
      const problem = agentNameProblem(agentNameValue);
      if (problem) throw new Error(problem);
      const agent = await createAgent(session!, ctx.podUrl, ctx.webId, agentNameValue);
      if (delegate) await updateOwnProfile(ctx.webId, profileEdits.addDelegate(agent.webId));
      drawer = { step: "connect", webId: agent.webId, url: null };
      await reload();
      toast(`Agent ${agent.name} created.`);
      announce(`Agent ${agent.name} created. Next: connect it to an AI.`);
    }), after);
  });

  on("#agent-mint", (el) => {
    if (!drawer || drawer.step !== "connect") return;
    const d = drawer;
    const agent = read?.agents.find((a) => a.webId === d.webId);
    void run(el as HTMLButtonElement, guard(async () => {
      const url = await connectAgent(session!, d.webId, `${agent?.name ?? "Agent"} · ${podName(ctx.podUrl)}`);
      // Shown once: kept in the drawer while it is open, never anywhere else.
      drawer = { step: "connect", webId: d.webId, url };
      await reload();
      announce("Connector URL ready. Copy it now: it is shown once.");
    }), after);
  });

  const folders = slot.querySelector<HTMLFormElement>("#agent-folders");
  folders?.querySelectorAll<HTMLInputElement>("input[name=folder]").forEach((box) =>
    box.addEventListener("change", () => {
      const select = folders.querySelector<HTMLSelectElement>(`select[name="mode:${CSS.escape(box.value)}"]`);
      if (select) select.disabled = false;
    })
  );
  folders?.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!drawer || drawer.step !== "folders") return;
    const webId = drawer.webId;
    const agent = read?.agents.find((a) => a.webId === webId);
    const reach = agent?.reach ?? [];
    void run(folders.querySelector<HTMLButtonElement>("button[type=submit]")!, guard(async () => {
      const changes: [string, Mode[]][] = [];
      folders.querySelectorAll<HTMLInputElement>("input[name=folder]:not(:disabled)").forEach((box) => {
        const had = reach.find((r) => r.url === box.value);
        const mode = folders.querySelector<HTMLSelectElement>(`select[name="mode:${CSS.escape(box.value)}"]`)!.value as "read" | "edit";
        const want = box.checked ? PRESETS[mode] : [];
        const same = had ? presetOf(had.modes) === (box.checked ? mode : null) : !box.checked;
        if (!same) changes.push([box.value, want]);
      });
      // Grant before telling: every write is done before the screen says so.
      for (const [url, modes] of changes) await setFolderAccess(url, ctx.webId, ctx.podUrl, webId, modes);
      drawer = null;
      await reload();
      const msg = changes.length ? `Access saved on ${changes.length} folder${changes.length === 1 ? "" : "s"}.` : "Nothing changed.";
      toast(msg);
      announce(msg);
    }), after);
  });

  on("[data-agent-revoke]", (el) => {
    void run(el as HTMLButtonElement, guard(async () => {
      await revokeConnector(session!, el.dataset.agentRevoke!);
      menu = null;
      await reload();
      toast("Connector revoked. No AI can sign in as this agent any more.");
    }), after);
  });

  on("[data-agent-delegate]", (el) => {
    const webId = el.closest<HTMLElement>("[data-agent]")!.dataset.agent!;
    const add = el.dataset.on === "1";
    void run(el as HTMLButtonElement, async () => {
      await updateOwnProfile(ctx.webId, add ? profileEdits.addDelegate(webId) : profileEdits.removeDelegate(webId));
      menu = null;
      announce(add ? "It may act for you." : "It no longer acts for you.");
    }, after);
  });

  on("[data-agent-delete]", (el) => {
    deleting = { webId: el.dataset.agentDelete!, armed: false };
    menu = null;
    draw();
    slot.querySelector<HTMLElement>("#agent-delete-title")?.focus();
  });
  on("#agent-delete-go", (el) => {
    if (!deleting || !read) return;
    if (!deleting.armed) {
      deleting.armed = true;
      draw();
      slot.querySelector<HTMLElement>("#agent-delete-go")?.focus();
      return;
    }
    const a = read.agents.find((x) => x.webId === deleting!.webId)!;
    void run(el as HTMLButtonElement, guard(async () => {
      await deleteAgent(
        session!,
        ctx.webId,
        ctx.podUrl,
        { webId: a.webId, name: a.name, link: a.link, reach: a.reach, delegate: ctx.profile.delegates.includes(a.webId) },
        isoDate(new Date())
      );
      deleting = null;
      await reload();
      toast(`Agent ${a.name} deleted. Its address is retired.`);
      announce(`Agent ${a.name} deleted.`);
    }), after);
  });
}

/** Agents linked to the account that your profile does not name yet: offered in "May act for you". */
export function agentSuggestionsFromAccount(profile: MemberDeclaration): string[] {
  return (read?.agents ?? []).map((a) => a.webId).filter((w) => !profile.delegates.includes(w));
}
