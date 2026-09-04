/**
 * מסך „מסמכים שנסגרו בלי לשמור”.
 *
 * מה שנמדד כאן הוא מה שאי אפשר לראות בצילום מסך: שהשורה אומרת **מה** יש בה
 * (שם, גיל וגודל) ולא רק שם, שהמיקוד נוחת על מה שבאו בשבילו, ושההסרה —
 * הפעולה ההרסנית היחידה בחלון — היא כפתור נפרד ולא לחיצה על השורה.
 */
import { describe, expect, it } from 'vitest';
import DiscardedDocumentsDialog from '../../src/ui/panels/DiscardedDocumentsDialog.vue';
import type { DiscardedDocument } from '../../src/sessions/discard-backup';
import { autoUnmount, mountUi, settle } from './harness';

autoUnmount();

const MINUTE = 60_000;

function entry(over: Partial<DiscardedDocument> = {}): DiscardedDocument {
  return {
    slot: 0,
    name: 'חידושים',
    size: 42 * 1024,
    discardedAt: Date.now() - 2 * MINUTE,
    token: null,
    ...over,
  };
}

function open(entries: DiscardedDocument[] = [entry()], busy = false) {
  return mountUi(DiscardedDocumentsDialog, { props: { isOpen: true, entries, busy } });
}

describe('DiscardedDocumentsDialog', () => {
  it('סגור אינו מרונדר בכלל', () => {
    const harness = mountUi(DiscardedDocumentsDialog, { props: { isOpen: false } });

    expect(harness.wrapper.find('[role="dialog"]').exists()).toBe(false);
  });

  it('שורה לכל גיבוי, בסדר שנמסר', async () => {
    const harness = open([
      entry({ slot: 2, name: 'חדש' }),
      entry({ slot: 0, name: 'ישן', discardedAt: Date.now() - 3 * 24 * 60 * MINUTE }),
    ]);
    await settle();

    expect(harness.wrapper.findAll('.discarded-name').map((row) => row.text())).toEqual([
      'חדש',
      'ישן',
    ]);
  });

  it('השורה אומרת גם מתי וגם כמה — לא רק שם', async () => {
    // בלי זה המשתמש חייב לפתוח כדי לדעת מה יש בשורה.
    const harness = open([entry({ discardedAt: Date.now() - 2 * 60 * MINUTE })]);
    await settle();

    expect(harness.wrapper.find('.discarded-meta').text()).toBe('לפני שעתיים · 42KB');
  });

  it('ערך שאינו ידוע פשוט אינו מוצג — ולא כאפס', async () => {
    // `size: 0` ו-`discardedAt: 0` הם „לא ידוע” ברשומה. „0KB” היה נראה כמו
    // מסמך ריק, וזה שקר על עותק שנכתב.
    const harness = open([entry({ size: 0, discardedAt: 0 })]);
    await settle();

    expect(harness.wrapper.find('.discarded-meta').text()).toBe('');
  });

  it('מגה-בייט מוצג כמגה-בייט', async () => {
    const harness = open([entry({ size: 2 * 1024 * 1024 + 512 * 1024 })]);
    await settle();

    expect(harness.wrapper.find('.discarded-meta').text()).toContain('2.5MB');
  });

  it('לחיצה על השורה פולטת „פתח” עם המשבצת שלה', async () => {
    const harness = open([entry({ slot: 3 })]);
    await settle();

    await harness.wrapper.find('.discarded-open').trigger('click');

    expect(harness.wrapper.emitted('open')).toEqual([[3]]);
  });

  it('„הסר” הוא כפתור נפרד, ואינו נבלע בלחיצה על השורה', async () => {
    // ההסרה מוחקת עבודה. מחיקה שמתחבאת בתוך פעולה אחרת היא מחיקה שקורית בטעות.
    const harness = open([entry({ slot: 1 })]);
    await settle();

    await harness.wrapper.find('.discarded-forget').trigger('click');

    expect(harness.wrapper.emitted('forget')).toEqual([[1]]);
    expect(harness.wrapper.emitted('open'), 'ולא נפתח דבר').toBeUndefined();
  });

  it('הודעה מפורשת כשאין מה לשחזר', async () => {
    const harness = open([]);
    await settle();

    expect(harness.wrapper.find('.discarded-empty').exists()).toBe(true);
    expect(harness.wrapper.findAll('.discarded-row')).toHaveLength(0);
  });

  it('בזמן פעולה על המסמך הפקדים ההרסניים מנוטרלים, ו„סגור” לא', async () => {
    const harness = open([entry()], true);
    await settle();

    expect(harness.wrapper.find('.discarded-open').attributes('disabled')).toBeDefined();
    expect(harness.wrapper.find('.discarded-forget').attributes('disabled')).toBeDefined();
    expect(
      harness.wrapper.find('.discarded-btn').attributes('disabled'),
      '„סגור” אינו נוגע במסמך',
    ).toBeUndefined();
  });

  it('החלון אומר שהקובץ המקורי אינו משתנה', async () => {
    // זו השאלה הראשונה של מי שנכנס לכאן, והתשובה עליה קובעת אם הוא ילחץ.
    const harness = open();
    await settle();

    expect(harness.wrapper.find('.discarded-note').text()).toContain('הקובץ המקורי אינו משתנה');
  });

  it('המיקוד נוחת על הגיבוי הראשון — לא על „סגור”', async () => {
    const harness = mountUi(DiscardedDocumentsDialog, {
      props: { isOpen: false, entries: [entry()] },
    });
    await harness.wrapper.setProps({ isOpen: true });
    await settle();

    expect(document.activeElement).toBe(harness.wrapper.find('.discarded-open').element);
  });

  it('Esc סוגר', async () => {
    const harness = open();
    await settle();

    await harness.wrapper.find('[role="dialog"]').trigger('keydown.esc');

    expect(harness.wrapper.emitted('close')).toHaveLength(1);
  });

  it('לחיצה על הרקע סוגרת', async () => {
    const harness = open();
    await settle();

    await harness.wrapper.find('.modal-backdrop').trigger('click');

    expect(harness.wrapper.emitted('close')).toHaveLength(1);
  });

  it('מודאלי בהצהרה ובהתנהגות: שם נגיש ומלכודת מיקוד', async () => {
    const harness = open([entry()]);
    await settle();

    const dialog = harness.wrapper.find('[role="dialog"]');
    expect(dialog.attributes('aria-modal')).toBe('true');
    expect(harness.wrapper.find(`#${dialog.attributes('aria-labelledby')}`).text()).toBe(
      'מסמכים שנסגרו בלי לשמור',
    );

    const buttons = harness.wrapper.findAll('button');
    (buttons[buttons.length - 1]!.element as HTMLElement).focus();
    await buttons[buttons.length - 1]!.trigger('keydown', { key: 'Tab' });

    expect(document.activeElement).toBe(buttons[0]!.element);
  });
});
