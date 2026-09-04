/**
 * החשבון של שכבת בדיקת האיות — טווחים שנמדדו (`MeasuredSegment`,
 * engine/page-ruler.ts) הופכים לקווים לציור, ונקודה על המסך הופכת למילה.
 *
 * טהור וסינכרוני, בלי DOM ובלי מנוע — אותה חלוקה בדיוק כמו
 * engine/formatting-marks-layer.ts מול engine/page-ruler.ts, ומאותה סיבה:
 * „איפה בדיוק יושב הקו” ו„על איזו מילה נלחץ” הן החלטות שנשברות בשקט (קו
 * שנראה שייך לשורה הבאה, תפריט שמציע להוסיף מילה אחרת), ובתוך `.vue` אי
 * אפשר לבדוק אותן בלי להרכיב DOM ולשאול אותו.
 */
import type { MeasuredSegment, RawTextRect } from './page-ruler';

/** קו גלי אחד לציור, בקואורדינטות שכבת הציור. */
export interface SpellingMark {
  /** מפתח יציב ל-`v-for`. */
  readonly key: string;
  readonly leftPx: number;
  readonly topPx: number;
  readonly widthPx: number;
}

/** גובה הקו הגלי. חייב להתאים ל-`height` של `.spelling-layer__mark`. */
export const UNDERLINE_PX = 3;

/**
 * הקווים לציור. מילה שנפרסה על שתי תיבות (עיצוב שמשתנה באמצעה) מקבלת קו
 * לכל אחת — `getClientRects` מחזיר מלבן לכל תיבה, וקו אחד שמתח ביניהם היה
 * חוצה גם את מה שביניהן.
 */
export function buildSpellingMarks(segments: readonly MeasuredSegment[]): SpellingMark[] {
  const marks: SpellingMark[] = [];
  segments.forEach((segment, index) => {
    segment.rects.forEach((rect, part) => {
      marks.push({
        key: `${index}:${part}:${segment.text}`,
        leftPx: rect.leftPx,
        // הקו יושב על הבסיס התחתון של המילה ולא מתחתיה: קו שתלוי באוויר בין
        // שתי שורות נראה שייך לשורה שאחריו.
        topPx: rect.topPx + rect.heightPx - UNDERLINE_PX,
        widthPx: rect.widthPx,
      });
    });
  });
  return marks;
}

function inside(rect: RawTextRect, x: number, y: number): boolean {
  return (
    x >= rect.leftPx &&
    x <= rect.leftPx + rect.widthPx &&
    y >= rect.topPx &&
    y <= rect.topPx + rect.heightPx
  );
}

/**
 * המילה שמתחת לנקודה (בקואורדינטות שכבת הציור), או `null`.
 *
 * הפגיעה נבדקת מול מלבן המילה **המלא** ולא מול הקו הדק שמתחתיה: המשתמש לוחץ
 * ימנית על המילה, לא על שלושת הפיקסלים שמתחתיה. הגבולות כוללים (`<=`) —
 * פתיחת התפריט מהמקלדת (`Shift+F10`) מעגנת בדיוק על תחתית מלבן הסמן, ונמדד
 * שהוא זהה לתחתית מלבן המילה עד לספרה האחרונה.
 */
export function wordAtPoint(
  segments: readonly MeasuredSegment[],
  x: number,
  y: number,
): string | null {
  for (const segment of segments) {
    for (const rect of segment.rects) {
      if (inside(rect, x, y)) return segment.text;
    }
  }
  return null;
}
