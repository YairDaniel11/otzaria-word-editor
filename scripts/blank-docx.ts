/**
 * גזירת תבנית „מסמך חדש” מהמסמך הריק של המנוע — צד Node בלבד (vite.config.ts
 * והבדיקות). התיקונים עצמם ב-src/engine/blank-document.ts.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateRawSync, inflateRawSync } from 'node:zlib';

const BLANK_CHUNK = /^blank-docx-[^.]+\.es\.js$/;

/** מ-`cwd` ולא מ-`import.meta.url`: תחת jsdom הכתובת אינה file://, ו-`exports` של superdoc סוגר את package.json. */
function chunksDir(): string {
  const dir = join(process.cwd(), 'node_modules', 'superdoc', 'dist', 'chunks');
  if (!existsSync(dir)) throw new Error(`${dir} אינו קיים — הריצו מתיקיית הפרויקט אחרי npm install`);
  return dir;
}

export interface ZipEntry {
  name: string;
  data: Buffer;
}

/** המסמך הריק שהמנוע פותח כש-`document` חסר, כפי שהוא ארוז בחבילה. */
export function engineBlankDocx(): Buffer {
  const dir = chunksDir();
  const matches = readdirSync(dir).filter((name) => BLANK_CHUNK.test(name));
  if (matches.length !== 1) {
    throw new Error(`נמצאו ${matches.length} קובצי blank-docx ב-${dir} — צפוי אחד. ייתכן ששם הנכס השתנה בגרסת superdoc חדשה.`);
  }
  const source = readFileSync(join(dir, matches[0]!), 'utf8');
  const base64 = /base64,([A-Za-z0-9+/=]+)/.exec(source)?.[1];
  if (!base64) throw new Error(`${matches[0]} אינו נושא data URL של docx`);
  return Buffer.from(base64, 'base64');
}

/** קורא ZIP לפי הספרייה המרכזית. רק stored ו-deflate — כל מה ש-Word כותב. */
export function readZip(zip: Buffer): ZipEntry[] {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('ZIP ללא End of Central Directory');
  const count = zip.readUInt16LE(eocd + 10);
  let offset = zip.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) throw new Error('רשומת ספרייה מרכזית פגומה');
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const local = zip.readUInt32LE(offset + 42);
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    const dataStart = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const raw = zip.subarray(dataStart, dataStart + compressedSize);
    if (method !== 0 && method !== 8) throw new Error(`${name}: שיטת דחיסה ${method} אינה נתמכת`);
    entries.push({ name, data: method === 8 ? inflateRawSync(raw) : Buffer.from(raw) });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** כותב ZIP דחוס (deflate). הסדר נשמר — `[Content_Types].xml` נשאר ראשון. */
export function writeZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuffer = Buffer.from(name, 'utf8');
    const compressed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuffer, compressed);
    centrals.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + compressed.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

export interface BlankPatchers {
  patchDocument: (xml: string) => string;
  patchStyles: (xml: string) => string;
}

export const DOCUMENT_PART = 'word/document.xml';
export const STYLES_PART = 'word/styles.xml';

/** המסמך הריק של המנוע אחרי התיקונים העבריים. שאר החלקים נשארים בייט-בבייט. */
export function deriveHebrewBlankDocx({ patchDocument, patchStyles }: BlankPatchers): Buffer {
  const entries = engineBlankDocx();
  const parts = readZip(entries);
  const names = new Set(parts.map((part) => part.name));
  for (const required of [DOCUMENT_PART, STYLES_PART]) {
    if (!names.has(required)) throw new Error(`המסמך הריק של המנוע חסר את ${required}`);
  }
  return writeZip(
    parts.map((part) => {
      if (part.name === DOCUMENT_PART) return { name: part.name, data: Buffer.from(patchDocument(part.data.toString('utf8')), 'utf8') };
      if (part.name === STYLES_PART) return { name: part.name, data: Buffer.from(patchStyles(part.data.toString('utf8')), 'utf8') };
      return part;
    }),
  );
}
