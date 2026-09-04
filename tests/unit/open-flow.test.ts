/**
 * ההחלטות שקובעות אם עבודה של המשתמש נמחקת. הן יושבות במודול נפרד בדיוק כדי
 * שיהיו כאן: מוטציה שהחליפה את כל הזרימה ב„פשוט תמחק” עברה בעבר את כל
 * הבדיקות, כי היא הייתה בתוך המעטפת שאין עליה כיסוי.
 *
 * מאז ששלוש התשובות מגיעות מדיאלוג אחד (`UnsavedChoice`), מה שנמדד כאן הוא
 * בעיקר **המיפוי**: איזו בחירה הופכת ל„לשמור קודם”, איזו למחיקה, ומה קורה לכל
 * מה שאינו אחת מהשתיים. הבדיקה האחרונה בכל תיאור היא זו שמגינה על הכיוון:
 * ברירת המחדל אינה הרסנית.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  decideDocumentSwitch,
  decidePendingTabClose,
  unsavedQuestionText,
  type UnsavedChoice,
  type UnsavedQuestion,
} from '../../src/sessions/open-flow';

function deps(options: {
  dirty?: boolean;
  saving?: boolean;
  /** מה שהמשתמש בחר. ברירת המחדל — דיאלוג שנסגר בלי בחירה. */
  choice?: UnsavedChoice;
}) {
  const asked: UnsavedQuestion[] = [];
  const ask = vi.fn(async (question: UnsavedQuestion) => {
    asked.push(question);
    return options.choice ?? 'cancel';
  });
  return {
    asked,
    ask,
    deps: {
      isDirty: () => options.dirty ?? false,
      isSaving: () => options.saving ?? false,
      ask,
      documentName: () => 'חידושים',
    },
  };
}

describe('decideDocumentSwitch', () => {
  it('מסמך נקי — מחליפים בלי לשאול', async () => {
    const h = deps({ dirty: false });

    await expect(decideDocumentSwitch(h.deps)).resolves.toEqual({ action: 'switch' });
    expect(h.ask).not.toHaveBeenCalled();
  });

  it('בזמן שמירה — לא מחליפים ולא שואלים', async () => {
    const h = deps({ dirty: true, saving: true });

    await expect(decideDocumentSwitch(h.deps)).resolves.toEqual({
      action: 'cancel',
      reason: 'saving',
    });
    expect(h.ask).not.toHaveBeenCalled();
  });

  it('„שמור” ⇒ לשמור קודם', async () => {
    const h = deps({ dirty: true, choice: 'save' });

    await expect(decideDocumentSwitch(h.deps)).resolves.toEqual({ action: 'save-first' });
  });

  it('„לא לשמור” ⇒ מחליפים — בשאלה אחת ולא בשתיים', async () => {
    // זה הלב של השינוי: עד כאן נדרשה שאלה שנייה („למחוק?”) מפני שהמחיקה
    // הייתה סופית. הגיבוי (sessions/discard-backup.ts) הוא מה שהחליף אותה.
    const h = deps({ dirty: true, choice: 'discard' });

    await expect(decideDocumentSwitch(h.deps)).resolves.toEqual({ action: 'switch' });
    expect(h.ask, 'שאלה אחת בלבד').toHaveBeenCalledTimes(1);
  });

  it('„ביטול” ⇒ לא קורה כלום', async () => {
    const h = deps({ dirty: true, choice: 'cancel' });

    await expect(decideDocumentSwitch(h.deps)).resolves.toEqual({
      action: 'cancel',
      reason: 'user',
    });
  });

  it('דיאלוג שנסגר בלי בחירה נחשב „ביטול” ⇒ לא מוחקים', async () => {
    // Esc, לחיצה על הרקע, פירוק המעטפת. פייל-קלוז: הכיוון הבטוח הוא לא לעשות
    // את הפעולה ההרסנית.
    const h = deps({ dirty: true });

    await expect(decideDocumentSwitch(h.deps)).resolves.toEqual({
      action: 'cancel',
      reason: 'user',
    });
  });

  it('שאלה אחת, שם הקובץ בגרשיים, ו„שמור” מוצע', async () => {
    const h = deps({ dirty: true, choice: 'cancel' });

    await decideDocumentSwitch(h.deps);

    expect(h.asked[0]?.content).toBe('האם לשמור את השינויים שבוצעו בקובץ „חידושים”?');
    expect(h.asked[0]?.canSave, 'יש מנוע, ולכן יש מה לשמור').toBe(true);
  });

  it('אין כותרת לחלון — השאלה היא כל התוכן', async () => {
    // כותרת „המסמך לא נשמר” מעל שאלה שאומרת את אותו דבר היא אמירה כפולה,
    // והיא מרחיקה את השאלה מהכפתורים שעונים עליה.
    const h = deps({ dirty: true, choice: 'cancel' });

    await decideDocumentSwitch(h.deps);

    expect(Object.keys(h.asked[0] ?? {})).toEqual(['content', 'canSave']);
  });
});

describe('unsavedQuestionText', () => {
  it('שם הקובץ נעטף בגרשיים', () => {
    // בלעדיהם שם שיש בו רווח, או שהוא בעצמו מילה במשפט, נבלע בו.
    expect(unsavedQuestionText('הלכות שבת')).toBe(
      'האם לשמור את השינויים שבוצעו בקובץ „הלכות שבת”?',
    );
  });

  it('גם שם ריק אינו שובר את המשפט', () => {
    expect(unsavedQuestionText('')).toContain('„”');
  });
});

/**
 * סגירת טאב ששוחזר ועדיין לא נטען. אין בו מנוע שיענה „יש שינויים?”, ויש בו
 * טיוטה שהסגירה מוחקת — ולכן ההחלטה כאן ולא במעטפת.
 */
describe('decidePendingTabClose', () => {
  function pending(options: { hasDraft: boolean; choice?: UnsavedChoice }) {
    const asked: UnsavedQuestion[] = [];
    const ask = vi.fn(async (question: UnsavedQuestion) => {
      asked.push(question);
      return options.choice ?? 'cancel';
    });
    return {
      asked,
      ask,
      deps: {
        hasDraft: () => options.hasDraft,
        ask,
        documentName: () => 'חידושים',
      },
    };
  }

  it('אין טיוטה — אין מה לאבד, ואין שאלה', async () => {
    const h = pending({ hasDraft: false });

    expect(await decidePendingTabClose(h.deps)).toEqual({ action: 'switch' });
    expect(h.ask).not.toHaveBeenCalled();
  });

  it('יש טיוטה — שואלים, ו„ביטול” משאיר את הטאב', async () => {
    // הכשל החמור שהשאלה הזאת מונעת: מחיקה שקטה של עבודה שהמשתמש עוד לא ראה.
    const h = pending({ hasDraft: true, choice: 'cancel' });

    expect(await decidePendingTabClose(h.deps)).toEqual({ action: 'cancel', reason: 'user' });
    // „להמשיך” ולא „לסגור את הטאב”: אותה החלטה נשאלת גם ביציאה, ונוסח שמדבר
    // על טאב היה שקרי במחצית מהמקרים.
    expect(h.asked[0]?.content).toBe(
      'יש שינויים שלא נשמרו בקובץ „חידושים”, והם עדיין לא נפתחו. להמשיך בלעדיהם?',
    );
    expect(h.asked[0]?.content, 'הנוסח אינו מניח סגירת טאב').not.toContain('הטאב');
  });

  it('„לא לשמור” סוגר', async () => {
    const h = pending({ hasDraft: true, choice: 'discard' });

    expect(await decidePendingTabClose(h.deps)).toEqual({ action: 'switch' });
    expect(h.ask).toHaveBeenCalledTimes(1);
  });

  it('„שמור” אינו מוצע — ואפילו אם ייענה, אינו סוגר', async () => {
    // שאלה שאין לה מסלול ביצוע גרועה משאלה שלא נשאלה: אין מנוע לייצא ממנו.
    const h = pending({ hasDraft: true, choice: 'save' });

    expect(await decidePendingTabClose(h.deps)).toEqual({ action: 'cancel', reason: 'user' });
    expect(h.asked[0]?.canSave, 'הכפתור אינו מוצג כלל').toBe(false);
  });
});
