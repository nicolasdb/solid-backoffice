import { describe, it, expect } from "vitest";
import { appLink, collectiveFromInput, linkFace, openFromInput } from "./invite";

describe("what someone pastes to join a collective", () => {
  const address = "https://pod.example/hs/config.ttl";

  it("takes the address out of an invitation link, whichever backoffice served it", () => {
    expect(collectiveFromInput(` https://backoffice.example/?collective=${encodeURIComponent(address)} `)).toBe(address);
  });

  it("takes the collective's address as it is", () => {
    expect(collectiveFromInput(address)).toBe(address);
    expect(collectiveFromInput("not a url")).toBe("not a url");
  });
});

describe("a link that opens something shared, signed in", () => {
  const address = "https://pod.example/xavier/shared/a b&c.md";

  it("carries the address readably, and gives it back whole", () => {
    const link = appLink("open", address);
    expect(link).toContain("?open=https://pod.example/xavier/shared/");
    expect(new URL(link).searchParams.get("open")).toBe(address);
    expect(openFromInput(` ${link} `)).toBe(address);
    expect(openFromInput("https://pod.example/xavier/")).toBe("https://pod.example/xavier/");
  });

  it("shows the app's host and the address's tail", () => {
    expect(linkFace(appLink("open", "https://pod.example/xavier/shared/notes.md"), "open")).toMatch(/\/\?open=…\/shared\/notes\.md$/);
  });
});
