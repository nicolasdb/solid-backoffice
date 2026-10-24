/**
 * What is the app's own, the same in every deploy of it.
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

// What changes from one deploy to the next (the login field's default, the
// sign-up provider, upload limits) is not compiled in: it is read at boot from
// /instance.json, see src/instance.ts (solid-kit ADR 011).

// No list of collectives lives here. Which collectives someone sees comes from
// their own profile (`org:memberOf`), an invitation link (`?collective=`), or
// an address they paste — see src/onboarding.ts. An app that assumes a
// collective is one that shows it to people who never asked for it.
