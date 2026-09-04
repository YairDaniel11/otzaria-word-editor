/**
 * החוזה של הרג'יסטרי. הוא קיים כדי שהמצב שהיה כאן לא יחזור: שתים-עשרה תוויות
 * ברצועה הבטיחו למשתמש קיצור שאין לו מאזין, ואיש לא ידע — כי שום בדיקה לא
 * הצליבה בין שתי הרשימות.
 *
 * הבדיקות שסורקות את המקור עצמו יושבות כאן מאותו טעם כמו
 * tests/unit/engine-boundaries.test.ts: כלל שנשען על זכירה בזמן code review
 * אינו כלל.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  SHORTCUTS,
  SHORTCUT_GROUP_TITLES,
  shortcutsByGroup,
  type Shortcut,
} from '../../src/ui/shortcuts/registry';
import { COMMAND_IDS } from '../../src/engine/capabilities';

const SRC = join(process.cwd(), 'src');

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(full));
    else if (/\.(ts|vue)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) files.push(full);
  }
  return files;
}

/** הערות מוסרות: תיעוד שמסביר מה אסור אינו הפרה. */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/\/\/.*$/gm, '');
}

/** הנתיב תמיד עם `/`, כדי שהבדיקות לא ייפרדו בין Windows לשאר. */
const sources = sourceFiles(SRC).map((path) => ({
  path: relative(SRC, path).split('\\').join('/'),
  text: stripComments(readFileSync(path, 'utf8')),
}));

function hits(pattern: RegExp, skip?: (path: string) => boolean): string[] {
  const found: string[] = [];
  for (const { path, text } of sources) {
    if (skip?.(path)) continue;
    text.split('\n').forEach((line, index) => {
      if (pattern.test(line)) found.push(`${path}:${index + 1}`);
    });
  }
  return found;
}

const REGISTRY = 'ui/shortcuts/registry.ts';

/**
 * הרשומות כטיפוס הרחב. `SHORTCUTS` הוא `as const` כדי לגזור ממנו `ShortcutId`,
 * ולכן כל רשומה היא טיפוס ליטרלי משלה — מה שהופך כל בדיקה גנרית עליהן לצרה
 * של narrowing. הבדיקה כאן היא על החוזה, לא על הליטרלים.
 */
const ENTRIES: readonly Shortcut[] = SHORTCUTS;

/** הצירופים של רשומה. רשומה עם כמה מקשים פיזיים מחזירה אחד לכל מקש. */
function combos(shortcut: Shortcut): string[] {
  const keys =
    shortcut.code === undefined
      ? [`key:${shortcut.key ?? ''}`]
      : typeof shortcut.code === 'string'
        ? [shortcut.code]
        : [...shortcut.code];

  return keys.map((key) =>
    [
      shortcut.ctrl === true ? 'Ctrl' : '',
      shortcut.shift === true ? 'Shift' : '',
      shortcut.alt === true ? 'Alt' : '',
      key,
    ]
      .filter(Boolean)
      .join('+'),
  );
}

describe('חוזה הרשימה', () => {
  it('יש רשומות לבדוק', () => {
    expect(ENTRIES.length).toBeGreaterThan(0);
  });

  it('אין שתי רשומות עם אותו מזהה', () => {
    const ids = ENTRIES.map((shortcut) => shortcut.id);
    expect(ids).toEqual([...new Set(ids)]);
  });

  it('אין שתי רשומות עם אותו צירוף', () => {
    // גם חפיפה חלקית: רשומה עם שני מקשים פיזיים אינה רשאית לחלוק אף אחד מהם.
    const owners = new Map<string, string>();
    const clashes: string[] = [];

    for (const shortcut of ENTRIES) {
      for (const key of combos(shortcut)) {
        const owner = owners.get(key);
        if (owner) clashes.push(`${key}: ${owner} / ${shortcut.id}`);
        else owners.set(key, shortcut.id);
      }
    }

    expect(clashes).toEqual([]);
  });

  it('הכול לפי המקש הפיזי — אין רשומה שנשענת על התו', () => {
    // מדידה מול שלוש פריסות (US, עברית ישנה, עברית סטנדרטית) הראתה שהתו נודד
    // גם הוא: הפריסה העברית ממשקפת את הסוגריים, ו-Shift+`=` הוא „+” בכולן.
    // רשומה חדשה שתשען על `key` חייבת מדידה משלה — ולכן היא נעצרת כאן.
    const byCharacter = ENTRIES.filter((shortcut) => shortcut.key !== undefined).map(
      (shortcut) => shortcut.id,
    );

    expect(byCharacter).toEqual([]);
  });

  it('כל רשומה מריצה בדיוק דבר אחד', () => {
    const broken = ENTRIES.filter((shortcut) => {
      const targets = [shortcut.command, shortcut.action, shortcut.native].filter(Boolean);
      return targets.length !== 1;
    }).map((shortcut) => shortcut.id);

    expect(broken).toEqual([]);
  });

  it('כל פקודת מנוע ברשימה מוכרת ל-registry של היכולות', () => {
    // מזהה שאינו כאן הוא כפתור מת — רק בלי כפתור.
    const unknown = ENTRIES.filter(
      (shortcut) => shortcut.command !== undefined && !COMMAND_IDS.includes(shortcut.command),
    ).map((shortcut) => shortcut.id);

    expect(unknown).toEqual([]);
  });

  it('payload של סגנון נבנה בצורה שהמנוע מקבל', () => {
    // הרשומות בונות `{ style }` דרך `stylePayload`, ולא ביד. הבדיקה שומרת על
    // המפתח ועל צורת המזהה — „Heading 1” עם רווח אינו מה שהמנוע מכיר.
    const styles = ENTRIES.filter((shortcut) => shortcut.command === 'linked-style').map(
      (shortcut) => shortcut.payload,
    );

    expect(styles.length).toBeGreaterThan(0);
    for (const payload of styles) {
      const style = (payload as { style?: unknown } | null)?.style;
      expect(typeof style, JSON.stringify(payload)).toBe('string');
      expect(style as string).toMatch(/^[A-Za-z][A-Za-z0-9]*$/);
    }
  });

  it('לכל רשומה מקש, תווית, תיאור וקבוצה מוכרת', () => {
    for (const shortcut of ENTRIES) {
      expect(shortcut.label.length, shortcut.id).toBeGreaterThan(0);
      expect(shortcut.description.length, shortcut.id).toBeGreaterThan(0);
      expect(Object.keys(SHORTCUT_GROUP_TITLES), shortcut.id).toContain(shortcut.group);
      expect(Boolean(shortcut.code ?? shortcut.key), shortcut.id).toBe(true);
    }
  });

  it('רשומת tab-goto נושאת מיקום שלם וחיובי', () => {
    // הפעולה אחת לשמונה רשומות, וההבדל ביניהן הוא ה-payload בלבד. רשומה
    // בלי מיקום תקין אינה נופלת בשום מקום — `actions.ts` פשוט אינו קורא
    // למטפל, והצירוף נבלע ולא עושה דבר.
    const positions = ENTRIES.filter((shortcut) => shortcut.action === 'tab-goto').map(
      (shortcut) => shortcut.payload,
    );

    expect(positions.length).toBeGreaterThan(0);
    for (const position of positions) {
      expect(typeof position).toBe('number');
      expect(Number.isInteger(position as number)).toBe(true);
      expect(position as number).toBeGreaterThanOrEqual(1);
    }
  });

  it('אין רשומת Alt על מקש בלוח הספרות', () => {
    // ב-Windows `Alt`+ספרה בלוח הספרות היא הזנת תו לפי קוד (Alt-code). רשומה
    // שתופסת אותה גוזלת דרך הקלדה קיימת של תווים, ולא מודיעה על כך לאיש.
    const numpad = ENTRIES.filter(
      (shortcut) =>
        shortcut.alt === true &&
        combos(shortcut).some((combo) => /Numpad\d/.test(combo)),
    ).map((shortcut) => shortcut.id);

    expect(numpad).toEqual([]);
  });

  it('הקיבוץ מכסה את כל הרשומות', () => {
    const grouped = shortcutsByGroup().flatMap((entry) => entry.items);
    expect(grouped).toHaveLength(ENTRIES.length);
  });
});

describe('החוזה מול המקור', () => {
  it('יש קבצי מקור לבדוק', () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it('אין ברצועה תווית קיצור כתובה ביד', () => {
    // `shortcut="Ctrl+B"` היה tooltip בלי מאזין. התווית באה מהרשימה בלבד.
    expect(hits(/\sshortcut="/)).toEqual([]);
  });

  it('אין השוואת event.key לאות בודדת', () => {
    // הנסיגה שהתיקון הזה בא למנוע: בפריסה עברית key הוא תו הפריסה.
    //
    // הרשת רחבה בכוונה. גרסתה הראשונה תפסה רק `.key === 'x'` — מרכאות כפולות,
    // `toUpperCase` והשוואה הפוכה היו עוברות דרכה, וזו ההגנה היחידה מפני
    // חזרת הבאג המרכזי.
    const letter = `['"][a-zA-Z]['"]`;

    expect(
      hits(new RegExp(`\\.key\\s*(?:\\.to(?:Lower|Upper)Case\\(\\))?\\s*===\\s*${letter}`)),
      'השוואה ישירה',
    ).toEqual([]);
    expect(hits(new RegExp(`${letter}\\s*===\\s*\\w+\\.key\\b`)), 'השוואה הפוכה').toEqual([]);
  });

  it('אין תווית קיצור כתובה ביד באף פקד', () => {
    // הליקוי שנמצא ב-QA: `title="בטל Ctrl+Z"` בסרגל הגישה המהירה. הוא לא עבר
    // דרך `RibbonButton`, ולכן בדיקת ה-`shortcut=` לא ראתה אותו — ובמשך שני
    // שלבים הייתה שם תווית שאיש לא הצליב מול הרשימה.
    //
    // מה שנבדק הוא **תווית של פקד** בלבד. הודעה למשתמש שמזכירה צירוף („יש
    // להדביק עם Ctrl+V — המנוע מטפל בו”) היא הוראה ולא הבטחה על binding
    // שלנו, ולכן היא מותרת; engine/clipboard.ts מלא בהן בכוונה.
    const labelWithCombo = /(?::?(?:title|tooltip|aria-label)=)[^\n]*(?:Ctrl|Alt|Shift)\s*\+\s*[A-Za-z0-9[\]]/i;

    expect(hits(labelWithCombo, (path) => path === REGISTRY)).toEqual([]);
  });

  it('אין תווית קיצור כתובה ביד ב-placeholder — למעט דוגמה מפורשת', () => {
    // `placeholder` חמק מהבדיקה שמעל, ו-`TellMeSearch.vue` ניצל את זה בלי
    // כוונה: `placeholder="…(Alt+Q)"`. זו תווית לכל דבר, והיא נכנסת לכלל.
    //
    // **„למשל” הוא היוצא מן הכלל, והוא אמיתי.** ב-`MacrosDialog.vue` יש
    // ארבעה `placeholder="למשל: Ctrl+Alt+1 (רשות)"` — הם מתארים מה שהמשתמש
    // עצמו עומד להקליד בשדה כדי לקשור מאקרו משלו, ואינם מבטיחים דבר על
    // binding שלנו. אותה הבחנה בדיוק שבגללה „יש להדביק עם Ctrl+V” מותרת
    // ב-engine/clipboard.ts: הוראה אינה הבטחה.
    const promiseInPlaceholder =
      /:?placeholder="(?![^"]*למשל)[^"]*(?:Ctrl|Alt|Shift)\s*\+\s*[A-Za-z0-9[\]]/i;

    expect(hits(promiseInPlaceholder, (path) => path === REGISTRY)).toEqual([]);
  });

  it('אין תווית קיצור כתובה ביד בצומת טקסט של תבנית', () => {
    // ההרחבה שסגרה נקודה עיוורת מוכחת: `TellMeSearch.vue` החזיק שלוש תוויות
    // כתובות ביד — `placeholder="…(Alt+Q)"`, `<span>Alt+Q</span>` ו-
    // `<kbd>Ctrl+F</kbd>` — והבדיקה שמעל הייתה ירוקה, מפני שהיא סורקת
    // מאפיינים בלבד. התוויות היו נכונות באותו רגע; מה שהיה שבור הוא ההגנה,
    // וזו בדיוק הנסיגה שהרשימה נבנתה כדי למנוע.
    //
    // מה שנאסר הוא צירוף **בין תגיות**, כלומר טקסט שהמשתמש קורא. מחרוזת
    // בקוד או בהערה אינה נתפסת כאן, וגם לא צריכה — היא אינה הבטחה על binding.
    const textNodeCombo = />\s*(?:Ctrl|Alt|Shift)\s*\+\s*[A-Za-z0-9[\]][^<]*</;

    expect(hits(textNodeCombo, (path) => path === REGISTRY || !path.endsWith('.vue'))).toEqual([]);
  });

  it('קטלוג Tell Me אינו מגדיל את רשימת התוויות הכתובות ביד', () => {
    // רשימת תוויות שנייה היא בדיוק מה שהיה כאן לפני הרשימה הזאת. ב-Tell Me
    // (`ui/shell/tell-me-actions.ts`) היא חזרה בדלת האחורית — 44 שורות
    // `shortcut: '…'` — וארבע מהן כבר נפרדו מהמאזין: „הגדלת/הקטנת גופן”
    // הבטיחו `Ctrl+Shift+.`/`,` מול `Ctrl+]`/`Ctrl+[` שברשימה, „הפעלת מאקרו”
    // הבטיחה `Alt+F9` שאינו קיים כלל, ו„הקלטת מאקרו” הראתה `Alt+F8` — הצירוף
    // של פעולה אחרת (ניהול מאקרו). כלומר לא סכנה תיאורטית אלא סטייה שכבר קרתה.
    //
    // הארבע תוקנו ועוברות דרך `shortcutLabel`. הבדיקה כאן חוסמת **גידול**:
    // המספר יורד כשממירים עוד, ולעולם אינו עולה. היא אינה אוסרת אותן לגמרי
    // מפני שהמזהים שם אינם מזהי הרשימה (`file-save` מול `save`), ולכן ההמרה
    // דורשת טבלת מיפוי ולא החלפה מכנית — חוב מתועד, לא תקלה.
    const CATALOG = 'ui/shell/tell-me-actions.ts';
    const HAND_WRITTEN_TODAY = 40;

    const catalog = sources.find((entry) => entry.path === CATALOG);
    expect(catalog, `${CATALOG} — הקובץ לא נמצא, והבדיקה עברה על ריק`).toBeDefined();
    const written = [...catalog!.text.matchAll(/shortcut: '[^']*'/g)].length;

    expect(written).toBeLessThanOrEqual(HAND_WRITTEN_TODAY);
  });

  it('דיאלוג שסוגר את עצמו ב-Escape עוצר את האירוע', () => {
    // הליקוי שנמצא בסקירה: `FindReplaceDialog` היה היחיד מבין שמונה-עשר
    // הדיאלוגים עם `@keydown.esc` בלי `.stop`. הוא מאפס את מצבו סינכרונית,
    // ואז האירוע ממשיך ל-window — ושם `closeTopmost` כבר אינו רואה חלון
    // פתוח, ונופל לענף הבא. כלומר Escape אחד עשה שתי פעולות: סגר את החיפוש
    // **וגם** יצא ממצב מיקוד.
    //
    // מה שנאסר הוא `$emit` ישיר: הוא אינו יכול לעצור הפצה. מטפל בשם מותר —
    // `RibbonMenuButton` עוצר רק כשהתפריט פתוח, וזו הכרעה שהוא רשאי לעשות.
    expect(hits(/@keydown\.esc(?:ape)?="\s*\$emit/)).toEqual([]);
  });

  it('כל shortcut-id ברצועה קיים ברשימה', () => {
    const ids = new Set<string>(ENTRIES.map((shortcut) => shortcut.id));
    const used = new Set<string>();
    for (const { text } of sources) {
      for (const match of text.matchAll(/shortcut-id="([^"]+)"/g)) used.add(match[1]!);
    }

    expect([...used].filter((id) => !ids.has(id))).toEqual([]);
    // לפחות אחד — אחרת הבדיקה עוברת על ריק ואינה בודקת דבר.
    expect(used.size).toBeGreaterThan(0);
  });
});
