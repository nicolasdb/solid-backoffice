/**
 * The frame around every signed-in screen (layout A in docs/layout-brief.md):
 * the brand, the tabs and the account on top; on a phone the same tabs become
 * a bar at the bottom. One `<nav>`, restyled by CSS, so there is one list of
 * links for keyboards and screen readers whatever the width.
 *
 * Tabs: Home, then one per collective you run or belong to, then Places,
 * which is shown as coming (slice C) and is not a link. Past three
 * collectives, the rest go under "More", so the phone bar never holds more
 * than five items.
 */
import { APP_NAME } from "./config";
import { routeHref, type Route } from "./router";
import { esc } from "./ui/patterns";

export interface TabCollective {
  name: string;
  /** Its config.ttl: what the tab's route carries. */
  address: string;
  /** A small count next to the name, e.g. requests waiting. */
  badge?: number;
}

export interface Tab {
  label: string;
  icon: "home" | "collective" | "more" | "places";
  href: string | null;
  current: boolean;
  badge?: number;
  /** Shown, but not built yet. */
  soon?: boolean;
}

export const MAX_COLLECTIVE_TABS = 3;

export function tabsFor(collectives: TabCollective[], route: Route): Tab[] {
  const overflow = collectives.length > MAX_COLLECTIVE_TABS;
  const shown = overflow ? collectives.slice(0, MAX_COLLECTIVE_TABS - 1) : collectives;
  const onCollective = (c: TabCollective) => route.name === "collective" && route.address === c.address;

  const tabs: Tab[] = [
    { label: "Home", icon: "home", href: routeHref({ name: "home" }), current: route.name === "home" },
    ...shown.map((c): Tab => ({
      label: c.name,
      icon: "collective",
      href: routeHref({ name: "collective", address: c.address }),
      current: onCollective(c),
      badge: c.badge,
    })),
  ];
  if (overflow) {
    const hidden = collectives.slice(shown.length);
    tabs.push({
      label: "More",
      icon: "more",
      href: routeHref({ name: "more" }),
      current: route.name === "more" || hidden.some(onCollective),
      badge: hidden.reduce((n, c) => n + (c.badge ?? 0), 0) || undefined,
    });
  }
  tabs.push({ label: "Places", icon: "places", href: null, current: false, soon: true });
  return tabs;
}

const ICONS: Record<Tab["icon"], string> = {
  home: `<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>`,
  collective: `<circle cx="12" cy="12" r="8"/><circle cx="12" cy="9" r="1.5"/><circle cx="9" cy="14" r="1.5"/><circle cx="15" cy="14" r="1.5"/>`,
  more: `<circle cx="6" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/>`,
  places: `<path d="M3 7h7l2 2h9v10H3z"/>`,
};

function renderTab(tab: Tab): string {
  const icon = `<svg class="tab-icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[tab.icon]}</svg>`;
  const badge = tab.badge ? ` <span class="tab-badge">${tab.badge}<span class="visually-hidden"> waiting</span></span>` : "";
  if (!tab.href) {
    return `<span class="tab is-soon" aria-disabled="true">${icon}<span class="tab-label">${esc(tab.label)}</span> <span class="soon">soon</span></span>`;
  }
  return `<a class="tab${tab.current ? " is-current" : ""}" href="${tab.href}"${tab.current ? ' aria-current="page"' : ""}>${icon}<span class="tab-label">${esc(tab.label)}</span>${badge}</a>`;
}

export interface ShellOptions {
  webId: string;
  name: string | null;
  tabs: Tab[];
  /** The screen itself; it carries the `data-view-title` heading. */
  body: string;
}

export function renderShell({ webId, name, tabs, body }: ShellOptions): string {
  const who = name ?? webId;
  return `
    <div class="app-shell">
      <header class="app-top">
        <span class="brand"><span class="brand-mark" aria-hidden="true"></span>${esc(APP_NAME)}</span>
        <nav class="tabs" aria-label="Main">${tabs.map(renderTab).join("")}</nav>
        <div class="account">
          <span class="avatar" aria-hidden="true">${esc(initial(who))}</span>
          <span class="account-name" title="${esc(webId)}">${esc(who)}</span>
          <button id="logout" class="ghost small">Sign out</button>
        </div>
      </header>
      <main class="screen-wide">${body}</main>
    </div>`;
}

export function bindShell(app: HTMLElement, onLogout: () => void): void {
  app.querySelector("#logout")?.addEventListener("click", onLogout);
}

function initial(text: string): string {
  const letter = text.replace(/^https?:\/\//, "").match(/[\p{L}\p{N}]/u);
  return letter ? letter[0].toUpperCase() : "?";
}
