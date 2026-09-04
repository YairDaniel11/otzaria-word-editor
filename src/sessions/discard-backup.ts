/**
 * „לא לשמור” שאפשר להתחרט עליו: חמשת המסמכים האחרונים שנסגרו בלי שמירה.
 *
 * ## למה זה קיים
 *
 * עד כאן „לא לשמור” היה סופי, ולכן הוא נשמר מאחורי **שתי** שאלות רצופות
 * (`sessions/open-flow.ts`). שתי שאלות הן מס שמשלם כל מי שסוגר מסמך — כולל
 * מי שידע בדיוק מה הוא עושה — והן עדיין אינן מגנות מפני הטעות היחידה שבאמת
 * קורית: לחיצה מהירה על הכפתור הלא נכון. הגיבוי הזה הופך את השאלה השנייה
 * למיותרת: מה שנמחק נשמר, ולכן שאלה אחת עם שלושה כפתורים מספיקה.
 *
 * זו אינה הטיוטה. הטיוטה (`session-keeper.ts`) שומרת את **המסמך הפתוח** כדי
 * שיחזור אחרי קריסה, והיא נמחקת בדיוק ברגע שהמשתמש אומר „לא לשמור”. כאן
 * נשמר מה שהיה בה **אחרי** שנאמר, וזה ההבדל בין רשת ביטחון לבין סל מיחזור.
 *
 * ## משבצות ולא מזהים — ההחלטה שקובעת את כל השאר
 *
 * לכל רשומה יש `slot` בטווח `0..MAX_DISCARD_BACKUPS-1`, והוא גם שם הקובץ
 * (`backupPathFor`). כלומר הכתיבה הבאה **דורסת** את המשבצת של הישן ביותר
 * במקום למחוק קובץ ולכתוב אחר.
 *
 * מה זה קונה, ולמה זה לא סגנון אלא נכונות: הרשומה יושבת ב-`storage` והקבצים
 * במרחב הפרטי — שני מקומות שנכתבים בשתי קריאות גשר נפרדות, ולכן כתיבה שנקטעה
 * ביניהן היא מצב אפשרי. עם מזהים ייחודיים כל קטיעה כזאת מותירה קובץ יתום
 * שאיש לא יימחק לעולם, והמכסה של 100MB מתמלאת בשקט. עם משבצות המספר הכולל
 * חסום ב-5 **תמיד**, בלי קשר לכמה קריאות נקטעו: הגרוע ביותר הוא קובץ שהרשומה
 * אינה מכירה, והכתיבה הבאה לאותה משבצת פשוט דורסת אותו.
 *
 * ## מה המודול הזה אינו עושה
 *
 * אינו נוגע בגשר. הוא פונקציות טהורות בלבד — מי שקורא וכותב הוא
 * `host/settings.ts` (הרשומה) ו-`host/workspace.ts` (הבייטים), ומי שמחליט
 * מתי הוא המעטפת. זו אותה הפרדה בדיוק שבין `normalizeSession` ל-
 * `loadSessionRecord`, ומאותו טעם: ההחלטות שקובעות מה נעלם נבדקות בלי לזייף
 * SDK.
 */

/**
 * כמה מסמכים נשמרים. חמישה, וזה מספר ולא הרגשה: כל אחד מהם הוא DOCX מלא
 * במרחב שהמכסה שלו 100MB, והמסמך היחיד הגדול ביותר שהתוסף כותב בכלל מוגבל
 * ל-~7.5MB (ראו `MAX_CONTENT_BYTES` ב-host/workspace.ts). חמישה כאלה הם
 * הגבול העליון של מה שהתכונה יכולה לתפוס — ומעשית הרבה פחות.
 */
export const MAX_DISCARD_BACKUPS = 5;

/** מסמך אחד בגיבוי. `slot` הוא הזהות, והוא גם הנתיב. */
export interface DiscardedDocument {
  /** `0..MAX_DISCARD_BACKUPS-1`. ראו „משבצות ולא מזהים” בראש הקובץ. */
  slot: number;
  /** שם המסמך כפי שהוצג בטאב, לתצוגה בלבד. */
  name: string;
  /** גודל הבייטים שנכתבו. `0` = לא ידוע. */
  size: number;
  /** `Date.now()` ברגע ש„לא לשמור” נלחץ. */
  discardedAt: number;
  /**
   * ה-token של הקובץ שהמסמך נפתח ממנו, או `null` למסמך שמעולם לא נשמר.
   *
   * נשמר בשביל מי שישחזר: „לפתוח כמסמך חדש” אפשרי תמיד, אבל „להחזיר את
   * השינויים לקובץ שהם באו ממנו” דורש לדעת מי הקובץ. לאסוף את זה אחר כך אי
   * אפשר — ברגע שהטאב נסגר, הידיעה הזאת נעלמת איתו.
   */
  token: string | null;
}

/** הנתיב במרחב הפרטי. שטוח, כמו הטיוטה — ראו host/workspace.ts. */
export function backupPathFor(slot: number): string {
  return `discarded-${slot}.docx`;
}

function isValidSlot(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < MAX_DISCARD_BACKUPS;
}

/**
 * מפרשת את מה שחזר מ-`storage`. שורה פגומה **נשמטת** ואינה פוסלת את הרשימה:
 * גיבוי הוא רשת ביטחון, ורשת שנקרעה כולה מפני שחוט אחד נקרע היא הכשל הגרוע
 * מבין השניים.
 *
 * שתי שורות על אותה משבצת הן סתירה — יש שם קובץ אחד — ולכן הראשונה (החדשה
 * יותר, ראו הסדר למטה) שורדת. הפלט תמיד ממוין מהחדש לישן ותמיד קצר מהתקרה.
 */
export function normalizeBackups(raw: unknown): DiscardedDocument[] {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<number>();
  const list: DiscardedDocument[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const value = item as Partial<DiscardedDocument>;
    if (!isValidSlot(value.slot) || seen.has(value.slot)) continue;

    seen.add(value.slot);
    list.push({
      slot: value.slot,
      name: typeof value.name === 'string' && value.name !== '' ? value.name : 'מסמך',
      size: typeof value.size === 'number' && value.size > 0 ? value.size : 0,
      discardedAt: typeof value.discardedAt === 'number' && value.discardedAt > 0 ? value.discardedAt : 0,
      token: typeof value.token === 'string' && value.token !== '' ? value.token : null,
    });
  }

  return sortedBackups(list).slice(0, MAX_DISCARD_BACKUPS);
}

/** מהחדש לישן. זה גם הסדר שנשמר, כדי ש„האחרון” יהיה תמיד הראשון. */
export function sortedBackups(list: readonly DiscardedDocument[]): DiscardedDocument[] {
  return [...list].sort((a, b) => b.discardedAt - a.discardedAt);
}

/**
 * לאן ייכתב הגיבוי הבא: משבצת פנויה אם יש, ואחרת זו של הישן ביותר.
 *
 * נקראת **לפני** הכתיבה ולא אחריה, מפני שהיא קובעת את הנתיב שאליו כותבים —
 * וכך כתיבה שנכשלה אינה מזיזה דבר ברשומה. ראו `rememberDiscard`.
 */
export function nextBackupSlot(list: readonly DiscardedDocument[]): number {
  const taken = new Set(list.map((entry) => entry.slot));
  for (let slot = 0; slot < MAX_DISCARD_BACKUPS; slot += 1) {
    if (!taken.has(slot)) return slot;
  }

  // כולן תפוסות: הישן ביותר נדרס. `sortedBackups` מסדרת מהחדש לישן, ולכן
  // האחרון הוא הוותיק.
  const ordered = sortedBackups(list);
  return ordered[ordered.length - 1]!.slot;
}

/**
 * מוסיפה רשומה, ודורסת את מה שהיה באותה משבצת.
 *
 * מקבלת את הרשומה המלאה — כולל ה-`slot` שנבחר ב-`nextBackupSlot` — ולא
 * בוחרת בעצמה: הקורא כבר כתב את הקובץ לנתיב הזה, ובחירה שנייה כאן הייתה
 * יכולה ליפול על משבצת אחרת ולהשאיר את הרשומה מצביעה לקובץ הלא נכון.
 */
export function rememberDiscard(
  list: readonly DiscardedDocument[],
  entry: DiscardedDocument,
): DiscardedDocument[] {
  const rest = list.filter((existing) => existing.slot !== entry.slot);
  return sortedBackups([entry, ...rest]).slice(0, MAX_DISCARD_BACKUPS);
}

/**
 * מסירה רשומה — למי ששחזר אותה או ביקש למחוק.
 *
 * הקובץ עצמו אינו נמחק כאן (המודול אינו נוגע בגשר), והוא גם אינו חייב
 * להימחק: המשבצת חוזרת להיות פנויה, והכתיבה הבאה תדרוס אותה.
 */
export function forgetDiscard(
  list: readonly DiscardedDocument[],
  slot: number,
): DiscardedDocument[] {
  return list.filter((entry) => entry.slot !== slot);
}
