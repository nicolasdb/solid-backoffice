/**
 * The Home tab (layout A): your collectives in the wide column, "You" beside
 * them. Joining happens here, because a collective only gets a tab of its own
 * once you have asked; sharing and leaving are on that tab (src/member.ts).
 *
 * Every write here is on the signed-in user's own pod, except the join
 * request POSTed to a collective's inbox (pocpod0 BP-6, single writer).
 */
import { isValidWebId } from "./lib/acl";
import { createInbox } from "./lib/newcomer";
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

export function renderHomeView(data: Loaded): string {
  const { run, runError, profile, unadvertisedInbox, collectives, broken, other } = data;
  const joined = collectives.map((c, i) => [c, i] as const).filter(([c]) => declared(c.state));
  const notJoined = collectives.map((c, i) => [c, i] as const).filter(([c]) => !declared(c.state));

  return `
    <div class="home-grid">
      <div class="stack">
        <h1 data-view-title>${esc(profile.name ?? "Your collectives")}</h1>

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
      </div>

      <aside class="stack home-aside" aria-labelledby="you-title">
        <h2 class="section-title" id="you-title">You</h2>
        <p class="meta">
          Everything here is written on your own pod, except the short messages
          sent to a collective's inbox. You can undo each step.
        </p>
        ${stepName(profile)}
        ${stepAgent(profile, run?.collective ?? null)}
        ${stepInbox(profile, unadvertisedInbox)}
      </aside>
    </div>`;
}

/** What to say when the collective someone looks up is one they already have. */
export function alreadyJoined(found: Collective, data: Loaded): string | null {
  if (data.run?.collective.group === found.group) return `You run ${found.name}: it has its own tab.`;
  const mine = data.collectives.find((c) => c.collective.group === found.group);
  if (!mine) return null;
  if (mine.state === "member") return `You already belong to ${found.name}.`;
  if (mine.state === "pending") return `You have already asked to join ${found.name}; the answer comes to your inbox.`;
  return null;
}

export function bindHome(app: HTMLElement, data: Loaded, ctx: ViewContext): void {
  const { webId, podUrl, rerender } = ctx;
  const { profile, unadvertisedInbox, collectives, broken } = data;

  bindForm(app, "#name-form", async (form) => {
    const name = (form.elements.namedItem("name") as HTMLInputElement).value.trim();
    if (!name) throw new Error("Write the name people know you by.");
    await updateOwnProfile(webId, profileEdits.setName(name));
    announce("Name saved.");
  }, rerender);

  bindForm(app, "#agent-form", async (form) => {
    const agent = (form.elements.namedItem("agent") as HTMLInputElement).value.trim();
    if (!isValidWebId(agent)) throw new Error("That is not a WebID: it should start with https:// and have no spaces.");
    if (agent === webId) throw new Error("That is your own WebID. Your agent has a WebID of its own.");
    await updateOwnProfile(webId, profileEdits.addDelegate(agent));
    announce("Agent declared.");
  }, rerender);

  app.querySelectorAll<HTMLButtonElement>("[data-add-agent]").forEach((button) =>
    bindButton(button, async () => {
      await updateOwnProfile(webId, profileEdits.addDelegate(button.dataset.addAgent!));
      announce("Agent declared.");
    }, rerender)
  );

  app.querySelectorAll<HTMLButtonElement>("[data-remove-agent]").forEach((button) =>
    bindButton(button, async () => {
      const agent = button.dataset.removeAgent!;
      await updateOwnProfile(webId, profileEdits.removeDelegate(agent));
      toast("Agent removed from your profile.", {
        undo: () => void updateOwnProfile(webId, profileEdits.addDelegate(agent)).then(rerender),
      });
    }, rerender)
  );

  const inboxButton = app.querySelector<HTMLButtonElement>("#make-inbox");
  if (inboxButton) {
    bindButton(inboxButton, async () => {
      await createInbox(webId, unadvertisedInbox ?? new URL("inbox/", podUrl).href);
      announce("Inbox ready.");
    }, rerender);
  }

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
    ${profile.inbox ? "" : `<p class="meta">Create your inbox first, so the answer has somewhere to land.</p>`}
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
    <section class="step">
      <div class="step-head">
        <h3>${first ? "Join a collective" : "Join another collective"}</h3>
      </div>
      <p class="lead">
        Paste the invitation link the collective sent you.
      </p>
      <form id="find-form" class="field">
        <label for="address">Invitation link (or the collective's address)</label>
        <input id="address" name="address" type="url"
               placeholder="https://…?collective=…" required />
        <div><button type="submit" class="ghost">Look it up</button></div>
      </form>
      <p class="step-error error" role="alert" hidden></p>
    </section>`;
}

/* ── You ───────────────────────────────────────────────────────────────── */

function stepName(profile: MemberDeclaration): string {
  return step(
    "Your name",
    Boolean(profile.name),
    `<p class="lead">The name your collectives show next to your work.</p>
     <form id="name-form" class="field">
       <label for="name">Name</label>
       <input id="name" name="name" type="text" value="${esc(profile.name ?? "")}" required />
       <div><button type="submit"${profile.name ? ' class="ghost"' : ""}>Save</button></div>
     </form>`
  );
}

/**
 * Agents the pods already name, offered with one click. Today: a collective
 * account's own agent (`hs:agent` in its config.ttl). WebIDs linked to the
 * account on our provider come with the provider layer (slice D).
 */
function agentSuggestions(profile: MemberDeclaration, run: Collective | null): string[] {
  return run && !profile.delegates.includes(run.agent) ? [run.agent] : [];
}

function stepAgent(profile: MemberDeclaration, run: Collective | null): string {
  const suggested = agentSuggestions(profile, run)
    .map(
      (agent) => `<li><code>${esc(agent)}</code>
        <button class="ghost" data-add-agent="${esc(agent)}">Add</button></li>`
    )
    .join("");
  const list = profile.delegates
    .map(
      (agent) => `<li><code>${esc(agent)}</code>
        <button class="ghost" data-remove-agent="${esc(agent)}">Remove</button></li>`
    )
    .join("");
  return step(
    "Your agent",
    profile.delegates.length > 0,
    `<p class="lead">
       If an AI agent works for you, say so here, so that what it writes is
       credited to you. This gives it no access to anything.
     </p>
     ${list ? `<ul class="plain-list">${list}</ul>` : ""}
     ${suggested ? `<p class="meta">Named in your collective's config.ttl:</p><ul class="plain-list">${suggested}</ul>` : ""}
     <form id="agent-form" class="field">
       <label for="agent">Your agent's WebID</label>
       <input id="agent" name="agent" type="url" placeholder="https://…/profile/card#me" required />
       <div><button type="submit" class="ghost">Add</button></div>
     </form>`,
    true
  );
}

function stepInbox(profile: MemberDeclaration, unadvertised: string | null): string {
  if (profile.inbox) {
    return step(
      "Your inbox",
      true,
      `<p class="lead">Collectives answer your requests here.</p>
       <p><code>${esc(profile.inbox)}</code></p>`
    );
  }
  if (unadvertised) {
    return step(
      "Your inbox",
      false,
      `<p class="lead">
         You already have <code>${esc(unadvertised)}</code>, but your profile does
         not say it is your inbox, so nobody can find it. Using it lets anyone
         signed in leave you a message there, without reading the others.
       </p>
       <p><button id="make-inbox">Use this inbox</button></p>`
    );
  }
  return step(
    "Your inbox",
    false,
    `<p class="lead">
       A folder where anyone signed in can leave you a message but not read
       the others. Collectives answer your requests here.
     </p>
     <p><button id="make-inbox">Create my inbox</button></p>`
  );
}
