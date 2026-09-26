/**
 * The frame around every signed-in screen (layout A in docs/layout-brief.md,
 * tabs third pass): the brand, the tabs and you on top; on a phone the same
 * tabs become a bar at the bottom. One `<nav>`, restyled by CSS, so there is
 * one list of links for keyboards and screen readers whatever the width.
 *
 * Tabs: Pods, what people sign in for, then Collectives, one tab for all of
 * them (a badge counts requests waiting in the one you run). You (your name,
 * WebID, profile and sign out) sits under the avatar, with a dot while a
 * step is left to do.
 */
import { bindThemeButton, renderThemeButton } from "./theme";
import { APP_NAME } from "./config";
import { isCollectives, isPlaces, routeHref, type Route } from "./router";
import { bindCopy, copyable } from "./steps";
import { trimAddress } from "./ui/address";
import { esc } from "./ui/patterns";

export interface Tab {
  label: string;
  icon: "collective" | "places";
  href: string;
  current: boolean;
  badge?: number;
}

/** `route` is the one on screen, after `#/` was resolved to Pods or Collectives. */
export function tabsFor(route: Route, requests = 0): Tab[] {
  return [
    { label: "Pods", icon: "places", href: routeHref({ name: "places", path: "" }), current: isPlaces(route) },
    {
      label: "Collectives",
      icon: "collective",
      href: routeHref({ name: "collectives" }),
      current: isCollectives(route),
      badge: requests || undefined,
    },
  ];
}

const ICONS: Record<Tab["icon"], string> = {
  collective: `<circle cx="12" cy="12" r="8"/><circle cx="12" cy="9" r="1.5"/><circle cx="9" cy="14" r="1.5"/><circle cx="15" cy="14" r="1.5"/>`,
  places: `<path d="M3 7h7l2 2h9v10H3z"/>`,
};

function renderTab(tab: Tab): string {
  const icon = `<svg class="tab-icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[tab.icon]}</svg>`;
  const badge = tab.badge ? ` <span class="tab-badge">${tab.badge}<span class="visually-hidden"> waiting</span></span>` : "";
  return `<a class="tab${tab.current ? " is-current" : ""}" href="${tab.href}"${tab.current ? ' aria-current="page"' : ""}>${icon}<span class="tab-label">${esc(tab.label)}</span>${badge}</a>`;
}

export interface ShellOptions {
  webId: string;
  name: string | null;
  tabs: Tab[];
  /** Steps of You still to do (name, inbox): a dot on the avatar. */
  todo?: number;
  /** The screen itself; it carries the `data-view-title` heading. */
  body: string;
}

export function renderShell({ webId, name, tabs, todo = 0, body }: ShellOptions): string {
  const who = name ?? webId;
  const left = todo ? `<span class="pill is-wait">${todo} to do</span>` : "";
  return `
    <div class="app-shell">
      <header class="app-top">
        <span class="brand"><span class="brand-mark" aria-hidden="true"></span>${esc(APP_NAME)}</span>
        <nav class="tabs" aria-label="Main">${tabs.map(renderTab).join("")}</nav>
        <div class="account">
          ${renderThemeButton()}
          <details class="account-menu" id="account-menu">
            <summary aria-label="You: ${esc(who)}${todo ? `, ${todo} to do` : ""}">
              <span class="avatar" aria-hidden="true">${esc(initial(who))}${todo ? `<span class="avatar-dot"></span>` : ""}</span>
              <span class="account-name" aria-hidden="true">${esc(who)}</span>
              <span class="caret" aria-hidden="true">▾</span>
            </summary>
            <div class="account-pop">
              <div class="account-sec">
                <strong>${esc(name ?? "You")}</strong>
                ${copyable(webId, "WebID copied.", trimAddress(webId, webId))}
              </div>
              <div class="account-sec">
                <a class="menu-link" href="${routeHref({ name: "you" })}"><span>Your name, agent and inbox</span>${left}</a>
              </div>
              <div class="account-sec">
                <button id="logout" type="button" class="menu-link">Sign out</button>
              </div>
            </div>
          </details>
        </div>
      </header>
      <main class="screen-wide">${body}</main>
    </div>`;
}

export function bindShell(app: HTMLElement, onLogout: () => void): void {
  app.querySelector("#logout")?.addEventListener("click", onLogout);
  bindThemeButton(app);
  bindCopy(app.querySelector<HTMLElement>(".account-pop") ?? app);
  const menu = app.querySelector<HTMLDetailsElement>("#account-menu");
  if (!menu) return;
  // A menu, not a disclosure: Escape, a click elsewhere or following its link closes it.
  menu.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !menu.open) return;
    menu.open = false;
    menu.querySelector("summary")?.focus();
  });
  menu.querySelector(".menu-link[href]")?.addEventListener("click", () => (menu.open = false));
  const outside = (e: Event) => {
    if (!menu.isConnected) return document.removeEventListener("click", outside);
    if (menu.open && !menu.contains(e.target as Node)) menu.open = false;
  };
  document.addEventListener("click", outside);
}

function initial(text: string): string {
  const letter = text.replace(/^https?:\/\//, "").match(/[\p{L}\p{N}]/u);
  return letter ? letter[0].toUpperCase() : "?";
}
