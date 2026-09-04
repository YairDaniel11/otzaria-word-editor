/**
 * „לחזור לאן שהייתי”.
 *
 * המבחן המרכזי כאן הוא **שני העוגנים**: המזהה של הפסקה נוסה ראשון כי הוא זול,
 * והסדר שלה בסדר המסמך הוא הגיבוי — כי הוא זה ששורד סבב של ייצוא ופתיחה
 * מחדש, גם אם המזהים לא. הבדיקות מקבעות ששני המסלולים באמת עובדים, ושהיקר
 * שבהם אינו רץ כשאין בו צורך.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  applyCaretAnchor,
  applyDocumentStartCaret,
  hasTextCaret,
  readCaretAnchor,
  type CaretAnchor,
  type CaretDocSource,
  type CaretUiSource,
} from '../../src/engine/caret-anchor';

/** כפיל של `doc.blocks.list`, כולל דפדוף כמו שהמנוע רשאי לעשות. */
function docWithBlocks(ids: string[], pageSize = ids.length || 1) {
  const calls: Array<{ offset?: number; limit?: number }> = [];
  const doc: CaretDocSource = {
    activeEditor: {
      doc: {
        blocks: {
          list: (input) => {
            calls.push(input ?? {});
            const offset = input?.offset ?? 0;
            const slice = ids.slice(offset, offset + pageSize);
            return {
              total: ids.length,
              blocks: slice.map((nodeId, index) => ({ nodeId, ordinal: offset + index })),
            };
          },
        },
      },
    },
  };
  return { doc, calls };
}

function uiWithSelection(slice: unknown): CaretUiSource {
  return { selection: { getSnapshot: () => slice as never } };
}

const caretAt = (blockId: string, offset: number) => ({
  kind: 'selection',
  start: { kind: 'text', blockId, offset },
  end: { kind: 'text', blockId, offset },
});

describe('readCaretAnchor', () => {
  it('קורא סמן מכווץ, עם מקומו בסדר המסמך', async () => {
    const { doc } = docWithBlocks(['b1', 'b2', 'b3']);
    const ui = uiWithSelection({ selectionTarget: caretAt('b3', 7) });

    await expect(readCaretAnchor(ui, doc)).resolves.toEqual({
      start: { blockId: 'b3', ordinal: 2, offset: 7 },
      end: null,
    });
  });

  it('בחירת טווח נשמרת עם שני הקצוות', async () => {
    const { doc } = docWithBlocks(['b1', 'b2', 'b3']);
    const ui = uiWithSelection({
      selectionTarget: {
        kind: 'selection',
        start: { kind: 'text', blockId: 'b1', offset: 2 },
        end: { kind: 'text', blockId: 'b3', offset: 5 },
      },
    });

    await expect(readCaretAnchor(ui, doc)).resolves.toEqual({
      start: { blockId: 'b1', ordinal: 0, offset: 2 },
      end: { blockId: 'b3', ordinal: 2, offset: 5 },
    });
  });

  it('נופל ל-target כשהמנוע לא הקרין selectionTarget', async () => {
    // המנוע מתעד במפורש ש-`selectionTarget` עשוי להיות `null` „כשהריצה אינה
    // יכולה להקרין אותו באמת”, ואז `target` הוא מה שנשאר.
    const { doc } = docWithBlocks(['b1', 'b2']);
    const ui = uiWithSelection({
      selectionTarget: null,
      target: { kind: 'text', segments: [{ blockId: 'b2', range: { start: 4, end: 4 } }] },
    });

    await expect(readCaretAnchor(ui, doc)).resolves.toEqual({
      start: { blockId: 'b2', ordinal: 1, offset: 4 },
      end: null,
    });
  });

  it('בחירה שאינה בטקסט אינה נשמרת', async () => {
    // גבול של טבלה או תמונה אינו „מקום בטקסט” ואין לו היסט לשחזר. במצב כזה
    // אין עוגן, והמסמך ייפתח בתחילתו — כפי שהיה תמיד.
    const { doc } = docWithBlocks(['b1']);
    const ui = uiWithSelection({
      selectionTarget: {
        kind: 'selection',
        start: { kind: 'nodeEdge', node: { kind: 'block', nodeId: 't1' }, edge: 'before' },
        end: { kind: 'nodeEdge', node: { kind: 'block', nodeId: 't1' }, edge: 'after' },
      },
    });

    await expect(readCaretAnchor(ui, doc)).resolves.toBeNull();
  });

  it('גרסת מנוע בלי ה-handle אינה מפילה — היא פשוט אינה זוכרת', async () => {
    await expect(readCaretAnchor({}, {})).resolves.toBeNull();
    await expect(readCaretAnchor(null, null)).resolves.toBeNull();
  });

  it('פסקה בלי מזהה עדיין תופסת מקום בסדר', async () => {
    // דילוג עליה היה מזיז את כל מי שאחריה בעוגן אחד — כלומר שחזור לשורה
    // הלא נכונה, שקשה יותר להבחין בו מאשר אי-שחזור.
    const doc: CaretDocSource = {
      activeEditor: {
        doc: {
          blocks: {
            list: () => ({
              total: 3,
              blocks: [{ nodeId: 'b1' }, { ordinal: 1 }, { nodeId: 'b3' }],
            }),
          },
        },
      },
    };

    const anchor = await readCaretAnchor(uiWithSelection({ selectionTarget: caretAt('b3', 0) }), doc);
    expect(anchor?.start.ordinal).toBe(2);
  });

  it('דפדוף: פסקה בעמוד השני נמצאת', async () => {
    // המנוע רשאי להחזיר פחות מהמבוקש; לולאה שמתקדמת לפי הבקשה ולא לפי מה
    // שחזר הייתה מדלגת על כל מי שמעבר לעמוד הראשון.
    const { doc, calls } = docWithBlocks(['b1', 'b2', 'b3', 'b4'], 2);

    const anchor = await readCaretAnchor(uiWithSelection({ selectionTarget: caretAt('b4', 1) }), doc);

    expect(anchor?.start.ordinal).toBe(3);
    expect(calls.length).toBeGreaterThan(1);
  });

  it('סמן שלא עזב את הפסקה אינו סורק את המסמך מחדש', async () => {
    // המקרה הרווח ביותר: הקלדה. סריקה מלאה בכל הפוגה בשביל מספר שכבר ידוע
    // היא העבודה היחידה כאן שאפשר פשוט לא לעשות.
    const { doc, calls } = docWithBlocks(['b1', 'b2', 'b3']);
    const previous: CaretAnchor = { start: { blockId: 'b2', ordinal: 1, offset: 3 }, end: null };

    const anchor = await readCaretAnchor(
      uiWithSelection({ selectionTarget: caretAt('b2', 9) }),
      doc,
      previous,
    );

    expect(anchor).toEqual({ start: { blockId: 'b2', ordinal: 1, offset: 9 }, end: null });
    expect(calls, 'הסדר היה ידוע — אין מה לקרוא').toHaveLength(0);
  });

  it('סמן שעבר פסקה כן סורק', async () => {
    const { doc, calls } = docWithBlocks(['b1', 'b2', 'b3']);
    const previous: CaretAnchor = { start: { blockId: 'b2', ordinal: 1, offset: 3 }, end: null };

    const anchor = await readCaretAnchor(
      uiWithSelection({ selectionTarget: caretAt('b3', 0) }),
      doc,
      previous,
    );

    expect(anchor?.start.ordinal).toBe(2);
    expect(calls.length).toBeGreaterThan(0);
  });

  it('קריאה שזרקה אינה מפילה את מי שקרא', async () => {
    const ui: CaretUiSource = {
      selection: {
        getSnapshot: () => {
          throw new Error('המנוע התפרק');
        },
      },
    };
    await expect(readCaretAnchor(ui, {})).resolves.toBeNull();
  });
});

/** כפיל של `ui.selection.apply` שמקבל רק את המזהים שהוא מכיר. */
function uiThatAccepts(known: string[]) {
  const applied: Array<{ start: string; offset: number }> = [];
  const scrolled: string[] = [];
  const ui: CaretUiSource = {
    selection: {
      apply: (target) => {
        const start = target.start as { blockId?: string; offset?: number };
        if (!start.blockId || !known.includes(start.blockId)) return { ok: false };
        applied.push({ start: start.blockId, offset: start.offset ?? 0 });
        return { ok: true };
      },
    },
    viewport: {
      scrollIntoView: (input) => {
        scrolled.push(input.target.blockId);
        return { success: true };
      },
    },
  };
  return { ui, applied, scrolled };
}

describe('applyCaretAnchor', () => {
  const anchor: CaretAnchor = { start: { blockId: 'old-3', ordinal: 2, offset: 6 }, end: null };

  it('המזהה השמור נוסה ראשון, ובהצלחה אין קריאה לסדר הפסקאות', async () => {
    const { ui, applied, scrolled } = uiThatAccepts(['old-3']);
    const { doc, calls } = docWithBlocks(['x', 'y', 'z']);

    await expect(applyCaretAnchor(ui, doc, anchor)).resolves.toBe(true);
    expect(applied).toEqual([{ start: 'old-3', offset: 6 }]);
    expect(scrolled, 'גם התצוגה חוזרת, לא רק הסמן').toEqual(['old-3']);
    expect(calls, 'המסלול היקר לא רץ בכלל').toHaveLength(0);
  });

  it('מזהים שלא שרדו — הסדר מציל', async () => {
    // בדיוק המצב שהעוגן השני נכתב בשבילו: המסמך יוצא ונפתח מחדש, והמנוע
    // חילק מזהים חדשים.
    const { ui, applied } = uiThatAccepts(['new-1', 'new-2', 'new-3']);
    const { doc } = docWithBlocks(['new-1', 'new-2', 'new-3']);

    await expect(applyCaretAnchor(ui, doc, anchor)).resolves.toBe(true);
    expect(applied).toEqual([{ start: 'new-3', offset: 6 }]);
  });

  it('היסט שאינו קיים יותר נופל לתחילת אותה פסקה', async () => {
    // הקובץ נערך מבחוץ והפסקה התקצרה. „העמוד הנכון” הוא כמעט כל מה שהמשתמש
    // רצה, ובוודאי יותר מתחילת המסמך.
    const applied: number[] = [];
    const ui: CaretUiSource = {
      selection: {
        apply: (target) => {
          const offset = (target.start as { offset?: number }).offset ?? 0;
          if (offset !== 0) return { ok: false };
          applied.push(offset);
          return { ok: true };
        },
      },
    };

    await expect(applyCaretAnchor(ui, docWithBlocks(['a']).doc, anchor)).resolves.toBe(true);
    expect(applied).toEqual([0]);
  });

  it('לא נמצא — מדווח ולא זורק', async () => {
    const { ui } = uiThatAccepts([]);
    await expect(applyCaretAnchor(ui, docWithBlocks(['a']).doc, anchor)).resolves.toBe(false);
  });

  it('עוגן בלי סדר ובלי מזהה שנמצא — אין לאן ליפול', async () => {
    const { ui } = uiThatAccepts([]);
    const orphan: CaretAnchor = { start: { blockId: 'gone', ordinal: null, offset: 0 }, end: null };
    await expect(applyCaretAnchor(ui, docWithBlocks(['a']).doc, orphan)).resolves.toBe(false);
  });

  it('בלי עוגן, ובלי handle — לא קורה כלום', async () => {
    await expect(applyCaretAnchor(uiThatAccepts([]).ui, {}, null)).resolves.toBe(false);
    await expect(applyCaretAnchor({}, {}, anchor)).resolves.toBe(false);
  });

  it('גלילה שזרקה אינה הופכת שחזור מוצלח לכשל', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ui: CaretUiSource = {
      selection: { apply: () => ({ ok: true }) },
      viewport: {
        scrollIntoView: () => {
          throw new Error('אין גיאומטריה');
        },
      },
    };

    await expect(applyCaretAnchor(ui, {}, anchor)).resolves.toBe(true);
    warn.mockRestore();
  });
});

describe('hasTextCaret', () => {
  it('סמן בטקסט — יש', () => {
    expect(hasTextCaret(uiWithSelection({ selectionTarget: caretAt('b1', 3) }))).toBe(true);
  });

  it('נופל ל-target, כמו readCaretAnchor', () => {
    const ui = uiWithSelection({
      selectionTarget: null,
      target: { kind: 'text', segments: [{ blockId: 'b2', range: { start: 0, end: 0 } }] },
    });
    expect(hasTextCaret(ui)).toBe(true);
  });

  it('אין בחירה, בחירה שאינה בטקסט, או אין handle — אין', () => {
    expect(hasTextCaret(uiWithSelection(null))).toBe(false);
    expect(
      hasTextCaret(
        uiWithSelection({
          selectionTarget: {
            kind: 'selection',
            start: { kind: 'nodeEdge', node: { kind: 'block', nodeId: 't1' }, edge: 'before' },
            end: { kind: 'nodeEdge', node: { kind: 'block', nodeId: 't1' }, edge: 'after' },
          },
        }),
      ),
    ).toBe(false);
    expect(hasTextCaret({})).toBe(false);
    expect(hasTextCaret(null)).toBe(false);
  });

  it('קריאה שזרקה אינה מפילה', () => {
    const ui: CaretUiSource = {
      selection: {
        getSnapshot: () => {
          throw new Error('המנוע התפרק');
        },
      },
    };
    expect(hasTextCaret(ui)).toBe(false);
  });
});

describe('applyDocumentStartCaret', () => {
  it('סמן מכווץ בפסקה הראשונה, היסט 0', async () => {
    const { ui, applied } = uiThatAccepts(['b1']);
    const { doc } = docWithBlocks(['b1', 'b2']);

    await expect(applyDocumentStartCaret(ui, doc)).resolves.toBe(true);
    expect(applied).toEqual([{ start: 'b1', offset: 0 }]);
  });

  it('בלי גלילה — המסמך ממילא נפתח בתחילתו', async () => {
    const { ui, scrolled } = uiThatAccepts(['b1']);
    await applyDocumentStartCaret(ui, docWithBlocks(['b1']).doc);
    expect(scrolled).toEqual([]);
  });

  it('מסמך בלי פסקאות, או פסקה ראשונה בלי מזהה — אין סמן ואין זריקה', async () => {
    const { ui } = uiThatAccepts(['b1']);
    await expect(applyDocumentStartCaret(ui, docWithBlocks([]).doc)).resolves.toBe(false);

    const noId: CaretDocSource = {
      activeEditor: {
        doc: { blocks: { list: () => ({ total: 1, blocks: [{ ordinal: 0 }] }) } },
      },
    };
    await expect(applyDocumentStartCaret(ui, noId)).resolves.toBe(false);
  });

  it('המנוע דחה, או שאין handles — false, לא חריגה', async () => {
    await expect(
      applyDocumentStartCaret(uiThatAccepts([]).ui, docWithBlocks(['b1']).doc),
    ).resolves.toBe(false);
    await expect(applyDocumentStartCaret({}, docWithBlocks(['b1']).doc)).resolves.toBe(false);
    await expect(applyDocumentStartCaret(uiThatAccepts(['b1']).ui, {})).resolves.toBe(false);
  });
});
