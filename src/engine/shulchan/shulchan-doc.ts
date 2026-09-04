/**
 * „שולחן העורך” — תשתית משותפת לכלי העריכה התורניים שנוידו מתבניות ה-Word
 * של שולחן העורך (ראו docs/shulchan-haorech.md: מה נויד, מה לא, ולמה).
 *
 * כל הכלים עובדים על אותו מודל: קריאת הבלוקים הקנוניים
 * (`doc.blocks.list({includeText:true})` — אותו מסלול שנמדד ב-engine/search.ts),
 * חישוב טהור ב-JS על הטקסט, וכתיבה נקודתית דרך המשטחים הציבוריים
 * (`doc.replace`, `doc.format.apply`, `doc.format.paragraph.*`). שום כלי אינו
 * ניגש ל-DOM של המנוע ואינו תלוי בפגינציה — זה בדיוק הקו שהפריד בין הכלים
 * שנוידו לאלה שלא.
 */
import type { SuperDoc } from 'superdoc';
import type { MaybePromise, DocReceipt } from '../document-api';
import { receiptFailureText, thrownText } from '../document-api';
import type { CommandOutcome } from '../command-adapter';
import type { SearchableBlock } from '../text-search';

/** נקודת טקסט ביעד בחירה — המודל הציבורי של `SelectionPoint`. */
export interface ShulchanTextPoint {
  kind: 'text';
  blockId: string;
  offset: number;
}

/** יעד בחירה שנבנה מקואורדינטות-טקסט של בלוק — ראו text-search.ts. */
export interface ShulchanSelectionTarget {
  kind: 'selection';
  start: ShulchanTextPoint;
  end: ShulchanTextPoint;
}

/** קטע בחירה כפי ש-`doc.selection.current()` מחזיר אותו. */
interface SelectionSegmentLike {
  blockId?: string;
  range?: { start?: number; end?: number };
}

interface SelectionInfoLike {
  target?: { segments?: readonly SelectionSegmentLike[] } | null;
}

interface BlocksPage {
  blocks?: readonly { nodeId?: string; text?: string; nodeType?: string; styleId?: string }[];
}

/** בלוק כפי שהכלים צורכים אותו — הבלוק הקנוני של החיפוש, ועליו מזהה הסגנון. */
export interface ShulchanBlock extends SearchableBlock {
  /** `w:styleId` של הפסקה, כשהמנוע מדווח אותו. */
  styleId?: string;
}

/** תכונות פסקה במודל — `props` הישירות ו-`resolved` הפתורות (סגנון + ירושה). */
interface ParagraphLike {
  content?: readonly unknown[];
  props?: Record<string, unknown>;
  resolved?: Record<string, unknown>;
}

/** צומת במודל `doc.get()` — רק החלק שהכלים קוראים. */
export interface ShulchanModelNode {
  id?: string;
  paragraphIds?: { paraId?: string };
  kind?: string;
  paragraph?: ParagraphLike;
  heading?: ParagraphLike;
  list?: ParagraphLike;
}

export interface ShulchanDocumentApi {
  selection?: {
    current?: (input?: { includeText?: boolean }) => MaybePromise<SelectionInfoLike | undefined>;
  };
  blocks?: {
    list?: (input: { includeText?: boolean; offset?: number; limit?: number }) => MaybePromise<BlocksPage | undefined>;
    delete?: (input: { target: { kind: 'block'; nodeType: string; nodeId: string } }) => MaybePromise<unknown>;
  };
  get?: (input?: { options?: { includeResolved?: boolean } }) => MaybePromise<{ body?: readonly ShulchanModelNode[] } | undefined>;
  replace?: (input: { target: ShulchanSelectionTarget; text: string }) => MaybePromise<DocReceipt>;
  format?: {
    apply?: (input: { target: ShulchanSelectionTarget; inline: Record<string, unknown> }) => MaybePromise<DocReceipt>;
    paragraph?: Record<string, unknown>;
  };
}

export interface ShulchanUi {
  selection?: { apply?: (target: unknown) => unknown };
  viewport?: {
    scrollIntoView?: (input: {
      target: { kind: 'text'; blockId: string; range: { start: number; end: number } };
      block?: string;
      behavior?: string;
    }) => MaybePromise<unknown>;
  };
}

export interface ShulchanHost {
  activeEditor?: { doc?: ShulchanDocumentApi | null } | null;
  ui?: ShulchanUi | null;
}

/** ה-union מאפשר גם את המופע האמיתי וגם כפיל בבדיקות. ההסבר המלא ב-page-setup.ts. */
export type ShulchanTarget = SuperDoc | ShulchanHost | null | undefined;

export function shulchanDoc(host: ShulchanTarget): ShulchanDocumentApi | undefined {
  return (host as ShulchanHost | null | undefined)?.activeEditor?.doc ?? undefined;
}

export function shulchanUi(host: ShulchanTarget): ShulchanUi | undefined {
  return (host as ShulchanHost | null | undefined)?.ui ?? undefined;
}

/**
 * „ב-3 פסקאות” מול „בפסקה אחת”.
 *
 * „ב-1 פסקאות” אינו עברית, וזה בדיוק מה שהמשתמש רואה בשורת המצב אחרי
 * הרצה שנגעה בפסקה אחת — המקרה השכיח כשמסמנים פסקה ומפעילים כלי.
 * המקבילה ל-`moduleCountText` ב-engine/vba-import.ts.
 */
export function inParagraphsText(count: number): string {
  return count === 1 ? 'בפסקה אחת' : `ב-${count} פסקאות`;
}

export const NO_DOCUMENT_TEXT = 'אין מסמך פתוח, או שהמסמך אינו תומך בפעולה';
export const NO_SELECTION_TEXT = 'יש לסמן את הפסקאות לעיבוד, או להעמיד את הסמן בפסקה';

export function unavailableOutcome(failedAction: string): CommandOutcome {
  return { ok: false, message: `${failedAction}: ${NO_DOCUMENT_TEXT}`, reason: 'command-unsupported' };
}

/** אותם גבולות דפדוף כמו ב-engine/search.ts — כיסוי מלא או כשל גלוי. */
const BLOCKS_PAGE_SIZE = 500;
const BLOCKS_MAX_PAGES = 50;

/**
 * כל בלוקי המסמך, עם הטקסט הקנוני, בסדר המסמך. `null` כשאין `blocks.list`
 * או כשקריאה נכשלה — כיסוי חלקי מסוכן יותר מכשל גלוי (ראו search.ts).
 */
export async function readShulchanBlocks(host: ShulchanTarget): Promise<ShulchanBlock[] | null> {
  const list = shulchanDoc(host)?.blocks?.list;
  if (typeof list !== 'function') return null;

  const blocks: ShulchanBlock[] = [];
  let offset = 0;
  try {
    for (let page = 0; page < BLOCKS_MAX_PAGES; page += 1) {
      const result = await list({ includeText: true, offset, limit: BLOCKS_PAGE_SIZE });
      const entries = result?.blocks ?? [];
      for (const entry of entries) {
        if (typeof entry?.nodeId === 'string') {
          const block: ShulchanBlock = {
            blockId: entry.nodeId,
            text: typeof entry.text === 'string' ? entry.text : '',
            nodeType: typeof entry.nodeType === 'string' ? entry.nodeType : undefined,
          };
          if (typeof entry.styleId === 'string' && entry.styleId !== '') block.styleId = entry.styleId;
          blocks.push(block);
        }
      }
      if (entries.length < BLOCKS_PAGE_SIZE) break;
      offset += entries.length;
    }
  } catch {
    return null;
  }
  return blocks;
}

/**
 * מזהה למסמך, לזיכרון של כלים שמצבם אינו בקובץ: FNV-1a על מזהי הבלוקים
 * (`w14:paraId`), שנשמרים ב-docx ושורדים עריכה של הטקסט. הוספה או מחיקה
 * של פסקאות משנה את המפתח: „סימון עמודים” דורש התאמה מדויקת ולכן לא ימצא
 * תצלום ישן; „סימני חיתוך” מחזיקים בנוסף אינדקס של מזהי הפסקאות ומסוגלים
 * לאתר את הרשומה גם אחרי עריכה מבנית (crop-marks.ts).
 */
export function documentKey(blocks: readonly { blockId: string }[]): string {
  let hash = 0x811c9dc5;
  const feed = (text: string): void => {
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  };
  for (const block of blocks.slice(0, 64)) feed(`${block.blockId}\u0000`);
  feed(String(blocks.length));
  return hash.toString(16).padStart(8, '0');
}

export type ShulchanScope = 'selection' | 'document';

/** טווח טקסט בתוך בלוק — קצה הבחירה כפי ש-`selection.current()` מדווח אותו. */
export interface ScopedRange {
  start: number;
  end: number;
}

export interface ScopedBlocksResult {
  /** הבלוקים לעיבוד, בסדר המסמך. */
  blocks: ShulchanBlock[];
  /** כל בלוקי המסמך — לכלים שצריכים הקשר (בלוק קודם/עוקב). */
  all: ShulchanBlock[];
  /**
   * הטווח המסומן בכל בלוק, לכלים שעובדים על **תוכן** הבחירה ולא על פסקאות
   * שלמות (הערות ⟵ סוגריים). `undefined` כשהתחום הוא כל המסמך, וגם כשהבחירה
   * היא סמן בלבד — שאז הפסקה כולה היא התחום, כמו בכל שאר הכלים.
   */
  ranges?: ReadonlyMap<string, ScopedRange>;
}

/** האם היסט בבלוק נמצא בתחום שנבחר. בלי `ranges` — כל הבלוק בתחום. */
export function offsetInScope(scoped: ScopedBlocksResult, blockId: string, offset: number): boolean {
  if (!scoped.ranges) return true;
  const range = scoped.ranges.get(blockId);
  /* הקצה כלול: הפניית הערה שיושבת בדיוק בסוף הקטע המסומן נבחרה יחד איתו
     בעיני המשתמש, והמנוע מדווח את מיקומה כהיסט שאחרי התו האחרון. */
  return range !== undefined && offset >= range.start && offset <= range.end;
}

/**
 * הבלוקים שהכלי יעבוד עליהם: כל המסמך, או הפסקאות שבבחירה (סמן בלבד ⟵
 * הפסקה שבה הסמן). `{ ok:false }` כשאין מסמך; בחירה שלא נקראה נופלת לכשל
 * סגור ולא ל"כל המסמך" — כלי שמעבד את המסמך כולו כי קריאת הבחירה נכשלה
 * הוא בדיוק ההפתעה שאסור לייצר.
 */
export async function scopedBlocks(
  host: ShulchanTarget,
  scope: ShulchanScope,
  failedAction: string,
): Promise<{ ok: true; result: ScopedBlocksResult } | { ok: false; outcome: CommandOutcome }> {
  const all = await readShulchanBlocks(host);
  if (all === null) return { ok: false, outcome: unavailableOutcome(failedAction) };
  if (scope === 'document') return { ok: true, result: { blocks: all, all } };

  const current = shulchanDoc(host)?.selection?.current;
  if (typeof current !== 'function') return { ok: false, outcome: unavailableOutcome(failedAction) };

  let info: SelectionInfoLike | undefined;
  try {
    info = await current();
  } catch (error) {
    return { ok: false, outcome: { ok: false, message: thrownText(failedAction, error), reason: 'threw' } };
  }

  const ids = new Set<string>();
  const ranges = new Map<string, ScopedRange>();
  let collapsed = true;
  for (const segment of info?.target?.segments ?? []) {
    if (typeof segment?.blockId !== 'string') continue;
    ids.add(segment.blockId);
    const start = segment.range?.start;
    const end = segment.range?.end;
    if (typeof start !== 'number' || typeof end !== 'number') continue;
    if (end > start) collapsed = false;
    const existing = ranges.get(segment.blockId);
    ranges.set(segment.blockId, {
      start: existing ? Math.min(existing.start, start) : start,
      end: existing ? Math.max(existing.end, end) : end,
    });
  }
  if (ids.size === 0) {
    return {
      ok: false,
      outcome: { ok: false, message: `${failedAction}: ${NO_SELECTION_TEXT}`, reason: 'no-selection' },
    };
  }
  const blocks = all.filter((block) => ids.has(block.blockId));
  // סמן בלבד, או מנוע שלא דיווח טווחים — הפסקאות השלמות הן התחום.
  if (collapsed || ranges.size === 0) return { ok: true, result: { blocks, all } };
  return { ok: true, result: { blocks, all, ranges } };
}

/**
 * יישור הפסקה מהמודל — הפתור (`resolved`, כולל מה שירש מהסגנון) לפני
 * הישיר (`props`). `undefined` כשהבלוק לא נמצא או שלא דווח יישור.
 */
export function paragraphAlignment(body: ResolvedBody, blockId: string): string | undefined {
  const inner = nodeInner(body.node(blockId));
  const alignment = inner?.resolved?.alignment ?? inner?.props?.alignment;
  return typeof alignment === 'string' ? alignment : undefined;
}

export function textTarget(blockId: string, start: number, end: number): ShulchanSelectionTarget {
  return {
    kind: 'selection',
    start: { kind: 'text', blockId, offset: start },
    end: { kind: 'text', blockId, offset: end },
  };
}

/** `doc.replace` בודד עם טיפול כשל אחיד. אותו מסלול כמו ההחלפה בחיפוש. */
export async function replaceRange(
  host: ShulchanTarget,
  target: ShulchanSelectionTarget,
  text: string,
  failedAction: string,
): Promise<CommandOutcome> {
  const replace = shulchanDoc(host)?.replace;
  if (typeof replace !== 'function') return unavailableOutcome(failedAction);
  try {
    const receipt = await replace({ target, text });
    if (receipt?.success === false) {
      return { ok: false, message: receiptFailureText(failedAction, receipt), reason: receipt.failure?.code };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, message: thrownText(failedAction, error), reason: 'threw' };
  }
}

/** `doc.format.apply` על טווח טקסט, בלי להזיז את הבחירה החיה. */
export async function applyInline(
  host: ShulchanTarget,
  target: ShulchanSelectionTarget,
  inline: Record<string, unknown>,
  failedAction: string,
): Promise<CommandOutcome> {
  const apply = shulchanDoc(host)?.format?.apply;
  if (typeof apply !== 'function') return unavailableOutcome(failedAction);
  try {
    const receipt = await apply({ target, inline });
    if (receipt?.success === false) {
      return { ok: false, message: receiptFailureText(failedAction, receipt), reason: receipt.failure?.code };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, message: thrownText(failedAction, error), reason: 'threw' };
  }
}

/** בוחרת וגוללת אל טווח — ויזואלי בלבד, כשל נבלע (אותה תבנית כמו focusActiveMatch). */
export async function revealRange(host: ShulchanTarget, blockId: string, start: number, end: number): Promise<void> {
  const ui = shulchanUi(host);
  try {
    ui?.selection?.apply?.(textTarget(blockId, start, end));
  } catch {
    /* ויזואלי בלבד */
  }
  try {
    await ui?.viewport?.scrollIntoView?.({
      target: { kind: 'text', blockId, range: { start, end } },
      block: 'center',
      behavior: 'smooth',
    });
  } catch {
    /* ויזואלי בלבד */
  }
}

/* ------------------------------------------------------------------ */
/* קריאת עיצוב פתור מהמודל                                             */
/* ------------------------------------------------------------------ */

interface RunLike {
  kind?: string;
  run?: { text?: string; props?: Record<string, unknown>; resolved?: Record<string, unknown> };
}

/** תכונות הגופן שהכלים צורכים, מתוך `resolved` (ואם אין — `props`) של run. */
export interface ResolvedRunFont {
  /** בנקודות. */
  fontSize?: number;
  fontSizeCs?: number;
  fontFamily?: string;
  bold?: boolean;
}

function nodeParagraphId(node: ShulchanModelNode): string | undefined {
  if (typeof node.id === 'string' && node.id !== '') return node.id;
  const paraId = node.paragraphIds?.paraId;
  return typeof paraId === 'string' && paraId !== '' ? paraId : undefined;
}

function nodeInner(node: ShulchanModelNode | undefined): ParagraphLike | undefined {
  return node?.paragraph ?? node?.heading ?? node?.list;
}

function readFont(record: Record<string, unknown> | undefined): ResolvedRunFont {
  if (!record) return {};
  const font: ResolvedRunFont = {};
  if (typeof record.fontSize === 'number' && Number.isFinite(record.fontSize)) font.fontSize = record.fontSize;
  if (typeof record.fontSizeCs === 'number' && Number.isFinite(record.fontSizeCs)) font.fontSizeCs = record.fontSizeCs;
  if (typeof record.fontFamily === 'string') font.fontFamily = record.fontFamily;
  else {
    const fonts = record.fonts as { cs?: string; ascii?: string } | undefined;
    if (typeof fonts?.cs === 'string') font.fontFamily = fonts.cs;
    else if (typeof fonts?.ascii === 'string') font.fontFamily = fonts.ascii;
  }
  if (typeof record.bold === 'boolean') font.bold = record.bold;
  return font;
}

/**
 * תכונות הגופן של ה-run שמכסה היסט-טקסט נתון בבלוק, מתוך מודל שכבר נקרא.
 * ההיסט נספר על טקסט ה-runs בלבד — אותה ספירה שהבלוק הקנוני מחזיר. `{}`
 * כשהבלוק/ההיסט לא נמצאו: הכלי מחליט בעצמו מה ברירת המחדל שלו.
 */
export function resolvedFontAt(body: ResolvedBody, blockId: string, offset: number): ResolvedRunFont {
  const node = body.node(blockId);
  if (!node) return {};
  const content = nodeInner(node)?.content ?? [];
  let position = 0;
  let lastFont: ResolvedRunFont = {};
  for (const child of content) {
    const run = (child as RunLike) ?? {};
    if (run.kind !== 'run' || !run.run) continue;
    const text = typeof run.run.text === 'string' ? run.run.text : '';
    const font = readFont(run.run.resolved ?? run.run.props);
    if (offset >= position && offset < position + text.length) return font;
    position += text.length;
    lastFont = font;
  }
  // היסט בסוף הבלוק (או בלוק בלי runs) — התכונות של ה-run האחרון.
  return lastFont;
}

/**
 * המודל המלא עם ערכים פתורים. `undefined` בכשל — הקורא נופל לברירת מחדל
 * שלו, לא לזריקה.
 */
export async function readResolvedBody(host: ShulchanTarget): Promise<ResolvedBody> {
  const get = shulchanDoc(host)?.get;
  if (typeof get !== 'function') return indexResolvedBody(undefined);
  try {
    const model = await get({ options: { includeResolved: true } });
    return indexResolvedBody(Array.isArray(model?.body) ? model.body : undefined);
  } catch {
    return indexResolvedBody(undefined);
  }
}

/**
 * המודל הפתור, מפוענח לפי מזהה פסקה. הכלים עוברים על הבלוקים שבבחירה
 * וקוראים ממנו לכל בלוק — סריקה לינארית של ה-body לכל קריאה הפכה את זה
 * ל-O(בלוקים × צומתי המסמך), ופעמיים: פעם ליישור ופעם לגופן.
 */
export interface ResolvedBody {
  node(blockId: string): ShulchanModelNode | undefined;
  /** התכונות הישירות של הפסקה (`props`), כפי ש-`findParagraphProps` מחזיר אותן. */
  props(blockId: string): Record<string, unknown> | undefined;
}

export function indexResolvedBody(body: readonly ShulchanModelNode[] | undefined): ResolvedBody {
  const byId = new Map<string, ShulchanModelNode>();
  if (Array.isArray(body)) {
    for (const node of body) {
      if (!node || typeof node !== 'object') continue;
      const id = nodeParagraphId(node);
      // הראשון מנצח, כמו הסריקה הלינארית שקדמה לכאן.
      if (id !== undefined && !byId.has(id)) byId.set(id, node);
    }
  }
  return {
    node: (blockId) => byId.get(blockId),
    props: (blockId) => nodeInner(byId.get(blockId))?.props,
  };
}
