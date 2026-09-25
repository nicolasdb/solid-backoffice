/**
 * Pieces shared by the home screen and a collective's tab.
 */
import type { MembershipState } from "./lib/collective";
import { esc } from "./ui/patterns";

/**
 * A finished step folds to its title: still one click away, no longer in the
 * way. `<details>` keeps that keyboard- and screen-reader-accessible for free.
 */
export function step(title: string, done: boolean, body: string, optional = false): string {
  const status = done ? "Done" : optional ? "Optional" : "To do";
  if (done) {
    return `
    <details class="step is-done">
      <summary class="step-head">
        <h3>${esc(title)}</h3>
        <span class="label-mono">${status}</span>
      </summary>
      ${body}
      <p class="step-error error" role="alert" hidden></p>
    </details>`;
  }
  return `
    <section class="step">
      <div class="step-head">
        <h3>${esc(title)}</h3>
        <span class="label-mono">${status}</span>
      </div>
      ${body}
      <p class="step-error error" role="alert" hidden></p>
    </section>`;
}

/**
 * "left" (listed, not declared) also covers a roster edited by hand before the
 * person ever asked. The copy must fit both, so it says what is true now
 * rather than guessing a history.
 */
export function stateLabel(state: MembershipState, name: string): string {
  switch (state) {
    case "member": return "You are a member.";
    case "pending": return "Request sent. Waiting for the collective to accept it.";
    case "left": return `${name} lists you as a member, but your profile does not say so. Confirm it to complete the membership.`;
    default: return "Not a member.";
  }
}

/** Member or request sent: the person has declared it on their side. */
export function declared(state: MembershipState): boolean {
  return state === "member" || state === "pending";
}

/** A state as a word next to a name. Never color alone: the word is the state. */
export function statePill(state: MembershipState): string {
  return state === "member"
    ? `<span class="pill is-ok">Member</span>`
    : state === "pending"
      ? `<span class="pill is-wait">Pending</span>`
      : `<span class="pill">Not joined</span>`;
}
