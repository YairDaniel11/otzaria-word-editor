/**
 * חוזה העברות מול המנוע עצמו.
 *
 * העברות של שכבת הכותרות אינה מדברת עם API — היא נשענת על תכונות שמנוע
 * ה-DOCX מסמן בהן את ה-DOM שלו, ועל דקדוק אנגלי שהוא בונה בו תווית אחת. שני
 * הדברים אינם חוזה מתועד, ולכן שדרוג מנוע יכול לשמוט אותם בלי מילה. בלי
 * הבדיקה הזאת התוצאה של שדרוג כזה היא אנגלית שחזרה בשקט אצל המשתמש — או,
 * גרוע מזה, שורה בפאנל שמקבלת את התווית של שכנתה.
 *
 * מה נמדד:
 *   1. כל תכונה ב-HF_HOOKS וכל מזהה שורה ב-HF_OPTION_ROWS עדיין קיימים
 *      באריזת המנוע.
 *   2. דקדוק תווית התג (`[First|Even|Odd] Page <Header|Footer>[ -Section N-]`)
 *      עדיין שם — זה מה שהפרסר של תגי ההמשך נשען עליו.
 *   3. הפאנל עדיין באנגלית, כלומר העברות עוד נחוצה. אם המנוע יתרגם בעצמו
 *      יום אחד, הבדיקה תיפול וזה הסימן למחוק את השכבה הזאת ולא להשאיר שני
 *      תרגומים.
 *   4. `measurementUnit` הוא עדיין הגדרה ציבורית של superdoc, וה-union שלו
 *      זהה למפתחות HF_UNIT_TEXT.
 *   5. חלוקת העבודה בין CSS ל-JS: כל שורה בפאנל מתורגמת בגיליון, ואף עיגון
 *      שה-JS מחזיק אינו מופיע שם.
 *
 * הקריאה היא של מחרוזות תצוגה מהאריזה, לצורך התאמת ממשק בלבד — לא פירוק
 * שלה ולא שינוי שלה. הרישיון של המנוע אוסר את שני אלה, וזו גם הסיבה
 * שהעברות היא שכבה מבחוץ ולא תיקון בחבילה.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  HF_HOOKS,
  HF_OPTION_ROWS,
  HF_TEXTS,
  HF_UNIT_CLASS,
  HF_UNIT_TEXT,
} from '../../src/engine/hf-chrome';
import { MENU_LOCALE_ATTRIBUTE } from '../../src/ui/ribbon/i18n';

/** vitest רץ משורש המאגר. */
const ENGINE = join(process.cwd(), 'node_modules/@superdoc/docx-engine/dist/docx-engine.es.js');
const STYLE_SHEET = join(process.cwd(), 'src/styles/engine-chrome.css');
const SUPERDOC_TYPES = join(process.cwd(), 'node_modules/superdoc/dist/superdoc/src');

/**
 * האריזה מקודדת תווים כ-`\x20`/`▾`, ולכן חיפוש מחרוזת גלויה לא היה
 * מוצא „Different First Page” גם כשהיא שם. הפענוח הוא של רצפי escape
 * במחרוזות — לא ניתוח של הקוד.
 */
const bundle = readFileSync(ENGINE, 'utf8').replace(
  /\\x([0-9a-fA-F]{2})|\\u([0-9a-fA-F]{4})/g,
  (_match, hex: string | undefined, unicode: string | undefined) =>
    String.fromCharCode(parseInt(hex ?? unicode ?? '0', 16)),
);

const sheet = readFileSync(STYLE_SHEET, 'utf8');

/**
 * הגיליון בלי ההערות. הספירות שמתחת מודדות הצהרות, וההערה בקובץ מסבירה
 * מדוע — כלומר מצטטת `justify-content` ו-`display` בתוך פרוזה. גיליון
 * שנספר עם ההערות היה נכשל על שיפור תיעוד ועובר על כלל שנמחק.
 */
const declarations = sheet.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * כללי הפאנל בלבד — אלה שהסלקטור שלהם נושא `data-sd-hf-option`. הגיליון
 * מארח גם עברות ששייכות לחלקים אחרים של chrome המנוע, והספירות כאן מודדות
 * את הפאנל.
 */
const hfRules = declarations
  .split('}')
  .filter((rule) => rule.includes('{') && rule.includes('data-sd-hf-option'));

/** כל קובצי הטיפוסים של superdoc — הנתיב הפנימי אינו חוזה, ולכן סורקים. */
function typeDeclarations(dir = SUPERDOC_TYPES): string {
  let text = '';
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) text += typeDeclarations(full);
    else if (entry.name.endsWith('.d.ts')) text += readFileSync(full, 'utf8');
  }
  return text;
}

describe('העיגונים של שכבת הכותרות', () => {
  it('הקריאה של האריזה אכן הצליחה', () => {
    // שער שקורא קובץ ריק עובר בירוק על כל טענה שאחריו.
    expect(bundle.length).toBeGreaterThan(1_000_000);
    expect(bundle).toContain('v2-hf-options-panel');
  });

  it('כל תכונה שהעברות נשענת עליה קיימת במנוע', () => {
    const missing = Object.values(HF_HOOKS).filter((hook) => !bundle.includes(hook));

    expect(missing).toEqual([]);
  });

  it('ארבע השורות בפאנל עדיין נושאות את אותם מזהים', () => {
    // זה מה שמפריד „לא תורגם” מ„המתג הלא נכון מסומן”: התווית הולכת אחרי
    // המזהה הסמנטי, ולא אחרי המקום בסדר.
    const missing = HF_OPTION_ROWS.filter((row) => !bundle.includes(row));

    expect(missing).toEqual([]);
  });

  it('דקדוק תווית התג עדיין שם', () => {
    // הפרסר של תגי ההמשך נשען עליו — אין עליהם region/variant.
    for (const piece of ['First Page ', 'Even Page ', 'Odd Page ', ' -Section ']) {
      expect(bundle, piece).toContain(piece);
    }
  });

  it('הפאנל של המנוע עדיין באנגלית — כלומר העברות עוד נחוצה', () => {
    // אם אחת מאלה תיעלם, יש להשוות מול המנוע לפני שמשאירים כאן תרגום כפול.
    for (const label of [
      'Different First Page',
      'Different Odd & Even Pages',
      'Header from Top',
      'Footer from Bottom',
      'Header and footer options',
      'Close header and footer',
      'Header and footer controls',
    ]) {
      expect(bundle, label).toContain(label);
    }
  });
});

describe('יחידת המידה', () => {
  it('measurementUnit הוא הגדרה ציבורית של superdoc', () => {
    expect(typeDeclarations()).toMatch(/measurementUnit\?: SuperDocMeasurementUnit;/);
  });

  it('ה-union של היחידות זהה למה שיש לו נוסח עברי', () => {
    // יחידה שלישית שתיווסף למנוע תופיע אצל המשתמש כ-`mm` באמצע עברית. עדיף
    // שתיפול כאן.
    const declaration = /export type SuperDocMeasurementUnit = ([^;]+);/.exec(typeDeclarations());
    expect(declaration).not.toBeNull();

    const units = [...(declaration?.[1] ?? '').matchAll(/'([^']+)'/g)].map((match) => match[1]);
    expect(units.length).toBeGreaterThan(0);
    expect(units.slice().sort()).toEqual(Object.keys(HF_UNIT_TEXT).slice().sort());
  });
});

describe('חלוקת העבודה בין הגיליון ל-JS', () => {
  it('לכל שורה בפאנל יש נוסח עברי בגיליון', () => {
    for (const row of HF_OPTION_ROWS) {
      expect(declarations, row).toContain(row);
    }
    // ארבע תוויות, ולכן ארבעה כללי content — ולא שלושה שנראים כמו ארבעה.
    // מסונן לכללי הפאנל, מאותה סיבה כמו ספירת ההסתרות שמתחת.
    const painted = hfRules.filter((rule) => /content:/.test(rule));
    expect(painted).toHaveLength(HF_OPTION_ROWS.length);
  });

  it('הגיליון מסתיר את הטקסט של המנוע ולא מצייר עליו', () => {
    // בלי ההסתרה שתי התוויות יופיעו זו לצד זו — אנגלית ועברית.
    //
    // הספירה מסוננת לכללי הפאנל בלבד: הגיליון מכיל גם הסתרות שאינן שלו
    // (באנר `edit-rejected`), וספירה על כל הקובץ הייתה הופכת כל כלל חדש
    // לכשל כאן — כלומר שער שנופל על מה שהוא לא מודד.
    const hidden = hfRules.filter((rule) => /display:\s*none/.test(rule));
    expect(hidden).toHaveLength(2);
  });

  it('אף עיגון שה-JS מחזיק אינו מתורגם גם בגיליון', () => {
    // תווית שיש לה שני מקורות הופכת ל„מי כתב אחרון” בין CSS ל-observer.
    const jsOwned = [
      HF_HOOKS.label,
      HF_HOOKS.continuationLabel,
      HF_HOOKS.options,
      HF_HOOKS.exit,
      HF_HOOKS.activeGroup,
      HF_HOOKS.variant,
    ];
    const overlap = jsOwned.filter((hook) => new RegExp(`\\[${hook}`).test(declarations));

    expect(overlap).toEqual([]);
  });

  it('מחלקת יחידת המידה עדיין קיימת במנוע, ומשמשת בשני הצדדים', () => {
    // היחידה היא התא היחיד שאין לו תכונה משלו: המחלקה היא המזהה, ה-JS מחליף
    // בה נוסח והגיליון מתקן בה רוחב (המנוע קובע `width: 18px`, מכויל ל-„cm”).
    expect(bundle).toContain(HF_UNIT_CLASS);
    expect(declarations).toContain(HF_UNIT_CLASS);
  });

  it('שני חצאי העברות נכבים מאותו סימן שפה', () => {
    // רצועה באנגלית עם שכבת כותרות בעברית היא רגרסיה, לא תיקון. שער השפה
    // חייב לחול על **כל** כלל בגיליון: כלל אחד בלי שער נשאר עברי באנגלית.
    const rules = declarations.split('}').filter((rule) => rule.includes('{'));
    const ungated = rules.filter((rule) => !rule.includes(`${MENU_LOCALE_ATTRIBUTE}='en'`));

    expect(ungated).toEqual([]);
    expect(rules.length).toBeGreaterThan(0);
  });

  it('הטקסטים הקבועים אינם ריקים', () => {
    for (const [key, value] of Object.entries(HF_TEXTS)) {
      expect(value.trim(), key).not.toBe('');
    }
  });
});
