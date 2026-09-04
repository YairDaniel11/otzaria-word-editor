/**
 * ייצוא לפורמט ספר של אוצריא — engine/otzaria-book.ts.
 *
 * מה שנמדד כאן הוא החוזה מול **הפרסר של אוצריא**: שורה שמתחילה ב-`<h#>`,
 * escaping לטקסט חופשי, ובלי `\n` בתוך פסקה. ההנמקות המלאות בהערת הפתיחה
 * של המודול.
 */
import { describe, expect, it } from 'vitest';
import {
  buildOtzariaBook,
  otzariaBookFileName,
  otzariaHeadingLevel,
  type OtzariaBookTarget,
} from '../../src/engine/otzaria-book';

interface FakeBlock {
  nodeId: string;
  text?: string;
  styleId?: string | null;
  headingLevel?: number;
}

function fakeHost(blocks: FakeBlock[], options: { throwOnList?: boolean } = {}): OtzariaBookTarget {
  return {
    activeEditor: {
      doc: {
        blocks: {
          // מכבד את ה-limit המבוקש, כמו המנוע: עמוד מלא פירושו „אולי יש עוד”.
          list: ({ offset, limit }: { offset: number; limit: number }) => {
            if (options.throwOnList) throw new Error('engine gone');
            return { blocks: blocks.slice(offset, offset + limit) };
          },
        },
      },
    },
  } as OtzariaBookTarget;
}

describe('otzariaHeadingLevel — אותו מיפוי כמו ממיר ה-DOCX של אוצריא', () => {
  it('Title הוא שם הספר — h1', () => {
    expect(otzariaHeadingLevel('Title', undefined)).toBe(1);
    // תבניות Word אינן עקביות ברישיות, ברווחים ובמקפים; הנרמול כמו ב-style-gallery.
    expect(otzariaHeadingLevel(' title ', undefined)).toBe(1);
  });

  it('Heading N נשאר h(N) — בדיוק כמו _headingLevelFromStyleName', () => {
    expect(otzariaHeadingLevel('Heading1', 1)).toBe(1);
    expect(otzariaHeadingLevel('Heading3', 3)).toBe(3);
    // הרמות העמוקות נשמרות נפרדות: היסט של רמה היה מוחץ את 5 ואת 6 ל-h6.
    expect(otzariaHeadingLevel('Heading5', 5)).toBe(5);
    expect(otzariaHeadingLevel('Heading6', 6)).toBe(6);
    // אוצריא מכירה עד h6 — כותרות 7–9 מקבלות את התקרה ולא נעלמות.
    expect(otzariaHeadingLevel('Heading9', 9)).toBe(6);
  });

  it('headingLevel מהמנוע מספיק גם בלי styleId, ולהפך', () => {
    expect(otzariaHeadingLevel(null, 2)).toBe(2);
    expect(otzariaHeadingLevel('heading 2', undefined)).toBe(2);
    expect(otzariaHeadingLevel('Heading-3', undefined)).toBe(3);
  });

  it('מזהה גם שם סגנון עברי, כמו הממיר של אוצריא', () => {
    expect(otzariaHeadingLevel('כותרת 2', undefined)).toBe(2);
    expect(otzariaHeadingLevel('כותרת4', undefined)).toBe(4);
  });

  it('פסקת גוף — null', () => {
    expect(otzariaHeadingLevel('Normal', undefined)).toBeNull();
    expect(otzariaHeadingLevel(null, undefined)).toBeNull();
    expect(otzariaHeadingLevel('Quote', undefined)).toBeNull();
  });
});

describe('buildOtzariaBook', () => {
  it('כותרות בתחילת שורה, גוף כמות שהוא — מה שהפרסר של אוצריא מצפה לו', async () => {
    const outcome = await buildOtzariaBook(
      fakeHost([
        { nodeId: 'a', text: 'שער הספר', styleId: 'Title' },
        { nodeId: 'b', text: 'פרק א', styleId: 'Heading1', headingLevel: 1 },
        { nodeId: 'c', text: 'גוף הפרק.' },
      ]),
      'שם המסמך',
    );

    // בלי היסט, ועם שורת שם הספר בראש — בדיוק הפלט של
    // `ooxmlWordArchiveToText` על אותו מסמך. ראו הערת הפתיחה של המודול.
    expect(outcome).toMatchObject({ ok: true, lineCount: 4, headingCount: 3, titleAdded: true });
    if (outcome.ok) {
      expect(outcome.text).toBe(
        '<h1>שם המסמך</h1>\n<h1>שער הספר</h1>\n<h1>פרק א</h1>\nגוף הפרק.',
      );
    }
  });

  it('שורת שם המסמך נכתבת תמיד — היא שורש עץ הניווט', async () => {
    const outcome = await buildOtzariaBook(
      fakeHost([
        { nodeId: 'a', text: 'פרק א', styleId: 'Heading1', headingLevel: 1 },
        { nodeId: 'b', text: 'תוכן.' },
      ]),
      'חידושי תורה',
    );

    expect(outcome).toMatchObject({ ok: true, titleAdded: true, headingCount: 2 });
    if (outcome.ok) {
      expect(outcome.text.split('\n')[0]).toBe('<h1>חידושי תורה</h1>');
    }
  });

  it('רמות עמוקות נשמרות נפרדות, ולא נמחצות לתקרה', async () => {
    const outcome = await buildOtzariaBook(
      fakeHost([
        { nodeId: 'a', text: 'סעיף', styleId: 'Heading5', headingLevel: 5 },
        { nodeId: 'b', text: 'תת-סעיף', styleId: 'Heading6', headingLevel: 6 },
      ]),
      '',
    );

    expect(outcome).toMatchObject({ ok: true });
    if (outcome.ok) expect(outcome.text).toBe('<h5>סעיף</h5>\n<h6>תת-סעיף</h6>');
  });

  it('פסקאות ריקות מושמטות — שורה באוצריא היא כתובת, וכתובת ריקה אינה שווה אותה', async () => {
    const outcome = await buildOtzariaBook(
      fakeHost([
        { nodeId: 'a', text: 'ראשונה' },
        { nodeId: 'b', text: '   ' },
        { nodeId: 'c', text: '' },
        { nodeId: 'd', text: 'שנייה' },
      ]),
      'ספר',
    );

    expect(outcome).toMatchObject({ ok: true });
    if (outcome.ok) {
      expect(outcome.text).toBe('<h1>ספר</h1>\nראשונה\nשנייה');
    }
  });

  it('escaping: `<` גולמי בטקסט היה נקרא באוצריא כתג', async () => {
    const outcome = await buildOtzariaBook(
      fakeHost([{ nodeId: 'a', text: 'א < ב & ג > ד', styleId: 'Heading1' }]),
      'x < y',
    );

    expect(outcome).toMatchObject({ ok: true });
    if (outcome.ok) {
      expect(outcome.text).toBe('<h1>x &lt; y</h1>\n<h1>א &lt; ב &amp; ג &gt; ד</h1>');
    }
  });

  it('שבירת שורה רכה בתוך פסקה — <br>, לא \\n: השורה היא יחידת הכתובת', async () => {
    const outcome = await buildOtzariaBook(fakeHost([{ nodeId: 'a', text: 'שורה\nהמשך' }]), '');

    expect(outcome).toMatchObject({ ok: true, lineCount: 1, titleAdded: false });
    if (outcome.ok) expect(outcome.text).toBe('שורה<br>המשך');
  });

  it('`\\r\\n` אינו משאיר `\\r` תלוש בשורה', async () => {
    const outcome = await buildOtzariaBook(fakeHost([{ nodeId: 'a', text: 'שורה\r\nהמשך' }]), '');
    if (outcome.ok) expect(outcome.text).toBe('שורה<br>המשך');
  });

  it('פסקה שכולה שבירה רכה נשמטת — שורת <br> היא כתובת ריקה', async () => {
    const outcome = await buildOtzariaBook(
      fakeHost([
        { nodeId: 'a', text: 'ראשונה' },
        { nodeId: 'b', text: '\n' },
        { nodeId: 'c', text: ' \n ' },
        { nodeId: 'd', text: 'שנייה' },
      ]),
      '',
    );

    expect(outcome).toMatchObject({ ok: true, lineCount: 2 });
    if (outcome.ok) expect(outcome.text).toBe('ראשונה\nשנייה');
  });

  it('דפדוף: מסמך גדול מעמוד אחד (500 בלוקים) מכוסה כולו', async () => {
    const blocks = Array.from({ length: 502 }, (_, i) => ({ nodeId: `b${i}`, text: `פסקה ${i}` }));
    const outcome = await buildOtzariaBook(fakeHost(blocks), '');

    expect(outcome).toMatchObject({ ok: true, lineCount: 502 });
    if (outcome.ok) expect(outcome.text.split('\n')).toHaveLength(502);
  });

  it('מסמך ריק אינו ספר — הודעה ולא קובץ ריק', async () => {
    const outcome = await buildOtzariaBook(fakeHost([{ nodeId: 'a', text: '  ' }]), 'ספר');
    expect(outcome).toMatchObject({ ok: false, reason: 'empty' });
  });

  it('מסמך שגדול מתקרת הדפדוף — כשל, לא ספר קטוע', async () => {
    // 500×50 = 25,000 פסקאות; מעבר לזה הלולאה נעצרת, ובחיפוש זה „פחות
    // התאמות” אבל כאן זה קובץ שנקלט לספרייה וקישוריו ננעלים על שורותיו.
    const fullPage = Array.from({ length: 500 }, (_, i) => ({
      nodeId: `n${i}`,
      text: `פסקה ${i}`,
    }));
    const host = {
      activeEditor: { doc: { blocks: { list: () => ({ blocks: fullPage }) } } },
    } as OtzariaBookTarget;

    expect(await buildOtzariaBook(host, 'ספר')).toMatchObject({
      ok: false,
      reason: 'too-large',
    });
  });

  it('אין blocks.list — כשל סגור עם הסבר, לא ספר ריק', async () => {
    const outcome = await buildOtzariaBook({ activeEditor: { doc: {} } } as OtzariaBookTarget, 'ספר');
    expect(outcome).toMatchObject({ ok: false, reason: 'command-unsupported' });
  });

  it('קריאה שנכשלה באמצע — כשל גלוי, לא ספר קטוע', async () => {
    const outcome = await buildOtzariaBook(fakeHost([], { throwOnList: true }), 'ספר');
    expect(outcome).toMatchObject({ ok: false, reason: 'threw' });
  });
});

describe('otzariaBookFileName', () => {
  it('מנקה תווים אסורים ומצמיד txt — כמו documentFileName', () => {
    expect(otzariaBookFileName('חידושים: סימן א*')).toBe('חידושים סימן א.txt');
  });

  it('סיומת Word מתקלפת — לא „ספר.docx.txt”', () => {
    expect(otzariaBookFileName('ספר.docx')).toBe('ספר.txt');
    expect(otzariaBookFileName('ספר.docm')).toBe('ספר.txt');
  });

  it('שם ריק נופל לברירת מחדל', () => {
    expect(otzariaBookFileName('  ')).toBe('ספר.txt');
  });
});
