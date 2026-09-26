import { describe, it, expect, beforeEach } from "vitest";
import { applyTheme, bindThemeButton, nextTheme, renderThemeButton, storedTheme } from "./theme";

describe("the theme switch", () => {
  beforeEach(() => {
    localStorage.clear();
    applyTheme("light");
  });

  it("is light until someone chooses otherwise", () => {
    expect(storedTheme()).toBe("light");
  });

  it("goes light, dark, same as the device, then back to light", () => {
    expect(["light", "dark", "system"].map((t) => nextTheme(t as never))).toEqual(["dark", "system", "light"]);
  });

  it("stamps data-theme except for 'same as the device', and remembers the choice", () => {
    const box = document.createElement("div");
    box.innerHTML = renderThemeButton();
    bindThemeButton(box);
    const button = box.querySelector<HTMLButtonElement>("#theme")!;

    button.click();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(storedTheme()).toBe("dark");
    expect(button.getAttribute("aria-label")).toContain("dark");

    button.click();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(storedTheme()).toBe("system");

    button.click();
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("backoffice:theme")).toBeNull();
  });
});
