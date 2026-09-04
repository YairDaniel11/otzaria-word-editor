/**
 * חוזה סמן כתיבה מהבהב מול המנוע וגיליונות העיצוב.
 *
 * ## מה הבעיה שהחוזה מאמת
 *
 * סמן העריכה של SuperDoc מרונדר כ-`div` הנושא את המחלקה `sd-v2-local-selection-caret`.
 * באריזת המנוע קיימת הגדרת הבהוב (`sd-v2-local-caret-blink`), אולם המנוע מכבה אותה
 * תחת `@media (prefers-reduced-motion: reduce)`. בסביבות Windows רבות (ובפרט במחשבים
 * שבהם אפקטי הנפשה כבויים בהגדרות הנגישות או ביצועי המערכת), הגדרה זו מופעלת כברירת מחדל,
 * והסמן במסמך נשאר קפוא ולא מהבהב.
 *
 * ב-Word (ובכל מעבד תמלילים אמיתי), סמן העריכה תמיד מהבהב כאינדיקטור מיקום והקלדה חיוני.
 * הכלל ב-styles/shell.css כופה את האנימציה עם `!important` ומגדיר את ה-keyframes,
 * ו-styles/print.css מסתיר את הסמן בהדפסה.
 *
 * מה שנמדד:
 *   1. המחלקה `sd-v2-local-selection-caret` עדיין קיימת באריזת המנוע.
 *   2. שם האנימציה `sd-v2-local-caret-blink` עדיין קיים באריזת המנוע.
 *   3. הכלל ב-shell.css מחיל את האנימציה עם `!important` ומגדיר את ה-keyframes.
 *   4. print.css מסתיר את הסמן ואת שכבת הבחירה במדיית print.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = join(process.cwd(), 'node_modules/@superdoc/docx-engine/dist/docx-engine.es.js');
const SHELL_CSS = join(process.cwd(), 'src/styles/shell.css');
const PRINT_CSS = join(process.cwd(), 'src/styles/print.css');

const engineBundle = readFileSync(ENGINE, 'utf8');
const shellCss = readFileSync(SHELL_CSS, 'utf8');
const printCss = readFileSync(PRINT_CSS, 'utf8');

export const CARET_CLASS = 'sd-v2-local-selection-caret';
export const CARET_BLINK_ANIMATION = 'sd-v2-local-caret-blink';

describe('חוזה סמן כתיבה מהבהב', () => {
  it('המחלקות ושמות האנימציה של המנוע עדיין קיימים באריזה', () => {
    expect(engineBundle).toContain(CARET_CLASS);
    expect(engineBundle).toContain(CARET_BLINK_ANIMATION);
  });

  it('shell.css מחיל אנימציית הבהוב על סמן הכתיבה עם !important', () => {
    expect(shellCss).toContain(`.${CARET_CLASS}`);
    expect(shellCss).toMatch(new RegExp(`animation:[^;]*${CARET_BLINK_ANIMATION}[^;]*!important`));
    expect(shellCss).toContain(`@keyframes ${CARET_BLINK_ANIMATION}`);
  });

  it('print.css מסתיר את סמן העריכה בהדפסה', () => {
    expect(printCss).toContain(`.${CARET_CLASS}`);
    expect(printCss).toMatch(new RegExp(`\\.${CARET_CLASS}[^{]*{[^}]*display:\\s*none\\s*!important`));
  });
});
