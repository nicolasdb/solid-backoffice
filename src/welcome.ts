/**
 * The landing (layout L3): the page before sign-in, around the forms of
 * src/signup.ts. Two sets of words, one page (docs/layout-brief.md, "Two
 * landings, one app"):
 *
 * - not invited: what the backoffice is, for someone who has never heard of
 *   a pod;
 * - invited: the same sections about the collective that sent the link, read
 *   from its public config.ttl before sign-in. Its own `schema:slogan` and
 *   `schema:description` replace the title and paragraph when it has them.
 *   When config.ttl cannot be read, the page keeps the backoffice's words and
 *   names the inviting host.
 *
 * The copy is the canvas's, approved as drawn (25 Sep 2026).
 */
import type { Collective } from "./lib/collective";
import { APP_NAME } from "./config";
import { esc } from "./ui/patterns";
import { renderThemeButton } from "./theme";

export interface Invitation {
  /** The host the invitation points to. */
  host: string;
  /** Its config.ttl, once read; null while reading or when it cannot be read. */
  collective: Collective | null;
}

interface Step {
  title: string;
  /** HTML: may hold a <code>. */
  text: string;
}

export interface LandingCopy {
  eyebrow: string;
  title: string;
  pull: string;
  /** HTML: may hold a <code>. */
  lead: string;
  whyTitle: string;
  why: [string, string, string];
  steps: Step[];
  thenLead: string;
  /** The middle circle's label in the diagram. */
  collectiveLabel: string;
}

/** "pod.example/your-name/", the shape of a pod address on this provider. */
function examplePod(provider: string | null): string {
  let host = "your-provider.example";
  if (provider) {
    try {
      host = new URL(provider).host;
    } catch {
      // Keep the placeholder.
    }
  }
  return `<code>${esc(host)}/your-name/</code>`;
}

export function landingCopy(invitation: Invitation | null, provider: string | null): LandingCopy {
  const pod = examplePod(provider);
  if (!invitation) {
    return {
      eyebrow: "A backoffice for your pod",
      title: "Your pod, and the collectives you belong to.",
      pull: "Who you are, who may read what, and who you work with.",
      lead: `A pod is an online space that belongs to you, at an address like ${pod}.
        This backoffice sets it up, joins it to collectives, and shows who can
        read what. Everything it writes goes on your own pod.`,
      whyTitle: "Work together, without a platform in the middle.",
      why: [
        "A collective usually lives on one company's servers: its members, its roster, its shared files. Leaving means leaving your work behind.",
        "Here, each member keeps their own pod.",
        "A collective keeps its list of members. Each member keeps their name, their inbox and their work, and decides what the collective may read. Both sides have to agree for someone to be a member.",
      ],
      steps: [
        { title: "Your pod", text: "An address of your own, with your name and an inbox." },
        {
          title: "Join a collective",
          text: "Open the invitation link its people send you: joining starts there. One message asks; the answer lands in your inbox.",
        },
        {
          title: "Share what you choose",
          text: "One folder per collective, read by its agent. Nothing else is shared, and stopping prevents new copies.",
        },
        {
          title: "Run your own",
          text: "A collective is a pod too. It answers the people who ask to join, and keeps its roster, here.",
        },
      ],
      thenLead: "A collective joins another collective the same way a person does: it asks, it is accepted, it shares a folder.",
      collectiveLabel: "A collective",
    };
  }

  const collective = invitation.collective;
  const name = collective ? esc(collective.name) : null;
  const inviter = name ?? `A collective at <code>${esc(invitation.host)}</code>`;
  return {
    eyebrow: "You're invited to join a collective",
    title: collective?.slogan ?? "Your work stays yours.",
    pull: "The collective reads only the folder you share with it.",
    lead: collective?.description
      ? esc(collective.description)
      : `${inviter} invited you. Joining starts with a pod: an online space that
        belongs to you, at an address like ${pod}. You keep your work there. The
        collective's agent reads the one folder you share, and you can close it
        whenever you want.`,
    whyTitle: "A collective, without a platform in the middle.",
    why: [
      "Members, a roster, shared work. Usually, all of it sits in one company's database, and leaving means leaving your work behind.",
      "Here, each member's pod stays theirs.",
      "The collective keeps its own list of members. You keep your name, your inbox and your work. Both sides have to agree for you to be a member.",
    ],
    steps: [
      {
        title: "Your pod",
        text: "An address of your own, with your name and an inbox. Set up for you when the account is made.",
      },
      { title: "Ask to join", text: "One message to the collective's inbox. The answer lands in yours." },
      {
        title: "Share one folder",
        text: collective
          ? `Everything you put in <code>${esc(collective.bundleFolder)}</code> is shared with the collective's agent. Nothing else is.`
          : "Everything you put in one folder is shared with the collective's agent. Nothing else is.",
      },
      { title: "Stop any time", text: "Stopping prevents new copies. It does not remove copies already made." },
    ],
    thenLead: "A collective joins another collective the same way you join this one: it asks, it is accepted, it shares a folder.",
    collectiveLabel: collective?.name ?? "The collective",
  };
}

/* ── The page ──────────────────────────────────────────────────────────── */

function initials(name: string): string {
  const words = name.match(/[\p{L}\p{N}]+/gu) ?? ["?"];
  return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase();
}

/** The card under the hero's paragraph: who invited you. */
function invitationCard(invitation: Invitation | null): string {
  if (!invitation?.collective) return "";
  const { collective, host } = invitation;
  return `
    <div class="invite-card">
      <span class="avatar" aria-hidden="true">${esc(initials(collective.name))}</span>
      <div>
        <strong>${esc(collective.name)}</strong>
        <span class="meta">The invitation comes from <code>${esc(host)}</code></span>
      </div>
    </div>`;
}

/** The hero's text column; replaced in place once the invitation is read. */
export function renderHeroText(copy: LandingCopy, invitation: Invitation | null): string {
  return `
    <p class="eyebrow">${esc(copy.eyebrow)}</p>
    <h1 class="display landing-title" data-view-title>${esc(copy.title)}</h1>
    <p class="pull">${esc(copy.pull)}</p>
    <p class="lead landing-lead">${copy.lead}</p>
    ${invitationCard(invitation)}`;
}

/**
 * Groups of groups, 3 to 5 members each (decided on the canvas): you, a
 * collective, and a network of four collectives. Colours come from tokens
 * through classes, so both themes draw it.
 */
function ladder(collectiveLabel: string): string {
  const dot = (cx: number, cy: number, r = 4.5, faint = false) =>
    `<circle class="ladder-dot${faint ? " is-faint" : ""}" cx="${cx}" cy="${cy}" r="${r}"/>`;
  const ring = (cx: number, cy: number, r: number, cls = "ladder-ring") =>
    `<circle class="${cls}" cx="${cx}" cy="${cy}" r="${r}"/>`;
  return `
    <svg class="ladder" viewBox="0 0 600 360" role="img"
         aria-label="A person inside a collective, and collectives inside a network">
      ${dot(80, 180, 10)}
      ${ring(250, 180, 70)}
      ${dot(250, 130, 8)}${dot(205, 200, 8)}${dot(295, 200, 8)}${dot(250, 225, 8, true)}
      ${ring(470, 180, 120, "ladder-ring is-network")}
      ${ring(425, 118, 34)}${dot(412, 104)}${dot(438, 106)}${dot(418, 132)}${dot(440, 129, 4.5, true)}
      ${ring(518, 156, 30)}${dot(506, 148)}${dot(530, 148)}${dot(518, 168)}
      ${ring(448, 248, 38)}${dot(448, 226)}${dot(428, 242)}${dot(468, 242)}${dot(436, 266)}${dot(462, 266, 4.5, true)}
      ${ring(530, 238, 24)}${dot(521, 229)}${dot(539, 229)}${dot(521, 247)}${dot(539, 247)}
      <path class="ladder-link" d="M92 180 H178"/>
      <path class="ladder-link" d="M322 180 H348"/>
      <text class="ladder-label" x="80" y="215">YOU</text>
      <text class="ladder-label" x="250" y="280">${esc(collectiveLabel.toUpperCase())}</text>
      <text class="ladder-label" x="470" y="330">A NETWORK</text>
    </svg>`;
}

/** Why, How it works, And then, the footer; replaced in place once the invitation is read. */
export function renderLandingRest(copy: LandingCopy): string {
  const [whyLead, whyPull, whyMore] = copy.why;
  return `
    <section class="landing-band landing-why">
      <div class="stack">
        <p class="eyebrow">Why</p>
        <h2 class="display landing-h2">${esc(copy.whyTitle)}</h2>
      </div>
      <div class="stack landing-why-text">
        <p class="lead">${esc(whyLead)}</p>
        <p class="pull">${esc(whyPull)}</p>
        <p class="lead">${esc(whyMore)}</p>
      </div>
    </section>

    <section class="landing-band" id="how" tabindex="-1" aria-labelledby="how-title">
      <p class="eyebrow" id="how-title">How it works</p>
      <ol class="how-steps">
        ${copy.steps
          .map(
            (step, i) => `
          <li>
            <span class="how-number">${String(i + 1).padStart(2, "0")}</span>
            <h3 class="display how-title">${esc(step.title)}</h3>
            <p class="lead">${step.text}</p>
          </li>`
          )
          .join("")}
      </ol>
    </section>

    <section class="landing-band landing-then">
      <div class="stack">
        <p class="eyebrow">And then</p>
        <h2 class="display landing-h2">A person, a collective, a network.</h2>
        <p class="lead">${esc(copy.thenLead)}</p>
        <p class="pull">Nobody, at any level, reads another member's pod.</p>
      </div>
      <div>${ladder(copy.collectiveLabel)}</div>
    </section>

    <footer class="landing-foot">
      <span class="meta">Nothing between you and your pod: this page runs in your browser.</span>
      <span class="meta">Built on Solid, an open web standard (W3C).</span>
    </footer>`;
}

export interface LandingOptions {
  copy: LandingCopy;
  invitation: Invitation | null;
  /** The form card: sign in, or create an account. */
  panel: string;
  /** The nav's second link, which switches the form; null when there is nothing to switch to. */
  switchLabel: string | null;
}

export function renderLanding({ copy, invitation, panel, switchLabel }: LandingOptions): string {
  return `
    <div class="landing">
      <nav class="landing-nav" aria-label="Welcome">
        <span class="brand"><span class="brand-mark" aria-hidden="true"></span>${esc(APP_NAME)}</span>
        <span class="landing-links">
          <button type="button" class="link-button" id="to-how">How it works</button>
          ${switchLabel ? `<button type="button" class="link-button" id="nav-switch">${esc(switchLabel)}</button>` : ""}
          ${renderThemeButton()}
        </span>
      </nav>
      <main>
        <section class="landing-hero">
          <div class="stack landing-hero-text" id="hero-text">${renderHeroText(copy, invitation)}</div>
          <div class="landing-panel">${panel}</div>
        </section>
        <div id="landing-rest">${renderLandingRest(copy)}</div>
      </main>
    </div>`;
}
