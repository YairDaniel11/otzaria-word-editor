/**
 * „סימני חיתוך” — מגדיל את הדף והשוליים של כל מקטע ב-N מ"מ ומצייר שמונה
 * קווי חיתוך בפינות, כהכנה לדפוס. נויד מ-CropMarks.bas של שולחן העורך.
 *
 * ## מה זהה למקור
 *
 * הגדלת הדף (רוחב וגובה ב-2N), ארבעת השוליים ומרחקי הכותרת/הכותרת התחתונה
 * (ב-N) בכל מקטע; גיאומטריית שמונת הקווים (`Balance = N/5`,
 * `Balance2 = Balance/1.4`) והסרה שמחזירה את המידות בדיוק.
 *
 * ## מה שונה — ולמה זה קירוב
 *
 * המקור מצייר את הקווים כ-`Shapes.AddLine` בכותרת התחתונה של המקטע הראשון,
 * כלומר הם **בקובץ**. למנוע אין `create.shape` (docs/shulchan-source/engine-facts.md),
 * ולכן הקווים כאן הם ציור של העורך: כלל CSS על תיבת העמוד המצוירת
 * (styles/crop-marks.css), שחל גם על המסך, גם על הדפסת הדפדפן וגם על
 * `ui.exportPdf` של אוצריא (שמרנדר מאותו דף — ראו engine/print.ts). הדף
 * המוגדל **כן** נשמר ב-docx; הקווים לא. מי שיפתח את הקובץ ב-Word יראה דף
 * גדול בלי סימנים.
 *
 * מכיוון שהקווים אינם בקובץ, „קיימים כבר סימני חיתוך” נקבע לפי רשומה
 * בזיכרון של אוצריא (לפי מזהה המסמך), ו„הסרה” קוראת ממנה כמה מ"מ להוריד —
 * המקבילה לשם הצורה במקור, שנשא את המידה.
 */
import type { DocReceipt, MaybePromise } from '../document-api';
import { receiptFailureText, thrownText } from '../document-api';
import type { SettingsStore } from './page-marking';
import { documentKey, readShulchanBlocks, shulchanDoc, unavailableOutcome, type ShulchanTarget } from './shulchan-doc';

/** טווח המ"מ שהמקור מקבל (`TextToNumIsInRange(text, 5, 50)`). */
export const CROP_MARKS_MIN_MM = 5;
export const CROP_MARKS_MAX_MM = 50;
export const DEFAULT_CROP_MARKS_MM = 10;

const MM_PER_INCH = 25.4;
const CSS_PX_PER_MM = 96 / MM_PER_INCH;
const CSS_PX_PER_PT = 96 / 72;

interface SectionItemLike {
  address?: unknown;
  pageSetup?: { width?: number; height?: number };
  margins?: { top?: number; right?: number; bottom?: number; left?: number };
  headerFooterMargins?: { header?: number; footer?: number };
}

interface SectionsApi {
  list?: () => MaybePromise<{ items?: readonly SectionItemLike[] } | undefined>;
  setPageSetup?: (input: Record<string, unknown>) => MaybePromise<DocReceipt>;
  setPageMargins?: (input: Record<string, unknown>) => MaybePromise<DocReceipt>;
  setHeaderFooterMargins?: (input: Record<string, unknown>) => MaybePromise<DocReceipt>;
}

function sectionsApi(host: ShulchanTarget): SectionsApi | undefined {
  return (shulchanDoc(host) as { sections?: SectionsApi } | undefined)?.sections;
}

export interface CropMarksRecord {
  docKey: string;
  mm: number;
}

/**
 * רשומה שנשמרת גם באינדקס. מזהי הפסקאות אינם זהות מוחלטת של המסמך, אבל הם
 * נשארים כשהמשתמש מוסיף או מוחק פסקאות אחרות. כך „הסר” עדיין מוצא את המידה
 * המקורית ולא משאיר דף מוגדל אחרי עריכה רגילה.
 */
interface IndexedCropMarksRecord extends CropMarksRecord {
  blockIds: readonly string[];
}

interface CropMarksIdentity {
  docKey: string;
  blockIds: readonly string[];
}

export interface CropMarksResult {
  ok: boolean;
  message?: string;
  /** כמה מקטעים שונו. */
  sections: number;
  mm: number;
}

const ADD_FAILED = 'הוספת סימני החיתוך נכשלה';
const REMOVE_FAILED = 'הסרת סימני החיתוך נכשלה';
export const CROP_MARKS_EXIST_TEXT = 'קיימים כבר סימני חיתוך במסמך זה';
export const NO_CROP_MARKS_TEXT = 'אין במסמך זה סימני חיתוך להסרה';

export function cropMarksSummaryText(result: CropMarksResult, removed: boolean): string {
  const count = result.sections === 1 ? 'במקטע אחד' : `ב-${result.sections} מקטעים`;
  return removed
    ? `סימני החיתוך הוסרו והדף הוקטן ב-${result.mm} מ"מ ${count}`
    : `הדף הוגדל ב-${result.mm} מ"מ ${count} ונוספו סימני חיתוך (מוצגים בעורך, בהדפסה וב-PDF; אינם נשמרים בקובץ)`;
}

export function isValidCropMm(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= CROP_MARKS_MIN_MM && value <= CROP_MARKS_MAX_MM;
}

/* ---------- אחסון ---------- */

const KEY_PREFIX = 'shulchan-crop-marks:';
const INDEX_KEY = 'shulchan-crop-marks-index';
const MAX_IDENTITY_BLOCKS = 64;
const MIN_SHARED_BLOCK_RATIO = 0.5;

export function cropMarksKey(docKey: string): string {
  return `${KEY_PREFIX}${docKey}`;
}

export async function loadCropMarks(store: SettingsStore, docKey: string): Promise<CropMarksRecord | null> {
  let raw: unknown;
  try {
    raw = await store.load(cropMarksKey(docKey));
  } catch {
    return null;
  }
  const record = raw as Partial<CropMarksRecord> | null;
  if (!record || typeof record !== 'object') return null;
  return record.docKey === docKey && isValidCropMm(record.mm) ? { docKey, mm: record.mm } : null;
}

async function saveCropMarks(store: SettingsStore, docKey: string, record: CropMarksRecord | null): Promise<void> {
  try {
    await store.save(cropMarksKey(docKey), record);
  } catch {
    /* זיכרון — כשל שקט */
  }
}

function isIndexedRecord(raw: unknown): raw is IndexedCropMarksRecord {
  if (!raw || typeof raw !== 'object') return false;
  const record = raw as Partial<IndexedCropMarksRecord>;
  return (
    typeof record.docKey === 'string' &&
    isValidCropMm(record.mm) &&
    Array.isArray(record.blockIds) &&
    record.blockIds.every((id) => typeof id === 'string' && id !== '')
  );
}

async function loadCropMarksIndex(store: SettingsStore): Promise<IndexedCropMarksRecord[]> {
  try {
    const raw = await store.load(INDEX_KEY);
    return Array.isArray(raw) ? raw.filter(isIndexedRecord) : [];
  } catch {
    return [];
  }
}

async function saveCropMarksIndex(store: SettingsStore, records: readonly IndexedCropMarksRecord[]): Promise<void> {
  try {
    await store.save(INDEX_KEY, records);
  } catch {
    /* זיכרון — כשל שקט */
  }
}

function sharedBlockRatio(record: IndexedCropMarksRecord, identity: CropMarksIdentity): number {
  if (record.blockIds.length === 0) return 0;
  const current = new Set(identity.blockIds);
  let shared = 0;
  for (const id of record.blockIds) if (current.has(id)) shared += 1;
  return shared / record.blockIds.length;
}

/**
 * התאמה מדויקת עדיפה תמיד. אחרי עריכה מבנית, התאמה של לפחות מחצית ממזהי
 * הפסקאות המקוריים היא אותה רשומה; מזהי `w14:paraId` ייחודיים למסמך, ולכן
 * זה אינו ניחוש לפי תוכן שעלול להתאים למסמך אחר בעל אותה לשון.
 */
async function indexedCropMarks(
  store: SettingsStore,
  identity: CropMarksIdentity,
): Promise<IndexedCropMarksRecord | null> {
  const records = await loadCropMarksIndex(store);
  const exact = records.find((record) => record.docKey === identity.docKey);
  if (exact) return exact;

  let best: IndexedCropMarksRecord | null = null;
  let bestRatio = MIN_SHARED_BLOCK_RATIO;
  for (const record of records) {
    const ratio = sharedBlockRatio(record, identity);
    if (ratio >= bestRatio && (best === null || ratio > bestRatio)) {
      best = record;
      bestRatio = ratio;
    }
  }
  return best;
}

async function addToCropMarksIndex(
  store: SettingsStore,
  record: IndexedCropMarksRecord,
): Promise<void> {
  const records = await loadCropMarksIndex(store);
  const kept = records.filter((candidate) => candidate.docKey !== record.docKey);
  await saveCropMarksIndex(store, [...kept, record]);
}

async function removeFromCropMarksIndex(
  store: SettingsStore,
  record: CropMarksRecord,
): Promise<void> {
  const records = await loadCropMarksIndex(store);
  await saveCropMarksIndex(store, records.filter((candidate) => candidate.docKey !== record.docKey));
}

/* ---------- הציור: משתני CSS על שורש הדף ---------- */

export const CROP_MARKS_DATASET_KEY = 'cropMarks';

/**
 * הגיאומטריה של המקור ב-CSS px (זום 1 — המנוע מכפיל את תיבת העמוד ב-
 * `transform`, ולכן הסימנים נמתחים איתה): `m` = המ"מ, `b` = m/5 (המרחק מקצה
 * הדף), `len` = m − b − b/1.4 (אורך כל קו), `w` = m/100 נק' עובי, לא פחות
 * מחצי פיקסל כדי שיודפס.
 */
export function cropMarksCssVars(mm: number): Record<string, string> {
  const m = mm * CSS_PX_PER_MM;
  const b = m / 5;
  const len = m - b - b / 1.4;
  const w = Math.max(0.5, (mm / 100) * CSS_PX_PER_PT);
  const px = (value: number): string => `${Math.round(value * 100) / 100}px`;
  return { '--crop-m': px(m), '--crop-b': px(b), '--crop-len': px(len), '--crop-w': px(w) };
}

/** כותבת/מוחקת את המשתנים והתכונה על `<html>`. `null` = אין סימנים. */
export function applyCropMarksStyle(mm: number | null, root: Document = document): void {
  const html = root.documentElement;
  if (!html) return;
  const names = ['--crop-m', '--crop-b', '--crop-len', '--crop-w'];
  if (mm === null) {
    for (const name of names) html.style.removeProperty(name);
    delete html.dataset[CROP_MARKS_DATASET_KEY];
    return;
  }
  for (const [name, value] of Object.entries(cropMarksCssVars(mm))) html.style.setProperty(name, value);
  html.dataset[CROP_MARKS_DATASET_KEY] = String(mm);
}

/* ---------- הגדלה/הקטנה של הדף ---------- */

async function resizeSections(
  host: ShulchanTarget,
  deltaMm: number,
  failedAction: string,
): Promise<{ ok: true; sections: number } | { ok: false; message: string }> {
  const sections = sectionsApi(host);
  if (
    typeof sections?.list !== 'function' ||
    typeof sections.setPageSetup !== 'function' ||
    typeof sections.setPageMargins !== 'function'
  ) {
    const outcome = unavailableOutcome(failedAction);
    return { ok: false, message: outcome.ok ? failedAction : outcome.message };
  }
  const delta = deltaMm / MM_PER_INCH;
  let items: readonly SectionItemLike[];
  try {
    items = (await sections.list())?.items ?? [];
  } catch (error) {
    return { ok: false, message: thrownText(failedAction, error) };
  }

  const num = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;
  const step = async (call: () => MaybePromise<DocReceipt>): Promise<string | null> => {
    try {
      const receipt = await call();
      if (receipt?.success === false && receipt.failure?.code !== 'NO_OP') return receiptFailureText(failedAction, receipt);
      return null;
    } catch (error) {
      return thrownText(failedAction, error);
    }
  };

  let changed = 0;
  for (const section of items) {
    if (section.address === undefined) continue;
    const width = num(section.pageSetup?.width);
    const height = num(section.pageSetup?.height);
    if (width === null || height === null) continue;
    const target = section.address;

    const grow = (value: unknown): number | undefined => {
      const current = num(value);
      return current === null ? undefined : Math.max(0, current + delta);
    };

    let error = await step(() => sections.setPageSetup!({ target, width: width + 2 * delta, height: height + 2 * delta }));
    if (error) return { ok: false, message: error };

    const margins: Record<string, number> = {};
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      const next = grow(section.margins?.[side]);
      if (next !== undefined) margins[side] = next;
    }
    if (Object.keys(margins).length > 0) {
      error = await step(() => sections.setPageMargins!({ target, ...margins }));
      if (error) return { ok: false, message: error };
    }

    const header = grow(section.headerFooterMargins?.header);
    const footer = grow(section.headerFooterMargins?.footer);
    if ((header !== undefined || footer !== undefined) && typeof sections.setHeaderFooterMargins === 'function') {
      error = await step(() =>
        sections.setHeaderFooterMargins!({
          target,
          ...(header !== undefined ? { header } : {}),
          ...(footer !== undefined ? { footer } : {}),
        }),
      );
      if (error) return { ok: false, message: error };
    }
    changed += 1;
  }
  return { ok: true, sections: changed };
}

async function identityOf(host: ShulchanTarget): Promise<CropMarksIdentity | null> {
  const blocks = await readShulchanBlocks(host);
  if (blocks === null) return null;
  return {
    docKey: documentKey(blocks),
    blockIds: blocks.slice(0, MAX_IDENTITY_BLOCKS).map((block) => block.blockId),
  };
}

/** מוסיפה סימני חיתוך: מגדילה את הדפים, רושמת את המידה, ומדליקה את הציור. */
export async function addCropMarks(
  host: ShulchanTarget,
  mm: number,
  store: SettingsStore,
  root: Document | null = typeof document === 'undefined' ? null : document,
): Promise<CropMarksResult> {
  if (!isValidCropMm(mm)) {
    return { ok: false, message: `${ADD_FAILED}: יש להזין בין ${CROP_MARKS_MIN_MM} ל-${CROP_MARKS_MAX_MM} מ"מ`, sections: 0, mm };
  }
  const identity = await identityOf(host);
  if (identity === null) {
    const outcome = unavailableOutcome(ADD_FAILED);
    return { ok: false, message: outcome.ok ? undefined : outcome.message, sections: 0, mm };
  }
  if ((await loadCropMarks(store, identity.docKey)) !== null || (await indexedCropMarks(store, identity)) !== null) {
    return { ok: false, message: `${ADD_FAILED}: ${CROP_MARKS_EXIST_TEXT}`, sections: 0, mm };
  }
  const resized = await resizeSections(host, mm, ADD_FAILED);
  if (!resized.ok) return { ok: false, message: resized.message, sections: 0, mm };
  const record = { docKey: identity.docKey, mm };
  await saveCropMarks(store, identity.docKey, record);
  await addToCropMarksIndex(store, { ...record, blockIds: identity.blockIds });
  if (root) applyCropMarksStyle(mm, root);
  return { ok: true, sections: resized.sections, mm };
}

/** מסירה סימני חיתוך: מקטינה את הדפים בדיוק במה שהוגדלו, ומכבה את הציור. */
export async function removeCropMarks(
  host: ShulchanTarget,
  store: SettingsStore,
  root: Document | null = typeof document === 'undefined' ? null : document,
): Promise<CropMarksResult> {
  const identity = await identityOf(host);
  if (identity === null) {
    const outcome = unavailableOutcome(REMOVE_FAILED);
    return { ok: false, message: outcome.ok ? undefined : outcome.message, sections: 0, mm: 0 };
  }
  const record = (await loadCropMarks(store, identity.docKey)) ?? (await indexedCropMarks(store, identity));
  if (record === null) return { ok: false, message: `${REMOVE_FAILED}: ${NO_CROP_MARKS_TEXT}`, sections: 0, mm: 0 };
  const resized = await resizeSections(host, -record.mm, REMOVE_FAILED);
  if (!resized.ok) return { ok: false, message: resized.message, sections: 0, mm: record.mm };
  await saveCropMarks(store, record.docKey, null);
  await removeFromCropMarksIndex(store, record);
  if (root) applyCropMarksStyle(null, root);
  return { ok: true, sections: resized.sections, mm: record.mm };
}

/**
 * מחזירה את הציור למסמך שנפתח מחדש: הרשומה נשמרת בין הפעלות, אבל משתני
 * ה-CSS לא. נקראת כשמסמך נעשה פעיל.
 */
export async function restoreCropMarksStyle(
  host: ShulchanTarget,
  store: SettingsStore,
  root: Document | null = typeof document === 'undefined' ? null : document,
): Promise<number | null> {
  const identity = await identityOf(host);
  const record = identity === null
    ? null
    : (await loadCropMarks(store, identity.docKey)) ?? (await indexedCropMarks(store, identity));
  if (root) applyCropMarksStyle(record?.mm ?? null, root);
  return record?.mm ?? null;
}
