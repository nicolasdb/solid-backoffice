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
 * - Stop sharing asks what the folder's rules become (`stopPlan`): kept as
 *   they are without that agent (the default; a folder shared with two
 *   collectives stays shared with the other one), the folder above's again
 *   (its own `.acl` deleted), or you and your agents only.
 * - Shared: whether the agent can read it, from its own rules or inherited.
 *
 * One conditional write each, based on rules read fresh: nothing written
 * over a change made meanwhile.
 */
import { getAccess, PRESETS, removeOwnRules, setAccess, type AccessRules, type AgentGrant, type Mode } from "./acl";
import { effectiveAccess, followedBy, listFolder, parentOf } from "./files";
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
      const followed = await followedBy(url, owner, podUrl);
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

export type StopChoice = "keep" | "follow" | "only";

/** What the folder's rules can become when sharing stops; the screen asks which. */
export interface StopPlan {
  folderUrl: string;
  /** The folder's own rules as read; null when it has none. */
  basedOn: string | null;
  /** Without rules of its own: the folder the agent reads it through. Stopping cannot change that here. */
  through: string | null;
  /** The rules now, the collective's agent included. */
  now: Rules;
  /** Each choice offered, with the rules it leaves. "keep" is always there. */
  options: { choice: StopChoice; rules: Rules; from?: string }[];
}

/**
 * Reads the folder's rules fresh and says what stopping may leave:
 * - keep: the same, without `agent`;
 * - follow: what the folder above passes on, when the folder has rules of
 *   its own (they are deleted);
 * - only: you and your agents, when anyone else would still be named.
 */
export async function stopPlan(folderUrl: string, owner: string, podUrl: string, agent: string, delegates: string[]): Promise<StopPlan> {
  const own = await getAccess(folderUrl, owner);
  const followed = await followedBy(folderUrl, owner, podUrl);
  if (own.inherited) {
    const now = followed?.access ?? NOTHING;
    return { folderUrl, basedOn: null, through: followed?.from ?? null, now, options: [{ choice: "keep", rules: now }] };
  }
  const keep = withoutAgent(own, agent);
  const options: StopPlan["options"] = [{ choice: "keep", rules: keep }];
  if (followed && !followed.access.unknown.length) {
    const { agents, public: pub, authenticated } = followed.access;
    options.push({ choice: "follow", rules: { agents, public: pub, authenticated }, from: followed.from });
  }
  const yours = keep.agents.filter((a) => delegates.includes(a.webId));
  const others = keep.agents.length > yours.length || keep.public.length > 0 || keep.authenticated.length > 0;
  if (others) options.push({ choice: "only", rules: { agents: yours, public: [], authenticated: [] } });
  return { folderUrl, basedOn: own.etag, through: null, now: { agents: own.agents, public: own.public, authenticated: own.authenticated }, options };
}

/**
 * Stops sharing the way the person chose, in one conditional write based on
 * the rules the plan read: changed meanwhile, nothing is written.
 */
export async function stopSharingAs(plan: StopPlan, owner: string, choice: StopChoice): Promise<void> {
  if (plan.basedOn === null) return; // nothing of its own to change
  const option = plan.options.find((o) => o.choice === choice);
  if (!option) throw new Error("That choice is not offered for this folder.");
  if (choice === "follow") return removeOwnRules(plan.folderUrl, plan.basedOn);
  await setAccess(plan.folderUrl, owner, option.rules, plan.basedOn);
}

/** Puts the folder's own rules back as the plan read them (the toast's Undo). */
export async function restoreRules(plan: StopPlan, owner: string): Promise<void> {
  if (plan.basedOn === null) return;
  const own = await getAccess(plan.folderUrl, owner);
  await setAccess(plan.folderUrl, owner, plan.now, own.inherited ? null : own.etag);
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
