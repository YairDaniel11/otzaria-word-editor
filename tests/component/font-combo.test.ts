/**
 * בורר הגופן עם החיפוש (`RibbonCombo`).
 *
 * ההכרעות הטהורות נבדקות ב-`tests/unit/font-search.test.ts`. מה שנבדק **כאן**
 * הוא מה שרק הרכבה יכולה לתפוס: שהמקלדת באמת מחוברת, שהבחירה באמת נפלטת,
 * ושיציאה מהשדה **אינה** מחילה גופן — שלושתם „HTML תקין לחלוטין” בכל סריקת
 * מקור, ושלושתם היו שוברים את הפקד בשקט.
 *
 * ובנוסף רגרסיה אחת שנצפתה בפועל: הרשימה נחתכה בגובה הרצועה. `position` נבדק
 * ולא המראה — jsdom אינו מודד פריסה, אבל הוא כן אומר איזה `position` הוחל,
 * וזו ההבחנה בין „נמדד ב-fixed” לבין „absolute שנחתך”.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick, shallowRef } from 'vue';
import type { SuperDoc } from 'superdoc';
import { ACTIVE_SUPERDOC } from '../../src/engine/document-api';
import RibbonCombo from '../../src/ui/ribbon/common/RibbonCombo.vue';
import type { ComboOption } from '../../src/ui/ribbon/font-search';

const OPTIONS: readonly ComboOption[] = [
  { value: 'Assistant', label: 'Assistant', group: '', hebrew: true },
  { value: 'TaameyDavidCLM', label: 'David (TaameyDavidCLM)', group: '', hebrew: true },
  { value: 'Arial', label: 'Arial', group: '', hebrew: true },
  { value: 'David', label: 'David', group: 'עברית', hebrew: true },
  { value: 'Narkisim', label: 'Narkisim', group: 'עברית', hebrew: true },
  { value: 'Arial Black', label: 'Arial Black', group: 'כל הגופנים', hebrew: false },
];

let combo: VueWrapper;

function open(): Promise<void> {
  return combo.find('input').trigger('focus').then(() => nextTick());
}

async function type(text: string): Promise<void> {
  const input = combo.find('input');
  (input.element as HTMLInputElement).value = text;
  await input.trigger('input');
  await nextTick();
}

const key = (name: string) => combo.find('input').trigger('keydown', { key: name });

const optionValues = () =>
  combo.findAll('[role="option"]').map((el) => el.attributes('data-value'));

const emitted = () => combo.emitted('update:modelValue') as string[][] | undefined;

beforeEach(() => {
  combo = mount(RibbonCombo, {
    props: { modelValue: 'Arial', options: OPTIONS, title: 'גופן' },
  });
});

describe('פתיחה', () => {
  it('הרשימה אינה ב-DOM עד שפותחים — 294 שורות אינן נבנות בכל רינדור', async () => {
    expect(combo.find('[role="listbox"]').exists()).toBe(false);
    await open();
    expect(combo.find('[role="listbox"]').exists()).toBe(true);
  });

  it('התיבה מציגה את הגופן הנוכחי, לא ריקה', () => {
    expect((combo.find('input').element as HTMLInputElement).value).toBe('Arial');
  });

  it('נפתחת על הגופן הנוכחי ולא על ראש הרשימה', async () => {
    // כך „פתח, חץ אחד” מגיע לשכן — ולא קופץ ל-Assistant מכל מקום.
    await open();
    expect(combo.find('[role="option"].active').attributes('data-value')).toBe('Arial');
  });

  it('הקבוצות מוצגות ככותרות ולא כאפשרויות', async () => {
    await open();
    const headings = combo.findAll('.ribbon-combo-group').map((el) => el.text());
    expect(headings).toEqual(['עברית', 'כל הגופנים']);
    expect(optionValues()).toHaveLength(OPTIONS.length);
  });
});

/**
 * הדגימה העברית. הטקסט עצמו הוא `content` של `::before` — jsdom אינו מחשב
 * גיליונות, ולכן מה שנבדק הוא מה שהתבנית כן מכריעה: **אילו** שורות מקבלות
 * אותה, ושהשם הנגיש נשאר השם ולא „אבגד Narkisim”.
 */
describe('דגימת אותיות עבריות', () => {
  const classesOf = (value: string) =>
    combo.find(`[role="option"][data-value="${value}"]`).classes();

  it('רק שורה של גופן שמכסה עברית מקבלת דגימה', async () => {
    await open();
    expect(classesOf('Narkisim')).toContain('hebrew');
    expect(classesOf('Arial')).toContain('hebrew');
    expect(classesOf('Arial Black')).not.toContain('hebrew');
  });

  it('אפשרות בלי הדגל אינה מקבלת דגימה — בורר הגודל, וגופן שאינו מהמנייה', async () => {
    await combo.setProps({ options: [{ value: '12', label: '12' }], modelValue: '12' });
    await open();
    expect(classesOf('12')).not.toContain('hebrew');
  });

  it('השם הנגיש הוא שם הגופן, בלי הדגימה שלפניו', async () => {
    // Chrome מכליל תוכן של `::before` בשם הנגיש, וקורא מסך היה מכריז את
    // אותיות הדגימה לפני כל שם עברי ברשימה.
    await open();
    const option = combo.find('[role="option"][data-value="Narkisim"]');
    expect(option.attributes('aria-label')).toBe('Narkisim');
    expect(combo.find('[role="option"][data-value="Arial Black"]').attributes('aria-label'))
      .toBeUndefined();
  });
});

/**
 * מה שהפקד מוסר לתצוגה החיה. ההחלה עצמה אינה כאן — היא ב-
 * tests/unit/font-preview.test.ts — אבל בלי הפליטות האלה אין לה קלט בכלל,
 * וזו בדיוק תקלה ש„HTML תקין לחלוטין” אינו מראה.
 */
/**
 * הרשימה קופאת ברגע הפתיחה. הרגרסיה שדווחה: התצוגה החיה משנה את הגופנים
 * שהמסמך משתמש בהם, המנוע מרכיב מהם את קבוצת „אחרונים”, וכל שורה שרוחפים
 * מעליה קפצה לראש הרשימה — כלומר השורה שמתחת לעכבר התחלפה באמצע התנועה.
 */
describe('הקפאת הרשימה בזמן שהיא פתוחה', () => {
  it('אפשרויות שהתחלפו תוך כדי אינן משנות את הסדר', async () => {
    await open();
    await combo.setProps({
      options: [{ value: 'Narkisim', label: 'Narkisim', group: '' }, ...OPTIONS],
    });
    expect(optionValues()).toEqual(OPTIONS.map((option) => option.value));
  });

  it('הפתיחה הבאה כבר מציגה את מה שהתחלף', async () => {
    await open();
    const next = [{ value: 'Gisha', label: 'Gisha', group: '' }, ...OPTIONS];
    await combo.setProps({ options: next });
    await combo.find('input').trigger('blur');
    await open();
    expect(optionValues()).toEqual(next.map((option) => option.value));
  });

  it('גם רשימה שנפתחה מהקלדה מוקפאת — לא רק מפתיחה', async () => {
    // המסלול שנמדד: מיקוד בתיבה (נפתח ומוקפא) → לחיצה על החץ (סוגר ומאפס
    // את ההקפאה, והמיקוד **נשאר** בתיבה) → תו אחד. `onInput` פתח את הרשימה
    // בלי להקפיא, ומשם השורות זזות תחת העכבר — בדיוק הרגרסיה שההקפאה נוספה
    // בשבילה.
    await open();
    await combo.find('.ribbon-combo-arrow').trigger('pointerdown');
    await nextTick();
    expect(combo.find('[role="listbox"]').exists()).toBe(false);

    await type('a');
    expect(combo.find('[role="listbox"]').exists()).toBe(true);

    await combo.setProps({
      options: [{ value: 'Aharoni', label: 'Aharoni', group: '' }, ...OPTIONS],
    });
    // „a” תואם ל-Aharoni; רשימה לא מוקפאת הייתה מציגה אותו.
    expect(optionValues()).not.toContain('Aharoni');
  });

  it('והקלדה נוספת אינה מאפסת את ההקפאה שכבר קיימת', async () => {
    await open();
    await type('a');
    await combo.setProps({
      options: [{ value: 'Aharoni', label: 'Aharoni', group: '' }, ...OPTIONS],
    });
    await type('ar');
    expect(optionValues()).not.toContain('Aharoni');
  });
});

describe('פליטות לתצוגה החיה', () => {
  const last = <T,>(rows: T[][]): T[] | undefined => rows[rows.length - 1];
  const previews = () => last((combo.emitted('preview') as (string | null)[][] | undefined) ?? []);
  const ends = () => last((combo.emitted('previewEnd') as boolean[][] | undefined) ?? []);

  it('פתיחה מסמנת את הגופן הנוכחי, וחץ מוסר את השכן', async () => {
    await open();
    expect(previews()).toEqual(['Arial']);
    await key('ArrowDown');
    await nextTick();
    expect(previews()).toEqual(['David']);
  });

  it('עכבר על שורה מוסר אותה', async () => {
    await open();
    await combo.find('[role="option"][data-value="Narkisim"]').trigger('mousemove');
    await nextTick();
    expect(previews()).toEqual(['Narkisim']);
  });

  it('הקלדה מוסרת את ההתאמה הראשונה', async () => {
    await open();
    await type('nar');
    expect(previews()).toEqual(['Narkisim']);
  });

  it('בחירה נסגרת כ„נבחר”, ו-Escape כ„יצא”', async () => {
    await open();
    await combo.find('[role="option"][data-value="Narkisim"]').trigger('pointerdown');
    expect(ends()).toEqual([true]);

    await open();
    await key('Escape');
    expect(ends()).toEqual([false]);
  });

  it('יציאה מהשדה נסגרת כ„יצא” — מה שמחזיר את הגופן שהיה', async () => {
    await open();
    await combo.find('input').trigger('blur');
    expect(ends()).toEqual([false]);
  });
});

describe('חיפוש', () => {
  it('הקלדה מסננת', async () => {
    await open();
    await type('ari');
    expect(optionValues()).toEqual(['Arial', 'Arial Black']);
  });

  it('שאילתה בלי התאמות מציגה הודעה ולא רשימה ריקה בשקט', async () => {
    await open();
    await type('zzzz');
    expect(optionValues()).toEqual([]);
    expect(combo.find('.ribbon-combo-empty').exists()).toBe(true);
  });

  it('אחרי הקלדה הסימון על ההתאמה הראשונה — Enter בלי חץ נוסף', async () => {
    await open();
    await type('nar');
    await key('Enter');
    expect(emitted()?.[0]).toEqual(['Narkisim']);
  });
});

describe('מקלדת', () => {
  it('חץ למטה מזיז את הסימון, ו-Enter מחיל', async () => {
    await open();
    await key('ArrowDown');
    await key('Enter');
    expect(emitted()?.[0]).toEqual(['David']);
  });

  it('Escape סוגר בלי להחיל, והתיבה חוזרת לגופן שהיה', async () => {
    await open();
    await type('nar');
    await key('Escape');
    await nextTick();
    expect(emitted()).toBeUndefined();
    expect(combo.find('[role="listbox"]').exists()).toBe(false);
    expect((combo.find('input').element as HTMLInputElement).value).toBe('Arial');
  });

  it('בחירה בגופן שכבר נבחר אינה פולטת אירוע', async () => {
    // אחרת כל פתיחה-וסגירה הייתה מסמנת את המסמך כמלוכלך.
    await open();
    await key('Enter');
    expect(emitted()).toBeUndefined();
  });
});

describe('עכבר ופוקוס', () => {
  it('לחיצה על שורה מחילה אותה', async () => {
    await open();
    await combo.findAll('[role="option"]')[4].trigger('pointerdown');
    expect(emitted()?.[0]).toEqual(['Narkisim']);
  });

  it('`mousedown` לבדו אינו בוחר — הרשימה מאזינה ל-`pointerdown` בלבד', async () => {
    // ביטול `pointerdown` מדכא בדפדפן את `mousedown` התואם, ולכן מאזין שני על
    // `mousedown` היה חי רק ב-jsdom — ושם היה בוחר פעמיים. הבדיקה מקבעת שיש
    // מאזין אחד, כדי שהכפילות לא תחזור בשם „גם וגם".
    await open();
    await combo.findAll('[role="option"]')[4].trigger('mousedown');
    expect(emitted()).toBeUndefined();
    expect(combo.find('[role="listbox"]').exists()).toBe(true);
  });

  it('בחירת גופן מחזירה פוקוס למסמך דרך ACTIVE_SUPERDOC', async () => {
    const focusSpy = vi.fn();
    const fakeSuperdoc = shallowRef({ focus: focusSpy } as unknown as SuperDoc);
    const wrapper = mount(RibbonCombo, {
      props: { modelValue: 'Arial', options: OPTIONS, title: 'גופן' },
      global: {
        provide: {
          [ACTIVE_SUPERDOC as symbol]: fakeSuperdoc,
        },
      },
    });

    await wrapper.find('input').trigger('focus');
    await nextTick();
    await wrapper.findAll('[role="option"]')[4].trigger('pointerdown');
    expect(focusSpy).toHaveBeenCalledWith({ restoreSelection: true });
  });

  it('יציאה מהשדה סוגרת ואינה מחילה', async () => {
    // הקלדה בלי אישור אינה בחירה — עדיף על להחיל גופן בטעות על טקסט מסומן.
    await open();
    await type('nar');
    await combo.find('input').trigger('blur');
    await nextTick();
    expect(emitted()).toBeUndefined();
    expect(combo.find('[role="listbox"]').exists()).toBe(false);
  });
});

/**
 * המצב השני של הפקד — תיבת ערך (בורר הגודל).
 *
 * מה שנבדק כאן ולא ב-`font-search`: שהסימון האוטומטי אחרי הקלדה **אינו**
 * קורה במצב הזה. זו נקודת החיבור היחידה, והיא גם הבאג היחיד שאפשר להחזיר
 * בטעות — בלעדיה „13” היה מוחל כ„10”, ו-`commitValue` היה מחזיר את הערך
 * הנכון בלי שאיש יקרא לו איתו.
 */
describe('תיבת ערך', () => {
  const SIZES: readonly ComboOption[] = [8, 10, 11, 12, 14, 18].map((size) => ({
    value: String(size),
    label: String(size),
  }));

  /** נרמול מקוצר: מספר בלבד, וכל השאר נדחה. */
  const asSize = (typed: string) =>
    typed.trim() !== '' && Number.isFinite(Number(typed)) ? typed : null;

  beforeEach(() => {
    combo = mount(RibbonCombo, {
      props: { modelValue: '12', options: SIZES, normalize: asSize, title: 'גודל גופן' },
    });
  });

  it('גודל שאינו ברשימה מוחל כפי שהוקלד', async () => {
    await open();
    await type('13');
    await key('Enter');
    expect(emitted()?.[0]).toEqual(['13']);
  });

  it('ואינו נגרר להתאמה הראשונה: „1” הוא 1, לא 10', async () => {
    await open();
    await type('1');
    expect(optionValues()).toEqual(['10', '11', '12', '14', '18']);
    expect(combo.find('[role="option"].active').exists()).toBe(false);
    await key('Enter');
    expect(emitted()?.[0]).toEqual(['1']);
  });

  it('הרשימה עדיין רשימה — חץ ואז Enter בוחרים ממנה', async () => {
    await open();
    await type('1');
    await key('ArrowDown');
    await key('Enter');
    expect(emitted()?.[0]).toEqual(['10']);
  });

  it('קלט שאינו גודל אינו מוחל דבר, והתיבה חוזרת לגודל שהיה', async () => {
    await open();
    await type('גדול');
    await key('Enter');
    await nextTick();
    expect(emitted()).toBeUndefined();
    expect((combo.find('input').element as HTMLInputElement).value).toBe('12');
  });

  it('הודעת „אין התאמה” היא של הפקד הזה, ולא „אין גופן בשם הזה”', async () => {
    combo = mount(RibbonCombo, {
      props: {
        modelValue: '12',
        options: SIZES,
        normalize: asSize,
        emptyText: 'Enter מחיל את הגודל שהוקלד',
      },
    });
    await open();
    await type('13');
    expect(combo.find('.ribbon-combo-empty').text()).toBe('Enter מחיל את הגודל שהוקלד');
  });
});

/**
 * „סיימתי” — האירוע שמי שמרכיב את הפקד מחזיר לפיו את המיקוד למסמך.
 *
 * הסדר מול `update:modelValue` הוא **ההכרעה** ולא פרט: ההחלה צריכה לרוץ
 * כשהמסמך כבר ממוקד והבחירה שוחזרה. נמדד כאן דרך מאזינים אמיתיים, כי
 * `emitted()` של Vue Test Utils מקבץ לפי שם אירוע ואינו שומר סדר ביניהם.
 */
describe('סיום העבודה עם הפקד', () => {
  function withLog(props: Record<string, unknown> = {}) {
    const order: string[] = [];
    combo = mount(RibbonCombo, {
      props: {
        modelValue: 'Arial',
        options: OPTIONS,
        onDone: () => order.push('done'),
        'onUpdate:modelValue': (value: string) => order.push(`value:${value}`),
        ...props,
      },
    });
    return order;
  }

  it('בחירה פולטת „סיימתי” — ולפני הערך', async () => {
    const order = withLog();
    await open();
    await type('nar');
    await key('Enter');
    expect(order).toEqual(['done', 'value:Narkisim']);
  });

  it('גם בחירה בעכבר', async () => {
    const order = withLog();
    await open();
    await combo.findAll('[role="option"]')[4].trigger('pointerdown');
    expect(order).toEqual(['done', 'value:Narkisim']);
  });

  it('Escape הוא סיום גם הוא — מי שוויתר רוצה לחזור לכתוב', async () => {
    const order = withLog();
    await open();
    await type('nar');
    await key('Escape');
    expect(order).toEqual(['done']);
  });

  it('יציאה מהשדה אינה סיום — המשתמש כבר העביר את המיקוד בעצמו', async () => {
    const order = withLog();
    await open();
    await type('nar');
    await combo.find('input').trigger('blur');
    await nextTick();
    expect(order).toEqual([]);
  });

  it('בחירה בערך שכבר נבחר פולטת „סיימתי” בלי ערך', async () => {
    // אחרת „פתחתי, לחצתי על מה שכבר מסומן” היה משאיר את המיקוד ברצועה.
    const order = withLog();
    await open();
    await key('Enter');
    expect(order).toEqual(['done']);
  });
});

describe('רגרסיה: הרשימה נחתכה בגובה הרצועה', () => {
  it('הרשימה ממוקמת ב-fixed ולא ב-absolute', async () => {
    // `.word-ribbon-body` הוא `overflow-y: hidden`, ולכן `absolute` נחתך —
    // מה שנצפה כרשימה של שלוש שורות עם פס גלילה.
    // ראו composables/popover-position.ts.
    await open();
    expect(combo.find('[role="listbox"]').attributes('style')).toContain('position: fixed');
  });
});

/**
 * פס הדגימה — הטקסט שהמשתמש סימן במסמך, בגופן שהסימון עומד עליו.
 *
 * זו התצוגה שנשלחת **במקום** צביעה של המסמך עצמו, אחרי שזו נמדדה כמטעה
 * (`docs/engine-gaps.md`, „תצוגה חיה של גופן”). מה שנבדק כאן הוא מה שאי אפשר
 * לראות בקריאת התבנית: שהפס עוקב אחרי הסימון גם במקלדת ולא רק בעכבר, שהוא
 * אינו הופך לאפשרות שאפשר לבחור, ושבורר הגודל אינו מקבל אותו בכלל.
 */
describe('פס הדגימה', () => {
  const SAMPLED: readonly ComboOption[] = [
    { value: 'David', label: 'David', preview: 'David', hebrew: true },
    { value: 'Narkisim', label: 'Narkisim', preview: 'Narkisim', hebrew: true },
    { value: 'Rubik', label: 'Rubik', preview: 'Rubik', hebrew: true },
  ];

  const bar = () => combo.find('.ribbon-combo-sample');
  const barFamily = () => (bar().element as HTMLElement).style.fontFamily;

  it('בלי טקסט אין פס — וזה בורר הגודל, שאין לו מה להדגים', async () => {
    await open();
    expect(bar().exists()).toBe(false);
    expect(combo.find('[role="listbox"]').classes()).not.toContain('has-sample');
  });

  it('עם טקסט — הפס מציג אותו כשהרשימה פתוחה, ולא לפני כן', async () => {
    await combo.setProps({ sample: 'בראשית ברא' });
    expect(bar().exists()).toBe(false);

    await open();
    expect(bar().text()).toBe('בראשית ברא');
    expect(combo.find('[role="listbox"]').classes()).toContain('has-sample');
  });

  it('הפס מצייר בגופן שהסימון עומד עליו, ועוקב אחרי החצים', async () => {
    // חץ ולא עכבר: `mousemove` הוא המסלול המובן מאליו, וניווט מקלדת הוא זה
    // שנשבר בשקט אם הפס נשען על אירוע העכבר במקום על הסימון עצמו.
    await combo.setProps({ options: SAMPLED, modelValue: 'David', sample: 'שלום' });
    await open();
    expect(barFamily()).toBe('David');

    await key('ArrowDown');
    await nextTick();
    expect(barFamily()).toBe('Narkisim');

    await key('ArrowUp');
    await nextTick();
    expect(barFamily()).toBe('David');
  });

  it('הפס נפתח על הגופן הנוכחי — ולא ריק עד התזוזה הראשונה', async () => {
    await combo.setProps({ options: SAMPLED, modelValue: 'Rubik', sample: 'שלום' });
    await open();
    expect(barFamily()).toBe('Rubik');
  });

  it('גופן שאינו ברשימה — הפס מוצג בגופן הרגיל, ולא ב-`font-family` מומצא', async () => {
    await combo.setProps({ options: SAMPLED, modelValue: 'אין כזה', sample: 'שלום' });
    await open();
    expect(bar().exists()).toBe(true);
    expect(barFamily()).toBe('');
  });

  it('חיפוש בלי התאמות אינו מציג פס — אין אפשרות מסומנת שהוא מדגים', async () => {
    await combo.setProps({ sample: 'בראשית ברא' });
    await open();
    await type('אין גופן כזה בעולם');
    expect(combo.find('.ribbon-combo-empty').exists()).toBe(true);
    expect(bar().exists()).toBe(false);
  });

  it('הפס אינו אפשרות: לא נספר, לא נבחר, ולא מוכרז', async () => {
    // `li` בתוך `listbox` שאינו `presentation` הוא אפשרות לכל דבר — כלומר
    // שורה שהחצים עוצרים עליה ושקורא מסך מונה. והכרזה שלו הייתה קוראת מחדש
    // את הטקסט שהמשתמש עצמו סימן, בכל תזוזת חץ.
    await combo.setProps({ options: SAMPLED, modelValue: 'David', sample: 'שלום' });
    await open();

    expect(optionValues()).toEqual(['David', 'Narkisim', 'Rubik']);
    expect(bar().attributes('role')).toBe('presentation');
    expect(bar().attributes('aria-hidden')).toBe('true');
    expect(bar().attributes('aria-selected')).toBeUndefined();

    await key('ArrowDown');
    await key('ArrowDown');
    await key('ArrowDown');
    await nextTick();
    // גלישה חוזרת לראש הרשימה, ולא נעצרת על הפס.
    expect(combo.find('input').attributes('aria-activedescendant')).toBe(
      combo.find('[role="option"][data-value="David"]').attributes('id'),
    );
  });

  it('`dir="auto"` על הפס — ציטוט לטיני במסמך עברי אינו מקבל את הפיסוק בצד הלא נכון', async () => {
    // הדגימה היא הטקסט של המשתמש, והמעטפת RTL. בלי `dir="auto"` הנקודה של
    // „Hello world.” נוחתת בקצה השמאלי של המחרוזת.
    await combo.setProps({ sample: 'Hello world.' });
    await open();
    expect(bar().attributes('dir')).toBe('auto');
  });
});

describe('נגישות', () => {
  it('התיבה מכריזה על עצמה כ-combobox ומצביעה על הרשימה', async () => {
    const input = combo.find('input');
    expect(input.attributes('role')).toBe('combobox');
    expect(input.attributes('aria-expanded')).toBe('false');

    await open();
    expect(combo.find('input').attributes('aria-expanded')).toBe('true');
    expect(combo.find('input').attributes('aria-controls')).toBe(
      combo.find('[role="listbox"]').attributes('id'),
    );
  });

  it('כפתור החץ נפתח גם בהפעלה שאינה מעכבר', async () => {
    // `pointerdown` לבדו נראה נכון עד שמפעילים אחרת: `click()` תכנותי, והפעלה
    // במקלדת, אינם מייצרים `pointerdown` כלל — כלומר כפתור מת. `detail === 0`
    // הוא מה שמפריד ביניהם ללחיצת עכבר, שכבר טופלה.
    // `element.click()` ולא `trigger`: זו בדיוק ההפעלה שאינה מעכבר — היא
    // מייצרת `detail === 0`, ו-`trigger` אינו יכול לקבוע את השדה הזה.
    (combo.find('.ribbon-combo-arrow').element as HTMLElement).click();
    await nextTick();
    expect(combo.find('[role="listbox"]').exists()).toBe(true);
  });

  it('לחיצת עכבר על החץ אינה נסגרת מיד אחרי שנפתחה', async () => {
    // הרצף האמיתי הוא `pointerdown` ואז `click`. בלי ההבחנה השני היה מבטל את
    // הראשון, והרשימה הייתה מהבהבת במקום להיפתח.
    const arrow = combo.find('.ribbon-combo-arrow').element;
    await combo.find('.ribbon-combo-arrow').trigger('pointerdown');
    arrow.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await nextTick();
    expect(combo.find('[role="listbox"]').exists()).toBe(true);
  });

  it('התיבה נושאת `data-tip-title` — טולטיפ הרצועה, ולפיו גם שערי ה-QA מאתרים אותה', () => {
    // `data-tip-title` ולא `title` נייטיב: זו המערכת שכל שאר פקדי הרצועה
    // משתמשים בה (ui/tooltip), ו-`nameOf` ב-`scripts/qa/qa-api.js` קורא אותה
    // ראשונה. פקד בלי אף אחד מהם הוא פקד שאף שער לא יוכל ללחוץ עליו.
    expect(combo.find('input').attributes('data-tip-title')).toBe('גופן');
    expect(combo.find('input').attributes('aria-label')).toBe('גופן');
  });

  it('`aria-activedescendant` מצביע על השורה המסומנת', async () => {
    await open();
    await key('ArrowDown');
    await nextTick();
    expect(combo.find('input').attributes('aria-activedescendant')).toBe(
      combo.find('[role="option"].active').attributes('id'),
    );
  });

  it('הגופן הנבחר מסומן `aria-selected`, ורק הוא', async () => {
    await open();
    const selected = combo
      .findAll('[role="option"]')
      .filter((el) => el.attributes('aria-selected') === 'true')
      .map((el) => el.attributes('data-value'));
    expect(selected).toEqual(['Arial']);
  });
});
