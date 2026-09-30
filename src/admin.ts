/**
 * "You run": the collective's side of the handshake, for its own account
 * (slice B, journeys J3 and J5). Requests, members, and the messages this app
 * does not understand, all read from the pods on every render.
 *
 * The protocol, and the order of its writes, is in `lib/admin.ts`. This file
 * only decides what to show and which lib call a button makes.
 */
import { appLink, linkFace } from "./invite";
import {
  accept,
  grantMemberRead,
  memberReadTargets,
  readInbox,
  readMembers,
  readPerson,
  readRoster,
  refuse,
  readersOf,
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
import { bindCopy, collectiveHead, copyable } from "./steps";

interface Request {
  message: InboxMessage;
  person: Person;
  flags: string[];
  /** Already on the roster: a previous accept stopped halfway. */
  listed: boolean;
  /** The nick the roster already holds for them, which never changes. */
  knownNick: string | null;
  /** What the form proposes: the known nick, else a free one. */
  nick: string;
  /** The nick their name gives, when another member already holds it. */
  nickTakenBy: string | null;
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
  // Everything starts at once; each read waits only for what names it: the
  // members' profiles for the roster, the requesters' for the inbox.
  let inboxError: string | null = null;
  const inbox = readInbox(collective).catch((err) => {
    inboxError = describePodError(err);
    return [] as InboxMessage[];
  });
  const joinsRead = inbox.then((messages) => {
    const joins = messages.filter((m) => m.type === "Join" && m.actor);
    return Promise.all(joins.map(async (message) => ({ message, person: await readPerson(message.actor!) })));
  });
  const roster = readRoster(collective);

  let members: MemberView[] = [];
  let nicks = new Map<string, string>();
  let membersError: string | null = null;
  const membersRead = Promise.all([readMembers(collective, owner, inbox, roster), roster]).then(
    ([m, r]) => {
      members = m;
      nicks = r.nicks;
    },
    (err) => {
      membersError = describePodError(err);
    }
  );
  const [messages, joins] = await Promise.all([inbox, joinsRead, membersRead]);
  const listed = new Set(members.map((m) => m.webId));

  // Held nicks, plus those proposed to earlier requests on this screen: two
  // people asking with the same name are not offered the same one.
  const taken = new Set(nicks.values());
  const requests = joins.map(({ message, person }) => {
    const knownNick = nicks.get(person.webId) ?? null;
    const plain = suggestNick(person);
    const nick = knownNick ?? suggestNick(person, taken);
    taken.add(nick);
    const holder = knownNick || nick === plain ? null : [...nicks].find(([, n]) => n === plain)?.[0] ?? null;
    return {
      message,
      person,
      flags: requestFlags(message, person, collective),
      listed: listed.has(person.webId),
      knownNick,
      nick,
      nickTakenBy: holder ? `"${plain}" is ${members.find((m) => m.webId === holder)?.profile?.name ?? holder}'s` : null,
    };
  });
  const others = messages.filter(
    (m) => !joins.some((j) => j.message === m) && !((m.type === "Announce" || m.type === "Undo") && m.actor && listed.has(m.actor))
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
  const { message, person, flags, listed, knownNick, nick, nickTakenBy } = request;
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
        <input name="nick" type="text" autocomplete="off" value="${esc(nick)}"${knownNick ? " readonly" : ""}
               pattern="[a-z0-9][a-z0-9\\-]{0,39}" required>
      </label>
      ${knownNick ? `<p class="meta">Kept from before: a short name never changes once used.</p>` : ""}
      ${nickTakenBy ? `<p class="meta">${esc(nickTakenBy)} already: short names name folders, so each is used once. Change it if you like.</p>` : ""}
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

/**
 * What "Find a member" matches: name, short name, and the WebID's path. Not
 * the host: members often share a provider, and "nico" would then match
 * everyone on pod.nicolasdb.eu.
 */
function searchText(member: MemberView): string {
  let path = member.webId;
  try {
    path = new URL(member.webId).pathname;
  } catch {
    // Not a URL: search it whole.
  }
  return [member.profile?.name ?? "", member.nick ?? "", path].join(" ").toLowerCase();
}

function renderMember(member: MemberView, i: number, collective: Collective, owner: string): string {
  const name = member.profile?.name;
  return `
    <tr data-member data-search="${esc(searchText(member))}">
      <td data-label="Member">
        ${name ? `<strong>${esc(name)}</strong><br>` : ""}${copyable(member.webId, "WebID copied.", shortWebId(member.webId))}
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
          !member.canReadRoster
            ? `<span class="meta">Cannot read the roster yet: accepting was not finished.</span>
               <button class="ghost small" data-grant="${i}">Let them read it</button>`
            : member.missing.length
              ? `<span class="meta">They or their agents cannot read ${member.missing.map((m) => `<code>${esc(m)}</code>`).join(", ")} yet.</span>
                 <button class="ghost small" data-grant="${i}">Let them read it</button>`
              : ""
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
      : message.type === "Undo"
        ? `Someone not on the roster stopped sharing${message.object ? ` ${message.object}` : ""}.`
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

/** Whether the backoffice runs on this computer, where its links reach nobody else. */
function isLocal(): boolean {
  const { hostname } = window.location;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/** The link that opens this backoffice with the collective's invitation. */
export function invitationLink(collective: Collective): string {
  return appLink("collective", collective.configUrl);
}

/** The invitation link as shown: the app's host, then the config's last two segments. */
export function invitationFace(link: string): string {
  return linkFace(link, "collective");
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
         <p class="meta">"Shares" comes from each member's messages (shared, stopped): only their pod can confirm the folder is still shared.</p>
         <p class="step-error error" role="alert" hidden></p>`
      : `<p class="lead">Nobody yet. Accepted requests appear here.</p>`;

  return `
    ${collectiveHead(
      collective.name,
      requests.length ? `<span class="pill is-wait">${requests.length} ${requests.length === 1 ? "request" : "requests"}</span>` : "",
      `<p class="meta invite-line">Invitation link ${copyable(link, "Invitation link copied.", invitationFace(link))}</p>
       ${isLocal() ? `<p class="meta">This link points to your development server: it works only on this computer.</p>` : ""}`,
      "run-head"
    )}

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

  bindCopy(app);

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
      const match = !query || row.dataset.search!.includes(query);
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
      const targets = await memberReadTargets(collective, owner);
      for (const reader of readersOf(member)) await grantMemberRead(targets, owner, reader);
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
