/**
 * החיפוש בבורר הגופן.
 *
 * מה שנבדק כאן הוא הדבר שהיה שבור לפני שהיה חיפוש בכלל: עם 294 משפחות
 * (נמדד ב-Windows) בורר בלי חיפוש הוא גלילה, ובורר עם חיפוש שמדרג לא נכון
 * מציג את ההתאמה הנכונה במקום השלישי.
 */
import { describe, it, expect } from 'vitest';
import {
  buildComboRows,
  commitValue,
  matchRank,
  nextOptionIndex,
  type ComboOption,
} from '../../src/ui/ribbon/font-search';

const option = (value: string, label = value, group = ''): ComboOption => ({ value, label, group });

/** הרשימה כפי שהיא נראית אחרי המיזוג: קבועים בראש, ואז שתי קבוצות. */
const OPTIONS: readonly ComboOption[] = [
  option('Assistant'),
  option('TaameyDavidCLM', 'David (TaameyDavidCLM)'),
  option('Arial'),
  option('David', 'David', 'עברית'),
  option('Narkisim', 'Narkisim', 'עברית'),
  option('Arial Black', 'Arial Black', 'כל הגופנים'),
  option('Bahnschrift', 'Bahnschrift', 'כל הגופנים'),
];

const shown = (options: readonly ComboOption[], query: string) =>
  buildComboRows(options, query)
    .rows.filter((row) => row.type === 'option')
    .map((row) => (row.type === 'option' ? row.option.value : ''));

describe('buildComboRows — בלי שאילתה', () => {
  it('מקבץ, ובסדר שהמיזוג קבע', () => {
    const { rows, count } = buildComboRows(OPTIONS, '');
    const groups = rows.filter((row) => row.type === 'group').map((row) => (row.type === 'group' ? row.label : ''));
    expect(groups).toEqual(['עברית', 'כל הגופנים']);
    expect(count).toBe(OPTIONS.length);
  });

  it('המספור רץ על האפשרויות בלבד — כותרת אינה יעד לחץ', () => {
    const indexes = buildComboRows(OPTIONS, '')
      .rows.filter((row) => row.type === 'option')
      .map((row) => (row.type === 'option' ? row.index : -1));
    expect(indexes).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('רווחים בלבד אינם שאילתה', () => {
    expect(shown(OPTIONS, '   ')).toEqual(shown(OPTIONS, ''));
  });
});

describe('buildComboRows — עם שאילתה', () => {
  it('הקיבוץ נעלם: חיפוש מחזיר רשימה שטוחה', () => {
    // כותרת שמפרידה בין התאמות היא בדיוק מה שמסתיר את ההתאמה הנכונה.
    const { rows } = buildComboRows(OPTIONS, 'ari');
    expect(rows.every((row) => row.type === 'option')).toBe(true);
  });

  it('מי שהשם שלו מתחיל בשאילתה קודם למי שהיא רק בתוכו', () => {
    // „ari” נמצא ב-Arial בהתחלה, וב-Bahnschrift בכלל לא — אבל „Narkisim”
    // מכיל „ki”, וזה המקרה שמפריד דירוג מסינון.
    expect(shown(OPTIONS, 'ari')).toEqual(['Arial', 'Arial Black']);
    expect(shown(OPTIONS, 'ki')).toEqual(['Narkisim']);
  });

  it('הערך נבדק ולא רק התווית — „taamey” מוצא את הגופן', () => {
    expect(shown(OPTIONS, 'taamey')).toEqual(['TaameyDavidCLM']);
  });

  it('התאמה בתווית מדורגת לפני התאמה בערך', () => {
    const byLabel = option('Zebra', 'David Sans');
    const byValue = option('DavidX', 'Zeta');
    expect(shown([byValue, byLabel], 'david')).toEqual(['Zebra', 'DavidX']);
  });

  it('חסר רגישות לאותיות, ובעברית עובד כמו בלטינית', () => {
    const hebrew = [option('Narkisim', 'נרקיסים', 'עברית'), option('Arial')];
    expect(shown(hebrew, 'ARIAL')).toEqual(['Arial']);
    expect(shown(hebrew, 'נרקיס')).toEqual(['Narkisim']);
  });

  it('המיון יציב — שווי דירוג שומרים על סדר המיזוג', () => {
    const same = [option('Aa'), option('Ab'), option('Ac')];
    expect(shown(same, 'a')).toEqual(['Aa', 'Ab', 'Ac']);
  });

  it('שאילתה בלי התאמות מחזירה רשימה ריקה, לא את הכול', () => {
    expect(buildComboRows(OPTIONS, 'zzzz').count).toBe(0);
  });
});

describe('matchRank', () => {
  it('שאילתה ריקה מתאימה לכול', () => {
    expect(matchRank(option('Arial'), '')).toBe(0);
  });

  it('אי-התאמה היא null ולא מספר גדול', () => {
    expect(matchRank(option('Arial'), 'zz')).toBeNull();
  });
});

describe('nextOptionIndex', () => {
  it('בלי סימון: חץ למטה נכנס לראש, חץ למעלה לסוף', () => {
    expect(nextOptionIndex('ArrowDown', -1, 5)).toBe(0);
    expect(nextOptionIndex('ArrowUp', -1, 5)).toBe(4);
  });

  it('עוטף בשני הקצוות, כמו בורר נייטיב', () => {
    expect(nextOptionIndex('ArrowDown', 4, 5)).toBe(0);
    expect(nextOptionIndex('ArrowUp', 0, 5)).toBe(4);
  });

  it('Home ו-End', () => {
    expect(nextOptionIndex('Home', 3, 5)).toBe(0);
    expect(nextOptionIndex('End', 1, 5)).toBe(4);
  });

  it('אין היפוך RTL — הרשימה אנכית', () => {
    // בניגוד ל-`nextTabIndex` של הרצועה, שם החצים כן מתהפכים.
    expect(nextOptionIndex('ArrowRight', 2, 5)).toBeNull();
    expect(nextOptionIndex('ArrowLeft', 2, 5)).toBeNull();
  });

  it('רשימה ריקה אינה מייצרת אינדקס', () => {
    expect(nextOptionIndex('ArrowDown', -1, 0)).toBeNull();
  });
});

describe('commitValue', () => {
  it('הסימון הוא מה שמוחל', () => {
    const rows = buildComboRows(OPTIONS, '');
    expect(commitValue(rows, 3, '')).toBe('David');
  });

  it('בלי סימון ובלי טקסט — לא קורה דבר', () => {
    expect(commitValue(buildComboRows(OPTIONS, ''), -1, '')).toBeNull();
  });

  it('טקסט בלי אף התאמה מוחל כמות שהוא — כמו ב-Word', () => {
    // גופן שמותקן ואינו ברשימת המועמדים לא היה נגיש בשום דרך אחרת.
    const rows = buildComboRows(OPTIONS, 'Guttman Yad');
    expect(rows.count).toBe(0);
    expect(commitValue(rows, -1, 'Guttman Yad')).toBe('Guttman Yad');
  });

  it('אבל כשיש התאמות, טקסט בלי סימון אינו מוחל כשם חופשי', () => {
    // אחרת „ari” בלי חץ היה מחיל גופן בשם „ari”, ולא Arial.
    expect(commitValue(buildComboRows(OPTIONS, 'ari'), -1, 'ari')).toBeNull();
  });
});

/**
 * תיבת ערך — בורר הגודל.
 *
 * שם הרשימה היא הצעה ולא מלאי, ולכן ההכרעה של „יש התאמות” מתהפכת: מי שהקליד
 * „1” מתכוון ל-1pt, ולא ל-10 שהוא ההתאמה הראשונה בדירוג.
 */
describe('commitValue עם normalize', () => {
  const SIZES: readonly ComboOption[] = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72].map(
    (size) => option(String(size)),
  );
  const asTyped = (typed: string) => typed;

  it('הטקסט מנצח את הדירוג — „1” הוא 1, לא 10', () => {
    const rows = buildComboRows(SIZES, '1');
    expect(rows.count).toBeGreaterThan(0);
    expect(commitValue(rows, -1, '1')).toBeNull();
    expect(commitValue(rows, -1, '1', asTyped)).toBe('1');
  });

  it('גודל שאינו בסולם מוחל כמות שהוא', () => {
    expect(commitValue(buildComboRows(SIZES, '13'), -1, '13', asTyped)).toBe('13');
  });

  it('סימון מפורש עדיין גובר — מי שירד בחץ בחר מהרשימה', () => {
    const rows = buildComboRows(SIZES, '1');
    expect(commitValue(rows, 0, '1', asTyped)).toBe('10');
  });

  it('נרמול שדחה את הקלט אינו מחיל דבר', () => {
    expect(commitValue(buildComboRows(SIZES, 'גדול'), -1, 'גדול', () => null)).toBeNull();
  });
});
