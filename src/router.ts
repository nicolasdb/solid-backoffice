/**
 * Which tab is open, in the address bar's hash, so the back button and a
 * reload work. Nothing else is kept: what each tab shows is read from the
 * pods on every render (docs/explanation/membership.md).
 *
 *   #/            where signing in lands: Pods, or Collectives while an
 *                 invitation waits (resolved by onboarding.ts, which then
 *                 writes the address it chose)
 *   #/c           Collectives: the ones you run and belong to, joining
 *   #/c/<address> one collective, opened inside Collectives
 *   #/you         You: your name, agent and inbox, and your profile's source
 *   #/p/<path>    Places: a folder (ending in /) or a file on your own pod,
 *                 as a path from the pod root ("" is the root), written as
 *                 in its URL (percent-encoded), so it matches the listing
 *   #/f           Places: what you follow
 *   #/f/<address> one followed address, opened
 */
export type Route =
  | { name: "home" }
  | { name: "collectives" }
  | { name: "collective"; address: string }
  | { name: "you" }
  | { name: "places"; path: string }
  | { name: "following" }
  | { name: "followed"; address: string };

export function isCollectives(route: Route): boolean {
  return route.name === "collectives" || route.name === "collective";
}

export function isPlaces(route: Route): boolean {
  return route.name === "places" || route.name === "following" || route.name === "followed";
}

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, "");
  if (path === "/c" || path === "/c/") return { name: "collectives" };
  if (path === "/you") return { name: "you" };
  if (path.startsWith("/c/")) {
    const address = safeDecode(path.slice(3));
    if (address) return { name: "collective", address };
  }
  if (path === "/p" || path.startsWith("/p/")) {
    const rest = path.slice(3).replace(/^\/+/, "");
    const segments = rest.split("/").map((s) => safeDecode(s));
    // A path from the pod root, never an address elsewhere or a way up.
    if (!segments.includes(null) && !/^[a-z][a-z0-9+.-]*:/i.test(rest) && !segments.some((s) => s === ".." || s === ".")) {
      return { name: "places", path: rest };
    }
  }
  if (path === "/f") return { name: "following" };
  if (path.startsWith("/f/")) {
    const address = safeDecode(path.slice(3));
    if (address && /^https?:\/\//.test(address)) return { name: "followed", address };
  }
  return { name: "home" };
}

export function routeHref(route: Route): string {
  switch (route.name) {
    case "collectives": return "#/c";
    case "collective": return `#/c/${encodeURIComponent(route.address)}`;
    case "you": return "#/you";
    case "places": return `#/p/${route.path}`;
    case "following": return "#/f";
    case "followed": return `#/f/${encodeURIComponent(route.address)}`;
    default: return "#/";
  }
}

export function currentRoute(): Route {
  return parseRoute(window.location.hash);
}

/** Puts `route` in the address bar without a history entry or a hashchange. */
export function replaceRoute(route: Route): void {
  history.replaceState(null, "", window.location.pathname + window.location.search + routeHref(route));
}

/** Calls `render` on every hash change; returns what stops it. */
export function onRouteChange(render: () => void): () => void {
  window.addEventListener("hashchange", render);
  return () => window.removeEventListener("hashchange", render);
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
