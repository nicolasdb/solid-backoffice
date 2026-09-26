/**
 * The signed-in app: what the pods say about you, read once per screen, then
 * the tab the address bar names (src/router.ts) inside the shell
 * (src/shell.ts). Home is src/home.ts, a collective you belong to is
 * src/member.ts, the one you run is src/admin.ts.
 *
 * Roles are read from the pods, never stored (docs/explanation/membership.md).
 * Every screen reads its state from the pods each time it renders, so someone
 * who comes back tomorrow, or did a step by hand, sees where they really are.
 */
import { describePodError, exists, isAuthError } from "./lib/pod";
import { getAccess } from "./lib/acl";
import { setUpNewcomer } from "./lib/newcomer";
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
import { esc, renderError, renderPending, toast } from "./ui/patterns";
import { bindRun, loadRun, renderRunView, type RunView } from "./admin";
import { pendingInvite, setInvite, takeNewcomer } from "./invite";
import { bindHome, renderHomeView } from "./home";
import { bindMember, renderMemberView, loadRoster } from "./member";
import { currentRoute, onRouteChange, replaceWithHome, routeHref } from "./router";
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
  const profile = await readOwnProfile(webId);

  let run: Loaded["run"] = null;
  let runError: string | null = null;
  try {
    const own = await findRunCollective(podUrl);
    if (own) run = await loadRun(own, webId);
  } catch (err) {
    runError = describePodError(err);
  }

  // An invitation to the collective you run is not an invitation: a
  // collective never joins itself.
  let invite = pendingInvite();
  if (run && invite && (invite === run.collective.group || invite === run.collective.configUrl)) {
    setInvite(null);
    invite = null;
  }

  let unadvertisedInbox: string | null = null;
  if (!profile.inbox) {
    const candidate = new URL("inbox/", podUrl).href;
    if (await exists(candidate)) unadvertisedInbox = candidate;
  }

  const addresses = [...profile.memberOf, ...(invite ? [invite] : [])];
  const results = await Promise.allSettled(addresses.map((a) => loadCollective(a)));

  const collectives: CollectiveView[] = [];
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
    if (seen.has(collective.group) || collective.group === run?.collective.group) continue;
    seen.add(collective.group);

    const listed = await isListed(collective, webId);
    const folderUrl = new URL(collective.bundleFolder, podUrl).href;
    collectives.push({
      collective,
      state: membershipState(profile.memberOf.includes(collective.group), listed),
      folderUrl,
      published: await grantsRead(folderUrl, webId, collective.agent),
    });
  }
  return { run, runError, profile, unadvertisedInbox, collectives, broken, other };
}

/** Whether the folder's own ACL grants the agent Read. Missing folder: no. */
async function grantsRead(folderUrl: string, webId: string, agent: string): Promise<boolean> {
  try {
    const access = await getAccess(folderUrl, webId);
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

export async function renderMembership(
  app: HTMLElement,
  webId: string,
  podUrl: string,
  onLogout: () => void
): Promise<void> {
  const rerender = () => renderMembership(app, webId, podUrl, onLogout);
  const logout = () => {
    stopRouting?.();
    stopRouting = null;
    // The sign-in screen has no tabs; leave no route in the address.
    history.replaceState(null, "", location.pathname + location.search);
    onLogout();
  };
  stopRouting ??= onRouteChange(rerender);
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

  if (!app.querySelector(".app-shell")) {
    app.innerHTML = `<main class="screen stack">${renderPending("Reading your profile and your collectives…")}</main>`;
  }

  let data: Loaded;
  try {
    data = await load(webId, podUrl);
  } catch (err) {
    if (mine !== renderCount) return;
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
    const roster = await loadRoster(view.collective);
    if (mine !== renderCount) return;
    body = renderMemberView(view, memberIndex, roster, webId);
    bind = () => bindMember(app, view, memberIndex, ctx);
  } else if (route.name === "more") {
    body = renderMoreView(tabCollectives);
    bind = () => {};
  } else {
    // Home, or a tab that no longer exists (left, removed, typed by hand).
    if (route.name !== "home") {
      replaceWithHome();
      route = { name: "home" };
    }
    body = renderHomeView(data);
    bind = () => bindHome(app, data, ctx);
  }

  app.innerHTML = renderShell({ webId, name: data.profile.name, tabs: tabsFor(tabCollectives, route), body });
  bindShell(app, logout);
  bind();
  focusView(app);
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
