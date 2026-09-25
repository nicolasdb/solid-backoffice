/**
 * Runs the app's own src/lib code against the test server, as one cast member.
 * The app's authFetch is replaced by that person's signed-in fetch; nothing
 * else in src/lib is stubbed.
 */
import { inject } from "vitest";
import { signIn } from "./accounts";
import type { Role } from "./cast";

export const current: { fetch: typeof fetch } = { fetch: (...a) => fetch(...a) };

export async function actAs(role: Role): Promise<void> {
  const session = await signIn(inject("base"), inject("cast")[role]);
  current.fetch = session.fetch.bind(session) as typeof fetch;
}

export function signOut(): void {
  current.fetch = (...a) => fetch(...a);
}
