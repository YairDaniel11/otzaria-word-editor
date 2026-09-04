/**
 * שער התבניות — האם המסמך שנפתח הוא מה שהכרטיס הבטיח.
 *
 * ## למה זה לא `tests/unit/templates.test.ts`
 *
 * הבדיקה ההיא מודדת ש-`applyTemplate` **קוראת** לפונקציות הנכונות מול host
 * מזויף. זו טענה על הקוד שלנו, לא על המסמך: הקריאה יכולה להצליח והמנוע יכול
 * להתעלם, לדחות בשקט, או להחיל את מה שביקשנו על מקטע אחר. „שני טורים” אינו
 * `applyColumns(host, 2)` — הוא `<w:cols w:num="2">` ב-`sectPr` של המסמך
 * שנפתח, וכדי לראות אותו צריך מנוע DOCX אמיתי, workers אמיתיים, ו-`export`.
 *
 * ## מה נבדק, ומול מה
 *
 * החוזה הוא `TemplatePreview` ב-`src/engine/templates.ts` — מה שהכרטיס
 * **מצייר** למשתמש לפני שהוא לוחץ:
 *
 *   | שדה בתצוגה המקדימה | מה זה מחייב במסמך |
 *   |---|---|
 *   | `ratio: 'a4' \| 'a5'` | `<w:pgSz>` בדיוק לפי `PAPER_SIZES` |
 *   | `columns: 2`          | `<w:cols w:num="2">` |
 *   | `hasRunningHead`      | `<w:headerReference>` + חלק `word/header*.xml`, **וגם** `<w:pgNumType>` |
 *   | `hasTitleBlock`       | פסקאות שער, ואחריהן פסקה עם `<w:pageBreakBefore/>` |
 *   | `hasFootnoteBand`     | `<w:footnoteReference>` בגוף, והערה אמיתית ב-`word/footnotes.xml` |
 *
 * הצלע השנייה של כל מדידה היא **משטח הקריאה של המנוע** — אותן קריאות בדיוק
 * ש-`readPageLayoutState` ו-`readHeaderFooterState` עושות (`doc.sections.list()`,
 * `doc.headerFooters.resolve`). שתי צלעות ולא אחת, כי הן נכשלות אחרת: XML
 * שנכתב נכון ומצב מנוע שקורא לא-נכון הוא באג בממשק, וההפך הוא באג בייצוא.
 *
 * ## מופע חדש לכל תבנית, ולא חמש לחיצות ברצף
 *
 * „מסמך חדש מתבנית” עובר דרך `onNewDocument()`, ומסמך שהתבנית כבר שינתה הוא
 * מסמך מלוכלך — כלומר הלחיצה השנייה הייתה נופלת לתוך „לשמור לפני שנחליף?”
 * ומודדת את הדיאלוג הזה במקום את התבנית. חמישה מופעים עולים חמש עליות, וזה
 * המחיר של מדידה שאינה תלויה בסדר. אותו נימוק בדיוק כמו ה-`stage` ב-
 * `file-ops-qa.mjs`.
 *
 * ## ורדיקטים: מה מפיל ומה לא
 *
 * `fail` — הפרה של החוזה שאיש לא תיעד. אלה מפילים את הריצה (`strict`).
 * `partial` — פער שהמקור עצמו מתעד כידוע (`engine/templates.ts`, הנמקות 1–2:
 * אין `footnotes.insert` בלי סמן, ואין יישור פסקה בלי בחירה). הם **אינם**
 * מפילים, כי שער שאדום תמיד הוא שער שמלמדים להתעלם ממנו — אבל הם נדפסים
 * בסוף ברשימה נפרדת ומפורשת, כדי שאי אפשר יהיה לא לראות אותם.
 *
 *   node scripts/qa/templates-qa.mjs                 # כל החמש
 *   node scripts/qa/templates-qa.mjs two-column      # תבנית אחת או כמה
 *
 * יציאה 9386 בלבד — שערים מקבילים רצים על יציאות אחרות.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { openApp, createReport, sleep, ROOT } from './harness.mjs';

const PORT = Number(process.env.QA_PORT ?? 9386);
const TMP = join(ROOT, 'tmp');

const report = createReport('תבניות מסמך — מה באמת נפתח', { strict: true });

/** כל מה שנמדד, כדי שהדוח יוכל להראות מספרים ולא רק ✓/✗. */
const evidence = [];
/** פערים שהמקור מתעד כידועים — נדפסים בנפרד בסוף. */
const knownGaps = [];

/* ------------------------------------------------------------------ */
/* החוזה, כפי שהוא כתוב ב-src/engine/templates.ts                      */
/* ------------------------------------------------------------------ */

/**
 * מראה של `DOCUMENT_TEMPLATES`. הוא **מאומת מול הדף**: קבוצת התוויות שנמדדת
 * ב-`.tpl-label` חייבת להיות שווה לקבוצה כאן, אחרת השער נופל לפני שהוא מודד
 * דבר. בלי האימות הזה, תבנית שנוספה או שונתה הייתה עוברת בשקט מתחת לשער.
 *
 * `paper` ב-twips, כמו `PAPER_SIZES`; `margins` באינצ'ים, כמו שהמנוע קורא
 * אותם ב-`sections.list()` (ראו הערת היחידות ב-page-setup.ts).
 */
const PAPER = {
  a4: { w: 11906, h: 16838, label: 'A4' },
  a5: { w: 8391, h: 11906, label: 'A5' },
};

/** ה-presets של page-setup.ts, בטwips שהם מוגדרים בהם, מומרים לאינצ'ים. */
const MARGINS = {
  /** מה שהמסמך הריק של המנוע נושא, ו-document-defaults.ts אינו נוגע בו. */
  engineDefault: { top: 1, right: 1, bottom: 1, left: 1, label: 'ברירת המנוע (2.54 מכל צד)' },
  /**
   * אותם מספרים כמו `engineDefault`, ובכל זאת ערך נפרד: `two-column` **קוראת**
   * ל-`applyMarginPreset(host, 'normal')`, והשלוש האחרות אינן קוראות כלל. שורה
   * שתאמר „ברירת המנוע” על תבנית שמחילה preset הייתה מסתירה בדיוק את הכשל
   * שבו הקריאה נבלעת — הערכים היו נראים נכונים כי הם ממילא היו שם.
   */
  normal: { top: 1, right: 1, bottom: 1, left: 1, label: 'רגיל (2.54 מכל צד)' },
  narrow: { top: 0.5, right: 0.5, bottom: 0.5, left: 0.5, label: 'צר (1.27 מכל צד)' },
};

/**
 * רעש סביבה, ולא כשל של התבנית.
 *
 * שלוש המשפחות שאחרי הרעש הכללי הן **הדמה**, לא המוצר: `scripts/qa/host-stub.js`
 * אינו מממש `reader.addContextMenuItem`, אינו מאשר את ההרשאה ל-`fonts.listInstalled`,
 * ואינו מממש `fs.writeFile` — ולכן טיוטת הסשן (`host/workspace.ts`) מדווחת
 * „כתיבה למרחב הפרטי נכשלה” בכל מסמך שהתבנית שינתה. שלושתן היו נעלמות מול
 * המאחז האמיתי, וכשל שלהן הוא כשל של סביבת המדידה.
 *
 * האחרונה היא הודעת פריסה של המנוע (`current unpainted target reached …ms
 * (limit 1000ms)`) — שעון קצוב שנשבר ב-headless על מכונה עמוסה. אותה תופעת
 * הרעבה בדיוק מתועדת ב-`scripts/cdp.mjs` (ההערה על ארבעת הדגלים), ושם גם
 * נמדד שהיא **אינה** נגרמת מקוד שלנו. היא נשמרת ב-`noise` שבראיות ואינה
 * נמחקת — רק אינה נספרת כטענה על התבנית.
 */
const NOISE = [
  /Autofocus processing was blocked/i,
  /favicon/i,
  /Failed to load resource/i,
  /reader\.addContextMenuItem/,
  /fonts\.listInstalled/,
  /למרחב הפרטי נכשלה/,
  /unpainted target reached/,
];

const TEMPLATES = [
  {
    id: 'blank',
    label: 'מסמך ריק',
    preview: { columns: 1, hasTitleBlock: false, hasRunningHead: false, hasFootnoteBand: false, ratio: 'a4' },
    margins: MARGINS.engineDefault,
    /** כמה פסקאות התבנית כותבת. המסמך הריק נפתח עם אחת. */
    minBlocks: 1,
    bodyTexts: [],
  },
  {
    id: 'two-column',
    label: 'ספר קודש — שני טורים',
    preview: { columns: 2, hasTitleBlock: false, hasRunningHead: true, hasFootnoteBand: false, ratio: 'a4' },
    margins: MARGINS.normal,
    minBlocks: 1,
    bodyTexts: [],
    /**
     * `rtlColumnNote` — ההודעה שמגיעה **אחרי** הפעולה כ-`note` ב-
     * `CommandOutcome`, ו-`onOpenDialogCreate` שם אותה בשורת המצב. היא נבדקת
     * ולא מתעלמים ממנה: היא ההבדל בין „הטורים הפוכים והמשתמש יודע” לבין
     * „הטורים הפוכים בשקט”.
     */
    expectStatusNote: /העמודה הראשונה מצוירת בצד שמאל/,
  },
  {
    id: 'annotated',
    label: 'מהדורה מבוארת',
    preview: { columns: 1, hasTitleBlock: false, hasRunningHead: true, hasFootnoteBand: true, ratio: 'a4' },
    margins: MARGINS.engineDefault,
    minBlocks: 2,
    // פסקה אחת בגוף. הביאור אינו פסקה שנייה אלא הערת שוליים אמיתית —
    // ראו `footnoteTexts` ואת `writeAnnotatedContent` ב-engine/templates.ts.
    bodyTexts: ['כאן מתחיל גוף הטקסט'],
    footnoteTexts: ['כאן יתחיל הביאור'],
    /** `ANNOTATED_BODY_FONT_PT` = 14 → 28 חצאי-נקודות ב-`docDefaults`. */
    docDefaultHalfPoints: 28,
  },
  {
    id: 'title-page',
    label: 'מסמך עם דף שער',
    preview: { columns: 1, hasTitleBlock: true, hasRunningHead: false, hasFootnoteBand: false, ratio: 'a4' },
    margins: MARGINS.engineDefault,
    minBlocks: 4,
    bodyTexts: ['שם הספר', 'שם המחבר', 'השנה'],
  },
  {
    id: 'kuntres-a5',
    label: 'קונטרס A5',
    preview: { columns: 1, hasTitleBlock: false, hasRunningHead: true, hasFootnoteBand: false, ratio: 'a5' },
    margins: MARGINS.narrow,
    minBlocks: 1,
    bodyTexts: [],
  },
];

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const wanted = TEMPLATES.filter((t) => only.length === 0 || only.includes(t.id));

/* ------------------------------------------------------------------ */
/* קוראי OOXML — מינימליים, ורק על מה שהחוזה נוקב בו                   */
/* ------------------------------------------------------------------ */

/** ה-sectPr האחרון בגוף המסמך: שם יושבות ההגדרות של מסמך חד-מקטעי. */
function lastSectPr(files) {
  const doc = files?.['word/document.xml'] ?? '';
  const all = [];
  const re = /<w:sectPr\b[\s\S]*?<\/w:sectPr>|<w:sectPr\b[^>]*\/>/g;
  let m;
  while ((m = re.exec(doc)) !== null) all.push(m[0]);
  return all.length ? all[all.length - 1] : '';
}

/** האלמנט המבוקש כמחרוזת גולמית. אותה צורה כמו ב-layout-qa.mjs. */
function el(xml, tag) {
  const re = new RegExp(`<w:${tag}\\b[^>]*\\/>|<w:${tag}\\b[^>]*>[\\s\\S]*?<\\/w:${tag}>`);
  const m = re.exec(xml ?? '');
  return m ? m[0] : '';
}

function attrs(xml) {
  const out = {};
  const re = /w:([A-Za-z]+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(xml ?? '')) !== null) out[m[1]] = m[2];
  return out;
}

/**
 * הפסקאות בגוף המסמך, עם הטקסט שלהן והאם הן פותחות עמוד.
 *
 * `<w:p(?=[ >/])` ולא `<w:p` לבדו — אחרת `<w:pPr` ו-`<w:pgSz>` נספרים כפסקאות.
 */
function paragraphs(files) {
  const doc = files?.['word/document.xml'] ?? '';
  const start = doc.indexOf('<w:body');
  const end = doc.lastIndexOf('</w:body>');
  const body = start >= 0 && end > start ? doc.slice(start, end) : doc;
  const out = [];
  const re = /<w:p(?=[ >/])[^>]*\/>|<w:p(?=[ >/])[^>]*>[\s\S]*?<\/w:p>/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const xml = m[0];
    const text = Array.from(xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g))
      .map((t) => t[1])
      .join('');
    out.push({
      text,
      // `w:val="0"`/`"false"` הוא ביטול מפורש של הדגל, לא הצהרה עליו.
      pageBreakBefore: /<w:pageBreakBefore\b(?![^>]*w:val="(?:0|false)")/.test(xml),
      // היישור נקרא מה-`pPr` של הפסקה עצמה — ראו בדיקת הריכוז בדף השער.
      jc: attrs(el(el(xml, 'pPr'), 'jc')).val ?? null,
    });
  }
  return out;
}

/**
 * הערות שוליים אמיתיות. `w:id` 0 ו-‎-1 הם המפריד וההמשך שכל docx נושא, ואינם
 * הערה של אף אחד — ספירה שכוללת אותם הייתה מדווחת „יש הערות” על מסמך ריק.
 */
function realFootnotes(files) {
  const xml = files?.['word/footnotes.xml'];
  if (typeof xml !== 'string') return { part: false, count: 0, texts: [] };
  const notes = Array.from(xml.matchAll(/<w:footnote\b([^>]*)>([\s\S]*?)<\/w:footnote>/g))
    .map(([, head, inner]) => ({ id: Number(attrs(head).id), inner }))
    .filter((n) => Number.isFinite(n.id) && n.id > 0);
  return {
    part: true,
    count: notes.length,
    texts: notes.map((n) =>
      Array.from(n.inner.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g))
        .map((t) => t[1])
        .join(''),
    ),
  };
}

/**
 * מה יש **בתוך** הכותרות והכותרות התחתונות, ולא רק שהן קיימות.
 *
 * `<w:pgNumType>` מצהיר על **הפורמט** של מספר העמוד; מה שמדפיס מספר הוא שדה
 * `PAGE` בתוך כותרת (`engine/fields.ts`, `pageNumber: 'PAGE'`). זו הבחנה שאי
 * אפשר לראות מה-`sectPr` לבדו, והיא ההבדל בין „הכותרת מוגדרת” ל„משהו יודפס”.
 */
function headerFooterBodies(files) {
  return Object.keys(files ?? {})
    .filter((p) => /^word\/(header|footer)\d*\.xml$/.test(p))
    .map((path) => {
      const xml = files[path] ?? '';
      return {
        path,
        text: Array.from(xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g))
          .map((t) => t[1])
          .join(''),
        // שתי הצורות של שדה ב-OOXML: `fldSimple` ו-`instrText` בתוך ריצה.
        hasPageField: /<w:instrText[^>]*>[^<]*\bPAGE\b/.test(xml) || /w:instr="[^"]*\bPAGE\b/.test(xml),
      };
    });
}

/** כל מה שנקרא מה-docx במקום אחד, כדי שהדוח יראה את אותם מספרים שהטענות ראו. */
function readDocx(files) {
  const doc = files?.['word/document.xml'] ?? '';
  const sect = lastSectPr(files);
  const pgSz = attrs(el(sect, 'pgSz'));
  const pgMar = attrs(el(sect, 'pgMar'));
  const cols = attrs(el(sect, 'cols'));
  const headerRefs = Array.from(sect.matchAll(/<w:headerReference\b[^>]*\/>/g)).map((m) => m[0]);
  const parts = Object.keys(files ?? {});
  return {
    sect,
    pgSz: { w: Number(pgSz.w), h: Number(pgSz.h), code: pgSz.code ?? null },
    pgMar: {
      top: Number(pgMar.top),
      right: Number(pgMar.right),
      bottom: Number(pgMar.bottom),
      left: Number(pgMar.left),
    },
    columns: cols.num === undefined ? 1 : Number(cols.num),
    colsXml: el(sect, 'cols') || '(אין w:cols)',
    headerRefs,
    headerParts: parts.filter((p) => /^word\/header\d*\.xml$/.test(p)),
    footerParts: parts.filter((p) => /^word\/footer\d*\.xml$/.test(p)),
    bodies: headerFooterBodies(files),
    pgNumType: el(sect, 'pgNumType'),
    pgNumAttrs: attrs(el(sect, 'pgNumType')),
    bidi: /<w:bidi\b(?![^>]*w:val="(?:0|false)")/.test(sect),
    paragraphs: paragraphs(files),
    footnoteRefs: (doc.match(/<w:footnoteReference\b/g) ?? []).length,
    footnotes: realFootnotes(files),
    docDefaultSize: Number(
      attrs(el(el(files?.['word/styles.xml'] ?? '', 'rPrDefault'), 'sz')).val ?? NaN,
    ),
  };
}

/* ------------------------------------------------------------------ */
/* משטח הקריאה של המנוע — אותן קריאות כמו readPageLayoutState/readHeaderFooterState */
/* ------------------------------------------------------------------ */

const ENGINE_STATE = `(async () => {
  const sd = window.__otzariaEditor && window.__otzariaEditor.superdoc;
  const doc = sd && sd.activeEditor && sd.activeEditor.doc;
  if (!doc) return { error: 'אין doc — המסמך עדיין נטען' };
  const out = { error: null };
  try {
    const listed = await doc.sections.list();
    const items = (listed && listed.items) || [];
    out.sectionCount = items.length;
    const first = items[0] || null;
    if (first) {
      out.pageSetup = first.pageSetup || null;
      out.margins = first.margins || null;
      out.sectionDirection = first.sectionDirection || null;
      out.pageNumbering = first.pageNumbering || null;
      const resolve = doc.headerFooters && doc.headerFooters.resolve;
      if (typeof resolve === 'function') {
        for (const kind of ['header', 'footer']) {
          try {
            const r = await resolve({
              target: { kind: 'headerFooterSlot', section: first.address, headerFooterKind: kind, variant: 'default' },
            });
            out[kind + 'Status'] = (r && r.status) || null;
          } catch (e) { out[kind + 'Status'] = 'threw: ' + String(e && e.message || e); }
        }
      }
    }
  } catch (e) { out.error = String(e && e.message || e); }
  try {
    const blocks = await doc.blocks.list();
    out.blockCount = ((blocks && blocks.blocks) || []).length;
  } catch (e) { out.blockCount = null; }
  return out;
})()`;

/* ------------------------------------------------------------------ */
/* פתיחת התבנית                                                        */
/* ------------------------------------------------------------------ */

const OPEN_DIALOG_MS = 40_000;
const SETTLE_MS = 60_000;

/**
 * דוחפים Ctrl+O עד שהדיאלוג נפתח, ולא פעם אחת.
 *
 * `openOpenDialog` יוצא מיד כש-`isOpenBusy()` — התנהגות מכוונת: אין לפתוח
 * „פתח מסמך” בזמן שמסמך נטען לתוך אותו טאב. המצב הזה נמשך שניות בעלייה
 * (נמדד ב-`scripts/open-dialog-probe.mjs`), ובדיקה שדוחפת פעם אחת מודדת את
 * המשמר במקום את הדיאלוג. `isOpening` אינו חשוף ל-DOM, ולכן ההמתנה היא על
 * התוצאה — וזה גם מה שמשתמש עושה.
 */
async function openDialog(app) {
  const deadline = Date.now() + OPEN_DIALOG_MS;
  let real = 0;
  for (;;) {
    // מקש אמיתי דרך CDP, ולא `dispatchEvent`: זה המסלול שהמשתמש עובר בו.
    // 2 = Ctrl ב-`Input.dispatchKeyEvent`.
    if (real < 4) {
      await app.press('o', 'KeyO', 79, 2);
      real += 1;
    } else {
      // נפילה אחורה, כדי שכשל בקיצור לא ימחק את מדידת התבניות עצמן. אם זה
      // מה שפתח — הדוח אומר זאת, ולא מסתיר.
      await app.js(
        "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', code: 'KeyO', ctrlKey: true, bubbles: true }))",
      );
    }
    await sleep(400);
    if (await app.js("!!document.querySelector('.open-dialog')")) {
      return { opened: true, viaSynthetic: real >= 4 };
    }
    if (Date.now() > deadline) return { opened: false, viaSynthetic: real >= 4 };
  }
}

/** התוויות שבדף, כדי לאמת שהמראה כאן עדיין תואם את `DOCUMENT_TEMPLATES`. */
const CARD_LABELS = `(() => Array.from(document.querySelectorAll('.tpl-card')).map((c) => {
  const label = c.querySelector('.tpl-label');
  return { label: label ? label.textContent.trim() : null, disabled: c.disabled };
}))()`;

/**
 * הכרטיס **לפי התווית**, לא לפי אינדקס: שינוי סדר בכרטיסים אינו אמור להפוך
 * את השער לשקרן שמודד תבנית אחת ומדווח על אחרת.
 */
function cardRect(label) {
  return `(() => {
    const card = Array.from(document.querySelectorAll('.tpl-card')).find((c) => {
      const el = c.querySelector('.tpl-label');
      return el && el.textContent.trim() === ${JSON.stringify(label)};
    });
    if (!card) return null;
    const r = card.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), disabled: card.disabled };
  })()`;
}

/**
 * הגיליון על המסך, נקרא **בנפרד ממצב המנוע ומאוחר ממנו**.
 *
 * הקריאה המשותפת החזירה `null` תמיד: המקטע כבר מדווח את הגודל החדש בזמן
 * שהמנוע עדיין פורס, ואז אין אף עמוד ב-DOM. הפרדת הקריאה היא ההבדל בין „לא
 * מדדנו” ל„אין עמוד” — ושתי המילים האלה מתארות שני מצבים שונים לגמרי.
 */
const PAGE_PX = `(() => {
  const pages = document.querySelectorAll('.superdoc-page');
  if (!pages.length) return null;
  const r = pages[0].getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height), count: pages.length };
})()`;

/**
 * האם מצב המנוע כבר הגיע למה שהתבנית מבטיחה.
 *
 * זו תנאי **ההמתנה**, לא הטענה: הטענות נבדקות על הקריאה האחרונה בכל מקרה,
 * וכשהן נכשלות הן קיבלו את מלוא התקציב. בלי התנאי הזה השער היה מודד בין
 * שלב לשלב של `applyTemplate` ומדווח „לא הוחל” על מה שהוחל שנייה אחר כך.
 */
function engineSettled(t, state) {
  if (!state || state.error || !state.pageSetup) return false;
  const paper = PAPER[t.preview.ratio];
  const near = (value, inches) => typeof value === 'number' && Math.abs(value - inches) < 0.02;
  if (!near(state.pageSetup.width, paper.w / 1440)) return false;
  if (!near(state.margins?.left, t.margins.left) || !near(state.margins?.top, t.margins.top)) return false;
  // הכיווניות העברית מגיעה מ-document-defaults.ts על כל מסמך חדש, ולא
  // מהתבנית — ובכל זאת היא בתנאי ההמתנה: בלעדיה נמדד ✗ על „המקטע עברי”
  // בתבנית `blank`, שאין לה שום שלב להמתין לו, והקריאה הקדימה את המנוע.
  if (state.sectionDirection !== 'rtl') return false;
  const hasHeader = state.headerStatus === 'explicit' || state.headerStatus === 'inherited';
  if (t.preview.hasRunningHead && !hasHeader) return false;
  if (t.preview.hasRunningHead && !state.pageNumbering?.format) return false;
  if (typeof state.blockCount === 'number' && state.blockCount < t.minBlocks) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* הטענות                                                              */
/* ------------------------------------------------------------------ */

function claim(t, name, ok, detail) {
  const row = `${t.label} — ${name}`;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
  ok ? report.pass(row, detail) : report.fail(row, detail);
  return ok;
}

/** פער שהמקור מתעד. נדפס, נספר, ואינו מפיל — ראו הערת הפתיחה. */
function documentedGap(t, name, detail, source) {
  const row = `${t.label} — ${name}`;
  console.log(`  ~ ${name} — ${detail}`);
  report.partial(row, `${detail} [מתועד: ${source}]`);
  knownGaps.push({ template: t.label, name, detail, source });
}

/* ------------------------------------------------------------------ */

mkdirSync(TMP, { recursive: true });

for (const t of wanted) {
  console.log(`\n────── ${t.label} (${t.id}) ──────`);
  let app = null;
  const measured = { id: t.id, label: t.label, preview: t.preview };
  try {
    app = await openApp({ name: `tpl-${t.id}`, port: PORT });
    await app.cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1600,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(400);

    /*
     * תיוג המופע לפני הלחיצה, כדי לזהות את ההחלפה.
     *
     * `openDocument()` **מחליף** את מופע SuperDoc ואינו מנקה את הקיים — זה
     * מה שנמדד ומתועד ב-`sessions/editor-swap.ts` וב-`engine/page-break.ts`,
     * ובאותה דרך בדיוק (תיוג `window.__otzariaEditor.superdoc` לפני, ובדיקה
     * אחרי). בלי זה השער היה מודד את המסמך **הקודם** ומדווח שהתבנית לא הוחלה.
     */
    await app.js('window.__tplBefore = (window.__otzariaEditor || {}).superdoc || null; 1');

    /*
     * ממתינים שמסמך הפתיחה **יצויר**, ורק אז פותחים את הדיאלוג.
     *
     * `__qa.ready()` אומר שהמעטפת קמה ושיש `__otzariaEditor` — הוא **אינו**
     * אומר שהעימוד הראשון הסתיים. נמדד ש-Ctrl+O מתקבל כבר בחלון הזה
     * (`isOpenBusy()` אינו חוסם אותו), ושהמסמך שנפתח אז אינו מצויר כלל: אפס
     * `.superdoc-page` לאורך 60 שניות. אותה תבנית בדיוק, אחרי המתנה לציור,
     * נפרסת כרגיל.
     *
     * ההמתנה כאן היא כדי שהשער ימדוד **את התבנית** ולא את המרוץ: בלעדיה אותה
     * שורה מתהפכת בין ריצות. המרוץ עצמו אינו נמחק — הוא מתועד כממצא נפרד
     * ב-`docs/templates-qa-findings.md`, עם השחזור שלו.
     */
    let bootPainted = false;
    for (let waited = 0; waited < 60_000; waited += 1_000) {
      if ((await app.js("document.querySelectorAll('.superdoc-page').length")) > 0) {
        bootPainted = true;
        break;
      }
      await sleep(1_000);
    }
    measured.bootPainted = bootPainted;
    if (!bootPainted) console.log('  ⚠ מסמך הפתיחה לא צויר תוך 60 שניות — המדידה שלמטה עלולה למדוד את המרוץ');

    const opened = await openDialog(app);
    if (!claim(t, 'הדיאלוג „פתח מסמך” נפתח', opened.opened, opened.viaSynthetic ? 'נפתח דרך אירוע מסונתז, לא דרך מקש אמיתי' : 'Ctrl+O')) {
      continue;
    }

    const cards = await app.js(CARD_LABELS).then((r) => (typeof r === 'string' ? JSON.parse(r) : r));
    measured.cards = cards;
    const labels = (cards ?? []).map((c) => c.label);
    claim(
      t,
      'התווית בכרטיס היא זו שבמקור',
      labels.includes(t.label),
      labels.includes(t.label)
        ? `„${t.label}”`
        : `המקור אומר „${t.label}”, ובדף יש: ${labels.join(' | ')}`,
    );

    /*
     * הזהות היא התווית שבמקור, ואין רשימת שמות חלופיים.
     *
     * הייתה כזו, ונמחקה: ה-`dist` שנמדד תחילה נשא תווית ישנה („דף שער + גוף”)
     * מפני שהוא נבנה לפני עריכה ב-`templates.ts`, והרשימה אפשרה למדוד בכל
     * זאת. ברגע שה-`dist` נבנה מחדש היא הפכה להיתר קבוע — „התווית היא אחת
     * משתיים” — כלומר בדיוק הריכוך שהופך שער לחסר ערך. `dist` ישן הוא מצב
     * שמתקנים בבנייה, לא מצב שמלמדים את השער לחיות איתו.
     */
    const rect = labels.includes(t.label) ? await app.js(cardRect(t.label)) : null;
    if (!rect) {
      claim(
        t,
        'לכרטיס יש מלבן שאפשר ללחוץ עליו',
        false,
        `„${t.label}” לא נמצא בדף. אם ה-dist ישן מהמקור — הריצו npm run build`,
      );
      continue;
    }
    if (rect.disabled) {
      claim(t, 'הכרטיס אינו מנוטרל', false, 'הכפתור disabled — הדיאלוג נפתח בזמן פתיחה');
      continue;
    }

    await app.clickAt(rect.x, rect.y);

    // ההחלפה, ואז ההתייצבות. שני שעונים נפרדים: „לא נפתח מסמך חדש” ו„נפתח
    // אבל התבנית לא הוחלה” הם שני כשלים שונים ואסור שיתערבבו לאחד.
    let swapped = false;
    for (let waited = 0; waited < SETTLE_MS; waited += 500) {
      await sleep(500);
      swapped = await app.js(
        '!!(window.__otzariaEditor && window.__otzariaEditor.superdoc) && window.__otzariaEditor.superdoc !== window.__tplBefore',
      );
      if (swapped) break;
    }
    if (!claim(t, 'הלחיצה פתחה מסמך חדש', swapped, 'מופע SuperDoc הוחלף')) continue;

    let state = null;
    let settled = false;
    for (let waited = 0; waited < SETTLE_MS; waited += 1_000) {
      state = await app.js(ENGINE_STATE);
      if (engineSettled(t, state)) {
        settled = true;
        break;
      }
      await sleep(1_000);
    }
    measured.engine = state;
    measured.settled = settled;
    console.log(`  מצב המנוע${settled ? '' : ' (לא התייצב בתוך התקציב)'}: ${JSON.stringify(state)}`);

    /*
     * שתי קריאות ולא אחת, במרווח.
     *
     * זו אינה זהירות: נמדד (ציר זמן של 60 שניות על „שני טורים”) שהעמוד
     * **מופיע ואז נעלם** — 0 עמודים עד t=10s, עמוד אחד ב-t=15s וב-t=20s,
     * ומ-t=25s ואילך שוב אפס, לצמיתות. קריאה יחידה הייתה נופלת אקראית על
     * אחד משני המצבים ומדווחת פעם „עובד” ופעם „שבור” על אותו קוד בדיוק.
     * הטענה נקבעת לפי הקריאה המאוחרת — המצב שהמשתמש נשאר איתו — והמוקדמת
     * נשמרת כדי שההבדל ביניהן ייראה בדוח.
     */
    await sleep(3_000);
    const pageEarly = await app.js(PAGE_PX);
    await sleep(12_000);
    const pagePx = await app.js(PAGE_PX);
    measured.pagePx = pagePx;
    measured.pagePxEarly = pageEarly;
    const show = (p) => (p ? `${p.w}×${p.h}px, ${p.count} עמודים` : 'אין .superdoc-page');
    console.log(`  הגיליון על המסך: ${show(pagePx)} (ב-+3 שניות: ${show(pageEarly)})`);

    const shot = await app.cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(TMP, `template-${t.id}.png`), Buffer.from(shot.result.data, 'base64'));
    console.log(`  📸 tmp/template-${t.id}.png`);

    const files = await app.docx();
    if (!files) {
      claim(t, 'המסמך ניתן לייצוא ל-docx', false, 'export החזיר null');
      continue;
    }
    const x = readDocx(files);
    measured.docx = {
      pgSz: x.pgSz,
      pgMar: x.pgMar,
      columns: x.columns,
      colsXml: x.colsXml,
      headerRefs: x.headerRefs,
      headerParts: x.headerParts,
      pgNumType: x.pgNumType || '(אין)',
      bodies: x.bodies,
      bidi: x.bidi,
      paragraphs: x.paragraphs,
      footnoteRefs: x.footnoteRefs,
      footnotes: x.footnotes,
      docDefaultSize: x.docDefaultSize,
    };
    console.log(`  sectPr: ${el(x.sect, 'pgSz')} ${el(x.sect, 'pgMar')} ${x.colsXml} ${x.pgNumType || ''}`);
    console.log(`  פסקאות: ${JSON.stringify(x.paragraphs)}`);

    /* --- 1. גודל העמוד --- */
    const paper = PAPER[t.preview.ratio];
    const sizeOk = x.pgSz.w === paper.w && x.pgSz.h === paper.h;
    claim(
      t,
      `גודל העמוד ${paper.label} (ratio: '${t.preview.ratio}')`,
      sizeOk,
      `נמדד ${x.pgSz.w}×${x.pgSz.h} twips, מובטח ${paper.w}×${paper.h}` +
        (x.pgSz.code ? `, w:code=${x.pgSz.code}` : ''),
    );
    // הצלע השנייה: מה שהמנוע מדווח לממשק, ולא מה שנכתב לקובץ.
    const engineInches = state?.pageSetup?.width;
    claim(
      t,
      'המנוע מדווח לממשק את אותו גודל',
      typeof engineInches === 'number' && Math.abs(engineInches - paper.w / 1440) < 0.02,
      `sections.list() → ${engineInches}" (מובטח ${(paper.w / 1440).toFixed(3)}")`,
    );

    /* --- 2. טורים --- */
    claim(
      t,
      `${t.preview.columns} טורים (columns: ${t.preview.columns})`,
      x.columns === t.preview.columns,
      `נמדד w:num=${x.columns} — ${x.colsXml}`,
    );

    /* --- 3. כותרת רצה --- */
    const hasHeaderRef = x.headerRefs.length > 0;
    const hasHeaderPart = x.headerParts.length > 0;
    const engineHeader = state?.headerStatus === 'explicit' || state?.headerStatus === 'inherited';
    if (t.preview.hasRunningHead) {
      claim(
        t,
        'יש כותרת רצה (hasRunningHead: true)',
        hasHeaderRef && hasHeaderPart && engineHeader,
        `headerReference: ${x.headerRefs.length}, חלקים: ${x.headerParts.join(', ') || 'אין'}, ` +
          `resolve: ${state?.headerStatus ?? 'לא נקרא'}`,
      );
      /* --- 4. מספור עמודים: הפורמט, ואז מה שבאמת יודפס --- */
      claim(
        t,
        'מוצהר פורמט מספור עמודים',
        !!x.pgNumType && x.pgNumAttrs.fmt === 'decimal',
        `${x.pgNumType || 'אין <w:pgNumType>'} | המנוע: ${JSON.stringify(state?.pageNumbering ?? null)}`,
      );
      claim(
        t,
        'מספר עמוד יודפס בפועל (שדה PAGE בכותרת)',
        x.bodies.some((b) => b.hasPageField),
        `חלקי כותרת: ${JSON.stringify(x.bodies)}`,
      );
      /*
       * כותרת ריקה — `ensureHeaderFooter` יוצרת חלק בלי תוכן, וזה מתועד
       * במפורש ב-`engine/header-footer.ts` („אין שום טקסט שנכון לשתול במסמך
       * של מישהו אחר”). לכן פער מתועד ולא כשל — אבל הוא נרשם, כי הכרטיס
       * מצייר פס דיו בכותרת ולא כותרת ריקה.
       */
      if (x.bodies.every((b) => b.text.trim() === '')) {
        documentedGap(
          t,
          'הכותרת הרצה ריקה',
          `הכרטיס מצייר טקסט בכותרת; החלקים שנוצרו הם ${JSON.stringify(x.bodies.map((b) => b.path))} וכולם ריקים`,
          'engine/header-footer.ts, ensureHeaderFooter',
        );
      }
    } else {
      claim(
        t,
        'אין כותרת רצה (hasRunningHead: false)',
        !hasHeaderRef && !engineHeader,
        `headerReference: ${x.headerRefs.length}, resolve: ${state?.headerStatus ?? 'לא נקרא'}`,
      );
      claim(
        t,
        'אין מספור עמודים',
        !x.pgNumType,
        x.pgNumType || 'אין <w:pgNumType>',
      );
    }

    /* --- 5. עמוד שער --- */
    const texts = x.paragraphs.map((p) => p.text);
    const breakIndex = x.paragraphs.findIndex((p) => p.pageBreakBefore);
    if (t.preview.hasTitleBlock) {
      const titleTexts = t.bodyTexts;
      const hasTitleTexts = titleTexts.every((want, i) => texts[i] === want);
      claim(
        t,
        'יש עמוד שער (hasTitleBlock: true)',
        hasTitleTexts && breakIndex === titleTexts.length,
        `פסקאות: ${JSON.stringify(texts)}; pageBreakBefore בפסקה ${breakIndex} ` +
          `(מובטח ${titleTexts.length} — הפסקה שאחרי השער)`,
      );
      /*
       * הריכוז — הנמקה 2 ב-engine/templates.ts: יישור פסקה עובר תמיד דרך
       * `ui.commands`, שמנותב לפי הבחירה הנוכחית, ובמסמך טרי אין סמן.
       */
      const centered = x.paragraphs.slice(0, titleTexts.length).every((p) => p.jc === 'center');
      if (!centered) {
        documentedGap(
          t,
          'טקסט השער אינו ממורכז',
          'שלוש פסקאות השער נכתבות בלי <w:jc w:val="center">',
          'engine/templates.ts, הנמקה 2',
        );
      }
    } else {
      claim(
        t,
        'אין מעבר עמוד מאולץ (hasTitleBlock: false)',
        breakIndex === -1,
        breakIndex === -1 ? 'אין pageBreakBefore' : `pageBreakBefore בפסקה ${breakIndex}`,
      );
    }

    /* --- 6. הערות שוליים --- */
    if (t.preview.hasFootnoteBand) {
      const real = x.footnoteRefs > 0 && x.footnotes.count > 0;
      if (real) {
        claim(
          t,
          'הביאור בהערות שוליים (hasFootnoteBand: true)',
          true,
          `${x.footnoteRefs} הפניות, ${x.footnotes.count} הערות: ${JSON.stringify(x.footnotes.texts)}`,
        );
        // קיום ההערה אינו מספיק: הכרטיס מבטיח **ביאור**, ולכן נבדק גם מה
        // כתוב בה. הערה ריקה הייתה עוברת את הטענה שמעל.
        if (t.footnoteTexts?.length) {
          claim(
            t,
            'תוכן הערת השוליים הוא הביאור שהתבנית מבטיחה',
            t.footnoteTexts.every((want) => x.footnotes.texts.some((got) => got.includes(want))),
            `נמדד ${JSON.stringify(x.footnotes.texts)}, מובטח ${JSON.stringify(t.footnoteTexts)}`,
          );
        }
      } else {
        documentedGap(
          t,
          'הביאור אינו בהערות שוליים',
          `הכרטיס מבטיח hasFootnoteBand: true; נמדד ${x.footnoteRefs} <w:footnoteReference> ו-` +
            `${x.footnotes.count} הערות אמיתיות ב-footnotes.xml. הביאור נכתב כפסקה בגוף: ` +
            JSON.stringify(texts),
          'engine/templates.ts, הנמקה 1',
        );
      }
    } else {
      claim(
        t,
        'אין הערות שוליים (hasFootnoteBand: false)',
        x.footnoteRefs === 0 && x.footnotes.count === 0,
        `${x.footnoteRefs} הפניות, ${x.footnotes.count} הערות`,
      );
    }

    /* --- 7. תוכן הפתיחה --- */
    if (t.bodyTexts.length && !t.preview.hasTitleBlock) {
      claim(
        t,
        'פסקאות הפתיחה נכתבו',
        t.bodyTexts.every((want, i) => texts[i] === want),
        `נמדד ${JSON.stringify(texts)}, מובטח ${JSON.stringify(t.bodyTexts)}`,
      );
    }
    if (!t.bodyTexts.length) {
      claim(
        t,
        'המסמך נפתח ריק',
        texts.every((s) => s === ''),
        `פסקאות: ${JSON.stringify(texts)}`,
      );
    }

    /* --- 8. מה שאינו בחוזה, אבל התבנית מבטיחה אותו: שוליים, כיווניות, גופן --- */
    const twipsOk = (name) => Math.abs(x.pgMar[name] - t.margins[name] * 1440) < 2;
    claim(
      t,
      `השוליים שהתבנית מחילה: ${t.margins.label}`,
      ['top', 'right', 'bottom', 'left'].every(twipsOk),
      `נמדד ${JSON.stringify(x.pgMar)} twips, מובטח ` +
        JSON.stringify({
          top: t.margins.top * 1440,
          right: t.margins.right * 1440,
          bottom: t.margins.bottom * 1440,
          left: t.margins.left * 1440,
        }),
    );
    claim(
      t,
      'המקטע עברי (w:bidi)',
      x.bidi && state?.sectionDirection === 'rtl',
      `sectPr: ${x.bidi}, המנוע: ${state?.sectionDirection ?? 'לא נקרא'}`,
    );
    if (t.docDefaultHalfPoints) {
      claim(
        t,
        `גוף בגופן ${t.docDefaultHalfPoints / 2}pt`,
        x.docDefaultSize === t.docDefaultHalfPoints,
        `docDefaults/rPrDefault → w:sz=${x.docDefaultSize} (מובטח ${t.docDefaultHalfPoints})`,
      );
    }

    /* --- 9. הגיליון על המסך --- */
    claim(
      t,
      'העמוד מצויר על המסך',
      !!pagePx && pagePx.w > 100,
      `${show(pagePx)}` +
        (!!pageEarly !== !!pagePx ? ` — אבל ב-+3 שניות היה ${show(pageEarly)}: העמוד נפרס ואז נמחק` : ''),
    );

    /* --- 10. שקט: אין שגיאה בשורת המצב ואין חריגה בלוג --- */
    const status = await app.status();
    const rawLog = await app.log();
    const log = rawLog.filter((line) => !NOISE.some((re) => re.test(line)));
    const messages = await app.messages();
    measured.status = status;
    measured.log = log;
    measured.noise = rawLog.filter((line) => NOISE.some((re) => re.test(line)));
    measured.messages = messages;
    claim(
      t,
      'הפתיחה לא הותירה שגיאה',
      !status?.error && log.length === 0,
      `שורת מצב: ${status?.text ?? '—'}${status?.error ? ' (שגיאה)' : ''}; ` +
        `לוג: ${log.length ? log.join(' | ').slice(0, 300) : 'נקי'}`,
    );

    /* --- 11. ההערה שהתבנית מבטיחה שתופיע (רק ל„שני טורים”) --- */
    if (t.expectStatusNote) {
      claim(
        t,
        'ההודעה על סדר הטורים הגיעה לשורת המצב',
        t.expectStatusNote.test(status?.text ?? ''),
        `שורת מצב: „${status?.text ?? '—'}”`,
      );
    } else if (status?.text) {
      // הודעה שלא ציפינו לה אינה כשל, אבל היא חייבת להיראות בדוח.
      console.log(`  ℹ שורת מצב: „${status.text}”`);
    }
  } catch (error) {
    console.log(`  ⧗ ${error.message}`);
    report.stuck(`${t.label} — השלב לא הסתיים`, error.message);
    measured.threw = error.message;
  } finally {
    if (app) app.close();
    evidence.push(measured);
  }
}

/* ------------------------------------------------------------------ */

/*
 * A5 מול A4 — על המסך, ולא ב-XML.
 *
 * שני הגדלים חולקים **את אותו יחס גובה-רוחב** (זו ההגדרה של סדרת ISO: כל
 * גודל הוא חצייה של קודמו), ולכן יחס לבדו אינו יכול להבחין ביניהם. מה שכן
 * מבחין הוא הרוחב המוחלט באותו זום ובאותו חלון: ‏148/210 = 0.7048. הבדיקה
 * רצה רק כששתי התבניות נמדדו באותה ריצה, ולכן היא מדלגת על ריצת תבנית אחת
 * במקום לשקר שהיא עברה.
 */
const a5 = evidence.find((e) => e.preview?.ratio === 'a5' && e.pagePx);
const a4 = evidence.find((e) => e.preview?.ratio === 'a4' && e.pagePx);
if (a5 && a4) {
  const scale = a5.pagePx.w / a4.pagePx.w;
  const ok = Math.abs(scale - 148 / 210) < 0.02;
  console.log(`\n${ok ? '✓' : '✗'} A5 מצויר קטן מ-A4: ${a5.pagePx.w}px מול ${a4.pagePx.w}px (יחס ${scale.toFixed(4)})`);
  const row = 'A5 מצויר על המסך קטן מ-A4';
  const detail = `${a5.pagePx.w}px מול ${a4.pagePx.w}px = ${scale.toFixed(4)} (מובטח ${(148 / 210).toFixed(4)})`;
  ok ? report.pass(row, detail) : report.fail(row, detail);
} else if (wanted.length > 1) {
  report.skip('A5 מצויר על המסך קטן מ-A4', 'אחד משני הגדלים לא נמדד בריצה הזאת');
}

if (knownGaps.length) {
  console.log('\n=== פערים ידועים שאינם מפילים את השער ===');
  console.log('(הכרטיס מבטיח, המסמך אינו נותן, והמקור מתעד למה — ר׳ docs/templates-qa-findings.md)');
  for (const gap of knownGaps) {
    console.log(`~ ${gap.template} — ${gap.name}: ${gap.detail}`);
    console.log(`  מקור: ${gap.source}`);
  }
}

console.log('\nEVIDENCE:' + JSON.stringify(evidence));

process.exit(report.print() > 0 ? 1 : 0);
