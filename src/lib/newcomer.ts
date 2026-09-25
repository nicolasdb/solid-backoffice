/**
 * The profile steps a new account gets done for it (journey J1), and the inbox
 * sequence shared with the "Create my inbox" button.
 *
 * Plain Solid: works on any provider. Kept apart from collective.ts so each
 * step it calls stays a separate, replaceable function — the screen tests pin
 * their order by replacing them.
 */
import { ensureContainer } from "./pod";
import { setAuthenticatedAccess } from "./acl";
import { profileEdits, readOwnProfile, updateOwnProfile } from "./collective";

/**
 * Creates the inbox, opens it, then advertises it — in that order, so the
 * profile never points at an inbox that does not exist or that nobody may
 * post to. Anyone signed in may Append; only the owner reads.
 */
export async function createInbox(webId: string, inbox: string): Promise<void> {
  await ensureContainer(inbox);
  await setAuthenticatedAccess(inbox, webId, ["append"]);
  await updateOwnProfile(webId, profileEdits.setInbox(inbox));
}

/**
 * Name and inbox for someone who just created their account. Skips whatever
 * the profile already has, so running it twice, or after the person did a
 * step by hand, changes nothing.
 */
export async function setUpNewcomer(webId: string, podUrl: string, name: string): Promise<void> {
  const profile = await readOwnProfile(webId);
  if (!profile.inbox) await createInbox(webId, new URL("inbox/", podUrl).href);
  if (!profile.name && name.trim()) await updateOwnProfile(webId, profileEdits.setName(name.trim()));
}
