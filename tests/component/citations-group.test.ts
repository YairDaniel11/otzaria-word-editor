/**
 * קבוצת „ציטוטים וביבליוגרפיה” בלשונית „הפניות”.
 *
 * `tests/component/ribbon-tabs.test.ts` כבר מוודא שאין כאן כפתור מת. מה
 * שנמדד כאן הוא מה שהוא אינו יכול לשאול: **מה** נשלח למסמך, ומה נשאר
 * מנוטרל כשהמסמך אינו במצב שמצדיק את הפקד. שלוש הטענות המרכזיות — מקור
 * אחד בציטוט, סירוב למחוק מקור מצוטט, וביבליוגרפיה שנמצאת דרך `fields.list`
 * — הן ההכרעות שנמדדו בדפדפן, וההנמקה שלהן ב-engine/citations.ts.
 */
import { describe, expect, it } from 'vitest';
import { autoUnmount, createSuperdocDouble, mountUi, settle, tipMessage } from './harness';

import ReferencesTab from '../../src/ui/ribbon/tabs/ReferencesTab.vue';
import CitationSourceDialog from '../../src/ui/panels/CitationSourceDialog.vue';
import InsertCitationDialog from '../../src/ui/panels/InsertCitationDialog.vue';

autoUnmount();

/** כפתור לפי התווית שעליו — זה מה שהמשתמש רואה. */
function button(harness: ReturnType<typeof mountUi>, label: string) {
  const found = harness.wrapper.findAll('button').find((item) => item.text().trim() === label);
  if (!found) throw new Error(`לא נמצא כפתור „${label}”`);
  return found;
}

const SOURCES = [
  { sourceId: 'src-1', title: 'שולחן ערוך', year: 'שכ״ה' },
  { sourceId: 'src-2', title: 'משנה תורה', year: 'תתק״פ' },
];

describe('הרצועה', () => {
  it('„הוסף ציטוט” שולח מקור אחד, ביעד מכווץ', async () => {
    const superdoc = createSuperdocDouble({
      citations: { sources: SOURCES },
      selection: { hasRange: true, text: 'ארבעה' },
    });
    const harness = mountUi(ReferencesTab, { superdoc });
    await settle();

    await button(harness, 'הוסף ציטוט').trigger('click');
    await settle();

    const dialog = harness.wrapper.findComponent(InsertCitationDialog);
    dialog.vm.$emit('insert', 'src-2');
    await settle();

    const [input] = superdoc
      .inputs('citations.insert')
      .map((value) => value as { at: { segments: { range: { start: number; end: number } }[] }; sourceIds: string[] });
    expect(input.sourceIds).toEqual(['src-2']);
    const [segment] = input.at.segments;
    expect(segment.range.start).toBe(segment.range.end);
  });

  it('„עדכן ביבליוגרפיה” מדווח למה כשאין מה לעדכן, ואינו שותק', async () => {
    const harness = mountUi(ReferencesTab, { superdoc: createSuperdocDouble() });
    await settle();

    await button(harness, 'עדכן ביבליוגרפיה').trigger('click');
    await settle();

    const last = harness.reports[harness.reports.length - 1];
    expect(last?.outcome.ok).toBe(false);
    expect(last?.outcome.ok === false && last.outcome.message).toContain('אין במסמך ביבליוגרפיה');
  });

  it('„עדכן ביבליוגרפיה” פועל על ביבליוגרפיה שנמצאה דרך `fields.list`', async () => {
    const superdoc = createSuperdocDouble({ citations: { bibliographyIds: ['BIB-1'] } });
    const harness = mountUi(ReferencesTab, { superdoc });
    await settle();

    await button(harness, 'עדכן ביבליוגרפיה').trigger('click');
    await settle();

    expect(harness.reports[harness.reports.length - 1]?.outcome.ok).toBe(true);
    expect(superdoc.inputs('citations.bibliography.rebuild')).toEqual([
      { target: { kind: 'block', nodeType: 'bibliography', nodeId: 'BIB-1' } },
    ]);
  });

  it('„הסר ביבליוגרפיה” מסרב כשיש שתיים, ואינו מנחש', async () => {
    const superdoc = createSuperdocDouble({
      citations: { bibliographyIds: ['BIB-1', 'BIB-2'] },
    });
    const harness = mountUi(ReferencesTab, { superdoc });
    await settle();

    await button(harness, 'הסר ביבליוגרפיה').trigger('click');
    await settle();

    expect(superdoc.ops()).not.toContain('citations.bibliography.remove');
    expect(harness.reports[harness.reports.length - 1]?.outcome.ok).toBe(false);
  });

  it('פקד שהיכולת שלו חסרה מוצג מנוטרל עם ההסבר, ולא נעלם', async () => {
    const superdoc = createSuperdocDouble({ denied: ['citations.sources.insert'] });
    const harness = mountUi(ReferencesTab, { superdoc });
    await settle();

    const manage = button(harness, 'נהל מקורות');
    expect(manage.attributes('disabled')).toBeDefined();
    expect(tipMessage(manage)).toContain('אינה זמינה');
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
      // גל 8 הוסיף קבוצה שישית **בסופה** של הלשונית. הבדיקה הזאת מקבעת שאף
      // אחת מהקודמות לא זזה, וזה בדיוק מה שהיא ממשיכה לקבע.
      //
      // חמש ולא שש: „הפניות מקושרות” אינה קבוצה עוד. הפקד היחיד שהיה בה,
      // „עדכן הפניות”, עבר ל„כיתובים” — שם „הפניה מקושרת” יושבת ב-Word העברי
      // (ההנמקה המלאה בהערת הפתיחה של ReferencesTab.vue). הסדר של השאר,
      // שזה מה שהבדיקה שומרת, לא זז.
      'כיתובים',
    ]);
  });
});

describe('דיאלוג ניהול המקורות', () => {
  it('„הוסף מקור” מנוטרל בלי כותרת', async () => {
    const harness = mountUi(CitationSourceDialog, { props: { isOpen: true, sources: [] } });
    await settle();

    const submit = document.querySelector('.cs-btn-primary') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(submit.textContent?.trim()).toBe('הוסף מקור');
    harness.wrapper.unmount();
  });

  it('בחירה במקור ממלאת את הטופס ומחליפה את הכפתור ל„שמור שינויים”', async () => {
    const sources = [
      {
        id: 'src-1',
        label: 'שולחן ערוך',
        citedCount: 0,
        draft: {
          type: 'book' as const,
          title: 'שולחן ערוך',
          authors: 'קארו, יוסף',
          year: 'שכ״ה',
          publisher: '',
          city: '',
          journalName: '',
          volume: '',
          pages: '',
        },
      },
    ];
    const harness = mountUi(CitationSourceDialog, { props: { isOpen: true, sources } });
    await settle();

    (document.querySelector('.cs-list-item') as HTMLButtonElement).click();
    await settle();

    expect((document.querySelector('#cs-title') as HTMLInputElement).value).toBe('שולחן ערוך');
    expect((document.querySelector('.cs-btn-primary') as HTMLButtonElement).textContent?.trim()).toBe(
      'שמור שינויים',
    );
    // סוג המקור נעול בעריכה: אין בחוזה מסלול שמשנה `type`.
    expect((document.querySelector('#cs-type') as HTMLSelectElement).disabled).toBe(true);
    harness.wrapper.unmount();
  });

  it('„מחק מקור” מנוטרל על מקור מצוטט, עם אזהרה שמסבירה למה', async () => {
    const sources = [
      {
        id: 'src-1',
        label: 'שולחן ערוך',
        citedCount: 3,
        draft: {
          type: 'book' as const,
          title: 'שולחן ערוך',
          authors: '',
          year: '',
          publisher: '',
          city: '',
          journalName: '',
          volume: '',
          pages: '',
        },
      },
    ];
    const harness = mountUi(CitationSourceDialog, { props: { isOpen: true, sources } });
    await settle();

    (document.querySelector('.cs-list-item') as HTMLButtonElement).click();
    await settle();

    const remove = [...document.querySelectorAll('.cs-btn')].find(
      (item) => item.textContent?.trim() === 'מחק מקור',
    ) as HTMLButtonElement;
    expect(remove.disabled).toBe(true);
    expect(document.querySelector('.cs-warn')?.textContent).toContain('ציטוטים');
    harness.wrapper.unmount();
  });
});

describe('דיאלוג הוספת הציטוט', () => {
  it('בלי מקורות — „הוסף” מנוטרל, וההודעה מפנה לנהל מקורות', async () => {
    const harness = mountUi(InsertCitationDialog, { props: { isOpen: true, sources: [] } });
    await settle();

    expect((document.querySelector('.ic-btn-primary') as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector('.ic-note')?.textContent).toContain('נהל מקורות');
    harness.wrapper.unmount();
  });

  it('פולט את המקור הראשון כברירת מחדל', async () => {
    const sources = [
      { id: 'src-1', label: 'א', citedCount: 0, draft: {} as never },
      { id: 'src-2', label: 'ב', citedCount: 0, draft: {} as never },
    ];
    // נפתח אחרי ההרכבה ולא איתה, כמו בלשונית: הבחירה נקבעת ב-`watch` על
    // `isOpen`, ודיאלוג שנולד פתוח לעולם אינו עובר בו.
    const harness = mountUi(InsertCitationDialog, { props: { isOpen: false, sources } });
    await harness.wrapper.setProps({ isOpen: true });
    await settle();

    (document.querySelector('.ic-btn-primary') as HTMLButtonElement).click();
    await settle();

    expect(harness.wrapper.emitted('insert')).toEqual([['src-1']]);
    harness.wrapper.unmount();
  });
});
