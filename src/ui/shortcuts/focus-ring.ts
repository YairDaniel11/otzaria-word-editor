/**
 * מעגל המיקוד של `F6` — סרגל הכותרת, הרצועה, המסמך, כפתור היציאה ממצב מיקוד
 * ושורת המצב.
 *
 * ## למה זה נחוץ
 *
 * לרצועה יש עשרות פקדים, ולמסמך יש משטח עריכה אחד. מי שמנווט במקלדת בלבד היה
 * צריך לעבור ב-Tab דרך כל הרצועה כדי לחזור לטקסט, ובחזרה כדי להגיע לשורת
 * המצב. `F6` הוא המוסכמה של Word ושל הדפדפן לאותה בעיה בדיוק: קפיצה בין
 * **אזורים**, לא בין פקדים.
 *
 * ## למה מודול ולא כמה שורות ב-`App.vue`
 *
 * ההכרעה „באיזה אזור אני עכשיו” היא הכלה ב-DOM, וההכרעה „לאן לקפוץ” היא מעגל
 * שצריך לדלג על אזור שאינו זמין — במצב מיקוד פסי המעטפת יוצאים מהמסך
 * ונשארים בעץ, כלומר ניתנים למיקוד. שתיהן לוגיקה שאפשר לשבור בשקט, ולכן הן
 * נבדקות בנפרד מהמעטפת.
 */

/**
 * האזורים, בסדר שבו `F6` עובר ביניהם.
 *
 * `focus-exit` הוא כפתור בודד ולא פס, והוא קיים רק במצב מיקוד — ובכל זאת
 * אזור: הוא הפקד היחיד שרואים שם, והמנוע בולע `Tab` ולכן אין אליו שום דרך
 * אחרת מהמקלדת. נמדד בדפדפן: `Tab` מגוף המסמך אינו מגיע אליו.
 */
export type FocusRegionId = 'titlebar' | 'ribbon' | 'document' | 'focus-exit' | 'statusbar';

export type FocusDirection = 'next' | 'prev';

export interface FocusRegion {
  id: FocusRegionId;
  /** האלמנט שמגדיר את גבולות האזור. `null` = האזור אינו מורכב כרגע. */
  element: () => HTMLElement | null;
  /**
   * מיקוד מותאם לאזור, ו**הדרך היחידה להיכנס אליו**. אזור המסמך משתמש בזה:
   * רק המנוע יכול להחזיר את הסמן לטקסט.
   *
   * `false` פירושו „האזור אינו מוכן”, והמעגל מדלג עליו. אין נפילה לחיפוש פקד
   * בתוכו, ובכוונה: בתוך אזור המסמך כל מה שיש הוא ה-DOM הפנימי של המנוע,
   * ושאילתה עליו מ-`ui/` היא בדיוק הגבול ש-tests/unit/engine-boundaries
   * שומר עליו. סלקטור גנרי חומק מהשער הזה — ולכן הכלל כאן ולא שם.
   */
  focus?: () => boolean;
  /**
   * האם האזור זמין למיקוד עכשיו. ברירת המחדל: כן.
   *
   * **זה אינו „האם הוא ב-DOM”.** במצב מיקוד הרצועה ושורת המצב נשארות בעץ —
   * הן רק יוצאות מהזרימה ומוזזות אל מחוץ למסך, כדי שחשיפה בריחוף תחזיר אותן
   * בלי לפרוס את המסמך מחדש. ברגע שהן נחשפות הן ניתנות למיקוד שוב, ולכן
   * „מוסתר” כאן הוא החלטה של המעטפת ולא תכונה של האלמנט: בלי הדגל `F6` היה
   * מעביר את המשתמש לפס שאינו על המסך.
   *
   * ומהצד השני, וזה מה שהמעטפת חייבת לקיים: פס **שנחשף** הוא פס גלוי לכל
   * דבר, והדגל שלו חייב לחזור ל„זמין”. דגל שהוא `false` לכל אורך מצב המיקוד
   * הופך רצועה שפרושה על המסך לפס שאי אפשר להגיע אליו במקלדת.
   */
  isAvailable?: () => boolean;
}

/** מה שאפשר למקד. `tabindex="-1"` אינו נכלל — הוא יעד תוכנה, לא תחנת Tab. */
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]),' +
  ' textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface FocusRingDeps {
  regions: readonly FocusRegion[];
  /** ברירת המחדל `document.activeElement`; הבדיקות מזריקות משלהן. */
  activeElement?: () => Element | null;
}

export interface FocusRing {
  /** האזור שבו הפוקוס כרגע, או `null` אם הוא מחוץ לכולם. */
  current: () => FocusRegionId | null;
  /** מעביר לאזור הבא (או הקודם). מחזיר את האזור שאליו עבר, או `null`. */
  move: (direction?: FocusDirection) => FocusRegionId | null;
  /**
   * מחזיר את הפוקוס למסמך. מחזיר האם היה **צורך** — כלומר האם הפוקוס היה
   * באחד האזורים האחרים. `false` כשהוא כבר במסמך או מחוץ למעטפת, ואז
   * ה-`Escape` שקרא לכאן אינו נבלע.
   */
  toDocument: () => boolean;
}

const wrap = (index: number, length: number): number => ((index % length) + length) % length;

export function createFocusRing(deps: FocusRingDeps): FocusRing {
  const regions = deps.regions;
  const activeElement = deps.activeElement ?? (() => document.activeElement);

  /** האינדקס של האזור שמכיל את הפוקוס, או `-1`. */
  function indexOfCurrent(): number {
    const active = activeElement();
    if (!active) return -1;
    return regions.findIndex((region) => {
      const element = region.element();
      return element !== null && element.contains(active);
    });
  }

  /** מנסה למקד אזור. `false` = אין בו למה למקד, וממשיכים לבא אחריו. */
  function focusRegion(region: FocusRegion): boolean {
    if (region.isAvailable?.() === false) return false;
    // אזור שהצהיר על מיקוד משלו נכנס רק דרכו. ראו ההסבר ב-`FocusRegion`.
    if (region.focus !== undefined) return region.focus();

    const element = region.element();
    if (!element) return false;

    const first = element.querySelector<HTMLElement>(FOCUSABLE);
    if (first) {
      first.focus();
      return true;
    }

    // אזור בלי פקדים עדיין ראוי למיקוד אם הוא הצהיר על עצמו כיעד.
    if (element.hasAttribute('tabindex')) {
      element.focus();
      return true;
    }
    return false;
  }

  function current(): FocusRegionId | null {
    const index = indexOfCurrent();
    return index === -1 ? null : regions[index]!.id;
  }

  function move(direction: FocusDirection = 'next'): FocusRegionId | null {
    if (regions.length === 0) return null;

    const step = direction === 'prev' ? -1 : 1;
    const at = indexOfCurrent();
    // פוקוס מחוץ לכל האזורים (למשל אחרי סגירת דיאלוג): מתחילים מהקצה, כך
    // שהאזור הראשון בסדר הוא היעד ולא השני.
    const from = at === -1 ? (step > 0 ? -1 : 0) : at;

    for (let offset = 1; offset <= regions.length; offset += 1) {
      const index = wrap(from + step * offset, regions.length);
      // האזור שהפוקוס כבר בו אינו יעד: „מעבר” אליו אינו מעבר, והחזרת הצלחה
      // הייתה בולעת את המקש בלי שקרה דבר. במצב מיקוד בלי חשיפה זה המצב
      // הרגיל — פסי המעטפת אינם זמינים, ונשאר רק המסמך עצמו.
      if (index === at) continue;
      const region = regions[index]!;
      if (focusRegion(region)) return region.id;
    }
    return null;
  }

  function toDocument(): boolean {
    const at = current();
    if (at === null || at === 'document') return false;

    const document_ = regions.find((region) => region.id === 'document');
    return document_ !== undefined && focusRegion(document_);
  }

  return { current, move, toDocument };
}
