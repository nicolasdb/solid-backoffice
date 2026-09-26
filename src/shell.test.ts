import { describe, it, expect } from "vitest";
import { renderShell, tabsFor, type TabCollective } from "./shell";

const c = (n: number): TabCollective => ({ name: `C${n}`, address: `https://pod.example/c${n}/config.ttl` });

describe("the tabs", () => {
  it("has Home, one tab per collective, and Places", () => {
    const tabs = tabsFor([c(1), c(2)], { name: "home" });
    expect(tabs.map((t) => t.label)).toEqual(["Home", "C1", "C2", "Places"]);
    expect(tabs[0].current).toBe(true);
    expect(tabs.at(-1)).toMatchObject({ href: "#/p/", current: false });
  });

  it("marks Places on your pod and on what you follow", () => {
    for (const route of [{ name: "places", path: "a/" }, { name: "following" }, { name: "followed", address: "https://x.example/" }] as const) {
      expect(tabsFor([], route).filter((t) => t.current).map((t) => t.label)).toEqual(["Places"]);
    }
  });

  it("marks the collective whose tab is open", () => {
    const tabs = tabsFor([c(1), c(2)], { name: "collective", address: c(2).address });
    expect(tabs.filter((t) => t.current).map((t) => t.label)).toEqual(["C2"]);
  });

  it("puts collectives past three under More, and marks More when one of them is open", () => {
    const four = [c(1), c(2), c(3), { ...c(4), badge: 2 }];
    const tabs = tabsFor(four, { name: "collective", address: c(4).address });
    expect(tabs.map((t) => t.label)).toEqual(["Home", "C1", "C2", "More", "Places"]);
    expect(tabs.find((t) => t.label === "More")).toMatchObject({ current: true, badge: 2 });
  });

  it("renders Places as a link, and marks the tab that is open", () => {
    const html = renderShell({ webId: "https://pod.example/me#me", name: "Neil", tabs: tabsFor([], { name: "home" }), body: "" });
    const box = document.createElement("div");
    box.innerHTML = html;
    const places = [...box.querySelectorAll(".tab")].find((t) => t.textContent!.includes("Places"))!;
    expect(places.tagName).toBe("A");
    expect(places.getAttribute("href")).toBe("#/p/");
    expect(box.querySelector('[aria-current="page"]')!.textContent).toContain("Home");
  });
});
