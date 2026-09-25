/**
 * The home screen: the collectives you run, then your own profile steps, then
 * the collectives you belong to — the member's side of the handshake
 * (solid-kit ADR 006). Roles are read from the pods, never stored
 * (docs/explanation/membership.md).
 *
 * A checklist rather than a wizard. Every step reads its state from the pods
 * each time the screen renders, so someone who comes back tomorrow, or did a
 * step by hand, sees where they really are — there is no progress stored
 * anywhere that could disagree with the pods.
 *
 * Every write here is on the signed-in user's own pod, except the two messages
 * POSTed to a collective's inbox. That is the single-writer rule (pocpod0 BP-6)
 * seen from the member's side.
 */
import { ensureContainer, describePodError, exists, isAuthError } from "./lib/pod";
import { getAccess, isValidWebId, setAgentAccess, setAuthenticatedAccess } from "./lib/acl";
import {
  buildAnnounce,
  buildJoin,
  findRunCollective,
  isListed,
  loadCollective,
  membershipState,
  profileEdits,
  readOwnProfile,
  sendToInbox,
  updateOwnProfile,
  type Collective,
  type CollectiveLoadError,
  type MemberDeclaration,
  type MembershipState,
} from "./lib/collective";
import { focusView, announce } from "./ui/a11y";
import { esc, renderError, renderPending, toast } from "./ui/patterns";
import { bindButton, bindForm } from "./bind";
import { bindRun, loadRun, sectionRun, type RunView } from "./admin";

interface CollectiveView {
  collective: Collective;
  state: MembershipState;
  folderUrl: string;
  published: boolean;
}

interface Loaded {
  /** The collective this account runs: a config.ttl at its own pod root. */
  run: RunView | null;
  /** This account's config.ttl exists but cannot be used. */
  runError: string | null;
  profile: MemberDeclaration;
  /** `<pod>/inbox/` exists but the profile does not advertise it. */
  unadvertisedInbox: string | null;
  collectives: CollectiveView[];
  /** Addresses that could not be loaded, with why — shown, never hidden. */
  broken: { address: string; status?: number; reason: string }[];
  /** `org:memberOf` values that are not collectives this app manages. */
  other: string[];
}

/* ── Invitations ───────────────────────────────────────────────────────── */

/**
 * An invitation is a link: `…/?collective=<address>`. The address survives the
 * sign-in round trip in sessionStorage, because the kit strips the query
 * string from the OIDC redirect. Call before anything else on startup.
 */
const INVITE_KEY = "solid-backoffice.invite";

export function captureInvite(): void {
  const address = new URL(window.location.href).searchParams.get("collective");
  if (!address) return;
  try {
    sessionStorage.setItem(INVITE_KEY, address);
  } catch {
    // Storage blocked: the invitation is lost after sign-in, and the person
    // can still paste the address into the form. Not worth failing over.
  }
}

function pendingInvite(): string | null {
  try {
    return sessionStorage.getItem(INVITE_KEY);
  } catch {
    return null;
  }
}

function setInvite(address: string | null): void {
  try {
    if (address) sessionStorage.setItem(INVITE_KEY, address);
    else sessionStorage.removeItem(INVITE_KEY);
  } catch {
    /* see captureInvite */
  }
}

/* ── Loading ───────────────────────────────────────────────────────────── */

/**
 * Which collectives to show comes from the person, never from the app: the
 * ones their profile says they belong to, plus the one they were invited to
 * or typed in. Nothing is assumed.
 */
async function load(webId: string, podUrl: string): Promise<Loaded> {
  const profile = await readOwnProfile(webId);

  let run: Loaded["run"] = null;
  let runError: string | null = null;
  try {
    const own = await findRunCollective(podUrl);
    if (own) run = await loadRun(own, webId);
  } catch (err) {
    runError = describePodError(err);
  }

  // An invitation to the collective you run is not an invitation: a
  // collective never joins itself.
  let invite = pendingInvite();
  if (run && invite && (invite === run.collective.group || invite === run.collective.configUrl)) {
    setInvite(null);
    invite = null;
  }

  let unadvertisedInbox: string | null = null;
  if (!profile.inbox) {
    const candidate = new URL("inbox/", podUrl).href;
    if (await exists(candidate)) unadvertisedInbox = candidate;
  }

  const addresses = [...profile.memberOf, ...(invite ? [invite] : [])];
  const results = await Promise.allSettled(addresses.map((a) => loadCollective(a)));

  const collectives: CollectiveView[] = [];
  const broken: Loaded["broken"] = [];
  const other: string[] = [];
  const seen = new Set<string>();

  for (const [i, result] of results.entries()) {
    const address = addresses[i];
    const fromProfile = i < profile.memberOf.length;
    if (result.status === "rejected") {
      const status = (result.reason as CollectiveLoadError).status;
      // A profile can say it belongs to organisations that are not collectives
      // of this kind at all. That is not an error — just not ours to manage.
      if (fromProfile && status === undefined) other.push(address);
      else broken.push({ address, status, reason: describePodError(result.reason) });
      continue;
    }
    const collective = result.value;
    if (seen.has(collective.group) || collective.group === run?.collective.group) continue;
    seen.add(collective.group);

    const listed = await isListed(collective, webId);
    const folderUrl = new URL(collective.bundleFolder, podUrl).href;
    collectives.push({
      collective,
      state: membershipState(profile.memberOf.includes(collective.group), listed),
      folderUrl,
      published: await grantsRead(folderUrl, webId, collective.agent),
    });
  }
  return { run, runError, profile, unadvertisedInbox, collectives, broken, other };
}

/**
 * "left" (listed, not declared) also covers a roster edited by hand before the
 * person ever asked. The copy must fit both, so it says what is true now
 * rather than guessing a history.
 */
function stateLabel(state: MembershipState, name: string): string {
  switch (state) {
    case "member": return "You are a member.";
    case "pending": return "Request sent. Waiting for the collective to accept it.";
    case "left": return `${name} lists you as a member, but your profile does not say so. Confirm it to complete the membership.`;
    default: return "Not a member.";
  }
}

/** Member or request sent: the person has declared it on their side. */
function declared(state: MembershipState): boolean {
  return state === "member" || state === "pending";
}

/** Whether the folder's own ACL grants the agent Read. Missing folder: no. */
async function grantsRead(folderUrl: string, webId: string, agent: string): Promise<boolean> {
  try {
    const access = await getAccess(folderUrl, webId);
    return access.agents.some((a) => a.webId === agent && a.modes.includes("read"));
  } catch (err) {
    if ((err as { status?: number }).status === 404) return false;
    throw err;
  }
}

export async function renderMembership(
  app: HTMLElement,
  webId: string,
  podUrl: string,
  onLogout: () => void
): Promise<void> {
  app.innerHTML = `<main class="screen stack">${renderPending("Reading your profile and your collectives…")}</main>`;

  let data: Loaded;
  try {
    data = await load(webId, podUrl);
  } catch (err) {
    app.innerHTML = `<main class="screen stack">${renderError({
      title: isAuthError(err) ? "Your session ended" : "Could not read your profile",
      detail: describePodError(err),
      action: { label: "Try again", id: "retry" },
      technical: err instanceof Error ? err.message : String(err),
    })}</main>`;
    app.querySelector("#retry")!.addEventListener("click", () => renderMembership(app, webId, podUrl, onLogout));
    focusView(app);
    return;
  }

  const { run, runError, profile, unadvertisedInbox, collectives, broken, other } = data;
  const rerender = () => renderMembership(app, webId, podUrl, onLogout);

  app.innerHTML = `
    <main class="screen stack">
      <div class="topbar">
        <span class="meta">${esc(webId)}</span>
        <button id="logout" class="ghost">Sign out</button>
      </div>
      <h1 data-view-title>${esc(profile.name ?? "Your collectives")}</h1>

      ${run ? sectionRun(run, inviteLine(run.collective)) : ""}
      ${runError ? `<section class="step">${renderRunError(runError)}</section>` : ""}

      <h2 class="section-title">You</h2>
      <p class="lead">
        Everything here is written on your own pod, except the short messages
        sent to a collective's inbox. You can undo each step.
      </p>
      ${stepName(profile)}
      ${stepAgent(profile, run?.collective ?? null)}
      ${stepInbox(profile, unadvertisedInbox)}

      <h2 class="section-title">You belong to</h2>
      ${collectives.some((c) => declared(c.state)) ? "" : `<p class="lead">No collective yet.</p>`}
      ${collectives.map((c, i) => (declared(c.state) ? stepCollective(c, i, profile) : "")).join("")}

      ${collectives.some((c) => !declared(c.state)) ? `<h2 class="section-title">Not joined yet</h2>` : ""}
      ${collectives.map((c, i) => (declared(c.state) ? "" : stepCollective(c, i, profile))).join("")}
      ${broken.map((b) => `<section class="step">${renderBroken(b)}</section>`).join("")}
      ${stepFindCollective(collectives.length === 0)}
      ${
        other.length
          ? `<p class="meta">Other memberships in your profile, not managed here:
             ${other.map((o) => `<code>${esc(o)}</code>`).join(", ")}</p>`
          : ""
      }
    </main>`;

  app.querySelector("#logout")!.addEventListener("click", onLogout);
  if (run) bindRun(app, run, rerender);

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
      const inbox = unadvertisedInbox ?? new URL("inbox/", podUrl).href;
      // Order matters: the profile advertises the inbox LAST, so it never
      // points at an inbox that does not exist or that nobody may post to.
      await ensureContainer(inbox);
      await setAuthenticatedAccess(inbox, webId, ["append"]);
      await updateOwnProfile(webId, profileEdits.setInbox(inbox));
      announce("Inbox ready.");
    }, rerender);
  }

  bindForm(app, "#find-form", async (form) => {
    const address = (form.elements.namedItem("address") as HTMLInputElement).value.trim();
    if (!isValidWebId(address)) throw new Error("A collective's address starts with https:// and has no spaces.");
    // Load it now, so a wrong address fails here, next to the field.
    await loadCollective(address);
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
    const { collective, folderUrl } = view;

    const join = app.querySelector<HTMLButtonElement>(`#join-${i}`);
    if (join) {
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
    }

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
  });

  focusView(app);
}

/* ── Steps ─────────────────────────────────────────────────────────────── */

/**
 * A finished step folds to its title: still one click away, no longer in the
 * way. `<details>` keeps that keyboard- and screen-reader-accessible for free.
 */
function step(title: string, done: boolean, body: string, optional = false): string {
  const status = done ? "Done" : optional ? "Optional" : "To do";
  if (done) {
    return `
    <details class="step is-done">
      <summary class="step-head">
        <h2>${esc(title)}</h2>
        <span class="label-mono">${status}</span>
      </summary>
      ${body}
      <p class="step-error error" role="alert" hidden></p>
    </details>`;
  }
  return `
    <section class="step${done ? " is-done" : ""}">
      <div class="step-head">
        <h2>${esc(title)}</h2>
        <span class="label-mono">${status}</span>
      </div>
      ${body}
      <p class="step-error error" role="alert" hidden></p>
    </section>`;
}

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

/**
 * An invitation link only works where the backoffice is reachable by the
 * person receiving it, so none is offered from a development server. The
 * collective's address always works: it can be pasted into any backoffice.
 */
function inviteLine(collective: Collective): string {
  const address = `<p class="meta">Address to give people: <code>${esc(collective.configUrl)}</code></p>`;
  const { hostname } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]") return address;
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("collective", collective.configUrl);
  return `${address}<p class="meta">Invitation link: <code>${esc(url.href)}</code></p>`;
}

function renderRunError(reason: string): string {
  return renderError({
    title: "Your collective's config.ttl cannot be used",
    detail: reason,
    recovery:
      "This account has a config.ttl at its pod root, so it runs a collective, " +
      "but the file is incomplete. Compare it with docs/reference/collective-files.md.",
    technical: reason,
  });
}

function stepFindCollective(first: boolean): string {
  return `
    <section class="step">
      <div class="step-head">
        <h2>${first ? "Join a collective" : "Join another collective"}</h2>
      </div>
      <p class="lead">
        Paste the address the collective gave you, or open the invitation link
        they sent.
      </p>
      <form id="find-form" class="field">
        <label for="address">Collective's address</label>
        <input id="address" name="address" type="url"
               placeholder="https://…/config.ttl" required />
        <div><button type="submit" class="ghost">Look it up</button></div>
      </form>
      <p class="step-error error" role="alert" hidden></p>
    </section>`;
}

function stepCollective(view: CollectiveView, i: number, profile: MemberDeclaration): string {
  const { collective, state, folderUrl, published } = view;
  const isDeclared = declared(state);
  const joinLabel = state === "left" ? "Confirm membership" : "Ask to join";

  const joinBody = `
    <p class="lead">${esc(stateLabel(state, collective.name))}</p>
    ${!profile.inbox && !isDeclared ? `<p class="meta">Create your inbox first, so the answer has somewhere to land.</p>` : ""}
    <p>
      ${!isDeclared ? `<button id="join-${i}"${profile.inbox ? "" : " disabled"}>${joinLabel}</button>
                     <button class="ghost" data-dismiss="${esc(view.collective.configUrl)}">Not now</button>` : ""}
      ${state === "pending" ? `<button id="resend-${i}" class="ghost">Send the request again</button>` : ""}
      ${isDeclared ? `<button id="leave-${i}" class="ghost">Leave</button>` : ""}
    </p>`;

  const publishBody = isDeclared
    ? `
      <p class="lead">
        Your folder <code>${esc(collective.bundleFolder)}</code> is how you share
        work with ${esc(collective.name)}. Its agent reads it and keeps a copy of
        each version.
      </p>
      <p class="meta">
        Everything you put in this folder is shared. Stopping later prevents new
        copies; it does not remove copies already made.
      </p>
      <p>
        ${
          published
            ? `<a href="${esc(folderUrl)}">${esc(folderUrl)}</a>
               <button id="unpublish-${i}" class="ghost">Stop sharing</button>`
            : `<button id="publish-${i}">Share the folder</button>`
        }
      </p>`
    : `<p class="meta">Available once you have asked to join.</p>`;

  return (
    step(`Join ${collective.name}`, state === "member", joinBody) +
    step(`Share with ${collective.name}`, published, publishBody)
  );
}

function renderBroken(entry: Loaded["broken"][number]): string {
  const closed = entry.status === 401 || entry.status === 403;
  return renderError({
    title: closed ? "This collective is not open to newcomers yet" : "This collective could not be found",
    detail: entry.reason,
    recovery: closed
      ? "Its description exists but only its members may read it. Whoever runs " +
        "the collective needs to let anyone signed in read its config.ttl. " +
        "Nothing on your side is wrong."
      : "Check the address with whoever gave it to you. The rest of this page is unaffected.",
    action: { label: "Forget this address", id: `dismiss-broken-${encodeURIComponent(entry.address)}` },
    technical: entry.address,
  });
}
