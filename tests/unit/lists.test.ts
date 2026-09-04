/**
 * רשימות (גל 14א). הבדיקה על **מה נשלח למנוע** — במיוחד hebrew1
 * (string חופשי בחוזה; נמדד שנכתב w:numFmt="hebrew1"), השער על numFmt
 * לא-תקני, ופתרון היעד מהבחירה דרך blocks.list.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  continuePreviousList,
  convertListToText,
  NUMBER_STYLES,
  NUMBER_STYLE_LABELS,
  restartListAt,
  setListNumberStyle,
  setListToBullets,
} from '../../src/engine/lists';

const SELECTION_IN_LIST = {
  target: { segments: [{ blockId: 'li1' }] },
};

const LIST_BLOCKS = {
  blocks: [
    { nodeId: 'li1', nodeType: 'listItem' },
    { nodeId: 'p9', nodeType: 'paragraph' },
  ],
};

function fakeDoc(
  options: {
    receipts?: Record<string, unknown>;
    selection?: unknown;
    blocksList?: () => Promise<{
      blocks: Array<{ nodeId: string; nodeType: string; paragraphNumbering?: unknown }>;
    }>;
    /** `lists.getState` — מזהה בלוק → isListItem. בלי המפה הפעולה חסרה (מנוע ישן). */
    listState?: Record<string, boolean>;
    /** `lists.getStyle` — הרמות שההגדרה מחזיקה. בלעדיה הפעולה חסרה (מנוע ישן). */
    styleLevels?: Array<Record<string, unknown>>;
    /** `false` = מנוע שכותב `numFmt` לבדו ומשאיר את `lvlText` — הכשל השקט. */
    writesLvlText?: boolean;
  } = {},
) {
  const calls = new Map<string, unknown[]>();
  const impls: Record<string, (input: unknown) => unknown> = {};
  for (const name of ['setLevelNumberStyle', 'applyStyle', 'restartAt', 'continuePrevious', 'convertToText']) {
    calls.set(name, []);
    const receipt = options.receipts?.[name] ?? { success: true };
    impls[name] = (input: unknown) => {
      calls.get(name)?.push(input);
      return receipt;
    };
  }

  if (options.listState) {
    const listState = options.listState;
    impls.getState = (input: unknown) => {
      const nodeId = (input as { target: { nodeId: string } }).target.nodeId;
      return nodeId in listState ? { success: true, isListItem: listState[nodeId] } : { success: false };
    };
  }

  /*
   * `getStyle` שמושפעת מ-`applyStyle`: כך „הסגנון נכתב” נמדד על ההגדרה ולא
   * מונח מהקבלה — וזו גם הדרך לדמות מנוע שכותב `numFmt` בלי `lvlText`.
   */
  if (options.styleLevels) {
    const levels = options.styleLevels.map((level) => ({ ...level }));
    impls.getStyle = () => ({ success: true, style: { levels } });
    const receipt = options.receipts?.applyStyle ?? { success: true };
    impls.applyStyle = (input: unknown) => {
      calls.get('applyStyle')?.push(input);
      for (const want of (input as { style: { levels: Array<Record<string, unknown>> } }).style.levels) {
        const at = levels.find((level) => level.level === want.level);
        if (!at) continue;
        at.numFmt = want.numFmt;
        if (options.writesLvlText !== false) at.lvlText = want.lvlText;
      }
      return receipt;
    };
  }

  const listFn = options.blocksList ?? vi.fn(async () => LIST_BLOCKS);
  const doc = {
    selection: { current: vi.fn(async () => options.selection ?? SELECTION_IN_LIST) },
    blocks: { list: listFn },
    lists: impls,
  } as never;

  return { doc, calls, host: { activeEditor: { doc } } };
}

describe('setListToBullets', () => {
  it('lists.applyStyle עם תבליט בכל תשע הרמות — ולא setType', async () => {
    const { host, calls } = fakeDoc();

    expect(await setListToBullets(host)).toEqual({ ok: true });
    const input = calls.get('applyStyle')?.[0] as {
      target: unknown;
      style: { version: number; levels: Array<Record<string, unknown>> };
    };
    expect(input.target).toEqual({ kind: 'block', nodeType: 'listItem', nodeId: 'li1' });
    expect(input.style.version).toBe(1);
    // תשע הרמות ולא רמה 0 לבדה: רשימה מקוננת שרמה 1 שלה נשארת lowerLetter
    // מציירת „a.” מתחת לתבליט.
    expect(input.style.levels.map((l) => l.level)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    for (const level of input.style.levels) {
      // `lvlText` ולא `numFmt` לבדו: הסמן נגזר מ-`lvlText`, ו-„%1.” שנשאר הוא הבאג.
      expect(level).toMatchObject({ numFmt: 'bullet', lvlText: '\u2022', markerFont: 'Symbol' });
      // מה שלא נמסר נשאר כשהיה — ההזחות של הרשימה אינן נדרסות.
      expect(Object.keys(level).sort()).toEqual(['level', 'lvlText', 'markerFont', 'numFmt']);
    }
    expect(calls.get('setLevelNumberStyle')).toHaveLength(0);
  });

  it("'bullet' אינו סגנון מספור חוקי יותר — המסלול השבור חסום", async () => {
    const { host, calls } = fakeDoc();

    const outcome = await setListNumberStyle(host, 'bullet');

    expect(outcome.ok).toBe(false);
    expect(calls.get('applyStyle')).toHaveLength(0);
  });

  it('פסקה שאינה רשימה — סירוב בלי לגעת במסמך, גם בלי createList', async () => {
    const { host, calls } = fakeDoc({
      selection: { target: { segments: [{ blockId: 'p9' }] } },
      listState: { p9: false },
    });

    const outcome = await setListToBullets(host);

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.message).toContain('יש למקם את הסמן בתוך רשימה');
    expect(calls.get('applyStyle')).toHaveLength(0);
  });

  it('מנוע בלי lists.applyStyle — „אינו זמין בגרסה זו”', async () => {
    const { host, doc } = fakeDoc();
    delete (doc as unknown as { lists: Record<string, unknown> }).lists.applyStyle;

    const outcome = await setListToBullets(host);

    expect(outcome.ok).toBe(false);
    // הקידומת ולא רק הסיבה: „אינו זמין בגרסה זו” בלי שם הפעולה אינו אומר
    // למשתמש מה נכשל — החוזה שנקבע ב-`fd91bcb`.
    expect(outcome.ok === false && outcome.message).toBe('המרת הרשימה לתבליטים נכשלה: אינו זמין בגרסה זו');
  });
});

/** תשע רמות תבליט — מה שההמרה לתבליטים מותירה בהגדרה (נמדד). */
const BULLET_LEVELS = Array.from({ length: 9 }, (_, level) => ({
  level,
  numFmt: 'bullet',
  lvlText: '•',
  markerFont: 'Symbol',
}));

/** הקסקדה של Word ברשימה ממוספרת טרייה (נמדד): אין בה `markerFont`. */
const NUMBERED_LEVELS = Array.from({ length: 9 }, (_, level) => ({
  level,
  numFmt: ['decimal', 'lowerLetter', 'lowerRoman'][level % 3],
  lvlText: `%${level + 1}.`,
}));

describe('setListNumberStyle', () => {
  it('lists.applyStyle עם numFmt **וגם** lvlText — ולא setLevelNumberStyle', async () => {
    const { host, calls } = fakeDoc();

    const outcome = await setListNumberStyle(host, 'hebrew1');

    expect(outcome).toEqual({ ok: true });
    // `numFmt` לבדו הוא הבאג: אחרי המרה לתבליטים ה-`lvlText` נשאר „•”,
    // והמסך המשיך לצייר תבליט על מסמך שאומר hebrew1.
    expect(calls.get('applyStyle')?.[0]).toEqual({
      target: { kind: 'block', nodeType: 'listItem', nodeId: 'li1' },
      style: { version: 1, levels: [{ level: 0, numFmt: 'hebrew1', lvlText: '%1.', markerFont: '' }] },
    });
    expect(calls.get('setLevelNumberStyle')).toHaveLength(0);
  });

  it('אחרי המרה לתבליטים — כל תשע הרמות חוזרות למספור, וגופן ה-Symbol מרוקן', async () => {
    // המסלול ההפוך: רמה עמוקה שנשארה תבליט אינה נגישה לשום פקד אחר.
    const { host, calls } = fakeDoc({ styleLevels: BULLET_LEVELS });

    expect(await setListNumberStyle(host, 'decimal')).toEqual({ ok: true });
    const input = calls.get('applyStyle')?.[0] as {
      style: { levels: Array<Record<string, unknown>> };
    };
    expect(input.style.levels.map((l) => l.level)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    for (const level of input.style.levels) {
      expect(level).toMatchObject({ numFmt: 'decimal', lvlText: `%${(level.level as number) + 1}.`, markerFont: '' });
      // מה שלא נמסר נשאר כשהיה — ההזחות, ה-start וה-suff אינם נדרסים.
      expect(Object.keys(level).sort()).toEqual(['level', 'lvlText', 'markerFont', 'numFmt']);
    }
  });

  it('ברשימה ממוספרת — רק רמה 0, והקסקדה של רמות 1–8 אינה נדרסת', async () => {
    const { host, calls } = fakeDoc({ styleLevels: NUMBERED_LEVELS });

    expect(await setListNumberStyle(host, 'hebrew1')).toEqual({ ok: true });
    const input = calls.get('applyStyle')?.[0] as {
      style: { levels: Array<Record<string, unknown>> };
    };
    expect(input.style.levels).toEqual([{ level: 0, numFmt: 'hebrew1', lvlText: '%1.' }]);
  });

  it('מנוע שכתב numFmt בלי lvlText — הכשל מדבר, עם שם הפעולה ועם הרמות', async () => {
    // הכשל השקט של הדיווח: `status.text === null` על מסמך שאומר decimal
    // ומסך שמצייר „•”. הקבלה מצליחה, ולכן הבדיקה היא על ההגדרה עצמה.
    const { host } = fakeDoc({ styleLevels: BULLET_LEVELS, writesLvlText: false });

    const outcome = await setListNumberStyle(host, 'decimal');

    expect(outcome).toMatchObject({ ok: false, reason: 'level-not-written' });
    expect(outcome.ok === false && outcome.message).toBe(
      'שינוי סגנון המספור נכשל: הסגנון לא נכתב לרמות 0, 1, 2, 3, 4, 5, 6, 7, 8',
    );
  });

  it('ערך מחוץ ל-numFmt של ECMA-376 נעצר — string חופשי בחוזה', async () => {
    const { host, calls } = fakeDoc();

    const outcome = await setListNumberStyle(host, 'zigzag');

    expect(outcome).toMatchObject({ ok: false, reason: 'invalid-number-style' });
    expect(calls.get('applyStyle')).toHaveLength(0);
  });

  /**
   * `hebrew2` נוסף במעבר ל-superdoc@2.10.0. הוא לא נחסם קודם — החוזה מקבל
   * מחרוזת חופשית — אלא פשוט לא הוצע, כי הסמן צויר ריק. שני הפורמטים נמדדו
   * על ה-dist הבנוי: `hebrew1` הוא גימטריה (…יד, טו, טז, יז…) ו-`hebrew2`
   * הוא סדר האלף-בית (…י, כ, ל, מ…).
   */
  it('hebrew2 נשלח ברמה 0 — מספור לפי סדר האלף-בית', async () => {
    const { host, calls } = fakeDoc();

    const outcome = await setListNumberStyle(host, 'hebrew2');

    expect(outcome).toEqual({ ok: true });
    expect(calls.get('applyStyle')?.[0]).toEqual({
      target: { kind: 'block', nodeType: 'listItem', nodeId: 'li1' },
      style: { version: 1, levels: [{ level: 0, numFmt: 'hebrew2', lvlText: '%1.', markerFont: '' }] },
    });
  });

  it('כל הערכים ב-NUMBER_STYLES מוכרים', () => {
    expect(NUMBER_STYLES).toContain('hebrew1');
    expect(NUMBER_STYLES).toContain('hebrew2');
    expect(NUMBER_STYLES).toContain('decimal');
  });

  it('לכל ערך ב-NUMBER_STYLES יש תווית — אחרת הוא יופיע בתפריט כמזהה גולמי', () => {
    for (const style of NUMBER_STYLES) {
      expect(NUMBER_STYLE_LABELS[style], style).toBeTruthy();
    }
  });
});

describe('resolveListItem', () => {
  it('פסקה שאינה פריט רשימה — „יש למקם את הסמן ברשימה" ולא קריאה', async () => {
    const selection = { target: { segments: [{ blockId: 'p9' }] } };
    const { host, calls } = fakeDoc({ selection });

    const outcome = await setListNumberStyle(host, 'hebrew1');

    expect(outcome).toMatchObject({ ok: false, reason: 'selection-required' });
    expect(calls.get('applyStyle')).toHaveLength(0);
  });

  it('פריט רשימה בתוך תא טבלה: אינו ב-blocks.list, ו-lists.getState מכריע', async () => {
    // issue #14 ג׳: blocks.list מונה בלוקים עליונים בלבד, ולכן הפריט שבטבלה
    // אינו שם — ובלי getState הפקד ענה „יש למקם את הסמן בתוך רשימה”.
    const selection = { target: { segments: [{ blockId: 'li-in-table' }] } };
    const blocksList = vi.fn(async () => ({ blocks: [{ nodeId: 'p1', nodeType: 'paragraph' }] }));
    const { host, calls } = fakeDoc({ selection, blocksList, listState: { 'li-in-table': true } });

    const outcome = await setListNumberStyle(host, 'hebrew1');

    expect(outcome).toEqual({ ok: true });
    expect(calls.get('applyStyle')?.[0]).toMatchObject({
      target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-in-table' },
    });
    expect(blocksList).not.toHaveBeenCalled();
  });

  it('כותרת ממוספרת: blocks.list אומר heading, lists.getState אומר פריט רשימה — נשלח', async () => {
    const selection = { target: { segments: [{ blockId: 'h1' }] } };
    const blocksList = vi.fn(async () => ({ blocks: [{ nodeId: 'h1', nodeType: 'heading' }] }));
    const { host, calls } = fakeDoc({ selection, blocksList, listState: { h1: true } });

    expect(await setListNumberStyle(host, 'hebrew1')).toEqual({ ok: true });
    expect(calls.get('applyStyle')?.[0]).toMatchObject({
      target: { nodeType: 'listItem', nodeId: 'h1' },
    });
  });

  it('lists.getState אומר שאינו פריט רשימה — הפקד מסביר, גם אם blocks.list היה אומר אחרת', async () => {
    const { host, calls } = fakeDoc({ listState: { li1: false } });

    const outcome = await setListNumberStyle(host, 'hebrew1');

    expect(outcome).toMatchObject({ ok: false, reason: 'selection-required' });
    expect(calls.get('applyStyle')).toHaveLength(0);
  });

  it('מנוע בלי lists.getState: blocks.list בקריאה אחת, ו-paragraphNumbering נחשב פריט רשימה', async () => {
    // הנפילה לאחור. בלי ארגומנטים blocks.list מחזיר את כל הסיפור (נמדד),
    // וכותרת ממוספרת מגיעה שם כ-heading עם paragraphNumbering.
    const selection = { target: { segments: [{ blockId: 'h-numbered' }] } };
    const blocksList = vi.fn(async () => ({
      blocks: [{ nodeId: 'h-numbered', nodeType: 'heading', paragraphNumbering: { numId: 1, level: 0 } }],
    }));
    const { host, calls } = fakeDoc({ selection, blocksList });

    expect(await setListNumberStyle(host, 'hebrew1')).toEqual({ ok: true });
    expect(calls.get('applyStyle')?.[0]).toMatchObject({ target: { nodeType: 'listItem', nodeId: 'h-numbered' } });
    expect(blocksList).toHaveBeenCalledTimes(1);
    expect(blocksList).toHaveBeenCalledWith();
  });

  it('getState שנכשל (success:false) או זורק — נופלים ל-blocks.list', async () => {
    // הבלוק אינו במפה → success:false → blocks.list (הכפיל: li1 הוא listItem).
    const { host: unknownHost, calls: unknownCalls } = fakeDoc({ listState: {} });
    expect(await setListNumberStyle(unknownHost, 'hebrew1')).toEqual({ ok: true });
    expect(unknownCalls.get('applyStyle')).toHaveLength(1);

    const { host, calls, doc } = fakeDoc({ listState: {} });
    (doc as { lists: { getState: unknown } }).lists.getState = () => {
      throw new Error('boom');
    };
    expect(await setListNumberStyle(host, 'hebrew1')).toEqual({ ok: true });
    expect(calls.get('applyStyle')).toHaveLength(1);
  });
});

/**
 * issue #14 ג׳ — „במספור פסקאות – רשימה מופיע ‚יש למקם את הסמן בתוך הרשימה׳”.
 *
 * שוחזר (scripts/qa/list-caret-qa.mjs): סמן בפסקה רגילה, תפריט המספור, „א, ב,
 * ג” — סירוב. המשתמש ביקש למספר את הפסקה; התפריט ענה שאלה טכנית על רשימה
 * קיימת. עם `createList` הפסקה הופכת קודם לרשימה — הפקודה של הכפתור — ואז
 * מקבלת את הסגנון.
 */
describe('setListNumberStyle — פסקה שאינה רשימה', () => {
  const IN_PARAGRAPH = { target: { segments: [{ blockId: 'p9' }] } };

  /** בחירה שמתחלפת: פסקה לפני `createList`, פריט רשימה אחריה — כמו במנוע. */
  function docWithConvertibleParagraph(createOutcome = { ok: true } as const) {
    let selection: unknown = IN_PARAGRAPH;
    const { host, calls, doc } = fakeDoc();
    (doc as { selection: { current: unknown } }).selection.current = vi.fn(async () => selection);
    const createList = vi.fn(async () => {
      if (createOutcome.ok) selection = SELECTION_IN_LIST;
      return createOutcome;
    });
    return { host, calls, createList };
  }

  it('יוצרת רשימה ואז מחילה את הסגנון על הפריט **החדש**', async () => {
    const { host, calls, createList } = docWithConvertibleParagraph();

    const outcome = await setListNumberStyle(host, 'hebrew1', { createList });

    expect(outcome).toEqual({ ok: true });
    expect(createList).toHaveBeenCalledTimes(1);
    expect(calls.get('applyStyle')?.[0]).toEqual({
      target: { kind: 'block', nodeType: 'listItem', nodeId: 'li1' },
      style: { version: 1, levels: [{ level: 0, numFmt: 'hebrew1', lvlText: '%1.', markerFont: '' }] },
    });
  });

  it('כשיצירת הרשימה נכשלה — ההודעה נושאת את קידומת המודול, ה-reason נשמר, והסגנון אינו נשלח', async () => {
    // ההודעה של `createList` היא של שכבת הפקודות ובלי שם הפעולה שנבחרה
    // בתפריט; ה-`reason` הוא מה שמאפשר לצרכן להבחין בין הכשלים.
    const failed = { ok: false, message: 'המנוע אינו מוכן', reason: 'not-ready' } as const;
    const { host, calls, createList } = docWithConvertibleParagraph(failed as never);

    const outcome = await setListNumberStyle(host, 'hebrew1', { createList });

    expect(outcome).toEqual({
      ok: false,
      message: 'שינוי סגנון המספור נכשל: המנוע אינו מוכן',
      reason: 'not-ready',
    });
    expect(calls.get('applyStyle')).toEqual([]);
  });

  it('בלי `createList` — הסירוב המפורש, כמו קודם', async () => {
    const { host, calls } = fakeDoc({ selection: IN_PARAGRAPH });

    const outcome = await setListNumberStyle(host, 'hebrew1');

    expect(outcome).toMatchObject({ ok: false, reason: 'selection-required' });
    expect(calls.get('applyStyle')).toEqual([]);
  });

  it('כשהסמן כבר ברשימה — `createList` אינה נקראת', async () => {
    const { host, calls } = fakeDoc();
    const createList = vi.fn(async () => ({ ok: true }) as const);

    await setListNumberStyle(host, 'hebrew2', { createList });

    expect(createList).not.toHaveBeenCalled();
    expect(calls.get('applyStyle')).toHaveLength(1);
  });

  it('הכרעה חיובית „אינה רשימה" דרך lists.getState — הרשימה נוצרת והסגנון מוחל', async () => {
    // מסלול הייצור: getState עונה success:true עם isListItem:false.
    let selection: unknown = IN_PARAGRAPH;
    const { host, calls, doc } = fakeDoc({ listState: { p9: false, li1: true } });
    (doc as { selection: { current: unknown } }).selection.current = vi.fn(async () => selection);
    const createList = vi.fn(async () => {
      selection = SELECTION_IN_LIST;
      return { ok: true } as const;
    });

    expect(await setListNumberStyle(host, 'hebrew1', { createList })).toEqual({ ok: true });
    expect(createList).toHaveBeenCalledTimes(1);
    expect(calls.get('applyStyle')?.[0]).toEqual({
      target: { kind: 'block', nodeType: 'listItem', nodeId: 'li1' },
      style: { version: 1, levels: [{ level: 0, numFmt: 'hebrew1', lvlText: '%1.', markerFont: '' }] },
    });
  });
});

/**
 * `createList` היא הפקודה `numbered-list` של הרצועה (התפריט מוסר אותה לסגנוני
 * מספור בלבד), והיא **טוגל**: אומת במימוש של superdoc (`executeListCommand`
 * מנתב ל-`lists.remove` / `lists.removeInStory` כשכל הבלוקים כבר באותה
 * רשימה), ואומת חי — לחיצה שנייה על „מספור” מחזירה isListItem מ-true
 * ל-false.
 *
 * ולכן אסור לקרוא לה כשהזיהוי לא הכריע. „אינני רואה את הבלוק" אינו „אין
 * רשימה": פריט רשימה בתא טבלה אינו נמנה ב-blocks.list כלל, ועל מנוע בלי
 * getState (או כשהוא מחזיר success:false) טוגל היה **מוריד** לו את המספור.
 */
describe('setListNumberStyle — זיהוי שלא הכריע אינו מצדיק טוגל', () => {
  it('פריט בתא טבלה שאינו נמנה ב-blocks.list ו-getState נכשל — `createList` אינה נקראת', async () => {
    const selection = { target: { segments: [{ blockId: 'li-in-table' }] } };
    // listState בלי הבלוק → success:false; blocks.list אינו מונה אותו → „לא ידוע".
    const blocksList = vi.fn(async () => ({ blocks: [{ nodeId: 'p1', nodeType: 'paragraph' }] }));
    const { host, calls } = fakeDoc({ selection, blocksList, listState: {} });
    const createList = vi.fn(async () => ({ ok: true }) as const);

    const outcome = await setListNumberStyle(host, 'hebrew1', { createList });

    expect(createList).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: false, reason: 'selection-required' });
    expect(calls.get('applyStyle')).toEqual([]);
  });

  it('`selection.current` זורק — `createList` אינה נקראת', async () => {
    const { host, calls, doc } = fakeDoc();
    (doc as { selection: { current: unknown } }).selection.current = vi.fn(async () => {
      throw new Error('boom');
    });
    const createList = vi.fn(async () => ({ ok: true }) as const);

    const outcome = await setListNumberStyle(host, 'hebrew1', { createList });

    expect(createList).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: false, reason: 'selection-required' });
    expect(calls.get('applyStyle')).toEqual([]);
  });

  it('בחירה בלי blockId — `createList` אינה נקראת', async () => {
    const { host, calls } = fakeDoc({ selection: { target: { segments: [{}] } } });
    const createList = vi.fn(async () => ({ ok: true }) as const);

    const outcome = await setListNumberStyle(host, 'hebrew1', { createList });

    expect(createList).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: false, reason: 'selection-required' });
    expect(calls.get('applyStyle')).toEqual([]);
  });

  it('`success:true` בלי `isListItem` אינו הכרעה — ואינו מצדיק טוגל', async () => {
    const selection = { target: { segments: [{ blockId: 'p9' }] } };
    const { host, calls, doc } = fakeDoc({ selection, blocksList: async () => ({ blocks: [] }) });
    (doc as { lists: Record<string, unknown> }).lists.getState = async () => ({ success: true });
    const createList = vi.fn(async () => ({ ok: true }) as const);

    const outcome = await setListNumberStyle(host, 'hebrew1', { createList });

    expect(createList).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: false, reason: 'selection-required' });
    expect(calls.get('applyStyle')).toEqual([]);
  });
});

describe('restartListAt', () => {
  it('startAt נשלח כמות שהוא', async () => {
    const { host, calls } = fakeDoc();

    await restartListAt(host, 5);

    expect(calls.get('restartAt')?.[0]).toMatchObject({ startAt: 5 });
  });

  it('שלילי/שברוני נעצר', async () => {
    const { host, calls } = fakeDoc();

    const outcome = await restartListAt(host, -3);

    expect(outcome).toMatchObject({ ok: false, reason: 'invalid-start' });
    expect(calls.get('restartAt')).toHaveLength(0);
  });
});

describe('continuePreviousList', () => {
  it('כשאין רשימה קודמת — קבלת הכשל מתורגמת (NO_PREVIOUS_LIST)', async () => {
    const { host } = fakeDoc({
      receipts: {
        continuePrevious: { success: false, failure: { code: 'INVALID_CONTEXT', message: 'NO_PREVIOUS_LIST' } },
      },
    });

    const outcome = await continuePreviousList(host);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('INVALID_CONTEXT');
  });
});

describe('convertListToText', () => {
  it('includeMarker:true נשלח — הסמן מועתק לטקסט (נמדד)', async () => {
    const { host, calls } = fakeDoc();

    await convertListToText(host);

    expect(calls.get('convertToText')?.[0]).toMatchObject({
      target: { nodeId: 'li1' },
      includeMarker: true,
    });
  });
});
