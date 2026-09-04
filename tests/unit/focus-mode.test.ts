/**
 * מצב מיקוד — איזה קצה חושף מה.
 *
 * הבאג שהבדיקה הזאת מקבעת: החשיפה הייתה
 * `.word-app-shell.focus-mode:hover`, וה-hover הוא על כל המעטפת. כלומר כל
 * תנועת עכבר בחלון החזירה את שלושת הפסים, ומצב המיקוד לא הסתיר כלום בפועל.
 */
import { describe, expect, it } from 'vitest';
import { REVEAL_EDGE_PX, revealZone } from '../../src/composables/focus-mode';

const HEIGHT = 900;

describe('revealZone', () => {
  it('מצביע בגוף המסמך אינו חושף כלום', () => {
    // זה המקרה שהיה שבור: אמצע החלון החזיר את כל הפסים.
    expect(revealZone(450, HEIGHT)).toBeNull();
    expect(revealZone(REVEAL_EDGE_PX + 1, HEIGHT)).toBeNull();
    expect(revealZone(HEIGHT - REVEAL_EDGE_PX - 1, HEIGHT)).toBeNull();
  });

  it('קרבה לקצה העליון חושפת את הפס העליון והרצועה', () => {
    expect(revealZone(0, HEIGHT)).toBe('top');
    expect(revealZone(REVEAL_EDGE_PX, HEIGHT)).toBe('top');
  });

  it('קרבה לקצה התחתון חושפת את שורת המצב', () => {
    expect(revealZone(HEIGHT, HEIGHT)).toBe('bottom');
    expect(revealZone(HEIGHT - REVEAL_EDGE_PX, HEIGHT)).toBe('bottom');
  });

  it('בחלון נמוך מפעמיים הרצועה הקצה העליון גובר', () => {
    // שני האזורים חופפים, ובלי סדר מוגדר התחתון היה מנצח בכל מקום — כלומר
    // הפס העליון לא היה נחשף אף פעם בחלון קטן.
    expect(revealZone(10, 30)).toBe('top');
    expect(revealZone(25, 30)).toBe('bottom');
  });

  it('עובי הרצועה נשלט מבחוץ', () => {
    expect(revealZone(40, HEIGHT, { edge: 60 })).toBe('top');
    expect(revealZone(40, HEIGHT, { edge: 10 })).toBeNull();
  });

  it('קלט לא חוקי אינו חושף ואינו זורק', () => {
    // `clientY` מ-pointerevent סינתטי, וגובה 0 לפני שהחלון נמדד.
    expect(revealZone(Number.NaN, HEIGHT)).toBeNull();
    expect(revealZone(10, 0)).toBeNull();
    expect(revealZone(10, Number.NaN)).toBeNull();
  });

  it('הרצועה צרה מהפס עצמו', () => {
    // פס הכותרת הוא 48px; רצועה בעובי הפס הייתה נחשפת כבר בשורה הראשונה של
    // הטקסט, וזה חוזר לבאג המקורי בגרסה מרוככת.
    expect(REVEAL_EDGE_PX).toBeLessThan(48);
  });
});

/**
 * הבאג שהבדיקות האלה מקבעות: הרצועה היא 24px, והפסים שהיא חושפת גבוהים
 * בהרבה. כלומר עצם התנועה אל כפתור שהרגע נחשף הוציאה את המצביע מהרצועה,
 * הפסים הוסתרו תוך כדי — ואיתם `pointer-events` — והלחיצה לא הגיעה לשום מקום.
 * חשיפה שנעלמת בדיוק כשמושיטים אליה יד אינה חשיפה.
 */
describe('revealZone — הישארות חשוף כל עוד המצביע מעל הפסים', () => {
  /** פסים עליונים עד 150px, שורת מצב מ-870px — כמו רצועה פרושה עם סרגל. */
  const bounds = { top: 150, bottom: 870 };

  it('פס עליון שנחשף נשאר חשוף לכל גובהו', () => {
    // 60 ו-150 הם בתוך הרצועה של הכלים ומחוץ ל-24 פיקסלים. בלי ההיסטרזיס
    // שניהם היו מחזירים null, כלומר הכפתור נעלם מתחת לאצבע.
    expect(revealZone(60, HEIGHT, { current: 'top', bounds })).toBe('top');
    expect(revealZone(150, HEIGHT, { current: 'top', bounds })).toBe('top');
  });

  it('ומוסתר ברגע שהמצביע יורד מהם', () => {
    expect(revealZone(151, HEIGHT, { current: 'top', bounds })).toBeNull();
    expect(revealZone(400, HEIGHT, { current: 'top', bounds })).toBeNull();
  });

  it('שורת מצב שנחשפה נשארת חשופה לכל גובהה', () => {
    expect(revealZone(870, HEIGHT, { current: 'bottom', bounds })).toBe('bottom');
    expect(revealZone(890, HEIGHT, { current: 'bottom', bounds })).toBe('bottom');
    expect(revealZone(869, HEIGHT, { current: 'bottom', bounds })).toBeNull();
  });

  it('המצב הסגור עדיין דורש התקרבות לקצה', () => {
    // ההיסטרזיס מרחיב רק את ההישארות. אחרת די היה להיות מעל הרצועה כדי
    // לפתוח אותה, וזה חוזר לבאג המקורי.
    expect(revealZone(60, HEIGHT, { current: null, bounds })).toBeNull();
    expect(revealZone(10, HEIGHT, { current: null, bounds })).toBe('top');
  });

  it('מעבר מקצה לקצה עובד גם כשמשהו חשוף', () => {
    // המצביע קפץ מהפסים העליונים לשורת המצב: ההישארות אינה נעולה על 'top'.
    expect(revealZone(HEIGHT - 5, HEIGHT, { current: 'top', bounds })).toBe('bottom');
  });

  it('בלי מדידה ההתנהגות חוזרת לרצועה בלבד', () => {
    // גובלים שלא נמדדו (טרם הורכב הממשק) אינם אמורים להשאיר את הפסים חשופים
    // לנצח, וגם לא לבטל את החשיפה.
    expect(revealZone(60, HEIGHT, { current: 'top', bounds: null })).toBeNull();
    expect(revealZone(10, HEIGHT, { current: 'top', bounds: null })).toBe('top');
  });

  it('פס שאינו מצויר אינו מרחיב את האזור', () => {
    // רצועה מכונסת וסרגל כבוי: הגובל מצטמצם, וההישארות מצטמצמת איתו.
    const collapsed = { top: 48, bottom: 876 };
    expect(revealZone(48, HEIGHT, { current: 'top', bounds: collapsed })).toBe('top');
    expect(revealZone(60, HEIGHT, { current: 'top', bounds: collapsed })).toBeNull();
  });

  it('גובל קטן מהרצועה אינו מקטין אותה', () => {
    // הרצועה היא הרצפה: גובל 0 (שום דבר לא נמדד בפועל) אינו הופך את החשיפה
    // לבלתי אפשרית להחזקה.
    expect(revealZone(20, HEIGHT, { current: 'top', bounds: { top: 0, bottom: HEIGHT } })).toBe('top');
  });
});
