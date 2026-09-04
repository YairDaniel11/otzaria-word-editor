/**
 * „סימון עמודים” — סימון המילה הראשונה (ירוק) והאחרונה (אדום) של כל עמוד,
 * ו„בדיקה” שמגלה אילו שבירות עמוד זזו מאז הסימון. נויד מ-PageMarking.bas
 * של שולחן העורך.
 *
 * ## למה שכבה ולא צביעה בקובץ
 *
 * המקור צובע את המילים במסמך עצמו (`Font.Color`), ו„הסרה” מחפשת בדיוק את
 * שני הצבעים האלה. אצלנו הסימון הוא **שכבת ציור** מעל העמודים המצוירים
 * (ui/shell/PageMarkingOverlay.vue) ואינו נכתב ל-docx: צביעה בקובץ הייתה
 * דורשת לדעת מהמנוע איזה בלוק/היסט פותח כל עמוד, ואין לו API כזה
 * (docs/shulchan-source/engine-issues/3970-layout-read-api.md). מה שכן
 * נשמר הוא **תצלום** של תחילת כל עמוד — הטקסט הפותח — בזיכרון של אוצריא,
 * כדי ש„בדיקה” תוכל להשוות אליו גם בהפעלה אחרת.
 *
 * ## המגבלה שחייבים לדעת
 *
 * הפגינציה של SuperDoc אינה זהה לזו של Word: אותו קובץ יכול להישבר במקום
 * אחר בכל אחד מהם. הסימון מעיד על עמודי **העורך**, ו„בדיקה” מגלה שינוי
 * בעמודי העורך בין שתי נקודות זמן — לא איפה Word ישבור.
 *
 * הקובץ הזה הוא לוגיקה טהורה ואחסון; המדידה עצמה ב-engine/page-ruler.ts
 * (`measurePageEdgeWords`), היחיד שרשאי לגעת ב-`data-page-index`.
 */

/** מה שהמדידה מחזירה לכל עמוד — הצורה של `PageEdgeWords` ב-page-ruler.ts, בלי גיאומטריה. */
export interface PageEdgeText {
  pageIndex: number;
  /** הטקסט הפותח של העמוד, מנורמל (רווחים בודדים), עד `HEAD_LENGTH` תווים. */
  head: string;
  firstWord: string;
  lastWord: string;
}

/** כמה תווים מתחילת העמוד נשמרים לזיהוי — מספיק כדי ששתי פסקאות דומות לא יתבלבלו. */
export const HEAD_LENGTH = 80;

export interface PageMarksSnapshot {
  /** מזהה המסמך שהתצלום שייך לו — ראו `documentKey` ב-shulchan-doc.ts. */
  docKey: string;
  savedAt: string;
  pages: readonly PageEdgeText[];
}

/** תוצאת „בדיקה”: אילו עמודים נפתחים היום בטקסט אחר משבתצלום. */
export interface PageMarksComparison {
  /** מספרי עמודים (החל מ-1) שהשבירה בתחילתם זזה. */
  changedPages: readonly number[];
  /** כמה עמודים היו בתצלום וכמה יש היום. */
  savedCount: number;
  currentCount: number;
}

export function normalizeHead(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, HEAD_LENGTH);
}

export function snapshotFromEdges(docKey: string, edges: readonly PageEdgeText[], now = new Date()): PageMarksSnapshot {
  return {
    docKey,
    savedAt: now.toISOString(),
    pages: edges.map((edge) => ({
      pageIndex: edge.pageIndex,
      head: normalizeHead(edge.head),
      firstWord: edge.firstWord,
      lastWord: edge.lastWord,
    })),
  };
}

/**
 * משווה את העמודים של היום לתצלום, לפי הטקסט הפותח. העמוד הראשון תמיד
 * פותח את המסמך ולכן אינו יכול „לזוז”; עמוד שיש היום ואין בתצלום (המסמך
 * התארך) נחשב שינוי, כמו במקור שסורק עד ספירת העמודים הנוכחית.
 */
export function comparePageMarks(
  snapshot: PageMarksSnapshot,
  current: readonly PageEdgeText[],
): PageMarksComparison {
  const saved = new Map(snapshot.pages.map((page) => [page.pageIndex, page.head]));
  const changed: number[] = [];
  for (const page of current) {
    if (page.pageIndex === 0) continue;
    const head = normalizeHead(page.head);
    const was = saved.get(page.pageIndex);
    if (was === undefined || was !== head) changed.push(page.pageIndex + 1);
  }
  return { changedPages: changed, savedCount: snapshot.pages.length, currentCount: current.length };
}

export function comparisonSummaryText(comparison: PageMarksComparison): string {
  if (comparison.changedPages.length === 0) return 'החיפוש הסתיים ולא נמצאו עמודים שהשתנו';
  const list = comparison.changedPages.join(', ');
  return comparison.changedPages.length === 1
    ? `עמוד ${list} נפתח היום במקום אחר מאשר בסימון`
    : `${comparison.changedPages.length} עמודים נפתחים היום במקום אחר מאשר בסימון: ${list}`;
}

export function markingSummaryText(pages: number): string {
  if (pages === 0) return 'לא נמצאו עמודים לסימון — יש לוודא שהמסמך מוצג';
  return pages === 1 ? 'סומן עמוד אחד' : `סומנו ${pages} עמודים`;
}

/* ---------- אחסון ---------- */

/** מה שנדרש מהמארח — `storage.get/set` של אוצריא, מוזרק כדי שהמנוע לא ייבא מ-host/. */
export interface SettingsStore {
  load: (key: string) => Promise<unknown>;
  save: (key: string, value: unknown) => Promise<void>;
}

const KEY_PREFIX = 'shulchan-page-marks:';

export function pageMarksKey(docKey: string): string {
  return `${KEY_PREFIX}${docKey}`;
}

function isSnapshot(raw: unknown): raw is PageMarksSnapshot {
  if (!raw || typeof raw !== 'object') return false;
  const value = raw as Partial<PageMarksSnapshot>;
  return (
    typeof value.docKey === 'string' &&
    Array.isArray(value.pages) &&
    value.pages.every(
      (page) =>
        page &&
        typeof page === 'object' &&
        typeof (page as PageEdgeText).pageIndex === 'number' &&
        typeof (page as PageEdgeText).head === 'string',
    )
  );
}

export async function loadPageMarks(store: SettingsStore, docKey: string): Promise<PageMarksSnapshot | null> {
  let raw: unknown;
  try {
    raw = await store.load(pageMarksKey(docKey));
  } catch {
    return null;
  }
  return isSnapshot(raw) && raw.docKey === docKey ? raw : null;
}

export async function savePageMarks(store: SettingsStore, snapshot: PageMarksSnapshot): Promise<void> {
  try {
    await store.save(pageMarksKey(snapshot.docKey), snapshot);
  } catch {
    /* זיכרון העדפה — כשל שקט, כמו useRememberedOptions */
  }
}

export async function clearPageMarks(store: SettingsStore, docKey: string): Promise<void> {
  try {
    await store.save(pageMarksKey(docKey), null);
  } catch {
    /* כנ"ל */
  }
}
