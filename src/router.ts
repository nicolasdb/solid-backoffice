/**
 * Which tab is open, in the address bar's hash, so the back button and a
 * reload work. Nothing else is kept: what each tab shows is read from the
 * pods on every render (docs/explanation/membership.md).
 *
 *   #/            home
 *   #/c/<address> a collective's tab: the one you run, or one you belong to
 *   #/more        the collectives that do not fit in the tab bar
 */
export type Route =
  | { name: "home" }
  | { name: "collective"; address: string }
  | { name: "more" };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, "");
  if (path.startsWith("/c/")) {
    const address = safeDecode(path.slice(3));
    if (address) return { name: "collective", address };
  }
  if (path === "/more") return { name: "more" };
  return { name: "home" };
}

export function routeHref(route: Route): string {
  switch (route.name) {
    case "collective": return `#/c/${encodeURIComponent(route.address)}`;
    case "more": return "#/more";
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
