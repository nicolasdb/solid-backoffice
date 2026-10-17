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
 * scales it to the page, "Full screen" gives it the whole screen, where it
 * can also be dragged and zoomed.
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

/** The diagram with its buttons: fit to the width, full screen, and zoom while full screen. */
function diagramFigure(source: string, svg: string): HTMLElement {
  const figure = document.createElement("figure");
  figure.className = "diagram";
  figure.classList.toggle("is-fit", fitted.has(source));
  figure.innerHTML = `
    <div class="diagram-bar">
      <span class="diagram-zoom" role="group" aria-label="Zoom">
        <button type="button" class="ghost small" data-zoom="out" aria-label="Zoom out">−</button>
        <button type="button" class="ghost small" data-zoom="reset">Reset</button>
        <button type="button" class="ghost small" data-zoom="in" aria-label="Zoom in">+</button>
      </span>
      <button type="button" class="ghost small" data-diagram="fit" aria-pressed="${fitted.has(source)}">Fit width</button>
      <button type="button" class="ghost small" data-diagram="full">Full screen</button>
    </div>
    <div class="diagram-canvas"><div class="diagram-stage">${svg}</div></div>`;
  const fit = figure.querySelector<HTMLButtonElement>('[data-diagram="fit"]')!;
  const full = figure.querySelector<HTMLButtonElement>('[data-diagram="full"]')!;
  fit.addEventListener("click", () => {
    if (fitted.has(source)) fitted.delete(source);
    else fitted.add(source);
    figure.classList.toggle("is-fit", fitted.has(source));
    fit.setAttribute("aria-pressed", String(fitted.has(source)));
  });
  const shown = () => document.fullscreenElement === figure || figure.classList.contains("is-full");
  const view = panZoom(figure, shown);
  const changed = () => {
    full.textContent = shown() ? "Exit full screen" : "Full screen";
    view.reset();
  };
  const escape = (event: KeyboardEvent) => {
    if (event.key === "Escape") leave();
  };
  // The Fullscreen API where there is one; a fixed layer over the app where
  // there is not (Safari on an iPhone), closed with Escape or the button.
  const leave = () => {
    figure.classList.remove("is-full");
    document.removeEventListener("keydown", escape);
    changed();
  };
  full.addEventListener("click", () => {
    if (document.fullscreenElement === figure) void document.exitFullscreen();
    else if (figure.classList.contains("is-full")) leave();
    else if (document.fullscreenEnabled) void figure.requestFullscreen();
    else {
      figure.classList.add("is-full");
      document.addEventListener("keydown", escape);
      changed();
    }
  });
  figure.addEventListener("fullscreenchange", changed);
  return figure;
}

/**
 * Pan and zoom, only while full screen: drag to move, the wheel or a pinch
 * to zoom around the pointer, the −, Reset and + buttons, or the keys
 * `-`, `0` and `+`. On the page itself the wheel scrolls the page, as usual.
 */
function panZoom(figure: HTMLElement, shown: () => boolean): { reset(): void } {
  const canvas = figure.querySelector<HTMLElement>(".diagram-canvas")!;
  const stage = figure.querySelector<HTMLElement>(".diagram-stage")!;
  let scale = 1;
  let x = 0;
  let y = 0;
  const pointers = new Map<number, { x: number; y: number }>();

  const apply = () => {
    stage.style.transform = scale === 1 && !x && !y ? "" : `translate(${x}px, ${y}px) scale(${scale})`;
  };
  /** Zoom by `factor`, keeping the point under (clientX, clientY) where it is. */
  const zoomAt = (clientX: number, clientY: number, factor: number) => {
    const next = Math.min(8, Math.max(0.2, scale * factor));
    const box = stage.getBoundingClientRect(); // its top left moves with the translation only
    const px = clientX - (box.left - x);
    const py = clientY - (box.top - y);
    x = px - (px - x) * (next / scale);
    y = py - (py - y) * (next / scale);
    scale = next;
    apply();
  };
  const zoomCentre = (factor: number) => {
    const box = canvas.getBoundingClientRect();
    zoomAt(box.left + box.width / 2, box.top + box.height / 2, factor);
  };
  const reset = () => {
    scale = 1;
    x = y = 0;
    pointers.clear();
    apply();
  };

  canvas.addEventListener(
    "wheel",
    (event) => {
      if (!shown()) return;
      event.preventDefault();
      zoomAt(event.clientX, event.clientY, Math.exp(-event.deltaY * 0.0015));
    },
    { passive: false }
  );
  canvas.addEventListener("pointerdown", (event) => {
    if (!shown() || event.button !== 0) return;
    canvas.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  });
  canvas.addEventListener("pointermove", (event) => {
    const before = pointers.get(event.pointerId);
    if (!before) return;
    const now = { x: event.clientX, y: event.clientY };
    const other = [...pointers].find(([id]) => id !== event.pointerId)?.[1];
    if (other) {
      // A pinch: zoom by the change in distance, around the two fingers' middle.
      const apart = (a: { x: number; y: number }) => Math.hypot(a.x - other.x, a.y - other.y) || 1;
      zoomAt((now.x + other.x) / 2, (now.y + other.y) / 2, apart(now) / apart(before));
    } else {
      x += now.x - before.x;
      y += now.y - before.y;
      apply();
    }
    pointers.set(event.pointerId, now);
  });
  const release = (event: PointerEvent) => pointers.delete(event.pointerId);
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  figure.querySelector('[data-zoom="in"]')!.addEventListener("click", () => zoomCentre(1.25));
  figure.querySelector('[data-zoom="out"]')!.addEventListener("click", () => zoomCentre(0.8));
  figure.querySelector('[data-zoom="reset"]')!.addEventListener("click", reset);
  figure.addEventListener("keydown", (event) => {
    if (!shown()) return;
    if (event.key === "+" || event.key === "=") zoomCentre(1.25);
    else if (event.key === "-") zoomCentre(0.8);
    else if (event.key === "0") reset();
  });

  return { reset };
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
