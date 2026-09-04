/**
 * חוזה ההסתרה של באנר „edit-rejected" של המנוע.
 *
 * superdoc@2.11.0 מצייר הודעת מצב אנגלית מעל בד המסמך גם תחת `ui: false`
 * (issue #3957 במעלה הזרם). ההגנה שלנו היא כלל CSS יחיד ב-engine-chrome.css,
 * והוא נשען על מבנה DOM שאינו חוזה מתועד: תכונה, מחלקת עוטף, ומחרוזת.
 *
 * בלי הבדיקה הזאת שדרוג מנוע יכול לשמוט את שלושתם בשקט, ואז יש שתי אפשרויות
 * ושתיהן שקטות: או שהאנגלית חוזרת למסך, או שנשאר כלל שמסתיר DOM שאינו קיים.
 * מה שנמדד:
 *
 *   1. התכונה `data-superdoc-v2-edit-rejected` ומחלקת העוטף
 *      `superdoc__mutation-status` עדיין קיימות באריזה.
 *   2. ההודעה עדיין אנגלית — כלומר ההסתרה עוד נחוצה. אם SuperDoc יוסיף
 *      הגדרת טקסטים או יכבד `ui: false`, זה הסימן למחוק את הכלל.
 *   3. הכלל אכן קיים בגיליון, ומגודר בשער השפה — למשתמש אנגלי ההודעה
 *      האנגלית של המנוע היא בדיוק מה שצריך, בדיוק כמו בשאר הגיליון.
 *
 * הקריאה היא של מחרוזות תצוגה מהאריזה, לצורך התאמת ממשק בלבד.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MENU_LOCALE_ATTRIBUTE } from '../../src/ui/ribbon/i18n';

/** הבאנר הוא של חבילת `superdoc`, לא של אריזת מנוע ה-DOCX. */
const SHELL = join(process.cwd(), 'node_modules/superdoc/dist/superdoc.es.js');
const STYLE_SHEET = join(process.cwd(), 'src/styles/engine-chrome.css');

const shell = readFileSync(SHELL, 'utf8');
const sheet = readFileSync(STYLE_SHEET, 'utf8');

/** העוגן שהכלל תולה עליו את עצמו. */
export const EDIT_REJECTED_HOOK = 'data-superdoc-v2-edit-rejected';
/** העוטף שמוסתר בפועל — הוא נושא את ה-`position: sticky`. */
export const MUTATION_STATUS_CLASS = 'superdoc__mutation-status';

describe('חוזה באנר edit-rejected', () => {
  it('העוגנים שהכלל נשען עליהם עדיין קיימים באריזת superdoc', () => {
    expect(shell).toContain(EDIT_REJECTED_HOOK);
    expect(shell).toContain(MUTATION_STATUS_CLASS);
  });

  it('ההודעה עדיין אנגלית — כלומר ההסתרה עוד נחוצה', () => {
    // המקף הוא U+2019 באריזה, לא אפוסטרוף ASCII.
    expect(shell).toContain('This edit couldn’t be completed.');
  });

  it('הכלל קיים בגיליון ומגודר בשער השפה', () => {
    const rule = sheet
      .split('\n')
      .find((line) => line.includes(MUTATION_STATUS_CLASS) && line.includes(EDIT_REJECTED_HOOK));
    expect(rule, 'אין בגיליון כלל שמסתיר את הבאנר').toBeTruthy();
    expect(rule).toContain(`:root:not([${MENU_LOCALE_ATTRIBUTE}='en'])`);
  });
});
