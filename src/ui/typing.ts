/** Someone is typing or has typed inside `root`: a quiet redraw would lose it (ADR 007, rule 2). */
export function busy(root: HTMLElement): boolean {
  const active = document.activeElement;
  if (active && root.contains(active) && active.matches("input, textarea, select")) return true;
  return [...root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")].some(
    (field) => field.value !== field.defaultValue
  );
}
