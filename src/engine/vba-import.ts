/**
 * המאקרו של Word שכבר נמצאים במסמך — לקריאה, לא להרצה.
 *
 * ## מה זה פותר
 *
 * משתמש שנשען על מסמך `.docm` שנים פותח אותו כאן ומגלה שהמאקרו שלו „נעלמו”.
 * הם לא נעלמו: הם בחבילה, המנוע שומר אותם בייט-בבייט בייצוא, ופשוט אין להם
 * מנוע VBA בדפדפן. השכבה הזאת מוציאה את קוד המקור שלהם ומראה אותו — כדי
 * שהמשתמש יראה מה יש לו ויוכל להעביר אותו למאקרו של העורך.
 *
 * ## מה זה **לא** עושה
 *
 * שום דבר כאן אינו מריץ VBA, אינו ממיר אותו ואינו נוגע ב-kit של המאקרו: אין
 * מאקרו חדש שנשמר, אין קיצור שנקשר, אין כתיבה ל-localStorage. הקוד שמוחזר הוא
 * **טקסט**, ואין למסור אותו לשום מריץ — VBA אינו JavaScript, וכל דבר שכן היה
 * רץ הוא טקסט שנבחר בידי מי שכתב את הקובץ.
 *
 * מאקרו שWord מריץ מעצמו בפתיחה (`AutoOpen`, `Document_Open`) הם וקטור התקפה
 * ותיק בדיוק מפני ש-Word מכבד אותם. כאן הם **מדווחים ואינם מכובדים** — הם
 * מגיעים לאזהרה שהמשתמש רואה, וזה כל מה שקורה איתם.
 *
 * ## למה עטיפה ולא קריאה ישירה לחבילה
 *
 * שני דברים שהחבילה במכוון אינה עושה, ושייכים לכאן: היא מחזירה קודים יציבים
 * עם טקסט אנגלי (הודעות למשתמש הן החלטה של הממשק, לא של המנתח), והיא אינה
 * מחליטה מה נחשב „מסמך עם מאקרו” לצורך שמירה. שני התרגומים האלה יושבים כאן,
 * במקום אחד, כדי שהדיאלוג ושורת המצב יאמרו אותו דבר.
 */
import {
  extractVbaFromDocx,
  findVbaPart,
  type VbaExtraction,
  type VbaModule,
  type VbaProject,
  type VbaWarning,
} from 'superdoc-macros';

/** מה שהמסמך הפתוח יודע לספר על המאקרו שבו. */
export interface DocumentVba {
  /**
   * האם החבילה נושאת חלק מאקרו. נכון גם כשהפרויקט פגום ולא נקרא — וזה מה
   * שקובע את סיומת השמירה: חלק שקיים חייב להישמר, קריא או לא.
   */
  hasMacroPart: boolean;
  /** המודולים שנקראו. ריק כשאין מאקרו או כשהפרויקט לא נקרא. */
  modules: readonly VbaModule[];
  /** מאקרו שWord היה מריץ בפתיחה. לדיווח בלבד — ראו הערת הפתיחה. */
  autoRun: readonly string[];
  /** אזהרות, כבר בעברית. */
  warnings: readonly string[];
  /** נוסח קצר לשורת המצב, או `null` כשאין מה לומר. */
  status: string | null;
  /** האם היה חלק מאקרו שלא הצלחנו לקרוא. */
  unreadable: boolean;
}

export const NO_VBA: DocumentVba = {
  hasMacroPart: false,
  modules: [],
  autoRun: [],
  warnings: [],
  status: null,
  unreadable: false,
};

/** סוגי המודולים בעברית, לתצוגה. */
export const MODULE_KIND_LABEL: Readonly<Record<VbaModule['kind'], string>> = {
  standard: 'מודול',
  class: 'מחלקה',
  document: 'מסמך',
  form: 'טופס',
  unknown: 'לא ידוע',
};

/**
 * האזהרות בעברית, לפי הקוד היציב של החבילה.
 *
 * לפי הקוד ולא לפי הטקסט: הנוסח האנגלי הוא ברירת מחדל של החבילה ויכול
 * להשתנות, והקוד הוא מה שהיא מתחייבת עליו. `Record` מלא ולא `switch` עם
 * ברירת מחדל — כך קוד חדש בחבילה נופל בזמן בנייה ולא נשאר באנגלית בשקט.
 */
export const WARNING_TEXT: Readonly<Record<VbaWarning['code'], string>> = {
  'auto-run-macros':
    'המסמך מגדיר מאקרו שWord מריץ אוטומטית בפתיחה. הם מוצגים לעיון בלבד ואינם מורצים כאן.',
  'module-unreadable': 'מודול אחד או יותר לא נקרא — ייתכן שקוד המקור שלו הוסר או פגום.',
  'module-truncated': 'מודול ארוך מדי נחתך בתצוגה.',
  'declared-modules-missing': 'הפרויקט מכריז על מודולים שלא הצלחנו לקרוא — הרשימה חלקית.',
  'incomplete-directory': 'ספריית המאקרו נגמרה באמצע — ייתכן שחסרים מודולים.',
  'no-modules': 'בפרויקט המאקרו אין מודולים קריאים.',
  'unknown-code-page': 'קידוד התווים של הפרויקט אינו נתמך כאן — תווים שאינם לטיניים עלולים להופיע שגויים.',
  'module-limit': 'הפרויקט מכיל יותר מודולים מהתקרה — היתר לא נקראו.',
  'total-size-limit': 'הפרויקט גדול מהתקרה — היתר לא נקראו.',
};

/** נוסח הכשל בעברית, לפי הסיבה. `no-macros` אינו כשל ואינו מופיע כאן. */
const FAILURE_TEXT: Readonly<Record<Exclude<VbaExtractionReason, 'no-macros'>, string>> = {
  'not-a-package': 'הקובץ אינו חבילת Word תקינה.',
  'not-a-vba-project': 'במסמך יש מאקרו, אבל פרויקט המאקרו אינו קריא.',
  'too-large': 'פרויקט המאקרו גדול מכדי להיקרא.',
  unsupported: 'פרויקט המאקרו שמור בצורה שאינה נתמכת (למשל מוצפן).',
  unreadable: 'פרויקט המאקרו פגום ולא נקרא.',
};

type VbaExtractionReason = Extract<VbaExtraction, { ok: false }>['reason'];

export function moduleCountText(count: number): string {
  if (count === 1) return 'מודול מאקרו אחד';
  return `${count} מודולי מאקרו`;
}

/**
 * מה שיוצג למשתמש על המאקרו שבבייטים האלה.
 *
 * לעולם אינה זורקת: כשל קריאה הוא תשובה („יש מאקרו ולא הצלחנו לקרוא”), לא
 * חריגה שתפיל פתיחת מסמך. המאקרו הם מה שהמשתמש רואה, לא תנאי לפתיחה.
 */
export async function readDocumentVba(bytes: Uint8Array): Promise<DocumentVba> {
  let result: VbaExtraction;
  try {
    result = await extractVbaFromDocx(bytes);
  } catch (error) {
    // החבילה מתחייבת שלא לזרוק; אם בכל זאת — פתיחת המסמך אינה נפגעת.
    console.warn('[otzaria-word] קריאת המאקרו של המסמך נכשלה', error);
    return NO_VBA;
  }

  if (!result.ok) {
    if (result.reason === 'no-macros') return NO_VBA;
    // חלק מאקרו שנמצא אך לא נקרא: `hasMacroPart` נשאר אמת, אחרת השמירה
    // הייתה מורידה את הסיומת ומאבדת אותו.
    if (result.partName === undefined) {
      // לא נמצא חלק מאקרו כלל — כלומר אין לנו מה לומר על מאקרו, ולא „יש
      // מאקרו פגומים”. קובץ שאינו חבילה תקינה הוא בעיה של מסלול הפתיחה
      // (שמדווח עליה בעצמו), ואזהרת מאקרו עליו הייתה קול שני לאותו כשל.
      return NO_VBA;
    }
    return {
      hasMacroPart: true,
      modules: [],
      autoRun: [],
      warnings: [FAILURE_TEXT[result.reason]],
      status: 'במסמך יש מאקרו שלא ניתן לקרוא — הם יישמרו כמות שהם',
      unreadable: true,
    };
  }

  return fromProject(result.project);
}

function fromProject(project: VbaProject): DocumentVba {
  const autoRun = project.autoRunProcedures.map((ref) => `${ref.module}.${ref.procedure}`);
  const warnings = project.warnings.map((warning) => WARNING_TEXT[warning.code]);

  return {
    hasMacroPart: true,
    modules: project.modules,
    autoRun,
    warnings,
    status: statusFor(project.modules.length, autoRun.length),
    unreadable: false,
  };
}

/**
 * נוסח שורת המצב. האזהרה על הרצה אוטומטית קודמת לספירה: זה מה שהמשתמש צריך
 * לדעת על המסמך שהוא פתח, ולא כמה מודולים יש בו.
 */
function statusFor(moduleCount: number, autoRunCount: number): string | null {
  if (autoRunCount > 0) {
    return `במסמך יש מאקרו שWord מריץ בפתיחה — כאן הם אינם מורצים. Alt+F8 להצגתם`;
  }
  if (moduleCount > 0) {
    return `במסמך יש ${moduleCountText(moduleCount)} — אינם מורצים כאן, ונשמרים כמות שהם. Alt+F8 להצגתם`;
  }
  return null;
}

/**
 * האם החבילה נושאת חלק מאקרו — השאלה הזולה, בלי לפענח דבר.
 *
 * למסלול שכל מה שהוא צריך זה סיומת השמירה. לעולם אינה זורקת.
 */
export async function documentHasMacroPart(bytes: Uint8Array): Promise<boolean> {
  try {
    return (await findVbaPart(bytes)) !== null;
  } catch {
    return false;
  }
}
