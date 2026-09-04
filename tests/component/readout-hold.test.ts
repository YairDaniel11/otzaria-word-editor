/**
 * החיווי ברצועה בזמן הקלדה.
 *
 * ## התקלה שהבדיקה הזאת שומרת עליה
 *
 * „כשאני מקליד, העיצוב לא קיים; כשאני מפסיק, הוא חוזר.” נמדד ב-Chrome על
 * ה-dist הארוז (scripts/ribbon-typing-probe.mjs): ב-40 שניות של הקלדה רגילה
 * כפתור „יישור לימין” איבד את החיווי הדלוק וקיבל אותו בחזרה **34 פעמים**.
 * הסיבה אינה ברצועה אלא בצורה שהמנוע עונה בה — `readToolbarParagraphAlignment`
 * מקפל „מעורב” ו„עוד לא נפתר” לאותו `undefined` — וההנמקה המלאה, כולל למה
 * הכלל הוא דווקא זה, ב-engine/readout-hold.ts.
 *
 * ## למה דווקא כאן, ולא רק ב-tests/unit/readout-hold.test.ts
 *
 * בדיקת היחידה מודדת את הכלל; זו מודדת שהוא באמת מגיע ל-DOM. ביניהם יושבים
 * `useCommand`, ההזרקה מהמעטפת, ו-38 אתרי קריאה שקוראים `state.value.value`
 * ולא `value` — כלומר בדיוק המקומות שבהם תיקון נכון יכול לא להגיע למסך.
 */
import { describe, expect, it } from 'vitest';
import HomeTab from '../../src/ui/ribbon/tabs/HomeTab.vue';
import {
  autoUnmount,
  buttonByTip,
  createCommandDouble,
  mountUi,
  settle,
  SETTLED_CARET,
} from './harness';

autoUnmount();

const CARET_UNSETTLED = { empty: true, settled: false };
const RANGE_SETTLED = { empty: false, settled: true };

/** האם כפתור היישור דלוק. */
function isActive(wrapper: Parameters<typeof buttonByTip>[0], title: string): boolean {
  return buttonByTip(wrapper, title).classes().includes('active');
}

async function mountAligned(alignment: unknown = 'right') {
  const adapter = createCommandDouble();
  adapter.setState('text-align', { value: alignment });
  const harness = mountUi(HomeTab, { adapter });
  await settle();
  return harness;
}

describe('חיווי היישור בזמן הקלדה', () => {
  it('נדלק לפי מה שהמנוע מדווח', async () => {
    const harness = await mountAligned('right');

    expect(isActive(harness.wrapper, 'יישור לימין')).toBe(true);
    expect(isActive(harness.wrapper, 'מרכז')).toBe(false);
  });

  it('אינו נכבה כשהמנוע מפסיק לדעת והבחירה היא סמן', async () => {
    // זה ההבהוב עצמו: בכל תו שנקלד הקריאות של המנוע מתאפסות, והוא מחזיר
    // `undefined` עד שהן מתיישבות. לסמן יש פסקה אחת ולפסקה יש יישור אחד,
    // ולכן „אין ערך” כאן אינו יכול להיות האמת.
    const harness = await mountAligned('right');

    harness.adapter.setState('text-align', { value: undefined });
    await settle();

    expect(isActive(harness.wrapper, 'יישור לימין')).toBe(true);
  });

  it('אינו נכבה גם כשהבחירה עצמה טרם התיישבה', async () => {
    const harness = await mountAligned('right');
    await harness.setReadoutSelection(CARET_UNSETTLED);

    harness.adapter.setState('text-align', { value: undefined });
    await settle();

    expect(isActive(harness.wrapper, 'יישור לימין')).toBe(true);
  });

  it('אינו נכבה גם על טווח שטרם התיישב', async () => {
    const harness = await mountAligned('right');
    await harness.setReadoutSelection({ empty: false, settled: false });

    harness.adapter.setState('text-align', { value: undefined });
    await settle();

    expect(isActive(harness.wrapper, 'יישור לימין')).toBe(true);
  });
});

describe('מה שההחזקה אינה מכסה, ובכוונה', () => {
  it('טווח שהתיישב בלי ערך הוא „מעורב” — ואף כפתור אינו דלוק', async () => {
    // כאן `undefined` הוא התשובה האמיתית, ו-Word מציג בדיוק אותו דבר. החזקה
    // כאן הייתה מציגה את היישור של הפסקה הראשונה כאילו הוא של כולן.
    const harness = await mountAligned('right');
    await harness.setReadoutSelection(RANGE_SETTLED);

    harness.adapter.setState('text-align', { value: undefined });
    await settle();

    for (const title of ['יישור לימין', 'מרכז', 'יישור לשמאל', 'יישור לשני הצדדים']) {
      expect(isActive(harness.wrapper, title), title).toBe(false);
    }
  });

  it('חזרה לסמן מציגה שוב את האחרון שידענו', async () => {
    // הזיכרון נכתב רק מדיווח שיש בו ערך, ולכן „מעורב” אינו מוחק אותו.
    const harness = await mountAligned('right');

    await harness.setReadoutSelection(RANGE_SETTLED);
    harness.adapter.setState('text-align', { value: undefined });
    await settle();
    expect(isActive(harness.wrapper, 'יישור לימין')).toBe(false);

    await harness.setReadoutSelection(SETTLED_CARET);
    expect(isActive(harness.wrapper, 'יישור לימין')).toBe(true);
  });
});

describe('ערך טרי מנצח את ההחזקה', () => {
  it('דיווח חדש נדלק מיד, גם כשהקריאה לא התיישבה', async () => {
    // זה מה שמייתר מנגנון ביטול-החזקה נפרד: לחיצה על „מרכז” בזמן הקלדה
    // נדלקת מיד ואינה ממתינה להתיישבות.
    const harness = await mountAligned('right');
    await harness.setReadoutSelection(CARET_UNSETTLED);

    harness.adapter.setState('text-align', { value: 'center' });
    await settle();

    expect(isActive(harness.wrapper, 'מרכז')).toBe(true);
    expect(isActive(harness.wrapper, 'יישור לימין')).toBe(false);
  });

  it('לחיצה על „מרכז” מדליקה אותו בלי להמתין', async () => {
    const harness = await mountAligned('right');
    await harness.setReadoutSelection(CARET_UNSETTLED);

    await buttonByTip(harness.wrapper, 'מרכז').trigger('click');
    await settle();
    // הכפיל מדווח את מה שהפקודה החילה, כמו המנוע.
    harness.adapter.setState('text-align', { value: 'center' });
    await settle();

    expect(harness.failures()).toEqual([]);
    expect(isActive(harness.wrapper, 'מרכז')).toBe(true);
  });
});

describe('גבולות הזיכרון', () => {
  it('מסמך חדש אינו יורש את החיווי של הקודם', async () => {
    // החזקה שחוצה מסמכים הייתה מציגה את היישור של המסמך שנסגר על זה שנפתח.
    const harness = await mountAligned('right');
    expect(isActive(harness.wrapper, 'יישור לימין')).toBe(true);

    await harness.setAdapter(createCommandDouble());

    expect(isActive(harness.wrapper, 'יישור לימין')).toBe(false);
  });

  it('בלי מנוע כלל אין מה להחזיק', async () => {
    const harness = mountUi(HomeTab, { adapter: null });
    await settle();

    expect(isActive(harness.wrapper, 'יישור לימין')).toBe(false);
  });
});
