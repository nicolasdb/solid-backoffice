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
 * Orders of writes are unchanged from the checklist they came from, and
 * pinned in src/onboarding.test.ts: folder, grant, then announce.
 */
import { routeHref } from "./router";
import { shareFolder, stopSharing } from "./lib/sharing";
import { buildAnnounce, buildJoin, buildUndoAnnounce, profileEdits, sendToInbox, updateOwnProfile, type Collective } from "./lib/collective";
import { deleteMessage, readPerson, readRoster } from "./lib/admin";
import { announce } from "./ui/a11y";
import { esc, toast } from "./ui/patterns";
import { bindButton } from "./bind";
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

export function renderMemberView(view: CollectiveView, i: number, roster: RosterMember[] | null, webId: string): string {
  const { collective, state, published, answer } = view;
  const name = esc(collective.name);
  const nick = roster?.find((m) => m.webId === webId)?.nick ?? null;

  const sharing = `
    <section class="step">
      <div class="step-head">
        <h2>Sharing</h2>
        ${published ? `<span class="pill is-ok">Shared</span>` : `<span class="pill">Not shared</span>`}
      </div>
      <p class="lead">
        Your folder <code>${esc(collective.bundleFolder)}</code> is how you share
        work with ${name}. Its agent reads it and keeps a copy of each version.
      </p>
      <p class="meta">
        Everything you put in this folder is shared. Stopping later prevents new
        copies; it does not remove copies already made.
      </p>
      <p class="actions">
        ${
          published
            ? `<a class="button-ghost" href="${routeHref({ name: "places", path: collective.bundleFolder })}">Open folder</a>
               <button id="unpublish-${i}" class="ghost">Stop sharing</button>`
            : `<button id="publish-${i}">Share the folder</button>`
        }
      </p>
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

  const publish = app.querySelector<HTMLButtonElement>(`#publish-${i}`);
  if (publish) {
    bindButton(publish, async () => {
      // The grant IS the consent (ADR 006 §1.1): per-WebID, on the member's
      // own pod, revocable here. Never a group. Your agents keep edit.
      await shareFolder(folderUrl, webId, ctx.podUrl, collective.agent, profile.delegates);
      await sendToInbox(collective.inbox, buildAnnounce(webId, folderUrl, collective.group));
      announce(`Your folder is published to ${collective.name}.`);
    }, rerender);
  }

  const unpublish = app.querySelector<HTMLButtonElement>(`#unpublish-${i}`);
  if (unpublish) {
    bindButton(unpublish, async () => {
      // Revoke, then tell: the collective's "Shares" is read from these messages.
      await stopSharing(folderUrl, webId, ctx.podUrl, profile.delegates);
      await sendToInbox(collective.inbox, buildUndoAnnounce(webId, folderUrl, collective.group));
      toast(`${collective.name} can no longer read the folder. Copies it already made stay.`, {
        undo: () =>
          void shareFolder(folderUrl, webId, ctx.podUrl, collective.agent, profile.delegates)
            .then(() => sendToInbox(collective.inbox, buildAnnounce(webId, folderUrl, collective.group)))
            .then(rerender),
      });
    }, rerender);
  }
}
