/**
 * Slice A: the member's side of the handshake (solid-kit ADR 006), for someone
 * who already has an account and a pod.
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
import { COLLECTIVE_CONFIGS } from "./config";
import { ensureContainer, describePodError, isAuthError } from "./lib/pod";
import { getAccess, isValidWebId, setAgentAccess, setAuthenticatedAccess } from "./lib/acl";
import {
  buildAnnounce,
  buildJoin,
  isListed,
  loadCollective,
  membershipState,
  profileEdits,
  readOwnProfile,
  sendToInbox,
  updateOwnProfile,
  type Collective,
  type MemberDeclaration,
  type MembershipState,
} from "./lib/collective";
import { focusView, announce } from "./ui/a11y";
import { esc, renderError, renderPending, toast } from "./ui/patterns";

interface CollectiveView {
  collective: Collective;
  state: MembershipState;
  folderUrl: string;
  published: boolean;
}

interface Loaded {
  profile: MemberDeclaration;
  collectives: CollectiveView[];
  /** Configs that could not be loaded, with why — shown, never hidden. */
  broken: { url: string; reason: string }[];
}

const STATE_LABEL: Record<MembershipState, string> = {
  member: "You are a member.",
  pending: "Request sent. Waiting for the collective to accept it.",
  left: "The collective still lists you, but your profile no longer says you belong.",
  none: "Not a member.",
  unknown: "Not a member.",
};

async function load(webId: string, podUrl: string): Promise<Loaded> {
  const profile = await readOwnProfile(webId);
  const results = await Promise.allSettled(COLLECTIVE_CONFIGS.map((url) => loadCollective(url)));

  const collectives: CollectiveView[] = [];
  const broken: Loaded["broken"] = [];
  for (const [i, result] of results.entries()) {
    if (result.status === "rejected") {
      broken.push({ url: COLLECTIVE_CONFIGS[i], reason: describePodError(result.reason) });
      continue;
    }
    const collective = result.value;
    const listed = await isListed(collective, webId);
    const folderUrl = new URL(collective.bundleFolder, podUrl).href;
    collectives.push({
      collective,
      state: membershipState(profile.memberOf.includes(collective.group), listed),
      folderUrl,
      published: await grantsRead(folderUrl, webId, collective.agent),
    });
  }
  return { profile, collectives, broken };
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

  const { profile, collectives, broken } = data;
  const rerender = () => renderMembership(app, webId, podUrl, onLogout);

  app.innerHTML = `
    <main class="screen stack">
      <div class="topbar">
        <span class="meta">${esc(webId)}</span>
        <button id="logout" class="ghost">Sign out</button>
      </div>
      <h1 data-view-title>Your membership</h1>
      <p class="lead">
        Everything below is written on your own pod, except the two short
        messages sent to a collective's inbox. You can undo each step here.
      </p>

      ${stepName(profile)}
      ${stepAgent(profile)}
      ${stepInbox(profile)}
      ${collectives.map((c, i) => stepCollective(c, i, profile)).join("")}
      ${broken.map(renderBroken).join("")}
    </main>`;

  app.querySelector("#logout")!.addEventListener("click", onLogout);

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
      const inbox = new URL("inbox/", podUrl).href;
      // Order matters: the profile advertises the inbox LAST, so it never
      // points at an inbox that does not exist or that nobody may post to.
      await ensureContainer(inbox);
      await setAuthenticatedAccess(inbox, webId, ["append"]);
      await updateOwnProfile(webId, profileEdits.setInbox(inbox));
      announce("Inbox ready.");
    }, rerender);
  }

  collectives.forEach((view, i) => {
    const { collective, folderUrl } = view;

    const join = app.querySelector<HTMLButtonElement>(`#join-${i}`);
    if (join) {
      bindButton(join, async () => {
        // Profile first: if the message then fails, the screen shows the
        // request as pending and offers to send it again. The other order
        // would leave the collective holding a request the profile denies.
        await updateOwnProfile(webId, profileEdits.join(collective.group));
        await sendToInbox(collective.inbox, buildJoin(webId, collective.group, profile.name));
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

function step(title: string, done: boolean, body: string, optional = false): string {
  const status = done ? "Done" : optional ? "Optional" : "To do";
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

function stepAgent(profile: MemberDeclaration): string {
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
     <form id="agent-form" class="field">
       <label for="agent">Your agent's WebID</label>
       <input id="agent" name="agent" type="url" placeholder="https://…/profile/card#me" required />
       <div><button type="submit" class="ghost">Add</button></div>
     </form>`,
    true
  );
}

function stepInbox(profile: MemberDeclaration): string {
  return step(
    "Your inbox",
    Boolean(profile.inbox),
    profile.inbox
      ? `<p class="lead">Collectives answer your requests here.</p>
         <p><code>${esc(profile.inbox)}</code></p>`
      : `<p class="lead">
           A folder where anyone signed in can leave you a message but not read
           the others. Collectives answer your requests here.
         </p>
         <p><button id="make-inbox">Create my inbox</button></p>`
  );
}

function stepCollective(view: CollectiveView, i: number, profile: MemberDeclaration): string {
  const { collective, state, folderUrl, published } = view;
  const declared = state === "member" || state === "pending";

  const joinBody = `
    <p class="lead">${esc(STATE_LABEL[state])}</p>
    ${!profile.inbox && !declared ? `<p class="meta">Create your inbox first, so the answer has somewhere to land.</p>` : ""}
    <p>
      ${!declared ? `<button id="join-${i}"${profile.inbox ? "" : " disabled"}>Ask to join</button>` : ""}
      ${state === "pending" ? `<button id="resend-${i}" class="ghost">Send the request again</button>` : ""}
      ${declared ? `<button id="leave-${i}" class="ghost">Leave</button>` : ""}
    </p>`;

  const publishBody = declared
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

function renderBroken(entry: { url: string; reason: string }): string {
  return renderError({
    title: "A collective could not be loaded",
    detail: entry.reason,
    recovery:
      "The rest of this page is unaffected. The collective's config.ttl is missing " +
      "or unreadable; whoever runs it can fix that on their pod.",
    technical: entry.url,
  });
}

/* ── Wiring ────────────────────────────────────────────────────────────── */

/**
 * Runs one write, then re-renders from the pods. A failure is shown in the
 * step it came from and nothing re-renders, so what was typed is not lost.
 */
function bindButton(button: HTMLButtonElement, action: () => Promise<void>, after: () => void): void {
  button.addEventListener("click", () => run(button, action, after));
}

function bindForm(
  app: HTMLElement,
  selector: string,
  action: (form: HTMLFormElement) => Promise<void>,
  after: () => void
): void {
  const form = app.querySelector<HTMLFormElement>(selector);
  if (!form) return;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    run(form.querySelector("button")!, () => action(form), after);
  });
}

async function run(button: HTMLButtonElement, action: () => Promise<void>, after: () => void): Promise<void> {
  const errorLine = button.closest(".step")?.querySelector<HTMLElement>(".step-error");
  button.disabled = true;
  if (errorLine) errorLine.hidden = true;
  try {
    await action();
    after();
  } catch (err) {
    button.disabled = false;
    if (errorLine) {
      errorLine.textContent = describePodError(err);
      errorLine.hidden = false;
    }
  }
}
