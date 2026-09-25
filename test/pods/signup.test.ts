import { describe, it, expect, inject, beforeEach, vi } from "vitest";
import { current } from "./as";
import { appToken, signIn } from "./accounts";

vi.mock("../../src/lib/auth", () => ({
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => current.fetch(input, init),
}));

const { AccountError, createAccount, resetPendingSignUp } = await import("../../src/lib/css-account");
const { setUpNewcomer } = await import("../../src/lib/newcomer");
const { readOwnProfile, loadCollective, profileEdits, updateOwnProfile, sendToInbox, buildJoin } =
  await import("../../src/lib/collective");
const admin = await import("../../src/lib/admin");
type AccountError = InstanceType<typeof AccountError>;

const base = inject("base");
const cast = inject("cast");

async function rejection(p: Promise<unknown>): Promise<AccountError> {
  try {
    await p;
  } catch (err) {
    if (err instanceof AccountError) return err;
    throw err;
  }
  throw new Error("expected a refusal");
}

/**
 * J1 against CSS 7: the account API as the sign-up screen uses it. Every cast
 * member was already created this way; these are the refusals and the retry.
 */
describe("creating an account (J1)", () => {
  beforeEach(() => resetPendingSignUp());

  it("makes a pod named after the username, with a public profile", async () => {
    const made = await createAccount(base, { username: "zoe", email: "zoe@test.invalid", password: "zoe-password" });
    expect(made.pod).toBe(base + "zoe/");
    expect(made.webId).toBe(base + "zoe/profile/card#me");
    expect((await fetch(made.webId)).status).toBe(200);
  });

  it("refuses an email already used, before any pod is made", async () => {
    const err = await rejection(
      createAccount(base, { username: "zoe-two", email: "amina@test.invalid", password: "whatever-1" })
    );
    expect(err.code).toBe("email-taken");
    expect((await fetch(base + "zoe-two/profile/card")).status).toBe(404);
  });

  it("refuses a taken username, then retries on the same account with another", async () => {
    const input = { username: cast.neil.name, email: "yann@test.invalid", password: "yann-password" };
    const err = await rejection(createAccount(base, input));
    expect(err.code).toBe("username-taken");
    const made = await createAccount(base, { ...input, username: "yann" });
    expect(made).toMatchObject({ pod: base + "yann/", email: "yann@test.invalid" });
  });

  it("never sends an empty pod name, which CSS reads as 'claim the root'", async () => {
    const err = await rejection(createAccount(base, { username: "", email: "x@test.invalid", password: "x-password" }));
    expect(err).toMatchObject({ code: "bad-username", nothingCreated: true });
  });
});

describe("a new account, once signed in (J1)", () => {
  it("gets its name and inbox, then asks to join HyperScope", async () => {
    resetPendingSignUp();
    const made = await createAccount(base, { username: "wanda", email: "wanda@test.invalid", password: "wanda-password" });
    const session = await signIn(base, { name: "wanda", ...made, ...(await appToken(base, "wanda", made.webId)) });
    current.fetch = session.fetch.bind(session) as typeof fetch;

    await setUpNewcomer(made.webId, made.pod, "Wanda");
    await setUpNewcomer(made.webId, made.pod, "Someone else");
    const profile = await readOwnProfile(made.webId);
    expect(profile).toMatchObject({ name: "Wanda", inbox: made.pod + "inbox/" });

    const hs = await loadCollective(cast.hyperscope.pod + "config.ttl");
    await updateOwnProfile(made.webId, profileEdits.join(hs.group));
    await sendToInbox(hs.inbox, buildJoin(made.webId, hs.group, profile.name));

    const collective = await signIn(base, cast.hyperscope);
    current.fetch = collective.fetch.bind(collective) as typeof fetch;
    const join = (await admin.readInbox(hs)).find((m) => m.type === "Join" && m.actor === made.webId);
    expect(join).toBeTruthy();
    expect(admin.requestFlags(join!, await admin.readPerson(made.webId), hs)).toEqual([]);
  });
});
