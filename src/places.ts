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
import { effectiveAccess, downloadFile, listFolder, nameOf, parentOf, readFile, type Effective, type FileContent, type Item } from "./lib/files";
import { forgetAclLocations, type AccessRules } from "./lib/acl";
import { describePodError, isAuthError } from "./lib/pod";
import { routeHref, type Route } from "./router";
import { renderMarkdown } from "./ui/markdown";
import { busy } from "./ui/typing";
import { esc, renderError, renderPending } from "./ui/patterns";
import { focusView } from "./ui/a11y";

export interface PlacesContext {
  webId: string;
  podUrl: string;
  /** Labels for WebIDs the app already knows: "HyperScope's agent", a member's name. */
  names: Map<string, string>;
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
/** The item shown in the panel (a phone shows it as a sheet). */
let selected: string | null = null;
let sheetOpen = false;
let frame: HTMLElement | null = null;
let ctx: PlacesContext | null = null;
let route: Route = { name: "places", path: "" };
/** A newer navigation wins over an older one's reads. */
let generation = 0;
/** Object URLs of images on screen, released when the screen changes. */
let objectUrls: string[] = [];

export function forgetPlaces(): void {
  listings.clear();
  rows.clear();
  files.clear();
  selected = null;
  sheetOpen = false;
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
  return `
    <nav class="places-side" aria-label="Places">
      <div class="places-group">
        <span class="label-mono">Yours</span>
        <a class="place${onPod ? " is-current" : ""}" href="${routeHref({ name: "places", path: "" })}"${onPod ? ' aria-current="page"' : ""}>
          <span>My pod</span><span class="meta">${esc(pod)}</span>
        </a>
      </div>
    </nav>
    <label class="field place-picker">
      <span class="label-mono">Place</span>
      <select id="place-picker">
        <option value="${routeHref({ name: "places", path: "" })}"${onPod ? " selected" : ""}>My pod · ${esc(pod)}</option>
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
    ? renderPending("Reading this folder…")
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
      <div class="places-head">${breadcrumb(url)}</div>
      <div id="places-list">${list}</div>
    </section>`;
}

/** The panel: one item, or the folder itself when nothing is selected. */
function renderPanel(folderUrl: string): string {
  const url = selected ?? folderUrl;
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

  let rules: string;
  if (r === "error") rules = `<p class="meta">Its rules could not be read.</p>`;
  else if (!r) rules = `<p class="meta">Reading its rules…</p>`;
  else if (r.own) rules = `<p class="meta">${isFolder ? "This folder" : "This file"} has rules of its own.</p>`;
  else {
    const from = r.from === ctx!.podUrl ? "My pod" : nameOf(r.from ?? "");
    rules = `<p class="meta">No rules of its own: it follows <strong>${esc(from)}</strong>.</p>`;
  }

  return `
    <aside class="places-panel${sheetOpen ? " is-open" : ""}" aria-label="${esc(name)}">
      <div class="panel-head">
        <h2>${esc(name)}</h2>
        <span class="pill">${isFolder ? "Folder" : esc(KIND_LABEL[kindFromItem(item)] ?? "File")}</span>
        <button class="ghost small sheet-close" type="button" id="sheet-close">Close</button>
      </div>
      ${facts.length ? `<p class="meta">${esc(facts.join(" · "))}</p>` : ""}
      <div class="panel-block">
        <span class="label-mono">Who can read it</span>
        <p>${r && r !== "error" ? esc(r.who) : ""}</p>
        ${rules}
      </div>
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
  const body = file ? renderPreview(file) : renderPending(`Reading ${nameOf(url)}…`);
  const parent = parentOf(url) ?? ctx!.podUrl;
  return `
    <section class="places-main places-file" aria-labelledby="places-title">
      <h1 id="places-title" class="visually-hidden" data-view-title>${esc(nameOf(url))}</h1>
      <div class="places-head">
        <div class="places-title-row">${breadcrumb(url)}${file ? `<span class="pill">${esc(KIND_LABEL[file.kind])}</span>` : ""}</div>
        <div class="actions">
          <button class="ghost small" type="button" id="download" data-url="${esc(url)}">Download</button>
          <a class="button-link" href="${hrefOf(parent)}">Close</a>
        </div>
      </div>
      <div id="places-file">${body}</div>
      <div class="file-status" role="status">
        <p class="meta">${file?.modified ? `Last saved ${esc(when(file.modified))} · ` : ""}who can read it: <strong>${r && r !== "error" ? esc(r.who) : "…"}</strong></p>
      </div>
    </section>`;
}

function renderPlaces(): string {
  const url = urlOf((route as { path: string }).path);
  const main = url.endsWith("/") ? renderFolder(url) + renderPanel(url) : renderFile(url);
  return `<div class="places-grid${url.endsWith("/") ? "" : " is-file"}">${renderSide()}${main}</div>`;
}

function draw(focus: boolean): void {
  if (!frame) return;
  releaseObjectUrls();
  frame.innerHTML = renderPlaces();
  bind();
  if (focus) focusView(frame);
}

/** Redraws after a read, unless someone is typing; keeps focus where it was. */
function redraw(): void {
  if (!frame || busy(frame)) return;
  const active = document.activeElement as HTMLElement | null;
  const key = active && frame.contains(active) ? (active.dataset.select ? `[data-select="${CSS.escape(active.dataset.select)}"]` : active.id ? `#${CSS.escape(active.id)}` : null) : null;
  draw(false);
  if (key) frame.querySelector<HTMLElement>(key)?.focus();
}

function showError(err: unknown, where: string): void {
  const target = frame?.querySelector<HTMLElement>(where);
  if (!target) return;
  target.innerHTML = renderError({
    title: isAuthError(err) ? "Your session ended" : "This could not be read",
    detail: describePodError(err),
    action: { label: "Try again", id: "places-retry" },
    technical: err instanceof Error ? err.message : String(err),
  });
  target.querySelector("#places-retry")?.addEventListener("click", () => showPlaces(route));
}

/* ── Reading ───────────────────────────────────────────────────────────── */

async function readFolder(url: string, mine: number): Promise<void> {
  const before = JSON.stringify(listings.get(url) ?? null);
  let items: Item[];
  try {
    items = await listFolder(url);
  } catch (err) {
    if (mine !== generation) return;
    if (!listings.has(url)) showError(err, "#places-list");
    return;
  }
  if (mine !== generation) return;
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
  const current = urlOf((route as { path: string }).path);
  const inPanel = (selected ?? current) === url || current === url;
  if (inPanel && !busy(frame)) {
    const panel = frame.querySelector(".places-panel, .file-status");
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
    if (!was || was.etag !== file.etag || was.etag === null) redraw();
  } catch (err) {
    if (mine !== generation) return;
    files.delete(url);
    showError(err, "#places-file");
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
      draw(false);
      frame?.querySelector<HTMLElement>(".places-panel h2")?.setAttribute("tabindex", "-1");
      frame?.querySelector<HTMLElement>(".places-panel h2")?.focus();
    })
  );
  frame.querySelector("#sheet-close")?.addEventListener("click", () => {
    const back = selected;
    sheetOpen = false;
    selected = null;
    draw(false);
    if (back) frame?.querySelector<HTMLElement>(`[data-select="${CSS.escape(back)}"]`)?.focus();
  });
  const download = frame.querySelector<HTMLButtonElement>("#download");
  download?.addEventListener("click", async () => {
    const url = download.dataset.url!;
    download.disabled = true;
    try {
      await downloadFile(url, files.get(url));
    } catch (err) {
      showError(err, url.endsWith("/") ? "#places-list" : "#places-file");
    } finally {
      download.disabled = false;
    }
  });
}

/** First entry into Places: remembers the frame and who is signed in. */
export function mountPlaces(el: HTMLElement, next: Route, context: PlacesContext): void {
  frame = el;
  ctx = context;
  showPlaces(next, true);
}

/**
 * A navigation inside Places: drawn from memory at once, then the pod is read
 * behind it. Returns once the reads are done (tests wait on it).
 */
export async function showPlaces(next: Route, focus = true): Promise<void> {
  if (!frame || !ctx) return;
  const moved = JSON.stringify(next) !== JSON.stringify(route);
  route = next.name === "places" ? next : { name: "places", path: "" };
  if (moved) {
    selected = null;
    sheetOpen = false;
  }
  const mine = ++generation;
  draw(focus);
  const url = urlOf(route.path);
  if (url.endsWith("/")) await readFolder(url, mine);
  else await readOne(url, mine);
}
