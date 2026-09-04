/**
 * „תיקון מרווח שורות” — קיבוע מרווח „בדיוק” בגובה שורה של גופן הגוף, לכל
 * פסקה מסומנת. נויד מ-lineSpacing.bas של שולחן העורך.
 *
 * למה זה קיים: כשמגדילים את המילה הראשונה, מרווח „שורה בודדת” נמתח לפי
 * הגופן הגדול ביותר בשורה — השורה הראשונה גבוהה מהשאר והפסקה נראית עקומה.
 * מרווח „בדיוק” בגובה גופן הגוף משווה את כל השורות, והמילה הגדולה חורגת
 * מהשורה בלי לדחוף אותה. לכן הכלי רץ לפני „עיצוב מילה ראשונה”.
 *
 * המדידה: במקור נמדד גובה שורה חי מ-Word; כאן — אלמנט מדידה זמני ב-DOM
 * שלנו (לא של המנוע) עם הגופן והגודל הפתורים של גוף הפסקה. ההסרה ממירה
 * חזרה ל„מרובה” באותו יחס, כמו במקור.
 */
import {
  applyParagraphSpacing,
  TWIPS_PER_PT,
  type ParagraphFormatTarget,
} from '../paragraph-format';
import { firstWordLength } from './first-word';
import {
  inParagraphsText,
  readResolvedBody,
  resolvedFontAt,
  scopedBlocks,
  type ShulchanTarget,
} from './shulchan-doc';

/** מודד גובה שורה בודדת בנקודות עבור גופן וגודל. `null` כשאין איך למדוד. */
export type LineHeightMeasurer = (fontFamily: string | undefined, fontSizePt: number) => number | null;

const CSS_PX_PER_PT = 96 / 72;

/**
 * המדידה בפועל: `<div>` נסתר עם `line-height: normal` — הקירוב של הדפדפן
 * למטריקת השורה של הגופן, אותה מטריקה שמנוע התצוגה עצמו מרנדר בה.
 */
export function measureSingleLineHeightPt(fontFamily: string | undefined, fontSizePt: number): number | null {
  if (typeof document === 'undefined' || !document.body || fontSizePt <= 0) return null;
  const probe = document.createElement('div');
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.insetInlineStart = '-9999px';
  probe.style.whiteSpace = 'nowrap';
  probe.style.lineHeight = 'normal';
  probe.style.fontSize = `${fontSizePt}pt`;
  if (fontFamily) probe.style.fontFamily = fontFamily;
  probe.textContent = 'אבגדjq';
  document.body.appendChild(probe);
  const heightPx = probe.getBoundingClientRect().height;
  probe.remove();
  if (!Number.isFinite(heightPx) || heightPx <= 0) return null;
  return heightPx / CSS_PX_PER_PT;
}

const APPLY_FAILED = 'תיקון מרווח השורות נכשל';
const REMOVE_FAILED = 'ביטול תיקון מרווח השורות נכשל';
const MEASURE_FAILED = 'מדידת גובה השורה נכשלה';

/** ברירת מחדל כשהמודל לא חשף גודל — כמו ב-first-word.ts. */
const FALLBACK_BODY_PT = 12;

export interface LineSpacingResult {
  ok: boolean;
  message?: string;
  /** מספר הפסקאות שעודכנו. */
  updated: number;
}

export function lineSpacingSummaryText(result: LineSpacingResult, removed: boolean): string {
  if (result.updated === 0) return 'לא נמצאו פסקאות לעדכון';
  return removed
    ? `מרווח השורות הוחזר ל„מרובה” ${inParagraphsText(result.updated)}`
    : `נקבע מרווח „בדיוק” ${inParagraphsText(result.updated)}`;
}

interface BlockSpacing {
  beforeTwips: number;
  afterTwips: number;
  linePt: number | undefined;
  rule: string | undefined;
}

function readSpacing(props: Record<string, unknown> | undefined): BlockSpacing {
  const spacing = props?.spacing as { before?: unknown; after?: unknown; line?: unknown; lineRule?: unknown } | undefined;
  const toTwips = (points: unknown): number =>
    typeof points === 'number' && Number.isFinite(points) && points > 0 ? Math.round(points * TWIPS_PER_PT) : 0;
  return {
    beforeTwips: toTwips(spacing?.before),
    afterTwips: toTwips(spacing?.after),
    linePt: typeof spacing?.line === 'number' && Number.isFinite(spacing.line) ? spacing.line : undefined,
    rule: typeof spacing?.lineRule === 'string' ? spacing.lineRule : undefined,
  };
}

function blockTarget(blockId: string, nodeType: string | undefined): { kind: 'block'; nodeType: string; nodeId: string } {
  return { kind: 'block', nodeType: nodeType ?? 'paragraph', nodeId: blockId };
}

/** קובעת מרווח „בדיוק” בגובה שורה של גופן הגוף, בפסקאות שאינן כבר „בדיוק”. */
export async function applyExactLineSpacing(
  host: ShulchanTarget,
  measure: LineHeightMeasurer = measureSingleLineHeightPt,
): Promise<LineSpacingResult> {
  const scoped = await scopedBlocks(host, 'selection', APPLY_FAILED);
  if (!scoped.ok) {
    return { ok: false, message: scoped.outcome.ok ? undefined : scoped.outcome.message, updated: 0 };
  }

  const body = await readResolvedBody(host);
  let updated = 0;

  for (const block of scoped.result.blocks) {
    const spacing = readSpacing(body.props(block.blockId));
    if (spacing.rule === 'exact') continue;

    /* גופן הייחוס הוא של גוף הפסקה, ולכן נקרא מהמילה השנייה — היא זו שלא
       הוגדלה. פסקה שכולה מילה אחת אינה יוצאת מהכלל אלא נמדדת מתחילתה:
       דילוג עליה היה משאיר בדיוק את הפסקאות שהכלי בא ליישר, ומשאיר את
       ההסרה (שכן מטפלת בהן) לא סימטרית להחלה. */
    const wordLength = firstWordLength(block.text);
    const reference = resolvedFontAt(body, block.blockId, wordLength > 0 ? wordLength + 1 : 0);
    const bodyPt = reference.fontSizeCs ?? reference.fontSize ?? FALLBACK_BODY_PT;
    const linePt = measure(reference.fontFamily, bodyPt);
    if (linePt === null || linePt <= 0) {
      return { ok: false, message: `${APPLY_FAILED}: ${MEASURE_FAILED}`, updated };
    }

    const outcome = await applyParagraphSpacing(host as ParagraphFormatTarget, blockTarget(block.blockId, block.nodeType), {
      beforeTwips: spacing.beforeTwips,
      afterTwips: spacing.afterTwips,
      lineTwips: Math.round(linePt * TWIPS_PER_PT),
      rule: 'exact',
    });
    if (!outcome.ok) return { ok: false, message: outcome.message, updated };
    updated += 1;
  }
  return { ok: true, updated };
}

/**
 * ממירה פסקאות „בדיוק” חזרה ל„מרובה” ביחס שקול: הערך המוחלט חלקי גובה
 * שורה בודדת של גופן הגוף — `240 × היחס` ביחידות המכפל של OOXML.
 */
export async function removeExactLineSpacing(
  host: ShulchanTarget,
  measure: LineHeightMeasurer = measureSingleLineHeightPt,
): Promise<LineSpacingResult> {
  const scoped = await scopedBlocks(host, 'selection', REMOVE_FAILED);
  if (!scoped.ok) {
    return { ok: false, message: scoped.outcome.ok ? undefined : scoped.outcome.message, updated: 0 };
  }

  const body = await readResolvedBody(host);
  let updated = 0;

  for (const block of scoped.result.blocks) {
    const spacing = readSpacing(body.props(block.blockId));
    if (spacing.rule !== 'exact' || spacing.linePt === undefined || spacing.linePt <= 0) continue;

    const wordLength = firstWordLength(block.text);
    const reference = resolvedFontAt(body, block.blockId, wordLength > 0 ? wordLength + 1 : 0);
    const bodyPt = reference.fontSizeCs ?? reference.fontSize ?? FALLBACK_BODY_PT;
    const singlePt = measure(reference.fontFamily, bodyPt);
    if (singlePt === null || singlePt <= 0) {
      return { ok: false, message: `${REMOVE_FAILED}: ${MEASURE_FAILED}`, updated };
    }

    const outcome = await applyParagraphSpacing(host as ParagraphFormatTarget, blockTarget(block.blockId, block.nodeType), {
      beforeTwips: spacing.beforeTwips,
      afterTwips: spacing.afterTwips,
      lineTwips: Math.round((spacing.linePt / singlePt) * 240),
      rule: 'auto',
    });
    if (!outcome.ok) return { ok: false, message: outcome.message, updated };
    updated += 1;
  }
  return { ok: true, updated };
}
