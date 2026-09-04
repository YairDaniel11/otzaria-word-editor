/**
 * טעינת המילון: הפעם היחידה, הכשל, והזיכרון של המשתמש.
 *
 * מה שנמדד כאן הוא בדיוק מה שנשבר בשקט אחרת: נכס שנמשך פעמיים (‏2.6MB במקום
 * 1.3MB), כשל טעינה שנזכר לנצח ולכן „הדלק שוב” לא עוזר, ומילת משתמש שנוספה
 * לזיכרון אבל לא ל-`storage` — כלומר נעלמת בהפעלה הבאה בלי שדבר ייכשל.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const stub = vi.hoisted(() => ({
  /** מה שנשמר ב-`storage`, לפי הסדר. */
  saved: [] as string[][],
  /** מה שהאחסון מחזיר בעלייה. */
  stored: [] as string[],
}));

vi.mock('../../src/host/settings', () => ({
  loadSpellcheckWords: async () => stub.stored,
  saveSpellcheckWords: async (words: readonly string[]) => {
    stub.saved.push([...words]);
  },
}));

const { loadTorahDictionary, rememberUserWord, resetTorahDictionary } = await import(
  '../../src/engine/spellcheck-dictionary'
);
const { packWords } = await import('../../src/engine/spellcheck');

const PACKED = packWords(['אמר', 'כתב', 'תוספות']);

beforeEach(() => {
  resetTorahDictionary();
  stub.saved = [];
  stub.stored = [];
});

describe('טעינת המילון', () => {
  it('נטען פעם אחת בלבד, גם בקריאות מקבילות', async () => {
    let calls = 0;
    const loader = async () => {
      calls += 1;
      return PACKED;
    };

    const [first, second] = await Promise.all([loadTorahDictionary(loader), loadTorahDictionary(loader)]);
    const third = await loadTorahDictionary(loader);

    expect(calls).toBe(1);
    expect(first).toBe(second);
    expect(third).toBe(first);
  });

  it('הנכס נטען עם מילון המשתמש ששמור באחסון', async () => {
    stub.stored = ['זזזזז'];
    const dictionary = await loadTorahDictionary(async () => PACKED);
    expect(dictionary?.has('זזזזז')).toBe(true);
  });

  it('כשל מחזיר `null` ואינו נזכר — ההדלקה הבאה מנסה שוב', async () => {
    let calls = 0;
    const failing = async () => {
      calls += 1;
      return null;
    };

    expect(await loadTorahDictionary(failing)).toBeNull();
    expect(await loadTorahDictionary(failing)).toBeNull();
    expect(calls).toBe(2);

    const dictionary = await loadTorahDictionary(async () => PACKED);
    expect(dictionary?.has('אמר')).toBe(true);
  });

  it('טוען שזורק מטופל ככשל, ולא מפיל את מי שקרא', async () => {
    await expect(
      loadTorahDictionary(async () => {
        throw new Error('הנכס לא נפרס');
      }),
    ).resolves.toBeNull();
  });
});

describe('הוספה למילון המשתמש', () => {
  it('נשמרת לאחסון, והמילה מפסיקה להיות שגיאה', async () => {
    const dictionary = await loadTorahDictionary(async () => PACKED);
    expect(await rememberUserWord(dictionary, 'זזזזז')).toBe(true);
    expect(stub.saved).toEqual([['זזזזז']]);
    expect(dictionary?.has('זזזזז')).toBe(true);
  });

  it('מילה שכבר מוכרת אינה נכתבת שוב', async () => {
    const dictionary = await loadTorahDictionary(async () => PACKED);
    expect(await rememberUserWord(dictionary, 'אמר')).toBe(false);
    expect(stub.saved).toEqual([]);
  });

  it('בלי מילון טעון אין מה לשמור', async () => {
    expect(await rememberUserWord(null, 'זזזזז')).toBe(false);
    expect(stub.saved).toEqual([]);
  });

  it('נשמרת הרשימה המצטברת, ולא רק המילה האחרונה', async () => {
    const dictionary = await loadTorahDictionary(async () => PACKED);
    await rememberUserWord(dictionary, 'זזזזז');
    await rememberUserWord(dictionary, 'חחחחח');
    expect(stub.saved[1]).toEqual(['זזזזז', 'חחחחח']);
  });
});
