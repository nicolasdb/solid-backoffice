/**
 * An upload that reports its progress, byte by byte.
 *
 * `fetch` cannot say how much of a request body has been sent (Firefox
 * cannot stream one either); `XMLHttpRequest` can, through `upload`'s
 * progress events. But a pod wants each request signed by the session
 * (DPoP: a proof bound to the method and the address, made inside the
 * session's own `fetch`), and that `fetch` signs only what it sends itself.
 *
 * So the request is first given to the session's `fetch` with no body,
 * marked by an `If-Match` no file can match, and the global `fetch` it
 * calls is borrowed for that one call: the marked request is answered on
 * the spot with its headers kept, every other request goes on as usual. The kept headers (`Authorization`, a
 * fresh `DPoP` proof never sent before) then go with the XHR.
 *
 * This leans on how @inrupt/solid-client-authn 5 calls `fetch` (looked up
 * at each call, `upload.test.ts` pins it on the real library). Whenever the
 * headers cannot be caught, there is no XHR, or the pod answers 401 or 403
 * (a token renewed meanwhile), the upload goes through the session's
 * `fetch` as before, without progress.
 */
import { authFetch } from "./auth";

/**
 * Marks the request to sign, and makes it harmless should it ever reach a
 * server (a session that stops calling the global fetch): no resource has
 * this version, so the pod refuses it (412) and writes nothing.
 */
const MARK = '"backoffice-sign-only"';

/** Bytes sent so far, of how many. */
export type Progress = (sent: number, total: number) => void;

/**
 * The headers `authenticated` would send for `method` on `url`, beside
 * those in `headers`; null when they could not be caught.
 */
export async function signedHeaders(
  url: string,
  method: string,
  headers: Record<string, string>,
  authenticated: typeof fetch = authFetch
): Promise<Headers | null> {
  const real = globalThis.fetch;
  let caught: Headers | null = null;
  globalThis.fetch = (input, init) => {
    const sent = new Headers(init?.headers);
    if (sent.get("if-match") !== MARK) return real(input, init);
    sent.delete("if-match");
    caught = sent;
    return Promise.resolve(new Response(null, { status: 204 }));
  };
  try {
    await authenticated(url, { method, headers: { ...headers, "If-Match": MARK } });
  } catch {
    return null;
  } finally {
    globalThis.fetch = real;
  }
  return caught;
}

/**
 * Sends `body` as `init` says, reporting progress. Answers as `fetch`
 * would: a Response (its status and headers), or a TypeError when the
 * request never got an answer.
 */
export async function sendWithProgress(
  url: string,
  init: { method: string; headers: Record<string, string>; body: Blob },
  progress: Progress
): Promise<Response> {
  const signed = typeof XMLHttpRequest === "function" ? await signedHeaders(url, init.method, init.headers) : null;
  if (!signed) return authFetch(url, init);
  const res = await new Promise<Response>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(init.method, url);
    signed.forEach((value, name) => xhr.setRequestHeader(name, value));
    xhr.upload.addEventListener("progress", (e) => progress(e.loaded, e.lengthComputable ? e.total : init.body.size));
    xhr.addEventListener("load", () => {
      const headers = new Headers();
      for (const line of xhr.getAllResponseHeaders().trim().split(/\r?\n/)) {
        const at = line.indexOf(":");
        if (at > 0) headers.append(line.slice(0, at).trim(), line.slice(at + 1).trim());
      }
      resolve(new Response(null, { status: xhr.status, headers }));
    });
    xhr.addEventListener("error", () => reject(new TypeError(`Network error while sending ${url}.`)));
    xhr.addEventListener("abort", () => reject(new TypeError(`Sending ${url} was stopped.`)));
    xhr.send(init.body);
  });
  if (res.status === 401 || res.status === 403) return authFetch(url, init);
  progress(init.body.size, init.body.size);
  return res;
}
