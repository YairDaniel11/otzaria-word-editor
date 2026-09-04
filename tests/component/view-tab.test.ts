/**
 * לשונית „תצוגה” — כפתור כפתור.
 *
 * זהו השער שנדרש אחרי התלונה „רוחב עמוד” ו„100%” לא עובדות: כל פקד בלשונית
 * נלחץ ומה שיצא ממנו נמדד — האירוע, הפקודה, ה-payload, והנטרול בזמן שאין
 * מנוע. חוזה ה-payload עצמו (הוולידטורים של superdoc) נבדק ב-ribbon-payloads;
 * כאן השאלה היא מה **כל לחיצה** עושה.
 *
 * „רוחב עמוד” אינו שולח את `zoom-fit-width` של המנו אלא מחשב את האחוז בעצמו
 * (engine/fit-width.ts — לולאת המשוב שנמדדה במנוע), ולכן הבדיקה שלו היא
 * דו-שלבית: גיאומטריה ידועה בכפיל + מאגס ברוחב ידוע, ואז ה-payload שיצא.
 */
import { describe, expect, it } from 'vitest';
import ViewTab from '../../src/ui/ribbon/tabs/ViewTab.vue';
import { ZOOM_PERCENT_MAX } from '../../src/engine/zoom';
import {
  autoUnmount,
  buttonByTip,
  createSuperdocDouble,
  mountUi,
  settle,
  type SuperdocDoubleOptions,
} from './harness';

autoUnmount();

const FIT_TITLE = 'התאם את תצוגת העמוד לרוחב החלון';
const HUNDRED_TITLE = 'הצג את המסמך בגודלו האמיתי (100%)';
const RULER_TITLE = 'הצג או הסתר את סרגל המידות';
const MARKS_TITLE = 'הצג סימני פסקאות ותווים נסתרים';

/** A4 באינצ'ים — הצורה ש-`sections.list` מפרויקט (ראו engine/print.ts). */
const A4_WIDTH_IN = 8.268;

/** מעמידה מאגס `.editor-stack` ברוחב ידוע — jsdom אינו ממשיח layout. */
function installEditorStack(widthPx: number): () => void {
  const stack = document.createElement('main');
  stack.className = 'editor-stack';
  Object.defineProperty(stack, 'clientWidth', { value: widthPx });
  document.body.appendChild(stack);
  return () => stack.remove();
}

function mountWithPageWidth(widthIn?: number) {
  const options: SuperdocDoubleOptions = {
    ...(widthIn === undefined
      ? {}
      : { sections: { pageSize: { width: widthIn, height: 11.694 } } }),
  };
  return mountUi(ViewTab, { superdoc: createSuperdocDouble(options) });
}

describe('כפתורי לשונית „תצוגה”', () => {
  it('„100%” שולח את הפקודה עם 100 בדיוק', async () => {
    const harness = mountUi(ViewTab);
    await settle();

    await buttonByTip(harness.wrapper, HUNDRED_TITLE).trigger('click');
    await settle();

    expect(harness.adapter.payloads('zoom')).toEqual([100]);
    expect(harness.adapter.rejected).toEqual([]);
    expect(harness.failures()).toEqual([]);
  });

  it('„רוחב עמוד” מחשב את האחוז מרוחב המאגס ומידות הדף — ושולח אותו כ-payload', async () => {
    // 740px מול A4 (793.73px) → 93%. חלון צר: זו התאמה להקטנה.
    const removeStack = installEditorStack(740);
    try {
      const harness = mountWithPageWidth(A4_WIDTH_IN);
      await settle();

      await buttonByTip(harness.wrapper, FIT_TITLE).trigger('click');
      await settle();

      expect(harness.adapter.payloads('zoom')).toEqual([93]);
      expect(harness.adapter.rejected).toEqual([]);
      expect(harness.failures()).toEqual([]);
      expect(harness.adapter.calls.some((call) => call.id === 'zoom-fit-width')).toBe(false);
    } finally {
      removeStack();
    }
  });

  it('„רוחב עמוד” בחלון רחב מגדיל מעבר ל-100%', async () => {
    // לכפיל אין `getZoomState`, ואז נופלים לגבולות ברירת המחדל (10–500):
    // 1480px מול A4 → 186%, בתוך הטווח.
    const removeStack = installEditorStack(1480);
    try {
      const harness = mountWithPageWidth(A4_WIDTH_IN);
      await settle();

      await buttonByTip(harness.wrapper, FIT_TITLE).trigger('click');
      await settle();

      expect(harness.adapter.payloads('zoom')).toEqual([186]);
    } finally {
      removeStack();
    }
  });

  it('„רוחב עמוד” נצמד לתקרת ההיקף של Word (500%)', async () => {
    // 4200px מול A4 → 529% → התקרה. ה-max שהמנוע מדווח הוא גבול ה-fit-width
    // שלו ולא מגבלת זום ידני (setZoom אינו מצמצם), ולכן התקרה שלנו היא 500.
    const removeStack = installEditorStack(4200);
    try {
      const harness = mountWithPageWidth(A4_WIDTH_IN);
      await settle();

      await buttonByTip(harness.wrapper, FIT_TITLE).trigger('click');
      await settle();

      expect(harness.adapter.payloads('zoom')).toEqual([ZOOM_PERCENT_MAX]);
    } finally {
      removeStack();
    }
  });

  it('„רוחב עמוד” בלי מסמך פתוח מדווח ולא שולח פקודה', async () => {
    const harness = mountUi(ViewTab, { superdoc: null });
    await settle();

    await buttonByTip(harness.wrapper, FIT_TITLE).trigger('click');
    await settle();

    expect(harness.adapter.payloads('zoom')).toEqual([]);
    const failures = harness.failures();
    expect(failures).toHaveLength(1);
    if (!failures[0].outcome.ok) expect(failures[0].outcome.message).toContain('אין מסמך פתוח');
  });

  it('„רוחב עמוד” שמידות הדף שלו אינן קריאות מדווח, ולא מנחש אחוז', async () => {
    // ברירת המחדל של הכפיל היא twips גולמיים (11906) — יחידות שנשכחו בדרך,
    // והקורא מסנן אותן במקום לחשב מהן אחוזי הזוי.
    const removeStack = installEditorStack(740);
    try {
      const harness = mountWithPageWidth(undefined);
      await settle();

      await buttonByTip(harness.wrapper, FIT_TITLE).trigger('click');
      await settle();

      expect(harness.adapter.payloads('zoom')).toEqual([]);
      expect(harness.failures()).toHaveLength(1);
      const [failure] = harness.failures();
      if (!failure.outcome.ok) expect(failure.outcome.reason).toBe('geometry-unavailable');
    } finally {
      removeStack();
    }
  });

  it('„סרגל” מריץ את פקודת ה-ruler', async () => {
    const harness = mountUi(ViewTab);
    await settle();

    await buttonByTip(harness.wrapper, RULER_TITLE).trigger('click');
    await settle();

    expect(harness.adapter.applied.filter((c) => c.id === 'ruler')).toHaveLength(1);
  });

  it('„סימני עיצוב” מריץ את פקודת formatting-marks', async () => {
    const harness = mountUi(ViewTab);
    await settle();

    await buttonByTip(harness.wrapper, MARKS_TITLE).trigger('click');
    await settle();

    expect(harness.adapter.applied.filter((c) => c.id === 'formatting-marks')).toHaveLength(1);
  });

  it('„מצב מיקוד” פולט toggle-focus-mode ולא פונה למנוע', async () => {
    const harness = mountUi(ViewTab);
    await settle();

    await buttonByTip(harness.wrapper, 'מצב קריאה ומיקוד').trigger('click');
    await settle();

    expect(harness.wrapper.emitted('toggle-focus-mode')).toHaveLength(1);
    expect(harness.adapter.calls).toEqual([]);
  });

  it('כשהמנוע אינו זמין — כל כפתורי הפקודות מנוטרלים, ולחיצה לא מגיעה לאדפטר', async () => {
    const harness = mountUi(ViewTab);
    await settle();

    harness.adapter.setState('zoom', { enabled: false });
    harness.adapter.setState('ruler', { enabled: false });
    harness.adapter.setState('formatting-marks', { enabled: false });
    await settle();

    expect(buttonByTip(harness.wrapper, HUNDRED_TITLE).attributes('disabled')).toBeDefined();
    expect(buttonByTip(harness.wrapper, FIT_TITLE).attributes('disabled')).toBeDefined();
    expect(buttonByTip(harness.wrapper, RULER_TITLE).attributes('disabled')).toBeDefined();
    expect(buttonByTip(harness.wrapper, MARKS_TITLE).attributes('disabled')).toBeDefined();

    await buttonByTip(harness.wrapper, HUNDRED_TITLE).trigger('click');
    await settle();
    expect(harness.adapter.calls).toEqual([]);
  });
});