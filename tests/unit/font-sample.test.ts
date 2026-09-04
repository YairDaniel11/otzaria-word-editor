/**
 * פס הדגימה של בורר הגופן — מה מוצג בו, ומתי הוא נקרא.
 *
 * הפס הוא מה שנשלח **במקום** תצוגה חיה שצובעת את המסמך, אחרי שזו נמדדה כמטעה
 * (`docs/engine-gaps.md`, „תצוגה חיה של גופן”). ולכן מה שנבדק כאן אינו „הטקסט
 * מוצג” אלא שתי ההכרעות שיש בו, ושתיהן בלתי נראות בעין:
 *
 * 1. **קריאה אחת לסבב.** קריאה בכל ריחוף הייתה מחליפה את הדגימה מתחת לאצבע
 *    אילו משהו אחר הזיז את הסמן בזמן שהרשימה פתוחה.
 * 2. **תשובה שאיחרה נזרקת.** הקריאה אסינכרונית, והרשימה יכולה להיסגר בזמן
 *    שהיא באוויר — ואז הטקסט שלה שייך לסבב שנגמר, לא לסבב הבא.
 *
 * הבדיקה של הפס עצמו — מה מרונדר, באיזה גופן, ומה קורה לניווט המקלדת — היא
 * `tests/component/font-combo.test.ts`.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  createFontSample,
  FONT_SAMPLE_FALLBACK,
  FONT_SAMPLE_MAX_CHARS,
} from '../../src/composables/font-sample';

/**
 * ריקון תור המשימות. `setTimeout` ולא ספירת מיקרו-משימות: מספר ה-`await`ים
 * שנדרשים תלוי בשאלה אם `deps.read` הוא `async` או מחזיר Promise ידני, וזה
 * פרט מימוש של הבדיקה ולא של הקוד.
 */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** סבב שלם: הרשימה נפתחה, הקריאה חזרה. */
async function beginAndSettle(sample: ReturnType<typeof createFontSample>): Promise<void> {
  sample.begin();
  await flush();
}

describe('מה הפס מציג', () => {
  it('לפני שנקרא דבר — משפט ברירת המחדל, ולא ריק', () => {
    const sample = createFontSample({ read: async () => 'לא נקרא' });
    expect(sample.text.value).toBe(FONT_SAMPLE_FALLBACK);
  });

  it('אחרי סבב — הטקסט שהמשתמש סימן', async () => {
    const sample = createFontSample({ read: async () => 'בראשית ברא' });
    await beginAndSettle(sample);
    expect(sample.text.value).toBe('בראשית ברא');
  });

  it('בחירה ריקה או רווחים בלבד — ברירת המחדל, ולא פס ריק', async () => {
    for (const text of ['', '   ', '\n\t ']) {
      const sample = createFontSample({ read: async () => text });
      await beginAndSettle(sample);
      expect(sample.text.value).toBe(FONT_SAMPLE_FALLBACK);
    }
  });

  it('רווחים בקצוות נחתכים — דגימה שמתחילה ברווח אינה מראה אותיות', async () => {
    const sample = createFontSample({ read: async () => '   שלום עולם   ' });
    await beginAndSettle(sample);
    expect(sample.text.value).toBe('שלום עולם');
  });
});

describe('תקרת האורך', () => {
  it('בחירה ארוכה נחתכת לתקרה', async () => {
    const long = 'א'.repeat(FONT_SAMPLE_MAX_CHARS + 40);
    const sample = createFontSample({ read: async () => long });
    await beginAndSettle(sample);
    expect(sample.text.value).toHaveLength(FONT_SAMPLE_MAX_CHARS);
  });

  it('בחירה שבתקרה בדיוק אינה נחתכת', async () => {
    const exact = 'ב'.repeat(FONT_SAMPLE_MAX_CHARS);
    const sample = createFontSample({ read: async () => exact });
    await beginAndSettle(sample);
    expect(sample.text.value).toBe(exact);
  });

  /**
   * הרגרסיה שהנימוק ל-`Array.from` קיים בשבילה: `slice` לפי יחידות קוד היה
   * מפצל את התו האחרון לחצי זוג surrogate, וזה מרונדר כ-‎`U+FFFD`‎.
   */
  it('חיתוך אינו מפצל זוג surrogate', async () => {
    // 59 אותיות ואחריהן תו מחוץ ל-BMP: החיתוך נופל בדיוק עליו.
    const text = 'ג'.repeat(FONT_SAMPLE_MAX_CHARS - 1) + '\u{1D504}\u{1D505}';
    const sample = createFontSample({ read: async () => text });
    await beginAndSettle(sample);

    expect(Array.from(sample.text.value)).toHaveLength(FONT_SAMPLE_MAX_CHARS);
    expect(sample.text.value).not.toContain('�');
    expect(sample.text.value.endsWith('\u{1D504}')).toBe(true);
  });
});

describe('קריאה אחת לסבב', () => {
  it('ריחוף על כמה שורות באותה פתיחה קורא פעם אחת', async () => {
    const read = vi.fn(async () => 'טקסט');
    const sample = createFontSample({ read });

    await beginAndSettle(sample);
    sample.begin();
    sample.begin();
    await beginAndSettle(sample);

    expect(read).toHaveBeenCalledTimes(1);
  });

  it('סגירה ופתיחה מחדש קוראות שוב — הבחירה יכולה להיות אחרת', async () => {
    let answer = 'ראשון';
    const read = vi.fn(async () => answer);
    const sample = createFontSample({ read });

    await beginAndSettle(sample);
    expect(sample.text.value).toBe('ראשון');

    sample.end();
    answer = 'שני';
    await beginAndSettle(sample);

    expect(read).toHaveBeenCalledTimes(2);
    expect(sample.text.value).toBe('שני');
  });

  it('סגירה מנקה את הפס — הפתיחה הבאה אינה מציגה את הדגימה של הקודמת', async () => {
    const sample = createFontSample({ read: async () => 'של הסבב שנגמר' });
    await beginAndSettle(sample);
    expect(sample.text.value).toBe('של הסבב שנגמר');

    sample.end();
    expect(sample.text.value).toBe(FONT_SAMPLE_FALLBACK);
  });
});

describe('תשובה שאיחרה', () => {
  /**
   * החתימה שהמונה קיים בשבילה: הקריאה יצאה, הרשימה נסגרה, והתשובה חוזרת אחר
   * כך. בלי המונה היא הייתה נוחתת בפס — ומוצגת בפתיחה הבאה עד שהקריאה החדשה
   * תחזור.
   */
  it('קריאה שחוזרת אחרי הסגירה אינה נכתבת לפס', async () => {
    let land: (text: string) => void = () => {};
    const sample = createFontSample({
      read: () => new Promise<string>((resolve) => (land = resolve)),
    });

    sample.begin();
    await flush();
    sample.end();

    land('איחרתי');
    await flush();

    expect(sample.text.value).toBe(FONT_SAMPLE_FALLBACK);
  });

  it('ותשובה של הסבב הפתוח כן נכתבת', async () => {
    let land: (text: string) => void = () => {};
    const sample = createFontSample({
      read: () => new Promise<string>((resolve) => (land = resolve)),
    });

    sample.begin();
    await flush();

    land('הגעתי בזמן');
    await flush();

    expect(sample.text.value).toBe('הגעתי בזמן');
  });
});

describe('משפט ברירת המחדל', () => {
  /** אות סופית היא אותה אות — לצורך „האם האלפבית מכוסה”. */
  const FINALS: Readonly<Record<string, string>> = {
    ך: 'כ',
    ם: 'מ',
    ן: 'נ',
    ף: 'פ',
    ץ: 'צ',
  };
  const ALPHABET = 'אבגדהוזחטיכלמנסעפצקרשת';

  /**
   * למה בדיקה ולא סתם קבוע: כל מה שהמשפט הזה עושה הוא **להראות את הגופן**,
   * וקיצור שלו ל„שלום עולם” היה משאיר פס שאינו מראה כלום — ועובר בשקט.
   */
  it('פנגרם: כל 22 אותיות האלפבית מופיעות בו', () => {
    const seen = new Set(
      Array.from(FONT_SAMPLE_FALLBACK.replace(/\s/g, '')).map((char) => FINALS[char] ?? char),
    );
    expect(Array.from(ALPHABET).filter((letter) => !seen.has(letter))).toEqual([]);
  });

  it('ונכנס בתקרת האורך, אחרת הוא נחתך בשלוש נקודות', () => {
    expect(Array.from(FONT_SAMPLE_FALLBACK).length).toBeLessThanOrEqual(FONT_SAMPLE_MAX_CHARS);
  });
});
