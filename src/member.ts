/**
 * A collective's tab, for someone who belongs to it or has asked to
 * (layout A, "a member's view" in docs/layout-brief.md): sharing first,
 * because it is what a member comes back for, then the membership itself with
 * a quiet Leave.
 *
 * Orders of writes are unchanged from the checklist they came from, and
 * pinned in src/onboarding.test.ts: folder, grant, then announce.
 */
import { ensureContainer } from "./lib/pod";
import { setAgentAccess } from "./lib/acl";
import { buildAnnounce, buildJoin, profileEdits, sendToInbox, updateOwnProfile } from "./lib/collective";
import { announce } from "./ui/a11y";
import { esc, toast } from "./ui/patterns";
import { bindButton } from "./bind";
import { stateLabel, statePill } from "./steps";
import type { CollectiveView, ViewContext } from "./onboarding";

export function renderMemberView(view: CollectiveView, i: number): string {
  const { collective, state, folderUrl, published } = view;
  const name = esc(collective.name);

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
            ? `<a href="${esc(folderUrl)}">${esc(folderUrl)}</a>
               <button id="unpublish-${i}" class="ghost">Stop sharing</button>`
            : `<button id="publish-${i}">Share the folder</button>`
        }
      </p>
      <p class="step-error error" role="alert" hidden></p>
    </section>`;

  const membership = `
    <section class="step is-quiet">
      <div class="step-head"><h2>Your membership</h2></div>
      <p class="lead">${esc(stateLabel(state, collective.name))}</p>
      <p class="actions">
        ${state === "pending" ? `<button id="resend-${i}" class="ghost">Send the request again</button>` : ""}
        <button id="leave-${i}" class="ghost">Leave ${name}</button>
      </p>
      <p class="meta">
        Leaving takes the line out of your profile. What ${name} already
        collected stays with it.
      </p>
      <p class="step-error error" role="alert" hidden></p>
    </section>`;

  return `
    <header class="view-head">
      <p class="eyebrow">${state === "pending" ? "You asked to join" : "You belong to"}</p>
      <div class="view-title">
        <h1 class="display" data-view-title>${name}</h1>
        ${statePill(state)}
      </div>
      <p class="meta">Its address: <code>${esc(collective.configUrl)}</code></p>
    </header>
    <div class="member-grid">
      <div class="stack">${sharing}${membership}</div>
    </div>`;
}

export function bindMember(app: HTMLElement, view: CollectiveView, i: number, ctx: ViewContext): void {
  const { webId, rerender, profile } = ctx;
  const { collective, folderUrl } = view;

  const resend = app.querySelector<HTMLButtonElement>(`#resend-${i}`);
  if (resend) {
    bindButton(resend, async () => {
      await sendToInbox(collective.inbox, buildJoin(webId, collective.group, profile.name));
      toast(`Request sent to ${collective.name} again.`);
    }, rerender);
  }

  const leave = app.querySelector<HTMLButtonElement>(`#leave-${i}`);
  if (leave) {
    bindButton(leave, async () => {
      await updateOwnProfile(webId, profileEdits.leave(collective.group));
      toast(`Your profile no longer says you belong to ${collective.name}.`, {
        undo: () => void updateOwnProfile(webId, profileEdits.join(collective.group)).then(rerender),
      });
    }, rerender);
  }

  const publish = app.querySelector<HTMLButtonElement>(`#publish-${i}`);
  if (publish) {
    bindButton(publish, async () => {
      await ensureContainer(folderUrl);
      // The grant IS the consent (ADR 006 §1.1): per-WebID, on the member's
      // own pod, revocable here. Never a group.
      await setAgentAccess(folderUrl, webId, collective.agent, ["read"]);
      await sendToInbox(collective.inbox, buildAnnounce(webId, folderUrl, collective.group));
      announce(`Your folder is published to ${collective.name}.`);
    }, rerender);
  }

  const unpublish = app.querySelector<HTMLButtonElement>(`#unpublish-${i}`);
  if (unpublish) {
    bindButton(unpublish, async () => {
      await setAgentAccess(folderUrl, webId, collective.agent, []);
      toast(`${collective.name} can no longer read the folder. Copies it already made stay.`, {
        undo: () => void setAgentAccess(folderUrl, webId, collective.agent, ["read"]).then(rerender),
      });
    }, rerender);
  }
}
