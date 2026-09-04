/**
 * התצוגה החיה של בורר הגופן — מה שהיא עושה **במסמך**.
 *
 * המשתמש מסמן קטע, פותח את רשימת הגופנים ועובר עליה; אחרי השהיה קצרה הקטע
 * המסומן נצבע בגופן שהסימון עומד עליו, וכך רואים איך הוא נראה בטקסט האמיתי
 * במקום לנחש משם. יציאה מהרשימה בלי לבחור מחזירה את הגופן שהיה.
 *
 * **המסלול הזה מכובה כרגע** — `FONT_PREVIEW_ENABLED` למטה, ושם כל ההנמקה
 * והמדידות. המודול נשאר שלם ובדוק, מפני שמה שחסר הוא צד המנוע ולא צד הזה.
 *
 * העיתוי — מה מחכה כמה, מה מתבטל, ומה נכנס לתור — אינו כאן אלא ב-
 * `composables/font-preview.ts`. כאן רק המגע במסמך.
 *
 * ## למה `format.apply` על טווח שנתפס, ולא פקודת `font-family`
 *
 * זו ההכרעה היחידה שיש בקובץ, והיא בטיחותית ולא סגנונית.
 *
 * פקודת `font-family` של הרצועה מחילה על **הבחירה הנוכחית**. לתצוגה חיה זה
 * מסלול שבור, וזה מסלול שקורה בפועל: המשתמש לוחץ בתוך המסמך כדי לצאת מהרשימה,
 * הלחיצה מזיזה את הבחירה, ורק **אחריה** מגיע ה-`blur` שסוגר את הרשימה ומבקש
 * להחזיר את הגופן שהיה. ההחזרה הייתה נוחתת על הטקסט שנבחר עכשיו — כלומר משנה
 * גופן בקטע שהמשתמש לא נגע בו בכלל.
 *
 * `doc.format.apply({ target, inline })` מקבל `SelectionTarget` מפורש. הטווח
 * נתפס פעם אחת בתחילת התצוגה, וכל צביעה — כולל ההחזרה — מכוונת אליו. בחירה
 * שזזה בינתיים אינה נוגעת לעניין.
 *
 * וזה גם אותו מסלול בדיוק: `font-family` מנותב במנוע ל-`format.fontFamily`,
 * ומפתח ה-inline שלו הוא `fontFamily` — אותו מפתח שנשלח כאן (נקרא מהמנוע:
 * `docRoute: "format.fontFamily", inline: { key: "fontFamily" }`). כלומר מה
 * שהתצוגה מראה הוא מה שהבחירה תחיל, ולא קירוב שלו.
 *
 * ## מה שהיא **אינה** פותרת, ולמה זה הרג אותה
 *
 * זו מוטציה אמיתית, ולכן היא נכנסת להיסטוריית הביטול, מסמנת „לא נשמר”
 * ומתזמנת autosave. שלושת אלה נמדדו בכרום מול `export.toDocx`, בלי אף לחיצה
 * — רק `mousemove` על שורה ברשימה — וההשהיה, הדילוג על הזהה והתור הסדרתי
 * מצמצמים את מספר הצעדים ולא את קיומם.
 *
 * מה שנמדד: ריחוף אחד העלה **שתי** דרגות undo, ו-`Ctrl+Z` ראשון החזיר את
 * גופן ה**תצוגה** — כלומר גופן שאיש לא בחר. ולא רק ההיסטוריה: ההחזרה אינה
 * חזרה למצב ההתחלתי אלא מוטציה שנייה. ריצה שירשה את הגופן מהסגנון יצאה
 * מהריחוף מפוצלת ועם `<w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>` מפורש,
 * ושמירה בין השתיים מנציחה את הפיצול בקובץ של המשתמש.
 *
 * ראו `FONT_PREVIEW_ENABLED` — שם ההכרעה, ושם גם מה יידרש מהמנוע כדי להחזיר.
 *
 * ## ומה שאינו מוצג כלל
 *
 * בחירה **מעורבת** (שתי משפחות בתוך הקטע) אינה מקבלת תצוגה חיה. הצביעה
 * משטחת את הקטע לגופן אחד, וההחזרה יודעת להחזיר גופן אחד בלבד — כלומר תצוגה
 * על קטע מעורב הייתה מוחקת מידע. הגבול הזה נאכף אצל הקורא (`use-font-controls`),
 * שם יושבת הידיעה „מה הגופן של הבחירה”.
 */
import type { SuperDoc } from 'superdoc';
import type { DocReceipt, MaybePromise } from './document-api';

/**
 * המפסק של התצוגה החיה. `false` — הריחוף אינו נוגע במסמך, והבורר נשאר בורר.
 *
 * ## למה מכובה, ולא „מתוקן”
 *
 * התיקון שנשקל היה לצבוע בטרנזקציה שאינה נכנסת להיסטוריה
 * (`addToHistory: false` על ה-view של המנוע). שלוש מדידות סוגרות את המסלול
 * הזה, ואף אחת מהן אינה עניין של טעם:
 *
 * 1. **אין דגל היסטוריה בחוזה.** `MutationOptions` של `doc.format.apply`
 *    מכיר `changeMode`, `dryRun` וגארד גרסה — ולא היסטוריה
 *    (`document-api/src/write/write.d.ts`). `doc.history` מציע `get`/`undo`/
 *    `redo` בלבד.
 * 2. **המנוע אינו קורא את המטא הזה בכלל.** המחרוזת `addToHistory` אינה
 *    מופיעה באף קובץ של `superdoc/dist`, וה-`HistoryAdapter` שלו נשען על
 *    `context.undoDepth` משלו ולא על `prosemirror-history` — כלומר
 *    `tr.setMeta('addToHistory', false)` הוא no-op, ולא „מסלול לא מתועד”.
 * 3. **`activeEditor.view` אינו חוזה.** בטיפוסים הציבוריים הוא `unknown`
 *    (`core/types/index.d.ts`), והמנוע עצמו ארוז מעורפל. שליחת טרנזקציה
 *    דרכו מחייבת גם לבנות סימן מתוך ה-schema שלו — כלומר להמציא גישה
 *    לפנימיות, וזה בדיוק מה שאסור.
 *
 * וגם אם הצעד לא היה נרשם, המחצית השנייה של התקלה נשארת: ההחזרה היא
 * `format.apply` **שני** ולא ביטול של הראשון, ואין ב-API דרך להסיר את
 * `fontFamily` מהריצה ולהחזירה לירושה מהסגנון. כלומר ה-OOXML לא היה חוזר
 * לצורתו — הריצה נשארת מפוצלת עם `rFonts` מפורש שלא היה שם.
 *
 * מכאן ההכרעה: תצוגה חיה ששוברת Undo, מסמנת „לא נשמר” ומתזמנת שמירה של גופן
 * שאיש לא בחר אינה שווה את מה שהיא נותנת. הבורר ממילא מצייר כל שורה בגופן
 * שלה, כולל דגימת אותיות עבריות (`RibbonCombo`) — כלומר מה שהתצוגה החיה
 * הוסיפה הוא „בטקסט שלי”, לא „איך הגופן נראה”.
 *
 * ## ומה שנמדד אחר כך: גם כשמסלול חסר-היסטוריה נמצא, זה לא הספיק
 *
 * שלוש הנקודות למעלה נכונות ל-`format.apply`, אבל הן **אינן** הסיפור המלא:
 * ל-superdoc 2 יש משטח הרחבות ציבורי עם ספק דקורציות render-only
 * (`ctx.visuals.highlight`), ודרכו נמדדו אפס דרגות undo, אפס `onEditorUpdate`
 * ו-docx **זהה בייט-בבייט** — כלומר כל מה שהרג את המסלול הזה נפתר שם.
 *
 * ובכל זאת אינו נשלח, משתי סיבות שאין להן גידור בצד שלנו:
 *   1. **המנוע אינו זורם מחדש.** הריצה גדלה במקום, השורה מתארכת מעבר לטור
 *      ומה שלא נכנס נחתך בקצה העמוד — נמדד 237px גלישה ו-141px מחוץ לעמוד.
 *   2. **הצביעה גסה מן הבחירה.** בחירה של 9 תווים בתוך ריצה של 23 צובעת את כל
 *      23, בזמן שהלחיצה תשנה 9. תצוגה שמראה שינוי רחב פי שניים וחצי ממה
 *      שיקרה היא הטעיה, וזה גרוע מאין תצוגה.
 *
 * הרשומה המלאה, כולל מה ש-`::highlight()` אינו יכול לעשות ומה שנשלל בכרום
 * 152, ב-`docs/engine-gaps.md` („תצוגה חיה של גופן”).
 *
 * ## מה נשלח במקום
 *
 * תצוגה שאינה במסמך: פס דגימה בתחתית רשימת הגופנים, שמציג את הטקסט הנבחר של
 * המשתמש בגופן שמרחפים עליו. הוא נאמן מפני שאין בו עימוד לשקר עליו, והוא נשען
 * על `readSelectionText` כאן — קריאה טהורה, בלי מגע במסמך.
 *
 * המודולים של המסלול הכבוי נשארים במקומם ובדוקים, כתיעוד מדוד של מה שנשלל.
 * המפסק נבדק ב-`tests/unit/font-preview.test.ts` („המפסק”).
 */
export const FONT_PREVIEW_ENABLED = false;

/** מה שנקרא מ-`doc.selection.current()`. הכול אופציונלי — מגיע מהמנוע. */
interface SelectionInfoLike {
  empty?: boolean;
  selectionTarget?: unknown;
  /** מגיע רק עם `includeText: true` — ראו `readSelectionText`. */
  text?: string;
}

/**
 * `includeText` הוא opt-in של המנוע, ולא ברירת מחדל, מטעמי ביצועים. הפרמטר
 * אופציונלי כאן מפני ש-`captureRange` קורא בלעדיו — הוא צריך כתובת, לא טקסט.
 */
interface SelectionQuery {
  includeText?: boolean;
}

/**
 * החלק מ-`activeEditor.doc` שנצרך כאן. הכול אופציונלי: גרסת מנוע בלי
 * `format.apply` פשוט אינה מציגה תצוגה חיה, ואינה נופלת.
 */
export interface FontPreviewDocumentApi {
  selection?: {
    current?: (query?: SelectionQuery) => MaybePromise<SelectionInfoLike | undefined>;
  };
  format?: {
    apply?: (input: { target: unknown; inline: Record<string, unknown> }) => MaybePromise<DocReceipt>;
  };
}

export interface FontPreviewHost {
  activeEditor?: { doc?: FontPreviewDocumentApi | null } | null;
}

export type FontPreviewTarget = SuperDoc | FontPreviewHost | null | undefined;

function docOf(host: FontPreviewTarget): FontPreviewDocumentApi | null {
  return (host as FontPreviewHost | null | undefined)?.activeEditor?.doc ?? null;
}

/**
 * תופסת את הטווח המסומן, למגע חוזר בו גם אחרי שהבחירה זזה.
 *
 * `null` בכל מצב שאינו „טווח מסומן שאפשר לצייר עליו”: סמן מכווץ, גרסה בלי
 * `selection.current`, קריאה שנכשלה. התצוגה החיה היא נוחות; היא לעולם אינה
 * מפילה דבר ואינה מדווחת למשתמש — כשל בה פירושו שלא מוצג דבר, וזה מצב תקין.
 */
export async function captureRange(host: FontPreviewTarget): Promise<unknown | null> {
  const current = docOf(host)?.selection?.current;
  if (typeof current !== 'function') return null;

  try {
    const info = await current();
    if (!info || info.empty === true || !info.selectionTarget) return null;
    return info.selectionTarget;
  } catch (error) {
    console.warn('[otzaria-word] תפיסת הטווח לתצוגה החיה של הגופן נכשלה', error);
    return null;
  }
}

/**
 * הטקסט שהמשתמש סימן, לפס הדגימה שבתחתית רשימת הגופנים.
 *
 * ## למה זה בטוח, ולמה זה מה שנשלח
 *
 * `selection.current` היא הקריאה היחידה כאן, והיא **קריאה בלבד** — נמדד
 * בכרום אמיתי: 1ms, ו-`history.get()` זהה לפניה ואחריה. זה ההבדל היחיד, וגם
 * המכריע, בין הפס לבין המסלול הכבוי שמעליו: אותה שאלה („איך הטקסט שלי ייראה
 * בגופן הזה”), בלי מוטציה, בלי דרגת undo ובלי שמירה מתוזמנת.
 *
 * ⚠️ `includeText: true` הוא חובה ולא אופטימיזציה. בלעדיו המנוע אינו מחזיר
 * `text` כלל — הוא חוסך את האיסוף בכוונה — וההיעדר נראה בדיוק כמו „הבחירה
 * ריקה”.
 *
 * `''` בכל כשל, ולא `null`: הקורא מציג ממילא משפט ברירת מחדל כשאין טקסט
 * מסומן, ושתי צורות של „אין” היו שני מסלולים לאותה תצוגה אחת.
 */
export async function readSelectionText(host: FontPreviewTarget): Promise<string> {
  const current = docOf(host)?.selection?.current;
  if (typeof current !== 'function') return '';

  try {
    const info = await current({ includeText: true });
    if (!info || info.empty === true) return '';
    return typeof info.text === 'string' ? info.text : '';
  } catch (error) {
    console.warn('[otzaria-word] קריאת הטקסט המסומן לפס הדגימה נכשלה', error);
    return '';
  }
}

/**
 * צובעת טווח שנתפס בגופן. `false` = לא נצבע, ואז הקורא יודע שאין מה להחזיר.
 *
 * `NO_OP` נחשב הצלחה, כמו בכל שאר המסלולים: „הגופן כבר היה זה” אינו כשל.
 */
export async function paintFamily(
  host: FontPreviewTarget,
  target: unknown,
  family: string,
): Promise<boolean> {
  const apply = docOf(host)?.format?.apply;
  if (typeof apply !== 'function' || target === null || target === undefined) return false;

  try {
    const receipt = await apply({ target, inline: { fontFamily: family } });
    return receipt?.success !== false || receipt?.failure?.code === 'NO_OP';
  } catch (error) {
    console.warn('[otzaria-word] צביעת התצוגה החיה של הגופן נכשלה', error);
    return false;
  }
}
