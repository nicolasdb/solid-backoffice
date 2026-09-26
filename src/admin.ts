/**
 * "You run": the collective's side of the handshake, for its own account
 * (slice B, journeys J3 and J5). Requests, members, and the messages this app
 * does not understand, all read from the pods on every render.
 *
 * The protocol, and the order of its writes, is in `lib/admin.ts`. This file
 * only decides what to show and which lib call a button makes.
 */
import {
  accept,
  grantMemberRead,
  memberReadTargets,
  readInbox,
  readMembers,
  readPerson,
  readRoster,
  refuse,
  removeMember,
  deleteMessage,
  requestFlags,
  suggestNick,
  type InboxMessage,
  type MemberView,
  type Person,
} from "./lib/admin";
import type { Collective } from "./lib/collective";
import { describePodError } from "./lib/pod";
import { announce } from "./ui/a11y";
import { esc, toast } from "./ui/patterns";
import { bindButton, bindForm, run } from "./bind";

interface Request {
  message: InboxMessage;
  person: Person;
  flags: string[];
  /** Already on the roster: a previous accept stopped halfway. */
  listed: boolean;
  /** The nick the roster already holds for them, which never changes. */
  knownNick: string | null;
}

export interface RunView {
  collective: Collective;
  owner: string;
  requests: Request[];
  members: MemberView[];
  /** Messages that are neither a request nor a member's announcement. Kept visible. */
  others: InboxMessage[];
  /** What could not be read, per part of the screen. */
  inboxError: string | null;
  membersError: string | null;
}

export async function loadRun(collective: Collective, owner: string): Promise<RunView> {
  let messages: InboxMessage[] = [];
  let inboxError: string | null = null;
  try {
    messages = await readInbox(collective);
  } catch (err) {
    inboxError = describePodError(err);
  }

  let members: MemberView[] = [];
  let nicks = new Map<string, string>();
  let membersError: string | null = null;
  try {
    [members, { nicks }] = await Promise.all([readMembers(collective, owner, messages), readRoster(collective)]);
  } catch (err) {
    membersError = describePodError(err);
  }
  const listed = new Set(members.map((m) => m.webId));

  const joins = messages.filter((m) => m.type === "Join" && m.actor);
  const requests = await Promise.all(
    joins.map(async (message) => {
      const person = await readPerson(message.actor!);
      return {
        message,
        person,
        flags: requestFlags(message, person, collective),
        listed: listed.has(person.webId),
        knownNick: nicks.get(person.webId) ?? null,
      };
    })
  );
  const others = messages.filter(
    (m) => !joins.includes(m) && !(m.type === "Announce" && m.actor && listed.has(m.actor))
  );
  return { collective, owner, requests, members, others, inboxError, membersError };
}

/* ── Rendering ─────────────────────────────────────────────────────────── */

function card(title: string, aside: string, body: string): string {
  return `
    <article class="step">
      <div class="step-head">
        <h3>${esc(title)}</h3>
        ${aside}
      </div>
      ${body}
      <p class="step-error error" role="alert" hidden></p>
    </article>`;
}

function check(ok: boolean, text: string): string {
  return `<li class="check"><span class="dot ${ok ? "is-done" : "is-todo"}" aria-hidden="true"></span>${text}</li>`;
}

function renderRequest(request: Request, i: number, collective: Collective): string {
  const { message, person, flags, listed, knownNick } = request;
  const profile = person.profile;
  const name = esc(collective.name);
  const facts = profile
    ? `<ul class="checks">
         ${check(profile.memberOf.includes(collective.group),
           profile.memberOf.includes(collective.group) ? `Profile says they belong to ${name}` : `Profile does not say they belong to ${name}`)}
         ${check(!!profile.inbox, profile.inbox ? "Has an inbox for the answer" : "No inbox: the answer cannot be sent; tell them another way")}
         ${check(profile.delegates.length > 0, `Agents: ${profile.delegates.length ? profile.delegates.map((d) => `<code>${esc(d)}</code>`).join(", ") : "none"}`)}
       </ul>`
    : `<p class="meta">${esc(person.problem ?? "Their profile could not be read.")}</p>`;
  const sent = message.published ? `<span class="meta">${esc(new Date(message.published).toLocaleDateString())}</span>` : "";

  return card(profile?.name ? `${profile.name} asks to join` : "A request to join", sent, `
    <p class="meta"><code>${esc(person.webId)}</code></p>
    ${facts}
    ${flags.map((f) => `<p class="error">${esc(f)}</p>`).join("")}
    ${listed ? `<p class="meta">Already on the roster: an earlier acceptance stopped halfway. Accepting again finishes it.</p>` : ""}
    <form id="accept-${i}" class="stack">
      <label class="field">Short name, used in the collective's folders
        <input name="nick" type="text" autocomplete="off" value="${esc(knownNick ?? suggestNick(person))}"${knownNick ? " readonly" : ""}
               pattern="[a-z0-9][a-z0-9\\-]{0,39}" required>
      </label>
      ${knownNick ? `<p class="meta">Kept from before: a short name never changes once used.</p>` : ""}
      <p class="actions">
        <button type="submit">Accept</button>
        <button type="button" class="ghost" id="refuse-${i}">Refuse</button>
      </p>
    </form>
    <p class="meta">
      Accepting lists them in the roster and lets them read it: two separate
      writes. Both answers are sent to their inbox and the request is then deleted.
    </p>`);
}

function stateText(member: MemberView, collective: Collective): string {
  switch (member.state) {
    case "member": return "Member: both sides agree.";
    case "left": return `Left: their profile no longer says they belong to ${collective.name}.`;
    default: return "Their profile could not be read, so only the roster's side is known.";
  }
}

function statePill(member: MemberView): string {
  switch (member.state) {
    case "member": return `<span class="pill is-ok">Member</span>`;
    case "left": return `<span class="pill is-wait">Left</span>`;
    default: return `<span class="pill">Unknown</span>`;
  }
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

/** A folder shortened to its path inside the member's pod. */
function shortFolder(folder: string, webId: string): string {
  try {
    const pod = new URL(webId);
    const url = new URL(folder);
    const root = pod.pathname.replace(/profile\/card$/, "");
    return url.host === pod.host && url.pathname.startsWith(root) ? url.pathname.slice(root.length) : folder;
  } catch {
    return folder;
  }
}

function renderMember(member: MemberView, i: number, collective: Collective, owner: string): string {
  const name = member.profile?.name;
  return `
    <tr data-member>
      <td data-label="Member">
        ${name ? `<strong>${esc(name)}</strong><br>` : ""}<span class="meta" title="${esc(member.webId)}">${esc(shortWebId(member.webId))}</span>
      </td>
      <td data-label="Short name">${member.nick ? `<span class="label-mono">${esc(member.nick)}</span>` : "—"}</td>
      <td data-label="Both sides">
        ${statePill(member)}
        <span class="visually-hidden">${esc(stateText(member, collective))}</span>
        ${member.state === "member" ? "" : `<br><span class="meta">${esc(stateText(member, collective))}</span>`}
      </td>
      <td data-label="Shares">
        ${member.announced.length ? member.announced.map((a) => `<code title="${esc(a)}">${esc(shortFolder(a, member.webId))}</code>`).join("<br>") : `<span class="meta">nothing announced</span>`}
      </td>
      <td class="row-actions">
        ${
          member.canReadRoster
            ? ""
            : `<span class="meta">Cannot read the roster yet: accepting was not finished.</span>
               <button class="ghost small" data-grant="${i}">Let them read it</button>`
        }
        ${member.webId === owner ? "" : `<button class="ghost small" data-remove="${i}">Remove</button>`}
      </td>
    </tr>`;
}

function renderOther(message: InboxMessage, i: number): string {
  const what =
    message.problem ??
    (message.type === "Announce"
      ? `An announcement from someone not on the roster${message.object ? `: ${message.object}` : ""}.`
      : `A message of type ${message.rawType ?? "unknown"}.`);
  return `
    <li>
      <a href="${esc(message.url)}">${esc(message.url)}</a>
      <br><span class="meta">${esc(what)}</span>
      <button class="ghost small" data-delete="${i}">Delete</button>
    </li>`;
}

/** "2 members · 1 request", or what could not be read. */
export function runSummary(view: RunView): string {
  const { requests, members } = view;
  return [
    view.membersError ? "members: could not be read" : `${members.length} ${members.length === 1 ? "member" : "members"}`,
    view.inboxError ? "inbox: could not be read" : `${requests.length} ${requests.length === 1 ? "request" : "requests"}`,
  ].join(" · ");
}

/**
 * The link that opens the backoffice with this collective's invitation. Not
 * offered on localhost: a link to someone's own laptop invites nobody.
 */
export function invitationLink(collective: Collective): string | null {
  const { hostname } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]") return null;
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("collective", collective.configUrl);
  return url.href;
}

/**
 * The collective's own screen (layout L2): requests beside members on a wide
 * screen, one above the other on a phone with chips to jump between them.
 * The chips are buttons, not `#` links: the address's fragment is the router's.
 */
export function renderRunView(view: RunView): string {
  const { collective, owner, requests, members, others } = view;
  const link = invitationLink(collective);
  const requestCount = view.inboxError ? "?" : String(requests.length);
  const memberCount = view.membersError ? "?" : String(members.length);

  const requestsBody = view.inboxError
    ? `<p class="error">${esc(view.inboxError)}</p>`
    : requests.length
      ? requests.map((r, i) => renderRequest(r, i, collective)).join("")
      : `<p class="meta">No request waiting. New ones arrive in the inbox and appear here.</p>`;

  const membersBody = view.membersError
    ? `<p class="error">${esc(view.membersError)}</p>`
    : members.length
      ? `<table class="members">
           <thead><tr>
             <th scope="col">Member</th><th scope="col">Short name</th><th scope="col">Both sides</th>
             <th scope="col">Shares</th><th scope="col"><span class="visually-hidden">Actions</span></th>
           </tr></thead>
           <tbody>${members.map((m, i) => renderMember(m, i, collective, owner)).join("")}</tbody>
         </table>
         <p class="meta" id="find-none" hidden>No member matches.</p>
         <p class="meta">"Shares" comes from each member's announcement: only their pod can confirm the folder is still shared.</p>
         <p class="step-error error" role="alert" hidden></p>`
      : `<p class="lead">Nobody yet. Accepted requests appear here.</p>`;

  return `
    <header class="view-head run-head">
      <div class="stack">
        <p class="eyebrow">You run</p>
        <h1 class="display" data-view-title>${esc(collective.name)}</h1>
        <p class="meta">Address to give people: <code>${esc(collective.configUrl)}</code></p>
      </div>
      <div class="actions">
        ${requests.length ? `<span class="pill is-wait">${requests.length} ${requests.length === 1 ? "request" : "requests"}</span>` : ""}
        <span class="pill">${esc(runSummary(view).split(" · ")[0])}</span>
        ${link ? `<button id="copy-invite" class="ghost small" data-link="${esc(link)}">Copy the invitation link</button>` : ""}
      </div>
    </header>

    <nav class="jump" aria-label="Sections">
      <button type="button" class="chip" data-jump="run-requests">Requests <span>${requestCount}</span></button>
      <button type="button" class="chip" data-jump="run-members">Members <span>${memberCount}</span></button>
      <button type="button" class="chip" data-jump="run-others">Other <span>${others.length}</span></button>
    </nav>

    <div class="run-grid">
      <section class="run-requests stack" id="run-requests" aria-labelledby="run-requests-title" tabindex="-1">
        <h2 class="label-mono" id="run-requests-title">Requests · ${requestCount}</h2>
        ${requestsBody}
      </section>

      <section class="run-members stack step-host" id="run-members" aria-labelledby="run-members-title" tabindex="-1">
        <div class="run-members-head">
          <h2 class="label-mono" id="run-members-title">Members · ${memberCount}</h2>
          ${members.length > 1 ? `<label class="find"><span class="visually-hidden">Find a member</span>
            <input id="find-member" type="search" placeholder="Find a member" autocomplete="off"></label>` : ""}
        </div>
        ${membersBody}
      </section>

      <section class="run-others stack step-host" id="run-others" aria-labelledby="run-others-title" tabindex="-1">
        <h2 class="label-mono" id="run-others-title">Other messages · ${others.length}</h2>
        <p class="meta">Messages in the inbox that are not requests appear here, and stay until you delete them.</p>
        ${others.length ? `<ul class="plain-list">${others.map(renderOther).join("")}</ul>` : ""}
        <p class="step-error error" role="alert" hidden></p>
      </section>
    </div>`;
}

/* ── Wiring ────────────────────────────────────────────────────────────── */

export function bindRun(app: HTMLElement, view: RunView, rerender: () => void): void {
  const { collective, owner } = view;

  const copy = app.querySelector<HTMLButtonElement>("#copy-invite");
  copy?.addEventListener("click", async () => {
    const link = copy.dataset.link!;
    try {
      await navigator.clipboard.writeText(link);
      announce("Invitation link copied.");
      toast("Invitation link copied.");
    } catch {
      // No clipboard (permission, insecure context): show it to copy by hand.
      toast(`Copy this link: ${link}`);
    }
  });

  app.querySelectorAll<HTMLButtonElement>("[data-jump]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = app.querySelector<HTMLElement>(`#${button.dataset.jump}`);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      target?.focus({ preventScroll: true });
    });
  });

  // Filters the rows already on screen: nothing is read again.
  const find = app.querySelector<HTMLInputElement>("#find-member");
  find?.addEventListener("input", () => {
    const query = find.value.trim().toLowerCase();
    let shown = 0;
    app.querySelectorAll<HTMLElement>("[data-member]").forEach((row) => {
      const match = !query || row.textContent!.toLowerCase().includes(query) || (row.querySelector("[title]")?.getAttribute("title") ?? "").toLowerCase().includes(query);
      row.hidden = !match;
      if (match) shown++;
    });
    app.querySelector<HTMLElement>("#find-none")!.hidden = shown > 0;
  });

  view.requests.forEach((request, i) => {
    const name = request.person.profile?.name ?? request.person.webId;
    bindForm(app, `#accept-${i}`, async (form) => {
      const nick = (form.elements.namedItem("nick") as HTMLInputElement).value.trim();
      const { answered } = await accept(collective, owner, request.message, request.person, nick);
      announce(`${name} is now a member.`);
      if (!answered) toast(`${name} has no inbox: tell them another way.`);
    }, rerender);

    const refuseButton = app.querySelector<HTMLButtonElement>(`#refuse-${i}`);
    if (refuseButton) {
      bindButton(refuseButton, async () => {
        const { answered } = await refuse(collective, owner, request.message, request.person);
        announce(`Request from ${name} refused.`);
        if (!answered) toast(`${name} has no inbox: tell them another way.`);
      }, rerender);
    }
  });

  app.querySelectorAll<HTMLButtonElement>("[data-grant]").forEach((button) => {
    const member = view.members[Number(button.dataset.grant)];
    bindButton(button, async () => {
      await grantMemberRead(await memberReadTargets(collective, owner), owner, member.webId);
      announce("Access granted.");
    }, rerender);
  });

  // Removing takes two clicks: the first one only asks.
  app.querySelectorAll<HTMLButtonElement>("[data-remove]").forEach((button) => {
    const member = view.members[Number(button.dataset.remove)];
    const name = member.profile?.name ?? member.webId;
    button.addEventListener("click", () => {
      if (!button.dataset.armed) {
        button.dataset.armed = "yes";
        button.textContent = `Yes, remove ${name}`;
        return;
      }
      void run(button, async () => {
        await removeMember(collective, owner, member);
        announce(`${name} is no longer a member. What was already collected stays.`);
      }, rerender);
    });
  });

  app.querySelectorAll<HTMLButtonElement>("[data-delete]").forEach((button) => {
    const message = view.others[Number(button.dataset.delete)];
    bindButton(button, async () => {
      await deleteMessage(message.url);
      announce("Message deleted.");
    }, rerender);
  });
}
