/**
 * Your `settings/` folder: where apps keep what they remember for you, on
 * your own pod (the WebID Profile spec's preferences file and type indexes
 * live there too). The backoffice keeps `following.ttl` and
 * `collectives.ttl` there.
 *
 * Apps create it without asking, so the first time this app writes there it
 * leaves a README saying what the folder is and why its files should be left
 * alone. Never overwritten: once there, it is yours.
 */
import { authFetch } from "./auth";

export function settingsUrl(podUrl: string): string {
  return podUrl + "settings/";
}

export const SETTINGS_README = `# settings

Apps keep what they remember for you in this folder: your preferences, the
lists they keep for you, where your data lives for them. It is on your pod so
it stays yours, and so that any app you trust can read the same thing.

Changing or deleting a file here can break the app that wrote it. Change these
settings from the apps themselves.

Written by the backoffice, which keeps two files here:

- \`following.ttl\`: the addresses others shared with you, that you follow.
- \`collectives.ttl\`: which folder you share with each collective. Your own
  agents can read it, so they know where to put your contributions.
`;

/** Writes `settings/README.md` unless something is already there. */
export async function ensureSettingsReadme(podUrl: string): Promise<void> {
  const res = await authFetch(settingsUrl(podUrl) + "README.md", {
    method: "PUT",
    headers: { "Content-Type": "text/markdown", "If-None-Match": "*" },
    body: SETTINGS_README,
  });
  // 412: already there. Any other failure is not worth stopping a write for:
  // the README explains the folder, nothing depends on it.
  if (!res.ok && res.status !== 412) console.warn(`Could not write the settings README (${res.status}).`);
}
