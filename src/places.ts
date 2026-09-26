/**
 * Places (slice C): your pod as a file browser. The places on the left (your
 * pod, then what you follow), a folder's items in the middle, the selected
 * item on the right; on a phone a place picker, the list, and a sheet per
 * item (the canvas's Places boards, docs/layout-brief.md).
 *
 * Reads follow ADR 007 (docs/explanation/reading-pods.md): what was last seen
 * is drawn at once from memory, the pod is read behind it, and the screen is
 * redrawn only when that changes something and nobody is typing. A folder's
 * list never waits for its rules: "who can read it" fills in row by row.
 *
 * Mounted by src/onboarding.ts into a frame of its own, so moving between
 * folders redraws this frame only, never the tabs or the collectives.
 */
import {
  createFile,
  createFolder,
  effectiveAccess,
  downloadFile,
  listFolder,
  nameOf,
  parentOf,
  readFile,
  typeFor,
  uploadFile,
  type Effective,
  type FileContent,
  type Item,
} from "./lib/files";
import { bindActions, renderActions, type Change } from "./item-actions";
import { renderFollowed, renderOverview, type FollowForm, type OpenedView, type SortBy } from "./following-view";
import {
  follow,
  followedFor,
  readFollowing,
  recordVisit,
  setFavourite,
  sortFollowing,
  summarise,
  summaryOfFile,
  unfollow,
  changeFollowing,
  type Followed,
  type Summary,
} from "./lib/following";
import { bindEditor, canEdit, isDirty, renderEditor, renderEditorActions, startEditing, type Editing } from "./editor";
import { forgetAclLocations, type AccessRules } from "./lib/acl";
import { describePodError, isAuthError } from "./lib/pod";
import { routeHref, type Route } from "./router";
import { renderMarkdown } from "./ui/markdown";
import { busy } from "./ui/typing";
import { esc, renderError, renderPending, toast } from "./ui/patterns";
import { bindAccess, labelOf, loadDraft, renderAccess, type Draft, type Group } from "./access-panel";
import { bindRules, rawDirty, renderRules, startRaw, type RawEdit } from "./raw-rules";

export type { Group };
import { focusView } from "./ui/a11y";

export interface PlacesContext {
  webId: string;
  podUrl: string;
  /** Labels for WebIDs the app already knows: "HyperScope's agent", a member's name. */
  names: Map<string, string>;
  /** Your collectives' members, for the permissions panel's chips; read when first needed. */
  loadGroups: () => Promise<Group[]>;
}

/** Who can read an item, as a row says it; `null` while its rules are on the way. */
export interface RowRules {
  own: boolean;
  who: string;
  /** Where inherited rules come from. */
  from: string | null;
}

/* ── Memory (ADR 007): forgotten at sign-out ───────────────────────────── */

const listings = new Map<string, Item[]>();
const rows = new Map<string, RowRules | "error">();
const files = new Map<string, FileContent>();
/** What could not be read, per address, drawn in place of the list or the file. */
const errors = new Map<string, unknown>();
/** The item shown in the panel (a phone shows it as a sheet). */
let selected: string | null = null;
let sheetOpen = false;
/** The permissions panel's draft, for the item in the panel (C2). */
let draft: Draft | null = null;
let draftError: { url: string; message: string } | null = null;
let groups: Group[] | null = null;
let groupsAsked = false;
/** The file being edited, with its unsaved text (C3). Memory only. */
let editing: Editing | null = null;
/** A file just created: opens in the editor once read. */
let editWhenRead: string | null = null;
/** The "new folder" / "new file" form in a folder's header. */
let creating: { kind: "folder" | "file"; error: string | null } | null = null;
/** What you follow (C5), from your own pod; null until read. */
let following: Followed[] | null = null;
let followingError: string | null = null;
let sortBy: SortBy = "latest";
let followForm: FollowForm | null = null;
/** Followed addresses as last opened: a folder's summary, or a file. */
const opened = new Map<string, { summary?: Summary; file?: FileContent }>();
/** The technical rules: shown for this item, and edited by hand (C6). */
let technicalOpen: string | null = null;
let raw: RawEdit | null = null;
/** Rename, move or delete in progress in the panel (C4). */
const changes: { change: Change | null } = { change: null };
/** The item whose permissions are being read, so a redraw does not read them twice. */
let draftLoading: string | null = null;
let frame: HTMLElement | null = null;
let ctx: PlacesContext | null = null;
let route: Route = { name: "places", path: "" };
/** A newer navigation wins over an older one's reads. */
let generation = 0;
/** Object URLs of images on screen, released when the screen changes. */
let objectUrls: string[] = [];

export function forgetPlaces(): void {
  listings.clear();
  errors.clear();
  rows.clear();
  files.clear();
  selected = null;
  sheetOpen = false;
  draft = null;
  draftError = null;
  draftLoading = null;
  editing = null;
  editWhenRead = null;
  creating = null;
  changes.change = null;
  technicalOpen = null;
  raw = null;
  following = null;
  followingError = null;
  followForm = null;
  opened.clear();
  groups = null;
  groupsAsked = false;
  frame = null;
  ctx = null;
  releaseObjectUrls();
  forgetAclLocations();
}

function releaseObjectUrls(): void {
  objectUrls.forEach((u) => URL.revokeObjectURL(u));
  objectUrls = [];
}

/* ── Words ─────────────────────────────────────────────────────────────── */

/** A WebID shortened to host and path, the way people recognise a pod. */
export function shortWebId(webId: string): string {
  try {
    const url = new URL(webId);
    return url.host + url.pathname.replace(/profile\/card$/, "");
  } catch {
    return webId;
  }
}

/** Who can read, in a few words: "Anyone", "Only you", "You · HyperScope's agent". */
export function whoCanRead(rules: Pick<AccessRules, "agents" | "public" | "authenticated">, names: Map<string, string>): string {
  if (rules.public.includes("read")) return "Anyone";
  if (rules.authenticated.includes("read")) return "Anyone signed in";
  const readers = rules.agents.filter((a) => a.modes.includes("read"));
  const parts = ["You"];
  if (readers.length === 1) parts.push(names.get(readers[0].webId) ?? shortWebId(readers[0].webId));
  else if (readers.length > 1) parts.push(`${readers.length} people`);
  if (rules.public.includes("append")) parts.push("anyone can leave a message");
  else if (rules.authenticated.includes("append")) parts.push("anyone signed in can leave a message");
  return parts.length === 1 ? "Only you" : parts.join(" · ");
}

export function rowRules(url: string, effective: Effective | null, names: Map<string, string>): RowRules {
  if (!effective) return { own: false, who: "Only you", from: null };
  return {
    own: effective.from === url,
    who: whoCanRead(effective.access, names),
    from: effective.from === url ? null : effective.from,
  };
}

/** "Today, 18:40", "Yesterday, 09:12", "25 Sep 2026". */
export function when(date: Date | null, now = new Date()): string {
  if (!date) return "";
  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(date)) / 86_400_000);
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function size(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const KIND_LABEL: Record<string, string> = { markdown: "Markdown", text: "Text", json: "JSON", image: "Image", other: "File" };

/* ── Addresses ─────────────────────────────────────────────────────────── */

/** The address on your pod the route names; null on Following's routes. */
function herePod(): string | null {
  return route.name === "places" ? urlOf(route.path) : null;
}

function urlOf(path: string): string {
  return ctx!.podUrl + path;
}

function pathOf(url: string): string {
  return url.startsWith(ctx!.podUrl) ? url.slice(ctx!.podUrl.length) : "";
}

function hrefOf(url: string): string {
  return routeHref({ name: "places", path: pathOf(url) });
}

/** "My pod / projects / drafts": each step a link but the last. */
function breadcrumb(url: string): string {
  const steps: string[] = [];
  for (let at: string | null = url; at && at.startsWith(ctx!.podUrl); at = parentOf(at)) {
    steps.unshift(at);
    if (at === ctx!.podUrl) break;
  }
  const label = (u: string) => (u === ctx!.podUrl ? "My pod" : nameOf(u).replace(/\/$/, ""));
  return `<nav class="crumbs" aria-label="Path">${steps
    .map((u, i) =>
      i === steps.length - 1
        ? `<span aria-current="page">${esc(label(u))}</span>`
        : `<a href="${hrefOf(u)}">${esc(label(u))}</a>`
    )
    .join(` <span class="meta" aria-hidden="true">/</span> `)}</nav>`;
}

/* ── Drawing ───────────────────────────────────────────────────────────── */

export function placesFrame(): string {
  return `<div id="places" class="places"></div>`;
}

function renderSide(): string {
  const onPod = route.name === "places";
  const pod = shortWebId(ctx!.podUrl);
  const current = route.name === "followed" ? followedFor(route.address, following ?? [])?.address : null;
  const followed = sortFollowing(following ?? [], "favourites");
  return `
    <nav class="places-side" aria-label="Places">
      <div class="places-group">
        <span class="label-mono">Yours</span>
        <a class="place${onPod ? " is-current" : ""}" href="${routeHref({ name: "places", path: "" })}"${onPod ? ' aria-current="page"' : ""}>
          <span>My pod</span><span class="meta">${esc(pod)}</span>
        </a>
      </div>
      <div class="places-group">
        <span class="label-mono">Followed</span>
        ${followed
          .map((f) => {
            const on = f.address === current;
            return `<a class="place${on ? " is-current" : ""}" href="${routeHref({ name: "followed", address: f.address })}"${on ? ' aria-current="page"' : ""}><span>${esc(f.title || nameOf(f.address))}</span><span class="meta">${f.unreadableSince ? "cannot be read now" : "read with your WebID"}</span></a>`;
          })
          .join("")}
        <a class="place is-action${route.name === "following" ? " is-current" : ""}" href="${routeHref({ name: "following" })}"${route.name === "following" ? ' aria-current="page"' : ""}>${followed.length ? "All followed · follow an address" : "+ Follow an address"}</a>
      </div>
      <p class="meta places-note">Nobody can list what is shared with you: someone has to send you the address.</p>
    </nav>
    <label class="field place-picker">
      <span class="label-mono">Place</span>
      <select id="place-picker">
        <option value="${routeHref({ name: "places", path: "" })}"${onPod ? " selected" : ""}>My pod · ${esc(pod)}</option>
        ${followed.map((f) => `<option value="${routeHref({ name: "followed", address: f.address })}"${f.address === current ? " selected" : ""}>${esc(f.title || nameOf(f.address))}</option>`).join("")}
        <option value="${routeHref({ name: "following" })}"${route.name === "following" ? " selected" : ""}>Followed · follow an address</option>
      </select>
    </label>`;
}

function rulesCell(url: string): string {
  const r = rows.get(url);
  if (r === "error") return `<span class="meta">Could not read its rules</span>`;
  if (!r) return `<span class="meta is-loading">Reading…</span>`;
  return esc(r.who);
}

function rulesPill(url: string): string {
  const r = rows.get(url);
  if (!r || r === "error") return "";
  return r.own ? `<span class="pill is-ok">Own</span>` : `<span class="pill">From parent</span>`;
}

function renderRow(item: Item): string {
  const icon = item.isFolder
    ? `<path d="M3 7h7l2 2h9v10H3z"/>`
    : `<path d="M6 3h8l4 4v14H6z"/>`;
  return `
    <tr data-url="${esc(item.url)}"${item.url === selected ? ' class="is-selected"' : ""}>
      <td class="item-name">
        <svg class="item-icon" viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>
        <a href="${hrefOf(item.url)}">${esc(item.name)}</a>
      </td>
      <td class="meta" data-label="Who can read it" data-rules="${esc(item.url)}">${rulesCell(item.url)}</td>
      <td data-label="Rules" data-pill="${esc(item.url)}">${rulesPill(item.url)}</td>
      <td class="meta" data-label="Last modified">${esc(when(item.modified))}</td>
      <td class="row-actions"><button class="ghost small" type="button" data-select="${esc(item.url)}" aria-label="Details of ${esc(item.name)}">···</button></td>
    </tr>`;
}

function renderFolder(url: string): string {
  const items = listings.get(url);
  const list = !items
    ? errors.has(url)
      ? renderFailure(errors.get(url))
      : renderPending("Reading this folder…")
    : !items.length
      ? `<p class="meta">This folder is empty.</p>`
      : `<table class="items">
          <thead><tr>
            <th scope="col">Name</th><th scope="col">Who can read it</th><th scope="col">Rules</th>
            <th scope="col">Last modified</th><th scope="col"><span class="visually-hidden">Actions</span></th>
          </tr></thead>
          <tbody>${items.map(renderRow).join("")}</tbody>
        </table>`;
  return `
    <section class="places-main" aria-labelledby="places-title">
      <h1 id="places-title" class="visually-hidden" data-view-title>${esc(url === ctx!.podUrl ? "My pod" : nameOf(url))}</h1>
      <div class="places-head">
        ${breadcrumb(url)}
        <div class="actions">
          <button class="ghost small" type="button" id="new-folder">New folder</button>
          <button class="ghost small" type="button" id="new-file">New file</button>
          <button class="small" type="button" id="upload">Upload</button>
          <input type="file" id="upload-input" multiple hidden>
        </div>
      </div>
      ${renderCreate()}
      <p class="meta" id="upload-status" role="status" hidden></p>
      <div id="places-list">${list}</div>
    </section>`;
}

function renderCreate(): string {
  if (!creating) return "";
  const what = creating.kind === "folder" ? "folder" : "file";
  return `
    <form class="create-row" id="create-form" novalidate>
      <div class="field">
        <label for="new-name">Name of the new ${what}</label>
        <input id="new-name" type="text" autocomplete="off" spellcheck="false" placeholder="${creating.kind === "folder" ? "notes" : "notes.md"}">
      </div>
      <button type="submit" class="small">Create</button>
      <button type="button" class="ghost small" id="create-cancel">Cancel</button>
      ${creating.error ? `<p class="error" role="alert">${esc(creating.error)}</p>` : ""}
    </form>`;
}

/** The panel: one item, or the folder itself when nothing is selected. */
function renderPanel(url: string, folderUrl: string): string {
  const item = listings.get(parentOf(url) ?? "")?.find((i) => i.url === url);
  const isFolder = url.endsWith("/");
  const inside = isFolder ? listings.get(url) : undefined;
  const r = rows.get(url);
  const name = url === ctx!.podUrl ? "My pod" : nameOf(url);
  const facts = [
    item?.modified ? `Last modified ${when(item.modified).replace(/^Today/, "today").replace(/^Yesterday/, "yesterday")}` : "",
    inside ? `${inside.length} item${inside.length === 1 ? "" : "s"} inside` : "",
    item && !isFolder ? size(item.size) : "",
  ].filter(Boolean);

  const access = draft?.url === url ? draft : null;
  return `
    <aside class="places-panel${sheetOpen ? " is-open" : ""}" aria-label="${esc(name)}">
      <div class="panel-head">
        <h2>${esc(name)}</h2>
        <span class="pill">${isFolder ? "Folder" : esc(KIND_LABEL[kindFromItem(item)] ?? "File")}</span>
        <button class="ghost small sheet-close" type="button" id="sheet-close">Close</button>
      </div>
      ${facts.length ? `<p class="meta">${esc(facts.join(" · "))}</p>` : ""}
      ${r && r !== "error" && !access?.dirty ? `<p>${esc(r.who)}</p>` : ""}
      ${renderAccess(access, accessEnv(), access || draftError?.url !== url ? null : draftError.message)}
      ${access ? renderRules(access, raw, rulesEnv(), technicalOpen === url) : ""}
      ${renderActions(url, changes.change, changeEnv())}
      <div class="actions">
        ${isFolder ? (url !== folderUrl ? `<a class="button-link" href="${hrefOf(url)}">Open</a>` : "") : `<a class="button-link" href="${hrefOf(url)}">Open</a><button class="ghost small" type="button" id="download" data-url="${esc(url)}">Download</button>`}
      </div>
    </aside>`;
}

function kindFromItem(item: Item | undefined): string {
  const type = item?.type ?? "";
  if (/markdown/.test(type) || /\.md$/i.test(item?.url ?? "")) return "markdown";
  if (/json/.test(type)) return "json";
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("text/")) return "text";
  return "other";
}

function renderPreview(file: FileContent): string {
  switch (file.kind) {
    case "markdown":
      return `<article class="prose preview" aria-label="Preview of ${esc(nameOf(file.url))}">${renderMarkdown(file.text ?? "")}</article>`;
    case "json": {
      let text = file.text ?? "";
      try {
        text = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* shown as written: the pod holds what it holds */
      }
      return `<pre class="preview source"><code>${esc(text)}</code></pre>`;
    }
    case "text":
      return `<pre class="preview source"><code>${esc(file.text ?? "")}</code></pre>`;
    case "image": {
      const src = URL.createObjectURL(file.blob!);
      objectUrls.push(src);
      return `<figure class="preview image"><img src="${src}" alt="${esc(nameOf(file.url))}"></figure>`;
    }
    default:
      return `<div class="preview empty-state"><p class="lead">No preview for ${esc(file.contentType.split(";")[0])}. Download it to open it on your device.</p></div>`;
  }
}

function renderFile(url: string): string {
  const file = files.get(url);
  const r = rows.get(url);
  const edit = editing?.url === url ? editing : null;
  const body = edit
    ? renderEditor(edit)
    : file
      ? renderPreview(file)
      : errors.has(url)
        ? renderFailure(errors.get(url))
        : renderPending(`Reading ${nameOf(url)}…`);
  const parent = parentOf(url) ?? ctx!.podUrl;
  const actions = edit
    ? renderEditorActions(edit)
    : `${file && canEdit(file) ? `<button class="small" type="button" id="edit">Edit</button>` : ""}
       <button class="ghost small" type="button" id="download" data-url="${esc(url)}">Download</button>
       <button class="ghost small" type="button" data-select="${esc(url)}">Who can read it</button>
       <a class="button-link" href="${hrefOf(parent)}">Close</a>`;
  return `
    <section class="places-main places-file" aria-labelledby="places-title">
      <h1 id="places-title" class="visually-hidden" data-view-title>${esc(nameOf(url))}</h1>
      <div class="places-head">
        <div class="places-title-row">${breadcrumb(url)}${file ? `<span class="pill">${esc(KIND_LABEL[file.kind])}</span>` : ""}</div>
        <div class="actions">${actions}</div>
      </div>
      <div id="places-file">${body}</div>
      <div class="file-status" role="status">
        <p class="meta">${file?.modified ? `Last saved ${esc(when(file.modified))} · ` : ""}who can read it: <strong>${r && r !== "error" ? esc(r.who) : "…"}</strong>${edit ? ". Save writes only if nobody changed the file since you opened it." : ""}</p>
      </div>
    </section>`;
}

/** The item in the panel: the selected one, else the folder itself; a file shows it only when asked. */
function panelUrl(): string | null {
  const url = herePod();
  if (!url) return null;
  if (url.endsWith("/")) return selected ?? url;
  return selected === url ? url : null;
}

function openedView(address: string): OpenedView {
  const seen = opened.get(address);
  const err = errors.get(address);
  return {
    address,
    entry: following ? followedFor(address, following) : null,
    summary: seen?.summary ?? null,
    file: seen?.file ?? null,
    error: err === undefined ? null : describePodError(err),
  };
}

/** Every folder the app has seen, for Move's destinations. */
function changeEnv() {
  const folders = new Set<string>();
  for (const [folder, items] of listings) {
    folders.add(folder);
    items.filter((i) => i.isFolder).forEach((i) => folders.add(i.url));
  }
  return { webId: ctx!.webId, podUrl: ctx!.podUrl, folders: [...folders] };
}

/** Forgets what was read at and under `prefix`: it moved or is gone. */
function forgetUnder(prefix: string): void {
  for (const map of [listings, rows, files, errors] as Map<string, unknown>[]) {
    for (const key of [...map.keys()]) if (key.startsWith(prefix)) map.delete(key);
  }
  if (editing?.url.startsWith(prefix)) editing = null;
}

function rulesEnv() {
  const env = accessEnv();
  return { owner: ctx!.webId, label: (webId: string) => labelOf(webId, env) };
}

function accessEnv() {
  return { webId: ctx!.webId, podUrl: ctx!.podUrl, names: ctx!.names, groups };
}

function renderPlaces(): string {
  if (route.name === "following") {
    return `<div class="places-grid is-file">${renderSide()}${renderOverview(following ? sortFollowing(following, sortBy) : null, followingError, sortBy, followForm, when)}</div>`;
  }
  if (route.name === "followed") {
    return `<div class="places-grid is-file">${renderSide()}${renderFollowed(openedView(route.address), when, renderPreview)}</div>`;
  }
  const url = herePod()!;
  const panel = panelUrl();
  const main = url.endsWith("/") ? renderFolder(url) : renderFile(url);
  const side = panel ? renderPanel(panel, url.endsWith("/") ? url : parentOf(url)!) : "";
  return `<div class="places-grid${panel ? "" : " is-file"}">${renderSide()}${main}${side}</div>`;
}

function draw(focus: boolean): void {
  if (!frame) return;
  releaseObjectUrls();
  frame.innerHTML = renderPlaces();
  bind();
  if (focus) focusView(frame);
}

/** Someone is typing, or has a change to the permissions not saved yet. */
function inUse(): boolean {
  return (
    !frame ||
    busy(frame) ||
    Boolean(draft?.dirty) ||
    isDirty(editing) ||
    Boolean(creating) ||
    Boolean(changes.change) ||
    Boolean(followForm) ||
    rawDirty(raw) ||
    Boolean(raw?.armed)
  );
}

/** Redraws after a read, unless someone is typing; keeps focus where it was. */
function redraw(): void {
  if (!frame || inUse()) return;
  const active = document.activeElement as HTMLElement | null;
  const key = active && frame.contains(active) ? (active.dataset.select ? `[data-select="${CSS.escape(active.dataset.select)}"]` : active.id ? `#${CSS.escape(active.id)}` : null) : null;
  draw(false);
  if (key) frame.querySelector<HTMLElement>(key)?.focus();
}

function renderFailure(err: unknown): string {
  return renderError({
    title: isAuthError(err) ? "Your session ended" : "This could not be read",
    detail: describePodError(err),
    action: { label: "Try again", id: "places-retry" },
    technical: err instanceof Error ? err.message : String(err),
  });
}

/* ── Reading ───────────────────────────────────────────────────────────── */

async function readFolder(url: string, mine: number): Promise<void> {
  const before = JSON.stringify(listings.get(url) ?? null);
  let items: Item[];
  try {
    items = await listFolder(url);
  } catch (err) {
    if (mine !== generation) return;
    errors.set(url, err);
    listings.delete(url);
    draw(false);
    return;
  }
  if (mine !== generation) return;
  errors.delete(url);
  listings.set(url, items);
  if (JSON.stringify(items) !== before) redraw();
  await readRules([url, ...items.map((i) => i.url)], mine);
}

/** Each row's rules, as they arrive; one walk up per folder, shared by its items. */
async function readRules(urls: string[], mine: number): Promise<void> {
  const memo = new Map<string, Promise<Effective | null>>();
  await Promise.allSettled(
    urls.map(async (url) => {
      let value: RowRules | "error";
      try {
        value = rowRules(url, await effectiveAccess(url, ctx!.webId, ctx!.podUrl, memo), ctx!.names);
      } catch {
        value = "error";
      }
      if (mine !== generation) return;
      const was = JSON.stringify(rows.get(url) ?? null);
      rows.set(url, value);
      if (JSON.stringify(value) !== was) patchRules(url);
    })
  );
}

/** Fills one row's rules in place: never redraws the list under someone. */
function patchRules(url: string): void {
  if (!frame) return;
  const cell = frame.querySelector<HTMLElement>(`[data-rules="${CSS.escape(url)}"]`);
  if (cell) cell.innerHTML = rulesCell(url);
  const pill = frame.querySelector<HTMLElement>(`[data-pill="${CSS.escape(url)}"]`);
  if (pill) pill.innerHTML = rulesPill(url);
  const current = herePod();
  if (!current) return;
  const inPanel = (selected ?? current) === url || current === url;
  if (inPanel && !inUse()) {
    const panel = frame.querySelector(".places-panel, .file-status");
    // The rules changed under a panel nobody is editing: read its draft again.
    if (draft?.url === url) draft = null;
    if (panel) redraw();
  }
}

async function readOne(url: string, mine: number): Promise<void> {
  const parent = parentOf(url) ?? ctx!.podUrl;
  const rules = readRules([url], mine);
  try {
    const file = await readFile(url);
    if (mine !== generation) return;
    const was = files.get(url);
    files.set(url, file);
    errors.delete(url);
    if (editing?.url === url && !isDirty(editing) && file.etag !== editing.etag && file.text !== null) {
      editing.base = editing.text = file.text;
      editing.etag = file.etag;
    }
    if (editWhenRead === url && canEdit(file)) {
      editWhenRead = null;
      editing = startEditing(file, isPhone());
      draw(false);
      frame?.querySelector<HTMLTextAreaElement>("#source")?.focus();
      return;
    }
    if (!was || was.etag !== file.etag || was.etag === null) redraw();
  } catch (err) {
    if (mine !== generation) return;
    files.delete(url);
    errors.set(url, err);
    draw(false);
  }
  await rules;
  // The folder is read too, so Close lands on a list already drawn.
  if (!listings.has(parent)) void listFolder(parent).then((items) => listings.set(parent, items)).catch(() => {});
}

/* ── Wiring ────────────────────────────────────────────────────────────── */

function bind(): void {
  if (!frame) return;
  frame.querySelector<HTMLSelectElement>("#place-picker")?.addEventListener("change", (e) => {
    location.hash = (e.target as HTMLSelectElement).value;
  });
  frame.querySelectorAll<HTMLButtonElement>("[data-select]").forEach((button) =>
    button.addEventListener("click", () => {
      selected = button.dataset.select!;
      sheetOpen = true;
      if (draft?.url !== selected) draft = null;
      if (changes.change?.url !== selected) changes.change = null;
      if (raw?.url !== selected) raw = null;
      draw(false);
      frame?.querySelector<HTMLElement>(".places-panel h2")?.setAttribute("tabindex", "-1");
      frame?.querySelector<HTMLElement>(".places-panel h2")?.focus();
    })
  );
  frame.querySelector("#sheet-close")?.addEventListener("click", () => {
    const back = selected;
    sheetOpen = false;
    selected = null;
    draft = null;
    changes.change = null;
    draw(false);
    if (back) frame?.querySelector<HTMLElement>(`[data-select="${CSS.escape(back)}"]`)?.focus();
  });
  const panel = panelUrl();
  const aside = frame.querySelector<HTMLElement>(".places-panel");
  if (panel && aside) {
    if (draft?.url === panel) {
      bindAccess(aside, draft, accessEnv(), {
        changed: () => drawKeepingFocus(),
        saved: (message) => {
          draft = null;
          if (message) toast(message);
          void showPlaces(route, false);
        },
      });
    } else if (draftError?.url !== panel) {
      void startDraft(panel, generation);
    }
    if (draft?.url === panel) {
      const open = draft;
      bindRules(aside, open, raw, ctx!.webId, {
        changed: () => drawKeepingFocus(),
        saved: (message) => {
          raw = null;
          draft = null;
          toast(message);
          void showPlaces(route, false);
        },
        toggled: (isOpen) => {
          technicalOpen = isOpen ? panel : null;
        },
        edit: () => {
          raw = startRaw(open);
          technicalOpen = panel;
          draw(false);
          frame?.querySelector<HTMLTextAreaElement>("#raw-acl")?.focus();
        },
        cancel: () => {
          raw = null;
          draw(false);
          frame?.querySelector<HTMLElement>("#raw-edit")?.focus();
        },
      });
    }
    bindActions(aside, panel, changes, changeEnv(), {
      changed: () => drawKeepingFocus(),
      done: (from, to, message) => {
        forgetUnder(from);
        toast(message);
        selected = null;
        sheetOpen = false;
        draft = null;
        const here = herePod() ?? "";
        if (here.startsWith(from)) {
          // You were in (or on) what moved: follow it, or go up after a delete.
          location.hash = hrefOf(to ? to + here.slice(from.length) : (parentOf(from) ?? ctx!.podUrl));
        } else {
          void showPlaces(route, false);
        }
      },
    });
  }
  frame.querySelector("#places-retry")?.addEventListener("click", () => void showPlaces(route));
  bindWrites();
  bindFollowing();
  const download = frame.querySelector<HTMLButtonElement>("#download");
  download?.addEventListener("click", async () => {
    const url = download.dataset.url!;
    download.disabled = true;
    try {
      await downloadFile(url, files.get(url) ?? opened.get(url)?.file);
    } catch (err) {
      toast(`Could not download ${nameOf(url)}: ${describePodError(err)}`);
    } finally {
      download.disabled = false;
    }
  });
}

function isPhone(): boolean {
  return typeof matchMedia === "function" && matchMedia("(max-width: 40rem)").matches;
}

/** New folder, new file, upload (in a folder); the editor (on a file). */
function bindWrites(): void {
  const here = herePod();
  if (!frame || !here) return;

  const openCreate = (kind: "folder" | "file") => {
    creating = { kind, error: null };
    draw(false);
    frame?.querySelector<HTMLInputElement>("#new-name")?.focus();
  };
  frame.querySelector("#new-folder")?.addEventListener("click", () => openCreate("folder"));
  frame.querySelector("#new-file")?.addEventListener("click", () => openCreate("file"));
  frame.querySelector("#create-cancel")?.addEventListener("click", () => {
    creating = null;
    draw(false);
    frame?.querySelector<HTMLElement>("#new-folder")?.focus();
  });
  frame.querySelector<HTMLFormElement>("#create-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!creating) return;
    const input = frame!.querySelector<HTMLInputElement>("#new-name")!;
    const name = input.value;
    const kind = creating.kind;
    (e.target as HTMLFormElement).querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled = true;
    try {
      if (kind === "folder") {
        await createFolder(here, name);
        creating = null;
        toast(`Created ${name.trim()}/.`);
        await showPlaces(route, false);
      } else {
        const body = typeFor(name) === "text/markdown" ? `# ${name.trim().replace(/\.(md|markdown)$/i, "")}\n` : "";
        const url = await createFile(here, name, body);
        creating = null;
        editWhenRead = url;
        location.hash = hrefOf(url);
      }
    } catch (err) {
      creating = { kind, error: describePodError(err) };
      draw(false);
      const again = frame?.querySelector<HTMLInputElement>("#new-name");
      if (again) {
        again.value = name;
        again.focus();
      }
    }
  });

  const picker = frame.querySelector<HTMLInputElement>("#upload-input");
  frame.querySelector("#upload")?.addEventListener("click", () => picker?.click());
  picker?.addEventListener("change", async () => {
    const chosen = [...(picker.files ?? [])];
    if (!chosen.length) return;
    const status = frame!.querySelector<HTMLElement>("#upload-status")!;
    status.hidden = false;
    const failed: string[] = [];
    for (const [i, file] of chosen.entries()) {
      status.textContent = `Uploading ${i + 1} of ${chosen.length}: ${file.name}…`;
      try {
        await uploadFile(here, file);
      } catch (err) {
        failed.push(describePodError(err));
      }
    }
    const done = chosen.length - failed.length;
    toast(
      failed.length
        ? `${done} of ${chosen.length} uploaded. ${failed.join(" ")}`
        : `${done} file${done === 1 ? "" : "s"} uploaded.`
    );
    await showPlaces(route, false);
  });

  frame.querySelector("#edit")?.addEventListener("click", () => {
    const file = files.get(here);
    if (!file) return;
    editing = startEditing(file, isPhone());
    draw(false);
    frame?.querySelector<HTMLTextAreaElement>("#source")?.focus();
  });
  if (editing?.url === here) {
    const open = editing;
    bindEditor(frame, open, {
      changed: () => drawKeepingFocus(),
      saved: (file) => {
        files.set(here, file);
        toast(`Saved ${nameOf(here)}.`);
        drawKeepingFocus();
      },
      close: () => {
        editing = null;
        draw(false);
        frame?.querySelector<HTMLElement>("#edit")?.focus();
      },
    });
  }
}

/** Reads the permissions of the item in the panel, and the members for its chips. */
async function startDraft(url: string, mine: number): Promise<void> {
  if (draftLoading === url) return;
  draftLoading = url;
  if (!groupsAsked) {
    groupsAsked = true;
    ctx!.loadGroups().then(
      (g) => {
        groups = g;
        if (draft && !inUse()) drawKeepingFocus();
      },
      () => (groups = [])
    );
  }
  try {
    const next = await loadDraft(url, ctx!.webId, ctx!.podUrl).finally(() => {
      if (draftLoading === url) draftLoading = null;
    });
    if (mine !== generation || panelUrl() !== url) return;
    draft = next;
    draftError = null;
  } catch (err) {
    if (mine !== generation) return;
    draft = null;
    draftError = { url, message: describePodError(err) };
  }
  drawKeepingFocus();
}

/** Redraws now (the person's own change), keeping focus on the control they used. */
function drawKeepingFocus(): void {
  if (!frame) return;
  const active = document.activeElement as HTMLElement | null;
  const key = active && frame.contains(active)
    ? active.id
      ? `#${CSS.escape(active.id)}`
      : ["data-select", "data-remove", "data-add", "data-person", "data-view"].map((a) => active.getAttribute(a) !== null ? `[${a}="${CSS.escape(active.getAttribute(a)!)}"]` : "").find(Boolean) ||
        (active.matches('input[name="visibility"]') ? `input[name="visibility"][value="${(active as HTMLInputElement).value}"]` : null)
    : null;
  draw(false);
  const target = key ? frame.querySelector<HTMLElement>(key) : null;
  (target ?? frame.querySelector<HTMLElement>("#add-webid"))?.focus();
}

/** First entry into Places: remembers the frame and who is signed in. */
export function mountPlaces(el: HTMLElement, next: Route, context: PlacesContext): Promise<void> {
  frame = el;
  ctx = context;
  return showPlaces(next, true);
}

/**
 * A navigation inside Places: drawn from memory at once, then the pod is read
 * behind it. Returns once the reads are done (tests wait on it).
 */
export async function showPlaces(next: Route, focus = true): Promise<void> {
  if (!frame || !ctx) return;
  const moved = JSON.stringify(next) !== JSON.stringify(route);
  route = next.name === "places" || next.name === "following" || next.name === "followed" ? next : { name: "places", path: "" };
  if (moved) {
    selected = null;
    sheetOpen = false;
    draft = null;
    draftError = null;
    creating = null;
    changes.change = null;
    followForm = null;
    raw = null;
    technicalOpen = null;
  }
  const mine = ++generation;
  draw(focus);
  const list = readFollowingList(mine);
  if (route.name === "following") return list;
  if (route.name === "followed") {
    await list; // which entry it belongs to decides what a visit records
    return readFollowed(route.address, mine);
  }
  const url = urlOf(route.path);
  if (url.endsWith("/")) await readFolder(url, mine);
  else await readOne(url, mine);
  await list;
}

/* ── Following (C5) ────────────────────────────────────────────────────── */

async function readFollowingList(mine: number): Promise<void> {
  try {
    const next = await readFollowing(ctx!.podUrl);
    if (mine !== generation) return;
    const changed = JSON.stringify(next) !== JSON.stringify(following);
    following = next;
    followingError = null;
    if (changed) redraw();
  } catch (err) {
    if (mine !== generation) return;
    followingError = describePodError(err);
    redraw();
  }
}

/** Opens a followed address: read it now, and keep what was seen on your pod. */
async function readFollowed(address: string, mine: number): Promise<void> {
  const entry = following ? followedFor(address, following) : null;
  try {
    const seen = address.endsWith("/") ? { summary: await summarise(address) } : { file: await readFile(address) };
    if (mine !== generation) return;
    const before = opened.get(address);
    opened.set(address, seen);
    errors.delete(address);
    if (JSON.stringify(before?.summary ?? before?.file?.etag) !== JSON.stringify(seen.summary ?? seen.file?.etag)) redraw();
    if (entry && entry.address === address) {
      const summary = seen.summary ?? summaryOfFile(seen.file!);
      await recordVisit(ctx!.podUrl, entry, { summary }).catch(() => {});
    }
  } catch (err) {
    if (mine !== generation) return;
    errors.set(address, err);
    opened.delete(address);
    draw(false);
    if (entry && entry.address === address) await recordVisit(ctx!.podUrl, entry, { unreadable: true }).catch(() => {});
  }
}

/** The overview's form and sort, and an opened address's favourite and unfollow. */
function bindFollowing(): void {
  if (!frame) return;
  const reload = async (message?: string, undo?: () => void) => {
    following = await readFollowing(ctx!.podUrl).catch(() => following);
    if (message) toast(message, undo ? { undo } : {});
    draw(false);
  };
  frame.querySelector("#follow-open")?.addEventListener("click", () => {
    followForm = { error: null, pending: false };
    draw(false);
    frame?.querySelector<HTMLInputElement>("#follow-address")?.focus();
  });
  frame.querySelector("#follow-cancel")?.addEventListener("click", () => {
    followForm = null;
    draw(false);
    frame?.querySelector<HTMLElement>("#follow-open")?.focus();
  });
  frame.querySelector<HTMLFormElement>("#follow-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const address = frame!.querySelector<HTMLInputElement>("#follow-address")!.value;
    followForm = { error: null, pending: true };
    draw(false);
    try {
      const entry = await follow(ctx!.podUrl, address);
      followForm = null;
      await reload(`Following ${entry.title}.`);
    } catch (err) {
      followForm = { error: describePodError(err), pending: false };
      draw(false);
      const input = frame?.querySelector<HTMLInputElement>("#follow-address");
      if (input) {
        input.value = address;
        input.focus();
      }
    }
  });
  frame.querySelector<HTMLSelectElement>("#follow-sort")?.addEventListener("change", (e) => {
    sortBy = (e.target as HTMLSelectElement).value as SortBy;
    draw(false);
    frame?.querySelector<HTMLElement>("#follow-sort")?.focus();
  });
  if (route.name !== "followed") return;
  const address = route.address;
  frame.querySelector("#follow-this")?.addEventListener("click", async (e) => {
    (e.target as HTMLButtonElement).disabled = true;
    try {
      const entry = await follow(ctx!.podUrl, address);
      await reload(`Following ${entry.title}.`);
    } catch (err) {
      (e.target as HTMLButtonElement).disabled = false;
      toast(describePodError(err));
    }
  });
  const entry = following?.find((f) => f.address === address);
  if (!entry) return;
  frame.querySelector("#favourite")?.addEventListener("click", async () => {
    await setFavourite(ctx!.podUrl, address, !entry.favourite).catch((err) => toast(describePodError(err)));
    await reload();
    frame?.querySelector<HTMLElement>("#favourite")?.focus();
  });
  frame.querySelector("#unfollow")?.addEventListener("click", async () => {
    try {
      await unfollow(ctx!.podUrl, address);
    } catch (err) {
      toast(describePodError(err));
      return;
    }
    await reload(`Unfollowed ${entry.title}.`, () => {
      void changeFollowing(ctx!.podUrl, (entries) => (entries.some((f) => f.address === address) ? entries : [...entries, entry])).then(() => reload());
    });
  });
}
