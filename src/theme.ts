/**
 * The light / dark switch (top bar, and the welcome screen's corner).
 *
 * Light by default (decided 26 Sep 2026: index.html stamps
 * `data-theme="light"` so there is no dark flash before this runs). Then dark,
 * then "system", which removes the stamp and leaves `prefers-color-scheme` in
 * charge (theme.css). The choice is a per-browser convenience, kept in
 * localStorage and never written to a pod; without storage (private window,
 * blocked site data) it lasts until the page is reloaded.
 */
export type Theme = "system" | "light" | "dark";

const KEY = "backoffice:theme";
const ORDER: Theme[] = ["light", "dark", "system"];

const ICONS: Record<Theme, string> = {
  system: `<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>`,
  light: `<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>`,
  dark: `<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>`,
};

let current: Theme = "light";

export function storedTheme(): Theme {
  try {
    const value = localStorage.getItem(KEY);
    return value === "dark" || value === "system" ? value : "light";
  } catch {
    return current;
  }
}

export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  current = theme;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

export function nextTheme(theme: Theme): Theme {
  return ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
}

function label(theme: Theme): string {
  return `Theme: ${theme === "system" ? "same as this device" : theme}. Change it`;
}

export function renderThemeButton(extraClass = ""): string {
  const theme = storedTheme();
  return `<button type="button" id="theme" class="ghost small icon-button ${extraClass}"
    aria-label="${label(theme)}" title="${label(theme)}">${icon(theme)}</button>`;
}

function icon(theme: Theme): string {
  return `<svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[theme]}</svg>`;
}

export function bindThemeButton(container: HTMLElement): void {
  const button = container.querySelector<HTMLButtonElement>("#theme");
  button?.addEventListener("click", () => {
    const theme = nextTheme(storedTheme());
    try {
      if (theme === "light") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, theme);
    } catch {
      // No storage: the choice holds for this page only.
    }
    applyTheme(theme);
    button.innerHTML = icon(theme);
    button.setAttribute("aria-label", label(theme));
    button.title = label(theme);
  });
}
