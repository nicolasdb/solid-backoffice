import { describe, it, expect } from "vitest";
import { collectiveFromInput } from "./invite";

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
