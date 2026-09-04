/**
 * זיכרון אפשרויות של דיאלוג בין הפעלות — המקבילה ל-`SettingsHelper.bas`
 * של שולחן העורך (שם: קובץ INI לכל טופס; כאן: `storage.*` של אוצריא).
 *
 * הדיאלוג קורא `load()` בפתיחה ו-`save()` בשליחה ובביטול — כמו במקור, שבו
 * גם „ביטול” שמר את מה שהמשתמש שינה. ערך שנשמר בגרסה קודמת ואינו מתאים
 * לצורה של היום (מפתח שנעלם, טיפוס אחר) נזרק שדה-שדה, ולא כולו: מי שהוסיף
 * אפשרות אחת לדיאלוג אינו מאפס למשתמש את כל השאר.
 */
import { loadSetting, saveSetting } from '../host/settings';

/**
 * מיזוג ערך שמור לתוך ברירות המחדל: רק מפתחות שקיימים בברירת המחדל, ורק
 * כשהטיפוס הפרימיטיבי זהה. `null` כשהערך השמור אינו אובייקט כלל.
 * טהור ומיוצא — כדי שהאימות ייבדק בלי `window.Otzaria`.
 */
export function mergeRemembered<T extends object>(defaults: T, raw: unknown): T | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const stored = raw as Record<string, unknown>;
  const base = defaults as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...base };
  for (const key of Object.keys(base)) {
    const fallback = base[key];
    const value = stored[key];
    if (value === undefined) continue;
    // `null` הוא ערך לגיטימי רק כשברירת המחדל עצמה מרשה אותו.
    if (value === null) {
      if (fallback === null) merged[key] = null;
      continue;
    }
    if (fallback === null) {
      if (typeof value === 'string') merged[key] = value;
      continue;
    }
    if (typeof value !== typeof fallback || Array.isArray(value) !== Array.isArray(fallback)) continue;
    if (typeof value === 'number' && !Number.isFinite(value)) continue;
    merged[key] = value;
  }
  return merged as T;
}

export interface RememberedOptions<T extends object> {
  /** הערך השמור ממוזג לברירות המחדל; ברירות המחדל לבדן כשאין זיכרון. */
  load: () => Promise<T>;
  /** שמירה שקטה — כשל אינו מדווח, כמו בכל זיכרון של העדפה. */
  save: (value: T) => Promise<void>;
}

const KEY_PREFIX = 'shulchan-dialog:';

export function useRememberedOptions<T extends object>(
  name: string,
  defaults: () => T,
): RememberedOptions<T> {
  const key = `${KEY_PREFIX}${name}`;
  return {
    load: () => loadSetting(key, defaults(), (raw) => mergeRemembered(defaults(), raw)),
    save: (value) => saveSetting(key, { ...value }),
  };
}
