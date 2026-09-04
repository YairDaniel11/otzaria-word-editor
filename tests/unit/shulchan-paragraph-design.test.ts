/**
 * „עיצוב מילה ראשונה” ו„תיקון מרווח שורות” — מה נשלח למנוע: patch העיצוב
 * שנגזר מהגופן הפתור של הגוף, ניקוי ב-null בהסרה, ומרווח „בדיוק”/„מרובה”
 * ב-twips מתוך מדידה מוזרקת.
 */
import { describe, expect, it } from 'vitest';
import {
  applyFirstWordDesign,
  defaultFirstWordOptions,
  firstWordLength,
  removeFirstWordDesign,
} from '../../src/engine/shulchan/first-word';
import {
  applyExactLineSpacing,
  removeExactLineSpacing,
} from '../../src/engine/shulchan/line-spacing';
import { fakeShulchanHost } from './shulchan-fake';

describe('shulchan/first-word — firstWordLength', () => {
  it('עד הרווח הראשון, ורק כשיש טקסט אחריו', () => {
    expect(firstWordLength('שלום עולם')).toBe(4);
    expect(firstWordLength('שלום')).toBe(0);
    expect(firstWordLength('שלום ')).toBe(0);
    expect(firstWordLength(' שלום')).toBe(0);
  });
});

describe('shulchan/first-word — החלה', () => {
  it('גודל באחוזים נגזר מהגופן הפתור של המילה השנייה, עם הדגשה', async () => {
    const { host, calls } = fakeShulchanHost({
      blocks: [{ blockId: 'p1', text: 'שלום עולם טוב' }],
      runs: { p1: [{ text: 'שלום עולם טוב', resolved: { fontSize: 12, fontSizeCs: 14, fontFamily: 'David' } }] },
    });
    const result = await applyFirstWordDesign(host, defaultFirstWordOptions());

    expect(result).toMatchObject({ ok: true, formatted: 1 });
    expect(calls.inline).toHaveLength(1);
    const call = calls.inline[0]!;
    expect(call).toMatchObject({ blockId: 'p1', start: 0, end: 4 });
    // 14pt (הגודל ה-CS — עברית) × 1.3 = 18.2 ⟵ עיגול לחצי נקודה.
    expect(call.inline).toEqual({ fontSize: 18, fontSizeCs: 18, bold: true, bCs: true });
  });

  it('יישור כלפי מעלה מנמיך בחצי הפרש הגדלים, בשלמים', async () => {
    const { host, calls } = fakeShulchanHost({
      blocks: [{ blockId: 'p1', text: 'שלום עולם' }],
      runs: { p1: [{ text: 'שלום עולם', resolved: { fontSize: 12, fontSizeCs: 12 } }] },
    });
    const options = { ...defaultFirstWordOptions(), sizeMode: 'fixed' as const, fixedSizePt: 18, raiseBaseline: true };
    await applyFirstWordDesign(host, options);

    expect(calls.inline[0]!.inline).toMatchObject({ fontSize: 18, position: -3 });
  });

  it('מדלג על כותרות כשהאפשרות דולקת, ועל פסקאות של מילה אחת', async () => {
    const { host, calls } = fakeShulchanHost({
      blocks: [
        { blockId: 'h1', text: 'כותרת ארוכה', nodeType: 'heading' },
        { blockId: 'p1', text: 'מילה' },
        { blockId: 'p2', text: 'שתי מילים' },
      ],
    });
    const result = await applyFirstWordDesign(host, defaultFirstWordOptions());
    expect(result.formatted).toBe(1);
    expect(calls.inline[0]!.blockId).toBe('p2');
  });

  /* „כותרת” במקור היא גם פסקה ממורכזת — כותרות-משנה בספרים תורניים הן פסקאות
     רגילות שמורכזו ידנית, או שירשו מירכוז מהסגנון (`resolved`). */
  it('דילוג על כותרות מדלג גם על פסקאות ממורכזות — ישירות או מהסגנון', async () => {
    const { host, calls } = fakeShulchanHost({
      blocks: [
        { blockId: 'c1', text: 'כותרת ממורכזת ידנית' },
        { blockId: 'c2', text: 'כותרת ממורכזת מסגנון' },
        { blockId: 'p1', text: 'פסקת גוף רגילה' },
      ],
      alignment: { c1: { value: 'center' }, c2: { value: 'center', resolved: true } },
    });
    const result = await applyFirstWordDesign(host, defaultFirstWordOptions());
    expect(result.formatted).toBe(1);
    expect(calls.inline.map((call) => call.blockId)).toEqual(['p1']);

    // וכשהדילוג כבוי — הכול מעוצב.
    const all = fakeShulchanHost({
      blocks: [{ blockId: 'c1', text: 'כותרת ממורכזת ידנית' }],
      alignment: { c1: { value: 'center' } },
    });
    await applyFirstWordDesign(all.host, { ...defaultFirstWordOptions(), skipHeadings: false });
    expect(all.calls.inline).toHaveLength(1);
  });

  it('סינון לפי סגנון — רק פסקאות באותו styleId', async () => {
    const { host, calls } = fakeShulchanHost({
      blocks: [
        { blockId: 'p1', text: 'פסקה בסגנון גוף', styleId: 'Body' },
        { blockId: 'p2', text: 'פסקה בסגנון פירוש', styleId: 'Perush' },
        { blockId: 'p3', text: 'פסקה בלי סגנון' },
      ],
    });
    const result = await applyFirstWordDesign(host, { ...defaultFirstWordOptions(), styleId: 'Perush' });
    expect(result.formatted).toBe(1);
    expect(calls.inline.map((call) => call.blockId)).toEqual(['p2']);
  });

  it('הסרה מנקה את המאפיינים ב-null — לא כותבת ערכים חדשים', async () => {
    const { host, calls } = fakeShulchanHost({
      blocks: [{ blockId: 'p1', text: 'שלום עולם' }],
    });
    const result = await removeFirstWordDesign(host);

    expect(result).toMatchObject({ ok: true, formatted: 1 });
    expect(calls.inline[0]!.inline).toEqual({
      fontSize: null,
      fontSizeCs: null,
      bold: null,
      bCs: null,
      italic: null,
      iCs: null,
      underline: null,
      position: null,
    });
  });
});

describe('shulchan/line-spacing', () => {
  it('קובע „בדיוק” בגובה השורה הנמדד, ומשמר את הריווח לפני/אחרי', async () => {
    const { host, calls } = fakeShulchanHost({
      blocks: [{ blockId: 'p1', text: 'שלום עולם' }],
      spacing: { p1: { before: 6, after: 3, lineRule: 'auto', line: 12 } },
    });
    const result = await applyExactLineSpacing(host, () => 16);

    expect(result).toMatchObject({ ok: true, updated: 1 });
    expect(calls.setSpacing[0]).toMatchObject({
      before: 120,
      after: 60,
      line: 320,
      lineRule: 'exact',
    });
  });

  it('פסקה שכבר „בדיוק” אינה נכתבת שוב', async () => {
    const { host, calls } = fakeShulchanHost({
      blocks: [{ blockId: 'p1', text: 'שלום עולם' }],
      spacing: { p1: { lineRule: 'exact', line: 16 } },
    });
    const result = await applyExactLineSpacing(host, () => 16);
    expect(result.updated).toBe(0);
    expect(calls.setSpacing).toEqual([]);
  });

  it('הסרה ממירה ל„מרובה” ביחס הנמדד — 240 × היחס', async () => {
    const { host, calls } = fakeShulchanHost({
      blocks: [{ blockId: 'p1', text: 'שלום עולם' }],
      spacing: { p1: { lineRule: 'exact', line: 20 } },
    });
    const result = await removeExactLineSpacing(host, () => 16);

    expect(result).toMatchObject({ ok: true, updated: 1 });
    expect(calls.setSpacing[0]).toMatchObject({ line: 300, lineRule: 'auto' });
  });

  it('מדידה שנכשלה — כשל סגור, בלי כתיבה', async () => {
    const { host, calls } = fakeShulchanHost({
      blocks: [{ blockId: 'p1', text: 'שלום עולם' }],
    });
    const result = await applyExactLineSpacing(host, () => null);
    expect(result.ok).toBe(false);
    expect(calls.setSpacing).toEqual([]);
  });
});
