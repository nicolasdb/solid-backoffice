import { describe, it, expect } from "vitest";
import { renderShell, tabsFor } from "./shell";

const WEBID = "https://pod.example/neil/profile/card#me";

function shell(todo = 0): HTMLElement {
  const box = document.createElement("div");
  box.innerHTML = renderShell({ webId: WEBID, name: "Neil", tabs: tabsFor({ name: "places", path: "" }), todo, body: "" });
  return box;
}

describe("the tabs", () => {
  it("has Pods first, then Collectives, whatever the number of collectives", () => {
    const tabs = tabsFor({ name: "places", path: "" });
    expect(tabs.map((t) => t.label)).toEqual(["Pods", "Collectives"]);
    expect(tabs[0]).toMatchObject({ href: "#/p/", current: true });
    expect(tabs[1]).toMatchObject({ href: "#/c", current: false });
  });

  it("marks Pods on your pod and on what you follow", () => {
    for (const route of [{ name: "places", path: "a/" }, { name: "following" }, { name: "followed", address: "https://x.example/" }] as const) {
      expect(tabsFor(route).filter((t) => t.current).map((t) => t.label)).toEqual(["Pods"]);
    }
  });

  it("marks Collectives on the list and on one collective, with the requests waiting", () => {
    for (const route of [{ name: "collectives" }, { name: "collective", address: "https://pod.example/hs/config.ttl" }] as const) {
      expect(tabsFor(route).filter((t) => t.current).map((t) => t.label)).toEqual(["Collectives"]);
    }
    expect(tabsFor({ name: "collectives" }, 2)[1].badge).toBe(2);
    expect(tabsFor({ name: "collectives" }, 0)[1].badge).toBeUndefined();
  });

  it("marks no tab on You", () => {
    expect(tabsFor({ name: "you" }).some((t) => t.current)).toBe(false);
  });
});

describe("you, under the avatar", () => {
  it("holds your name, your WebID to copy, the way to You, and Sign out", () => {
    const box = shell();
    const pop = box.querySelector(".account-pop")!;
    expect(pop.textContent).toContain("Neil");
    expect(pop.querySelector<HTMLElement>("[data-copy]")!.dataset.copy).toBe(WEBID);
    expect(pop.querySelector('a[href="#/you"]')!.textContent).toContain("Your name, agent and inbox");
    expect(pop.querySelector("#logout")).not.toBeNull();
    expect(box.querySelector(".avatar-dot")).toBeNull();
  });

  it("puts a dot on the avatar while a step of You is left to do", () => {
    const box = shell(1);
    expect(box.querySelector(".avatar-dot")).not.toBeNull();
    expect(box.querySelector(".account-pop")!.textContent).toContain("1 to do");
    expect(box.querySelector("summary")!.getAttribute("aria-label")).toContain("1 to do");
  });
});
