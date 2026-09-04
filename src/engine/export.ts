/**
 * ייצוא המסמך הפעיל, ובחירת השם והסיומת שהוא נשמר תחתם.
 *
 * `triggerDownload: false` — התוסף מקבל את ה-Blob ומחליט מה לעשות בו.
 * ההורדה האוטומטית של SuperDoc אינה מסלול שמירה אמין, ובעיקר אינה בסיס
 * ל-autosave.
 *
 * ## למה הסיומת יושבת כאן, ולמה היא לא תמיד `docx`
 *
 * מסמך עם מאקרו (`.docm`) הוא אותה חבילת OOXML בדיוק, ובתוכה חלק נוסף —
 * `word/vbaProject.bin`. המנוע **שומר** אותו בייט-בבייט בייצוא, כלומר הבייטים
 * שיוצאים מכאן עשויים להיות מסמך עם מאקרו גם כשלא נגענו במאקרו.
 *
 * וזאת בדיוק המלכודת: Word מסרב לפתוח חבילה שיש בה `vbaProject` אם שמה מסתיים
 * ב-`.docx`. כתיבה כ-`docx` הייתה הופכת מסמך תקין של המשתמש לקובץ שהוא מקבל
 * עליו אזהרה — או שהמאקרו שלו פשוט מפסיקים לעבוד, בלי ששום דבר אמר לו למה.
 * לכן הסיומת אינה קבועה אלא נגזרת משני דברים: מה הייתה סיומת המקור, והאם
 * החבילה נושאת חלק מאקרו בפועל.
 */
import type { SuperDoc } from 'superdoc';

/** הסיומות של חבילות OOXML לעיבוד תמלילים שהתוסף מכיר. */
export const WORD_EXTENSIONS = ['docx', 'docm', 'dotx', 'dotm'] as const;

export type WordExtension = (typeof WORD_EXTENSIONS)[number];

export const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** ה-MIME של כל סיומת. `docm`/`dotm` הם טיפוסים נפרדים, לא וריאנט של `docx`. */
export const MIME_FOR_EXTENSION: Readonly<Record<WordExtension, string>> = {
  docx: DOCX_MIME,
  docm: 'application/vnd.ms-word.document.macroEnabled.12',
  dotx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
  dotm: 'application/vnd.ms-word.template.macroEnabled.12',
};

/** הסיומת המקבילה עם מאקרו. `docm`/`dotm` הן כבר כאלה. */
const MACRO_ENABLED: Readonly<Record<WordExtension, WordExtension>> = {
  docx: 'docm',
  dotx: 'dotm',
  docm: 'docm',
  dotm: 'dotm',
};

const EXTENSION_PATTERN = new RegExp(`\\.(${WORD_EXTENSIONS.join('|')})$`, 'i');

/**
 * ייצוא המסמך. `exportType: ['docx']` הוא משפחת הפורמט של המנוע ואינו נוגע
 * לסיומת: חבילה עם מאקרו יוצאת מכאן עם המאקרו שלה בפנים.
 */
export async function exportDocx(superdoc: SuperDoc): Promise<Blob> {
  const blob = await superdoc.export({ exportType: ['docx'], triggerDownload: false });
  if (!(blob instanceof Blob)) throw new Error('הייצוא לא החזיר קובץ');
  return blob;
}

/** הסיומת שבשם הקובץ, או `null` כשאינה אחת מהמוכרות. */
export function extensionFromFileName(name: string | undefined): WordExtension | null {
  const match = name ? EXTENSION_PATTERN.exec(name.trim()) : null;
  return match ? (match[1]!.toLowerCase() as WordExtension) : null;
}

/** מסיר סיומת מוכרת משם קובץ. שם בלי סיומת מוכרת חוזר כמות שהוא. */
export function stripWordExtension(name: string): string {
  return name.replace(EXTENSION_PATTERN, '');
}

/**
 * הסיומת שתחתה יש לשמור.
 *
 * שומרת על סיומת המקור — משתמש שפתח תבנית מצפה לשמור תבנית — ומשדרגת לגרסת
 * המאקרו כשהחבילה נושאת חלק מאקרו. השדרוג הוא המסלול הבטוח: קובץ עם
 * `vbaProject` שנשמר כ-`docx` הוא קובץ ש-Word מתלונן עליו.
 *
 * הכיוון ההפוך לא נעשה בכוונה: מסמך `.docm` שאין בו (עוד) מאקרו נשמר כ-`.docm`,
 * מפני שזה מה שהמשתמש בחר — Word עצמו מתנהג כך.
 *
 * ## איפה הסיומת הזאת קובעת, ואיפה לא
 *
 * ב„שמור בשם”, בשם שמוצע ובסינון של הדיאלוג (`extension` ב-
 * `commitUserFileWrite`). **לא** בכתיבה במקום: שם
 * המאחז כותב ל-`targetToken` — הנתיב שממנו הקובץ נפתח — ומתעלם מהשם
 * המוצע, וזו ההתנהגות הנכונה: הקובץ נשאר היכן שהמשתמש שם אותו. מסמך
 * `.docx` שכבר נושא `vbaProject` נשמר לכן חזרה לאותו `.docx`; זה מצבו
 * מלפני שנפתח כאן, והעורך אינו „מתקן” אותו בלי שנתבקש.
 */
export function resolveSaveExtension(
  sourceName: string | undefined,
  hasMacros: boolean,
): WordExtension {
  const base = extensionFromFileName(sourceName) ?? 'docx';
  return hasMacros ? MACRO_ENABLED[base] : base;
}

/**
 * שם הקובץ לשמירה: מנקה תווים שאינם חוקיים בשם קובץ ב-Windows, מסיר סיומת
 * מוכרת אם יש, ומצמיד את הסיומת המבוקשת.
 */
export function documentFileName(title: string, extension: WordExtension = 'docx'): string {
  const clean = stripWordExtension(title.replace(/[\\/:*?"<>|]/g, '').trim()) || 'מסמך';
  return `${clean}.${extension}`;
}

/**
 * אותם בייטים עם ה-MIME הנכון לסיומת.
 *
 * `superdoc.export` מסמן את ה-Blob כ-`docx` תמיד, וה-MIME הזה הוא מה שנשלח
 * כ-`Content-Type` בכתיבה. מסמך עם מאקרו שנכתב כ-`docx` היה מוצהר לא נכון
 * למי שקורא את ההצהרה.
 */
export function retypeBlob(blob: Blob, extension: WordExtension): Blob {
  const type = MIME_FOR_EXTENSION[extension];
  // ההשוואה חסרת-רישיות מפני ש-`Blob` מנרמל את הטיפוס לאותיות קטנות לפי
  // התקן: `blob.type === type` על טיפוס עם אות גדולה (`macroEnabled`) לעולם
  // אינו אמת, וכל קריאה הייתה מייצרת Blob חדש לחינם.
  return blob.type.toLowerCase() === type.toLowerCase() ? blob : new Blob([blob], { type });
}
