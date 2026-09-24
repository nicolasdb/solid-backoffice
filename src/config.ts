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

// No list of collectives lives here. Which collectives someone sees comes from
// their own profile (`org:memberOf`), an invitation link (`?collective=`), or
// an address they paste — see src/onboarding.ts. An app that assumes a
// collective is one that shows it to people who never asked for it.
