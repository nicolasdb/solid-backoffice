import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { docx, PNG } from "./docx.fixture";

const mockFetch = vi.fn();
vi.mock("./auth", () => ({ authFetch: (...args: unknown[]) => mockFetch(...args) }));

const { CONVERTER, convertedFrom, copyNames, isWord, saveWordCopy, withHeader, wordToHtml, wordToMarkdown } = await import("./word");
const { kindOf, typeFor, WORD_TYPE } = await import("./files");
const { sanitizeHtml, splitFrontMatter } = await import("../ui/markdown");

beforeEach(() => mockFetch.mockReset());

describe("Word files (slice I)", () => {
  it("are known by type or by name", () => {
    expect(kindOf(WORD_TYPE)).toBe("word");
    expect(kindOf("application/octet-stream", "https://pod.example/a/rapport.DOCX")).toBe("word");
    expect(typeFor("rapport.docx")).toBe(WORD_TYPE);
    expect(isWord({ name: "x.bin", type: WORD_TYPE })).toBe(true);
    expect(isWord({ name: "notes.doc", type: "application/msword" })).toBe(false);
  });

  it("names the converter's versions as installed", () => {
    const version = (name: string) => JSON.parse(readFileSync(`node_modules/${name}/package.json`, "utf8")).version;
    expect(CONVERTER).toBe(`mammoth ${version("mammoth")} + turndown ${version("turndown")}`);
  });

  it("shows as a page, made safe like Markdown", async () => {
    const html = sanitizeHtml(await wordToHtml(await docx()));
    expect(html).toContain("<h1>Rapport 2026</h1>");
    expect(html).toMatch(/<ul><li>First point<ul><li>Detail<\/li><\/ul><\/li><li>Second point<\/li><\/ul>/);
    expect(html).toContain("<table>");
    expect(html).toMatch(/<img[^>]+src="data:image\/png;base64,/); // inline, nothing to read
    expect(html).not.toContain("javascript:");
  });

  it("copies to Markdown with its images beside it", async () => {
    const copy = await wordToMarkdown(await docx(), "rapport 2026-images");
    expect(copy.markdown).toContain("# Rapport 2026");
    expect(copy.markdown).toMatch(/- First point\n\s+- Detail\n- Second point/);
    expect(copy.markdown).toMatch(/\| Who \| What \|\n\| --- \| --- \|\n\| Inès \| a \\< b \|/);
    expect(copy.markdown).toContain("\n\nclick"); // its javascript: address dropped, its words kept
    expect(copy.markdown).not.toContain("javascript");
    expect(copy.markdown).toContain("![A map](rapport%202026-images/image1.png)");
    expect(copy.images.map(({ name, type }) => ({ name, type }))).toEqual([{ name: "image1.png", type: "image/png" }]);
    expect(new Uint8Array(copy.images[0].data)).toEqual(PNG);
  });

  it("starts with a header naming its original", () => {
    const text = withHeader("# Rapport\n", "rapport.docx", new Date("2026-10-17T09:00:00Z"));
    expect(text).toBe(`---\nsource: rapport.docx\nconverted: 2026-10-17\nconverter: ${CONVERTER}\n---\n\n# Rapport\n`);
    expect(withHeader("x", "a: b #1.docx")).toContain('source: "a: b #1.docx"');
    expect(copyNames("Rapport final.DOCX")).toEqual({ note: "Rapport final.md", images: "Rapport final-images" });
    expect(convertedFrom(splitFrontMatter(text).fields)).toEqual({ source: "rapport.docx", on: "2026-10-17" });
    expect(convertedFrom(splitFrontMatter("---\ntitle: x\n---\n").fields)).toBeNull();
  });

  it("writes the images, then the note, never over anything", async () => {
    const calls: string[] = [];
    mockFetch.mockImplementation(async (url: string, init: RequestInit = {}) => {
      calls.push(`${init.method ?? "GET"} ${url} ${(init.headers as Record<string, string> | undefined)?.["If-None-Match"] ?? ""}`.trim());
      return new Response(null, { status: init.method === "HEAD" ? 404 : 201 });
    });
    const out = await saveWordCopy("https://pod.example/a/docs/", "rapport.docx", await docx());
    expect(out.url).toBe("https://pod.example/a/docs/rapport.md");
    expect(calls).toEqual([
      "HEAD https://pod.example/a/docs/rapport.md",
      "PUT https://pod.example/a/docs/rapport-images/image1.png *",
      "PUT https://pod.example/a/docs/rapport.md *",
    ]);
    const note = mockFetch.mock.calls[2][1] as RequestInit;
    expect((note.headers as Record<string, string>)["Content-Type"]).toBe("text/markdown");
    expect(String(note.body)).toMatch(/^---\nsource: rapport.docx\n/);
  });

  it("is refused, with nothing written, when the copy's name is taken", async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }));
    await expect(saveWordCopy("https://pod.example/a/docs/", "rapport.docx", await docx())).rejects.toMatchObject({
      code: "exists",
      message: expect.stringContaining("rapport.md is already there"),
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe("images a page links relatively", () => {
  it("wait in data-src, so the browser does not ask this app's site", () => {
    const html = sanitizeHtml('<img src="rapport-images/image1.png" alt="a"><img src="https://x.example/i.png"><img src="data:image/png;base64,AA==">');
    expect(html).toContain('data-src="rapport-images/image1.png"');
    expect(html).not.toMatch(/ src="rapport-images/);
    expect(html).toContain('src="https://x.example/i.png"');
    expect(html).toContain('src="data:image/png;base64,AA=="');
  });
});
