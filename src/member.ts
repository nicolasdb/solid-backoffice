/**
 * A collective's tab, for someone who belongs to it or has asked to
 * (layout A, "a member's view" in docs/layout-brief.md): sharing first,
 * because it is what a member comes back for, then the membership itself with
 * a quiet Leave.
 *
 * Beside them (L4): the collective's members, from its roster, which a
 * member may read once accepted; and its agent, the one WebID the folder is
 * shared with. An unreadable roster is "not yet", never "refused".
 *
 * Sharing (slice G): you pick the folder; the collective's `hs:bundleFolder`
 * is only the suggestion. Before sharing, the screen answers the four
 * questions (docs/explanation/four-questions.md). Order of writes, pinned in
 * src/onboarding.test.ts: the choice, the folder's grant, then the
 * announcement.
 */
import { routeHref } from "./router";
import { restoreRules, shareFolder, shareableFolders, stopPlan, stopSharingAs, type StopChoice, type StopPlan } from "./lib/sharing";
import { presetOf, type AccessRules } from "./lib/acl";
import { chooseFolder } from "./lib/shared-folders";
import { accessSentence } from "./access-panel";
import { buildAnnounce, buildJoin, buildUndoAnnounce, profileEdits, sendToInbox, updateOwnProfile, type Collective } from "./lib/collective";
import { deleteMessage, readPerson, readRoster } from "./lib/admin";
import { announce } from "./ui/a11y";
import { esc, toast } from "./ui/patterns";
import { bindButton, run } from "./bind";
import { answerLabel, answerPill, bindCopy, collectiveHead, copyable, stateLabel, statePill } from "./steps";
import { trimAddress } from "./ui/address";
import type { CollectiveView, ViewContext } from "./onboarding";

export interface RosterMember {
  webId: string;
  nick: string | null;
  /** From their profile; null when it cannot be read. */
  name: string | null;
}

/**
 * The roster as this member reads it, with each member's name from their
 * profile. `null` when it cannot be read: before acceptance only members may
 * read it, so that is the normal case for someone who has just asked.
 */
export async function loadRoster(collective: Collective): Promise<RosterMember[] | null> {
  let entries;
  try {
    entries = (await readRoster(collective)).members;
  } catch {
    return null;
  }
  return Promise.all(
    entries.map(async (entry) => ({ ...entry, name: (await readPerson(entry.webId)).profile?.name ?? null }))
  );
}

/** A WebID shortened to host and path, the way people recognise a pod. */
function shortWebId(webId: string): string {
  try {
    const url = new URL(webId);
    return url.host + url.pathname.replace(/profile\/card$/, "");
  } catch {
    return webId;
  }
}

function initial(text: string): string {
  const letter = text.match(/[\p{L}\p{N}]/u);
  return letter ? letter[0].toUpperCase() : "?";
}

function membersCard(collective: Collective, roster: RosterMember[] | null, webId: string, pending: boolean): string {
  const name = esc(collective.name);
  if (!roster) {
    return `
      <section class="step">
        <div class="step-head"><h2>Members</h2></div>
        <p class="meta">${
          pending
            ? `You can see who belongs once ${name} accepts you: only members can read its roster.`
            : `${name}'s roster cannot be read from here yet: accepting you may not be finished on its side.`
        }</p>
      </section>`;
  }
  return `
    <section class="step">
      <div class="step-head"><h2>Members</h2><span class="pill">${roster.length}</span></div>
      <ul class="roster">
        ${roster
          .map((m) => {
            const who = m.name ?? m.nick ?? shortWebId(m.webId);
            return `
          <li>
            <span class="avatar" aria-hidden="true">${esc(initial(who))}</span>
            <div>
              <strong>${esc(who)}${m.webId === webId ? ` <span class="meta">(you)</span>` : ""}</strong>
              ${copyable(m.webId, "WebID copied.", shortWebId(m.webId))}
            </div>
            ${m.nick ? `<span class="label-mono">${esc(m.nick)}</span>` : ""}
          </li>`;
          })
          .join("")}
      </ul>
      <p class="meta">From ${name}'s roster, which members can read.</p>
    </section>`;
}

function agentCard(collective: Collective): string {
  return `
    <section class="step is-quiet">
      <div class="step-head"><h2>Its agent</h2></div>
      <p class="meta"><code>${esc(collective.agent)}</code></p>
      <p class="meta">Sharing lets it read your folder; it never writes on your pod. Whoever else could reach the folder (your own agent, say) keeps that access.</p>
    </section>`;
}

/** A folder of your pod as a path: `notes/hyperscope/`. */
function pathOf(folderUrl: string, podUrl: string): string {
  return folderUrl.startsWith(podUrl) ? folderUrl.slice(podUrl.length) : folderUrl;
}

/** Who, what, why, and what if not (docs/explanation/four-questions.md). */
function fourQuestions(name: string, shared: boolean): string {
  return `
    <dl class="four-questions">
      <div><dt>Who</dt><dd>${name}'s agent, shown on the right.</dd></div>
      <div><dt>What</dt><dd>${shared ? "This folder" : "The folder you pick"} and everything in it. It can read, never write.</dd></div>
      <div><dt>Why</dt><dd>It keeps a copy of each version, so the collective can draw on your work.</dd></div>
      <div><dt>If not</dt><dd>Nothing of yours reaches ${name}. Stopping later prevents new copies; it does not remove copies already made.</dd></div>
    </dl>`;
}

type Rules = Pick<AccessRules, "agents" | "public" | "authenticated">;

function can(modes: readonly string[]): string {
  const preset = presetOf([...modes] as AccessRules["public"]);
  return preset === "edit" ? "can edit" : preset === "read" ? "can read" : `may ${modes.join(", ")}`;
}

/** What changes from `before` to `after`, in words: who loses access, who gains it. */
export function changeWords(before: Rules, after: Rules, label: (webId: string) => string): string[] {
  const words: string[] = [];
  for (const b of before.agents) {
    const a = after.agents.find((x) => x.webId === b.webId);
    if (!a) words.push(`${label(b.webId)} loses access.`);
    else if (can(a.modes) !== can(b.modes)) words.push(`${label(b.webId)} ${can(a.modes)} instead.`);
  }
  for (const a of after.agents) if (!before.agents.some((b) => b.webId === a.webId)) words.push(`${label(a.webId)} ${can(a.modes)}.`);
  const has = (r: Rules, k: "public" | "authenticated") => r[k].includes("read");
  const who = { public: "Anyone with the link", authenticated: "Anyone signed in" } as const;
  for (const k of ["public", "authenticated"] as const) {
    if (has(before, k) && !has(after, k)) words.push(`${who[k]} loses access.`);
    if (!has(before, k) && has(after, k)) words.push(`${who[k]} can read.`);
  }
  return words;
}

const CHOICE_TITLE: Record<StopChoice, string> = {
  keep: "Keep everything else as it is",
  follow: "Follow the folder above again",
  only: "Only you and your agents",
};

/**
 * The question Stop sharing asks: what the folder's rules become. Each
 * choice says, in words, who can open the folder after it and what changes.
 */
export function renderStopPanel(plan: StopPlan, i: number, view: CollectiveView, ctx: { webId: string; podUrl: string; delegates: string[] }): string {
  const { collective, alsoSharedWith } = view;
  const name = esc(collective.name);
  const path = pathOf(plan.folderUrl, ctx.podUrl);
  const label = (id: string) => {
    if (id === collective.agent) return `${collective.name}'s agent`;
    const other = alsoSharedWith.find((c) => c.agent === id);
    if (other) return `${other.name}'s agent`;
    if (ctx.delegates.includes(id)) return ctx.delegates.length > 1 ? `your agent ${trimAddress(id, ctx.webId)}` : "your agent";
    return trimAddress(id, ctx.webId);
  };
  if (plan.through) {
    return `
      <p class="lead">${name} reads <code>${esc(path)}</code> through <code>${esc(pathOf(plan.through, ctx.podUrl) || "your pod")}</code>, the folder above: this folder has no rules of its own.</p>
      <p class="meta">Change who can open <code>${esc(pathOf(plan.through, ctx.podUrl) || "your pod")}</code> in Pods.</p>
      <p class="actions"><button type="button" class="ghost" data-stop-cancel>Cancel</button></p>`;
  }
  const keep = plan.options.find((o) => o.choice === "keep")!.rules;
  const reads = (r: Rules, agent: string) => r.public.includes("read") || r.agents.some((a) => a.webId === agent && a.modes.includes("read"));
  const options = plan.options
    .map((o, n) => {
      const changes = o.choice === "keep" ? [] : changeWords(keep, o.rules, label);
      const notes = [
        ...alsoSharedWith.filter((c) => reads(keep, c.agent) && !reads(o.rules, c.agent)).map((c) => `${esc(c.name)} loses access too.`),
        ...(reads(o.rules, collective.agent) ? [`${name} can still read it, through the folder above.`] : []),
      ];
      const from = o.from ? ` (<code>${esc(pathOf(o.from, ctx.podUrl) || "your pod")}</code>)` : "";
      return `
        <label class="stop-option">
          <input type="radio" name="stop-${i}" value="${o.choice}"${n === 0 ? " checked" : ""} />
          <span>
            <strong>${CHOICE_TITLE[o.choice]}${from}</strong>
            <span class="meta">${esc(accessSentence(o.rules, label))}${changes.length ? ` ${esc(changes.join(" "))}` : ""}</span>
            ${notes.length ? `<span class="meta is-warn">${notes.join(" ")}</span>` : ""}
          </span>
        </label>`;
    })
    .join("");
  const still = alsoSharedWith.length ? `<p class="meta">Still shared with ${alsoSharedWith.map((c) => esc(c.name)).join(" and ")}.</p>` : "";
  return `
    <form class="stack" id="stop-form-${i}">
      <fieldset class="stop-options">
        <legend>Stop sharing <code>${esc(path)}</code> with ${name}. After this, who can open the folder?</legend>
        ${options}
      </fieldset>
      ${still}
      <p class="meta">Copies ${name} already made stay.</p>
      <p class="actions">
        <button type="button" class="ghost" data-stop-cancel>Cancel</button>
        <button type="submit" id="stop-go-${i}">Stop sharing</button>
      </p>
    </form>`;
}

export function renderMemberView(view: CollectiveView, i: number, roster: RosterMember[] | null, webId: string, podUrl: string): string {
  const { collective, state, published, answer, folderUrl } = view;
  const name = esc(collective.name);
  const nick = roster?.find((m) => m.webId === webId)?.nick ?? null;
  const path = pathOf(folderUrl, podUrl);

  const body = published
    ? `
      <p class="lead">You share <code>${esc(path)}</code> with ${name}.</p>
      ${fourQuestions(name, true)}
      <p class="actions">
        <a class="button-ghost" href="${routeHref({ name: "places", path })}">Open folder</a>
        <button id="unpublish-${i}" class="ghost">Stop sharing</button>
      </p>
      <div class="stop-panel" id="stop-panel-${i}" hidden></div>`
    : `
      <p class="lead">Pick the folder you share with ${name}. Only that folder, nothing else of your pod.</p>
      <div class="field share-picker">
        <label for="folder-${i}">Folder</label>
        <select id="folder-${i}" name="folder" aria-describedby="folder-${i}-note">
          <option value="${esc(folderUrl)}" selected>${esc(path)}${view.chosen ? "" : ` (suggested by ${name})`}</option>
        </select>
        <p class="meta" id="folder-${i}-note">${view.chosen ? "The folder you picked last time." : `${name} suggests this one; any folder of yours will do.`} Created if it does not exist yet.</p>
      </div>
      ${fourQuestions(name, false)}
      <p class="actions"><button id="publish-${i}">Share this folder</button></p>
      }`;

  const sharing = `
    <section class="step">
      <div class="step-head">
        <h2>Sharing</h2>
        ${published ? `<span class="pill is-ok">Shared</span>` : `<span class="pill">Not shared</span>`}
      </div>
      ${body}
      <p class="step-error error" role="alert" hidden></p>
    </section>`;

  const membership = `
    <section class="step is-quiet">
      <div class="step-head"><h2>Your membership</h2></div>
      <p class="lead">${esc(answer ? answerLabel(answer, collective.name) : stateLabel(state, collective.name))}${
        state === "member" && nick ? ` Its roster lists you as <span class="label-mono">${esc(nick)}</span>.` : ""
      }</p>
      <p class="actions">
        ${state === "pending" ? `<button id="resend-${i}" class="ghost">${answer ? "Ask again" : "Send the request again"}</button>` : ""}
        <button id="leave-${i}" class="ghost">${answer ? "Take it out of my profile" : `Leave ${name}`}</button>
      </p>
      <p class="meta">
        Leaving takes the line out of your profile. What ${name} already
        collected stays with it.
      </p>
      <p class="step-error error" role="alert" hidden></p>
    </section>`;

  return `
    ${collectiveHead(
      collective.name,
      answer ? answerPill(answer) : statePill(state),
      `<p class="meta">Its address: ${copyable(collective.configUrl, "Address copied.", trimAddress(collective.configUrl, webId))}</p>`
    )}
    <div class="member-grid">
      <div class="stack">${sharing}${membership}</div>
      <aside class="stack">${membersCard(collective, roster, webId, state === "pending")}${agentCard(collective)}</aside>
    </div>`;
}

export function bindMember(app: HTMLElement, view: CollectiveView, i: number, ctx: ViewContext): void {
  const { webId, rerender, profile } = ctx;
  const { collective, folderUrl } = view;
  bindCopy(app);

  const resend = app.querySelector<HTMLButtonElement>(`#resend-${i}`);
  if (resend) {
    bindButton(resend, async () => {
      // The old answer goes first: left in the inbox, it would still read as the answer.
      if (view.answer) await deleteMessage(view.answer.url);
      await sendToInbox(collective.inbox, buildJoin(webId, collective.group, profile.name));
      toast(`Request sent to ${collective.name} again.`);
    }, rerender);
  }

  const leave = app.querySelector<HTMLButtonElement>(`#leave-${i}`);
  if (leave) {
    bindButton(leave, async () => {
      await updateOwnProfile(webId, profileEdits.leave(collective.group));
      if (view.answer) await deleteMessage(view.answer.url); // read, and acted on
      toast(`Your profile no longer says you belong to ${collective.name}.`, {
        undo: () => void updateOwnProfile(webId, profileEdits.join(collective.group)).then(rerender),
      });
    }, rerender);
  }

  const picker = app.querySelector<HTMLSelectElement>(`#folder-${i}`);
  if (picker) {
    // The folders come after the screen is drawn: the suggestion is there at once.
    void shareableFolders(ctx.podUrl)
      .then((urls) => {
        for (const url of urls) {
          if (url === folderUrl) continue;
          picker.append(new Option(url.slice(ctx.podUrl.length), url));
        }
      })
      .catch(() => undefined); // the suggestion stays offered
  }

  const share = async (folder: string) => {
    // The choice first (readable by you and your agents only), so your agents
    // know where to write; then the grant, then the announcement.
    await chooseFolder(ctx.podUrl, webId, collective.group, folder, profile.delegates);
    await shareFolder(folder, webId, ctx.podUrl, collective.agent, profile.delegates);
    await sendToInbox(collective.inbox, buildAnnounce(webId, folder, collective.group));
  };

  const publish = app.querySelector<HTMLButtonElement>(`#publish-${i}`);
  if (publish) {
    bindButton(publish, async () => {
      // The grant IS the consent (ADR 006 §1.1): per-WebID, on the member's
      // own pod, revocable here. Never a group.
      await share(picker?.value || folderUrl);
      announce(`Your folder is shared with ${collective.name}.`);
    }, rerender);
  }

  // Stopping asks first what the folder's rules become (renderStopPanel).
  const unpublish = app.querySelector<HTMLButtonElement>(`#unpublish-${i}`);
  const panel = app.querySelector<HTMLElement>(`#stop-panel-${i}`);
  if (unpublish && panel) {
    const actions = unpublish.closest<HTMLElement>(".actions");
    const close = () => {
      panel.hidden = true;
      panel.innerHTML = "";
      if (actions) actions.hidden = false;
      unpublish.focus();
    };
    bindButton(unpublish, async () => {
      const plan = await stopPlan(folderUrl, webId, ctx.podUrl, collective.agent, profile.delegates);
      panel.innerHTML = renderStopPanel(plan, i, view, { webId, podUrl: ctx.podUrl, delegates: profile.delegates });
      panel.hidden = false;
      if (actions) actions.hidden = true;
      panel.querySelectorAll<HTMLButtonElement>("[data-stop-cancel]").forEach((b) => b.addEventListener("click", close));
      panel.querySelector<HTMLInputElement>("input[type=radio]")?.focus();
      const form = panel.querySelector<HTMLFormElement>(`#stop-form-${i}`);
      form?.addEventListener("submit", (event) => {
        event.preventDefault();
        const choice = (new FormData(form).get(`stop-${i}`) as StopChoice | null) ?? "keep";
        void run(form.querySelector<HTMLButtonElement>(`#stop-go-${i}`)!, async () => {
          // Revoke, then tell: the collective's "Shares" is read from these messages.
          await stopSharingAs(plan, webId, choice);
          await sendToInbox(collective.inbox, buildUndoAnnounce(webId, folderUrl, collective.group));
          toast(`${collective.name} can no longer read the folder. Copies it already made stay.`, {
            undo: () =>
              void restoreRules(plan, webId)
                .then(() => sendToInbox(collective.inbox, buildAnnounce(webId, folderUrl, collective.group)))
                .then(rerender),
          });
        }, rerender);
      });
    }, () => {
      unpublish.disabled = false; // nothing redraws here: the panel opened instead
    });
  }
}
