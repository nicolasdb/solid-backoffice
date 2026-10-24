/**
 * What a pod server says it offers (solid-kit ADR 010): its descriptor at
 * `<issuer>/.well-known/css/provider.json`, written by solid-css-overlay.
 *
 *   { "software": "solid-css-overlay", "version": "7.2.0-6", "layout": "subdomain",
 *     "capabilities": { "account": { "path": "/.account/" },
 *                       "onboard": { "path": "/onboard/" },
 *                       "connector": { "url": "https://mcp.pod.example.org/" } } }
 *
 * Detect, don't list: the app no longer compares a WebID with a provider it
 * knows (the old `onProvider`). No descriptor, or no capability in it, means
 * not offered. A path is resolved on the issuer's own origin and refused if it
 * leaves it; a URL elsewhere (`connector`) is for showing, never called with
 * the person's cookie.
 */

export type Layout = "subdomain" | "suffix";

export interface Descriptor {
  software: string | null;
  version: string | null;
  /** How this server names pods: `<name>.host` or `host/<name>/`. Null when it does not say. */
  layout: Layout | null;
  /** The CSS account API, on the issuer's origin. */
  account: string | null;
  /** The connector's onboarding (mint, grants, revoke), on the issuer's origin. */
  onboard: string | null;
  /** The connector's public address, elsewhere: shown, never called. */
  connector: string | null;
}

const cache = new Map<string, Promise<Descriptor | null>>();
/** Layouts already read, for screens that draw synchronously. */
const layouts = new Map<string, Layout | null>();

/** Forget what was read: sign-out, and tests. */
export function forgetDescriptors(): void {
  cache.clear();
  layouts.clear();
}

/** The layout `readDescriptor` found for this issuer, or null (not read yet, or not said). */
export function knownLayout(issuer: string): Layout | null {
  return layouts.get(issuer) ?? null;
}

/**
 * The issuer's descriptor, once per page. Never throws: a server that does
 * not answer, answers 401 (stock CSS) or answers something else offers
 * nothing, which is what the app should then say.
 */
export function readDescriptor(issuer: string, fetchImpl: typeof fetch = (...a) => fetch(...a)): Promise<Descriptor | null> {
  let hit = cache.get(issuer);
  if (!hit) {
    hit = (async () => {
      try {
        // credentials omit: it is public, and this must never carry a cookie.
        const res = await fetchImpl(new URL(".well-known/css/provider.json", issuer).href, { credentials: "omit" });
        if (!res.ok) return null;
        const d = parseDescriptor(issuer, await res.json());
        layouts.set(issuer, d?.layout ?? null);
        return d;
      } catch {
        return null;
      }
    })();
    cache.set(issuer, hit);
  }
  return hit;
}

export function parseDescriptor(issuer: string, raw: unknown): Descriptor | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const caps = (r.capabilities && typeof r.capabilities === "object" ? r.capabilities : {}) as Record<string, unknown>;
  const path = (name: string): string | null => {
    const p = (caps[name] as { path?: unknown } | undefined)?.path;
    if (typeof p !== "string") return null;
    try {
      const url = new URL(p, issuer);
      return url.origin === new URL(issuer).origin ? url.href : null;
    } catch {
      return null;
    }
  };
  const connector = (caps.connector as { url?: unknown } | undefined)?.url;
  return {
    software: typeof r.software === "string" ? r.software : null,
    version: typeof r.version === "string" ? r.version : null,
    layout: r.layout === "subdomain" || r.layout === "suffix" ? r.layout : null,
    account: path("account"),
    onboard: path("onboard"),
    connector: typeof connector === "string" && /^https?:\/\//.test(connector) ? connector : null,
  };
}

/**
 * Whether two addresses share a site, as the browser decides when it sends a
 * SameSite cookie: same scheme, and same last two labels of the host
 * (`backoffice.mapsofmaking.org` and `pod.mapsofmaking.org`).
 *
 * The last two labels are not the registrable domain everywhere (`co.uk`).
 * Wrong in that direction costs a request the browser sends without the
 * cookie, answered 401: the browser, not this function, decides what is sent.
 */
export function sameSite(a: string, b: string): boolean {
  const x = new URL(a);
  const y = new URL(b);
  if (x.protocol !== y.protocol) return false;
  const site = (host: string) => (/^[\d.]+$|^\[|^localhost$/.test(host) ? host : host.split(".").slice(-2).join("."));
  return site(x.hostname) === site(y.hostname);
}

/** What the agents section can do for a signed-in person. */
export type AgentsOffer =
  /** The issuer offers accounts, and this app is on its site: the cookie is sent. */
  | { kind: "offered"; issuer: string; account: string; onboard: string | null }
  /** The issuer offers them, but only to apps on its own site. */
  | { kind: "elsewhere"; issuer: string; account: string }
  /** The issuer says nothing about accounts. */
  | { kind: "not-offered"; issuer: string };

export function agentsOffer(issuer: string, descriptor: Descriptor | null, appOrigin: string): AgentsOffer {
  if (!descriptor?.account) return { kind: "not-offered", issuer };
  if (!sameSite(appOrigin, issuer)) return { kind: "elsewhere", issuer, account: descriptor.account };
  return { kind: "offered", issuer, account: descriptor.account, onboard: descriptor.onboard };
}

/** Where `name`'s pod will be on this server, in its layout (folders when it does not say). */
export function podAddress(issuer: string, username: string, layout: Layout | null): string {
  if (layout === "subdomain") {
    const url = new URL(issuer);
    return `${url.protocol}//${username}.${url.host}/`;
  }
  return new URL(`${username}/`, issuer).href;
}
