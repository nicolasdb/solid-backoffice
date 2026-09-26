# Journeys

What each person does from start to finish. The J-numbers are used across
the docs, the slices and the tests. Why the app behaves this way:
[explanation/membership.md](explanation/membership.md),
[explanation/sharing.md](explanation/sharing.md).

| | Journey | Status |
|---|---|---|
| J1 | Newcomer **without** an account: invitation → create account (username, email, password; our provider only) → name and inbox set for them → ask to join | built; run live 25 Sep 2026 |
| J2 | Newcomer **with** a Solid account elsewhere: sign in → fill what the profile lacks → ask to join | works |
| J3 | Collective (signed in as its own account) reads requests → accept (roster, Read grants, `as:Accept`) or refuse (`as:Reject`) | built (slice B); run live 26 Sep 2026 |
| J4 | Member shares `output2/<collective>/`: create folder, grant the agent Read, announce; the agent collects once the member is accepted | member side works; collecting is the agent's (ADR 006) |
| J5 | Leaving or being removed, either side, nothing already collected is deleted | works, both sides; admin side run live 26 Sep 2026 |
| J6 | A collective joins another collective: J2 signed in as the collective | works |
| J7 | Following: add any address shared with you, read it with your WebID | slice C |
| J8 | Create an agent WebID and a Claude connector; read the access log | slice D |

The order of writes inside each journey is part of the design: a step that
fails halfway leaves the pods in a state the next visit picks up from. The
tests in `src/onboarding.test.ts` pin each order.
