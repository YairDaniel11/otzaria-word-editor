/**
 * מסלול הדיווח: מה המשתמש רואה כשפעולה נכשלת, ומה הוא רואה **לפני** שהוא לוחץ.
 *
 * זה היה קוד מת שלם: `command-adapter.ts` מחזיר תוצאה עם הודעה בעברית, וכל
 * 38 אתרי הקריאה ב-Ribbon עשו `void cmd.run()` וזרקו אותה — כלומר שלוש טבלאות
 * התרגום שם לא הגיעו למסך אף פעם, וכשל פקודה נראה למשתמש כמו כפתור שבור.
 * `tests/unit/use-command.test.ts` מודד את החוזה של `run()`; כאן נמדד מה שהוא
 * אינו יכול למדוד — שהפקד עצמו באמת עובר בו, בשני המסלולים (פקודה מנותבת
 * ו-Document API ישיר), ושפקד מנוטרל אינו קורא לאף אחד מהם.
 */
import { describe, expect, it } from 'vitest';
import HomeTab from '../../src/ui/ribbon/tabs/HomeTab.vue';
import InsertTab from '../../src/ui/ribbon/tabs/InsertTab.vue';
import LayoutTab from '../../src/ui/ribbon/tabs/LayoutTab.vue';
import ReferencesTab from '../../src/ui/ribbon/tabs/ReferencesTab.vue';
import {
  autoUnmount,
  buttonByTip,
  findButtonByTip,
  createCommandDouble,
  createSuperdocDouble,
  installSystemClipboard,
  mountUi,
  settle,
  tipMessage,
  tipOf,
  tipSelector,
} from './harness';

autoUnmount();

/** פותחת תפריט של `RibbonMenuButton` ובוחרת בפריט לפי התווית שלו. */
async function chooseFromMenu(
  harness: ReturnType<typeof mountUi>,
  buttonTitle: string,
  itemLabel: string,
): Promise<void> {
  await buttonByTip(harness.wrapper, buttonTitle).trigger('click');
  const item = harness.wrapper
    .findAll('[role="menuitem"]')
    .find((candidate) => candidate.text().includes(itemLabel));
  if (!item) throw new Error(`אין פריט „${itemLabel}” בתפריט „${buttonTitle}”`);
  await item.trigger('click');
  await settle();
}

describe('כשל של פקודה מנותבת', () => {
  it('מגיע למדווח עם ההודעה בעברית של האדפטר', async () => {
    const adapter = createCommandDouble({ failures: { bold: 'document-readonly' } });
    const harness = mountUi(HomeTab, { adapter });
    await settle();

    await buttonByTip(harness.wrapper, 'מודגש').trigger('click');
    await settle();

    expect(harness.failures()).toEqual([
      {
        commandId: 'bold',
        outcome: { ok: false, message: 'המסמך פתוח לקריאה בלבד', reason: 'document-readonly' },
      },
    ]);
  });

  it('הצלחה מדווחת גם היא — כדי שאפשר לנקות שגיאה קודמת מהמסך', async () => {
    const harness = mountUi(HomeTab);
    await settle();

    await buttonByTip(harness.wrapper, 'נטוי').trigger('click');
    await settle();

    expect(harness.reports).toEqual([{ commandId: 'italic', outcome: { ok: true } }]);
  });
});

describe('פקד מנוטרל', () => {
  it('אינו מגיע לאדפטר בכלל — לא כפקודה ולא כניסיון חסום', async () => {
    const adapter = createCommandDouble({ states: { bold: { enabled: false } } });
    const harness = mountUi(HomeTab, { adapter });
    await settle();

    const button = buttonByTip(harness.wrapper, 'מודגש');
    expect(button.attributes('disabled')).toBeDefined();

    await button.trigger('click');
    await settle();

    expect(adapter.calls).toEqual([]);
    expect(adapter.blocked).toEqual([]);
    expect(harness.reports).toEqual([]);
  });

  it('בלי מנוע כל פקדי העיצוב מנוטרלים, ואין הודעה שאיש לא ביקש', async () => {
    // המסלול השקט מכולם היה לחיצה לפני שהמסמך נטען. הכיבוי הוא מה שמונע אותו,
    // ולכן ההודעה „המנוע אינו מוכן” אינה אמורה להגיע למסך.
    const harness = mountUi(HomeTab, { adapter: null, superdoc: null });
    await settle();

    for (const title of ['מודגש', 'תבליטים', 'יישור לימין', 'נקה את כל העיצוב']) {
      expect(buttonByTip(harness.wrapper, title).attributes('disabled'), title).toBeDefined();
    }
    expect(harness.reports).toEqual([]);
  });

  it('פקד שהיכולת שלו חסרה מסביר **למה** הוא מנוטרל', async () => {
    const harness = mountUi(LayoutTab, {
      superdoc: createSuperdocDouble({ denied: ['sections.setColumns'] }),
    });
    await settle();

    const columns = harness.wrapper.find(tipSelector('הפעולה אינה זמינה בגרסה הזאת של המנוע'));
    expect(columns.exists(), 'ה-tooltip של הפקד המנוטרל הוא ההסבר').toBe(true);
    expect(columns.attributes('disabled')).toBeDefined();

    // ושאר הפקדים בקבוצה נשארו זמינים — הכיבוי אינו גורף.
    expect(
      harness.wrapper.find(tipSelector('הגדרת שולי הדף (רגיל, צר, רחב)')).attributes('disabled'),
    ).toBeUndefined();
  });

  it('בלי מסמך פתוח כל פקדי „פריסה” מנוטרלים עם „המסמך עדיין נטען”', async () => {
    const harness = mountUi(LayoutTab, { superdoc: null });
    await settle();

    const buttons = harness.wrapper.findAll('button');
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button.attributes('disabled'), tipMessage(button)).toBeDefined();
      expect(tipMessage(button)).toBe('המסמך עדיין נטען');
    }
  });
});

describe('החלפת מסמך', () => {
  it('היכולות נקראות מחדש, והפקד מתעדכן לפי המסמך החדש', async () => {
    // ה-`watch` על `ACTIVE_SUPERDOC` הוא מה שמחזיק את זה, ומונה הדורות שבו הוא
    // מה שמונע מתשובה של מסמך קודם לדרוס את התשובה של הנוכחי.
    const harness = mountUi(LayoutTab, {
      superdoc: createSuperdocDouble({ denied: ['sections.setPageMargins'] }),
    });
    await settle();

    const margins = () => harness.wrapper.findAll('button')[0];
    expect(margins().attributes('disabled'), 'מסמך שאינו מאפשר שוליים').toBeDefined();

    await harness.setSuperdoc(createSuperdocDouble());
    expect(margins().attributes('disabled'), 'מסמך שכן מאפשר').toBeUndefined();

    await harness.setSuperdoc(null);
    expect(margins().attributes('disabled'), 'ואחרי סגירת המסמך').toBeDefined();
    expect(tipMessage(margins())).toBe('המסמך עדיין נטען');
  });
});

describe('כשל של Document API', () => {
  it('קבלה שנכשלה מגיעה למדווח בעברית, עם הפעולה שנכשלה', async () => {
    const superdoc = createSuperdocDouble({
      failures: { 'sections.setPageMargins': { code: 'DOCUMENT_READONLY' } },
    });
    const harness = mountUi(LayoutTab, { superdoc });
    await settle();

    await chooseFromMenu(harness, 'הגדרת שולי הדף (רגיל, צר, רחב)', 'רגיל');

    expect(harness.failures()).toEqual([
      {
        commandId: 'page-margins',
        outcome: {
          ok: false,
          message: 'שינוי השוליים ל„רגיל” נכשל: המסמך פתוח לקריאה בלבד',
          reason: 'DOCUMENT_READONLY',
        },
      },
    ]);
  });

  it('NO_OP — „שוליים ← רגיל” על מסמך שכבר רגיל — אינו מגיע למדווח כשגיאה', async () => {
    // באג #9 בסקר הפקדים: NO_OP הוא מה שהמנוע מחזיר כשהערכים המבוקשים כבר
    // מוגדרים, וזו הצלחה מבחינת המשתמש (ראו הערת הפתיחה של page-setup.ts).
    // הבדיקה כאן על המסלול הישיר של ה-Document API — page-setup.ts כבר סינן
    // את זה קודם; מה שנמדד הוא שהמסקנה עדיין נכונה ולא נשברה בדרך למדווח.
    const superdoc = createSuperdocDouble({
      failures: { 'sections.setPageMargins': { code: 'NO_OP' } },
    });
    const harness = mountUi(LayoutTab, { superdoc });
    await settle();

    await chooseFromMenu(harness, 'הגדרת שולי הדף (רגיל, צר, רחב)', 'רגיל');

    expect(harness.failures()).toEqual([]);
    expect(harness.reports).toEqual([{ commandId: 'page-margins', outcome: { ok: true } }]);
  });

  it('בחירה מוצלחת מדווחת הצלחה ומגיעה למסלול הנכון', async () => {
    const superdoc = createSuperdocDouble();
    const harness = mountUi(LayoutTab, { superdoc });
    await settle();

    await chooseFromMenu(harness, 'כיוון הדף: לאורך או לרוחב', 'לרוחב');

    expect(superdoc.inputs('sections.setPageSetup')).toEqual([
      { target: { sectionIndex: 0 }, orientation: 'landscape' },
    ]);
    expect(harness.failures()).toEqual([]);
  });

  it('יכולת שמדווחת „זמין” ומסלול שאינו קיים — הכשל מוסבר ואינו שקט', async () => {
    // מפת ה-`operations` נבנית מקטלוג הפעולות, ולכן היא יכולה להכריז על פעולה
    // שהמימוש שלה אינו בפאסדה. זה בדיוק המצב שבו כפתור נראה עובד.
    const harness = mountUi(ReferencesTab, {
      superdoc: createSuperdocDouble({ missing: ['footnotes.insert'] }),
    });
    await settle();

    await buttonByTip(harness.wrapper, 'הוספת הערת שוליים בתחתית העמוד').trigger('click');
    await settle();

    expect(harness.failures()).toEqual([
      {
        commandId: 'footnotes-insert-footnote',
        outcome: {
          ok: false,
          message: 'הוספת הערת שוליים נכשלה: אינו זמין בגרסה זו',
          reason: 'command-unsupported',
        },
      },
    ]);
  });

  it('„התחל בעמוד חדש” בלי סמן במסמך מסביר מה לעשות', async () => {
    const harness = mountUi(InsertTab, {
      superdoc: createSuperdocDouble({ selection: { blockId: null } }),
    });
    await settle();

    await buttonByTip(harness.wrapper, 'הפסקה שבה הסמן תתחיל בראש עמוד חדש').trigger('click');
    await settle();

    expect(harness.failures()).toEqual([
      {
        commandId: 'page-break-before',
        outcome: {
          ok: false,
          message: 'יש למקם את הסמן במסמך',
          reason: 'selection-required',
        },
      },
    ]);
  });

  it('„התחל בעמוד חדש” הוא מתג: לחיצה שנייה על אותה פסקה מבטלת', async () => {
    // docs/button-audit.md, שורה ד': הכפתור לא היה מתג — לחיצה תמיד שלחה
    // `true`, ולא הייתה דרך לכבות מהרצועה. כאן נמדד שהלחיצה השנייה שולחת
    // `false` בפועל, ושהחיווי (aria-pressed, שורת ההסבר בטולטיפ) עוקב אחריה.
    const superdoc = createSuperdocDouble();
    const harness = mountUi(InsertTab, { superdoc });
    await settle();

    const button = () => findButtonByTip(harness.wrapper, 'הפסקה');
    expect(button()?.attributes('aria-pressed')).toBe('false');

    await button()!.trigger('click');
    await settle();

    expect(superdoc.inputs('format.paragraph.setFlowOptions')).toEqual([
      expect.objectContaining({ pageBreakBefore: true, target: expect.objectContaining({ nodeId: 'block-1' }) }),
    ]);
    expect(button()?.attributes('aria-pressed')).toBe('true');
    expect(button()?.attributes('data-tip-desc')).toContain('כבר מתחילה בעמוד חדש');
    expect(harness.failures()).toEqual([]);

    await button()!.trigger('click');
    await settle();

    expect(superdoc.inputs('format.paragraph.setFlowOptions')).toEqual([
      expect.objectContaining({ pageBreakBefore: true }),
      expect.objectContaining({ pageBreakBefore: false, target: expect.objectContaining({ nodeId: 'block-1' }) }),
    ]);
    expect(button()?.attributes('aria-pressed')).toBe('false');
    expect(button()?.attributes('data-tip-desc')).toContain('הפסקה שבה הסמן תתחיל בראש עמוד חדש');
    expect(harness.failures()).toEqual([]);
  });
});

describe('לוח', () => {
  it('„העתק” בלי טווח מסומן מסביר שצריך לסמן', async () => {
    const restore = installSystemClipboard();
    const harness = mountUi(HomeTab, {
      superdoc: createSuperdocDouble({ selection: { hasRange: false } }),
    });
    await settle();

    await buttonByTip(harness.wrapper, 'העתקת הבחירה ללוח').trigger('click');
    await settle();
    restore();

    expect(harness.failures()).toEqual([
      {
        commandId: 'clipboard-copy',
        outcome: {
          ok: false,
          message: 'ההעתקה נכשלה: יש לסמן טקסט תחילה',
          reason: 'range-selection-required',
        },
      },
    ]);
  });

  it('„גזור” מנוטרל כשהמנוע יודע להעתיק אך לא למחוק', async () => {
    // מנוע כזה משאיר „העתק” פעיל, ולכן זו אינה אותה שאלה.
    const harness = mountUi(HomeTab, {
      superdoc: createSuperdocDouble({ denied: ['delete'] }),
    });
    await settle();

    const buttons = harness.wrapper.findAll('button');
    const cut = buttons.find((button) => tipOf(button).shortcut === 'Ctrl+X');
    const copy = buttons.find((button) => tipOf(button).shortcut === 'Ctrl+C');

    expect(cut?.attributes('disabled')).toBeDefined();
    expect(copy?.attributes('disabled')).toBeUndefined();
  });

  it('„בחר הכל” עובר דרך גבולות המסמך, ולא מסמן את ממשק האפליקציה', async () => {
    // מה שהיה: `document.execCommand('selectAll')` על ה-DOM של התוסף — כלומר
    // הרצועה כולה נצבעה, והמסמך לא.
    const superdoc = createSuperdocDouble();
    const harness = mountUi(HomeTab, { superdoc });
    await settle();

    await buttonByTip(harness.wrapper, 'בחירת כל הטקסט במסמך').trigger('click');
    await settle();

    expect(superdoc.inputs('ranges.resolve')).toEqual([
      { start: { kind: 'document', edge: 'start' }, end: { kind: 'document', edge: 'end' } },
    ]);
    expect(superdoc.ops()).toContain('ui.selection.apply');
    expect(harness.failures()).toEqual([]);
  });
});
