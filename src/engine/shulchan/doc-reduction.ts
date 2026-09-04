/**
 * „צמצום מסמך” — מקטין את המסמך ליעד עמודים בארבעה ערוצים, כל אחד ב-10%
 * לסבב: שוליים, מרווח בין פסקאות, מרווח בין שורות, וגודל גופן (נקודה
 * לסבב). נויד מ-DocReduction.bas של שולחן העורך.
 *
 * ## למה זה „קירוב” ולא שחזור מדויק
 *
 * המדד היחיד של המקור הוא ספירת העמודים (`ComputeStatistics(wdStatisticPages)`),
 * ול-Word יש ספירה מיידית ומחייבת. למנוע אין API ציבורי לספירת עמודים
 * אחרי מוטציה (docs/shulchan-source/engine-issues/3970-layout-read-api.md);
 * מה שיש הוא העמודים **המצוירים** — `data-page-index` — אחרי השהיית
 * התיישבות היוריסטית (engine/page-ruler.ts, `settledPageCount`). לכן
 * הספירה יכולה לפגר סבב אחד אחרי הפריסה, והלולאה עלולה לעצור עמוד אחד
 * מוקדם או מאוחר. הפגינציה של SuperDoc גם אינה זהה לזו של Word — היעד
 * מושג בעורך, ולא בהכרח ב-Word שיפתח את הקובץ.
 *
 * ## מה זהה למקור
 *
 * סדר הערוצים, המכפיל 0.9, הרצפות (שוליים ≥ 1 ס"מ, ריווח > 2 נק', מרווח
 * שורות ≥ 12 נק', גופן ≥ הסף שנבחר), התדירויות (ערוץ רץ כל N סבבים), עד
 * 20 סבבים, וסיכום שאומר בכמה אחוזים צומצם כל ערוץ. הערוץ של הגופן נכבה
 * כשאין עוד מה להקטין, כמו `fontSizeTarget = 0` במקור.
 *
 * הספירה מוזרקת (`countPages`): המנוע כאן אינו נוגע ב-DOM (ראו
 * tests/unit/engine-boundaries.test.ts), ומי שיודע למדוד עמודים מצוירים
 * הוא engine/page-ruler.ts; הלשונית מחברת ביניהם.
 */
import { applyParagraphSpacing, TWIPS_PER_PT, type ParagraphFormatTarget } from '../paragraph-format';
import type { DocReceipt, MaybePromise } from '../document-api';
import { receiptFailureText, thrownText } from '../document-api';
import {
  applyInline,
  readResolvedBody,
  readShulchanBlocks,
  shulchanDoc,
  textTarget,
  unavailableOutcome,
  type ResolvedBody,
  type ShulchanBlock,
  type ShulchanTarget,
} from './shulchan-doc';

export interface DocReductionOptions {
  /** יעד העמודים. */
  targetPages: number;
  /** כל כמה סבבים מצמצמים שוליים. `0` = הערוץ כבוי. */
  marginsEvery: number;
  /** כל כמה סבבים מצמצמים ריווח פסקאות. `0` = כבוי. */
  paraSpaceEvery: number;
  /** כל כמה סבבים מצמצמים מרווח שורות. `0` = כבוי. */
  lineSpaceEvery: number;
  /** כל כמה סבבים מקטינים גופן בנקודה. `0` = כבוי. */
  fontEvery: number;
  /** הגופן אינו יורד מתחת לגודל הזה (נקודות). */
  fontLimitPt: number;
}

export function defaultDocReductionOptions(): DocReductionOptions {
  return {
    targetPages: 1,
    marginsEvery: 1,
    paraSpaceEvery: 1,
    lineSpaceEvery: 2,
    fontEvery: 3,
    fontLimitPt: 10,
  };
}

/** תקרת הסבבים של המקור. */
export const MAX_REDUCTION_ROUNDS = 20;

/** רצפת השוליים ומרווח הטורים: 28.35 נק' = 1 ס"מ, באינצ'ים (יחידת `sections.*`). */
const MIN_MARGIN_IN = 28.35 / 72;
/** ריווח פסקה מצומצם רק מעל 2 נק'. */
const MIN_PARA_SPACE_PT = 2;
/** מרווח שורות: מעל 13.2 נק' ⟵ ×0.9; בין 12 ל-13.2 ⟵ 12. */
const LINE_SHRINK_ABOVE_PT = 13.2;
const LINE_FLOOR_PT = 12;
const FACTOR = 0.9;

export interface DocReductionResult {
  ok: boolean;
  message?: string;
  /** ספירת העמודים לפני ואחרי. */
  pagesBefore: number;
  pagesAfter: number;
  /** האם הגענו ליעד. */
  reachedTarget: boolean;
  /** כמה סבבים רץ כל ערוץ (לחישוב האחוז, כמו `msg()` במקור). */
  marginsRounds: number;
  paraSpaceRounds: number;
  lineSpaceRounds: number;
  /** בכמה נקודות ירד הגופן. */
  fontPoints: number;
}

export interface DocReductionHooks {
  /** ספירת העמודים המצוירים אחרי התיישבות. `null` = אין איך למדוד. */
  countPages: () => Promise<number | null>;
  /** דיווח התקדמות לשורת המצב/לדיאלוג. */
  onProgress?: (text: string) => void;
  /** „עצור” של המשתמש — נבדק בין צעדים. */
  isCancelled?: () => boolean;
}

const FAILED = 'צמצום המסמך נכשל';
const NO_PAGE_COUNT_TEXT = 'לא ניתן לספור את עמודי המסמך — יש לוודא שהמסמך מוצג';

export function pageCountProgressText(pages: number): string {
  return `כמות העמודים הנוכחית היא: ${pages}`;
}

/** אחוז הצמצום המצטבר אחרי `rounds` סבבים של ×0.9 — `100 − 0.9^n·100`, כמו במקור. */
export function reductionPercent(rounds: number): number {
  return Math.round((100 - FACTOR ** rounds * 100) * 10) / 10;
}

export function docReductionSummaryText(result: DocReductionResult): string {
  const head = result.reachedTarget
    ? `המסמך צומצם ל-${result.pagesAfter} עמודים`
    : `הצמצום נעצר על ${result.pagesAfter} עמודים (היעד: לא הושג)`;
  const parts: string[] = [];
  if (result.marginsRounds > 0) parts.push(`השוליים הוקטנו ב-${reductionPercent(result.marginsRounds)}%`);
  if (result.paraSpaceRounds > 0) parts.push(`המרווח בין הפסקאות צומצם ב-${reductionPercent(result.paraSpaceRounds)}%`);
  if (result.lineSpaceRounds > 0) parts.push(`המרווח בין השורות צומצם ב-${reductionPercent(result.lineSpaceRounds)}%`);
  if (result.fontPoints > 0) parts.push(`הגופן הוקטן ב-${result.fontPoints} נק'`);
  return parts.length === 0 ? head : `${head}; ${parts.join(', ')}`;
}

/* ---------- ערוץ השוליים ---------- */

interface SectionItemLike {
  address?: unknown;
  margins?: { top?: number; right?: number; bottom?: number; left?: number };
  columns?: { count?: number; gap?: number };
}

interface SectionsApi {
  list?: () => MaybePromise<{ items?: readonly SectionItemLike[] } | undefined>;
  setPageMargins?: (input: Record<string, unknown>) => MaybePromise<DocReceipt>;
  setColumns?: (input: Record<string, unknown>) => MaybePromise<DocReceipt>;
}

function sectionsApi(host: ShulchanTarget): SectionsApi | undefined {
  return (shulchanDoc(host) as { sections?: SectionsApi } | undefined)?.sections;
}

/** שוליים אחרי סבב: מעל הרצפה ⟵ ×0.9, ולעולם לא מתחת לרצפה. `undefined` נשאר. */
export function shrinkMargin(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  if (value <= MIN_MARGIN_IN) return value < MIN_MARGIN_IN ? MIN_MARGIN_IN : value;
  return Math.max(MIN_MARGIN_IN, value * FACTOR);
}

async function receiptOutcome(
  call: () => MaybePromise<DocReceipt>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const receipt = await call();
    if (receipt?.success === false && receipt.failure?.code !== 'NO_OP') {
      return { ok: false, message: receiptFailureText(FAILED, receipt) };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, message: thrownText(FAILED, error) };
  }
}

async function reduceMargins(host: ShulchanTarget): Promise<{ ok: true } | { ok: false; message: string }> {
  const sections = sectionsApi(host);
  if (typeof sections?.list !== 'function' || typeof sections.setPageMargins !== 'function') {
    return { ok: false, message: `${FAILED}: המנוע אינו חושף את שולי המקטעים` };
  }
  let items: readonly SectionItemLike[];
  try {
    items = (await sections.list())?.items ?? [];
  } catch (error) {
    return { ok: false, message: thrownText(FAILED, error) };
  }
  for (const section of items) {
    if (section.address === undefined) continue;
    const next = {
      top: shrinkMargin(section.margins?.top),
      right: shrinkMargin(section.margins?.right),
      bottom: shrinkMargin(section.margins?.bottom),
      left: shrinkMargin(section.margins?.left),
    };
    const payload: Record<string, unknown> = { target: section.address };
    for (const [side, value] of Object.entries(next)) {
      if (value !== undefined && value !== (section.margins as Record<string, number | undefined> | undefined)?.[side]) {
        payload[side] = value;
      }
    }
    if (Object.keys(payload).length > 1) {
      const outcome = await receiptOutcome(() => sections.setPageMargins!(payload));
      if (!outcome.ok) return outcome;
    }
    const count = section.columns?.count ?? 1;
    const gap = section.columns?.gap;
    if (count > 1 && typeof sections.setColumns === 'function') {
      const nextGap = shrinkMargin(gap);
      if (nextGap !== undefined && nextGap !== gap) {
        const outcome = await receiptOutcome(() =>
          sections.setColumns!({ target: section.address, gap: nextGap, equalWidth: true }),
        );
        if (!outcome.ok) return outcome;
      }
    }
  }
  return { ok: true };
}

/* ---------- ערוצי הפסקה ---------- */

interface BlockSpacing {
  beforePt: number;
  afterPt: number;
  /** מרווח שורות במודל: twips/20 — 12 = „בודד” במצב auto, ונקודות ב-exact/atLeast. */
  linePt: number;
  rule: 'auto' | 'exact' | 'atLeast';
}

function readBlockSpacing(body: ResolvedBody, blockId: string): BlockSpacing {
  const spacing = body.props(blockId)?.spacing as
    | { before?: unknown; after?: unknown; line?: unknown; lineRule?: unknown }
    | undefined;
  const pt = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
  const rule = spacing?.lineRule;
  return {
    beforePt: pt(spacing?.before, 0),
    afterPt: pt(spacing?.after, 0),
    linePt: pt(spacing?.line, LINE_FLOOR_PT),
    rule: rule === 'exact' || rule === 'atLeast' ? rule : 'auto',
  };
}

/** ריווח פסקה אחרי סבב — כמו `SpaceBefore > 2 ⟵ ×0.9` במקור. */
export function shrinkParaSpace(pt: number): number {
  return pt > MIN_PARA_SPACE_PT ? pt * FACTOR : pt;
}

/** מרווח שורות אחרי סבב — `>13.2 ⟵ ×0.9`, `>12 ⟵ 12`, אחרת נשאר. */
export function shrinkLineSpace(pt: number): number {
  if (pt > LINE_SHRINK_ABOVE_PT) return pt * FACTOR;
  if (pt > LINE_FLOOR_PT) return LINE_FLOOR_PT;
  return pt;
}

function blockTarget(block: ShulchanBlock): { kind: 'block'; nodeType: string; nodeId: string } {
  return { kind: 'block', nodeType: block.nodeType ?? 'paragraph', nodeId: block.blockId };
}

async function reduceParagraphs(
  host: ShulchanTarget,
  blocks: readonly ShulchanBlock[],
  channel: 'para' | 'line',
): Promise<{ ok: true } | { ok: false; message: string }> {
  const body = await readResolvedBody(host);
  for (const block of blocks) {
    const spacing = readBlockSpacing(body, block.blockId);
    const next =
      channel === 'para'
        ? { ...spacing, beforePt: shrinkParaSpace(spacing.beforePt), afterPt: shrinkParaSpace(spacing.afterPt) }
        : { ...spacing, linePt: shrinkLineSpace(spacing.linePt) };
    if (next.beforePt === spacing.beforePt && next.afterPt === spacing.afterPt && next.linePt === spacing.linePt) {
      continue;
    }
    const outcome = await applyParagraphSpacing(host as ParagraphFormatTarget, blockTarget(block), {
      beforeTwips: Math.round(next.beforePt * TWIPS_PER_PT),
      afterTwips: Math.round(next.afterPt * TWIPS_PER_PT),
      lineTwips: Math.round(next.linePt * TWIPS_PER_PT),
      rule: next.rule,
    });
    if (!outcome.ok) return { ok: false, message: outcome.message };
  }
  return { ok: true };
}

/* ---------- ערוץ הגופן ---------- */

interface RunLike {
  kind?: string;
  run?: { text?: string; props?: Record<string, unknown>; resolved?: Record<string, unknown> };
}

/** ריצות הפסקה עם היסטיהן וגודליהן הפתורים. */
export function runsOf(
  body: ResolvedBody,
  blockId: string,
): { start: number; end: number; fontSize?: number; fontSizeCs?: number }[] {
  const node = body.node(blockId);
  if (!node) return [];
  const content = (node.paragraph ?? node.heading ?? node.list)?.content ?? [];
  const out: { start: number; end: number; fontSize?: number; fontSizeCs?: number }[] = [];
  let position = 0;
  for (const child of content) {
    const run = (child as RunLike) ?? {};
    if (run.kind !== 'run' || !run.run) continue;
    const text = typeof run.run.text === 'string' ? run.run.text : '';
    const record = run.run.resolved ?? run.run.props ?? {};
    const size = (key: string): number | undefined =>
      typeof record[key] === 'number' && Number.isFinite(record[key]) ? (record[key] as number) : undefined;
    if (text.length > 0) {
      out.push({ start: position, end: position + text.length, fontSize: size('fontSize'), fontSizeCs: size('fontSizeCs') });
    }
    position += text.length;
  }
  return out;
}

/** גודל אחרי סבב: מעל הסף ⟵ פחות נקודה; `undefined` = אין שינוי. */
export function shrinkFont(size: number | undefined, limitPt: number): number | undefined {
  if (size === undefined || size <= limitPt) return undefined;
  return Math.max(limitPt, size - 1);
}

/** מקטינה נקודה בכל ריצה שמעל הסף. מחזירה האם משהו הוקטן — כשלא, הערוץ מוצה. */
async function reduceFonts(
  host: ShulchanTarget,
  blocks: readonly ShulchanBlock[],
  limitPt: number,
): Promise<{ ok: true; reduced: boolean } | { ok: false; message: string }> {
  const body = await readResolvedBody(host);
  let reduced = false;
  for (const block of blocks) {
    for (const run of runsOf(body, block.blockId)) {
      const inline: Record<string, unknown> = {};
      const nextSize = shrinkFont(run.fontSize, limitPt);
      const nextCs = shrinkFont(run.fontSizeCs ?? run.fontSize, limitPt);
      if (nextSize !== undefined) inline.fontSize = nextSize;
      if (nextCs !== undefined) inline.fontSizeCs = nextCs;
      if (Object.keys(inline).length === 0) continue;
      const outcome = await applyInline(host, textTarget(block.blockId, run.start, run.end), inline, FAILED);
      if (!outcome.ok) return { ok: false, message: outcome.message ?? FAILED };
      reduced = true;
    }
  }
  return { ok: true, reduced };
}

/* ---------- הלולאה ---------- */

export async function reduceDocument(
  host: ShulchanTarget,
  options: DocReductionOptions,
  hooks: DocReductionHooks,
): Promise<DocReductionResult> {
  const zero: DocReductionResult = {
    ok: false,
    pagesBefore: 0,
    pagesAfter: 0,
    reachedTarget: false,
    marginsRounds: 0,
    paraSpaceRounds: 0,
    lineSpaceRounds: 0,
    fontPoints: 0,
  };
  const blocks = await readShulchanBlocks(host);
  if (blocks === null) {
    const outcome = unavailableOutcome(FAILED);
    return { ...zero, message: outcome.ok ? undefined : outcome.message };
  }
  const target = Math.max(1, Math.floor(options.targetPages));
  const before = await hooks.countPages();
  if (before === null) return { ...zero, message: `${FAILED}: ${NO_PAGE_COUNT_TEXT}` };

  const state = { ...zero, ok: true, pagesBefore: before, pagesAfter: before };
  let pages = before;
  let fontEvery = Math.max(0, Math.floor(options.fontEvery));
  const counters = { margins: 0, para: 0, line: 0, font: 0 };
  const cancelled = (): boolean => hooks.isCancelled?.() === true;

  const recount = async (): Promise<boolean> => {
    const next = await hooks.countPages();
    if (next === null) return false;
    pages = next;
    state.pagesAfter = next;
    hooks.onProgress?.(pageCountProgressText(next));
    return true;
  };

  for (let round = 1; round <= MAX_REDUCTION_ROUNDS; round += 1) {
    counters.margins += 1;
    counters.para += 1;
    counters.line += 1;
    counters.font += 1;
    if (pages <= target || cancelled()) break;
    hooks.onProgress?.(pageCountProgressText(pages));

    if (options.marginsEvery > 0 && counters.margins === options.marginsEvery) {
      const outcome = await reduceMargins(host);
      if (!outcome.ok) return { ...state, ok: false, message: outcome.message };
      state.marginsRounds += 1;
      counters.margins = 0;
      if (!(await recount())) return { ...state, ok: false, message: `${FAILED}: ${NO_PAGE_COUNT_TEXT}` };
      if (pages <= target || cancelled()) break;
    }

    if (options.paraSpaceEvery > 0 && counters.para === options.paraSpaceEvery) {
      const outcome = await reduceParagraphs(host, blocks, 'para');
      if (!outcome.ok) return { ...state, ok: false, message: outcome.message };
      state.paraSpaceRounds += 1;
      counters.para = 0;
      if (!(await recount())) return { ...state, ok: false, message: `${FAILED}: ${NO_PAGE_COUNT_TEXT}` };
      if (pages <= target || cancelled()) break;
    }

    if (options.lineSpaceEvery > 0 && counters.line === options.lineSpaceEvery) {
      const outcome = await reduceParagraphs(host, blocks, 'line');
      if (!outcome.ok) return { ...state, ok: false, message: outcome.message };
      state.lineSpaceRounds += 1;
      counters.line = 0;
      if (!(await recount())) return { ...state, ok: false, message: `${FAILED}: ${NO_PAGE_COUNT_TEXT}` };
      if (pages <= target || cancelled()) break;
    }

    if (fontEvery > 0 && counters.font === fontEvery) {
      const outcome = await reduceFonts(host, blocks, options.fontLimitPt);
      if (!outcome.ok) return { ...state, ok: false, message: outcome.message };
      if (outcome.reduced) state.fontPoints += 1;
      else fontEvery = 0; // אין עוד מה להקטין — כמו `fontSizeTarget = 0` במקור.
      counters.font = 0;
      if (!(await recount())) return { ...state, ok: false, message: `${FAILED}: ${NO_PAGE_COUNT_TEXT}` };
      if (pages <= target || cancelled()) break;
    }
  }

  state.reachedTarget = pages <= target;
  return state;
}
