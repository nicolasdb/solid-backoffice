/**
 * Collectives, membership and publication — solid-kit ADR 006, member side.
 *
 * Everything here is either a pure parse/serialize function (tested without a
 * pod) or a thin write that does one protocol step. The backoffice is generic:
 * nothing about a particular collective is hardcoded. A collective is described
 * by a `config.ttl` on its own pod, and `src/config.ts` only lists where those
 * files are.
 *
 * Two rules from the ADR that the code has to keep:
 *
 * - MEMBERSHIP IS READ FROM BOTH SIDES, NEVER STORED. The member's profile says
 *   `org:memberOf`; the collective's roster says `foaf:member`. The state is
 *   computed from the two every time. There is no "status" field to go stale.
 * - MEMBERSHIP GRANTS NOTHING. Joining writes the profile and sends a request;
 *   publishing is a separate, per-WebID ACL grant. Never a group in an ACL.
 */
import { Parser, type Quad } from "n3";
import {
  getSolidDataset,
  getThing,
  saveSolidDatasetAt,
  setThing,
  addUrl,
  removeUrl,
  setStringNoLocale,
  setUrl,
  getUrlAll,
  createThing,
} from "@inrupt/solid-client";
import { authFetch } from "./auth";
import { readTurtle } from "./read";
import { setPublicAccess } from "./acl";
import { NS } from "./vocab";

export { NS };
export { buildJoin, buildAnnounce, buildUndoAnnounce } from "./activity";

const FOAF_NAME = NS.foaf + "name";
const FOAF_MEMBER = NS.foaf + "member";
const MEMBER_OF = NS.org + "memberOf";
const DELEGATES = NS.acl + "delegates";
const INBOX = NS.ldp + "inbox";
const SEE_ALSO = NS.rdfs + "seeAlso";
const PRIMARY_TOPIC_OF = NS.foaf + "isPrimaryTopicOf";
const STORAGE = NS.pim + "storage";

/**
 * What a collective's `config.ttl` declares.
 *
 * The collective's IRI IS the group IRI: `config.ttl#hyperscope`. So the
 * `org:memberOf` link in a member's profile, followed, leads straight to this
 * description — the app finds a member's collectives from their profile, with
 * no list of collectives built into it.
 *
 * Whether members share a folder with it is `sharing` (solid-kit ADR 006 §7,
 * amended 2026-11-17): on with `sc:feature sc:Sharing`, which then needs
 * exactly one agent, and always on for a config still in the old `hs:`
 * namespace. Off, the collective is membership only: no agent is needed and
 * nothing is shared with it.
 */
interface CollectiveBase {
  configUrl: string;
  /** The IRI members point at with `org:memberOf`, and the roster lists under. */
  group: string;
  name: string;
  /** The document listing `<group> foaf:member <WebID>`. Readable by members only. */
  roster: string;
  /** Where `as:Join` and `as:Announce` go. Signed-in agents may Append. */
  inbox: string;
  /**
   * The folder the collective suggests a member shares through, relative to
   * their pod root, e.g. "output2/hyperscope/" (`sc:suggestedFolder`, which
   * was `hs:bundleFolder`). Only a suggestion: the member picks the folder
   * (`settings/collectives.ttl`). Always there in the old namespace.
   */
  suggestedFolder?: string;
  /** The welcome screen's title for people it invites (`schema:slogan`), when it has exactly one. */
  slogan?: string;
  /** The paragraph under it (`schema:description`), when it has exactly one. */
  description?: string;
}

export type Collective = CollectiveBase &
  (
    | {
        /** Members share a folder with `agent`. */
        sharing: true;
        /** The collective's agent: the one WebID a member grants Read to when sharing. */
        agent: string;
      }
    | {
        /** Membership only: nothing is shared with it. */
        sharing: false;
        /** An agent it names anyway: a name to show, never a grant. */
        agent?: string;
      }
  );

function parse(turtle: string, base: string): Quad[] {
  return new Parser({ baseIRI: base }).parse(turtle);
}

function objectsOf(quads: Quad[], subject: string, predicate: string): string[] {
  return quads
    .filter((q) => q.subject.value === subject && q.predicate.value === predicate)
    .map((q) => q.object.value);
}

/** The prefix line a config.ttl needs for each namespace it may use. */
const KNOWN_PREFIXES: Record<string, string> = {
  sc: NS.sc,
  hs: NS.hsLegacy,
  foaf: NS.foaf,
  ldp: NS.ldp,
  schema: NS.schema,
  org: NS.org,
  rdf: NS.rdf,
};

/**
 * Parse errors say what the parser saw; for a missing prefix, also say the
 * line that fixes it (typically `schema:` added for the welcome words).
 */
function explainParseError(err: unknown, configUrl: string): Error {
  const message = err instanceof Error ? err.message : String(err);
  const prefix = /Undefined prefix "(\w+):"/.exec(message)?.[1];
  const fix = prefix && KNOWN_PREFIXES[prefix]
    ? ` Add this line at the top of the file: @prefix ${prefix}: <${KNOWN_PREFIXES[prefix]}> .`
    : "";
  return new Error(`${configUrl} is not valid Turtle: ${message}.${fix}`);
}

/**
 * Parses a collective's `config.ttl`. Throws, naming what is wrong, rather
 * than filling a default: a guessed agent WebID is a grant to the wrong party.
 *
 * Both namespaces are read (solid-kit ADR 006 §7): `sc:` and the old `hs:`.
 * A collective typed only `hs:Collective` is read exactly as before: its
 * agent and its folder are required, and sharing is on. One typed
 * `sc:Collective` shares only with `sc:feature sc:Sharing`. A term given in
 * both namespaces (`sc:agent` and `hs:agent`) is refused, not merged: which
 * one is meant cannot be told, and for the agent a guess is a grant.
 */
export function parseCollectiveConfig(turtle: string, configUrl: string, expected?: string): Collective {
  let quads: Quad[];
  try {
    quads = parse(turtle, configUrl);
  } catch (err) {
    throw explainParseError(err, configUrl);
  }
  const typed = (type: string) =>
    quads.filter((q) => q.predicate.value === NS.rdf + "type" && q.object.value === type).map((q) => q.subject.value);
  const declared = [...new Set([...typed(NS.sc + "Collective"), ...typed(NS.hsLegacy + "Collective")])];
  const subject = expected ? declared.find((d) => d === expected) : declared[0];
  if (!subject) {
    throw new Error(`${configUrl} declares no sc:Collective${expected ? ` named ${expected}` : ""}.`);
  }
  if (!expected && declared.length > 1) {
    throw new Error(`${configUrl} declares several collectives; use the address of one of them.`);
  }
  // Typed in the old namespace only: read as before §7.
  const legacy = !typed(NS.sc + "Collective").includes(subject);

  /** A term's values, from whichever namespace gives it, and its name in errors. */
  const term = (current: string, old: string): { values: string[]; label: string } => {
    const now = objectsOf(quads, subject, NS.sc + current);
    const before = objectsOf(quads, subject, NS.hsLegacy + old);
    if (now.length && before.length) {
      throw new Error(
        `${configUrl} gives both sc:${current} and hs:${old}: keep sc:${current} only. ` +
          "Which one is meant cannot be guessed (solid-kit ADR 006 §7)."
      );
    }
    return { values: now.length ? now : before, label: before.length || (legacy && !now.length) ? `hs:${old}` : `sc:${current}` };
  };
  const exactlyOne = ({ values, label }: { values: string[]; label: string }, why = ""): string => {
    if (values.length !== 1) throw new Error(`${configUrl}: ${why}expected exactly one ${label}, found ${values.length}.`);
    return values[0];
  };
  const atMostOne = ({ values, label }: { values: string[]; label: string }): string | undefined => {
    if (values.length > 1) throw new Error(`${configUrl}: expected at most one ${label}, found ${values.length}.`);
    return values[0];
  };
  const one = (predicate: string, label: string): string => exactlyOne({ values: objectsOf(quads, subject, predicate), label });

  // `sc:feature` is new with §7: the old namespace never had one.
  const sharing = legacy || objectsOf(quads, subject, NS.sc + "feature").includes(NS.sc + "Sharing");
  const agentTerm = term("agent", "agent");
  const folderTerm = term("suggestedFolder", "bundleFolder");
  const agent = sharing
    ? exactlyOne(agentTerm, legacy ? "" : "sc:feature sc:Sharing needs an agent: ")
    : atMostOne(agentTerm);
  // The old namespace required the folder; it stays required there.
  const suggestedFolder = legacy ? exactlyOne(folderTerm) : atMostOne(folderTerm);
  if (suggestedFolder !== undefined && !isFolderPath(suggestedFolder)) {
    throw new Error(`${configUrl}: ${folderTerm.label} must be a folder path like "output2/hyperscope/".`);
  }

  // Presentation only, so a repeated one is ignored rather than refused:
  // no grant depends on it (docs/reference/collective-files.md#welcome-copy).
  // schema.org is written with http:// or https://; both are read.
  const optional = (term: string): string | undefined => {
    const values = [NS.schema, "https://schema.org/"]
      .flatMap((ns) => objectsOf(quads, subject, ns + term))
      .map((v) => v.trim())
      .filter(Boolean);
    return values.length === 1 ? values[0] : undefined;
  };
  const slogan = optional("slogan");
  const description = optional("description");

  const base: CollectiveBase = {
    configUrl,
    group: subject,
    name: one(FOAF_NAME, "foaf:name"),
    roster: exactlyOne(term("roster", "roster")),
    inbox: one(INBOX, "ldp:inbox"),
    ...(suggestedFolder !== undefined ? { suggestedFolder } : {}),
    ...(slogan ? { slogan } : {}),
    ...(description ? { description } : {}),
  };
  if (sharing && agent !== undefined) return { ...base, sharing: true, agent };
  return { ...base, sharing: false, ...(agent !== undefined ? { agent } : {}) };
}

/**
 * A relative folder path inside the member's pod, such as "output2/hyperscope/":
 * plain segments, ending in "/". No "..", no ".", no absolute path — the config
 * is someone else's file, and it decides where the member's app creates a folder.
 */
function isFolderPath(value: string): boolean {
  if (!value.endsWith("/")) return false;
  const segments = value.slice(0, -1).split("/");
  return segments.every((seg) => /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(seg) && seg !== "." && seg !== "..");
}

/** What a WebID profile declares, member side. */
export interface MemberDeclaration {
  name: string | null;
  memberOf: string[];
  delegates: string[];
  inbox: string | null;
  /**
   * Your own profile only: the extended profile the steps write to
   * (`profile/about.ttl`) when your profile is a file apps cannot write and
   * does not link it yet. What it holds is counted here, for you, but nobody
   * else finds it until the two lines (`linkLines`) are in your profile.
   */
  unlinked?: string;
}

export function parseProfile(turtle: string, profileDocUrl: string, webId: string): MemberDeclaration {
  return declarationOf(parse(turtle, profileDocUrl), webId);
}

/** What the quads say about `webId`; only triples whose subject is the WebID count. */
function declarationOf(quads: Quad[], webId: string): MemberDeclaration {
  const unique = (values: string[]) => [...new Set(values)];
  return {
    name: objectsOf(quads, webId, FOAF_NAME)[0] ?? null,
    memberOf: unique(objectsOf(quads, webId, MEMBER_OF)),
    delegates: unique(objectsOf(quads, webId, DELEGATES)),
    inbox: objectsOf(quads, webId, INBOX)[0] ?? null,
  };
}

/*
 * ── The extended profile (solid-kit ADR 002, amendment of 2026-11-26) ──────
 *
 * A tier-1 WebID (https://id.openfab.be/profile/card#me) is a static file on
 * the owner's own domain: no app can write it. It links an extended profile
 * in the pod, `profile/about.ttl`, with rdfs:seeAlso AND
 * foaf:isPrimaryTopicOf; either one is followed. What happened before this:
 * every step that wrote the profile ended in a NetworkError on
 * pod.syntonie.be (solid-backoffice#26), and the lines were added by hand.
 *
 * TRUST: a linked document is read only when it is inside a pim:storage the
 * WebID profile itself declares (prefix match). Anyone can link anything; only
 * the owner writes in their storage. One level only: links inside the
 * extended documents are not followed.
 */

/** One document of a profile, as read. */
export interface ProfileDocument {
  url: string;
  text: string;
}

/** A profile and the extended documents it links, read for showing or deciding. */
export interface ProfileDocuments {
  profile: ProfileDocument;
  /** Linked documents inside a declared storage that could be read. One that fails is skipped. */
  extended: ProfileDocument[];
  /** Linked documents outside every declared storage: never read. */
  ignored: string[];
  /** The storages the profile declares, each ending in "/". */
  storages: string[];
  /** Whether the profile's GET answered as writable (`WAC-Allow` / `Allow`). */
  writable: boolean;
}

/** A profile that could not be read, with its HTTP status when there was one. */
export interface ProfileReadError extends Error {
  status?: number;
}

/**
 * Whether a GET's headers say this app may write the document: `WAC-Allow`'s
 * `user` holds write or append; without a `WAC-Allow`, an `Allow` listing
 * PATCH or PUT. A static file answers neither. `WAC-Allow` decides when it is
 * there: CSS lists PATCH in `Allow` whatever the requester may do.
 */
export function answersWritable(headers: Headers): boolean {
  const wac = headers.get("wac-allow");
  if (wac !== null) {
    const user = /user\s*=\s*"([^"]*)"/i.exec(wac)?.[1] ?? "";
    return /\b(write|append)\b/i.test(user);
  }
  return /\b(PATCH|PUT)\b/i.test(headers.get("allow") ?? "");
}

function storagesIn(quads: Quad[], webId: string): string[] {
  return [...new Set(objectsOf(quads, webId, STORAGE).map((s) => (s.endsWith("/") ? s : s + "/")))];
}

/**
 * The documents a profile links with rdfs:seeAlso or foaf:isPrimaryTopicOf,
 * split by whether they are inside one of `storages` (the only ones read).
 */
export function linkedDocuments(
  quads: Quad[],
  webId: string,
  profileDocUrl: string,
  storages: string[]
): { inside: string[]; outside: string[] } {
  const docs = new Set<string>();
  for (const iri of [...objectsOf(quads, webId, SEE_ALSO), ...objectsOf(quads, webId, PRIMARY_TOPIC_OF)]) {
    try {
      const doc = profileDocOf(iri);
      if (doc !== profileDocUrl && /^https?:/.test(doc)) docs.add(doc);
    } catch {
      // Not an IRI a document can be read from (a blank node, a literal).
    }
  }
  const inside = [...docs].filter((d) => storages.some((s) => d.startsWith(s)));
  return { inside, outside: [...docs].filter((d) => !inside.includes(d)) };
}

/** A document's text through read.ts, or `null` when it cannot be read or parsed. */
async function readOptional(url: string): Promise<ProfileDocument | null> {
  try {
    const res = await readTurtle(url);
    if (!res.ok) return null;
    const text = await res.text();
    parse(text, url);
    return { url, text };
  } catch {
    return null;
  }
}

/**
 * Reads a WebID's profile and the extended documents it links (one level),
 * through read.ts (ADR 007: revalidated, never stale). A profile with no
 * links costs one request, as before. Throws a ProfileReadError when the
 * profile itself cannot be read.
 */
export async function readProfileDocuments(webId: string): Promise<ProfileDocuments> {
  const url = profileDocOf(webId);
  const res = await readTurtle(url);
  if (!res.ok) {
    const err = new Error(`Could not read the profile at ${url} (${res.status}).`) as ProfileReadError;
    err.status = res.status;
    throw err;
  }
  const text = await res.text();
  const quads = parse(text, url);
  const storages = storagesIn(quads, webId);
  const { inside, outside } = linkedDocuments(quads, webId, url, storages);
  const extended = (await Promise.all(inside.map(readOptional))).filter((d): d is ProfileDocument => d !== null);
  return { profile: { url, text }, extended, ignored: outside, storages, writable: answersWritable(res.headers) };
}

/** The union of what the documents declare about `webId`, the profile first. */
export function declarationOfDocuments(docs: ProfileDocument[], webId: string): MemberDeclaration {
  return declarationOf(docs.flatMap((d) => parse(d.text, d.url)), webId);
}

/** The merged declaration of anyone's profile: the profile and its extended documents. */
export async function readProfile(webId: string): Promise<MemberDeclaration> {
  const docs = await readProfileDocuments(webId);
  return declarationOfDocuments([docs.profile, ...docs.extended], webId);
}

/*
 * Decisions. One function each, so another authorization backend (UMA/ODRL)
 * can replace it without touching how profiles are read (ADR 002 amendment,
 * point 3). They take the merged declaration from `readProfile`.
 */

/** Whether a profile declares membership of `group` (`org:memberOf`). */
export function declaresMembership(profile: MemberDeclaration, group: string): boolean {
  return profile.memberOf.includes(group);
}

/** The agents a profile declares may act for it (`acl:delegates`). */
export function declaredDelegates(profile: MemberDeclaration): string[] {
  return profile.delegates;
}

/** Where the extended profile goes when the profile links none: `profile/about.ttl` in the first storage. */
export function extendedProfileUrl(storage: string): string {
  return new URL("profile/about.ttl", storage).href;
}

/**
 * The two lines a static profile needs to link its extended profile, absolute
 * IRIs only (a redirect changes the base a reader parses against).
 */
export function linkLines(webId: string, extendedUrl: string): string {
  return [
    `<${webId}> <${SEE_ALSO}> <${extendedUrl}> .`,
    `<${webId}> <${PRIMARY_TOPIC_OF}> <${extendedUrl}> .`,
  ].join("\n");
}

/** The WebIDs a roster lists as `foaf:member` of the group. */
export function parseRoster(turtle: string, rosterUrl: string, group: string): string[] {
  return objectsOf(parse(turtle, rosterUrl), group, FOAF_MEMBER);
}

export type MembershipState = "member" | "pending" | "left" | "none" | "unknown";

/**
 * The ADR 006 table. `listed` is `null` when the roster could not be read —
 * which is the normal case for someone whose request is still pending, since
 * only members may read it. That is "unknown", never "not a member".
 */
export function membershipState(declares: boolean, listed: boolean | null): MembershipState {
  if (listed === null) return declares ? "pending" : "unknown";
  if (declares) return listed ? "member" : "pending";
  return listed ? "left" : "none";
}

/** The profile document holding a WebID: the WebID without its fragment. */
export function profileDocOf(webId: string): string {
  const url = new URL(webId);
  url.hash = "";
  return url.href;
}

/** POSTs an activity to an inbox. Returns the created notification's URL. */
export async function sendToInbox(inbox: string, turtle: string): Promise<string | null> {
  const res = await authFetch(inbox, {
    method: "POST",
    headers: { "Content-Type": "text/turtle" },
    body: turtle,
  });
  if (!res.ok) {
    throw new Error(`The inbox at ${inbox} refused the message (${res.status}).`);
  }
  return res.headers.get("location");
}

/** Where a profile step writes, and what the person still has to do by hand. */
export interface ProfileWrite {
  /** The document written: the profile, or the extended profile in the pod. */
  document: string;
  /** The two lines to add to the profile when it does not link `document` yet; `null` when nothing is left to do. */
  linkToAdd: string | null;
}

/** A network failure (CORS, offline) as a sentence, never the browser's "Failed to fetch". */
function unreachable(url: string, what: string): Error {
  return new Error(`Could not reach ${url}${what}. Nothing was written.`);
}

/**
 * Where a step that edits your profile writes (ADR 002 amendment, point 2):
 *
 * 1. the profile itself, when its GET answers as writable;
 * 2. else the extended document it links inside its own pim:storage;
 * 3. else `profile/about.ttl` in that storage, to be created (`create`) and
 *    linked by hand (`linked: false`).
 *
 * Read fresh, never through read.ts: this is the base of a write.
 */
export async function profileWriteTarget(webId: string): Promise<{ url: string; create: boolean; linked: boolean }> {
  const docUrl = profileDocOf(webId);
  let res: Response;
  try {
    res = await authFetch(docUrl, { headers: { Accept: "text/turtle" }, cache: "no-store" });
  } catch {
    throw unreachable(docUrl, ", your profile, to know where to write");
  }
  if (!res.ok) throw new Error(`Could not read your profile (${res.status}), so nothing was written.`);
  if (answersWritable(res.headers)) return { url: docUrl, create: false, linked: true };

  const quads = parse(await res.text(), docUrl);
  const storages = storagesIn(quads, webId);
  if (!storages.length) {
    throw new Error(
      `Your profile at ${docUrl} is a file apps cannot write, and it declares no pim:storage, ` +
        "so there is no pod to write in. Add a pim:storage line to it. Nothing was written."
    );
  }
  const linked = linkedDocuments(quads, webId, docUrl, storages).inside[0];
  const url = linked ?? extendedProfileUrl(storages[0]);
  let head: Response;
  try {
    head = await authFetch(url, { method: "HEAD", cache: "no-store" });
  } catch {
    throw unreachable(url, ", your extended profile");
  }
  if (!head.ok && head.status !== 404) throw new Error(`Could not reach your extended profile at ${url} (${head.status}). Nothing was written.`);
  return { url, create: head.status === 404, linked: Boolean(linked) };
}

/**
 * Creates the extended profile: an almost empty document about the WebID,
 * then its own rules (public Read, you Read/Write/Control: what it holds is
 * there to be checked by others). In that order: a resource's `.acl` is
 * found from the resource. Already there (412) counts as created.
 */
async function createExtendedProfile(url: string, webId: string): Promise<void> {
  const body = `<> <${NS.foaf}primaryTopic> <${webId}> .\n`;
  let res: Response;
  try {
    res = await authFetch(url, { method: "PUT", headers: { "Content-Type": "text/turtle", "If-None-Match": "*" }, body });
  } catch {
    throw unreachable(url, " to create your extended profile");
  }
  if (!res.ok && res.status !== 412) throw new Error(`Could not create your extended profile at ${url} (${res.status}).`);
  await setPublicAccess(url, webId, ["read"]);
}

/**
 * Edits the signed-in user's own profile, in the document
 * `profileWriteTarget` picks. solid-client sends only the changed triples as
 * a PATCH, so a concurrent edit to some other triple in the same document
 * survives — which is why this is not a read-modify-PUT.
 */
export async function updateOwnProfile(
  webId: string,
  edit: (thing: ReturnType<typeof createThing>) => ReturnType<typeof createThing>
): Promise<ProfileWrite> {
  const target = await profileWriteTarget(webId);
  if (target.create) await createExtendedProfile(target.url, webId);
  try {
    const dataset = await getSolidDataset(target.url, { fetch: authFetch });
    const thing = getThing(dataset, webId) ?? createThing({ url: webId });
    await saveSolidDatasetAt(target.url, setThing(dataset, edit(thing)), { fetch: authFetch });
  } catch (err) {
    // fetch rejects with a TypeError on CORS or a lost network: say where.
    if (err instanceof TypeError) throw unreachable(target.url, "");
    throw err;
  }
  return { document: target.url, linkToAdd: target.linked ? null : linkLines(webId, target.url) };
}

/** Your profile's documents, plus the extended profile the steps wrote but the profile does not link yet. */
export interface OwnProfileDocuments extends ProfileDocuments {
  unlinked: ProfileDocument | null;
}

/**
 * Your own profile as the steps see it: the merged read, plus, when your
 * profile cannot be written and links no extended document, the
 * `profile/about.ttl` the steps write to (so a name just saved there does
 * not look undone). Others never read that one until it is linked.
 */
export async function readOwnProfileDocuments(webId: string): Promise<OwnProfileDocuments> {
  const docs = await readProfileDocuments(webId);
  const unlinked =
    !docs.writable && docs.extended.length === 0 && docs.storages.length > 0
      ? await readOptional(extendedProfileUrl(docs.storages[0]))
      : null;
  return { ...docs, unlinked };
}

export async function readOwnProfile(webId: string): Promise<MemberDeclaration> {
  let docs: OwnProfileDocuments;
  try {
    docs = await readOwnProfileDocuments(webId);
  } catch (err) {
    const status = (err as ProfileReadError).status;
    if (status !== undefined) throw new Error(`Could not read your profile (${status}).`);
    throw err;
  }
  const declaration = declarationOfDocuments([docs.profile, ...docs.extended, ...(docs.unlinked ? [docs.unlinked] : [])], webId);
  return docs.unlinked ? { ...declaration, unlinked: docs.unlinked.url } : declaration;
}

/**
 * Anyone's `foaf:name`, from the document their WebID points into (a card,
 * or an agent's own document, `profile/claude#me`) and the extended
 * documents it links. `null` when there is none or it cannot be read; the
 * caller falls back to the address.
 */
export async function readName(webId: string): Promise<string | null> {
  try {
    return (await readProfile(webId)).name;
  } catch {
    return null;
  }
}

export const profileEdits = {
  setName: (name: string) => (t: ReturnType<typeof createThing>) => setStringNoLocale(t, FOAF_NAME, name),
  addDelegate: (agent: string) => (t: ReturnType<typeof createThing>) =>
    getUrlAll(t, DELEGATES).includes(agent) ? t : addUrl(t, DELEGATES, agent),
  removeDelegate: (agent: string) => (t: ReturnType<typeof createThing>) => removeUrl(t, DELEGATES, agent),
  join: (group: string) => (t: ReturnType<typeof createThing>) =>
    getUrlAll(t, MEMBER_OF).includes(group) ? t : addUrl(t, MEMBER_OF, group),
  leave: (group: string) => (t: ReturnType<typeof createThing>) => removeUrl(t, MEMBER_OF, group),
  setInbox: (inbox: string) => (t: ReturnType<typeof createThing>) => setUrl(t, INBOX, inbox),
};

/** A load failure that keeps its HTTP status, so the screen can say who can fix it. */
export interface CollectiveLoadError extends Error {
  status?: number;
  address: string;
}

/**
 * Loads a collective from its address: the collective's IRI
 * (`…/config.ttl#hyperscope`, what a profile's `org:memberOf` holds) or just
 * the config document's URL (what an invitation link carries).
 */
export async function loadCollective(address: string): Promise<Collective> {
  const docUrl = profileDocOf(address);
  const res = await readTurtle(docUrl);
  if (!res.ok) {
    const err = new Error(`Could not read ${docUrl} (${res.status}).`) as CollectiveLoadError;
    err.status = res.status;
    err.address = address;
    throw err;
  }
  return parseCollectiveConfig(await res.text(), docUrl, address === docUrl ? undefined : address);
}

/**
 * Whether the roster lists this WebID, or `null` if the roster cannot be read
 * — the normal case for an applicant, since only members may read it.
 */
export async function isListed(collective: Collective, webId: string): Promise<boolean | null> {
  const res = await readTurtle(collective.roster);
  if (res.status === 401 || res.status === 403 || res.status === 404) return null;
  if (!res.ok) throw new Error(`Could not read ${collective.roster} (${res.status}).`);
  return parseRoster(await res.text(), collective.roster, collective.group).includes(webId);
}

/**
 * The collective this account runs, if any: a `config.ttl` at the root of the
 * signed-in account's own pod (found through `pim:storage`, never guessed from
 * the WebID). Running a collective means signing in as its account.
 *
 * `null` when there is no `config.ttl`. A `config.ttl` that exists but cannot
 * be used throws: that is the collective's owner looking at their own mistake,
 * and they need to see it.
 */
export async function findRunCollective(podUrl: string): Promise<Collective | null> {
  try {
    return await loadCollective(new URL("config.ttl", podUrl).href);
  } catch (err) {
    if ((err as CollectiveLoadError).status === 404) return null;
    throw err;
  }
}

/** Counts for the "You run" card. `null` means it could not be read. */
export interface CollectiveSummary {
  members: number | null;
  inboxItems: number | null;
}

export async function summarise(collective: Collective): Promise<CollectiveSummary> {
  const read = async (url: string) => {
    const res = await readTurtle(url);
    return res.ok ? parse(await res.text(), url) : null;
  };
  const [roster, inbox] = await Promise.all([read(collective.roster), read(collective.inbox)]);
  return {
    members: roster ? roster.filter((q) => q.subject.value === collective.group && q.predicate.value === FOAF_MEMBER).length : null,
    inboxItems: inbox
      ? inbox.filter((q) => q.subject.value === collective.inbox && q.predicate.value === NS.ldp + "contains").length
      : null,
  };
}
