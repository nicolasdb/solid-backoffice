import { describe, it, expect } from "vitest";
import { diagramSvg, forgetDiagrams } from "./mermaid";
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
});
