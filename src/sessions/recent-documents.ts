/**
 * „המסמכים האחרונים” — מה שהרשימה זוכרת, ומה שמותר לה לשכוח.
 *
 * ## למה מודול טהור, ולמה כאן
 *
 * הרשימה הזאת מחליטה מה נעלם מהמסך: איזה מסמך נופל בתקרה, מה קורה לקובץ
 * שנפתח פעמיים, ומה נשאר אחרי הפעלה מחדש. אלה החלטות שנשברות בשקט — אף אחד
 * לא מקבל שגיאה כשמסמך פשוט לא מופיע יותר — ולכן הן יושבות בפונקציות טהורות
 * שאפשר למדוד ישירות, בדיוק כמו `decideDraftRecovery` ב-session-state.ts.
 * המעטפת (`host/settings.ts`) מחזירה גולמי, והפירוש כולו כאן; זו אותה הפרדה
 * שכבר קיימת בין `loadSessionRecord` ל-`normalizeSession`, ומאותו טעם:
 * החלטות נבדקות בלי לזייף את הגשר.
 *
 * ## מה נשמר, ולמה דווקא זה
 *
 * `token` ולא `url`: ה-URL שאוצריא מחזירה תקף לריצה אחת, כי הפורט של שרת
 * ה-loopback מתחלף (ראו host/files.ts). ה-token הוא מה ששורד, והוא גם המפתח
 * של הרשומה — שני ערכים לאותו קובץ הם שתי שורות לאותו דבר.
 *
 * שם, גודל וזמן ולא יותר: תצוגה מקדימה של התוכן הייתה דורשת לקרוא כל קובץ
 * בפתיחת הדיאלוג. שלושת השדות האלה כבר בידנו מרגע הפתיחה, ואינם נוגעים
 * בדיסק.
 *
 * ## התקרה, והמוצמדים שאינם בתוכה
 *
 * `MAX_RECENT_DOCUMENTS` נספר על הלא-מוצמדים **בלבד**, משתי סיבות נפרדות:
 *
 * 1. **מוצמד אינו נזרק.** הצמדה היא הבטחה — „זה יישאר כאן” — ורשימה שמפרה
 *    אותה אחרי עשרים פתיחות גרועה מרשימה בלי הצמדה כלל.
 * 2. **מוצמד אינו גונב מקום.** אילו נספר בתקרה, כל הצמדה הייתה מקצרת את
 *    הרשימה הרגילה באחד; מי שהצמיד עשרים קבצים היה נשאר בלי „אחרונים”
 *    בכלל — כלומר ההצמדה הייתה משביתה את התכונה שהיא יושבת בתוכה.
 *
 * המחיר: אורך הרשימה הוא `MAX_RECENT_DOCUMENTS` ועוד מספר המוצמדים, והוא
 * אינו חסום מלמעלה. זו החלטה ולא פליטה. הצמדה היא פעולה מפורשת, אחת לכל
 * קובץ; מי שהצמיד מאתיים מסמכים ביקש מאתיים מסמכים, ותקרה עליהם הייתה מבטלת
 * הצמדה בשקט — בדיוק הכישלון שההצמדה קיימת כדי למנוע. מה שגדל הוא רשומת
 * ה-storage, וגם היא רק metadata: token, שם, גודל וזמן לכל שורה.
 *
 * ## מה הרשימה אינה מבטיחה
 *
 * שה-token עדיין נפתר. קובץ שהוזז או שההרשאה עליו בוטלה נשאר ברשימה עד
 * שמנסים לפתוח אותו (`resolveFileUrl` מחזירה `null`); לבדוק את כולם בפתיחת
 * הדיאלוג פירושו קריאת גשר לכל שורה, בכל פתיחה. מי שפותח שורה מתה מקבל
 * הודעה — וזו התשובה הזולה והנכונה כאן.
 */

/** מסמך אחד ברשימה. `token` הוא הזהות; שני ערכים עליו הם שגיאה, לא שתי שורות. */
export interface RecentDocument {
  /** fs token של אוצריא. שורד הפעלות — ה-URL לא, ראו את ראש הקובץ. */
  token: string;
  name: string;
  /** בבתים. `0` = לא דווח — בדיוק כמו `size` ב-`UserFile` (host/files.ts). */
  size: number;
  /** `Date.now()` בפתיחה האחרונה. `0` = לא ידוע. */
  openedAt: number;
  /**
   * האם ה-token ניתן לכתיבה — כלומר „שמור” לא יפתח „שמור בשם”.
   *
   * הוא נשמר כאן ולא נגזר מחדש, מפני ש**אין מהיכן לגזור אותו**: הגשר מחזיר
   * `access` בבורר הקבצים בלבד, ו-`fs.resolveFileUrl` — המסלול שפתיחה
   * מ„אחרונים” עוברת בו — אינו מחזיר אותו. בלי השדה הזה מסמך שנפתח מהרשימה
   * יורד לקריאה-בלבד, וגרוע מכך: המצב הזה נכתב לרשומת ההפעלה ושורד הפעלות.
   *
   * זה בדיוק אותו שדה, ומאותו טעם, כמו `writable` ב-`SessionDocument`
   * (session-state.ts) — ו-`resolveRememberedFile` ב-App.vue כבר מרכיב ממנו
   * את ה-`access` החסר.
   */
  writable: boolean;
  pinned: boolean;
}

/** מה שידוע על פתיחה, לפני שיודעים אם הקובץ כבר מוכר ומוצמד. */
export type RecentOpen = Omit<RecentDocument, 'pinned'>;

/**
 * כמה לא-מוצמדים נשמרים. עשרים הוא מה שנגלל ברשימה אחת בלי לחפש, ומעבר לזה
 * החיפוש (`filterRecents`) הוא ממילא הדרך למצוא. המספר יושב כאן ולא בקומפוננטה
 * כדי שהתקרה שנבדקת והתקרה שרצה יהיו אותו מספר.
 */
export const MAX_RECENT_DOCUMENTS = 20;

/** ברירת המחדל לשם חסר — אותה מילה בדיוק כמו ב-`readDocument` ו-`resolveFileUrl`. */
const UNNAMED = 'מסמך';

function readString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/**
 * מספר לא-שלילי, או `0`.
 *
 * גודל שלילי אינו גודל וזמן שלילי אינו זמן; בשני השדות `0` כבר אומר „לא
 * ידוע”, ולכן הוא הנפילה הטבעית ואינו מוסיף מצב שלישי. זמן לא ידוע יורד לתחתית
 * המיון — המקום הכן למסמך שאין עליו מידע מתי נפתח.
 */
function readCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * רשומה אחת, בקריאה סלחנית. `null` = אין `token`, כלומר אין מה לפתוח.
 *
 * משמשת **גם** את מסלול הכתיבה (`rememberRecent`), וזה לא במקרה: כך רשימה
 * בזיכרון זהה לרשימה שתיקרא אחרי הפעלה מחדש. בלי זה, קובץ שהמארח החזיר בלי
 * שם היה מוצג ריק עכשיו ו„מסמך” אחרי עלייה — הבדל שקט שאיש לא היה מחפש.
 */
function readRecent(value: unknown): RecentDocument | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<RecentDocument>;
  const token = readString(item.token);
  if (!token) return null;
  return {
    token,
    name: readString(item.name) ?? UNNAMED,
    size: readCount(item.size),
    openedAt: readCount(item.openedAt),
    // רק `true` מפורש הוא כן — כמו `writable` ב-`readDocument`. נכשל **סגור**
    // ובכוונה: רשומה מגרסה קודמת שאין בה השדה נקראת כקריאה-בלבד, ואז „שמור”
    // פותח „שמור בשם”. זו הטעות הבטוחה מבין השתיים — הכיוון ההפוך היה מנסה
    // לכתוב ל-token שאין עליו הרשאת כתיבה.
    writable: item.writable === true,
    // ערך פגום אינו מצמיד מסמך, מפני שהצמדה היא מה שמחריג אותו מהתקרה לנצח.
    pinned: item.pinned === true,
  };
}

/**
 * קוראת את הרשימה מה-storage. ערך שאינו מערך מחזיר `[]` — אין מה לשחזר.
 *
 * רשומה פגומה **נשמטת** ואינה פוסלת את הרשימה כולה, בדיוק כמו `readDocuments`
 * ב-session-state.ts ומאותו טעם: שורה אחת שנכתבה חלקית אינה סיבה שמשתמש יאבד
 * את עשרים המסמכים האחרונים שלו. token חוזר נשמט גם הוא, והראשון נשמר: ה-token
 * הוא הזהות, ושתי שורות עליו היו נותנות שתי „הסרות” לאותו קובץ ואת אותה הצמדה
 * בשני מצבים סותרים.
 *
 * **אין כאן קיצוץ לתקרה.** קריאה אינה המקום לאבד שורות: אם הרשומה גדלה מעבר
 * לתקרה (באג, או צורה ישנה), הפתיחה הבאה מקצצת אותה ממילא ב-`rememberRecent`,
 * שם נכנס פריט חדש ונפילת הישן היא מה שמצופה.
 */
export function normalizeRecents(raw: unknown): RecentDocument[] {
  if (!Array.isArray(raw)) return [];
  const out: RecentDocument[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const recent = readRecent(item);
    if (!recent || seen.has(recent.token)) continue;
    seen.add(recent.token);
    out.push(recent);
  }
  return out;
}

/**
 * סדר התצוגה, כאינדקסים לתוך הרשימה שנמסרה.
 *
 * אינדקסים ולא רשומות, מפני שהתקרה (`capUnpinned`) צריכה לזהות **מי** נופל גם
 * אם הרשימה שהגיעה מכילה שתי שורות שוות; טוקן כמפתח היה מפיל את שתיהן.
 *
 * שובר השוויון האחרון הוא האינדקס המקורי, ולכן המיון יציב בלי להישען על
 * ההבטחה של `Array.prototype.sort` — ו„יציב” כאן נבדק ולא מונח.
 */
function displayOrder(list: readonly RecentDocument[]): number[] {
  return list
    .map((_, index) => index)
    .sort((a, b) => {
      const left = list[a] as RecentDocument;
      const right = list[b] as RecentDocument;
      return (
        Number(right.pinned) - Number(left.pinned) ||
        right.openedAt - left.openedAt ||
        a - b
      );
    });
}

/**
 * הסדר שהרשימה מוצגת בו: מוצמדים ראשונים, ובכל קבוצה האחרון שנפתח בראש.
 *
 * המיון נפרד מהאחסון בכוונה: הרשימה השמורה היא אוסף, והסדר הוא החלטת תצוגה.
 * מי שמציג יקרא לכאן, ומי ששומר לא ישבור את הסדר בכתיבה.
 */
export function sortedRecents(list: readonly RecentDocument[]): RecentDocument[] {
  return displayOrder(list).map((index) => list[index] as RecentDocument);
}

/**
 * מפילה את הלא-מוצמדים שמעבר לתקרה — הישנים ביותר, לפי `openedAt`.
 *
 * לפי `openedAt` ולא לפי מקומם ברשימה: הרשימה מגיעה מה-storage ואין עליה
 * הבטחת סדר, ותקרה שתלויה בסדר שלא הובטח מפילה שורות שרירותיות. הניצולים
 * שומרים על מקומם המקורי — הקיצוץ מסיר, ואינו ממיין.
 */
function capUnpinned(list: readonly RecentDocument[]): RecentDocument[] {
  const doomed = new Set(
    displayOrder(list)
      .filter((index) => !(list[index] as RecentDocument).pinned)
      .slice(MAX_RECENT_DOCUMENTS),
  );
  return list.filter((_, index) => !doomed.has(index));
}

/**
 * רושמת פתיחה. `token` שכבר ברשימה **מתעדכן במקום** ואינו מוכפל.
 *
 * שלוש ההחלטות שבתוכה:
 *
 * - **השם והגודל נדרסים בחדש.** הקובץ יכול היה להשתנות או להיות משונה שם מאז
 *   הפתיחה הקודמת, וה-token הוא שמצביע עליו; הצגת השם הישן הייתה שקר על מה
 *   שייפתח בלחיצה.
 * - **ההצמדה נשמרת.** היא החלטה של המשתמש על הקובץ, לא נתון של הפתיחה, ולכן
 *   `RecentOpen` אינו מכיל אותה כלל — אין דרך לפתיחה רגילה לבטל הצמדה בטעות.
 * - **הרשומה עולה לראש הרשימה.** גם `sortedRecents` היה מציב אותה שם לפי
 *   הזמן, אבל הראש הוא גם מי-שורד-בתקרה כששני זמנים שווים, ופתיחה עכשיו
 *   אמורה לנצח.
 *
 * רשומה בלי `token` תקין מוחזרת כרשימה שלא השתנתה: זה בדיוק מה שהקריאה עושה
 * עם שורה כזאת, ושורה שלא ניתן לפתוח אינה שווה מקום ברשימה.
 */
export function rememberRecent(
  list: readonly RecentDocument[],
  entry: RecentOpen,
): RecentDocument[] {
  const fresh = readRecent({ ...entry, pinned: false });
  if (!fresh) return [...list];

  const previous = list.find((item) => item.token === fresh.token);
  const merged: RecentDocument = { ...fresh, pinned: previous?.pinned === true };

  return capUnpinned([merged, ...list.filter((item) => item.token !== fresh.token)]);
}

/**
 * מסירה מסמך מהרשימה. מסיר גם מוצמד: ההצמדה מגנה מפני התקרה — מפני שכחה
 * אוטומטית — ולא מפני בקשה מפורשת של המשתמש להסיר.
 *
 * הקובץ עצמו אינו נוגע בדבר. „הסר מהרשימה” הוא ניקוי של הזיכרון שלנו בלבד,
 * וכל פירוש אחר שלו היה הרסני.
 */
export function forgetRecent(list: readonly RecentDocument[], token: string): RecentDocument[] {
  return list.filter((item) => item.token !== token);
}

/**
 * מצמידה מסמך או משחררת אותו. token שאינו ברשימה אינו יוצר שורה — אין ממה
 * לבנות אותה: שם, גודל וזמן אינם ידועים כאן.
 *
 * **אינה מקצצת לתקרה.** שחרור הצמדה יכול להעלות את מספר הלא-מוצמדים מעל
 * `MAX_RECENT_DOCUMENTS`, וקיצוץ מיידי היה מוחק שורה **אחרת** מהמסך בלחיצה
 * שלא ביקשה למחוק דבר. הקיצוץ שייך למסלול הכתיבה, ששם נכנס פריט חדש ונפילת
 * הישן ביותר היא מה שמצופה. עד הפתיחה הבאה הרשימה ארוכה באחד — מחיר נמוך
 * משורה שנעלמת בלי סיבה נראית.
 */
export function setRecentPinned(
  list: readonly RecentDocument[],
  token: string,
  pinned: boolean,
): RecentDocument[] {
  return list.map((item) => (item.token === token ? { ...item, pinned } : item));
}

/**
 * הצורה שבה שם נשווה לשאילתה.
 *
 * שלושה נרמולים, ורק השלישי אינו מובן מאליו:
 *
 * 1. רווחים בקצוות — מי שהדביק שם קובץ הביא איתו רווח.
 * 2. אותיות גדולות/קטנות — `Report.docx` נמצא ב-`report`.
 * 3. **גרש וגרשיים עבריים (׳ ״) מנורמלים לישרים (' ").** מקלדת עברית מייצרת
 *    את הטיפוגרפיים, ומערכת הקבצים מלאה בישרים — „שו"ת.docx” נשמר עם גרשיים
 *    ישרים ומחופש עם עבריים, ולהפך. בלי האיחוד הזה חיפוש של ראשי תיבות —
 *    כלומר החיפוש הנפוץ ביותר בספרייה תורנית — פשוט לא היה מוצא.
 *
 * ההמרה נכתבה כאן ולא יובאה מ-`normalizeWord` (engine/spellcheck.ts) למרות
 * שהכלל זהה: שם מנרמל **גם** ניקוד, מפני שזו הצורה שהמילון הארוז מחזיק. זה
 * חוזה של המילון, ושינוי בו אינו אמור לשנות בשקט מה שחיפוש בשמות קבצים מוצא.
 *
 * מה שלא נכלל: מרכאות מסולסלות (’ “). הן נוצרות בתיקון אוטומטי של טקסט, ולא
 * בשמות קבצים — ואין למי מהמסלולים שכותבים לרשימה הזאת דרך לייצר אותן.
 */
function foldForSearch(text: string): string {
  return text.trim().toLowerCase().replace(/״/g, '"').replace(/׳/g, "'");
}

/**
 * סינון לפי השם. שאילתה ריקה (או רווחים בלבד) מחזירה את הרשימה כמות שהיא —
 * „לא הקלדתי כלום” אינו „לא נמצא דבר”.
 *
 * החיפוש הוא `includes` ולא „מתחיל ב”: שמות קבצים מתחילים לעתים קרובות
 * בתאריך או במספר סימן, והמילה שהמשתמש זוכר יושבת באמצע.
 *
 * הסדר נשמר כפי שהגיע — הדירוג הוא עניינו של `sortedRecents`, ולא של הסינון.
 */
export function filterRecents(list: readonly RecentDocument[], query: string): RecentDocument[] {
  const needle = foldForSearch(query);
  if (needle === '') return [...list];
  return list.filter((item) => foldForSearch(item.name).includes(needle));
}
