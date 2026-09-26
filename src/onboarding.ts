/**
 * The signed-in app: what the pods say about you, read once per screen, then
 * the tab the address bar names (src/router.ts) inside the shell
 * (src/shell.ts). Home is src/home.ts, a collective you belong to is
 * src/member.ts, the one you run is src/admin.ts.
 *
 * Roles are read from the pods, never stored (docs/explanation/membership.md).
 * Every screen reads its state from the pods each time it renders, so someone
 * who comes back tomorrow, or did a step by hand, sees where they really are.
 * A tab switch draws from the last load first and reads behind it (L5).
 */
import { describePodError, exists, isAuthError } from "./lib/pod";
import { readAccess } from "./lib/acl";
import { setUpNewcomer } from "./lib/newcomer";
import { forgetReads } from "./lib/read";
import {
  findRunCollective,
  isListed,
  loadCollective,
  membershipState,
  readOwnProfile,
  type Collective,
  type CollectiveLoadError,
  type MemberDeclaration,
  type MembershipState,
} from "./lib/collective";
import { focusView } from "./ui/a11y";
import { busy } from "./ui/typing";
import { esc, renderError, renderPending, toast } from "./ui/patterns";
import { bindRun, loadRun, renderRunView, type RunView } from "./admin";
import { pendingInvite, setInvite, takeNewcomer } from "./invite";
import { bindHome, renderHomeView } from "./home";
import { bindMember, renderMemberView, loadRoster } from "./member";
import { currentRoute, isPlaces, onRouteChange, replaceWithHome, routeHref } from "./router";
import { forgetPlaces, mountPlaces, placesFrame, showPlaces } from "./places";
import { bindShell, renderShell, tabsFor, type TabCollective } from "./shell";
import { declared } from "./steps";

/** What every view's buttons need: who is signed in, and how to redraw. */
export interface ViewContext {
  webId: string;
  podUrl: string;
  profile: MemberDeclaration;
  rerender: () => void;
}

export interface CollectiveView {
  collective: Collective;
  state: MembershipState;
  folderUrl: string;
  published: boolean;
}

export interface Loaded {
  /** The collective this account runs: a config.ttl at its own pod root. */
  run: RunView | null;
  /** This account's config.ttl exists but cannot be used. */
  runError: string | null;
  profile: MemberDeclaration;
  /** `<pod>/inbox/` exists but the profile does not advertise it. */
  unadvertisedInbox: string | null;
  collectives: CollectiveView[];
  /** Addresses that could not be loaded, with why — shown, never hidden. */
  broken: { address: string; status?: number; reason: string }[];
  /** `org:memberOf` values that are not collectives this app manages. */
  other: string[];
}

/* ── Loading ───────────────────────────────────────────────────────────── */

/**
 * Which collectives to show comes from the person, never from the app: the
 * ones their profile says they belong to, plus the one they were invited to
 * or typed in. Nothing is assumed.
 */
export async function load(webId: string, podUrl: string): Promise<Loaded> {
  // Every read that does not need another one's answer starts at once: on a
  // real network each round of waiting costs a round trip (L5, slices.md).
  const runLoad: Promise<{ run: Loaded["run"]; runError: string | null }> = findRunCollective(podUrl)
    .then(async (own) => ({ run: own ? await loadRun(own, webId) : null, runError: null }))
    .catch((err) => ({ run: null, runError: describePodError(err) }));
  const invited = pendingInvite();

  let profile: MemberDeclaration;
  try {
    profile = await readOwnProfile(webId);
  } catch (err) {
    await runLoad; // never left running behind an error screen
    throw err;
  }

  const inboxCheck = profile.inbox ? Promise.resolve(null) : unadvertised(podUrl);
  const addresses = [...profile.memberOf, ...(invited ? [invited] : [])];
  const results = await Promise.allSettled(addresses.map((a) => loadCollective(a)));

  const found: Collective[] = [];
  const broken: Loaded["broken"] = [];
  const other: string[] = [];
  const seen = new Set<string>();

  for (const [i, result] of results.entries()) {
    const address = addresses[i];
    const fromProfile = i < profile.memberOf.length;
    if (result.status === "rejected") {
      const status = (result.reason as CollectiveLoadError).status;
      // A profile can say it belongs to organisations that are not collectives
      // of this kind at all. That is not an error — just not ours to manage.
      if (fromProfile && status === undefined) other.push(address);
      else broken.push({ address, status, reason: describePodError(result.reason) });
      continue;
    }
    const collective = result.value;
    if (seen.has(collective.group)) continue;
    seen.add(collective.group);
    found.push(collective);
  }

  const views = Promise.all(
    found.map(async (collective): Promise<CollectiveView> => {
      const folderUrl = new URL(collective.bundleFolder, podUrl).href;
      const [listed, published] = await Promise.all([
        isListed(collective, webId),
        grantsRead(folderUrl, webId, collective.agent),
      ]);
      return {
        collective,
        state: membershipState(profile.memberOf.includes(collective.group), listed),
        folderUrl,
        published,
      };
    })
  );
  const [{ run, runError }, unadvertisedInbox, all] = await Promise.all([runLoad, inboxCheck, views]);

  // An invitation to the collective you run is not an invitation: a
  // collective never joins itself.
  if (run && invited && (invited === run.collective.group || invited === run.collective.configUrl)) {
    setInvite(null);
  }
  const collectives = all.filter((c) => c.collective.group !== run?.collective.group);
  return { run, runError, profile, unadvertisedInbox, collectives, broken, other };
}

/** `<pod>/inbox/` when it exists although the profile does not advertise it. */
async function unadvertised(podUrl: string): Promise<string | null> {
  const candidate = new URL("inbox/", podUrl).href;
  return (await exists(candidate)) ? candidate : null;
}

/** Whether the folder's own ACL grants the agent Read. Missing folder: no. */
async function grantsRead(folderUrl: string, webId: string, agent: string): Promise<boolean> {
  try {
    const access = await readAccess(folderUrl, webId);
    return access.agents.some((a) => a.webId === agent && a.modes.includes("read"));
  } catch (err) {
    if ((err as { status?: number }).status === 404) return false;
    throw err;
  }
}

/* ── Screens ───────────────────────────────────────────────────────────── */

/** Stops following the address bar: set while signed in, cleared at sign-out. */
let stopRouting: (() => void) | null = null;
/** A newer render (another tab clicked meanwhile) wins over an older one. */
let renderCount = 0;

/**
 * The last load, in memory only (never browser storage), so switching tabs
 * draws at once while the pods are read again behind it (L5). Rosters are
 * kept per collective for the same reason. Cleared at sign-out.
 */
let last: { webId: string; data: Loaded; rosters: Map<string, Roster> } | null = null;
type Roster = Awaited<ReturnType<typeof loadRoster>>;
/** What is on screen, to tell whether a quiet redraw would change anything. */
let drawn = "";

/**
 * `fromMemory` is set only when the address bar changes: the tab is drawn
 * from the last load, then redrawn if the pods say something else. Every
 * other render (first visit, after a write, "Try again") reads the pods
 * first, so what a button just did is always what the screen shows.
 */
export async function renderMembership(
  app: HTMLElement,
  webId: string,
  podUrl: string,
  onLogout: () => void,
  fromMemory = false
): Promise<void> {
  const rerender = () => renderMembership(app, webId, podUrl, onLogout);
  const logout = () => {
    stopRouting?.();
    stopRouting = null;
    last = null;
    forgetReads();
    forgetPlaces();
    // The sign-in screen has no tabs; leave no route in the address.
    history.replaceState(null, "", location.pathname + location.search);
    onLogout();
  };
  stopRouting ??= onRouteChange(() => renderMembership(app, webId, podUrl, onLogout, true));
  const mine = ++renderCount;

  const newcomer = takeNewcomer(webId);
  if (newcomer) {
    app.innerHTML = `<main class="screen stack">${renderPending("Setting up your name and your inbox…")}</main>`;
    try {
      await setUpNewcomer(webId, podUrl, newcomer.name);
    } catch (err) {
      // The steps below read the pods, so whatever was not done shows as to do.
      toast(`Your account is ready, but setting it up stopped: ${describePodError(err)} The steps below finish it.`);
    }
  }

  const draw = async (data: Loaded, rosters: Map<string, Roster>, quiet: boolean): Promise<void> => {
    const screen = await compose(app, data, rosters, webId, podUrl, rerender);
    if (mine !== renderCount) return;
    const html = renderShell({ webId, name: data.profile.name, tabs: screen.tabs, body: screen.body });
    if (quiet && (html === drawn || busy(app))) return;
    const focused = quiet ? document.activeElement?.id : undefined;
    app.innerHTML = html;
    drawn = html;
    bindShell(app, logout);
    screen.bind();
    if (!quiet) focusView(app);
    else if (focused) document.getElementById(focused)?.focus();
  };

  const kept = fromMemory && !newcomer && last?.webId === webId ? last : null;
  // Inside Places, a move between folders redraws Places only: the tabs and
  // the collectives stay as they are, and nothing about them is read again.
  if (kept && isPlaces(currentRoute()) && app.querySelector("#places")) {
    await showPlaces(currentRoute());
    return;
  }
  if (kept) {
    await draw(kept.data, kept.rosters, false);
    // Behind the drawn tab: read the pods again, redraw only on a change.
    try {
      const data = await load(webId, podUrl);
      if (mine !== renderCount) return;
      last = { webId, data, rosters: new Map() };
      await draw(data, last.rosters, true);
    } catch {
      /* the tab from memory stays; the next write or visit reads again */
    }
    return;
  }

  if (!app.querySelector(".app-shell")) {
    app.innerHTML = `<main class="screen stack">${renderPending("Reading your profile and your collectives…")}</main>`;
  }

  let data: Loaded;
  try {
    data = await load(webId, podUrl);
  } catch (err) {
    if (mine !== renderCount) return;
    last = null;
    app.innerHTML = `<main class="screen stack">${renderError({
      title: isAuthError(err) ? "Your session ended" : "Could not read your profile",
      detail: describePodError(err),
      action: { label: "Try again", id: "retry" },
      technical: err instanceof Error ? err.message : String(err),
    })}</main>`;
    app.querySelector("#retry")!.addEventListener("click", rerender);
    focusView(app);
    return;
  }
  if (mine !== renderCount) return;
  last = { webId, data, rosters: new Map() };
  await draw(data, last.rosters, false);
}

/** The tab the address bar names, as HTML plus what binds its buttons. */
async function compose(
  app: HTMLElement,
  data: Loaded,
  rosters: Map<string, Roster>,
  webId: string,
  podUrl: string,
  rerender: () => void
): Promise<{ tabs: ReturnType<typeof tabsFor>; body: string; bind: () => void }> {
  const ctx: ViewContext = { webId, podUrl, profile: data.profile, rerender };
  const tabCollectives: TabCollective[] = [
    ...(data.run ? [{ name: data.run.collective.name, address: data.run.collective.configUrl, badge: data.run.requests.length || undefined }] : []),
    ...data.collectives.filter((c) => declared(c.state)).map((c) => ({ name: c.collective.name, address: c.collective.configUrl })),
  ];

  let route = currentRoute();
  let body: string;
  let bind: () => void;
  const target = route.name === "collective" ? route.address : null;
  const memberIndex = target ? data.collectives.findIndex((c) => declared(c.state) && sameCollective(c.collective, target)) : -1;

  if (target && data.run && sameCollective(data.run.collective, target)) {
    const run = data.run;
    body = renderRunView(run);
    bind = () => bindRun(app, run, rerender);
  } else if (memberIndex >= 0) {
    const view = data.collectives[memberIndex];
    const key = view.collective.configUrl;
    let roster = rosters.get(key);
    if (!roster) {
      roster = await loadRoster(view.collective);
      rosters.set(key, roster);
    }
    body = renderMemberView(view, memberIndex, roster, webId);
    bind = () => bindMember(app, view, memberIndex, ctx);
  } else if (isPlaces(route)) {
    body = placesFrame();
    const names = agentNames(data);
    const placesRoute = route;
    bind = () => mountPlaces(app.querySelector<HTMLElement>("#places")!, placesRoute, { webId, podUrl, names });
  } else if (route.name === "more") {
    body = renderMoreView(tabCollectives);
    bind = () => {};
  } else {
    // Home, or a tab that no longer exists (left, removed, typed by hand).
    if (route.name !== "home") {
      replaceWithHome();
      route = { name: "home" };
    }
    body = renderHomeView(data, webId);
    bind = () => bindHome(app, data, ctx);
  }
  return { tabs: tabsFor(tabCollectives, route), body, bind };
}

/** WebIDs the app can put a name on, for "who can read it". */
function agentNames(data: Loaded): Map<string, string> {
  const names = new Map<string, string>();
  for (const c of [...(data.run ? [data.run.collective] : []), ...data.collectives.map((v) => v.collective)]) {
    names.set(c.agent, `${c.name}'s agent`);
  }
  for (const m of data.run?.members ?? []) {
    if (m.profile?.name) names.set(m.webId, m.profile.name);
  }
  return names;
}

/** A collective is named by its config.ttl or by its group IRI (`…/config.ttl#name`). */
function sameCollective(collective: Collective, address: string): boolean {
  return address === collective.configUrl || address === collective.group;
}

/** The collectives past the tab bar's room. */
function renderMoreView(collectives: TabCollective[]): string {
  return `
    <h1 data-view-title>Your collectives</h1>
    <ul class="plain-list more-list">
      ${collectives
        .map((c) => `<li><a href="${routeHref({ name: "collective", address: c.address })}">${esc(c.name)}</a></li>`)
        .join("")}
    </ul>`;
}
