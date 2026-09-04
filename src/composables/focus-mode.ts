/**
 * מצב מיקוד: איזה חלק מהמעטפת נחשף כשהמצביע מתקרב לקצה.
 *
 * למה זה כאן ולא רק ב-CSS: המימוש הראשון היה
 * `.word-app-shell.focus-mode:hover { opacity: 1 }`, וה-hover הוא על **כל
 * המעטפת** — כלומר כל תנועת עכבר בחלון החזירה את כל הפסים, ומצב המיקוד לא
 * הסתיר כלום בפועל. אין דרך לכתוב „hover על הקצה” ב-CSS בלי אלמנט עזר
 * ו-`:has()`, ופונקציה טהורה גם אפשר לבדוק.
 *
 * `null` = שום דבר אינו נחשף.
 */
export type RevealZone = 'top' | 'bottom' | null;

/**
 * עובי רצועת החשיפה בפיקסלים.
 *
 * גדול מספיק שאפשר לכוון אליו בעכבר בלי דיוק, וקטן מספיק שהוא לא ייגע כשהמצביע
 * נמצא בגוף המסמך. הערך נמדד מול גובה הפס עצמו (48px) — רצועה בעובי הפס הייתה
 * נחשפת כבר בשורה הראשונה של הטקסט.
 */
export const REVEAL_EDGE_PX = 24;

/**
 * גובלי הקבוצות שנחשפות, בפיקסלים מראש החלון.
 *
 * נמדדים מהמסך ונמסרים לכאן, כדי שההחלטה תישאר טהורה. הסרגל האנכי אינו נכנס
 * ל-`top` למרות שהוא חלק מהקבוצה שנחשפת: הוא נמתח לכל גובה המסמך, וגובל
 * שנגזר ממנו היה הופך „קרוב לקצה העליון” לכל המסך.
 */
export interface RevealBounds {
  /** התחתית של הפסים העליונים (כותרת, רצועה, סרגל אופקי). */
  top: number;
  /** הראש של שורת המצב. */
  bottom: number;
}

export interface RevealOptions {
  /** עובי רצועת החשיפה. */
  edge?: number;
  /** מה נחשף כרגע. זה מה שמפעיל את ההיסטרזיס — ראו למטה. */
  current?: RevealZone;
  /** גובלי הפסים כפי שנמדדו. `null` = לא נמדדו, ואז הרצועה בלבד. */
  bounds?: RevealBounds | null;
}

/**
 * מה צריך להיות חשוף עכשיו.
 *
 * `viewportHeight` נמסר ולא נקרא מ-`window`, כדי שהפונקציה תהיה טהורה ובדיקה
 * לא תצטרך לזייף את החלון.
 *
 * ## למה יש כאן היסטרזיס ולא רק „קרוב לקצה”
 *
 * הרצועה היא 24 פיקסלים, והפסים שהיא חושפת גבוהים בהרבה — כותרת, רצועת כלים
 * וסרגל. כלומר עצם התנועה אל כפתור שהרגע נחשף מוציאה את המצביע מהרצועה, הפסים
 * מוסתרים חזרה תוך כדי, ואיתם גם `pointer-events` — הלחיצה אינה מגיעה לשום
 * מקום. חשיפה שנעלמת בדיוק כשמושיטים אליה יד אינה חשיפה.
 *
 * לכן שני ספים שונים: **להיפתח** צריך להתקרב לקצה, אבל **להישאר פתוח** די
 * בכך שהמצביע עדיין מעל הפסים עצמם. הסתרה קורית רק כשהוא יורד מהם לגמרי.
 */
export function revealZone(
  clientY: number,
  viewportHeight: number,
  options: RevealOptions = {},
): RevealZone {
  const edge = options.edge ?? REVEAL_EDGE_PX;
  if (!Number.isFinite(clientY) || !Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    return null;
  }

  /* הסף להישארות: הגדול מבין הרצועה לבין הפסים שנחשפו בפועל. גובל שלא נמדד,
     או פס שאינו מצויר, מחזירים את ההתנהגות לרצועה בלבד — ולא מבטלים אותה. */
  const bounds = options.bounds ?? null;
  if (options.current === 'top') {
    const keepWhileAbove = Math.max(edge, finiteOr(bounds?.top, 0));
    if (clientY <= keepWhileAbove) return 'top';
  }
  if (options.current === 'bottom') {
    const keepWhileBelow = Math.min(viewportHeight - edge, finiteOr(bounds?.bottom, viewportHeight));
    if (clientY >= keepWhileBelow) return 'bottom';
  }

  // הסף להיפתח. חלון נמוך מפעמיים הרצועה: הקצה העליון גובר, אחרת שני האזורים
  // חופפים והתחתון היה מנצח בכל מקום.
  if (clientY <= edge) return 'top';
  if (clientY >= viewportHeight - edge) return 'bottom';
  return null;
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
