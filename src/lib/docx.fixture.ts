/** A small Word file for tests, laid out as Word does: a heading, a nested list, a table, an image, a link. */
import JSZip from "jszip";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
export const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const para = (text: string, style?: string, list?: [number, number]) =>
  `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}${list ? `<w:numPr><w:ilvl w:val="${list[1]}"/><w:numId w:val="${list[0]}"/></w:numPr>` : ""}</w:pPr><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const cell = (text: string) => `<w:tc>${para(text)}</w:tc>`;
const picture = `<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:docPr id="1" name="Picture 1" descr="A map"/>
  <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:blipFill><a:blip ${R} r:embed="rId9"/></pic:blipFill></pic:pic>
  </a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;

export async function docx(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
    </Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId8" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
      <Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
      <Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="javascript:alert(1)" TargetMode="External"/></Relationships>`
  );
  zip.file(
    "word/numbering.xml",
    `<?xml version="1.0"?><w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>
      <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`
  );
  zip.file("word/media/image1.png", PNG);
  zip.file(
    "word/document.xml",
    `<?xml version="1.0"?><w:document ${W} ${R}><w:body>
      ${para("Rapport 2026", "Heading1")}
      ${para("First point", undefined, [1, 0])}
      ${para("Detail", undefined, [1, 1])}
      ${para("Second point", undefined, [1, 0])}
      <w:tbl><w:tr>${cell("Who")}${cell("What")}</w:tr><w:tr>${cell("Inès")}${cell("a &lt; b")}</w:tr></w:tbl>
      ${picture}
      <w:p><w:hyperlink r:id="rId10"><w:r><w:t>click</w:t></w:r></w:hyperlink></w:p>
    </w:body></w:document>`
  );
  return zip.generateAsync({ type: "arraybuffer" });
}

