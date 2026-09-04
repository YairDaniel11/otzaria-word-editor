/**
 * מה מופיע בתפריט ההקשר בכל הקשר.
 *
 * זו הבדיקה ששומרת על ההבחנה שכל התפריט נבנה סביבה (docs/context-menu-plan.md
 * §3.2): **מוסתר** הוא „לא שייך לכאן”, ו**מנוטרל** הוא „שייך ואינו זמין
 * עכשיו”. בלי בדיקה כזאת ההבחנה נשחקת בדיוק בכיוון אחד — הכול נעשה מוסתר,
 * מפני שזה נראה נקי יותר — והמשתמש מפסיק לדעת שהפעולה קיימת בכלל.
 */
import { describe, it, expect } from 'vitest';
import {
  contextMenuEntries,
  contextMenuFocusOrder,
  contextMenuModel,
  type ContextMenuSnapshot,
} from '../../src/ui/menu/context-menu-model';
import type { DocCapabilityQuestion } from '../../src/engine/doc-capabilities';

function snapshot(over: Partial<ContextMenuSnapshot> = {}): ContextMenuSnapshot {
  return {
    hasDocument: true,
    hasRange: true,
    storyType: 'body',
    misspelledWord: null,
    can: () => true,
    ...over,
  };
}

/** כל היכולות זמינות חוץ מאלה שנמסרו — כך שכל בדיקה מכבה בדיוק אחת. */
function without(...missing: DocCapabilityQuestion[]) {
  return (question: DocCapabilityQuestion) => !missing.includes(question);
}

function entry(model: ReturnType<typeof contextMenuModel>, id: string) {
  return contextMenuEntries(model).find((item) => item.id === id);
}

describe('contextMenuModel', () => {
  it('בלי מסמך אין תפריט כלל', () => {
    expect(contextMenuModel(snapshot({ hasDocument: false }))).toEqual([]);
  });

  it('בחירת טווח: שתי שורות אייקונים, שורת בוררים ושלושה מקטעי כתיבה', () => {
    const model = contextMenuModel(snapshot());

    expect(model.map((section) => section.id)).toEqual([
      'clipboard',
      'fonts',
      'format',
      'insert',
      'otzaria',
      'edit',
    ]);
    expect(model.filter((section) => section.layout === 'icons')).toHaveLength(2);
  });

  /**
   * שורת הגופן היא המקטע היחיד שאינו כפתורים, ולכן היא המקטע היחיד שהסינון
   * „מקטע ריק אינו מצויר” היה מפיל בשקט אם הוא היה סופר פריטים בלבד.
   */
  it('שורת הגופן היא בוררים ולא פריטים, ואינה נעלמת בסינון', () => {
    const fonts = contextMenuModel(snapshot()).find((section) => section.id === 'fonts');

    expect(fonts?.layout).toBe('fonts');
    expect(fonts?.controls).toEqual(['font-family', 'font-size']);
    expect(fonts?.entries).toEqual([]);
  });

  /**
   * גופן חל גם על סמן מכווץ (הוא קובע את מה שיוקלד), וגם בכותרת עליונה. מה
   * שמנטרל את הבוררים הוא המנוע דרך `CommandState`, ולא המודל.
   */
  it('שורת הגופן אינה תלויה בבחירה, ב-story או ביכולות', () => {
    for (const over of [{ hasRange: false }, { storyType: 'header' }, { can: () => false }]) {
      const model = contextMenuModel(snapshot(over));

      expect(model.some((section) => section.id === 'fonts'), JSON.stringify(over)).toBe(true);
    }
  });

  /**
   * כיווניות הפסקה הייתה כאן והוסרה לבקשת המשתמש: היא מדברת על הפסקה כולה,
   * בשורה שכל השאר בה מדבר על הטקסט המסומן. הקיצורים ברג'יסטרי לא נגעו.
   */
  it('כיווניות הפסקה אינה בתפריט', () => {
    const model = contextMenuModel(snapshot());

    expect(entry(model, 'direction-rtl')).toBeUndefined();
    expect(entry(model, 'direction-ltr')).toBeUndefined();
  });

  /**
   * החצים הם הדרך היחידה להגיע לבורר במקלדת (Tab סוגר את הכרטיס), ולכן
   * הבוררים חייבים להיות ברשימת המיקוד — בין הפריט שלפניהם לזה שאחריהם.
   */
  it('סדר המיקוד כולל את הבוררים, במקומם בכרטיס', () => {
    const order = contextMenuFocusOrder(contextMenuModel(snapshot()));

    expect(order.slice(0, 6)).toEqual([
      'cut',
      'copy',
      'paste',
      'format-painter',
      'font-family',
      'font-size',
    ]);
    expect(order[order.length - 1]).toBe('select-all');
  });

  it('סמן מכווץ מנטרל גזירה והעתקה, ומשאיר הדבקה', () => {
    const model = contextMenuModel(snapshot({ hasRange: false }));

    expect(entry(model, 'cut')?.disabled).toBe(true);
    expect(entry(model, 'copy')?.disabled).toBe(true);
    expect(entry(model, 'paste')?.disabled).toBe(false);
  });

  it('בחירה ללא יכולת מחיקה משאירה „העתק” ומנטרלת „גזור” בלבד', () => {
    const model = contextMenuModel(snapshot({ can: without('canDeleteSelection') }));

    expect(entry(model, 'copy')?.disabled).toBe(false);
    expect(entry(model, 'cut')?.disabled).toBe(true);
  });

  it('פקודות מנוע אינן מקבלות ניטרול מהמודל — המצב שלהן חי', () => {
    const model = contextMenuModel(snapshot({ can: () => false, hasRange: false }));

    for (const item of contextMenuEntries(model)) {
      if (item.run.kind === 'command') expect(item.disabled).toBeUndefined();
    }
  });

  it('בכותרת עליונה: „הערת שוליים” ו„ציטוט מהקורא” מוסתרים, „קישור” נשאר', () => {
    const model = contextMenuModel(snapshot({ storyType: 'header' }));

    expect(entry(model, 'footnote')).toBeUndefined();
    expect(entry(model, 'insert-citation')).toBeUndefined();
    expect(entry(model, 'link')).toBeDefined();
    expect(entry(model, 'search-otzaria')).toBeDefined();
  });

  it('story שלא נקרא נחשב גוף המסמך — נכשלים לכיוון הגלוי', () => {
    const model = contextMenuModel(snapshot({ storyType: null }));

    expect(entry(model, 'footnote')).toBeDefined();
    expect(entry(model, 'insert-citation')).toBeDefined();
  });

  it('יכולת חסרה מנטרלת ואינה מסתירה', () => {
    const model = contextMenuModel(
      snapshot({ can: without('canInsertLink', 'canInsertFootnote', 'canResolveRange') }),
    );

    expect(entry(model, 'link')?.disabled).toBe(true);
    expect(entry(model, 'footnote')?.disabled).toBe(true);
    expect(entry(model, 'select-all')?.disabled).toBe(true);
  });

  it('בלי מילה מסומנת רצים רק שלושת המסלולים הרגילים', () => {
    const kinds = new Set(contextMenuEntries(contextMenuModel(snapshot())).map((item) => item.run.kind));

    expect([...kinds].sort()).toEqual(['action', 'clipboard', 'command']);
  });

  it('מילה מסומנת מוסיפה „הוסף למילון” בראש התפריט, עם המילה עצמה', () => {
    const model = contextMenuModel(snapshot({ misspelledWord: 'זצ"ל' }));

    expect(model[0]!.id).toBe('dictionary');
    const item = entry(model, 'add-to-dictionary');
    expect(item?.label).toBe('הוסף את „זצ"ל” למילון');
    expect(item?.run).toEqual({ kind: 'dictionary', word: 'זצ"ל' });
  });

  it('בלי מילה מסומנת — אין מקטע איות', () => {
    expect(entry(contextMenuModel(snapshot()), 'add-to-dictionary')).toBeUndefined();
  });

  it('אין פריט בלי אייקון או בלי תווית', () => {
    for (const item of contextMenuEntries(contextMenuModel(snapshot({ misspelledWord: 'זזזזז' })))) {
      expect(item.icon, item.id).toBeTruthy();
      expect(item.label, item.id).toBeTruthy();
    }
  });
});
