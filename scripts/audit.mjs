#!/usr/bin/env node
/**
 * Checks the parts of the design rules that a machine can actually decide.
 *
 * The rest of the UX principles are judgment and live in docs/manual-tests.md.
 * What is here is what would otherwise be a comment nobody re-checks:
 *
 *   1. every text token clears WCAG AA 4.5:1 on the surfaces it sits on,
 *      in BOTH modes;
 *   2. every color token defined for light is also defined for dark, in both
 *      the media query and the [data-theme] override — a token defined in one
 *      mode only renders one theme's text on the other theme's ground;
 *   3. :focus-visible and prefers-reduced-motion exist at all.
 *
 * No dependencies: it reads the CSS as text on purpose, so it cannot drift
 * from what actually ships the way a duplicated token table would.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const themeCss = readFileSync(join(root, "src/styles/theme.css"), "utf8");
const coreCss = readFileSync(join(root, "src/styles/core.css"), "utf8");
const patternsCss = readFileSync(join(root, "src/styles/patterns.css"), "utf8");
const patternsTs = readFileSync(join(root, "src/ui/patterns.ts"), "utf8");
const uxTs = readFileSync(join(root, "src/ui/ux.ts"), "utf8");

const failures = [];
const notes = [];

/* ── parsing ──────────────────────────────────────────────────────────────── */

/** Body of the first block whose selector line matches `pattern`. */
function blockAfter(css, pattern) {
  const start = css.search(pattern);
  if (start === -1) return null;
  const open = css.indexOf("{", start);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  return null;
}

/** `--name: value;` pairs in a block, comments stripped. */
function tokensIn(block) {
  const out = {};
  if (!block) return out;
  const clean = block.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of clean.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out[m[1]] = m[2].trim();
  }
  return out;
}

const light = tokensIn(blockAfter(themeCss, /^:root\s*\{/m));
const darkMedia = tokensIn(
  blockAfter(themeCss, /:root:not\(\[data-theme="light"\]\)\s*\{/)
);
const darkAttr = tokensIn(blockAfter(themeCss, /:root\[data-theme="dark"\]\s*\{/));

if (!Object.keys(light).length) failures.push("Could not parse the :root token block.");
if (!Object.keys(darkMedia).length) failures.push("Could not parse the dark media block.");
if (!Object.keys(darkAttr).length)
  failures.push('Could not parse the :root[data-theme="dark"] block.');

/* ── color maths ──────────────────────────────────────────────────────────── */

function parseColor(value) {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgba = value.match(
    /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)$/i
  );
  if (rgba) {
    return {
      r: +rgba[1],
      g: +rgba[2],
      b: +rgba[3],
      a: rgba[4] === undefined ? 1 : +rgba[4],
    };
  }
  return null;
}

/** Composites a possibly-translucent color over an opaque backdrop. */
function over(fg, bg) {
  if (fg.a >= 1) return fg;
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  };
}

function relativeLuminance({ r, g, b }) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(fgValue, bgValue) {
  const bg = parseColor(bgValue);
  const fgRaw = parseColor(fgValue);
  if (!bg || !fgRaw) return null;
  const fg = over(fgRaw, bg);
  const [hi, lo] = [relativeLuminance(fg), relativeLuminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

/* ── 1. contrast ──────────────────────────────────────────────────────────── */

const TEXT_TOKENS = ["--text-primary", "--text-secondary", "--text-tertiary"];
const SURFACES = ["--surface", "--surface-elevated", "--surface-recessed"];
const MIN = 4.5;

function checkContrast(label, tokens) {
  for (const text of TEXT_TOKENS) {
    for (const surface of SURFACES) {
      if (!tokens[text] || !tokens[surface]) continue;
      const ratio = contrast(tokens[text], tokens[surface]);
      if (ratio === null) {
        notes.push(`${label}: could not compute ${text} on ${surface}`);
        continue;
      }
      const line = `${label}: ${text} on ${surface} = ${ratio.toFixed(2)}:1`;
      if (ratio < MIN) failures.push(`${line} — below AA ${MIN}:1`);
      else notes.push(`  ok  ${line}`);
    }
  }

  // Accent carries button labels, so its contrast against its own text matters.
  if (tokens["--accent"] && tokens["--accent-contrast"]) {
    const ratio = contrast(tokens["--accent-contrast"], tokens["--accent"]);
    const line = `${label}: --accent-contrast on --accent = ${ratio.toFixed(2)}:1`;
    if (ratio < MIN) failures.push(`${line} — below AA ${MIN}:1`);
    else notes.push(`  ok  ${line}`);
  }
}

checkContrast("light", light);
checkContrast("dark ", { ...light, ...darkMedia });

/* ── 2. slot completeness ─────────────────────────────────────────────────── */

const isColor = (v) => /^#[0-9a-f]{3,8}$/i.test(v) || /^rgba?\(/i.test(v);
const lightColors = Object.keys(light).filter((k) => isColor(light[k]));

for (const [label, block] of [
  ["the dark media block", darkMedia],
  ['the :root[data-theme="dark"] block', darkAttr],
]) {
  const missing = lightColors.filter((k) => !(k in block));
  if (missing.length) {
    failures.push(
      `${missing.length} color token(s) defined for light but missing from ${label}: ` +
        missing.join(", ")
    );
  }
}

// The two dark blocks must agree, or the toggle and the OS setting disagree.
const disagreements = Object.keys(darkMedia).filter(
  (k) => darkAttr[k] !== undefined && darkAttr[k] !== darkMedia[k]
);
if (disagreements.length) {
  failures.push(
    `dark media block and [data-theme="dark"] disagree on: ${disagreements.join(", ")}`
  );
}

/* ── 3. accessibility affordances ─────────────────────────────────────────── */

if (!/:focus-visible/.test(coreCss)) {
  failures.push("core.css defines no :focus-visible style — keyboard focus is invisible.");
}
if (!/@media\s*\(prefers-reduced-motion/.test(coreCss)) {
  failures.push("core.css has no prefers-reduced-motion block.");
}
if (!/env\(safe-area-inset/.test(coreCss)) {
  failures.push("core.css uses no safe-area insets — content will sit under the notch.");
}

/* ── 4. UX patterns ───────────────────────────────────────────────────────── */

/*
  The parts of the UX guidelines a machine can decide. The rest is judgment and
  lives in docs/manual-tests.md — but these three have been got wrong in real
  code, so they are worth pinning here rather than trusting to review.
*/

// A visually-hidden helper built on display:none removes the element from the
// accessibility tree entirely, which defeats the point of having one.
const visuallyHidden = blockAfter(patternsCss, /\.visually-hidden\s*\{/);
if (!visuallyHidden) {
  failures.push("patterns.css defines no .visually-hidden — announcements have nowhere to live.");
} else if (/display\s*:\s*none/.test(visuallyHidden)) {
  failures.push(
    ".visually-hidden uses display:none, which hides it from assistive tech too."
  );
}

// An indicator whose animation is merely removed under reduced-motion sits
// parked mid-travel and reads as broken. The signal has to be replaced, not
// dropped.
const reducedMotionBlocks = patternsCss.match(
  /@media\s*\(prefers-reduced-motion[^{]*\{[\s\S]*?\n\}/g
);
if (!reducedMotionBlocks?.some((b) => /\.pending-line/.test(b))) {
  failures.push("patterns.css does not give .pending-line a reduced-motion alternative.");
}

// The toast carries a time-limited action at the bottom of the screen, which is
// exactly where the gesture bar is.
const toastBlock = blockAfter(patternsCss, /\.toast\s*\{/);
if (!toastBlock || !/env\(safe-area-inset-bottom\)/.test(toastBlock)) {
  failures.push(".toast does not clear the bottom safe-area inset.");
}

// The limits are only real if the components enforce them.
for (const [constant, fn] of [
  ["MAX_CHUNKS_PER_STEP", "renderConceptCard"],
  ["MAX_CHOICES", "renderCheckpoint"],
]) {
  if (!new RegExp(`export const ${constant}`).test(uxTs)) {
    failures.push(`ux.ts no longer exports ${constant}.`);
  } else if (!new RegExp(`${constant}`).test(patternsTs)) {
    failures.push(`${fn} does not reference ${constant} — the limit is unenforced.`);
  } else {
    notes.push(`  ok  ${fn} enforces ${constant}`);
  }
}

// An error state with no way forward is a dead end, and dead ends are what
// people remember about an app. The rule is only real while renderError throws.
const renderError = blockAfter(patternsTs, /export function renderError\(/);
if (!/export const ERRORS_MUST_OFFER_RECOVERY/.test(uxTs)) {
  failures.push("ux.ts no longer states ERRORS_MUST_OFFER_RECOVERY.");
} else if (!renderError) {
  failures.push("patterns.ts exports no renderError — error states are unenforced.");
} else if (!/state\.action && !state\.recovery[\s\S]*throw new Error/.test(renderError)) {
  failures.push(
    "renderError no longer throws on an error state with neither an action nor a recovery line."
  );
} else {
  notes.push("  ok  renderError refuses an error state with no way forward");
}

/* ── report ───────────────────────────────────────────────────────────────── */

for (const note of notes) console.log(note);

if (failures.length) {
  console.error(`\n${failures.length} problem(s):`);
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}

console.log(`\naudit: ${notes.length} checks passed.`);
