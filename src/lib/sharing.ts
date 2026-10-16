/**
 * Sharing a folder you picked with a collective's agent (slice G,
 * docs/explanation/sharing.md). The folder is yours, not the app's, so its
 * rules are merged, never set whole: the same as adding a person in the
 * access panel.
 *
 * - Share: the collective's agent Can read, your agents (`acl:delegates` in
 *   your profile) Can edit; everything else the folder allowed stays. A
 *   folder without rules of its own gets a copy of the ones it followed,
 *   plus these. A folder the app creates for it starts from you and your
 *   agents only, and so does any folder above it the app creates on the way:
 *   nothing new is public.
 * - Stop sharing: that agent leaves the folder's rules, nothing else does, so
 *   a folder shared with two collectives stays shared with the other one.
 * - Reset to inherit: offered only when what is left says the same as the
 *   folder above (your agents aside); it deletes the folder's own `.acl`.
 * - Shared: whether the agent can read it, from its own rules or inherited.
 *
 * One conditional write each, based on rules read fresh: nothing written
 * over a change made meanwhile.
 */
import { getAccess, PRESETS, readAccess, removeOwnRules, setAccess, type AccessRules, type AgentGrant, type Mode } from "./acl";
import { effectiveAccess, listFolder, parentOf, type Effective } from "./files";
import { ensureContainer, exists } from "./pod";

type Rules = Pick<AccessRules, "agents" | "public" | "authenticated">;
const NOTHING: Rules = { agents: [], public: [], authenticated: [] };

/** Never offered for sharing: apps, this one included, depend on them. The pod root neither. */
export const NOT_SHAREABLE = ["profile/", "settings/", "inbox/"];

/** Whether `folderUrl` may be shared with a collective: a folder in your pod, not one of the above. */
export function shareable(folderUrl: string, podUrl: string): boolean {
  if (!folderUrl.endsWith("/") || !folderUrl.startsWith(podUrl) || folderUrl === podUrl) return false;
  const path = folderUrl.slice(podUrl.length);
  return !NOT_SHAREABLE.some((p) => path.startsWith(p));
}

/** The grants sharing adds: your agents edit, the collective's agent reads. */
export function sharingRules(agent: string, delegates: string[]): AgentGrant[] {
  return [
    ...delegates.filter((d) => d !== agent).map((webId) => ({ webId, modes: PRESETS.edit })),
    { webId: agent, modes: PRESETS.read },
  ];
}

/** `rules` with `grants` added: modes are joined, never taken away. */
export function withGrants(rules: Rules, grants: AgentGrant[]): Rules {
  const agents = rules.agents.map((a) => ({ webId: a.webId, modes: [...a.modes] }));
  for (const g of grants) {
    const known = agents.find((a) => a.webId === g.webId);
    if (known) known.modes = [...new Set<Mode>([...known.modes, ...g.modes])];
    else agents.push({ webId: g.webId, modes: [...g.modes] });
  }
  return { agents, public: [...rules.public], authenticated: [...rules.authenticated] };
}

/** `rules` without `webId`: everything else as it was. */
export function withoutAgent(rules: Rules, webId: string): Rules {
  return { agents: rules.agents.filter((a) => a.webId !== webId), public: [...rules.public], authenticated: [...rules.authenticated] };
}

/** Whether `rules` already give each grant all its modes. */
function covers(rules: Rules, grants: AgentGrant[]): boolean {
  return grants.every((g) => {
    const has = rules.agents.find((a) => a.webId === g.webId)?.modes ?? [];
    return g.modes.every((m) => has.includes(m));
  });
}

const notUnderstood = () =>
  new Error(
    "The rules this would start from include something this app does not understand yet. " +
      "Copying them here would silently drop it, so nothing was changed."
  );

/**
 * Adds `grants` to the rules of `url`, keeping everything else. Without
 * rules of its own, it starts from those it followed, or from nothing but
 * you when `fromScratch`. One conditional write, retried once on a change
 * made meanwhile.
 */
export async function addGrants(url: string, owner: string, podUrl: string, grants: AgentGrant[], fromScratch = false): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    const own = await getAccess(url, owner);
    let base: Rules = own;
    if (own.inherited && !fromScratch) {
      const above = parentOf(url);
      const followed = above && above.startsWith(podUrl) ? await effectiveAccess(above, owner, podUrl) : null;
      if (followed?.access.unknown.length) throw notUnderstood();
      base = followed?.access ?? NOTHING;
    } else if (own.inherited) {
      base = NOTHING;
    }
    if (covers(base, grants)) return; // already allowed: no rules written
    try {
      await setAccess(url, owner, withGrants(base, grants), own.inherited ? null : own.etag);
      return;
    } catch (err) {
      if ((err as { status?: number }).status !== 412 || attempt > 0) throw err;
    }
  }
}

/**
 * Creates `folderUrl` and any missing folder above it. Each folder created
 * above it gets rules of its own (you, your agents edit), so it does not
 * pass on the pod root's (public Read, on a new pod). Returns whether
 * `folderUrl` itself was created.
 */
async function createMissing(folderUrl: string, owner: string, podUrl: string, delegates: string[]): Promise<boolean> {
  const missing: string[] = [];
  for (let url: string | null = folderUrl; url && url !== podUrl && url.startsWith(podUrl); url = parentOf(url)) {
    if (await exists(url)) break;
    missing.unshift(url);
  }
  for (const url of missing) {
    await ensureContainer(url);
    if (url === folderUrl) continue;
    const agents = delegates.map((webId) => ({ webId, modes: PRESETS.edit }));
    await setAccess(url, owner, { agents, public: [], authenticated: [] }, null);
  }
  return missing.includes(folderUrl);
}

/** Shares `folderUrl` with `agent` (see the top of this file); creates it first if needed. */
export async function shareFolder(folderUrl: string, owner: string, podUrl: string, agent: string, delegates: string[]): Promise<void> {
  if (!shareable(folderUrl, podUrl)) throw new Error("This folder cannot be shared with a collective: pick a folder of your own.");
  const created = await createMissing(folderUrl, owner, podUrl, delegates);
  await addGrants(folderUrl, owner, podUrl, sharingRules(agent, delegates), created);
}

/** Takes `agent` out of the folder's own rules. Nothing else changes; without rules of its own, nothing to do. */
export async function stopSharing(folderUrl: string, owner: string, agent: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    const own = await getAccess(folderUrl, owner);
    if (own.inherited || !own.agents.some((a) => a.webId === agent)) return;
    try {
      await setAccess(folderUrl, owner, withoutAgent(own, agent), own.etag);
      return;
    } catch (err) {
      if ((err as { status?: number }).status !== 412 || attempt > 0) throw err;
    }
  }
}

/** The same rules, your agents and you aside: the comparison behind "Reset to inherit". */
function sameRules(a: Rules, b: Rules, ignore: string[]): boolean {
  const key = (r: Rules) =>
    JSON.stringify({
      agents: r.agents
        .filter((g) => !ignore.includes(g.webId))
        .map((g) => `${g.webId} ${[...g.modes].sort().join(",")}`)
        .sort(),
      public: [...r.public].sort(),
      authenticated: [...r.authenticated].sort(),
    });
  return key(a) === key(b);
}

/**
 * What the folder would follow, when its own rules say nothing more than
 * that (your agents aside): then "Reset to inherit" is offered. Null when it
 * has no rules of its own, or they say something else.
 */
export async function resetOffer(folderUrl: string, owner: string, podUrl: string, delegates: string[]): Promise<Effective | null> {
  const own = await readAccess(folderUrl, owner);
  if (own.inherited || own.unknown.length) return null;
  const above = parentOf(folderUrl);
  if (!above || !above.startsWith(podUrl)) return null;
  const followed = await effectiveAccess(above, owner, podUrl);
  if (!followed || followed.access.unknown.length) return null;
  return sameRules(own, followed.access, [owner, ...delegates]) ? followed : null;
}

/** Deletes the folder's own rules, so it follows the folder above again. */
export async function resetToInherit(folderUrl: string, owner: string): Promise<void> {
  const own = await getAccess(folderUrl, owner);
  if (own.inherited) return;
  await removeOwnRules(folderUrl, own.etag);
}

/** Whether the agent can read the folder, by its own rules or the ones it inherits. A missing folder: no. */
export async function sharedWith(folderUrl: string, owner: string, podUrl: string, agent: string): Promise<boolean> {
  try {
    const rules = await effectiveAccess(folderUrl, owner, podUrl);
    if (!rules) return false;
    return rules.access.public.includes("read") || rules.access.agents.some((a) => a.webId === agent && a.modes.includes("read"));
  } catch (err) {
    if ((err as { status?: number }).status === 404) return false;
    throw err;
  }
}

/**
 * The folders offered in the picker: the first two levels of your pod, those
 * that may be shared (`shareable`). A folder that cannot be listed is left out.
 */
export async function shareableFolders(podUrl: string): Promise<string[]> {
  const folders = async (url: string) =>
    (await listFolder(url)).filter((i) => i.isFolder && shareable(i.url, podUrl)).map((i) => i.url);
  const top = await folders(podUrl);
  const below = await Promise.all(top.map((url) => folders(url).catch(() => [] as string[])));
  return [...top, ...below.flat()].sort();
}
