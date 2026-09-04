/**
 * „המשתמש הלך”.
 *
 * מה שנבדק כאן הוא שהשאלה הזאת נשאלת משלושה מקורות, ולא מאחד: כל אחד מהם
 * מכסה יציאה שהאחרים אינם רואים (ההנמקה המלאה ב-src/host/lifecycle.ts).
 * מקור שנשמט אינו תקלה שרואים — הוא עבודה של המשתמש שלא נכתבה, פעם בכמה
 * זמן, אצל מי שיצא בדרך שלא כיסינו.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { onPluginHidden, onPluginShown } from '../../src/host/lifecycle';

/** ה-SDK של אוצריא, בחלק שההאזנה נוגעת בו. */
function installSdk(): { fire: (event: string) => void; listeners: number } {
  const handlers = new Map<string, Set<(detail: unknown) => void>>();
  const sdk = {
    call: async () => ({ success: true, data: null, error: null }),
    on(event: string, callback: (detail: unknown) => void) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)?.add(callback);
    },
    off(event: string, callback: (detail: unknown) => void) {
      handlers.get(event)?.delete(callback);
    },
  };
  window.Otzaria = sdk as never;

  return {
    fire(event) {
      for (const handler of handlers.get(event) ?? []) handler(null);
    },
    get listeners() {
      let total = 0;
      for (const set of handlers.values()) total += set.size;
      return total;
    },
  };
}

/** `visibilityState` אינו ניתן לכתיבה; ההגדרה מחדש היא הדרך לזייף אותו. */
function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
}

afterEach(() => {
  delete (window as Partial<Window>).Otzaria;
  setVisibility('visible');
});

describe('onPluginHidden', () => {
  it('אוצריא שמשהה את התוסף מדווחת', () => {
    const sdk = installSdk();
    const flush = vi.fn();
    const stop = onPluginHidden(flush);

    sdk.fire('plugin.suspended');

    expect(flush).toHaveBeenCalledTimes(1);
    stop();
  });

  it('הסתרת החלון מדווחת גם בלי שאוצריא ניווטה לשום מקום', () => {
    // המשתמש עבר לתוכנה אחרת, או מיזער. `plugin.suspended` אינו נורה כאן.
    const flush = vi.fn();
    const stop = onPluginHidden(flush);

    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(flush).toHaveBeenCalledTimes(1);
    stop();
  });

  it('חזרה לתצוגה אינה מדווחת', () => {
    const flush = vi.fn();
    const stop = onPluginHidden(flush);

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(flush).not.toHaveBeenCalled();
    stop();
  });

  it('פירוק הדף הוא ההזדמנות האחרונה, והיא נתפסת', () => {
    const flush = vi.fn();
    const stop = onPluginHidden(flush);

    window.dispatchEvent(new Event('pagehide'));

    expect(flush).toHaveBeenCalledTimes(1);
    stop();
  });

  it('הביטול מסיר את שלושת המקורות', () => {
    const sdk = installSdk();
    const flush = vi.fn();

    onPluginHidden(flush)();

    sdk.fire('plugin.suspended');
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pagehide'));

    expect(flush).not.toHaveBeenCalled();
    expect(sdk.listeners, 'מאזין שנשאר על ה-SDK הוא דליפה').toBe(0);
  });

  it('בלי SDK — שני מקורות ה-DOM עדיין עובדים', () => {
    // כך המסלול נבדק גם בפיתוח בדפדפן, שבו אין גשר לאוצריא בכלל.
    const flush = vi.fn();
    const stop = onPluginHidden(flush);

    window.dispatchEvent(new Event('pagehide'));

    expect(flush).toHaveBeenCalledTimes(1);
    stop();
  });

  it('יציאה אחת עשויה לירות פעמיים — הקורא חייב להיות אידמפוטנטי', () => {
    // זה החוזה, והוא נבדק כאן כדי שלא ייעלם: ניווט באוצריא מייצר גם
    // `suspended` וגם `visibilitychange`. הקיזוז עצמו ב-session-keeper.ts.
    const sdk = installSdk();
    const flush = vi.fn();
    const stop = onPluginHidden(flush);

    sdk.fire('plugin.suspended');
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(flush).toHaveBeenCalledTimes(2);
    stop();
  });
});

/**
 * „המשתמש חזר”.
 *
 * ההיפוך המדויק של „הלך”, ומאותו טעם שלושה מקורות. מה שתלוי בזה הוא מיקום
 * הגלילה: הוא אינו שורד את המעבר לרקע בכל המסלולים, ומקור שנשמט פירושו
 * מסמך שקופץ לראש בגלגול הראשון (sessions/pane-scroll.ts).
 */
describe('onPluginShown', () => {
  it('שלושת המקורות מדווחים: plugin.resumed, visibilitychange ו-pageshow', () => {
    const sdk = installSdk();
    const shown = vi.fn();
    const stop = onPluginShown(shown);

    sdk.fire('plugin.resumed');
    expect(shown).toHaveBeenCalledTimes(1);

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(shown).toHaveBeenCalledTimes(2);

    window.dispatchEvent(new Event('pageshow'));
    expect(shown).toHaveBeenCalledTimes(3);

    stop();
  });

  it('מעבר להסתרה אינו נחשב חזרה', () => {
    // אותו אירוע בדיוק מגיע לשני המאזינים, וההבחנה היא ב-`visibilityState`.
    const shown = vi.fn();
    const stop = onPluginShown(shown);

    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(shown).not.toHaveBeenCalled();
    stop();
  });

  it('הביטול מסיר את כל ההרשמות, כולל זו של ה-SDK', () => {
    const sdk = installSdk();
    const shown = vi.fn();

    onPluginShown(shown)();

    sdk.fire('plugin.resumed');
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pageshow'));

    expect(shown).not.toHaveBeenCalled();
    expect(sdk.listeners, 'הרשמת ה-SDK לא נשארה תלויה באוויר').toBe(0);
  });

  it('בלי SDK — שני מקורות ה-DOM עדיין עובדים', () => {
    // פיתוח בדפדפן ובדיקות: אין גשר, ואין סיבה שהתיקון לא יפעל שם.
    const shown = vi.fn();
    const stop = onPluginShown(shown);

    window.dispatchEvent(new Event('pageshow'));

    expect(shown).toHaveBeenCalledTimes(1);
    stop();
  });
});
