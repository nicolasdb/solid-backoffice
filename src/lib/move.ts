/**
 * Rename, move and delete in your pod (slice C4). A move carries a folder's
 * contents AND their rules: the old backoffice moved the folder and left the
 * files behind (found live, 25 Sep 2026).
 *
 * Solid has no MOVE, so a move is a copy then a delete, and the order is the
 * design (pinned in move.test.ts, including a failure halfway):
 *
 * 1. Plan, before any write: walk the source; refuse if the destination
 *    exists, if it is inside the source, if the item is protected, or if an
 *    `.acl` holds rules this app cannot rewrite (acl.ts, rule 3).
 * 2. Copy, top down. An item with rules of its own is created empty, gets its
 *    `.acl`, and only then its content: nothing is ever readable under the
 *    new folder's rules when its own were stricter.
 * 3. Check: walk the copy; the same items and the same own rules.
 * 4. Only then delete the source, bottom up.
 *
 * A failure in 2 or 3 deletes what was copied and leaves the source whole.
 * A failure in 4 leaves both, and says what is still at the old place:
 * nothing is lost either way.
 */
import { authFetch } from "./auth";
import { aclLocation, forgetAclLocations, getAccess, serializeAcl, type AccessRules } from "./acl";
import { listFolder, nameOf, parentOf } from "./files";

export interface MoveError extends Error {
  code: "refused" | "exists" | "copy-failed" | "delete-failed";
  /** For delete-failed: what is still at the old place. */
  left?: string[];
}

function moveError(code: MoveError["code"], message: string, left?: string[]): MoveError {
  return Object.assign(new Error(message), { code, left });
}

/** One resource of a tree, with its own rules if it has any. */
export interface Entry {
  url: string;
  isFolder: boolean;
  /** Its own rules; null when it follows its folder. */
  rules: Pick<AccessRules, "agents" | "public" | "authenticated"> | null;
}

/** Paths from the pod root that the app itself depends on. */
const PROTECTED = ["", "profile/", "profile/card", "inbox/", "settings/", "config.ttl", "membres.ttl"];

/** Why `url` may not be moved, renamed or deleted from here; null when it may. */
export function protectedReason(url: string, podUrl: string): string | null {
  if (!url.startsWith(podUrl)) return "Only what is in your own pod can be changed here.";
  const path = url.slice(podUrl.length);
  if (path === "") return "Your pod itself cannot be moved or deleted.";
  if (PROTECTED.includes(path)) return `${nameOf(url)} is part of how your pod works (your profile, inbox, settings or collective); it stays where it is.`;
  return null;
}

/** The tree under `url` (itself first, then each folder's contents), with each item's own rules. */
export async function walk(url: string, owner: string): Promise<Entry[]> {
  const access = await getAccess(url, owner);
  if (access.unknown.length) {
    throw moveError(
      "refused",
      `The rules of ${nameOf(url)} include something this app cannot rewrite, so it cannot be moved from here. Nothing was changed.`
    );
  }
  const entry: Entry = {
    url,
    isFolder: url.endsWith("/"),
    rules: access.inherited ? null : { agents: access.agents, public: access.public, authenticated: access.authenticated },
  };
  if (!entry.isFolder) return [entry];
  const children = await listFolder(url);
  const below = await Promise.all(children.map((c) => walk(c.url, owner)));
  return [entry, ...below.flat()];
}

async function exists(url: string): Promise<boolean> {
  const res = await authFetch(url, { method: "HEAD" });
  if (res.status === 404) return false;
  if (!res.ok) throw moveError("refused", `Could not check ${nameOf(url)} (${res.status}).`);
  return true;
}

async function put(url: string, body: BodyInit, contentType: string, condition: Record<string, string>): Promise<void> {
  const res = await authFetch(url, { method: "PUT", headers: { "Content-Type": contentType, ...condition }, body });
  if (!res.ok) throw new Error(`Could not write ${url} (${res.status}).`);
}

async function del(url: string, missingIsFine = false): Promise<void> {
  const res = await authFetch(url, { method: "DELETE" });
  if (res.ok || (missingIsFine && res.status === 404)) return;
  throw new Error(`Could not delete ${url} (${res.status}).`);
}

async function writeRules(url: string, owner: string, rules: NonNullable<Entry["rules"]>): Promise<void> {
  const aclUrl = await aclLocation(url, true);
  await put(aclUrl, serializeAcl(url, aclUrl, owner, rules), "text/turtle", { "If-None-Match": "*" });
}

async function copyOne(entry: Entry, to: string, owner: string): Promise<void> {
  if (entry.isFolder) {
    await put(to, "", "text/turtle", { "If-None-Match": "*" });
    if (entry.rules) await writeRules(to, owner, entry.rules);
    return;
  }
  const source = await authFetch(entry.url, { cache: "no-store" });
  if (!source.ok) throw new Error(`Could not read ${entry.url} (${source.status}).`);
  const type = source.headers.get("content-type") ?? "application/octet-stream";
  const body = await source.blob();
  if (!entry.rules) {
    await put(to, body, type, { "If-None-Match": "*" });
    return;
  }
  // Empty first, its rules, then its content: never readable under looser rules.
  await put(to, "", type, { "If-None-Match": "*" });
  await writeRules(to, owner, entry.rules);
  const head = await authFetch(to, { method: "HEAD" });
  const etag = head.headers.get("etag");
  await put(to, body, type, etag ? { "If-Match": etag } : {});
}

/** Where an entry of the source lands under the destination. */
function target(url: string, from: string, to: string): string {
  return to + url.slice(from.length);
}

/** The shape of a tree, for the check: relative paths and whether each has own rules. */
function shape(entries: Entry[], root: string): string[] {
  return entries.map((e) => `${e.url.slice(root.length)} ${e.rules ? "own" : "inherited"}`).sort();
}

export interface Progress {
  stage: "copy" | "check" | "delete";
  done: number;
  total: number;
}

/**
 * Moves `from` to `to` (both resource addresses; folders end with "/"),
 * contents and rules included. Rename is a move within the same folder.
 */
export async function move(from: string, to: string, owner: string, podUrl: string, onProgress?: (p: Progress) => void): Promise<void> {
  // 1. Plan: every refusal happens before the first write.
  const reason = protectedReason(from, podUrl) ?? (to.startsWith(podUrl) ? null : "The destination is not in your pod.");
  if (reason) throw moveError("refused", reason);
  if (from.endsWith("/") !== to.endsWith("/")) throw moveError("refused", "A folder stays a folder, and a file a file.");
  if (to === from) throw moveError("refused", "That is where it already is.");
  if (from.endsWith("/") && to.startsWith(from)) throw moveError("refused", "A folder cannot go inside itself.");
  if (await exists(to)) throw moveError("exists", `${nameOf(to)} is already there. Choose another name.`);
  const parent = parentOf(to);
  if (parent && !(await exists(parent))) throw moveError("refused", `The folder ${nameOf(parent)} does not exist.`);
  const tree = await walk(from, owner);
  const total = tree.length;

  // 2. Copy, top down.
  const copied: string[] = [];
  try {
    for (const [i, entry] of tree.entries()) {
      const dest = target(entry.url, from, to);
      await copyOne(entry, dest, owner);
      copied.push(dest);
      onProgress?.({ stage: "copy", done: i + 1, total });
    }
    // 3. Check the copy before anything is deleted.
    onProgress?.({ stage: "check", done: 0, total });
    const copy = await walk(to, owner);
    if (JSON.stringify(shape(copy, to)) !== JSON.stringify(shape(tree, from))) {
      throw new Error("The copy does not match what was there.");
    }
  } catch (err) {
    for (const url of copied.reverse()) await del(url, true).catch(() => {});
    forgetAclLocations(to);
    throw moveError("copy-failed", `Moving ${nameOf(from)} stopped: ${(err as Error).message} Nothing was moved; it is still where it was.`);
  }

  // 4. Only now, the source, bottom up.
  await deleteEntries(tree, from, (done) => onProgress?.({ stage: "delete", done, total }));
}

async function deleteEntries(tree: Entry[], root: string, onDone?: (done: number) => void): Promise<void> {
  const bottomUp = [...tree].reverse();
  for (const [i, entry] of bottomUp.entries()) {
    try {
      await del(entry.url, true);
      // CSS removes a resource's .acl with it; another server might not.
      if (entry.rules) await del(await aclLocation(entry.url), true).catch(() => {});
    } catch (err) {
      const left = bottomUp.slice(i).map((e) => e.url);
      forgetAclLocations(root);
      throw moveError(
        "delete-failed",
        `The copy is complete, but ${nameOf(entry.url)} could not be removed from the old place (${(err as Error).message}). ${left.length} item${left.length === 1 ? " is" : "s are"} still there; nothing is lost.`,
        left
      );
    }
    onDone?.(i + 1);
  }
  forgetAclLocations(root);
}

/** How many items are inside a folder (all levels), for "Delete (12 items inside)?". */
export async function countInside(url: string, owner: string): Promise<number> {
  if (!url.endsWith("/")) return 0;
  const tree = await walk(url, owner).catch(async () => {
    // Rules this app cannot rewrite do not matter for a count or a delete.
    return walkPlain(url);
  });
  return tree.length - 1;
}

async function walkPlain(url: string): Promise<Entry[]> {
  const entry: Entry = { url, isFolder: url.endsWith("/"), rules: null };
  if (!entry.isFolder) return [entry];
  const children = await listFolder(url);
  return [entry, ...(await Promise.all(children.map((c) => walkPlain(c.url)))).flat()];
}

/** Deletes an item and, for a folder, everything inside, bottom up. */
export async function deleteTree(url: string, podUrl: string, onProgress?: (p: Progress) => void): Promise<void> {
  const reason = protectedReason(url, podUrl);
  if (reason) throw moveError("refused", reason);
  const tree = await walkPlain(url);
  await deleteEntries(tree, url, (done) => onProgress?.({ stage: "delete", done, total: tree.length }));
}
