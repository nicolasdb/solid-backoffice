/**
 * Which folder you share with each collective (slice G), kept in
 * `settings/collectives.ttl` on your own pod: you pick the folder, the
 * collective's `hs:bundleFolder` is only the suggestion. Only you and your
 * own agents (`acl:delegates`, Read) can read the file: they need it to
 * know where to put your contributions (docs/reference/collectives-file.md).
 *
 * Choosing is not sharing: the choice says which folder, the folder's rules
 * say whether the collective's agent can read it (`sharedWith`).
 *
 * Writes go through `updateDocument`, like `following.ts`: a second window
 * changing the same file is never overwritten unseen.
 */
import { DataFactory, Parser, Writer } from "n3";
import { authFetch } from "./auth";
import { updateDocument, type ConditionalError } from "./conditional";
import { readTurtle } from "./read";
import { NS } from "./vocab";
import { ensureSettingsReadme } from "./settings";
import { getAccess, PRESETS, setAccess } from "./acl";
import { addGrants } from "./sharing";

const T = {
  SharedFolder: NS.hs + "SharedFolder",
  collective: NS.hs + "collective",
  folder: NS.hs + "folder",
};

/** Collective IRI → the folder's full address. */
export type FolderChoices = Map<string, string>;

export function choicesUrl(podUrl: string): string {
  return podUrl + "settings/collectives.ttl";
}

function idFor(group: string): string {
  let h = 5381;
  for (const c of group) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0;
  return "c-" + h.toString(36);
}

/** Entries pointing outside `podUrl` are dropped: you only share from your own pod. */
export function parseChoices(turtle: string, docUrl: string, podUrl: string): FolderChoices {
  const quads = new Parser({ baseIRI: docUrl }).parse(turtle);
  const value = (s: string, p: string) => quads.find((q) => q.subject.value === s && q.predicate.value === p)?.object.value;
  const choices: FolderChoices = new Map();
  for (const q of quads) {
    if (q.predicate.value !== NS.rdf + "type" || q.object.value !== T.SharedFolder) continue;
    const group = value(q.subject.value, T.collective);
    const folder = value(q.subject.value, T.folder);
    if (group && folder && folder.endsWith("/") && folder.startsWith(podUrl) && folder !== podUrl) choices.set(group, folder);
  }
  return choices;
}

export function serializeChoices(choices: FolderChoices, docUrl: string): string {
  const { namedNode, quad } = DataFactory;
  const writer = new Writer({ baseIRI: docUrl, prefixes: { hs: NS.hs } });
  for (const [group, folder] of choices) {
    const s = namedNode(docUrl + "#" + idFor(group));
    writer.addQuad(quad(s, namedNode(NS.rdf + "type"), namedNode(T.SharedFolder)));
    writer.addQuad(quad(s, namedNode(T.collective), namedNode(group)));
    writer.addQuad(quad(s, namedNode(T.folder), namedNode(folder)));
  }
  let out = "";
  writer.end((err, result) => {
    if (err) throw err;
    out = result;
  });
  return out;
}

/** Your choices, from your own pod. No file yet: none. */
export async function readChoices(podUrl: string): Promise<FolderChoices> {
  const url = choicesUrl(podUrl);
  const res = await readTurtle(url);
  if (res.status === 404) return new Map();
  if (!res.ok) {
    const err = new Error(`Could not read which folders you share (${res.status}).`) as ConditionalError;
    err.status = res.status;
    throw err;
  }
  return parseChoices(await res.text(), url, podUrl);
}

/**
 * Who may read the file: you, and Read for `readers` (your agents). Its own
 * rules, never inherited: whatever `settings/` allows (another app may have
 * opened it up), this file says only what you share where.
 */
async function keepPrivate(url: string, owner: string, podUrl: string, readers: string[]): Promise<void> {
  const grants = readers.map((webId) => ({ webId, modes: PRESETS.read }));
  const own = await getAccess(url, owner);
  if (own.inherited) await setAccess(url, owner, { agents: grants, public: [], authenticated: [] }, null);
  else if (grants.length) await addGrants(url, owner, podUrl, grants);
}

/**
 * Records `folderUrl` as the folder you share with `group`; null forgets it.
 * The file is created empty, then given its rules (you; your agents Read),
 * and only then says anything: your choices are never public, even for a
 * moment. The settings README comes with the file. One conditional write
 * for the change itself.
 */
export async function chooseFolder(podUrl: string, owner: string, group: string, folderUrl: string | null, readers: string[]): Promise<void> {
  const url = choicesUrl(podUrl);
  if (folderUrl) {
    const created = await authFetch(url, {
      method: "PUT",
      headers: { "Content-Type": "text/turtle", "If-None-Match": "*" },
      body: "",
    });
    if (created.ok) await ensureSettingsReadme(podUrl);
    else if (created.status !== 412) throw new Error(`Could not create ${url} (${created.status}).`);
    await keepPrivate(url, owner, podUrl, readers);
  }
  try {
    await updateDocument(url, (text) => {
      const next = parseChoices(text, url, podUrl);
      if (folderUrl) next.set(group, folderUrl);
      else next.delete(group);
      return serializeChoices(next, url);
    });
  } catch (err) {
    if (folderUrl || (err as ConditionalError).status !== 404) throw err; // nothing to forget
  }
}
