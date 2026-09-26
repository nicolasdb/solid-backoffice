/**
 * Addresses as people read them on screen. The signed-in pod's host is
 * dropped ("…/neil/profile/card#me"), so a long address is never cut at its
 * useful end; other hosts are kept. Copying a WebID in full belongs to the
 * people screen (slice D).
 */
export function trimAddress(address: string, podUrl: string): string {
  let url: URL;
  let pod: URL;
  try {
    url = new URL(address);
    pod = new URL(podUrl);
  } catch {
    return address;
  }
  if (url.origin !== pod.origin) return url.host + url.pathname + url.hash;
  if (url.pathname === "/") return url.host + "/";
  return "…" + url.pathname + url.hash;
}

/** Your pod, the way the places list names it: "…/amina/", or its host when it is the whole domain. */
export function podLabel(podUrl: string): string {
  return trimAddress(podUrl, podUrl);
}
