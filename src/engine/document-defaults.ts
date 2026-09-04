/**
 * ברירות המחדל של מסמך חדש: כיווניות עברית מימין לשמאל, וגודל דף A4.
 *
 * שתי פונקציות ושני דוחות ולא אחד — ההסבר למה אצל `applyHebrewPaperSize`.
 *
 * למה לא דרך פקודות ה-Ribbon, כפי שנעשה קודם: `direction-rtl` ו-`text-align`
 * הן פקודות **פסקה** בקטלוג של ה-controller, והוא מנתב אותן לפי הבחירה הנוכחית.
 * במסמך שנפתח כרגע אין עדיין סמן, ולכן שתיהן נכשלו ב-`selection-required`
 * (נמדד ב-CDP על ה-dist: `{"ok":false,"reason":"selection-required"}`), הכשל
 * נבלע ב-`void`, והמסמך נשאר משמאל לימין. הן גם היו מטפלות בפסקה אחת בלבד.
 *
 * מה נעשה כאן במקום, דרך ה-Document API הציבורי (`superdoc.activeEditor.doc`),
 * שאינו דורש בחירה — שלוש שכבות, בדיוק כפי ש-Word מייצג מסמך עברי:
 *
 * 1. **ברירת המחדל של הגלריה** (`styles.apply` על `docDefaults`, ערוץ הפסקה):
 *    `w:pPrDefault/w:bidi`. זו השכבה שקובעת לכל פסקה שתיווצר במסמך, ולכן היא
 *    זו שעונה על „כל מסמך חדש נפתח מימין לשמאל”.
 * 2. **כיווניות המקטע** (`sections.setSectionDirection`): `w:sectPr/w:bidi`.
 *    זה מה שהופך את המקטע עצמו לעברי — סדר עמודות, מיקום מספור.
 * 3. **הפסקה הקיימת** (`format.paragraph.setDirection`): המסמך הריק נפתח עם
 *    פסקה אחת שנוצרה לפני שהשינויים לעיל הוחלו, ולכן היא מקבלת את הכיווניות
 *    בעיצוב ישיר. בלי זה השורה הראשונה שהמשתמש מקליד בה נשארת LTR.
 *
 * `alignmentPolicy: 'preserve'` ולא `'matchDirection'`: נמדד שהמנוע כותב
 * `alignment: 'left'` תחת `matchDirection` בפסקה RTL — יישור פיזי לשמאל, כלומר
 * בדיוק ההפוך מהמבוקש. בלי יישור מפורש הפסקה נשענת על `bidi` לבדו, וזה גם מה
 * ש-Word עושה במסמך עברי: `w:bidi` בלי `w:jc`, והטקסט נצמד לימין מעצמו.
 *
 * הפעולות מוחלות על **מסמך חדש בלבד**. מסמך שנפתח מקובץ נושא את הכיווניות של
 * מי שכתב אותו, ואין לגעת בה.
 */
import type { SuperDoc } from 'superdoc';
import { applyPaperSize, PAPER_SIZES, TWIPS_PER_INCH, type PageSetupTarget } from './page-setup';

/** תוצאת ההחלה. `failures` בעברית — הן מגיעות לשורת המצב. */
export interface DocumentDefaultsReport {
  /** שמות השכבות שהוחלו בהצלחה, לפי סדר ההחלה. */
  applied: string[];
  /** תיאור בעברית לכל שכבה שנכשלה. */
  failures: string[];
}

/**
 * הצורה שנצרכת מ-`doc`. מוגדרת כאן ולא מיובאת: `BrowserDocumentApi` הוא הטיפוס
 * המלא של מאות פעולות, ובדיקה נגד fake הייתה מחייבת לממש את כולן.
 */
interface Receipt {
  success?: boolean;
  failure?: { code?: string; message?: string };
}

/**
 * מצב תלת-מצבי של תכונת OOXML בוליאנית, כפי שהמנוע מחזיר אותו:
 * `'on'` = הוצהר דלוק, `'off'` = הוצהר כבוי, `'inherit'` = **לא הוצהר כלל**.
 *
 * ההבחנה בין `'off'` ל-`'inherit'` היא כל ההבדל בין „המסמך ביקש משמאל לימין”
 * ל„המסמך לא אמר דבר”, וזה מה שמאפשר לתקן את השני בלי לדרוך על הראשון.
 */
export type StyleFlagState = 'on' | 'off' | 'inherit';

/**
 * הקבלה של `styles.apply`. שלושה שדות מעבר ל-`success`, וכל אחד מהם נדרש:
 *
 * - `changed` — האם באמת נכתב משהו. `success: true, changed: false` הוא תשובה
 *   חוקית ושכיחה (הערך כבר היה שם), ולכן הוא **אינו** סימן לכשל.
 * - `after` — המצב אחרי הפעולה. זה מה שקובע אם ההחלה הצליחה, ולא `success`:
 *   `success` אומר „הבקשה התקבלה ועובדה”, ו-`after` אומר „הערך אכן שם”. נמדד
 *   על המנוע שהקבלה חוזרת `{success: true, changed: false, after:
 *   {rightToLeft: 'on'}}` — כלומר בלי `after` אין דרך להבדיל בין „היה כבר
 *   מוחל” לבין „התקבל ולא נכתב”.
 * - `before` — המצב לפני. יחד עם `dryRun` הוא מסלול **קריאה** בלי כתיבה, וזה
 *   מה ש-`readDeclaredParagraphDirection` נשען עליו.
 */
interface StylesReceipt extends Receipt {
  changed?: boolean;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

/** קורא מצב תכונה מ-`before`/`after` של הקבלה, ומחזיר `null` על צורה לא מוכרת. */
export function readFlagState(
  map: Record<string, unknown> | undefined,
  key: string,
): StyleFlagState | null {
  const value = map?.[key];
  return value === 'on' || value === 'off' || value === 'inherit' ? value : null;
}

/** הקבלה שהמנוע מחזיר עשויה להיות סינכרונית או הבטחה — הפאסדה בדפדפן א-סינכרונית. */
type MaybePromise<T> = T | Promise<T>;

export interface DefaultsDocumentApi {
  blocks?: {
    list?: () => MaybePromise<{ blocks?: Array<{ nodeId?: string; nodeType?: string }> }>;
  };
  sections?: {
    list?: () => MaybePromise<{
      items?: Array<{
        address?: unknown;
        sectionDirection?: string;
        /** באינצ'ים, כמו ב-page-setup.ts. */
        pageSetup?: { width?: number; height?: number };
      }>;
    }>;
    setSectionDirection?: (input: {
      target: unknown;
      direction: 'rtl' | 'ltr';
    }) => MaybePromise<Receipt>;
  };
  styles?: {
    apply?: (
      input: {
        target: { scope: 'docDefaults'; channel: 'paragraph' };
        patch: { rightToLeft?: boolean };
      },
      options?: { dryRun?: boolean },
    ) => MaybePromise<StylesReceipt>;
  };
  format?: {
    paragraph?: {
      setDirection?: (input: {
        target: { kind: 'block'; nodeType: string; nodeId: string };
        direction: 'rtl' | 'ltr';
        alignmentPolicy?: 'preserve' | 'matchDirection';
      }) => MaybePromise<Receipt>;
    };
  };
}

/** מה שנדרש מ-SuperDoc: רק הפאסדה של המסמך. */
export interface DefaultsHost {
  activeEditor?: { doc?: DefaultsDocumentApi | null } | null;
}

/** הודעה בעברית מקבלה שנכשלה, כולל הקוד של המנוע — בלעדיו אין על מה לדווח. */
function failureText(layer: string, receipt: Receipt | undefined): string {
  const code = receipt?.failure?.code;
  return code ? `${layer} (${code})` : layer;
}

/**
 * מחילה את ברירות המחדל של מסמך עברי חדש.
 *
 * לעולם אינה זורקת: כשל בכיווניות אינו סיבה להפיל פתיחת מסמך, והדיווח חוזר
 * ב-`report` כדי שהקורא יחליט אם להציג אותו.
 */
export async function applyHebrewDocumentDefaults(
  superdoc: SuperDoc | DefaultsHost,
): Promise<DocumentDefaultsReport> {
  const report: DocumentDefaultsReport = { applied: [], failures: [] };
  const doc = (superdoc as DefaultsHost).activeEditor?.doc;

  if (!doc) {
    report.failures.push('המנוע אינו חושף את ה-Document API');
    return report;
  }

  // 1. ברירת המחדל לכל פסקה במסמך.
  const applyStyles = doc.styles?.apply;
  if (!applyStyles) {
    report.failures.push('ברירת המחדל של הגלריה אינה נתמכת במנוע');
  } else {
    try {
      const receipt = await applyStyles({
        target: { scope: 'docDefaults', channel: 'paragraph' },
        patch: { rightToLeft: true },
      });
      if (receipt?.success === false) {
        report.failures.push(failureText('ברירת המחדל של הגלריה נכשלה', receipt));
      } else if (readFlagState(receipt?.after, 'rightToLeft') === 'on') {
        report.applied.push('docDefaults');
      } else {
        // `success: true` ו-`after` שאינו `'on'`: הבקשה התקבלה ועובדה, והערך
        // אינו שם. זה הכשל השקט שהשכבה הזאת חשופה לו — היא היחידה מהשלוש
        // שקובעת לפסקות **הבאות**, ולכן כשל בה אינו נראה במסמך שנפתח כרגע
        // אלא רק כשהמשתמש מקיש Enter. `changed` בכוונה אינו נבדק: הוא `false`
        // גם כשהערך כבר היה מוחל, וזו הצלחה.
        report.failures.push(
          `ברירת המחדל של הגלריה לא נכתבה (המנוע דיווח rightToLeft=${
            readFlagState(receipt?.after, 'rightToLeft') ?? 'לא ידוע'
          })`,
        );
      }
    } catch (error) {
      report.failures.push(`ברירת המחדל של הגלריה שגתה: ${describe(error)}`);
    }
  }

  // 2. כיווניות המקטע.
  try {
    const sections = await doc.sections?.list?.();
    const address = sections?.items?.[0]?.address;
    const setSectionDirection = doc.sections?.setSectionDirection;
    if (!address || !setSectionDirection) {
      report.failures.push('כיווניות המקטע אינה נתמכת במנוע');
    } else {
      const receipt = await setSectionDirection({ target: address, direction: 'rtl' });
      if (receipt?.success === false) {
        report.failures.push(failureText('כיווניות המקטע נכשלה', receipt));
      } else {
        report.applied.push('section');
      }
    }
  } catch (error) {
    report.failures.push(`כיווניות המקטע שגתה: ${describe(error)}`);
  }

  // 3. הפסקה שהמסמך נפתח איתה.
  try {
    const listed = await doc.blocks?.list?.();
    const block = listed?.blocks?.[0];
    const setDirection = doc.format?.paragraph?.setDirection;
    if (!block?.nodeId || !setDirection) {
      report.failures.push('כיווניות הפסקה הראשונה אינה נתמכת במנוע');
    } else {
      const receipt = await setDirection({
        target: { kind: 'block', nodeType: block.nodeType ?? 'paragraph', nodeId: block.nodeId },
        direction: 'rtl',
        alignmentPolicy: 'preserve',
      });
      if (receipt?.success === false) {
        report.failures.push(failureText('כיווניות הפסקה הראשונה נכשלה', receipt));
      } else {
        report.applied.push('paragraph');
      }
    }
  } catch (error) {
    report.failures.push(`כיווניות הפסקה הראשונה שגתה: ${describe(error)}`);
  }

  return report;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * גודל הדף של מסמך חדש. `'a4'` הוא מזהה ב-`PAPER_SIZES`, וכל המידות והקוד
 * (`w:pgSz/@w:code`) נלקחים משם.
 */
export const NEW_DOCUMENT_PAPER_SIZE = 'a4';

/** תוצאת החלת גודל הדף. `failure` בעברית — היא מגיעה לשורת המצב. */
export interface DocumentPaperSizeReport {
  applied: boolean;
  /** תיאור בעברית של הכשל. מחרוזת ריקה כשהוחל. */
  failure: string;
}

/**
 * מחילה A4 על מסמך חדש.
 *
 * **למה נדרש**: המסמך הריק של המנוע הוא Letter — נמדד ב-`w:pgSz w:w="12240"
 * w:h="15840"` ב-blank docx הארוז (ראו הערת הפתיחה של page-setup.ts). למסמך
 * עברי זה שגוי: A4 הוא התקן בישראל, Word בעברית פותח A4, וזה גם מה שכל מדפסת
 * כאן טוענת. מסמך שנערך Letter ונדפס A4 יוצא בפריסה אחרת מזו שנראתה על המסך.
 *
 * **למה פונקציה ודוח נפרדים ולא שכבה רביעית בדוח הכיווניות**: `App.vue` מצהיר
 * `data-document-direction="rtl"` על שורש ה-HTML רק כשכל שכבות הכיווניות
 * הצליחו, ושער `npm run check:rtl` נשען על התכונה הזאת ועל הנוסח „כיווניות”
 * בלוג. כשל בגודל הדף אינו כשל כיווניות ואסור לו להפיל את השער — ולכן דוח
 * משלו, הודעה משלו, ובלי המילה „כיווניות” בתוכה.
 *
 * ההחלה על **מסמך חדש בלבד**, מאותו טעם כמו הכיווניות: מסמך שנפתח מקובץ נושא
 * את גודל הדף שמי שכתב אותו בחר, ואין לשנות אותו בגלל שנפתח כאן.
 *
 * לעולם אינה זורקת: `applyPaperSize` בולעת גם קבלה שנכשלה וגם זריקה מהמנוע,
 * ומחזירה אותן כתוצאה.
 */
/** סטייה מותרת בהשוואת גודל דף שחזר מהמנוע באינצ'ים — עיגול של twips. */
const PAGE_SIZE_TOLERANCE_TWIPS = 2;

/**
 * האם המסמך שנפתח כבר נושא את ברירות המחדל העבריות — קריאה אחת, בלי כתיבה.
 *
 * למסמך חדש שנפתח מהתבנית (engine/blank-document.ts): כשזה מחזיר `true` אין
 * צורך בשלוש המוטציות של `applyHebrewDocumentDefaults`, וכשלא — הקורא נופל
 * אליהן. ברירת המחדל של הגלריה אינה נקראת כאן: היא ב-`styles.xml` של אותה
 * תבנית, ומקטע RTL בגודל A4 הוא עדות שהתבנית היא שנפתחה.
 */
export async function verifyHebrewDocumentDefaults(superdoc: SuperDoc | DefaultsHost): Promise<boolean> {
  const list = (superdoc as DefaultsHost).activeEditor?.doc?.sections?.list;
  if (!list) return false;
  const a4 = PAPER_SIZES.find((size) => size.id === NEW_DOCUMENT_PAPER_SIZE);
  if (!a4) return false;
  try {
    const first = (await list())?.items?.[0];
    if (!first || first.sectionDirection !== 'rtl') return false;
    const width = first.pageSetup?.width;
    const height = first.pageSetup?.height;
    if (typeof width !== 'number' || typeof height !== 'number') return false;
    return (
      Math.abs(width * TWIPS_PER_INCH - a4.widthTwips) <= PAGE_SIZE_TOLERANCE_TWIPS &&
      Math.abs(height * TWIPS_PER_INCH - a4.heightTwips) <= PAGE_SIZE_TOLERANCE_TWIPS
    );
  } catch {
    return false;
  }
}

export async function applyHebrewPaperSize(
  superdoc: PageSetupTarget,
): Promise<DocumentPaperSizeReport> {
  const outcome = await applyPaperSize(superdoc, NEW_DOCUMENT_PAPER_SIZE);
  return outcome.ok ? { applied: true, failure: '' } : { applied: false, failure: outcome.message };
}
