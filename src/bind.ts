/**
 * Wiring shared by the backoffice's screens: one write per click, then a
 * re-render from the pods. A failure is shown in the step it came from and
 * nothing re-renders, so what was typed is not lost.
 */
import { describePodError } from "./lib/pod";

export function bindButton(button: HTMLButtonElement, action: () => Promise<void>, after: () => void): void {
  button.addEventListener("click", () => run(button, action, after));
}

export function bindForm(
  app: HTMLElement,
  selector: string,
  action: (form: HTMLFormElement) => Promise<void>,
  after: () => void
): void {
  const form = app.querySelector<HTMLFormElement>(selector);
  if (!form) return;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    run(form.querySelector("button")!, () => action(form), after);
  });
}

export async function run(button: HTMLButtonElement, action: () => Promise<void>, after: () => void): Promise<void> {
  const errorLine = button.closest(".step")?.querySelector<HTMLElement>(".step-error");
  button.disabled = true;
  if (errorLine) errorLine.hidden = true;
  try {
    await action();
    after();
  } catch (err) {
    button.disabled = false;
    if (errorLine) {
      errorLine.textContent = describePodError(err);
      errorLine.hidden = false;
    }
  }
}
