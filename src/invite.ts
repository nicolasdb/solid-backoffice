/**
 * What has to survive the sign-in round trip: the kit strips the query string
 * from the OIDC redirect, and a new account's name is typed before the
 * provider's page. Both live in sessionStorage for that one trip, and both are
 * conveniences: if storage is blocked, the person pastes the address or types
 * their name on the home screen, and nothing breaks.
 */

/**
 * An invitation is a link: `…/?collective=<address>`. Call before anything
 * else on startup.
 */
const INVITE_KEY = "solid-backoffice.invite";

export function captureInvite(): void {
  const address = new URL(window.location.href).searchParams.get("collective");
  if (address) setInvite(address);
}

export function pendingInvite(): string | null {
  try {
    return sessionStorage.getItem(INVITE_KEY);
  } catch {
    return null;
  }
}

export function setInvite(address: string | null): void {
  try {
    if (address) sessionStorage.setItem(INVITE_KEY, address);
    else sessionStorage.removeItem(INVITE_KEY);
  } catch {
    /* storage blocked: see the header */
  }
}

/**
 * A new account, written by the sign-up screen once the pod exists and read
 * back once, by the first home screen signed in as that WebID.
 */
const NEWCOMER_KEY = "solid-backoffice.newcomer";

export interface Newcomer {
  webId: string;
  name: string;
}

export function rememberNewcomer(newcomer: Newcomer): void {
  try {
    sessionStorage.setItem(NEWCOMER_KEY, JSON.stringify(newcomer));
  } catch {
    /* storage blocked: see the header */
  }
}

/** The newcomer record for this WebID, removed as it is read. Another WebID's is left alone. */
export function takeNewcomer(webId: string): Newcomer | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(NEWCOMER_KEY) ?? "null");
    if (value?.webId !== webId || typeof value.name !== "string") return null;
    sessionStorage.removeItem(NEWCOMER_KEY);
    return value;
  } catch {
    return null;
  }
}
