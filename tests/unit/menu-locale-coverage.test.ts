/**
 * כיסוי המילון: כל מחרוזת שהרצועה מציגה — יש לה אנגלית.
 *
 * `menuString` נופלת חזרה למקור העברי, ולכן תרגום חסר אינו שובר כלום — הוא
 * פשוט מוצג בעברית למשתמש אנגלי, ואיש אינו רואה זאת בבדיקות. וכך זה קרה:
 * מאז הוספת האנגלית נוספו לרצועה המאקרו, ההשלמה מהספר, ייצוא ל-PDF, תיאורי
 * הטולטיפים בלשונית „בית”, פריטי התפריטים של „פריסה” ובורר הצבעים — כמאה
 * מחרוזות שנשארו עבריות. בדיקת המנגנון (menu-locale.test.ts) לא יכולה לתפוס
 * את זה: היא מודדת מפתח אחד.
 *
 * מה נמדד כאן:
 *   1. כל מחרוזת עברית שמגיעה ל-`menuString` — יש לה ערך במילון.
 *   2. כל מפתח במילון מופיע במקור — מפתח שנשאר אחרי רפקטור הוא קוד מת.
 *
 * הסריקה היא על המקור ולא על ה-DOM מפני שזה מה שמכסה גם מסלולים שאינם
 * מורכבים בבדיקת רכיב: תפריט שנפתח רק כשיש יכולת במנוע, וטולטיפ שמופיע רק
 * במצב כפתור מסוים.
 */
import { describe, expect, it, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { menuString, setMenuLocale } from '../../src/ui/ribbon/i18n';

const SRC = join(process.cwd(), 'src');
const I18N = join(SRC, 'ui', 'ribbon', 'i18n.ts');

afterEach(() => setMenuLocale('he'));

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (path.endsWith('.vue') || path.endsWith('.ts')) out.push(path);
  }
  return out;
}

const HEBREW = /[֐-׿]/;

/** בלי הערות: „‚גופן’ הוא ברירת המחדל” בהערה אינו מחרוזת שמוצגת. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * הקבצים שהמחרוזות שלהם עוברות ב-`menuString`: הרצועה עצמה, ופריטי התפריטים
 * שהיא מקבלת מהמנוע (`PAGE_MARGIN_PRESETS` וחבריו, `NUMBER_STYLE_LABELS`).
 */
const RIBBON = [
  ...walk(join(SRC, 'ui', 'ribbon')).filter((f) => f !== I18N),
  join(SRC, 'engine', 'page-setup.ts'),
  join(SRC, 'engine', 'lists.ts'),
];

const PROP = 'label|tooltip|description|hint|title|menu-tooltip|menu-description';

/**
 * שלושה מסלולים, וכולם מגיעים ל-`menuString`:
 *   1. תכונה קבועה בתבנית — `label="מודגש"`. הסינון של `'`, `(` ו-`{` הוא מה
 *      שמפריד אותה מקישור דינמי (`:label="..."`), שהערך שלו הוא ביטוי.
 *   2. שדה באובייקט — `{ label: 'צר', hint: '1.27 ס"מ מכל צד' }`, פריט תפריט.
 *   3. מחרוזת עברית כלשהי בקוד של הרצועה — טולטיפ שנבנה בפונקציה, תנאי בתוך
 *      קישור דינמי, שם צבע במערך.
 */
function displayed(path: string, source: string): string[] {
  const found = new Set<string>();
  const attribute = new RegExp(`(?<![:\\w-])(?:${PROP})\\s*=\\s*"([^"'{}()]*)"`, 'g');
  for (const match of source.matchAll(attribute)) found.add(match[1].trim());
  for (const match of source.matchAll(new RegExp(`\\b(?:${PROP})\\s*:\\s*'((?:[^'\\\\\\n]|\\\\.)*)'`, 'g')))
    found.add(match[1]);
  if (path.includes(join('ui', 'ribbon'))) {
    for (const match of source.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)) found.add(match[1]);
  }
  return [...found].filter((text) => HEBREW.test(text));
}

/**
 * הודעות המצב אינן מחרוזות תפריט: `report({ message })` מגיע לשורת המצב, שהיא
 * שכבה שאינה מתורגמת כלל (ראו הערת הפתיחה של i18n.ts על גבול התרגום).
 */
function isStatusMessage(text: string, source: string): boolean {
  return source.includes(`message: '${text}'`);
}

describe('כיסוי התרגום לאנגלית', () => {
  it('לכל מחרוזת שהרצועה מציגה יש אנגלית', () => {
    setMenuLocale('en');

    const untranslated: string[] = [];
    for (const path of RIBBON) {
      const source = code(readFileSync(path, 'utf8'));
      for (const text of displayed(path, source)) {
        if (isStatusMessage(text, source)) continue;
        if (menuString(text) === text) untranslated.push(`${path.slice(SRC.length + 1)}: ${text}`);
      }
    }

    expect(untranslated).toEqual([]);
  });

  it('אין במילון מפתח שאינו במקור', () => {
    const dictionary = readFileSync(I18N, 'utf8');
    const body = dictionary.slice(dictionary.indexOf('const EN'), dictionary.indexOf('export function menuString'));
    const keys = [...body.matchAll(/'((?:[^'\\]|\\.)*)':\s*\n?\s*'/g)].map((match) => match[1]);
    const sources = walk(SRC)
      .filter((path) => path !== I18N)
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');

    expect(keys.length).toBeGreaterThan(300);
    expect(keys.filter((key) => !sources.includes(key))).toEqual([]);
  });
});
