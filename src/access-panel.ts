/**
 * "Who can access it" (slice C2): the permissions of one item, the same
 * panel for a folder and a file, in Pods' drawer. Only me / inherit from
 * parent / anyone with the link / named people, each named person "Can
 * read" or "Can edit" (docs/layout-brief.md, "Pods, the iceberg").
 *
 * The rules that matter here:
 *
 * - One WebID per grant, never a group (ADR 006 §2). A chip "fills in" one
 *   member's WebID; someone who leaves the collective keeps access until
 *   removed, and is flagged.
 * - Control is never granted from here. A grant the presets have no name for
 *   shows as "Custom" and is kept as it is; the technical rules change it (C6).
 * - What is on screen is a draft. Save writes it in one conditional write,
 *   refused if the rules changed after the panel read them (`setAccess`).
 * - "Inherit from parent" is an item without rules of its own. Choosing
 *   anything else starts from the rules it followed, and saving gives it its
 *   own; choosing Inherit on an item with its own removes them. Never on a
 *   pod root: nothing is above it.
 */
import {
  PRESETS,
  type AccessRules,
  isValidWebId,
  presetOf,
  readAccess,
  removeOwnRules,
  setAccess,
  type AgentGrant,
  type Mode,
} from "./lib/acl";
import { effectiveAccess, nameOf, parentOf, type Effective } from "./lib/files";
import { trimAddress, webIdName } from "./ui/address";
import { readTurtle } from "./lib/read";
import { describePodError } from "./lib/pod";
import { esc } from "./ui/patterns";

export interface Group {
  name: string;
  agent: string;
  members: { webId: string; label: string }[];
  /** Once members: the roster keeps their short name, or their profile left. */
  left: { webId: string; label: string }[];
}

export type Visibility = "me" | "inherit" | "link" | "people";

export interface Draft {
  url: string;
  /** Rules of its own; false: it follows `from`. */
  own: boolean;
  from: string;
  /** What it follows, or would follow without rules of its own; null on the pod root. */
  parent: Effective | null;
  /** The ETag of its own `.acl` as read; null when it has none. */
  basedOn: string | null;
  visibility: Visibility;
  agents: AgentGrant[];
  /** Kept as read: the panel has no word for them (an inbox's Append). */
  authenticated: Mode[];
  /** Why the panel cannot change these rules; null when it can. */
  locked: string | null;
  /** Grants on a folder written without acl:default (they reach nothing inside). */
  folderOnly: boolean;
  /** The `.acl` that applies, as written, for "Show the technical rules". */
  turtle: string | null;
  aclUrl: string;
  dirty: boolean;
  error: string | null;
}

export interface AccessEnv {
  webId: string;
  podUrl: string;
  names: Map<string, string>;
  groups: Group[] | null;
}

/** Reads what applies to `url` into a draft: its own rules, or those it follows. */
export async function loadDraft(url: string, webId: string, podUrl: string): Promise<Draft> {
  const above = url !== podUrl ? parentOf(url) : null;
  // Both at once (ADR 007): what it has, and what it would follow.
  const [own, parent] = await Promise.all([
    readAccess(url, webId),
    above && above.startsWith(podUrl) ? effectiveAccess(above, webId, podUrl) : Promise.resolve(null),
  ]);
  const access = own.inherited && parent ? parent.access : own;
  const from = own.inherited && parent ? parent.from : url;
  const turtleRes = own.inherited && from === url ? null : await readTurtle(access.aclUrl);
  const turtle = turtleRes?.ok ? await turtleRes.text() : null;

  const odd = access.public.filter((m) => m !== "read");
  const locked = access.unknown.length
    ? "These rules include something this app has no words for yet (a group, an app, another target). Change them in the technical rules, or on the server."
    : odd.length
      ? `Anyone may ${odd.join(" and ")} here, which this panel does not offer. Change it in the technical rules.`
      : null;
  const visibility: Visibility = own.inherited && parent
    ? "inherit"
    : access.public.includes("read") ? "link" : access.agents.length ? "people" : "me";

  return {
    url,
    own: !own.inherited,
    from,
    parent,
    basedOn: own.inherited ? null : own.etag,
    visibility,
    agents: access.agents.map((a) => ({ ...a, modes: [...a.modes] })),
    authenticated: [...access.authenticated],
    locked,
    folderOnly: access.folderOnly.length > 0,
    turtle,
    aclUrl: own.aclUrl,
    dirty: false,
    error: null,
  };
}

/** What Save writes, from the draft. Only-me drops every named person. */
export function rulesOf(draft: Draft): { agents: AgentGrant[]; public: Mode[]; authenticated: Mode[] } {
  return {
    agents: draft.visibility === "me" ? [] : draft.agents,
    public: draft.visibility === "link" ? ["read"] : [],
    authenticated: draft.authenticated,
  };
}

export function labelOf(webId: string, env: AccessEnv): string {
  if (env.names.has(webId)) return env.names.get(webId)!;
  for (const g of env.groups ?? []) {
    const found = [...g.members, ...g.left].find((m) => m.webId === webId && m.label !== webId);
    if (found) return found.label;
  }
  return webIdName(webId);
}

/** "Can read", "Can edit", or the modes as written. */
function presetWords(modes: Mode[]): string {
  const preset = presetOf(modes);
  return preset === "read" ? "can read" : preset === "edit" ? "can edit" : modes.join(", ");
}

/** Who can access it, in one sentence: "You, HyperScope's agent (can read) and Inès (can edit)." */
export function accessSentence(rules: Pick<AccessRules, "agents" | "public" | "authenticated">, label: (webId: string) => string): string {
  const parts = rules.agents.map((a) => `${label(a.webId)} (${presetWords(a.modes)})`);
  if (rules.public.includes("read")) parts.push("anyone with the link (can read)");
  if (rules.authenticated.includes("read")) parts.push("anyone signed in (can read)");
  const also = rules.public.includes("append") ? " Anyone can leave a message." : rules.authenticated.includes("append") ? " Anyone signed in can leave a message." : "";
  if (!parts.length) return "Only you." + also;
  const last = parts.pop()!;
  return `${["You", ...parts].join(", ")} and ${last}.` + also;
}

/** "My pod", or a folder's name. */
function placeName(url: string, podUrl: string): string {
  return url === podUrl ? "My pod" : nameOf(url);
}

function leftNote(webId: string, env: AccessEnv): string {
  const groups = (env.groups ?? []).filter((g) => g.left.some((m) => m.webId === webId) && !g.members.some((m) => m.webId === webId));
  return groups.map((g) => `Left ${g.name}. Still has access until removed.`).join(" ");
}

function initial(text: string): string {
  const letter = text.match(/[\p{L}\p{N}]/u);
  return letter ? letter[0].toUpperCase() : "?";
}

function renderPerson(grant: AgentGrant, i: number, env: AccessEnv, locked: boolean): string {
  const label = labelOf(grant.webId, env);
  const preset = presetOf(grant.modes);
  const left = leftNote(grant.webId, env);
  const custom = preset ? "" : `<option value="custom" selected>Custom: ${esc(grant.modes.join(", "))}</option>`;
  return `
    <li class="person">
      <span class="avatar" aria-hidden="true">${esc(initial(label))}</span>
      <span class="person-who">
        <span>${esc(label)}</span>
        <span class="meta">${esc(trimAddress(grant.webId, env.podUrl))}</span>
        ${left ? `<span class="meta is-warn">${esc(left)}</span>` : ""}
      </span>
      <label class="visually-hidden" for="person-${i}">${esc(label)}'s access</label>
      <select id="person-${i}" data-person="${esc(grant.webId)}"${locked ? " disabled" : ""}>
        <option value="read"${preset === "read" ? " selected" : ""}>Can read</option>
        <option value="edit"${preset === "edit" ? " selected" : ""}>Can edit</option>
        ${custom}
      </select>
      ${locked ? "" : `<button class="ghost small" type="button" data-remove="${esc(grant.webId)}" aria-label="Remove ${esc(label)}">✕</button>`}
    </li>`;
}

function renderChips(draft: Draft, env: AccessEnv): string {
  if (!env.groups) return `<p class="meta">Reading your collectives' members…</p>`;
  const taken = new Set([env.webId, ...draft.agents.map((a) => a.webId)]);
  return env.groups
    .map((g) => {
      const people = [...g.members, { webId: g.agent, label: env.names.get(g.agent) ?? `${g.name}'s agent` }]
        .filter((m, i, all) => !taken.has(m.webId) && all.findIndex((o) => o.webId === m.webId) === i);
      if (!people.length) return "";
      return `
        <div class="chips">
          <span class="meta">Fill in from ${esc(g.name)}'s members:</span>
          ${people.map((m) => `<button class="chip" type="button" data-add="${esc(m.webId)}">${esc(labelOf(m.webId, env) === webIdName(m.webId) ? m.label : labelOf(m.webId, env))}</button>`).join("")}
        </div>`;
    })
    .join("");
}

export function renderAccess(draft: Draft | null, env: AccessEnv, loadError: string | null = null): string {
  if (loadError) return `<div class="panel-block" id="access"><p class="error">${esc(loadError)}</p></div>`;
  if (!draft) return `<div class="panel-block" id="access"><p class="meta">Reading its rules…</p></div>`;
  const locked = Boolean(draft.locked);
  const label = (webId: string) => labelOf(webId, env);
  const parentName = draft.parent ? placeName(draft.parent.from, env.podUrl) : "";
  const radio = (value: Visibility, text: string) =>
    `<label class="opt"><input type="radio" name="visibility" value="${value}"${draft.visibility === value ? " checked" : ""}${locked ? " disabled" : ""}> ${text}</label>`;
  const inherit = draft.visibility === "inherit";
  const showPeople = draft.visibility === "people" || draft.visibility === "link";
  const kind = draft.url.endsWith("/") ? "folder" : "file";

  return `
    <form class="panel-block" id="access" novalidate>
      <fieldset class="access-visibility">
        <legend class="visually-hidden">Who can access it</legend>
        ${radio("me", "Only me")}
        ${draft.parent ? radio("inherit", `Inherit from parent <span class="meta">· ${esc(parentName)}</span>`) : ""}
        ${radio("link", "Anyone with the link")}
        ${radio("people", "Named people")}
      </fieldset>
      ${draft.locked ? `<p class="meta is-warn">${esc(draft.locked)}</p>` : ""}
      ${
        inherit && draft.parent
          ? `<div class="inherit-card">
               <p>Same as <strong>${esc(parentName)}</strong>: ${esc(accessSentence(draft.parent.access, label).replace(/^You/, "you").replace(/^Only you/, "only you"))}</p>
               <p class="meta">Change them there and everything inside follows. <button class="link-button" type="button" data-open-access="${esc(draft.parent.from)}">Open ${esc(parentName)}'s access</button></p>
             </div>
             ${draft.own ? `<p class="meta is-warn">Saving removes the rules of its own: it follows ${esc(parentName)} again.</p>` : ""}`
          : ""
      }
      ${!inherit && draft.authenticated.includes("append") ? `<p class="meta">Anyone signed in can also leave a message here; that stays as it is.</p>` : ""}
      ${!inherit && draft.authenticated.includes("read") ? `<p class="meta">Anyone signed in can read it too; that stays as it is.</p>` : ""}
      ${
        showPeople
          ? `<ul class="people">${draft.agents.map((a, i) => renderPerson(a, i, env, locked)).join("")}</ul>
             ${draft.visibility === "link" && draft.agents.length ? `<p class="meta">Anyone can read it; these people have what their line says.</p>` : ""}`
          : ""
      }
      ${
        showPeople && !locked
          ? `<div class="field add-person">
               <label for="add-webid">Add a person by their WebID</label>
               <div class="add-row"><input id="add-webid" type="url" placeholder="https://…/profile/card#me" autocomplete="off"><button class="ghost small" type="button" id="add-person">Add</button></div>
             </div>
             ${renderChips(draft, env)}
             <p class="meta">This fills in one WebID; it does not share with the collective. Someone who leaves keeps access until you remove them, and new members get none.</p>`
          : ""
      }
      ${!inherit && draft.folderOnly ? `<p class="meta is-warn">Some grants here cover the folder but nothing inside it. Saving makes them cover what is inside too.</p>` : ""}
      ${!inherit && !draft.own ? `<p class="meta">Saving gives this ${kind} rules of its own, starting from ${esc(parentName)}'s. It stops following ${esc(parentName)}: later changes there will not reach it.</p>` : ""}
      ${draft.error ? `<p class="error" role="alert">${esc(draft.error)}</p>` : ""}
      ${locked ? "" : `<div class="actions"><button type="submit" class="small" id="access-save"${draft.dirty ? "" : " disabled"}>Save</button><button type="button" class="ghost small" id="access-cancel"${draft.dirty ? "" : " disabled"}>Cancel</button></div>`}
    </form>`;
}

export interface AccessHooks {
  /** The draft changed: redraw the panel from it. */
  changed(): void;
  /** Saved or restored: read everything again. */
  saved(message: string): void;
  /** Show another item's access (the parent it inherits from). */
  open(url: string): void;
}

/** Wires the panel's controls to `draft`. */
export function bindAccess(root: HTMLElement, draft: Draft, env: AccessEnv, hooks: AccessHooks): void {
  const touch = () => {
    draft.dirty = true;
    draft.error = null;
    hooks.changed();
  };
  root.querySelectorAll<HTMLInputElement>('input[name="visibility"]').forEach((radio) =>
    radio.addEventListener("change", () => {
      draft.visibility = radio.value as Visibility;
      touch();
    })
  );
  root.querySelectorAll<HTMLSelectElement>("select[data-person]").forEach((select) =>
    select.addEventListener("change", () => {
      const grant = draft.agents.find((a) => a.webId === select.dataset.person);
      if (grant && select.value !== "custom") grant.modes = [...PRESETS[select.value as "read" | "edit"]];
      touch();
    })
  );
  root.querySelectorAll<HTMLButtonElement>("[data-remove]").forEach((button) =>
    button.addEventListener("click", () => {
      draft.agents = draft.agents.filter((a) => a.webId !== button.dataset.remove);
      touch();
    })
  );
  const add = (webId: string) => {
    const value = webId.trim();
    if (!isValidWebId(value)) {
      draft.error = "That is not a WebID: it starts with https:// and usually ends with #me.";
    } else if (value === env.webId) {
      draft.error = "That is you: you always keep full access to your pod.";
    } else if (!draft.agents.some((a) => a.webId === value)) {
      draft.agents.push({ webId: value, modes: [...PRESETS.read] });
      if (draft.visibility === "me") draft.visibility = "people";
      draft.dirty = true;
      draft.error = null;
    }
    hooks.changed();
  };
  root.querySelector("#add-person")?.addEventListener("click", () => add(root.querySelector<HTMLInputElement>("#add-webid")!.value));
  root.querySelector<HTMLInputElement>("#add-webid")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add((e.target as HTMLInputElement).value);
    }
  });
  root.querySelectorAll<HTMLButtonElement>("[data-add]").forEach((chip) => chip.addEventListener("click", () => add(chip.dataset.add!)));

  const form = root.querySelector<HTMLFormElement>("#access");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const save = root.querySelector<HTMLButtonElement>("#access-save")!;
    save.disabled = true;
    try {
      if (draft.visibility === "inherit") {
        if (draft.own) {
          await removeOwnRules(draft.url, draft.basedOn);
          hooks.saved(`${nameOf(draft.url)} follows ${placeName(draft.parent!.from, env.podUrl)} again.`);
        } else hooks.saved("");
        return;
      }
      await setAccess(draft.url, env.webId, rulesOf(draft), draft.basedOn);
      hooks.saved(`Saved. ${nameOf(draft.url)}: who can access it is updated.`);
    } catch (err) {
      draft.error = describePodError(err);
      if ((err as { code?: string }).code === "conflict") hooks.saved(draft.error);
      else hooks.changed();
    }
  });
  root.querySelector("#access-cancel")?.addEventListener("click", () => hooks.saved(""));
  root.querySelectorAll<HTMLButtonElement>("[data-open-access]").forEach((button) =>
    button.addEventListener("click", () => hooks.open(button.dataset.openAccess!))
  );
}
