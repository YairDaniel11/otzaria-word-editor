/**
 * „אחידות עמוד וטורים” — איתור מקטעים שסטו מהגדרות העמוד של שאר המסמך
 * (תוצאה שכיחה של הדבקות בין מסמכים) והשוואתם לפרופיל אחד שהמשתמש בוחר.
 * נויד מ-EditingErrors.bas של שולחן העורך (PagesSize + ColumnWidth).
 *
 * הקריאה — `doc.sections.list()` (אינצ'ים, כמו setPageMargins — ראו
 * page-setup.ts); הקיבוץ — לפי ערכים מעוגלים לאלפית אינץ', כדי ששני מקטעים
 * שנבדלים ברעש עשרוני לא יוצגו כשני פרופילים.
 */
import type { CommandOutcome } from '../command-adapter';
import { receiptFailureText, thrownText, type DocReceipt, type MaybePromise } from '../document-api';
import { shulchanDoc, unavailableOutcome, type ShulchanTarget } from './shulchan-doc';

interface SectionItemLike {
  address?: unknown;
  pageSetup?: { width?: number; height?: number };
  margins?: { top?: number; right?: number; bottom?: number; left?: number };
  columns?: { count?: number; gap?: number; equalWidth?: boolean };
}

interface SectionsApi {
  list?: () => MaybePromise<{ items?: readonly SectionItemLike[] } | undefined>;
  setPageSetup?: (input: { target: unknown; width?: number; height?: number }) => MaybePromise<DocReceipt>;
  setPageMargins?: (input: {
    target: unknown;
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  }) => MaybePromise<DocReceipt>;
  setColumns?: (input: {
    target: unknown;
    count?: number;
    gap?: number;
    equalWidth?: boolean;
  }) => MaybePromise<DocReceipt>;
}

function sectionsApi(host: ShulchanTarget): SectionsApi | undefined {
  return (shulchanDoc(host) as { sections?: SectionsApi } | undefined)?.sections;
}

/** פרופיל עמוד של מקטע — הכל באינצ'ים, כמו ב-API של המקטעים. */
export interface PageProfile {
  widthIn: number;
  heightIn: number;
  topIn: number;
  rightIn: number;
  bottomIn: number;
  leftIn: number;
}

export interface PageProfileGroup {
  profile: PageProfile;
  /** כמה מקטעים נושאים את הפרופיל הזה. */
  sections: number;
}

const ROUND = 1000;

function roundIn(value: unknown, fallback: number): number {
  const num = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.round(num * ROUND) / ROUND;
}

function cmText(inches: number): string {
  return `${(Math.round(inches * 2.54 * 100) / 100).toLocaleString('he-IL')} ס"מ`;
}

/** תווית פרופיל לרשימת הבחירה — הנוסח של המקור, בס"מ. */
export function pageProfileLabel(profile: PageProfile): string {
  return [
    `אורך: ${cmText(profile.heightIn)}`,
    `רוחב: ${cmText(profile.widthIn)}`,
    `עליונים: ${cmText(profile.topIn)}`,
    `תחתונים: ${cmText(profile.bottomIn)}`,
    `ימניים: ${cmText(profile.rightIn)}`,
    `שמאליים: ${cmText(profile.leftIn)}`,
  ].join(' , ');
}

const READ_FAILED = 'קריאת המקטעים נכשלה';
const APPLY_PAGE_FAILED = 'החלת גודל העמוד והשוליים נכשלה';
const APPLY_COLUMNS_FAILED = 'החלת רוחב הטורים נכשלה';

/** A4 — ברירת המחדל כשמקטע לא דיווח ערך. */
const DEFAULT_PAGE: PageProfile = { widthIn: 8.27, heightIn: 11.69, topIn: 1, rightIn: 1, bottomIn: 1, leftIn: 1 };

async function listSections(
  host: ShulchanTarget,
  failedAction: string,
): Promise<{ ok: true; items: readonly SectionItemLike[] } | { ok: false; outcome: CommandOutcome }> {
  const list = sectionsApi(host)?.list;
  if (typeof list !== 'function') return { ok: false, outcome: unavailableOutcome(failedAction) };
  try {
    const result = await list();
    return { ok: true, items: result?.items ?? [] };
  } catch (error) {
    return { ok: false, outcome: { ok: false, message: thrownText(failedAction, error), reason: 'threw' } };
  }
}

/** הפרופילים הקיימים במסמך, מקובצים. פרופיל אחד = אין שגיאות אחידות. */
export async function readPageProfiles(
  host: ShulchanTarget,
): Promise<{ ok: true; groups: PageProfileGroup[] } | { ok: false; outcome: CommandOutcome }> {
  const sections = await listSections(host, READ_FAILED);
  if (!sections.ok) return sections;

  const groups = new Map<string, PageProfileGroup>();
  for (const item of sections.items) {
    const profile: PageProfile = {
      widthIn: roundIn(item.pageSetup?.width, DEFAULT_PAGE.widthIn),
      heightIn: roundIn(item.pageSetup?.height, DEFAULT_PAGE.heightIn),
      topIn: roundIn(item.margins?.top, DEFAULT_PAGE.topIn),
      rightIn: roundIn(item.margins?.right, DEFAULT_PAGE.rightIn),
      bottomIn: roundIn(item.margins?.bottom, DEFAULT_PAGE.bottomIn),
      leftIn: roundIn(item.margins?.left, DEFAULT_PAGE.leftIn),
    };
    const key = JSON.stringify(profile);
    const existing = groups.get(key);
    if (existing) existing.sections += 1;
    else groups.set(key, { profile, sections: 1 });
  }
  return { ok: true, groups: [...groups.values()] };
}

async function callReceipt(
  failedAction: string,
  call: () => MaybePromise<DocReceipt>,
): Promise<CommandOutcome> {
  try {
    const receipt = await call();
    if (receipt?.success === false) {
      return { ok: false, message: receiptFailureText(failedAction, receipt), reason: receipt.failure?.code };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, message: thrownText(failedAction, error), reason: 'threw' };
  }
}

/** מחילה פרופיל עמוד אחד על **כל** המקטעים — זו בדיוק מטרת הכלי. */
export async function applyPageProfile(host: ShulchanTarget, profile: PageProfile): Promise<CommandOutcome> {
  const api = sectionsApi(host);
  if (typeof api?.setPageSetup !== 'function' || typeof api.setPageMargins !== 'function') {
    return unavailableOutcome(APPLY_PAGE_FAILED);
  }
  const sections = await listSections(host, APPLY_PAGE_FAILED);
  if (!sections.ok) return sections.outcome;

  for (const item of sections.items) {
    const target = item.address;
    const setup = await callReceipt(APPLY_PAGE_FAILED, () =>
      api.setPageSetup!({ target, width: profile.widthIn, height: profile.heightIn }),
    );
    if (!setup.ok) return setup;
    const margins = await callReceipt(APPLY_PAGE_FAILED, () =>
      api.setPageMargins!({
        target,
        top: profile.topIn,
        right: profile.rightIn,
        bottom: profile.bottomIn,
        left: profile.leftIn,
      }),
    );
    if (!margins.ok) return margins;
  }
  return { ok: true };
}

/* ---------- טורים ---------- */

export interface ColumnsProfile {
  count: number;
  gapIn: number;
  equalWidth: boolean;
}

export interface ColumnsProfileGroup {
  profile: ColumnsProfile;
  sections: number;
}

export function columnsProfileLabel(profile: ColumnsProfile): string {
  const width = profile.equalWidth ? 'טורים שווים' : 'טורים לא שווים';
  return `${profile.count} טורים , מרווח בין טורים: ${cmText(profile.gapIn)} , ${width}`;
}

/**
 * מספר הטורים שהכלי עובד עליו — שניים בדיוק, כמו `ColumnWidth` במקור
 * (`NumberOfColumns = 2`). מקטע טור-יחיד אינו טעות אחידות, ומקטע של שלושה
 * טורים ומעלה הוא פריסה מכוונת (טבלת מפתחות, למשל) שאין להשוות למקטעי
 * הגוף — ולכן שניהם מחוץ לקיבוץ ומחוץ להחלה.
 */
const UNIFORM_COLUMN_COUNT = 2;

function isUniformCandidate(item: SectionItemLike): boolean {
  return item.columns?.count === UNIFORM_COLUMN_COUNT;
}

/** הפרופילים של מקטעי שני-הטורים בלבד. */
export async function readColumnsProfiles(
  host: ShulchanTarget,
): Promise<{ ok: true; groups: ColumnsProfileGroup[] } | { ok: false; outcome: CommandOutcome }> {
  const sections = await listSections(host, READ_FAILED);
  if (!sections.ok) return sections;

  const groups = new Map<string, ColumnsProfileGroup>();
  for (const item of sections.items) {
    if (!isUniformCandidate(item)) continue;
    const profile: ColumnsProfile = {
      count: UNIFORM_COLUMN_COUNT,
      gapIn: roundIn(item.columns?.gap, 0.5),
      equalWidth: item.columns?.equalWidth !== false,
    };
    const key = JSON.stringify(profile);
    const existing = groups.get(key);
    if (existing) existing.sections += 1;
    else groups.set(key, { profile, sections: 1 });
  }
  return { ok: true, groups: [...groups.values()] };
}

/**
 * מחילה פרופיל טורים על כל מקטעי שני-הטורים. `count` אינו נכתב — הכלי משווה
 * מרווח ורוחב, לא מספר טורים, וכתיבתו הייתה דורסת בשקט מקטע שהמשתמש עיצב
 * אחרת.
 */
export async function applyColumnsProfile(host: ShulchanTarget, profile: ColumnsProfile): Promise<CommandOutcome> {
  const api = sectionsApi(host);
  if (typeof api?.setColumns !== 'function') return unavailableOutcome(APPLY_COLUMNS_FAILED);
  const sections = await listSections(host, APPLY_COLUMNS_FAILED);
  if (!sections.ok) return sections.outcome;

  for (const item of sections.items) {
    if (!isUniformCandidate(item)) continue;
    const outcome = await callReceipt(APPLY_COLUMNS_FAILED, () =>
      api.setColumns!({
        target: item.address,
        gap: profile.gapIn,
        equalWidth: profile.equalWidth,
      }),
    );
    if (!outcome.ok) return outcome;
  }
  return { ok: true };
}

/** „3 מקטעים” מול „מקטע אחד” — ליד כל פרופיל ברשימת הבחירה. */
export function sectionCountText(count: number): string {
  return count === 1 ? 'מקטע אחד' : `${count} מקטעים`;
}

export const UNIFORM_NO_ERRORS_TEXT = 'לא נמצאו שגיאות — כל המקטעים אחידים';
