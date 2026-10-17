import { describe, it, expect } from "vitest";
import { diagramExpanded, diagramSvg, drawDiagrams, forgetDiagrams } from "./mermaid";
import { renderMarkdown } from "./markdown";

const stub = (svg: string) => ({ render: async () => ({ svg, diagramType: "flowchart" }) }) as never;

describe("Mermaid in a Markdown preview", () => {
  it("leaves a mermaid block for drawDiagrams to find", () => {
    const html = renderMarkdown("```mermaid\nflowchart LR\n  A --> B\n```");
    expect(html).toContain('<code class="language-mermaid">');
    expect(html).toContain("A --&gt; B");
  });

  it("keeps the drawing and its styles, drops scripts, handlers, HTML labels and javascript: links", async () => {
    forgetDiagrams();
    const svg = await diagramSvg(
      "flowchart LR\n  X",
      stub(
        `<svg id="d1"><style>#d1 .node rect{fill:#fff}</style><g class="node" style="fill:#e2f5e2"><rect></rect><text>A</text></g>` +
          `<foreignObject><div onclick="x()">h</div></foreignObject><a href="javascript:alert(1)"><text>l</text></a><script>alert(2)</script></svg>`
      )
    );
    expect(svg).toContain("<style>#d1 .node rect{fill:#fff}</style>");
    expect(svg).toContain('style="fill:#e2f5e2"');
    expect(svg).not.toMatch(/<script|onclick|javascript:|foreignObject/i);
  });

  it("draws a source once", async () => {
    forgetDiagrams();
    let calls = 0;
    const counting = { render: async () => (calls++, { svg: "<svg></svg>", diagramType: "flowchart" }) } as never;
    await diagramSvg("flowchart LR\n  Y", counting);
    await diagramSvg("flowchart LR\n  Y", counting);
    expect(calls).toBe(1);
  });

  it("replaces the block with the diagram, fit to width and full screen kept across a redraw", async () => {
    forgetDiagrams();
    const source = "flowchart LR\n  Z";
    await diagramSvg(source, stub('<svg id="z"></svg>'));
    const page = () => {
      document.body.innerHTML = `<article>${renderMarkdown("```mermaid\n" + source + "\n```")}</article>`;
      return drawDiagrams(document.body);
    };
    await page();
    const fit = () => document.querySelector<HTMLButtonElement>('[data-diagram="fit"]')!;
    expect(document.querySelector(".diagram-canvas svg#z")).not.toBeNull();
    expect(document.querySelector("pre")).toBeNull();
    fit().click();
    await page();
    expect(document.querySelector(".diagram")!.classList.contains("is-fit")).toBe(true);
    expect(fit().getAttribute("aria-pressed")).toBe("true");

    // No Fullscreen API here (as on an iPhone): a layer over the app, closed with Escape.
    document.querySelector<HTMLButtonElement>('[data-diagram="full"]')!.click();
    expect(diagramExpanded()).toBe(true);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(diagramExpanded()).toBe(false);
  });

  it("leaves a diagram that does not parse as source, with the reason", async () => {
    forgetDiagrams();
    document.body.innerHTML = renderMarkdown("```mermaid\nnot a diagram\n```");
    await drawDiagrams(document.body).catch(() => undefined);
    expect(document.querySelector("pre > code.language-mermaid")).not.toBeNull();
  });
});
