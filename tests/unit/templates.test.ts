/**
 * `engine/templates.ts` — כפיל שמדמה את `doc` הציבורי, בדיוק כמו ב-
 * `page-setup.test.ts`: לא מקליט קריאות אמיתיות, אלא מספק תשובות מהמנוע
 * ורושם אילו פעולות נקראו, כדי לבדוק "בדיוק אילו שלבים תבנית מריצה".
 *
 * `calls` הוא רשימת שמות פעולות (`'sections.setColumns'`, `'blocks.list'`
 * וכו') — לא ה-payload המדויק: זה כבר נבדק ב-`page-setup.test.ts` עבור
 * `sections.*`, וב-`doc-style-defaults.test.ts` עבור `styles.apply`. כאן
 * הדגש הוא על *אילו* פעולות תבנית מפעילה, לא איך כל אחת מהן כותבת XML.
 */
import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_TEMPLATES,
  applyTemplate,
  findTemplate,
  type TemplateId,
} from '../../src/engine/templates';

/** אותו נוסח בדיוק כמו `rtlColumnNote` ב-page-setup.ts (ראו page-setup.test.ts). */
const RTL_COLUMN_NOTE = 'העמודה הראשונה מצוירת בצד שמאל, וגם הסימון עובר שמאל→ימין. הקובץ יישמר נכון.';

interface FakeOptions {
  /** כיוון המקטע כפי ש-`sections.list()` מדווח אותו. ברירת מחדל: מסמך עברי. */
  sectionDirection?: 'rtl' | 'ltr';
  /** מסירה פעולה מהחוזה — מדמה גרסת מנוע שאינה מכירה אותה. */
  omit?: string[];
  /** מחזירה `success:false` עבור פעולה זו. */
  failing?: string[];
}

/**
 * מרכיבה `host` יחיד שמספיק לכל המשטחים ש-`applyTemplate` עשוי לגעת בהם:
 * `sections.*` (page-setup.ts), `headerFooters.*` (header-footer.ts),
 * `styles.apply` (doc-style-defaults.ts), ו-`blocks`/`create`/`insert`/
 * `format.paragraph.setFlowOptions` (תוכן הפסקאות, templates.ts עצמו).
 */
function fakeHost(options: FakeOptions = {}) {
  const omit = new Set(options.omit ?? []);
  const failing = new Set(options.failing ?? []);
  const calls: string[] = [];
  const inserted: string[] = [];
  const pageSetups: { width: number | null; height: number | null }[] = [];
  const footnoteInserts: { at: unknown; content: unknown }[] = [];
  const fieldInserts: { at: unknown; instruction: unknown; mode: unknown }[] = [];
  let nextBlock = 1;

  function receipt(op: string): { success: boolean; failure?: { code: string; message: string } } {
    calls.push(op);
    if (failing.has(op)) return { success: false, failure: { code: 'BOOM', message: `${op} נכשלה` } };
    return { success: true };
  }

  const sectionAddress = { kind: 'section', sectionId: 's0' };
  const sections: Record<string, unknown> = {};

  if (!omit.has('sections.list')) {
    sections.list = () => {
      calls.push('sections.list');
      return Promise.resolve({
        items: [
          {
            address: sectionAddress,
            pageSetup: { width: 8.5, height: 11 },
            margins: { top: 1, right: 1, bottom: 1, left: 1 },
            sectionDirection: options.sectionDirection ?? 'rtl',
            titlePage: false,
            oddEvenHeadersFooters: false,
            headerRefs: {},
            footerRefs: {},
          },
        ],
      });
    };
  }
  if (!omit.has('sections.setPageMargins')) {
    sections.setPageMargins = () => Promise.resolve(receipt('sections.setPageMargins'));
  }
  if (!omit.has('sections.setPageSetup')) {
    sections.setPageSetup = (input: { width?: number; height?: number }) => {
      // המידות נשמרות ולא רק נספרות: „גודל הדף הוחל” ו„גודל הדף **הנכון**
      // הוחל” הן שתי טענות שונות, וזו השנייה שמעניינת בתבנית A5.
      pageSetups.push({ width: input?.width ?? null, height: input?.height ?? null });
      return Promise.resolve(receipt('sections.setPageSetup'));
    };
  }
  if (!omit.has('sections.setColumns')) {
    sections.setColumns = () => Promise.resolve(receipt('sections.setColumns'));
  }
  if (!omit.has('sections.setPageNumbering')) {
    sections.setPageNumbering = () => Promise.resolve(receipt('sections.setPageNumbering'));
  }

  const headerFootersParts: Record<string, unknown> = {};
  if (!omit.has('headerFooters.parts.create')) {
    headerFootersParts.create = () => {
      calls.push('headerFooters.parts.create');
      if (failing.has('headerFooters.parts.create')) {
        return Promise.resolve({ success: false, failure: { code: 'BOOM', message: 'יצירת הכותרת נכשלה' } });
      }
      return Promise.resolve({ success: true, refId: 'hf1' });
    };
  }

  const headerFooters: Record<string, unknown> = { parts: headerFootersParts };
  if (!omit.has('headerFooters.resolve')) {
    headerFooters.resolve = () => {
      calls.push('headerFooters.resolve');
      return Promise.resolve({ status: 'none' });
    };
  }
  if (!omit.has('headerFooters.refs.set')) {
    headerFooters.refs = { set: () => Promise.resolve(receipt('headerFooters.refs.set')) };
  }

  const styles: Record<string, unknown> = {};
  if (!omit.has('styles.apply')) {
    styles.apply = () => Promise.resolve(receipt('styles.apply'));
  }

  const blocks: Record<string, unknown> = {};
  if (!omit.has('blocks.list')) {
    /*
     * `in` מפריד בין שני זרמים, ולכן הכפיל חייב להבחין ביניהם: בלי ההבחנה
     * הזאת „הפסקה הראשונה בכותרת” ו„הפסקה הראשונה בגוף” היו אותו מזהה,
     * והבדיקה הייתה מאשרת הכנסת שדה לגוף כאילו הייתה לכותרת.
     */
    blocks.list = (input?: { in?: unknown }) => {
      const inHeader = input?.in !== undefined;
      calls.push(inHeader ? 'blocks.list(header)' : 'blocks.list');
      return Promise.resolve({
        blocks: inHeader
          ? [{ nodeId: 'h0', nodeType: 'paragraph' }]
          : [{ nodeId: 'p0', nodeType: 'paragraph' }],
      });
    };
  }

  const create: Record<string, unknown> = {};
  if (!omit.has('create.paragraph')) {
    create.paragraph = () => {
      calls.push('create.paragraph');
      if (failing.has('create.paragraph')) return Promise.resolve({ success: false });
      const blockId = `p${nextBlock}`;
      nextBlock += 1;
      return Promise.resolve({ success: true, insertionPoint: { blockId, range: { start: 0 } } });
    };
  }

  const doc: Record<string, unknown> = { sections, headerFooters, styles, blocks, create };

  /** שני המשטחים שהתבניות משתמשות בהם אחרי המדידה מול המנוע הארוז. */
  if (!omit.has('footnotes.insert')) {
    doc.footnotes = {
      insert: (input: { at?: unknown; content?: unknown }) => {
        footnoteInserts.push({ at: input?.at, content: input?.content });
        return Promise.resolve(receipt('footnotes.insert'));
      },
    };
  }
  if (!omit.has('fields.insert')) {
    doc.fields = {
      insert: (input: { at?: unknown; instruction?: unknown; mode?: unknown }) => {
        fieldInserts.push({ at: input?.at, instruction: input?.instruction, mode: input?.mode });
        return Promise.resolve(receipt('fields.insert'));
      },
    };
  }

  if (!omit.has('insert')) {
    doc.insert = (input: { value?: unknown }) => {
      if (typeof input?.value === 'string') inserted.push(input.value);
      return Promise.resolve(receipt('insert'));
    };
  }

  const formatParagraph: Record<string, unknown> = {};
  if (!omit.has('format.paragraph.setFlowOptions')) {
    formatParagraph.setFlowOptions = () => Promise.resolve(receipt('format.paragraph.setFlowOptions'));
  }
  doc.format = { paragraph: formatParagraph };

  const host = { activeEditor: { doc } };
  return { host: host as never, calls, inserted, pageSetups, footnoteInserts, fieldInserts };
}

function countOf(calls: string[], op: string): number {
  return calls.filter((call) => call === op).length;
}

describe('DOCUMENT_TEMPLATES', () => {
  it('כל תבנית נושאת label/hint לא ריקים, ו-preview תקין', () => {
    for (const template of DOCUMENT_TEMPLATES) {
      expect(template.label.length, template.id).toBeGreaterThan(0);
      expect(template.hint.length, template.id).toBeGreaterThan(0);
      expect([1, 2]).toContain(template.preview.columns);
      expect(['a4', 'a5']).toContain(template.preview.ratio);
      expect(typeof template.preview.hasTitleBlock).toBe('boolean');
      expect(typeof template.preview.hasRunningHead).toBe('boolean');
      expect(typeof template.preview.hasFootnoteBand).toBe('boolean');
    }
  });

  it('חמש התבניות בדיוק, לפי המזהים שנקבעו', () => {
    const ids = DOCUMENT_TEMPLATES.map((template) => template.id).sort();
    expect(ids).toEqual(['annotated', 'blank', 'kuntres-a5', 'title-page', 'two-column'].sort());
  });

  it('רק ל-two-column יש note על הכרטיס, והנוסח קבוע', () => {
    for (const template of DOCUMENT_TEMPLATES) {
      if (template.id === 'two-column') {
        expect(template.note).toBe('הטורים מצוירים הפוך בעורך; הקובץ נשמר נכון');
      } else {
        expect(template.note, template.id).toBeUndefined();
      }
    }
  });
});

describe('findTemplate', () => {
  it('מזהה קיים מחזיר את התבנית', () => {
    expect(findTemplate('blank')?.id).toBe('blank');
  });

  it('מזהה זר מחזיר undefined', () => {
    expect(findTemplate('no-such-template')).toBeUndefined();
    expect(findTemplate('')).toBeUndefined();
  });
});

describe('applyTemplate — blank', () => {
  it('no-op מוצלח, ואינו נוגע ב-host כלל', async () => {
    const { host, calls } = fakeHost();
    const outcome = await applyTemplate(host, 'blank');
    expect(outcome).toEqual({ ok: true });
    expect(calls).toEqual([]);
  });
});

describe('applyTemplate — two-column', () => {
  it('קוראת ל-applyColumns עם 2, ומחזירה את הערת ה-RTL', async () => {
    const { host, calls } = fakeHost();
    const outcome = await applyTemplate(host, 'two-column');

    expect(outcome).toEqual({ ok: true, note: RTL_COLUMN_NOTE });
    expect(calls).toContain('sections.setPageSetup'); // A4
    expect(calls).toContain('sections.setPageMargins'); // שוליים
    expect(calls).toContain('sections.setColumns');
    expect(calls).toContain('headerFooters.parts.create'); // כותרת רצה
    expect(calls).toContain('sections.setPageNumbering');
    expect(calls.filter((c) => c === 'sections.setColumns')).toHaveLength(1);
  });

  it('מקטע לועזי אינו נושא הערה', async () => {
    const { host } = fakeHost({ sectionDirection: 'ltr' });
    expect(await applyTemplate(host, 'two-column')).toEqual({ ok: true });
  });

  it('אינה נוגעת בתוכן פסקאות (blocks/create/insert)', async () => {
    const { host, calls } = fakeHost();
    await applyTemplate(host, 'two-column');
    expect(calls).not.toContain('blocks.list');
    expect(calls).not.toContain('create.paragraph');
    expect(calls).not.toContain('insert');
    expect(calls).not.toContain('format.paragraph.setFlowOptions');
  });
});

describe('applyTemplate — annotated', () => {
  it('מחילה A4, גופן גדול, כותרת רצה ומספור, ופסקת פנים אחת', async () => {
    const { host, calls, inserted } = fakeHost();
    const outcome = await applyTemplate(host, 'annotated');

    expect(outcome).toEqual({ ok: true });
    expect(calls).toContain('sections.setPageSetup');
    expect(calls).toContain('styles.apply'); // גודל גופן ברירת מחדל
    expect(calls).toContain('headerFooters.parts.create');
    expect(calls).toContain('sections.setPageNumbering');
    expect(countOf(calls, 'blocks.list')).toBe(1);
    // פסקה **אחת** בגוף: הביאור אינו פסקה שנייה אלא הערת שוליים.
    expect(calls).not.toContain('create.paragraph');
    expect(countOf(calls, 'insert')).toBe(1);
    expect(inserted).toHaveLength(1);
    for (const text of inserted) {
      expect(text.length, text).toBeGreaterThan(0);
      expect(text.length, text).toBeLessThan(40);
    }
    // אין page break בתבנית הזאת.
    expect(calls).not.toContain('format.paragraph.setFlowOptions');
  });

  /**
   * הכרטיס מצהיר `hasFootnoteBand: true` ומצייר רצועת הערות עם מפריד. מסמך
   * בלי הערה אחת הוא „ציור שמשקר”, וזה הכלל שהמפרט קובע.
   */
  it('הביאור הוא הערת שוליים אמיתית, מעוגנת בסוף פסקת הפנים', async () => {
    const { host, calls, footnoteInserts } = fakeHost();
    await applyTemplate(host, 'annotated');

    expect(calls).toContain('footnotes.insert');
    expect(footnoteInserts).toHaveLength(1);
    const [note] = footnoteInserts;
    expect(note!.content).toBe('כאן יתחיל הביאור');
    // סוף פסקת הפנים, ולא תחילתה: סימן ההערה בא אחרי הטקסט שהוא מבאר.
    const offset = 'כאן מתחיל גוף הטקסט'.length;
    expect(note!.at).toEqual({
      kind: 'text',
      segments: [{ blockId: 'p0', range: { start: offset, end: offset } }],
    });
  });

  it('בלי footnotes.insert הביאור מדווח ככשל, ולא נעלם בשקט', async () => {
    const { host } = fakeHost({ omit: ['footnotes.insert'] });
    const outcome = await applyTemplate(host, 'annotated');

    expect(outcome.ok).toBe(false);
  });
});

describe('applyTemplate — title-page', () => {
  it('שלוש פסקאות שער, פסקת גוף חדשה, ומעבר עמוד לפניה — בלי כותרת/מספור', async () => {
    const { host, calls, inserted } = fakeHost();
    const outcome = await applyTemplate(host, 'title-page');

    expect(outcome).toEqual({ ok: true });
    expect(calls).toContain('sections.setPageSetup'); // A4
    expect(countOf(calls, 'blocks.list')).toBe(1);
    expect(countOf(calls, 'create.paragraph')).toBe(3); // מחבר, שנה, ותחילת הגוף
    expect(countOf(calls, 'insert')).toBe(3); // שם הספר, מחבר, שנה — לא פסקת הגוף הריקה
    expect(countOf(calls, 'format.paragraph.setFlowOptions')).toBe(1);
    for (const text of inserted) {
      expect(text.length, text).toBeGreaterThan(0);
    }

    // hasRunningHead: false בתצוגה המקדימה — ואין קריאה שתסתור את זה.
    expect(calls).not.toContain('headerFooters.parts.create');
    expect(calls).not.toContain('sections.setPageNumbering');
    expect(calls).not.toContain('sections.setColumns');
  });
});

describe('applyTemplate — kuntres-a5', () => {
  it('A5 אמיתי, עם שוליים צרים, כותרת רצה ומספור', async () => {
    const { host, calls, pageSetups } = fakeHost();
    const outcome = await applyTemplate(host, 'kuntres-a5');

    expect(outcome).toEqual({ ok: true });
    // 148 × 210 מ״מ באינצ'ים — זה מה שמפריד „קונטרס” מ-A4 עם שוליים צרים,
    // וזה גם מה שהתצוגה המקדימה בכרטיס מבטיחה.
    expect(pageSetups).toHaveLength(1);
    expect(pageSetups[0]!.width).toBeCloseTo(5.827, 3);
    expect(pageSetups[0]!.height).toBeCloseTo(8.268, 3);
    expect(calls).toContain('sections.setPageSetup');
    expect(calls).toContain('sections.setPageMargins');
    expect(calls).toContain('headerFooters.parts.create');
    expect(calls).toContain('sections.setPageNumbering');
    // אין תוכן פסקאות בתבנית הזאת.
    expect(calls).not.toContain('blocks.list');
  });
});

describe('מספר עמוד בכותרת — שדה אמיתי ולא רק הצהרת פורמט', () => {
  /**
   * `applyPageNumbering` כותב `w:pgNumType`, שהוא הצהרת **פורמט** לשדה ולא
   * השדה עצמו, ו-`ensureHeaderFooter` יוצרת כותרת ריקה. עד שהשלב הזה נוסף,
   * שלוש תבניות ציירו בכרטיס מלבן מספר עמוד וייצרו קובץ בלי מספר עמוד.
   */
  it('כל תבנית עם hasRunningHead מכניסה שדה PAGE לפסקה שבכותרת', async () => {
    for (const template of DOCUMENT_TEMPLATES) {
      if (!template.preview.hasRunningHead) continue;
      const { host, calls, fieldInserts } = fakeHost();
      await applyTemplate(host, template.id);

      expect(calls, template.id).toContain('fields.insert');
      expect(fieldInserts, template.id).toHaveLength(1);
      const [field] = fieldInserts;
      expect(field!.instruction, template.id).toBe('PAGE');
      expect(field!.mode, template.id).toBe('raw');
      // **הפסקה שבכותרת** (`h0`), לא זו שבגוף (`p0`) — הכפיל מבחין ביניהן
      // לפי `in`, וזו ההבחנה שמונעת שדה שנוחת בגוף המסמך.
      const at = field!.at as { segments: { blockId: string }[]; story?: { storyType?: string } };
      expect(at.segments[0]!.blockId, template.id).toBe('h0');
      expect(at.story?.storyType, template.id).toBe('headerFooterSlot');
    }
  });

  it('תבנית בלי כותרת רצה אינה מכניסה שדה', async () => {
    const { calls, fieldInserts } = await (async () => {
      const fake = fakeHost();
      await applyTemplate(fake.host, 'title-page');
      return fake;
    })();

    expect(calls).not.toContain('fields.insert');
    expect(fieldInserts).toHaveLength(0);
  });

  it('בלי fields.insert הפעולה מדווחת ככשל ולא כהצלחה שקטה', async () => {
    const { host } = fakeHost({ omit: ['fields.insert'] });
    const outcome = await applyTemplate(host, 'two-column');

    expect(outcome.ok).toBe(false);
  });
});

describe('hasRunningHead → ensureHeaderFooter + applyPageNumbering', () => {
  it('כל תבנית עם hasRunningHead:true קוראת לשתיהן בפועל', async () => {
    for (const template of DOCUMENT_TEMPLATES) {
      if (!template.preview.hasRunningHead) continue;
      const { host, calls } = fakeHost();
      await applyTemplate(host, template.id);
      expect(calls, template.id).toContain('headerFooters.parts.create');
      expect(calls, template.id).toContain('sections.setPageNumbering');
    }
  });

  it('כל תבנית עם hasRunningHead:false אינה קוראת לאף אחת מהן', async () => {
    for (const template of DOCUMENT_TEMPLATES) {
      if (template.preview.hasRunningHead) continue;
      const { host, calls } = fakeHost();
      await applyTemplate(host, template.id);
      expect(calls, template.id).not.toContain('headerFooters.parts.create');
      expect(calls, template.id).not.toContain('sections.setPageNumbering');
    }
  });
});

describe('כשל בשלב אמצעי: השלבים ממשיכים, והתוצאה מדווחת מה לא הוחל', () => {
  it('כשל ב-setColumns אינו עוצר את השלבים שאחריו', async () => {
    const { host, calls } = fakeHost({ failing: ['sections.setColumns'] });
    const outcome = await applyTemplate(host, 'two-column');

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe('template-partial-failure');
      expect(outcome.message).toContain('לא הוחל');
      expect(outcome.message).toContain('שינוי מספר העמודות');
    }
    // השלבים שבאים אחרי הכישלון עדיין רצו — המסמך לא ננטש באמצע.
    expect(calls).toContain('headerFooters.parts.create');
    expect(calls).toContain('sections.setPageNumbering');
  });

  it('כשל בשלב ראשון (paperSize) עדיין מריץ את כל השאר', async () => {
    const { host, calls } = fakeHost({ omit: ['sections.setPageSetup'] });
    const outcome = await applyTemplate(host, 'kuntres-a5');

    expect(outcome.ok).toBe(false);
    expect(calls).toContain('sections.setPageMargins');
    expect(calls).toContain('headerFooters.parts.create');
    expect(calls).toContain('sections.setPageNumbering');
  });

  it('כשל בתוכן (insert) מדווח, ואינו עוצר שלבים מוקדמים שכבר רצו', async () => {
    // `insert` ולא `create.paragraph`: „מהדורה מבוארת” כותבת פסקה אחת בלבד
    // מאז שהביאור עבר להערת שוליים, ואינה יוצרת פסקה שנייה.
    const { host, calls } = fakeHost({ failing: ['insert'] });
    const outcome = await applyTemplate(host, 'annotated');

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.message).toContain('לא הוחל');
    }
    // השלבים המוקדמים (paperSize/font/header/numbering) כבר רצו לפני שהגענו לתוכן.
    expect(calls).toContain('sections.setPageSetup');
    expect(calls).toContain('styles.apply');
    expect(calls).toContain('headerFooters.parts.create');
    expect(calls).toContain('sections.setPageNumbering');
  });

  it('כשל חלקי עדיין נושא את ההערה שכן הופקה (two-column)', async () => {
    // ההערה מגיעה מ-`applyColumns` עצמו, כלומר משלב שהצליח — וכשל בשלב אחר
    // אינו סיבה לבלוע אותה: המשתמש עדיין מקבל מסמך עם שני טורים, ועדיין צריך
    // לדעת שהם מצוירים הפוך.
    const { host } = fakeHost({ failing: ['sections.setPageMargins'] });
    const outcome = await applyTemplate(host, 'two-column');

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.message).toContain(RTL_COLUMN_NOTE);
    }
  });
});

describe('גרסת מנוע חסרה — command-unsupported ולא ניחוש', () => {
  it('בלי headerFooters.parts.create מדווח ואינו זורק', async () => {
    const { host } = fakeHost({ omit: ['headerFooters.parts.create'] });
    const outcome = await applyTemplate(host, 'two-column');
    expect(outcome.ok).toBe(false);
  });

  it('בלי blocks.list, תוכן הפסקאות מדווח ככשל ולא כהצלחה שקטה', async () => {
    const { host } = fakeHost({ omit: ['blocks.list'] });
    const outcome = await applyTemplate(host, 'title-page');
    expect(outcome.ok).toBe(false);
  });
});

describe('applyTemplate על מסמך שעדיין נטען', () => {
  it('host ריק אינו זורק, ומדווח כשל מנוסח', async () => {
    for (const id of ['two-column', 'annotated', 'title-page', 'kuntres-a5'] as TemplateId[]) {
      const outcome = await applyTemplate({} as never, id);
      expect(outcome.ok, id).toBe(false);
    }
  });

  it('מזהה תבנית לא ידוע בזמן ריצה (עוקף את הטיפוס) מדווח ואינו זורק', async () => {
    const { host } = fakeHost();
    const outcome = await applyTemplate(host, 'no-such-id' as TemplateId);
    expect(outcome).toEqual({
      ok: false,
      message: 'החלת התבנית נכשלה: אין תבנית בשם no-such-id',
      reason: 'unknown-template',
    });
  });
});
