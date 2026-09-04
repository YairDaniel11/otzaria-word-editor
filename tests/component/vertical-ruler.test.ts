/**
 * הסרגל האנכי.
 *
 * שתי השאלות שרק רינדור עונה עליהן: האם הרצועה מיושרת ל**עמוד שנראה** (ולא
 * לראשון, שכבר נגלל מעל המסך), והאם גרירה שולחת למנוע את הצד האנכי בלבד —
 * שוליים אופקיים שנשלחים „ליתר ביטחון” הם בדיוק איך שמסמך מאבד את הפריסה
 * שהמשתמש קבע.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import VerticalRuler from '../../src/ui/shell/VerticalRuler.vue';
import type { RulerReading } from '../../src/engine/page-ruler';
import { autoUnmount, mountUi, settle, tipMessage } from './harness';

autoUnmount();

/** A4 ב-100%: 29.7 ס"מ = 1123px גובה, שוליים של 2.54 ס"מ = 96px. */
const PAGE_WIDTH_TWIPS = 11906;
const PAGE_HEIGHT_TWIPS = 16838;
const A_INCH = 1440;
const PAGE_HEIGHT_PX = 1123;

/** המלבנים של העמודים, לפי `data-page-index`. הבדיקה מזיזה אותם. */
let pageBoxes: Array<{ top: number; height: number }> = [{ top: 40, height: PAGE_HEIGHT_PX }];

const originalRect = HTMLElement.prototype.getBoundingClientRect;

beforeEach(() => {
  pageBoxes = [{ top: 40, height: PAGE_HEIGHT_PX }];
  HTMLElement.prototype.getBoundingClientRect = function rect(this: HTMLElement): DOMRect {
    const index = this.getAttribute('data-page-index');
    if (index !== null) {
      const page = pageBoxes[Number(index)] ?? pageBoxes[0];
      return box(0, 794, page.top, page.height);
    }
    // מיכל הסרגל: עמודה בגובה החלון.
    if (this.classList.contains('doc-vruler')) return box(0, 22, 0, 500);
    return box(0, 900, 0, 500);
  };
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  HTMLElement.prototype.getBoundingClientRect = originalRect;
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

function box(left: number, width: number, top: number, height: number): DOMRect {
  return {
    left,
    right: left + width,
    width,
    top,
    bottom: top + height,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function engineHost(pages = 1): HTMLElement {
  const host = document.createElement('div');
  for (let index = 0; index < pages; index += 1) {
    const page = document.createElement('div');
    page.setAttribute('data-page-index', String(index));
    host.appendChild(page);
  }
  document.body.appendChild(host);
  return host;
}

function reading(effective: { top?: number; bottom?: number } = {}): RulerReading {
  return {
    page: {
      pageWidthTwips: PAGE_WIDTH_TWIPS,
      pageHeightTwips: PAGE_HEIGHT_TWIPS,
      leftTwips: A_INCH,
      rightTwips: A_INCH,
      topTwips: A_INCH,
      bottomTwips: A_INCH,
      effectiveTopTwips: effective.top ?? A_INCH,
      effectiveBottomTwips: effective.bottom ?? A_INCH,
      direction: 'rtl',
    },
    indents: null,
    target: null,
  };
}

async function mountRuler(props: Record<string, unknown> = {}, pages = 1) {
  const harness = mountUi(VerticalRuler, {
    props: { visible: true, host: engineHost(pages), reading: reading(), ...props },
  });
  await settle();
  return harness;
}

function handleByLabel(
  wrapper: {
    findAll: (s: string) => Array<{ element: Element; attributes: (k: string) => string | undefined }>;
  },
  label: string,
) {
  return wrapper
    .findAll('.doc-vruler__handle')
    .find((handle) => handle.attributes('aria-label') === label);
}

function topOf(element: Element): number {
  return Number.parseFloat((element as HTMLElement).style.top);
}

function pointer(type: string, clientY: number, extra: Record<string, unknown> = {}): MouseEvent {
  const event = new MouseEvent(type, { clientY, bubbles: true });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  for (const [key, value] of Object.entries(extra)) {
    Object.defineProperty(event, key, { value });
  }
  return event;
}

/* ------------------------------------------------------------------ */

describe('ציור', () => {
  it('הרצועה מיושרת לעמוד המצויר', async () => {
    const harness = await mountRuler();

    const page = harness.wrapper.find('.doc-vruler__page').element as HTMLElement;
    expect(page.style.top).toBe('40px');
    expect(page.style.height).toBe('1123px');
  });

  it('אזור הטקסט הוא הדף פחות השוליים העליונים והתחתונים', async () => {
    const harness = await mountRuler();

    const area = harness.wrapper.find('.doc-vruler__text-area').element as HTMLElement;
    expect(Math.round(Number.parseFloat(area.style.top))).toBe(96);
    expect(Math.round(Number.parseFloat(area.style.height))).toBe(931);
  });

  it('שתי ידיות בלבד — לכניסות אין מקום בציר האנכי', async () => {
    const harness = await mountRuler();

    const handles = harness.wrapper.findAll('.doc-vruler__handle');
    expect(handles).toHaveLength(2);
    expect(Math.round(topOf(handleByLabel(harness.wrapper, 'שוליים עליונים')!.element))).toBe(96);
    expect(Math.round(topOf(handleByLabel(harness.wrapper, 'שוליים תחתונים')!.element))).toBe(1027);
  });

  it('הידיות מדווחות ערך בסנטימטרים, וכיוון אנכי', async () => {
    const harness = await mountRuler();

    const top = handleByLabel(harness.wrapper, 'שוליים עליונים')!;
    expect(top.attributes('role')).toBe('slider');
    expect(top.attributes('aria-orientation')).toBe('vertical');
    expect(top.attributes('aria-valuenow')).toBe('2.54');
  });

  it('העמוד שנמדד הוא זה שנראה, ולא הראשון', async () => {
    // העמוד הראשון נגלל למעלה (רק 20px ממנו נראים), והשני מולנו.
    pageBoxes = [
      { top: -1103, height: PAGE_HEIGHT_PX },
      { top: 30, height: PAGE_HEIGHT_PX },
    ];
    const harness = await mountRuler({}, 2);

    const page = harness.wrapper.find('.doc-vruler__page').element as HTMLElement;
    expect(page.style.top).toBe('30px');
  });
});

describe('גרירה', () => {
  it('שולחת רק את הצד האנכי, ובאינצ\'ים', async () => {
    const harness = await mountRuler();
    const handle = handleByLabel(harness.wrapper, 'שוליים עליונים')!;

    handle.element.dispatchEvent(pointer('pointerdown', 0, { button: 0 }));
    await settle();
    // 40 (ראש העמוד) + 192px = 5.08 ס"מ, שנמצא בדיוק על רשת ההצמדה.
    window.dispatchEvent(pointer('pointermove', 232));
    await settle();
    window.dispatchEvent(pointer('pointerup', 232));
    await settle();

    const calls = harness.superdoc.inputs('sections.setPageMargins');
    expect(calls).toHaveLength(1);
    // 192px מראש העמוד = 5.08 ס"מ, שמוצמדים ל-5 ס"מ = 2835 twips = 1.96875
    // אינץ'. מה שנשלח הוא **רק** `top`: `left`/`right`/`bottom` לא נגררו.
    expect(Object.keys(calls[0] as object).sort()).toEqual(['target', 'top']);
    expect((calls[0] as { top: number }).top).toBeCloseTo(2835 / 1440, 6);
  });

  it('גרירה מעבר לקצה נעצרת, ולא מייצרת שוליים שליליים', async () => {
    const harness = await mountRuler();
    const handle = handleByLabel(harness.wrapper, 'שוליים עליונים')!;

    handle.element.dispatchEvent(pointer('pointerdown', 0, { button: 0 }));
    await settle();
    window.dispatchEvent(pointer('pointermove', -500));
    await settle();
    window.dispatchEvent(pointer('pointerup', -500));
    await settle();

    expect(harness.superdoc.inputs('sections.setPageMargins')[0]).toMatchObject({ top: 0 });
  });

  it('מסמך לקריאה בלבד אינו נגרר', async () => {
    const harness = await mountRuler({ editable: false });
    const handle = handleByLabel(harness.wrapper, 'שוליים עליונים')!;

    handle.element.dispatchEvent(pointer('pointerdown', 0, { button: 0 }));
    await settle();
    window.dispatchEvent(pointer('pointerup', 300));
    await settle();

    expect(harness.superdoc.inputs('sections.setPageMargins')).toHaveLength(0);
  });
});

describe('מקלדת', () => {
  it('חץ למטה מגדיל את השוליים העליונים ברבע סנטימטר', async () => {
    const harness = await mountRuler();
    const handle = handleByLabel(harness.wrapper, 'שוליים עליונים')!;

    handle.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await settle();

    const input = harness.superdoc.inputs('sections.setPageMargins')[0] as { top: number };
    expect(input.top).toBeCloseTo(2.79 / 2.54, 3);
  });

  it('חץ למעלה על השוליים התחתונים מגדיל אותם', async () => {
    const harness = await mountRuler();
    const handle = handleByLabel(harness.wrapper, 'שוליים תחתונים')!;

    handle.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    await settle();

    const input = harness.superdoc.inputs('sections.setPageMargins')[0] as { bottom: number };
    expect(input.bottom).toBeCloseTo(2.79 / 2.54, 3);
  });
});

/**
 * הרצפה של הכותרת.
 *
 * נמדד על ה-`dist` הארוז: כותרת עליונה ריקה במרחק חצי אינץ' מרימה את ראש
 * הטקסט ל-66.4px, וכל ערך שוליים קטן מזה **אינו מזיז את הטקסט**. סרגל
 * שממשיך לגרור שם מבטיח מידה שאין לה כיסוי — וזה מה שמשתמש רואה כ„הסרגל לא
 * מעלה את הטקסט מעל קו מסוים”.
 */
describe('רצפת הכותרת', () => {
  /** 66.4px = 996 twips. */
  const FLOOR_TWIPS = 996;

  it('הרצועה מציירת את מה שנמדד, ולא את מה שכתוב במסמך', async () => {
    const harness = await mountRuler({
      reading: { ...reading({ top: FLOOR_TWIPS }), page: { ...reading({ top: FLOOR_TWIPS }).page, topTwips: 720 } },
    });

    const area = harness.wrapper.find('.doc-vruler__text-area').element as HTMLElement;
    // 996 twips = 66.4px, ולא 48px שהם השוליים שכתובים במסמך.
    expect(Math.round(Number.parseFloat(area.style.top))).toBe(66);
  });

  /**
   * הרצפה נמדדת על **התזוזה** ולא על הכתיבה, ובכוונה.
   *
   * כשהרצפה פעילה הידית יושבת עליה בדיוק — `floorTopTwips` הוא
   * `effectiveTopTwips`, וזה גם הערך שהידית מציגה — ולכן גרירה כלפי מעלה
   * אינה יכולה לשנות אותו. כלומר הכתיבה היחידה שגרירה כזאת יכולה לייצר היא
   * כתיבה של הערך הקיים בחזרה, וזו בדיוק הכתיבה שאין לעשות. מה שכן נראה
   * למשתמש, ומה שנמדד כאן: הידית עומדת במקום בזמן שהסמן ממשיך מעליה.
   */
  it('הידית נעצרת על הרצפה, ואינה יורדת מתחתיה', async () => {
    const base = reading({ top: FLOOR_TWIPS });
    const harness = await mountRuler({
      reading: { ...base, page: { ...base.page, topTwips: 720 } },
    });
    const handle = handleByLabel(harness.wrapper, 'שוליים עליונים')!;
    const before = topOf(handle.element);

    handle.element.dispatchEvent(pointer('pointerdown', 106, { button: 0 }));
    await settle();
    window.dispatchEvent(pointer('pointermove', -500)); // הרבה מעל ראש העמוד
    await settle();

    expect(topOf(handle.element), 'הידית לא זזה מהרצפה').toBeCloseTo(before, 3);

    window.dispatchEvent(pointer('pointerup', -500));
    await settle();

    // ומכיוון שהיא לא זזה, אין מה לכתוב — כתיבת הערך הקיים בחזרה הייתה
    // דורסת את `w:top` שבמסמך (720) בערך שהמנוע צייר (996).
    expect(harness.superdoc.inputs('sections.setPageMargins')).toEqual([]);
  });

  it('קליק על הידית בלי לגרור אינו דורס את מה שכתוב במסמך', async () => {
    // הידית מציגה 996 (מה שהמנוע צייר) בזמן שבמסמך כתוב 720. השחרור היה
    // כותב את המוצג, והסרגל נראה זהה אחרי זה — כלומר המידה של המשתמש
    // הוחלפה בלי שהוא רואה.
    const base = reading({ top: FLOOR_TWIPS });
    const harness = await mountRuler({
      reading: { ...base, page: { ...base.page, topTwips: 720 } },
    });
    const handle = handleByLabel(harness.wrapper, 'שוליים עליונים')!;

    handle.element.dispatchEvent(pointer('pointerdown', 106, { button: 0 }));
    await settle();
    window.dispatchEvent(pointer('pointerup', 106));
    await settle();

    expect(harness.superdoc.inputs('sections.setPageMargins')).toEqual([]);
  });

  it('Home על ידית שכבר על הרצפה אינו דורס את המסמך', async () => {
    // אותה דריסה של הקליק, במסלול המקלדת: `Home` מבקש 0, החסם מחזיר את
    // הרצפה — שהיא כבר הערך המוצג — והכתיבה הייתה מחליפה את 720 שבמסמך.
    const base = reading({ top: FLOOR_TWIPS });
    const harness = await mountRuler({
      reading: { ...base, page: { ...base.page, topTwips: 720 } },
    });
    const handle = handleByLabel(harness.wrapper, 'שוליים עליונים')!;

    handle.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    await settle();

    expect(harness.superdoc.inputs('sections.setPageMargins')).toEqual([]);
  });

  it('הידית מספרת למה היא נעצרת', async () => {
    const base = reading({ top: FLOOR_TWIPS });
    const harness = await mountRuler({
      reading: { ...base, page: { ...base.page, topTwips: 720 } },
    });

    const handle = handleByLabel(harness.wrapper, 'שוליים עליונים')!;
    expect(tipMessage(handle)).toContain('הכותרת העליונה אינה מאפשרת פחות');
    expect(handle.attributes('aria-valuemin')).toBe('1.76');
  });

  it('בלי רצפה פעילה הידית מגיעה עד 0, וההסבר אינו מופיע', async () => {
    const harness = await mountRuler();
    const handle = handleByLabel(harness.wrapper, 'שוליים עליונים')!;

    expect(handle.attributes('aria-valuemin')).toBe('0');
    expect(tipMessage(handle)).not.toContain('אינה מאפשרת');

    handle.element.dispatchEvent(pointer('pointerdown', 0, { button: 0 }));
    await settle();
    window.dispatchEvent(pointer('pointermove', -500));
    await settle();
    window.dispatchEvent(pointer('pointerup', -500));
    await settle();

    expect(harness.superdoc.inputs('sections.setPageMargins')[0]).toMatchObject({ top: 0 });
  });
});
