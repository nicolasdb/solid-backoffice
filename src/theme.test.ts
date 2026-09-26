import { describe, it, expect, beforeEach } from "vitest";
import { applyTheme, bindThemeButton, nextTheme, renderThemeButton, storedTheme } from "./theme";

describe("the theme switch", () => {
  beforeEach(() => {
    localStorage.clear();
    applyTheme("system");
  });

  it("goes system, light, dark, then back to system", () => {
    expect(["system", "light", "dark"].map((t) => nextTheme(t as never))).toEqual(["light", "dark", "system"]);
  });

  it("stamps data-theme only for an explicit choice, and remembers it", () => {
    const box = document.createElement("div");
    box.innerHTML = renderThemeButton();
    bindThemeButton(box);
    const button = box.querySelector<HTMLButtonElement>("#theme")!;

    button.click();
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(storedTheme()).toBe("light");
    expect(button.getAttribute("aria-label")).toContain("light");

    button.click();
    expect(document.documentElement.dataset.theme).toBe("dark");

    button.click();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(localStorage.getItem("backoffice:theme")).toBeNull();
  });
});
