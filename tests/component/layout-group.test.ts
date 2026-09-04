/**
 * קבוצות „הגדרת עמוד” ו„מקטע” בלשונית „פריסה” — הפקדים של גל 10.
 *
 * `tests/component/ribbon-tabs.test.ts` כבר מוודא שאין כאן כפתור מת, ו-
 * `tests/unit/page-setup.test.ts` מוודא **מה** נשלח למנוע ושה-OOXML שיוצא
 * חוקי. מה שנמדד כאן הוא מה ששניהם אינם יכולים לשאול: שהלחיצה בממשק מגיעה
 * לפעולה הנכונה, שהדיאלוגים נפתחים על מה שבמסמך ולא על ברירת מחדל, ושהנעילה
 * שסוגרת את חלון ה-TOCTOU קיימת בפועל ולא רק בהערה.
 */
import { describe, expect, it } from 'vitest';
import { autoUnmount, createSuperdocDouble, mountUi, settle, tipMessage, tipSelector } from './harness';

import LayoutTab from '../../src/ui/ribbon/tabs/LayoutTab.vue';
import PageNumberingDialog from '../../src/ui/panels/PageNumberingDialog.vue';
import HeaderDistanceDialog from '../../src/ui/panels/HeaderDistanceDialog.vue';

autoUnmount();

async function chooseFromMenu(
  harness: ReturnType<typeof mountUi>,
  buttonTitle: string,
  itemLabel: string,
): Promise<void> {
  await harness.wrapper.find(tipSelector(buttonTitle)).trigger('click');
  const item = harness.wrapper
    .findAll('[role="menuitem"]')
    .find((candidate) => candidate.text().includes(itemLabel));
  if (!item) throw new Error(`אין פריט „${itemLabel}” בתפריט „${buttonTitle}”`);
  await item.trigger('click');
  await settle();
}

const LINE_NUMBERS = 'מספור השורות בשולי הדף';
const PAGE_BORDERS = 'מסגרת סביב העמוד';
const VERTICAL_ALIGN = 'מיקום הטקסט בגובה העמוד';
const PAGE_NUMBERING = 'תבנית מספרי העמודים ומספר ההתחלה';
const HEADER_DISTANCE = 'מרחק הכותרת העליונה והתחתונה מקצה הדף';

describe('מספרי שורות', () => {
  it('„רציף” שולח lnNumType עם ברירות המחדל של Word', async () => {
    const superdoc = createSuperdocDouble();
    const harness = mountUi(LayoutTab, { superdoc });
    await settle();

    await chooseFromMenu(harness, LINE_NUMBERS, 'רציף');

    expect(superdoc.inputs('sections.setLineNumbering')).toEqual([
      {
        target: { sectionIndex: 0 },
        enabled: true,
        restart: 'continuous',
        countBy: 1,
        start: 1,
        distance: undefined,
      },
    ]);
    expect(harness.failures()).toEqual([]);
  });

  it('משמר את מה שהמקטע במסמך כבר נושא, ואינו מוחק אותו', async () => {
    // כל קריאה מחליפה את `<w:lnNumType>` כולו (נמדד), ולכן זו הבדיקה
    // שמפרידה בין „הפקד עובד” ובין „הפקד לא הרס הגדרות מ-Word”.
    const superdoc = createSuperdocDouble({
      sections: { lineNumbering: { enabled: true, countBy: 5, start: 7, distance: 0.25 } },
    });
    const harness = mountUi(LayoutTab, { superdoc });
    await settle();

    await chooseFromMenu(harness, LINE_NUMBERS, 'התחל מחדש בכל עמוד');

    expect(superdoc.inputs('sections.setLineNumbering')).toEqual([
      {
        target: { sectionIndex: 0 },
        enabled: true,
        restart: 'newPage',
        countBy: 5,
        start: 7,
        distance: 0.25,
      },
    ]);
  });

  it('„ללא” שולח כיבוי ולא restart', async () => {
    const superdoc = createSuperdocDouble();
    const harness = mountUi(LayoutTab, { superdoc });
    await settle();

    await chooseFromMenu(harness, LINE_NUMBERS, 'ללא');

    expect(superdoc.inputs('sections.setLineNumbering')).toEqual([
      { target: { sectionIndex: 0 }, enabled: false },
    ]);
  });

  it('פקד שהיכולת שלו חסרה מנוטרל עם ההסבר, ואינו נעלם', async () => {
    const harness = mountUi(LayoutTab, {
      superdoc: createSuperdocDouble({ denied: ['sections.setLineNumbering'] }),
    });
    await settle();

    const button = harness.wrapper
      .findAll('button')
      .find((item) => item.text().includes('מספרי שורות'));
    expect(button?.attributes('disabled')).toBeDefined();
    expect(tipMessage(button!)).toBe('הפעולה אינה זמינה בגרסה הזאת של המנוע');
  });
});

describe('גבולות עמוד', () => {
  it('„קו כפול” מקיף את ארבעת הצדדים בערכים של Word', async () => {
    const superdoc = createSuperdocDouble();
    const harness = mountUi(LayoutTab, { superdoc });
    await settle();

    await chooseFromMenu(harness, PAGE_BORDERS, 'קו כפול');

    const side = { style: 'double', size: 6, space: 24, color: 'auto' };
    expect(superdoc.inputs('sections.setPageBorders')).toEqual([
      {
        target: { sectionIndex: 0 },
        borders: {
          display: 'allPages',
          offsetFrom: 'page',
          top: side,
          right: side,
          bottom: side,
          left: side,
        },
      },
    ]);
  });

  it('„ללא גבול” קורא ל-`clearPageBorders` ולא שולח גבול ריק', async () => {
    const superdoc = createSuperdocDouble();
    const harness = mountUi(LayoutTab, { superdoc });
    await settle();

    await chooseFromMenu(harness, PAGE_BORDERS, 'ללא גבול');

    expect(superdoc.inputs('sections.clearPageBorders')).toEqual([
      { target: { sectionIndex: 0 } },
    ]);
    expect(superdoc.inputs('sections.setPageBorders')).toEqual([]);
  });

  it('מנוע בלי `clearPageBorders` מנטרל את הפקד כולו', async () => {
    // שתי הפעולות הן שאלה אחת: „ללא גבול” הוא פריט באותו תפריט, ותפריט
    // שרק חלקו עובד אינו מצב שאפשר להציג.
    const harness = mountUi(LayoutTab, {
      superdoc: createSuperdocDouble({ denied: ['sections.clearPageBorders'] }),
    });
    await settle();

    const button = harness.wrapper
      .findAll('button')
      .find((item) => item.text().includes('גבולות עמוד'));
    expect(button?.attributes('disabled')).toBeDefined();
  });
});

describe('יישור אנכי', () => {
  it('„מרכז” שולח את אסימון ST_VerticalJc', async () => {
    const superdoc = createSuperdocDouble();
    const harness = mountUi(LayoutTab, { superdoc });
    await settle();

    await chooseFromMenu(harness, VERTICAL_ALIGN, 'מרכז');

    expect(superdoc.inputs('sections.setVerticalAlign')).toEqual([
      { target: { sectionIndex: 0 }, value: 'center' },
    ]);
  });

  it('„מיושר” הוא `both`, ולא `justify`', async () => {
    const superdoc = createSuperdocDouble();
    const harness = mountUi(LayoutTab, { superdoc });
    await settle();

    await chooseFromMenu(harness, VERTICAL_ALIGN, 'מיושר');

    expect(superdoc.inputs('sections.setVerticalAlign')).toEqual([
      { target: { sectionIndex: 0 }, value: 'both' },
    ]);
  });
});

describe('מספור עמודים', () => {
  it('הדיאלוג נפתח על מה שבמסמך ולא על ברירת המחדל', async () => {
    const superdoc = createSuperdocDouble({
      sections: { pageNumbering: { start: 3, format: 'upperRoman' } },
    });
    const harness = mountUi(LayoutTab, { superdoc });
    await settle();

    await harness.wrapper.find(tipSelector(PAGE_NUMBERING)).trigger('click');
    await settle();

    const dialog = harness.wrapper.findComponent(PageNumberingDialog);
    expect(dialog.props('isOpen')).toBe(true);
    expect(dialog.props('format')).toBe('upperRoman');
    expect(dialog.props('start')).toBe(3);
  });

  it('פורמט שאינו ב-union אינו מוצג בדיאלוג', async () => {
    // `ordinal` קיים בצד המנוע אך אינו בטבלה שלנו, ולכן הטופס אינו מציע
    // אותו. עד המעבר ל-superdoc@2.10.0 המקרה הזה הודגם דווקא עם `hebrew1`,
    // שהיה נזרק — היום הוא נתמך, ויש לו בדיקה משלו למטה.
    const superdoc = createSuperdocDouble({
      sections: { pageNumbering: { start: 1, format: 'ordinal' } },
    });
    const harness = mountUi(LayoutTab, { superdoc });
    await settle();

    await harness.wrapper.find(tipSelector(PAGE_NUMBERING)).trigger('click');
    await settle();

    expect(harness.wrapper.findComponent(PageNumberingDialog).props('format')).toBe(null);
  });

  it('מספור עברי שהגיע מהמסמך מוצג בדיאלוג', async () => {
    for (const format of ['hebrew1', 'hebrew2']) {
      const superdoc = createSuperdocDouble({
        sections: { pageNumbering: { start: 1, format } },
      });
      const harness = mountUi(LayoutTab, { superdoc });
      await settle();

      await harness.wrapper.find(tipSelector(PAGE_NUMBERING)).trigger('click');
      await settle();

      expect(harness.wrapper.findComponent(PageNumberingDialog).props('format')).toBe(format);
    }
  });

  it('אישור שולח פורמט ומספר התחלה, וסוגר', async () => {
    const superdoc = createSuperdocDouble();
    const harness = mountUi(LayoutTab, { superdoc });
    await settle();

    await harness.wrapper.find(tipSelector(PAGE_NUMBERING)).trigger('click');
    await settle();

    const dialog = harness.wrapper.findComponent(PageNumberingDialog);
    dialog.vm.$emit('submit', { format: 'lowerRoman', start: 5 });
    await settle();

    expect(superdoc.inputs('sections.setPageNumbering')).toEqual([
      { target: { sectionIndex: 0 }, format: 'lowerRoman', start: 5 },
    ]);
    expect(dialog.props('isOpen')).toBe(false);
    expect(harness.failures()).toEqual([]);
  });

  it('בלי מספר התחלה — השדה אינו נשלח בכלל', async () => {
    const superdoc = createSuperdocDouble();
    const harness = mountUi(LayoutTab, { superdoc });
    await settle();

    await harness.wrapper.find(tipSelector(PAGE_NUMBERING)).trigger('click');
    await settle();
    harness.wrapper
      .findComponent(PageNumberingDialog)
      .vm.$emit('submit', { format: 'decimal', start: null });
    await settle();

    expect(superdoc.inputs('sections.setPageNumbering')).toEqual([
      { target: { sectionIndex: 0 }, format: 'decimal' },
    ]);
  });
});

describe('מרחק הכותרת מקצה הדף', () => {
  it('הדיאלוג נפתח על מרחק המסמך, בסנטימטרים', async () => {
    // הכפיל מחזיר חצי אינץ' — מה שהמסמך הריק של המנוע נושא — וזה 1.27 ס"מ.
    const superdoc = createSuperdocDouble();
    const harness = mountUi(LayoutTab, { superdoc });
    await settle();

    await harness.wrapper.find(tipSelector(HEADER_DISTANCE)).trigger('click');
    await settle();

    const dialog = harness.wrapper.findComponent(HeaderDistanceDialog);
    expect(dialog.props('isOpen')).toBe(true);
    expect(dialog.props('distance')).toEqual({ header: 0.5 * 2.54, footer: 0.5 * 2.54 });
  });

  it('אישור ממיר לאינצ\'ים לפני שהוא מגיע למנוע', async () => {
    const superdoc = createSuperdocDouble();
    const harness = mountUi(LayoutTab, { superdoc });
    await settle();

    await harness.wrapper.find(tipSelector(HEADER_DISTANCE)).trigger('click');
    await settle();
    harness.wrapper
      .findComponent(HeaderDistanceDialog)
      .vm.$emit('submit', { headerCm: 2.54, footerCm: 1.27 });
    await settle();

    expect(superdoc.inputs('sections.setHeaderFooterMargins')).toEqual([
      { target: { sectionIndex: 0 }, header: 1, footer: 0.5 },
    ]);
  });

  it('מה שהטופס אימת הוא מה שנשלח — הטקסט, ולא המרה שנייה שלו', async () => {
    // הבאג שנסגר: הדיאלוג אימת ב-`normalizeHeaderDistanceCm` (שמקבל רווחים
    // ופסיק עשרוני) ושלח `Number(...)` של אותו טקסט. כאן נמדד המסלול המלא —
    // הקלדה בשדות, לחיצה על „אישור”, וההמרה היחידה שנעשית היא זו של המודול.
    // הפסיק העשרוני עצמו נבדק ב-tests/unit/page-setup.test.ts: `type=number`
    // מנקה תו שאינו מספר מ-`value`, ולכן אי אפשר להקליד אותו לשדה כאן.
    const superdoc = createSuperdocDouble();
    const harness = mountUi(LayoutTab, { superdoc });
    await settle();

    await harness.wrapper.find(tipSelector(HEADER_DISTANCE)).trigger('click');
    await settle();

    for (const [id, value] of [['#hd-header', '2.54'], ['#hd-footer', '1.27']] as const) {
      const field = document.querySelector(id) as HTMLInputElement;
      field.value = value;
      field.dispatchEvent(new Event('input'));
    }
    await settle();

    (document.querySelector('.hd-btn-primary') as HTMLButtonElement).click();
    await settle();

    expect(superdoc.inputs('sections.setHeaderFooterMargins')).toEqual([
      { target: { sectionIndex: 0 }, header: 1, footer: 0.5 },
    ]);
    expect(harness.failures()).toEqual([]);
  });

  it('הדיאלוג שולח את הטקסט הגולמי, ולא `Number()` שלו', async () => {
    // הבדיקה על זהות הערך ולא על „מספר שקול”, וזה העיקר: `Number()` בדיאלוג
    // היה נוסחה **שנייה** לאותה שאלה, ו-`normalizeHeaderDistanceCm` — זו
    // שהכריעה אם „אישור” פעיל — מקבלת רווחים ופסיק עשרוני שהיא הופכת ל-`NaN`.
    // מרגע שהטקסט עובר כמות שהוא, ההמרה נעשית פעם אחת, במודול.
    // נפתח דרך `setProps` ולא ב-`isOpen: true` ההתחלתי: מילוי השדות תלוי
    // ב-watch על `isOpen`, שאינו `immediate`.
    const harness = mountUi(HeaderDistanceDialog, {
      props: { isOpen: false, distance: { header: 1.25, footer: 2.5 } },
    });
    await harness.wrapper.setProps({ isOpen: true });
    await settle();

    (document.querySelector('.hd-btn-primary') as HTMLButtonElement).click();
    await settle();

    expect(harness.wrapper.emitted('submit')).toEqual([
      [{ headerCm: '1.25', footerCm: '2.5' }],
    ]);
  });

  it('מרחק שמעל התקרה של Word נעצר, ומדווח בעברית', async () => {
    // הדיאלוג אינו מאפשר את זה, והמודול אינו סומך עליו: `submit` מכל מקור
    // עובר את אותה ולידציה.
    const superdoc = createSuperdocDouble();
    const harness = mountUi(LayoutTab, { superdoc });
    await settle();

    await harness.wrapper.find(tipSelector(HEADER_DISTANCE)).trigger('click');
    await settle();
    harness.wrapper
      .findComponent(HeaderDistanceDialog)
      .vm.$emit('submit', { headerCm: 99, footerCm: 1.27 });
    await settle();

    expect(superdoc.inputs('sections.setHeaderFooterMargins')).toEqual([]);
    expect(harness.failures()).toEqual([
      {
        commandId: 'page-header-distance',
        outcome: {
          ok: false,
          message: 'שינוי מרחק הכותרת מקצה הדף נכשל: המרחק חייב להיות מספר בין 0 ל-55.88 ס"מ',
          reason: 'invalid-header-distance',
        },
      },
    ]);
  });
});

describe('הנעילה מגיעה גם אל כפתורי הדיאלוגים', () => {
  /**
   * המצב שאפשר להעמיד, ושהיה נופל בשקט: הדיאלוג פתוח, המשתמש לוחץ על פקד
   * ברצועה (מסמך גדול, `sections.list` איטי), ואז על „אישור”. `run()` היה
   * יוצא ב-`return` בגלל `inFlight`, הדיאלוג היה נסגר, ולא היה קורה דבר ולא
   * הייתה הודעה. `busy` — אותה תבנית של NoteDialog מגל 9 — סוגר את זה.
   */
  async function openDialogWithRibbonBusy(
    title: string,
  ): Promise<ReturnType<typeof mountUi>> {
    const superdoc = createSuperdocDouble({ deferred: ['sections.setLineNumbering'] });
    const harness = mountUi(LayoutTab, { superdoc });
    await settle();

    await harness.wrapper.find(tipSelector(title)).trigger('click');
    await settle();

    await chooseFromMenu(harness, LINE_NUMBERS, 'רציף');
    expect(superdoc.inputs('sections.setLineNumbering')).toHaveLength(1);

    return harness;
  }

  it('„אישור” של מספור העמודים מנוטרל בזמן שפעולה ברצועה באוויר', async () => {
    const harness = await openDialogWithRibbonBusy(PAGE_NUMBERING);

    const dialog = harness.wrapper.findComponent(PageNumberingDialog);
    expect(dialog.props('isOpen')).toBe(true);
    expect(dialog.props('busy')).toBe(true);
    expect((document.querySelector('.pn-btn-primary') as HTMLButtonElement).disabled).toBe(true);

    // „ביטול” נשאר פעיל: הוא אינו נוגע במסמך.
    const cancel = [...document.querySelectorAll('.pn-btn')].find(
      (item) => item.textContent?.includes('ביטול'),
    ) as HTMLButtonElement;
    expect(cancel.disabled).toBe(false);
  });

  it('„אישור” של מרחק הכותרת מנוטרל בזמן שפעולה ברצועה באוויר', async () => {
    const harness = await openDialogWithRibbonBusy(HEADER_DISTANCE);

    const dialog = harness.wrapper.findComponent(HeaderDistanceDialog);
    expect(dialog.props('isOpen')).toBe(true);
    expect(dialog.props('busy')).toBe(true);
    expect((document.querySelector('.hd-btn-primary') as HTMLButtonElement).disabled).toBe(true);
  });

  it('הנעילה משתחררת כשהפעולה חוזרת, והדיאלוג חוזר להיות בר-אישור', async () => {
    const harness = await openDialogWithRibbonBusy(HEADER_DISTANCE);

    await new Promise((resolve) => setTimeout(resolve, 0));
    await settle();

    expect(harness.wrapper.findComponent(HeaderDistanceDialog).props('busy')).toBe(false);
    expect((document.querySelector('.hd-btn-primary') as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('הנעילה בזמן שפעולה באוויר', () => {
  it('לחיצה שנייה בזמן שהראשונה לא חזרה אינה נקלטת', async () => {
    // זו המלכודת שנמדדה בגל 9: הפעולות כאן קוראות את מצב המקטע ואז משנות
    // אותו, והקריאה חוצה גבול macrotask. פעולה שנייה שנקלטת בזמן הזה פועלת
    // על תצלום שכבר אינו נכון. הנעילה, ולא בדיקה נוספת, היא מה שסוגר את זה.
    // `deferred` נותן קבלה שנפתרת מעבר לגבול macrotask — בדיוק החלון שנמדד.
    const superdoc = createSuperdocDouble({ deferred: ['sections.setLineNumbering'] });
    const harness = mountUi(LayoutTab, { superdoc });
    await settle();

    await chooseFromMenu(harness, LINE_NUMBERS, 'רציף');
    expect(superdoc.inputs('sections.setLineNumbering')).toHaveLength(1);

    // הפקדים מנוטרלים כל עוד הפעולה באוויר — כולל פקדים אחרים בלשונית.
    const borders = harness.wrapper
      .findAll('button')
      .find((item) => item.text().includes('גבולות עמוד'));
    expect(borders?.attributes('disabled')).toBeDefined();

    // וגם הפקד עצמו — כלומר לחיצה שנייה אינה יכולה להיקלט בכלל: הכפתור
    // מנוטרל, ולכן התפריט אינו נפתח ואין מה לבחור בו.
    const lineNumbers = harness.wrapper.find(tipSelector(LINE_NUMBERS));
    expect(lineNumbers.attributes('disabled')).toBeDefined();
    await lineNumbers.trigger('click');
    await settle();
    expect(harness.wrapper.findAll('[role="menuitem"]')).toEqual([]);
    expect(superdoc.inputs('sections.setLineNumbering')).toHaveLength(1);

    await new Promise((resolve) => setTimeout(resolve, 0));
    await settle();

    expect(
      harness.wrapper.findAll('button').find((item) => item.text().includes('גבולות עמוד'))
        ?.attributes('disabled'),
    ).toBeUndefined();
  });
});
