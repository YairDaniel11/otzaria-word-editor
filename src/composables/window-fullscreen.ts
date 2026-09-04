/**
 * מסך מלא ברמת החלון — „שיעלים גם את אוצריא”.
 *
 * מצב מיקוד מסתיר את הפסים **שלנו**. סביבנו יושבת אוצריא: פס הכותרת שלה,
 * שורת הטאבים וסרגל הניווט. הדרך היחידה שדף שרץ בתוך WebView יכול לבקש את
 * החלון כולו היא ה-Fullscreen API של הדפדפן — ל-SDK של אוצריא אין קריאה
 * למסך מלא. נמדד ב-2026-09-01 מול `docs/plugin-sdk/API_REFERENCE.md`,
 * מול טבלת ה-RPC ב-`lib/plugins/bridge/plugin_bridge_handler.dart`
 * ומול `origin/dev`: הערוץ היחיד שקשור למסך מלא הוא `otzaria_escape_pressed`,
 * והוא לכיוון אחד — יציאה.
 *
 * לכן הפונקציות כאן **אינן** מבטיחות דבר: בקשה שנדחתה מחזירה `false`, ומי
 * שקרא ממשיך כרגיל. מצב מיקוד שעובד רק אם המסך המלא הצליח היה מצב מיקוד
 * שנשבר בכל מאחז שאינו תומך.
 *
 * הקידומת של WebKit אינה קישוט: אוצריא רצה גם ב-macOS, ושם ה-WebView הוא
 * WKWebView — שחושף רק את `webkitRequestFullscreen`, וזו גרסה שאינה מחזירה
 * Promise.
 */

/** מה שאפשר להרחיב. ה-union מאפשר גם אלמנט אמיתי וגם כפיל בבדיקה. */
export interface FullscreenTarget {
  requestFullscreen?: (options?: unknown) => Promise<void>;
  webkitRequestFullscreen?: () => Promise<void> | void;
}

/** מי שמנהל את המצב — `document` בפועל. */
export interface FullscreenOwner {
  documentElement?: FullscreenTarget;
  fullscreenElement?: Element | null;
  webkitFullscreenElement?: Element | null;
  exitFullscreen?: () => Promise<void>;
  webkitExitFullscreen?: () => Promise<void> | void;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

/**
 * שני שמות לאותו אירוע. הלא-מקודם קיים ב-WebView2, המקודם ב-WKWebView, ולכן
 * ההאזנה היא לשניהם.
 *
 * **מאחז יכול לירות את שניהם על אותו מעבר**, וזה מה שהופך את הסינון
 * ב-`watchFullscreen` לחובה ולא לניקיון: הקורא במעטפת הוא `closeTopmostLayer`,
 * והוא **אינו** אידמפוטנטי — קריאה שנייה סוגרת שכבה שנייה. יציאה אחת ממסך
 * מלא הייתה סוגרת גם את דיאלוג החיפוש וגם את מצב המיקוד, כלומר בדיוק היפוך
 * סדר השכבות שהמאזין הזה נכתב כדי לתקן.
 */
const CHANGE_EVENTS = ['fullscreenchange', 'webkitfullscreenchange'] as const;

/** `null` = אין `document` (בדיקה ללא DOM), ואז כל פעולה כאן היא no-op. */
function ownerOf(owner?: FullscreenOwner | null): FullscreenOwner | null {
  if (owner) return owner;
  return typeof document === 'undefined' ? null : (document as unknown as FullscreenOwner);
}

/** האם החלון במסך מלא כרגע. */
export function isFullscreen(owner?: FullscreenOwner | null): boolean {
  const host = ownerOf(owner);
  if (!host) return false;
  return Boolean(host.fullscreenElement ?? host.webkitFullscreenElement);
}

/**
 * בקשת מסך מלא. `false` = המאחז סירב או שאינו תומך.
 *
 * **חייבת להיקרא מתוך מחווה של המשתמש** (לחיצה או הקשה) — זו דרישת הדפדפן,
 * ולכן שחזור מצב מיקוד מהפעלה קודמת אינו קורא לכאן: הוא היה נכשל תמיד.
 *
 * לעולם אינה זורקת. היא נקראת מתוך טיפול במקש, וחריגה שם מפילה את המאזין
 * הגלובלי — כלומר את כל הקיצורים, ולא רק את זה.
 *
 * ואין כאן „האם בכלל אפשר” נפרד. הייתה כאן `canFullscreen` שקראה
 * `fullscreenEnabled`, ולא היה לה אף קורא: מי שרוצה מסך מלא פשוט מבקש, ומקבל
 * `false` אם המאחז סירב — שאלה מקדימה שאפשר לענות עליה רק בניחוש אינה מוסיפה
 * לו דבר, ומצב מיקוד ממילא אינו תלוי בתשובה.
 */
export async function enterFullscreen(owner?: FullscreenOwner | null): Promise<boolean> {
  const host = ownerOf(owner);
  const target = host?.documentElement;
  if (!target) return false;

  try {
    if (typeof target.requestFullscreen === 'function') {
      await target.requestFullscreen();
      return true;
    }
    if (typeof target.webkitRequestFullscreen === 'function') {
      await target.webkitRequestFullscreen();
      return true;
    }
  } catch {
    /* מאחז שאינו מרשה. מצב המיקוד עצמו אינו תלוי בזה. */
  }
  return false;
}

/** יציאה ממסך מלא. `false` = לא היינו בו, או שאין למי לפנות. */
export async function exitFullscreen(owner?: FullscreenOwner | null): Promise<boolean> {
  const host = ownerOf(owner);
  if (!host || !isFullscreen(host)) return false;

  try {
    if (typeof host.exitFullscreen === 'function') {
      await host.exitFullscreen();
      return true;
    }
    if (typeof host.webkitExitFullscreen === 'function') {
      await host.webkitExitFullscreen();
      return true;
    }
  } catch {
    /* אותו טעם כמו בכניסה. */
  }
  return false;
}

/**
 * האזנה ליציאה שלא באה מאיתנו — `Escape` של הדפדפן, או `F11` שלו.
 *
 * **מדווחת רק על שינוי בפועל.** ראו `CHANGE_EVENTS`: שני שמות האירוע יכולים
 * לירות שניהם על אותו מעבר, והקורא סוגר שכבה בכל קריאה.
 *
 * בלעדיה נשארת מעטפת בלי פסים בתוך חלון רגיל: המשתמש יצא ממסך מלא, וממצב
 * המיקוד לא. מחזירה פונקציית פירוק.
 *
 * **וזה גם ערוץ ה-`Escape` היחיד שיש בתוך מסך מלא.** נמדד ב-Chrome אמיתי:
 * `Escape` שמשמש ליציאה ממסך מלא **נבלע** — הדף קיבל `keys: []` ורק
 * `fullscreenchange: [false]`. כלומר בתוך מסך מלא אין שום `keydown` שאפשר
 * לתלות בו את סגירת השכבה שהמשתמש רואה, והאירוע הזה הוא כל מה שיש. מי שקורא
 * לכאן חייב לנתב אותו דרך אותן שכבות שהמקלדת עוברת בהן — ראו המאזין
 * ב-`App.vue`.
 */
export function watchFullscreen(
  onChange: (fullscreen: boolean) => void,
  owner?: FullscreenOwner | null,
): () => void {
  const host = ownerOf(owner);
  if (!host?.addEventListener) return () => {};

  // מצב אחרון שדווח, כדי ששני שמות האירוע לא ייחשבו לשני מעברים. `isFullscreen`
  // ולא `false`: מי שנרשם בזמן שהחלון כבר במסך מלא אינו אמור לקבל „נכנסת”.
  let last = isFullscreen(host);
  const listener = (): void => {
    const now = isFullscreen(host);
    if (now === last) return;
    last = now;
    onChange(now);
  };
  for (const event of CHANGE_EVENTS) host.addEventListener(event, listener);

  return () => {
    for (const event of CHANGE_EVENTS) host.removeEventListener?.(event, listener);
  };
}
