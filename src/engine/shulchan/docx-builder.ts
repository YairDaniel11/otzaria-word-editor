/**
 * בונה docx מינימלי מפסקאות טקסט — בשביל „פירוק מסמך”, שצריך מסמך **שני**
 * עם הערות השוליים, ואין למנוע דרך לפתוח מסמך ריק ולמלא אותו בצעד אחד.
 *
 * ה-docx הוא ZIP; כאן נכתב ZIP „stored” (בלי דחיסה) עם CRC-32 — ארבעה
 * חלקים בלבד: `[Content_Types].xml`, `_rels/.rels`, `word/document.xml`
 * ו-`word/_rels/document.xml.rels` (ריק, כדי ש-Word לא יתלונן). זה בדיוק
 * מה שהמנוע ו-Word צריכים כדי לפתוח, וה-Blob נכנס ל-`openDocument(undefined,
 * { draft })` של App.vue — אותו מסלול של שחזור טיוטה, שמסמן את המסמך כלא
 * שמור ו„שמור” בו פותח „שמור בשם”.
 *
 * הפסקאות עבריות: `<w:bidi/>` על הפסקה ו-`<w:rtl/>` על הריצות, וגופן David
 * כברירת המחדל של המסמך — כמו `applyHebrewDocumentDefaults`.
 */

export interface DocxRun {
  text: string;
  superscript?: boolean;
  bold?: boolean;
}

export interface DocxParagraph {
  runs: readonly DocxRun[];
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function runXml(run: DocxRun): string {
  const props = ['<w:rtl/>'];
  if (run.bold) props.push('<w:b/><w:bCs/>');
  if (run.superscript) props.push('<w:vertAlign w:val="superscript"/>');
  return `<w:r><w:rPr>${props.join('')}</w:rPr><w:t xml:space="preserve">${escapeXml(run.text)}</w:t></w:r>`;
}

function paragraphXml(paragraph: DocxParagraph): string {
  return `<w:p><w:pPr><w:bidi/><w:jc w:val="both"/></w:pPr>${paragraph.runs.map(runXml).join('')}</w:p>`;
}

/** `word/document.xml` — A4, שוליים 2.5 ס"מ, גוף בעברית. */
export function documentXml(paragraphs: readonly DocxParagraph[]): string {
  const body = paragraphs.map(paragraphXml).join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body>${body}` +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/>' +
    '<w:bidi/></w:sectPr></w:body></w:document>'
  );
}

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '</Types>';

const ROOT_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  '</Relationships>';

const DOCUMENT_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';

/* ---------- ZIP stored ---------- */

let crcTable: Uint32Array | null = null;

function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = crcTable[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

function u16(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function u32(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

/** ZIP בלי דחיסה (method 0), כותרות מקומיות + ספרייה מרכזית. */
export function buildStoredZip(entries: readonly ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const locals: number[] = [];
  const central: number[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;
    const header = [
      ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(size), ...u32(size), ...u16(name.length), ...u16(0),
    ];
    locals.push(...header, ...name, ...entry.data);
    central.push(
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(size), ...u32(size), ...u16(name.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name,
    );
    offset += header.length + name.length + size;
  }
  const end = [
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length),
    ...u32(central.length), ...u32(offset), ...u16(0),
  ];
  return new Uint8Array([...locals, ...central, ...end]);
}

export const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** ה-docx כ-Blob, מוכן ל-`openDocument(undefined, { draft })`. */
export function buildDocx(paragraphs: readonly DocxParagraph[]): Blob {
  const encoder = new TextEncoder();
  const bytes = buildStoredZip([
    { name: '[Content_Types].xml', data: encoder.encode(CONTENT_TYPES) },
    { name: '_rels/.rels', data: encoder.encode(ROOT_RELS) },
    { name: 'word/document.xml', data: encoder.encode(documentXml(paragraphs)) },
    { name: 'word/_rels/document.xml.rels', data: encoder.encode(DOCUMENT_RELS) },
  ]);
  // העתק לתוך ArrayBuffer „רגיל”: `BlobPart` אינו מקבל ArrayBufferLike (SharedArrayBuffer).
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: DOCX_MIME_TYPE });
}
