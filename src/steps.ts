/**
 * Pieces shared by the home screen and a collective's tab.
 */
import type { MembershipState } from "./lib/collective";
import { esc, toast } from "./ui/patterns";

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

/** Copy icon: Bootstrap Icons "copy" (MIT). */
const COPY_ICON = `<svg class="copy-icon" viewBox="0 0 16 16" aria-hidden="true"><path fill-rule="evenodd" d="M4 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zm2-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1zM2 5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1h1v1a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1v1z"/></svg>`;

/**
 * Text that copies itself when clicked. `shown` is what is on screen when it
 * is shorter than what is copied (a WebID shown as ".../neil/profile/card#me").
 */
export function copyable(text: string, copied: string, shown?: string): string {
  const face = shown === undefined ? `<code>${esc(text)}</code>` : `<span class="meta">${esc(shown)}</span>`;
  return `<button type="button" class="copyable" data-copy="${esc(text)}" data-copied="${esc(copied)}" title="Copy ${esc(text)}">${face}${COPY_ICON}<span class="visually-hidden">Copy</span></button>`;
}

/** Wires every copyable inside `root`. */
export function bindCopy(root: HTMLElement): void {
  root.querySelectorAll<HTMLButtonElement>("[data-copy]:not([data-copy-bound])").forEach((button) => {
    button.dataset.copyBound = "";
    button.addEventListener("click", async () => {
      const text = button.dataset.copy!;
      try {
        await navigator.clipboard.writeText(text);
        toast(button.dataset.copied ?? "Copied.");
      } catch {
        // No clipboard (permission, insecure context): show it to copy by hand.
        toast(`Copy this: ${text}`);
      }
    });
  });
}

/**
 * The head of one collective opened inside Collectives (canvas "Tabs, third
 * pass", board 5): the path back, the collective's name as the page's
 * heading, and on the right what to copy from it.
 */
export function collectiveHead(name: string, extra: string, right: string, className = ""): string {
  return `
    <header class="view-head path-head${className ? ` ${className}` : ""}">
      <nav class="crumbs" aria-label="Path">
        <a href="#/c">Collectives</a> <span aria-hidden="true">/</span>
        <h1 data-view-title aria-current="page">${esc(name)}</h1>
        ${extra}
      </nav>
      <div class="path-side">${right}</div>
    </header>`;
}
