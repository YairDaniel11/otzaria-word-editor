/**
 * עטיפה מוטיפסת סביב מסך הטעינה שב-index.html.
 *
 * המימוש עצמו אינו כאן אלא כסקריפט inline ב-`<body>`, ובכוונה: מסך הטעינה
 * חייב להיות מצויר לפני שנטענת שורה אחת מ-`app.js`, ולכן הוא לא יכול להיות
 * חלק מהבאנדל שהוא מכסה עליו. מודול שנטען אחרי 11MB אינו יכול לומר „טוען”.
 *
 * מכאן שכל קריאה כאן היא no-op כשה-API חסר — בבדיקות ב-jsdom, ובכל דף שאינו
 * `index.html` שלנו. זו אינה הגנה תיאורטית: `tests/` מרכיב את `App.vue` בלי
 * ה-HTML הזה, ומסך טעינה אינו סיבה להפיל בדיקה.
 *
 * חלוקת האחוזים היא לפי הזמנים שנמדדו ב-`scripts/startup-probe.mjs` ולא לפי
 * מספר השלבים: פריסת `app.js` ועליית המנוע הן כמעט כל הזמן, ופס שמחלק את
 * הטווח שווה בשווה בין ארבעה שלבים היה קופא על שניים מהם.
 */

/** ה-API שהסקריפט ב-index.html מפרסם על `window`. */
interface SplashApi {
  set(target: number, text?: string): void;
  fail(text?: string, detail?: string): void;
  done(): void;
}

/**
 * תחנות ההתקדמות. הערך הוא היעד שאליו הפס זוחל, לא קפיצה — ראו ה-tick
 * ב-index.html.
 *
 * הסדר כאן הוא סדר הזמנים בפועל, ולא סדר לוגי — וזה מה שקובע: מסך הטעינה
 * בולע דיווח שנמוך מהיעד הנוכחי, ולכן תחנה שמדווחת מאוחר אך ממוספרת מוקדם
 * פשוט נעלמת, על הטקסט שלה.
 *
 * שתי התחנות הראשונות (22 ו-55) אינן כאן אלא בטוען שב-`vite.config.ts`,
 * כלומר לפני שקיים בכלל קוד שיכול לייבא את המודול הזה. שם הן מדווחות על
 * השלב ש**מתחיל** ולא על זה שנגמר, ומטעם שנמדד: דיווח ב-`onload` של `app.js`
 * נעלם, מפני ש-`main.ts` מרכיב את הממשק במיקרו-טסק בתוך אותה הרצה ומקדים
 * אותו ל-68. `tests/unit/splash.test.ts` מאמת את הרצף, ו-`check:startup`
 * מאמת בדפדפן אמיתי שכל תחנה אכן הופיעה על המסך.
 */
export const SPLASH_STAGES = {
  /** קליפת הממשק הורכבה (מוסתרת עדיין מאחורי מסך הטעינה). */
  shellMounted: 68,
  /** המנוע מקים את המסמך עצמו — השלב הארוך. */
  documentOpening: 82,
} as const;

function api(): SplashApi | undefined {
  return (window as unknown as { __otzariaSplash?: SplashApi }).__otzariaSplash;
}

/** מקדם את הפס לשלב, עם טקסט מצב. */
export function splashStage(target: number, text?: string): void {
  api()?.set(target, text);
}

/** כשל סופי. המסך נשאר על המסך עם ההודעה. `detail` הוא הפירוט הטכני. */
export function splashFail(text: string, detail?: string): void {
  api()?.fail(text, detail);
}

/** סוגר את מסך הטעינה ומסיר אותו מה-DOM. אידמפוטנטי. */
export function splashDone(): void {
  api()?.done();
}
