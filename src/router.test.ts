import { describe, it, expect } from "vitest";
import { parseRoute, routeHref, type Route } from "./router";

describe("routes in the address bar", () => {
  const config = "https://pod.example/hs/config.ttl";

  it("round-trips every route", () => {
    const routes: Route[] = [
      { name: "home" },
      { name: "collectives" },
      { name: "you" },
      { name: "collective", address: config },
      { name: "places", path: "" },
      { name: "places", path: "projects/drafts/" },
      { name: "places", path: "notes%20%C3%A9t%C3%A9.md" },
      { name: "following" },
      { name: "followed", address: "https://other.example/shared/" },
    ];
    for (const route of routes) expect(parseRoute(routeHref(route))).toEqual(route);
  });

  it("keeps a collective's address intact, fragment included", () => {
    const group = `${config}#hs`;
    expect(parseRoute(routeHref({ name: "collective", address: group }))).toEqual({ name: "collective", address: group });
  });

  it("falls back to home for anything it does not know", () => {
    expect(parseRoute("")).toEqual({ name: "home" });
    expect(parseRoute("#/nowhere")).toEqual({ name: "home" });
    expect(parseRoute("#/more")).toEqual({ name: "home" });
    expect(parseRoute("#/c/%E0%A4%A")).toEqual({ name: "home" });
  });

  it("keeps a place's path readable and inside your pod", () => {
    expect(routeHref({ name: "places", path: "projects/drafts/" })).toBe("#/p/projects/drafts/");
    expect(parseRoute("#/p")).toEqual({ name: "places", path: "" });
    expect(parseRoute("#/p/https:%2F%2Fevil.example%2F")).toEqual({ name: "home" });
    expect(parseRoute("#/p/a/%2e%2e/")).toEqual({ name: "home" });
    expect(parseRoute("#/p/projects/../../other/")).toEqual({ name: "home" });
    expect(parseRoute("#/f/javascript%3Aalert(1)")).toEqual({ name: "home" });
  });
});
