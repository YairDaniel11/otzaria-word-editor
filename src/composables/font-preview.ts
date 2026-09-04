/**
 * העיתוי של התצוגה החיה בבורר הגופן — מה מחכה כמה, מה מתבטל, ומה נכנס לתור.
 *
 * המגע במסמך עצמו יושב ב-`engine/font-preview.ts`, כולל ההסבר למה הוא מכוון
 * לטווח **שנתפס** ולא לבחירה הנוכחית. כאן מכונת המצבים, בלי Vue ובלי מנוע:
 * ארבע התלויות מוזרקות, ולכן אפשר להריץ את כל התרחישים — כולל המכוערים —
 * בשעונים מזויפים.
 *
 * ## למה יש כאן השהיה בכלל
 *
 * צביעה היא מוטציה אמיתית: היא נרשמת בהיסטוריית הביטול, והמנוע פורס מחדש את
 * הפריסה. מעבר עכבר על רשימה של מאות שמות מייצר עשרות שורות מסומנות בשנייה,
 * וצביעה לכל אחת מהן פירושה גם מסמך שנתקע וגם היסטוריה שמתמלאת בגופנים שאיש
 * לא ביקש. ההשהיה היא מה שהופך „עברתי על הרשימה” ל„עצרתי על שורה”.
 *
 * שלושה מסננים, ולא אחד:
 *   1. **השהיה** — נמדדת מהרגע שהסימון נח. תנועה נוספת מבטלת ומתחילה מחדש.
 *   2. **דילוג על הזהה** — הגופן שמוצג כבר אינו נצבע שוב.
 *   3. **תור סדרתי** — צביעה אחת באוויר בכל רגע, וההחזרה נכנסת אחריה בתור.
 *
 * ## למה יש „סבב” (`session`) ולא רק דגלים
 *
 * תפיסת הטווח היא אסינכרונית, והרשימה יכולה להיסגר בזמן שהיא באוויר — למשל
 * לחיצה במסמך, שגם מזיזה את הבחירה. בלי מונה סבבים הצביעה הייתה נוחתת אחרי
 * הסגירה, כלומר משנה גופן בלי שאיש עומד על שורה. כל מה שנפתח בסבב אחד נזרק
 * ברגע שהסבב נסגר; רק ההחזרה עצמה חסינה, מפני שהיא **של** הסבב שנסגר.
 *
 * ## והמפסק
 *
 * `enabled` היא התלות היחידה שיש לה ברירת מחדל שאינה מכאן:
 * `FONT_PREVIEW_ENABLED` מ-`engine/font-preview.ts`, שהוא `false` — ושם כל
 * ההנמקה (Undo שנשבר, „לא נשמר”, autosave, ו-`rFonts` מפורש שנשאר בקובץ).
 * כשהוא כבוי `hover` אינו מתזמן דבר ו-`end` אינו מחזיר דבר, כלומר הריחוף
 * אינו נוגע במסמך ואינו קורא לו.
 *
 * המכונה עצמה נשארת שלמה ובדוקה מול `enabled: () => true`: מה שחסר כדי
 * להדליק הוא API במנוע, לא קוד כאן. הבדיקות ב-`tests/unit/font-preview.test.ts`
 * מריצות את שני המצבים.
 */
import { FONT_PREVIEW_ENABLED } from '../engine/font-preview';

/**
 * ההשהיה מרגע שהסימון נח ועד הצביעה.
 *
 * 300 מילישניות: קצר דיו שעצירה על שורה מרגישה מיידית, וארוך דיו שמעבר עכבר
 * מקצה הרשימה לקצה אינו צובע דבר. הערך נשלט מבחוץ (`delayMs`), ומי שירצה
 * לכייל אותו לא צריך לגעת במכונה.
 */
export const FONT_PREVIEW_DELAY_MS = 300;

export interface FontPreviewDeps {
  /**
   * האם התצוגה החיה קיימת בכלל. ברירת המחדל היא `FONT_PREVIEW_ENABLED` —
   * כלומר כבוי. ראו „והמפסק” בהערת הראש.
   */
  enabled?: () => boolean;
  /**
   * האם מותר **להתחיל** תצוגה חיה כרגע: יש טווח מסומן, הקריאה התיישבה, ולקטע
   * גופן אחד ידוע. אינו נשאל שוב אחרי שהתצוגה התחילה — ראו `hover`.
   */
  allowed: () => boolean;
  /**
   * הגופן שבמסמך כרגע, כפי שהמנוע מדווח. `null` = אינו ידוע (מעורב, או טרם
   * נפתר) — ואז אין תצוגה, מפני שלא יהיה לאן להחזיר.
   */
  origin: () => string | null;
  /** תופסת את הטווח. פעם אחת לכל סבב. `null` = אין מה לצבוע. */
  capture: () => Promise<unknown | null>;
  /** צובעת את הטווח שנתפס. `false` = לא נצבע. */
  paint: (target: unknown, family: string) => Promise<boolean>;
  /** ברירת המחדל היא `FONT_PREVIEW_DELAY_MS`. */
  delayMs?: number;
}

export interface FontPreview {
  /** הסימון ברשימה עבר לגופן הזה. `null` = אין סימון כרגע. */
  hover: (family: string | null) => void;
  /** הרשימה נסגרה. `committed` = המשתמש בחר, ולכן אין מה להחזיר. */
  end: (committed: boolean) => void;
  /** הגופן שהתצוגה החיה צבעה במסמך, או `null` כשהמסמך נקי ממנה. */
  shown: () => string | null;
  /** ההבטחה של כל מה שבתור. לבדיקות, ולמי שצריך לדעת שהמסמך הסתדר. */
  idle: () => Promise<void>;
}

export function createFontPreview(deps: FontPreviewDeps): FontPreview {
  const delayMs = deps.delayMs ?? FONT_PREVIEW_DELAY_MS;
  const enabled = deps.enabled ?? (() => FONT_PREVIEW_ENABLED);

  let timer: ReturnType<typeof setTimeout> | null = null;
  /** הסבב הפתוח. כל סגירה מקדמת אותו, וכל מה שהיה באוויר נזרק. */
  let session = 0;
  let target: unknown = null;
  /** הגופן שהיה במסמך לפני הצביעה הראשונה בסבב. */
  let origin: string | null = null;
  /**
   * הגופן ש**נשלח** לצביעה, גם אם טרם נענה — ועליו נשענת ההחזרה.
   *
   * הנפרדות מ-`shown` אינה עודף: הרשימה יכולה להיסגר בזמן שצביעה באוויר,
   * ואז „מה שנצבע בפועל” הוא עדיין `null` בזמן שהמסמך עומד להשתנות. החזרה
   * שנשענת על `shown` הייתה מדלגת בדיוק שם, והגופן היה נשאר.
   *
   * שליחה שנכשלה משאירה אותו מלא, וההחזרה שתבוא היא NO_OP — כלומר הצד
   * השמרני של הטעות.
   */
  let sent: string | null = null;
  /** הגופן שנצבע ונענה. מה שהחוץ רואה ב-`shown()`. */
  let shown: string | null = null;
  let queue: Promise<unknown> = Promise.resolve();

  function clearTimer(): void {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  }

  /**
   * הכניסה היחידה לתור, וה-`catch` הוא כל הסיבה שהיא יחידה: שרשרת הבטחות
   * שנדחתה פעם אחת מדלגת על כל מה שאחריה — כלומר תקלה בצביעה אחת הייתה מבטלת
   * גם את ההחזרה, ומשאירה את הגופן במסמך. שתי השכבות של המנוע כבר בולעות כל
   * כשל, ולכן זו רשת שנייה — ובדיוק במקום שבו כשל עולה במסמך של המשתמש.
   */
  function enqueue(run: () => Promise<unknown>): void {
    queue = queue.then(run).catch((error) => {
      console.warn('[otzaria-word] התצוגה החיה של הגופן נכשלה', error);
    });
  }

  /** מה שיהיה במסמך: הצביעה האחרונה שנשלחה, ואם לא שלחנו — מה שהמנוע מדווח. */
  function inDocument(): string | null {
    return sent ?? deps.origin();
  }

  function hover(family: string | null): void {
    // המפסק ראשון, לפני `clearTimer`: כשהוא כבוי לא נקבע טיימר מעולם, ואין
    // גם מה לקרוא מהמנוע — `origin()` ו-`allowed()` נוגעים בבחירה.
    if (!enabled()) return;
    clearTimer();
    // יציאה משורה אינה החזרה: הרשימה עוד פתוחה, והמשתמש בדרך לשורה הבאה.
    // ההחזרה קורית ב-`end` בלבד — אחרת כל תנועת עכבר בין שורות הייתה מייצרת
    // שתי מוטציות במקום אחת.
    if (family === null) return;
    if (family === inDocument()) return;
    // `sent === null` ולא בדיקה תמידית, וזה לא קוסמטי: הצביעה **עצמה** גורמת
    // למנוע לפתור מחדש את הבחירה, ובאותם רגעים `settled` הוא `false` והגופן
    // המדווח `undefined`. בדיקה תמידית הייתה נועלת את התצוגה אחרי הצביעה
    // הראשונה בדיוק.
    if (sent === null && !deps.allowed()) return;

    const mine = session;
    timer = setTimeout(() => {
      timer = null;
      void start(family, mine);
    }, delayMs);
  }

  async function start(family: string, mine: number): Promise<void> {
    if (mine !== session) return;

    if (origin === null) {
      const base = deps.origin();
      // אין לאן להחזיר, ולכן אין תצוגה. ראו `origin` בתלויות.
      if (base === null) return;
      origin = base;
    }

    if (target === null) {
      const captured = await deps.capture();
      // הרשימה נסגרה בזמן התפיסה — ואז אין על מה לצבוע.
      if (mine !== session) return;
      if (captured === null || captured === undefined) {
        origin = null;
        return;
      }
      target = captured;
    }

    const painted = target;
    // `sent` נקבע **לפני** ההמתנה בתור, ולא בתוכה: מרגע זה המסמך עומד
    // להשתנות, וסגירה שתקרה בינתיים חייבת לדעת שיש מה להחזיר.
    sent = family;
    enqueue(async () => {
      if (mine !== session) return;
      if (await deps.paint(painted, family)) shown = family;
    });
  }

  function end(committed: boolean): void {
    // אין מה להחזיר כשלא נצבע דבר. הבדיקה כאן ולא רק ב-`hover` מפני ש-`end`
    // נקרא גם מרשת הביטחון של הפירוק, בלי שקדם לו ריחוף.
    if (!enabled()) return;
    clearTimer();

    const painted = target;
    const base = origin;
    const last = sent;

    session += 1;
    target = null;
    origin = null;
    sent = null;
    shown = null;

    if (committed || last === null || base === null || last === base) return;

    // בתור ולא מיד: צביעה שבאוויר חייבת לנחות **לפני** ההחזרה, אחרת היא
    // הייתה נוחתת אחריה — והגופן שאיש לא בחר היה נשאר במסמך.
    //
    // ובלי בדיקת סבב, בשונה מכל צביעה אחרת: ההחזרה היא של הסבב שנסגר ברגע זה,
    // וזריקה שלה פירושה מסמך שנשאר צבוע.
    enqueue(() => deps.paint(painted, base));
  }

  return {
    hover,
    end,
    shown: () => shown,
    idle: () => queue.then(() => undefined),
  };
}
