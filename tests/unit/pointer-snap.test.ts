/**
 * הצמדת לחיצה לשורה הקרובה — engine/pointer-snap.ts.
 *
 * שתי שכבות: הגיאומטריה הטהורה (קיבוץ קופסאות לשורות, ובחירת הנקודה — כללי
 * Word), וההחלה על האירועים ב-jsdom מול מודד-כפיל — שהקואורדינטות מוחלפות
 * על האירוע עצמו, שלחיצה ושחרור מקבלים אותה נקודה, שגרירה מוצמדת לעמוד,
 * ושאחרי `dispose` שום דבר לא זז.
 *
 * הגיאומטריה בבדיקות היא מה שנמדד ב-Chrome: שורה עברית של 158px שמתחילה
 * ב-x=540 (סופה משמאל), ושורה ריקה שהגליף היחיד שלה הוא `&nbsp;` ברוחב 4px.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  groupBoxesIntoLines,
  installPointerSnap,
  snapToLines,
  SNAP_INSET_PX,
  type Box,
  type PointerSnapHandle,
  type SnapLine,
  type SnapMeasure,
} from '../../src/engine/pointer-snap';

const box = (left: number, top: number, right: number, bottom: number): Box => ({ left, top, right, bottom });

/** שורה 1: עברית ארוכה 540..698; שורה 2: `&nbsp;` בקצה הימני; שורה 3: מילה קצרה. */
const LINE_1 = box(540, 314, 698, 331);
const LINE_2 = box(693, 332, 698, 349);
const LINE_3 = box(673, 351, 698, 368);
const LINES: readonly SnapLine[] = groupBoxesIntoLines([LINE_1, LINE_2, LINE_3]);

describe('groupBoxesIntoLines', () => {
  it('קופסאות על אותה שורה מתאחדות, ושורות שונות נשארות נפרדות', () => {
    const lines = groupBoxesIntoLines([box(0, 0, 50, 20), box(60, 2, 100, 18), box(0, 24, 40, 44)]);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ top: 0, bottom: 20 });
    expect(lines[0]!.boxes).toHaveLength(2);
    expect(lines[1]).toMatchObject({ top: 24, bottom: 44 });
  });

  it('שורות צפופות שחופפות בקצוות אינן משורשרות לשורה אחת', () => {
    // ריווח „בדיוק” קטן מהגופן: כל שורה גולשת 3px לתוך הבאה.
    const lines = groupBoxesIntoLines([box(0, 0, 50, 17), box(0, 14, 50, 31), box(0, 28, 50, 45)]);
    expect(lines).toHaveLength(3);
  });

  it('גליף קטן בתוך שורה גדולה שייך לה', () => {
    const lines = groupBoxesIntoLines([box(0, 0, 50, 20), box(50, 2, 58, 10)]);
    expect(lines).toHaveLength(1);
  });

  it('קופסאות ריקות מדולגות, והשורות ממוינות מלמעלה למטה', () => {
    const lines = groupBoxesIntoLines([box(0, 40, 50, 60), box(10, 10, 10, 30), box(0, 0, 50, 20)]);
    expect(lines.map((line) => line.top)).toEqual([0, 40]);
  });
});

describe('snapToLines', () => {
  it('נקודה על גליף — אין מה לשנות', () => {
    expect(snapToLines(600, 320, LINES)).toBeNull();
  });

  it('משמאל לסוף שורה עברית — נצמד לקצה השמאלי, מעט פנימה', () => {
    expect(snapToLines(150, 320, LINES)).toEqual({ x: 540 + SNAP_INSET_PX, y: 320 });
  });

  it('בשוליים הימניים, לפני תחילת השורה — נצמד לקצה הימני', () => {
    expect(snapToLines(760, 320, LINES)).toEqual({ x: 698 - SNAP_INSET_PX, y: 320 });
  });

  it('מתחת לשורה האחרונה — השורה האחרונה, במרכזה האנכי', () => {
    expect(snapToLines(300, 700, LINES)).toEqual({ x: 673 + SNAP_INSET_PX, y: (351 + 368) / 2 });
    // מתחת לטקסט אבל מעל גליף אופקית: רק y זז.
    expect(snapToLines(690, 700, LINES)).toEqual({ x: 690, y: (351 + 368) / 2 });
  });

  it('מעל השורה הראשונה — השורה הראשונה', () => {
    expect(snapToLines(600, 100, LINES)).toEqual({ x: 600, y: (314 + 331) / 2 });
  });

  it('ברווח שבין שורות — השורה שמתחת, כמו Word עם „רווח לפני”', () => {
    expect(snapToLines(300, 331.5, LINES)).toEqual({ x: 693 + SNAP_INSET_PX, y: (332 + 349) / 2 });
  });

  it('שורה ריקה: הגליף היחיד צר מכפליים ההיסט — מרכזו', () => {
    const narrow: SnapLine[] = groupBoxesIntoLines([box(697, 0, 697.5, 17)]);
    expect(snapToLines(300, 5, narrow)).toEqual({ x: 697.25, y: 5 });
  });

  it('כמה קופסאות על השורה — הקרובה אופקית', () => {
    const tabs = groupBoxesIntoLines([box(100, 0, 150, 20), box(300, 0, 350, 20)]);
    expect(snapToLines(200, 10, tabs)).toEqual({ x: 150 - SNAP_INSET_PX, y: 10 });
    expect(snapToLines(260, 10, tabs)).toEqual({ x: 300 + SNAP_INSET_PX, y: 10 });
  });

  it('בלי שורות — אין הצמדה', () => {
    expect(snapToLines(10, 10, [])).toBeNull();
    expect(snapToLines(10, 10, [{ top: 0, bottom: 10, boxes: [] }])).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* ההחלה על האירועים                                                    */
/* ------------------------------------------------------------------ */

describe('installPointerSnap', () => {
  let handle: PointerSnapHandle | null = null;
  let container: HTMLElement;
  let line: HTMLElement;
  /** מה המודד-הכפיל נשאל: המטרה, והנקודה. */
  let asked: Array<{ target: EventTarget | null; x: number; y: number }>;

  /** עמוד שפינתו ב-(100, 200), עם השורות שנמדדו — ביחס לפינה. */
  const PAGE = box(100, 200, 900, 1300);
  const measure = (target: EventTarget | null, x: number, y: number): SnapMeasure | null => {
    asked.push({ target, x, y });
    if (x < PAGE.left || x > PAGE.right || y < PAGE.top || y > PAGE.bottom) return null;
    return { lines: LINES, pageBox: () => PAGE };
  };

  function setup(): void {
    asked = [];
    container = document.createElement('div');
    line = document.createElement('div');
    container.appendChild(line);
    document.body.appendChild(container);
    handle = installPointerSnap(container, { measure });
  }

  afterEach(() => {
    handle?.dispose();
    handle = null;
    document.body.innerHTML = '';
  });

  /** מה המנוע היה רואה: מאזין על ה-container, אחרי שלנו. */
  function seen(type: string, target: Element, init: MouseEventInit): { x: number; y: number; pageX: number } {
    let result = { x: Number.NaN, y: Number.NaN, pageX: Number.NaN };
    const listener = (event: Event): void => {
      const mouse = event as MouseEvent;
      result = { x: mouse.clientX, y: mouse.clientY, pageX: mouse.pageX };
    };
    container.addEventListener(type, listener);
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, ...init }));
    container.removeEventListener(type, listener);
    return result;
  }

  /** לחיצה ב-client (x, y) בתוך עמוד שפינתו (100, 200): הגיאומטריה בקואורדינטות עמוד. */
  const client = (pageX: number, pageY: number): { clientX: number; clientY: number } => ({
    clientX: pageX + PAGE.left,
    clientY: pageY + PAGE.top,
  });

  it('לחיצה משמאל לסוף השורה מגיעה למנוע על קצה השורה — בכל ארבעת האירועים וב-click', () => {
    setup();
    const at = client(150, 320);
    const expected = { x: 540 + SNAP_INSET_PX + PAGE.left, y: 320 + PAGE.top };

    expect(seen('pointerdown', line, at)).toMatchObject(expected);
    expect(seen('mousedown', line, at)).toMatchObject(expected);
    expect(seen('pointerup', line, at)).toMatchObject(expected);
    expect(seen('mouseup', line, at)).toMatchObject(expected);
    expect(seen('click', line, at)).toMatchObject(expected);
    // `pointerdown` מדד; `mousedown` התאום לא מדד שוב.
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ target: line, x: at.clientX, y: at.clientY });
  });

  it('pageX/pageY זזים יחד עם clientX/clientY', () => {
    setup();
    const at = client(150, 320);
    const result = seen('pointerdown', line, { ...at, screenX: 0 });
    expect(result.pageX).toBe(result.x + (window.scrollX || 0));
  });

  it('האירועים המאוחדים של אירוע שהוצמד — רשימה ריקה, לא הקואורדינטות המקוריות', () => {
    setup();
    const at = client(150, 320);
    const event = new MouseEvent('pointerdown', { bubbles: true, button: 0, ...at });
    const original = { clientX: at.clientX };
    Object.defineProperty(event, 'getCoalescedEvents', { value: () => [original], configurable: true });
    line.dispatchEvent(event);
    expect(event.clientX).toBe(540 + SNAP_INSET_PX + PAGE.left);
    expect((event as unknown as { getCoalescedEvents(): unknown[] }).getCoalescedEvents()).toEqual([]);
  });

  it('לחיצה על גליף אינה משתנה', () => {
    setup();
    const at = client(600, 320);
    expect(seen('pointerdown', line, at)).toMatchObject({ x: at.clientX, y: at.clientY });
  });

  it('לחיצה מחוץ ל-container אינה מוצמדת', () => {
    setup();
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    const at = client(150, 320);
    expect(seen('pointerdown', outside, at)).toMatchObject({ x: Number.NaN });
    expect(asked).toHaveLength(0);
    // ואין „לחיצה פתוחה” שהשחרור יירש.
    const listener = (event: Event): void => {
      expect((event as MouseEvent).clientX).toBe(at.clientX);
    };
    window.addEventListener('pointerup', listener);
    outside.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0, ...at }));
    window.removeEventListener('pointerup', listener);
  });

  it('כפתור שאינו הראשי — לא נוגעים', () => {
    setup();
    const at = client(150, 320);
    expect(seen('pointerdown', line, { ...at, button: 2 })).toMatchObject({ x: at.clientX });
    expect(asked).toHaveLength(0);
  });

  it('גרירה: התנועה והשחרור מתחת לטקסט נצמדים לשורה האחרונה של העמוד, בלי מטרה', () => {
    setup();
    seen('pointerdown', line, client(600, 320));
    const below = client(300, 700);
    const expected = { x: 673 + SNAP_INSET_PX + PAGE.left, y: (351 + 368) / 2 + PAGE.top };
    expect(seen('pointermove', line, { ...below, buttons: 1 })).toMatchObject(expected);
    expect(seen('pointerup', line, below)).toMatchObject(expected);
    expect(seen('mouseup', line, below)).toMatchObject(expected);
    expect(seen('click', line, below)).toMatchObject(expected);
    // מדידת הגרירה היא ברמת העמוד — `target: null` — ופעם אחת בלבד.
    expect(asked.filter((ask) => ask.target === null)).toHaveLength(1);
  });

  it('תנועה בלי כפתור לחוץ — לא נוגעים', () => {
    setup();
    seen('pointerdown', line, client(600, 320));
    seen('mouseup', line, client(600, 320));
    const below = client(300, 700);
    expect(seen('pointermove', line, { ...below, buttons: 0 })).toMatchObject({ x: below.clientX });
  });

  it('גרירה אל מחוץ לכל עמוד — הקואורדינטות נשארות', () => {
    setup();
    seen('pointerdown', line, client(600, 320));
    const far = { clientX: 2000, clientY: 2000 };
    expect(seen('pointermove', line, { ...far, buttons: 1 })).toMatchObject({ x: 2000, y: 2000 });
  });

  it('אחרי mouseup, לחיצה חדשה באותה נקודה נמדדת מחדש', () => {
    setup();
    const at = client(150, 320);
    seen('pointerdown', line, at);
    seen('mousedown', line, at);
    seen('pointerup', line, at);
    seen('mouseup', line, at);
    seen('click', line, at);
    seen('pointerdown', line, at);
    expect(asked).toHaveLength(2);
  });

  it('שני מופעים על אותו אירוע — ההצמדה השנייה מכבדת את הראשונה', () => {
    setup();
    const second = installPointerSnap(container, {
      measure: () => ({ lines: groupBoxesIntoLines([box(0, 0, 10, 10)]), pageBox: () => PAGE }),
    });
    try {
      const at = client(150, 320);
      expect(seen('pointerdown', line, at)).toMatchObject({ x: 540 + SNAP_INSET_PX + PAGE.left });
    } finally {
      second.dispose();
    }
  });

  it('אחרי dispose שום דבר לא זז', () => {
    setup();
    handle?.dispose();
    handle = null;
    const at = client(150, 320);
    expect(seen('pointerdown', line, at)).toMatchObject({ x: at.clientX, y: at.clientY });
    expect(asked).toHaveLength(0);
  });
});
