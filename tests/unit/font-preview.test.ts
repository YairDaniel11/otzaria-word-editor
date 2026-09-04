/**
 * התצוגה החיה של בורר הגופן — שתי השכבות שלה.
 *
 * מה שנבדק כאן הוא בדיוק מה שאי אפשר לראות בעין: התצוגה נוגעת **במסמך של
 * המשתמש**, וכל תקלה בה היא גופן שנשאר בטקסט שאיש לא ביקש לשנות. שלושת
 * התרחישים שהכריעו את התכנון נבדקים במפורש — יציאה בלי לבחור, הרשימה שנסגרת
 * בזמן שהתפיסה באוויר, ובחירה מעורבת שאין לאן להחזיר ממנה.
 *
 * שעונים מזויפים: ההשהיה היא חלק מהחוזה („מעבר על הרשימה אינו צובע”), ולא
 * פרט מימוש.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFontPreview, FONT_PREVIEW_DELAY_MS, type FontPreviewDeps } from '../../src/composables/font-preview';
import {
  captureRange,
  paintFamily,
  readSelectionText,
  FONT_PREVIEW_ENABLED,
} from '../../src/engine/font-preview';

/** טווח מזויף. זהות בלבד — אף אחד מהצדדים אינו מסתכל בתוכו. */
const RANGE = { range: 'selection-target' };

interface Harness {
  preview: ReturnType<typeof createFontPreview>;
  painted: string[];
  captures: number;
  /** מה שהמנוע „מדווח”: משתנה עם כל צביעה, כמו במציאות. */
  document: { family: string | null };
  allowed: { value: boolean };
  capture: { value: unknown };
}

function harness(overrides: Partial<FontPreviewDeps> = {}): Harness {
  const painted: string[] = [];
  const state = {
    document: { family: 'David' as string | null },
    allowed: { value: true },
    capture: { value: RANGE as unknown },
    captures: 0,
  };

  const preview = createFontPreview({
    // מפורש, ובעל כוונה: ברירת המחדל של המכונה היא `FONT_PREVIEW_ENABLED`,
    // כלומר כבוי (ראו „המפסק” בסוף הקובץ). כל מה שנבדק מכאן ועד שם הוא
    // המכונה **הדולקת** — היא נשארת שלמה ובדוקה, מפני שמה שחסר כדי להדליק
    // אותה בפועל הוא API במנוע ולא קוד כאן.
    enabled: () => true,
    allowed: () => state.allowed.value,
    origin: () => state.document.family,
    capture: async () => {
      state.captures += 1;
      return state.capture.value;
    },
    paint: async (target, family) => {
      if (target !== RANGE) return false;
      painted.push(family);
      // הצביעה משנה את מה שהמנוע מדווח — וזו בדיוק הסיבה ש-`origin` נתפס פעם
      // אחת ולא נקרא שוב.
      state.document.family = family;
      return true;
    },
    ...overrides,
  });

  return {
    preview,
    painted,
    get captures() {
      return state.captures;
    },
    document: state.document,
    allowed: state.allowed,
    capture: state.capture,
  };
}

/** מקדם את השעון ומריק את תור ההבטחות. */
async function settle(h: Harness, ms = FONT_PREVIEW_DELAY_MS): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  await h.preview.idle();
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('התצוגה החיה — מתי היא צובעת', () => {
  it('סימון שנח נצבע אחרי ההשהיה, ולא לפניה', async () => {
    const h = harness();
    h.preview.hover('Narkisim');

    await vi.advanceTimersByTimeAsync(FONT_PREVIEW_DELAY_MS - 1);
    expect(h.painted).toEqual([]);

    await settle(h, 1);
    expect(h.painted).toEqual(['Narkisim']);
    expect(h.preview.shown()).toBe('Narkisim');
  });

  it('מעבר מהיר על הרשימה אינו צובע דבר', async () => {
    // מוטציה לכל שורה שהעכבר חלף עליה היא גם מסמך שנתקע וגם היסטוריה מלאה
    // גופנים שאיש לא ביקש.
    const h = harness();
    for (const family of ['Narkisim', 'Gisha', 'Miriam', 'Rubik']) {
      h.preview.hover(family);
      await vi.advanceTimersByTimeAsync(FONT_PREVIEW_DELAY_MS / 3);
    }
    await settle(h);
    expect(h.painted).toEqual(['Rubik']);
  });

  it('הגופן שכבר במסמך אינו נצבע שוב', async () => {
    const h = harness();
    h.preview.hover('David');
    await settle(h);
    expect(h.painted).toEqual([]);
    expect(h.captures).toBe(0);
  });

  it('יציאה משורה אינה מחזירה — הרשימה עוד פתוחה', async () => {
    const h = harness();
    h.preview.hover('Narkisim');
    await settle(h);
    h.preview.hover(null);
    await settle(h);
    expect(h.painted).toEqual(['Narkisim']);
  });

  it('הטווח נתפס פעם אחת לסבב, גם על פני כמה צביעות', async () => {
    const h = harness();
    h.preview.hover('Narkisim');
    await settle(h);
    h.preview.hover('Gisha');
    await settle(h);
    expect(h.painted).toEqual(['Narkisim', 'Gisha']);
    expect(h.captures).toBe(1);
  });

  it('צביעה אחת אינה נועלת את הבאות אחריה', async () => {
    // הצביעה עצמה גורמת למנוע לפתור מחדש את הבחירה, ובאותם רגעים „מותר?”
    // הוא `false`. בדיקה תמידית הייתה מכבה את התצוגה אחרי השורה הראשונה.
    const h = harness();
    h.preview.hover('Narkisim');
    await settle(h);
    h.allowed.value = false;
    h.preview.hover('Gisha');
    await settle(h);
    expect(h.painted).toEqual(['Narkisim', 'Gisha']);
  });
});

describe('התצוגה החיה — מתי היא שותקת', () => {
  it('בלי טווח מסומן אין תצוגה', async () => {
    const h = harness();
    h.allowed.value = false;
    h.preview.hover('Narkisim');
    await settle(h);
    expect(h.painted).toEqual([]);
  });

  it('בחירה מעורבת אינה מוצגת — אין לאן להחזיר', async () => {
    // צביעה משטחת שתי משפחות לאחת, וההחזרה יודעת גופן אחד. תצוגה כאן הייתה
    // מוחקת מידע מהמסמך.
    const h = harness();
    h.document.family = null;
    h.preview.hover('Narkisim');
    await settle(h);
    expect(h.painted).toEqual([]);
  });

  it('טווח שלא נתפס אינו נצבע', async () => {
    const h = harness();
    h.capture.value = null;
    h.preview.hover('Narkisim');
    await settle(h);
    expect(h.painted).toEqual([]);
    expect(h.preview.shown()).toBeNull();
  });

  it('רשימה שנסגרה בזמן התפיסה אינה צובעת אחריה', async () => {
    // לחיצה במסמך גם סוגרת את הרשימה וגם מזיזה את הבחירה. צביעה שנוחתת אחרי
    // זה היא שינוי בלי שאיש עומד על שורה.
    const gate: { release: ((value: unknown) => void) | null } = { release: null };
    const h = harness({
      capture: () =>
        new Promise((resolve) => {
          gate.release = resolve;
        }),
    });

    h.preview.hover('Narkisim');
    await vi.advanceTimersByTimeAsync(FONT_PREVIEW_DELAY_MS);
    h.preview.end(false);
    gate.release?.(RANGE);
    await settle(h);

    expect(h.painted).toEqual([]);
  });
});

describe('התצוגה החיה — סגירה', () => {
  it('יציאה בלי לבחור מחזירה את הגופן שהיה', async () => {
    const h = harness();
    h.preview.hover('Narkisim');
    await settle(h);
    h.preview.end(false);
    await h.preview.idle();
    expect(h.painted).toEqual(['Narkisim', 'David']);
    expect(h.document.family).toBe('David');
  });

  it('בחירה אינה מחזירה — הגופן שהוצג הוא מה שהמשתמש רצה', async () => {
    const h = harness();
    h.preview.hover('Narkisim');
    await settle(h);
    h.preview.end(true);
    await h.preview.idle();
    expect(h.painted).toEqual(['Narkisim']);
  });

  it('סגירה בלי שהוצג דבר אינה נוגעת במסמך', async () => {
    const h = harness();
    h.preview.end(false);
    await h.preview.idle();
    expect(h.painted).toEqual([]);
  });

  it('חזרה לשורה של הגופן המקורי אינה מייצרת החזרה מיותרת', async () => {
    const h = harness();
    h.preview.hover('Narkisim');
    await settle(h);
    h.preview.hover('David');
    await settle(h);
    h.preview.end(false);
    await h.preview.idle();
    expect(h.painted).toEqual(['Narkisim', 'David']);
  });

  it('ההחזרה נוחתת אחרי צביעה שהייתה באוויר', async () => {
    // אחרת ההחזרה הייתה מוקדמת, והגופן שאיש לא בחר היה נשאר במסמך.
    const order: string[] = [];
    const gate: { release: (() => void) | null } = { release: null };
    const h = harness({
      paint: async (_target, family) => {
        if (family === 'Narkisim') {
          await new Promise<void>((resolve) => {
            gate.release = resolve;
          });
        }
        order.push(family);
        return true;
      },
    });

    h.preview.hover('Narkisim');
    await vi.advanceTimersByTimeAsync(FONT_PREVIEW_DELAY_MS);
    h.preview.end(false);
    gate.release?.();
    await h.preview.idle();

    expect(order).toEqual(['Narkisim', 'David']);
  });

  it('סבב חדש אחרי סגירה תופס טווח מחדש', async () => {
    const h = harness();
    h.preview.hover('Narkisim');
    await settle(h);
    h.preview.end(true);

    h.preview.hover('Gisha');
    await settle(h);
    expect(h.captures).toBe(2);
  });
});

/* ------------------------------------------------------------------ */
/* שכבת המנוע — המגע במסמך                                            */
/* ------------------------------------------------------------------ */

interface FakeDoc {
  selection?: {
    current?: (query?: { includeText?: boolean }) =>
      | { empty?: boolean; selectionTarget?: unknown; text?: string }
      | undefined;
  };
  format?: {
    apply?: (input: { target: unknown; inline: Record<string, unknown> }) => {
      success?: boolean;
      failure?: { code?: string };
    };
  };
}

const host = (doc: FakeDoc | null) => ({ activeEditor: { doc } });

describe('captureRange', () => {
  it('מחזירה את ה-target של הבחירה', async () => {
    const target = { id: 1 };
    const got = await captureRange(host({ selection: { current: () => ({ empty: false, selectionTarget: target }) } }));
    expect(got).toBe(target);
  });

  it('סמן מכווץ אינו טווח', async () => {
    const got = await captureRange(host({ selection: { current: () => ({ empty: true, selectionTarget: {} }) } }));
    expect(got).toBeNull();
  });

  it('גרסה בלי `selection.current` אינה מפילה דבר', async () => {
    expect(await captureRange(host({}))).toBeNull();
    expect(await captureRange(host(null))).toBeNull();
    expect(await captureRange(null)).toBeNull();
  });

  it('קריאה שזורקת מחזירה „אין טווח” ולא חריגה', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const got = await captureRange(
      host({
        selection: {
          current: () => {
            throw new Error('boom');
          },
        },
      }),
    );
    expect(got).toBeNull();
    warn.mockRestore();
  });
});

/**
 * הקריאה שפס הדגימה נשען עליה — ומה שמפריד אותה מכל השאר בקובץ הזה: היא
 * **קריאה**. אין לה מסלול שנוגע במסמך, ולכן אין לה מה להחזיר ואין לה מה לשבור.
 */
describe('readSelectionText', () => {
  it('מחזירה את הטקסט המסומן', async () => {
    const got = await readSelectionText(
      host({ selection: { current: () => ({ empty: false, text: 'בראשית ברא' }) } }),
    );
    expect(got).toBe('בראשית ברא');
  });

  /**
   * ⚠️ הדגל אינו אופטימיזציה. בלעדיו המנוע חוסך את איסוף הטקסט ואינו מחזיר
   * `text` כלל — וההיעדר נראה בדיוק כמו „הבחירה ריקה”, כלומר פס שמציג לנצח את
   * משפט ברירת המחדל בזמן שיש בחירה.
   */
  it('מבקשת `includeText` במפורש', async () => {
    const current = vi.fn(() => ({ empty: false, text: 'שלום' }));
    await readSelectionText(host({ selection: { current } }));
    expect(current).toHaveBeenCalledWith({ includeText: true });
  });

  it('סמן מכווץ — מחרוזת ריקה', async () => {
    const got = await readSelectionText(
      host({ selection: { current: () => ({ empty: true, text: 'לא אמור לחזור' }) } }),
    );
    expect(got).toBe('');
  });

  it('מנוע שמתעלם מהדגל ואינו מחזיר `text` — מחרוזת ריקה, ולא נפילה', async () => {
    const got = await readSelectionText(
      host({ selection: { current: () => ({ empty: false, selectionTarget: {} }) } }),
    );
    expect(got).toBe('');
  });

  it('גרסה בלי `selection.current` אינה מפילה דבר', async () => {
    expect(await readSelectionText(host({}))).toBe('');
    expect(await readSelectionText(host(null))).toBe('');
    expect(await readSelectionText(null)).toBe('');
  });

  it('קריאה שנפלה — מחרוזת ריקה, והכשל נרשם ואינו מתפשט', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const got = await readSelectionText(
      host({
        selection: {
          current: () => {
            throw new Error('המנוע נפל');
          },
        },
      }),
    );
    expect(got).toBe('');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('paintFamily', () => {
  it('שולחת `fontFamily` על הטווח שנתפס — אותו מפתח של פקודת הרצועה', async () => {
    const calls: unknown[] = [];
    const target = { id: 2 };
    const ok = await paintFamily(
      host({
        format: {
          apply: (input) => {
            calls.push(input);
            return { success: true };
          },
        },
      }),
      target,
      'Narkisim',
    );

    expect(ok).toBe(true);
    expect(calls).toEqual([{ target, inline: { fontFamily: 'Narkisim' } }]);
  });

  it('NO_OP הוא הצלחה — „הגופן כבר היה זה” אינו כשל', async () => {
    const ok = await paintFamily(
      host({ format: { apply: () => ({ success: false, failure: { code: 'NO_OP' } }) } }),
      { id: 3 },
      'David',
    );
    expect(ok).toBe(true);
  });

  it('כשל מוחזר כ-false, ולא כחריגה', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(
      await paintFamily(
        host({ format: { apply: () => ({ success: false, failure: { code: 'DOCUMENT_READONLY' } }) } }),
        { id: 4 },
        'David',
      ),
    ).toBe(false);
    expect(
      await paintFamily(
        host({
          format: {
            apply: () => {
              throw new Error('boom');
            },
          },
        }),
        { id: 5 },
        'David',
      ),
    ).toBe(false);
    warn.mockRestore();
  });

  it('גרסה בלי `format.apply` אינה מפילה דבר', async () => {
    expect(await paintFamily(host({}), { id: 6 }, 'David')).toBe(false);
    expect(await paintFamily(host({ format: { apply: () => ({ success: true }) } }), null, 'David')).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* המפסק                                                              */
/* ------------------------------------------------------------------ */

/**
 * התצוגה החיה כבויה, ומה שנבדק כאן הוא בדיוק זה: ריחוף אינו נוגע במסמך.
 *
 * ההנמקה כולה ב-`FONT_PREVIEW_ENABLED` (engine/font-preview.ts) — Undo שנשבר
 * (ריחוף אחד = שתי דרגות, והראשונה מחזירה את גופן התצוגה), „לא נשמר”
 * ו-autosave שכותב לקובץ, ו-`rFonts` מפורש שנשאר בריצה שירשה מהסגנון.
 *
 * הבדיקות כאן נשענות על **ברירת המחדל** של המכונה ולא על דגל שהן מזריקות:
 * זו הדרך היחידה למדוד שהחיווט הממשי (use-font-controls, שאינו מעביר
 * `enabled`) אכן יוצא כבוי.
 */
describe('המפסק — התצוגה החיה כבויה בברירת המחדל', () => {
  /** אותו harness, בלי `enabled` — כלומר בדיוק מה שהחיווט הממשי מקבל. */
  function dormant(): { preview: ReturnType<typeof createFontPreview>; painted: string[]; captures: number } {
    const painted: string[] = [];
    let captures = 0;
    const preview = createFontPreview({
      allowed: () => true,
      origin: () => 'David',
      capture: async () => {
        captures += 1;
        return RANGE;
      },
      paint: async (_target, family) => {
        painted.push(family);
        return true;
      },
    });
    return {
      preview,
      painted,
      get captures() {
        return captures;
      },
    };
  }

  it('הדגל עצמו כבוי — וזה מה שהחיווט מקבל', () => {
    expect(FONT_PREVIEW_ENABLED).toBe(false);
  });

  it('ריחוף שנח אינו צובע, אינו תופס טווח, ואינו מדווח „מוצג”', async () => {
    const h = dormant();
    h.preview.hover('Narkisim');
    await vi.advanceTimersByTimeAsync(FONT_PREVIEW_DELAY_MS * 4);
    await h.preview.idle();

    expect(h.painted).toEqual([]);
    expect(h.captures).toBe(0);
    expect(h.preview.shown()).toBeNull();
  });

  it('סגירה בלי בחירה אינה מייצרת מוטציית „החזרה” — אין מה להחזיר', async () => {
    const h = dormant();
    h.preview.hover('Narkisim');
    await vi.advanceTimersByTimeAsync(FONT_PREVIEW_DELAY_MS * 4);
    h.preview.end(false);
    await h.preview.idle();

    expect(h.painted).toEqual([]);
  });

  it('גם מעבר על רשימה שלמה אינו מגיע למסמך אף פעם אחת', async () => {
    const h = dormant();
    for (const family of ['Narkisim', 'Gisha', 'Miriam', 'Rubik', 'Arial']) {
      h.preview.hover(family);
      await vi.advanceTimersByTimeAsync(FONT_PREVIEW_DELAY_MS * 2);
    }
    h.preview.end(false);
    await h.preview.idle();

    expect(h.painted).toEqual([]);
    expect(h.captures).toBe(0);
  });
});
