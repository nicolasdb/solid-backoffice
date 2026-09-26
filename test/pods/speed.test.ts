import { describe, it, expect, vi, inject } from "vitest";
import { current, actAs } from "./as";

/**
 * L5 · speed: how many requests one home screen costs, and how many of them
 * wait for each other. Every request gets LATENCY ms added, as on a real
 * network, so the wall time divided by LATENCY is the number of rounds: the
 * part a person waits through on every tab.
 */
const LATENCY = 50;
const log: { method: string; url: string; start: number; end: number; status: number }[] = [];
let t0 = 0;

vi.mock("../../src/lib/auth", () => ({
  authFetch: async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const entry = { method: init?.method ?? "GET", url, start: performance.now() - t0, end: 0, status: 0 };
    log.push(entry);
    await new Promise((r) => setTimeout(r, LATENCY));
    const res = await current.fetch(input, init);
    entry.end = performance.now() - t0;
    entry.status = res.status;
    return res;
  },
}));

const { load } = await import("../../src/onboarding");
const { forgetReads } = await import("../../src/lib/read");
const cast = inject("cast");

async function measure(role: "amina" | "hyperscope") {
  await actAs(role);
  log.length = 0;
  t0 = performance.now();
  const start = t0;
  await load(cast[role].webId, cast[role].pod);
  const ms = performance.now() - start;
  const report = {
    role,
    latency: LATENCY,
    requests: log.length,
    rounds: Math.round(ms / LATENCY),
    ms: Math.round(ms),
    notModified: log.filter((r) => r.status === 304).length,
    timeline: log.map((r) => `${String(Math.round(r.start)).padStart(5)} → ${String(Math.round(r.end)).padStart(5)}  ${r.status} ${r.method} ${r.url.replace(inject("base"), "/")}`),
  };
  console.log(JSON.stringify(report, null, 2));
  return report;
}

describe("L5 · what one load() costs", () => {
  it("a member (Amina)", async () => {
    forgetReads();
    const r = await measure("amina");
    expect(r.requests).toBeGreaterThan(0);
  });

  it("a member again: the server answers 304 for what did not change", async () => {
    const r = await measure("amina");
    expect(r.notModified).toBeGreaterThan(0);
  });

  it("the collective (HyperScope)", async () => {
    const r = await measure("hyperscope");
    expect(r.requests).toBeGreaterThan(0);
  });
});
