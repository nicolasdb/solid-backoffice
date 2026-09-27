/**
 * What has to survive the sign-in round trip: the kit strips the query string
 * from the OIDC redirect, and a new account's name is typed before the
 * provider's page. Both live in sessionStorage for that one trip, and both are
 * conveniences: if storage is blocked, the person pastes the address or types
 * their name on the home screen, and nothing breaks.
 */

/**
 * A link to this backoffice carrying one address: `…/?collective=<address>`
 * (an invitation) or `…/?open=<address>` (something shared with you).
 * ":" and "/" are allowed as they are in a query (RFC 3986), so the address
 * stays readable; only what would break the link (&, #, +, ?, spaces) is
 * encoded. searchParams.get reads both forms back the same.
 */
export function appLink(param: "collective" | "open", address: string): string {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  return `${url.href}?${param}=${encodeURIComponent(address).replace(/%3A/gi, ":").replace(/%2F/gi, "/")}`;
}

/** A link as shown: the app's host, then the address's last two segments. */
export function linkFace(link: string, param: "collective" | "open"): string {
  const url = new URL(link);
  const tail = new URL(url.searchParams.get(param) ?? url.href).pathname.split("/").filter(Boolean).slice(-2).join("/");
  return `${url.host}/?${param}=…/${tail}`;
}

/**
 * An invitation is a link: `…/?collective=<address>`; something shared, `…/?open=<address>`.
 * Call before anything else on startup.
 */
const INVITE_KEY = "solid-backoffice.invite";
const OPEN_KEY = "solid-backoffice.open";

export function captureInvite(): void {
  const params = new URL(window.location.href).searchParams;
  const address = params.get("collective");
  if (address) setInvite(address);
  const open = params.get("open");
  if (open) setOpen(open);
}

/** What someone pastes to follow: an open link (its `?open=` is the address) or the address itself. */
export function openFromInput(text: string): string {
  const trimmed = text.trim();
  try {
    return new URL(trimmed).searchParams.get("open") ?? trimmed;
  } catch {
    return trimmed;
  }
}

export function pendingOpen(): string | null {
  try {
    return sessionStorage.getItem(OPEN_KEY);
  } catch {
    return null;
  }
}

export function setOpen(address: string | null): void {
  try {
    if (address) sessionStorage.setItem(OPEN_KEY, address);
    else sessionStorage.removeItem(OPEN_KEY);
  } catch {
    /* storage blocked: see the header */
  }
}

/**
 * What someone pastes into "Join a collective": the invitation link (its
 * `?collective=` is the address, whichever backoffice served it) or the
 * collective's address itself.
 */
export function collectiveFromInput(text: string): string {
  const trimmed = text.trim();
  try {
    return new URL(trimmed).searchParams.get("collective") ?? trimmed;
  } catch {
    return trimmed;
  }
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
