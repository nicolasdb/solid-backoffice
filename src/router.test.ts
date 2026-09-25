import { describe, it, expect } from "vitest";
import { parseRoute, routeHref, type Route } from "./router";

describe("routes in the address bar", () => {
  const config = "https://pod.example/hs/config.ttl";

  it("round-trips every route", () => {
    const routes: Route[] = [{ name: "home" }, { name: "more" }, { name: "collective", address: config }];
    for (const route of routes) expect(parseRoute(routeHref(route))).toEqual(route);
  });

  it("keeps a collective's address intact, fragment included", () => {
    const group = `${config}#hs`;
    expect(parseRoute(routeHref({ name: "collective", address: group }))).toEqual({ name: "collective", address: group });
  });

  it("falls back to home for anything it does not know", () => {
    expect(parseRoute("")).toEqual({ name: "home" });
    expect(parseRoute("#/nowhere")).toEqual({ name: "home" });
    expect(parseRoute("#/c/%E0%A4%A")).toEqual({ name: "home" });
  });
});
