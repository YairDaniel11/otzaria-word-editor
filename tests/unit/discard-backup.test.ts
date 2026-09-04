/**
 * הגיבוי של „לא לשמור”. הוא מה שמאפשר לשאול שאלה אחת במקום שתיים, ולכן שבירה
 * שקטה שלו מחזירה את התוסף למצב שבו לחיצה אחת מוחקת עבודה לתמיד — בלי ששום
 * דבר על המסך ישתנה.
 *
 * שתי התכונות שנמדדות כאן הן אלה שאין דרך לראות בעין: שהמספר הכולל של הקבצים
 * חסום ב-5 **תמיד**, ושהישן ביותר הוא זה שנדרס.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_DISCARD_BACKUPS,
  backupPathFor,
  forgetDiscard,
  nextBackupSlot,
  normalizeBackups,
  rememberDiscard,
  sortedBackups,
  type DiscardedDocument,
} from '../../src/sessions/discard-backup';

function entry(over: Partial<DiscardedDocument> = {}): DiscardedDocument {
  return {
    slot: 0,
    name: 'חידושים',
    size: 1_024,
    discardedAt: 1_000,
    token: null,
    ...over,
  };
}

/** מסמכים שנסגרו בזה אחר זה, מהישן לחדש. */
function series(count: number): DiscardedDocument[] {
  let list: DiscardedDocument[] = [];
  for (let index = 0; index < count; index += 1) {
    const slot = nextBackupSlot(list);
    list = rememberDiscard(list, entry({ slot, name: `מסמך ${index}`, discardedAt: 1_000 + index }));
  }
  return list;
}

describe('משבצות', () => {
  it('הנתיב נגזר מהמשבצת בלבד', () => {
    expect(backupPathFor(0)).toBe('discarded-0.docx');
    expect(backupPathFor(4)).toBe('discarded-4.docx');
  });

  it('משבצת פנויה קודמת לדריסה', () => {
    const list = series(3);

    expect(nextBackupSlot(list)).toBe(3);
  });

  it('כשכולן תפוסות — הישן ביותר נדרס', () => {
    const list = series(MAX_DISCARD_BACKUPS);
    const oldest = sortedBackups(list)[MAX_DISCARD_BACKUPS - 1]!;

    expect(nextBackupSlot(list)).toBe(oldest.slot);
  });

  it('גיל אינו סדר הכניסה: הישן ביותר נמדד לפי `discardedAt`', () => {
    // מסמך שנסגר, ואחריו נכתבה עליו משבצת חדשה יותר — הדריסה הבאה חייבת ללכת
    // למי שזמנו הקטן ביותר, ולא למי שנוסף ראשון.
    let list = series(MAX_DISCARD_BACKUPS);
    // המשבצת שנכתבה ראשונה (0) מתעדכנת לזמן החדש ביותר.
    list = rememberDiscard(list, entry({ slot: 0, discardedAt: 9_999 }));

    expect(nextBackupSlot(list), 'עכשיו 1 הוא הוותיק').toBe(1);
  });
});

describe('rememberDiscard', () => {
  it('התקרה היא חמישה, ולא משנה כמה נסגרו', () => {
    const list = series(12);

    expect(list).toHaveLength(MAX_DISCARD_BACKUPS);
    expect(new Set(list.map((item) => item.slot)).size, 'משבצת לכל אחד').toBe(
      MAX_DISCARD_BACKUPS,
    );
  });

  it('חמשת האחרונים הם אלה שנשארו', () => {
    const list = series(8);

    expect(list.map((item) => item.name)).toEqual([
      'מסמך 7',
      'מסמך 6',
      'מסמך 5',
      'מסמך 4',
      'מסמך 3',
    ]);
  });

  it('כתיבה למשבצת תפוסה מחליפה ואינה מכפילה', () => {
    const list = rememberDiscard(series(2), entry({ slot: 0, name: 'החדש', discardedAt: 5_000 }));

    expect(list).toHaveLength(2);
    expect(list[0]?.name).toBe('החדש');
  });

  it('הסדר תמיד מהחדש לישן', () => {
    const list = rememberDiscard(
      [entry({ slot: 1, discardedAt: 3_000 }), entry({ slot: 2, discardedAt: 1_000 })],
      entry({ slot: 3, discardedAt: 2_000 }),
    );

    expect(list.map((item) => item.discardedAt)).toEqual([3_000, 2_000, 1_000]);
  });
});

describe('normalizeBackups', () => {
  it('מה שאינו מערך הוא רשימה ריקה', () => {
    for (const raw of [null, undefined, 0, 'x', {}]) {
      expect(normalizeBackups(raw)).toEqual([]);
    }
  });

  it('שורה פגומה נשמטת ואינה פוסלת את השאר', () => {
    // גיבוי הוא רשת ביטחון: רשת שנקרעה כולה מפני שחוט אחד נקרע היא הכשל הגרוע
    // מבין השניים.
    const list = normalizeBackups([
      null,
      { slot: 'שתיים' },
      { slot: 99 },
      { slot: -1 },
      entry({ slot: 2, name: 'ששרד' }),
    ]);

    expect(list.map((item) => item.name)).toEqual(['ששרד']);
  });

  it('שתי שורות על אותה משבצת — יש שם קובץ אחד, ולכן שורה אחת', () => {
    const list = normalizeBackups([
      entry({ slot: 1, name: 'ראשון' }),
      entry({ slot: 1, name: 'שני' }),
    ]);

    expect(list).toHaveLength(1);
  });

  it('שדות חסרים מקבלים ברירת מחדל שאפשר להציג', () => {
    const [only] = normalizeBackups([{ slot: 0 }]);

    expect(only).toEqual({ slot: 0, name: 'מסמך', size: 0, discardedAt: 0, token: null });
  });

  it('רשומה ארוכה מהתקרה נחתכת לחמש', () => {
    const raw = Array.from({ length: 9 }, (_, index) => entry({ slot: index % 5, discardedAt: index }));

    expect(normalizeBackups(raw).length).toBeLessThanOrEqual(MAX_DISCARD_BACKUPS);
  });

  it('מה שנכתב הוא מה שנקרא', () => {
    const written = series(3);

    // בדיוק המסלול האמיתי: JSON יוצא ל-storage וחוזר ממנו.
    expect(normalizeBackups(JSON.parse(JSON.stringify(written)))).toEqual(written);
  });
});

describe('forgetDiscard', () => {
  it('מסירה את המשבצת, ומשחררת אותה לכתיבה הבאה', () => {
    const list = forgetDiscard(series(MAX_DISCARD_BACKUPS), 2);

    expect(list).toHaveLength(MAX_DISCARD_BACKUPS - 1);
    expect(nextBackupSlot(list)).toBe(2);
  });

  it('משבצת שאינה ברשימה אינה משנה דבר', () => {
    const list = series(2);

    expect(forgetDiscard(list, 4)).toEqual(list);
  });
});
