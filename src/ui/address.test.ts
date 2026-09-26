import { describe, it, expect } from "vitest";
import { podLabel, trimAddress } from "./address";

const POD = "https://pod.example/amina/";

describe("trimAddress", () => {
  it("drops your provider's host, keeping the useful end", () => {
    expect(trimAddress("https://pod.example/neil/profile/card#me", POD)).toBe("…/neil/profile/card#me");
    expect(trimAddress(POD + "projects/readme.md", POD)).toBe("…/amina/projects/readme.md");
  });

  it("keeps another host, and anything that is not an address", () => {
    expect(trimAddress("https://other.example/x/shared/", POD)).toBe("other.example/x/shared/");
    expect(trimAddress("not an address", POD)).toBe("not an address");
  });

  it("names your pod by its last part, or its host when it is the whole domain", () => {
    expect(podLabel(POD)).toBe("…/amina/");
    expect(podLabel("https://neil.example/")).toBe("neil.example/");
  });
});
