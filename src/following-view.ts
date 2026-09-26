/**
 * Following in Places (slice C5): the overview of what you follow, and one
 * followed address opened, read only (canvas: PlacesFollowedList,
 * PlacesFollowed). The overview draws from `settings/following.ttl` alone;
 * an address is read only when it is opened, and the page says those reads
 * may show in its owner's access log.
 */
import type { Followed, Summary } from "./lib/following";
import type { FileContent, Item } from "./lib/files";
import { nameOf, parentOf } from "./lib/files";
import { routeHref } from "./router";
import { esc } from "./ui/patterns";
import { trimAddress } from "./ui/address";

export type SortBy = "latest" | "favourites";

export interface FollowForm {
  error: string | null;
  pending: boolean;
}

export function renderOverview(
  entries: Followed[] | null,
  error: string | null,
  sortBy: SortBy,
  form: FollowForm | null,
  when: (d: Date | null) => string,
  podUrl: string
): string {
  const shortAddress = (address: string) => trimAddress(address, podUrl);
  const lower = (s: string) => s.replace(/^Today/, "today").replace(/^Yesterday/, "yesterday");
  const cards = (entries ?? [])
    .map((f) => {
      const note = f.unreadableSince
        ? `<span class="excerpt is-warn">Not readable since ${esc(lower(when(f.unreadableSince)))}: its owner may have removed your access, or moved it.</span>`
        : f.excerpt
          ? `<span class="excerpt">${esc(f.excerpt)}</span>`
          : "";
      const meta = [
        f.modified ? `Changed ${lower(when(f.modified))}` : "",
        f.lastSeen ? `you last opened it ${lower(when(f.lastSeen))}` : "",
      ].filter(Boolean);
      return `
        <li><a class="fcard" href="${routeHref({ name: "followed", address: f.address })}">
          <span class="fcard-title"><strong>${esc(f.title || nameOf(f.address))}</strong>${f.favourite ? ` <span class="pill is-ok">Favourite</span>` : ""}</span>
          <span class="meta">${esc(shortAddress(f.address))}</span>
          ${note}
          ${meta.length ? `<span class="meta">${esc(meta.join(" · "))}</span>` : f.unreadableSince ? `<span class="meta">Kept until you unfollow it</span>` : ""}
        </a></li>`;
    })
    .join("");

  const list =
    error !== null
      ? `<p class="error" role="alert">${esc(error)}</p>`
      : entries === null
        ? `<p class="meta">Reading your list…</p>`
        : entries.length
          ? `<ul class="fcards">${cards}</ul>`
          : "";
  // Nothing followed yet: the form is the page, no step before it.
  const empty = entries?.length === 0 && error === null;
  const shown = form ?? (empty ? { error: null, pending: false } : null);

  return `
    <section class="places-main" aria-labelledby="places-title">
      <div class="places-head">
        <div>
          <h1 id="places-title" data-view-title>Followed</h1>
          <p class="meta">What others shared with you. Titles and excerpts are what you saw on your last visit, kept on your pod: this page reads nothing from their pods.</p>
        </div>
        ${shown ? "" : `<button class="small" type="button" id="follow-open">Follow an address</button>`}
      </div>
      ${
        shown
          ? `<form class="create-row" id="follow-form" novalidate>
               <div class="field"><label for="follow-address">Address someone shared with you</label>
                 <input id="follow-address" type="url" placeholder="https://…/shared/" autocomplete="off"${shown.pending ? " disabled" : ""}></div>
               <button type="submit" class="small"${shown.pending ? " disabled" : ""}>Follow</button>
               ${empty ? "" : `<button type="button" class="ghost small" id="follow-cancel">Cancel</button>`}
               ${shown.pending ? `<p class="meta" role="status">Reading it with your WebID…</p>` : ""}
               ${shown.error ? `<p class="error" role="alert">${esc(shown.error)}</p>` : ""}
               <p class="meta">Nobody can list what is shared with you: someone has to send you the address. It is kept only if your WebID can read it.</p>
             </form>`
          : ""
      }
      ${
        entries?.length
          ? `<div class="places-head">
               <label class="sort" for="follow-sort"><span class="meta">Sort by</span>
                 <select id="follow-sort">
                   <option value="latest"${sortBy === "latest" ? " selected" : ""}>Latest change</option>
                   <option value="favourites"${sortBy === "favourites" ? " selected" : ""}>Favourites first</option>
                 </select></label>
               <span class="meta">${entries.length} address${entries.length === 1 ? "" : "es"}</span>
             </div>`
          : ""
      }
      ${list}
    </section>`;
}

/** "shared / drafts / idea.md", from the followed address down. */
function trail(address: string, root: string, title: string): string {
  const steps: string[] = [];
  for (let at: string | null = address; at && at.startsWith(root); at = parentOf(at)) {
    steps.unshift(at);
    if (at === root) break;
  }
  const label = (u: string) => (u === root ? title : nameOf(u).replace(/\/$/, ""));
  return `<nav class="crumbs" aria-label="Path">${steps
    .map((u, i) =>
      i === steps.length - 1
        ? `<span aria-current="page">${esc(label(u))}</span>`
        : `<a href="${routeHref({ name: "followed", address: u })}">${esc(label(u))}</a>`
    )
    .join(` <span class="meta" aria-hidden="true">/</span> `)}</nav>`;
}

function what(item: Item): string {
  if (item.isFolder) return "Folder";
  const type = item.type?.split(";")[0] ?? "File";
  const size = item.size === null ? "" : item.size < 1024 ? ` · ${item.size} bytes` : ` · ${(item.size / 1024).toFixed(1)} kB`;
  return type + size;
}

export interface OpenedView {
  address: string;
  /** The followed entry it belongs to (itself, or the folder it is inside). */
  entry: Followed | null;
  summary: Summary | null;
  file: FileContent | null;
  error: string | null;
}

export function renderFollowed(view: OpenedView, when: (d: Date | null) => string, preview: (file: FileContent) => string, podUrl: string): string {
  const shortAddress = (address: string) => trimAddress(address, podUrl);
  const { address, entry } = view;
  const root = entry?.address ?? address;
  const title = entry?.title || nameOf(root).replace(/\/$/, "") || shortAddress(root);
  const owner = (() => {
    try {
      return new URL(root).host;
    } catch {
      return "its owner";
    }
  })();

  let body: string;
  if (view.error) {
    body = `<div class="error-state" role="alert"><h2>This cannot be read now</h2><p class="error">${esc(view.error)}</p>
      <p class="lead">Its owner may have removed your access, or moved it. It stays in your list until you unfollow it.</p>
      <p><button id="places-retry">Try again</button></p></div>`;
  } else if (address.endsWith("/")) {
    const items = view.summary?.items;
    body = !items
      ? `<p class="meta">Reading it with your WebID…</p>`
      : !items.length
        ? `<p class="meta">This folder is empty.</p>`
        : `<table class="items">
            <thead><tr><th scope="col">Name</th><th scope="col">What</th><th scope="col">Last modified</th></tr></thead>
            <tbody>${items
              .map(
                (i) => `<tr><td class="item-name"><a href="${routeHref({ name: "followed", address: i.url })}">${esc(i.name)}</a></td>
                  <td class="meta" data-label="What">${esc(what(i))}</td><td class="meta" data-label="Last modified">${esc(when(i.modified))}</td></tr>`
              )
              .join("")}</tbody>
          </table>`;
  } else {
    body = view.file
      ? `${preview(view.file)}<div class="actions"><button class="ghost small" type="button" id="download" data-url="${esc(address)}">Download</button></div>`
      : `<p class="meta">Reading it with your WebID…</p>`;
  }

  const onEntry = entry && address === entry.address;
  return `
    <section class="places-main" aria-labelledby="places-title">
      <div class="places-head">
        <div>
          <h1 id="places-title" data-view-title>${esc(title)}</h1>
          <span class="meta">${esc(shortAddress(root))}</span>
        </div>
        ${
          onEntry
            ? `<div class="actions">
                 <button class="ghost small" type="button" id="favourite" aria-pressed="${entry!.favourite}">${entry!.favourite ? "Remove from favourites" : "Favourite"}</button>
                 <button class="ghost small" type="button" id="unfollow">Unfollow</button>
               </div>`
            : entry
              ? ""
              : `<div class="actions"><button class="small" type="button" id="follow-this">Follow it</button></div>`
        }
      </div>
      <div class="places-title-row">
        <span class="pill">Read only</span>
        <span class="meta">You read it with your WebID. ${esc(owner)} may see these reads in its access log.</span>
      </div>
      ${entry ? trail(address, root, title) : ""}
      ${body}
    </section>`;
}
