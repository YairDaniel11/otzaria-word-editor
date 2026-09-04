/**
 * מה שהמנוע **קיבל בפועל** כשלחצו על הפקד.
 *
 * זה החלק שאף בדיקה לא כיסתה: בדיקת החוזה
 * (tests/contract/command-payloads.test.ts) מריצה את `fontFamilyPayload(...)`
 * מול הוולידטורים האמיתיים ומוכיחה שהצורה נכונה — אבל היא אינה יודעת אם
 * הלחיצה על הבורר מגיעה לשם בכלל. הבדיקה שאמורה הייתה לכסות את זה
 * (`ribbon-commands.test.ts`) הריצה mock שהחזיר `true` לכל דבר, ולכן אישרה
 * בירוק בדיוק את חמש הצורות ששבורות.
 *
 * כאן הפקד מורכב ונלחץ, וה-payload שהאדפטר קיבל עובר דרך הוולידטורים של
 * superdoc עצמו (ראו harness.ts). „בדיקת הבקרה” שבסוף הקובץ היא מה שמוכיח
 * שהשער הזה אינו קוסמטי: היא מריצה בו את חמש הצורות שהיו, ומאמתת שהוא דוחה
 * אותן.
 */
import { describe, expect, it } from 'vitest';
import HomeTab from '../../src/ui/ribbon/tabs/HomeTab.vue';
import InsertTab from '../../src/ui/ribbon/tabs/InsertTab.vue';
import ReviewTab from '../../src/ui/ribbon/tabs/ReviewTab.vue';
import ViewTab from '../../src/ui/ribbon/tabs/ViewTab.vue';
import ColorPickerPopover from '../../src/ui/ribbon/common/ColorPickerPopover.vue';
import {
  autoUnmount,
  buttonByTip,
  createCommandDouble,
  mountUi,
  setPicker,
  settle,
  tipSelector,
} from './harness';

autoUnmount();

describe('גופן', () => {
  it('בחירה בבורר הגופן שולחת את שם הגופן — לא `{ fontFamily }`', async () => {
    const harness = mountUi(HomeTab);
    await settle();

    await setPicker(harness.wrapper, 'גופן', 'TaameyDavidCLM');
    await settle();

    expect(harness.adapter.payloads('font-family')).toEqual(['TaameyDavidCLM']);
    expect(harness.adapter.rejected).toEqual([]);
    // issue #14 (א): הבחירה מחזירה את המיקוד למסמך — פעם אחת, מהפקד עצמו.
    // ההקלדה שאחריה נכנסת לטקסט בגופן שנבחר, ולא לתיבת החיפוש.
    expect(harness.superdoc.ops().filter((op) => op === 'focus')).toEqual(['focus']);
  });

  it('בחירה בבורר הגודל שולחת מספר נקודות — לא `{ fontSize }`', async () => {
    const harness = mountUi(HomeTab);
    await settle();

    await setPicker(harness.wrapper, 'גודל גופן', '16');
    await settle();

    expect(harness.adapter.payloads('font-size')).toEqual([16]);
    expect(harness.adapter.rejected).toEqual([]);
    expect(harness.superdoc.ops().filter((op) => op === 'focus')).toEqual(['focus']);
  });

  it('גודל שהוקלד ואינו בסולם מגיע למנוע כפי שהוקלד', async () => {
    // סולם Word מדלג: אחרי 12 בא 14, ואחרי 48 בא 72. הגדלים שבין לבין —
    // 13, 71, וגם 10.5 — קיימים במסמכים אמיתיים, ובבורר סגור לא הייתה שום
    // דרך להגיע אליהם. 71 במיוחד: הוא שכן של 72 שברשימה, ולכן קל להניח
    // שהוא „כמעט” נגיש דרכה, והוא אינו.
    const harness = mountUi(HomeTab);
    await settle();

    await setPicker(harness.wrapper, 'גודל גופן', '13');
    await setPicker(harness.wrapper, 'גודל גופן', '71');
    await setPicker(harness.wrapper, 'גודל גופן', '10.5');
    await settle();

    expect(harness.adapter.payloads('font-size')).toEqual([13, 71, 10.5]);
    expect(harness.adapter.rejected).toEqual([]);
  });

  it('גודל שהוקלד מהודק לטווח שהמסמך מכיר', async () => {
    const harness = mountUi(HomeTab);
    await settle();

    await setPicker(harness.wrapper, 'גודל גופן', '5000');
    await settle();

    expect(harness.adapter.payloads('font-size')).toEqual([1638]);
  });

  it('הקלדה שאינה גודל אינה שולחת דבר', async () => {
    const harness = mountUi(HomeTab);
    await settle();

    await setPicker(harness.wrapper, 'גודל גופן', 'גדול');
    await settle();

    expect(harness.adapter.payloads('font-size')).toEqual([]);
    expect(harness.adapter.rejected).toEqual([]);
  });

  it('„הגדל גופן” מחשב מהערך שהמנוע דיווח, ולא ממספר מקומי', async () => {
    // זו הייתה תקלה נפרדת: הבורר היה ref שאותחל ל-12 ולא התעדכן, ולכן על טקסט
    // ב-20pt הלחיצה שלחה 14.
    const adapter = createCommandDouble();
    adapter.setState('font-size', { value: 20 });

    const harness = mountUi(HomeTab, { adapter });
    await settle();

    await buttonByTip(harness.wrapper, 'הגדל גופן').trigger('click');
    await buttonByTip(harness.wrapper, 'הקטן גופן').trigger('click');
    await settle();

    // סולם הגדלים של Word: מעל 20 בא 24, ומתחת ל-20 בא 18.
    expect(adapter.payloads('font-size')).toEqual([24, 18]);
  });
});

describe('צבע', () => {
  it('שבב מהפלטה שולח `{ value: "#RRGGBB" }` — לא `{ color }`', async () => {
    const harness = mountUi(HomeTab);
    await settle();

    // בורר צבע הגופן הוא השני; הראשון הוא צבע הסימון.
    const picker = harness.wrapper.findAllComponents(ColorPickerPopover)[1];
    await picker.find('button[data-tip-title="בחירת צבע"]').trigger('click');
    // המשבצת מזוהה בקוד שלה, שירד ל-`data-tip-desc`; הכותרת היא השם.
    await picker.find('button[data-tip-desc="#c00000"]').trigger('click');
    await settle();

    expect(harness.adapter.payloads('text-color')).toEqual([{ value: '#C00000' }]);
    expect(harness.adapter.rejected).toEqual([]);
  });

  it('„ללא צבע” שולח `{ value: null }` — לא מחרוזת ריקה', async () => {
    // `{ color: '' }` היה הכשל החמור מכולם: הכפתור נראה כאילו הוא מנקה, והמנוע
    // דחה אותו סגור — כלומר לא ניקה כלום.
    const harness = mountUi(HomeTab);
    await settle();

    const picker = harness.wrapper.findAllComponents(ColorPickerPopover)[1];
    await picker.find('button[data-tip-title="בחירת צבע"]').trigger('click');
    await picker.find('.palette-clear-btn').trigger('click');
    await settle();

    expect(harness.adapter.payloads('text-color')).toEqual([{ value: null }]);
    expect(harness.adapter.rejected).toEqual([]);
  });

  it('הכפתור הראשי של הסימון מחיל את צבע ברירת המחדל', async () => {
    const harness = mountUi(HomeTab);
    await settle();

    await harness.wrapper
      .find('button[data-tip-title="צבע סימון טקסט"]')
      .trigger('click');
    await settle();

    expect(harness.adapter.payloads('highlight-color')).toEqual([{ value: '#FFFF00' }]);
  });
});

describe('פסקה', () => {
  it('כל יישור שולח את המפתח ש-`unwrapScalar` מכיר', async () => {
    const harness = mountUi(HomeTab);
    await settle();

    const buttons = [
      ['יישור לימין', 'right'],
      ['מרכז', 'center'],
      ['יישור לשמאל', 'left'],
      ['יישור לשני הצדדים', 'justify'],
    ] as const;

    for (const [title] of buttons) {
      await buttonByTip(harness.wrapper, title).trigger('click');
    }
    await settle();

    expect(harness.adapter.payloads('text-align')).toEqual(
      buttons.map(([, alignment]) => ({ alignment })),
    );
    expect(harness.adapter.rejected).toEqual([]);
  });

  it('מרווח השורות שולח מכפיל, והמנוע ממיר אותו ל-240ths', async () => {
    const harness = mountUi(HomeTab);
    await settle();

    await setPicker(harness.wrapper, 'מרווח בין שורות', '1.5');
    await settle();

    expect(harness.adapter.payloads('line-height')).toEqual([{ lineHeight: 1.5 }]);
    expect(harness.adapter.rejected).toEqual([]);
  });

  it('כרטיס בגלריית הסגנונות שולח `{ style }`', async () => {
    const harness = mountUi(HomeTab);
    await settle();

    await harness.wrapper.find('button[data-tip-title="כותרת 1"]').trigger('click');
    await settle();

    expect(harness.adapter.payloads('linked-style')).toEqual([{ style: 'Heading1' }]);
  });
});

describe('תצוגה ומצב', () => {
  it('„גודל אמיתי” שולח מספר אחוזים — לא `{ zoom: 1 }`', async () => {
    // הזום הוא הפקד שהוכח חי: התווית זזה ל-„150%” ורוחב העמוד בצילום נשאר זהה.
    const harness = mountUi(ViewTab);
    await settle();

    await harness.wrapper.find(tipSelector('הצג את המסמך בגודלו האמיתי (100%)')).trigger('click');
    await settle();

    expect(harness.adapter.payloads('zoom')).toEqual([100]);
    expect(harness.adapter.rejected).toEqual([]);
  });

  it('„עקוב אחר שינויים” מחליף מצב לפי מה שהמנוע מדווח', async () => {
    const adapter = createCommandDouble();
    const harness = mountUi(ReviewTab, { adapter });
    await settle();

    const button = buttonByTip(harness.wrapper, 'הפעלת מצב מעקב אחר שינויים במסמך');
    await button.trigger('click');
    await settle();
    expect(adapter.payloads('document-mode')).toEqual([{ mode: 'suggesting' }]);

    // המצב מגיע מ-`value` ולא מ-state מקומי, ולכן זו הדרך היחידה להדליק אותו.
    adapter.setState('document-mode', { value: 'suggesting' });
    await settle();

    await buttonByTip(harness.wrapper, 'כיבוי מצב מעקב אחר שינויים').trigger('click');
    await settle();

    expect(adapter.payloads('document-mode')).toEqual([
      { mode: 'suggesting' },
      { mode: 'editing' },
    ]);
    expect(adapter.rejected).toEqual([]);
  });

  it('בורר הטבלה שולח את המידות שנבחרו בגריד', async () => {
    const harness = mountUi(InsertTab);
    await settle();

    await harness.wrapper.find(tipSelector('הוספת טבלה')).trigger('click');
    // הגריד הוא 10×10 בסדר שורות, כלומר שורה 2 עמודה 3 היא התא ה-13.
    await harness.wrapper.findAll('.grid-cell')[12].trigger('click');
    await settle();

    expect(harness.adapter.payloads('table-insert')).toEqual([{ rows: 2, cols: 3 }]);
  });
});

describe('בדיקת הבקרה של הכפיל', () => {
  /**
   * חמש הצורות שהיו במאגר, מורצות ישירות בכפיל. אם הוא מקבל אחת מהן, כל
   * הבדיקות שלמעלה חסרות משמעות — כפיל שמסכים לכל דבר הוא בדיוק מה שאישר
   * אותן בפעם הראשונה.
   */
  const WAS_BROKEN: ReadonlyArray<[string, unknown]> = [
    ['font-family', { fontFamily: 'TaameyDavidCLM' }],
    ['font-size', { fontSize: '16pt' }],
    ['text-color', { color: '#0055FF' }],
    ['text-color', { color: '' }],
    ['zoom', { zoom: 1 }],
  ];

  it('הצורות שהיו נדחות, ואינן נספרות כפקודה שהוחלה', async () => {
    const adapter = createCommandDouble();

    for (const [id, payload] of WAS_BROKEN) {
      const outcome = await adapter.run(id, payload);
      expect(outcome.ok, `${id} עם ${JSON.stringify(payload)}`).toBe(false);
    }

    expect(adapter.rejected).toHaveLength(WAS_BROKEN.length);
    expect(adapter.applied).toEqual([]);
  });

  it('הצורות הנכונות עוברות — כדי שהדחייה לא תהיה גורפת', async () => {
    const adapter = createCommandDouble();

    for (const [id, payload] of [
      ['font-family', 'TaameyDavidCLM'],
      ['font-size', 16],
      ['text-color', { value: '#0055FF' }],
      ['text-color', { value: null }],
      ['zoom', 100],
    ] as ReadonlyArray<[string, unknown]>) {
      const outcome = await adapter.run(id, payload);
      expect(outcome.ok, `${id} עם ${JSON.stringify(payload)}`).toBe(true);
    }

    expect(adapter.rejected).toEqual([]);
    expect(adapter.applied).toHaveLength(5);
  });
});
