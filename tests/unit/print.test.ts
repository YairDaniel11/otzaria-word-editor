/**
 * ההדפסה. שלוש טענות נבדקות כאן, וכל אחת מהן נכשלה לפני התיקון:
 *
 *   1. יש גלון `@media print` שמסתיר את המעטפת ומשחרר את מיכל הגלילה. לפני
 *      התיקון לא היה בכל `src` אף `@media print` ואף `@page`, ולכן ההדפסה
 *      הדפיסה את הממשק (נמדד ב-CDP; ראו engine/print.ts).
 *   2. `@page` מקבל את מידות הדף של המסמך, באינצ'ים ובעיגול כלפי מעלה.
 *   3. כשל בקריאת המידות אינו מונע הדפסה — הוא מדווח.
 *
 * הבדיקה על ה-CSS היא סריקת מקור, כמו tests/unit/tab-controls.test.ts: מה
 * שנמדד בפועל בדפדפן הוא הפלט (PDF), וזה נעשה ב-CDP ולא ב-jsdom — ל-jsdom אין
 * עימוד, אין `@page` ואין הדפסה.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { PENDING_CLASS } from '../../src/sessions/editor-swap';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  ENGINE_LAYOUT_CLASS,
  ENGINE_PAGE_CLASS,
  PRINT_PAGE_STYLE_ID,
  applyPrintPageSize,
  measurePrintPageSize,
  pageRule,
  pageSizeText,
  printDocument,
  readPrintPageSize,
  exportPdfDocument,
  pdfSuggestedName,
  type PrintDocumentApi,
} from '../../src/engine/print';

const STYLES = join(process.cwd(), 'src/styles');
const PRINT_CSS = readFileSync(join(STYLES, 'print.css'), 'utf8');

/** A4 כפי שהמנוע מדווח: 11906 twips / 1440. */
const A4 = { width: 11906 / 1440, height: 16838 / 1440 };
/** Letter, המסמך הריק של המנוע: 12240×15840 twips. */
const LETTER = { width: 12240 / 1440, height: 15840 / 1440 };

function fakeHost(
  options: { items?: unknown; omitList?: boolean; throws?: boolean } = {},
): { activeEditor: { doc: PrintDocumentApi } } {
  const doc = {
    sections: options.omitList
      ? {}
      : {
          list: () => {
            if (options.throws) throw new Error('boom');
            return { items: options.items ?? [{ pageSetup: A4 }] };
          },
        },
  } as unknown as PrintDocumentApi;
  return { activeEditor: { doc } };
}

describe('גלון ההדפסה', () => {
  it('קיים `@media print` ו-`@page` — ולא היו קודם בכלל', () => {
    expect(PRINT_CSS).toContain('@media print');
    expect(PRINT_CSS).toContain('@page');
  });

  it('הוא נטען ב-main.ts, ולא רק קיים בתיקייה', () => {
    // קובץ CSS שאינו מיובא אינו נכנס לבאנדל, וזה הכשל שאי אפשר לראות בעין.
    expect(readFileSync(join(process.cwd(), 'src/main.ts'), 'utf8')).toContain(
      "import './styles/print.css'",
    );
  });

  it('המעטפת מוסתרת — לפי מקומה במעטפת ולא לפי שם כל פס', () => {
    // כלל אחד לכל הצאצאים שאינם אזור המסמך: פקד שיתווסף למעטפת לא ידפיס את
    // עצמו בשקט. הכלל הזה הוא הליבה של התיקון.
    expect(PRINT_CSS).toContain('.word-app-shell > :not(.editor-area)');
    // דיאלוג שעושה Teleport ל-body יוצא מהעץ של המעטפת.
    expect(PRINT_CSS).toContain('body > :not(#app)');
  });

  it('הכלל פוסח על אזור המסמך בשתי הרמות, ולא רק באחת', () => {
    // הבאג שהבדיקה מקבעת: הכלל נכתב כש-`.editor-stack` היה ילד ישיר של
    // המעטפת, ומאז נכנס `.editor-area` ביניהם — כלומר הכלל הסתיר את המסמך
    // עצמו. נמדד במדיית print: `display: none` ורוחב 0 על אזור המסמך.
    expect(PRINT_CSS).toContain('.editor-area > :not(.editor-stack)');
    // בלי זה `.editor-area` נשאר `flex` ו-`position: relative` של המסך.
    const at = PRINT_CSS.indexOf('.editor-area {');
    expect(at, 'יש בלוק משלו ל-.editor-area').toBeGreaterThan(-1);
    expect(PRINT_CSS.slice(at, at + 200)).toContain('display: block !important');
  });

  it('הכלל חל על **כל** רמה בשרשרת אל המסמך — שש, ולא שלוש', () => {
    // שלוש רמות היו חסרות, וזה נמדד: „פאנל עתידי” של 120px שנשתל כילד נוסף
    // בכל רמה הודפס ב-`#app`, ב-`.editor-stack` וב-`.document-pane` (ולא
    // ב-`body`), ו-`body.scrollHeight` במדיית print עלה בדיוק ב-3×120.
    //
    // הרשימה כאן היא שרשרת ה-DOM המלאה. מי שמאמת שזו אכן שרשרת ההורות
    // בפועל הוא tests/component/app-shell.test.ts — סריקת טקסט על CSS אינה
    // יכולה לדעת מה מכיל את מה, וזו הסיבה שרגרסיית `.editor-area` נכנסה
    // בירוק דרך כל הבדיקות שכאן.
    for (const selector of [
      'body > :not(#app)',
      '#app > :not(.word-app-shell)',
      '.word-app-shell > :not(.editor-area)',
      '.editor-area > :not(.editor-stack)',
      '.editor-stack > :not(.document-pane)',
      '.document-pane > :not(.editor-stack__host)',
    ]) {
      expect(PRINT_CSS, selector).toContain(selector);
    }

    // `#app` היא הרמה היחידה שאין לה DOM בבדיקת ההרכבה (שם המעטפת מורכבת
    // ישר ל-body), ולכן ההנחה עליה מקובעת במקור שלה: index.html ו-main.ts.
    expect(readFileSync(join(process.cwd(), 'index.html'), 'utf8')).toContain('<div id="app">');
    expect(readFileSync(join(process.cwd(), 'src/main.ts'), 'utf8')).toContain("mount('#app')");
  });

  it('פאנל הטאב חוזר לזרימה — אחרת כל השרשרת מעליו בגובה 0', () => {
    // `:global(.document-pane)` הוא `position: absolute; inset: 0`. נמדד
    // במדיית print אחרי תיקון הכלל שמעל: העמוד צויר 794×1123, אבל `.editor-area`,
    // `.editor-stack` ו-`document.body` כולם בגובה 0 — כלומר גיליון אחד חתוך.
    const at = PRINT_CSS.indexOf('.document-pane {');
    expect(at, 'יש בלוק משלו ל-.document-pane').toBeGreaterThan(-1);
    expect(PRINT_CSS.slice(at, at + 200)).toContain('position: static !important');
  });

  it('מיכל הגלילה משוחרר — אחרת נדפס גובה חלון אחד', () => {
    for (const selector of [
      '.editor-stack {',
      // עם ה-`:not` — ה-host הממתין נשאר מחוץ לזרימה בכוונה, ראו הבדיקה מתחת.
      `.editor-stack__host:not(.${PENDING_CLASS}) {`,
    ]) {
      // תחילת בלוק ולא הופעה כלשהי: `:not(.editor-stack)` הוא הופעה אחרת
      // לגמרי של אותו שם, ובדיקה עליה הייתה עוברת מהסיבה הלא נכונה.
      const at = PRINT_CSS.indexOf(selector);
      expect(at, selector).toBeGreaterThan(-1);
      expect(PRINT_CSS.slice(at, at + 220), selector).toContain('position: static !important');
    }
  });

  it('ה-host של פתיחה שעוד בדרך אינו חוזר לזרימה — ואינו מוסתר ב-display', () => {
    // בזמן פתיחה יושבים בפאנל **שניים**: הפעיל, והמועמד שנבנה. לשניהם
    // `HOST_CLASS`, ולכן שחרור מיכל הגלילה החזיר לזרימה גם את המועמד —
    // `visibility: hidden` מונע ממנו להיצבע אבל לא מלתפוס שטח, כלומר עמוד
    // אחרי עמוד של לבן באורך המסמך שהוא בונה.
    const at = PRINT_CSS.indexOf(`.editor-stack__host:not(.${PENDING_CLASS})`);
    expect(at, 'שחרור המיכל פוסח על ה-host הממתין').toBeGreaterThan(-1);
    expect(PRINT_CSS.slice(at, at + 200)).toContain('position: static !important');
    // ו**לא** `display: none` עליו: styles/shell.css קובע שם במפורש של-host
    // שנטען חייב להיות box אמיתי, אחרת המנוע מודד עימוד באלמנט בגודל אפס.
    expect(PRINT_CSS).not.toContain(`.${PENDING_CLASS} {`);
    // מול הקבוע ולא מול מחרוזת: הכלל שווה כלום אם ה-swap ישנה את השם.
    expect(PENDING_CLASS).toBe('editor-stack__host--pending');
  });

  it('ה-transform של הזום מבוטל — אחרת הדפסה ב-50% יוצאת מוקטנת', () => {
    const at = PRINT_CSS.indexOf(`.${ENGINE_LAYOUT_CLASS}`);
    expect(at).toBeGreaterThan(-1);
    expect(PRINT_CSS.slice(at, at + 240)).toContain('transform: none !important');
  });

  it('צל העמוד מוסר, ומעבר העמוד האחרון מבוטל', () => {
    // שני אלה נמדדו בפלט: הצל הוא סגנון inline של המנוע וההצהרה שלו עליו
    // אינה `important`; `page-break-after: always` על העמוד האחרון הוליד
    // גיליון ריק נוסף.
    expect(PRINT_CSS).toContain(`.${ENGINE_PAGE_CLASS} {`);
    expect(PRINT_CSS).toContain('box-shadow: none !important');
    expect(PRINT_CSS).toContain(`.${ENGINE_PAGE_CLASS}:last-child`);
    expect(PRINT_CSS).toContain('page-break-after: auto !important');
  });

  it('אין בגלון צבע קשיח — ולידציית העיצוב של אוצריא פוסלת אותו', () => {
    const withoutComments = PRINT_CSS.replace(/\/\*[\s\S]*?\*\//g, ' ');
    expect(withoutComments).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(withoutComments).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/);
  });
});

describe('readPrintPageSize', () => {
  it('A4 נקרא כאינצ׳ים ומעוגל כלפי מעלה', async () => {
    // 11906/1440 = 8.26805… ; עיגול למטה היה נותן גיליון קטן מתיבת העמוד,
    // וכל עמוד היה נשבר לשניים.
    await expect(readPrintPageSize(fakeHost())).resolves.toEqual({
      widthIn: 8.269,
      heightIn: 11.694,
    });
  });

  it('Letter נקרא כמו שהוא ואינו מוחלף ב-A4', async () => {
    await expect(readPrintPageSize(fakeHost({ items: [{ pageSetup: LETTER }] }))).resolves.toEqual({
      widthIn: 8.5,
      heightIn: 11,
    });
  });

  it('מקטע בלי pgSz מדולג, והמקטע הבא נקרא', async () => {
    const items = [{ pageSetup: undefined }, {}, { pageSetup: A4 }];

    await expect(readPrintPageSize(fakeHost({ items }))).resolves.toEqual({
      widthIn: 8.269,
      heightIn: 11.694,
    });
  });

  it('מידה שאינה מידה אינה הופכת ל-`@page`', async () => {
    for (const pageSetup of [
      { width: 0, height: 11 },
      { width: -8.5, height: 11 },
      { width: Number.NaN, height: 11 },
      { width: 8.5, height: 900 },
      { width: '8.5in', height: 11 },
      { width: 8.5 },
    ]) {
      await expect(readPrintPageSize(fakeHost({ items: [{ pageSetup }] }))).resolves.toBeNull();
    }
  });

  it('אין מסמך, אין `sections.list`, או קריאה שזורקת — `null`, לא זריקה', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(readPrintPageSize(null)).resolves.toBeNull();
    await expect(readPrintPageSize({ activeEditor: { doc: null } })).resolves.toBeNull();
    await expect(readPrintPageSize(fakeHost({ omitList: true }))).resolves.toBeNull();
    await expect(readPrintPageSize(fakeHost({ throws: true }))).resolves.toBeNull();

    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('תשובה שאינה רשימה אינה תשובה', async () => {
    await expect(readPrintPageSize(fakeHost({ items: 'nope' }))).resolves.toBeNull();
  });
});

/**
 * המקור השני לגודל הדף, כשהקריאה מהמנוע נכשלה.
 *
 * הבאג שהבדיקות כאן מקבעות: `@page` נשאר `margin: 0` **בלי** `size`, כלומר
 * נייר ברירת המחדל של הדפדפן (Letter, 1056px) מול תיבת עמוד A4 (1122.53px) —
 * ומסמך של עמוד אחד יצא שני גיליונות, השני ריק.
 */
describe('measurePrintPageSize', () => {
  /**
   * תיבת עמוד „מצוירת”. ל-jsdom אין פריסה ולכן `offsetWidth` שם הוא 0 תמיד,
   * והמידות מוזרקות כתכונה על המופע — בדיוק מה שהדפדפן היה מחזיר.
   */
  function drawPage(root: Document, width: number, height: number): HTMLElement {
    const layout = root.createElement('div');
    layout.className = ENGINE_LAYOUT_CLASS;
    const page = root.createElement('div');
    page.className = ENGINE_PAGE_CLASS;
    Object.defineProperty(page, 'offsetWidth', { value: width, configurable: true });
    Object.defineProperty(page, 'offsetHeight', { value: height, configurable: true });
    layout.appendChild(page);
    root.body.appendChild(layout);
    return page;
  }

  function emptyRoot(): Document {
    return document.implementation.createHTMLDocument('t');
  }

  it('עמוד A4 מצויר נמדד כאינצ׳ים, ולא נגרר אחרי הזום', () => {
    const root = emptyRoot();
    // A4 הוא 793.733×1122.53, ו-`offset*` הן מספרים שלמים — 794×1123.
    const page = drawPage(root, 794, 1123);

    expect(measurePrintPageSize(root)).toEqual({ widthIn: 8.271, heightIn: 11.698 });

    // 50% זום: `getBoundingClientRect` כולל את ה-transform, ומדידה דרכו
    // הייתה מייצרת `@page` בחצי גודל הדף. `offset*` אינן רואות אותו.
    page.getBoundingClientRect = () =>
      ({
        width: 397,
        height: 561.5,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 397,
        bottom: 561.5,
      }) as DOMRect;
    expect(measurePrintPageSize(root)).toEqual({ widthIn: 8.271, heightIn: 11.698 });
  });

  it('אין עמוד על המסך, או שאין לו מידה — `null` ולא `@page` מומצא', () => {
    expect(measurePrintPageSize(emptyRoot())).toBeNull();

    const undrawn = emptyRoot();
    drawPage(undrawn, 0, 0);
    expect(measurePrintPageSize(undrawn)).toBeNull();

    const absurd = emptyRoot();
    drawPage(absurd, 20, 40_000);
    expect(measurePrintPageSize(absurd)).toBeNull();
  });
});

describe('pageRule', () => {
  it('גודל שנקרא נכתב עם margin 0 — בלי שוליים כפולים', () => {
    expect(pageRule({ widthIn: 8.269, heightIn: 11.694 })).toBe(
      '@page { size: 8.269in 11.694in; margin: 0; }',
    );
  });

  it('בלי גודל נשאר margin 0 בלבד', () => {
    // גם כאן `margin: 0` הוא העיקר: השוליים של המסמך באים מה-DOCX.
    expect(pageRule(null)).toBe('@page { margin: 0; }');
  });

  it('pageSizeText הוא הנוסח שהשער ב-CDP משווה מולו', () => {
    expect(pageSizeText({ widthIn: 8.5, heightIn: 11 })).toBe('8.5in 11in');
  });
});

describe('applyPrintPageSize', () => {
  afterEach(() => {
    document.getElementById(PRINT_PAGE_STYLE_ID)?.remove();
    delete document.documentElement.dataset.printPageSize;
  });

  it('כותבת `@page` ואת התכונה שאפשר לקרוא מבחוץ', () => {
    applyPrintPageSize({ widthIn: 8.269, heightIn: 11.694 }, document);

    expect(document.getElementById(PRINT_PAGE_STYLE_ID)?.textContent).toContain('8.269in 11.694in');
    expect(document.documentElement.dataset.printPageSize).toBe('8.269in 11.694in');
  });

  it('הדפסה שנייה מחדשת את אותו אלמנט ולא צוברת עוד אחד', () => {
    applyPrintPageSize({ widthIn: 8.269, heightIn: 11.694 }, document);
    applyPrintPageSize({ widthIn: 8.5, heightIn: 11 }, document);

    expect(document.querySelectorAll(`#${PRINT_PAGE_STYLE_ID}`)).toHaveLength(1);
    expect(document.documentElement.dataset.printPageSize).toBe('8.5in 11in');
  });

  it('גודל שלא נקרא מוחק את התכונה — ולא משאיר את של הפעם הקודמת', () => {
    applyPrintPageSize({ widthIn: 8.5, heightIn: 11 }, document);
    applyPrintPageSize(null, document);

    expect(document.documentElement.dataset.printPageSize).toBeUndefined();
    expect(document.getElementById(PRINT_PAGE_STYLE_ID)?.textContent).toBe('@page { margin: 0; }');
  });
});

describe('printDocument', () => {
  afterEach(() => {
    document.getElementById(PRINT_PAGE_STYLE_ID)?.remove();
    delete document.documentElement.dataset.printPageSize;
  });

  it('כותבת את `@page` **לפני** שהיא פותחת את הדיאלוג', async () => {
    // הסדר הוא כל התיקון: `window.print()` הוא סינכרוני וחוסם, ו-`@page`
    // שנכתב אחריו אינו משפיע על הפלט.
    let ruleAtPrintTime: string | null = null;
    const outcome = await printDocument(fakeHost(), {
      print: () => {
        ruleAtPrintTime = document.getElementById(PRINT_PAGE_STYLE_ID)?.textContent ?? null;
      },
    });

    expect(outcome).toEqual({ ok: true, size: { widthIn: 8.269, heightIn: 11.694 } });
    expect(ruleAtPrintTime).toContain('size: 8.269in 11.694in');
  });

  it('גודל שלא נקרא אינו מונע הדפסה — הוא מדווח', async () => {
    let printed = false;
    const outcome = await printDocument(null, { print: () => { printed = true; } });

    expect(printed).toBe(true);
    expect(outcome).toMatchObject({ ok: true, size: null });
    if (outcome.ok) expect(outcome.warning).toContain('גודל הדף');
  });

  it('גודל שלא נקרא נמדד מהעמוד המצויר — אחרת נדפס גיליון ריק על כל עמוד', async () => {
    // הכשל שנשאר אחרי התיקון המקורי: `@page { margin: 0 }` בלי `size` פירושו
    // הנייר של הדיאלוג (Letter, 1056px) מול תיבת עמוד A4 (1122.53px), ומסמך
    // של עמוד אחד יצא שני גיליונות. המנוע כאן אינו עונה (`host` = null), אבל
    // העמוד כן מצויר — ולכן יש מה למדוד.
    const root = document.implementation.createHTMLDocument('t');
    const page = root.createElement('div');
    page.className = ENGINE_PAGE_CLASS;
    Object.defineProperty(page, 'offsetWidth', { value: 794 });
    Object.defineProperty(page, 'offsetHeight', { value: 1123 });
    root.body.appendChild(page);

    let ruleAtPrintTime: string | null = null;
    const outcome = await printDocument(null, {
      root,
      print: () => {
        ruleAtPrintTime = root.getElementById(PRINT_PAGE_STYLE_ID)?.textContent ?? null;
      },
    });

    expect(ruleAtPrintTime).toBe('@page { size: 8.271in 11.698in; margin: 0; }');
    // ויש גודל, ולכן גם אין אזהרה: „בדקו את גודל הנייר” על הדפסה שגודל
    // הנייר שלה נכתב הוא הודעה שגויה.
    expect(outcome).toEqual({ ok: true, size: { widthIn: 8.271, heightIn: 11.698 } });
  });

  it('דיאלוג הדפסה חסום מחזיר תוצאה מטופסת ולא זריקה', async () => {
    // WebView בלי הרשאת הדפסה זורק, וחריגה במטפל הלחיצה משאירה את המשתמש
    // בלי שום סימן.
    const outcome = await printDocument(fakeHost(), {
      print: () => {
        throw new Error('printing is not allowed');
      },
    });

    expect(outcome).toMatchObject({ ok: false, reason: 'threw' });
    if (!outcome.ok) expect(outcome.message).toContain('printing is not allowed');
  });
});

describe('הכפתור מחובר למסלול הזה', () => {
  it('App.vue אינו קורא ל-window.print ישירות', () => {
    const app = readFileSync(join(process.cwd(), 'src/App.vue'), 'utf8');

    expect(app).toContain('printDocument(activeSuperdoc.value)');
    // ההערות מוסרות: התיעוד מסביר במפורש מה היה כאן קודם, וההסבר אינו קריאה.
    // אותה תבנית כמו tests/unit/engine-boundaries.test.ts.
    const code = app.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, '');
    expect(code.includes('window.print')).toBe(false);
  });

  it('אין קובץ אחר שמדפיס בעצמו', () => {
    // רקורסיבי: src/engine מכיל גם תת-תיקיות (shulchan/), וקריאת תיקייה
    // כקובץ זורקת EISDIR — כלומר הסריקה חייבת לרדת פנימה, לא לדלג.
    const engine = readdirSync(join(process.cwd(), 'src/engine'), {
      recursive: true,
      withFileTypes: true,
    });
    for (const entry of engine) {
      if (!entry.isFile() || entry.name === 'print.ts') continue;
      expect(
        readFileSync(join(entry.parentPath, entry.name), 'utf8').includes('window.print'),
        entry.name,
      ).toBe(false);
    }
  });
});

describe('exportPdfDocument', () => {
  /** מסמך נקי לכל בדיקה — `applyPrintPageSize` כותב לתוכו. */
  function fakeRoot(): Document {
    return document.implementation.createHTMLDocument('t');
  }

  it('מכינה את `@page` לפני הקריאה — אחרת ה-PDF יוצא בגודל נייר שגוי', async () => {
    const root = fakeRoot();
    const seen: string[] = [];
    const outcome = await exportPdfDocument(
      fakeHost(),
      async () => {
        // נקרא בזמן הקריאה עצמה, ולכן מוכיח שההכנה קדמה לה ולא באה אחריה.
        seen.push(root.getElementById(PRINT_PAGE_STYLE_ID)?.textContent ?? '');
        return { saved: true, name: 'x.pdf' };
      },
      { root },
    );

    expect(outcome).toMatchObject({ ok: true, saved: true, name: 'x.pdf' });
    expect(seen[0]).toBe(pageRule({ widthIn: 8.269, heightIn: 11.694 }));
  });

  it('מעבירה שם מוצע וכותרת, ומשמיטה אותם כשאינם', async () => {
    const withBoth: unknown[] = [];
    await exportPdfDocument(fakeHost(), async (input) => {
      withBoth.push(input);
      return { saved: true, name: 'a.pdf' };
    }, { root: fakeRoot(), fileName: 'ספר', title: 'ייצוא' });
    expect(withBoth[0]).toMatchObject({ fileName: 'ספר', title: 'ייצוא' });

    const bare: unknown[] = [];
    await exportPdfDocument(fakeHost(), async (input) => {
      bare.push(input);
      return { saved: true, name: 'a.pdf' };
    }, { root: fakeRoot() });
    expect(bare[0]).not.toHaveProperty('fileName');
    expect(bare[0]).not.toHaveProperty('title');
  });

  it('מוסרת לאוצריא את מידות הדף במ"מ, שוליים 0 ורקעים', async () => {
    const inputs: unknown[] = [];
    await exportPdfDocument(fakeHost(), async (input) => {
      inputs.push(input);
      return { saved: true, name: 'a.pdf' };
    }, { root: fakeRoot() });

    // fakeHost מחזיר 8.269×11.694 אינץ' (A4 אחרי ceilTo3); ההמרה מעוגלת
    // כלפי מעלה לשתי ספרות — אותו כיוון כמו האינצ'ים, מאותה סיבה.
    expect(inputs[0]).toMatchObject({
      pageSize: { widthMm: 210.04, heightMm: 297.03 },
      marginMm: 0,
      printBackgrounds: true,
    });
  });

  it('מידות ולא שם — גם ל-A4, כדי לא לסתור את ה-@page שהוזרק', async () => {
    // הגשר מקבל גם `pageSize: 'a4'`, וזה נראה מדויק יותר — אבל הוא 210×297
    // מ"מ, ותיבת העמוד שאותו קוד הזריק ל-@page היא 8.269in = 210.033 מ"מ.
    // נייר צר מהתיבה בשבריר הוא בדיוק מה שהעיגול כלפי מעלה נועד למנוע.
    const inputs: Array<Record<string, unknown>> = [];
    await exportPdfDocument(fakeHost(), async (input) => {
      inputs.push(input as Record<string, unknown>);
      return { saved: true, name: 'a.pdf' };
    }, { root: fakeRoot() });

    expect(typeof inputs[0].pageSize).toBe('object');
    const size = inputs[0].pageSize as { widthMm: number; heightMm: number };
    expect(size.widthMm).toBeGreaterThanOrEqual(8.269 * 25.4);
    expect(size.heightMm).toBeGreaterThanOrEqual(11.694 * 25.4);
  });

  it('דף לרוחב נמסר כמות שהוא, בלי להחליף רוחב וגובה', async () => {
    const inputs: unknown[] = [];
    await exportPdfDocument(
      fakeHost({ items: [{ pageSetup: { width: 11.694, height: 8.269 } }] }),
      async (input) => {
        inputs.push(input);
        return { saved: true, name: 'a.pdf' };
      },
      { root: fakeRoot() },
    );

    expect(inputs[0]).toMatchObject({ pageSize: { widthMm: 297.03, heightMm: 210.04 } });
  });

  it('`invalid_params` על גודל הדף — סבב שני בלעדיו, והייצוא מצליח באזהרה', async () => {
    // Host שאינו מכיר את צורת ה-pageSize שנשלחה. הדחייה שם קורית לפני
    // שנפתח דיאלוג, ולכן הניסיון החוזר אינו יכול לשמור קובץ פעמיים.
    const inputs: Array<Record<string, unknown>> = [];
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const outcome = await exportPdfDocument(
      fakeHost(),
      async (input) => {
        inputs.push(input as Record<string, unknown>);
        if ('pageSize' in input) {
          throw Object.assign(new Error('unknown pageSize'), {
            code: 'error.invalid_params',
          });
        }
        return { saved: true, name: 'a.pdf' };
      },
      { root: fakeRoot() },
    );

    expect(inputs).toHaveLength(2);
    expect(inputs[1]).not.toHaveProperty('pageSize');
    expect(inputs[1]).toMatchObject({ marginMm: 0, printBackgrounds: true });
    expect(outcome).toMatchObject({ ok: true, saved: true, name: 'a.pdf' });
    if (outcome.ok && outcome.saved) expect(outcome.warning).toContain('גודל הדף');
    warn.mockRestore();
  });

  it('`invalid_params` בלי גודל בכלל אינו מפעיל סבב שני', async () => {
    // אין `pageSize` בקריאה, ולכן הדחייה אינה עליו — ניסיון חוזר היה
    // מסתיים באותה דחייה ובקריאה מיותרת לאוצריא.
    const inputs: unknown[] = [];
    const outcome = await exportPdfDocument(
      fakeHost({ omitList: true }),
      async (input) => {
        inputs.push(input);
        throw Object.assign(new Error('bad fileName'), { code: 'error.invalid_params' });
      },
      { root: fakeRoot() },
    );

    expect(inputs).toHaveLength(1);
    expect(outcome).toMatchObject({ ok: false, reason: 'threw' });
  });

  it('גודל שלא נקרא — בלי pageSize, אבל שוליים ורקעים עדיין נמסרים', async () => {
    const inputs: unknown[] = [];
    await exportPdfDocument(fakeHost({ omitList: true }), async (input) => {
      inputs.push(input);
      return { saved: true, name: 'a.pdf' };
    }, { root: fakeRoot() });

    expect(inputs[0]).not.toHaveProperty('pageSize');
    expect(inputs[0]).toMatchObject({ marginMm: 0, printBackgrounds: true });
  });

  it('ביטול אינו כישלון — ואינו נושא שם', async () => {
    const outcome = await exportPdfDocument(
      fakeHost(),
      async () => ({ saved: false, name: null }),
      { root: fakeRoot() },
    );
    expect(outcome).toEqual({ ok: true, saved: false });
  });

  it('`forbidden` מקבל הסבר שאומר מה לעשות, ולא „הייצוא נכשל”', async () => {
    // שתי הצורות: אוצריא מחזירה `error.forbidden` בפועל (API_REFERENCE
    // §קודי שגיאה), והתיעוד מזכיר גם קודים בלי הקידומת. השוואה מדויקת
    // ל-`forbidden` הייתה מפספסת בדיוק את הצורה האמיתית.
    for (const code of ['forbidden', 'error.forbidden']) {
      const outcome = await exportPdfDocument(
        fakeHost(),
        async () => {
          throw Object.assign(new Error('user activation required'), { code });
        },
        { root: fakeRoot() },
      );
      expect(outcome, code).toEqual({
        ok: false,
        message: 'הייצוא ל-PDF דורש לחיצה ישירה על הכפתור — נסו שוב',
        reason: 'forbidden',
      });
    }
  });

  it('כשל אחר נושא את ההודעה של ה-Host', async () => {
    const outcome = await exportPdfDocument(
      fakeHost(),
      async () => {
        throw new Error('הדיסק מלא');
      },
      { root: fakeRoot() },
    );
    expect(outcome).toMatchObject({ ok: false, reason: 'threw' });
    expect((outcome as { message: string }).message).toContain('הדיסק מלא');
  });

  it('גודל דף שלא נקרא אינו עוצר את הייצוא — אבל נאמר עליו', async () => {
    const outcome = await exportPdfDocument(
      fakeHost({ omitList: true }),
      async () => ({ saved: true, name: 'b.pdf' }),
      { root: fakeRoot() },
    );
    expect(outcome).toMatchObject({ ok: true, saved: true, name: 'b.pdf', size: null });
    expect((outcome as { warning?: string }).warning).toBeTruthy();
  });

  it('גם הייצוא נופל על מדידת העמוד, ולא על נייר ברירת המחדל', async () => {
    // אוצריא מייצרת את ה-PDF מדף התוסף עצמו, ולכן `@page` בלי `size` מייצר
    // בו את אותו גיליון ריק על כל עמוד. שני המסלולים חייבים את שני המקורות.
    const root = fakeRoot();
    const page = root.createElement('div');
    page.className = ENGINE_PAGE_CLASS;
    Object.defineProperty(page, 'offsetWidth', { value: 816 });
    Object.defineProperty(page, 'offsetHeight', { value: 1056 });
    root.body.appendChild(page);

    const seen: string[] = [];
    const outcome = await exportPdfDocument(
      fakeHost({ omitList: true }),
      async () => {
        seen.push(root.getElementById(PRINT_PAGE_STYLE_ID)?.textContent ?? '');
        return { saved: true, name: 'b.pdf' };
      },
      { root },
    );

    // Letter: 816×1056 פיקסלים = 8.5×11 אינץ' בדיוק.
    expect(seen[0]).toBe('@page { size: 8.5in 11in; margin: 0; }');
    expect(outcome).toEqual({
      ok: true,
      saved: true,
      name: 'b.pdf',
      size: { widthIn: 8.5, heightIn: 11 },
    });
  });

  it('תשובה בלי שם עדיין נחשבת שמורה, עם נוסח שאינו „undefined”', async () => {
    const outcome = await exportPdfDocument(
      fakeHost(),
      async () => ({ saved: true }),
      { root: fakeRoot() },
    );
    expect(outcome).toMatchObject({ ok: true, saved: true, name: 'הקובץ' });
  });
});

describe('pdfSuggestedName', () => {
  it('מסירה תווים אסורים בשם קובץ', () => {
    expect(pdfSuggestedName('ספר/פרק:א*')).toBe('ספרפרקא');
  });

  it('שם ריק נופל לברירת מחדל', () => {
    expect(pdfSuggestedName('   ')).toBe('מסמך');
    expect(pdfSuggestedName('///')).toBe('מסמך');
  });

  it('אינה מוסיפה סיומת — אוצריא מוסיפה אותה ומחזירה את השם המלא', () => {
    expect(pdfSuggestedName('ספר')).toBe('ספר');
  });
});
