/**
 * „עיצוב מילה ראשונה” — הגדלה/הדגשה של המילה הראשונה בכל פסקה מסומנת,
 * מנהג הדפוס בספרים תורניים. נויד מ-FormatFirstWord.bas של שולחן העורך.
 *
 * ההבדל מהמקור: אין ב-SuperDoc יצירת סגנון תו (נמדד — ראו OtzariaTab), ולכן
 * המסלול היחיד הוא עיצוב ישיר, בערכים שנגזרים מגוף הפסקה עצמה (מקביל למצב
 * ה„דינמי” של המקור): גודל המילה מחושב מגודל הגופן הפתור של המילה השנייה,
 * ולכן פסקאות בגדלים שונים מקבלות כל אחת מילה ראשונה פרופורציונלית.
 *
 * ההסרה מנקה את מאפייני העיצוב הישיר של טווח המילה (ערכי `null` ב-patch) —
 * המילה חוזרת לרשת מהסגנון, בלי למחוק ולהקליד מחדש כמו במקור (ששבר
 * סימניות וקישורים בתוך המילה).
 */
import {
  applyInline,
  inParagraphsText,
  paragraphAlignment,
  resolvedFontAt,
  readResolvedBody,
  scopedBlocks,
  textTarget,
  type ShulchanTarget,
} from './shulchan-doc';

export interface FirstWordOptions {
  /** `'percent'` — הגדלה יחסית לגוף; `'fixed'` — גודל קבוע; `'none'` — בלי שינוי גודל. */
  sizeMode: 'percent' | 'fixed' | 'none';
  /** אחוז ההגדלה במצב `'percent'`. ברירת המחדל של המקור: 30 (=130%). */
  sizePercent: number;
  /** הגודל בנקודות במצב `'fixed'`. */
  fixedSizePt: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  /**
   * „יישור כלפי מעלה” — הנמכת המילה המוגדלת בחצי הפרש הגדלים, כך שראשה
   * מתיישר עם ראש שאר השורה (הנוסחה מהמקור: `-(גודל המילה - גודל הגוף) / 2`).
   */
  raiseBaseline: boolean;
  /**
   * דילוג על כותרות — עיבוד פסקאות גוף בלבד. כמו במקור, „כותרת” היא גם
   * פסקה ממורכזת: בספרים תורניים כותרות-משנה רבות הן פסקאות רגילות
   * שמורכזו ידנית, ומילה ראשונה מוגדלת בהן נראית כטעות.
   */
  skipHeadings: boolean;
  /**
   * עיבוד פסקאות בסגנון הזה בלבד (`w:styleId`); `null` — כל הפסקאות
   * שבבחירה. המקבילה ל„לפי סגנון” של המקור, בצד הסינון בלבד: יצירת סגנון
   * למילה עצמה אינה זמינה במנוע.
   */
  styleId: string | null;
}

export function defaultFirstWordOptions(): FirstWordOptions {
  return {
    sizeMode: 'percent',
    sizePercent: 30,
    fixedSizePt: 18,
    bold: true,
    italic: false,
    underline: false,
    raiseBaseline: false,
    skipHeadings: true,
    styleId: null,
  };
}

/** האם הפסקה היא „כותרת” לעניין הדילוג — לפי סוג הצומת או לפי מירכוז. */
function isHeadingLike(block: { nodeType?: string }, alignment: string | undefined): boolean {
  if (block.nodeType !== undefined && block.nodeType !== 'paragraph') return true;
  return alignment === 'center';
}

/** אורך המילה הראשונה: עד הרווח הראשון, ובלבד שיש אחריה עוד טקסט. `0` = אין מה לעצב. */
export function firstWordLength(text: string): number {
  const space = text.indexOf(' ');
  if (space <= 0) return 0;
  if (text.slice(space + 1).trim() === '') return 0;
  return space;
}

const APPLY_FAILED = 'עיצוב המילה הראשונה נכשל';
const REMOVE_FAILED = 'הסרת עיצוב המילה הראשונה נכשלה';

/** גודל ברירת מחדל כשהמודל לא חשף גודל פתור — 12pt, ברירת המחדל של Word. */
const FALLBACK_BODY_PT = 12;

export interface FirstWordResult {
  ok: boolean;
  message?: string;
  /** מספר הפסקאות שעובדו. */
  formatted: number;
}

export function firstWordSummaryText(result: FirstWordResult, removed: boolean): string {
  if (result.formatted === 0) return 'לא נמצאו פסקאות מתאימות (נדרשת פסקה עם יותר ממילה אחת)';
  if (removed) {
    return result.formatted === 1
      ? 'הוסר עיצוב מפסקה אחת'
      : `הוסר עיצוב מ-${result.formatted} פסקאות`;
  }
  return `עוצבה מילה ראשונה ${inParagraphsText(result.formatted)}`;
}

export async function applyFirstWordDesign(
  host: ShulchanTarget,
  options: FirstWordOptions,
): Promise<FirstWordResult> {
  const scoped = await scopedBlocks(host, 'selection', APPLY_FAILED);
  if (!scoped.ok) {
    return { ok: false, message: scoped.outcome.ok ? undefined : scoped.outcome.message, formatted: 0 };
  }

  const body = await readResolvedBody(host);
  let formatted = 0;

  for (const block of scoped.result.blocks) {
    if (options.styleId !== null && block.styleId !== options.styleId) continue;
    // אורך המילה קודם לקריאת המודל: פסקה של מילה אחת יוצאת בלי לגעת ב-body.
    const length = firstWordLength(block.text);
    if (length === 0) continue;
    if (options.skipHeadings && isHeadingLike(block, paragraphAlignment(body, block.blockId))) continue;

    // גופן הייחוס: התו הראשון של המילה השנייה — כמו במצב הדינמי במקור.
    const reference = resolvedFontAt(body, block.blockId, length + 1);
    const bodyPt = reference.fontSizeCs ?? reference.fontSize ?? FALLBACK_BODY_PT;

    const inline: Record<string, unknown> = {};
    let wordPt = bodyPt;
    if (options.sizeMode === 'percent') {
      // עיגול לחצי נקודה — הרזולוציה של גדלי גופן ב-OOXML.
      wordPt = Math.round(bodyPt * (1 + options.sizePercent / 100) * 2) / 2;
    } else if (options.sizeMode === 'fixed') {
      wordPt = options.fixedSizePt;
    }
    if (options.sizeMode !== 'none' && wordPt > 0) {
      inline.fontSize = wordPt;
      inline.fontSizeCs = wordPt;
    }
    if (options.bold) {
      inline.bold = true;
      inline.bCs = true;
    }
    if (options.italic) {
      inline.italic = true;
      inline.iCs = true;
    }
    if (options.underline) inline.underline = true;
    if (options.raiseBaseline && wordPt !== bodyPt) {
      // position בנקודות שלמות (ראו font-advanced.ts); שלילי = מונמך.
      inline.position = Math.round(-(wordPt - bodyPt) / 2);
    }
    if (Object.keys(inline).length === 0) continue;

    const outcome = await applyInline(host, textTarget(block.blockId, 0, length), inline, APPLY_FAILED);
    if (!outcome.ok) return { ok: false, message: outcome.message, formatted };
    formatted += 1;
  }
  return { ok: true, formatted };
}

/**
 * מנקה את העיצוב הישיר של טווח המילה הראשונה — בדיוק המאפיינים שההחלה
 * עשויה לכתוב. `null` ב-patch מסיר את המאפיין (החזרה לירושה מהסגנון).
 */
export async function removeFirstWordDesign(host: ShulchanTarget): Promise<FirstWordResult> {
  const scoped = await scopedBlocks(host, 'selection', REMOVE_FAILED);
  if (!scoped.ok) {
    return { ok: false, message: scoped.outcome.ok ? undefined : scoped.outcome.message, formatted: 0 };
  }

  let formatted = 0;
  for (const block of scoped.result.blocks) {
    const length = firstWordLength(block.text);
    if (length === 0) continue;

    const outcome = await applyInline(
      host,
      textTarget(block.blockId, 0, length),
      {
        fontSize: null,
        fontSizeCs: null,
        bold: null,
        bCs: null,
        italic: null,
        iCs: null,
        underline: null,
        position: null,
      },
      REMOVE_FAILED,
    );
    if (!outcome.ok) return { ok: false, message: outcome.message, formatted };
    formatted += 1;
  }
  return { ok: true, formatted };
}
