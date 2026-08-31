/**
 * בדיקת איות תורנית — הצד שאינו תלוי במנוע.
 *
 * המילון עצמו הוא הקושי, לא האלגוריתם: מילון עברי כללי מסמן כשגיאה כל ראשי
 * תיבות תורניים (רש״י, אאמו״ר, ע״פ), וזו בדיוק רוב אוצר המילים של מי שכותב
 * חידושים. הרשימה כאן נבנתה מטקסט תורני ומונה 102,465 ערכים.
 *
 * המודול הזה **אינו** נוגע ב-DOM ואינו יודע דבר על SuperDoc: הוא מקבל טקסט
 * ומחזיר טווחים. הסימון עצמו — decorations בעורך — הוא הצד שחייב להיכתב מול
 * המנוע, והוא מכוון להיכתב בנפרד. ההפרדה הזו היא גם מה שמאפשר לכסות את
 * הלוגיקה בבדיקות בלי להרים את מנוע ה-DOCX.
 */

/**
 * תחיליות דקדוקיות. **זו לא אופטימיזציה — בלעדיה הבדיקה חסרת ערך.**
 *
 * שני הכיוונים נדרשים, ומדידה על טקסט תורני מראה כמה:
 *
 * - **הוספה** — המילון נבנה בהדבקת התחיליות על שורשים, והשורש החשוף לא תמיד
 *   נכנס כערך בפני עצמו. „שבת” נמצא רק דרך „ושבת”.
 * - **הסרה** — וההפך: „ועיין”, „שכתב”, „ותירצו” אינן ערכים, אבל „עיין”,
 *   „כתב” ו„תירצו” כן. שתי תחיליות רצופות נפוצות מאוד („שהתוספות” = ש+ה+…),
 *   ולכן ההסרה חוזרת פעמיים.
 *
 * הוספה בלבד נותנת 71.9% על פסקאות תורניות לדוגמה; עם ההסרה — 94.7%.
 */
const PREFIXES = ['ד', 'ו', 'ב', 'כ', 'ל', 'מ', 'ה', 'ש'] as const;

/** כמה תחיליות רצופות מותר להסיר. שתיים מכסות את „שה…” ו„וב…”. */
const MAX_STRIPPED_PREFIXES = 2;

/** ניקוד וטעמים. מוסרים לפני ההשוואה — המילון אינו מנוקד. */
const DIACRITICS = /[֑-ׇ]/g;

/**
 * מילה עברית: אות עברית ואחריה אותיות, ניקוד, גרשיים וגרש.
 *
 * הגרשיים הם חלק מהמילה ולא גבול שלה — „רש״י” היא מילה אחת, וביטוי שמפצל
 * עליה היה מסמן שתי שגיאות במקום ערך מוכר אחד.
 */
const HEBREW_WORD = /[א-ת][א-ת֑-ׇ'"׳״‍]*/g;

/** טווח של מילה שלא נמצאה במילון, ביחס לתחילת הטקסט שנמסר. */
export interface Misspelling {
  word: string;
  start: number;
  end: number;
}

/**
 * מנרמלת מילה לצורה שהמילון מחזיק: בלי ניקוד, ועם גרשיים ישרים.
 *
 * הגרשיים הטיפוגרפיים (״ ו-׳) הם מה שמקלדת עברית מייצרת, והמילון נכתב
 * בישרים. בלי האיחוד הזה כל ראשי התיבות היו מסומנים כשגיאה — כלומר בדיוק
 * המקרה שהמילון הזה קיים בשבילו.
 */
export function normalizeWord(word: string): string {
  return word
    .replace(DIACRITICS, '')
    .replace(/״/g, '"')
    .replace(/׳/g, "'");
}

/** המילון: הרשימה הקבועה, ומה שהמשתמש הוסיף. */
export interface Dictionary {
  has(word: string): boolean;
}

/**
 * בונה מילון משתי רשימות. `user` נפרד מ-`base` כדי שהוספה של המשתמש תישמר
 * בלי להעתיק 102,465 ערכים לאחסון.
 */
export function createDictionary(base: Iterable<string>, user: Iterable<string> = []): Dictionary {
  const baseSet = base instanceof Set ? base : new Set(base);
  const userSet = user instanceof Set ? user : new Set(user);
  /** המילה כפי שהיא, או צורה שלה עם תחילית מודבקת. */
  const known = (word: string): boolean => {
    if (baseSet.has(word) || userSet.has(word)) return true;
    return PREFIXES.some((prefix) => baseSet.has(prefix + word));
  };

  return {
    has(word: string): boolean {
      if (known(word)) return true;

      // והכיוון ההפוך: הסרת תחילית שכבר על המילה. מילה בת שתי אותיות אינה
      // מפורקת — מה שנשאר ממנה הוא אות בודדת, וכל אות בודדת הייתה מתקבלת.
      let stem = word;
      for (let depth = 0; depth < MAX_STRIPPED_PREFIXES; depth++) {
        if (stem.length <= 2) break;
        const prefix = PREFIXES.find((candidate) => stem.startsWith(candidate));
        if (prefix === undefined) break;
        stem = stem.slice(prefix.length);
        if (known(stem)) return true;
      }
      return false;
    },
  };
}

/**
 * המילים בטקסט שאינן מוכרות למילון, עם המיקום שלהן.
 *
 * מחזירה טווחים ולא טקסט מסומן, כי הצרכן הוא שכבת ה-decorations של העורך:
 * החלפת צמתים ב-DOM — מה שהמימוש הקודם עשה — נלחמת ב-ProseMirror על אותם
 * צמתים, ומזיזה את הסמן תוך כדי הקלדה.
 */
export function findMisspellings(text: string, dictionary: Dictionary): Misspelling[] {
  const found: Misspelling[] = [];
  HEBREW_WORD.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = HEBREW_WORD.exec(text)) !== null) {
    const word = match[0];
    if (dictionary.has(normalizeWord(word))) continue;
    found.push({ word, start: match.index, end: match.index + word.length });
  }
  return found;
}
