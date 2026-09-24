/**
 * The design system, rendered from itself.
 *
 * Every value shown here is read back out of the live CSS with
 * `getComputedStyle` — nothing is restated in this file. A styleguide that
 * hardcodes its own copy of the palette cannot catch drift, which is the one
 * job it has.
 *
 * The contrast figures are computed the same way `scripts/audit.mjs` computes
 * them, so what the audit asserts in CI is what you can check by eye here.
 */
import "./styles/core.css";
import "./styles/theme.css";
import "./styles/styleguide.css";

const root = document.querySelector<HTMLDivElement>("#styleguide")!;

/* ── reading the live tokens ──────────────────────────────────────────────── */

const readToken = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

interface Rgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parseColor(value: string): Rgb | null {
  const probe = document.createElement("div");
  probe.style.color = value;
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();

  const m = resolved.match(
    /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)/
  );
  if (!m) return null;
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
}

const over = (fg: Rgb, bg: Rgb): Rgb =>
  fg.a >= 1
    ? fg
    : {
        r: fg.r * fg.a + bg.r * (1 - fg.a),
        g: fg.g * fg.a + bg.g * (1 - fg.a),
        b: fg.b * fg.a + bg.b * (1 - fg.a),
        a: 1,
      };

function luminance({ r, g, b }: Rgb): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(fgValue: string, bgValue: string): number | null {
  const bg = parseColor(bgValue);
  const fg = parseColor(fgValue);
  if (!bg || !fg) return null;
  const [hi, lo] = [luminance(over(fg, bg)), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

/* ── content ──────────────────────────────────────────────────────────────── */

const SURFACE_SLOTS = ["--surface", "--surface-elevated", "--surface-recessed"];
const TEXT_SLOTS = ["--text-primary", "--text-secondary", "--text-tertiary"];
const LINE_SLOTS = ["--border", "--border-subtle", "--selection"];
const IDENTITY_SLOTS = [
  "--accent",
  "--accent-contrast",
  "--accent-soft",
  "--accent-line",
  "--warn",
  "--warn-soft",
  "--warn-line",
  "--danger",
  "--danger-soft",
  "--code-bg",
];

const TYPE_ROLES = [
  ["--text-display", "Display"],
  ["--text-h1", "Heading 1"],
  ["--text-h2", "Heading 2"],
  ["--text-h3", "Heading 3"],
  ["--text-h4", "Heading 4"],
  ["--text-body", "Body"],
  ["--text-small", "Small"],
  ["--text-meta", "Meta"],
  ["--text-micro", "Micro"],
];

const SPACE_STEPS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20];
const RADII = ["--radius-none", "--radius-sm", "--radius-md", "--radius-lg"];

/**
 * Three states, not two: an explicit choice stamps `data-theme`, and "system"
 * removes the stamp so `prefers-color-scheme` decides.
 *
 * Held here rather than read back off the DOM because "system" and "light"
 * both resolve to the same tokens on a light OS — only the stored choice can
 * tell them apart, and the switch has to show which one is actually selected.
 */
type ThemeChoice = "light" | "dark" | "system";

let currentTheme: ThemeChoice = "system";

/** Restores the stored choice. Run before the first render. */
function applyStoredTheme(): void {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem("solid-kit:styleguide-theme");
  } catch {
    // Storage unavailable: fall through to the system default.
  }
  currentTheme =
    stored === "light" || stored === "dark" || stored === "system" ? stored : "system";

  if (currentTheme === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", currentTheme);
}

function swatchRow(token: string, against?: string): string {
  const value = readToken(token);
  let badge = "";
  if (against) {
    const ratio = contrast(value, readToken(against));
    if (ratio !== null) {
      const pass = ratio >= 4.5;
      badge = `<span class="badge ${pass ? "pass" : "fail"}">${ratio.toFixed(
        2
      )}:1 ${pass ? "AA" : "below AA"}</span>`;
    }
  }
  return `
    <tr>
      <td><span class="chip" style="background:${value}"></span></td>
      <td><code>${token}</code></td>
      <td class="value">${value}</td>
      <td>${badge}</td>
    </tr>`;
}

function colorTable(title: string, tokens: string[], against?: string): string {
  return `
    <h3>${title}</h3>
    <div class="tablewrap">
      <table>
        <thead>
          <tr><th></th><th>Token</th><th>Resolved</th><th>${
            against ? `on <code>${against}</code>` : ""
          }</th></tr>
        </thead>
        <tbody>${tokens.map((t) => swatchRow(t, against)).join("")}</tbody>
      </table>
    </div>`;
}

function render(): void {
  root.innerHTML = `
    <div class="screen stack">
      <header class="sg-header">
        <div>
          <p class="label-mono">solid-kit</p>
          <h1>Design system</h1>
          <p class="lead">
            Read live from <code>core.css</code> and <code>theme.css</code>.
            Nothing on this page restates a value — if a token changes, this
            changes with it.
          </p>
        </div>
        <div class="sg-themes">
          <span class="label-mono">Theme</span>
          <div class="sg-switch" role="group" aria-label="Theme">
            ${(["light", "dark", "system"] as ThemeChoice[])
              .map(
                (choice) => `
              <button data-theme-set="${choice}" class="ghost"
                      aria-pressed="${choice === currentTheme}">
                ${choice[0].toUpperCase()}${choice.slice(1)}
              </button>`
              )
              .join("")}
          </div>
        </div>
      </header>

      <section>
        <h2>Color slots</h2>
        <p class="lead">
          Contrast is measured against the surface each token sits on. The floor
          is WCAG AA 4.5:1, checked in CI by <code>npm run audit</code>.
        </p>
        ${colorTable("Surfaces", SURFACE_SLOTS)}
        ${colorTable("Text on --surface", TEXT_SLOTS, "--surface")}
        ${colorTable("Text on --surface-elevated", TEXT_SLOTS, "--surface-elevated")}
        ${colorTable("Lines", LINE_SLOTS)}
        ${colorTable("Identity", IDENTITY_SLOTS)}
      </section>

      <section>
        <h2>Type scale</h2>
        <div class="stack">
          ${TYPE_ROLES.map(
            ([token, label]) => `
            <div class="sg-type-row">
              <code class="sg-type-token">${token}</code>
              <span class="sg-type-size">${readToken(token)}</span>
              <span style="font-size:var(${token})">${label} — Grid, pod, séance</span>
            </div>`
          ).join("")}
        </div>
        <h3>Font roles</h3>
        <p class="font-heading">--font-heading — headings and display</p>
        <p class="font-body">--font-body — running text</p>
        <p class="font-mono">--font-mono — metadata, labels, code</p>
        <h3>Measure</h3>
        <p>
          Body text is capped at <code>--measure-body</code>. This paragraph runs
          to that limit so the line length is visible rather than described: a
          pod is the storage, a WebID is the name, and the app is only the
          process in between — which is exactly as much as one line should try
          to carry before it wraps.
        </p>
      </section>

      <section>
        <h2>Spacing &amp; radii</h2>
        <div class="stack">
          ${SPACE_STEPS.map(
            (n) => `
            <div class="sg-space-row">
              <code>--space-${n}</code>
              <span class="sg-bar" style="width:var(--space-${n})"></span>
              <span class="meta">${readToken(`--space-${n}`)}</span>
            </div>`
          ).join("")}
        </div>
        <div class="sg-radii">
          ${RADII.map(
            (token) => `
            <div class="sg-radius">
              <div class="sg-radius-box" style="border-radius:var(${token})"></div>
              <code>${token}</code>
              <span class="meta">${readToken(token)}</span>
            </div>`
          ).join("")}
        </div>
      </section>

      <section>
        <h2>Components</h2>

        <h3>Buttons</h3>
        <div class="sg-inline">
          <button>Primary</button>
          <button class="ghost">Ghost</button>
          <button disabled>Disabled</button>
        </div>
        <p class="meta">
          Tab to a button to check the focus ring — one primary action per
          screen is the rule these are built for.
        </p>

        <h3>Form</h3>
        <form class="stack" onsubmit="return false">
          <div class="field">
            <label for="sg-input">Pod or WebID</label>
            <input id="sg-input" type="url" value="https://pod.nicolasdb.eu/" />
          </div>
          <div><button type="submit">Sign in</button></div>
        </form>

        <h3>Feedback</h3>
        <p class="error">
          Access refused (401) on https://pod.example/private/ — the session has
          expired, or this pod does not belong to your account.
        </p>
        <p class="meta">
          Errors say what happened and which resource refused. Never a bare
          status code, never the server's error graph.
        </p>

        <h3>Text utilities</h3>
        <div class="topbar">
          <span class="meta">solid-kit app</span>
          <button class="ghost">Sign out</button>
        </div>
        <p class="label-mono">label-mono — section labels</p>
        <p class="meta">meta — timestamps and quiet annotation</p>
        <p>Inline <code>code</code> inside running text.</p>
      </section>

      <footer class="sg-footer meta">
        <p><a href="/">← Back to the app</a> · <a href="/guidelines.html">UX guidelines</a></p>
        <p>
          Checked by <code>npm run audit</code>. Live login is verified by hand —
          see <code>docs/manual-tests.md</code>.
        </p>
      </footer>
    </div>
  `;
}

/**
 * Three states, not two: an explicit choice stamps `data-theme`, and "system"
 * removes the stamp so `prefers-color-scheme` decides. Exercising all three is
 * the only way to catch a token defined in one mode but not the other.
 *
 * Wired once, via delegation on `root`: `render()` replaces the buttons'
 * DOM nodes on every theme change, so listeners attached directly to them
 * would need re-wiring after each render — and re-wiring from inside
 * `render()` is what previously caused unbounded render→wire→apply→render
 * recursion the instant a button was clicked.
 */
function wireThemeSwitch(): void {
  const apply = (choice: ThemeChoice) => {
    currentTheme = choice;

    if (choice === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", choice);

    try {
      localStorage.setItem("solid-kit:styleguide-theme", choice);
    } catch {
      // Storage unavailable: the theme still applies for this page view.
    }

    // Contrast figures depend on the active theme, so recompute them. The
    // pressed state is NOT patched onto the buttons here — render() emits it
    // from `currentTheme`, so it survives the re-render instead of being
    // wiped by it.
    render();
  };

  root.addEventListener("click", (e) => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-theme-set]");
    if (!button) return;
    apply(button.dataset.themeSet as ThemeChoice);
  });
}

applyStoredTheme();
render();
wireThemeSwitch();
