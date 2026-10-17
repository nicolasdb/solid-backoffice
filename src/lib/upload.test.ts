// @vitest-environment node
// The Inrupt core is the one @inrupt/solid-client-authn-browser installs (not a
// dependency of ours on purpose): upgrading the session upgrades what is pinned here.
import { describe, it, expect, vi, afterEach } from "vitest";
import { buildAuthenticatedFetch, generateDpopKeyPair } from "@inrupt/solid-client-authn-core";
import { decodeJwt, decodeProtectedHeader } from "jose";

/** The session's fetch, as the app sees it: signs, then calls the global fetch. */
let session: typeof fetch = (input, init) => globalThis.fetch(input, init);
vi.mock("./auth", () => ({ authFetch: (input: RequestInfo, init?: RequestInit) => session(input, init) }));

const { signedHeaders, sendWithProgress } = await import("./upload");

const URL_ = "https://pod.example/amina/film.mp4";
const real = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = real;
  vi.unstubAllGlobals();
});

describe("signing an upload for XMLHttpRequest", () => {
  it("catches what @inrupt/solid-client-authn signs, sends nothing, and leaves other requests alone", async () => {
    const dpopKey = await generateDpopKeyPair();
    const authenticated = buildAuthenticatedFetch("token-1", { dpopKey });
    const others: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      others.push(String(input));
      return new Response("elsewhere");
    }) as typeof fetch;

    const [headers] = await Promise.all([
      signedHeaders(URL_, "PUT", { "Content-Type": "video/mp4", "If-None-Match": "*" }, authenticated),
      globalThis.fetch("https://pod.example/amina/"), // a read meanwhile goes on as usual
    ]);
    expect(others).toEqual(["https://pod.example/amina/"]);
    expect(headers!.get("authorization")).toBe("DPoP token-1");
    expect(headers!.get("content-type")).toBe("video/mp4");
    expect(headers!.get("if-none-match")).toBe("*");
    expect(headers!.has("if-match")).toBe(false);
    const proof = headers!.get("dpop")!;
    expect(decodeProtectedHeader(proof).typ).toBe("dpop+jwt");
    expect(decodeJwt(proof)).toMatchObject({ htm: "PUT", htu: URL_ });
    expect(globalThis.fetch).not.toBe(real); // our stub is back, not the borrowed one
  });
});

/** Just enough of XMLHttpRequest: sends in two steps, answers `status`. */
function fakeXhr(status: number, sent: { headers: Record<string, string>; body?: unknown }[]) {
  return class {
    status = 0;
    upload = new EventTarget();
    private events = new EventTarget();
    private headers: Record<string, string> = {};
    open() {}
    setRequestHeader(name: string, value: string) {
      this.headers[name] = value;
    }
    addEventListener(type: string, fn: EventListener) {
      this.events.addEventListener(type, fn);
    }
    getAllResponseHeaders() {
      return "etag: \"v1\"\r\n";
    }
    send(body: Blob) {
      sent.push({ headers: this.headers, body });
      const step = (loaded: number) => Object.assign(new Event("progress"), { loaded, total: body.size, lengthComputable: true });
      this.upload.dispatchEvent(step(body.size / 2));
      this.upload.dispatchEvent(step(body.size));
      this.status = status;
      this.events.dispatchEvent(new Event("load"));
    }
  };
}

describe("sending with progress", () => {
  const body = new Blob([new Uint8Array(1000)], { type: "video/mp4" });
  const init = { method: "PUT", headers: { "Content-Type": "video/mp4", "If-None-Match": "*" }, body };

  it("sends the file once, by XHR, with the session's headers, and reports each step", async () => {
    session = (input, init) => globalThis.fetch(input, { ...init, headers: { ...(init?.headers as object), Authorization: "DPoP t" } });
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 500 })) as typeof fetch;
    const sent: { headers: Record<string, string> }[] = [];
    vi.stubGlobal("XMLHttpRequest", fakeXhr(201, sent));
    const steps: [number, number][] = [];
    const res = await sendWithProgress(URL_, init, (s, t) => steps.push([s, t]));
    expect(res.status).toBe(201);
    expect(res.headers.get("etag")).toBe('"v1"');
    expect(globalThis.fetch).not.toHaveBeenCalled(); // the body went once, by XHR
    expect(sent).toHaveLength(1);
    expect(sent[0].headers).toMatchObject({ authorization: "DPoP t", "content-type": "video/mp4", "if-none-match": "*" });
    expect(steps).toEqual([[500, 1000], [1000, 1000], [1000, 1000]]);
  });

  it("falls back to the session's fetch when the pod refuses the XHR's credentials", async () => {
    const calls: (string | undefined)[] = [];
    session = async (input, init) => {
      const marked = new Headers(init?.headers).has("if-match");
      if (marked) return globalThis.fetch(input, init);
      calls.push(init?.method);
      return new Response(null, { status: 201 });
    };
    vi.stubGlobal("XMLHttpRequest", fakeXhr(401, []));
    const res = await sendWithProgress(URL_, init, () => {});
    expect(res.status).toBe(201);
    expect(calls).toEqual(["PUT"]);
  });

  it("uses the session's fetch, without progress, when the headers cannot be caught", async () => {
    session = async () => new Response(null, { status: 201 }); // signs, but never calls the global fetch
    const sent: unknown[] = [];
    vi.stubGlobal("XMLHttpRequest", fakeXhr(201, sent as never));
    expect((await sendWithProgress(URL_, init, () => {})).status).toBe(201);
    expect(sent).toEqual([]);
  });
});

describe("a request to sign that escapes", () => {
  it("can write nothing: its If-Match matches no file", async () => {
    const seen: Headers[] = [];
    // A session that no longer calls the global fetch: the request reaches the pod.
    const leaky: typeof fetch = async (_input, init) => {
      seen.push(new Headers(init?.headers));
      return new Response(null, { status: 412 });
    };
    expect(await signedHeaders(URL_, "PUT", { "If-None-Match": "*" }, leaky)).toBeNull();
    expect(seen[0].get("if-match")).toBe('"backoffice-sign-only"');
  });
});
