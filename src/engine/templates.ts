/**
 * חמש תבניות מסמך, ו-`applyTemplate` שמחיל אותן על מסמך ריק שכבר נפתח.
 *
 * ## מתי זה רץ, ומה זה לא עושה
 *
 * `applyTemplate` רץ **אחרי** ש-`openDocument()` פתח מסמך ריק וברירות המחדל
 * העבריות (`document-defaults.ts`: כיווניות, A4) כבר הוחלו עליו. המודול הזה
 * אינו פותח מסמכים, אינו נוגע ב-storage, ואינו יודע דבר על הדיאלוג שמציג את
 * הכרטיסים — ראו `docs/open-document-dialog-plan.md`, סעיף „החוזים”.
 *
 * ## המשטחים שנעשה בהם שימוש, ואיפה הם כבר בשימוש במאגר
 *
 * - `applyPaperSize` / `applyMarginPreset` / `applyColumns` / `applyPageNumbering`
 *   — page-setup.ts, נצרכים מ-LayoutTab.vue.
 * - `ensureHeaderFooter` — header-footer.ts, נצרך מ-InsertTab.vue.
 * - `applyDocStyleDefaults` — doc-style-defaults.ts, נצרך מ-DocDefaultsDialog.vue.
 *   (לא ברשימת המשטחים שהתוכנית מנתה, אבל יש לו צרכן קיים במאגר, וזו הדרך
 *   היחידה שנמצאה ל„גוף בגופן גדול” של „מהדורה מבוארת” — ראו למטה.)
 * - `doc.blocks.list()` בלי ארגומנטים — בדיוק הקריאה ש-`applyHebrewDocumentDefaults`
 *   (document-defaults.ts) כבר משתמשת בה כדי לאתר את הפסקה היחידה שהמסמך הריק
 *   נפתח איתה.
 * - `doc.create.paragraph({ at: { kind: 'after', target } })` ו-
 *   `doc.insert({ value, type: 'text', target })` — בדיוק הצורה שכבר עובדת
 *   ב-table-insert.ts וב-book-completion-overlay.ts.
 * - `doc.format.paragraph.setFlowOptions({ target: { kind:'block', nodeType,
 *   nodeId }, pageBreakBefore })` — אותה פעולה שעומדת מאחורי „התחל בעמוד חדש”
 *   (engine/page-break.ts), אבל עם `target` מפורש שאנחנו בונים בעצמנו — לא
 *   דרך `startParagraphOnNewPage`, שקורא את הפסקה **מהבחירה הנוכחית**.
 *
 * ## שלוש החלטות שנבעו מזה שאין להן API ציבורי בטוח
 *
 * **1. אין הערת שוליים אמיתית ל„מהדורה מבוארת”, למרות ש-`hasFootnoteBand: true`.**
 * `doc.footnotes.insert` (footnotes.ts) כותב תמיד „במקום הסמן” — אין לו פרמטר
 * `target`/`at` — ומסמך שזה עתה נפתח **אין בו סמן**: זה בדיוק מה שנמדד ב-
 * document-defaults.ts (הערת הפתיחה שם: פקודות פסקה שמנותבות לפי הבחירה
 * הנוכחית נכשלות ב-`selection-required` על מסמך טרי). אין שום מדידה שמראה
 * שקריאה ל-`footnotes.insert` בטוחה באותו רגע, וגם אין לה צרכן בתוכנית
 * (`open-document-dialog-plan.md` מונה רק `doc.insert`/`doc.create.paragraph`
 * לתוכן). לכן „שני הזרמים” של המהדורה המבוארת ממומשים כשתי פסקאות נפרדות
 * בגוף המסמך עצמו — לא כ-`footnotes.xml` נפרד.
 *
 * **הופרך במדידה, והפער נסגר.** `FootnoteInsertInput.at?: TextTarget` קיים
 * בחוזה, והמדידה מול המנוע הארוז נתנה `<w:footnoteReference>` בגוף והערה
 * אמיתית ב-`footnotes.xml`. „מהדורה מבוארת” כותבת עכשיו הערת שוליים אמיתית
 * המעוגנת בסוף פסקת הפנים — ראו `writeAnnotatedContent`. ההנמקה נשמרת כאן
 * כתיעוד של מה שהיה, כדי שההנחה לא תחזור.
 *
 * **2. אין ריכוז (`w:jc="center"`) לטקסט בדף השער.** יישור פסקה בממשק הזה
 * עובר תמיד דרך `ui.commands` (`alignCmd` ב-HomeTab.vue) — אותה משפחת פקודות
 * שמנותבת לפי הבחירה הנוכחית, ואותו כשל מוכר בדיוק. לא נמצאה שום פונקציה
 * ברמת ה-Document API (כמו `format.paragraph.setDirection`, שמקבלת `target`
 * מפורש) שמגדירה יישור פסקה. לכן דף השער נכתב עם שלוש פסקאות ממורכזות-בכוונה
 * אך לא ממורכזות-בפועל; זה תועד כפער ולא הומצא API כדי לעקוף אותו.
 *
 * **3. „קונטרס A5” יוצר עמוד A5 אמיתי, אחרי שהגודל נוסף.** `PAPER_SIZES`
 * ב-page-setup.ts הגדיר רק `'a4'` ו-`'letter'`, ולכן התבנית הזאת נכתבה
 * תחילה כ-A4 עם `note` שמודיע על הפער. הפער נסגר במקום הנכון: `'a5'` נוסף
 * לטבלה (148 × 210 מ״מ, `w:code` 11), ו-`applyPaperSize` מקבל אותו כמו כל
 * גודל אחר — כולל זיהוי הכיוון ובדיקת „יישאר מקום לטקסט”. זה גם מה שמאפשר
 * לכרטיס לצייר גיליון קטן בלי לשקר: התצוגה המקדימה מבטיחה A5, והקובץ הוא A5.
 *
 * ## הכלל לכשל בשלב אמצעי: השלבים ממשיכים, והתוצאה מדווחת מה לא הוחל
 *
 * `applyTemplate` מריצה את כל השלבים של תבנית עד הסוף, גם כשאחד מהם נכשל.
 * הנימוק: מסמך שנפתח כבר קיים ונמסר למשתמש בכל מקרה (זה לא „שמור/בטל”
 * טרנזקציוני), ועצירה באמצע הייתה משאירה אותו במצב חלקי **בלי** שהמשתמש ידע
 * אילו שלבים מהתבנית שהוא ביקש בכלל רצו. לכן: כל שלב רץ, הצלחות עם `note`
 * נאספות, כשלים נאספים; אם הכול הצליח מוחזר `{ ok: true, note? }` עם כל
 * ההערות מחוברות; אם שלב כלשהו נכשל מוחזר `{ ok: false, message, reason:
 * 'template-partial-failure' }`, וה-`message` מפרט מה **לא** הוחל (ולא רק
 * „נכשל”, כדי שהמשתמש ידע שהמסמך עדיין פתוח עם מה שכן הוחל). כל `note` — גם
 * מהמנוע (כמו `rtlColumnNote`) וגם מהתבנית עצמה (כמו הערת ה-A5) — מגיע
 * לקורא דרך אותו ערוץ יחיד: שדה `note` של `CommandOutcome` (page-setup.ts
 * מתעד: `{ ok: true; note?: string }`). אין ל-`CommandOutcome` שדה נפרד
 * ל„הערת תבנית” לעומת „הערת מנוע” — ולכן הם מתמזגים למחרוזת אחת.
 */
import type { CommandOutcome } from './command-adapter';
import { receiptFailureText, thrownText, type DocReceipt, type MaybePromise } from './document-api';
import {
  applyColumns,
  applyMarginPreset,
  applyPageNumbering,
  applyPaperSize,
  type PageSetupTarget,
} from './page-setup';
import { ensureHeaderFooter } from './header-footer';
import { applyDocStyleDefaults, type DocDefaultsTarget } from './doc-style-defaults';

export type TemplateId = 'blank' | 'two-column' | 'annotated' | 'title-page' | 'kuntres-a5';

/** מודל ציור, לא SVG קשיח — ראו open-document-dialog-design.md §2.4/§5. */
export interface TemplatePreview {
  columns: 1 | 2;
  hasTitleBlock: boolean;
  hasRunningHead: boolean;
  hasFootnoteBand: boolean;
  ratio: 'a4' | 'a5';
}

export interface DocumentTemplate {
  id: TemplateId;
  label: string;
  hint: string;
  /** אזהרה שמוצגת בכרטיס **לפני** הלחיצה. רק ל-`two-column` יש כזו. */
  note?: string;
  preview: TemplatePreview;
}

/**
 * חמש התבניות, בדיוק לפי הטבלה ב-`open-document-dialog-design.md` §2.4 —
 * `label`/`hint`/`note`/`preview` הם חוזה משותף עם `OpenDocumentDialog.vue`
 * (בבעלות גל אחר), ואינם ניתנים לניסוח מחדש כאן.
 */
export const DOCUMENT_TEMPLATES: readonly DocumentTemplate[] = [
  {
    id: 'blank',
    label: 'מסמך ריק',
    hint: 'עמוד A4 ריק בעברית',
    preview: { columns: 1, hasTitleBlock: false, hasRunningHead: false, hasFootnoteBand: false, ratio: 'a4' },
  },
  {
    id: 'two-column',
    label: 'ספר קודש — שני טורים',
    hint: 'גוף בשני טורים שווים, עם כותרת רצה',
    // הנוסח הזה קבוע בתוכנית (open-document-dialog-plan.md, החלטה 2) ובעיצוב
    // (§2.4): קצר יותר מ-`rtlColumnNote` בכוונה — זו אזהרה שנקראת *לפני*
    // הפעולה, ו-`rtlColumnNote` היא הודעה שמופיעה *אחרי* (ומגיעה כ-`note`
    // ב-`CommandOutcome` שמוחזר מ-`applyTemplate`, לא מכאן).
    note: 'הטורים מצוירים הפוך בעורך; הקובץ נשמר נכון',
    preview: { columns: 2, hasTitleBlock: false, hasRunningHead: true, hasFootnoteBand: false, ratio: 'a4' },
  },
  {
    id: 'annotated',
    label: 'מהדורה מבוארת',
    hint: 'פנים הספר, והביאור בהערות שוליים',
    preview: { columns: 1, hasTitleBlock: false, hasRunningHead: true, hasFootnoteBand: true, ratio: 'a4' },
  },
  {
    id: 'title-page',
    label: 'מסמך עם דף שער',
    hint: 'שער נפרד, ואחריו גוף המסמך',
    preview: { columns: 1, hasTitleBlock: true, hasRunningHead: false, hasFootnoteBand: false, ratio: 'a4' },
  },
  {
    id: 'kuntres-a5',
    label: 'קונטרס A5',
    hint: 'חוברת בגודל A5, עם כותרת רצה',
    preview: { columns: 1, hasTitleBlock: false, hasRunningHead: true, hasFootnoteBand: false, ratio: 'a5' },
  },
];

export function findTemplate(id: string): DocumentTemplate | undefined {
  return DOCUMENT_TEMPLATES.find((template) => template.id === id);
}

/* ------------------------------------------------------------------ */
/* תוכן: פסקאות פתיחה דרך doc.blocks/doc.create/doc.insert              */
/* ------------------------------------------------------------------ */

interface TemplateBlockEntry {
  nodeId?: string;
  nodeType?: string;
}

/**
 * יעד טקסט של המנוע. `story` אופציונלי ומשמעותו „גוף המסמך” כשהוא נעדר —
 * זה מה שמפריד הכנסה לכותרת מהכנסה לגוף.
 */
interface TemplateTextTarget {
  kind: 'text';
  segments: { blockId: string; range: { start: number; end: number } }[];
  story?: unknown;
}

interface TemplateCreateParagraphResult {
  success?: boolean;
  insertionPoint?: { blockId?: string; range?: { start?: number } };
}

/**
 * מה שנדרש מ-`doc` מעבר למה שכבר חשוף ב-page-setup.ts/header-footer.ts —
 * מוגדר כאן ולא מיובא, מאותה סיבה שכל שאר המודולים במאגר עושים זאת (ראו
 * page-setup.ts: „בלעדיו TypeScript משווה מבנית את הטיפוס המלא של המנוע”).
 */
interface TemplateContentDocumentApi {
  blocks?: {
    list?: (input?: { in?: unknown }) => MaybePromise<{ blocks?: TemplateBlockEntry[] } | undefined>;
  };
  create?: {
    paragraph?: (input: {
      at: { kind: 'after'; target: { kind: 'block'; nodeType: string; nodeId: string } };
    }) => MaybePromise<TemplateCreateParagraphResult | undefined>;
  };
  insert?: (input: { value: string; type: 'text'; target: unknown }) => MaybePromise<DocReceipt>;
  /**
   * שני המשטחים שנוספו אחרי מדידה מול המנוע הארוז (ולא לפיה).
   *
   * `blocks.list` כאן מקבל `in` — מאתר זרם — וזה מה שמאפשר להגיע לפסקה
   * **שבתוך הכותרת הרצה** ולא בגוף. `ensureHeaderFooter` כבר יוצרת שם פסקה
   * ריקה אחת, ולכן אין צורך ליצור אותה.
   */
  sections?: {
    list?: () => MaybePromise<{ items?: { address?: unknown }[] } | undefined>;
  };
  footnotes?: {
    insert?: (input: {
      at: TemplateTextTarget;
      type: 'footnote';
      content: string;
    }) => MaybePromise<DocReceipt>;
  };
  fields?: {
    insert?: (input: {
      at: TemplateTextTarget;
      instruction: string;
      mode: 'raw';
    }) => MaybePromise<DocReceipt>;
  };
  format?: {
    paragraph?: {
      setFlowOptions?: (input: {
        target: { kind: 'block'; nodeType: string; nodeId: string };
        pageBreakBefore: boolean;
      }) => MaybePromise<DocReceipt>;
    };
  };
}

interface TemplateContentHost {
  activeEditor?: { doc?: TemplateContentDocumentApi | null } | null;
}

function templateContentDoc(host: PageSetupTarget): TemplateContentDocumentApi | undefined {
  return (host as TemplateContentHost | null | undefined)?.activeEditor?.doc ?? undefined;
}

function unavailable(failedAction: string, detail: string, reason: string): CommandOutcome {
  return { ok: false, message: `${failedAction}: ${detail}`, reason };
}

/** יעד בחירה מכונס בהיסט 0 של בלוק — אותה צורה בדיוק כמו `collapsedSelectionTarget` ב-table-insert.ts. */
function collapsedTarget(blockId: string): unknown {
  const point = { kind: 'text', blockId, offset: 0 };
  return { kind: 'selection', start: point, end: point };
}

/** כותבת טקסט להיסט 0 של פסקה קיימת וריקה. `doc.insert` — ראו book-completion-overlay.ts. */
async function writeParagraphText(
  doc: TemplateContentDocumentApi,
  blockId: string,
  text: string,
  failedAction: string,
): Promise<CommandOutcome> {
  const insert = doc.insert;
  if (typeof insert !== 'function') {
    return unavailable(failedAction, 'הפעולה אינה נתמכת בגרסה הזאת של המנוע', 'command-unsupported');
  }
  try {
    const receipt = await insert({ value: text, type: 'text', target: collapsedTarget(blockId) });
    if (receipt?.success === false) {
      return { ok: false, message: receiptFailureText(failedAction, receipt), reason: receipt.failure?.code };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, message: thrownText(failedAction, error), reason: 'threw' };
  }
}

/** יוצרת פסקה חדשה מיד אחרי `afterNodeId`. `doc.create.paragraph` — ראו table-insert.ts. */
async function appendParagraph(
  doc: TemplateContentDocumentApi,
  afterNodeId: string,
  afterNodeType: string,
  failedAction: string,
): Promise<{ ok: true; blockId: string } | { ok: false; outcome: CommandOutcome }> {
  const create = doc.create?.paragraph;
  if (typeof create !== 'function') {
    return { ok: false, outcome: unavailable(failedAction, 'הפעולה אינה נתמכת בגרסה הזאת של המנוע', 'command-unsupported') };
  }
  try {
    const result = await create({
      at: { kind: 'after', target: { kind: 'block', nodeType: afterNodeType, nodeId: afterNodeId } },
    });
    const blockId = result?.insertionPoint?.blockId;
    if (result?.success !== true || typeof blockId !== 'string') {
      return { ok: false, outcome: unavailable(failedAction, 'המנוע לא יצר פסקה חדשה', 'missing-block-id') };
    }
    return { ok: true, blockId };
  } catch (error) {
    return { ok: false, outcome: { ok: false, message: thrownText(failedAction, error), reason: 'threw' } };
  }
}

/**
 * הפסקה הראשונה של המסמך — אותה קריאה בדיוק (`doc.blocks.list()` בלי
 * ארגומנטים) ש-`applyHebrewDocumentDefaults` (document-defaults.ts) כבר
 * משתמשת בה כדי לאתר את הפסקה היחידה שהמסמך הריק נפתח איתה.
 */
async function firstParagraph(
  doc: TemplateContentDocumentApi,
  failedAction: string,
): Promise<{ ok: true; blockId: string; nodeType: string } | { ok: false; outcome: CommandOutcome }> {
  const list = doc.blocks?.list;
  if (typeof list !== 'function') {
    return { ok: false, outcome: unavailable(failedAction, 'הפעולה אינה נתמכת בגרסה הזאת של המנוע', 'command-unsupported') };
  }
  let blocks: TemplateBlockEntry[] | undefined;
  try {
    blocks = (await list())?.blocks;
  } catch (error) {
    return { ok: false, outcome: { ok: false, message: thrownText(failedAction, error), reason: 'threw' } };
  }
  const first = blocks?.[0];
  if (typeof first?.nodeId !== 'string') {
    return { ok: false, outcome: unavailable(failedAction, 'לא נמצאה פסקה במסמך', 'target-unresolved') };
  }
  return { ok: true, blockId: first.nodeId, nodeType: first.nodeType ?? 'paragraph' };
}

interface ParagraphSequenceResult {
  ok: true;
  /** מזהי כל הפסקאות שנכתבו, בסדר. */
  blockIds: string[];
  /** ה-`nodeType` של הפסקה האחרונה — נדרש כדי להוסיף עוד פסקה אחריה. */
  lastNodeType: string;
}

/**
 * כותבת רצף פסקאות פתיחה: `texts[0]` לתוך הפסקה הריקה שהמסמך כבר נפתח איתה,
 * וכל טקסט נוסף לתוך פסקה חדשה שנוצרת אחרי הקודמת.
 *
 * לא משתמשת ב„בחירה נוכחית”: כל כתיבה וכל יצירה מקבלות `target`/`at` מפורש
 * שנגזר מ-`nodeId` שכבר ידוע לנו — זו הסיבה ש„פתיחת עמודים” הזאת בטוחה על
 * מסמך שזה עתה נפתח, בניגוד ל-`footnotes.insert`/`alignCmd` (ראו הערת הפתיחה).
 */
async function writeParagraphSequence(
  host: PageSetupTarget,
  texts: readonly string[],
  failedAction: string,
): Promise<ParagraphSequenceResult | { ok: false; outcome: CommandOutcome }> {
  const doc = templateContentDoc(host);
  if (!doc) return { ok: false, outcome: unavailable(failedAction, 'המסמך עדיין נטען', 'document-api-unavailable') };
  if (texts.length === 0) return { ok: true, blockIds: [], lastNodeType: 'paragraph' };

  const first = await firstParagraph(doc, failedAction);
  if (!first.ok) return first;

  const firstWrite = await writeParagraphText(doc, first.blockId, texts[0]!, failedAction);
  if (!firstWrite.ok) return { ok: false, outcome: firstWrite };

  const blockIds = [first.blockId];
  let nodeType = first.nodeType;

  for (let index = 1; index < texts.length; index += 1) {
    const appended = await appendParagraph(doc, blockIds[blockIds.length - 1]!, nodeType, failedAction);
    if (!appended.ok) return appended;
    nodeType = 'paragraph';
    blockIds.push(appended.blockId);

    const write = await writeParagraphText(doc, appended.blockId, texts[index]!, failedAction);
    if (!write.ok) return { ok: false, outcome: write };
  }

  return { ok: true, blockIds, lastNodeType: nodeType };
}

/**
 * „מהדורה מבוארת”: פסקת פנים אחת, והביאור **בהערת שוליים אמיתית**.
 *
 * עד כאן נכתבו שתי פסקאות בגוף, מפני שהונח שאין דרך לעגן הערה בלי סמן. זה
 * נמדד והופרך: `footnotes.insert` מקבל `at: TextTarget`, והמדידה מול המנוע
 * הארוז נתנה `<w:footnoteReference>` בגוף והערה אמיתית ב-`footnotes.xml`.
 *
 * זה לא היה שיפור אלא **תיקון**: הכרטיס מצהיר `hasFootnoteBand: true` ומצייר
 * רצועת הערות עם מפריד, ומסמך בלי הערה אחת הוא בדיוק „ציור שמשקר” — הכלל
 * שהמפרט קובע ושלושה פערים אחרים כבר תוקנו לפיו.
 *
 * ההערה מעוגנת ב**סוף** פסקת הפנים ולא בתחילתה: סימן ההערה בא אחרי הטקסט
 * שהוא מבאר, וזה גם מה שמגיה מצפה למצוא כשהוא מתחיל להקליד.
 */
const ANNOTATED_BODY_PLACEHOLDER = 'כאן מתחיל גוף הטקסט';
const ANNOTATED_COMMENTARY_PLACEHOLDER = 'כאן יתחיל הביאור';

async function writeAnnotatedContent(host: PageSetupTarget): Promise<CommandOutcome> {
  const failedAction = 'הוספת פסקאות הפתיחה של המהדורה המבוארת נכשלה';
  const result = await writeParagraphSequence(host, [ANNOTATED_BODY_PLACEHOLDER], failedAction);
  if (!result.ok) return result.outcome;

  const doc = templateContentDoc(host);
  const insert = doc?.footnotes?.insert;
  const blockId = result.blockIds[0];
  if (typeof insert !== 'function' || !blockId) {
    return unavailable(failedAction, 'הוספת הערת שוליים אינה זמינה', 'command-unsupported');
  }

  const offset = ANNOTATED_BODY_PLACEHOLDER.length;
  try {
    const receipt = await insert({
      at: { kind: 'text', segments: [{ blockId, range: { start: offset, end: offset } }] },
      type: 'footnote',
      content: ANNOTATED_COMMENTARY_PLACEHOLDER,
    });
    if (receipt?.success === false) {
      return { ok: false, message: receiptFailureText(failedAction, receipt), reason: receipt.failure?.code };
    }
  } catch (error) {
    return { ok: false, message: thrownText(failedAction, error), reason: 'threw' };
  }

  return { ok: true };
}

/**
 * מספר עמוד בכותרת הרצה — שדה `PAGE` אמיתי, לא טקסט.
 *
 * ## למה זה שלב נפרד מ-`applyPageNumbering`
 *
 * `applyPageNumbering` כותב `<w:pgNumType w:fmt="decimal"/>` על ה-`sectPr`,
 * וזו **הצהרת פורמט** לשדה — לא השדה עצמו. `ensureHeaderFooter` יוצרת כותרת
 * ריקה. התוצאה עד כאן: שלוש תבניות שמצהירות `hasRunningHead: true`, מציירות
 * בכרטיס פס כותרת ומלבן מספר עמוד, ומייצרות קובץ שאין בו מספר עמוד כלל.
 * נמדד ב-`templates-qa.mjs`: `word/header1.xml` נוצר, `text: ""`,
 * `hasPageField: false`.
 *
 * ## המסלול, שנמדד לפני שנכתב
 *
 * `sections.list()` → `section.address` → מאתר זרם `headerFooterSlot` →
 * `blocks.list({ in: story })` מחזיר את הפסקה הריקה שבכותרת →
 * `fields.insert` עם `mode: 'raw'` ו-`at` (שהוא **חובה** כאן, בשונה מהערות
 * שוליים). התוצאה שנמדדה: `<w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t>
 * </w:r></w:fldSimple>` — הצורה הפשוטה של שדה, שהיא OOXML תקין.
 *
 * אזהרה למי שיבדוק את זה בעתיד: חיפוש `w:fldChar`/`w:instrText` יחזיר
 * **false** כאן, מפני שאלה הצורה ה*מורכבת*. בדיקה שנשענת עליהם תדווח „לא
 * עובד” על שדה תקין לחלוטין.
 */
async function insertHeaderPageNumber(host: PageSetupTarget): Promise<CommandOutcome> {
  const failedAction = 'הוספת מספר העמוד לכותרת הרצה נכשלה';
  const doc = templateContentDoc(host);
  const list = doc?.sections?.list;
  const listBlocks = doc?.blocks?.list;
  const insert = doc?.fields?.insert;
  if (typeof list !== 'function' || typeof listBlocks !== 'function' || typeof insert !== 'function') {
    return unavailable(failedAction, 'הוספת שדות אינה זמינה', 'command-unsupported');
  }

  try {
    const section = (await list())?.items?.[0];
    if (!section?.address) {
      return unavailable(failedAction, 'לא נמצא מקטע', 'no-section');
    }

    const story = {
      kind: 'story',
      storyType: 'headerFooterSlot',
      section: section.address,
      headerFooterKind: 'header',
      variant: 'default',
    };

    const blockId = (await listBlocks({ in: story }))?.blocks?.[0]?.nodeId;
    if (!blockId) {
      return unavailable(failedAction, 'הכותרת הרצה ריקה מפסקאות', 'no-header-block');
    }

    const receipt = await insert({
      at: { kind: 'text', segments: [{ blockId, range: { start: 0, end: 0 } }], story },
      instruction: 'PAGE',
      mode: 'raw',
    });
    if (receipt?.success === false) {
      return { ok: false, message: receiptFailureText(failedAction, receipt), reason: receipt.failure?.code };
    }
  } catch (error) {
    return { ok: false, message: thrownText(failedAction, error), reason: 'threw' };
  }

  return { ok: true };
}

/**
 * גודל ברירת המחדל של המסמך הריק הוא 12pt (נמדד — ראו doc-style-defaults.ts,
 * `before: { fontSize: 24 }` בחצאי-נקודות). 14pt הוא גדול-משמעותית ממנו
 * (עלייה של כשליש) בלי להיות קיצוני; אין ערך מדויק בתכנון או בעיצוב, וזו
 * החלטת עיצוב מתועדת ולא מדידה.
 */
const ANNOTATED_BODY_FONT_PT = 14;

/**
 * „מסמך עם דף שער”: שם הספר / המחבר / השנה כפסקאות ממורכזות-בכוונה (לא
 * ממורכזות בפועל — ראו הנמקה 2 בהערת הפתיחה), ואז פסקה ריקה שמתחילה בעמוד
 * חדש (`pageBreakBefore`) — זה „הגוף” שהמשתמש ימשיך להקליד לתוכו.
 */
const TITLE_PAGE_BOOK_NAME_PLACEHOLDER = 'שם הספר';
const TITLE_PAGE_AUTHOR_PLACEHOLDER = 'שם המחבר';
const TITLE_PAGE_YEAR_PLACEHOLDER = 'השנה';

async function writeTitlePageContent(host: PageSetupTarget): Promise<CommandOutcome> {
  const failedAction = 'הוספת עמוד השער נכשלה';
  const doc = templateContentDoc(host);
  if (!doc) return unavailable(failedAction, 'המסמך עדיין נטען', 'document-api-unavailable');

  const sequence = await writeParagraphSequence(
    host,
    [TITLE_PAGE_BOOK_NAME_PLACEHOLDER, TITLE_PAGE_AUTHOR_PLACEHOLDER, TITLE_PAGE_YEAR_PLACEHOLDER],
    failedAction,
  );
  if (!sequence.ok) return sequence.outcome;

  const lastId = sequence.blockIds[sequence.blockIds.length - 1]!;
  const bodyStart = await appendParagraph(doc, lastId, sequence.lastNodeType, failedAction);
  if (!bodyStart.ok) return bodyStart.outcome;

  const setFlowOptions = doc.format?.paragraph?.setFlowOptions;
  if (typeof setFlowOptions !== 'function') {
    return unavailable(failedAction, 'מעבר העמוד לגוף המסמך אינו נתמך בגרסה הזאת של המנוע', 'command-unsupported');
  }
  try {
    const receipt = await setFlowOptions({
      target: { kind: 'block', nodeType: 'paragraph', nodeId: bodyStart.blockId },
      pageBreakBefore: true,
    });
    if (receipt?.success === false) {
      return { ok: false, message: receiptFailureText(failedAction, receipt), reason: receipt.failure?.code };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, message: thrownText(failedAction, error), reason: 'threw' };
  }
}

/* ------------------------------------------------------------------ */
/* הרצת שלבי תבנית, וצירוף התוצאה                                      */
/* ------------------------------------------------------------------ */

type TemplateStep = () => Promise<CommandOutcome>;

/**
 * מריצה את כל שלבי התבנית **עד הסוף**, גם כשאחד מהם נכשל — ראו „הכלל לכשל
 * בשלב אמצעי” בהערת הפתיחה של הקובץ. מחזירה `CommandOutcome` יחיד: הצלחה עם
 * כל ההערות מצורפות, או כשל שמפרט מה לא הוחל.
 */
async function runSteps(templateLabel: string, steps: readonly TemplateStep[]): Promise<CommandOutcome> {
  const notes: string[] = [];
  const failures: string[] = [];

  for (const step of steps) {
    const outcome = await step();
    if (outcome.ok) {
      if (outcome.note) notes.push(outcome.note);
    } else {
      failures.push(outcome.message);
    }
  }

  if (failures.length === 0) {
    return notes.length > 0 ? { ok: true, note: notes.join(' ') } : { ok: true };
  }

  const noteSuffix = notes.length > 0 ? ` ${notes.join(' ')}` : '';
  return {
    ok: false,
    message:
      `תבנית „${templateLabel}” הוחלה חלקית — מה שכבר הוחל נשאר במסמך. ` +
      `לא הוחל: ${failures.join('; ')}.${noteSuffix}`,
    reason: 'template-partial-failure',
  };
}

/** ברירת מחדל בטוחה וללא מחלוקת לפורמט מספור עמודים — ראו PAGE_NUMBER_FORMATS ב-page-setup.ts. */
const DEFAULT_PAGE_NUMBER_FORMAT = 'decimal';

/**
 * מחילה תבנית מסמך על מסמך ריק שכבר נפתח.
 *
 * `blank` הוא no-op מוצלח שאינו נוגע ב-`host` כלל — אין ברירות מחדל נוספות
 * מעבר למה שכבר חל על מסמך חדש (document-defaults.ts). ארבע התבניות האחרות
 * מרכיבות רצף שלבים, כל אחת לפי הטבלה ב-`open-document-dialog-plan.md`.
 */
export async function applyTemplate(host: PageSetupTarget, id: TemplateId): Promise<CommandOutcome> {
  const template = findTemplate(id);
  if (!template) {
    // באג בקוד שלנו, לא מצב של המסמך: הקורא לא היה אמור להציע מזהה כזה.
    return { ok: false, message: `החלת התבנית נכשלה: אין תבנית בשם ${id}`, reason: 'unknown-template' };
  }

  switch (id) {
    case 'blank':
      return { ok: true };

    case 'two-column':
      return runSteps(template.label, [
        () => applyPaperSize(host, 'a4'),
        /*
         * `normal` ולא `wide`, וזה תוקן אחרי חישוב.
         *
         * `wide` הוא 2880 twips לכל צד — 10.16 ס"מ שוליים אופקיים, כלומר
         * 48% מרוחב A4. מה שנשאר לטקסט הוא 6146 twips, ואחרי רווח הטורים
         * (`COLUMN_GAP_TWIPS` = 720) כל טור יוצא (6146−720)/2 = 2713 twips =
         * **4.79 ס"מ** — כ-20 תווים לשורה בגודל הגוף, ובעברית אין חלוקת
         * מילים שתרכך את זה. זה אינו „אוויר להגהות”, זה טור שאי-אפשר לקרוא.
         *
         * `normal` (1440 לכל צד) נותן (9026−720)/2 = 4153 twips = **7.33
         * ס"מ**. וזה גם המספר שהתצוגה המקדימה בכרטיס כבר מציירת: מפרט
         * העיצוב §5.1 גוזר רוחב טור 73.25 מ"מ מתוך שוליים של 25.4 מ"מ.
         * כלומר `wide` לא רק הקשה על הקריאה — הוא סתר את מה שהכרטיס הבטיח.
         */
        () => applyMarginPreset(host, 'normal'),
        () => applyColumns(host, 2),
        () => ensureHeaderFooter(host, 'header'),
        () => applyPageNumbering(host, { format: DEFAULT_PAGE_NUMBER_FORMAT, start: null }),
        // ההצהרה לבדה אינה מדפיסה מספר — ראו `insertHeaderPageNumber`.
        () => insertHeaderPageNumber(host),
      ]);

    case 'annotated':
      return runSteps(template.label, [
        () => applyPaperSize(host, 'a4'),
        // ה-cast כאן (ולא בשאר הקריאות) נדרש כי `PageSetupDocumentApi` ו-
        // `DocDefaultsDocumentApi` אינם חולקים אף שם שדה (`sections` מול
        // `styles`) — TypeScript מסרב להעביר טיפוס "חלש" כזה בלי אזהרה
        // מפורשת ("weak type"), אף שבזמן ריצה זהו אותו `SuperDoc` תמיד.
        () => applyDocStyleDefaults(host as unknown as DocDefaultsTarget, { fontSizePt: ANNOTATED_BODY_FONT_PT }),
        () => ensureHeaderFooter(host, 'header'),
        () => applyPageNumbering(host, { format: DEFAULT_PAGE_NUMBER_FORMAT, start: null }),
        // ההצהרה לבדה אינה מדפיסה מספר — ראו `insertHeaderPageNumber`.
        () => insertHeaderPageNumber(host),
        () => writeAnnotatedContent(host),
      ]);

    case 'title-page':
      // בלי כותרת רצה ובלי מספור — hasRunningHead הוא false בתצוגה המקדימה
      // של התבנית הזאת, ולכן אין קריאה ל-ensureHeaderFooter/applyPageNumbering.
      return runSteps(template.label, [
        () => applyPaperSize(host, 'a4'),
        () => writeTitlePageContent(host),
      ]);

    case 'kuntres-a5':
      return runSteps(template.label, [
        // A5 אמיתי — ראו הנמקה 3 למעלה. הגודל **לפני** השוליים, כי המשמר
        // ב-`applyPaperSize` בודק שהשוליים הנוכחיים יישארו בתוך הדף החדש,
        // ובסדר ההפוך שוליים צרים היו נבדקים מול דף שכבר הצטמצם.
        () => applyPaperSize(host, 'a5'),
        // „שוליים לכריכה”: אין gutter נחשף דרך applyPageMargins/applyMarginPreset
        // (רק top/right/bottom/left) — 'narrow' נבחר כי הוא משאיר הכי הרבה
        // שטח טקסט בעמוד קטן, שהוא האילוץ האמיתי בחוברת פורמט A5.
        () => applyMarginPreset(host, 'narrow'),
        () => ensureHeaderFooter(host, 'header'),
        () => applyPageNumbering(host, { format: DEFAULT_PAGE_NUMBER_FORMAT, start: null }),
        // ההצהרה לבדה אינה מדפיסה מספר — ראו `insertHeaderPageNumber`.
        () => insertHeaderPageNumber(host),
      ]);
  }
}
