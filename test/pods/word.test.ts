import { describe, it, expect, vi, inject, beforeEach } from "vitest";
import { JSDOM } from "jsdom";
import { current, actAs } from "./as";
import { docx, PNG } from "../../src/lib/docx.fixture";

vi.mock("../../src/lib/auth", () => ({
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => current.fetch(input, init),
}));

// The converter tidies mammoth's HTML with DOMParser; the rest stays Node's (a jsdom
// environment would hand the cast's DPoP signing arrays from another realm).
globalThis.DOMParser = new JSDOM().window.DOMParser;

const { listFolder, readFile, uploadFile, WORD_TYPE } = await import("../../src/lib/files");
const { saveWordCopy } = await import("../../src/lib/word");

const amina = inject("cast").amina;
const folder = amina.pod + "word/";

beforeEach(async () => {
  await actAs("amina");
});

/** Slice I2 on a real server: a Word file kept, and its Markdown copy beside it. */
describe("Word files (I)", () => {
  it("keeps the Word file, and writes its copy with the images in a folder PUT creates", async () => {
    const bytes = await docx();
    const url = await uploadFile(folder, new File([bytes], "rapport 2026.docx", { type: WORD_TYPE }));
    expect(await readFile(url)).toMatchObject({ kind: "word", withheld: null, size: bytes.byteLength });

    const copy = await saveWordCopy(folder, "rapport 2026.docx", bytes);
    expect(copy.url).toBe(folder + "rapport%202026.md");
    const note = await readFile(copy.url);
    expect(note.kind).toBe("markdown");
    expect(note.text).toMatch(/^---\nsource: rapport 2026\.docx\nconverted: \d{4}-\d{2}-\d{2}\nconverter: mammoth /);
    expect(note.text).toContain("![A map](rapport%202026-images/image1.png)");

    const image = await readFile(new URL("rapport%202026-images/image1.png", copy.url).href);
    expect(image.contentType).toMatch(/^image\/png/);
    expect(new Uint8Array(await image.blob!.arrayBuffer())).toEqual(PNG);
    expect((await listFolder(folder)).map((i) => i.name).sort()).toEqual(["rapport 2026-images/", "rapport 2026.docx", "rapport 2026.md"]);
  });

  it("refuses a second copy, and writes nothing", async () => {
    const before = await readFile(folder + "rapport%202026.md");
    await expect(saveWordCopy(folder, "rapport 2026.docx", await docx())).rejects.toMatchObject({ code: "exists" });
    expect((await readFile(folder + "rapport%202026.md")).etag).toBe(before.etag);
  });
});
