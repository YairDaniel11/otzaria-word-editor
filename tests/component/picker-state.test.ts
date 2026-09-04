/**
 * הבוררים ב„בית” מציגים את **המסמך**, לא את מה שהמשתמש ביקש.
 *
 * זו אותה משפחת באגים שתוקנה בזום: הסרגל הזיז את התווית ל-„150%” ורוחב העמוד
 * נשאר זהה, מפני שמישהו כתב את הערך המקומי בלי לחכות לתשובה — ולא החזיר אותו
 * כשהתשובה הייתה „לא”. שלושת הבוררים כאן עשו בדיוק את זה: `lastFamily`,
 * `lastSize` ו-`lastLineHeight` נכתבו לפני `run()` ולא הוחזרו בכשל.
 *
 * הגרוע מכולם היה „הגדל גופן”, מפני שהוא **מחשב מהערך המקומי**: שלוש לחיצות
 * על מסמך שדוחה שלחו 14, 16, 18 — כלומר הפקד התרחק מהמסמך בכל לחיצה, ולחיצה
 * רביעית הייתה מבקשת גודל שאין לו שום קשר לטקסט שהסמן עומד בו.
 *
 * מה שנשמר כאן במקביל הוא ההתנהגות שהבוררים נבנו בשבילה: המנוע מדווח
 * `undefined` גם על בחירה מעורבת, ואז הבורר מציג את „האחרון שידענו” ולא
 * מתרוקן.
 */
import { describe, expect, it } from 'vitest';
import HomeTab from '../../src/ui/ribbon/tabs/HomeTab.vue';
import {
  autoUnmount,
  buttonByTip,
  createCommandDouble,
  mountUi,
  pickerValue,
  setPicker,
  settle,
} from './harness';

autoUnmount();

/**
 * מה שהבורר מציג בפועל ב-DOM.
 *
 * דרך `pickerValue` ולא דרך `<select>` ישירות: בוררי הגופן והגודל הם
 * `input[role="combobox"]` ומרווח השורות נשאר `<select>` — וההבחנה הזאת
 * אינה מה שהבדיקות כאן מודדות.
 */
function shown(harness: ReturnType<typeof mountUi>, title: string): string {
  return pickerValue(harness.wrapper, title);
}

const READONLY = {
  'font-family': 'document-readonly',
  'font-size': 'document-readonly',
  'line-height': 'document-readonly',
};

describe('מסמך שדוחה את הפקודה', () => {
  it('בורר הגופן חוזר לגופן שבמסמך', async () => {
    const harness = mountUi(HomeTab, { adapter: createCommandDouble({ failures: READONLY }) });
    await settle();
    expect(shown(harness, 'גופן')).toBe('Assistant');

    await setPicker(harness.wrapper, 'גופן', 'TaameyDavidCLM');
    await settle();

    // הכשל דווח למשתמש (זה עבד), אבל התיבה הציגה גופן שלא הוחל על כלום.
    expect(harness.failures()).toHaveLength(1);
    expect(shown(harness, 'גופן')).toBe('Assistant');
  });

  it('בורר הגודל חוזר לגודל שבמסמך', async () => {
    const adapter = createCommandDouble({ failures: READONLY });
    adapter.setState('font-size', { value: 20 });

    const harness = mountUi(HomeTab, { adapter });
    await settle();
    expect(shown(harness, 'גודל גופן')).toBe('20');

    await setPicker(harness.wrapper, 'גודל גופן', '36');
    await settle();

    expect(shown(harness, 'גודל גופן')).toBe('20');
  });

  it('בורר מרווח השורות חוזר למרווח שבמסמך', async () => {
    const harness = mountUi(HomeTab, { adapter: createCommandDouble({ failures: READONLY }) });
    await settle();
    const before = shown(harness, 'מרווח בין שורות');

    await setPicker(harness.wrapper, 'מרווח בין שורות', '3.0');
    await settle();

    expect(shown(harness, 'מרווח בין שורות')).toBe(before);
  });

  it('„הגדל גופן” אינו מטפס — כל לחיצה מחשבת מאותו גודל', async () => {
    const adapter = createCommandDouble({ failures: READONLY });
    const harness = mountUi(HomeTab, { adapter });
    await settle();

    for (let click = 0; click < 3; click += 1) {
      await buttonByTip(harness.wrapper, 'הגדל גופן').trigger('click');
      await settle();
    }

    // 12 הוא ברירת המחדל; הבא בסולם של Word הוא 14, ושם זה נעצר.
    expect(adapter.payloads('font-size')).toEqual([14, 14, 14]);
    expect(shown(harness, 'גודל גופן')).toBe('12');
  });

  it('„הקטן גופן” אינו יורד בזחילה', async () => {
    // בלי ערך מהמנוע (בחירה מעורבת, או מסמך שטרם דיווח) הזיכרון המקומי הוא
    // מה שמזין את החישוב — ושם הזחילה הייתה: 11, 10, 9.
    const adapter = createCommandDouble({ failures: READONLY });
    const harness = mountUi(HomeTab, { adapter });
    await settle();

    for (let click = 0; click < 3; click += 1) {
      await buttonByTip(harness.wrapper, 'הקטן גופן').trigger('click');
      await settle();
    }

    expect(adapter.payloads('font-size')).toEqual([11, 11, 11]);
    expect(shown(harness, 'גודל גופן')).toBe('12');
  });
});

/**
 * Y-PLONI#14 סעיף א: „כאשר אני משנה כתב הסמן לא כותב, ולאחר שתי לחיצות על
 * העכבר הוא חוזר לכתב הקודם ומאפשר לכתוב.”
 *
 * שני חצאי המשפט הם אותו גורם: תיבות הגופן הן `input`, הן לוקחות את המיקוד,
 * ואיש לא החזיר אותו. ההקלדה הבאה נכנסה לרצועה („לא כותב”), והחזרה למסמך
 * בלחיצת עכבר קבעה בחירה חדשה שמוחקת עיצוב שהוחל על סמן מכווץ („חוזר לכתב
 * הקודם”).
 *
 * `focus({restoreSelection:true})` הוא מה שמכסה את שניהם, והוא נמדד כאן ולא
 * מונח: כפיל המסמך מתעד את הקריאה ואת מה שהועבר לה.
 */
describe('המיקוד חוזר למסמך', () => {
  it('אחרי בחירת גודל מהתיבה', async () => {
    const harness = mountUi(HomeTab);
    await settle();

    await setPicker(harness.wrapper, 'גודל גופן', '13');
    await settle();

    expect(harness.superdoc.ops()).toContain('focus');
    expect(harness.superdoc.inputs('focus')).toEqual([{ restoreSelection: true }]);
  });

  it('אחרי בחירת גופן מהתיבה', async () => {
    const harness = mountUi(HomeTab);
    await settle();

    await setPicker(harness.wrapper, 'גופן', 'TaameyDavidCLM');
    await settle();

    expect(harness.superdoc.inputs('focus')).toEqual([{ restoreSelection: true }]);
  });

  it('וגם אחרי Escape בתיבה, בלי שהוחל דבר', async () => {
    const harness = mountUi(HomeTab);
    await settle();

    const box = harness.wrapper.find('input[role="combobox"][data-tip-title="גודל גופן"]');
    await box.trigger('focus');
    await box.trigger('keydown', { key: 'Escape' });
    await settle();

    expect(harness.superdoc.ops()).toContain('focus');
    expect(harness.adapter.payloads('font-size')).toEqual([]);
  });

  it('יציאה מהתיבה אינה מחזירה מיקוד — המשתמש כבר בחר לאן ללכת', async () => {
    const harness = mountUi(HomeTab);
    await settle();

    const box = harness.wrapper.find('input[role="combobox"][data-tip-title="גודל גופן"]');
    await box.trigger('focus');
    await box.trigger('blur');
    await settle();

    expect(harness.superdoc.ops()).not.toContain('focus');
  });
});

describe('מסמך שמקבל את הפקודה', () => {
  it('הבורר מגיב מיד, בלי להמתין לדיווח של המנוע', async () => {
    // הבורר הוא פקד ולא דוח: המנוע מדווח א-סינכרונית, ובבחירה מעורבת אינו
    // מדווח ערך בכלל — תיבה שממתינה לו הייתה נראית קפואה.
    const harness = mountUi(HomeTab);
    await settle();

    await setPicker(harness.wrapper, 'גופן', 'Rubik');
    await settle();

    expect(harness.adapter.payloads('font-family')).toEqual(['Rubik']);
    expect(harness.failures()).toEqual([]);
    expect(shown(harness, 'גופן')).toBe('Rubik');
  });

  it('„הגדל גופן” מטפס בסולם כשהמסמך מקבל', async () => {
    const adapter = createCommandDouble();
    const harness = mountUi(HomeTab, { adapter });
    await settle();

    for (let click = 0; click < 3; click += 1) {
      await buttonByTip(harness.wrapper, 'הגדל גופן').trigger('click');
      await settle();
    }

    expect(adapter.payloads('font-size')).toEqual([14, 16, 18]);
  });
});

describe('מה שהמנוע מדווח', () => {
  it('דיווח של המנוע מנצח את הערך שנבחר מקומית', async () => {
    const adapter = createCommandDouble();
    const harness = mountUi(HomeTab, { adapter });
    await settle();

    await setPicker(harness.wrapper, 'גופן', 'Rubik');
    await settle();

    // הסמן זז לטקסט אחר, והמנוע דיווח גופן אחר.
    adapter.setState('font-family', { value: 'FrankRuhlCLM' });
    await settle();

    expect(shown(harness, 'גופן')).toBe('FrankRuhlCLM');
  });

  it('בחירה מעורבת אינה מרוקנת את הבורר — נשאר האחרון שידענו', async () => {
    const adapter = createCommandDouble();
    const harness = mountUi(HomeTab, { adapter });
    await settle();

    adapter.setState('font-family', { value: 'Shofar' });
    await settle();
    expect(shown(harness, 'גופן')).toBe('Shofar');

    // `undefined` = בחירה עם יותר מגופן אחד, או בחירה שטרם נפתרה.
    adapter.setState('font-family', { value: undefined });
    await settle();

    expect(shown(harness, 'גופן')).toBe('Shofar');
  });

  it('גופן שאינו ברשימה מתווסף אליה, כדי שהבורר לא ישקר', async () => {
    const adapter = createCommandDouble();
    adapter.setState('font-family', { value: 'Guttman Yad' });
    const harness = mountUi(HomeTab, { adapter });
    await settle();

    expect(shown(harness, 'גופן')).toBe('Guttman Yad');
  });
});

describe('בחירה שנייה בזמן שהראשונה באוויר', () => {
  it('תשובה מאוחרת אינה מוחקת בחירה טרייה', async () => {
    // בלי השומר `pending.value !== next`, התשובה של הבחירה הראשונה הייתה
    // מנקה את שכבת ה-pending — כלומר הבחירה השנייה נעלמת מהמסך בזמן שהיא
    // עצמה עוד באוויר.
    const adapter = createCommandDouble({
      held: ['font-family'],
      failures: { 'font-family': 'document-readonly' },
    });
    const harness = mountUi(HomeTab, { adapter });
    await settle();

    await setPicker(harness.wrapper, 'גופן', 'Rubik');
    await settle();
    expect(shown(harness, 'גופן')).toBe('Rubik');

    await setPicker(harness.wrapper, 'גופן', 'Shofar');
    await settle();
    expect(shown(harness, 'גופן')).toBe('Shofar');

    // התשובה של „Rubik” חוזרת ראשונה, והיא אינה שלנו יותר.
    adapter.release('font-family');
    await settle();
    expect(shown(harness, 'גופן')).toBe('Shofar');

    // ורק כשהתשובה של „Shofar” חוזרת — והיא כשל — המסמך חוזר להיות המוצג.
    adapter.release('font-family');
    await settle();
    expect(shown(harness, 'גופן')).toBe('Assistant');
  });
});
