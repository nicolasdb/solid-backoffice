/**
 * Creating people on the throwaway server, through the CSS account API — the
 * same API account creation will use in the backoffice (journey J1), so this
 * file is also the first working record of how that API behaves.
 */
import { Session } from "@inrupt/solid-client-authn-node";

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

/** Account, password login, pod (named like the username), and an app token. */
export async function createPerson(base: string, name: string): Promise<Person> {
  const index = await json(await fetch(base + ".account/"), "account index");
  const { authorization } = await json(
    await fetch(index.controls.account.create, { method: "POST" }),
    "create account"
  );
  // A GET with a JSON content type and no body makes CSS 7 answer 500.
  const token = { Authorization: `CSS-Account-Token ${authorization}` };
  const auth = { ...token, "Content-Type": "application/json" };
  const controls = (await json(await fetch(base + ".account/", { headers: token }), "account controls")).controls;

  await json(
    await fetch(controls.password.create, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ email: `${name}@test.invalid`, password: `${name}-password` }),
    }),
    `password for ${name}`
  );
  const { pod, webId } = await json(
    await fetch(controls.account.pod, { method: "POST", headers: auth, body: JSON.stringify({ name }) }),
    `pod for ${name}`
  );
  const { id, secret } = await json(
    await fetch(controls.account.clientCredentials, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ name: `${name}-tests`, webId }),
    }),
    `app token for ${name}`
  );
  return { name, webId, pod, clientId: id, clientSecret: secret };
}

/** A signed-in fetch for one person, like the backoffice's after login. */
export async function signIn(base: string, person: Person): Promise<Session> {
  const session = new Session();
  await session.login({ clientId: person.clientId, clientSecret: person.clientSecret, oidcIssuer: base });
  if (!session.info.isLoggedIn) throw new Error(`${person.name} could not sign in`);
  return session;
}
