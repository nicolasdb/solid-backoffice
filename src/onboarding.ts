/**
 * The signed-in app: what the pods say about you, read once per screen, then
 * the tab the address bar names (src/router.ts) inside the shell
 * (src/shell.ts): Pods (src/places.ts), Collectives (src/collectives.ts; a
 * collective you belong to opens as src/member.ts, the one you run as
 * src/admin.ts), and You under the avatar (src/you.ts).
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
import { bindCollectives, renderCollectivesView } from "./collectives";
import { bindYou, readSource, renderYouView, youTodo } from "./you";
import { bindMember, renderMemberView, loadRoster } from "./member";
import { currentRoute, isPlaces, onRouteChange, replaceRoute, routeHref, type Route } from "./router";
import { forgetPlaces, mountPlaces, placesFrame, showPlaces, type Group } from "./places";
import { readRoster } from "./lib/admin";
import { bindShell, renderShell, tabsFor } from "./shell";
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
  // collective never joins itself. One to a collective your profile already
  // declares has done its job: it no longer decides where sign-in lands.
  const invitedTo = (c: Collective) => invited === c.group || invited === c.configUrl;
  if (invited && ((run && invitedTo(run.collective)) || all.some((v) => invitedTo(v.collective) && declared(v.state)))) {
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
    const html = renderShell({ webId, name: data.profile.name, tabs: screen.tabs, todo: youTodo(data.profile), body: screen.body });
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

/**
 * Where `#/` lands: Collectives while an invitation waits (joining is the one
 * thing waiting on you), Pods otherwise. The address bar then says which.
 */
function landing(): Route {
  const route: Route = pendingInvite() ? { name: "collectives" } : { name: "places", path: "" };
  replaceRoute(route);
  return route;
}

/** "Collectives / HyperScope": the way back from one collective to the list. */
function crumbs(name: string): string {
  return `<nav class="crumbs" aria-label="Path"><a href="${routeHref({ name: "collectives" })}">Collectives</a> <span aria-hidden="true">/</span> <span aria-current="page">${esc(name)}</span></nav>`;
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

  let route = currentRoute();
  if (route.name === "home") route = landing();
  let body: string;
  let bind: () => void;
  const target = route.name === "collective" ? route.address : null;
  const memberIndex = target ? data.collectives.findIndex((c) => declared(c.state) && sameCollective(c.collective, target)) : -1;

  if (target && data.run && sameCollective(data.run.collective, target)) {
    const run = data.run;
    body = crumbs(run.collective.name) + renderRunView(run);
    bind = () => bindRun(app, run, rerender);
  } else if (memberIndex >= 0) {
    const view = data.collectives[memberIndex];
    const key = view.collective.configUrl;
    let roster = rosters.get(key);
    if (!roster) {
      roster = await loadRoster(view.collective);
      rosters.set(key, roster);
    }
    body = crumbs(view.collective.name) + renderMemberView(view, memberIndex, roster, webId);
    bind = () => bindMember(app, view, memberIndex, ctx);
  } else if (isPlaces(route)) {
    body = placesFrame();
    const names = agentNames(data);
    const placesRoute = route;
    bind = () =>
      void mountPlaces(app.querySelector<HTMLElement>("#places")!, placesRoute, {
        webId,
        podUrl,
        names,
        loadGroups: () => groupsOf(data, names),
      });
  } else if (route.name === "you") {
    body = renderYouView(data, webId, podUrl, await readSource(webId));
    bind = () => bindYou(app, data, ctx);
  } else {
    // Collectives, or a collective that is no longer yours (left, removed, typed by hand).
    if (route.name !== "collectives") {
      route = { name: "collectives" };
      replaceRoute(route);
    }
    body = renderCollectivesView(data);
    bind = () => bindCollectives(app, data, ctx);
  }
  return { tabs: tabsFor(route, data.run?.requests.length ?? 0), body, bind };
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

/**
 * The collectives whose members the permissions panel offers as chips, one
 * WebID each (ADR 006 §2). Someone is "left" when the roster keeps their
 * short name but no longer lists them (a removal), or, for the collective
 * you run, when their own profile no longer declares it. A roster you cannot
 * read gives no chips; nothing is guessed.
 */
async function groupsOf(data: Loaded, names: Map<string, string>): Promise<Group[]> {
  const collectives = [
    ...(data.run ? [data.run.collective] : []),
    ...data.collectives.filter((c) => c.state === "member").map((c) => c.collective),
  ];
  const read = await Promise.allSettled(collectives.map((c) => readRoster(c)));
  const groups: Group[] = [];
  read.forEach((result, i) => {
    if (result.status === "rejected") return;
    const collective = collectives[i];
    const { members, nicks } = result.value;
    const listed = new Set(members.map((m) => m.webId));
    const leftOwnSide = collective === data.run?.collective
      ? new Set(data.run.members.filter((m) => m.state === "left").map((m) => m.webId))
      : new Set<string>();
    const label = (webId: string) => names.get(webId) ?? nicks.get(webId) ?? webId;
    groups.push({
      name: collective.name,
      agent: collective.agent,
      members: members.filter((m) => !leftOwnSide.has(m.webId)).map((m) => ({ webId: m.webId, label: label(m.webId) })),
      left: [
        ...[...nicks.keys()].filter((w) => !listed.has(w)),
        ...leftOwnSide,
      ].map((webId) => ({ webId, label: label(webId) })),
    });
  });
  return groups;
}

/** A collective is named by its config.ttl or by its group IRI (`…/config.ttl#name`). */
function sameCollective(collective: Collective, address: string): boolean {
  return address === collective.configUrl || address === collective.group;
}
