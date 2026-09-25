/**
 * Creating people on the throwaway server. The account and the pod are made by
 * the app's own `createAccount` (src/lib/css-account.ts, journey J1), so every
 * cast member is also a run of the sign-up code; only the app token, which a
 * person signing in through a browser never needs, is added here.
 */
import { Session } from "@inrupt/solid-client-authn-node";
import { createAccount } from "../../src/lib/css-account";

export interface Person {
  name: string;
  webId: string;
  pod: string;
  clientId: string;
  clientSecret: string;
}

async function json(res: Response, what: string): Promise<any> {
  if (!res.ok) throw new Error(`${what}: ${res.status} ${await res.text()}`);
  return res.json();
}

export const credentialsOf = (name: string) => ({ email: `${name}@test.invalid`, password: `${name}-password` });

/** Account, password login and pod through the app, then an app token for the tests. */
export async function createPerson(base: string, name: string): Promise<Person> {
  const { email, password } = credentialsOf(name);
  const { webId, pod } = await createAccount(base, { username: name, email, password });
  return { name, webId, pod, ...(await appToken(base, name, webId)) };
}

/** Logs in to the account with its password, as CSS's own page does, and mints a client credential. */
export async function appToken(base: string, name: string, webId: string): Promise<{ clientId: string; clientSecret: string }> {
  const index = (await json(await fetch(base + ".account/"), "account index")).controls;
  const { authorization } = await json(
    await fetch(index.password.login, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentialsOf(name)),
    }),
    `login for ${name}`
  );
  // A GET with a JSON content type and no body makes CSS 7 answer 500.
  const token = { Authorization: `CSS-Account-Token ${authorization}` };
  const controls = (await json(await fetch(base + ".account/", { headers: token }), "account controls")).controls;
  const { id, secret } = await json(
    await fetch(controls.account.clientCredentials, {
      method: "POST",
      headers: { ...token, "Content-Type": "application/json" },
      body: JSON.stringify({ name: `${name}-tests`, webId }),
    }),
    `app token for ${name}`
  );
  return { clientId: id, clientSecret: secret };
}

/** A signed-in fetch for one person, like the backoffice's after login. */
export async function signIn(base: string, person: Person): Promise<Session> {
  const session = new Session();
  await session.login({ clientId: person.clientId, clientSecret: person.clientSecret, oidcIssuer: base });
  if (!session.info.isLoggedIn) throw new Error(`${person.name} could not sign in`);
  return session;
}
