/**
 * Word files (`.docx`) in Pods, slice I: shown as a page, and copied to
 * Markdown when the member asks (at upload, or from the file's page).
 *
 * The original is never replaced: a copy is `<name>.md` beside it, with its
 * images in `<name>-images/`, and a YAML header naming where it came from
 * (`docs/explanation/documents.md`). Nothing is written over an existing
 * file: the copy is refused when its name is taken.
 *
 * The converter follows obsidian-docx-importer's `src/converter.ts`
 * (MIT, © 2026 Maya Chan, https://github.com/mayac5/obsidian-docx-importer):
 * mammoth to HTML with its list style map, its fix for nested lists, then
 * Turndown. Left out: its wikilink step (a pod keeps standard relative
 * links) and its run colours (the preview's sanitizing removes styles).
 * Changed: images are read with `readAsArrayBuffer` (its `read()` needs a
 * Node Buffer), and tables become GFM tables.
 *
 * mammoth and Turndown are loaded only when a Word file is opened or copied.
 */
import { authFetch } from "./auth";
import { childUrl, createOnly, fileError, WORD_TYPE } from "./files";

/** Named in each copy's header; `word.test.ts` keeps it in step with package.json. */
export const CONVERTER = "mammoth 1.13.0 + turndown 7.2.4";

const STYLE_MAP = [
  "p[numbering-level='0'][numbering-is-ordered] => ol > li:fresh",
  "p[numbering-level='0'][not numbering-is-ordered] => ul > li:fresh",
  "p[numbering-level='1'][numbering-is-ordered] => ol > li > ol > li:fresh",
  "p[numbering-level='1'][not numbering-is-ordered] => ol > li > ul > li:fresh",
  "p[numbering-level='2'][numbering-is-ordered] => ol > li > ol > li > ol > li:fresh",
  "p[numbering-level='2'][not numbering-is-ordered] => ol > li > ul > li > ul > li:fresh",
  "highlight => mark",
];

/** mammoth's browser build reads `arrayBuffer`, its Node build `buffer` (tests, or a server one day). */
const input = (bytes: ArrayBuffer) => ({ arrayBuffer: bytes, buffer: bytes }) as { arrayBuffer: ArrayBuffer };

export interface WordImage {
  name: string;
  type: string;
  data: ArrayBuffer;
}

export interface WordCopy {
  markdown: string;
  images: WordImage[];
  /** mammoth's messages: what it could not carry over (unknown styles, say). */
  warnings: string[];
}

/** The page shown for a Word file: HTML with its images inline, not yet sanitized. */
export async function wordToHtml(bytes: ArrayBuffer): Promise<string> {
  const { default: mammoth } = await import("mammoth");
  const result = await mammoth.convertToHtml(input(bytes), { styleMap: STYLE_MAP });
  return fixNestedLists(result.value);
}

/** A Word file as Markdown, its images linked from `imagesFolder` (relative, one segment). */
export async function wordToMarkdown(bytes: ArrayBuffer, imagesFolder: string): Promise<WordCopy> {
  const [{ default: mammoth }, { default: TurndownService }, { tables, strikethrough }] = await Promise.all([
    import("mammoth"),
    import("turndown"),
    import("@joplin/turndown-plugin-gfm"),
  ]);
  const images: WordImage[] = [];
  const result = await mammoth.convertToHtml(
    input(bytes),
    {
      styleMap: STYLE_MAP,
      convertImage: mammoth.images.imgElement(async (image) => {
        const ext = image.contentType.split("/")[1]?.replace("jpeg", "jpg").replace(/\+.*$/, "") || "png";
        const name = `image${images.length + 1}.${ext}`;
        images.push({ name, type: image.contentType, data: await image.readAsArrayBuffer() });
        return { src: `${encodeURIComponent(imagesFolder)}/${name}` };
      }),
    }
  );
  const td = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-" });
  td.use([tables, strikethrough]);
  td.keep(["mark"]);
  const escape = td.escape.bind(td);
  td.escape = (text: string) => escape(text).replace(/</g, "\\<"); // a "<" in the text is not a tag
  // "- item", not Turndown's "-   item": the copy is text people read and edit.
  td.addRule("listItem", {
    filter: "li",
    replacement: (content, node) => {
      const list = node.parentNode as HTMLElement;
      const start = Number(list.getAttribute("start") ?? 1);
      const prefix = list.nodeName === "OL" ? `${start + [...list.children].indexOf(node as HTMLElement)}. ` : "- ";
      const body = content.replace(/^\n+/, "").replace(/\n+$/, "\n").replace(/\n/gm, `\n${" ".repeat(prefix.length)}`);
      return prefix + body + (node.nextSibling && !/\n$/.test(body) ? "\n" : "");
    },
  });
  // A link the preview would refuse (javascript:, file:) keeps its words only.
  td.addRule("unsafeLink", {
    filter: (node) => node.nodeName === "A" && /^[a-z][a-z0-9+.-]*:/i.test(node.getAttribute("href") ?? "") && !/^(?:https?|mailto):/i.test(node.getAttribute("href")!),
    replacement: (content) => content,
  });
  return {
    markdown: td.turndown(headerRows(fixNestedLists(result.value))),
    images,
    warnings: result.messages.map((m) => m.message),
  };
}

/**
 * Word puts a list inside a list as its sibling, and splits one list in two
 * around an empty paragraph when the style changes; mammoth carries both
 * over. Moves each nested list into the item before it.
 */
export function fixNestedLists(html: string): string {
  const root = new DOMParser().parseFromString(html, "text/html").body;
  root.querySelectorAll("ol > ol, ol > ul, ul > ol, ul > ul").forEach((nested) => {
    const prev = nested.previousElementSibling;
    if (prev?.tagName === "LI") prev.append(nested);
  });
  const isList = (el: Element) => el.tagName === "OL" || el.tagName === "UL";
  //  : Word's "empty" paragraphs hold a non-breaking space, which trim() keeps.
  const isEmpty = (el: Element) => el.tagName === "P" && (el.textContent ?? "").replace(/[\s ]/g, "") === "";
  const merge = (container: Element) => {
    const kids = [...container.children];
    for (let i = kids.length - 1; i > 0; i--) {
      if (!isList(kids[i])) continue;
      let j = i - 1;
      const empty: Element[] = [];
      while (j >= 0 && isEmpty(kids[j])) empty.push(kids[j--]);
      if (j < 0 || !isList(kids[j])) continue;
      empty.forEach((p) => p.remove());
      kids[j].querySelector(":scope > li:last-child")?.append(kids[i]);
    }
  };
  merge(root);
  root.querySelectorAll("li").forEach(merge);
  return root.innerHTML;
}

/**
 * Word rarely marks a table's header row, and Markdown needs one: without
 * it the copy's table opens with an empty row. The first row is taken as
 * the header, as a reader would.
 */
function headerRows(html: string): string {
  const root = new DOMParser().parseFromString(html, "text/html").body;
  for (const table of root.querySelectorAll("table")) {
    const first = table.querySelector("tr");
    if (!first || first.querySelector("th")) continue;
    for (const td of [...first.children]) {
      const th = root.ownerDocument.createElement("th");
      th.append(...td.childNodes);
      td.replaceWith(th);
    }
  }
  return root.innerHTML;
}

export function isWord(file: { name: string; type: string }): boolean {
  return file.type.split(";")[0].trim() === WORD_TYPE || /\.docx$/i.test(file.name);
}

/** `rapport.docx` → `rapport.md` and `rapport-images`. */
export function copyNames(wordName: string): { note: string; images: string } {
  const stem = wordName.replace(/\.docx$/i, "");
  return { note: `${stem}.md`, images: `${stem}-images` };
}

/** The copy's text: the header naming its original, then the Markdown. */
export function withHeader(markdown: string, source: string, today = new Date()): string {
  const quoted = /^[\w.\- ]+$/.test(source) && !/^\s|\s$/.test(source) ? source : JSON.stringify(source);
  return `---\nsource: ${quoted}\nconverted: ${today.toISOString().slice(0, 10)}\nconverter: ${CONVERTER}\n---\n\n${markdown.trim()}\n`;
}

/**
 * Writes the Markdown copy of `wordName` (its bytes in `bytes`) into
 * `folderUrl`: the images first, then the note, so the note never points
 * at an image not yet there. Refused before writing anything when the
 * note's name is taken; an image's name taken stops it too (`exists`).
 * Returns the note's address and mammoth's warnings.
 */
export async function saveWordCopy(folderUrl: string, wordName: string, bytes: ArrayBuffer): Promise<{ url: string; warnings: string[] }> {
  const names = copyNames(wordName);
  const url = childUrl(folderUrl, names.note, false);
  const there = await authFetch(url, { method: "HEAD", cache: "no-store" });
  if (there.ok) throw fileError("exists", `${names.note} is already there: no copy was made. Rename or move it first.`);
  const copy = await wordToMarkdown(bytes, names.images);
  const imagesUrl = childUrl(folderUrl, names.images, true);
  for (const image of copy.images) await createOnly(imagesUrl + encodeURIComponent(image.name), image.data, image.type);
  await createOnly(url, withHeader(copy.markdown, wordName), "text/markdown");
  return { url, warnings: copy.warnings };
}

/** "Converted from rapport.docx on 17 Oct 2026", from a copy's header; null when it says nothing of the kind. */
export function convertedFrom(fields: [string, string[]][] | null): { source: string; on: string | null } | null {
  const get = (key: string) => fields?.find(([k]) => k === key)?.[1][0] ?? null;
  const source = get("source");
  if (!source) return null;
  return { source, on: get("converted") };
}
