/**
 * Rename, Move and Delete in an item's ··· menu (slice C4), over src/lib/move.ts.
 * Each asks first in place: a new name, a destination folder, or "Delete it
 * and the 12 items inside?". While it runs, the panel says which stage it is
 * at; a move copies everything before it deletes anything.
 */
import { countInside, deleteTree, move, protectedReason, type Progress } from "./lib/move";
import { childUrl, nameOf, nameProblem, parentOf } from "./lib/files";
import { describePodError } from "./lib/pod";
import { esc } from "./ui/patterns";

export interface Change {
  kind: "rename" | "move" | "delete";
  url: string;
  /** Items inside a folder to delete; null while counting. */
  count: number | null;
  progress: string | null;
  error: string | null;
}

export interface ChangeEnv {
  webId: string;
  podUrl: string;
  /** Folders the app has seen, for Move's destinations. */
  folders: string[];
}

export interface ChangeHooks {
  changed(): void;
  /** Done: `from` is gone, `to` is where it is now (null after a delete). */
  done(from: string, to: string | null, message: string): void;
}

function label(url: string, podUrl: string): string {
  return url === podUrl ? "My pod" : "My pod / " + decodeURI(url.slice(podUrl.length)).replace(/\/$/, "").split("/").join(" / ");
}

function stage(p: Progress): string {
  if (p.stage === "copy") return `Copying ${p.done} of ${p.total}…`;
  if (p.stage === "check") return "Checking the copy…";
  return `Removing the old place: ${p.done} of ${p.total}…`;
}

/** Where `url` may go: known folders, not itself, not inside it, not where it is. */
export function destinations(url: string, env: ChangeEnv): string[] {
  const parent = parentOf(url);
  return [...new Set([env.podUrl, ...env.folders])]
    .filter((f) => f.startsWith(env.podUrl) && f !== parent && !f.startsWith(url) && f !== url)
    .sort();
}

export function renderActions(url: string, change: Change | null, env: ChangeEnv): string {
  const reason = protectedReason(url, env.podUrl);
  if (reason) return `<p class="meta">${esc(reason)}</p>`;
  const name = nameOf(url).replace(/\/$/, "");
  const busy = Boolean(change?.progress);
  // Delete sits apart from the rest: it cannot be undone (the iceberg's deep part).
  const buttons = `<div class="menu-row">
    <div class="menu-actions">
      <button class="menu-item" type="button" data-change="rename"${busy ? " disabled" : ""}>Rename</button>
      <button class="menu-item" type="button" data-change="move"${busy ? " disabled" : ""}>Move</button>
    </div>
    <div class="menu-actions is-apart">
      <button class="menu-item is-warn" type="button" data-change="delete"${busy ? " disabled" : ""}>Delete…</button>
    </div></div>`;
  if (!change || change.url !== url) return buttons;

  const status = change.progress ? `<p class="meta" role="status">${esc(change.progress)}</p>` : "";
  const error = change.error ? `<p class="error" role="alert">${esc(change.error)}</p>` : "";
  const cancel = `<button type="button" class="ghost small" id="change-cancel"${busy ? " disabled" : ""}>Cancel</button>`;

  if (change.kind === "rename") {
    return `
      <form class="panel-block" id="change-form" novalidate>
        <div class="field"><label for="rename-name">New name</label>
          <input id="rename-name" type="text" value="${esc(name)}" autocomplete="off" spellcheck="false"${busy ? " disabled" : ""}></div>
        <p class="meta">${url.endsWith("/") ? "Everything inside moves with it, with its rules." : "Its rules move with it."}</p>
        ${error}${status}
        <div class="actions"><button type="submit" class="small"${busy ? " disabled" : ""}>Rename</button>${cancel}</div>
      </form>`;
  }
  if (change.kind === "move") {
    const options = destinations(url, env);
    return `
      <form class="panel-block" id="change-form" novalidate>
        <div class="field"><label for="move-to">Move to</label>
          ${
            options.length
              ? `<select id="move-to"${busy ? " disabled" : ""}>${options.map((f) => `<option value="${esc(f)}">${esc(label(f, env.podUrl))}</option>`).join("")}</select>`
              : `<p class="meta">Open the folder you want to move it to once, and it will be offered here.</p>`
          }</div>
        <p class="meta">${url.endsWith("/") ? "Everything inside moves with it, with its rules. " : ""}What follows its folder's rules will follow the new folder's.</p>
        ${error}${status}
        <div class="actions"><button type="submit" class="small"${busy || !options.length ? " disabled" : ""}>Move</button>${cancel}</div>
      </form>`;
  }
  const what = url.endsWith("/")
    ? change.count === null
      ? `Counting what is inside ${esc(name)}…`
      : `Delete ${esc(name)} and the ${change.count} item${change.count === 1 ? "" : "s"} inside? This cannot be undone.`
    : `Delete ${esc(name)}? This cannot be undone.`;
  return `
    <div class="panel-block notice is-warn" id="change-form">
      <p>${what}</p>
      ${error}${status}
      <div class="actions"><button type="button" class="small warn" id="delete-confirm"${busy || (url.endsWith("/") && change.count === null) ? " disabled" : ""}>Delete</button>${cancel}</div>
    </div>`;
}

/** Wires the actions of the item at `url`; `state` holds the change in progress. */
export function bindActions(root: HTMLElement, url: string, state: { change: Change | null }, env: ChangeEnv, hooks: ChangeHooks): void {
  root.querySelectorAll<HTMLButtonElement>("[data-change]").forEach((button) =>
    button.addEventListener("click", async () => {
      const kind = button.dataset.change as Change["kind"];
      state.change = { kind, url, count: null, progress: null, error: null };
      hooks.changed();
      root.querySelector<HTMLElement>("#rename-name, #move-to, #delete-confirm")?.focus();
      if (kind === "delete" && url.endsWith("/")) {
        try {
          const count = await countInside(url, env.webId);
          if (state.change?.url === url && state.change.kind === "delete") state.change.count = count;
        } catch (err) {
          if (state.change) state.change.error = describePodError(err);
        }
        hooks.changed();
      }
    })
  );
  root.querySelector("#change-cancel")?.addEventListener("click", () => {
    state.change = null;
    hooks.changed();
  });

  const run = async (to: string | null) => {
    const change = state.change!;
    change.error = null;
    change.progress = "Starting…";
    hooks.changed();
    // The panel may have been redrawn since: write to the one on screen, and
    // never let a progress line stop a move halfway.
    const report = (p: Progress) => {
      change.progress = stage(p);
      const line = document.querySelector('#change-form [role="status"]');
      if (line) line.textContent = change.progress;
    };
    try {
      if (to) await move(url, to, env.webId, env.podUrl, report);
      else await deleteTree(url, env.podUrl, report);
      state.change = null;
      const name = nameOf(url);
      hooks.done(url, to, to ? `Moved ${name} to ${label(to, env.podUrl)}.` : `Deleted ${name}.`);
    } catch (err) {
      change.progress = null;
      change.error = describePodError(err);
      hooks.changed();
    }
  };

  root.querySelector<HTMLFormElement>("#change-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const change = state.change;
    if (!change) return;
    if (change.kind === "rename") {
      const name = root.querySelector<HTMLInputElement>("#rename-name")!.value;
      const problem = nameProblem(name);
      if (problem) {
        change.error = problem;
        hooks.changed();
        return;
      }
      void run(childUrl(parentOf(url)!, name, url.endsWith("/")));
    } else if (change.kind === "move") {
      const folder = root.querySelector<HTMLSelectElement>("#move-to")?.value;
      if (folder) void run(folder + url.slice(parentOf(url)!.length));
    }
  });
  root.querySelector("#delete-confirm")?.addEventListener("click", () => void run(null));
}
