# Word files on a pod: keep, convert, or both

Members arrive with `.docx` files, and Google Docs that export to one. A
pod stores any bytes, so the question is not whether a `.docx` can live on
a pod but what reads it afterwards: the backoffice's preview and editor,
another Solid app, the collective's pipeline and its LLM confronter.

Nothing here is decided for good. Everyone works differently, so no path
into a pod is closed; and not every path is built now. What is not known
yet is listed at the end and taken up when it matters. What is decided is
the rule that keeps every option open: **the original is never replaced**
on the member's pod. A conversion writes a copy beside it, and says where
it came from.

## How it arrives today

Xavier writes in Google Docs, downloads a `.docx` (Google Docs has no file
of its own to keep offline) and uploads it to his pod. Most members will
do the same with Word or Docs. Google's Download menu offers:

| Format | What survives |
|---|---|
| `.docx` | Text, structure, images inside the file. The usual choice. |
| `.odt` | Same, in an open format. |
| `.pdf` | Layout; text only if extracted, structure lost. Not handled yet. |
| `.md` | Structure, but images inlined as base64 text, with no option to change it: several MB of text an LLM must not read, and that our writes cap. |
| `.txt` | Text only: images and structure lost. |
| `.rtf`, `.html` (zipped), `.epub` | Possible, rarely chosen. |

So the formats to expect, in order: `.docx`, then `.pdf`, then Markdown
with base64 images.

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
2. **Convert in Pods** (slice I2), the member's choice, in the browser
   (nothing leaves it): when uploading a `.docx`, keep the Word file
   (the default), keep it and add a Markdown copy, or store the Markdown
   only, its images beside it (the `.docx` then stays on the member's
   computer); and later, "Make a Markdown copy" from the `···` menu of a
   `.docx` already on the pod. Any `.docx` in Pods previews as a page
   (I1).
3. **From Google Docs**, the claude.ai skill `gdoc-to-solid-md` (beta):
   exports the open document to Markdown on the pod, with the source URL in
   its YAML header and images as relative links. Same shape as 2, so the
   preview and the pipeline treat both alike.
4. **Shared with a collective**: whatever is in the folder, original or
   copy, is snapshotted as bytes; the pipeline adds derived text where it
   can and marks what it cannot read (`format-non-lu`, `texte-echec`).

A member may use any, all or none. No path deletes or rewrites what
another one wrote on the member's pod.

## On the collective's pod: Markdown and images, the `.docx` dropped

**Decided 17 Oct 2026** (to carry into solid-kit ADR 006, which changes
pull rule 5, and into pipeline B in solid-css-overlay). For path 4, the
collective pulls the `.docx`, converts it to Markdown with its images
beside it, checks the conversion, then drops its copy of the `.docx`.

Why:

- **A world of text.** What a collective holds is read by its members,
  its agents and the confronter. Markdown is read by all three without a
  tool in between; a `.docx` is not.
- **The evidence is the author's pod.** If the Markdown is ever
  questioned, the original is where the author keeps it, and the
  provenance names it. Asking the author for access to it is a feature
  noted for later ("request access").
- **Nobody writes on the collective's pod** but its agent, in a guarded,
  checked way. Any other change goes through the collective's
  governance; enforced in production, not while developing.
- **Storage**: one copy instead of two (below).

What it costs, accepted: the collective's snapshot is no longer the exact
bytes, and a converter's mistake is redone only from the author's
original. That is why the `.docx` is dropped **only after the conversion
has been checked**, and kept while it fails.

### File size

A `.docx` is a zip of XML: the text wrapped in verbose markup, then
compressed, plus a fixed set of parts (styles, theme, fonts, settings)
of around ten kilobytes even for a short note. Images are stored inside
as they are.

- **Text**: the Markdown is the text plus a few marks. Short documents
  get smaller (no fixed overhead); long ones end up about the same,
  because the XML's compression makes up for its markup.
- **Images**: the same bytes either way; pandoc extracts them unchanged.
  In an illustrated document they are most of the size.
- **Where the gain is**: not keeping both. A `.docx` with its Markdown
  copy holds every image twice, and a derived `.texte.md` beside a
  `.docx` is a second file per document. Dropping the `.docx` roughly
  halves an illustrated document's storage. Against Google's Markdown
  export, separate image files are a third smaller than base64 and keep
  the text file readable.

So size helps, but per file it is a modest argument; one copy instead of
two, and text read directly, are the strong ones. To be measured on
Xavier's folder: the pull report can give bytes in and bytes kept.

### Checking the conversion, without an LLM

The confronter never reads a `.docx`: it reads the Markdown. So the check
that allows dropping the `.docx` is done by the pull's code, right after
the conversion, not by confrontation; nothing is extracted twice.

Pandoc has no "verify" step of its own, but it reports what it can:
a non-zero exit when it fails, and warnings (`--verbose`;
`--fail-if-warnings` turns them into failures). The rest is compared with
the `.docx`'s own XML, which is plain text inside the zip:

| Check | From the `.docx` | From the result |
|---|---|---|
| Pandoc ran | exit code, warnings | |
| Text kept | words in `w:t` (body, footnotes, endnotes) | words in `pandoc -t plain` of the Markdown; a ratio close to 1 |
| Images kept | files in `word/media/` | files extracted and linked from the Markdown |
| Comments | `word/comments.xml` present | kept with `--track-changes=all`, or reported as dropped |
| Tracked changes | `w:ins`, `w:del` | accepted by default: reported |
| Charts, embedded objects | `word/charts/`, `w:object` | not converted: reported |

The outcome is the extraction status already planned (ADR 006 §8):
`texte-complet` (all checks pass: the `.docx` is dropped), `texte-partiel`
(what is missing, listed: the `.docx` is kept and the admin sees it in the
pull report), `texte-echec` (kept). The confronter can still flag a text
that reads as broken, as one more signal, not the gate.

## One converter: pandoc

Pandoc reads `.docx`, `.odt`, `.epub`, `.html`, `.rtf` and Markdown, and
writes Markdown with images as separate files (`--extract-media`). So yes,
it can be the one converter on the server, for every format above but one:
**pandoc does not read PDF** (it writes PDF, through LaTeX). PDF needs its
own tool (`pdftotext`, or a PDF-to-Markdown converter), and a scan needs
OCR or nothing.

In the browser, pandoc is not practical (a WebAssembly build exists, but
tens of MB); mammoth for `.docx` is small and loads on demand. So the
likely split: pandoc on the server (pipeline B, and a server-side "convert"
if the backoffice ever asks for one), mammoth in the browser for preview
and a quick copy (I1, I2).

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
- **On the server** (pipeline B), pandoc stays the choice (above). The
  plugin's converter would work in Node too, if one engine for both sides
  ever matters more.

## Known unknowns

Noted, not solved; each is taken up when the path it belongs to is built.

- **PDF**: which tool for text, and for Markdown with structure; what a
  scan gets (OCR, or flagged). The next format after `.docx`.
- **Google's Markdown with base64 images**: can pandoc's
  `--extract-media` lift `data:` images out of Markdown input into files?
  If so, the same tool cleans it, on the server or in pipeline B's
  derived text. To check on a real export.
- **Request access** to the author's original, when a collective's
  Markdown is questioned: noted, not designed.
- **The check's thresholds**: what text ratio counts as complete, and how
  long a kept `.docx` waits for the admin. Set on Xavier's real files.
- **Editing after conversion**: when the Markdown copy is edited, is the
  `.docx` beside it still useful, and should the preview say "older"?
- **The Google Docs skill** (beta): its header and image layout, to align
  with I2's so the preview and the pipeline treat both alike.
- **Telling members**: one page in the members' `guide/`
  (`templates/collective/guide/`) on the ways into a pod: upload as is,
  make a Markdown copy, the Google Docs skill, and what each keeps. Written
  once two paths exist.
- **Legacy `.doc`**: neither pandoc nor mammoth reads it; LibreOffice
  could convert it. Wait for a member who has one.

Where this sits in the plan: [slices, I](../slices.md#i--word-files-in-pods).
