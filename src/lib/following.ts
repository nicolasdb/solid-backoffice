/**
 * Following (slice C5, journey J7): the addresses others shared with you,
 * kept in `settings/following.ttl` on your own pod so any app of yours can
 * read the same list (docs/explanation/following.md; the file's terms are in
 * docs/reference/following-file.md).
 *
 * Each entry keeps a title and an excerpt from your last visit, so the list
 * of what you follow reads nothing from other pods: every read there may
 * land in their access log. An address is read only when you follow it (to
 * check your WebID can read it) and when you open it.
 *
 * Writes go through `updateDocument` (read, change, `If-Match`), so a second
 * window or another app editing the same list is never overwritten unseen.
 */
import { DataFactory, Parser, Writer } from "n3";
import { authFetch } from "./auth";
import { updateDocument, type ConditionalError } from "./conditional";
import { readTurtle } from "./read";
import { listFolder, nameOf, readFile, type FileContent, type Item } from "./files";
import { NS } from "./vocab";

const DCT = "http://purl.org/dc/terms/";
const T = {
  Followed: NS.hs + "Followed",
  url: NS.schema + "url",
  title: DCT + "title",
  excerpt: NS.schema + "abstract",
  modified: DCT + "modified",
  lastSeen: NS.hs + "lastSeen",
  favourite: NS.hs + "favourite",
  unreadableSince: NS.hs + "unreadableSince",
};

export interface Followed {
  address: string;
  title: string;
  excerpt: string;
  /** Its last change, as seen on your last visit. */
  modified: Date | null;
  /** When you last opened it. */
  lastSeen: Date | null;
  favourite: boolean;
  /** Set when opening it failed; cleared when it can be read again. */
  unreadableSince: Date | null;
}

export function followingUrl(podUrl: string): string {
  return podUrl + "settings/following.ttl";
}

/** A short, stable fragment for an address. */
function idFor(address: string): string {
  let h = 5381;
  for (const c of address) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0;
  return "f-" + h.toString(36);
}

const date = (value: string | undefined) => {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
};

export function parseFollowing(turtle: string, docUrl: string): Followed[] {
  const quads = new Parser({ baseIRI: docUrl }).parse(turtle);
  const subjects = quads.filter((q) => q.predicate.value === NS.rdf + "type" && q.object.value === T.Followed).map((q) => q.subject.value);
  const value = (s: string, p: string) => quads.find((q) => q.subject.value === s && q.predicate.value === p)?.object.value;
  return subjects
    .map((s) => ({
      address: value(s, T.url) ?? "",
      title: value(s, T.title) ?? "",
      excerpt: value(s, T.excerpt) ?? "",
      modified: date(value(s, T.modified)),
      lastSeen: date(value(s, T.lastSeen)),
      favourite: value(s, T.favourite) === "true",
      unreadableSince: date(value(s, T.unreadableSince)),
    }))
    .filter((f) => /^https?:\/\//.test(f.address));
}

export function serializeFollowing(entries: Followed[], docUrl: string): string {
  const { namedNode, literal, quad } = DataFactory;
  const writer = new Writer({ baseIRI: docUrl, prefixes: { hs: NS.hs, schema: NS.schema, dct: DCT, xsd: NS.xsd } });
  const when = (d: Date) => literal(d.toISOString(), namedNode(NS.xsd + "dateTime"));
  for (const f of entries) {
    const s = namedNode(docUrl + "#" + idFor(f.address));
    writer.addQuad(quad(s, namedNode(NS.rdf + "type"), namedNode(T.Followed)));
    writer.addQuad(quad(s, namedNode(T.url), namedNode(f.address)));
    writer.addQuad(quad(s, namedNode(T.title), literal(f.title)));
    if (f.excerpt) writer.addQuad(quad(s, namedNode(T.excerpt), literal(f.excerpt)));
    if (f.modified) writer.addQuad(quad(s, namedNode(T.modified), when(f.modified)));
    if (f.lastSeen) writer.addQuad(quad(s, namedNode(T.lastSeen), when(f.lastSeen)));
    if (f.favourite) writer.addQuad(quad(s, namedNode(T.favourite), literal("true", namedNode(NS.xsd + "boolean"))));
    if (f.unreadableSince) writer.addQuad(quad(s, namedNode(T.unreadableSince), when(f.unreadableSince)));
  }
  let out = "";
  writer.end((err, result) => {
    if (err) throw err;
    out = result;
  });
  return out;
}

/** What you follow, from your own pod only. No list yet: an empty one. */
export async function readFollowing(podUrl: string): Promise<Followed[]> {
  const url = followingUrl(podUrl);
  const res = await readTurtle(url);
  if (res.status === 404) return [];
  if (!res.ok) {
    const err = new Error(`Could not read your list of followed addresses (${res.status}).`) as ConditionalError;
    err.status = res.status;
    throw err;
  }
  return parseFollowing(await res.text(), url);
}

/**
 * Changes the list in one conditional write. `change` gets the entries as
 * they are on the pod now (not as a screen last showed them) and must be
 * repeatable: on a 412 it runs again on the newer list.
 */
export async function changeFollowing(podUrl: string, change: (entries: Followed[]) => Followed[]): Promise<void> {
  const url = followingUrl(podUrl);
  try {
    await updateDocument(url, (text) => serializeFollowing(change(parseFollowing(text, url)), url));
  } catch (err) {
    if ((err as ConditionalError).status !== 404) throw err;
    // No list yet: create it, only if nobody did meanwhile.
    const res = await authFetch(url, {
      method: "PUT",
      headers: { "Content-Type": "text/turtle", "If-None-Match": "*" },
      body: serializeFollowing(change([]), url),
    });
    if (res.status === 412) return changeFollowing(podUrl, change);
    if (!res.ok) throw new Error(`Could not create ${url} (${res.status}).`);
  }
}

/* ── What an address says about itself ─────────────────────────────────── */

export const EXCERPT_LENGTH = 200;

function clip(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > EXCERPT_LENGTH ? flat.slice(0, EXCERPT_LENGTH - 1) + "…" : flat;
}

/** A Markdown file's title (its first heading) and first paragraph. */
export function markdownSummary(text: string): { title: string | null; excerpt: string } {
  const lines = text.split("\n");
  const heading = lines.find((l) => /^#{1,6}\s+\S/.test(l));
  const title = heading ? heading.replace(/^#{1,6}\s+/, "").trim() : null;
  const body = lines.filter((l) => l !== heading && l.trim() && !/^#{1,6}\s/.test(l)).slice(0, 3).join(" ");
  return { title, excerpt: clip(body.replace(/[*_`>#[\]]/g, "")) };
}

export interface Summary {
  title: string;
  excerpt: string;
  modified: Date | null;
  /** The folder's items, or the file, as read: what opening it shows. */
  items: Item[] | null;
}

/** Reads an address with your WebID and says what it is. Throws with a status when it cannot. */
export async function summarise(address: string): Promise<Summary> {
  if (address.endsWith("/")) {
    const items = await listFolder(address);
    const newest = items.map((i) => i.modified).filter((d): d is Date => d !== null).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    const names = items.slice(0, 4).map((i) => i.name);
    const excerpt = items.length
      ? `${items.length} item${items.length === 1 ? "" : "s"}: ${names.join(", ")}${items.length > names.length ? ", …" : ""}`
      : "Empty for now.";
    return { title: nameOf(address).replace(/\/$/, "") || new URL(address).host, excerpt: clip(excerpt), modified: newest, items };
  }
  return summaryOfFile(await readFile(address));
}

/** What a file read says about itself: no second read of someone else's pod. */
export function summaryOfFile(file: FileContent): Summary {
  const name = nameOf(file.url);
  if (file.kind === "markdown" && file.text !== null) {
    const { title, excerpt } = markdownSummary(file.text);
    return { title: title ?? name, excerpt, modified: file.modified, items: null };
  }
  const excerpt = file.text !== null ? clip(file.text) : `${file.contentType.split(";")[0]}`;
  return { title: name, excerpt, modified: file.modified, items: null };
}

export interface FollowError extends Error {
  code: "bad-address" | "unreadable" | "already";
  status?: number;
}

function followError(code: FollowError["code"], message: string, status?: number): FollowError {
  return Object.assign(new Error(message), { code, status });
}

/** Follows an address, kept only once your WebID could read it. */
export async function follow(podUrl: string, raw: string, now = new Date()): Promise<Followed> {
  const address = raw.trim();
  let parsed: URL;
  try {
    parsed = new URL(address);
  } catch {
    throw followError("bad-address", "That is not an address: it starts with https://.");
  }
  if (!/^https?:$/.test(parsed.protocol)) throw followError("bad-address", "That is not an address: it starts with https://.");
  if ((await readFollowing(podUrl)).some((f) => f.address === address)) {
    throw followError("already", "You already follow this address.");
  }
  let summary: Summary;
  try {
    summary = await summarise(address);
  } catch (err) {
    const status = (err as ConditionalError).status;
    throw followError(
      "unreadable",
      status === 404
        ? "Nothing is at this address. Check it with the person who sent it."
        : `Your WebID cannot read this address${status ? ` (${status})` : ""}. Ask its owner to share it with you, or check the address.`,
      status
    );
  }
  const entry: Followed = {
    address,
    title: summary.title,
    excerpt: summary.excerpt,
    modified: summary.modified,
    lastSeen: now,
    favourite: false,
    unreadableSince: null,
  };
  await changeFollowing(podUrl, (entries) => (entries.some((f) => f.address === address) ? entries : [...entries, entry]));
  return entry;
}

export async function unfollow(podUrl: string, address: string): Promise<void> {
  await changeFollowing(podUrl, (entries) => entries.filter((f) => f.address !== address));
}

export async function setFavourite(podUrl: string, address: string, favourite: boolean): Promise<void> {
  await changeFollowing(podUrl, (entries) => entries.map((f) => (f.address === address ? { ...f, favourite } : f)));
}

/**
 * After opening an address: keep what was seen, so the list shows it next
 * time without reading their pod. Writes only when something changed, or
 * the last visit is more than an hour old.
 */
export async function recordVisit(
  podUrl: string,
  known: Followed,
  seen: { summary: Summary } | { unreadable: true },
  now = new Date()
): Promise<void> {
  const next: Followed =
    "unreadable" in seen
      ? { ...known, unreadableSince: known.unreadableSince ?? now }
      : {
          ...known,
          title: seen.summary.title,
          excerpt: seen.summary.excerpt,
          modified: seen.summary.modified,
          unreadableSince: null,
          lastSeen: now,
        };
  const same =
    next.title === known.title &&
    next.excerpt === known.excerpt &&
    next.modified?.getTime() === known.modified?.getTime() &&
    next.unreadableSince?.getTime() === known.unreadableSince?.getTime();
  const recent = known.lastSeen && now.getTime() - known.lastSeen.getTime() < 3_600_000;
  if (same && (recent || "unreadable" in seen)) return;
  await changeFollowing(podUrl, (entries) => entries.map((f) => (f.address === known.address ? { ...next, favourite: f.favourite } : f)));
}

/** Latest change first, or favourites first then latest change. */
export function sortFollowing(entries: Followed[], by: "latest" | "favourites"): Followed[] {
  const time = (f: Followed) => f.modified?.getTime() ?? 0;
  return [...entries].sort((a, b) => (by === "favourites" && a.favourite !== b.favourite ? (a.favourite ? -1 : 1) : time(b) - time(a)));
}

/** The followed entry an address is in: itself, or the one it is inside. */
export function followedFor(address: string, entries: Followed[]): Followed | null {
  return entries.filter((f) => address === f.address || (f.address.endsWith("/") && address.startsWith(f.address))).sort((a, b) => b.address.length - a.address.length)[0] ?? null;
}
