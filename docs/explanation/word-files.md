# Word files on a pod: keep, convert, or both

Members arrive with `.docx` files, and Google Docs that export to one. A
pod stores any bytes, so the question is not whether a `.docx` can live on
a pod but what reads it afterwards: the backoffice's preview and editor,
another Solid app, the collective's pipeline and its LLM confronter.

Nothing here is decided for good. What is decided is the rule that keeps
every option open: **the original is never replaced**. A conversion writes
a copy beside it, and says where it came from.

## Two ways to store it

| | Keep the `.docx` only | Convert to Markdown at upload |
|---|---|---|
| Fidelity | Exact: comments, tracked changes, footnotes, styles, layout | Lossy: comments and tracked changes gone, complex tables and footnotes approximate, colours dropped (the preview strips `style`) |
| Round trip with Word users | Open, edit, send back as is | Back to Word means an export, with its own losses |
| Preview and edit in the backoffice | Preview only after a conversion in the browser; no edit | Preview, edit, `If-Match` saves, like any text file |
| Other Solid apps, plain tools | Need a Word reader | Readable by anything that reads text |
| The collective's pipeline | Needs extraction before confrontation (pipeline B) | The confronter reads it as is |
| Changes over time | Binary: a snapshot per save, no readable diff | Text: diffable, links work, the graph can point into it |
| Images | Inside the file | Separate files beside the note, linked relatively, never base64 |
| A decision frozen in the content | None | The converter's choices (headings, lists, tables) become the document |

## Both, and which one is the document

Keeping the original and adding a Markdown copy gets most of both columns,
at one cost: two files that can diverge. Once someone edits the Markdown,
the `.docx` is the old version, and nothing in a pod says so unless the
copy does. So a converted copy carries a YAML header (the one the
[collective's procedures](https://github.com/nicolasdb/solid-css-overlay/tree/main/mcp-connector)
already ask a contribution to start with, shown as fields by the preview):

```yaml
---
source: rapport-2026.docx        # the original, relative to this file
converted: 2026-10-17
converter: mammoth 1.8 + turndown 7.2
---
```

From that header, the preview can say "Converted from rapport-2026.docx on
17 Oct", and an edited copy is known to be the newer one.

This is a different thing from the pipeline's **derived text**
(solid-kit ADR 001, index vs truth; ADR 006 §8): `<file>.texte.md`, written
by the puller in the collective's snapshot, for the confronter only, never
edited, never shown to members as their document. A member's Markdown copy
is their document; the derived text is an index of a snapshot.

## Paths in, none required

Each path is optional, and each leaves a file the others can read:

1. **Upload the `.docx`** in Pods. Works today. The pipeline extracts text
   from it when the folder is shared (pipeline B, pandoc on the server).
2. **Make a Markdown copy** in Pods (slice I2): the conversion runs in the
   browser on a `.docx` already on the pod, and writes the copy and its
   images beside it. Nothing leaves the browser.
3. **From Google Docs**, the claude.ai skill `gdoc-to-solid-md` (beta):
   exports the open document to Markdown on the pod, with the source URL in
   its YAML header and images as relative links. Same shape as 2, so the
   preview and the pipeline treat both alike.
4. **Shared with a collective**: whatever is in the folder, original or
   copy, is snapshotted as bytes; the pipeline adds derived text where it
   can and marks what it cannot read (`format-non-lu`, `texte-echec`).

A member may use any, all or none. No path deletes or rewrites what
another one wrote.

## The Obsidian plugin as a reference

[mayac5/obsidian-docx-importer](https://github.com/mayac5/obsidian-docx-importer)
(MIT, 0.3.1) does path 2 for an Obsidian vault. Read 17 Oct 2026:

- **`src/converter.ts` is reusable as is**: `ArrayBuffer` in,
  `{ markdown, images }` out, no Obsidian import. Mammoth to HTML, a fix
  for nested lists, Turndown to Markdown; it also reads run colours from
  the XML, which mammoth drops.
- **To change for a pod**: drop the last step that rewrites image links
  to Obsidian wikilinks (`![[…]]`); keep standard relative links. The
  colour spans would be removed by our sanitizing anyway.
- **Its layout** (one folder per import: the note, a copy of the `.docx`,
  `attachments/`) fits the "both" option directly.
- **The exporter** (Markdown to `.docx` with the `docx` library) is tied to
  the vault's API, but the idea carries: "Download as Word" for a Markdown
  file, later.
- **Weight**: mammoth, Turndown and JSZip load only when a Word file is
  opened, like Mermaid for diagrams.
- **On the server** (pipeline B), pandoc stays the choice: it also reads
  `.odt`, and handles tables and footnotes better. The plugin's converter
  would work in Node too, if one engine for both sides ever matters more.

Where this sits in the plan: [slices, I](../slices.md#i--word-files-in-pods).
