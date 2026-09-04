/**
 * קבוצת „הערות שוליים” בלשונית „הפניות”.
 *
 * `tests/component/ribbon-tabs.test.ts` כבר מוודא שאין כאן כפתור מת. מה
 * שנמדד כאן הוא מה שהוא אינו יכול לשאול: **על מה** הפעולה חלה. הטענה
 * המרכזית — שכתובת ההערה אינה נושאת את סוגה, ולכן „הסר” על הערת סיום היה
 * מוחק הערת שוליים — נמדדה בדפדפן, וההנמקה שלה ב-engine/footnotes.ts.
 */
import { describe, expect, it } from 'vitest';
import { autoUnmount, createSuperdocDouble, mountUi, settle, tipMessage } from './harness';

import ReferencesTab from '../../src/ui/ribbon/tabs/ReferencesTab.vue';
import NoteDialog from '../../src/ui/panels/NoteDialog.vue';

autoUnmount();

/** כפתור לפי התווית שעליו — זה מה שהמשתמש רואה. */
function button(harness: ReturnType<typeof mountUi>, label: string) {
  const found = harness.wrapper.findAll('button').find((item) => item.text().trim() === label);
  if (!found) throw new Error(`לא נמצא כפתור „${label}”`);
  return found;
}

/**
 * הערת שוליים והערת סיום שמספרן זהה — המסמך שבו הכתובת דו-משמעית. זה
 * המצב הרגיל בכל ספר שיש בו את שני הסוגים, ולא מקרה קצה: שני הרצפים
 * מתחילים מ-1 בנפרד.
 */
const BOTH = [
  { type: 'footnote' as const, content: 'רַשִׁ״י שם' },
  { type: 'endnote' as const, content: 'רשימת המקורות' },
];

/**
 * מחזירה את הבקרה עד שתשובה מושהית (macrotask) נפתרה וה-DOM התעדכן.
 * `settle` מריץ microtasks בלבד, ולכן הוא לבדו אינו משחרר קריאה מושהית.
 */
async function flush(): Promise<void> {
  for (let round = 0; round < 3; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await settle();
  }
}

async function openDialog(superdoc: ReturnType<typeof createSuperdocDouble>) {
  const harness = mountUi(ReferencesTab, { superdoc });
  await settle();
  await button(harness, 'נהל הערות').trigger('click');
  await settle();
  return harness;
}

describe('הרצועה', () => {
  it('„הערת שוליים” ו„הערת סיום” נשארו הפעולה שהייתה — הוספה במקום הסמן', async () => {
    const superdoc = createSuperdocDouble();
    const harness = mountUi(ReferencesTab, { superdoc });
    await settle();

    await button(harness, 'הערת שוליים').trigger('click');
    await button(harness, 'הערת סיום').trigger('click');
    await settle();

    expect(superdoc.inputs('footnotes.insert')).toEqual([
      { type: 'footnote', content: '' },
      { type: 'endnote', content: '' },
    ]);
  });

  /**
   * המרוץ שנמדד, ולא זהירות כללית: `footnotes.get` שלפני ההסרה חוצה גבול
   * macrotask, ובחלון הזה לחיצה על „הערת שוליים” ברצועה מוסיפה הערה. האימות
   * ראה „הערת סיום” ואישר, וההסרה — שכבר אושרה — פותרת את אותה כתובת אל
   * הערת השוליים **החדשה** ומוחקת אותה. הערת הסיום נשארת, והמשתמש רואה
   * „בוצע”. מה שסוגר את זה הוא נעילה, ולא `get` נוסף.
   */
  it('בזמן שהסרה באוויר ההוספה נעולה — אחרת היא מוחקת את מה שהרגע נוסף', async () => {
    const superdoc = createSuperdocDouble({
      notes: { items: [{ type: 'endnote', content: 'סיום אחת' }] },
      deferred: ['footnotes.get'],
    });
    const harness = await openDialog(superdoc);

    harness.wrapper.findComponent(NoteDialog).vm.$emit('remove', { id: '1', type: 'endnote' });
    await settle();

    const insert = button(harness, 'הערת שוליים');
    expect(insert.attributes('disabled')).toBeDefined();
    expect(tipMessage(insert)).toContain('עדיין בעבודה');
    await insert.trigger('click');
    await flush();

    // ההוספה לא נקלטה, והערת הסיום — זו שנבחרה — היא זו שהוסרה.
    expect(superdoc.ops()).not.toContain('footnotes.insert');
    expect(superdoc.inputs('footnotes.remove')).toEqual([
      { target: { kind: 'entity', entityType: 'footnote', noteId: '1' } },
    ]);
    expect([...document.querySelectorAll('.np-list-text')]).toEqual([]);

    // והנעילה משתחררת כשהפעולה חוזרת — היא אינה הופכת לכפתור מת.
    expect(button(harness, 'הערת שוליים').attributes('disabled')).toBeUndefined();
  });

  it('הנעילה משתחררת גם כשהפעולה נכשלה', async () => {
    const superdoc = createSuperdocDouble({
      notes: { items: [{ type: 'footnote', content: 'א' }] },
      deferred: ['footnotes.get'],
      failures: { 'footnotes.remove': { code: 'TARGET_NOT_FOUND' } },
    });
    const harness = await openDialog(superdoc);

    harness.wrapper.findComponent(NoteDialog).vm.$emit('remove', { id: '1', type: 'footnote' });
    await settle();
    expect(button(harness, 'הערת סיום').attributes('disabled')).toBeDefined();

    await flush();
    expect(harness.reports[harness.reports.length - 1]?.outcome.ok).toBe(false);
    expect(button(harness, 'הערת סיום').attributes('disabled')).toBeUndefined();
  });

  it('רשימה שנשאבה חלקית אינה מוצגת כמלאה', async () => {
    // כשל בשאיבה השנייה. הדיאלוג אומר „אין הערות” ולא מציג את החצי שנקרא:
    // הערת סיום שתאומתה בעמוד שלא נשאב הייתה נראית ברת-עריכה, והמשתמש היה
    // מקבל סירוב בלתי מוסבר.
    const superdoc = createSuperdocDouble({
      notes: { items: BOTH, pageLimit: 1 },
    });
    const harness = await openDialog(superdoc);

    expect([...document.querySelectorAll('.np-list-text')]).toEqual([]);
    expect(document.querySelector('.np-note')?.textContent).toContain('אין הערות במסמך');
    expect(harness.wrapper.findComponent(NoteDialog).exists()).toBe(true);
  });

  it('„נהל הערות” מציג את שני הסוגים, ואת התוכן שבמסמך', async () => {
    const harness = await openDialog(createSuperdocDouble({ notes: { items: BOTH } }));

    const shown = [...document.querySelectorAll('.np-list-text')].map((item) => item.textContent);
    expect(shown).toEqual(['הערת שוליים 1: רַשִׁ״י שם', 'הערת סיום 1: רשימת המקורות']);
    expect(harness.wrapper.findComponent(NoteDialog).exists()).toBe(true);
  });

  it('„שמור שינויים” הוא `footnotes.update` אחד — לא הסרה והוספה מחדש', async () => {
    const superdoc = createSuperdocDouble({ notes: { items: BOTH } });
    const harness = await openDialog(superdoc);

    harness.wrapper.findComponent(NoteDialog).vm.$emit('update', {
      ref: { id: '1', type: 'footnote' },
      content: 'רַשִׁ״י בְּרֵאשִׁית א׳ א׳',
    });
    await settle(20);

    expect(superdoc.inputs('footnotes.update')).toEqual([
      {
        target: { kind: 'entity', entityType: 'footnote', noteId: '1' },
        patch: { content: 'רַשִׁ״י בְּרֵאשִׁית א׳ א׳' },
      },
    ]);
    expect(superdoc.ops()).not.toContain('footnotes.remove');

    // והרשימה שבדיאלוג מציגה את החדש, ולא את השניים משורשרים.
    const shown = [...document.querySelectorAll('.np-list-text')].map((item) => item.textContent);
    expect(shown).toEqual(['הערת שוליים 1: רַשִׁ״י בְּרֵאשִׁית א׳ א׳', 'הערת סיום 1: רשימת המקורות']);
  });

  it('„הסר” על הערת סיום שיש הערת שוליים באותו מספר — מסרב, ושתיהן נשארות', async () => {
    const superdoc = createSuperdocDouble({ notes: { items: BOTH } });
    const harness = await openDialog(superdoc);

    harness.wrapper.findComponent(NoteDialog).vm.$emit('remove', { id: '1', type: 'endnote' });
    await settle(20);

    expect(superdoc.ops()).not.toContain('footnotes.remove');
    const last = harness.reports[harness.reports.length - 1]?.outcome;
    expect(last?.ok).toBe(false);
    expect(last?.ok === false && last.message).toContain('אינו יודע להבדיל ביניהן');

    const shown = [...document.querySelectorAll('.np-list-text')].map((item) => item.textContent);
    expect(shown).toEqual(['הערת שוליים 1: רַשִׁ״י שם', 'הערת סיום 1: רשימת המקורות']);
  });

  it('„הסר” על הערת השוליים מוריד אותה, ומשאיר את הערת הסיום', async () => {
    const superdoc = createSuperdocDouble({ notes: { items: BOTH } });
    const harness = await openDialog(superdoc);

    harness.wrapper.findComponent(NoteDialog).vm.$emit('remove', { id: '1', type: 'footnote' });
    await settle(20);

    expect(superdoc.inputs('footnotes.remove')).toEqual([
      { target: { kind: 'entity', entityType: 'footnote', noteId: '1' } },
    ]);
    const shown = [...document.querySelectorAll('.np-list-text')].map((item) => item.textContent);
    expect(shown).toEqual(['הערת סיום 1: רשימת המקורות']);
  });

  it('פקד שהיכולת שלו חסרה מוצג מנוטרל עם ההסבר, ולא נעלם', async () => {
    const superdoc = createSuperdocDouble({ denied: ['footnotes.get'] });
    const harness = mountUi(ReferencesTab, { superdoc });
    await settle();

    const control = button(harness, 'נהל הערות');
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

describe('דיאלוג ההערות', () => {
  const SUMMARY = [
    {
      id: '1',
      type: 'footnote' as const,
      number: '1',
      content: 'רַשִׁ״י שם',
      display: 'הערת שוליים 1: רַשִׁ״י שם',
    },
    {
      id: '1',
      type: 'endnote' as const,
      number: '1',
      content: 'מקורות',
      display: 'הערת סיום 1: מקורות',
    },
  ];

  function items(): HTMLButtonElement[] {
    return [...document.querySelectorAll('.np-list-item')] as HTMLButtonElement[];
  }

  function footer(label: string): HTMLButtonElement {
    return [...document.querySelectorAll('.np-btn')].find(
      (item) => item.textContent?.trim() === label,
    ) as HTMLButtonElement;
  }

  it('בלי בחירה — שדה התוכן ושני הכפתורים מנוטרלים', async () => {
    const harness = mountUi(NoteDialog, { props: { isOpen: false, notes: SUMMARY } });
    await harness.wrapper.setProps({ isOpen: true });
    await settle();

    expect((document.querySelector('#np-content') as HTMLInputElement).disabled).toBe(true);
    expect(footer('שמור שינויים').disabled).toBe(true);
    expect(footer('הסר הערה').disabled).toBe(true);
    harness.wrapper.unmount();
  });

  it('בחירה ממלאת את התוכן, ותוכן ריק מנטרל את השמירה', async () => {
    const harness = mountUi(NoteDialog, { props: { isOpen: false, notes: SUMMARY } });
    await harness.wrapper.setProps({ isOpen: true });
    await settle();

    items()[0].click();
    await settle();
    const input = document.querySelector('#np-content') as HTMLInputElement;
    expect(input.value).toBe('רַשִׁ״י שם');
    expect(footer('שמור שינויים').disabled).toBe(false);

    input.value = '   ';
    input.dispatchEvent(new Event('input'));
    await settle();
    expect(footer('שמור שינויים').disabled).toBe(true);
    harness.wrapper.unmount();
  });

  it('הערת סיום דו-משמעית — אזהרה, ושני הכפתורים מנוטרלים', async () => {
    const harness = mountUi(NoteDialog, { props: { isOpen: false, notes: SUMMARY } });
    await harness.wrapper.setProps({ isOpen: true });
    await settle();

    items()[1].click();
    await settle();

    expect(document.querySelector('.np-warn')?.textContent).toContain('אינו יודע להבדיל ביניהן');
    expect(footer('שמור שינויים').disabled).toBe(true);
    expect(footer('הסר הערה').disabled).toBe(true);
    harness.wrapper.unmount();
  });

  it('הערת סיום שאין לה תאומה נערכת כרגיל, בלי אזהרה', async () => {
    const harness = mountUi(NoteDialog, {
      props: { isOpen: false, notes: [SUMMARY[1]] },
    });
    await harness.wrapper.setProps({ isOpen: true });
    await settle();

    items()[0].click();
    await settle();

    expect(document.querySelector('.np-warn')).toBeNull();
    footer('שמור שינויים').click();
    await settle();

    expect(harness.wrapper.emitted('update')).toEqual([
      [{ ref: { id: '1', type: 'endnote' }, content: 'מקורות' }],
    ]);
    harness.wrapper.unmount();
  });

  it('אחרי שמירה הבחירה נשמרת — `noteId` אינו מתחלף בעריכה', async () => {
    const harness = mountUi(NoteDialog, { props: { isOpen: false, notes: SUMMARY } });
    await harness.wrapper.setProps({ isOpen: true });
    await settle();

    items()[0].click();
    await settle();
    footer('שמור שינויים').click();
    await settle();

    expect(harness.wrapper.emitted('update')).toHaveLength(1);
    expect(footer('הסר הערה').disabled).toBe(false);
    harness.wrapper.unmount();
  });

  it('אחרי הסרה הבחירה משתחררת — הכתובת כבר מצביעה על הערה אחרת', async () => {
    const harness = mountUi(NoteDialog, { props: { isOpen: false, notes: SUMMARY } });
    await harness.wrapper.setProps({ isOpen: true });
    await settle();

    items()[0].click();
    await settle();
    footer('הסר הערה').click();
    await settle();

    expect(harness.wrapper.emitted('remove')).toEqual([[{ id: '1', type: 'footnote' }]]);
    expect(footer('הסר הערה').disabled).toBe(true);
    expect((document.querySelector('#np-content') as HTMLInputElement).value).toBe('');
    harness.wrapper.unmount();
  });

  it('בזמן פעולה כפתורי הפעולה מנוטרלים, והדיאלוג נשאר פתוח', async () => {
    const harness = mountUi(NoteDialog, { props: { isOpen: false, notes: SUMMARY } });
    await harness.wrapper.setProps({ isOpen: true });
    await settle();

    items()[0].click();
    await settle();
    expect(footer('שמור שינויים').disabled).toBe(false);

    await harness.wrapper.setProps({ busy: true });
    await settle();

    expect(footer('שמור שינויים').disabled).toBe(true);
    expect(footer('הסר הערה').disabled).toBe(true);
    expect((document.querySelector('#np-content') as HTMLInputElement).disabled).toBe(true);
    // הדיאלוג לא נסגר, הבחירה לא אבדה, ו„סגור” נשאר פעיל.
    expect(document.querySelector('.note-dialog')).not.toBeNull();
    expect(footer('סגור').disabled).toBe(false);

    await harness.wrapper.setProps({ busy: false });
    await settle();
    expect(footer('שמור שינויים').disabled).toBe(false);
    harness.wrapper.unmount();
  });

  it('אומר שהמספרים אינם המספרים ש-Word יציג', async () => {
    const harness = mountUi(NoteDialog, { props: { isOpen: false, notes: SUMMARY } });
    await harness.wrapper.setProps({ isOpen: true });
    await settle();

    const notes = [...document.querySelectorAll('.np-note')].map((item) => item.textContent);
    expect(notes.join(' ')).toContain('ממספר את ההערות מחדש');
    harness.wrapper.unmount();
  });
});
