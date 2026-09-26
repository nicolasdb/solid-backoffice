import { describe, it, expect } from "vitest";
import { renderMarkdown } from "./markdown";

describe("Markdown from a pod", () => {
  it("renders headings, lists, emphasis and code", () => {
    const html = renderMarkdown("# Title\n\n- one\n- **two**\n\n`code`");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>two</strong>");
    expect(html).toContain("<code>code</code>");
  });

  it("drops scripts, event handlers, javascript: links and styles", () => {
    const html = renderMarkdown(
      [
        "<script>alert(1)</script>",
        '<img src="x" onerror="alert(2)">',
        "[click](javascript:alert(3))",
        '<a href="data:text/html,x">data</a>',
        '<p style="position:fixed">over</p>',
        "<iframe src=\"https://evil.example\"></iframe>",
      ].join("\n\n")
    );
    expect(html).not.toMatch(/<script|onerror|javascript:|data:text|style=|<iframe/i);
  });

  it("opens links in a new tab without handing it this page", () => {
    const html = renderMarkdown("[pod](https://pod.example/)");
    expect(html).toContain('href="https://pod.example/"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('target="_blank"');
  });
});
