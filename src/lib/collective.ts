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
import { NS } from "./vocab";

export { NS };
export { buildJoin, buildAnnounce } from "./activity";

const FOAF_NAME = NS.foaf + "name";
const FOAF_MEMBER = NS.foaf + "member";
const MEMBER_OF = NS.org + "memberOf";
const DELEGATES = NS.acl + "delegates";
const INBOX = NS.ldp + "inbox";

/**
 * What a collective's `config.ttl` declares.
 *
 * The collective's IRI IS the group IRI: `config.ttl#hyperscope`. So the
 * `org:memberOf` link in a member's profile, followed, leads straight to this
 * description — the app finds a member's collectives from their profile, with
 * no list of collectives built into it.
 */
export interface Collective {
  configUrl: string;
  /** The IRI members point at with `org:memberOf`, and the roster lists under. */
  group: string;
  name: string;
  /** The document listing `<group> foaf:member <WebID>`. Readable by members only. */
  roster: string;
  /** Where `as:Join` and `as:Announce` go. Signed-in agents may Append. */
  inbox: string;
  /** The collective's agent: the WebID a member grants Read to when publishing. */
  agent: string;
  /** The folder a member shares through, relative to their pod root, e.g. "output2/hyperscope/". */
  bundleFolder: string;
  /** The welcome screen's title for people it invites (`schema:slogan`), when it has exactly one. */
  slogan?: string;
  /** The paragraph under it (`schema:description`), when it has exactly one. */
  description?: string;
}

function parse(turtle: string, base: string): Quad[] {
  return new Parser({ baseIRI: base }).parse(turtle);
}

function objectsOf(quads: Quad[], subject: string, predicate: string): string[] {
  return quads
    .filter((q) => q.subject.value === subject && q.predicate.value === predicate)
    .map((q) => q.object.value);
}

/**
 * Parses a collective's `config.ttl`. Throws, naming what is missing, rather
 * than filling a default: a guessed agent WebID is a grant to the wrong party.
 */
/** The prefix line a config.ttl needs for each namespace it may use. */
const KNOWN_PREFIXES: Record<string, string> = {
  hs: NS.hs,
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

export function parseCollectiveConfig(turtle: string, configUrl: string, expected?: string): Collective {
  let quads: Quad[];
  try {
    quads = parse(turtle, configUrl);
  } catch (err) {
    throw explainParseError(err, configUrl);
  }
  const declared = quads
    .filter((q) => q.predicate.value === NS.rdf + "type" && q.object.value === NS.hs + "Collective")
    .map((q) => q.subject.value);
  const subject = expected ? declared.find((d) => d === expected) : declared[0];
  if (!subject) {
    throw new Error(`${configUrl} declares no hs:Collective${expected ? ` named ${expected}` : ""}.`);
  }
  if (!expected && declared.length > 1) {
    throw new Error(`${configUrl} declares several collectives; use the address of one of them.`);
  }

  const one = (predicate: string, label: string): string => {
    const values = objectsOf(quads, subject, predicate);
    if (values.length !== 1) {
      throw new Error(`${configUrl}: expected exactly one ${label}, found ${values.length}.`);
    }
    return values[0];
  };

  const bundleFolder = one(NS.hs + "bundleFolder", "hs:bundleFolder");
  if (!isFolderPath(bundleFolder)) {
    throw new Error(`${configUrl}: hs:bundleFolder must be a folder path like "output2/hyperscope/".`);
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

  return {
    configUrl,
    group: subject,
    name: one(FOAF_NAME, "foaf:name"),
    roster: one(NS.hs + "roster", "hs:roster"),
    inbox: one(INBOX, "ldp:inbox"),
    agent: one(NS.hs + "agent", "hs:agent"),
    bundleFolder,
    ...(slogan ? { slogan } : {}),
    ...(description ? { description } : {}),
  };
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
}

export function parseProfile(turtle: string, profileDocUrl: string, webId: string): MemberDeclaration {
  const quads = parse(turtle, profileDocUrl);
  return {
    name: objectsOf(quads, webId, FOAF_NAME)[0] ?? null,
    memberOf: objectsOf(quads, webId, MEMBER_OF),
    delegates: objectsOf(quads, webId, DELEGATES),
    inbox: objectsOf(quads, webId, INBOX)[0] ?? null,
  };
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

/**
 * Edits the signed-in user's own profile. solid-client sends only the changed
 * triples as a PATCH, so a concurrent edit to some other triple in the same
 * document survives — which is why this is not a read-modify-PUT.
 */
export async function updateOwnProfile(
  webId: string,
  edit: (thing: ReturnType<typeof createThing>) => ReturnType<typeof createThing>
): Promise<void> {
  const docUrl = profileDocOf(webId);
  const dataset = await getSolidDataset(docUrl, { fetch: authFetch });
  const thing = getThing(dataset, webId) ?? createThing({ url: webId });
  await saveSolidDatasetAt(docUrl, setThing(dataset, edit(thing)), { fetch: authFetch });
}

export async function readOwnProfile(webId: string): Promise<MemberDeclaration> {
  const docUrl = profileDocOf(webId);
  const res = await authFetch(docUrl, { headers: { Accept: "text/turtle" }, cache: "no-store" });
  if (!res.ok) throw new Error(`Could not read your profile (${res.status}).`);
  return parseProfile(await res.text(), docUrl, webId);
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
  const res = await authFetch(docUrl, { headers: { Accept: "text/turtle" }, cache: "no-store" });
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
  const res = await authFetch(collective.roster, { headers: { Accept: "text/turtle" }, cache: "no-store" });
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
    const res = await authFetch(url, { headers: { Accept: "text/turtle" }, cache: "no-store" });
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
