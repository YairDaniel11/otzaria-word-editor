/**
 * „המרת סוגריים ⇄ הערות שוליים” — התאמת הסוגריים הטהורה ושני כיווני ההמרה
 * מול הכפיל: סדר העיבוד (מהאחרון לראשון), מה נמחק, מה הוכנס ולאן.
 */
import { describe, expect, it } from 'vitest';
import {
  bracketRanges,
  convertBracketsToFootnotes,
  convertFootnotesToBrackets,
} from '../../src/engine/shulchan/brackets-notes';
import { fakeShulchanHost } from './shulchan-fake';

describe('shulchan/brackets-notes — bracketRanges', () => {
  it('טווחים ברמה העליונה, קינון נשאר בפנים', () => {
    expect(bracketRanges('א (ב (ג) ד) ה (ו)', 'round')).toEqual([
      { start: 2, end: 10 },
      { start: 14, end: 16 },
    ]);
  });

  it('פותח שלא נסגר — מדולג', () => {
    expect(bracketRanges('א (ב', 'round')).toEqual([]);
  });

  it('סוגריים מרובעים לפי הסוג המבוקש', () => {
    expect(bracketRanges('א [ב] (ג)', 'square')).toEqual([{ start: 2, end: 4 }]);
  });
});

describe('shulchan/brackets-notes — סוגריים ⟵ הערות', () => {
  it('כל קטע נמחק, הסמן מוצב במקומו וההערה מוכנסת עם התוכן', async () => {
    const { host, calls, textOf } = fakeShulchanHost({
      blocks: [{ blockId: 'p1', text: 'שלום (עולם) טוב (מאוד) סוף' }],
    });
    const result = await convertBracketsToFootnotes(host, 'round');

    expect(result).toMatchObject({ ok: true, converted: 2 });
    // מהאחרון לראשון — ההיסטים של המוקדם נשארים תקפים.
    expect(calls.replace.map((call) => call.start)).toEqual([16, 5]);
    expect(calls.insertedNotes.map((note) => note.content)).toEqual(['מאוד', 'עולם']);
    expect(textOf('p1')).toBe('שלום  טוב  סוף');
  });

  it('סוגריים ריקים אינם הופכים להערה', async () => {
    const { host, calls } = fakeShulchanHost({
      blocks: [{ blockId: 'p1', text: 'שלום ( ) עולם' }],
    });
    const result = await convertBracketsToFootnotes(host, 'round');
    expect(result).toMatchObject({ ok: true, converted: 0 });
    expect(calls.insertedNotes).toEqual([]);
  });
});

describe('shulchan/brackets-notes — הערות ⟵ סוגריים', () => {
  it('ההערה נמחקת והתוכן חוזר לגוף בסוגריים במקום ההפניה', async () => {
    const { host, calls, textOf } = fakeShulchanHost({
      blocks: [{ blockId: 'p1', text: 'שלום עולם' }],
      notes: { n1: { type: 'footnote', content: 'פירוש' } },
      refs: [{ noteId: 'n1', blockId: 'p1', offset: 4 }],
    });
    const result = await convertFootnotesToBrackets(host, 'round');

    expect(result).toMatchObject({ ok: true, converted: 1 });
    expect(calls.removedNotes).toEqual(['n1']);
    expect(textOf('p1')).toBe('שלום (פירוש) עולם');
  });

  /* `Selection.Range.Footnotes` במקור — רק ההערות שבבחירה. */
  it('רק הפניות שבפסקאות המסומנות מומרות', async () => {
    const { host, calls } = fakeShulchanHost({
      blocks: [
        { blockId: 'p1', text: 'ראשונה' },
        { blockId: 'p2', text: 'שנייה' },
      ],
      selected: ['p2'],
      notes: { n1: { type: 'footnote', content: 'א' }, n2: { type: 'footnote', content: 'ב' } },
      refs: [
        { noteId: 'n1', blockId: 'p1', offset: 3 },
        { noteId: 'n2', blockId: 'p2', offset: 2 },
      ],
    });
    const result = await convertFootnotesToBrackets(host, 'round');
    expect(result).toMatchObject({ ok: true, converted: 1 });
    expect(calls.removedNotes).toEqual(['n2']);
  });

  it('בבחירה של קטע בתוך פסקה — רק ההפניות שבתוך הקטע, כולל בקצהו', async () => {
    const { host, calls } = fakeShulchanHost({
      blocks: [{ blockId: 'p1', text: 'אבגדהוזחט' }],
      selectionRanges: { p1: { start: 3, end: 6 } },
      notes: {
        n1: { type: 'footnote', content: 'לפני' },
        n2: { type: 'footnote', content: 'בתוך' },
        n3: { type: 'footnote', content: 'בקצה' },
        n4: { type: 'footnote', content: 'אחרי' },
      },
      refs: [
        { noteId: 'n1', blockId: 'p1', offset: 1 },
        { noteId: 'n2', blockId: 'p1', offset: 4 },
        { noteId: 'n3', blockId: 'p1', offset: 6 },
        { noteId: 'n4', blockId: 'p1', offset: 8 },
      ],
    });
    const result = await convertFootnotesToBrackets(host, 'round');
    expect(result).toMatchObject({ ok: true, converted: 2 });
    expect(calls.removedNotes).toEqual(['n3', 'n2']);
  });

  it('סמן בלבד — הפסקה כולה היא התחום', async () => {
    const { host, calls } = fakeShulchanHost({
      blocks: [{ blockId: 'p1', text: 'אבגדה' }],
      selectionRanges: { p1: { start: 2, end: 2 } },
      notes: { n1: { type: 'footnote', content: 'א' } },
      refs: [{ noteId: 'n1', blockId: 'p1', offset: 4 }],
    });
    const result = await convertFootnotesToBrackets(host, 'round');
    expect(result).toMatchObject({ ok: true, converted: 1 });
    expect(calls.removedNotes).toEqual(['n1']);
  });

  it('בלי בחירה — כשל סגור, בלי מחיקה', async () => {
    const { host, calls } = fakeShulchanHost({
      blocks: [{ blockId: 'p1', text: 'שלום' }],
      selected: [],
      notes: { n1: { type: 'footnote', content: 'פירוש' } },
      refs: [{ noteId: 'n1', blockId: 'p1', offset: 2 }],
    });
    const result = await convertFootnotesToBrackets(host, 'round');
    expect(result.ok).toBe(false);
    expect(calls.removedNotes).toEqual([]);
  });

  it('כתובת שפותרת להערת סיום — מדולגת, לא נמחקת', async () => {
    const { host, calls } = fakeShulchanHost({
      blocks: [{ blockId: 'p1', text: 'שלום' }],
      notes: { n1: { type: 'endnote', content: 'סיום' } },
      refs: [{ noteId: 'n1', blockId: 'p1', offset: 2 }],
    });
    const result = await convertFootnotesToBrackets(host, 'round');
    expect(result).toMatchObject({ ok: true, converted: 0 });
    expect(calls.removedNotes).toEqual([]);
  });

  it('מנוע בלי doc.find — כשל סגור עם הסבר', async () => {
    const { host } = fakeShulchanHost({
      blocks: [{ blockId: 'p1', text: 'שלום' }],
      notes: { n1: { type: 'footnote', content: 'פירוש' } },
    });
    const result = await convertFootnotesToBrackets(host, 'round');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('מיקומי ההערות');
  });
});
