/**
 * הבדיקות כאן מקבעות את שלוש ההחלטות שבלעדיהן בדיקת האיות מזיקה יותר משהיא
 * מועילה: הגרשיים כחלק מהמילה, הניקוד שמוסר לפני ההשוואה, והתחיליות
 * הדקדוקיות. כל אחת מהן, כשהיא חסרה, מסמנת בדיוק את מה שהמילון התורני נכתב
 * כדי לא לסמן.
 */
import { describe, it, expect } from 'vitest';
import {
  createDictionary,
  findMisspellings,
  normalizeWord,
  type Dictionary,
} from '../../src/engine/spellcheck';

const dict = (...words: string[]): Dictionary => createDictionary(words);
const words = (text: string, d: Dictionary): string[] =>
  findMisspellings(text, d).map((m) => m.word);

describe('normalizeWord', () => {
  it('מסירה ניקוד וטעמים', () => {
    expect(normalizeWord('וַיֹּאמֶר')).toBe('ויאמר');
  });

  it('מאחדת גרשיים טיפוגרפיים לישרים — כך המקלדת מקלידה והמילון כתוב', () => {
    expect(normalizeWord('רש״י')).toBe('רש"י');
    expect(normalizeWord('ר׳')).toBe("ר'");
  });
});

describe('findMisspellings', () => {
  it('מילה מוכרת אינה מסומנת, ולא מוכרת כן', () => {
    expect(words('ויאמר קשקוש', dict('ויאמר'))).toEqual(['קשקוש']);
  });

  it('הגרשיים הם חלק מהמילה — „רש״י” היא ערך אחד ולא שתי שגיאות', () => {
    expect(words('רש״י', dict('רש"י'))).toEqual([]);
    expect(words('אאמו״ר', dict('אאמו"ר'))).toEqual([]);
  });

  it('מנוקד מזוהה מול ערך לא מנוקד', () => {
    expect(words('וַיֹּאמֶר', dict('ויאמר'))).toEqual([]);
  });

  it('תחילית דקדוקית מתקבלת גם כשהשורש החשוף אינו במילון', () => {
    // המילון נבנה בהדבקת תחיליות, והשורש עצמו לא תמיד נכנס כערך.
    const d = dict('ושבת', 'בשבת');
    expect(words('שבת', d)).toEqual([]);
  });

  it('התחילית נבדקת מול המילון הקבוע בלבד, ולא ממציאה מילים', () => {
    expect(words('גזטק', dict('ויאמר'))).toEqual(['גזטק']);
  });

  it('מילים שהמשתמש הוסיף מוכרות אף שאינן ברשימה הקבועה', () => {
    const d = createDictionary(['ויאמר'], ['פלונית']);
    expect(words('ויאמר פלונית', d)).toEqual([]);
  });

  it('המיקום מדויק, כי הצרכן הוא decorations ולא החלפת טקסט', () => {
    const found = findMisspellings('ויאמר קשקוש', dict('ויאמר'));
    expect(found).toEqual([{ word: 'קשקוש', start: 6, end: 11 }]);
  });

  it('מתעלמת מטקסט שאינו עברי', () => {
    expect(words('hello ויאמר 123', dict('ויאמר'))).toEqual([]);
  });

  it('קריאה חוזרת מחזירה אותה תשובה — ה-regex גלובלי ו-lastIndex מאופס', () => {
    const d = dict('ויאמר');
    expect(words('ויאמר קשקוש', d)).toEqual(['קשקוש']);
    expect(words('ויאמר קשקוש', d)).toEqual(['קשקוש']);
  });
});

describe('תחיליות — שני הכיוונים', () => {
  it('מסירה תחילית שכבר על המילה: „ועיין” מול הערך „עיין”', () => {
    expect(words('ועיין', dict('עיין'))).toEqual([]);
    expect(words('שכתב', dict('כתב'))).toEqual([]);
  });

  it('מסירה שתי תחיליות רצופות — „שהתוספות” = ש+ה+תוספות', () => {
    expect(words('שהתוספות', dict('תוספות'))).toEqual([]);
    expect(words('ובמשנה', dict('משנה'))).toEqual([]);
  });

  it('אינה מסירה שלוש — שרשור ארוך היה מקבל כמעט כל מחרוזת', () => {
    expect(words('ושהבדבר', dict('בדבר'))).toEqual(['ושהבדבר']);
  });

  it('אינה מפרקת מילה קצרה לאות בודדת', () => {
    // „של” אינו מתקבל רק מפני ש„ל” הוא ערך: כל אות בודדת הייתה מכשירה הכול.
    expect(words('של', dict('ל'))).toEqual(['של']);
  });
});
