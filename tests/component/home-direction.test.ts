/**
 * חיווי „פעיל” של כפתורי „כיוון פסקה מימין לשמאל”/„משמאל לימין” ב-HomeTab.vue.
 *
 * docs/button-audit.md, שורה ה' (‏„קשה לתקן”): „הכתיבה מצליחה; הפקודה אינה
 * מדווחת active”. **נמדד מחדש מול superdoc@2.10.0** (Chrome headless, ה-dist
 * הארוז, scripts/qa/home-paragraph-qa.mjs) לפני שנגעו כאן — הבאג עדיין קיים:
 * `<w:bidi/>` נכתב נכון, אבל `ui.commands.get('direction-rtl').getState()`
 * חוזר `active:false` תמיד. `createCommandDouble` שבכפילי הבדיקה משקף בדיוק
 * את זה — ברירת המחדל שלו היא `active:false` לכל פקודה, ואין לה שום דרך
 * לדעת על `bidi`.
 *
 * המעקף (HomeTab.vue) קורא `bidi` ישירות מ-`doc.get()` דרך
 * `readParagraphIndents` (engine/paragraph-format.ts, נבדקת בנפרד ביחידה
 * ב-tests/unit/paragraph-format.test.ts) — ולכן הבדיקות כאן מגדירות את
 * `paragraphProps` של כפיל המסמך, לא את מצב הפקודה של כפיל האדפטר.
 *
 * מה שאין כאן: מעבר בין פסקאות דרך `ui.selection.observe` בזמן אמת — כפיל
 * ה-`ui.selection` בהרכבה חושף רק `getSnapshot`/`apply`, בלי `observe` (כמו
 * במנוע האמיתי בבדיקות האלה, שאין להן חיבור ל-DOM/מנוע אמיתי). זה בדיוק
 * הפער שבין בדיקת קומפוננטה לשער QA בדפדפן אמיתי: „מעבר בין פסקאות מעדכן
 * חי” נמדד ב-scripts/qa/home-paragraph-qa.mjs מול דפדפן אמיתי, לא כאן.
 */
import { describe, expect, it, vi } from 'vitest';
import HomeTab from '../../src/ui/ribbon/tabs/HomeTab.vue';
import { autoUnmount, buttonByTip, createSuperdocDouble, mountUi, settle } from './harness';

autoUnmount();

const RTL_TIP = 'כיוון פסקה מימין לשמאל';
const LTR_TIP = 'כיוון פסקה משמאל לימין';

describe('כיוון פסקה — חיווי „פעיל” נקרא מה-pPr, לא מהפקודה', () => {
  it('לחיצה על „מימין לשמאל” מדליקה את החיווי מיד, בלי לחכות לתזוזת סמן', async () => {
    // הכפיל מייצג את מה ש-doc.get() מחזיר **אחרי** כתיבה מוצלחת של <w:bidi/>
    // — בדיוק כמו שנמדד במנוע האמיתי (ראו ההערה בראש הקובץ, ובראש
    // paragraphBidi ב-HomeTab.vue).
    const superdoc = createSuperdocDouble({ paragraphProps: { bidi: true } });
    const harness = mountUi(HomeTab, { superdoc });
    await settle();

    // לפני הלחיצה: אין עדיין קריאה שהתיישבה (ה-debounce עוד לא רץ), ולכן
    // נופלים לברירת המחדל של כפיל הפקודה — כמו לפני התיקון.
    expect(buttonByTip(harness.wrapper, RTL_TIP).attributes('aria-pressed')).toBe('false');

    await buttonByTip(harness.wrapper, RTL_TIP).trigger('click');
    await settle();

    expect(buttonByTip(harness.wrapper, RTL_TIP).attributes('aria-pressed')).toBe('true');
    expect(buttonByTip(harness.wrapper, LTR_TIP).attributes('aria-pressed')).toBe('false');
    expect(harness.failures()).toEqual([]);
  });

  it('לחיצה על „משמאל לימין” מדליקה אותו ומכבה את „מימין לשמאל”', async () => {
    const superdoc = createSuperdocDouble({ paragraphProps: { bidi: false } });
    const harness = mountUi(HomeTab, { superdoc });
    await settle();

    await buttonByTip(harness.wrapper, LTR_TIP).trigger('click');
    await settle();

    expect(buttonByTip(harness.wrapper, LTR_TIP).attributes('aria-pressed')).toBe('true');
    expect(buttonByTip(harness.wrapper, RTL_TIP).attributes('aria-pressed')).toBe('false');
    expect(harness.failures()).toEqual([]);
  });

  it('מסמך שנפתח עם bidi כבר קיים מציג „פעיל” אחרי שהשהיית תזוזת הסמן חולפת — בלי לחיצה כלל', async () => {
    // זה בדיוק המקרה שהחיווי הישן (מ-`dirRtlCmd.active`) אף פעם לא היה
    // מראה: פסקה שהגיעה RTL מ-Word, בלי שהמשתמש לחץ על שום דבר.
    vi.useFakeTimers();
    try {
      const superdoc = createSuperdocDouble({ paragraphProps: { bidi: true } });
      const harness = mountUi(HomeTab, { superdoc });
      await settle();
      await vi.advanceTimersByTimeAsync(500);
      await settle();

      expect(buttonByTip(harness.wrapper, RTL_TIP).attributes('aria-pressed')).toBe('true');
      expect(buttonByTip(harness.wrapper, LTR_TIP).attributes('aria-pressed')).toBe('false');
    } finally {
      vi.useRealTimers();
    }
  });

  it('מעבר למסמך אחר עם bidi שונה מתעדכן אחרי אותה השהיה', async () => {
    vi.useFakeTimers();
    try {
      const rtlDoc = createSuperdocDouble({ paragraphProps: { bidi: true } });
      const harness = mountUi(HomeTab, { superdoc: rtlDoc });
      await settle();
      await vi.advanceTimersByTimeAsync(500);
      await settle();
      expect(buttonByTip(harness.wrapper, RTL_TIP).attributes('aria-pressed')).toBe('true');

      const ltrDoc = createSuperdocDouble({ paragraphProps: { bidi: false } });
      await harness.setSuperdoc(ltrDoc);
      await vi.advanceTimersByTimeAsync(500);
      await settle();

      expect(buttonByTip(harness.wrapper, RTL_TIP).attributes('aria-pressed')).toBe('false');
      expect(buttonByTip(harness.wrapper, LTR_TIP).attributes('aria-pressed')).toBe('true');
    } finally {
      vi.useRealTimers();
    }
  });

  it('אין סמן במסמך: readParagraphIndents מחזירה null, והחיווי נופל לברירת המחדל בלי לזרוק', async () => {
    vi.useFakeTimers();
    try {
      const superdoc = createSuperdocDouble({ selection: { blockId: null } });
      const harness = mountUi(HomeTab, { superdoc });
      await settle();
      await vi.advanceTimersByTimeAsync(500);
      await settle();

      expect(buttonByTip(harness.wrapper, RTL_TIP).attributes('aria-pressed')).toBe('false');
      expect(buttonByTip(harness.wrapper, LTR_TIP).attributes('aria-pressed')).toBe('false');
    } finally {
      vi.useRealTimers();
    }
  });
});
