/**
 * „הדפסה”: מה שהמעטפת עושה **לפני** `window.print()`.
 *
 * ## מה היה כאן
 *
 * `onPrint()` היה `window.print()` בשורה אחת, ובכל `src/` וב-`index.html`
 * לא היה אף `@media print` ואף `@page`. כלומר הכפתור הדפיס את **הממשק**: נמדד
 * ב-CDP (`Emulation.setEmulatedMedia: print` + `Page.printToPDF`) על ה-dist
 * הארוז שהפלט מכיל את פס הכותרת עם הלוגו, את שמונה לשוניות הרצועה, את גלריית
 * הסגנונות ואת שורת המצב — והמסמך עצמו קטע קטן באמצע, כי המעטפת היא
 * `height: 100vh; overflow: hidden` ולכן מה שנדפס הוא בדיוק גובה חלון אחד.
 *
 * ## שלוש הבעיות, ולמי כל אחת שייכת
 *
 * 1. **המעטפת נדפסת.** נפתר ב-`styles/print.css`: שם יושב הגלון שמסתיר את פס
 *    הכותרת, הרצועה, שורת המצב והדיאלוגים, ומשחרר את מיכל הגלילה כדי שכל
 *    עמודי המסמך יהיו בזרימה ולא רק זה שנראה.
 * 2. **גודל הנייר.** `@page` **חייב** לקבל את מידות הדף של המסמך: המנוע מצייר
 *    את העמוד כתיבה בגודל קבוע (A4 = 793.733×1122.53 פיקסלים), ונייר קטן ממנו
 *    שובר כל עמוד לשני גיליונות. המידות אינן ידועות בזמן כתיבת ה-CSS — הן של
 *    המסמך — ולכן הן נקראות מהמנוע כאן ומוזרקות כ-`@page` לפני ההדפסה.
 * 3. **הזום.** נמדד: `ui.zoom` מיושם כ-`transform: matrix(0.5, …)` על מיכל
 *    העמודים של המנוע. כלומר הדפסה ב-50% הייתה מדפיסה מסמך מוקטן בפינת
 *    הגיליון. הגלון מבטל את ה-transform במדיית print, וזה נמדד: באותו מסמך
 *    ב-50% זום, במדיית print העמודים חזרו ל-794×1123 והפלט היה שלושה גיליונות
 *    A4 מלאים.
 *
 * ## היחידות (נמדד, לא הונח)
 *
 * `sections.list()` מחזיר `pageSetup.width/height` ב**אינצ'ים**: הפרויקציה
 * הציבורית במנוע היא `twips / 1440` (הפונקציה `_I` ב-`@superdoc/docx-engine`),
 * סימטרית לסטרים שמכפילים ב-1440 (ראו engine/page-setup.ts). A4 = 11906 twips
 * = 8.268 אינץ'.
 *
 * העיגול הוא **כלפי מעלה** ובכוונה: גיליון שקטן מתיבת העמוד אפילו בשבריר
 * פיקסל מוליד עמוד נוסף ריק על כל עמוד במסמך. עיגול למעלה מוסיף פחות מעשירית
 * פיקסל של לבן ואינו יכול לשבור עמוד.
 *
 * ## וכשהקריאה נכשלת: מודדים, לא מוותרים
 *
 * `readPrintPageSize` מחזירה `null` בכל מקרה שאינו מידה שאפשר להישען עליה —
 * אין מסמך, אין `sections.list`, הקריאה זרקה. עד כה זה הסתיים ב-`@page`
 * שנושא `margin: 0` **בלי** `size`, ומשמעותו „הנייר של דיאלוג ההדפסה”:
 * ברירת המחדל של Chrome היא Letter (1056px), תיבת עמוד A4 היא 1122.53px,
 * ולכן מסמך A4 של עמוד אחד יצא **שני גיליונות** — השני ריק. כלומר בדיוק
 * הבאג שכל הקובץ הזה בא לתקן, במסלול הכשל שלו.
 *
 * לכן יש מקור שני, זול ובטוח: `measurePrintPageSize` מודדת את תיבת העמוד
 * **המצוירת** (`.superdoc-page`). היא אינה שואלת את המנוע דבר, ולכן היא
 * עובדת גם כשה-API שלו הוא מה שנכשל. `@page { margin: 0 }` לבדו נשאר רק
 * למקרה שגם אין מה למדוד — כלומר אין מסמך על המסך בכלל.
 *
 * ## מה אינו מטופל, במפורש
 *
 * מסמך עם כמה מקטעים בגדלים שונים מקבל את הגודל של המקטע הראשון: ל-CSS יש
 * `@page` אחד למסמך, ו-named pages (`page: name`) דורשות שהמנוע יסמן כל עמוד
 * — הוא אינו עושה זאת. זה מתועד ולא מוסתר, וזה גם המקרה הנדיר.
 */
import type { SuperDoc } from 'superdoc';
import type { MaybePromise } from './document-api';

/**
 * המחלקות של המנוע שגלון ההדפסה מכוון אליהן.
 *
 * מוגדרות כאן, בקוד, ולא רק בסלקטור: `tests/contract/print.test.ts` מקבע אותן
 * מול ה-bundle של המנוע, ולכן שינוי שם במנוע מפיל בדיקה במקום להשאיר גלון
 * הדפסה שאינו תופס כלום ואיש אינו יודע. אותה סיבה שבגללה
 * `PAGE_BREAK_OPERATION` מיוצא ב-page-break.ts.
 *
 * `ENGINE_PAGE_CLASS` — תיבת העמוד המצוירת; `ENGINE_LAYOUT_CLASS` — המיכל
 * שנושא את ה-transform של הזום.
 */
export const ENGINE_PAGE_CLASS = 'superdoc-page';
export const ENGINE_LAYOUT_CLASS = 'superdoc-layout';

/** ה-`<style>` שנושא את `@page`. מזהה קבוע = אלמנט אחד שמתחדש, ולא ערימה. */
export const PRINT_PAGE_STYLE_ID = 'otzaria-print-page';

/**
 * `data-print-page-size` על שורש ה-HTML: גודל הדף שההדפסה האחרונה נשענה עליו.
 *
 * לא קוסמטי ולא רק אבחון — זהו הסימן היחיד מבחוץ למה שההדפסה חישבה, בדיוק
 * כמו `data-boot` ו-`data-document-direction`. שער ה-CDP נשען עליו, ובלעדיו
 * „הכפתור נלחץ” היה כל העדות שיש.
 */
export const PRINT_SIZE_DATASET_KEY = 'printPageSize';

/** מידות דף באינצ'ים, כפי שהמנוע מדווח עליהן. */
export interface PrintPageSize {
  widthIn: number;
  heightIn: number;
}

/**
 * גבולות שפיות למידות דף. אינם „גדלים מותרים” אלא סינון של תשובה שאינה תשובה:
 * `0`, שלילי, `NaN` או 400 אינץ' פירושם שהקריאה נכשלה, ו-`@page` כזה היה גרוע
 * מהיעדרו.
 */
const MIN_PAGE_INCHES = 0.5;
const MAX_PAGE_INCHES = 200;

/** מה שנקרא מ-`sections.list()`. רק המידות — כל השאר אינו נוגע להדפסה. */
interface SectionItem {
  pageSetup?: { width?: number; height?: number };
}

/** הצורה שנצרכת מ-`doc`. ראו ההסבר ב-document-defaults.ts למה מוגדרת ולא מיובאת. */
export interface PrintDocumentApi {
  sections?: {
    list?: () => MaybePromise<{ items?: readonly SectionItem[] } | undefined>;
  };
}

export interface PrintHost {
  activeEditor?: { doc?: PrintDocumentApi | null } | null;
}

/** ה-union מאפשר גם את המופע האמיתי וגם כפיל. ההסבר המלא ב-page-setup.ts. */
export type PrintTarget = SuperDoc | PrintHost | null | undefined;

export type PrintOutcome =
  | {
      ok: true;
      /** הגודל שנכתב ל-`@page`, או `null` כשלא נקרא. */
      size: PrintPageSize | null;
      /** הודעה שאינה שגיאה: ההדפסה יצאה, אבל יש מה לומר עליה. */
      warning?: string;
    }
  | { ok: false; message: string; reason: string };

/** האם המספר הוא מידה שאפשר להישען עליה. */
function isSaneInches(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= MIN_PAGE_INCHES &&
    value <= MAX_PAGE_INCHES
  );
}

/** עיגול כלפי מעלה לשלוש ספרות. ראו הערת הפתיחה — הכיוון הוא ההגנה. */
function ceilTo3(value: number): number {
  return Math.ceil(value * 1000) / 1000;
}

/**
 * קוראת את מידות הדף של המסמך.
 *
 * המקטע הראשון שיש לו שתי מידות שפויות, ולא הראשון בהכרח: מקטע בלי `pgSz`
 * מקבל `undefined` בפרויקציה, ומסמך שכזה עדיין יודע להדפיס לפי המקטע הבא.
 *
 * לעולם אינה זורקת ולעולם אינה מחזירה גודל מומצא: `null` פירושו „לא נקרא”,
 * וההדפסה תיפול חזרה על גודל הנייר שבדיאלוג — עם הודעה שאומרת זאת.
 */
export async function readPrintPageSize(host: PrintTarget): Promise<PrintPageSize | null> {
  const list = (host as PrintHost | null | undefined)?.activeEditor?.doc?.sections?.list;
  if (typeof list !== 'function') return null;

  let items: readonly SectionItem[];
  try {
    items = (await list())?.items ?? [];
  } catch (error) {
    // קריאת המקטעים שנכשלה אינה סיבה לא להדפיס. ללוג, וממשיכים בלי `size`.
    console.warn('[otzaria-word] קריאת גודל הדף להדפסה נכשלה', error);
    return null;
  }

  if (!Array.isArray(items)) return null;

  for (const item of items) {
    const width = item?.pageSetup?.width;
    const height = item?.pageSetup?.height;
    if (isSaneInches(width) && isSaneInches(height)) {
      return { widthIn: ceilTo3(width), heightIn: ceilTo3(height) };
    }
  }

  return null;
}

/** פיקסלים ל-אינץ' ב-CSS. 96 **בהגדרה** (`1in == 96px`), ולא מידה של מסך. */
const CSS_PX_PER_INCH = 96;

/**
 * מידות הדף כפי שהן מצוירות בפועל — המקור השני, כש-`readPrintPageSize` לא
 * החזירה מידה. ראו „וכשהקריאה נכשלת” בראש הקובץ: בלי זה הפלט הוא נייר
 * ברירת המחדל של הדפדפן, וגיליון ריק על כל עמוד.
 *
 * **`offsetWidth/offsetHeight` ולא `getBoundingClientRect`**, וזה לא עניין של
 * טעם: המלבן כולל את ה-transform, וה-transform כאן הוא הזום (`.superdoc-layout`
 * נושא `matrix(0.5, …)` ב-50%). מדידה דרכו הייתה מייצרת `@page` בחצי גודל
 * הדף — כלומר בדיוק תקלת הזום שהגלון מבטל. `offset*` הן קופסת הפריסה
 * ואינן רואות transform.
 *
 * המחיר: `offset*` הן מספרים שלמים, ולכן A4 (793.733×1122.53) נמדד 794×1123
 * ומתורגם ל-8.271×11.698 אינץ' במקום 8.269×11.694. ההפרש הוא כחמישית פיקסל
 * של לבן לכל עמוד, ובכיוון הבטוח בלבד — גיליון גדול מתיבת העמוד אינו יכול
 * לשבור עמוד, וזו אותה הנמקה כמו העיגול כלפי מעלה.
 */
export function measurePrintPageSize(root: Document): PrintPageSize | null {
  const page = root.querySelector<HTMLElement>(`.${ENGINE_PAGE_CLASS}`);
  if (!page) return null;

  const widthIn = page.offsetWidth / CSS_PX_PER_INCH;
  const heightIn = page.offsetHeight / CSS_PX_PER_INCH;
  // אותו סינון כמו בקריאה מהמנוע: 0 (אלמנט שאינו מצויר, וגם jsdom) או מידה
  // מופרכת אינם מידה, ו-`@page` כזה היה גרוע מהיעדרו.
  if (!isSaneInches(widthIn) || !isSaneInches(heightIn)) return null;

  return { widthIn: ceilTo3(widthIn), heightIn: ceilTo3(heightIn) };
}

/** „8.269in 11.694in”. מיוצאת כדי שהשער ב-CDP ישווה מול אותו נוסח בדיוק. */
export function pageSizeText(size: PrintPageSize): string {
  return `${size.widthIn}in ${size.heightIn}in`;
}

/**
 * חוק ה-`@page` שמוזרק.
 *
 * `margin: 0` בשני המצבים: לעמוד עצמו יש שוליים מה-DOCX, והשוליים שדפדפן
 * מוסיף כברירת מחדל נוספים עליהם — כלומר שוליים כפולים ותוכן שנדחק.
 */
export function pageRule(size: PrintPageSize | null): string {
  if (!size) return '@page { margin: 0; }';
  return `@page { size: ${pageSizeText(size)}; margin: 0; }`;
}

export interface PrintOptions {
  /** ברירת המחדל: המסמך של הדפדפן. מוחלף בבדיקות. */
  root?: Document;
  /** ברירת המחדל: `window.print`. מוחלף בבדיקות ובשער ה-CDP. */
  print?: () => void;
}

/**
 * כותבת את `@page` ואת התכונה על השורש. מוחזרת בנפרד מ-`printDocument` כדי
 * שהיא תהיה נבדקת בלי לזמן דיאלוג הדפסה.
 */
export function applyPrintPageSize(size: PrintPageSize | null, root: Document): void {
  const head = root.head ?? root.documentElement;
  let style = root.getElementById(PRINT_PAGE_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = root.createElement('style');
    style.id = PRINT_PAGE_STYLE_ID;
    head.appendChild(style);
  }
  style.textContent = pageRule(size);

  const dataset = root.documentElement?.dataset;
  if (!dataset) return;
  if (size) dataset[PRINT_SIZE_DATASET_KEY] = pageSizeText(size);
  else delete dataset[PRINT_SIZE_DATASET_KEY];
}

const NO_PAPER_WARNING =
  'גודל הדף לא נקרא מהמסמך — בדקו את גודל הנייר בדיאלוג ההדפסה';

/** גודל הדף נמסר אבל אוצריא דחתה אותו; ראו את הנפילה-לאחור ב-`exportPdfDocument`. */
const SIZE_ARG_REJECTED_WARNING =
  'גרסת אוצריא הזאת אינה מקבלת את גודל הדף של המסמך — בדקו את גודל הנייר בקובץ שנוצר';

/**
 * מכינה את הדף להדפסה ופותחת את דיאלוג ההדפסה.
 *
 * לעולם אינה זורקת: `window.print()` חסום בהקשרים מסוימים (WebView בלי הרשאת
 * הדפסה), וחריגה כאן הייתה מפילה את מטפל הלחיצה בלי שהמשתמש יראה דבר.
 */
export async function printDocument(
  host: PrintTarget,
  options: PrintOptions = {},
): Promise<PrintOutcome> {
  const root = options.root ?? document;
  const print = options.print ?? (() => window.print());

  // שני מקורות, בסדר הזה: המסמך מדויק, המדידה זמינה גם כשהמנוע אינו עונה.
  const size = (await readPrintPageSize(host)) ?? measurePrintPageSize(root);
  applyPrintPageSize(size, root);

  try {
    print();
  } catch (error) {
    return {
      ok: false,
      message: `ההדפסה לא נפתחה: ${error instanceof Error ? error.message : String(error)}`,
      reason: 'threw',
    };
  }

  return size ? { ok: true, size } : { ok: true, size: null, warning: NO_PAPER_WARNING };
}

/* ------------------------------------------------------------------ */
/* ייצוא ל-PDF                                                         */
/* ------------------------------------------------------------------ */

/**
 * שם קובץ מוצע לדיאלוג „שמור בשם”.
 *
 * אוצריא מסירה מפרידי נתיב בעצמה, ובכל זאת מנקים כאן את אותה קבוצת תווים
 * שאסורה בשמות קבצים ב-Windows — בדיוק כמו `docxFileName` — כדי ששם המסמך
 * לא יגיע לדיאלוג חצוי. הסיומת אינה נוספת: אוצריא מוסיפה `.pdf` בעצמה
 * ומחזירה את השם המלא.
 */
export function pdfSuggestedName(title: string): string {
  return title.replace(/[\\/:*?"<>|]/g, '').trim() || 'מסמך';
}

/** מה ש-`ui.exportPdf` מחזיר. */
export interface ExportPdfReply {
  saved?: boolean;
  name?: string | null;
}

/**
 * ארגומנטי העימוד של `ui.exportPdf` (אוצריא 0.9.97, API_REFERENCE.md §ui.exportPdf).
 *
 * `pageSize` **כמפה במ"מ ולא כשם קבוע**, גם כשהמסמך הוא A4 בדיוק. הגשר מקבל
 * את שני הצדדים (`_parsePdfLayout`), אבל השם הוא גודל תקני — 210×297 —
 * והמידות שנקראו מהמסמך עברו עיגול כלפי מעלה (210.04×297.03), *וגם* הוזרקו
 * ל-`@page`. שם היה מוסר לאוצריא נייר צר בשבריר מתיבת העמוד שאותו קוד בדיוק
 * הצהיר עליה — כלומר שתי השכבות סותרות, וזו הסתירה שהעיגול-כלפי-מעלה קיים
 * כדי למנוע (עמוד שנשבר לשני גיליונות).
 *
 * `orientation` מושמט בכוונה: הרוחב והגובה כבר נושאים את הכיוון, ודגל נוסף
 * מסתכן במנוע שמסובב את המידות פעם שנייה.
 */
export interface ExportPdfLayoutInput {
  pageSize?: { widthMm: number; heightMm: number };
  marginMm?: number;
  printBackgrounds?: boolean;
}

const MM_PER_INCH = 25.4;

/**
 * ההמרה לממ"ים של `ui.exportPdf`. העיגול כלפי מעלה לשתי ספרות — אותו כיוון
 * ואותה סיבה כמו `ceilTo3`: נייר שקטן מתיבת העמוד בשבריר שובר כל עמוד לשניים.
 */
export function pdfPageSizeMm(size: PrintPageSize): { widthMm: number; heightMm: number } {
  const ceil2 = (value: number): number => Math.ceil(value * 100) / 100;
  return { widthMm: ceil2(size.widthIn * MM_PER_INCH), heightMm: ceil2(size.heightIn * MM_PER_INCH) };
}

export interface ExportPdfOptions {
  /** ברירת המחדל: המסמך של הדפדפן. מוחלף בבדיקות. */
  root?: Document;
  /** שם מוצע בדיאלוג. */
  fileName?: string;
  /** כותרת הדיאלוג. */
  title?: string;
}

export type ExportPdfOutcome =
  | {
      ok: true;
      saved: true;
      /** שם הקובץ שנשמר. הנתיב המלא אינו מוחזר מאוצריא — במכוון. */
      name: string;
      size: PrintPageSize | null;
      warning?: string;
    }
  | { ok: true; saved: false }
  | { ok: false; message: string; reason: string };

/**
 * מייצאת את המסמך ל-PDF דרך `ui.exportPdf` של אוצריא.
 *
 * ## למה זה עובר דרך אותה הכנה כמו ההדפסה
 *
 * אוצריא מייצרת את ה-PDF **מדף התוסף עצמו**, ולכן מה שקובע את הפלט הוא בדיוק
 * מה שקובע אותו בהדפסה: הגלון ב-`styles/print.css` שמסתיר את המעטפת, ו-`@page`
 * עם מידות הדף של המסמך. בלי ההכנה הזאת ה-PDF היה מכיל את הרצועה ואת שורת
 * המצב, ועמוד A4 היה נשבר לשני גיליונות — אותן שלוש הבעיות שתועדו בראש הקובץ.
 *
 * ## שתי שכבות לאותו גודל דף — בכוונה
 *
 * מידות הדף נמסרות **גם** כארגומנטים לאוצריא (`pageSize`/`marginMm`, ראו
 * ExportPdfLayoutInput) וגם כ-`@page` מוזרק. הארגומנטים הם המחייבים — הם
 * מגיעים ל-`PrintJobSettings` של ה-WebView, שאינו מחויב לכבד `@page` של הדף.
 * ההזרקה נשארת כי היא מה שמשרת את `window.print()` (מסלול ההדפסה), ושתי
 * השכבות מחושבות מאותה קריאה אחת ל-`readPrintPageSize` — אין להן דרך לסתור.
 *
 * `marginMm: 0` ו-`printBackgrounds: true` נמסרים תמיד, גם כשהגודל לא נקרא:
 * השוליים כבר מצוירים בתוך תיבת העמוד מה-DOCX (שוליים של המנוע היו נוספים
 * עליהם — שוליים כפולים), והרקעים הם חלק מהמסמך (הצללת תאים, הדגשות) שמנועי
 * הדפסה משמיטים כברירת מחדל.
 *
 * ## ההזרקה, ולמה היא כאן
 *
 * `exportPdf` מוזרק ואינו נקרא מכאן: שכבת ה-engine אינה נוגעת ב-Host (אף
 * מודול ב-`src/engine/` אינו מייבא מ-`src/host/`), בדיוק כפי ש-`printDocument`
 * מקבל את `print`. מי שמחבר את השניים הוא App.vue.
 *
 * ## פעולת המשתמש
 *
 * אוצריא דורשת הפעלת-משתמש חולפת ובודקת אותה ישירות ב-WebView; קריאה מטיימר
 * או אחרי שרשרת `await` ארוכה נדחית ב-`forbidden`. הקריאה כאן ממתינה בדיוק
 * לדבר אחד — `sections.list()` לקריאת מידות הדף — שהוא הלוך-ושוב אחד למנוע
 * ומסתיים במילישניות, הרבה בתוך חלון ההפעלה. הוויתור עליו לא היה חוסך זמן
 * אמיתי והיה מייצר PDF בגודל נייר שגוי, וזו תקלה גרועה יותר.
 *
 * `forbidden` בכל זאת מטופל בשמו: אם אוצריא תדחה, המשתמש יקבל הסבר שאומר מה
 * לעשות ולא „הייצוא נכשל”.
 *
 * ## ארגומנט עימוד שנדחה אינו מבטל את הייצוא
 *
 * `invalid_params` על `pageSize` פירושו Host שאינו מכיר את הצורה שנשלחה —
 * ואז נשלחת קריאה שנייה בלי `pageSize` בכלל, ומה שקובע את גודל הנייר הוא
 * ה-`@page` המוזרק, כמו לפני שהארגומנטים נוספו. הייצוא מצליח עם אזהרה, ולא
 * נכשל על אופטימיזציה.
 *
 * הניסיון החוזר בטוח דווקא כאן: אוצריא מפרשת את ארגומנטי העימוד **לפני**
 * שהיא פותחת דיאלוג (נמדד ב-plugin_bridge_ui_print_test.dart: „ערכי עימוד
 * פסולים נדחים בלי לפתוח דיאלוג”), ולכן הדחייה הזאת אינה יכולה להשאיר קובץ
 * שנשמר או דיאלוג פתוח. הוא מוגבל ל-`invalid_params` בלבד ולסבב אחד.
 */
export async function exportPdfDocument(
  host: PrintTarget,
  exportPdf: (
    input: { fileName?: string; title?: string } & ExportPdfLayoutInput,
  ) => Promise<ExportPdfReply>,
  options: ExportPdfOptions = {},
): Promise<ExportPdfOutcome> {
  const root = options.root ?? document;

  // כמו בהדפסה, ומאותה סיבה בדיוק: ה-PDF נוצר מדף התוסף עצמו, ו-`@page` בלי
  // `size` מייצר בו גיליון ריק על כל עמוד.
  const size = (await readPrintPageSize(host)) ?? measurePrintPageSize(root);
  applyPrintPageSize(size, root);

  const base = {
    ...(options.fileName ? { fileName: options.fileName } : {}),
    ...(options.title ? { title: options.title } : {}),
    marginMm: 0,
    printBackgrounds: true,
  };

  let reply: ExportPdfReply;
  let sizeRejected = false;
  try {
    reply = await exportPdf({
      ...base,
      ...(size ? { pageSize: pdfPageSizeMm(size) } : {}),
    });
  } catch (error) {
    // הקוד מגיע מאוצריא עם קידומת (`error.forbidden`), ומקצת המקומות בלעדיה
    // (API_REFERENCE §קודי שגיאה) — ההשוואה בזנב, כמו ב-`isPermissionDenied`.
    const raw = (error as { code?: unknown } | null)?.code;
    const code = typeof raw === 'string' ? raw : '';
    if (code.endsWith('forbidden')) {
      return {
        ok: false,
        message: 'הייצוא ל-PDF דורש לחיצה ישירה על הכפתור — נסו שוב',
        reason: 'forbidden',
      };
    }

    // Host שאינו מכיר את צורת ה-`pageSize` שנשלחה — סבב שני בלעדיה, ראו
    // „ארגומנט עימוד שנדחה אינו מבטל את הייצוא”. רק כשהיה מה לדחות.
    if (!(size && code.endsWith('invalid_params'))) {
      return {
        ok: false,
        message: `הייצוא ל-PDF נכשל: ${error instanceof Error ? error.message : String(error)}`,
        reason: 'threw',
      };
    }

    console.warn('[otzaria-word] אוצריא דחתה את ארגומנט גודל הדף; ייצוא בלעדיו', error);
    sizeRejected = true;
    try {
      reply = await exportPdf(base);
    } catch (retryError) {
      const retryCode = (retryError as { code?: unknown } | null)?.code;
      if (typeof retryCode === 'string' && retryCode.endsWith('forbidden')) {
        return {
          ok: false,
          message: 'הייצוא ל-PDF דורש לחיצה ישירה על הכפתור — נסו שוב',
          reason: 'forbidden',
        };
      }
      return {
        ok: false,
        message: `הייצוא ל-PDF נכשל: ${
          retryError instanceof Error ? retryError.message : String(retryError)
        }`,
        reason: 'threw',
      };
    }
  }

  // ביטול אינו כישלון: המשתמש סגר את דיאלוג „שמור בשם”, וזו תשובה.
  if (!reply?.saved) return { ok: true, saved: false };

  const name = typeof reply.name === 'string' && reply.name ? reply.name : 'הקובץ';
  if (!size) return { ok: true, saved: true, name, size: null, warning: NO_PAPER_WARNING };
  return sizeRejected
    ? { ok: true, saved: true, name, size, warning: SIZE_ARG_REJECTED_WARNING }
    : { ok: true, saved: true, name, size };
}
