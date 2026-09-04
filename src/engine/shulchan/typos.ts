/**
 * „שגיאות מצויות” — ניקוי שגיאות הקלדה נפוצות בכל המסמך. נויד מ-Typos.bas
 * של שולחן העורך: אותן תשע אפשרויות, אותו סדר ריצה, ותרגום נאמן של תבניות
 * ה-wildcards של Word ל-JS (docs/shulchan-haorech.md מתעד את המיפוי).
 *
 * הביצוע: חישוב טהור של עריכות (התאמות regex ⟵ רשימת `TextEdit`) על הטקסט
 * הקנוני של כל בלוק, והחלה נקודתית מהעריכה האחרונה לראשונה דרך
 * `doc.replace` — כך העיצוב סביב כל תיקון נשמר, בניגוד להחלפת בלוק שלם.
 * בין כלל לכלל הטקסט המקומי מעודכן בזיכרון, כדי שהכלל הבא יראה את התוצאה.
 *
 * בסוף הקובץ — „תיקון העתקה מתוכנות” (`FixHebrewPunctuation` במקור), כלי
 * אח שרץ על הבחירה בלבד ומשתמש באותה תשתית עריכות.
 */
import { thrownText } from '../document-api';
import {
  readShulchanBlocks,
  replaceRange,
  scopedBlocks,
  shulchanDoc,
  textTarget,
  unavailableOutcome,
  type ShulchanTarget,
} from './shulchan-doc';

export interface TyposOptions {
  /** מחיקת רווחים כפולים ומעלה. */
  extraSpaces: boolean;
  /** מחיקת פסקאות ריקות. */
  emptyParagraphs: boolean;
  /** רווח לפני סימן פיסוק עובר אל אחריו. */
  spaceBeforePunctuation: boolean;
  /** סימני פיסוק כפולים מצטמצמים לאחד. */
  doublePunctuation: boolean;
  /** ארבע נקודות ומעלה ⟵ שלוש. */
  manyDots: boolean;
  /** רווחים בצד הפנימי של סוגריים. */
  bracketSpaces: boolean;
  /** רווחים בתחילת פסקה ובסופה. */
  paragraphEdgeSpaces: boolean;
  /** זוג גרשים בודדים ('') ⟵ גרשיים ("). */
  doubleApostrophes: boolean;
  /** אות אנגלית אחרי גרשיים — שגיאת Shift במקלדת עברית. */
  shiftedHebrewAfterQuote: boolean;
}

export function defaultTyposOptions(): TyposOptions {
  return {
    extraSpaces: true,
    emptyParagraphs: false,
    spaceBeforePunctuation: true,
    doublePunctuation: true,
    manyDots: true,
    bracketSpaces: true,
    paragraphEdgeSpaces: true,
    doubleApostrophes: false,
    shiftedHebrewAfterQuote: true,
  };
}

/** תווית לכל אפשרות — הנוסח מהתבנית המקורית, לדיאלוג. */
export const TYPOS_OPTION_LABELS: readonly { key: keyof TyposOptions; label: string }[] = [
  { key: 'extraSpaces', label: 'מחיקת רווחים מיותרים' },
  { key: 'emptyParagraphs', label: 'פסקאות ריקות' },
  { key: 'spaceBeforePunctuation', label: 'רווח לפני תווי פיסוק' },
  { key: 'doublePunctuation', label: 'סימני פיסוק כפולים' },
  { key: 'manyDots', label: 'מעל 3 נקודות' },
  { key: 'bracketSpaces', label: 'רווח לפני ואחרי סוגריים' },
  { key: 'paragraphEdgeSpaces', label: 'רווח בתחילת פסקה ובסופה' },
  { key: 'doubleApostrophes', label: 'זוג גרשיים בודדים לגרשיים אחד' },
  { key: 'shiftedHebrewAfterQuote', label: 'אות אנגלית אחרי מרכאות' },
] as const;

/** עריכה אחת בקואורדינטות-הטקסט של הבלוק. */
export interface TextEdit {
  start: number;
  end: number;
  text: string;
}

/**
 * מפת המקשים שמפיקים אות עברית כשה-Shift לחוץ — התו האנגלי שנקלט בטעות
 * אחרי גרשיים, והאות שהמשתמש התכוון אליה. ישירות מ-Typos.bas.
 */
export const SHIFTED_HEBREW_MAP: Readonly<Record<string, string>> = {
  T: 'א', C: 'ב', D: 'ג', S: 'ד', V: 'ה', U: 'ו', Z: 'ז', J: 'ח', Y: 'ט',
  H: 'י', F: 'כ', K: 'ל', N: 'מ', B: 'נ', X: 'ס', G: 'ע', P: 'פ', M: 'צ',
  E: 'ק', R: 'ר', A: 'ש', '>': 'ת', O: 'ם', I: 'ן', '<': 'ץ', L: 'ך',
};

function collectRegexEdits(
  text: string,
  pattern: RegExp,
  replacement: (match: RegExpExecArray) => string,
): TextEdit[] {
  const edits: TextEdit[] = [];
  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
    const replaced = replacement(match);
    if (replaced !== match[0]) edits.push({ start: match.index, end: match.index + match[0].length, text: replaced });
    // התאמה ריקה אינה אפשרית בתבניות כאן, אבל ההגנה זולה.
    if (match[0].length === 0) pattern.lastIndex += 1;
  }
  return edits;
}

/** רווח שעובר מצד אחד של תו לצידו האחר: " X" ⟵ "X " (או "X" בסוף/לפני רווח). */
function swapSpaceAfter(text: string, charClass: string): TextEdit[] {
  return collectRegexEdits(text, new RegExp(` ([${charClass}])`, 'g'), (match) => {
    const after = text[match.index + 2];
    if (after === ' ' || after === undefined) return match[1]!;
    return `${match[1]!} `;
  });
}

const BRACKET_OPENERS = '([';
const BRACKET_CLOSERS = ')]';

/** רווח או קצה פסקה — הצד ה„חיצוני” שאין טעם להוסיף אליו רווח נוסף. */
function isEdgeOrSpace(char: string | undefined): boolean {
  return char === undefined || char === ' ';
}

/**
 * רווח שנוגע בצד הפנימי של סוגר עובר אל צידו החיצוני.
 *
 * פעם אחת על כל **רווח**, ולא שתי סריקות נפרדות של פותחים ושל סוגרים: רווח
 * שנוגע בשניהם — `( )` — נתפס בשתיהן, ושתי העריכות שיצאו משם היו חופפות
 * (`[2,4)` ו-`[3,5)`). ההחלה של השנייה על היסטים שהראשונה כבר הזיזה מחקה
 * את הסוגר מהמסמך, ולא רק מהעותק המקומי: אלה שתי קריאות `doc.replace`.
 * המעבר על הרווחים אינו יכול לייצר חפיפה — טווח של רווח אחד מגיע לכל היותר
 * עד התו שאחריו, ותו יחיד אינו גם פותח וגם סוגר.
 */
function bracketSpaceEdits(text: string): TextEdit[] {
  const edits: TextEdit[] = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== ' ') continue;
    const afterOpener = BRACKET_OPENERS.includes(text[i - 1] ?? '\0');
    const beforeCloser = BRACKET_CLOSERS.includes(text[i + 1] ?? '\0');
    if (!afterOpener && !beforeCloser) continue;

    const start = afterOpener ? i - 1 : i;
    const end = beforeCloser ? i + 2 : i + 1;
    const brackets = `${afterOpener ? text[i - 1] : ''}${beforeCloser ? text[i + 1] : ''}`;
    // הרווח נמחק מבפנים וחוזר בחוץ — אבל רק כשאין שם כבר רווח או קצה פסקה.
    const outerStart = afterOpener && !isEdgeOrSpace(text[start - 1]) ? ' ' : '';
    const outerEnd = beforeCloser && !isEdgeOrSpace(text[end]) ? ' ' : '';
    edits.push({ start, end, text: `${outerStart}${brackets}${outerEnd}` });
  }
  return edits;
}

/** העריכות של כלל אחד על טקסט בלוק אחד. מפתח הכלל ⟵ פונקציה טהורה. */
export function ruleEdits(rule: keyof TyposOptions, text: string): TextEdit[] {
  switch (rule) {
    case 'extraSpaces':
      return collectRegexEdits(text, / {2,}/g, () => ' ');
    case 'spaceBeforePunctuation':
      return swapSpaceAfter(text, '.,:?!');
    case 'doublePunctuation': {
      const runs = collectRegexEdits(text, /[,:!?]{2,}/g, (match) => match[0][match[0].length - 1]!);
      // בדיוק שתי נקודות בין תווים שאינם נקודה ⟵ נקודה אחת (המקבילה ל-"([!.])(..)([!.])").
      const dots = collectRegexEdits(text, /\.{2}(?!\.)/g, () => '.').filter(
        (edit) => text[edit.start - 1] !== '.',
      );
      return [...runs, ...dots];
    }
    case 'manyDots':
      return collectRegexEdits(text, /\.{4,}/g, () => '...');
    case 'bracketSpaces':
      return bracketSpaceEdits(text);
    case 'paragraphEdgeSpaces': {
      const edits: TextEdit[] = [];
      const leading = /^ +/.exec(text);
      if (leading) edits.push({ start: 0, end: leading[0].length, text: '' });
      const trailing = / +$/.exec(text);
      if (trailing && trailing.index >= (leading?.[0].length ?? 0)) {
        edits.push({ start: trailing.index, end: text.length, text: '' });
      }
      return edits;
    }
    case 'doubleApostrophes':
      // גם גרש מסולסל (U+2019) — מעבדי תמלילים ממירים אליו את הגרש הישר
      // תוך כדי הקלדה, ולכן ''רש''י שהוקלד מגיע בפועל כתערובת של השניים.
      return collectRegexEdits(text, /['’]{2}/g, () => '"');
    case 'shiftedHebrewAfterQuote':
      // כל צורות הגרשיים — ישרים, מסולסלים ותחתונים — כי המקור תפס `[""]` ב-Word,
      // שבו המרכאות החכמות כבר הוחלפו. הגרשיים עצמם נשמרים כפי שהם.
      return collectRegexEdits(text, /(["“”„])([A-Z<>])/g, (match) => {
        const fixed = SHIFTED_HEBREW_MAP[match[2]!];
        return fixed ? `${match[1]!}${fixed}` : match[0];
      });
    case 'emptyParagraphs':
      return []; // מטופל ברמת הבלוק — ראו runTypos.
    default:
      return [];
  }
}

/**
 * העריכות בסדר ההחלה — מהאחרונה לראשונה, כך שההיסטים של המוקדמות נשארים
 * תקפים אחרי כל החלה — ובלי חפיפות.
 *
 * הרשת הזאת אינה אמורה לתפוס דבר: כל כלל מייצר עריכות זרות זו לזו. היא כאן
 * מפני שמחיר החפיפה אינו „תוצאה מוזרה” אלא תו שנמחק מהמסמך — שתי קריאות
 * `doc.replace`, והשנייה חלה על היסטים שהראשונה כבר הזיזה. תיקון שלא חל
 * עדיף על סוגר שנעלם.
 */
export function orderedEdits(edits: readonly TextEdit[]): TextEdit[] {
  const kept: TextEdit[] = [];
  let lowestStart = Number.POSITIVE_INFINITY;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    if (edit.end > lowestStart) {
      console.warn('[otzaria-word] עריכה חופפת דולגה בתיקון השגיאות', edit);
      continue;
    }
    kept.push(edit);
    lowestStart = edit.start;
  }
  return kept;
}

/** מחילה עריכות על מחרוזת — לעדכון העותק המקומי בין כלל לכלל. */
export function applyEditsToText(text: string, edits: readonly TextEdit[]): string {
  let result = text;
  for (const edit of orderedEdits(edits)) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return result;
}

/** סדר הריצה — כסדר התבנית המקורית. */
const RULE_ORDER: readonly (keyof TyposOptions)[] = [
  'extraSpaces',
  'emptyParagraphs',
  'spaceBeforePunctuation',
  'doublePunctuation',
  'manyDots',
  'bracketSpaces',
  'paragraphEdgeSpaces',
  'doubleApostrophes',
  'shiftedHebrewAfterQuote',
];

const FAILED = 'תיקון השגיאות נכשל';

export interface TyposResult extends Record<string, unknown> {
  ok: boolean;
  message?: string;
  /** מספר התיקונים שבוצעו בטקסט. */
  fixes: number;
  /** מספר הפסקאות הריקות שנמחקו. */
  removedParagraphs: number;
}

export function typosSummaryText(result: TyposResult): string {
  if (result.fixes === 0 && result.removedParagraphs === 0) return 'לא נמצאו שגיאות לתיקון';
  const parts: string[] = [];
  if (result.fixes > 0) {
    parts.push(result.fixes === 1 ? 'בוצע תיקון אחד' : `בוצעו ${result.fixes} תיקונים`);
  }
  if (result.removedParagraphs > 0) {
    parts.push(
      result.removedParagraphs === 1
        ? 'נמחקה פסקה ריקה אחת'
        : `נמחקו ${result.removedParagraphs} פסקאות ריקות`,
    );
  }
  return parts.join(', ');
}

/**
 * מריצה את הכללים שנבחרו על כל המסמך. עוצרת בכשל הראשון של המנוע —
 * המשך אחרי החלפה שנכשלה היה מחיל עריכות על היסטים שכבר אינם נכונים.
 */
export async function runTypos(host: ShulchanTarget, options: TyposOptions): Promise<TyposResult> {
  const blocks = await readShulchanBlocks(host);
  if (blocks === null) {
    const outcome = unavailableOutcome(FAILED);
    return { ok: false, message: outcome.ok ? undefined : outcome.message, fixes: 0, removedParagraphs: 0 };
  }

  // עותק מקומי חי של הטקסטים: מתעדכן אחרי כל כלל, בלי קריאה חוזרת מהמנוע.
  const texts = new Map<string, string>(blocks.map((block) => [block.blockId, block.text]));
  const alive = new Set<string>(blocks.map((block) => block.blockId));
  let fixes = 0;
  let removedParagraphs = 0;

  for (const rule of RULE_ORDER) {
    if (!options[rule]) continue;

    if (rule === 'emptyParagraphs') {
      const remove = shulchanDoc(host)?.blocks?.delete;
      if (typeof remove !== 'function') {
        return { ok: false, message: `${FAILED}: מחיקת פסקאות אינה זמינה בגרסה זו`, fixes, removedParagraphs };
      }
      for (const block of blocks) {
        if (!alive.has(block.blockId)) continue;
        if (block.nodeType !== undefined && block.nodeType !== 'paragraph') continue;
        if ((texts.get(block.blockId) ?? '') !== '') continue;
        // המסמך חייב להישאר עם בלוק אחד לפחות.
        if (alive.size <= 1) break;
        try {
          await remove({ target: { kind: 'block', nodeType: 'paragraph', nodeId: block.blockId } });
        } catch (error) {
          return { ok: false, message: thrownText(FAILED, error), fixes, removedParagraphs };
        }
        alive.delete(block.blockId);
        removedParagraphs += 1;
      }
      continue;
    }

    for (const block of blocks) {
      if (!alive.has(block.blockId)) continue;
      const text = texts.get(block.blockId) ?? '';
      // רשימה אחת לשני הצדדים: מה שנשלח למנוע ומה שהעותק המקומי מקבל חייבים
      // להיות אותן עריכות בדיוק, אחרת הכלל הבא מחשב על טקסט שאינו במסמך.
      const edits = orderedEdits(ruleEdits(rule, text));
      if (edits.length === 0) continue;

      for (const edit of edits) {
        const outcome = await replaceRange(host, textTarget(block.blockId, edit.start, edit.end), edit.text, FAILED);
        if (!outcome.ok) return { ok: false, message: outcome.message, fixes, removedParagraphs };
        fixes += 1;
      }
      texts.set(block.blockId, applyEditsToText(text, edits));
    }
  }

  return { ok: true, fixes, removedParagraphs };
}

/* ------------------------------------------------------------------ */
/* תיקון העתקה מתוכנות                                                 */
/* ------------------------------------------------------------------ */

/**
 * תווים שהמנוע מייצג בהם מעבר שורה ידני בתוך הטקסט הקנוני של בלוק. `\n`
 * הוא מה שנצפה; `\r` ו-VT (התו שבו Word עצמו מייצג `^l`) נשמרים כרשת ביטחון.
 */
const LINE_BREAK_CHARS = new Set(['\n', '\r', String.fromCharCode(0x0b)]);


/**
 * העריכות של „תיקון העתקה מתוכנות” על טקסט בלוק אחד — `FixHebrewPunctuation`
 * במקור: רווח קשיח (NBSP) הופך לרווח רגיל, **פרט** לרווח קשיח שבא מיד אחרי
 * מעבר שורה ידני (התבנית `([!^l])(^s)` של המקור — שם הוא מחזיק את השורה
 * הריקה, ומחיקתו הייתה מקריסה אותה).
 *
 * התבנית הראשונה של המקור — החלפה-עצמית של סימני הפיסוק (`^&`) כדי לנרמל
 * כיווניות „הפוכה” אחרי הדבקה — אין לה שקילות במנוע: ב-Word ההחלפה כותבת
 * מחדש את מאפייני הכיוון של התו; אצלנו `doc.replace` באותו טקסט הוא no-op.
 */
export function copyFixEdits(text: string): TextEdit[] {
  // התבנית נבנית בכל קריאה: RegExp עם `g` נושא `lastIndex`, ומופע משותף
  // בין קריאות הוא בדיוק סוג התלות שהופכת סדר קריאות לבאג.
  // `fromCharCode` ולא ליטרל, כדי שהתו הבלתי-נראה (U+00A0) לא יאבד בעריכה.
  const nbsp = new RegExp(String.fromCharCode(0xa0), 'g');
  return collectRegexEdits(text, nbsp, (match) => {
    const before = text[match.index - 1];
    return before !== undefined && LINE_BREAK_CHARS.has(before) ? match[0] : ' ';
  });
}

const COPY_FIX_FAILED = 'תיקון ההעתקה נכשל';

export interface CopyFixResult extends Record<string, unknown> {
  ok: boolean;
  message?: string;
  /** מספר הרווחים הקשיחים שהוחלפו. */
  fixes: number;
}

export function copyFixSummaryText(result: CopyFixResult): string {
  if (result.fixes === 0) return 'לא נמצאו רווחים קשיחים להחלפה';
  return result.fixes === 1 ? 'הוחלף רווח קשיח אחד' : `הוחלפו ${result.fixes} רווחים קשיחים`;
}

/** מריצה את התיקון על הפסקאות שבבחירה — התחום של המקור (`Selection.Range`). */
export async function runCopyFix(host: ShulchanTarget): Promise<CopyFixResult> {
  const scoped = await scopedBlocks(host, 'selection', COPY_FIX_FAILED);
  if (!scoped.ok) {
    return { ok: false, message: scoped.outcome.ok ? undefined : scoped.outcome.message, fixes: 0 };
  }

  let fixes = 0;
  for (const block of scoped.result.blocks) {
    for (const edit of orderedEdits(copyFixEdits(block.text))) {
      const outcome = await replaceRange(host, textTarget(block.blockId, edit.start, edit.end), edit.text, COPY_FIX_FAILED);
      if (!outcome.ok) return { ok: false, message: outcome.message, fixes };
      fixes += 1;
    }
  }
  return { ok: true, fixes };
}
