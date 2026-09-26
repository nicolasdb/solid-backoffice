/**
 * Collectives, admin side — solid-kit ADR 006 §2, for the collective's own
 * account: read the inbox, check each requester's profile, accept, refuse,
 * remove. The member side is `collective.ts`.
 *
 * The rules that shape this file:
 *
 * - MEMBERSHIP GRANTS NOTHING. Accepting writes the roster AND, separately,
 *   one per-WebID Read grant on each member-readable resource. Never a group.
 * - ORDER OF WRITES. Accept: roster → grants → `as:Accept` → delete the Join.
 *   Refuse: `as:Reject` → delete the Join. Remove: revoke grants → roster →
 *   `as:Remove`. The Join is deleted last, so a failure halfway leaves the
 *   request on screen and accepting it again finishes the job (every step is
 *   idempotent).
 * - EVERYTHING IS WRITTEN ON THE COLLECTIVE'S OWN POD, except the answer
 *   POSTed to the requester's inbox.
 * - THE ROSTER IS EDITED AS TEXT, conditionally (`updateDocument`), so the
 *   comments a person wrote in it survive. A line this code cannot find in a
 *   form it understands is refused, never rewritten.
 */
import { Parser, type Quad } from "n3";
import { authFetch } from "./auth";
import { NS } from "./vocab";
import { buildAnswer, buildRemove } from "./activity";
import {
  parseProfile,
  profileDocOf,
  sendToInbox,
  type Collective,
  type MemberDeclaration,
  type MembershipState,
} from "./collective";
import { updateDocument } from "./conditional";
import { getAccess, isValidWebId, setAgentAccess } from "./acl";
import { exists, slugify } from "./pod";

const RDF_TYPE = NS.rdf + "type";
const FOAF_MEMBER = NS.foaf + "member";
const FOAF_NICK = NS.foaf + "nick";

function parse(turtle: string, base: string): Quad[] {
  return new Parser({ baseIRI: base }).parse(turtle);
}

/* ── Inbox ─────────────────────────────────────────────────────────────── */

/** One message in an inbox. Messages this app does not understand are kept, as "other". */
export interface InboxMessage {
  url: string;
  type: "Join" | "Announce" | "other";
  /** The full `rdf:type` IRI, so an unknown message can still be named. */
  rawType: string | null;
  actor: string | null;
  object: string | null;
  target: string | null;
  summary: string | null;
  published: string | null;
  /** Why the message could not be read or understood; `null` when it could. */
  problem: string | null;
}

export function parseInboxListing(turtle: string, inboxUrl: string): string[] {
  return parse(turtle, inboxUrl)
    .filter((q) => q.subject.value === inboxUrl && q.predicate.value === NS.ldp + "contains")
    .map((q) => q.object.value);
}

function unreadable(url: string, problem: string): InboxMessage {
  return { url, type: "other", rawType: null, actor: null, object: null, target: null, summary: null, published: null, problem };
}

/**
 * Parses one inbox message. The activity is the subject carrying `as:actor`,
 * not `<>`: a POSTed body's relative IRIs resolve differently across servers.
 */
export function parseActivity(turtle: string, url: string): InboxMessage {
  let quads: Quad[];
  try {
    quads = parse(turtle, url);
  } catch (err) {
    return unreadable(url, `Not readable as Turtle: ${err instanceof Error ? err.message : String(err)}`);
  }
  const subject =
    quads.find((q) => q.predicate.value === NS.as + "actor")?.subject.value ??
    quads.find((q) => q.predicate.value === RDF_TYPE)?.subject.value;
  if (!subject) return unreadable(url, "No activity in this message.");

  const one = (predicate: string) =>
    quads.find((q) => q.subject.value === subject && q.predicate.value === predicate)?.object.value ?? null;
  const types = quads.filter((q) => q.subject.value === subject && q.predicate.value === RDF_TYPE).map((q) => q.object.value);
  const known = types.find((t) => t === NS.as + "Join" || t === NS.as + "Announce");

  return {
    url,
    type: known ? (known.slice(NS.as.length) as "Join" | "Announce") : "other",
    rawType: known ?? types[0] ?? null,
    actor: one(NS.as + "actor"),
    object: one(NS.as + "object"),
    target: one(NS.as + "target"),
    summary: one(NS.as + "summary"),
    published: one(NS.as + "published"),
    problem: null,
  };
}

async function readMessage(url: string): Promise<InboxMessage> {
  try {
    const res = await authFetch(url, { headers: { Accept: "text/turtle" }, cache: "no-store" });
    if (!res.ok) return unreadable(url, `Could not be read (${res.status}).`);
    const type = res.headers.get("content-type") ?? "";
    if (!/turtle|n-triples|n3/i.test(type)) return unreadable(url, `Not an activity: ${type || "no content type"}.`);
    return parseActivity(await res.text(), url);
  } catch (err) {
    return unreadable(url, err instanceof Error ? err.message : String(err));
  }
}

/** Every message in the collective's inbox, oldest first. Never drops one. */
export async function readInbox(collective: Collective): Promise<InboxMessage[]> {
  const res = await authFetch(collective.inbox, { headers: { Accept: "text/turtle" }, cache: "no-store" });
  if (!res.ok) throw new Error(`Could not read the inbox at ${collective.inbox} (${res.status}).`);
  const urls = parseInboxListing(await res.text(), collective.inbox);
  const messages = await Promise.all(urls.map(readMessage));
  return messages.sort((a, b) => (a.published ?? "￿").localeCompare(b.published ?? "￿"));
}

/** Deletes a handled message. Already gone counts as done. */
export async function deleteMessage(url: string): Promise<void> {
  const res = await authFetch(url, { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error(`Could not delete ${url} (${res.status}).`);
}

/* ── People ────────────────────────────────────────────────────────────── */

/** What someone's profile declares, read by the collective. `null` when unreachable. */
export interface Person {
  webId: string;
  profile: MemberDeclaration | null;
  problem: string | null;
}

export async function readPerson(webId: string): Promise<Person> {
  try {
    const doc = profileDocOf(webId);
    const res = await authFetch(doc, { headers: { Accept: "text/turtle" }, cache: "no-store" });
    if (!res.ok) return { webId, profile: null, problem: `Their profile could not be read (${res.status}).` };
    return { webId, profile: parseProfile(await res.text(), doc, webId), problem: null };
  } catch (err) {
    return { webId, profile: null, problem: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * What an admin should know before accepting. Empty means the two sides agree.
 * A claim from one side only proves nothing (ADR 006 §2).
 */
export function requestFlags(message: InboxMessage, person: Person, collective: Collective): string[] {
  const flags: string[] = [];
  if (message.object !== collective.group) {
    flags.push(`This request names another collective: ${message.object ?? "none"}.`);
  }
  if (!person.profile) {
    flags.push("Their profile could not be read, so the request cannot be checked.");
  } else if (!person.profile.memberOf.includes(collective.group)) {
    flags.push(`Their profile does not say they belong to ${collective.name}.`);
  }
  return flags;
}

/** A nick for the roster, from the person's name or their pod's first path segment. */
export function suggestNick(person: Person): string {
  const from = person.profile?.name ?? new URL(person.webId).pathname.split("/").filter(Boolean)[0] ?? "";
  return slugify(from, "member").slice(0, 40).replace(/-+$/, "");
}

/* ── Roster ────────────────────────────────────────────────────────────── */

export interface RosterEntry {
  webId: string;
  nick: string | null;
}

/** Everyone the roster lists, with their nick. Also nicks of people no longer listed. */
export function parseRosterEntries(turtle: string, rosterUrl: string, group: string): {
  members: RosterEntry[];
  nicks: Map<string, string>;
} {
  const quads = parse(turtle, rosterUrl);
  const nicks = new Map(quads.filter((q) => q.predicate.value === FOAF_NICK).map((q) => [q.subject.value, q.object.value]));
  const members = quads
    .filter((q) => q.subject.value === group && q.predicate.value === FOAF_MEMBER)
    .map((q) => ({ webId: q.object.value, nick: nicks.get(q.object.value) ?? null }));
  return { members, nicks };
}

/** An error carrying a code the screen can act on. */
export interface AdminError extends Error {
  code: "nick-taken" | "bad-nick" | "bad-webid" | "not-representable" | "acl-inherited";
}

function adminError(code: AdminError["code"], message: string): AdminError {
  return Object.assign(new Error(message), { code });
}

/** A nick ends up in paths (`depots/<nick>/`): plain lowercase segments only. */
export function isValidNick(nick: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,39}$/.test(nick);
}

/**
 * Adds a member to the roster text: a `foaf:member` line and, unless the
 * person already has one, a `foaf:nick` line. A nick is never changed once
 * used, so a returning member keeps theirs. Returns the text unchanged when
 * already listed. Pure, so `updateDocument` may call it again on a 412.
 */
export function addMemberText(current: string, rosterUrl: string, group: string, webId: string, nick: string): string {
  if (!isValidWebId(webId)) throw adminError("bad-webid", `Not a valid WebID: ${webId}`);
  const { members, nicks } = parseRosterEntries(current, rosterUrl, group);
  if (members.some((m) => m.webId === webId)) return current;

  const lines = [`<${group}> <${FOAF_MEMBER}> <${webId}> .`];
  if (!nicks.has(webId)) {
    if (!isValidNick(nick)) throw adminError("bad-nick", `"${nick}" cannot be used: lowercase letters, digits and dashes only.`);
    const holder = [...nicks].find(([, n]) => n === nick)?.[0];
    if (holder) throw adminError("nick-taken", `The nick "${nick}" is already used by ${holder}.`);
    lines.push(`<${webId}> <${FOAF_NICK}> "${nick}" .`);
  }
  const sep = current === "" || current.endsWith("\n") ? "" : "\n";
  return current + sep + lines.join("\n") + "\n";
}

/**
 * Removes a member's `foaf:member` line, keeping everything else (comments,
 * their nick). A line is removed only if, read on its own with the document's
 * prefixes, it says exactly that one triple; anything else is refused.
 */
export function removeMemberText(current: string, rosterUrl: string, group: string, webId: string): string {
  const lines = current.split("\n");
  const prefixes = lines.filter((l) => /^\s*(@prefix|@base|PREFIX|BASE)\b/i.test(l)).join("\n");
  const isThatLine = (line: string): boolean => {
    if (!line.trim() || line.trim().startsWith("#") || /^\s*(@prefix|@base|PREFIX|BASE)\b/i.test(line)) return false;
    try {
      const quads = parse(`${prefixes}\n${line}`, rosterUrl);
      return (
        quads.length === 1 &&
        quads[0].subject.value === group &&
        quads[0].predicate.value === FOAF_MEMBER &&
        quads[0].object.value === webId
      );
    } catch {
      return false;
    }
  };
  const kept = lines.filter((l) => !isThatLine(l));
  const next = kept.join("\n");
  if (parseRosterEntries(next, rosterUrl, group).members.some((m) => m.webId === webId)) {
    throw adminError(
      "not-representable",
      `${webId} is listed in a form this app cannot edit safely (several statements on one line, for example). ` +
        "Nothing was changed; remove the line by hand."
    );
  }
  return next;
}

export async function addToRoster(collective: Collective, webId: string, nick: string): Promise<void> {
  await updateDocument(collective.roster, (text) => addMemberText(text, collective.roster, collective.group, webId, nick));
}

export async function removeFromRoster(collective: Collective, webId: string): Promise<void> {
  await updateDocument(collective.roster, (text) => removeMemberText(text, collective.roster, collective.group, webId));
}

/** The roster, read by its owner. */
export async function readRoster(collective: Collective): Promise<ReturnType<typeof parseRosterEntries>> {
  const res = await authFetch(collective.roster, { headers: { Accept: "text/turtle" }, cache: "no-store" });
  if (!res.ok) throw new Error(`Could not read the roster at ${collective.roster} (${res.status}).`);
  return parseRosterEntries(await res.text(), collective.roster, collective.group);
}

/* ── Grants ────────────────────────────────────────────────────────────── */

/**
 * Where a member holds Read, one WebID at a time (ADR 006 §5): the roster,
 * and the shared containers once they exist. Relative to the collective's pod
 * root, which is where `config.ttl` sits.
 */
export const MEMBER_READ_OPTIONAL = ["depots/", "principles/"];

/**
 * The resources to grant on, checked BEFORE any write: each must have its own
 * `.acl`. Writing one where it is inherited would replace inheritance and
 * silently drop every other grant (the agent's, for example).
 */
export async function memberReadTargets(collective: Collective, owner: string): Promise<string[]> {
  const optional = MEMBER_READ_OPTIONAL.map((p) => new URL(p, collective.configUrl).href);
  const present = await Promise.all(optional.map(exists));
  const targets = [collective.roster, ...optional.filter((_, i) => present[i])];
  for (const target of targets) {
    const access = await getAccess(target, owner);
    if (access.inherited) {
      throw adminError(
        "acl-inherited",
        `${target} has no access rules of its own. Give it an .acl first ` +
          "(docs/how-to/set-up-a-collective.md), so granting one member does not remove the others' access."
      );
    }
  }
  return targets;
}

export async function grantMemberRead(targets: string[], owner: string, webId: string): Promise<void> {
  for (const target of targets) await setAgentAccess(target, owner, webId, ["read"]);
}

export async function revokeMemberRead(targets: string[], owner: string, webId: string): Promise<void> {
  for (const target of targets) await setAgentAccess(target, owner, webId, []);
}

/* ── The handshake, collective side ────────────────────────────────────── */

export interface Outcome {
  /** Whether the answer reached the person's inbox. `false`: they have none. */
  answered: boolean;
}

/**
 * Accept: roster → grants → `as:Accept` → delete the Join. Every step is safe
 * to repeat, so a request left on screen by a failure is finished by
 * accepting it again.
 */
export async function accept(
  collective: Collective,
  owner: string,
  join: InboxMessage,
  person: Person,
  nick: string
): Promise<Outcome> {
  if (!join.actor || join.actor !== person.webId) throw new Error("This request has no sender to accept.");
  const targets = await memberReadTargets(collective, owner);
  await addToRoster(collective, person.webId, nick);
  await grantMemberRead(targets, owner, person.webId);
  const inbox = person.profile?.inbox ?? null;
  if (inbox) await sendToInbox(inbox, buildAnswer("Accept", owner, join.url, collective.group));
  await deleteMessage(join.url);
  return { answered: inbox !== null };
}

/** Refuse: `as:Reject` → delete the Join. Nothing is written to the roster. */
export async function refuse(collective: Collective, owner: string, join: InboxMessage, person: Person): Promise<Outcome> {
  const inbox = person.profile?.inbox ?? null;
  if (inbox) await sendToInbox(inbox, buildAnswer("Reject", owner, join.url, collective.group));
  await deleteMessage(join.url);
  return { answered: inbox !== null };
}

/**
 * Remove: revoke grants → roster → `as:Remove`. Grants go first, so a failure
 * never leaves someone off the roster who can still read it. The nick stays
 * (it is used in paths), and nothing already collected is deleted (J5).
 */
export async function removeMember(collective: Collective, owner: string, person: Person): Promise<Outcome> {
  const targets = await memberReadTargets(collective, owner);
  await revokeMemberRead(targets, owner, person.webId);
  await removeFromRoster(collective, person.webId);
  const inbox = person.profile?.inbox ?? null;
  if (inbox) await sendToInbox(inbox, buildRemove(owner, person.webId, collective.group));
  return { answered: inbox !== null };
}

/* ── Members, both sides ───────────────────────────────────────────────── */

export interface MemberView extends Person {
  nick: string | null;
  /** From both sides; "unknown" when their profile cannot be read. */
  state: MembershipState;
  /** Whether the roster's own `.acl` grants them Read. `false`: accepting was not finished. */
  canReadRoster: boolean;
  /** Folders they announced. Only their pod can say whether the grant still holds. */
  announced: string[];
}

export function memberState(person: Person, group: string): MembershipState {
  if (!person.profile) return "unknown";
  return person.profile.memberOf.includes(group) ? "member" : "left";
}

/**
 * `messages` may still be on its way: only the announced folders need it, so
 * the profiles are read meanwhile. `roster` is passed when the caller has
 * already read it, so it is not read twice.
 */
export async function readMembers(
  collective: Collective,
  owner: string,
  messages: InboxMessage[] | Promise<InboxMessage[]>,
  roster?: Promise<ReturnType<typeof parseRosterEntries>>
): Promise<MemberView[]> {
  const entries = (roster ?? readRoster(collective)).then((r) => r.members);
  const people = entries.then((members) => Promise.all(members.map((entry) => readPerson(entry.webId))));
  const [members, access, persons, inbox] = await Promise.all([
    entries,
    getAccess(collective.roster, owner),
    people,
    messages,
  ]);
  const readers = new Set(access.agents.filter((a) => a.modes.includes("read")).map((a) => a.webId));
  return members.map((entry, i) => ({
    ...persons[i],
    nick: entry.nick,
    state: memberState(persons[i], collective.group),
    canReadRoster: readers.has(entry.webId) || entry.webId === owner,
    announced: inbox
      .filter((m) => m.type === "Announce" && m.actor === entry.webId && m.object)
      .map((m) => m.object!),
  }));
}
