/**
 * Sharing a folder with a collective's agent (docs/explanation/sharing.md),
 * as a change to the rules the folder already follows, never a reset:
 *
 * - Share: a folder that inherits gets rules of its own that START FROM what
 *   it inherits (your agent's edit on `output2/`, say), plus Read for the
 *   collective's agent. The first cut (slice A) started from nobody, and
 *   silently took from your own agent what the parent gave it.
 * - Stop sharing: the agent goes; when what remains is exactly what the
 *   folder above gives, its own rules go too, and it inherits again.
 * - Shared: whether the agent can read it, from its own rules or inherited.
 *
 * One conditional write each (`setAccess` / `removeOwnRules`), based on
 * rules read fresh: nothing written over a change made meanwhile.
 */
import { getAccess, removeOwnRules, setAccess, type AccessRules, type AgentGrant, type Mode } from "./acl";
import { effectiveAccess, parentOf } from "./files";

type Rules = Pick<AccessRules, "agents" | "public" | "authenticated">;

/** What the folder above gives this one: the rules it would inherit. */
async function inheritedRules(folderUrl: string, owner: string, podUrl: string): Promise<Rules | null> {
  const parent = parentOf(folderUrl);
  if (!parent || !parent.startsWith(podUrl)) return null;
  const above = await effectiveAccess(parent, owner, podUrl);
  if (!above) return null;
  if (above.access.unknown.length) {
    throw new Error(
      "The rules this folder follows include something this app cannot copy " +
        "(for example group sharing), so sharing would drop it. Nothing was changed."
    );
  }
  return { agents: above.access.agents, public: above.access.public, authenticated: above.access.authenticated };
}

function withRead(agents: AgentGrant[], agent: string): AgentGrant[] {
  const had = agents.find((a) => a.webId === agent)?.modes ?? [];
  const modes: Mode[] = had.includes("read") ? had : ["read", ...had];
  return [...agents.filter((a) => a.webId !== agent), { webId: agent, modes }];
}

/** Grants the collective's agent Read on `folderUrl`, keeping what the folder already allowed. */
export async function shareFolder(folderUrl: string, owner: string, podUrl: string, agent: string): Promise<void> {
  const current = await getAccess(folderUrl, owner);
  const base: Rules = current.inherited ? ((await inheritedRules(folderUrl, owner, podUrl)) ?? { agents: [], public: [], authenticated: [] }) : current;
  await setAccess(
    folderUrl,
    owner,
    { agents: withRead(base.agents, agent), public: base.public, authenticated: base.authenticated },
    current.inherited ? null : current.etag
  );
}

function key(rules: Rules): string {
  const agents = rules.agents.map((a) => `${a.webId} ${[...a.modes].sort().join(",")}`).sort();
  return JSON.stringify([agents, [...rules.public].sort(), [...rules.authenticated].sort()]);
}

/**
 * Takes the agent's grant away. Back to "Inherit from parent" when nothing
 * else set this folder apart; its own rules, minus the agent, otherwise.
 */
export async function stopSharing(folderUrl: string, owner: string, podUrl: string, agent: string): Promise<void> {
  const current = await getAccess(folderUrl, owner);
  if (current.inherited) {
    throw new Error("This folder follows the rules of the folder above it: the agent's access comes from there, so change it there.");
  }
  const remaining: Rules = {
    agents: current.agents.filter((a) => a.webId !== agent),
    public: current.public,
    authenticated: current.authenticated,
  };
  const above = await inheritedRules(folderUrl, owner, podUrl).catch(() => null);
  if (above && key(above) === key(remaining)) await removeOwnRules(folderUrl, current.etag);
  else await setAccess(folderUrl, owner, remaining, current.etag);
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
