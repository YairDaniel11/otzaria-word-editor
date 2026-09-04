/**
 * „המרת סוגריים ⇄ הערות שוליים” — טקסט בסוגריים הופך להערת שוליים במקומו,
 * ולהפך: תוכן הערה חוזר לגוף בסוגריים. נויד מ-BracketsAndFootnotes.bas של
 * שולחן העורך, כולל ארבעת סוגי הסוגריים והתאמת קינון.
 *
 * לכיוון „הערות ⟵ סוגריים” נדרש מיקום ההפניה בגוף — `doc.find` על צומתי
 * `footnoteRef`. במסמך שהמנוע אינו חושף בו את החיפוש הזה, הכיוון הזה נכשל
 * סגור עם הסבר, והכיוון השני עדיין עובד. שני הכיוונים עובדים על הבחירה
 * בלבד, כמו במקור.
 */
import type { CommandOutcome } from '../command-adapter';
import { receiptFailureText, thrownText, type DocReceipt, type MaybePromise } from '../document-api';
import {
  offsetInScope,
  replaceRange,
  scopedBlocks,
  shulchanDoc,
  textTarget,
  unavailableOutcome,
  type ShulchanTarget,
} from './shulchan-doc';

export type BracketsType = 'round' | 'square' | 'curly' | 'angle';

export const BRACKET_CHARS: Readonly<Record<BracketsType, { open: string; close: string }>> = {
  round: { open: '(', close: ')' },
  square: { open: '[', close: ']' },
  curly: { open: '{', close: '}' },
  angle: { open: '<', close: '>' },
};

export const BRACKET_TYPE_LABELS: readonly { value: BracketsType; label: string }[] = [
  { value: 'round', label: 'סוגריים עגולים ( )' },
  { value: 'square', label: 'סוגריים מרובעים [ ]' },
  { value: 'curly', label: 'סוגריים מסולסלים { }' },
  { value: 'angle', label: 'סוגריים משולשים < >' },
] as const;

/**
 * טווחי הסוגריים המאוזנים ברמה העליונה: `start` על הפותח, `end` על הסוגר.
 * קינון נשאר בתוך הטווח (כמו SearchBrackets המקורי); פותח שלא נסגר עד סוף
 * הפסקה — מדולג.
 */
export function bracketRanges(text: string, type: BracketsType): { start: number; end: number }[] {
  const { open, close } = BRACKET_CHARS[type];
  const ranges: { start: number; end: number }[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === open) {
      if (depth === 0) start = i;
      depth += 1;
    } else if (char === close && depth > 0) {
      depth -= 1;
      if (depth === 0) ranges.push({ start, end: i });
    }
  }
  return ranges;
}

/* ---------- סוגריים ⟵ הערות שוליים ---------- */

interface NotesApi {
  insert?: (input: { type: 'footnote'; content: string }) => MaybePromise<DocReceipt>;
  get?: (input: { target: NoteAddress }) => MaybePromise<{ type?: string; content?: string } | undefined>;
  remove?: (input: { target: NoteAddress }) => MaybePromise<DocReceipt>;
}

interface NoteAddress {
  kind: 'entity';
  entityType: 'footnote';
  noteId: string;
}

function notesApi(host: ShulchanTarget): NotesApi | undefined {
  return (shulchanDoc(host) as { footnotes?: NotesApi } | undefined)?.footnotes;
}

const TO_NOTES_FAILED = 'המרת הסוגריים להערות נכשלה';

export interface ConversionResult {
  ok: boolean;
  message?: string;
  converted: number;
}

/**
 * ממירה כל קטע-בסוגריים בפסקאות המסומנות להערת שוליים במקומו. העיבוד בכל
 * בלוק מהמופע האחרון לראשון, כדי שההיסטים של המופעים המוקדמים יישארו
 * תקפים אחרי כל מחיקה.
 */
export async function convertBracketsToFootnotes(
  host: ShulchanTarget,
  type: BracketsType,
): Promise<ConversionResult> {
  const notes = notesApi(host);
  const ui = (host as { ui?: { selection?: { apply?: (target: unknown) => unknown } } } | null | undefined)?.ui;
  if (typeof notes?.insert !== 'function' || typeof ui?.selection?.apply !== 'function') {
    const outcome = unavailableOutcome(TO_NOTES_FAILED);
    return { ok: false, message: outcome.ok ? undefined : outcome.message, converted: 0 };
  }

  const scoped = await scopedBlocks(host, 'selection', TO_NOTES_FAILED);
  if (!scoped.ok) {
    return { ok: false, message: scoped.outcome.ok ? undefined : scoped.outcome.message, converted: 0 };
  }

  let converted = 0;
  for (const block of scoped.result.blocks) {
    const ranges = bracketRanges(block.text, type).reverse();
    for (const range of ranges) {
      const inner = block.text.slice(range.start + 1, range.end).trim();
      if (inner === '') continue;

      const removed = await replaceRange(
        host,
        textTarget(block.blockId, range.start, range.end + 1),
        '',
        TO_NOTES_FAILED,
      );
      if (!removed.ok) return { ok: false, message: removed.message, converted };

      // ההוספה נכנסת במקום הסמן — ולכן הסמן מוצב בנקודת המחיקה לפני הקריאה.
      try {
        ui.selection.apply(textTarget(block.blockId, range.start, range.start));
        const receipt = await notes.insert({ type: 'footnote', content: inner });
        if (receipt?.success === false) {
          return { ok: false, message: receiptFailureText(TO_NOTES_FAILED, receipt), converted };
        }
      } catch (error) {
        return { ok: false, message: thrownText(TO_NOTES_FAILED, error), converted };
      }
      converted += 1;
    }
  }
  return { ok: true, converted };
}

/* ---------- הערות שוליים ⟵ סוגריים ---------- */

interface FindApi {
  (input: {
    select: { type: 'node'; nodeType: 'footnoteRef' };
    limit?: number;
    offset?: number;
  }): MaybePromise<
    | {
        total?: number;
        items?: readonly {
          node?: { footnoteRef?: { noteId?: string } };
          address?: { anchor?: { start?: { blockId?: string; offset?: number } } };
        }[];
      }
    | undefined
  >;
}

const TO_BRACKETS_FAILED = 'המרת ההערות לסוגריים נכשלה';

interface FootnoteRefSite {
  noteId: string;
  blockId: string;
  offset: number;
}

/** כל הפניות הערות-השוליים בגוף, בסדר המסמך. `null` כשהמנוע אינו חושף `doc.find`. משותף ל„פירוק מסמך”. */
export async function listFootnoteRefs(host: ShulchanTarget): Promise<FootnoteRefSite[] | null> {
  const find = (shulchanDoc(host) as { find?: FindApi } | undefined)?.find;
  if (typeof find !== 'function') return null;

  const sites: FootnoteRefSite[] = [];
  try {
    // עימוד הגנתי — מסמך תורני יכול להחזיק אלפי הערות.
    for (let offset = 0; offset < 50_000; ) {
      const page = await find({ select: { type: 'node', nodeType: 'footnoteRef' }, limit: 500, offset });
      const items = page?.items ?? [];
      for (const item of items) {
        const noteId = item?.node?.footnoteRef?.noteId;
        const start = item?.address?.anchor?.start;
        if (typeof noteId === 'string' && typeof start?.blockId === 'string' && typeof start.offset === 'number') {
          sites.push({ noteId, blockId: start.blockId, offset: start.offset });
        }
      }
      if (items.length < 500) break;
      offset += items.length;
    }
  } catch {
    return null;
  }
  return sites;
}

/**
 * ממירה את הערות השוליים **שבבחירה** לטקסט בסוגריים בגוף, במקום ההפניה —
 * `Selection.Range.Footnotes` במקור: סמן בלבד ⟵ ההערות של הפסקה שבה הסמן;
 * קטע מסומן ⟵ רק הפניות שיושבות בתוכו. העיבוד מהאחרונה לראשונה — מאותו
 * טעם של הכיוון השני.
 */
export async function convertFootnotesToBrackets(
  host: ShulchanTarget,
  type: BracketsType,
): Promise<ConversionResult> {
  const notes = notesApi(host);
  if (typeof notes?.get !== 'function' || typeof notes.remove !== 'function') {
    const outcome = unavailableOutcome(TO_BRACKETS_FAILED);
    return { ok: false, message: outcome.ok ? undefined : outcome.message, converted: 0 };
  }

  const scoped = await scopedBlocks(host, 'selection', TO_BRACKETS_FAILED);
  if (!scoped.ok) {
    return { ok: false, message: scoped.outcome.ok ? undefined : scoped.outcome.message, converted: 0 };
  }

  const allSites = await listFootnoteRefs(host);
  if (allSites === null) {
    return {
      ok: false,
      message: `${TO_BRACKETS_FAILED}: המנוע אינו חושף את מיקומי ההערות במסמך הזה`,
      converted: 0,
    };
  }
  const selectedIds = new Set(scoped.result.blocks.map((block) => block.blockId));
  const sites = allSites.filter(
    (site) => selectedIds.has(site.blockId) && offsetInScope(scoped.result, site.blockId, site.offset),
  );

  const { open, close } = BRACKET_CHARS[type];
  let converted = 0;
  for (const site of [...sites].reverse()) {
    const target: NoteAddress = { kind: 'entity', entityType: 'footnote', noteId: site.noteId };
    try {
      // אימות סוג לפני מחיקה: הכתובת עיוורת לסוג (ראו engine/footnotes.ts),
      // והסרה בלי האימות הזה עלולה למחוק הערת סיום בעלת אותו מספר.
      const note = await notes.get({ target });
      if (!note || (note.type !== undefined && note.type !== 'footnote')) continue;
      const content = (note.content ?? '').trim();

      const removed = await notes.remove({ target });
      if (removed?.success === false) {
        return { ok: false, message: receiptFailureText(TO_BRACKETS_FAILED, removed), converted };
      }

      const inserted = await replaceRange(
        host,
        textTarget(site.blockId, site.offset, site.offset),
        ` ${open}${content}${close}`,
        TO_BRACKETS_FAILED,
      );
      if (!inserted.ok) return { ok: false, message: inserted.message, converted };
    } catch (error) {
      return { ok: false, message: thrownText(TO_BRACKETS_FAILED, error), converted };
    }
    converted += 1;
  }
  return { ok: true, converted };
}

export function conversionSummaryText(result: ConversionResult, direction: 'to-notes' | 'to-brackets'): string {
  if (result.converted === 0) {
    return direction === 'to-notes' ? 'לא נמצאו סוגריים להמרה' : 'לא נמצאו הערות להמרה';
  }
  if (direction === 'to-notes') {
    return result.converted === 1
      ? 'הומר קטע אחד להערת שוליים'
      : `הומרו ${result.converted} קטעים להערות שוליים`;
  }
  return result.converted === 1
    ? 'הומרה הערה אחת לטקסט בסוגריים'
    : `הומרו ${result.converted} הערות לטקסט בסוגריים`;
}

/** תוצאת CommandOutcome אחידה לדיווח בשורת המצב. */
export function conversionOutcome(result: ConversionResult): CommandOutcome {
  return result.ok ? { ok: true } : { ok: false, message: result.message ?? 'ההמרה נכשלה', reason: 'conversion-failed' };
}
