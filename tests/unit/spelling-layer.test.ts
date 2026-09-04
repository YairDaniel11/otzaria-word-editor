/**
 * החשבון של שכבת בדיקת האיות: איפה הקו יושב, ועל איזו מילה נלחץ.
 *
 * שתי הכרעות שנשברות בשקט — קו שנראה שייך לשורה שאחריו, ותפריט הקשר שמציע
 * להוסיף למילון מילה שאינה זו שנלחצה — ולכן הן פונקציות טהורות ולא לוגיקה
 * בתוך ה-`.vue`, בדיוק כמו engine/formatting-marks-layer.ts.
 */
import { describe, it, expect } from 'vitest';
import { buildSpellingMarks, wordAtPoint, UNDERLINE_PX } from '../../src/engine/spelling-layer';
import type { MeasuredSegment } from '../../src/engine/page-ruler';

function segment(text: string, leftPx: number, topPx: number, widthPx = 40, heightPx = 20): MeasuredSegment {
  return { text, rects: [{ leftPx, topPx, widthPx, heightPx }] };
}

describe('buildSpellingMarks', () => {
  it('הקו יושב על תחתית המילה, ברוחב שלה', () => {
    const [mark] = buildSpellingMarks([segment('זזזזז', 10, 100)]);

    expect(mark).toMatchObject({ leftPx: 10, widthPx: 40, topPx: 100 + 20 - UNDERLINE_PX });
  });

  it('מילה שנפרסה על שתי תיבות מקבלת קו לכל אחת', () => {
    // עיצוב שמשתנה באמצע מילה נותן שני מלבנים; קו אחד שנמתח ביניהם היה
    // חוצה גם את מה שביניהן.
    const marks = buildSpellingMarks([
      { text: 'תוספות', rects: [{ leftPx: 0, topPx: 0, widthPx: 20, heightPx: 20 }, { leftPx: 30, topPx: 0, widthPx: 20, heightPx: 20 }] },
    ]);

    expect(marks).toHaveLength(2);
    expect(marks.map((mark) => mark.leftPx)).toEqual([0, 30]);
  });

  it('כל קו מקבל מפתח משלו', () => {
    const marks = buildSpellingMarks([segment('זזזזז', 0, 0), segment('זזזזז', 0, 40)]);

    expect(new Set(marks.map((mark) => mark.key)).size).toBe(2);
  });

  it('בלי טווחים — אין קווים', () => {
    expect(buildSpellingMarks([])).toEqual([]);
  });
});

describe('wordAtPoint', () => {
  const segments = [segment('זזזזז', 10, 100), segment('חחחחח', 200, 300)];

  it('מחזירה את המילה שהנקודה בתוך מלבנה', () => {
    expect(wordAtPoint(segments, 20, 110)).toBe('זזזזז');
    expect(wordAtPoint(segments, 210, 310)).toBe('חחחחח');
  });

  it('הפגיעה היא על מלבן המילה, לא על הקו שמתחתיה', () => {
    // הקו הוא שלושה פיקסלים בתחתית; לחיצה בראש המילה חייבת להיתפס.
    expect(wordAtPoint(segments, 20, 101)).toBe('זזזזז');
  });

  it('הגבולות כלולים — פתיחה מהמקלדת מעגנת בדיוק על תחתית המלבן', () => {
    expect(wordAtPoint(segments, 10, 100)).toBe('זזזזז');
    expect(wordAtPoint(segments, 50, 120)).toBe('זזזזז');
  });

  it('נקודה מחוץ לכל מלבן מחזירה `null`', () => {
    expect(wordAtPoint(segments, 100, 110)).toBeNull();
    expect(wordAtPoint(segments, 20, 200)).toBeNull();
    expect(wordAtPoint([], 20, 110)).toBeNull();
  });
});
