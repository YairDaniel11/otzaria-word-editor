/**
 * קבוצת „מפתח” בלשונית „הפניות”, ומה שהמנוע **קיבל בפועל** ממנה.
 *
 * למה קובץ ייעודי: הסורק הגנרי ב-ribbon-tabs.test.ts לוחץ על כל כפתור ובודק
 * שמשהו קרה — הוא אינו יודע *מה* קרה, ואינו נוגע בדיאלוגים בכלל. שני הפקדים
 * שבהם „משהו קרה” אינו מספיק הם „סמן ערך למפתח” ו„הסר מפתח”: הראשון הוא
 * הפעולה שתבוצע מאות פעמים בספר, וקידוד תת-הערך שלו (נקודתיים בטקסט ולא
 * מתג `\s`) הוא ההכרעה המרכזית של הגל — סימון שנשלח בצורה השנייה נראה שם
 * זהה לחלוטין, וכותב למסמך שדה ש-Word יתעלם מחציו.
 *
 * הדיאלוגים נבדקים דרך ה-DOM של ה-document ולא דרך ה-wrapper, מפני שהם
 * מרונדרים ב-Teleport לגוף הדף — כמו BookmarkDialog, ומאותו טעם.
 */
import { describe, expect, it } from 'vitest';
import { DOMWrapper } from '@vue/test-utils';
import ReferencesTab from '../../src/ui/ribbon/tabs/ReferencesTab.vue';
import { autoUnmount, createSuperdocDouble, mountUi, settle, tipMessage, type Harness } from './harness';

autoUnmount();

/** מסמך עם מפתח אחד, ערך אחד שסומן, וטקסט מסומן בעורך. */
const withIndex = () =>
  createSuperdocDouble({
    index: {
      ids: ['idx-1'],
      columns: 3,
      runIn: true,
      entries: [{ blockId: 'block-1', offset: 0, text: 'אבות', subEntry: 'אברהם' }],
    },
    selection: { blockId: 'block-1', hasRange: true, text: 'הלכות שבת' },
  });

function button(harness: Harness, label: string): DOMWrapper<Element> {
  const found = harness.wrapper
    .findAll('button')
    .find((node) => node.text().trim() === label);
  if (!found) throw new Error(`לא נמצא הכפתור „${label}” בלשונית`);
  return found;
}

function teleported(selector: string): DOMWrapper<Element> {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`לא נמצא ${selector} בגוף הדף`);
  return new DOMWrapper(element);
}

function dialogButton(scope: string, label: string): DOMWrapper<Element> {
  const found = [...document.querySelectorAll(`${scope} button`)].find(
    (node) => node.textContent?.trim() === label,
  );
  if (!found) throw new Error(`לא נמצא הכפתור „${label}” ב-${scope}`);
  return new DOMWrapper(found);
}

describe('„הוסף מפתח”', () => {
  it('מכניס בסוף המסמך עם ההגדרות כבר ביצירה', async () => {
    const superdoc = createSuperdocDouble();
    const harness = mountUi(ReferencesTab, { superdoc });
    await settle();

    superdoc.reset();
    await button(harness, 'הוסף מפתח').trigger('click');
    await settle();

    expect(superdoc.inputs('index.insert')).toEqual([
      { at: { kind: 'documentEnd' }, config: { columns: 2, runIn: false } },
    ]);
    expect(harness.failures()).toEqual([]);
  });
});

describe('„עדכן מפתח”', () => {
  it('בונה מחדש את המפתח שבמסמך', async () => {
    const superdoc = withIndex();
    const harness = mountUi(ReferencesTab, { superdoc });
    await settle();

    superdoc.reset();
    await button(harness, 'עדכן מפתח').trigger('click');
    await settle();

    expect(superdoc.inputs('index.rebuild')).toEqual([
      { target: { kind: 'block', nodeType: 'index', nodeId: 'idx-1' } },
    ]);
    expect(harness.failures()).toEqual([]);
  });

  it('מסמך בלי מפתח — ה-tooltip אומר זאת, והלחיצה מדווחת ולא שותקת', async () => {
    const harness = mountUi(ReferencesTab);
    await settle();

    expect(tipMessage(button(harness, 'עדכן מפתח'))).toBe('אין במסמך מפתח לעדכן');

    await button(harness, 'עדכן מפתח').trigger('click');
    await settle();

    expect(harness.failures()).toEqual([
      {
        commandId: 'index-rebuild',
        outcome: {
          ok: false,
          message: 'עדכון המפתח נכשל: אין במסמך מפתח',
          reason: 'no-index',
        },
      },
    ]);
  });
});

describe('„הסר מפתח”', () => {
  it('מוחק את הבלוק ואינו נוגע ב-`blocks.*`', async () => {
    // ההבדל המכוון מ„הסר תוכן עניינים”: המפתח הוא בלוק יחיד, וניקוי שיירים
    // כאן היה מוחק פסקאות של המשתמש. ההנמקה ב-engine/index-field.ts.
    const superdoc = withIndex();
    const harness = mountUi(ReferencesTab, { superdoc });
    await settle();

    superdoc.reset();
    await button(harness, 'הסר מפתח').trigger('click');
    await settle();

    expect(superdoc.inputs('index.remove')).toEqual([
      { target: { kind: 'block', nodeType: 'index', nodeId: 'idx-1' } },
    ]);
    expect(superdoc.ops().some((op) => op.startsWith('blocks.'))).toBe(false);
    expect(harness.failures()).toEqual([]);
  });

  it('שני מפתחות — מסרב ואינו מנחש איזה למחוק', async () => {
    const superdoc = createSuperdocDouble({ index: { ids: ['idx-1', 'idx-2'] } });
    const harness = mountUi(ReferencesTab, { superdoc });
    await settle();

    superdoc.reset();
    await button(harness, 'הסר מפתח').trigger('click');
    await settle();

    expect(superdoc.ops()).not.toContain('index.remove');
    expect(harness.failures()[0]?.outcome).toEqual({
      ok: false,
      message:
        'הסרת המפתח נכשלה: יש במסמך יותר ממפתח אחד, ואין דרך לדעת על איזה מהם הפעולה חלה',
      reason: 'ambiguous-index',
    });
  });
});

describe('„הגדרות מפתח”', () => {
  it('נפתח על מה שבמסמך, ומחיל ואז בונה מחדש', async () => {
    const superdoc = withIndex();
    const harness = mountUi(ReferencesTab, { superdoc });
    await settle();

    await button(harness, 'הגדרות מפתח').trigger('click');
    await settle();

    // ההגדרות שבדיאלוג הן אלה שהמסמך מצהיר עליהן, ולא ברירת מחדל.
    expect((teleported('#id-columns').element as HTMLSelectElement).value).toBe('3');
    expect((teleported('.id-check input').element as HTMLInputElement).checked).toBe(true);

    superdoc.reset();
    await dialogButton('.index-dialog', 'אישור').trigger('click');
    await settle();

    expect(superdoc.inputs('index.configure')).toEqual([
      {
        target: { kind: 'block', nodeType: 'index', nodeId: 'idx-1' },
        patch: { columns: 3, runIn: true },
      },
    ]);
    // `configure` כותב מתגים ואינו אוסף ערכים מחדש (נמדד), ולכן העדכון
    // רץ מיד אחריו — בלעדיו נשאר על המסך מצב שאינו תואם את מה שאושר.
    expect(superdoc.inputs('index.rebuild').length).toBe(1);
    expect(harness.failures()).toEqual([]);
    expect(document.querySelector('.index-dialog')).toBeNull();
  });
});

describe('„סמן ערך למפתח”', () => {
  it('שולח את תת-הערך כנקודתיים בתוך הטקסט, ולא כשדה `subEntry`', async () => {
    // זו ההכרעה המרכזית של הגל. `subEntry` מתקבל במנוע עם `success: true`
    // וכותב `XE "…" \s "…"` — `\s` אינו מתג של שדה `XE` ב-Word, ותת-הערך
    // היה נעלם בשקט. הצורה הקנונית `XE "ראשי:משני"` נמדדה כמתפרקת בחזרה
    // ל-`text`+`subEntry` במנוע עצמו. ההנמקה ב-engine/index-field.ts.
    const superdoc = withIndex();
    const harness = mountUi(ReferencesTab, { superdoc });
    await settle();

    await button(harness, 'סמן ערך למפתח').trigger('click');
    await settle();

    // הטקסט שסומן בעורך הוא ההצעה, בדיוק כמו ב„סמן ערך” של Word.
    const text = teleported('#ie-text');
    expect((text.element as HTMLInputElement).value).toBe('הלכות שבת');

    await text.setValue('שבת');
    await teleported('#ie-sub').setValue('הדלקת נרות');

    superdoc.reset();
    await dialogButton('.index-entry-dialog', 'סמן').trigger('click');
    await settle();

    const sent = superdoc.inputs('index.entries.insert');
    expect(sent.length).toBe(1);
    expect((sent[0] as { entry: unknown }).entry).toEqual({ text: 'שבת:הדלקת נרות' });
    expect(harness.failures()).toEqual([]);

    // נשאר פתוח: סימון ערכים הוא רצף, ודיאלוג שנסגר אחרי כל ערך היה הופך
    // את הפעולה הנפוצה בתוסף לבלתי אפשרית.
    expect(document.querySelector('.index-entry-dialog')).not.toBeNull();
  });

  it('„סמן” מנוטרל כשאין טקסט, ולא נשלח כלום', async () => {
    const superdoc = createSuperdocDouble({
      index: { ids: ['idx-1'] },
      selection: { blockId: 'block-1', hasRange: true, text: '   ' },
    });
    const harness = mountUi(ReferencesTab, { superdoc });
    await settle();

    await button(harness, 'סמן ערך למפתח').trigger('click');
    await settle();

    expect(dialogButton('.index-entry-dialog', 'סמן').attributes('disabled')).toBeDefined();
  });

  it('„בטל סימון” שולח את הכתובת המיקומית של הערך שנבחר', async () => {
    const superdoc = withIndex();
    const harness = mountUi(ReferencesTab, { superdoc });
    await settle();

    await button(harness, 'סמן ערך למפתח').trigger('click');
    await settle();

    // ביטול דורש בחירה ברשימה: בלעדיה אין על מה להחיל אותו.
    expect(dialogButton('.index-entry-dialog', 'בטל סימון').attributes('disabled')).toBeDefined();

    await teleported('.ie-list-item').trigger('click');
    await settle();

    superdoc.reset();
    await dialogButton('.index-entry-dialog', 'בטל סימון').trigger('click');
    await settle();

    expect(superdoc.inputs('index.entries.remove')).toEqual([
      {
        target: {
          kind: 'inline',
          nodeType: 'indexEntry',
          anchor: {
            start: { blockId: 'block-1', offset: 0 },
            end: { blockId: 'block-1', offset: 1 },
          },
        },
      },
    ]);
    expect(harness.failures()).toEqual([]);
  });
});

describe('זמינות', () => {
  it('פעולה שהמנוע מדווח כלא-זמינה מנטרלת את הפקד שלה בלבד, עם הסבר', async () => {
    const superdoc = createSuperdocDouble({
      index: { ids: ['idx-1'] },
      denied: ['index.entries.insert'],
    });
    const harness = mountUi(ReferencesTab, { superdoc });
    await settle();

    const mark = button(harness, 'סמן ערך למפתח');
    expect(mark.attributes('disabled')).toBeDefined();
    expect(tipMessage(mark)).toBe('הפעולה אינה זמינה בגרסה הזאת של המנוע');

    // ושאר הקבוצה נשארת פעילה — פקד מנוטרל אינו מוריד את שכניו.
    expect(button(harness, 'עדכן מפתח').attributes('disabled')).toBeUndefined();
    expect(button(harness, 'הסר מפתח').attributes('disabled')).toBeUndefined();
  });
});
