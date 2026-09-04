/**
 * „סוגריים לא סגורים” ו„טקסט מתחלף” — הלוגיקה הטהורה, והחלת ההדגשות מול
 * הכפיל.
 */
import { describe, expect, it } from 'vitest';
import {
  scanBlockForUnclosed,
  scanDocumentAsOne,
  scanForUnclosed,
} from '../../src/engine/shulchan/unclosed-parens';
import {
  alternatingRanges,
  defaultAlternatingOptions,
  runTextAlternating,
} from '../../src/engine/shulchan/text-alternating';
import { fakeShulchanHost } from './shulchan-fake';

describe('shulchan/unclosed-parens', () => {
  it('פסקה מאוזנת — כולל קינון — נקייה', () => {
    expect(scanBlockForUnclosed({ blockId: 'p', text: 'שלום (עולם [טוב] מאוד) כן' })).toEqual([]);
  });

  it('פותח ללא סוגר מדווח על מיקום הפותח', () => {
    const findings = scanBlockForUnclosed({ blockId: 'p', text: 'שלום (עולם' });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: 'open-without-close', start: 5, end: 6 });
  });

  it('סוגר ללא פותח וסוגר לא תואם מזוהים כל אחד בסוגו', () => {
    expect(scanBlockForUnclosed({ blockId: 'p', text: 'שלום) עולם' })[0]?.kind).toBe('close-without-open');
    // הממצאים ממוינים לפי מיקום: הפותח (0) לפני הסוגר הלא-תואם (5).
    expect(scanBlockForUnclosed({ blockId: 'p', text: '(שלום] עולם' }).map((f) => f.kind)).toEqual([
      'open-without-close',
      'mismatched-close',
    ]);
  });

  it('סורק את כל הבלוקים בסדר המסמך', () => {
    const findings = scanForUnclosed([
      { blockId: 'p1', text: 'תקין (כן)' },
      { blockId: 'p2', text: 'חסר (' },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.blockId).toBe('p2');
  });

  /* מצב „המסמך כולו כאחד” של המקור: הערה בסוגריים שנמשכת על פני כמה פסקאות
     אינה שגיאה — הפותח בפסקה הראשונה נסגר בשלישית. */
  it('במצב מסמך-כאחד, סוגר בפסקה מאוחרת סוגר פותח מפסקה מוקדמת', () => {
    const blocks = [
      { blockId: 'p1', text: 'תחילת הערה (שנמשכת' },
      { blockId: 'p2', text: 'עוד פסקה [פנימית]' },
      { blockId: 'p3', text: 'וסופה כאן) והמשך' },
    ];
    expect(scanForUnclosed(blocks, 'paragraph').map((f) => `${f.blockId}:${f.kind}`)).toEqual([
      'p1:open-without-close',
      'p3:close-without-open',
    ]);
    expect(scanDocumentAsOne(blocks)).toEqual([]);
  });

  it('במצב מסמך-כאחד, פותח שלא נסגר עד סוף המסמך מדווח במקום שנפתח, בסדר המסמך', () => {
    const blocks = [
      { blockId: 'p1', text: 'א (ב' },
      { blockId: 'p2', text: 'ג ] ד' },
      { blockId: 'p3', text: 'ה' },
    ];
    const findings = scanDocumentAsOne(blocks);
    expect(findings.map((f) => `${f.blockId}:${f.kind}:${f.start}`)).toEqual([
      'p1:open-without-close:2',
      'p2:mismatched-close:2',
    ]);
  });
});

describe('shulchan/text-alternating', () => {
  it('קטע ראשון מתחילת הפסקה עד תו הסיום, ואחריו קטעים בין : ל-.', () => {
    const text = 'דיבור ראשון. הסבר ארוך כאן: קטע שני. עוד הסבר: קטע שלישי. סוף';
    expect(alternatingRanges(text, defaultAlternatingOptions())).toEqual([
      { start: 0, end: 12 },
      { start: 28, end: 36 },
      { start: 47, end: 57 },
    ]);
  });

  it('פסקה בלי תו סיום — אין הדגשות', () => {
    expect(alternatingRanges('אין כאן נקודה', defaultAlternatingOptions())).toEqual([]);
  });

  /* כמו `MoveUntil` במקור: כל תו בשדה הוא תוחם. „דיבור המתחיל” שנגמר בסימן
     שאלה או בנקודתיים הוא אותו דיבור. */
  it('כל תו בסט הוא תוחם, ותו יכול להופיע בשני הסטים', () => {
    const text = 'שאלה? הסבר: תשובה. ועוד; קטע.';
    expect(alternatingRanges(text, { startChar: ':;', endChar: '.?' })).toEqual([
      { start: 0, end: 5 },
      { start: 12, end: 18 },
      { start: 25, end: 29 },
    ]);
    // תו משותף — הסיום של קטע הוא ההתחלה של הבא.
    expect(alternatingRanges('א. ב. ג.', { startChar: '.', endChar: '.' })).toEqual([
      { start: 0, end: 2 },
      { start: 6, end: 8 },
    ]);
  });

  it('שדה ריק — אין הדגשות', () => {
    expect(alternatingRanges('א. ב: ג.', { startChar: '', endChar: '.' })).toEqual([]);
    expect(alternatingRanges('א. ב: ג.', { startChar: ':', endChar: '' })).toEqual([]);
  });

  it('מדגיש דרך format.apply עם bold ו-bCs', async () => {
    const { host, calls } = fakeShulchanHost({
      blocks: [{ blockId: 'p1', text: 'פתיחה. ואמרו: המשך.' }],
    });
    const result = await runTextAlternating(host, defaultAlternatingOptions());

    expect(result).toMatchObject({ ok: true, bolded: 2 });
    expect(calls.inline).toEqual([
      { blockId: 'p1', start: 0, end: 6, inline: { bold: true, bCs: true } },
      { blockId: 'p1', start: 14, end: 19, inline: { bold: true, bCs: true } },
    ]);
  });

  it('בלי בחירה — כשל סגור, לא עיבוד של כל המסמך', async () => {
    const { host, calls } = fakeShulchanHost({
      blocks: [{ blockId: 'p1', text: 'פתיחה. עוד: כן.' }],
      selected: [],
    });
    const result = await runTextAlternating(host, defaultAlternatingOptions());
    expect(result.ok).toBe(false);
    expect(calls.inline).toEqual([]);
  });
});
