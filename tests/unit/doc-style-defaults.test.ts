/**
 * „ברירות מחדל למסמך" (styles.apply על docDefaults). הבדיקה על **מה
 * נשלח למנוע** — במיוחד היחידות: docDefaults מקבל חצאי-נקודות גולמיים
 * (נמדד: fontSize 14 → sz="14", שונה מ-format.fontSize שמקבל נקודות),
 * ולכן ההמרה pt→×2 יושבת במודול.
 */
import { describe, expect, it } from 'vitest';
import {
  applyDocStyleDefaults,
  halfPointsToPoints,
  pointsToHalfPoints,
  readDefaultFontSizePt,
} from '../../src/engine/doc-style-defaults';

const ok = () => ({ success: true, changed: true });

function fakeDoc(options: { apply?: (input: unknown) => unknown } = {}) {
  const calls: unknown[] = [];
  const impl = options.apply;
  const doc = {
    ...(impl === undefined
      ? {}
      : {
          styles: {
            apply: (input: unknown) => {
              calls.push(input);
              return impl(input) as never;
            },
          },
        }),
  } as never;
  return { doc, calls, host: { activeEditor: { doc } } };
}

describe('יחידות', () => {
  it('pointsToHalfPoints — 12pt → 24', () => {
    expect(pointsToHalfPoints(12)).toBe(24);
    expect(pointsToHalfPoints(12.5)).toBe(25);
  });

  it('halfPointsToPoints — ההיפוך', () => {
    expect(halfPointsToPoints(24)).toBe(12);
  });
});

describe('applyDocStyleDefaults', () => {
  it('גודל בנקודות נשלח כחצאי-נקודות (14pt → fontSize 28)', async () => {
    const { host, calls } = fakeDoc({ apply: ok });

    const outcome = await applyDocStyleDefaults(host, { fontSizePt: 14 });

    expect(outcome).toEqual({ ok: true });
    expect(calls[0]).toMatchObject({
      target: { scope: 'docDefaults', channel: 'run' },
      // `fontSizeCs` לצדו — בלעדיו הגודל אינו חל על עברית כלל (w:szCs).
      patch: { fontSize: 28, fontSizeCs: 28 },
    });
  });

  it('שם גופן נשלח כ-record ascii/hAnsi/cs, מנוקה מרווחים', async () => {
    const { host, calls } = fakeDoc({ apply: ok });

    await applyDocStyleDefaults(host, { fontFamily: ' David ' });

    expect(calls[0]).toMatchObject({
      patch: { fontFamily: { ascii: 'David', hAnsi: 'David', cs: 'David' } },
    });
  });

  it(`changed:false (חזרה זהה) היא הצלחה — שונה מ-NO_OP, נמדד`, async () => {
    const { host } = fakeDoc({ apply: () => ({ success: true, changed: false }) });

    await expect(applyDocStyleDefaults(host, { fontSizePt: 12 })).resolves.toEqual({ ok: true });
  });

  it('קבלה שנכשלה מתורגמת לעברית', async () => {
    const { host } = fakeDoc({
      apply: () => ({ success: false, failure: { code: 'DOCUMENT_READONLY', message: 'readonly' } }),
    });

    const outcome = await applyDocStyleDefaults(host, { fontSizePt: 12 });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toContain('שינוי ברירות המחדל נכשל');
  });

  it('גודל פסול נעצר לפני המנוע', async () => {
    const { host, calls } = fakeDoc({ apply: ok });

    const outcome = await applyDocStyleDefaults(host, { fontSizePt: -3 });

    expect(outcome).toMatchObject({ ok: false, reason: 'invalid-font-size' });
    expect(calls).toHaveLength(0);
  });

  it('patch ריק נעצר עם הודעה — ולא קריאת מנוע ריקה', async () => {
    const { host, calls } = fakeDoc({ apply: ok });

    const outcome = await applyDocStyleDefaults(host, {});

    expect(outcome).toMatchObject({ ok: false, reason: 'empty-patch' });
    expect(calls).toHaveLength(0);
  });

  it('אין Document API — הנוסח של §12', async () => {
    for (const host of [null, undefined] as never[]) {
      const outcome = await applyDocStyleDefaults(host, { fontSizePt: 12 });
      expect(outcome).toMatchObject({ ok: false, reason: 'command-unsupported' });
    }
  });
});

describe('readDefaultFontSizePt', () => {
  it('dryRun מחזיר את הגודל בחצאי-נקודות והוא מומר לנקודות', async () => {
    const { host } = fakeDoc({
      apply: () => ({
        success: true,
        changed: false,
        dryRun: true,
        before: { fontSize: 24, fontSizeCs: 24 },
        after: {},
      }),
    });

    await expect(readDefaultFontSizePt(host)).resolves.toBe(12);
  });

  /**
   * המקרה שהצדיק את השינוי: מסמך מ-Word שבו הלטיני 11 נק' והעברי 16 —
   * צירוף שכיח בספרי קודש. הדיאלוג חייב להציג את **העברי**, אחרת מי שמתקן
   * את הלטיני מקטין את כל גוף הספר בלי לראות את המספר שהוא משנה.
   */
  it('כששני הערוצים נבדלים, המדווח הוא של העברית (szCs)', async () => {
    const { host } = fakeDoc({
      apply: () => ({
        success: true,
        changed: false,
        dryRun: true,
        before: { fontSize: 22, fontSizeCs: 32 },
        after: {},
      }),
    });

    await expect(readDefaultFontSizePt(host)).resolves.toBe(16);
  });

  it('מסמך בלי szCs נופל ל-fontSize', async () => {
    const { host } = fakeDoc({
      apply: () => ({ success: true, changed: false, dryRun: true, before: { fontSize: 22 }, after: {} }),
    });

    await expect(readDefaultFontSizePt(host)).resolves.toBe(11);
  });

  /** בלי שני הערוצים בבקשה, ה-`before` לא היה מחזיר `fontSizeCs` לעולם. */
  it('הבקשה עצמה שואלת על שני הערוצים', async () => {
    const { host, calls } = fakeDoc({
      apply: () => ({ success: true, changed: false, dryRun: true, before: { fontSize: 24 }, after: {} }),
    });

    await readDefaultFontSizePt(host);

    expect((calls[0] as { patch: Record<string, unknown> }).patch).toEqual({
      fontSize: 0,
      fontSizeCs: 0,
    });
  });

  it('dryRun שנזרק מחזיר null ולא זורק', async () => {
    const throwingHost = {
      activeEditor: {
        doc: {
          styles: {
            apply: () => {
              throw new Error('boom');
            },
          },
        },
      },
    };

    await expect(readDefaultFontSizePt(throwingHost as never)).resolves.toBeNull();
  });

  it('אין styles במנוע — null', async () => {
    await expect(readDefaultFontSizePt(null)).resolves.toBeNull();
  });
});
