/**
 * „תבליטים" ו„מספור" בלשונית „בית" — שני כפתורים מפוצלים.
 *
 * ## הבאג המקורי, שהבדיקה הזאת נולדה בשבילו
 *
 * `HomeTab.vue` השתמש ב-`<RibbonMenuButton>` בתבנית, אבל הקומפוננטה מעולם לא
 * יובאה בסקריפט. Vue משאיר במקרה כזה אלמנט "לא-פתור" — הוא לא נופל, לא זורק,
 * ופשוט לא מרנדר שום `<button>`. `tests/unit/tab-controls.test.ts` (סריקת מקור)
 * וגם `vue-tsc` עוברים על זה בשקט: התבנית תקינה תחבירית, וה-props שהועברו
 * תואמים את ה-interface של הקומפוננטה שהוגדרה במקום אחר. הבדיקה כאן מרכיבה
 * בפועל ומוודאת שהתפריט **קיים ב-DOM** ופתיח, ושבחירה בפריט שלו אכן מגיעה
 * למסמך.
 *
 * ## מה שהשתנה מאז, ומה שנשמר כאן
 *
 * הפעולות האלה ישבו בכפתור „רשימה" נפרד, שלישי לצד שני כפתורי הרשימה
 * הקטנים — כלומר מי שרצה מספור עברי היה צריך לדעת שהוא מסתתר מאחורי כפתור
 * שאינו הכפתור שיצר את הרשימה. עכשיו כל אחד משני הקטנים הוא כפתור מפוצל:
 * הגוף מחיל את הרשימה, והחץ פותח את הפעולות — התבנית של בורר הצבע.
 *
 * שלוש טענות שאינן קוסמטיות ולכן נמדדות:
 *   1. **הגוף עדיין מחיל.** פיצול שמאבד את הלחיצה הרגילה הוא רגרסיה שקטה:
 *      הכפתור נראה בדיוק אותו דבר וכבר לא עושה תבליטים.
 *   2. **החץ פותח ולא מחיל**, ולהפך — שני המסלולים נפרדים.
 *   3. **מספור עברי ראשון בתפריט.** `NUMBER_STYLE_LABELS` הוא מפה שסדרה הוא
 *      סדר ה-numFmt של ECMA-376 (`decimal` בראש), וסדר התצוגה נכתב במפורש
 *      כדי לא לרשת אותו.
 */
import { describe, expect, it } from 'vitest';
import type { VueWrapper } from '@vue/test-utils';
import HomeTab from '../../src/ui/ribbon/tabs/HomeTab.vue';
import { NUMBER_STYLE_LABELS } from '../../src/engine/lists';
import { autoUnmount, createSuperdocDouble, mountUi, settle } from './harness';

autoUnmount();

const withSelection = () =>
  createSuperdocDouble({ selection: { hasRange: true, text: 'טקסט נבחר' } });

/** שני הכפתורים המפוצלים, בסדר שהם יושבים בו בשורה: תבליטים ואז מספור. */
const BULLET = 0;
const NUMBER = 1;

/**
 * `.ribbon-menu` הוא ה-root class של RibbonMenuButton. אם הקומפוננטה אינה
 * מיובאת, האלמנט הזה פשוט לא קיים — לא שגיאה, לא אזהרה שרואים במבט ראשון,
 * רק 0 תוצאות כאן.
 */
function splits(wrapper: VueWrapper) {
  return wrapper.findAll('.ribbon-menu');
}

/** פותחת את התפריט של אחד הכפתורים ומחזירה את תוויות הפריטים שבו. */
async function openMenu(wrapper: VueWrapper, index: number): Promise<string[]> {
  const arrow = splits(wrapper)[index].find('.word-split__arrow');
  expect(arrow.exists(), 'לחץ החץ של הכפתור המפוצל לא נמצא').toBe(true);
  await arrow.trigger('click');
  await settle();
  return wrapper.findAll('.ribbon-menu__item-label').map((n) => n.text());
}

/** לוחצת על פריט בתפריט הפתוח לפי התווית שלו. */
async function clickItem(wrapper: VueWrapper, label: string): Promise<void> {
  const item = wrapper
    .findAll('.ribbon-menu__item')
    .find((node) => node.find('.ribbon-menu__item-label').text() === label);
  expect(item?.exists(), `הפריט „${label}” לא נמצא בתפריט`).toBe(true);
  await item!.trigger('click');
  await settle();
}

describe('כפתורי הרשימה בלשונית „בית"', () => {
  it('שני הכפתורים מורכבים בפועל ב-DOM — לא אלמנט לא-פתור', async () => {
    const harness = mountUi(HomeTab, { superdoc: withSelection() });
    await settle();

    expect(
      splits(harness.wrapper).length,
      '.ribbon-menu לא נמצא פעמיים — RibbonMenuButton כנראה לא מיובא',
    ).toBe(2);
  });

  it('„רשימה" אינו פקד שלישי נפרד יותר — הפעולות שלו בתוך שני הכפתורים', async () => {
    const harness = mountUi(HomeTab, { superdoc: withSelection() });
    await settle();

    // כפתור גדול נפרד בשם „רשימה" הוא בדיוק מה שאוחד. אם הוא חוזר, הוא יחזור
    // כתווית מרונדרת — ולא כמחרוזת במקור, שסריקה הייתה מוצאת גם בהערה.
    const labels = harness.wrapper.findAll('.btn-label').map((n) => n.text());
    expect(labels).not.toContain('רשימה');
  });

  it('לחיצה על גוף הכפתור מחילה את הרשימה — הפיצול לא בלע את הפעולה', async () => {
    for (const [index, command] of [
      [BULLET, 'bullet-list'],
      [NUMBER, 'numbered-list'],
    ] as const) {
      const harness = mountUi(HomeTab, { superdoc: withSelection() });
      await settle();

      const body = splits(harness.wrapper)[index].find('.word-btn');
      expect(body.exists()).toBe(true);
      await body.trigger('click');
      await settle();

      expect(harness.adapter.calls.map((call) => call.id), command).toContain(command);
      // הגוף מחיל בלבד: תפריט שנפתח בלחיצה עליו היה הופך כל תבליט לשתי לחיצות.
      expect(harness.wrapper.find('.ribbon-menu__popover').exists()).toBe(false);

      harness.wrapper.unmount();
    }
  });

  it('החץ פותח את התפריט ואינו מחיל רשימה', async () => {
    const harness = mountUi(HomeTab, { superdoc: withSelection() });
    await settle();

    const before = harness.adapter.calls.length;
    await openMenu(harness.wrapper, NUMBER);

    expect(harness.wrapper.find('.ribbon-menu__popover').exists()).toBe(true);
    expect(harness.adapter.calls.length).toBe(before);
  });

  it('תפריט המספור מחזיק את כל פעולות הרשימה, ומספור עברי ראשון', async () => {
    const harness = mountUi(HomeTab, { superdoc: withSelection() });
    await settle();

    const labels = await openMenu(harness.wrapper, NUMBER);

    expect(labels.length).toBeGreaterThan(0);
    expect(labels).toContain('התחל מחדש מ-1');
    expect(labels).toContain('המשך מספור קודם');
    expect(labels.some((label) => label.includes('המר לטקסט'))).toBe(true);

    // שני סגנונות המספור העברי הם חלק מהרשימה — engine/lists.ts. התוויות
    // אינן נושאות את המילה „עברי”: הן נבדלות זו מזו בשיטה (גימטריה מול סדר
    // האלף-בית), וזה מה שהמשתמש צריך לבחור לפיו. האותיות עצמן כבר אומרות
    // שזה עברי.
    expect(labels[0], 'גימטריה אינה ראשונה בתפריט').toContain('גימטריה');
    expect(labels[1], 'אלף־בית אינו שני בתפריט').toContain('אלף־בית');
    // ו-„1, 2, 3” — שהיה ראשון כשהסדר נורש מהמפה — אחריהם.
    expect(labels.indexOf('1, 2, 3')).toBeGreaterThan(1);
  });

  it('כל סגנון מספור שהמנוע מכיר נמצא בתפריט', async () => {
    // הסדר נכתב ביד כדי לא לרשת את סדר ה-numFmt, וזה עלה במחיר: הרשימה
    // הידנית אינה נגזרת מהמפה, ולכן סגנון שיתווסף ל-`NUMBER_STYLE_LABELS`
    // פשוט לא יופיע — בלי שגיאה, בלי אזהרה, ובלי דרך לראות זאת בקוד. וגם
    // ההפך: סגנון שיימחק מהרשימה נעלם מהממשק בשקט.
    const harness = mountUi(HomeTab, { superdoc: withSelection() });
    await settle();

    const labels = await openMenu(harness.wrapper, NUMBER);
    const missing = Object.entries(NUMBER_STYLE_LABELS)
      .filter(([, label]) => !labels.includes(label))
      .map(([id, label]) => `${id} (${label})`);

    expect(missing, 'סגנון שהמנוע מכיר ואינו בתפריט').toEqual([]);
  });

  it('תפריט התבליטים אינו מציע סגנונות מספור', async () => {
    const harness = mountUi(HomeTab, { superdoc: withSelection() });
    await settle();

    const labels = await openMenu(harness.wrapper, BULLET);

    expect(labels.some((label) => label.includes('המר לטקסט'))).toBe(true);
    expect(labels).not.toContain('1, 2, 3');
    expect(labels).not.toContain('התחל מחדש מ-1');
  });

  it('בחירת "התחל מחדש מ-1" מגיעה בפועל ל-Document API', async () => {
    const harness = mountUi(HomeTab, { superdoc: withSelection() });
    await settle();

    await openMenu(harness.wrapper, NUMBER);

    const items = harness.wrapper.findAll('.ribbon-menu__item');
    const restartItem = items.find((item) =>
      item.find('.ribbon-menu__item-label').text() === 'התחל מחדש מ-1',
    );
    expect(restartItem?.exists()).toBe(true);

    const before = harness.superdoc.calls.length;
    await restartItem!.trigger('click');
    await settle();

    expect(harness.superdoc.calls.length).toBeGreaterThan(before);
  });
});

/**
 * מי מקבל „צור קודם רשימה” ומי לא (issue #14 ג׳).
 *
 * בחירת סגנון מספור על פסקה רגילה ממספרת אותה קודם — ולכן היא מוסרת
 * ל-`setListNumberStyle` את הפקודה `numbered-list` כ-`createList`. הפריט
 * שבתפריט התבליטים אינו כזה: הוא „הפוך רשימה ממוספרת לתבליטים”, כלומר
 * החלפת סגנון של רשימה **קיימת**, ויצירת התבליטים היא הכפתור שמעליו. אם הוא
 * היה מקבל `createList` הוא היה הופך פסקה רגילה לרשימת תבליטים — כפילות של
 * אותו כפתור, מתחת לתווית שאינה מתארת את מה שקרה.
 *
 * מה שנמדד כאן הוא הפקודה שנשלחה, ולא המסמך: הכפיל אינו מדווח על הבלוק
 * כפריט רשימה אחרי היצירה, ולכן `lists.setLevelNumberStyle` אינו נקרא בשני
 * המסלולים. הבחנה בין הכפיל למסמך אמיתי נמדדת ב-tests/unit/lists.test.ts
 * ובשער `list-caret-qa`.
 */
describe('createList מוסרת לסגנוני מספור בלבד', () => {
  it('בחירת סגנון מספור על פסקה רגילה שולחת את הפקודה `numbered-list`', async () => {
    const harness = mountUi(HomeTab, { superdoc: withSelection() });
    await settle();

    await openMenu(harness.wrapper, NUMBER);
    await clickItem(harness.wrapper, NUMBER_STYLE_LABELS.hebrew1);

    const ids = harness.adapter.calls.map((call) => call.id);
    expect(ids, 'הפסקה לא קיבלה מספור לפני החלת הסגנון').toContain('numbered-list');
    expect(ids, 'סגנון מספור יצר רשימת תבליטים').not.toContain('bullet-list');
  });

  it('„הפוך רשימה ממוספרת לתבליטים” אינו יוצר רשימה על פסקה רגילה', async () => {
    const harness = mountUi(HomeTab, { superdoc: withSelection() });
    await settle();

    await openMenu(harness.wrapper, BULLET);
    await clickItem(harness.wrapper, 'הפוך רשימה ממוספרת לתבליטים');

    const ids = harness.adapter.calls.map((call) => call.id);
    expect(ids, 'פריט ההמרה יצר רשימת תבליטים — כפילות של הכפתור שמעליו').not.toContain(
      'bullet-list',
    );
    expect(ids).not.toContain('numbered-list');
    // ובלי לגעת במסמך: הסירוב היחיד שהמשתמש מקבל.
    const ops = harness.superdoc.calls.map((call) => call.op);
    expect(ops).not.toContain('lists.applyStyle');
    expect(ops).not.toContain('lists.setLevelNumberStyle');
    const failures = harness.failures();
    expect(failures).toHaveLength(1);
    expect(failures[0]!.outcome.ok === false && failures[0]!.outcome.message).toContain(
      'יש למקם את הסמן בתוך רשימה',
    );
  });
});
