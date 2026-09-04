/**
 * סביבת הבדיקות: jsdom, עם `localStorage` שאכן מגיע ל-global.
 *
 * מ-Node 22 יש ל-Node webstorage משלו, והוא מגדיר `localStorage` ו-
 * `sessionStorage` על `globalThis` כ-accessors שמחזירים `undefined` כל עוד לא
 * הועבר `--localstorage-file`. `populateGlobal` של vitest מעביר מפתחות מחלון
 * ה-jsdom אל ה-global לפי הכלל „אם המפתח כבר קיים ב-global, קח אותו רק אם הוא
 * ברשימת KEYS” — ו-`localStorage` אינו ברשימה. כלומר ברגע ש-Node מגדיר אותו,
 * זה של jsdom נזרק והגלובלי נשאר ה-`undefined` של Node.
 *
 * נמדד על Node 26.8.1: 16 כשלים ב-`macros.test.ts` ו-`macros-finalization.test.ts`,
 * כולם `Cannot read properties of undefined (reading 'clear')`. ב-Node 20 —
 * מה ש-`.nvmrc` וה-CI נועלים — אין ל-Node webstorage, המפתח אינו קיים, והכול
 * עובר. לכן זו תקלה שנראית רק למי שמריץ Node חדש מקומית, וה-CI לעולם לא היה
 * מדווח עליה.
 *
 * מה שנעשה כאן הוא להסיר את ה-accessors של Node **לפני** ההעברה, ואז לתת
 * לסביבת ה-jsdom המקורית לרוץ כרגיל. התוצאה היא בדיוק ההתנהגות שהייתה לפני
 * Node 22, ובפרט ה-`Storage` של jsdom עצמו: הבדיקות מרכיבות כשל אחסון דרך
 * `vi.spyOn(Storage.prototype, 'setItem')`, ולכן מופע שמגיע מחלון jsdom אחר
 * — למשל polyfill שנבנה בקובץ setup — לא היה נתפס על ידו.
 */
import { builtinEnvironments, type Environment } from 'vitest/environments';

const jsdom = builtinEnvironments.jsdom;

export default {
  name: 'jsdom-webstorage',
  transformMode: 'web',
  setup(global, options) {
    for (const key of ['localStorage', 'sessionStorage']) {
      delete (global as Record<string, unknown>)[key];
    }
    return jsdom.setup(global, options);
  },
  setupVM: jsdom.setupVM,
} satisfies Environment;
