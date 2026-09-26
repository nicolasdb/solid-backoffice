/**
 * Pods (slice C): your pod as a file explorer, and the pods you follow. Built
 * as an iceberg (docs/layout-brief.md, "Pods, the iceberg"; the canvas's Pods
 * boards): the list is the page (name, size, last change, sortable columns
 * you can hide or reorder); `···` on a row opens its menu (who can access
 * it in one sentence, rename, move, delete set apart); "Change who can access
 * it" opens the drawer, with the technical rules at its bottom. No panel is
 * open until you ask for one; a phone shows the menu as a sheet.
 *
 * Reads follow ADR 007 (docs/explanation/reading-pods.md): what was last seen
 * is drawn at once from memory, the pod is read behind it, and the screen is
 * redrawn only when that changes something and nobody is typing. A folder's
 * list never waits: each subfolder's count fills in as it is read, and an
 * item's rules are read only when asked for (its menu, or the access column).
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
import { accessSentence, bindAccess, labelOf, loadDraft, renderAccess, rulesOf, type Draft, type Group } from "./access-panel";
import { podLabel, webIdName } from "./ui/address";
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
/** Folders whose items could not be counted (not readable to you). */
const uncounted = new Set<string>();
/** The item whose ··· menu is open, and where (a phone shows it as a sheet). */
let menu: { url: string; top: number; left: number } | null = null;
/** The item whose access is open in the drawer. */
let drawer: string | null = null;
/** The Columns menu above the list. */
let columnsOpen = false;
/** The access draft, for the item in the menu or the drawer (C2). */
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
  uncounted.clear();
  menu = null;
  drawer = null;
  columnsOpen = false;
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

/** Who can read, in a few words: "Anyone", "Only you", "You · HyperScope's agent". */
export function whoCanRead(rules: Pick<AccessRules, "agents" | "public" | "authenticated">, names: Map<string, string>): string {
  if (rules.public.includes("read")) return "Anyone";
  if (rules.authenticated.includes("read")) return "Anyone signed in";
  const readers = rules.agents.filter((a) => a.modes.includes("read"));
  const parts = ["You"];
  if (readers.length === 1) parts.push(names.get(readers[0].webId) ?? webIdName(readers[0].webId));
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

export function size(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const KIND_LABEL: Record<string, string> = { markdown: "Markdown", text: "Text", json: "JSON", image: "Image", other: "File" };

/* ── Columns: shown, hidden, ordered, sorted ───────────────────────────── */

export type Column = "size" | "modified" | "type" | "access";
export type SortKey = "name" | "size" | "modified" | "type";

const COLUMN_LABEL: Record<Column, string> = { size: "Size", modified: "Last modified", type: "Type", access: "Who can access it" };

export interface ColumnPrefs {
  order: Column[];
  hidden: Column[];
  sort: { key: SortKey; dir: "asc" | "desc" };
}

export const DEFAULT_COLUMNS: ColumnPrefs = {
  order: ["size", "modified", "type", "access"],
  hidden: ["type", "access"],
  sort: { key: "modified", dir: "desc" },
};

/** Kept in this browser only: a way of looking, never pod content. */
const PREFS_KEY = "backoffice.pods.columns";

function readPrefs(): ColumnPrefs {
  try {
    const kept = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null") as ColumnPrefs | null;
    const all = DEFAULT_COLUMNS.order;
    if (!kept || !Array.isArray(kept.order) || !Array.isArray(kept.hidden) || !kept.sort) return structuredClone(DEFAULT_COLUMNS);
    const order = [...kept.order.filter((c) => all.includes(c)), ...all.filter((c) => !kept.order.includes(c))];
    return { order, hidden: kept.hidden.filter((c) => all.includes(c)), sort: kept.sort };
  } catch {
    return structuredClone(DEFAULT_COLUMNS);
  }
}

function keepPrefs(): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* private window: the choice lasts until the page is closed */
  }
}

let prefs: ColumnPrefs = readPrefs();

function shown(): Column[] {
  return prefs.order.filter((c) => !prefs.hidden.includes(c));
}

/** Folders first, then the chosen column; names break ties. */
export function sortItems(items: Item[], sort: ColumnPrefs["sort"], count: (url: string) => number | null): Item[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  const value = (i: Item): number | string => {
    if (sort.key === "name") return i.name.toLowerCase();
    if (sort.key === "modified") return i.modified?.getTime() ?? 0;
    if (sort.key === "size") return (i.isFolder ? count(i.url) : i.size) ?? -1;
    return i.isFolder ? "" : (i.type ?? "");
  };
  return [...items].sort((a, b) => {
    if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
    const va = value(a);
    const vb = value(b);
    const c = va < vb ? -1 : va > vb ? 1 : 0;
    return c * sign || a.name.localeCompare(b.name);
  });
}

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
  const pod = podLabel(ctx!.podUrl);
  const current = route.name === "followed" ? followedFor(route.address, following ?? [])?.address : null;
  const followed = sortFollowing(following ?? [], "favourites");
  return `
    <nav class="places-side" aria-label="Pods">
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
      <span class="label-mono">Pod</span>
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

/** Items inside a folder, once read; null before. */
function countOf(url: string): number | null {
  return listings.get(url)?.length ?? null;
}

function sizeCell(item: Item): string {
  if (!item.isFolder) return esc(size(item.size));
  const n = countOf(item.url);
  if (n !== null) return `${n} item${n === 1 ? "" : "s"}`;
  return uncounted.has(item.url) ? "" : `<span class="is-loading">…</span>`;
}

function cell(column: Column, item: Item): string {
  switch (column) {
    case "size":
      return `<td class="meta num" data-label="Size" data-count="${esc(item.url)}">${sizeCell(item)}</td>`;
    case "modified":
      return `<td class="meta" data-label="Last modified">${esc(when(item.modified))}</td>`;
    case "type":
      return `<td class="meta" data-label="Type">${item.isFolder ? "Folder" : esc(KIND_LABEL[kindFromItem(item)] ?? "File")}</td>`;
    case "access":
      return `<td class="meta" data-label="Who can access it" data-rules="${esc(item.url)}">${rulesCell(item.url)}</td>`;
  }
}

function renderRow(item: Item): string {
  const icon = item.isFolder
    ? `<path d="M3 7h7l2 2h9v10H3z"/>`
    : `<path d="M6 3h8l4 4v14H6z"/>`;
  const on = menu?.url === item.url || drawer === item.url;
  return `
    <tr data-url="${esc(item.url)}"${on ? ' class="is-selected"' : ""}>
      <td class="item-name">
        <svg class="item-icon" viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>
        <a href="${hrefOf(item.url)}">${esc(item.name)}</a>
      </td>
      ${shown().map((c) => cell(c, item)).join("")}
      <td class="row-actions"><button class="ghost small" type="button" data-menu="${esc(item.url)}" aria-haspopup="dialog" aria-label="More for ${esc(item.name)}">···</button></td>
    </tr>`;
}

function renderHead(): string {
  const th = (key: SortKey, label: string) => {
    const on = prefs.sort.key === key;
    const sort = on ? ` aria-sort="${prefs.sort.dir === "asc" ? "ascending" : "descending"}"` : "";
    return `<th scope="col"${sort}><button type="button" class="th-sort" data-sort="${key}">${esc(label)}${on ? ` <span aria-hidden="true">${prefs.sort.dir === "asc" ? "↑" : "↓"}</span>` : ""}</button></th>`;
  };
  return `<thead><tr>
    ${th("name", "Name")}
    ${shown().map((c) => (c === "access" ? `<th scope="col">${COLUMN_LABEL.access}</th>` : th(c, COLUMN_LABEL[c]))).join("")}
    <th scope="col" class="row-actions"><button type="button" class="th-sort" id="columns" aria-haspopup="dialog" aria-expanded="${columnsOpen}">Columns ▾</button></th>
  </tr></thead>`;
}

function renderColumns(): string {
  if (!columnsOpen) return "";
  const line = (c: Column, i: number) => `
    <li class="colpick">
      <label><input type="checkbox" data-col="${c}"${prefs.hidden.includes(c) ? "" : " checked"}> ${esc(COLUMN_LABEL[c])}</label>
      <span class="colpick-move">
        <button class="ghost small" type="button" data-col-up="${c}" aria-label="Move ${esc(COLUMN_LABEL[c])} left"${i === 0 ? " disabled" : ""}>↑</button>
        <button class="ghost small" type="button" data-col-down="${c}" aria-label="Move ${esc(COLUMN_LABEL[c])} right"${i === prefs.order.length - 1 ? " disabled" : ""}>↓</button>
      </span>
    </li>`;
  return `
    <div class="columns-menu" role="dialog" aria-label="Columns" id="columns-menu">
      <span class="label-mono">Columns</span>
      <ul>
        <li class="colpick"><label><input type="checkbox" checked disabled> Name</label></li>
        ${prefs.order.map(line).join("")}
      </ul>
      <p class="meta">Kept in this browser, never on your pod.</p>
    </div>`;
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
          ${renderHead()}
          <tbody>${sortItems(items, prefs.sort, countOf).map(renderRow).join("")}</tbody>
        </table>`;
  return `
    <section class="places-main" aria-labelledby="places-title">
      <h1 id="places-title" class="visually-hidden" data-view-title>${esc(url === ctx!.podUrl ? "My pod" : nameOf(url))}</h1>
      <div class="places-head">
        <div class="places-title-row">${breadcrumb(url)}<button class="ghost small" type="button" data-menu="${esc(url)}" aria-haspopup="dialog" aria-label="More for ${esc(url === ctx!.podUrl ? "My pod" : nameOf(url))}">···</button></div>
        <div class="actions">
          <button class="ghost small" type="button" id="new-folder">New folder</button>
          <button class="ghost small" type="button" id="new-file">New file</button>
          <button class="small" type="button" id="upload">Upload</button>
          <input type="file" id="upload-input" multiple hidden>
        </div>
      </div>
      ${renderCreate()}
      <p class="meta" id="upload-status" role="status" hidden></p>
      <div id="places-list" class="places-list">${renderColumns()}${list}</div>
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

/** Where an item's rules come from, in a few words. */
function originLine(d: Draft): string {
  if (d.own) return d.url.endsWith("/") ? "Its own rules. They cover what is inside, unless an item has its own." : "Its own rules.";
  const from = d.from === ctx!.podUrl ? "My pod" : nameOf(d.from);
  return `Same as ${from}.`;
}

function itemOf(url: string): Item | undefined {
  return listings.get(parentOf(url) ?? "")?.find((i) => i.url === url);
}

/** Level 1: an item's ··· menu. Who can access it first, then what can be done. */
function renderMenu(): string {
  if (!menu) return "";
  const url = menu.url;
  const item = itemOf(url);
  const isFolder = url.endsWith("/");
  const name = url === ctx!.podUrl ? "My pod" : nameOf(url);
  const n = isFolder ? countOf(url) : null;
  const facts = [
    isFolder ? "Folder" : KIND_LABEL[files.get(url)?.kind ?? kindFromItem(item)] ?? "File",
    n !== null ? `${n} item${n === 1 ? "" : "s"} inside` : "",
    item && !isFolder ? size(item.size) : "",
    item?.modified ? `last modified ${when(item.modified).replace(/^Today/, "today").replace(/^Yesterday/, "yesterday")}` : "",
  ].filter(Boolean);
  const d = draft?.url === url ? draft : null;
  const label = (webId: string) => labelOf(webId, accessEnv());
  const who = d
    ? `<p>${esc(accessSentence(!d.own && d.parent ? d.parent.access : rulesOf(d), label))}</p><p class="meta">${esc(originLine(d))}</p>`
    : draftError?.url === url
      ? `<p class="error">${esc(draftError.message)}</p>`
      : `<p class="meta">Reading its rules…</p>`;
  return `
    <div class="menu-scrim" id="menu-scrim"></div>
    <div class="item-menu" role="dialog" aria-labelledby="menu-title" id="item-menu" style="--menu-top: ${menu.top}px; --menu-left: ${menu.left}px">
      <div class="menu-sec">
        <div class="menu-head"><h2 id="menu-title" tabindex="-1">${esc(name)}</h2><button class="ghost small" type="button" id="menu-close" aria-label="Close">✕</button></div>
        <p class="meta">${esc(facts.join(" · "))}</p>
      </div>
      <div class="menu-sec">
        <span class="label-mono">Who can access it</span>
        ${who}
        <button class="ghost small" type="button" id="change-access"${d ? "" : " disabled"}>Change who can access it</button>
      </div>
      <div class="menu-sec">${renderActions(url, changes.change, changeEnv())}</div>
    </div>`;
}

/** Level 2 and 3: who can access it, and the technical rules at the bottom. */
function renderDrawer(): string {
  if (!drawer) return "";
  const url = drawer;
  const name = url === ctx!.podUrl ? "My pod" : nameOf(url);
  const d = draft?.url === url ? draft : null;
  return `
    <div class="drawer-scrim" id="drawer-scrim"></div>
    <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" id="drawer">
      <div class="drawer-head"><h2 id="drawer-title" tabindex="-1">Who can access ${esc(name)}</h2><button class="ghost small" type="button" id="drawer-close">Close</button></div>
      ${renderAccess(d, accessEnv(), d || draftError?.url !== url ? null : draftError.message)}
      ${d ? renderRules(d, raw, rulesEnv(), technicalOpen === url) : ""}
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
  const edit = editing?.url === url ? editing : null;
  const body = edit
    ? renderEditor(edit)
    : file
      ? renderPreview(file)
      : errors.has(url)
        ? renderFailure(errors.get(url))
        : renderPending(`Reading ${nameOf(url)}…`);
  const actions = edit
    ? renderEditorActions(edit)
    : `${file && canEdit(file) ? `<button class="small" type="button" id="edit">Edit</button>` : ""}
       <button class="ghost small" type="button" id="download" data-url="${esc(url)}">Download</button>
       <button class="ghost small" type="button" data-menu="${esc(url)}" aria-haspopup="dialog" aria-label="More for ${esc(nameOf(url))}">···</button>`;
  return `
    <section class="places-main places-file" aria-labelledby="places-title">
      <h1 id="places-title" class="visually-hidden" data-view-title>${esc(nameOf(url))}</h1>
      <div class="places-head">
        <div class="places-title-row">${breadcrumb(url)}${file ? `<span class="pill">${esc(KIND_LABEL[file.kind])}</span>` : ""}</div>
        <div class="actions">${actions}</div>
      </div>
      <div id="places-file">${body}</div>
      ${
        file?.modified || edit
          ? `<p class="meta file-status" role="status">${file?.modified ? `Last saved ${esc(when(file.modified))}.` : ""}${edit ? " Save writes only if nobody changed the file since you opened it." : ""}</p>`
          : ""
      }
    </section>`;
}

/** The item whose rules are on screen: in the drawer, else in the menu. */
function accessUrl(): string | null {
  return drawer ?? menu?.url ?? null;
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
  for (const key of [...uncounted]) if (key.startsWith(prefix)) uncounted.delete(key);
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
    return `<div class="places-grid is-file">${renderSide()}${renderOverview(following ? sortFollowing(following, sortBy) : null, followingError, sortBy, followForm, when, ctx!.podUrl)}</div>`;
  }
  if (route.name === "followed") {
    return `<div class="places-grid is-file">${renderSide()}${renderFollowed(openedView(route.address), when, renderPreview, ctx!.podUrl)}</div>`;
  }
  const url = herePod()!;
  const overlays = renderMenu() + renderDrawer();
  if (!url.endsWith("/")) return `<div class="places-grid is-wide">${renderFile(url)}</div>${overlays}`;
  return `<div class="places-grid">${renderSide()}${renderFolder(url)}</div>${overlays}`;
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
    Boolean(changes.change) ||
    rawDirty(raw) ||
    Boolean(raw?.armed)
  );
}

/** Redraws after a read, unless someone is typing; keeps focus where it was. */
function redraw(): void {
  if (!frame || inUse()) return;
  const active = document.activeElement as HTMLElement | null;
  const key = active && frame.contains(active) ? (active.dataset.menu ? `[data-menu="${CSS.escape(active.dataset.menu)}"]` : active.id ? `#${CSS.escape(active.id)}` : null) : null;
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
  await Promise.all([readCounts(items, mine), shown().includes("access") ? readRules(items.map((i) => i.url), mine) : null]);
}

/** Each subfolder's items, read at once: its count on the row, and its list drawn at once when opened. */
async function readCounts(items: Item[], mine: number): Promise<void> {
  await Promise.allSettled(
    items
      .filter((i) => i.isFolder)
      .map(async (folder) => {
        const was = countOf(folder.url);
        try {
          listings.set(folder.url, await listFolder(folder.url));
          uncounted.delete(folder.url);
        } catch {
          uncounted.add(folder.url);
        }
        if (mine !== generation) return;
        if (countOf(folder.url) !== was || was === null) patchCount(folder.url);
      })
  );
}

function patchCount(url: string): void {
  const item = itemOf(url);
  const target = frame?.querySelector<HTMLElement>(`[data-count="${CSS.escape(url)}"]`);
  if (item && target) target.innerHTML = sizeCell(item);
}

/** Each row's rules for the access column, as they arrive; one walk up per folder, shared by its items. */
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
  const target = frame?.querySelector<HTMLElement>(`[data-rules="${CSS.escape(url)}"]`);
  if (target) target.innerHTML = rulesCell(url);
}

async function readOne(url: string, mine: number): Promise<void> {
  const parent = parentOf(url) ?? ctx!.podUrl;
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
  // The folder is read too, so the way back lands on a list already drawn.
  if (!listings.has(parent)) void listFolder(parent).then((items) => listings.set(parent, items)).catch(() => {});
}

/* ── Wiring ────────────────────────────────────────────────────────────── */

function bind(): void {
  if (!frame) return;
  frame.querySelector<HTMLSelectElement>("#place-picker")?.addEventListener("change", (e) => {
    location.hash = (e.target as HTMLSelectElement).value;
  });
  bindColumns();
  frame.querySelectorAll<HTMLButtonElement>("[data-menu]").forEach((button) =>
    button.addEventListener("click", () => openMenu(button.dataset.menu!, button))
  );
  const closeMenu = () => {
    const back = menu?.url;
    menu = null;
    changes.change = null;
    draw(false);
    if (back) frame?.querySelector<HTMLElement>(`[data-menu="${CSS.escape(back)}"]`)?.focus();
  };
  frame.querySelector("#menu-close")?.addEventListener("click", closeMenu);
  frame.querySelector("#menu-scrim")?.addEventListener("click", () => {
    if (!changes.change?.progress) closeMenu();
  });
  frame.querySelector("#item-menu")?.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Escape" && !changes.change?.progress) closeMenu();
  });
  frame.querySelector("#change-access")?.addEventListener("click", () => {
    if (!menu) return;
    openDrawer(menu.url);
  });

  const closeDrawer = () => {
    const back = drawer;
    drawer = null;
    draft = null;
    raw = null;
    technicalOpen = null;
    draw(false);
    if (back) frame?.querySelector<HTMLElement>(`[data-menu="${CSS.escape(back)}"]`)?.focus();
  };
  frame.querySelector("#drawer-close")?.addEventListener("click", closeDrawer);
  frame.querySelector("#drawer-scrim")?.addEventListener("click", closeDrawer);
  frame.querySelector("#drawer")?.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Escape") closeDrawer();
  });

  const url = accessUrl();
  if (url && draft?.url !== url && draftError?.url !== url) void startDraft(url, generation);
  const aside = frame.querySelector<HTMLElement>("#drawer");
  if (drawer && aside && draft?.url === drawer) {
    const open = draft;
    bindAccess(aside, open, accessEnv(), {
      changed: () => drawKeepingFocus(),
      saved: (message) => {
        draft = null;
        rows.clear();
        if (message) toast(message);
        void showPlaces(route, false);
      },
      open: (target) => openDrawer(target),
    });
    bindRules(aside, open, raw, ctx!.webId, {
      changed: () => drawKeepingFocus(),
      saved: (message) => {
        raw = null;
        draft = null;
        rows.clear();
        toast(message);
        void showPlaces(route, false);
      },
      toggled: (isOpen) => {
        technicalOpen = isOpen ? open.url : null;
      },
      edit: () => {
        raw = startRaw(open);
        technicalOpen = open.url;
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
  const itemMenu = frame.querySelector<HTMLElement>("#item-menu");
  if (menu && itemMenu) {
    bindActions(itemMenu, menu.url, changes, changeEnv(), {
      changed: () => drawKeepingFocus(),
      done: (from, to, message) => {
        forgetUnder(from);
        toast(message);
        menu = null;
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

/** Opens an item's ··· menu under its button (a sheet on a phone). */
function openMenu(url: string, button: HTMLElement): void {
  const box = frame!.getBoundingClientRect();
  const at = button.getBoundingClientRect();
  const width = 320;
  menu = { url, top: Math.round(at.bottom - box.top + 4), left: Math.max(0, Math.round(at.right - box.left - width)) };
  drawer = null;
  if (draft?.url !== url) draft = null;
  if (changes.change?.url !== url) changes.change = null;
  raw = null;
  draw(false);
  // Near the bottom of the screen the menu opens upward, and it never leaves the frame's left edge.
  const el = frame?.querySelector<HTMLElement>("#item-menu");
  if (el && getComputedStyle(el).position !== "fixed") {
    const h = el.offsetHeight;
    const w = el.offsetWidth || width;
    if (at.bottom + 4 + h > window.innerHeight && at.top - 4 - h >= 0) menu.top = Math.round(at.top - box.top - 4 - h);
    menu.left = Math.max(0, Math.round(at.right - box.left - w));
    el.style.setProperty("--menu-top", `${menu.top}px`);
    el.style.setProperty("--menu-left", `${menu.left}px`);
  }
  frame?.querySelector<HTMLElement>("#menu-title")?.focus();
}

/** Opens the access drawer for `url`: the item's own, or the parent it inherits from. */
function openDrawer(url: string): void {
  menu = null;
  changes.change = null;
  drawer = url;
  if (draft?.url !== url) draft = null;
  raw = null;
  technicalOpen = null;
  draw(false);
  frame?.querySelector<HTMLElement>("#drawer-title")?.focus();
}

/** Sorting by a column, and the Columns menu: show, hide, reorder. */
function bindColumns(): void {
  if (!frame) return;
  frame.querySelectorAll<HTMLButtonElement>("[data-sort]").forEach((button) =>
    button.addEventListener("click", () => {
      const key = button.dataset.sort as SortKey;
      prefs.sort = prefs.sort.key === key ? { key, dir: prefs.sort.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" || key === "type" ? "asc" : "desc" };
      keepPrefs();
      draw(false);
      frame?.querySelector<HTMLElement>(`[data-sort="${key}"]`)?.focus();
    })
  );
  frame.querySelector("#columns")?.addEventListener("click", () => {
    columnsOpen = !columnsOpen;
    draw(false);
    frame?.querySelector<HTMLElement>(columnsOpen ? "#columns-menu input:not([disabled])" : "#columns")?.focus();
  });
  frame.querySelector("#columns-menu")?.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key !== "Escape") return;
    columnsOpen = false;
    draw(false);
    frame?.querySelector<HTMLElement>("#columns")?.focus();
  });
  frame.querySelectorAll<HTMLInputElement>("[data-col]").forEach((box) =>
    box.addEventListener("change", () => {
      const column = box.dataset.col as Column;
      prefs.hidden = box.checked ? prefs.hidden.filter((c) => c !== column) : [...prefs.hidden, column];
      keepPrefs();
      draw(false);
      frame?.querySelector<HTMLElement>(`[data-col="${column}"]`)?.focus();
      const here = herePod();
      const items = here ? listings.get(here) : undefined;
      if (column === "access" && box.checked && items) void readRules(items.map((i) => i.url).filter((u) => !rows.has(u)), generation);
    })
  );
  const shift = (column: Column, by: number) => {
    const order = [...prefs.order];
    const i = order.indexOf(column);
    const j = i + by;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    prefs.order = order;
    keepPrefs();
    draw(false);
    frame?.querySelector<HTMLElement>(`[data-col-${by < 0 ? "up" : "down"}="${column}"]:not([disabled])`)?.focus();
  };
  frame.querySelectorAll<HTMLButtonElement>("[data-col-up]").forEach((b) => b.addEventListener("click", () => shift(b.dataset.colUp as Column, -1)));
  frame.querySelectorAll<HTMLButtonElement>("[data-col-down]").forEach((b) => b.addEventListener("click", () => shift(b.dataset.colDown as Column, 1)));
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
    if (mine !== generation || accessUrl() !== url) return;
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
      : ["data-menu", "data-remove", "data-add", "data-person", "data-view", "data-open-access"].map((a) => active.getAttribute(a) !== null ? `[${a}="${CSS.escape(active.getAttribute(a)!)}"]` : "").find(Boolean) ||
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
    menu = null;
    drawer = null;
    columnsOpen = false;
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
