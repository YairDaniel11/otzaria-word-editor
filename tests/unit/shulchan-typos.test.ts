/**
 * „שגיאות מצויות” — הכללים הטהורים (תרגום ה-wildcards של המקור) והריצה מול
 * הכפיל: מה נשלח ל-`doc.replace`, מה נמחק ב-`blocks.delete`, ומה הטקסט הסופי.
 */
import { describe, expect, it } from 'vitest';
import {
  applyEditsToText,
  copyFixEdits,
  copyFixSummaryText,
  defaultTyposOptions,
  orderedEdits,
  ruleEdits,
  runCopyFix,
  runTypos,
  typosSummaryText,
  type TyposOptions,
} from '../../src/engine/shulchan/typos';
import { fakeShulchanHost } from './shulchan-fake';

function applyRule(rule: keyof TyposOptions, text: string): string {
  return applyEditsToText(text, ruleEdits(rule, text));
}

describe('shulchan/typos — הכללים הטהורים', () => {
  it('רווחים כפולים מתמזגים לאחד', () => {
    expect(applyRule('extraSpaces', 'שלום  עולם   טוב')).toBe('שלום עולם טוב');
  });

  it('רווח לפני פיסוק עובר אל אחריו, בלי לייצר רווח כפול', () => {
    expect(applyRule('spaceBeforePunctuation', 'שלום , עולם')).toBe('שלום, עולם');
    expect(applyRule('spaceBeforePunctuation', 'שלום ,עולם')).toBe('שלום, עולם');
    expect(applyRule('spaceBeforePunctuation', 'שלום .')).toBe('שלום.');
  });

  it('סימני פיסוק כפולים מצטמצמים לאחרון, ושתי נקודות בדיוק — לאחת', () => {
    expect(applyRule('doublePunctuation', 'מה?? כן!!')).toBe('מה? כן!');
    expect(applyRule('doublePunctuation', 'סוף.. התחלה')).toBe('סוף. התחלה');
    // שלוש נקודות — אליפסה לגיטימית, הכלל של „בדיוק שתיים” אינו נוגע בה.
    expect(applyRule('doublePunctuation', 'המשך... כן')).toBe('המשך... כן');
  });

  it('ארבע נקודות ומעלה מתקצרות לשלוש', () => {
    expect(applyRule('manyDots', 'רגע.... עוד.......')).toBe('רגע... עוד...');
  });

  it('רווחים בצד הפנימי של סוגריים מתוקנים לשני הכיוונים', () => {
    expect(applyRule('bracketSpaces', 'שלום ( עולם ) טוב')).toBe('שלום (עולם) טוב');
    expect(applyRule('bracketSpaces', 'שלום( עולם )טוב')).toBe('שלום (עולם) טוב');
  });

  /* רווח יחיד בין פותח לסוגר נוגע בשניהם. שתי סריקות נפרדות היו תופסות אותו
     פעמיים ומייצרות עריכות חופפות, וההחלה של השנייה הייתה **מוחקת את
     הסוגר** — `"א ( ) ב"` יצא `"א ( ב"`. אלה גם שתי קריאות `doc.replace`,
     כלומר התו נמחק מהמסמך עצמו ולא רק מהעותק המקומי. */
  it('סוגריים שאין ביניהם אלא רווח — הרווח נמחק, שני התווים נשארים', () => {
    expect(applyRule('bracketSpaces', 'א ( ) ב')).toBe('א () ב');
    expect(applyRule('bracketSpaces', 'א [ ] ב')).toBe('א [] ב');
    expect(applyRule('bracketSpaces', '( )')).toBe('()');
    // ובלי רווחים בחוץ — הרווח שנמחק מבפנים חוזר משני הצדדים.
    expect(applyRule('bracketSpaces', 'א( )ב')).toBe('א () ב');
  });

  it('אף כלל אינו מייצר עריכות חופפות', () => {
    const samples = [
      'א ( ) ב',
      'א [ ] ב',
      'א(  )ב',
      'שלום  ,  עולם ..',
      'א ( ב ) [ ג ] ד',
      '  ( )  ',
    ];
    for (const rule of Object.keys(defaultTyposOptions()) as (keyof TyposOptions)[]) {
      for (const text of samples) {
        const edits = ruleEdits(rule, text);
        // `orderedEdits` היא הרשת האחרונה; כאן נבדק שאין לה מה לתפוס.
        expect(orderedEdits(edits), `${rule}: ${text}`).toHaveLength(edits.length);
      }
    }
  });

  it('רווחי קצה פסקה נמחקים', () => {
    expect(applyRule('paragraphEdgeSpaces', '  שלום עולם ')).toBe('שלום עולם');
    expect(applyRule('paragraphEdgeSpaces', '   ')).toBe('');
  });

  it('זוג גרשים בודדים הופך לגרשיים — גם מסולסלים וגם בתערובת', () => {
    expect(applyRule('doubleApostrophes', "רש''י")).toBe('רש"י');
    expect(applyRule('doubleApostrophes', 'רש’’י')).toBe('רש"י');
    expect(applyRule('doubleApostrophes', "רש'’י")).toBe('רש"י');
    // גרש בודד — ראשי תיבות תקינים, לא נוגעים.
    expect(applyRule('doubleApostrophes', "ר' עקיבא")).toBe("ר' עקיבא");
  });

  it('אות אנגלית של Shift אחרי גרשיים מוחלפת לעברית הנכונה', () => {
    expect(applyRule('shiftedHebrewAfterQuote', 'אמר "Tבא')).toBe('אמר "אבא');
    expect(applyRule('shiftedHebrewAfterQuote', '"A"')).toBe('"ש"');
    expect(applyRule('shiftedHebrewAfterQuote', '"Q')).toBe('"Q'); // אין מיפוי — נשאר
  });

  it('גרשיים חכמים — מסולסלים ותחתונים — נתפסים גם הם, והגרשיים נשמרים כמו שהם', () => {
    expect(applyRule('shiftedHebrewAfterQuote', 'אמר “Tבא”')).toBe('אמר “אבא”');
    expect(applyRule('shiftedHebrewAfterQuote', '”Aלום')).toBe('”שלום');
    expect(applyRule('shiftedHebrewAfterQuote', '„Rבי')).toBe('„רבי');
  });
});

describe('shulchan/typos — תיקון העתקה מתוכנות', () => {
  const NBSP = String.fromCharCode(0xa0);

  it('רווח קשיח הופך לרווח רגיל', () => {
    expect(applyEditsToText(`שלום${NBSP}עולם${NBSP}${NBSP}טוב`, copyFixEdits(`שלום${NBSP}עולם${NBSP}${NBSP}טוב`))).toBe(
      'שלום עולם  טוב',
    );
  });

  it('רווח קשיח מיד אחרי מעבר שורה ידני נשאר — הוא מחזיק את השורה הריקה', () => {
    const text = `שורה\n${NBSP}\nעוד${NBSP}מילה`;
    expect(applyEditsToText(text, copyFixEdits(text))).toBe(`שורה\n${NBSP}\nעוד מילה`);
    // גם VT — הייצוג של Word ל-^l.
    const vt = `שורה${String.fromCharCode(0x0b)}${NBSP}סוף`;
    expect(copyFixEdits(vt)).toEqual([]);
  });

  it('רץ על הפסקאות שבבחירה בלבד ומדווח מניין', async () => {
    const { host, textOf } = fakeShulchanHost({
      blocks: [
        { blockId: 'p1', text: `א${NBSP}ב` },
        { blockId: 'p2', text: `ג${NBSP}ד` },
      ],
      selected: ['p2'],
    });
    const result = await runCopyFix(host);
    expect(result).toMatchObject({ ok: true, fixes: 1 });
    expect(textOf('p1')).toBe(`א${NBSP}ב`);
    expect(textOf('p2')).toBe('ג ד');
    expect(copyFixSummaryText(result)).toBe('הוחלף רווח קשיח אחד');
  });

  it('בלי בחירה — כשל סגור', async () => {
    const { host } = fakeShulchanHost({ blocks: [{ blockId: 'p1', text: `א${NBSP}ב` }], selected: [] });
    const result = await runCopyFix(host);
    expect(result.ok).toBe(false);
  });
});

describe('shulchan/typos — ריצה מול המסמך', () => {
  it('מחיל את הכללים שנבחרו ומדווח מניין תיקונים', async () => {
    const { host, textOf } = fakeShulchanHost({
      blocks: [{ blockId: 'p1', text: 'שלום  עולם , טוב' }],
    });
    const options = { ...defaultTyposOptions(), shiftedHebrewAfterQuote: false };
    const result = await runTypos(host, options);

    expect(result.ok).toBe(true);
    expect(result.fixes).toBe(2);
    expect(textOf('p1')).toBe('שלום עולם, טוב');
  });

  it('מוחק פסקאות ריקות אבל משאיר בלוק אחרון במסמך', async () => {
    const { host, calls } = fakeShulchanHost({
      blocks: [
        { blockId: 'p1', text: 'טקסט' },
        { blockId: 'p2', text: '' },
        { blockId: 'p3', text: '' },
      ],
    });
    const options: TyposOptions = { ...defaultTyposOptions(), emptyParagraphs: true };
    const result = await runTypos(host, options);

    expect(result.ok).toBe(true);
    expect(result.removedParagraphs).toBe(2);
    expect(calls.deletedBlocks).toEqual(['p2', 'p3']);
  });

  it('מסמך שכולו פסקאות ריקות אינו מתרוקן לגמרי', async () => {
    const { host, calls } = fakeShulchanHost({
      blocks: [
        { blockId: 'p1', text: '' },
        { blockId: 'p2', text: '' },
      ],
    });
    const options: TyposOptions = { ...defaultTyposOptions(), emptyParagraphs: true };
    const result = await runTypos(host, options);

    expect(result.ok).toBe(true);
    expect(result.removedParagraphs).toBe(1);
    expect(calls.deletedBlocks).toEqual(['p1']);
  });

  it('בלי מסמך — כשל סגור עם הודעה', async () => {
    const result = await runTypos(null, defaultTyposOptions());
    expect(result.ok).toBe(false);
    expect(result.message).toBeTruthy();
  });

  it('נוסח הסיכום, ביחיד וברבים', () => {
    expect(typosSummaryText({ ok: true, fixes: 0, removedParagraphs: 0 })).toBe('לא נמצאו שגיאות לתיקון');
    expect(typosSummaryText({ ok: true, fixes: 3, removedParagraphs: 2 })).toBe(
      'בוצעו 3 תיקונים, נמחקו 2 פסקאות ריקות',
    );
    // „בוצעו 1 תיקונים” אינו עברית, וזה המקרה השכיח: תיקון בודד.
    expect(typosSummaryText({ ok: true, fixes: 1, removedParagraphs: 1 })).toBe(
      'בוצע תיקון אחד, נמחקה פסקה ריקה אחת',
    );
  });
});
