import { describe, it, expect, beforeEach } from "vitest";
import { createAccount, podAddress, resetPendingSignUp, usernameProblem } from "./css-account";

const ISSUER = "https://pod.example/";
const INPUT = { username: "zoe", email: "zoe@example.org", password: "long-enough" };

/**
 * A fake CSS account API that records each call. `fail` makes one step answer
 * an error once, like the real server refusing a taken name.
 */
let calls: string[];
let fail: Record<string, string>;

const fakeFetch: typeof fetch = async (input, init) => {
  const url = String(input);
  const step =
    url === ISSUER + ".account/" ? (init?.headers ? "controls" : "index") : url.replace(ISSUER + "api/", "");
  calls.push(step);
  if (fail[step]) {
    const message = fail[step];
    delete fail[step];
    return new Response(JSON.stringify({ message }), { status: 400 });
  }
  const body: Record<string, unknown> = {
    index: { controls: { account: { create: ISSUER + "api/create" } } },
    create: { authorization: "t0k3n" },
    controls: { controls: { password: { create: ISSUER + "api/password" }, account: { pod: ISSUER + "api/pod" } } },
    password: {},
    pod: { pod: ISSUER + "zoe/", webId: ISSUER + "zoe/profile/card#me" },
  };
  return new Response(JSON.stringify(body[step]), { status: 200 });
};

beforeEach(() => {
  calls = [];
  fail = {};
  resetPendingSignUp();
});

describe("createAccount", () => {
  it("creates the account, then the password login, then the pod", async () => {
    const made = await createAccount(ISSUER, INPUT, fakeFetch);
    expect(calls).toEqual(["index", "create", "controls", "password", "pod"]);
    expect(made).toEqual({ pod: ISSUER + "zoe/", webId: ISSUER + "zoe/profile/card#me", email: INPUT.email });
  });

  it("makes no request at all for an empty username: CSS would claim the root", async () => {
    await expect(createAccount(ISSUER, { ...INPUT, username: "" }, fakeFetch)).rejects.toMatchObject({
      code: "bad-username",
      nothingCreated: true,
    });
    expect(calls).toEqual([]);
  });

  it("retries a taken username on the same account, without setting the password again", async () => {
    fail.pod = "There already is a resource at https://pod.example/zoe/";
    await expect(createAccount(ISSUER, INPUT, fakeFetch)).rejects.toMatchObject({
      code: "username-taken",
      nothingCreated: false,
    });
    calls = [];
    await createAccount(ISSUER, { ...INPUT, username: "zoe-b", email: "other@example.org" }, fakeFetch);
    expect(calls).toEqual(["controls", "pod"]);
  });

  it("retries a used email on the same account", async () => {
    fail.password = "There already is a login for this e-mail address.";
    await expect(createAccount(ISSUER, INPUT, fakeFetch)).rejects.toMatchObject({ code: "email-taken" });
    calls = [];
    const made = await createAccount(ISSUER, { ...INPUT, email: "zoe2@example.org" }, fakeFetch);
    expect(calls).toEqual(["controls", "password", "pod"]);
    expect(made.email).toBe("zoe2@example.org");
  });
});

describe("usernames", () => {
  it("accepts what becomes a clean pod address, and says why it refuses the rest", () => {
    expect(usernameProblem("ines-b")).toBeNull();
    expect(usernameProblem("Inès")).toMatch(/lowercase/);
    expect(usernameProblem("-ines")).toMatch(/lowercase/);
    expect(usernameProblem("a")).toMatch(/at least 2/);
    expect(podAddress(ISSUER, "ines")).toBe("https://pod.example/ines/");
  });
});
