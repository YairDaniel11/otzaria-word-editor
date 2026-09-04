/**
 * „ברירות מחדל למסמך" — גופן וגודל ברירת המחדל של המסמך כולו, דרך
 * `styles.apply` על `docDefaults`, ערוץ ה-run (`w:rPrDefault/w:rPr`).
 *
 * ## מה שנמדד לפני שנכתבה כאן השורה הראשונה
 *
 * Chrome headless על ה-dist הארוז, פירוק `word/styles.xml` לכל סבב:
 *
 * ### היחידות ב-docDefaults הן גולמיות OOXML — ושונות מכל שאר ה-API
 *
 *     patch { fontSize: 14 }  → <w:sz w:val="14"/>
 *     before: { fontSize: 24 } (ברירת המחדל של המסמך הריק = 12pt)
 *
 * כלומר **חצאי-נקודות**, כמו ב-XML, ולא נקודות כמו ב-`format.fontSize`
 * (שם 24 → sz 48). מי ששולח נקודות ישירות קובע גופן בגודל חצי מהמבוקש.
 * לכן ההמרה pt→חצאי-נקודות יושבת כאן, בקריאה למנוע. `fontFamily` הוא
 * record `{ascii,hAnsi,cs}` ונכתב כמות שהוא ל-`w:rFonts`.
 *
 * ### `dryRun` הוא קריאת המצב היחידה
 *
 * אין `styles.get`; `apply(...,{dryRun:true})` מחזיר `before/after` בלי לגעת.
 * `readDocStyleDefaults` משתמש בזה כדי להציג את הגודל הנוכחי בדיאלוג.
 *
 * ### חזרה זהה אינה NO_OP אלא `changed:false`
 *
 * `success:true, changed:false` — שונה מכל מרחב אחר. מבחינת המשתמש זו
 * הצלחה בדיוק כמו NO_OP.
 *
 * ## מה נמדד ולא נשלח — הכרעת הגל על מסלול החלת סגנון
 *
 * `format.paragraph.setStyle/setStyleRef/clearStyle` מחזירות
 * `CAPABILITY_UNAVAILABLE` ("not a supported v2 browser Document API
 * operation") **למרות ש-`capabilities.get()` מדווח עליהן `available:true`**
 * — הסתירה שמאשרת את כלל „available אינו הוכחה". הפקודה `linked-style`
 * (engine/command-adapter) נשארת המסלול היחיד להחלת סגנון על תוכן, ואין
 * להוסיף מסלול שני. `resetDirectFormatting` כן עובד, וכבר מיוצג בפקודה
 * „נקה עיצוב".
 */
import type { SuperDoc } from 'superdoc';
import type { CommandOutcome } from './command-adapter';
import { receiptFailureText, thrownText, type DocReceipt } from './document-api';

const UNAVAILABLE_TEXT = 'אינו זמין בגרסה זו';

/** המרה: נקודות (מה שהמשתמש חושב בו) → חצאי-נקודות (מה ש-docDefaults מקבל). */
export function pointsToHalfPoints(pt: number): number {
  return Math.round(pt * 2);
}

/** המרה הפוכה, לתצוגה. */
export function halfPointsToPoints(hp: number): number {
  return hp / 2;
}

export interface DocStyleDefaultsPatch {
  /** שם הגופן לברירת המחדל (יוחל על ascii/hAnsi/cs יחד). */
  fontFamily?: string;
  /** גודל ברירת המחדל בנקודות. */
  fontSizePt?: number;
}

interface StyleApplyReceipt {
  success?: boolean;
  changed?: boolean;
  failure?: { code?: string; message?: string };
  before?: Record<string, unknown>;
}

export interface DocDefaultsDocumentApi {
  styles?: {
    apply?: (
      input: {
        target: { scope: 'docDefaults'; channel: 'run' | 'paragraph' };
        patch: Record<string, unknown>;
      },
      options?: { dryRun?: boolean },
    ) => MaybePromise<StyleApplyReceipt>;
  };
}

export interface DocDefaultsHost {
  activeEditor?: { doc?: DocDefaultsDocumentApi | null } | null;
}

export type DocDefaultsTarget = SuperDoc | DocDefaultsHost | null | undefined;

type MaybePromise<T> = T | Promise<T>;

function docOf(host: DocDefaultsTarget): DocDefaultsDocumentApi | null {
  return (host as DocDefaultsHost | null | undefined)?.activeEditor?.doc ?? null;
}

/**
 * קוראת את גודל ברירת המחדל הנוכחי, דרך dryRun — הקריאה היחידה שיש.
 * מחזירה נקודות, או `null` כשהמנוע אינו יכול לענות (לא כשל: דיאלוג נפתח
 * על שדה ריק).
 *
 * ## למה `fontSizeCs` קודם, ולא `fontSize`
 *
 * הכתיבה (`applyDocStyleDefaults`) מציבה את שני הערוצים באותו ערך, אבל
 * **המסמך שנקרא לא בהכרח נכתב כאן**: מסמך שהגיע מ-Word יכול להחזיק
 * `w:sz="22"` (לטיני, ‏11 נק') לצד `w:szCs="32"` (עברי, ‏16 נק') — צירוף
 * שכיח בספרי קודש, שבהם הגוף העברי גדול והלועזי קטן.
 *
 * הקריאה שהייתה כאן החזירה את `fontSize` בלבד, כלומר 11, והדיאלוג הציג
 * אותו כ„גודל ברירת המחדל”. מי שביקש לתקן את הלטיני והקליד 12 היה **מקטין
 * את כל העברית מ-16 ל-12** — שינוי שלא ביקש, על מספר שלא ראה. לפני שהכתיבה
 * הפכה לדו-ערוצית זה לא יכול היה לקרות, מפני ש-`szCs` לא נגע כלל; מרגע
 * שהיא נכתבת, הקריאה חייבת להדביק אותה.
 *
 * לכן `fontSizeCs` הוא המדווח: זהו עורך עברי, והמספר שהמשתמש רואה חייב
 * להיות זה שחל על הטקסט שהוא כותב. `fontSize` נשאר כנפילה למסמך שאין בו
 * `szCs` כלל.
 */
export async function readDefaultFontSizePt(host: DocDefaultsTarget): Promise<number | null> {
  const apply = docOf(host)?.styles?.apply;
  if (typeof apply !== 'function') return null;

  let receipt: StyleApplyReceipt;
  try {
    receipt = await apply(
      // **שני הערוצים בבקשה**, לא רק אחד: ה-`before` שחוזר מתאר את השדות
      // שנשלחו, ולכן בקשה על `fontSize` בלבד לא הייתה מחזירה `fontSizeCs`
      // אף פעם — והנפילה שמתחת הייתה נבלעת תמיד, כלומר התיקון היה מדומה.
      {
        target: { scope: 'docDefaults', channel: 'run' },
        patch: { fontSize: 0, fontSizeCs: 0 },
      },
      { dryRun: true },
    );
  } catch {
    return null;
  }

  const cs = receipt?.before?.fontSizeCs;
  if (typeof cs === 'number') return halfPointsToPoints(cs);
  const ascii = receipt?.before?.fontSize;
  return typeof ascii === 'number' ? halfPointsToPoints(ascii) : null;
}

/**
 * מחילה ברירות מחדל לגופן על המסמך כולו (docDefaults/run).
 *
 * לעולם אינה זורקת. `changed:false` (חזרה זהה) היא הצלחה — ראו הערת הפתיחה.
 */
export async function applyDocStyleDefaults(
  host: DocDefaultsTarget,
  patch: DocStyleDefaultsPatch,
): Promise<CommandOutcome> {
  const failedAction = 'שינוי ברירות המחדל נכשל';

  const inline: Record<string, unknown> = {};

  if (patch.fontFamily !== undefined) {
    const name = typeof patch.fontFamily === 'string' ? patch.fontFamily.trim() : '';
    if (name === '' || name.length > 100) {
      return { ok: false, message: `${failedAction}: שם הגופן נדרש וקצר מ-100 תווים`, reason: 'invalid-font-family' };
    }
    inline.fontFamily = { ascii: name, hAnsi: name, cs: name };
  }

  if (patch.fontSizePt !== undefined) {
    const halfPoints =
      typeof patch.fontSizePt === 'number' && Number.isFinite(patch.fontSizePt)
        ? pointsToHalfPoints(patch.fontSizePt)
        : NaN;
    if (!Number.isInteger(halfPoints) || halfPoints <= 0 || halfPoints > 1600) {
      return { ok: false, message: `${failedAction}: הגודל חייב להיות בין 0.5 ל-800 נקודות`, reason: 'invalid-font-size' };
    }
    inline.fontSize = halfPoints;
    /*
     * `fontSizeCs` לצד `fontSize`, אחרת הגודל אינו חל על עברית בכלל.
     *
     * `fontSize` הוא `w:sz` והוא חל על טקסט לטיני; טקסט עברי הוא complex
     * script ונצבע לפי `w:szCs`. המסמך הריק של המנוע נושא את **שניהם**
     * ב-docDefaults (‏`w:sz="24"` ו-`w:szCs="24"`), ולכן כתיבה של `sz`
     * לבדו משאירה את העברית על 12 נקודות בעוד המשתמש ביקש 14 — שינוי
     * שנראה כאילו לא קרה.
     *
     * זו הייתה אסימומטריה בת שדה אחד: ערוץ המשפחה שמעל כבר כותב
     * `{ ascii, hAnsi, cs }` ומכסה את שלושת הערוצים. `fontSizeCs` הוא
     * `runAttribute('fontSizeCs', 'number', 'w:szCs')` בחוזה של המנוע.
     *
     * ערך אחד לשניהם, ולא שדה נפרד בממשק: „גודל ברירת המחדל” הוא מספר אחד
     * מבחינת מי שיושב מול המסך, והפרדה בין שני הערוצים היא בדיוק סוג
     * ההגדרה שמייצרת מסמך שנראה שבור בלי שאיש יודע למה.
     */
    inline.fontSizeCs = halfPoints;
  }

  if (Object.keys(inline).length === 0) {
    return { ok: false, message: `${failedAction}: לא נבחר שום שינוי`, reason: 'empty-patch' };
  }

  const apply = docOf(host)?.styles?.apply;
  if (typeof apply !== 'function') {
    return { ok: false, message: `${failedAction}: ${UNAVAILABLE_TEXT}`, reason: 'command-unsupported' };
  }

  let receipt: DocReceipt;
  try {
    receipt = await apply({ target: { scope: 'docDefaults', channel: 'run' }, patch: inline });
  } catch (error) {
    return { ok: false, message: thrownText(failedAction, error), reason: 'threw' };
  }

  // `changed:false` = הערכים כבר כאלה. הצלחה מבחינת המשתמש (ראו הערת הפתיחה);
  // כל כשל אחר — קבלה עם failure.
  if (receipt?.success === false) {
    return { ok: false, message: receiptFailureText(failedAction, receipt), reason: receipt.failure?.code };
  }

  return { ok: true };
}
