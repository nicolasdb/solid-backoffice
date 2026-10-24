import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_INSTANCE, instance, loadInstance, parseInstance } from "./instance";

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

const mom = {
  defaultIdentifier: "https://pod.mapsofmaking.org/",
  signupProvider: "https://pod.mapsofmaking.org/",
  uploadLimits: { "https://pod.mapsofmaking.org": 104857600 },
};

describe("parseInstance", () => {
  it("takes every field an instance sets", () => {
    expect(parseInstance(mom)).toEqual(mom);
  });

  it("keeps the defaults for what the file leaves out", () => {
    expect(parseInstance({ signupProvider: null })).toEqual({ ...DEFAULT_INSTANCE, signupProvider: null });
  });

  it("drops a bad field alone, and keeps the rest", () => {
    const got = parseInstance({ ...mom, defaultIdentifier: "javascript:alert(1)" });
    expect(got.defaultIdentifier).toBe(DEFAULT_INSTANCE.defaultIdentifier);
    expect(got.signupProvider).toBe(mom.signupProvider);
  });

  it("gives the provider its trailing slash: it is compared as a WebID prefix", () => {
    expect(parseInstance({ signupProvider: "https://pod.example.org" }).signupProvider).toBe("https://pod.example.org/");
  });

  it("keys upload limits by origin, which is how files.ts looks them up", () => {
    const got = parseInstance({ uploadLimits: { "https://pod.example.org/": 10, "nope": 5, "https://x.org": -1 } });
    expect(got.uploadLimits).toEqual({ "https://pod.example.org": 10 });
  });

  it("refuses something that is not an object", () => {
    expect(parseInstance([1, 2])).toEqual(DEFAULT_INSTANCE);
    expect(parseInstance(null)).toEqual(DEFAULT_INSTANCE);
  });
});

describe("loadInstance", () => {
  it("leaves the defaults when the file is absent", async () => {
    const got = await loadInstance(async () => new Response("", { status: 404 }));
    expect(got).toEqual(DEFAULT_INSTANCE);
  });

  it("leaves the defaults when a fallback answers with HTML", async () => {
    // A dev server, or an nginx whose try_files ends in /index.html.
    const got = await loadInstance(async () => new Response("<!doctype html>", { status: 200 }));
    expect(got).toEqual(DEFAULT_INSTANCE);
  });

  it("reads the file and keeps it for instance()", async () => {
    await loadInstance(async () => Response.json(mom));
    expect(instance()).toEqual(mom);
  });
});
