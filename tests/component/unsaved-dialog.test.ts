/**
 * „המסמך לא נשמר” — הדיאלוג היחיד בתוכנה שתשובה בו מוחקת עבודה.
 *
 * מה שנמדד כאן אינו העיצוב אלא שלוש התכונות שאי אפשר לראות בצילום מסך:
 *
 *   1. **המיקוד הראשוני אינו על „לא לשמור”.** `Enter` מתוך הרגל הוא הדרך
 *      השכיחה ביותר לענות על דיאלוג, וכפתור הרסני שמקבל אותו בברירת מחדל הוא
 *      מחיקה שהמשתמש לא בחר בה.
 *   2. **כל יציאה שאינה בחירה היא „ביטול”** — Esc ולחיצה על הרקע. שתיהן
 *      נראות למשתמש כמו „סגרתי את החלון”, ואף אחת מהן אינה אישור למחיקה.
 *   3. **„שמור” אינו קיים כשאין מה לשמור.** טאב ששוחזר וטרם נטען אין בו מנוע
 *      לייצא ממנו, וכפתור שאין מאחוריו מסלול ביצוע גרוע מכפתור חסר.
 */
import { describe, expect, it } from 'vitest';
import UnsavedChangesDialog from '../../src/ui/panels/UnsavedChangesDialog.vue';
import type { UnsavedQuestion } from '../../src/sessions/open-flow';
import { autoUnmount, mountUi, settle } from './harness';

autoUnmount();

const QUESTION: UnsavedQuestion = {
  content: 'האם לשמור את השינויים שבוצעו בקובץ „חידושים”?',
  canSave: true,
};

function open(question: UnsavedQuestion = QUESTION) {
  return mountUi(UnsavedChangesDialog, { props: { question } });
}

describe('UnsavedChangesDialog', () => {
  it('בלי שאלה — אינו מרונדר בכלל', () => {
    const harness = mountUi(UnsavedChangesDialog, { props: { question: null } });

    expect(harness.wrapper.find('[role="dialog"]').exists()).toBe(false);
  });

  it('שאלה אחת ושלושה כפתורים — לא שתי שאלות רצופות', async () => {
    const harness = open();
    await settle();

    const labels = harness.wrapper.findAll('.unsaved-btn').map((button) => button.text());
    expect(labels).toEqual(['שמור', 'לא לשמור', 'ביטול']);
    expect(harness.wrapper.find('.unsaved-question').text()).toBe(QUESTION.content);
  });

  it('כל כפתור פולט את הבחירה שלו', async () => {
    const harness = open();
    await settle();

    for (const choice of ['save', 'discard', 'cancel'] as const) {
      await harness.wrapper.find(`[data-choice="${choice}"]`).trigger('click');
    }

    expect(harness.wrapper.emitted('choose')).toEqual([['save'], ['discard'], ['cancel']]);
  });

  it('המיקוד הראשוני על „שמור” — ולא על הכפתור ההרסני', async () => {
    const harness = open();
    await settle();

    expect(document.activeElement).toBe(harness.wrapper.find('[data-choice="save"]').element);
  });

  it('בלי „שמור” המיקוד עובר ל„ביטול”, ולא ל„לא לשמור”', async () => {
    // טאב ששוחזר וטרם נטען: `Enter` מתוך הרגל לא אמור למחוק דבר.
    const harness = open({ ...QUESTION, canSave: false });
    await settle();

    expect(harness.wrapper.find('[data-choice="save"]').exists()).toBe(false);
    expect(document.activeElement).toBe(harness.wrapper.find('[data-choice="cancel"]').element);
  });

  it('Esc הוא „ביטול”', async () => {
    const harness = open();
    await settle();

    await harness.wrapper.find('[role="dialog"]').trigger('keydown.esc');

    expect(harness.wrapper.emitted('choose')).toEqual([['cancel']]);
  });

  it('לחיצה על הרקע היא „ביטול”', async () => {
    const harness = open();
    await settle();

    await harness.wrapper.find('.modal-backdrop').trigger('click');

    expect(harness.wrapper.emitted('choose')).toEqual([['cancel']]);
  });

  it('לחיצה בתוך החלון אינה סוגרת אותו', async () => {
    const harness = open();
    await settle();

    await harness.wrapper.find('.unsaved-question').trigger('click');

    expect(harness.wrapper.emitted('choose')).toBeUndefined();
  });

  it('אין כותרת — החלון הוא השאלה והכפתורים בלבד', async () => {
    const harness = open();
    await settle();

    expect(harness.wrapper.find('.unsaved-header').exists(), 'אין פס כותרת').toBe(false);
    expect(
      harness.wrapper.find('.unsaved-dialog').text().replace(/\s+/g, ' ').trim(),
      'השאלה, ושלושת הכפתורים',
    ).toBe(`${QUESTION.content} שמור לא לשמור ביטול`);
  });

  it('מודאלי בהצהרה ובהתנהגות: שם נגיש ומלכודת מיקוד', async () => {
    const harness = open();
    await settle();

    const dialog = harness.wrapper.find('[role="dialog"]');
    expect(dialog.attributes('aria-modal')).toBe('true');
    // בלי כותרת, השאלה עצמה היא השם הנגיש — אחרת החלון מוכרז בלי שם כלל.
    expect(
      harness.wrapper.find(`#${dialog.attributes('aria-labelledby')}`).text(),
    ).toBe(QUESTION.content);

    // Tab מהאחרון חוזר לראשון: `aria-modal` בלי מלכודת הוא הצהרה שקרית.
    const buttons = harness.wrapper.findAll('.unsaved-btn');
    (buttons[buttons.length - 1]!.element as HTMLElement).focus();
    await buttons[buttons.length - 1]!.trigger('keydown', { key: 'Tab' });

    expect(document.activeElement).toBe(buttons[0]!.element);
  });

  it('Shift+Tab מהראשון קופץ לאחרון', async () => {
    const harness = open();
    await settle();

    const buttons = harness.wrapper.findAll('.unsaved-btn');
    (buttons[0]!.element as HTMLElement).focus();
    await buttons[0]!.trigger('keydown', { key: 'Tab', shiftKey: true });

    expect(document.activeElement).toBe(buttons[buttons.length - 1]!.element);
  });

  it('המיקוד חוזר למי שפתח כשהדיאלוג נסגר', async () => {
    // בלי זה הוא נופל ל-`body`, וההקלדה הבאה אינה נכנסת לשום מקום.
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const harness = open();
    await settle();
    expect(document.activeElement).not.toBe(opener);

    await harness.wrapper.setProps({ question: null });
    await settle();

    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
