/**
 * The UX guidelines, demonstrated rather than described.
 *
 * Every pattern below is rendered by the same function an app would call, and
 * the numbers quoted are read from `./ui/ux.ts`. So this page cannot claim
 * "at most four chunks" while the components allow five — the way a written
 * guideline drifts from the code it describes.
 *
 * That is the whole reason the page exists as code rather than as a document:
 * docs/ux-principles.md says what we believe and why; this says what the kit
 * actually does, and stays true by construction.
 */
import "./styles/core.css";
import "./styles/theme.css";
import "./styles/patterns.css";
import "./styles/guidelines.css";
import {
  MAX_CHOICES,
  MAX_CHUNKS_PER_STEP,
  PENDING_DELAY_MS,
  PENDING_PATIENCE_MS,
  UNDO_WINDOW_MS,
} from "./ui/ux";
import {
  esc,
  mountCheckpoint,
  renderCheckpoint,
  renderConceptCard,
  renderEmptyState,
  renderError,
  renderPending,
  mountPending,
  renderPhaseRail,
  toast,
  type Checkpoint,
} from "./ui/patterns";
import { announce, focusView } from "./ui/a11y";

const root = document.querySelector<HTMLDivElement>("#guidelines")!;

/* ── The worked example the whole page uses ───────────────────────────────── */

/**
 * One running example — explaining a pod to someone who has never heard of
 * one — rather than a different toy per section. It is the actual problem
 * these apps share, and copy is easier to judge in context than in isolation.
 */
const CONCEPT = {
  kicker: "Idea 2 of 3 · Who you are",
  title: "Your name on the web",
  chunks: [
    {
      icon: "🔑",
      title: "One name, everywhere",
      body: "A WebID is a web address that stands for you. Apps use it to know who is asking.",
    },
    {
      icon: "🏠",
      title: "Separate from your storage",
      body: "Your name and your pod can live in different places — which is what lets you move.",
    },
    {
      icon: "👀",
      title: "Nothing is public by default",
      body: "Holding your name does not give anyone access to what is inside your pod.",
    },
  ],
  aside: "https://pod.nicolasdb.eu/nicolas/profile/card#me",
};

const CHECKPOINT: Checkpoint = {
  question: "So what is a pod, in your own words?",
  options: [
    {
      label: "A website where my files are published",
      response:
        "Not quite — nothing in a pod is public until you share it. Publishing is a choice you make per folder.",
    },
    {
      label: "My own locker; I decide who else can look inside",
      correct: true,
      response:
        "That's it. The pod is yours, it starts closed, and sharing is something you switch on deliberately.",
    },
    {
      label: "An account with the app I'm using",
      response:
        "The other way round — the pod is yours and the app is a visitor. Change apps and your data stays.",
    },
  ],
};

/* ── Sections ─────────────────────────────────────────────────────────────── */

/**
 * `title` and `lead` are plain sentences and are escaped. `body` is markup —
 * `demo()` output, or a hand-written block — and is interpolated raw, which is
 * why it is the last parameter and named for what it is.
 */
function section(id: string, title: string, lead: string, body: string): string {
  return `
    <section id="${esc(id)}">
      <h2>${esc(title)}</h2>
      <p class="lead">${esc(lead)}</p>
      ${body}
    </section>`;
}

/**
 * A live demo beside the rule it embodies.
 *
 * `markup` and `note` are both raw — the first is a rendered component, and the
 * notes carry `<code>` and `<strong>` throughout. Only `label` is a plain
 * string, so only `label` is escaped.
 */
function demo(label: string, markup: string, note?: string): string {
  return `
    <div class="demo">
      <p class="label-mono">${esc(label)}</p>
      <div class="demo-stage">${markup}</div>
      ${note ? `<p class="meta">${note}</p>` : ""}
    </div>`;
}

function render(): void {
  root.innerHTML = `
    <div class="screen stack">
      <header>
        <p class="label-mono">solid-kit</p>
        <h1>UX guidelines</h1>
        <p class="lead">
          The patterns these apps are built from, running. Every example below is
          rendered by the same function an app calls, and every number is read
          from <code>src/ui/ux.ts</code> — so this page cannot drift from what
          the components actually enforce.
        </p>
        <p class="meta">
          Why these principles, and where they came from:
          <code>docs/ux-principles.md</code>.
        </p>
      </header>

      ${section(
        "setting",
        "How preferences get set",
        `Three tiers, weakest last. Put a preference in the strongest tier that
         can hold it.`,
        `
        <ol class="tiers">
          <li>
            <p class="tier-name">Constants — checked by machine</p>
            <p>Values in <code>src/ui/ux.ts</code> and <code>core.css</code>.
            <code>npm run audit</code> fails the build when they are broken.
            Currently: at most <strong>${MAX_CHUNKS_PER_STEP}</strong> chunks per
            step, at most <strong>${MAX_CHOICES}</strong> options per choice,
            <strong>${UNDO_WINDOW_MS / 1000}s</strong> to undo.</p>
          </li>
          <li>
            <p class="tier-name">Components — enforced by use</p>
            <p>A principle you import cannot be violated by accident.
            <code>renderConceptCard</code> throws at a fifth chunk rather than
            truncating: dropping authored copy silently would be worse than
            failing, and the failure lands while the copy can still be
            reconsidered.</p>
          </li>
          <li>
            <p class="tier-name">Checklist — judgment</p>
            <p>Copy tone, whether an action deserves a confirmation, whether a
            step is really one step. No machine decides those; they are reviewed
            per release in <code>docs/manual-tests.md</code>.</p>
          </li>
        </ol>
        <p class="meta">
          To change a preference: edit the constant, run <code>npm test</code>,
          and expect a failure if a component depended on the old value. Do not
          work around a constant inside a component — that is how the tiers stop
          meaning anything.
        </p>`
      )}

      ${section(
        "chunks",
        "At most four things at once",
        `Miller's law. A step carrying two or three ideas is learnable; one
         carrying nine is a wall people scroll past.`,
        demo(
          "renderConceptCard",
          renderConceptCard(CONCEPT),
          `Chunks are data, not markup — which is what keeps the copy editable by
           whoever writes it rather than buried in a template. The kicker
           numbers itself so a reader knows how much is left.`
        )
      )}

      ${section(
        "progress",
        "Progress in phases, not step counts",
        `Zeigarnik and goal-gradient: an unfinished thing stays on the mind, and
         people push harder when the end of the current segment is in sight.`,
        demo(
          "renderPhaseRail",
          renderPhaseRail(["Understand", "Set up", "Ready"], 1),
          `Ten steps shown as "4 of 10" reads as a wall. The same ten grouped
           into three phases reads as most of the way through the first. The
           current phase is marked by weight and by an assistive-tech label, not
           by colour alone.`
        )
      )}

      ${section(
        "checkpoint",
        "Check understanding, not scrolling",
        `A "Next" button measures whether someone scrolled. A question measures
         whether the explanation landed — the cheapest honest signal there is.`,
        demo(
          "renderCheckpoint",
          renderCheckpoint(CHECKPOINT),
          `Try a wrong answer. Getting it wrong is not a failure state: every
           option explains itself, and the reader moves on either way. A
           checkpoint that punishes is one people learn to game.`
        )
      )}

      ${section(
        "empty",
        "The empty state is the first screen",
        `A pod starts empty, so this is what a new person actually sees first —
         before any feature you built.`,
        demo(
          "renderEmptyState",
          renderEmptyState({
            title: "Nothing here yet",
            body: "This is where your séances will appear once you've run one. Nothing leaves your pod.",
            action: { label: "Start the first one", id: "demo-empty-action" },
          }),
          `Name what belongs here and offer the one action that creates it.
           "No data" tells someone they are in the wrong place.`
        )
      )}

      ${section(
        "errors",
        "The failure path is the trust path",
        `Error states decide long-term trust more than success states do. A
         success is forgotten the moment it works; a dead end is remembered —
         and on a pod app, failures are routine rather than exceptional.`,
        demo(
          "renderError",
          renderError({
            title: "Your session ended",
            detail:
              "Access refused (401) on https://pod.nicolasdb.eu/nicolas/seances/ — the session has expired, or this pod does not belong to your account.",
            recovery:
              "Nothing was lost. Signing in again brings this straight back — your work is in the pod, not in this tab.",
            action: { label: "Sign in again", id: "demo-error-action" },
            technical: '401 Unauthorized\nWWW-Authenticate: Bearer realm="solid"',
          }),
          `<code>renderError</code> <strong>throws</strong> when given neither an
           action nor a recovery line — an error that only announces the failure
           makes it the user's problem. The detail line here is
           <code>describePodError</code>'s own output: which resource refused and
           why, never a bare status code. The raw response stays behind a
           disclosure, because progressive disclosure applies to failures too.
           None of these failures are the user's mistake, and the copy never
           implies otherwise.`
        )
      )}

      ${section(
        "pending",
        "Say what you are waiting for, and for how long",
        `Most first loads in a pod app wait on a network nobody here owns. An
         anonymous spinner is undiagnosable when it hangs — and Doherty's
         threshold cuts the other way too: shown instantly, it is a flicker.`,
        `
        <div class="demo">
          <p class="label-mono">renderPending</p>
          <div class="demo-stage">${renderPending("Looking for your pod…")}</div>
          <p class="meta">
            <em>Looking</em>, not <em>finding</em> — it may not find it, and a
            status line that assumes success is the same dishonesty as an error
            with no way forward. The indicator travels rather than rotates: a
            rotation that has gone round eighty times looks exactly like one
            that is stuck.
          </p>
        </div>
        <div class="demo">
          <p class="label-mono">mountPending</p>
          <div class="demo-stage">
            <button id="demo-pending" class="ghost">Start a slow lookup</button>
            <div id="demo-pending-stage"></div>
          </div>
          <p class="meta">
            Nothing appears for the first
            <strong>${PENDING_DELAY_MS}ms</strong> — below that a spinner is a
            glitch, and most warm reads land there. After
            <strong>${PENDING_PATIENCE_MS / 1000}s</strong> the line stops
            repeating itself and admits the wait is long. Looping the same
            message forever tells a person nothing they cannot already see.
            <code>role="status"</code> throughout, so none of it steals focus.
          </p>
        </div>`
      )}

      ${section(
        "undo",
        "Reversible beats confirmed",
        `Reversibility is the principle that lets the others relax: someone who
         knows they can undo will explore, and an app whose actions are all
         reversible needs far fewer "are you sure?" dialogs.`,
        `
        <div class="demo">
          <p class="label-mono">toast</p>
          <div class="demo-stage">
            <button id="demo-toast">Delete something</button>
          </div>
          <p class="meta">
            ${UNDO_WINDOW_MS / 1000} seconds to undo — long enough to notice and
            decide, short enough that the action feels finished. One toast at a
            time: a stack of them is a second thing to manage exactly when
            attention is elsewhere.
          </p>
        </div>`
      )}

      ${section(
        "focus",
        "Moving focus when the screen changes",
        `These apps replace the screen wholesale, which destroys the focused
         element and silently drops a keyboard user at the top of the document
         with nothing announced.`,
        `
        <div class="demo">
          <p class="label-mono">focusView / announce</p>
          <div class="demo-stage">
            <button id="demo-focus" class="ghost">Move focus to this page's heading</button>
            <button id="demo-announce" class="ghost">Announce a message</button>
          </div>
          <p class="meta">
            The shell calls <code>focusView</code> after every render, because a
            rule each screen has to remember is a rule that gets forgotten. Use
            <code>announce</code> for state a sighted person reads off the screen
            — "Saved", "3 results" — not for anything they would need to read.
          </p>
        </div>`
      )}

      <footer class="sg-footer meta">
        <p><a href="/">← Back to the app</a> · <a href="/styleguide.html">Design system</a></p>
        <p>
          The principles behind these, and where each came from:
          <code>docs/ux-principles.md</code>.
        </p>
      </footer>
    </div>
  `;

  wire();
}

function wire(): void {
  const checkpointEl = root.querySelector<HTMLElement>(".checkpoint");
  if (checkpointEl) mountCheckpoint(checkpointEl, CHECKPOINT);

  root.querySelector("#demo-toast")?.addEventListener("click", () => {
    toast("Séance deleted.", { undo: () => toast("Restored.") });
  });

  root.querySelector("#demo-empty-action")?.addEventListener("click", () => {
    toast("This is where the app would take over.");
  });

  root.querySelector("#demo-error-action")?.addEventListener("click", () => {
    toast("This is where the app would send you back through sign-in.");
  });

  // Deliberately never resolves: the point of the demo is the two thresholds,
  // which are only visible if the wait outlasts both.
  root.querySelector("#demo-pending")?.addEventListener("click", () => {
    const stage = root.querySelector<HTMLElement>("#demo-pending-stage");
    if (!stage) return;
    mountPending(stage, "Looking for your pod\u2026", {
      patience: "Still looking \u2014 your provider may be slow to answer, or the address may be wrong.",
    });
  });

  root.querySelector("#demo-focus")?.addEventListener("click", () => {
    focusView(root);
  });

  root.querySelector("#demo-announce")?.addEventListener("click", () => {
    announce("Announced to assistive technology only.");
    toast("Announced — visible here so the demo is checkable by eye too.");
  });
}

render();
