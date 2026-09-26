/**
 * Your pod as files and folders (slice C): listings, file contents, which
 * rules apply where, and the writes of new folders, new files, uploads and
 * saves. Reads for showing go through read.ts (ADR 007). Every write is
 * conditional: a new item is created only if nothing is there yet
 * (`If-None-Match: *`), a save only if the file is still the version that
 * was opened (`If-Match`), so nobody's change is erased unseen.
 *
 * A folder's listing is its container document: `ldp:contains` for what is
 * inside, and on Community Solid Server `dct:modified`, `stat:size` and the
 * media type (`ma:format` on CSS 7, an IANA media-type class elsewhere) for
 * each item. Other servers may give less; every field
 * but the address is optional.
 */
import { Parser } from "n3";
import { authFetch } from "./auth";
import { readTurtle } from "./read";
import { readAccess, type ResourceAccess } from "./acl";
import { writeIfMatch, type ConditionalError } from "./conditional";

const LDP = "http://www.w3.org/ns/ldp#";
const DCT_MODIFIED = "http://purl.org/dc/terms/modified";
const STAT = "http://www.w3.org/ns/posix/stat#";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const MA_FORMAT = "http://www.w3.org/ns/ma-ont#format";
const MEDIA_TYPE = /^http:\/\/www\.w3\.org\/ns\/iana\/media-types\/(.+)#Resource$/;

export interface Item {
  url: string;
  /** The last path segment, decoded; a folder's ends with "/". */
  name: string;
  isFolder: boolean;
  modified: Date | null;
  size: number | null;
  /** Media type, when the listing says. */
  type: string | null;
}

function failure(message: string, status: number): ConditionalError {
  const err = new Error(message) as ConditionalError;
  err.status = status;
  return err;
}

export function nameOf(url: string): string {
  const path = new URL(url).pathname;
  const folder = path.endsWith("/");
  const segment = path.split("/").filter(Boolean).pop() ?? "";
  let name = segment;
  try {
    name = decodeURIComponent(segment);
  } catch {
    /* keep it as it is written */
  }
  return folder ? name + "/" : name;
}

/** The folder holding `url`; null for a pod root (a path of "/"). */
export function parentOf(url: string): string | null {
  const u = new URL(url);
  if (u.pathname === "/") return null;
  return new URL(u.pathname.endsWith("/") ? "../" : "./", u).href;
}

/** Folders first, then by name as people sort (numbers in order, case ignored). */
export function byName(a: Item, b: Item): number {
  if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
}

export function parseListing(turtle: string, folderUrl: string): Item[] {
  const quads = new Parser({ baseIRI: folderUrl }).parse(turtle);
  const contained = quads
    .filter((q) => q.subject.value === folderUrl && q.predicate.value === LDP + "contains")
    .map((q) => q.object.value);
  const about = (url: string, predicate: string) =>
    quads.filter((q) => q.subject.value === url && q.predicate.value === predicate).map((q) => q.object.value);

  return [...new Set(contained)]
    .map((url): Item => {
      const types = about(url, RDF_TYPE);
      const isFolder = url.endsWith("/") || types.includes(LDP + "Container") || types.includes(LDP + "BasicContainer");
      const modified = about(url, DCT_MODIFIED)[0];
      const size = about(url, STAT + "size")[0];
      const media = about(url, MA_FORMAT)[0] ?? types.map((t) => t.match(MEDIA_TYPE)?.[1]).find(Boolean) ?? null;
      const date = modified ? new Date(modified) : null;
      return {
        url,
        name: nameOf(url),
        isFolder,
        modified: date && !isNaN(date.getTime()) ? date : null,
        size: size !== undefined && !isNaN(Number(size)) ? Number(size) : null,
        type: isFolder ? null : media,
      };
    })
    .sort(byName);
}

export async function listFolder(folderUrl: string): Promise<Item[]> {
  const res = await readTurtle(folderUrl);
  if (!res.ok) throw failure(`Could not read ${folderUrl} (${res.status}).`, res.status);
  return parseListing(await res.text(), folderUrl);
}

/* ── Rules ─────────────────────────────────────────────────────────────── */

/** The rules that apply to a resource, and where they come from. */
export interface Effective {
  /** The resource whose own `.acl` applies: the item itself or a folder above it. */
  from: string;
  access: ResourceAccess;
}

/**
 * Which rules apply to `url`: its own `.acl`, else the nearest folder above it
 * that has one (WAC's `acl:default`). `memo` shares each folder's answer
 * between the items of one listing, so a folder of fifty inherited files
 * costs one walk, not fifty. Stops at `root`: nothing above your pod applies.
 *
 * Simplification: a folder's grant written without `acl:default` (the
 * universalAccess bug, `folderOnly`) is counted as if it reached the items;
 * the permissions panel names that case.
 */
export function effectiveAccess(
  url: string,
  owner: string,
  root: string,
  memo: Map<string, Promise<Effective | null>> = new Map()
): Promise<Effective | null> {
  const known = memo.get(url);
  if (known) return known;
  const answer = (async (): Promise<Effective | null> => {
    const access = await readAccess(url, owner);
    if (!access.inherited) return { from: url, access };
    const parent = parentOf(url);
    if (!parent || url === root || !parent.startsWith(root)) return null;
    return effectiveAccess(parent, owner, root, memo);
  })();
  memo.set(url, answer);
  return answer;
}

/* ── Contents ──────────────────────────────────────────────────────────── */

export type FileKind = "markdown" | "text" | "json" | "image" | "other";

export interface FileContent {
  url: string;
  contentType: string;
  kind: FileKind;
  etag: string | null;
  /** For markdown, text and json. */
  text: string | null;
  /** For images and everything else (download). */
  blob: Blob | null;
  modified: Date | null;
}

/** Past this, a text file is offered as a download rather than shown. */
export const PREVIEW_LIMIT = 1_000_000;

export function kindOf(contentType: string, url = ""): FileKind {
  const type = contentType.split(";")[0].trim().toLowerCase();
  if (type === "text/markdown" || /\.(md|markdown)$/i.test(url)) return "markdown";
  if (type === "application/json" || type === "application/ld+json" || /\.json$/i.test(url)) return "json";
  if (type.startsWith("image/") && type !== "image/svg+xml") return "image";
  if (type.startsWith("text/") || type === "application/n-triples" || type === "application/n-quads") return "text";
  return "other";
}

/**
 * A file, fresh from the pod (files are not kept by read.ts: they are not
 * Turtle, and a preview must show what is there now). SVG is never shown
 * inline: it can carry script.
 */
export async function readFile(url: string): Promise<FileContent> {
  const res = await authFetch(url, { cache: "no-store" });
  if (!res.ok) throw failure(`Could not read ${url} (${res.status}).`, res.status);
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const kind = kindOf(contentType, url);
  const size = Number(res.headers.get("content-length") ?? NaN);
  const lastModified = res.headers.get("last-modified");
  const base = { url, contentType, etag: res.headers.get("etag"), modified: lastModified ? new Date(lastModified) : null };
  if ((kind === "markdown" || kind === "text" || kind === "json") && !(size > PREVIEW_LIMIT)) {
    const text = await res.text();
    if (text.length <= PREVIEW_LIMIT) return { ...base, kind, text, blob: null };
    return { ...base, kind: "other", text: null, blob: new Blob([text], { type: contentType }) };
  }
  return { ...base, kind, text: null, blob: await res.blob() };
}

/** Saves a file to the device, read with your WebID (a plain link could not). */
export async function downloadFile(url: string, content?: FileContent): Promise<void> {
  const file = content ?? (await readFile(url));
  const blob = file.blob ?? new Blob([file.text ?? ""], { type: file.contentType });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = nameOf(url);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 0);
}

/* ── Writes (C3) ───────────────────────────────────────────────────────── */

export interface FileError extends Error {
  code: "bad-name" | "exists" | "conflict" | "write-failed";
  status?: number;
}

function fileError(code: FileError["code"], message: string, status?: number): FileError {
  return Object.assign(new Error(message), { code, status });
}

/**
 * Why a name cannot be used, or null. Names become one path segment, so no
 * slash; `.acl` and `.meta` are the server's own documents beside each item.
 */
export function nameProblem(raw: string): string | null {
  const name = raw.trim();
  if (!name) return "Give it a name.";
  if (name.includes("/")) return "A name cannot contain a slash.";
  if (name === "." || name === "..") return "That name is taken by the folder itself.";
  if (/\.(acl|meta)$/i.test(name)) return "Names ending in .acl or .meta belong to the server.";
  if (name.length > 200) return "That name is too long.";
  return null;
}

/** The address of a new item in `folderUrl`. */
export function childUrl(folderUrl: string, name: string, isFolder: boolean): string {
  return folderUrl + encodeURIComponent(name.trim()) + (isFolder ? "/" : "");
}

/** The media type a new file gets from its name. */
export function typeFor(name: string): string {
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  const types: Record<string, string> = {
    md: "text/markdown",
    markdown: "text/markdown",
    txt: "text/plain",
    json: "application/json",
    jsonld: "application/ld+json",
    ttl: "text/turtle",
    html: "text/html",
    csv: "text/csv",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    pdf: "application/pdf",
  };
  return types[ext] ?? (ext ? "application/octet-stream" : "text/plain");
}

/** PUT that creates, never replaces: 412 when something is already there. */
async function createOnly(url: string, body: BodyInit, contentType: string): Promise<void> {
  const res = await authFetch(url, {
    method: "PUT",
    headers: { "Content-Type": contentType, "If-None-Match": "*" },
    body,
  });
  // 412: If-None-Match found something. 409: CSS 7 refuses a PUT on an
  // existing folder, or a folder where a file of that name is (and back).
  if (res.status === 412 || res.status === 409) {
    throw fileError("exists", `${nameOf(url)} is already there. Choose another name.`, res.status);
  }
  if (!res.ok) throw fileError("write-failed", `Could not create ${nameOf(url)} (${res.status}).`, res.status);
}

export async function createFolder(parentUrl: string, name: string): Promise<string> {
  const problem = nameProblem(name);
  if (problem) throw fileError("bad-name", problem);
  const url = childUrl(parentUrl, name, true);
  await createOnly(url, "", "text/turtle");
  return url;
}

export async function createFile(parentUrl: string, name: string, body = ""): Promise<string> {
  const problem = nameProblem(name);
  if (problem) throw fileError("bad-name", problem);
  const url = childUrl(parentUrl, name, false);
  await createOnly(url, body, typeFor(name));
  return url;
}

/** One file from the device, under its own name; never over an existing one. */
export async function uploadFile(parentUrl: string, file: File): Promise<string> {
  const problem = nameProblem(file.name);
  if (problem) throw fileError("bad-name", `${file.name}: ${problem}`);
  const url = childUrl(parentUrl, file.name, false);
  await createOnly(url, file, file.type || typeFor(file.name));
  return url;
}

/**
 * Saves text over the version that was opened. A 412 means someone changed
 * the file since: nothing is written, and the editor says so.
 */
export async function saveFile(url: string, text: string, etag: string | null, contentType: string): Promise<void> {
  if (!etag) throw fileError("conflict", `${nameOf(url)} came without a version tag, so it cannot be saved safely.`);
  try {
    await writeIfMatch(url, text, etag, contentType);
  } catch (err) {
    const status = (err as ConditionalError).status;
    if (status === 412) {
      throw fileError("conflict", `Someone changed ${nameOf(url)} since you opened it. Nothing was saved; your text is still here.`, 412);
    }
    throw fileError("write-failed", `Could not save ${nameOf(url)} (${status ?? "no answer"}).`, status);
  }
}
