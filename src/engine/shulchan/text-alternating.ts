/**
 * „טקסט מתחלף” — הדגשת דיבור-המתחיל: בכל פסקה מודגש הקטע שמתחילתה ועד תו
 * הסיום הראשון, ואחר כך כל קטע שאחרי תו ההתחלה ועד תו הסיום הבא. נויד
 * מ-TextAlternating.bas של שולחן העורך, כולל ברירות המחדל `:` ו-`.` ודילוג
 * על התו שאחרי תו ההתחלה (בדרך כלל הרווח).
 *
 * „תו” ההתחלה והסיום הם בפועל **סטים** של תווים — כמו במקור, שבו
 * `MoveUntil`/`MoveEndUntil` מקבלים מחרוזת שכל תו בה הוא תוחם. כך „. או :
 * או !” הוא סט אחד ולא שלוש ריצות.
 */
import type { CommandOutcome } from '../command-adapter';
import { applyInline, scopedBlocks, textTarget, type ShulchanTarget } from './shulchan-doc';

export interface AlternatingOptions {
  /** תווי ההתחלה של קטע מודגש — כל תו במחרוזת הוא תוחם (ברירת מחדל `:`). */
  startChar: string;
  /** תווי הסיום של קטע מודגש — כל תו במחרוזת הוא תוחם (ברירת מחדל `.`). */
  endChar: string;
}

export function defaultAlternatingOptions(): AlternatingOptions {
  return { startChar: ':', endChar: '.' };
}

/** המופע הראשון של אחד מתווי הסט, מ-`from` ואילך. `-1` כשאין. */
function indexOfAny(text: string, chars: string, from: number): number {
  for (let i = from; i < text.length; i += 1) {
    if (chars.includes(text[i]!)) return i;
  }
  return -1;
}

/** הקטעים להדגשה בפסקה אחת — לוגיקה טהורה, נבדקת בלי מנוע. */
export function alternatingRanges(text: string, options: AlternatingOptions): { start: number; end: number }[] {
  const { startChar, endChar } = options;
  if (startChar.length === 0 || endChar.length === 0) return [];

  const ranges: { start: number; end: number }[] = [];
  const firstEnd = indexOfAny(text, endChar, 0);
  if (firstEnd < 0) return [];
  if (firstEnd > 0) ranges.push({ start: 0, end: firstEnd + 1 });

  let position = firstEnd + 1;
  for (;;) {
    const start = indexOfAny(text, startChar, position);
    if (start < 0) break;
    // דילוג על תו ההתחלה ועל התו שאחריו — בדרך כלל רווח, כמו במקור.
    const from = start + 2;
    if (from >= text.length) break;
    const end = indexOfAny(text, endChar, from);
    if (end < 0) break;
    if (end > from) ranges.push({ start: from, end: end + 1 });
    position = end + 1;
  }
  return ranges;
}

const FAILED = 'עיצוב טקסט מתחלף נכשל';

export interface AlternatingResult {
  ok: boolean;
  message?: string;
  /** מספר הקטעים שהודגשו. */
  bolded: number;
}

/** מדגישה את הקטעים בפסקאות המסומנות. `bold` + `bCs` — עברית היא complex script. */
export async function runTextAlternating(
  host: ShulchanTarget,
  options: AlternatingOptions,
): Promise<AlternatingResult> {
  const scoped = await scopedBlocks(host, 'selection', FAILED);
  if (!scoped.ok) {
    const outcome: CommandOutcome = scoped.outcome;
    return { ok: false, message: outcome.ok ? undefined : outcome.message, bolded: 0 };
  }

  let bolded = 0;
  for (const block of scoped.result.blocks) {
    for (const range of alternatingRanges(block.text, options)) {
      const outcome = await applyInline(
        host,
        textTarget(block.blockId, range.start, range.end),
        { bold: true, bCs: true },
        FAILED,
      );
      if (!outcome.ok) return { ok: false, message: outcome.message, bolded };
      bolded += 1;
    }
  }
  return { ok: true, bolded };
}

export function alternatingSummaryText(result: AlternatingResult): string {
  if (result.bolded === 0) return 'לא נמצאו קטעים להדגשה';
  return result.bolded === 1 ? 'הודגש קטע אחד' : `הודגשו ${result.bolded} קטעים`;
}
