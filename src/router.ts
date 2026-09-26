/**
 * Which tab is open, in the address bar's hash, so the back button and a
 * reload work. Nothing else is kept: what each tab shows is read from the
 * pods on every render (docs/explanation/membership.md).
 *
 *   #/            home
 *   #/c/<address> a collective's tab: the one you run, or one you belong to
 *   #/more        the collectives that do not fit in the tab bar
 *   #/p/<path>    Places: a folder (ending in /) or a file on your own pod,
 *                 as a path from the pod root ("" is the root), written as
 *                 in its URL (percent-encoded), so it matches the listing
 *   #/f           Places: what you follow
 *   #/f/<address> one followed address, opened
 */
export type Route =
  | { name: "home" }
  | { name: "collective"; address: string }
  | { name: "more" }
  | { name: "places"; path: string }
  | { name: "following" }
  | { name: "followed"; address: string };

export function isPlaces(route: Route): boolean {
  return route.name === "places" || route.name === "following" || route.name === "followed";
}

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, "");
  if (path.startsWith("/c/")) {
    const address = safeDecode(path.slice(3));
    if (address) return { name: "collective", address };
  }
  if (path === "/more") return { name: "more" };
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
    case "collective": return `#/c/${encodeURIComponent(route.address)}`;
    case "more": return "#/more";
    case "places": return `#/p/${route.path}`;
    case "following": return "#/f";
    case "followed": return `#/f/${encodeURIComponent(route.address)}`;
    default: return "#/";
  }
}

export function currentRoute(): Route {
  return parseRoute(window.location.hash);
}

/** Go back to home without adding a history entry: for a tab that no longer exists. */
export function replaceWithHome(): void {
  history.replaceState(null, "", window.location.pathname + window.location.search + "#/");
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
