/**
 * „סוגריים לא סגורים” — סריקת הגהה: איתור סוגריים עגולים/מרובעים שאינם
 * מאוזנים. נויד מ-UnclosedParentheses.bas של שולחן העורך — אותו אלגוריתם
 * מחסנית, אותם שלושה סוגי כשל, ושני מצבי הסריקה של המקור (`entireDocument`):
 * פסקה-פסקה, או המסמך כולו כיחידה אחת — אבל במקום „הבא/הבא” עיוור, הסריקה
 * מחזירה את כל הממצאים בבת אחת והדיאלוג מציג רשימה שלחיצה עליה קופצת למקום.
 *
 * לוגיקה טהורה: הסריקה מקבלת בלוקים שכבר נקראו ואינה נוגעת במנוע — בדיוק
 * כמו text-search.ts, ומאותו טעם.
 */
import type { SearchableBlock } from '../text-search';

export type ParenFindingKind = 'open-without-close' | 'close-without-open' | 'mismatched-close';

export const PAREN_FINDING_LABELS: Readonly<Record<ParenFindingKind, string>> = {
  'open-without-close': 'פותח ללא סוגר',
  'close-without-open': 'סוגר ללא פותח',
  'mismatched-close': 'סוגר לא תואם',
};

/**
 * `'paragraph'` — כל פסקה מאוזנת לעצמה (ברירת המחדל של המקור); `'document'` —
 * סוגר בפסקה אחת יכול לסגור פותח מפסקה קודמת, ו„פותח ללא סוגר” מדווח רק
 * בסוף המסמך. המצב השני הוא של ספרים שבהם הערה בסוגריים נמשכת על פני
 * כמה פסקאות.
 */
export type UnclosedScanMode = 'paragraph' | 'document';

export const UNCLOSED_SCAN_MODE_LABELS: readonly { value: UnclosedScanMode; label: string }[] = [
  { value: 'paragraph', label: 'כל פסקה בנפרד' },
  { value: 'document', label: 'המסמך כולו כאחד' },
] as const;

export interface ParenFinding {
  blockId: string;
  /** טווח להצגה/בחירה, בקואורדינטות-הטקסט של הבלוק. */
  start: number;
  end: number;
  kind: ParenFindingKind;
  /** קטע טקסט קצר סביב הממצא, לרשימה בדיאלוג. */
  excerpt: string;
}

const OPENERS = new Set(['(', '[']);
const CLOSERS: Readonly<Record<string, string>> = { ')': '(', ']': '[' };

/** חלון של עד 40 תווים סביב הממצא, עם אליפסות בקצוות חתוכים. */
function excerptAround(text: string, start: number, end: number): string {
  const from = Math.max(0, start - 15);
  const to = Math.min(text.length, end + 25);
  const prefix = from > 0 ? '…' : '';
  const suffix = to < text.length ? '…' : '';
  return `${prefix}${text.slice(from, to)}${suffix}`;
}

/** פותח שממתין לסוגר שלו — עם הבלוק שבו הוא יושב, כי המחסנית עשויה לחצות בלוקים. */
interface OpenParen {
  char: string;
  blockId: string;
  text: string;
  offset: number;
}

function findingAt(block: SearchableBlock, offset: number, kind: ParenFindingKind): ParenFinding {
  return { blockId: block.blockId, start: offset, end: offset + 1, kind, excerpt: excerptAround(block.text, offset, offset + 1) };
}

/**
 * סורקת בלוק אחד על מחסנית נתונה: סוגר תואם מוריד, סוגר על מחסנית ריקה
 * הוא „סוגר ללא פותח”, סוגר מסוג אחר הוא „סוגר לא תואם”. מה שנשאר במחסנית
 * הוא עניינו של הקורא — הוא זה שיודע אם הגיע סוף הפסקה או סוף המסמך.
 */
function scanInto(block: SearchableBlock, stack: OpenParen[], findings: ParenFinding[]): void {
  const text = block.text;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (OPENERS.has(char)) {
      stack.push({ char, blockId: block.blockId, text, offset: i });
      continue;
    }
    const expectedOpener = CLOSERS[char];
    if (!expectedOpener) continue;

    const top = stack[stack.length - 1];
    if (!top) {
      findings.push(findingAt(block, i, 'close-without-open'));
      continue;
    }
    if (top.char === expectedOpener) {
      stack.pop();
      continue;
    }
    findings.push(findingAt(block, i, 'mismatched-close'));
    // כמו במקור: הסוגר הלא-תואם אינו מרוקן את המחסנית — הפותח ממתין לסוגר שלו.
  }
}

/** מה שנשאר פתוח — „פותח ללא סוגר”, במקום שבו נפתח. */
function drainOpen(stack: OpenParen[], findings: ParenFinding[]): void {
  for (const open of stack) {
    findings.push({
      blockId: open.blockId,
      start: open.offset,
      end: open.offset + 1,
      kind: 'open-without-close',
      excerpt: excerptAround(open.text, open.offset, open.offset + 1),
    });
  }
  stack.length = 0;
}

/** סורקת בלוק אחד לעצמו: מה שנשאר פתוח בסוף הפסקה — „פותח ללא סוגר”. */
export function scanBlockForUnclosed(block: SearchableBlock): ParenFinding[] {
  const findings: ParenFinding[] = [];
  const stack: OpenParen[] = [];
  scanInto(block, stack, findings);
  drainOpen(stack, findings);
  findings.sort((a, b) => a.start - b.start);
  return findings;
}

/**
 * סורקת את המסמך כולו כיחידה אחת: המחסנית עוברת מבלוק לבלוק, ופותח
 * מדווח כלא-סגור רק אם לא נסגר עד סוף המסמך. הממצאים בסדר המסמך.
 */
export function scanDocumentAsOne(blocks: readonly SearchableBlock[]): ParenFinding[] {
  const findings: ParenFinding[] = [];
  const stack: OpenParen[] = [];
  for (const block of blocks) scanInto(block, stack, findings);
  drainOpen(stack, findings);

  const order = new Map(blocks.map((block, index) => [block.blockId, index]));
  findings.sort((a, b) => (order.get(a.blockId) ?? 0) - (order.get(b.blockId) ?? 0) || a.start - b.start);
  return findings;
}

/** סורקת את כל הבלוקים בסדר המסמך, לפי המצב שנבחר. */
export function scanForUnclosed(blocks: readonly SearchableBlock[], mode: UnclosedScanMode = 'paragraph'): ParenFinding[] {
  if (mode === 'document') return scanDocumentAsOne(blocks);
  const findings: ParenFinding[] = [];
  for (const block of blocks) findings.push(...scanBlockForUnclosed(block));
  return findings;
}
