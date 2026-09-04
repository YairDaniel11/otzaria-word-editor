/**
 * זיכרון אפשרויות של דיאלוגי „שולחן העורך” — המיזוג הטהור של ערך שמור לתוך
 * ברירות המחדל, והמסלול המלא מול `storage.get`/`storage.set` של אוצריא.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mergeRemembered, useRememberedOptions } from '../../src/composables/useRememberedOptions';
import { loadSetting, saveSetting } from '../../src/host/settings';

afterEach(() => {
  delete (window as Partial<Window>).Otzaria;
});

describe('mergeRemembered', () => {
  const defaults = () => ({ bold: true, percent: 30, mode: 'percent', styleId: null as string | null });

  it('ערך שמור תקין דורס את ברירות המחדל, שדה-שדה', () => {
    expect(mergeRemembered(defaults(), { bold: false, percent: 50 })).toEqual({
      bold: false,
      percent: 50,
      mode: 'percent',
      styleId: null,
    });
  });

  it('מפתח שאינו בברירות המחדל נזרק; טיפוס שונה נזרק; השאר נשמר', () => {
    expect(mergeRemembered(defaults(), { bold: 'yes', percent: '50', mode: 'fixed', legacy: 1 })).toEqual({
      bold: true,
      percent: 30,
      mode: 'fixed',
      styleId: null,
    });
  });

  it('מספר שאינו סופי נזרק', () => {
    expect(mergeRemembered(defaults(), { percent: Number.NaN })?.percent).toBe(30);
  });

  it('שדה שברירת המחדל שלו null מקבל מחרוזת או null, ולא דבר אחר', () => {
    expect(mergeRemembered(defaults(), { styleId: 'Heading1' })?.styleId).toBe('Heading1');
    expect(mergeRemembered(defaults(), { styleId: null })?.styleId).toBeNull();
    expect(mergeRemembered(defaults(), { styleId: 7 })?.styleId).toBeNull();
  });

  it('ערך שמור שאינו אובייקט — null, כדי שהקורא ייפול לברירת המחדל', () => {
    expect(mergeRemembered(defaults(), 'junk')).toBeNull();
    expect(mergeRemembered(defaults(), [1, 2])).toBeNull();
    expect(mergeRemembered(defaults(), null)).toBeNull();
  });
});

describe('loadSetting / saveSetting', () => {
  it('קוראת דרך storage.get ומפרשת; ערך חסר או פגום נופל ל-fallback', async () => {
    const stored = new Map<string, unknown>([['k1', { a: 2 }], ['k2', 'junk']]);
    const call = vi.fn(async (method: string, payload: { key: string; value?: unknown }) => {
      if (method === 'storage.get') return { success: true, data: stored.get(payload.key) ?? null, error: null };
      if (method === 'storage.set') stored.set(payload.key, payload.value);
      return { success: true, data: null, error: null };
    });
    window.Otzaria = { call } as never;

    const parse = (raw: unknown) => mergeRemembered({ a: 1 }, raw);
    await expect(loadSetting('k1', { a: 1 }, parse)).resolves.toEqual({ a: 2 });
    await expect(loadSetting('k2', { a: 1 }, parse)).resolves.toEqual({ a: 1 });
    await expect(loadSetting('missing', { a: 1 }, parse)).resolves.toEqual({ a: 1 });

    await saveSetting('k3', { a: 3 });
    expect(stored.get('k3')).toEqual({ a: 3 });
  });

  it('מחוץ לאוצריא — ברירת המחדל, בלי זריקה', async () => {
    await expect(loadSetting('k', { a: 1 }, () => null)).resolves.toEqual({ a: 1 });
    await expect(saveSetting('k', { a: 1 })).resolves.toBeUndefined();
  });
});

describe('useRememberedOptions', () => {
  it('שומר תחת מפתח לפי שם הדיאלוג, וטוען חזרה ממוזג', async () => {
    const stored = new Map<string, unknown>();
    const call = vi.fn(async (method: string, payload: { key: string; value?: unknown }) => {
      if (method === 'storage.get') return { success: true, data: stored.get(payload.key) ?? null, error: null };
      if (method === 'storage.set') stored.set(payload.key, payload.value);
      return { success: true, data: null, error: null };
    });
    window.Otzaria = { call } as never;

    const remembered = useRememberedOptions('typos', () => ({ extraSpaces: true, manyDots: true }));
    await expect(remembered.load()).resolves.toEqual({ extraSpaces: true, manyDots: true });

    await remembered.save({ extraSpaces: false, manyDots: true });
    expect([...stored.keys()]).toEqual(['shulchan-dialog:typos']);
    await expect(remembered.load()).resolves.toEqual({ extraSpaces: false, manyDots: true });
  });
});
