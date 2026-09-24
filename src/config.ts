/**
 * Everything an app built from this kit is expected to change.
 *
 * Keeping these here rather than scattered through the code is what makes the
 * rest of `src/lib/` copyable between apps without a diff.
 */

/** Shown on the provider's consent screen. Name the app, not the kit. */
export const APP_NAME = "Backoffice";

/**
 * Stable across reloads so `restorePreviousSession` can find the session again.
 *
 * It must be UNIQUE PER APP. Two apps served from the same origin with the same
 * id share Inrupt's session storage and clobber each other's tokens — the bug
 * that forced valisette and the backoffice onto separate subdomains. Distinct
 * ids plus distinct origins is belt and braces; distinct ids alone is the part
 * you control from here.
 */
export const SESSION_ID = "solid-backoffice";

/**
 * Prefilled in the login field. Either an OIDC issuer URL or a WebID works —
 * `loginWithIdentifier` accepts both. An issuer is the friendlier default: most
 * people know where their pod lives, not what their WebID is.
 */
export const DEFAULT_IDENTIFIER = "https://pod.nicolasdb.eu/";

/**
 * The collectives this backoffice offers to join, as URLs of their `config.ttl`.
 *
 * This list is the only collective-specific thing in the app. What a collective
 * IS — its name, roster, inbox, agent, and the folder members share through —
 * lives in that file on the collective's own pod (see src/lib/collective.ts for
 * the shape), so a second collective such as Maps of Making is one line here
 * and one file there, not a code change.
 *
 * The file must be readable by anyone signed in: people read it BEFORE they are
 * members, to know where to send the request.
 */
export const COLLECTIVE_CONFIGS: string[] = ["https://pod.nicolasdb.eu/hyperscope/config.ttl"];
