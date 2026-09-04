/**
 * ברירות המחדל של מסמך חדש. הבדיקה כאן היא על **מה נשלח למנוע** ועל הדיווח;
 * שההחלה אכן עובדת במנוע האמיתי נבדק ב-`npm run check:rtl` על ה-dist.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  applyHebrewDocumentDefaults,
  applyHebrewPaperSize,
  NEW_DOCUMENT_PAPER_SIZE,
  verifyHebrewDocumentDefaults,
  type DefaultsDocumentApi,
} from '../../src/engine/document-defaults';
import { TWIPS_PER_INCH, type PageSetupDocumentApi } from '../../src/engine/page-setup';

function fakeDoc(overrides: Partial<DefaultsDocumentApi> = {}) {
  const calls: Array<{ op: string; input: unknown }> = [];
  const doc: DefaultsDocumentApi = {
    blocks: {
      list: () => Promise.resolve({ blocks: [{ nodeId: 'p1', nodeType: 'paragraph' }] }),
    },
    sections: {
      list: () => Promise.resolve({ items: [{ address: { kind: 'section', sectionId: 's0' } }] }),
      setSectionDirection: (input) => {
        calls.push({ op: 'sections.setSectionDirection', input });
        return { success: true };
      },
    },
    styles: {
      // הצורה האמיתית שהמנוע מחזיר, נמדדה ב-CDP על ה-dist:
      // `{success: true, changed: false, before: {rightToLeft: 'on'}, after:
      // {rightToLeft: 'on'}}`. כפיל שמחזיר `{success: true}` בלבד הוא נאמן
      // פחות מהמנוע, וזה בדיוק מה שאיפשר לכשל „התקבל ולא נכתב” לעבור.
      apply: (input) => {
        calls.push({ op: 'styles.apply', input });
        return { success: true, changed: true, before: { rightToLeft: 'inherit' }, after: { rightToLeft: 'on' } };
      },
    },
    format: {
      paragraph: {
        setDirection: (input) => {
          calls.push({ op: 'format.paragraph.setDirection', input });
          return { success: true };
        },
      },
    },
    ...overrides,
  };
  return { doc, calls, host: { activeEditor: { doc } } };
}

describe('applyHebrewDocumentDefaults', () => {
  it('מחילה שלוש שכבות: docDefaults, מקטע ופסקה', async () => {
    const { host, calls } = fakeDoc();

    const report = await applyHebrewDocumentDefaults(host);

    expect(report.failures).toEqual([]);
    expect(report.applied).toEqual(['docDefaults', 'section', 'paragraph']);
    expect(calls.map((call) => call.op)).toEqual([
      'styles.apply',
      'sections.setSectionDirection',
      'format.paragraph.setDirection',
    ]);
  });

  it('ברירת המחדל של הגלריה היא w:bidi בערוץ הפסקה', async () => {
    // זו השכבה שקובעת לכל פסקה שתיווצר, ולכן היא זו שעונה על „מסמך חדש
    // נפתח מימין לשמאל” — ולא רק הפסקה הראשונה.
    const { host, calls } = fakeDoc();

    await applyHebrewDocumentDefaults(host);

    expect(calls[0]!.input).toEqual({
      target: { scope: 'docDefaults', channel: 'paragraph' },
      patch: { rightToLeft: true },
    });
  });

  it('אינה מבקשת יישור מפורש — preserve ולא matchDirection', async () => {
    // נמדד על המנוע: `matchDirection` כותב alignment: 'left' בפסקה RTL, כלומר
    // יישור פיזי לשמאל. `w:bidi` בלי `w:jc` הוא מה ש-Word עושה, והטקסט נצמד
    // לימין מעצמו.
    const { host, calls } = fakeDoc();

    await applyHebrewDocumentDefaults(host);

    const paragraph = calls.find((call) => call.op === 'format.paragraph.setDirection');
    expect(paragraph!.input).toEqual({
      target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
      direction: 'rtl',
      alignmentPolicy: 'preserve',
    });
  });

  it('מדווחת על קבלה שנכשלה, עם הקוד של המנוע', async () => {
    const { host } = fakeDoc({
      styles: {
        apply: () => ({ success: false, failure: { code: 'DOCUMENT_READONLY' } }),
      },
    });

    const report = await applyHebrewDocumentDefaults(host);

    expect(report.failures).toEqual(['ברירת המחדל של הגלריה נכשלה (DOCUMENT_READONLY)']);
    // שכבה שנכשלה אינה עוצרת את השאר: מקטע ופסקה עדיין הוחלו.
    expect(report.applied).toEqual(['section', 'paragraph']);
  });

  it('אינה זורקת כשפעולה במנוע זורקת', async () => {
    // כשל בכיווניות אינו סיבה להפיל פתיחת מסמך.
    const { host } = fakeDoc({
      sections: {
        list: () => {
          throw new Error('boom');
        },
      },
    });

    const report = await applyHebrewDocumentDefaults(host);

    expect(report.failures).toEqual(['כיווניות המקטע שגתה: boom']);
    expect(report.applied).toEqual(['docDefaults', 'paragraph']);
  });

  it('מדווחת כשהמנוע אינו חושף Document API', async () => {
    const report = await applyHebrewDocumentDefaults({ activeEditor: null });

    expect(report.applied).toEqual([]);
    expect(report.failures).toEqual(['המנוע אינו חושף את ה-Document API']);
  });

  it('מדווחת על פעולה שאינה קיימת בגרסת המנוע', async () => {
    // גרסה עתידית שתסיר פעולה לא תיפול בשקט.
    const { host } = fakeDoc({ styles: {} });

    const report = await applyHebrewDocumentDefaults(host);

    expect(report.failures).toEqual(['ברירת המחדל של הגלריה אינה נתמכת במנוע']);
  });

  it('סובלת קבלה סינכרונית וקבלה כהבטחה', async () => {
    // הפאסדה בדפדפן א-סינכרונית, ואותו קוד רץ גם מול מימוש סינכרוני.
    const { host } = fakeDoc({
      styles: {
        apply: () =>
          Promise.resolve({ success: true, changed: true, after: { rightToLeft: 'on' } }),
      },
    });

    const report = await applyHebrewDocumentDefaults(host);

    expect(report.failures).toEqual([]);
  });

  it('`success: true` בלי שהערך נכתב אינו הצלחה', async () => {
    // זהו הכשל השקט שהשכבה הזאת חשופה לו: `success` אומר „הבקשה התקבלה
    // ועובדה”, ולא „הערך שם”. השכבה הזאת היא היחידה מהשלוש שקובעת לפסקות
    // **הבאות**, ולכן כשל בה אינו נראה במסמך שנפתח אלא רק כשהמשתמש מקיש Enter.
    const { host } = fakeDoc({
      styles: { apply: () => ({ success: true, changed: false, after: { rightToLeft: 'inherit' } }) },
    });

    const report = await applyHebrewDocumentDefaults(host);

    expect(report.applied).not.toContain('docDefaults');
    expect(report.failures).toEqual([
      'ברירת המחדל של הגלריה לא נכתבה (המנוע דיווח rightToLeft=inherit)',
    ]);
  });

  it('`changed: false` על ערך שכבר מוחל הוא הצלחה', async () => {
    // זה מה שהמנוע מחזיר בקריאה שנייה, וזו התשובה השכיחה. בדיקת `changed`
    // במקום `after` הייתה מדווחת כשל על מסמך שהוא בדיוק כפי שביקשנו.
    const { host } = fakeDoc({
      styles: {
        apply: () => ({ success: true, changed: false, before: { rightToLeft: 'on' }, after: { rightToLeft: 'on' } }),
      },
    });

    const report = await applyHebrewDocumentDefaults(host);

    expect(report.failures).toEqual([]);
    expect(report.applied).toContain('docDefaults');
  });

  it('`after` בצורה לא מוכרת נכשל סגור', async () => {
    // תשובה שעברה סריאליזציה מ-worker עלולה להגיע כ-boolean במקום כתלת-מצבי.
    // „truthy” אינו „on”, בדיוק כמו ב-readDocCapabilities.
    for (const after of [{ rightToLeft: true }, { rightToLeft: 'ON' }, {}, undefined]) {
      const { host } = fakeDoc({
        styles: { apply: () => ({ success: true, changed: true, after }) },
      });

      const report = await applyHebrewDocumentDefaults(host);

      expect(report.applied, JSON.stringify(after)).not.toContain('docDefaults');
    }
  });

  it('אינה נוגעת במנוע יותר מפעם אחת לכל שכבה', async () => {
    const apply = vi.fn(() => ({ success: true, changed: true, after: { rightToLeft: 'on' as const } }));
    const { host } = fakeDoc({ styles: { apply } });

    await applyHebrewDocumentDefaults(host);

    expect(apply).toHaveBeenCalledTimes(1);
  });
});

/**
 * מסמך למדידת גודל הדף. `pageSetup` במקטע הוא מה שקובע אם הוא לרוחב, ולכן הוא
 * חלק מהכפיל ולא פרט מימוש.
 */
type SetPageSetup = NonNullable<NonNullable<PageSetupDocumentApi['sections']>['setPageSetup']>;

function fakePaperDoc(
  options: { setPageSetup?: SetPageSetup; width?: number; height?: number } = {},
) {
  const { width = 12240, height = 15840 } = options;
  const calls: Array<Record<string, unknown>> = [];
  const doc: PageSetupDocumentApi = {
    sections: {
      list: () => ({
        items: [{ address: { kind: 'section', sectionId: 's0' }, pageSetup: { width, height } }],
      }),
      setPageSetup:
        options.setPageSetup ??
        ((input) => {
          calls.push(input as Record<string, unknown>);
          return { success: true };
        }),
    },
  };
  return { calls, host: { activeEditor: { doc } } };
}

describe('applyHebrewPaperSize', () => {
  it('מחילה A4 — 11906 × 16838 twips עם קוד נייר 9', async () => {
    // המסמך הריק של המנוע הוא Letter (12240 × 15840), וזו כל הסיבה שהפונקציה
    // קיימת. ה-API מקבל אינצ'ים, ולכן העיגול שהמנוע עושה נבדק כאן.
    const { host, calls } = fakePaperDoc();

    await expect(applyHebrewPaperSize(host)).resolves.toEqual({ applied: true, failure: '' });
    expect(calls).toHaveLength(1);
    expect(Math.round((calls[0]!.width as number) * TWIPS_PER_INCH)).toBe(11906);
    expect(Math.round((calls[0]!.height as number) * TWIPS_PER_INCH)).toBe(16838);
    expect(calls[0]!.paperSize).toBe('9');
  });

  it('הגודל המבוקש הוא זה שמוצהר בקבוע', () => {
    // הקבוע הוא מה ש-App.vue וההסבר בקוד מדברים עליו; מזהה אחר היה משנה מסמך
    // חדש בלי שאיש יראה.
    expect(NEW_DOCUMENT_PAPER_SIZE).toBe('a4');
  });

  it('מדווחת בעברית כשהקבלה נכשלה, ואינה זורקת', async () => {
    const { host } = fakePaperDoc({
      setPageSetup: () => ({ success: false, failure: { code: 'DOCUMENT_READONLY' } }),
    });

    const report = await applyHebrewPaperSize(host);

    expect(report.applied).toBe(false);
    // הקוד של המנוע מתורגם לעברית ב-`receiptFailureText`; מה שמגיע לשורת המצב
    // הוא הנוסח הזה, ולא `DOCUMENT_READONLY`.
    expect(report.failure).toBe('שינוי גודל הדף ל-A4 נכשל: המסמך פתוח לקריאה בלבד');
  });

  it('אינה זורקת כשפעולה במנוע זורקת', async () => {
    // כשל בגודל הדף אינו סיבה להפיל פתיחת מסמך, בדיוק כמו כשל בכיווניות.
    const { host } = fakePaperDoc({
      setPageSetup: () => {
        throw new Error('boom');
      },
    });

    const report = await applyHebrewPaperSize(host);

    expect(report.applied).toBe(false);
    expect(report.failure).toContain('boom');
  });

  it('מדווחת על גרסת מנוע שאינה חושפת את הפעולה', async () => {
    const report = await applyHebrewPaperSize({
      activeEditor: { doc: { sections: { list: () => ({ items: [{ address: 's0' }] }) } } },
    });

    expect(report.applied).toBe(false);
    expect(report.failure).toContain('אינה נתמכת בגרסה הזאת של המנוע');
  });

  it('מדווחת כשהמנוע אינו חושף Document API', async () => {
    const report = await applyHebrewPaperSize({ activeEditor: null });

    expect(report.applied).toBe(false);
    expect(report.failure).toContain('המסמך עדיין נטען');
  });

  it('סובלת קבלה סינכרונית וקבלה כהבטחה', async () => {
    const { host } = fakePaperDoc({ setPageSetup: () => Promise.resolve({ success: true }) });

    await expect(applyHebrewPaperSize(host)).resolves.toEqual({ applied: true, failure: '' });
  });

  it('NO_OP אינו כשל — מסמך שכבר A4 אינו מדווח שגיאה', async () => {
    const { host } = fakePaperDoc({
      setPageSetup: () => ({ success: false, failure: { code: 'NO_OP' } }),
    });

    await expect(applyHebrewPaperSize(host)).resolves.toEqual({ applied: true, failure: '' });
  });

  it('במקטע שהוא לרוחב המידות מוחלפות', async () => {
    // בלי ההחלפה היה נשאר `w:orient="landscape"` על דף שמידותיו לאורך. לא
    // המצב של מסמך חדש, אבל אותה פונקציה משמשת גם את הגלריה ב„פריסה”.
    const { host, calls } = fakePaperDoc({ width: 15840, height: 12240 });

    await applyHebrewPaperSize(host);

    expect(Math.round((calls[0]!.width as number) * TWIPS_PER_INCH)).toBe(16838);
    expect(Math.round((calls[0]!.height as number) * TWIPS_PER_INCH)).toBe(11906);
  });
});

describe('verifyHebrewDocumentDefaults', () => {
  const a4 = { width: 11906 / TWIPS_PER_INCH, height: 16838 / TWIPS_PER_INCH };
  const withSection = (item: Record<string, unknown>) =>
    fakeDoc({ sections: { list: () => Promise.resolve({ items: [item] }) } });

  it('מקטע RTL בגודל A4 מאומת — בקריאה אחת, בלי כתיבה', async () => {
    const { host, calls } = withSection({ address: {}, sectionDirection: 'rtl', pageSetup: a4 });
    await expect(verifyHebrewDocumentDefaults(host)).resolves.toBe(true);
    expect(calls).toEqual([]);
  });

  it('מקטע LTR, Letter או ללא מידות — אינו מאומת', async () => {
    await expect(
      verifyHebrewDocumentDefaults(withSection({ sectionDirection: 'ltr', pageSetup: a4 }).host),
    ).resolves.toBe(false);
    await expect(
      verifyHebrewDocumentDefaults(withSection({ sectionDirection: 'rtl', pageSetup: { width: 8.5, height: 11 } }).host),
    ).resolves.toBe(false);
    await expect(verifyHebrewDocumentDefaults(withSection({ sectionDirection: 'rtl' }).host)).resolves.toBe(false);
  });

  it('מנוע בלי sections.list, או שזורק — נכשל סגור', async () => {
    await expect(verifyHebrewDocumentDefaults({ activeEditor: { doc: {} } })).resolves.toBe(false);
    const throwing = fakeDoc({ sections: { list: () => Promise.reject(new Error('אין')) } });
    await expect(verifyHebrewDocumentDefaults(throwing.host)).resolves.toBe(false);
  });
});
