/**
 * מיקום הגלילה של מסמך שיורד מהמסך וחוזר.
 *
 * ## מה נשמר כאן
 *
 * שלושה כללים, וההבדל ביניהם הוא כל התוכן של המודול: „החזר את מה שנשמר”
 * (מעבר טאב — מה שנשמר הוא האמת היחידה), „תקן רק אם אבד” (חזרה מהרקע —
 * המיכל אולי לא איבד דבר, וכתיבה גורפת שם היא קפיצה), ו„חכה לגלילה הראשונה”
 * (`guardPaneScroll` — המנוע כותב אפס מתוך הגלגלת של המשתמש, אחרי שכל השמה
 * שלנו כבר קרתה).
 *
 * מוטציה שמחליפה את `repairPaneScroll` ב-`applyPaneScroll` נראית תמימה
 * לחלוטין, ובפועל היא זו שגורמת למסמך לקפוץ ממקום שהמשתמש בחר. הבדיקות כאן
 * הן מה שמפריד ביניהן.
 */
import { describe, it, expect } from 'vitest';
import {
  applyPaneScroll,
  guardPaneScroll,
  PANE_SCROLL_ORIGIN,
  readPaneScroll,
  repairPaneScroll,
  samePaneScroll,
  type ScrollPane,
  type WatchableScrollPane,
} from '../../src/sessions/pane-scroll';

/** דלת אחורית לבדיקת הקיפאון בלבד: `Readonly` אינו קיים בזמן ריצה. */
type PaneScrollWritable = { top: number; left: number };

/** מיכל גלילה מזויף — שני מספרים, וזה כל מה שהמודול נוגע בו. */
function pane(top = 0, left = 0): ScrollPane {
  return { scrollTop: top, scrollLeft: left };
}

/**
 * מיכל שאפשר גם להאזין לו, ולירות בו `scroll` ביד.
 *
 * `scroll` אמיתי נורה אסינכרונית ואי אפשר לחכות לו בבדיקה. מה שנבדק כאן אינו
 * מתי הדפדפן יורה אלא **מה השומר עושה עם האירוע** — ולכן הירי ידני.
 */
function watchable(top = 0, left = 0): WatchableScrollPane & {
  fire: () => void;
  listeners: number;
} {
  const listeners: Array<() => void> = [];
  return {
    scrollTop: top,
    scrollLeft: left,
    addEventListener: (_type: 'scroll', listener: () => void) => {
      listeners.push(listener);
    },
    removeEventListener: (_type: 'scroll', listener: () => void) => {
      const at = listeners.indexOf(listener);
      if (at >= 0) listeners.splice(at, 1);
    },
    fire: () => {
      for (const listener of [...listeners]) listener();
    },
    get listeners() {
      return listeners.length;
    },
  };
}

describe('readPaneScroll', () => {
  it('קוראת את שני הצירים', () => {
    expect(readPaneScroll(pane(420, 17))).toEqual({ top: 420, left: 17 });
  });

  it('בלי מיכל — ראש המסמך, ולא קריסה', () => {
    // טאב שממתין לטעינה או שנרדם: אין לו host כלל.
    expect(readPaneScroll(null)).toEqual(PANE_SCROLL_ORIGIN);
    expect(readPaneScroll(undefined)).toEqual(PANE_SCROLL_ORIGIN);
  });

  it('ערך פגום נקרא כאפס ולא נשמר כפי שהוא', () => {
    // `NaN` או אינסוף שנשמרו היו חוזרים אחר כך כהשמה ל-`scrollTop`.
    expect(readPaneScroll({ scrollTop: Number.NaN, scrollLeft: Number.POSITIVE_INFINITY }))
      .toEqual(PANE_SCROLL_ORIGIN);
  });

  it('שלילי הוא מיקום חוקי — כך כרום מדווח מיכל rtl', () => {
    // נמדד בדפדפן: מיכל `direction: rtl` מדווח `scrollLeft` בטווח [-1000, 0].
    // פסילה של שלילי הפכה כל מיקום אופקי כזה ל„תחילת השורה”.
    expect(readPaneScroll({ scrollTop: 300, scrollLeft: -420 })).toEqual({ top: 300, left: -420 });
  });

  it('מחזירה עותק ולא הפניה לקבוע המשותף', () => {
    const read = readPaneScroll(null);
    read.top = 99;

    expect(PANE_SCROLL_ORIGIN.top, 'הקבוע נשאר ראש המסמך לכל הקוראים').toBe(0);
  });

  it('הקבוע קפוא — כתיבה אליו אינה מזיזה את ראש המסמך', () => {
    // הוא נמסר כארגומנט ולכל ההשוואות כאן, וכתיבה בשוגג הייתה מזיזה אותו
    // לכל הקוראים בבת אחת. `Object.freeze` ולא רק `Readonly` שנעלם בקומפילציה.
    const origin = PANE_SCROLL_ORIGIN as PaneScrollWritable;
    try {
      origin.top = 500;
    } catch {
      /* מצב strict זורק, מצב רגיל מתעלם — שתי ההתנהגויות תקינות. */
    }

    expect(PANE_SCROLL_ORIGIN.top).toBe(0);
  });
});

describe('applyPaneScroll', () => {
  it('מחזירה את שני הצירים', () => {
    const host = pane();

    expect(applyPaneScroll(host, { top: 300, left: 40 })).toBe(true);
    expect(host).toEqual({ scrollTop: 300, scrollLeft: 40 });
  });

  it('אינה כותבת כשאין הבדל', () => {
    // השמה ל-`scrollTop` היא בקשת גלילה, והיא מבטלת גלילה חלקה שרצה ברגע זה.
    const host = pane(120, 0);

    expect(applyPaneScroll(host, { top: 120, left: 0 })).toBe(false);
  });

  it('מחזירה גם לראש המסמך — זה מיקום ולא „אין מיקום”', () => {
    const host = pane(500);

    expect(applyPaneScroll(host, PANE_SCROLL_ORIGIN)).toBe(true);
    expect(host.scrollTop).toBe(0);
  });

  it('בלי מיכל — לא עושה דבר', () => {
    expect(applyPaneScroll(null, { top: 10, left: 0 })).toBe(false);
  });
});

describe('repairPaneScroll', () => {
  it('מיכל שהתאפס ואנחנו זוכרים אחרת — מתוקן', () => {
    // זו החתימה של „המיקום נמחק”, וזה כל מה שהתיקון הזה מכסה.
    const host = pane(0, 0);

    expect(repairPaneScroll(host, { top: 900, left: 12 })).toBe(true);
    expect(host).toEqual({ scrollTop: 900, scrollLeft: 12 });
  });

  it('מיכל ששרד אינו נגרר למקום אחר', () => {
    // הכלל שמונע את הנזק ההפוך: המסמך התעמד מחדש והמשתמש כבר במקום אחר.
    const host = pane(140, 0);

    expect(repairPaneScroll(host, { top: 900, left: 0 })).toBe(false);
    expect(host.scrollTop).toBe(140);
  });

  it('לא זכרנו כלום — אין מה לתקן', () => {
    const host = pane(0, 0);

    expect(repairPaneScroll(host, PANE_SCROLL_ORIGIN)).toBe(false);
  });

  it('אידמפוטנטית: קריאה שנייה אינה כותבת שוב', () => {
    // שלושת מקורות „חזר” יורים יחד (host/lifecycle.ts), והתיקון נקרא כמה פעמים.
    const host = pane(0, 0);
    const remembered = { top: 900, left: 0 };

    expect(repairPaneScroll(host, remembered)).toBe(true);
    expect(repairPaneScroll(host, remembered)).toBe(false);
  });

  it('בלי מיכל — לא עושה דבר', () => {
    expect(repairPaneScroll(null, { top: 10, left: 0 })).toBe(false);
  });
});

describe('samePaneScroll', () => {
  it('משווה את שני הצירים', () => {
    expect(samePaneScroll({ top: 1, left: 2 }, { top: 1, left: 2 })).toBe(true);
    expect(samePaneScroll({ top: 1, left: 2 }, { top: 1, left: 3 })).toBe(false);
  });
});

describe('guardPaneScroll', () => {
  it('האיפוס של המנוע בגלילה הראשונה מתוקן', () => {
    // הבאג עצמו: `scrollTop` נמדד נכון בכל נקודות הזמן אחרי מעבר טאב, ואז
    // גלגלת אחת → 0. הכתיבה היא של המנוע, מתוך הגלגלת, ואחרי כל השמה שלנו.
    const host = watchable(720);
    guardPaneScroll(host, { top: 720, left: 0 });

    host.scrollTop = 0;
    host.fire();

    expect(host.scrollTop, 'המיקום הוחזר').toBe(720);
  });

  it('מתפרק אחרי שהוא רץ פעם אחת', () => {
    // שומר שנשאר דרוך היה מחזיר את המשתמש למקום ההתחלה בכל פעם שהוא גולל
    // בעצמו עד ראש המסמך — כלומר הופך תיקון חד-פעמי לנעילה.
    const host = watchable(720);
    guardPaneScroll(host, { top: 720, left: 0 });

    host.scrollTop = 0;
    host.fire();
    expect(host.listeners, 'אין מאזין אחרי התיקון').toBe(0);

    host.scrollTop = 0;
    host.fire();
    expect(host.scrollTop, 'הפעם המשתמש הוא הבעלים').toBe(0);
  });

  it('גלילה של המשתמש מכבה אותו בלי לכתוב', () => {
    const host = watchable(720);
    guardPaneScroll(host, { top: 720, left: 0 });

    host.scrollTop = 1_100;
    host.fire();

    expect(host.scrollTop, 'המיקום שהמשתמש בחר נשאר').toBe(1_100);
    expect(host.listeners).toBe(0);
  });

  it('ההד של השחזור שלנו אינו מכבה אותו', () => {
    // השמה ל-`scrollTop` יורה `scroll` בעצמה. שומר שהיה מתפרק על ההד הזה
    // היה מתפרק לפני שהמנוע כתב בכלל — כלומר לא היה שומר על שום דבר.
    const host = watchable(720);
    guardPaneScroll(host, { top: 720, left: 0 });

    host.fire();
    expect(host.listeners, 'עדיין דרוך').toBe(1);

    host.scrollTop = 0;
    host.fire();
    expect(host.scrollTop).toBe(720);
  });

  it('הפירוק שהוחזר מסיר את המאזין, וקריאה חוזרת אינה זורקת', () => {
    const host = watchable(720);
    const stop = guardPaneScroll(host, { top: 720, left: 0 });

    stop();
    expect(host.listeners).toBe(0);
    expect(() => stop()).not.toThrow();

    host.scrollTop = 0;
    host.fire();
    expect(host.scrollTop, 'טאב שיצא — אין מי שיחזיר').toBe(0);
  });

  it('ראש המסמך אינו נשמר, ומיכל שאינו קיים אינו מפיל', () => {
    // „זכרנו אפס” פירושו שאין מה לשמור: האיפוס מחזיר בדיוק אותו.
    const host = watchable(0);
    guardPaneScroll(host, PANE_SCROLL_ORIGIN);
    expect(host.listeners).toBe(0);

    expect(() => guardPaneScroll(null, { top: 10, left: 0 })()).not.toThrow();
  });
});
