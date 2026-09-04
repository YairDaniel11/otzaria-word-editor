/**
 * תבנית „מסמך חדש” עברית: המסמך הריק של המנוע (Letter, LTR) אחרי שלושה תיקונים
 * ב-XML — A4, `w:bidi` במקטע ובברירת המחדל של הפסקאות, ו-`w:bidi` בפסקה
 * הראשונה. אלה בדיוק שלוש השכבות ש-`applyHebrewDocumentDefaults` כותבת למנוע
 * אחרי הפתיחה, אבל כאן הן בקובץ עצמו — ולכן אין שלוש מוטציות, אין בנייה
 * חוזרת של אינדקס הביקורת, ופתיחת מסמך חדש מתקצרת בכ-650ms (נמדד).
 *
 * הגזירה נעשית בזמן הבנייה (`hebrewBlankDocx` ב-vite.config.ts) מהמסמך הריק
 * שבחבילת המנוע, כדי שהתבנית תעקוב אחרי שדרוגי מנוע; הפונקציות כאן טהורות
 * ונבדקות בנפרד, וכל אחת זורקת כשהעוגן שהיא מחפשת חסר — בנייה שנכשלת עדיפה
 * על תבנית שקטה בלי RTL.
 */
import { DOCX_MIME } from './export';
import { PAPER_SIZES } from './page-setup';

/** `w:pgSz` של המסמך הריק של המנוע — Letter. */
export const ENGINE_BLANK_PAGE_SIZE = '<w:pgSz w:w="12240" w:h="15840"/>';

const BIDI = '<w:bidi/>';

function a4PageSize(): string {
  const a4 = PAPER_SIZES.find((size) => size.id === 'a4');
  if (!a4) throw new Error('A4 אינו מוגדר ב-PAPER_SIZES');
  return `<w:pgSz w:w="${a4.widthTwips}" w:h="${a4.heightTwips}" w:code="${a4.code}"/>`;
}

function require(condition: boolean, what: string): void {
  if (!condition) throw new Error(`המסמך הריק של המנוע השתנה: ${what} — יש לעדכן את engine/blank-document.ts`);
}

/** A4, `w:bidi` במקטע (לפני `w:docGrid`, לפי סדר הסכמה), ו-`w:bidi` בפסקה הראשונה. */
export function patchBlankDocumentXml(xml: string): string {
  require(xml.includes(ENGINE_BLANK_PAGE_SIZE), 'לא נמצא w:pgSz של Letter');
  require(!xml.includes(BIDI), 'כבר יש בו w:bidi');
  require(xml.includes('<w:docGrid'), 'לא נמצא w:docGrid ב-sectPr');
  const paragraph = /<w:p\b([^>]*)\/>/;
  require(paragraph.test(xml), 'לא נמצאה פסקה ריקה יחידה');

  return xml
    .replace(ENGINE_BLANK_PAGE_SIZE, a4PageSize())
    .replace('<w:docGrid', `${BIDI}<w:docGrid`)
    .replace(paragraph, `<w:p$1><w:pPr>${BIDI}</w:pPr></w:p>`);
}

/** `w:bidi` בברירת המחדל של הפסקאות, ושפת ה-bidi עברית. */
export function patchBlankStylesXml(xml: string): string {
  require(xml.includes('<w:pPrDefault/>'), 'לא נמצא w:pPrDefault ריק');
  const lang = /(<w:lang\b[^>]*\bw:bidi=")ar-SA(")/;
  require(lang.test(xml), 'לא נמצא w:lang עם bidi=ar-SA');

  return xml
    .replace('<w:pPrDefault/>', `<w:pPrDefault><w:pPr>${BIDI}</w:pPr></w:pPrDefault>`)
    .replace(lang, '$1he-IL$2');
}

/** ה-Blob לפתיחה, מהמחרוזת שהבנייה הטמיעה. `undefined` כשאין תבנית (בדיקות). */
export function blankDocumentBlob(base64: string): Blob | undefined {
  if (!base64) return undefined;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: DOCX_MIME });
}
