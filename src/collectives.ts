/**
 * The Collectives tab (tabs third pass, docs/layout-brief.md): the one you
 * run, the ones you belong to, and joining one. Opening one shows it inside
 * this tab (src/admin.ts for the one you run, src/member.ts for the others:
 * sharing and leaving are there). Your name, agent and inbox are on You
 * (src/you.ts).
 *
 * Every write here is on the signed-in user's own pod, except the join
 * request POSTed to a collective's inbox (pocpod0 BP-6, single writer).
 */
import { isValidWebId } from "./lib/acl";
import {
  buildJoin,
  loadCollective,
  profileEdits,
  sendToInbox,
  updateOwnProfile,
  type Collective,
  type MemberDeclaration,
} from "./lib/collective";
import { announce } from "./ui/a11y";
import { esc, renderError, toast } from "./ui/patterns";
import { bindButton, bindForm } from "./bind";
import { runSummary, type RunView } from "./admin";
import { collectiveFromInput, pendingInvite, setInvite } from "./invite";
import { routeHref } from "./router";
import { declared, stateLabel, statePill, step } from "./steps";
import type { CollectiveView, Loaded, ViewContext } from "./onboarding";

export function renderCollectivesView(data: Loaded): string {
  const { run, runError, profile, collectives, broken, other } = data;
  const joined = collectives.map((c, i) => [c, i] as const).filter(([c]) => declared(c.state));
  const notJoined = collectives.map((c, i) => [c, i] as const).filter(([c]) => !declared(c.state));

  return `
    <div class="collectives-head">
      <h1 data-view-title>Collectives</h1>
      <p class="meta">The ones you run and the ones you belong to. Belonging grants nothing on its own: you share each folder yourself.</p>
    </div>
    <div class="stack collectives-main">
      ${run ? runCard(run) : ""}
      ${runError ? `<section class="step">${renderRunError(runError)}</section>` : ""}

      <h2 class="section-title">You belong to</h2>
      ${joined.length ? "" : `<p class="lead">No collective yet.</p>`}
      ${joined.map(([c]) => collectiveCard(c)).join("")}

      ${notJoined.length ? `<h2 class="section-title">Not joined yet</h2>` : ""}
      ${notJoined.map(([c, i]) => joinStep(c, i, profile)).join("")}
      ${broken.map((b) => `<section class="step">${renderBroken(b)}</section>`).join("")}
      ${stepFindCollective(collectives.length === 0)}
      ${
        other.length
          ? `<p class="meta">Other memberships in your profile, not managed here:
             ${other.map((o) => `<code>${esc(o)}</code>`).join(", ")}</p>`
          : ""
      }
    </div>`;
}

/** What to say when the collective someone looks up is one they already have. */
export function alreadyJoined(found: Collective, data: Loaded): string | null {
  if (data.run?.collective.group === found.group) return `You run ${found.name}: it is in Collectives.`;
  const mine = data.collectives.find((c) => c.collective.group === found.group);
  if (!mine) return null;
  if (mine.state === "member") return `You already belong to ${found.name}.`;
  if (mine.state === "pending") return `You have already asked to join ${found.name}; the answer comes to your inbox.`;
  return null;
}

export function bindCollectives(app: HTMLElement, data: Loaded, ctx: ViewContext): void {
  const { webId, rerender } = ctx;
  const { profile, collectives, broken } = data;

  bindForm(app, "#find-form", async (form) => {
    const address = collectiveFromInput((form.elements.namedItem("address") as HTMLInputElement).value);
    if (!isValidWebId(address)) throw new Error("An invitation link or a collective's address starts with https:// and has no spaces.");
    // Load it now, so a wrong address fails here, next to the field.
    const found = await loadCollective(address);
    // One you already run or belong to: say so, instead of a silent re-render.
    const already = alreadyJoined(found, data);
    if (already) {
      toast(already);
      announce(already);
      form.reset();
      return;
    }
    setInvite(address);
  }, rerender);

  broken.forEach((entry) => {
    const id = `dismiss-broken-${encodeURIComponent(entry.address)}`;
    document.getElementById(id)?.addEventListener("click", () => {
      if (pendingInvite() === entry.address) setInvite(null);
      rerender();
    });
  });

  app.querySelectorAll<HTMLButtonElement>("[data-dismiss]").forEach((button) =>
    button.addEventListener("click", () => {
      if (pendingInvite() === button.dataset.dismiss) setInvite(null);
      rerender();
    })
  );

  collectives.forEach((view, i) => {
    const join = app.querySelector<HTMLButtonElement>(`#join-${i}`);
    if (!join) return;
    const { collective } = view;
    bindButton(join, async () => {
      // Profile first: if the message then fails, the screen shows the
      // request as pending and offers to send it again. The other order
      // would leave the collective holding a request the profile denies.
      await updateOwnProfile(webId, profileEdits.join(collective.group));
      // Already listed: declaring completes the handshake, and a request
      // would ask the collective for something it has already done.
      if (view.state !== "left") {
        await sendToInbox(collective.inbox, buildJoin(webId, collective.group, profile.name));
      }
      // The profile now carries the link; the invitation has done its job.
      setInvite(null);
      announce(`Request sent to ${collective.name}.`);
    }, rerender);
  });
}

/* ── Collectives ───────────────────────────────────────────────────────── */

function tabLink(collective: Collective, label: string): string {
  return `<a href="${routeHref({ name: "collective", address: collective.configUrl })}">${esc(label)}</a>`;
}

function runCard(run: RunView): string {
  const { collective } = run;
  return `
    <h2 class="section-title">You run</h2>
    <section class="step">
      <div class="step-head">
        <h3>${esc(collective.name)}</h3>
        <span class="label-mono">Collective</span>
      </div>
      <p class="meta">${esc(runSummary(run))}</p>
      <p>${tabLink(collective, `Open ${collective.name}`)}</p>
    </section>`;
}

function collectiveCard(view: CollectiveView): string {
  const { collective, state, published } = view;
  return `
    <section class="step">
      <div class="step-head">
        <h3>${esc(collective.name)}</h3>
        ${statePill(state)}
      </div>
      <p class="lead">${esc(stateLabel(state, collective.name))}</p>
      <p class="meta">${
        published
          ? `Your folder <code>${esc(collective.bundleFolder)}</code> is shared with it.`
          : "Your folder is not shared with it yet."
      }</p>
      <p>${tabLink(collective, `Open ${collective.name}`)}</p>
    </section>`;
}

function joinStep(view: CollectiveView, i: number, profile: MemberDeclaration): string {
  const { collective, state } = view;
  const joinLabel = state === "left" ? "Confirm membership" : "Ask to join";
  return step(`Join ${collective.name}`, false, `
    <p class="lead">${esc(stateLabel(state, collective.name))}</p>
    ${profile.inbox ? "" : `<p class="meta">Create your inbox first, on <a href="${routeHref({ name: "you" })}">You</a>, so the answer has somewhere to land.</p>`}
    <p>
      <button id="join-${i}"${profile.inbox ? "" : " disabled"}>${joinLabel}</button>
      <button class="ghost" data-dismiss="${esc(collective.configUrl)}">Not now</button>
    </p>`);
}

function renderRunError(reason: string): string {
  return renderError({
    title: "Your collective's config.ttl cannot be used",
    detail: reason,
    recovery:
      "This account has a config.ttl at its pod root, so it runs a collective, " +
      "but it cannot be used as it is. Compare it with docs/reference/collective-files.md.",
    technical: reason,
  });
}

function renderBroken(entry: Loaded["broken"][number]): string {
  const closed = entry.status === 401 || entry.status === 403;
  return renderError({
    title: closed ? "This collective is not open to newcomers yet" : "This collective could not be found",
    detail: entry.reason,
    recovery: closed
      ? "Its description exists but only its members may read it. Whoever runs " +
        "the collective needs to make its config.ttl public. " +
        "Nothing on your side is wrong."
      : "Check the address with whoever gave it to you. The rest of this page is unaffected.",
    action: { label: "Forget this address", id: `dismiss-broken-${encodeURIComponent(entry.address)}` },
    technical: entry.address,
  });
}

function stepFindCollective(first: boolean): string {
  return `
    <section class="step is-quiet">
      <div class="step-head">
        <h3>${first ? "Join a collective" : "Join another collective"}</h3>
      </div>
      <p class="lead">
        Paste the invitation link the collective sent you.
      </p>
      <form id="find-form" class="find-row">
        <div class="field">
          <label for="address">Invitation link (or the collective's address)</label>
          <input id="address" name="address" type="url"
                 placeholder="https://…?collective=…" required />
        </div>
        <button type="submit" class="ghost">Look it up</button>
      </form>
      <p class="step-error error" role="alert" hidden></p>
    </section>`;
}

