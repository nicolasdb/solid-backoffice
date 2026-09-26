/**
 * Editing a text file in Places (slice C3): Markdown, plain text, JSON. A
 * file opens in Preview; Edit shows its source beside the preview (the source
 * alone on a phone), as drawn on the canvas (PlacesEditor).
 *
 * Save writes only if nobody changed the file since it was opened (`If-Match`,
 * `saveFile`). When someone did, nothing is written and the editor says so,
 * with your text still in place: take their version, or save yours over it
 * knowingly.
 *
 * Unsaved text lives in memory only (never browser storage: it is pod
 * content), so leaving the file and coming back finds it again; sign-out
 * forgets it.
 */
import { nameOf, readFile, saveFile, type FileContent } from "./lib/files";
import { describePodError } from "./lib/pod";
import { renderMarkdown } from "./ui/markdown";
import { esc } from "./ui/patterns";

export type EditorView = "source" | "side" | "preview";

export interface Editing {
  url: string;
  kind: FileContent["kind"];
  contentType: string;
  /** The text as last read or saved, and its version. */
  base: string;
  etag: string | null;
  /** What is in the editor now. */
  text: string;
  view: EditorView;
  conflict: string | null;
  confirmClose: boolean;
  error: string | null;
}

export function canEdit(file: FileContent): boolean {
  return file.text !== null && (file.kind === "markdown" || file.kind === "text" || file.kind === "json");
}

export function startEditing(file: FileContent, phone: boolean): Editing {
  return {
    url: file.url,
    kind: file.kind,
    contentType: file.contentType,
    base: file.text ?? "",
    etag: file.etag,
    text: file.text ?? "",
    view: phone ? "source" : "side",
    conflict: null,
    confirmClose: false,
    error: null,
  };
}

export function isDirty(editing: Editing | null): boolean {
  return Boolean(editing && editing.text !== editing.base);
}

/** The preview of what is being written, safe whatever it holds. */
export function previewOf(editing: Pick<Editing, "kind" | "text">): string {
  if (editing.kind === "markdown") return renderMarkdown(editing.text);
  if (editing.kind === "json") {
    try {
      return `<pre class="source"><code>${esc(JSON.stringify(JSON.parse(editing.text), null, 2))}</code></pre>`;
    } catch (err) {
      return `<p class="meta is-warn">Not valid JSON yet: ${esc((err as Error).message)}</p><pre class="source"><code>${esc(editing.text)}</code></pre>`;
    }
  }
  return `<pre class="source"><code>${esc(editing.text)}</code></pre>`;
}

/** The view switch, Close and Save, for the file's header. */
export function renderEditorActions(editing: Editing): string {
  const seg = (view: EditorView, label: string) =>
    `<button type="button" class="${view === "side" ? "seg-side" : ""}" data-view="${view}" aria-pressed="${editing.view === view}">${label}</button>`;
  const dirty = isDirty(editing);
  return `
    <span class="pill is-wait" id="unsaved"${dirty ? "" : " hidden"}>Unsaved changes</span>
    <div class="seg" role="group" aria-label="View">${seg("source", "Source")}${seg("side", "Side by side")}${seg("preview", "Preview")}</div>
    <button type="button" class="ghost small" id="editor-close">Close</button>
    <button type="button" class="small" id="editor-save"${dirty ? "" : " disabled"}>Save</button>`;
}

export function renderEditor(editing: Editing): string {
  const name = nameOf(editing.url);
  return `
    ${
      editing.conflict
        ? `<div class="notice is-warn" role="alert">
             <p>${esc(editing.conflict)}</p>
             <div class="actions">
               <button type="button" class="ghost small" id="take-theirs">Replace my text with theirs</button>
               <button type="button" class="small" id="save-over">Save mine over theirs</button>
             </div>
           </div>`
        : ""
    }
    ${
      editing.confirmClose
        ? `<div class="notice is-warn" role="alert">
             <p>Close without saving? Your changes to ${esc(name)} would be lost.</p>
             <div class="actions">
               <button type="button" class="ghost small" id="discard">Discard them</button>
               <button type="button" class="small" id="keep-editing">Keep editing</button>
             </div>
           </div>`
        : ""
    }
    ${editing.error ? `<p class="error" role="alert">${esc(editing.error)}</p>` : ""}
    <div class="editor is-${editing.view}">
      <div class="editor-source">
        <label class="label-mono" for="source">Source</label>
        <textarea id="source" spellcheck="${editing.kind === "markdown" || editing.kind === "text"}">${esc(editing.base)}</textarea>
      </div>
      <div class="editor-preview">
        <span class="label-mono">Preview</span>
        <article class="prose preview" id="editor-preview" aria-label="Preview of ${esc(name)}" aria-live="off">${previewOf(editing)}</article>
      </div>
    </div>`;
}

export interface EditorHooks {
  /** Redraw from the state (a view change, a notice). */
  changed(): void;
  /** Saved: the file was read again. */
  saved(file: FileContent): void;
  /** Close the editor, back to the file's Preview. */
  close(): void;
}

/** Wires the editor under `root`; `editing` is updated in place. */
export function bindEditor(root: HTMLElement, editing: Editing, hooks: EditorHooks): void {
  const source = root.querySelector<HTMLTextAreaElement>("#source");
  const save = root.querySelector<HTMLButtonElement>("#editor-save");
  const unsaved = root.querySelector<HTMLElement>("#unsaved");
  const preview = root.querySelector<HTMLElement>("#editor-preview");
  if (source && source.value !== editing.text) source.value = editing.text; // unsaved text, kept in memory

  let timer: ReturnType<typeof setTimeout> | undefined;
  source?.addEventListener("input", () => {
    editing.text = source.value;
    const dirty = isDirty(editing);
    if (save) save.disabled = !dirty;
    if (unsaved) unsaved.hidden = !dirty;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (preview) preview.innerHTML = previewOf(editing);
    }, 150);
  });

  root.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) =>
    button.addEventListener("click", () => {
      editing.view = button.dataset.view as EditorView;
      hooks.changed();
    })
  );

  const write = async () => {
    if (save) save.disabled = true;
    try {
      await saveFile(editing.url, editing.text, editing.etag, editing.contentType);
      const fresh = await readFile(editing.url);
      editing.base = editing.text = fresh.text ?? editing.text;
      editing.etag = fresh.etag;
      editing.conflict = null;
      editing.error = null;
      hooks.saved(fresh);
    } catch (err) {
      if ((err as { code?: string }).code === "conflict") editing.conflict = (err as Error).message;
      else editing.error = describePodError(err);
      hooks.changed();
    }
  };
  save?.addEventListener("click", () => void write());
  // Ctrl/⌘+S saves, as in every editor.
  source?.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      if (isDirty(editing)) void write();
    }
  });

  root.querySelector("#take-theirs")?.addEventListener("click", async () => {
    try {
      const fresh = await readFile(editing.url);
      editing.base = editing.text = fresh.text ?? "";
      editing.etag = fresh.etag;
      editing.conflict = null;
      hooks.saved(fresh);
    } catch (err) {
      editing.error = describePodError(err);
      hooks.changed();
    }
  });
  root.querySelector("#save-over")?.addEventListener("click", async () => {
    try {
      // Knowingly over their version: the version tag is theirs now.
      editing.etag = (await readFile(editing.url)).etag;
      editing.conflict = null;
      await write();
    } catch (err) {
      editing.error = describePodError(err);
      hooks.changed();
    }
  });

  root.querySelector("#editor-close")?.addEventListener("click", () => {
    if (isDirty(editing)) {
      editing.confirmClose = true;
      hooks.changed();
    } else hooks.close();
  });
  root.querySelector("#discard")?.addEventListener("click", () => hooks.close());
  root.querySelector("#keep-editing")?.addEventListener("click", () => {
    editing.confirmClose = false;
    hooks.changed();
  });
}
