/**
 * כלי „עמודים ודפוס” של שולחן העורך: צמצום מסמך, סימון עמודים, סימני
 * חיתוך ופירוק מסמך — הלוגיקה הטהורה והכתיבות מול הכפיל.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  defaultDocReductionOptions,
  docReductionSummaryText,
  reduceDocument,
  reductionPercent,
  shrinkFont,
  shrinkLineSpace,
  shrinkMargin,
  shrinkParaSpace,
} from '../../src/engine/shulchan/doc-reduction';
import {
  comparePageMarks,
  comparisonSummaryText,
  loadPageMarks,
  savePageMarks,
  snapshotFromEdges,
  type SettingsStore,
} from '../../src/engine/shulchan/page-marking';
import {
  addCropMarks,
  applyCropMarksStyle,
  cropMarksCssVars,
  loadCropMarks,
  removeCropMarks,
} from '../../src/engine/shulchan/crop-marks';
import { buildStoredZip, documentXml } from '../../src/engine/shulchan/docx-builder';
import { notesDocumentParagraphs, splitFootnotesToDocument } from '../../src/engine/shulchan/split-notes';
import { documentKey } from '../../src/engine/shulchan/shulchan-doc';
import { fakeShulchanHost } from './shulchan-fake';

function memoryStore(): SettingsStore & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    load: async (key) => data.get(key) ?? null,
    save: async (key, value) => {
      data.set(key, value);
    },
  };
}

describe('shulchan/doc-reduction — הרצפות של המקור', () => {
  it('שוליים: מעל 1 ס"מ ⟵ ×0.9 ולא מתחת ל-1 ס"מ', () => {
    const cm = 28.35 / 72;
    expect(shrinkMargin(1)).toBeCloseTo(0.9);
    expect(shrinkMargin(cm * 1.05)).toBeCloseTo(cm);
    expect(shrinkMargin(cm)).toBeCloseTo(cm);
    expect(shrinkMargin(0.1)).toBeCloseTo(cm);
    expect(shrinkMargin(undefined)).toBeUndefined();
  });

  it('ריווח פסקה מעל 2 נקודות בלבד; מרווח שורות מעל 13.2 ⟵ ×0.9, בין 12 ל-13.2 ⟵ 12', () => {
    expect(shrinkParaSpace(10)).toBeCloseTo(9);
    expect(shrinkParaSpace(2)).toBe(2);
    expect(shrinkLineSpace(20)).toBeCloseTo(18);
    expect(shrinkLineSpace(13)).toBe(12);
    expect(shrinkLineSpace(12)).toBe(12);
  });

  it('גופן יורד נקודה ולא מתחת לסף', () => {
    expect(shrinkFont(14, 10)).toBe(14 - 1);
    expect(shrinkFont(10, 10)).toBeUndefined();
    expect(shrinkFont(10.5, 10)).toBe(10);
  });

  it('אחוז הצמצום המצטבר: 100 − 0.9^n·100', () => {
    expect(reductionPercent(1)).toBe(10);
    expect(reductionPercent(2)).toBe(19);
  });

  it('הלולאה: כל ערוץ לפי תדירותו, ספירה אחרי כל ערוץ, ועצירה ביעד', async () => {
    const { host, calls } = fakeShulchanHost({
      blocks: [{ blockId: 'p1', text: 'שלום עולם' }],
      spacing: { p1: { before: 10, after: 10, line: 20, lineRule: 'exact' } },
      sections: [{ address: 's1', margins: { top: 1, right: 1, bottom: 1, left: 1 }, columns: { count: 2, gap: 1 } }],
    });
    const pages = [5, 4, 3, 2, 2];
    const countPages = vi.fn(async () => pages.shift() ?? 2);
    const result = await reduceDocument(
      host,
      { ...defaultDocReductionOptions(), targetPages: 2, lineSpaceEvery: 1, fontEvery: 1 },
      { countPages },
    );
    expect(result.ok).toBe(true);
    expect(result.reachedTarget).toBe(true);
    expect(result.pagesBefore).toBe(5);
    expect(result.pagesAfter).toBe(2);
    expect(result.marginsRounds).toBe(1);
    expect(result.paraSpaceRounds).toBe(1);
    expect(result.lineSpaceRounds).toBe(1);
    expect(result.fontPoints).toBe(0);
    expect(calls.setPageMargins[0]).toMatchObject({ target: 's1', top: 0.9, left: 0.9 });
    expect(calls.setColumns[0]).toMatchObject({ target: 's1', gap: 0.9, equalWidth: true });
    expect(calls.setSpacing[0]).toMatchObject({ before: 180, after: 180, line: 400, lineRule: 'exact' });
    // הכפיל אינו מעדכן את המודל אחרי כתיבה, ולכן הריווח כאן הוא המקורי; במנוע האמיתי הוא נקרא מחדש לכל ערוץ.
    expect(calls.setSpacing[1]).toMatchObject({ before: 200, after: 200, line: 360, lineRule: 'exact' });
    expect(docReductionSummaryText(result)).toContain('צומצם ל-2 עמודים');
  });

  it('הגופן יורד נקודה בכל ריצה שמעל הסף, והערוץ נכבה כשאין מה להקטין', async () => {
    const { host, calls } = fakeShulchanHost({
      blocks: [{ blockId: 'p1', text: 'אב גד' }],
      runs: { p1: [{ text: 'אב ', resolved: { fontSize: 11, fontSizeCs: 11 } }, { text: 'גד', resolved: { fontSize: 10, fontSizeCs: 10 } }] },
    });
    const result = await reduceDocument(
      host,
      { targetPages: 1, marginsEvery: 0, paraSpaceEvery: 0, lineSpaceEvery: 0, fontEvery: 1, fontLimitPt: 10 },
      { countPages: (() => { const pages = [3, 1]; return async () => pages.shift() ?? 1; })() },
    );
    expect(result.ok).toBe(true);
    expect(result.reachedTarget).toBe(true);
    expect(result.fontPoints).toBe(1);
    expect(calls.inline).toEqual([{ blockId: 'p1', start: 0, end: 3, inline: { fontSize: 10, fontSizeCs: 10 } }]);
  });

  it('בלי ספירת עמודים — כשל סגור לפני כל כתיבה', async () => {
    const { host, calls } = fakeShulchanHost({ blocks: [{ blockId: 'p1', text: 'א' }] });
    const result = await reduceDocument(host, defaultDocReductionOptions(), { countPages: async () => null });
    expect(result.ok).toBe(false);
    expect(calls.setSpacing).toEqual([]);
  });
});

describe('shulchan/page-marking', () => {
  const edges = [
    { pageIndex: 0, head: 'בראשית  ברא', firstWord: 'בראשית', lastWord: 'הארץ' },
    { pageIndex: 1, head: 'והארץ היתה', firstWord: 'והארץ', lastWord: 'טוב' },
  ];

  it('תצלום נשמר ונטען לפי מפתח המסמך, והטקסט הפותח מנורמל', async () => {
    const store = memoryStore();
    await savePageMarks(store, snapshotFromEdges('k1', edges));
    const loaded = await loadPageMarks(store, 'k1');
    expect(loaded?.pages[0]?.head).toBe('בראשית ברא');
    expect(await loadPageMarks(store, 'other')).toBeNull();
  });

  it('בדיקה: עמוד שנפתח בטקסט אחר מדווח (החל מ-1), הראשון לעולם לא', () => {
    const snapshot = snapshotFromEdges('k1', edges);
    const now = [
      { pageIndex: 0, head: 'טקסט אחר לגמרי', firstWord: '', lastWord: '' },
      { pageIndex: 1, head: 'והארץ היתה', firstWord: '', lastWord: '' },
      { pageIndex: 2, head: 'עמוד חדש', firstWord: '', lastWord: '' },
    ];
    const comparison = comparePageMarks(snapshot, now);
    expect(comparison.changedPages).toEqual([3]);
    expect(comparisonSummaryText(comparison)).toContain('עמוד 3');
    expect(comparePageMarks(snapshot, edges).changedPages).toEqual([]);
  });

  it('מפתח המסמך יציב לאותם מזהי בלוקים ושונה למסמך אחר', () => {
    const a = documentKey([{ blockId: 'x' }, { blockId: 'y' }]);
    expect(documentKey([{ blockId: 'x' }, { blockId: 'y' }])).toBe(a);
    expect(documentKey([{ blockId: 'x' }])).not.toBe(a);
  });
});

describe('shulchan/crop-marks', () => {
  const inch = (mm: number): number => mm / 25.4;

  it('הוספה מגדילה דף, שוליים וכותרות ב-N מ"מ, רושמת ומדליקה; הסרה מחזירה בדיוק', async () => {
    const store = memoryStore();
    const section = {
      address: 's1',
      pageSetup: { width: 8, height: 11 },
      margins: { top: 1, right: 1, bottom: 1, left: 1 },
      headerFooterMargins: { header: 0.5, footer: 0.5 },
    };
    const { host, calls } = fakeShulchanHost({ blocks: [{ blockId: 'p1', text: 'א' }], sections: [section] });
    const doc = (host.activeEditor.doc as { sections: Record<string, unknown> }).sections;
    const hf: unknown[] = [];
    doc.setHeaderFooterMargins = (input: unknown) => {
      hf.push(input);
      return { success: true };
    };
    const root = document;

    const added = await addCropMarks(host, 10, store, root);
    expect(added).toMatchObject({ ok: true, sections: 1, mm: 10 });
    expect(calls.setPageSetup[0]).toMatchObject({ target: 's1' });
    expect((calls.setPageSetup[0] as { width: number }).width).toBeCloseTo(8 + 2 * inch(10));
    expect((calls.setPageMargins[0] as { top: number }).top).toBeCloseTo(1 + inch(10));
    expect((hf[0] as { header: number }).header).toBeCloseTo(0.5 + inch(10));
    expect(root.documentElement.dataset.cropMarks).toBe('10');
    expect(root.documentElement.style.getPropertyValue('--crop-m')).toBe(cropMarksCssVars(10)['--crop-m']);

    const twice = await addCropMarks(host, 10, store, root);
    expect(twice.ok).toBe(false);
    expect(twice.message).toContain('קיימים כבר');

    const removed = await removeCropMarks(host, store, root);
    expect(removed).toMatchObject({ ok: true, mm: 10 });
    expect((calls.setPageSetup[1] as { width: number }).width).toBeCloseTo(8 - 2 * inch(10));
    expect(root.documentElement.dataset.cropMarks).toBeUndefined();
    expect(await loadCropMarks(store, documentKey([{ blockId: 'p1' }]))).toBeNull();
  });

  it('הסרה מוצאת את הרשומה גם אחרי הוספה או מחיקה של פסקאות', async () => {
    const store = memoryStore();
    const section = {
      address: 's1',
      pageSetup: { width: 8, height: 11 },
      margins: { top: 1, right: 1, bottom: 1, left: 1 },
    };
    const { host, calls, blocks } = fakeShulchanHost({
      blocks: [{ blockId: 'p1', text: 'ראשונה' }, { blockId: 'p2', text: 'שנייה' }],
      sections: [section],
    });

    expect((await addCropMarks(host, 10, store, document)).ok).toBe(true);
    // Enter, מחיקת פסקה והדבקה כולם יכולים לשנות את רשימת הבלוקים — אבל
    // מזהי הפסקאות המקוריות נשארים, ולכן אסור לאבד את המידה שנשמרה להסרה.
    blocks.unshift({ blockId: 'new', text: 'פסקה שנוספה' });
    blocks.splice(2, 1);

    expect((await removeCropMarks(host, store, document)).ok).toBe(true);
    expect(calls.setPageSetup).toHaveLength(2);
    expect((calls.setPageSetup[1] as { width: number }).width).toBeCloseTo(8 - 2 * inch(10));
  });

  it('טווח המ"מ של המקור נאכף, וכיבוי מנקה את המשתנים', async () => {
    const { host } = fakeShulchanHost({ blocks: [{ blockId: 'p1', text: 'א' }], sections: [] });
    expect((await addCropMarks(host, 3, memoryStore(), document)).ok).toBe(false);
    applyCropMarksStyle(20, document);
    applyCropMarksStyle(null, document);
    expect(document.documentElement.style.getPropertyValue('--crop-len')).toBe('');
  });

  it('הגיאומטריה: b = m/5, len = m − b − b/1.4', () => {
    const vars = cropMarksCssVars(25.4);
    expect(vars['--crop-m']).toBe('96px');
    expect(vars['--crop-b']).toBe('19.2px');
    expect(vars['--crop-len']).toBe(`${Math.round((96 - 19.2 - 19.2 / 1.4) * 100) / 100}px`);
  });
});

describe('shulchan/split-notes', () => {
  it('המסמך השני נפתח לפני המחיקה; ההערות נמחקות מהאחרונה, והמספר נכתב בכתב עילי', async () => {
    const { host, calls, textOf } = fakeShulchanHost({
      blocks: [{ blockId: 'p1', text: 'אב גד' }],
      notes: { '1': { type: 'footnote', content: 'ראשונה' }, '2': { type: 'footnote', content: 'שנייה' } },
      refs: [
        { noteId: '1', blockId: 'p1', offset: 2 },
        { noteId: '2', blockId: 'p1', offset: 5 },
      ],
    });
    const doc = host.activeEditor.doc as { footnotes: Record<string, unknown> };
    doc.footnotes.list = () => ({
      items: [
        { noteId: '1', type: 'footnote', displayNumber: '1', content: 'ראשונה' },
        { noteId: '2', type: 'footnote', displayNumber: '2', content: 'שנייה' },
      ],
      total: 2,
    });
    const opened: Blob[] = [];
    const result = await splitFootnotesToDocument(host, async (blob) => {
      opened.push(blob);
      return true;
    });
    expect(result).toEqual({ ok: true, moved: 2 });
    expect(opened).toHaveLength(1);
    expect(calls.removedNotes).toEqual(['2', '1']);
    expect(textOf('p1')).toBe('אב1 גד2');
    expect(calls.inline).toEqual([
      { blockId: 'p1', start: 5, end: 6, inline: { vertAlign: 'superscript' } },
      { blockId: 'p1', start: 2, end: 3, inline: { vertAlign: 'superscript' } },
    ]);
  });

  it('כשהמסמך השני לא נפתח — המקור לא נוגע', async () => {
    const { host, calls } = fakeShulchanHost({
      blocks: [{ blockId: 'p1', text: 'אב' }],
      notes: { '1': { type: 'footnote', content: 'x' } },
      refs: [{ noteId: '1', blockId: 'p1', offset: 2 }],
    });
    (host.activeEditor.doc as { footnotes: Record<string, unknown> }).footnotes.list = () => ({
      items: [{ noteId: '1', type: 'footnote', displayNumber: '1', content: 'x' }],
      total: 1,
    });
    const result = await splitFootnotesToDocument(host, async () => false);
    expect(result.ok).toBe(false);
    expect(calls.removedNotes).toEqual([]);
    expect(calls.replace).toEqual([]);
  });

  it('מסמך ההערות: פסקה לכל הערה, מספר בכתב עילי, ו-ZIP תקין', () => {
    const xml = documentXml(notesDocumentParagraphs([{ number: '1', content: 'תוכן <א>' }]));
    expect(xml).toContain('<w:vertAlign w:val="superscript"/>');
    expect(xml).toContain('תוכן &lt;א&gt;');
    const zip = buildStoredZip([{ name: 'a.txt', data: new TextEncoder().encode('abc') }]);
    // חתימת כותרת מקומית, וחתימת סוף הספרייה המרכזית.
    expect(Array.from(zip.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(Array.from(zip.slice(zip.length - 22, zip.length - 18))).toEqual([0x50, 0x4b, 0x05, 0x06]);
  });
});
