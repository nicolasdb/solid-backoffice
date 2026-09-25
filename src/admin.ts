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

function who(person: Person): string {
  const name = person.profile?.name;
  return name
    ? `<strong>${esc(name)}</strong> <span class="meta"><code>${esc(person.webId)}</code></span>`
    : `<code>${esc(person.webId)}</code>`;
}

function section(title: string, label: string, body: string): string {
  return `
    <section class="step">
      <div class="step-head">
        <h2>${esc(title)}</h2>
        <span class="label-mono">${esc(label)}</span>
      </div>
      ${body}
      <p class="step-error error" role="alert" hidden></p>
    </section>`;
}

function renderRequest(request: Request, i: number, collective: Collective): string {
  const { message, person, flags, listed, knownNick } = request;
  const profile = person.profile;
  const facts = profile
    ? `<ul class="plain-list">
         <li>Profile says they belong to ${esc(collective.name)}: ${profile.memberOf.includes(collective.group) ? "yes" : "no"}</li>
         <li>Agents: ${profile.delegates.length ? profile.delegates.map((d) => `<code>${esc(d)}</code>`).join(", ") : "none"}</li>
         <li>${profile.inbox ? "Has an inbox for the answer." : "No inbox: the answer cannot be sent; tell them another way."}</li>
       </ul>`
    : `<p class="meta">${esc(person.problem ?? "Their profile could not be read.")}</p>`;

  return section(profile?.name ? `${profile.name} asks to join` : "A request to join", "Request", `
    <p>${who(person)}</p>
    ${message.published ? `<p class="meta">Sent ${esc(new Date(message.published).toLocaleString())}</p>` : ""}
    ${facts}
    ${flags.map((f) => `<p class="error">${esc(f)}</p>`).join("")}
    ${listed ? `<p class="meta">Already on the roster: an earlier acceptance stopped halfway. Accepting again finishes it.</p>` : ""}
    <form id="accept-${i}" class="stack">
      <label>Short name, used in the collective's folders
        <input name="nick" value="${esc(knownNick ?? suggestNick(person))}"${knownNick ? " readonly" : ""}
               pattern="[a-z0-9][a-z0-9\\-]{0,39}" required>
      </label>
      ${knownNick ? `<p class="meta">Kept from before: a short name never changes once used.</p>` : ""}
      <p>
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

function renderMember(member: MemberView, i: number, collective: Collective, owner: string): string {
  return `
    <li>
      ${who(member)}${member.nick ? ` <span class="label-mono">${esc(member.nick)}</span>` : ""}
      <br><span class="meta">${esc(stateText(member, collective))}</span>
      ${member.announced.map((a) => `<br><span class="meta">Announced <code>${esc(a)}</code> (only their pod can confirm it is still shared)</span>`).join("")}
      ${
        member.canReadRoster
          ? ""
          : `<br><span class="meta">Cannot read the roster yet: accepting was not finished.</span>
             <button class="ghost" data-grant="${i}">Let them read it</button>`
      }
      ${member.webId === owner ? "" : `<button class="ghost" data-remove="${i}">Remove</button>`}
    </li>`;
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
      <button class="ghost" data-delete="${i}">Delete</button>
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

export function sectionRun(view: RunView, inviteLine: string): string {
  const { collective, owner, requests, members, others } = view;
  return `
    <h2 class="section-title">You run</h2>
    <section class="step">
      <div class="step-head">
        <h2>${esc(collective.name)}</h2>
        <span class="label-mono">Collective</span>
      </div>
      <p class="meta">${esc(runSummary(view))}</p>
      ${inviteLine}
    </section>

    ${view.inboxError ? section("Requests", "Unreadable", `<p class="error">${esc(view.inboxError)}</p>`) : ""}
    ${requests.map((r, i) => renderRequest(r, i, collective)).join("")}

    ${section("Members", String(members.length), view.membersError
      ? `<p class="error">${esc(view.membersError)}</p>`
      : members.length
        ? `<ul class="plain-list">${members.map((m, i) => renderMember(m, i, collective, owner)).join("")}</ul>`
        : `<p class="lead">Nobody yet. Accepted requests appear here.</p>`)}

    ${others.length ? section("Other messages", String(others.length), `
      <p class="meta">Messages in the inbox that are not requests. Kept until you delete them.</p>
      <ul class="plain-list">${others.map(renderOther).join("")}</ul>`) : ""}`;
}

/* ── Wiring ────────────────────────────────────────────────────────────── */

export function bindRun(app: HTMLElement, view: RunView, rerender: () => void): void {
  const { collective, owner } = view;

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
