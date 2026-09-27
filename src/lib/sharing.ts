/**
 * Sharing a folder with a collective's agent (docs/explanation/sharing.md).
 * The folder is the app's (`output2/<collective>/`), so its rules are set
 * whole, never merged:
 *
 * - Share: the folder gets rules of its own: you (Control, as always), your
 *   agents (`acl:delegates` in your profile) Can edit, the collective's
 *   agent Can read.
 * - Stop sharing: its own `.acl` is deleted. "Inherit from parent" is not a
 *   rule to restore, it is the absence of one: the server then applies the
 *   nearest folder above that has rules.
 * - The folder above (`output2/`) is secured first, on both, when it has no
 *   rules of its own: it would pass on the pod root's (public Read, on a new
 *   pod), and stopping would silently make the folder public. You and your
 *   agents, nothing else. Rules it already has are yours: left alone. The
 *   pod's root is never touched.
 * - Shared: whether the agent can read it, from its own rules or inherited.
 *
 * One conditional write each (`setAccess` / `removeOwnRules`), based on
 * rules read fresh: nothing written over a change made meanwhile.
 */
import { getAccess, PRESETS, removeOwnRules, setAccess, type AgentGrant } from "./acl";
import { effectiveAccess, parentOf } from "./files";
import { ensureContainer } from "./pod";

/** The folder's own rules: your agents edit, the collective's agent reads. */
export function sharingRules(agent: string, delegates: string[]): AgentGrant[] {
  return [
    ...delegates.filter((d) => d !== agent).map((webId) => ({ webId, modes: PRESETS.edit })),
    { webId: agent, modes: PRESETS.read },
  ];
}

/** The folder above `folderUrl` gets rules of its own (you, your agents edit) when it has none. Not the pod's root. */
export async function secureParent(folderUrl: string, owner: string, podUrl: string, delegates: string[]): Promise<void> {
  const parent = parentOf(folderUrl);
  if (!parent || parent === podUrl || !parent.startsWith(podUrl)) return;
  await ensureContainer(parent);
  const current = await getAccess(parent, owner);
  if (!current.inherited) return;
  const agents = delegates.map((webId) => ({ webId, modes: PRESETS.edit }));
  await setAccess(parent, owner, { agents, public: [], authenticated: [] }, null);
}

/**
 * Creates `folderUrl` if needed and gives it its own rules for sharing with
 * `agent` (see `sharingRules`), the folder above secured first: nothing is
 * public on the way.
 */
export async function shareFolder(folderUrl: string, owner: string, podUrl: string, agent: string, delegates: string[]): Promise<void> {
  await secureParent(folderUrl, owner, podUrl, delegates);
  await ensureContainer(folderUrl);
  const current = await getAccess(folderUrl, owner);
  await setAccess(
    folderUrl,
    owner,
    { agents: sharingRules(agent, delegates), public: [], authenticated: [] },
    current.inherited ? null : current.etag
  );
}

/**
 * Deletes the folder's own rules, so it inherits again: from the folder
 * above, secured first when it has none. Already inheriting: nothing to do.
 */
export async function stopSharing(folderUrl: string, owner: string, podUrl: string, delegates: string[]): Promise<void> {
  const current = await getAccess(folderUrl, owner);
  if (current.inherited) return;
  await secureParent(folderUrl, owner, podUrl, delegates);
  await removeOwnRules(folderUrl, current.etag);
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
