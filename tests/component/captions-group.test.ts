/**
 * קבוצת „כיתובים” בלשונית „הפניות”.
 *
 * `tests/component/ribbon-tabs.test.ts` כבר מוודא שאין כאן כפתור מת. מה
 * שנמדד כאן הוא מה שהוא אינו יכול לשאול: **מה** נשלח למסמך. שתי הטענות
 * המרכזיות — התווית העברית שנשלחת כמות שהיא, ועריכה שהיא `remove`+`insert`
 * ולא `captions.update` — הן ההכרעות שנמדדו בדפדפן, וההנמקה שלהן
 * ב-engine/captions.ts.
 */
import { describe, expect, it } from 'vitest';
import { autoUnmount, createSuperdocDouble, mountUi, settle, tipMessage } from './harness';

import ReferencesTab from '../../src/ui/ribbon/tabs/ReferencesTab.vue';
import CaptionDialog from '../../src/ui/panels/CaptionDialog.vue';

autoUnmount();

/** כפתור לפי התווית שעליו — זה מה שהמשתמש רואה. */
function button(harness: ReturnType<typeof mountUi>, label: string) {
  const found = harness.wrapper.findAll('button').find((item) => item.text().trim() === label);
  if (!found) throw new Error(`לא נמצא כפתור „${label}”`);
  return found;
}

const TWO = [
  { nodeId: 'cap-1', label: 'איור', text: 'ראשון' },
  { nodeId: 'cap-2', label: 'איור', text: 'שני' },
];

describe('הרצועה', () => {
  it('„הוסף כיתוב” שולח את התווית העברית, ואת הפסקה שבסמן כעוגן', async () => {
    const superdoc = createSuperdocDouble();
    const harness = mountUi(ReferencesTab, { superdoc });
    await settle();

    await button(harness, 'הוסף כיתוב').trigger('click');
    await settle();

    const dialog = harness.wrapper.findComponent(CaptionDialog);
    dialog.vm.$emit('insert', { label: 'טבלה', text: 'סדר הדורות', position: 'below' });
    await settle();

    expect(superdoc.inputs('captions.insert')).toEqual([
      {
        adjacentTo: { kind: 'block', nodeType: 'paragraph', nodeId: 'block-1' },
        position: 'below',
        label: 'טבלה',
        text: 'סדר הדורות',
      },
    ]);
    expect(harness.reports[harness.reports.length - 1]?.outcome.ok).toBe(true);
  });

  it('„ערוך” מסיר ומוסיף מחדש באותו מקום, ואינו נוגע ב-`captions.update`', async () => {
    const superdoc = createSuperdocDouble({ captions: { items: TWO } });
    const harness = mountUi(ReferencesTab, { superdoc });
    await settle();

    await button(harness, 'הוסף כיתוב').trigger('click');
    await settle();

    const dialog = harness.wrapper.findComponent(CaptionDialog);
    dialog.vm.$emit('update', {
      id: 'cap-2',
      draft: { label: 'איור', text: 'שני מתוקן', position: 'below' },
    });
    await settle();

    expect(superdoc.ops()).not.toContain('captions.update');
    expect(superdoc.inputs('captions.remove')).toEqual([
      { target: { kind: 'block', nodeType: 'paragraph', nodeId: 'cap-2' } },
    ]);
    // העוגן הוא הכיתוב שלפניו — כלומר הכיתוב חוזר למקום השני, לא לסופו.
    expect(superdoc.inputs('captions.insert')).toEqual([
      {
        adjacentTo: { kind: 'block', nodeType: 'paragraph', nodeId: 'cap-1' },
        position: 'below',
        label: 'איור',
        text: 'שני מתוקן',
      },
    ]);
  });

  it('כיתוב שמתחת לטבלה נערך, וחוזר בדיוק בין הטבלה לפסקה שאחריה', async () => {
    // הצורה שנמדדה בדפדפן: `פסקה │ tbl │ כיתוב │ פסקה`. העוגן הטבעי הוא
    // הטבלה, ו-`captions.insert` דוחה אותה — ולכן העוגן הוא הפסקה שאחרי
    // הכיתוב עם „מעל”, שהוא אותו רווח בדיוק. נמדד גם שהמספור נשמר.
    const superdoc = createSuperdocDouble({
      captions: {
        items: [
          { nodeId: 'cap-1', label: 'טבלה', text: 'סדר הדורות', tableBefore: true },
          { nodeId: 'cap-2', label: 'טבלה', text: 'ייחוסי תנאים' },
        ],
      },
    });
    const harness = mountUi(ReferencesTab, { superdoc });
    await settle();

    await button(harness, 'הוסף כיתוב').trigger('click');
    await settle();

    harness.wrapper.findComponent(CaptionDialog).vm.$emit('update', {
      id: 'cap-1',
      draft: { label: 'טבלה', text: 'סדר הדורות המתוקן', position: 'below' },
    });
    await settle(30);

    expect(superdoc.inputs('captions.insert')).toEqual([
      {
        adjacentTo: { kind: 'block', nodeType: 'paragraph', nodeId: 'cap-2' },
        position: 'above',
        label: 'טבלה',
        text: 'סדר הדורות המתוקן',
      },
    ]);
    expect(harness.reports[harness.reports.length - 1]?.outcome.ok).toBe(true);

    // המיקום נשמר: הכיתוב המתוקן עדיין הראשון, ולכן גם המספור לא זז.
    const shown = [...document.querySelectorAll('.cp-list-text')].map((item) => item.textContent);
    expect(shown).toEqual(['טבלה 1: סדר הדורות המתוקן', 'טבלה 2: ייחוסי תנאים']);
  });

  it('כיתוב שטבלה משני צדדיו — העריכה מסרבת, והכיתוב נשאר במסמך', async () => {
    const superdoc = createSuperdocDouble({
      captions: {
        items: [
          {
            nodeId: 'cap-1',
            label: 'טבלה',
            text: 'סדר הדורות',
            tableBefore: true,
            tableAfter: true,
          },
        ],
      },
    });
    const harness = mountUi(ReferencesTab, { superdoc });
    await settle();

    await button(harness, 'הוסף כיתוב').trigger('click');
    await settle();

    harness.wrapper.findComponent(CaptionDialog).vm.$emit('update', {
      id: 'cap-1',
      draft: { label: 'טבלה', text: 'סדר הדורות המתוקן', position: 'below' },
    });
    await settle(30);

    expect(superdoc.ops()).not.toContain('captions.remove');
    const last = harness.reports[harness.reports.length - 1]?.outcome;
    expect(last?.ok).toBe(false);
    expect(last?.ok === false && last.message).toContain('אינו פסקה');

    const shown = [...document.querySelectorAll('.cp-list-text')].map((item) => item.textContent);
    expect(shown).toEqual(['טבלה 1: סדר הדורות']);
  });

  it('אחרי העריכה הרשימה שבדיאלוג מציגה את הטקסט החדש, ולא כפול', async () => {
    const superdoc = createSuperdocDouble({ captions: { items: TWO } });
    const harness = mountUi(ReferencesTab, { superdoc });
    await settle();

    await button(harness, 'הוסף כיתוב').trigger('click');
    await settle();

    const dialog = harness.wrapper.findComponent(CaptionDialog);
    dialog.vm.$emit('update', {
      id: 'cap-2',
      draft: { label: 'איור', text: 'שני מתוקן', position: 'below' },
    });
    await settle();

    // סבבים נוספים ולא ברירת המחדל: שרשרת העריכה ארוכה — שאיבת עמודים,
    // סדר בלוקים, הסרה, הוספה, סיבוב, וקריאה מחדש — ושישה סבבים אינם
    // מגיעים לקצה שלה.
    await settle(30);

    const shown = [...document.querySelectorAll('.cp-list-text')].map((item) => item.textContent);
    expect(shown).toEqual(['איור 1: ראשון', 'איור 2: שני מתוקן']);
  });

  it('„הסר” מוריד את הכיתוב, והמספור שאחריו יורד', async () => {
    const superdoc = createSuperdocDouble({ captions: { items: TWO } });
    const harness = mountUi(ReferencesTab, { superdoc });
    await settle();

    await button(harness, 'הוסף כיתוב').trigger('click');
    await settle();

    harness.wrapper.findComponent(CaptionDialog).vm.$emit('remove', 'cap-1');
    await settle(30);

    const shown = [...document.querySelectorAll('.cp-list-text')].map((item) => item.textContent);
    expect(shown).toEqual(['איור 1: שני']);
  });

  it('פקד שהיכולת שלו חסרה מוצג מנוטרל עם ההסבר, ולא נעלם', async () => {
    const superdoc = createSuperdocDouble({ denied: ['captions.insert'] });
    const harness = mountUi(ReferencesTab, { superdoc });
    await settle();

    const control = button(harness, 'הוסף כיתוב');
    expect(control.attributes('disabled')).toBeDefined();
    expect(tipMessage(control)).toContain('אינה זמינה');
  });

  it('הקבוצות שקדמו לגל הזה נשארו על מקומן', async () => {
    const harness = mountUi(ReferencesTab, { superdoc: createSuperdocDouble() });
    await settle();

    const titles = harness.wrapper.findAll('.word-group-title').map((item) => item.text());
    expect(titles).toEqual([
      'תוכן עניינים',
      'הערות שוליים',
      'מפתח',
      'ציטוטים וביבליוגרפיה',
      'כיתובים',
    ]);
  });
});

describe('דיאלוג הכיתוב', () => {
  const SUMMARY = [
    { id: 'cap-1', label: 'איור', number: 1, text: 'ראשון', display: 'איור 1: ראשון' },
  ];

  it('„הוסף כיתוב” מנוטרל בלי תווית', async () => {
    const harness = mountUi(CaptionDialog, { props: { isOpen: false } });
    await harness.wrapper.setProps({ isOpen: true });
    await settle();

    const submit = document.querySelector('.cp-btn-primary') as HTMLButtonElement;
    expect(submit.textContent?.trim()).toBe('הוסף כיתוב');
    expect(submit.disabled).toBe(false);

    (document.querySelector('#cp-label') as HTMLInputElement).value = '   ';
    (document.querySelector('#cp-label') as HTMLInputElement).dispatchEvent(new Event('input'));
    await settle();
    expect((document.querySelector('.cp-btn-primary') as HTMLButtonElement).disabled).toBe(true);
    harness.wrapper.unmount();
  });

  it('בחירה בכיתוב ממלאת את הטופס, מחליפה את הכפתור, ונועלת את המיקום', async () => {
    const harness = mountUi(CaptionDialog, { props: { isOpen: false, captions: SUMMARY } });
    await harness.wrapper.setProps({ isOpen: true });
    await settle();

    (document.querySelector('.cp-list-item') as HTMLButtonElement).click();
    await settle();

    expect((document.querySelector('#cp-text') as HTMLInputElement).value).toBe('ראשון');
    expect((document.querySelector('.cp-btn-primary') as HTMLButtonElement).textContent?.trim()).toBe(
      'שמור שינויים',
    );
    expect((document.querySelector('#cp-position') as HTMLSelectElement).disabled).toBe(true);
    harness.wrapper.unmount();
  });

  it('אחרי שמירה הבחירה משתחררת — העריכה נתנה לכיתוב `nodeId` חדש', async () => {
    const harness = mountUi(CaptionDialog, { props: { isOpen: false, captions: SUMMARY } });
    await harness.wrapper.setProps({ isOpen: true });
    await settle();

    (document.querySelector('.cp-list-item') as HTMLButtonElement).click();
    await settle();
    (document.querySelector('.cp-btn-primary') as HTMLButtonElement).click();
    await settle();

    expect(harness.wrapper.emitted('update')).toHaveLength(1);
    // המזהה שנשמר כבר אינו קיים במסמך, ולכן הטופס חוזר למצב „הוסף”:
    // לחיצה שנייה על אותו מזהה הייתה מקבלת „הכיתוב אינו נמצא במסמך”.
    expect((document.querySelector('.cp-btn-primary') as HTMLButtonElement).textContent?.trim()).toBe(
      'הוסף כיתוב',
    );
    const remove = [...document.querySelectorAll('.cp-btn')].find(
      (item) => item.textContent?.trim() === 'הסר כיתוב',
    ) as HTMLButtonElement;
    expect(remove.disabled).toBe(true);
    harness.wrapper.unmount();
  });

  it('„כיתוב חדש” מאפס גם את התווית, כמו פתיחת הדיאלוג', async () => {
    const harness = mountUi(CaptionDialog, {
      props: {
        isOpen: false,
        captions: [{ id: 'cap-1', label: 'לוח', number: 1, text: 'ראשון', display: 'לוח 1: ראשון' }],
      },
    });
    await harness.wrapper.setProps({ isOpen: true });
    await settle();

    (document.querySelector('.cp-list-item') as HTMLButtonElement).click();
    await settle();
    expect((document.querySelector('#cp-label') as HTMLInputElement).value).toBe('לוח');

    const startNew = [...document.querySelectorAll('.cp-btn')].find(
      (item) => item.textContent?.trim() === 'כיתוב חדש',
    ) as HTMLButtonElement;
    startNew.click();
    await settle();

    // תווית שנשארת מצמידה את הכיתוב הבא לרצף מספור שאינו זה שהמשתמש
    // מתכוון אליו — ולכן שתי הדרכים להתחיל חדש מאפסות אותו דבר.
    expect((document.querySelector('#cp-label') as HTMLInputElement).value).toBe('איור');
    expect((document.querySelector('#cp-text') as HTMLInputElement).value).toBe('');
    harness.wrapper.unmount();
  });

  it('„הסר כיתוב” מנוטרל כל עוד לא נבחר כיתוב', async () => {
    const harness = mountUi(CaptionDialog, { props: { isOpen: false, captions: SUMMARY } });
    await harness.wrapper.setProps({ isOpen: true });
    await settle();

    const remove = [...document.querySelectorAll('.cp-btn')].find(
      (item) => item.textContent?.trim() === 'הסר כיתוב',
    ) as HTMLButtonElement;
    expect(remove.disabled).toBe(true);

    (document.querySelector('.cp-list-item') as HTMLButtonElement).click();
    await settle();
    expect(remove.disabled).toBe(false);
    harness.wrapper.unmount();
  });

  it('מזהיר שתווית חדשה מתחילה רצף מספור נפרד', async () => {
    const harness = mountUi(CaptionDialog, { props: { isOpen: false, captions: SUMMARY } });
    await harness.wrapper.setProps({ isOpen: true });
    await settle();

    // „איור” כבר במסמך — אין אזהרה.
    expect(document.querySelector('.cp-warn')).toBeNull();

    const input = document.querySelector('#cp-label') as HTMLInputElement;
    input.value = 'לוח';
    input.dispatchEvent(new Event('input'));
    await settle();

    expect(document.querySelector('.cp-warn')?.textContent).toContain('יתחיל מ-1');
    harness.wrapper.unmount();
  });

  it('מציע את שלוש התוויות של Word ואת אלה שכבר במסמך, בלי כפילות', async () => {
    const harness = mountUi(CaptionDialog, {
      props: { isOpen: false, labels: ['איור', 'לוח'] },
    });
    await harness.wrapper.setProps({ isOpen: true });
    await settle();

    const options = [...document.querySelectorAll('#cp-label-options option')].map(
      (item) => (item as HTMLOptionElement).value,
    );
    expect(options).toEqual(['איור', 'טבלה', 'משוואה', 'לוח']);
    harness.wrapper.unmount();
  });
});
