/**
 * קבוצת „תוכן עניינים” בלשונית „הפניות”, ומה שהמנוע **קיבל בפועל** ממנה.
 *
 * למה קובץ ייעודי: הסורק הגנרי ב-ribbon-tabs.test.ts לוחץ על כל כפתור ובודק
 * שמשהו קרה — הוא אינו יודע *מה* קרה. שני הפקדים המסוכנים כאן הם „עדכן
 * טבלה” ו„הסר”, ובשניהם „משהו קרה” אינו מספיק: עדכון במצב `pageNumbers`
 * במקום `all` נראה שם זהה לחלוטין, והסרה שאינה מנקה את שורות הטבלה מחזירה
 * „בוצע” ומשאירה את הטבלה על המסך. הסורק גם אינו נוגע בדיאלוגים בכלל.
 *
 * הדיאלוגים נבדקים דרך ה-DOM של ה-document ולא דרך ה-wrapper, מפני שהם
 * מרונדרים ב-Teleport לגוף הדף — כמו BookmarkDialog, ומאותו טעם.
 */
import { describe, expect, it } from 'vitest';
import { DOMWrapper } from '@vue/test-utils';
import ReferencesTab from '../../src/ui/ribbon/tabs/ReferencesTab.vue';
import { autoUnmount, createSuperdocDouble, mountUi, settle, tipMessage, type Harness } from './harness';

autoUnmount();

/** מסמך עם תוכן עניינים אחד בן שלוש שורות, וערך אחד שסומן ידנית. */
const withToc = () =>
  createSuperdocDouble({
    toc: {
      ids: ['toc-1'],
      rowsPerToc: 2,
      entries: [{ nodeId: 'entry-1', text: 'הקדמה', level: 2 }],
    },
    selection: { blockId: 'block-1', hasRange: true, text: 'הלכות שבת' },
  });

function button(harness: Harness, labelPrefix: string): DOMWrapper<Element> {
  const found = harness.wrapper
    .findAll('button')
    .find((node) => node.text().trim().startsWith(labelPrefix));
  if (!found) throw new Error(`לא נמצא הכפתור „${labelPrefix}” בלשונית`);
  return found;
}

/** אלמנט מתוך ה-Teleport, כ-wrapper שאפשר ללחוץ עליו. */
function teleported(selector: string): DOMWrapper<Element> {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`לא נמצא ${selector} בגוף הדף`);
  return new DOMWrapper(element);
}

function dialogButton(scope: string, label: string): DOMWrapper<Element> {
  const found = [...document.querySelectorAll(`${scope} button`)].find(
    (node) => node.textContent?.trim() === label,
  );
  if (!found) throw new Error(`לא נמצא הכפתור „${label}” ב-${scope}`);
  return new DOMWrapper(found);
}

describe('„עדכן טבלה”', () => {
  it('בונה את הטבלה מחדש במצב „הכול”, ולא רק את מספרי העמודים', async () => {
    const superdoc = withToc();
    const harness = mountUi(ReferencesTab, { superdoc });
    await settle();

    superdoc.reset();
    await button(harness, 'עדכן טבלה').trigger('click');
    await settle();

    expect(superdoc.inputs('toc.update')).toEqual([
      { target: { kind: 'block', nodeType: 'tableOfContents', nodeId: 'toc-1' }, mode: 'all' },
    ]);
    expect(harness.failures()).toEqual([]);
  });

  it('מסמך בלי טבלה — ה-tooltip אומר זאת, והלחיצה מדווחת ולא שותקת', async () => {
    const harness = mountUi(ReferencesTab);
    await settle();

    expect(tipMessage(button(harness, 'עדכן טבלה'))).toBe(
      'אין במסמך תוכן עניינים לעדכן',
    );

    await button(harness, 'עדכן טבלה').trigger('click');
    await settle();

    expect(harness.failures()).toEqual([
      {
        commandId: 'toc-update',
        outcome: {
          ok: false,
          message: 'עדכון תוכן העניינים נכשל: אין במסמך תוכן עניינים',
          reason: 'no-toc',
        },
      },
    ]);
  });
});

describe('„הסר”', () => {
  it('מוחק את הטבלה **ואת השורות שהמנוע משאיר**', async () => {
    const superdoc = withToc();
    const harness = mountUi(ReferencesTab, { superdoc });
    await settle();

    superdoc.reset();
    await button(harness, 'הסר').trigger('click');
    await settle();

    expect(superdoc.inputs('toc.remove')).toEqual([
      { target: { kind: 'block', nodeType: 'tableOfContents', nodeId: 'toc-1' } },
    ]);
    expect(superdoc.inputs('blocks.deleteRange')).toEqual([
      {
        start: { kind: 'block', nodeType: 'paragraph', nodeId: 'toc-1-row-0' },
        end: { kind: 'block', nodeType: 'paragraph', nodeId: 'toc-1-row-1' },
      },
    ]);
    expect(harness.failures()).toEqual([]);
  });

  it('שתי טבלאות — מסרב ואינו מנחש איזו למחוק', async () => {
    const superdoc = createSuperdocDouble({ toc: { ids: ['toc-1', 'toc-2'], rowsPerToc: 1 } });
    const harness = mountUi(ReferencesTab, { superdoc });
    await settle();

    superdoc.reset();
    await button(harness, 'הסר').trigger('click');
    await settle();

    expect(superdoc.ops()).not.toContain('toc.remove');
    expect(harness.failures()[0].outcome).toMatchObject({ reason: 'ambiguous-toc' });
  });
});

describe('„התאמה אישית”', () => {
  it('נפתח על ההגדרות שבמסמך', async () => {
    const harness = mountUi(ReferencesTab, { superdoc: withToc() });
    await settle();

    await button(harness, 'התאמה אישית').trigger('click');
    await settle();

    // הכפיל מדווח `hyperlinks: true` ואינו מדווח `\o` בכלל, ולכן הטווח הוא
    // ברירת המחדל של Word — 1-3 — והתיבה מסומנת.
    expect((teleported('#td-from').element as HTMLSelectElement).value).toBe('1');
    expect((teleported('#td-to').element as HTMLSelectElement).value).toBe('3');
    expect((teleported('.td-check input').element as HTMLInputElement).checked).toBe(true);
  });

  it('אישור שולח את הטווח ואת דגל הקישורים, ואז בונה את הטבלה מחדש', async () => {
    const superdoc = withToc();
    const harness = mountUi(ReferencesTab, { superdoc });
    await settle();

    await button(harness, 'התאמה אישית').trigger('click');
    await settle();

    await teleported('#td-to').setValue('5');
    await teleported('.td-check input').setValue(false);
    superdoc.reset();
    await dialogButton('.toc-dialog', 'אישור').trigger('click');
    await settle();

    expect(superdoc.inputs('toc.configure')).toEqual([
      {
        target: { kind: 'block', nodeType: 'tableOfContents', nodeId: 'toc-1' },
        patch: { outlineLevels: { from: 1, to: 5 }, hyperlinks: false },
      },
    ]);
    // בלי העדכון שאחריו הייתה נשארת על המסך טבלה שאינה תואמת את ההגדרות.
    expect(superdoc.ops()).toContain('toc.update');
    expect(harness.failures()).toEqual([]);
    expect(document.querySelector('.toc-dialog')).toBeNull();
  });

  it('טווח הפוך חוסם את „אישור” ומסביר', async () => {
    const superdoc = withToc();
    const harness = mountUi(ReferencesTab, { superdoc });
    await settle();

    await button(harness, 'התאמה אישית').trigger('click');
    await settle();

    await teleported('#td-from').setValue('7');
    await settle();

    expect(dialogButton('.toc-dialog', 'אישור').attributes('disabled')).toBeDefined();
    expect(document.querySelector('.td-error')).not.toBeNull();
    expect(superdoc.ops()).not.toContain('toc.configure');
    expect(harness.wrapper.exists()).toBe(true);
  });
});

describe('„סמן ערך”', () => {
  it('נפתח עם הטקסט שסומן בעורך, ומציג את הערכים שכבר סומנו', async () => {
    const harness = mountUi(ReferencesTab, { superdoc: withToc() });
    await settle();

    await button(harness, 'סמן ערך').trigger('click');
    await settle();

    expect((teleported('#te-text').element as HTMLInputElement).value).toBe('הלכות שבת');
    expect(document.querySelectorAll('.te-list-item')).toHaveLength(1);
    expect(harness.wrapper.exists()).toBe(true);
  });

  it('„סמן” מכניס שדה `TC` בפסקה שהסמן בה, ברמה שנבחרה', async () => {
    const superdoc = withToc();
    const harness = mountUi(ReferencesTab, { superdoc });
    await settle();

    await button(harness, 'סמן ערך').trigger('click');
    await settle();

    await teleported('#te-level').setValue('3');
    superdoc.reset();
    await dialogButton('.toc-entry-dialog', 'סמן').trigger('click');
    await settle();

    expect(superdoc.inputs('toc.markEntry')).toEqual([
      {
        target: {
          kind: 'inline-insert',
          anchor: { nodeType: 'paragraph', nodeId: 'block-1' },
          position: 'end',
        },
        text: 'הלכות שבת',
        level: 3,
      },
    ]);
    expect(harness.failures()).toEqual([]);
  });

  it('„בטל סימון” חל על הערך שנבחר ברשימה — זו הבדיקה שהסורק אינו יכול לעשות', async () => {
    const superdoc = createSuperdocDouble({
      toc: {
        ids: ['toc-1'],
        rowsPerToc: 1,
        entries: [
          { nodeId: 'entry-1', text: 'הקדמה', level: 1 },
          { nodeId: 'entry-2', text: 'סיכום', level: 2 },
        ],
      },
      selection: { blockId: 'block-1' },
    });
    const harness = mountUi(ReferencesTab, { superdoc });
    await settle();

    await button(harness, 'סמן ערך').trigger('click');
    await settle();

    await new DOMWrapper(document.querySelectorAll('.te-list-item')[1]).trigger('click');
    superdoc.reset();
    await dialogButton('.toc-entry-dialog', 'בטל סימון').trigger('click');
    await settle();

    expect(superdoc.inputs('toc.unmarkEntry')).toEqual([
      { target: { kind: 'inline', nodeType: 'tableOfContentsEntry', nodeId: 'entry-2' } },
    ]);
    expect(harness.failures()).toEqual([]);
  });

  it('„סמן” מנוטרל כשאין טקסט ערך', async () => {
    const harness = mountUi(ReferencesTab, {
      superdoc: createSuperdocDouble({ selection: { blockId: 'block-1', text: '' } }),
    });
    await settle();

    await button(harness, 'סמן ערך').trigger('click');
    await settle();

    expect(dialogButton('.toc-entry-dialog', 'סמן').attributes('disabled')).toBeDefined();
  });
});
