/**
 * שני הכללים שכל בורר ברצועה חי לפיהם — במקום אחד, ולא בכל לשונית מחדש.
 *
 * שניהם נכתבו במקור בתוך `HomeTab.vue`, ושניהם תוקנו שם אחרי באג אמיתי. הם
 * יצאו לכאן ברגע שאותם בוררים הופיעו במקום שני (תפריט הלחצן הימני): כלל
 * שמועתק הוא כלל שיתוקן פעם אחת בלבד.
 */
import type { Ref } from 'vue';
import type { CommandOutcome } from '../engine/command-adapter';

/**
 * אפשרות אחת בבורר, בצורה שמשותפת ל-`RibbonSelect` ול-`RibbonCombo`.
 *
 * `preview` ו-`group` אופציונליים מפני שהבורר הנייטיב אינו מכיר קיבוץ, ובורר
 * הגודל אינו מציג תצוגה מקדימה — אבל שני הפקדים מקבלים את אותה צורה, ולכן
 * `withCurrent` אחד מספיק לשלושת הבוררים.
 */
export interface PickerOption {
  value: string;
  label: string;
  /** `font-family` של CSS — כך כל שם מוצג בגופן עצמו. */
  preview?: string;
  /** כותרת הקבוצה בבורר החיפוש. חסר = בראש, בלי כותרת. */
  group?: string;
  /**
   * הגופן מכסה עברית — ואז בבורר החיפוש מופיעה לפני שמו דגימה של אותיות
   * עבריות. נקבע ב-engine/font-options.ts; ראו שם למה זו שאלה של כיסוי ולא של
   * ייעוד. חסר = בלי דגימה, וזו גם ברירת המחדל של בורר הגודל ושל האפשרות
   * שנוספת ב-`withCurrent`.
   */
  hebrew?: boolean;
}

/**
 * צורת הרשימה שהערך נוסף אליה.
 *
 * פרמטר מפורש ולא ניחוש טיפוס מהמחרוזת: „20.5” הוא גודל, „Arial” הוא שם, ו-
 * `Number(current)` היה מכריע את זה נכון בדיוק עד לגופן שהשם שלו מתחיל בספרה.
 * הקורא יודע איזה בורר הוא מרכיב, וזה סוף הדיון.
 */
export interface CurrentShape {
  /**
   * האפשרות שנוספת נושאת `preview`, כלומר הערך הוא שם גופן.
   *
   * ברירת המחדל `false` היא מה שמונע `style="font-family: 13"` בבורר הגודל:
   * `preview` הוא `font-family` של CSS, ובורר מספרי שמכריז עליו מבקש
   * מהדפדפן גופן בשם „13”. ברצועה זה לא נראה כל עוד הגודל היה `<select>`
   * (`RibbonSelect` אינו מצייר `preview` בכלל), ונראה מיד כשהוא הפך
   * ל-`RibbonCombo`.
   */
  readonly preview?: boolean;
  /**
   * הרשימה מספרית, ולכן הערך נכנס **במקומו לפי הסדר** ולא בראשה.
   *
   * גם זה נראה רק מרגע שבורר הגודל הפך לרשימה נפתחת: 13pt בראש הרשימה נתן
   * „13, 8, 9, 10, 11, 12…”, כלומר סולם מספרים שאינו מסודר — ובורר שאי אפשר
   * לאמוד בו מרחק הוא בורר שצריך לקרוא כל שורה בו.
   */
  readonly numeric?: boolean;
}

/**
 * הערך הנוכחי חייב להיות אחת האפשרויות, אחרת `<select>` מציג את הראשונה
 * ומשקר. גופן או גודל שאינם ברשימה (מסמך שנכתב בגופן שהמנוע לא הציע, טקסט
 * ב-20.5pt) מתווספים אליה — בדיוק מה ש-Word עושה.
 */
export function withCurrent<T extends PickerOption>(
  options: readonly T[],
  current: string,
  shape: CurrentShape = {},
): readonly (T | PickerOption)[] {
  if (current === '' || options.some((option) => option.value === current)) return options;

  const added: PickerOption = shape.preview
    ? { value: current, label: current, preview: current }
    : { value: current, label: current };

  const value = Number(current);
  // ערך שאינו מספר בבורר מספרי אינו „שגיאה” כאן — פשוט אין לו מקום בסולם,
  // ולכן הוא חוזר להתנהגות הרגילה: בראש, שם רואים אותו.
  if (!shape.numeric || !Number.isFinite(value)) return [added, ...options];

  const at = options.findIndex((option) => {
    const other = Number(option.value);
    return Number.isFinite(other) && other > value;
  });
  return at === -1
    ? [...options, added]
    : [...options.slice(0, at), added, ...options.slice(at)];
}

/**
 * שולחת את הבחירה ומחזיקה אותה על המסך עד לתשובה: בהצלחה היא נשמרת כ„אחרון
 * שידענו”, ובכשל היא נעלמת — כלומר מה שלא קרה במסמך אינו מוצג.
 *
 * למה אופטימי ולא „להמתין לתשובה”: הבורר חייב להגיב מיד, והמנוע אינו מדווח
 * ערך בכלל על בחירה מעורבת — תיבה שממתינה לו הייתה נראית קפואה גם בהצלחה
 * מלאה.
 *
 * הבדיקה `pending.value !== next` לפני העדכון: אם המשתמש בחר שוב בזמן
 * ההמתנה, הבקשה שבאוויר אינה שלנו יותר, ותשובה מאוחרת אינה אמורה למחוק בחירה
 * טרייה.
 */
export async function applyOptimistically<T>(
  pending: Ref<T | null>,
  memo: Ref<T>,
  next: T,
  run: () => Promise<CommandOutcome>,
): Promise<void> {
  pending.value = next;
  const outcome = await run();
  if (pending.value !== next) return;
  if (outcome.ok) memo.value = next;
  pending.value = null;
}
