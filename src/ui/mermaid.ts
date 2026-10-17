/**
 * ```` ```mermaid ```` blocks in a Markdown preview, drawn as diagrams.
 *
 * `renderMarkdown` leaves them as `<pre><code class="language-mermaid">`;
 * `drawDiagrams` replaces each one once the HTML is on the page. Mermaid is
 * large, so it is loaded only when a page holds a diagram.
 *
 * A pod's file is anyone's text: Mermaid runs in `strict` mode (labels
 * encoded, no clicks, a diagram cannot raise that through `%%{init}%%`),
 * labels are SVG text rather than HTML, and the SVG still goes through
 * DOMPurify before it reaches the page.
 *
 * Diagrams are drawn on a light card in both themes: an author's `classDef`
 * colours are chosen against a light ground, and dark text on them stays
 * readable. A diagram that does not parse is shown as its source, with the
 * reason above it. Drawn SVG is kept by source, so a redraw of the page does
 * not draw it again.
 *
 * A diagram is shown at its own size and scrolls sideways; "Fit width"
 * scales it to the page, "Full screen" gives it the whole screen.
 */
import DOMPurify from "dompurify";

type Mermaid = typeof import("mermaid").default;

const drawn = new Map<string, string>();
const fitted = new Set<string>(); // sources shown at the card's width, kept across redraws
let loading: Promise<Mermaid> | null = null;
let counter = 0;

function load(): Promise<Mermaid> {
  loading ??= import("mermaid").then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "default",
      htmlLabels: false,
      suppressErrorRendering: true, // throw, rather than draw Mermaid's own error picture
      flowchart: { useMaxWidth: false },
    });
    return mermaid;
  });
  return loading;
}

/** The SVG for one diagram's source, safe to put on the page. */
export async function diagramSvg(source: string, mermaid: Pick<Mermaid, "render"> | null = null): Promise<string> {
  const kept = drawn.get(source);
  if (kept) return kept;
  const { svg } = await (mermaid ?? (await load())).render(`diagram-${++counter}`, source);
  const safe = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true }, ADD_TAGS: ["style"] });
  if (drawn.size >= 50) drawn.delete(drawn.keys().next().value!); // typing in the editor draws every step
  drawn.set(source, safe);
  return safe;
}

/** Replace each Mermaid block under `root` with its diagram. */
export async function drawDiagrams(root: ParentNode): Promise<void> {
  const blocks = [...root.querySelectorAll<HTMLElement>("pre > code.language-mermaid")];
  for (const code of blocks) {
    const pre = code.parentElement!;
    const source = (code.textContent ?? "").trim();
    let svg: string;
    try {
      svg = await diagramSvg(source);
    } catch (err) {
      if (!pre.isConnected || pre.previousElementSibling?.classList.contains("diagram-error")) continue;
      const note = document.createElement("p");
      note.className = "meta is-warn diagram-error";
      note.textContent = `This diagram could not be drawn: ${firstLine(err)}`;
      pre.before(note);
      continue;
    }
    if (!pre.isConnected) continue; // the page was redrawn meanwhile
    pre.replaceWith(diagramFigure(source, svg));
  }
}

/** The diagram with its two buttons: fit to the width, and full screen. */
function diagramFigure(source: string, svg: string): HTMLElement {
  const figure = document.createElement("figure");
  figure.className = "diagram";
  figure.classList.toggle("is-fit", fitted.has(source));
  figure.innerHTML = `
    <div class="diagram-bar">
      <button type="button" class="ghost small" data-diagram="fit" aria-pressed="${fitted.has(source)}">Fit width</button>
      <button type="button" class="ghost small" data-diagram="full">Full screen</button>
    </div>
    <div class="diagram-canvas">${svg}</div>`;
  const fit = figure.querySelector<HTMLButtonElement>('[data-diagram="fit"]')!;
  const full = figure.querySelector<HTMLButtonElement>('[data-diagram="full"]')!;
  fit.addEventListener("click", () => {
    if (fitted.has(source)) fitted.delete(source);
    else fitted.add(source);
    figure.classList.toggle("is-fit", fitted.has(source));
    fit.setAttribute("aria-pressed", String(fitted.has(source)));
  });
  const shown = () => document.fullscreenElement === figure || figure.classList.contains("is-full");
  const label = () => (full.textContent = shown() ? "Exit full screen" : "Full screen");
  const escape = (event: KeyboardEvent) => {
    if (event.key === "Escape") leave();
  };
  // The Fullscreen API where there is one; a fixed layer over the app where
  // there is not (Safari on an iPhone), closed with Escape or the button.
  const leave = () => {
    figure.classList.remove("is-full");
    document.removeEventListener("keydown", escape);
    label();
  };
  full.addEventListener("click", () => {
    if (document.fullscreenElement === figure) void document.exitFullscreen();
    else if (figure.classList.contains("is-full")) leave();
    else if (document.fullscreenEnabled) void figure.requestFullscreen();
    else {
      figure.classList.add("is-full");
      document.addEventListener("keydown", escape);
      label();
    }
  });
  figure.addEventListener("fullscreenchange", label);
  return figure;
}

/** A diagram is shown full screen: the page must not be redrawn under it. */
export function diagramExpanded(): boolean {
  return Boolean(document.fullscreenElement?.classList.contains("diagram") || document.querySelector(".diagram.is-full"));
}

function firstLine(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).split("\n")[0];
}

/** Forgotten at sign-out, with the rest of what was read. */
export function forgetDiagrams(): void {
  drawn.clear();
  fitted.clear();
}
