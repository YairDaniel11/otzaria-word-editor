/**
 * ייצוא לפורמט ספר של אוצריא: טקסט פשוט, פסקה אחת = שורה אחת, כותרות כתגי
 * `<h1>`–`<h6>` בתחילת שורה.
 *
 * ## החוזה של הצד השני
 *
 * הפורמט אינו המצאה של התוסף — הוא חוזה מתועד באוצריא עצמה:
 * `lib/utils/text/otzaria_markup.dart` (שמכריז על עצמו כמקור היחיד) ו-
 * `docs/document_conversion_matrix.md`. שלוש הנקודות שהמודול הזה חייב להן:
 *
 * 1. **שורה = יחידת כתובת.** אוצריא ממספרת שורות (`content.split('\n')`),
 *    וקישורים, סימניות והערות אישיות מצביעים על אינדקס שורה. לכן אסור `\n`
 *    בתוך פסקה — שבירת שורה רכה בתוך פסקה מתורגמת ל-`<br>`, שהוא חלק
 *    מתת-קבוצת ה-HTML המותרת שם.
 * 2. **כותרת = שורה שמתחילה ב-`<h#>`.** שני הפרסרים של אוצריא
 *    (`toc_parser.dart` ו-`generator.dart::detectHeaderLevel`) בודקים
 *    `startsWith('<h1'..'<h6')` — כותרת עטופה במשהו אחר אינה כותרת.
 * 3. **טקסט חופשי חייב escaping.** `<` גולמי בטקסט המסמך היה נקרא שם כתג.
 *
 * ## מיפוי הרמות — בדיוק כמו ממיר ה-DOCX של אוצריא, בלי היסט
 *
 * `Title` → `<h1>`, ‏`Heading N` → `<h(N)>`, עד תקרה ב-`<h6>`; ושורת `<h1>`
 * עם שם המסמך נכתבת **תמיד** ראשונה.
 *
 * זה אינו עניין של טעם: `docx_to_otzaria.dart` הוא המימוש הייחוסי לאותו
 * פורמט בדיוק, והוא עושה בדיוק את זה — `_headingLevelFromStyleName` מחזיר
 * `title`→1 ו-`heading N`→N, `ooxmlWordArchiveToText` פותח את הפלט ב-
 * `<h1>שם הספר</h1>`, ומטריצת ההמרה מסמנת ל-DOCX ‏`Heading 1`→`<h1>` (ההיסט
 * בהערה ⁵ הוא של HTML/EPUB, שם `<h1>` שבמסמך הוא שם המסמך). גרסה קודמת של
 * המודול הזה הזיזה רמה: אותו קובץ היה מקבל עץ ניווט אחר לפי המסלול שבו נכנס
 * לספרייה, ו-`Heading 5` ו-`Heading 6` נמחצו שניהם ל-`<h6>` בגלל התקרה —
 * רמה שהייבוא של אוצריא שומר.
 *
 * `headingLevel` של המנוע קודם ל-`styleId`, כמו ש-`w:outlineLvl` קודם שם לשם
 * הסגנון. הוא 1-בסיסי (‏`Heading 1` = 1), ולכן נכנס כמות שהוא.
 *
 * ## מה מושמט, במפורש
 *
 * פסקאות ריקות אינן מיוצאות: באוצריא כל שורה היא כתובת, ושורת-כתובת ריקה
 * אינה שווה את המרווח החזותי. עיצוב בתוך פסקה (מודגש, הערות שוליים) אינו
 * מיוצא בשלב הזה — `blocks.list` מחזיר את הטקסט הקנוני בלבד, וזה הייצוא
 * ה„פשוט” במכוון. נאמנות מלאה דורשת את `doc.getHtml` ושכבת התאמה ל-whitelist
 * של אוצריא — הרחבה נפרדת אם תידרש.
 */
import type { SuperDoc } from 'superdoc';
import type { MaybePromise } from './document-api';
import { thrownText } from './document-api';
import { stripWordExtension } from './export';
import { NO_DOCUMENT_TEXT } from './shulchan/shulchan-doc';

/** מה שנצרך מ-`blocks.list` — כמו ב-shulchan-doc.ts, בתוספת שדות הכותרת. */
interface BookBlockEntry {
  nodeId?: unknown;
  text?: unknown;
  styleId?: unknown;
  headingLevel?: unknown;
}

export interface OtzariaBookDocumentApi {
  blocks?: {
    list?: (input: {
      includeText: boolean;
      offset: number;
      limit: number;
    }) => MaybePromise<{ blocks?: readonly BookBlockEntry[] } | undefined>;
  };
}

export interface OtzariaBookHost {
  activeEditor?: { doc?: OtzariaBookDocumentApi | null } | null;
}

/** ה-union מאפשר גם את המופע האמיתי וגם כפיל. ההסבר המלא ב-page-setup.ts. */
export type OtzariaBookTarget = SuperDoc | OtzariaBookHost | null | undefined;

/** אותם גבולות דפדוף כמו ב-search.ts וב-shulchan-doc.ts — כיסוי מלא או כשל גלוי. */
const BLOCKS_PAGE_SIZE = 500;
const BLOCKS_MAX_PAGES = 50;

/** תקרת הרמות של אוצריא: `detectHeaderLevel` מכיר `<h1>`–`<h6>` בלבד. */
const MAX_HEADING = 6;

export interface OtzariaBookResult {
  /** תוכן הקובץ: שורות מופרדות `\n`, בלי שורה ריקה בסוף. */
  text: string;
  lineCount: number;
  headingCount: number;
  /** האם שורת `<h1>` עם שם המסמך נכתבה (כלומר: שם המסמך אינו ריק). */
  titleAdded: boolean;
}

export type OtzariaBookOutcome =
  | ({ ok: true } & OtzariaBookResult)
  | { ok: false; message: string; reason: string };

const FAILED_ACTION = 'הייצוא לספר אוצריא נכשל';

/**
 * רמת הכותרת של בלוק, או `null` לפסקת גוף.
 *
 * `headingLevel` מהמנוע קודם ל-`styleId` — הוא מגיע מ-outline level אמיתי,
 * וזה גם סדר העדיפות ב-`docx_to_otzaria.dart`. `styleId` הוא הגיבוי:
 * מסמכים שהכותרות בהם הן סגנון בלי outline.
 *
 * הנרמול (`heading 1` / `Heading-1` → `heading1`) הוא זה של `styleKey` ב-
 * style-gallery.ts, ומאותה סיבה: תבניות Word אינן עקביות ברישיות, ברווחים
 * ובמקפים. גם השם העברי מזוהה, כמו שהממיר של אוצריא מזהה `כותרת\s*([1-6])` —
 * תבנית עברית יכולה לתת לסגנון מזהה עברי.
 */
export function otzariaHeadingLevel(
  styleId: string | null | undefined,
  headingLevel: number | undefined,
): number | null {
  if (typeof headingLevel === 'number' && Number.isInteger(headingLevel) && headingLevel >= 1) {
    return Math.min(headingLevel, MAX_HEADING);
  }

  const key =
    typeof styleId === 'string' ? styleId.trim().toLowerCase().replace(/[\s_-]+/g, '') : '';
  if (key === 'title') return 1;

  const match = /^(?:heading|כותרת)([1-9])$/.exec(key);
  return match ? Math.min(Number(match[1]), MAX_HEADING) : null;
}

/** escaping לטקסט חופשי — `<` גולמי היה נקרא באוצריא כתג. הסדר קובע: `&` ראשון. */
function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * שורת אוצריא אחת מתוך בלוק: escaping, ואז `\n` פנימי (שבירה רכה) ל-`<br>` —
 * אחרי ה-escaping, כדי שה-`<br>` שנוצר לא יימלט בעצמו. גם `\r` נאסף: מפיק
 * שכותב `\r\n` היה משאיר `\r` תלוש בתוך השורה.
 *
 * מחזירה `''` לפסקה שאין בה טקסט גלוי — גם כשהיא רק שבירה רכה. בלי הבדיקה
 * הזאת פסקה כזאת הייתה מייצרת שורת `<br>` בודדת, כלומר בדיוק אותה
 * שורת-כתובת ריקה שהמודול מדלג עליה.
 */
function lineText(raw: string): string {
  const line = escapeText(raw).replace(/[\r\n]+/g, '<br>').trim();
  return line.replace(/<br>/g, '').trim() === '' ? '' : line;
}

/**
 * שם קובץ מוצע: אותו ניקוי כמו `documentFileName` — כולל קילוף סיומת Word,
 * שאחרת „ספר.docx” היה מוצע כ„ספר.docx.txt” — עם סיומת `txt`.
 */
export function otzariaBookFileName(title: string): string {
  const clean = stripWordExtension(title.replace(/[\\/:*?"<>|]/g, '').trim()) || 'ספר';
  return `${clean}.txt`;
}

/**
 * בונה את תוכן הספר מהמסמך הפתוח.
 *
 * לעולם אינה מחזירה כיסוי חלקי: קריאת בלוקים שנכשלה באמצע היא `ok: false`,
 * לא ספר קטוע — ספר חסר-סוף שנקלט לספרייה גרוע מכשל גלוי (אותו שיקול כמו
 * ב-search.ts). וגם תקרת הדפדוף היא כשל ולא קטיעה: כאן, בשונה מהחיפוש,
 * התוצאה נכתבת לקובץ שנקלט לספרייה, וקישורים וסימניות ננעלים על מספרי
 * השורות שלו — ספר שנגמר באמצע הוא נזק שקט וקשה לאיתור.
 */
export async function buildOtzariaBook(
  host: OtzariaBookTarget,
  documentTitle: string,
): Promise<OtzariaBookOutcome> {
  const list = (host as OtzariaBookHost | null | undefined)?.activeEditor?.doc?.blocks?.list;
  if (typeof list !== 'function') {
    return { ok: false, message: `${FAILED_ACTION}: ${NO_DOCUMENT_TEXT}`, reason: 'command-unsupported' };
  }

  const lines: string[] = [];
  let headingCount = 0;
  let complete = false;

  let offset = 0;
  try {
    for (let page = 0; page < BLOCKS_MAX_PAGES; page += 1) {
      const result = await list({ includeText: true, offset, limit: BLOCKS_PAGE_SIZE });
      const entries = result?.blocks ?? [];
      for (const entry of entries) {
        const text = typeof entry?.text === 'string' ? lineText(entry.text) : '';
        if (!text) continue; // פסקה ריקה — מושמטת, ראו הערת הפתיחה.

        const level = otzariaHeadingLevel(
          typeof entry.styleId === 'string' ? entry.styleId : null,
          typeof entry.headingLevel === 'number' ? entry.headingLevel : undefined,
        );
        if (level === null) {
          lines.push(text);
        } else {
          lines.push(`<h${level}>${text}</h${level}>`);
          headingCount += 1;
        }
      }
      // עמוד שאינו מלא הוא סוף המסמך; עמוד מלא בסבב האחרון פירושו שנשאר עוד.
      if (entries.length < BLOCKS_PAGE_SIZE) {
        complete = true;
        break;
      }
      offset += entries.length;
    }
  } catch (error) {
    return { ok: false, message: thrownText(FAILED_ACTION, error), reason: 'threw' };
  }

  if (!complete) {
    return {
      ok: false,
      message: `${FAILED_ACTION}: המסמך גדול מ-${BLOCKS_PAGE_SIZE * BLOCKS_MAX_PAGES} פסקאות`,
      reason: 'too-large',
    };
  }

  if (lines.length === 0) {
    return { ok: false, message: 'המסמך ריק — אין מה לייצא לספר', reason: 'empty' };
  }

  // שורת שם הספר ראשונה, תמיד — כמו `ooxmlWordArchiveToText`, וגם כשיש
  // במסמך פסקת `Title`: היא שורש עץ הניווט, ו„תלוי אם המסמך מכיל כותרת”
  // היה נותן לאותו ספר שני מבנים אפשריים.
  const bookTitle = escapeText(documentTitle.trim());
  const titleAdded = bookTitle !== '';
  if (titleAdded) {
    lines.unshift(`<h1>${bookTitle}</h1>`);
    headingCount += 1;
  }

  return { ok: true, text: lines.join('\n'), lineCount: lines.length, headingCount, titleAdded };
}
