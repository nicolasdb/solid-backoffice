/**
 * "Show the technical rules" (slice C6): the raw `.acl` of an item, and the
 * advanced mode behind it. Editable on a desktop only, and only for rules of
 * the item's own (canvas: PlacesRules; docs/layout-brief.md, "Places,
 * second pass"): it is what the simple panel has no words for, such as
 * Read + Append.
 *
 * Save takes two taps. The first shows what will change and arms the
 * button; the second writes. It stays disabled unless the text is valid
 * Turtle and you keep Control, and the write is refused if anyone changed
 * the rules since they were opened (`saveRawAcl`).
 */
import { checkRawAcl, presetOf, saveRawAcl, type AccessRules, type Mode } from "./lib/acl";
import { nameOf } from "./lib/files";
import { describePodError } from "./lib/pod";
import { esc } from "./ui/patterns";
import type { Draft } from "./access-panel";

export interface RawEdit {
  url: string;
  aclUrl: string;
  base: string;
  etag: string | null;
  text: string;
  /** The first tap on Save happened; the next one writes. */
  armed: boolean;
  error: string | null;
  openedAt: Date;
}

/** How long the armed Save waits for its second tap. */
export const ARMED_MS = 8000;

export function startRaw(draft: Draft): RawEdit {
  return {
    url: draft.url,
    aclUrl: draft.aclUrl,
    base: draft.turtle ?? "",
    etag: draft.basedOn,
    text: draft.turtle ?? "",
    armed: false,
    error: null,
    openedAt: new Date(),
  };
}

export function rawDirty(raw: RawEdit | null): boolean {
  return Boolean(raw && raw.text !== raw.base);
}

function modesLabel(modes: Mode[]): string {
  const preset = presetOf(modes);
  if (preset === "read") return "can read";
  if (preset === "edit") return "can edit";
  const words: Record<Mode, string> = { read: "read", append: "add", write: "change", control: "control" };
  return modes.map((m) => words[m]).join(" and ");
}

/** What the hand-edited rules change, in the simple panel's words. */
export function describeChanges(before: AccessRules, after: AccessRules, label: (webId: string) => string): string[] {
  const lines: string[] = [];
  const key = (m: Mode[]) => [...m].sort().join(",");
  const people = new Set([...before.agents, ...after.agents].map((a) => a.webId));
  for (const webId of people) {
    const was = before.agents.find((a) => a.webId === webId)?.modes ?? [];
    const now = after.agents.find((a) => a.webId === webId)?.modes ?? [];
    if (key(was) === key(now)) continue;
    const who = label(webId);
    if (!was.length) lines.push(`${who}: gets access (${modesLabel(now)}).`);
    else if (!now.length) lines.push(`${who}: loses access.`);
    else lines.push(`${who}: ${modesLabel(was)} becomes ${modesLabel(now)}.`);
  }
  const group = (was: Mode[], now: Mode[], who: string) => {
    if (key(was) === key(now)) return;
    if (!now.length) lines.push(`${who}: no access any more.`);
    else lines.push(`${who}: ${modesLabel(now)}.`);
  };
  group(before.public, after.public, "Anyone");
  group(before.authenticated, after.authenticated, "Anyone signed in");
  if (after.unknown.length > before.unknown.length) {
    lines.push("Includes rules the simple panel has no words for: it will show them read only.");
  }
  return lines;
}

const time = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

export interface RulesEnv {
  owner: string;
  label: (webId: string) => string;
}

export function renderRules(draft: Draft, raw: RawEdit | null, env: RulesEnv, open: boolean): string {
  if (draft.turtle === null) return "";
  const where = draft.own ? nameOf(draft.aclUrl) : `From ${nameOf(draft.from) || "My pod"}`;
  if (!raw || raw.url !== draft.url) {
    return `
      <details class="technical" id="technical"${open ? " open" : ""}><summary>Technical rules</summary>
        <p class="meta">${esc(where)}</p>
        <pre class="source"><code>${esc(draft.turtle)}</code></pre>
        ${
          draft.own
            ? `<button type="button" class="ghost small desktop-only" id="raw-edit">Edit these rules</button>`
            : `<p class="meta desktop-only">To edit them by hand, give it rules of its own first (Save above).</p>`
        }
      </details>`;
  }

  const check = checkRawAcl(raw.text, draft.url, raw.aclUrl, env.owner);
  const before = checkRawAcl(raw.base, draft.url, raw.aclUrl, env.owner).rules;
  const changes = check.rules && before ? describeChanges(before, check.rules, env.label) : [];
  const ok = !check.parseError && check.ownerKeepsControl;
  const line = (good: boolean, text: string) =>
    `<span class="check-line${good ? "" : " is-warn"}"><span aria-hidden="true">${good ? "✓" : "✗"}</span> ${text}</span>`;

  return `
    <section class="technical is-editing" id="technical" aria-label="Technical rules of ${esc(nameOf(draft.url))}">
      <div class="panel-head"><span class="label-mono">Technical rules</span><span class="pill is-wait">Editing</span></div>
      <p class="meta">The <code>.acl</code> as written on your pod (WAC, Turtle). A mistake here can lock people out, you included.</p>
      <label class="label-mono" for="raw-acl">${esc(nameOf(raw.aclUrl))}</label>
      <textarea id="raw-acl" spellcheck="false">${esc(raw.base)}</textarea>
      ${
        rawDirty(raw)
          ? `<div class="panel-block"><span class="label-mono">What changes</span>${
              changes.length ? changes.map((c) => `<p>${esc(c)}</p>`).join("") : `<p class="meta">Nothing the simple panel would show.</p>`
            }</div>`
          : ""
      }
      <div class="checks-list" role="status">
        ${line(!check.parseError, check.parseError ? `Not valid Turtle: ${esc(check.parseError)}` : "The rules read as valid Turtle")}
        ${line(check.ownerKeepsControl, check.ownerKeepsControl ? `You keep Control of <code>${esc(nameOf(draft.url))}</code>` : "You would lose Control: name your WebID with acl:Control" + (draft.url.endsWith("/") ? " and acl:default" : ""))}
        ${line(true, `Saved only if nobody changed them since you opened them (${time(raw.openedAt)})`)}
      </div>
      ${raw.error ? `<p class="error" role="alert">${esc(raw.error)}</p>` : ""}
      <div class="actions">
        <button type="button" class="small${raw.armed ? " warn" : ""}" id="raw-save"${ok && rawDirty(raw) ? "" : " disabled"}>${raw.armed ? "Save anyway: I checked these rules" : "Save"}</button>
        <button type="button" class="ghost small" id="raw-cancel">Cancel</button>
      </div>
      ${raw.armed ? `<p class="meta">Second step: nothing is written until you tap again.</p>` : ""}
    </section>`;
}

export interface RawHooks {
  changed(): void;
  saved(message: string): void;
  /** "Show the technical rules" opened or closed. */
  toggled(open: boolean): void;
  edit(): void;
  cancel(): void;
}

let disarm: ReturnType<typeof setTimeout> | undefined;

export function bindRules(root: HTMLElement, draft: Draft, raw: RawEdit | null, owner: string, hooks: RawHooks): void {
  root.querySelector<HTMLDetailsElement>("details#technical")?.addEventListener("toggle", (e) => {
    hooks.toggled((e.target as HTMLDetailsElement).open);
  });
  root.querySelector("#raw-edit")?.addEventListener("click", () => hooks.edit());
  if (!raw || raw.url !== draft.url) return;

  const area = root.querySelector<HTMLTextAreaElement>("#raw-acl");
  if (area && area.value !== raw.text) area.value = raw.text;
  let timer: ReturnType<typeof setTimeout> | undefined;
  area?.addEventListener("input", () => {
    raw.text = area.value;
    raw.armed = false;
    clearTimeout(timer);
    timer = setTimeout(() => hooks.changed(), 300);
  });
  root.querySelector("#raw-cancel")?.addEventListener("click", () => {
    clearTimeout(disarm);
    hooks.cancel();
  });
  root.querySelector("#raw-save")?.addEventListener("click", async () => {
    clearTimeout(disarm);
    if (!raw.armed) {
      raw.armed = true;
      hooks.changed();
      disarm = setTimeout(() => {
        raw.armed = false;
        hooks.changed();
      }, ARMED_MS);
      return;
    }
    raw.armed = false;
    try {
      await saveRawAcl(raw.url, owner, raw.text, raw.etag);
      hooks.saved(`Saved the technical rules of ${nameOf(raw.url)}.`);
    } catch (err) {
      raw.error = describePodError(err);
      hooks.changed();
    }
  });
}
