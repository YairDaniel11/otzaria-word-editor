/**
 * מסמכים עם מאקרו: הסיומת שתחתה הם נשמרים, ומה שנאמר למשתמש עליהם.
 *
 * החובה שהבדיקות כאן שומרות עליה היא אחת, והיא נוגעת לקובץ של המשתמש ולא
 * לממשק: **חבילה שנושאת `word/vbaProject.bin` חייבת להישמר כ-`.docm`.**
 * שמירתה כ-`.docx` מייצרת קובץ ש-Word מתלונן עליו — כלומר הופכת מסמך עובד של
 * המשתמש לקובץ שבור, בלי ששום דבר בדרך אמר לו למה.
 *
 * ומכאן הדרישה הפחות מובנת מאליה: הסיומת נגזרת מ„האם יש חלק מאקרו”, ולא
 * מ„האם הצלחנו לקרוא אותו”. פרויקט מאקרו פגום הוא עדיין פרויקט מאקרו, והחלק
 * עדיין נשמר בקובץ.
 */
import { describe, it, expect } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import {
  documentFileName,
  extensionFromFileName,
  MIME_FOR_EXTENSION,
  resolveSaveExtension,
  retypeBlob,
  stripWordExtension,
  WORD_EXTENSIONS,
} from '../../src/engine/export';
import {
  MODULE_KIND_LABEL,
  moduleCountText,
  NO_VBA,
  readDocumentVba,
  WARNING_TEXT,
} from '../../src/engine/vba-import';

/* ---------- זיהוי סיומות ---------- */

describe('extensionFromFileName', () => {
  it('מזהה את כל הסיומות המוכרות, ללא תלות ברישיות', () => {
    expect(extensionFromFileName('a.docx')).toBe('docx');
    expect(extensionFromFileName('a.DOCM')).toBe('docm');
    expect(extensionFromFileName('a.dotx')).toBe('dotx');
    expect(extensionFromFileName('a.DotM')).toBe('dotm');
  });

  it('מחזירה null לשם בלי סיומת מוכרת', () => {
    expect(extensionFromFileName('קובץ')).toBeNull();
    expect(extensionFromFileName('a.pdf')).toBeNull();
    expect(extensionFromFileName(undefined)).toBeNull();
  });

  it('אינה מתבלבלת מסיומת באמצע השם', () => {
    // „חידושים.docx.גיבוי” אינו docx.
    expect(extensionFromFileName('חידושים.docx.גיבוי')).toBeNull();
  });
});

describe('stripWordExtension', () => {
  it('מסירה סיומת מוכרת בלבד', () => {
    expect(stripWordExtension('חידושים.docm')).toBe('חידושים');
    expect(stripWordExtension('חידושים.pdf')).toBe('חידושים.pdf');
    expect(stripWordExtension('חידושים')).toBe('חידושים');
  });

  it('אינה אוכלת נקודות בתוך השם', () => {
    expect(stripWordExtension('סימן ג.ב.docx')).toBe('סימן ג.ב');
  });
});

/* ---------- סיומת השמירה ---------- */

describe('resolveSaveExtension', () => {
  it('מסמך רגיל נשמר כ-docx', () => {
    expect(resolveSaveExtension('a.docx', false)).toBe('docx');
    expect(resolveSaveExtension(undefined, false)).toBe('docx');
  });

  it('חבילה שנושאת מאקרו משדרגת docx ל-docm', () => {
    // המקרה שהוא הטעם לכל הקובץ הזה: קובץ עם `vbaProject` שנשמר כ-`docx` הוא
    // קובץ ש-Word מתלונן עליו.
    expect(resolveSaveExtension('a.docx', true)).toBe('docm');
  });

  it('תבנית נשארת תבנית', () => {
    // משתמש שפתח תבנית מצפה לשמור תבנית, לא מסמך.
    expect(resolveSaveExtension('a.dotx', false)).toBe('dotx');
    expect(resolveSaveExtension('a.dotx', true)).toBe('dotm');
    expect(resolveSaveExtension('a.dotm', true)).toBe('dotm');
  });

  it('מסמך docm בלי מאקרו נשאר docm', () => {
    // הכיוון ההפוך אינו נעשה בכוונה: זו הבחירה של המשתמש, ו-Word עצמו מתנהג
    // כך. מסמך `.docm` שעדיין לא נכתב בו מאקרו הוא מצב שגרתי לגמרי.
    expect(resolveSaveExtension('a.docm', false)).toBe('docm');
  });

  it('מסמך בלי שם שנושא מאקרו נשמר כ-docm', () => {
    // מסלול שחזור הטיוטה: אין שם מקור, אבל הבייטים כן נושאים מאקרו.
    expect(resolveSaveExtension(undefined, true)).toBe('docm');
  });
});

describe('documentFileName', () => {
  it('מצמידה את הסיומת המבוקשת ומחליפה סיומת קיימת', () => {
    expect(documentFileName('חידושים', 'docm')).toBe('חידושים.docm');
    expect(documentFileName('חידושים.docx', 'docm')).toBe('חידושים.docm');
  });

  it('מנקה תווים שאינם חוקיים בשם קובץ', () => {
    expect(documentFileName('א/ב:ג*ד', 'docx')).toBe('אבגד.docx');
  });

  it('שם שנשאר ריק מקבל שם ברירת מחדל', () => {
    expect(documentFileName('///', 'docx')).toBe('מסמך.docx');
    expect(documentFileName('   ', 'docm')).toBe('מסמך.docm');
  });
});

describe('MIME_FOR_EXTENSION', () => {
  it('מכסה כל סיומת מוכרת', () => {
    for (const extension of WORD_EXTENSIONS) {
      expect(MIME_FOR_EXTENSION[extension]).toMatch(/^application\//);
    }
  });

  it('ל-docm יש טיפוס משלו ולא זה של docx', () => {
    expect(MIME_FOR_EXTENSION.docm).not.toBe(MIME_FOR_EXTENSION.docx);
    expect(MIME_FOR_EXTENSION.docm).toContain('macroEnabled');
  });
});

describe('retypeBlob', () => {
  it('מחליפה את הטיפוס ושומרת את התוכן', () => {
    const original = new Blob([new Uint8Array([1, 2, 3])], { type: MIME_FOR_EXTENSION.docx });
    const retyped = retypeBlob(original, 'docm');

    // `Blob` מנרמל את הטיפוס לאותיות קטנות לפי התקן, ולכן ההשוואה כאן —
    // וגם זו שבתוך `retypeBlob` — חסרת-רישיות. השוואה מדויקת הייתה נכשלת על
    // ה-`E` הגדולה שב-`macroEnabled`.
    expect(retyped.type).toBe(MIME_FOR_EXTENSION.docm.toLowerCase());
    // הגודל ולא הבייטים: ל-`Blob` של jsdom אין `arrayBuffer()`. שימור הבייטים
    // עצמו נובע מהבנייה (`new Blob([blob])`), והגודל הוא מה שיתפוס תוכן שאבד.
    expect(retyped.size).toBe(3);
  });

  it('מחזירה את אותו Blob כשהטיפוס כבר נכון', () => {
    const original = new Blob([new Uint8Array([1])], { type: MIME_FOR_EXTENSION.docm });
    expect(retypeBlob(original, 'docm')).toBe(original);
  });
});

/* ---------- קריאת המאקרו ---------- */

const CONTENT_TYPES_WITH_VBA =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="bin" ContentType="application/vnd.ms-office.vbaProject"/>' +
  '</Types>';

interface Part {
  name: string;
  bytes: Uint8Array;
}

/** ארכיון ZIP מינימלי. אותה תבנית כמו ב-docx-preflight.test.ts. */
function buildZip(parts: Part[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const records = parts.map((part) => ({
    nameBytes: encoder.encode(part.name),
    raw: part.bytes,
    stored: new Uint8Array(deflateRawSync(part.bytes)),
    crc: crc32(part.bytes),
  }));

  const size =
    records.reduce((total, r) => total + 30 + r.nameBytes.byteLength + r.stored.byteLength, 0) +
    records.reduce((total, r) => total + 46 + r.nameBytes.byteLength, 0) +
    22;

  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  const offsets: number[] = [];
  let at = 0;

  for (const record of records) {
    offsets.push(at);
    view.setUint32(at, 0x04034b50, true);
    view.setUint16(at + 4, 20, true);
    view.setUint16(at + 8, 8, true);
    view.setUint32(at + 14, record.crc, true);
    view.setUint32(at + 18, record.stored.byteLength, true);
    view.setUint32(at + 22, record.raw.byteLength, true);
    view.setUint16(at + 26, record.nameBytes.byteLength, true);
    at += 30;
    out.set(record.nameBytes, at);
    at += record.nameBytes.byteLength;
    out.set(record.stored, at);
    at += record.stored.byteLength;
  }

  const centralOffset = at;
  records.forEach((record, index) => {
    view.setUint32(at, 0x02014b50, true);
    view.setUint16(at + 4, 20, true);
    view.setUint16(at + 6, 20, true);
    view.setUint16(at + 10, 8, true);
    view.setUint32(at + 16, record.crc, true);
    view.setUint32(at + 20, record.stored.byteLength, true);
    view.setUint32(at + 24, record.raw.byteLength, true);
    view.setUint16(at + 28, record.nameBytes.byteLength, true);
    view.setUint32(at + 42, offsets[index]!, true);
    at += 46;
    out.set(record.nameBytes, at);
    at += record.nameBytes.byteLength;
  });

  view.setUint32(at, 0x06054b50, true);
  view.setUint16(at + 8, records.length, true);
  view.setUint16(at + 10, records.length, true);
  view.setUint32(at + 12, at - centralOffset, true);
  view.setUint32(at + 16, centralOffset, true);
  return out;
}

let crcTable: Uint32Array | null = null;

function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let value = i;
      for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      crcTable[i] = value >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const bytesOf = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('readDocumentVba', () => {
  it('מסמך בלי מאקרו מדווח שאין', async () => {
    const plain = buildZip([{ name: 'word/document.xml', bytes: bytesOf('<w:document/>') }]);
    await expect(readDocumentVba(plain)).resolves.toEqual(NO_VBA);
  });

  it('בייטים שאינם חבילה אינם מפילים פתיחה', async () => {
    // המאקרו הם מה שהמשתמש רואה, לא תנאי לפתיחת המסמך.
    await expect(readDocumentVba(new Uint8Array([1, 2, 3]))).resolves.toEqual(NO_VBA);
  });

  it('חלק מאקרו שאינו נקרא נשאר „יש מאקרו”', async () => {
    // החובה המרכזית: `hasMacroPart` אמת גם כשהפרויקט פגום, אחרת השמירה הייתה
    // מורידה את הסיומת ל-`docx` ומאבדת את החלק.
    const damaged = buildZip([
      { name: '[Content_Types].xml', bytes: bytesOf(CONTENT_TYPES_WITH_VBA) },
      { name: 'word/vbaProject.bin', bytes: new Uint8Array(600) },
    ]);

    const vba = await readDocumentVba(damaged);
    expect(vba.hasMacroPart).toBe(true);
    expect(vba.unreadable).toBe(true);
    expect(vba.modules).toEqual([]);
    expect(vba.warnings[0]).toContain('אינו קריא');
    expect(vba.status).toContain('יישמרו כמות שהם');
    // וזה מה שנגזר מזה בפועל.
    expect(resolveSaveExtension('a.docx', vba.hasMacroPart)).toBe('docm');
  });
});

/* ---------- הנוסח בעברית ---------- */

describe('הנוסח שמוצג למשתמש', () => {
  it('לכל קוד אזהרה של החבילה יש נוסח עברי', () => {
    // `Record` מלא ולא `switch` עם ברירת מחדל: קוד חדש בחבילה נופל בזמן
    // בנייה, ולא נשאר באנגלית בשקט בממשק עברי.
    for (const text of Object.values(WARNING_TEXT)) {
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toMatch(/[A-Za-z]{6,}/);
    }
  });

  it('אזהרת ההרצה האוטומטית אומרת במפורש שאין הרצה', () => {
    // זו ההודעה הביטחונית: Word מריץ `AutoOpen` מעצמו, וכאן לא.
    expect(WARNING_TEXT['auto-run-macros']).toContain('אינם מורצים');
  });

  it('לכל סוג מודול יש תווית', () => {
    for (const label of Object.values(MODULE_KIND_LABEL)) {
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('ספירת מודולים מנוסחת נכון ביחיד וברבים', () => {
    expect(moduleCountText(1)).toBe('מודול מאקרו אחד');
    expect(moduleCountText(3)).toBe('3 מודולי מאקרו');
  });
});
