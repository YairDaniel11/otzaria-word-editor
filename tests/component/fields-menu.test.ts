/**
 * מה שהמנוע **קיבל בפועל** מפריטי התפריט של „מספר עמוד”.
 *
 * הסורק הגנרי ב-ribbon-tabs.test.ts לוחץ על הכפתור העליון של כל פקד ובודק
 * שמשהו קרה. בכפתור תפריט הלחיצה הזאת רק פותחת את הפופאובר — ה-handler של
 * `@select` אינו רץ בכלל, ולכן החלפה בין `'page'` ל-`'count'` ב-InsertTab
 * עברה את כל חבילת הבדיקות בירוק ושתלה `NUMPAGES` בכפתור „מספר עמוד”.
 *
 * כאן הפריט עצמו נלחץ, וה-`instruction` שהגיע ל-`fields.insert` הוא מה
 * שנמדד — כלומר בדיוק המחרוזת שתיכתב לקובץ של המשתמש. הבחירה היא לפי מיקום
 * בפופאובר, ולכן יש גם בדיקה שמקבעת איזו תווית יושבת בכל מיקום: בלעדיה
 * החלפת שתי התוויות ביניהן הייתה עוברת בירוק.
 */
import { describe, expect, it } from 'vitest';
import InsertTab from '../../src/ui/ribbon/tabs/InsertTab.vue';
import { autoUnmount, mountUi, settle, tipStartsSelector } from './harness';

autoUnmount();

/** הפריטים בסדר שבו הם מופיעים בפופאובר, ומה שכל אחד מהם מכניס למסמך. */
const MENU_ITEMS = [
  { label: 'מספר עמוד', instruction: 'PAGE' },
  { label: 'מספר העמודים במסמך', instruction: 'NUMPAGES' },
] as const;

const MENU_BUTTON = tipStartsSelector('הכנסת שדה מספר עמוד');

describe('תפריט „מספר עמוד”', () => {
  it.each(MENU_ITEMS.map((item, index) => ({ index, ...item })))(
    'הפריט „$label” שולח `$instruction`',
    async ({ index, instruction }) => {
      const harness = mountUi(InsertTab);
      await settle();

      await harness.wrapper.find(MENU_BUTTON).trigger('click');
      await settle();

      const items = harness.wrapper.findAll('.ribbon-menu__item');
      expect(items).toHaveLength(MENU_ITEMS.length);
      await items[index].trigger('click');
      await settle();

      const inputs = harness.superdoc.inputs('fields.insert') as { instruction: string }[];
      expect(inputs.map((input) => input.instruction)).toEqual([instruction]);
    },
  );

  it('לכל מיקום בפופאובר יש התווית שהבדיקה שלמעלה מניחה', async () => {
    const harness = mountUi(InsertTab);
    await settle();

    await harness.wrapper.find(MENU_BUTTON).trigger('click');
    await settle();

    expect(harness.wrapper.findAll('.ribbon-menu__item-label').map((node) => node.text())).toEqual(
      MENU_ITEMS.map((item) => item.label),
    );
  });
});
