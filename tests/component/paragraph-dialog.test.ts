/**
 * דיאלוג „פסקה”, וההגעה אליו מלשונית „בית”.
 *
 * למה קובץ ייעודי: הסורק הגנרי לוחץ על פותח הדיאלוג ומוודא שמשהו קרה, ולא
 * יודע להשוות את מה שנשלח למנוע. מה שנבדק כאן:
 * - מילוי מוקדם מהמסמך — הערכים ב**נקודות** מ-`doc.get` מוצגים בס"מ;
 * - „אישור” שולח **מצב מלא** לשלוש פעולות, ב-twips — היחידות שנמדדו;
 * - טאבים מיידיים: „הוסף” מגיע ל-`setTabStop` בלחיצה, ולא באישור;
 * - פקד טאבים נעלם כשהיכולת נדחית — ולא מוצג חסר תפקוד.
 *
 * הדיאלוג נבדק דרך ה-DOM של ה-document ולא דרך ה-wrapper, מפני שהוא מרונדר
 * ב-Teleport לגוף הדף — כמו BookmarkDialog, ומאותו טעם.
 */
import { describe, expect, it } from 'vitest';
import { DOMWrapper } from '@vue/test-utils';
import ParagraphDialog from '../../src/ui/panels/ParagraphDialog.vue';
import HomeTab from '../../src/ui/ribbon/tabs/HomeTab.vue';
import { autoUnmount, createSuperdocDouble, mountUi, settle, tipStartsSelector } from './harness';

autoUnmount();

function teleported(selector: string): DOMWrapper<Element> {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`לא נמצא ${selector} בגוף הדף`);
  return new DOMWrapper(element);
}

function footerButton(label: string): DOMWrapper<Element> {
  const buttons = [...document.querySelectorAll('.para-dialog .pd-footer .pd-btn')];
  const found = buttons.find((button) => button.textContent?.trim() === label);
  if (!found) throw new Error(`לא נמצא הכפתור „${label}” בדיאלוג`);
  return new DOMWrapper(found);
}

const PARAGRAPH_BUTTON = tipStartsSelector('תפריט פסקה');

const EMPTY_SNAPSHOT = {
  indentation: { leftTwips: 0, rightTwips: 0, firstLineTwips: 0, hangingTwips: 0 },
  spacing: { beforeTwips: 0, afterTwips: 0, lineTwips: 240, rule: 'auto' },
  keepNext: false,
  keepLines: false,
  widowControl: true,
  tabs: [],
};

describe('ParagraphDialog (בדיד)', () => {
  it('סגור אינו מרונדר בכלל', () => {
    mountUi(ParagraphDialog, {
      props: { isOpen: false, busy: false, tabsEnabled: true, snapshot: EMPTY_SNAPSHOT },
    });
    expect(document.querySelector('.para-dialog')).toBeNull();
  });

  it('פתיחה ממקדת את שורש הדיאלוג — בלעדיה Escape מפסיק לעבוד', async () => {
    const harness = mountUi(ParagraphDialog, {
      props: { isOpen: false, busy: false, tabsEnabled: true, snapshot: EMPTY_SNAPSHOT },
    });
    await harness.wrapper.setProps({ isOpen: true });
    await settle();

    expect(document.activeElement).toBe(document.querySelector('.para-dialog'));
  });

  it('Escape סוגר', async () => {
    const harness = mountUi(ParagraphDialog, {
      props: { isOpen: true, busy: false, tabsEnabled: true, snapshot: EMPTY_SNAPSHOT },
    });
    await settle();

    await teleported('.para-dialog').trigger('keydown.esc');
    expect(harness.wrapper.emitted('close')).toHaveLength(1);
  });

  it('busy מנטרל „אישור” ומשאיר „ביטול” חי', () => {
    mountUi(ParagraphDialog, {
      props: { isOpen: true, busy: true, tabsEnabled: true, snapshot: EMPTY_SNAPSHOT },
    });

    expect(footerButton('אישור').attributes('disabled')).toBeDefined();
    expect(footerButton('ביטול').attributes('disabled')).toBeUndefined();
  });

  it('ערך שלילי חוסם את „אישור” עם הסבר', async () => {
    const harness = mountUi(ParagraphDialog, {
      props: { isOpen: true, busy: false, tabsEnabled: true, snapshot: EMPTY_SNAPSHOT },
    });
    await settle();

    await teleported('#pd-ind-left').setValue('-5');
    await settle();

    expect(teleported('.pd-error').text()).toContain('לא-שליליים');
    expect(footerButton('אישור').attributes('disabled')).toBeDefined();
    expect(harness.wrapper.emitted('submit')).toBeUndefined();
  });
});

describe('„תפריט פסקה” בלשונית „בית”', () => {
  it('הלחיצה קוראת את מצב הפסקה (`get`) ופותחת את הדיאלוג', async () => {
    const harness = mountUi(HomeTab, { superdoc: createSuperdocDouble() });
    await settle();

    await harness.wrapper.find(PARAGRAPH_BUTTON).trigger('click');
    await settle();

    expect(harness.superdoc.ops()).toContain('get');
    expect(document.querySelector('.para-dialog')).not.toBeNull();
  });

  it('המילוי המוקדם בס"מ — 36 נקודות (720 twips) מוצגות כ-1.27', async () => {
    const superdoc = createSuperdocDouble({
      paragraphProps: { indentation: { left: 36 }, keepWithNext: true },
    });
    const harness = mountUi(HomeTab, { superdoc });
    await settle();

    await harness.wrapper.find(PARAGRAPH_BUTTON).trigger('click');
    await settle();

    const left = teleported('#pd-ind-left').element as HTMLInputElement;
    expect(left.value).toBe('1.27');
  });

  it('„אישור” שולח מצב מלא לשלוש הפעולות, ב-twips', async () => {
    const harness = mountUi(HomeTab, { superdoc: createSuperdocDouble() });
    await settle();
    await harness.wrapper.find(PARAGRAPH_BUTTON).trigger('click');
    await settle();

    // כניסה שמאלית 1 ס"מ = 567 twips; ריווח לפני 12 נק' = 240.
    await teleported('#pd-ind-left').setValue('1');
    await teleported('#pd-sp-before').setValue('12');
    await settle();
    await footerButton('אישור').trigger('click');
    await settle();

    const inputs = (op: string) => harness.superdoc.inputs(op) as Record<string, unknown>[];
    expect(inputs('format.paragraph.setIndentation')).toHaveLength(1);
    expect(inputs('format.paragraph.setIndentation')[0]).toMatchObject({ left: 567, right: 0 });
    expect(inputs('format.paragraph.setSpacing')[0]).toMatchObject({ before: 240, after: 0 });
    expect(inputs('format.paragraph.setKeepOptions')).toHaveLength(1);
    expect(inputs('format.paragraph.setKeepOptions')[0]).toMatchObject({ widowControl: true });
  });

  it('הוספת טאב מיידית — 2 ס"מ מגיעים ל-`setTabStop` בלחיצה, ולא באישור', async () => {
    const harness = mountUi(HomeTab, { superdoc: createSuperdocDouble() });
    await settle();
    await harness.wrapper.find(PARAGRAPH_BUTTON).trigger('click');
    await settle();

    const position = document.querySelector('.para-dialog input[placeholder="מיקום"]') as HTMLInputElement;
    await new DOMWrapper(position).setValue('2');
    await settle();

    const addButtons = [...document.querySelectorAll('.para-dialog .pd-btn')].filter(
      (button) => button.textContent?.trim() === 'הוסף',
    );
    await new DOMWrapper(addButtons[0]!).trigger('click');
    await settle();

    const inputs = harness.superdoc.inputs('format.paragraph.setTabStop') as Record<string, unknown>[];
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({ position: 1134, alignment: 'left' });
  });

  it('יכולת טאבים שנדחית — סעיף הטאבים אינו מוצג כלל', async () => {
    const superdoc = createSuperdocDouble({ denied: ['format.paragraph.setTabStop'] });
    const harness = mountUi(HomeTab, { superdoc });
    await settle();
    await harness.wrapper.find(PARAGRAPH_BUTTON).trigger('click');
    await settle();

    expect(document.querySelector('.para-dialog')).not.toBeNull();
    for (const fieldset of document.querySelectorAll('.para-dialog fieldset')) {
      expect(fieldset.textContent).not.toContain('עצירות טאב');
    }
  });
});
