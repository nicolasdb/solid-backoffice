/**
 * What one deploy of the backoffice says about itself, read at boot from
 * `/instance.json` (solid-kit ADR 011): one image serves every instance, and
 * each instance mounts its own values beside it instead of compiling them in.
 *
 * Absent, or a field missing or malformed, the defaults below hold. They are
 * pod.nicolasdb.eu's values, so a deploy with no file behaves as the backoffice
 * did before this file existed. What the pod server can say about itself
 * (`/.well-known/css/provider.json`, ADR 010) is read from the server, never
 * repeated here; what is the app's own (`APP_NAME`, `SESSION_ID`) stays in
 * config.ts.
 *
 *   {
 *     "defaultIdentifier": "https://pod.mapsofmaking.org/",
 *     "signupProvider": "https://pod.mapsofmaking.org/",
 *     "uploadLimits": { "https://pod.mapsofmaking.org": 104857600 }
 *   }
 */

export interface Instance {
  /**
   * Prefilled in the login field. Either an OIDC issuer URL or a WebID works:
   * `loginWithIdentifier` accepts both. An issuer is the friendlier default:
   * most people know where their pod lives, not what their WebID is.
   */
  defaultIdentifier: string;
  /**
   * Where "Create an account" makes new accounts, or null to offer sign-in
   * only. It uses the Community Solid Server account API, which is not Solid
   * protocol: an instance whose people live on another provider sets null.
   */
  signupProvider: string | null;
  /**
   * The largest file one upload may send, per pod server (origin), in bytes.
   * Not Solid: it is what the gateway in front of a server accepts
   * (`client_max_body_size` in hetzner-gateway's `04-pocpod0.conf` for ours,
   * `request_body max_size` in a Caddy one). A server not listed is not checked
   * before sending; its 413 still says why.
   */
  uploadLimits: Record<string, number>;
}

export const DEFAULT_INSTANCE: Instance = {
  defaultIdentifier: "https://pod.nicolasdb.eu/",
  signupProvider: "https://pod.nicolasdb.eu/",
  uploadLimits: { "https://pod.nicolasdb.eu": 100 * 1024 * 1024 },
};

let current: Instance = DEFAULT_INSTANCE;

/** The values in force. Before `loadInstance` has run: the defaults. */
export function instance(): Instance {
  return current;
}

/**
 * Fetches `/instance.json` once, before anything renders. Never throws: a
 * file that cannot be read or parsed leaves the defaults, with a warning in
 * the console, because an instance that fails to start over its own config is
 * worse than one that starts with the generic values and says why.
 */
export async function loadInstance(fetchFn: typeof fetch = fetch): Promise<Instance> {
  let raw: unknown;
  try {
    // no-cache: the file changes without the image changing, and a stale copy
    // would send sign-ups to the previous provider.
    const res = await fetchFn("/instance.json", { cache: "no-cache" });
    if (!res.ok) return current;
    raw = await res.json();
  } catch (err) {
    // A dev server or a misconfigured gateway answers with index.html: that is
    // a parse error here, not a reason to stop.
    console.warn("instance.json: not read, using the defaults.", err);
    return current;
  }
  current = parseInstance(raw);
  return current;
}

/** Field by field: a bad field falls back alone, the rest is kept. */
export function parseInstance(raw: unknown): Instance {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    console.warn("instance.json: not an object, using the defaults.");
    return DEFAULT_INSTANCE;
  }
  const r = raw as Record<string, unknown>;
  const out: Instance = { ...DEFAULT_INSTANCE };

  if ("defaultIdentifier" in r) {
    if (typeof r.defaultIdentifier === "string" && isHttpUrl(r.defaultIdentifier)) out.defaultIdentifier = r.defaultIdentifier;
    else console.warn("instance.json: defaultIdentifier is not an http(s) URL, ignored.");
  }
  if ("signupProvider" in r) {
    if (r.signupProvider === null) out.signupProvider = null;
    else if (typeof r.signupProvider === "string" && isHttpUrl(r.signupProvider)) out.signupProvider = withSlash(r.signupProvider);
    else console.warn("instance.json: signupProvider is neither null nor an http(s) URL, ignored.");
  }
  if ("uploadLimits" in r) {
    const limits = r.uploadLimits;
    if (limits && typeof limits === "object" && !Array.isArray(limits)) {
      const ok: Record<string, number> = {};
      for (const [key, value] of Object.entries(limits)) {
        // Keyed by origin, because files.ts looks up `new URL(podUrl).origin`:
        // a key with a path or a trailing slash would never match.
        if (isHttpUrl(key) && typeof value === "number" && value > 0) ok[new URL(key).origin] = value;
        else console.warn(`instance.json: uploadLimits["${key}"] ignored (an origin and a positive number of bytes).`);
      }
      out.uploadLimits = ok;
    } else {
      console.warn("instance.json: uploadLimits is not an object, ignored.");
    }
  }
  return out;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** A provider is compared as a prefix of WebIDs: without the slash, pod.example.org.evil would match. */
function withSlash(value: string): string {
  return value.endsWith("/") ? value : value + "/";
}
