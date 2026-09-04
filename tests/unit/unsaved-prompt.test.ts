/**
 * הגשר בין החלטה שממתינה לתשובה לבין דיאלוג שמצויר על המסך.
 *
 * מה שנמדד כאן הוא הכשל שאין לו סימן: הבטחה שאינה נפתרת. `await` שלא חוזר
 * ממנו נראה בדיוק כמו „לא קרה כלום” — הטאב פשוט לא נסגר, בלי שגיאה ובלי
 * הודעה — ולכן שלושת המסלולים שיכולים להשאיר אותה תלויה נבדקים במפורש.
 */
import { describe, expect, it, vi } from 'vitest';
import { createUnsavedPrompt } from '../../src/composables/use-unsaved-prompt';
import type { UnsavedQuestion } from '../../src/sessions/open-flow';

const QUESTION: UnsavedQuestion = {
  content: 'האם לשמור את השינויים שבוצעו בקובץ „חידושים”?',
  canSave: true,
};

describe('createUnsavedPrompt', () => {
  it('אין שאלה עד ששואלים', () => {
    expect(createUnsavedPrompt().question.value).toBeNull();
  });

  it('`ask` מציגה את השאלה, ו-`answer` מחזירה את הבחירה', async () => {
    const prompt = createUnsavedPrompt();

    const pending = prompt.ask(QUESTION);
    expect(prompt.question.value).toEqual(QUESTION);

    prompt.answer('discard');
    await expect(pending).resolves.toBe('discard');
    expect(prompt.question.value, 'הדיאלוג נסגר').toBeNull();
  });

  it('שלוש הבחירות עוברות כמות שהן', async () => {
    for (const choice of ['save', 'discard', 'cancel'] as const) {
      const prompt = createUnsavedPrompt();
      const pending = prompt.ask(QUESTION);
      prompt.answer(choice);
      await expect(pending).resolves.toBe(choice);
    }
  });

  it('שאלה שנייה בזמן שהראשונה פתוחה נענית „ביטול” מיד', async () => {
    // לא תור ולא החלפה: החלפה הייתה משאירה את הראשונה תלויה לנצח, ותור היה
    // מציג שאלה על מסמך שהמשתמש כבר לא בהקשר שלו.
    const prompt = createUnsavedPrompt();
    const first = prompt.ask(QUESTION);

    await expect(prompt.ask({ ...QUESTION, content: 'אחר' })).resolves.toBe('cancel');
    expect(prompt.question.value?.content, 'הראשונה עדיין על המסך').toBe(QUESTION.content);

    prompt.answer('save');
    await expect(first).resolves.toBe('save');
  });

  it('`dispose` פותרת את מי שממתין — ולא משאירה `await` תלוי', async () => {
    const prompt = createUnsavedPrompt();
    const pending = prompt.ask(QUESTION);

    prompt.dispose();

    await expect(pending).resolves.toBe('cancel');
    expect(prompt.question.value).toBeNull();
  });

  it('`answer` בלי שאלה פתוחה אינה עושה דבר', () => {
    const prompt = createUnsavedPrompt();

    expect(() => prompt.answer('discard')).not.toThrow();
    expect(prompt.question.value).toBeNull();
  });

  it('אחרי תשובה אפשר לשאול שוב', async () => {
    const prompt = createUnsavedPrompt();

    prompt.answer('cancel');
    const first = prompt.ask(QUESTION);
    prompt.answer('cancel');
    await expect(first).resolves.toBe('cancel');

    const second = prompt.ask(QUESTION);
    expect(prompt.question.value, 'הדיאלוג נפתח שוב').not.toBeNull();
    prompt.answer('save');
    await expect(second).resolves.toBe('save');
  });

  it('ההבטחה נפתרת פעם אחת בלבד', async () => {
    const prompt = createUnsavedPrompt();
    const resolved = vi.fn();

    void prompt.ask(QUESTION).then(resolved);
    prompt.answer('save');
    prompt.answer('discard');
    await Promise.resolve();

    expect(resolved).toHaveBeenCalledTimes(1);
    expect(resolved).toHaveBeenCalledWith('save');
  });
});
