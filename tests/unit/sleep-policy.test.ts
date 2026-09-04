/**
 * מתי מותר לשחרר מנוע של מסמך שברקע.
 *
 * ## מה נשמר כאן
 *
 * זו החלטה שמוחקת עבודה מהזיכרון, ולכן היא יושבת במודול נבדק ולא במעטפת
 * (אותו כלל של open-flow.ts). כל אחת מחמש הסיבות ל„לא” מכסה נזק אחר, וכל
 * אחת מהן היא תנאי שנראה מיותר עד הרגע שבו הוא לא: תנאי שנמחק כאן אינו
 * נראה בשום מסך — הוא פשוט מוחק מסמך של מישהו.
 */
import { describe, it, expect } from 'vitest';
import { decideSleep, type SleepCandidate } from '../../src/sessions/sleep-policy';

/** מועמד שכל התנאים בו מתקיימים — הבסיס שכל בדיקה משנה בו שדה אחד. */
function candidate(patch: Partial<SleepCandidate> = {}): SleepCandidate {
  return {
    isActive: false,
    isPending: false,
    hasEngine: true,
    isOpening: false,
    isSaving: false,
    hasFile: true,
    hasUnwrittenWork: false,
    ...patch,
  };
}

describe('decideSleep', () => {
  it('טאב ברקע, עם קובץ, שהכול שלו כתוב — נרדם', () => {
    expect(decideSleep(candidate())).toEqual({ action: 'sleep' });
  });

  it('הטאב שעל המסך לעולם אינו נרדם', () => {
    expect(decideSleep(candidate({ isActive: true }))).toEqual({
      action: 'keep',
      reason: 'active',
    });
  });

  it('אין מה לשחרר — טאב שממתין לטעינה או שלא נפתח בו דבר', () => {
    expect(decideSleep(candidate({ isPending: true })).action).toBe('keep');
    expect(decideSleep(candidate({ hasEngine: false }))).toEqual({
      action: 'keep',
      reason: 'no-engine',
    });
  });

  it('פתיחה או שמירה שרצות — לא נוגעים במנוע שהן עובדות עליו', () => {
    // שמירה מייצאת מהמנוע הזה ברגע זה; שחרורו באמצע הוא שמירה שנקטעה.
    expect(decideSleep(candidate({ isOpening: true }))).toEqual({
      action: 'keep',
      reason: 'busy',
    });
    expect(decideSleep(candidate({ isSaving: true }))).toEqual({
      action: 'keep',
      reason: 'busy',
    });
  });

  it('מסמך בלי קובץ נשאר בזיכרון — הטיוטה שלו היא כל מה שיש לו', () => {
    // ובנוסף: השם שהמשתמש נתן לו אינו ברשומה, ולכן הוא היה חוזר „מסמך חדש”.
    expect(decideSleep(candidate({ hasFile: false }))).toEqual({
      action: 'keep',
      reason: 'no-file',
    });
  });

  it('עבודה שלא נכתבה לשום מקום עוצרת הרדמה — גם כשכל השאר תקין', () => {
    // זהו השער האחרון, וזה שהופך את כל המנגנון לבטוח: מסמך גדול מהמכסה של
    // הטיוטה משלם בזיכרון, לא בעבודה של המשתמש.
    expect(decideSleep(candidate({ hasUnwrittenWork: true }))).toEqual({
      action: 'keep',
      reason: 'unwritten-work',
    });
  });

  it('כל אחת מחמש הסיבות לבדה מספיקה כדי לעצור', () => {
    // מוטציה שמוחקת תנאי אחד מתוך החמישה חייבת להיתפס, ולא להיבלע בכך
    // שתנאי אחר ממילא היה עוצר את אותו מקרה.
    const stoppers: Array<Partial<SleepCandidate>> = [
      { isActive: true },
      { hasEngine: false },
      { isOpening: true },
      { isSaving: true },
      { hasFile: false },
      { hasUnwrittenWork: true },
    ];

    for (const patch of stoppers) {
      expect(decideSleep(candidate(patch)).action, JSON.stringify(patch)).toBe('keep');
    }
  });
});
