/**
 * שלושת הכפתורים בלשונית „אוצריא” הציגו הודעת סטטוס ולא עשו כלום. הבדיקות
 * כאן מקבעות את שני הצדדים של התיקון: שה-RPC נשלח עם ה-payload שאוצריא מצפה
 * לו, ושכל צורת כשל — הרשאה, פרמטר פסול, סירוב, זריקה, תשובה בצורה לא צפויה —
 * מגיעה כהודעה בעברית ולא כשקט.
 *
 * הכפיל מאמת את ה-input ואינו מחזיר `true` לכל קריאה: הכפיל ההפוך (שהיה ב-
 * ribbon-commands.test.ts) אישר בירוק payloads שהצד השני דוחה.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { DocReceipt } from '../../src/engine/document-api';
import type { SelectionInfoLike } from '../../src/engine/doc-selection';
import {
  READER_PERMISSIONS,
  buildCitationText,
  canInsertText,
  getReaderSelection,
  goTo,
  insertCitation,
  normalizeSelectedText,
  openLibrary,
  openSearchTab,
  registerSendToDocumentItem,
  handleSendToDocument,
  takePendingContextMenuClicks,
  CONTEXT_MENU_LATCH_KEY,
  SEND_TO_DOCUMENT_ITEM,
  SEND_TO_DOCUMENT_ITEM_ID,
} from '../../src/host/otzaria-reader';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** כפיל שמצליח ומחזיר את מה שאוצריא מתועדת כמחזירה. */
function hostReturns(data: unknown): ReturnType<typeof vi.fn> {
  const call = vi.fn(async () => ({ success: true, data, error: null }));
  window.Otzaria = { call } as never;
  return call;
}

/** כפיל שנכשל עם קוד ואת ההודעה שאוצריא נותנת. */
function hostFails(code: string, message: string): ReturnType<typeof vi.fn> {
  const call = vi.fn(async () => ({ success: false, data: null, error: { code, message } }));
  window.Otzaria = { call } as never;
  return call;
}

afterEach(() => {
  delete (window as Partial<Window>).Otzaria;
  vi.restoreAllMocks();
});

describe('openLibrary', () => {
  it('קוראת ל-navigation.goTo עם היעד library', async () => {
    const call = hostReturns(true);

    await expect(openLibrary()).resolves.toEqual({ ok: true, value: undefined });
    expect(call).toHaveBeenCalledWith('navigation.goTo', { target: 'library' });
  });

  it('הרשאה חסרה מגיעה כהודעה שאומרת איזו הרשאה חסרה', async () => {
    hostFails('error.permission_denied', 'permission denied');

    const outcome = await openLibrary();

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('נדרש כשל');
    expect(outcome.reason).toBe('permission-denied');
    expect(outcome.message).toContain('navigation.write');
  });

  it('גם הקוד בלי התחילית error. מזוהה כהרשאה חסרה', async () => {
    // טבלת ה-RPC bridge בתיעוד כותבת `permission_denied` בלי התחילית.
    hostFails('permission_denied', 'denied');

    const outcome = await openLibrary();

    if (outcome.ok) throw new Error('נדרש כשל');
    expect(outcome.reason).toBe('permission-denied');
  });

  it('סירוב מפורש של אוצריא הוא כשל ולא הצלחה שקטה', async () => {
    hostReturns(false);

    const outcome = await openLibrary();

    if (outcome.ok) throw new Error('נדרש כשל');
    expect(outcome.reason).toBe('refused');
    expect(outcome.message).toContain('לא ביצעה');
  });

  it('תשובה בצורה לא צפויה נרשמת ללוג ואינה מוצגת כשגיאה', async () => {
    // ה-stub של הפיתוח מחזיר null לכל מתודה שאינה ממומשת בו, וגרסת מארח
    // אחרת עשויה להחזיר צורה אחרת. אזעקת שקר על מסך שהתחלף גרועה מלוג.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    hostReturns(null);

    await expect(openLibrary()).resolves.toEqual({ ok: true, value: undefined });
    expect(warn).toHaveBeenCalled();
  });

  it('RPC שזורק מגיע כהודעה ולא מפיל את הקורא', async () => {
    window.Otzaria = {
      call: vi.fn(async () => {
        throw new Error('הגשר מת');
      }),
    } as never;

    const outcome = await openLibrary();

    if (outcome.ok) throw new Error('נדרש כשל');
    expect(outcome.message).toContain('הגשר מת');
  });

  it('בלי SDK כלל הכשל הוא הודעה בעברית', async () => {
    const outcome = await openLibrary();

    if (outcome.ok) throw new Error('נדרש כשל');
    expect(outcome.message).toContain('ה-SDK של אוצריא אינו זמין');
  });
});

describe('goTo', () => {
  it('מעבירה את היעד שהתבקש', async () => {
    const call = hostReturns(true);

    await goTo('settings');

    expect(call).toHaveBeenCalledWith('navigation.goTo', { target: 'settings' });
  });
});

describe('openSearchTab', () => {
  it('שולחת את השאילתה בלי לכפות autoSearch', async () => {
    // ברירת המחדל של אוצריא היא `true`, וזה מה שנדרש: המשתמש סימן טקסט
    // וביקש לחפש אותו. שליחת המפתח במפורש הייתה קיבוע מיותר של ברירת מחדל.
    const call = hostReturns(true);

    await expect(openSearchTab({ query: 'ברכת המזון' })).resolves.toEqual({
      ok: true,
      value: undefined,
    });
    expect(call).toHaveBeenCalledWith('reader.openSearchTab', { query: 'ברכת המזון' });
  });

  it('מעבירה שדות נוספים כפי שנמסרו', async () => {
    const call = hostReturns(true);

    await openSearchTab({ query: 'ואהבת', autoSearch: false });

    expect(call).toHaveBeenCalledWith('reader.openSearchTab', {
      query: 'ואהבת',
      autoSearch: false,
    });
  });

  it('פרמטר פסול מגיע עם הקוד של אוצריא', async () => {
    hostFails('error.invalid_params', 'unknown setting');

    const outcome = await openSearchTab({ query: 'x' });

    if (outcome.ok) throw new Error('נדרש כשל');
    expect(outcome.reason).toBe('error.invalid_params');
    expect(outcome.message).toContain('unknown setting');
  });

  it('הרשאה חסרה מצביעה על reader.open', async () => {
    hostFails('error.permission_denied', 'denied');

    const outcome = await openSearchTab({ query: 'x' });

    if (outcome.ok) throw new Error('נדרש כשל');
    expect(outcome.message).toContain('reader.open');
  });
});

describe('READER_PERMISSIONS', () => {
  it('כל מתודה שהמודול קורא לה ממופה להרשאה', () => {
    expect(READER_PERMISSIONS['reader.getSelection']).toBe('reader.open');
    expect(READER_PERMISSIONS['reader.openSearchTab']).toBe('reader.open');
    expect(READER_PERMISSIONS['navigation.goTo']).toBe('navigation.write');
  });
});

describe('normalizeSelectedText', () => {
  it('מאחדת רווחים ושברי שורה לשורה אחת', () => {
    expect(normalizeSelectedText('  ויאמר\n אלהים \t יהי  אור ')).toBe('ויאמר אלהים יהי אור');
  });

  it('אינה נוגעת בניקוד ובטעמים', () => {
    expect(normalizeSelectedText('וַיֹּ֥אמֶר אֱלֹהִ֖ים')).toBe('וַיֹּ֥אמֶר אֱלֹהִ֖ים');
  });

  it('בחירה ריקה או שאינה מחרוזת מחזירה מחרוזת ריקה', () => {
    expect(normalizeSelectedText('   \n ')).toBe('');
    expect(normalizeSelectedText(undefined as unknown as string)).toBe('');
  });
});

describe('getReaderSelection', () => {
  it('null אינו כשל — אין בחירה, או שהטאב אינו טאב טקסט', async () => {
    const call = hostReturns(null);

    await expect(getReaderSelection()).resolves.toEqual({ ok: true, value: null });
    expect(call).toHaveBeenCalledWith('reader.getSelection', undefined);
  });

  it('תשובה בצורה לא צפויה נחשבת „אין בחירה” ולא זורקת', async () => {
    hostReturns('ויאמר');

    await expect(getReaderSelection()).resolves.toEqual({ ok: true, value: null });
  });

  it('הרשאה חסרה מצביעה על reader.open', async () => {
    hostFails('error.permission_denied', 'denied');

    const outcome = await getReaderSelection();

    if (outcome.ok) throw new Error('נדרש כשל');
    expect(outcome.message).toContain('reader.open');
  });

  it('מחזירה את הבחירה כפי שאוצריא נתנה', async () => {
    hostReturns({ text: 'ויאמר', currentRef: 'בראשית פרק א' });

    const outcome = await getReaderSelection();

    if (!outcome.ok) throw new Error('נדרשת הצלחה');
    expect(outcome.value?.currentRef).toBe('בראשית פרק א');
  });
});

describe('buildCitationText', () => {
  it('טקסט המקור ואחריו המקור בסוגריים', () => {
    const text = buildCitationText({
      text: 'ויאמר אלהים',
      sourceSelectedText: 'וַיֹּאמֶר אֱלֹהִים',
      renderedSelectedText: 'ויאמר אלהים',
      currentRef: 'בראשית פרק א',
    } as never);

    expect(text).toBe('וַיֹּאמֶר אֱלֹהִים (בראשית פרק א)');
  });

  it('מעדיפה את טקסט המקור על מה שהוצג בקורא', () => {
    // מה שהוצג תלוי בהגדרות התצוגה של מי שסימן; הציטוט צריך לשקף את הספר.
    const text = buildCitationText({
      text: 'ויאמר',
      sourceSelectedText: 'וַיֹּאמֶר',
      renderedSelectedText: 'ויאמר',
      currentRef: null,
    } as never);

    expect(text).toBe('וַיֹּאמֶר');
  });

  it('נופלת ל-renderedSelectedText ואז לשדה הוותיק', () => {
    expect(
      buildCitationText({ text: 'א', renderedSelectedText: 'ב', currentRef: null } as never),
    ).toBe('ב');
    expect(buildCitationText({ text: 'א', currentRef: null } as never)).toBe('א');
  });

  it('שדה ריק אינו „קיים” ואינו חוסם את הגיבוי', () => {
    const text = buildCitationText({
      text: 'ויאמר',
      sourceSelectedText: '',
      renderedSelectedText: '   ',
      currentRef: null,
    } as never);

    expect(text).toBe('ויאמר');
  });

  it('בלי currentRef מכניסה את הטקסט לבדו, בלי סוגריים ריקים', () => {
    expect(buildCitationText({ text: 'ויאמר', currentRef: null } as never)).toBe('ויאמר');
    expect(buildCitationText({ text: 'ויאמר', currentRef: '  ' } as never)).toBe('ויאמר');
  });

  it('בחירה ריקה, null ותשובה שאינה אובייקט מחזירות מחרוזת ריקה', () => {
    expect(buildCitationText(null)).toBe('');
    expect(buildCitationText(undefined)).toBe('');
    expect(buildCitationText({ text: '', currentRef: 'בראשית' } as never)).toBe('');
    expect(buildCitationText('ויאמר' as never)).toBe('');
  });

  it('מאחדת שברי שורה בבחירה לפסקה אחת', () => {
    const text = buildCitationText({
      text: 'שורה ראשונה\n\nשורה שנייה',
      currentRef: 'בראשית פרק א',
    } as never);

    expect(text).toBe('שורה ראשונה שורה שנייה (בראשית פרק א)');
  });

  it('בחירה בכמה פסקאות נבנית מ-sections', () => {
    // מ-0.9.97 השדות ברמה העליונה אינם נושאים את הבחירה במלואה.
    const text = buildCitationText({
      text: '',
      currentRef: null,
      sections: [
        { sourceSelectedText: 'וַיֹּאמֶר', currentRef: 'בראשית פרק א' },
        { sourceSelectedText: 'אֱלֹהִים', currentRef: 'בראשית פרק ב' },
      ],
    } as never);

    expect(text).toBe('וַיֹּאמֶר אֱלֹהִים (בראשית פרק א)');
  });
});

/** מסמך שחושף `insert` ומדווח עליו ביכולות בדיוק כפי שהמנוע מדווח. */
function citationHost(options: { insert?: boolean; reported?: boolean } = {}) {
  const { insert = true, reported = true } = options;
  return {
    activeEditor: {
      doc: {
        ...(insert ? { insert: () => ({ success: true }) } : {}),
        capabilities: { get: () => ({ operations: { insert: { available: reported } } }) },
      },
    },
  } as never;
}

describe('canInsertText', () => {
  it('דורשת doc.insert ולא רק מסמך פתוח', async () => {
    await expect(canInsertText(null)).resolves.toBe(false);
    await expect(canInsertText({ activeEditor: null })).resolves.toBe(false);
    await expect(canInsertText({ activeEditor: { doc: {} } })).resolves.toBe(false);
    await expect(canInsertText(citationHost())).resolves.toBe(true);
  });

  it('נכשלת סגור כשהמנוע מדווח שהפעולה אינה זמינה', async () => {
    // מסמך במצב שאין בו הכנסה (עבודה משותפת, מצב מעקב) חושף את הפונקציה
    // ומדווח `available: false`. הפקד חייב להיות מנוטרל.
    await expect(canInsertText(citationHost({ reported: false }))).resolves.toBe(false);
  });

  it('נכשלת סגור כשאין בכלל יכולות לשאול', async () => {
    // גרסה שאינה חושפת `capabilities` היא „המסמך עדיין נטען” מבחינת הדוח, ולכן
    // התשובה `false` — ולא „אולי כן”.
    const host = { activeEditor: { doc: { insert: () => ({ success: true }) } } } as never;
    await expect(canInsertText(host)).resolves.toBe(false);
  });

  it('אינה מסתפקת בקטלוג: פעולה מוכרזת בלי מימוש אינה זמינה', async () => {
    // מפת ה-`operations` נבנית מקטלוג הפעולות, ולכן גרסה שהסירה את המימוש
    // ועודה מכריזה על `insert` הייתה מחזירה „זמין” לפקד שאין לו למה לקרוא.
    // זו הבדיקה ששומרת על בדיקת הנוכחות שלפני שאלת היכולות.
    await expect(canInsertText(citationHost({ insert: false }))).resolves.toBe(false);
  });
});

/** מסמך מדומה: `insert` שמאמת את הקלט, ובחירה שאפשר להחליף. */
function fakeDoc(options: {
  insert?: (input: unknown) => DocReceipt | Promise<DocReceipt>;
  selection?: SelectionInfoLike;
} = {}) {
  const insert = vi.fn(options.insert ?? (() => ({ success: true })));
  const current = vi.fn(async () => options.selection);
  return { host: { activeEditor: { doc: { insert, selection: { current } } } }, insert, current };
}

/** תצלום בחירה עם יעד שהמנוע יתרגם לכתובת טקסט. */
/**
 * שני השדות שהמנוע מחזיר, ולא רק אחד. הפיקסטורה שהייתה כאן נשאה `target`
 * בלבד, ולכן הבדיקה אישרה קוד ששלח את `target` ל-`doc.insert` — צורה
 * ש-`insert` דוחה סגור עם `target must be a SelectionTarget object.` המשתמש
 * קיבל הודעת שגיאה ושום ציטוט לא נכתב, ושער המעטפת תפס את זה בזמן שהבדיקה
 * הזו הייתה ירוקה.
 */
const CURSOR = {
  target: { kind: 'selection', segments: [{ blockId: 'p1', range: { start: 3, end: 3 } }] },
  selectionTarget: {
    kind: 'selection',
    start: { kind: 'text', blockId: 'p1', offset: 3 },
    end: { kind: 'text', blockId: 'p1', offset: 3 },
  },
  segments: [{ blockId: 'p1', range: { start: 3, end: 3 } }],
};

describe('insertCitation', () => {
  it('מכניסה במיקום הסמן כשיש בחירה במסמך', async () => {
    const { host, insert } = fakeDoc({
      selection: { empty: true, target: CURSOR.target, selectionTarget: CURSOR.selectionTarget },
    });

    await expect(insertCitation(host, 'וַיֹּאמֶר (בראשית פרק א)')).resolves.toEqual({
      ok: true,
      value: 'at-cursor',
    });
    expect(insert).toHaveBeenCalledWith({
      value: 'וַיֹּאמֶר (בראשית פרק א)',
      type: 'text',
      target: CURSOR.selectionTarget,
    });
  });

  /**
   * המנוע החזיר רשימת קטעים אבל לא SelectionTarget — למשל בחירה שאינה נפתרת
   * לנקודות קצה. אז אין יעד חוקי ל-`insert`, וההכנסה נופלת חזרה לסוף המסמך
   * ומדווחת על כך. מה שאסור הוא לשלוח את הצורה הלא נכונה ולקבל שגיאה.
   */
  it('בלי selectionTarget אינה שולחת את רשימת הקטעים כיעד', async () => {
    const { host, insert } = fakeDoc({
      selection: { empty: true, target: CURSOR.target },
    });

    await expect(insertCitation(host, 'ויאמר')).resolves.toEqual({
      ok: true,
      value: 'document-end',
    });
    expect(insert).toHaveBeenCalledWith({ value: 'ויאמר', type: 'text' });
  });

  it('בלי סמן מכניסה בסוף המסמך ומדווחת על כך', async () => {
    // החוזה של insert: „בלי target ההכנסה נעשית בסוף המסמך”. השתקה של זה
    // הייתה מחזירה את הבעיה שכל הגל הזה בא לתקן.
    const { host, insert } = fakeDoc({ selection: undefined });

    await expect(insertCitation(host, 'ויאמר')).resolves.toEqual({
      ok: true,
      value: 'document-end',
    });
    expect(insert).toHaveBeenCalledWith({ value: 'ויאמר', type: 'text' });
  });

  it('בלי doc.insert מחזירה את נוסח §12 ולא זורקת', async () => {
    const outcome = await insertCitation({ activeEditor: { doc: {} } }, 'ויאמר');

    if (outcome.ok) throw new Error('נדרש כשל');
    expect(outcome.reason).toBe('command-unsupported');
    expect(outcome.message).toContain('אינו זמין בגרסה זו');
  });

  it('מלל ריק נדחה לפני הקריאה למנוע', async () => {
    const { host, insert } = fakeDoc();

    const outcome = await insertCitation(host, '');

    if (outcome.ok) throw new Error('נדרש כשל');
    expect(outcome.reason).toBe('empty-text');
    expect(insert).not.toHaveBeenCalled();
  });

  it('קבלה כושלת מגיעה כהודעה עם קוד הכשל', async () => {
    const { host } = fakeDoc({
      insert: () => ({ success: false, failure: { code: 'READ_ONLY' } }),
    });

    const outcome = await insertCitation(host, 'ויאמר');

    if (outcome.ok) throw new Error('נדרש כשל');
    expect(outcome.reason).toBe('READ_ONLY');
    expect(outcome.message).toContain('הכנסת הציטוט נכשלה');
  });

  it('קבלה שמגיעה כ-Promise מטופלת כמו קבלה סינכרונית', async () => {
    const { host } = fakeDoc({ insert: () => Promise.resolve({ success: true }) });

    await expect(insertCitation(host, 'ויאמר')).resolves.toMatchObject({ ok: true });
  });

  it('insert שזורק מגיע כהודעה ולא מפיל את הרצועה', async () => {
    const { host } = fakeDoc({
      insert: () => {
        throw new Error('INVALID_INPUT');
      },
    });

    const outcome = await insertCitation(host, 'ויאמר');

    if (outcome.ok) throw new Error('נדרש כשל');
    expect(outcome.reason).toBe('threw');
  });

  it('קריאת בחירה שזורקת אינה חוסמת את ההכנסה', async () => {
    // readDocSelection לעולם אינו זורק; התוצאה היא הכנסה בסוף המסמך.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { host, insert } = fakeDoc();
    host.activeEditor.doc.selection.current = vi.fn(async () => {
      throw new Error('נפל');
    }) as never;

    await expect(insertCitation(host, 'ויאמר')).resolves.toEqual({
      ok: true,
      value: 'document-end',
    });
    expect(insert).toHaveBeenCalledWith({ value: 'ויאמר', type: 'text' });
  });
});

/* ===========================================================================
 *  „שלח למסמך” — פריט תפריט ההקשר
 * ========================================================================= */

/**
 * מסמך שמקבל הכנסות, ואוסף אותן כדי שהבדיקה תראה מה נכתב.
 *
 * `capabilities` אינו קישוט: `canInsertText` שואלת גם אותו, ומסמך מדומה
 * שחושף `insert` בלבד נחשב „אינו מוכן”. הכפיל הראשון כאן היה כזה, וההמתנה
 * ב-`handleSendToDocument` הסתובבה עליו עד שהבדיקה נתקעה — בדיוק הצורה
 * שהמנוע האמיתי מדווח בה, ולכן אותה צורה גם כאן.
 */
function documentHost(options: { ready?: boolean } = {}): {
  host: { activeEditor: { doc: Record<string, unknown> } };
  inserted: string[];
} {
  const inserted: string[] = [];
  const doc: Record<string, unknown> = {
    insert: async ({ value }: { value: string }): Promise<DocReceipt> => {
      inserted.push(value);
      return { success: true } as DocReceipt;
    },
    capabilities: { get: () => ({ operations: { insert: { available: true } } }) },
    getSelection: async (): Promise<SelectionInfoLike> => ({}) as SelectionInfoLike,
  };
  if (options.ready === false) delete doc.insert;
  return { host: { activeEditor: { doc } }, inserted };
}

describe('registerSendToDocumentItem', () => {
  it('רושמת בדיוק את הפריט שמוצהר במניפסט — openPlugin ושני הקשרי הקריאה', async () => {
    const call = hostReturns(true);

    await expect(registerSendToDocumentItem()).resolves.toEqual({ ok: true, value: undefined });
    expect(call).toHaveBeenCalledWith('reader.addContextMenuItem', {
      id: SEND_TO_DOCUMENT_ITEM_ID,
      title: 'שלח למסמך',
      icon: 'document_text_24_regular',
      contexts: ['reader-selection', 'reader-page-shape-selection'],
      openPlugin: true,
    });
  });

  it('הרשאה חסרה מגיעה כהודעה בעברית שאומרת מה חסר', async () => {
    hostFails('error.permission_denied', 'Permission denied');

    const outcome = await registerSendToDocumentItem();
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toContain('reader.context_menu');
  });
});

describe('handleSendToDocument', () => {
  const noWait = { now: () => 0, sleep: async (): Promise<void> => {} };

  it('מכניסה את הציטוט עם המקור, בדיוק כמו „ציטוט מהקורא”', async () => {
    const { host, inserted } = documentHost();

    const outcome = await handleSendToDocument(
      {
        itemId: SEND_TO_DOCUMENT_ITEM_ID,
        selection: { text: 'וַיֹּאמֶר אֱלֹהִים', currentRef: 'בראשית פרק א' } as never,
      },
      { host, ...noWait },
    );

    expect(outcome).toEqual({ ok: true, value: 'document-end' });
    expect(inserted).toEqual(['וַיֹּאמֶר אֱלֹהִים (בראשית פרק א)']);
  });

  it('מעדיפה את טקסט המקור על המרונדר — הציטוט משקף את הספר ולא את המסך', async () => {
    const { host, inserted } = documentHost();

    await handleSendToDocument(
      {
        itemId: SEND_TO_DOCUMENT_ITEM_ID,
        selection: {
          text: 'ויאמר',
          renderedSelectedText: 'ויאמר',
          sourceSelectedText: 'וַיֹּאמֶר',
          currentRef: 'בראשית א',
        } as never,
      },
      { host, ...noWait },
    );

    expect(inserted).toEqual(['וַיֹּאמֶר (בראשית א)']);
  });

  it('מארח ישן שמוסר שדות שטוחים בלבד נותן אותו מלל', async () => {
    const { host, inserted } = documentHost();

    await handleSendToDocument(
      { itemId: SEND_TO_DOCUMENT_ITEM_ID, selectedText: 'ויאמר  אלהים', currentRef: 'בראשית א' },
      { host, ...noWait },
    );

    expect(inserted).toEqual(['ויאמר אלהים (בראשית א)']);
  });

  it('מתעלמת מלחיצה על פריט של תוסף אחר', async () => {
    const { host, inserted } = documentHost();

    const outcome = await handleSendToDocument({ itemId: 'other-plugin-item' }, { host, ...noWait });

    expect(outcome).toEqual({ ok: false, reason: 'other-item', message: '' });
    expect(inserted).toEqual([]);
  });

  it('בלי טקסט מסומן אומרת זאת, ואינה כותבת כלום', async () => {
    const { host, inserted } = documentHost();

    const outcome = await handleSendToDocument(
      { itemId: SEND_TO_DOCUMENT_ITEM_ID, selection: { text: '   ', currentRef: null } as never },
      { host, ...noWait },
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toContain('לא נמצא טקסט מסומן');
    expect(inserted).toEqual([]);
  });

  it('ממתינה למסמך שנפרס אחרי שהאירוע הגיע — זה המקרה של openPlugin', async () => {
    const ready = documentHost();
    let current: unknown = documentHost({ ready: false }).host;
    let clock = 0;

    const outcome = await handleSendToDocument(
      {
        itemId: SEND_TO_DOCUMENT_ITEM_ID,
        selection: { text: 'ויאמר', currentRef: 'בראשית א' } as never,
      },
      {
        host: current as never,
        resolveHost: () => current as never,
        now: () => clock,
        sleep: async () => {
          clock += 150;
          if (clock >= 600) current = ready.host;
        },
      },
    );

    expect(outcome.ok).toBe(true);
    expect(ready.inserted).toEqual(['ויאמר (בראשית א)']);
  });

  it('מוותרת אחרי הזמן הקצוב ואומרת שאין מסמך', async () => {
    const notReady = documentHost({ ready: false });
    let clock = 0;

    const outcome = await handleSendToDocument(
      {
        itemId: SEND_TO_DOCUMENT_ITEM_ID,
        selection: { text: 'ויאמר', currentRef: 'בראשית א' } as never,
      },
      {
        host: notReady.host,
        now: () => clock,
        sleep: async () => {
          clock += 5_000;
        },
      },
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toContain('אין מסמך פתוח');
  });
});

/* ===========================================================================
 *  ה-latch של הלחיצה
 * ========================================================================= */

/**
 * זה הפער שהפיל את הפיצ'ר: אוצריא משגרת את אירוע הלחיצה מיד אחרי ה-boot,
 * והמאזין ב-App.vue נרשם רק אחרי שהבאנדל נטען — שניות אחר כך. אירוע window
 * בלי מאזין אובד, ואוצריא אינה משחזרת אותו. ה-latch ב-`index.html` הוא מה
 * שגישר, והבדיקות כאן מקבעות את שני צדדיו.
 */
describe('ה-latch של „שלח למסמך”', () => {
  // הנרמול אינו מתקן כשל: במאגר index.html הוא LF, ובלעדיו הבדיקה נשברת רק
  // אצל מי ש-git שלו המיר ל-CRLF.
  const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8').replace(/\r\n/g, '\n');

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)[CONTEXT_MENU_LATCH_KEY];
  });

  it('ה-latch ב-index.html נושא את השם שהקוד קורא לו, ומאזין לאירוע המטופס', () => {
    expect(html).toContain(`window.${CONTEXT_MENU_LATCH_KEY} =`);
    expect(html).toContain("window.addEventListener('contextMenu.itemClicked'");
  });

  it('הוא רץ ב-head, לפני הבאנדל — אחרת אין לו טעם', () => {
    expect(html.indexOf(CONTEXT_MENU_LATCH_KEY)).toBeLessThan(html.indexOf('src/main.ts'));
  });

  /**
   * הסקריפט האמיתי מ-index.html, מורץ ב-jsdom.
   *
   * בלי זה הבדיקות היו נשענות על latch מזויף שנכתב כאן, כלומר על ההנחה שכך
   * ה-HTML מתנהג. מי שיחליף `push(event.detail)` ב-`push(event)` היה מקבל
   * ירוק, והפיצ'ר היה נשבר בדיוק כפי שנשבר לפני ה-latch.
   */
  function runLatchScript(): void {
    const body = html.slice(
      html.indexOf('(function () {', html.indexOf(CONTEXT_MENU_LATCH_KEY)),
      html.indexOf('})();', html.indexOf(CONTEXT_MENU_LATCH_KEY)) + '})();'.length,
    );
    new Function(body)();
  }

  function click(detail: unknown): void {
    window.dispatchEvent(new CustomEvent('contextMenu.itemClicked', { detail }));
  }

  it('ה-latch שב-HTML צובר את ה-detail של הלחיצה, ומוסר אותו בריקון', () => {
    runLatchScript();
    click({ itemId: SEND_TO_DOCUMENT_ITEM_ID, selectedText: 'ויאמר' });

    expect(takePendingContextMenuClicks()).toEqual([
      { itemId: SEND_TO_DOCUMENT_ITEM_ID, selectedText: 'ויאמר' },
    ]);
  });

  it('אחרי הריקון הוא מפסיק לצבור — המאזין החי הוא היחיד שרואה לחיצות', () => {
    runLatchScript();
    takePendingContextMenuClicks();
    click({ itemId: SEND_TO_DOCUMENT_ITEM_ID });

    expect(takePendingContextMenuClicks()).toEqual([]);
  });

  it('שומר על תקרה, כדי שלחיצות בזמן שהעורך עולה לא יצטברו בלי גבול', () => {
    runLatchScript();
    for (let i = 0; i < 12; i++) click({ itemId: SEND_TO_DOCUMENT_ITEM_ID, selectedText: `${i}` });

    const pending = takePendingContextMenuClicks();
    expect(pending).toHaveLength(8);
    // הנשמרות הן האחרונות: לחיצה טרייה רלוונטית יותר מאחת שנדחקה.
    expect(pending[pending.length - 1]).toEqual({
      itemId: SEND_TO_DOCUMENT_ITEM_ID,
      selectedText: '11',
    });
  });

  it('מרוקנת את התור ומעבירה את ה-latch למצב חי, כדי שלא יטופל פעמיים', () => {
    const latch = { queue: [{ itemId: SEND_TO_DOCUMENT_ITEM_ID }], live: false };
    (window as unknown as Record<string, unknown>)[CONTEXT_MENU_LATCH_KEY] = latch;

    expect(takePendingContextMenuClicks()).toEqual([{ itemId: SEND_TO_DOCUMENT_ITEM_ID }]);
    expect(latch.live).toBe(true);
    expect(latch.queue).toEqual([]);
    expect(takePendingContextMenuClicks()).toEqual([]);
  });

  it('בלי latch — למשל בבדיקה או בדפדפן — מחזירה ריק ואינה זורקת', () => {
    expect(takePendingContextMenuClicks()).toEqual([]);
  });

  it('הפריט שנרשם מ-JS הוא אותו אובייקט שמוצהר במניפסט', () => {
    expect(SEND_TO_DOCUMENT_ITEM.id).toBe(SEND_TO_DOCUMENT_ITEM_ID);
    expect(SEND_TO_DOCUMENT_ITEM.openPlugin).toBe(true);
  });
});
