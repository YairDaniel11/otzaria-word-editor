/**
 * דיאלוג הסימניות, וההגעה אליו מלשונית „הוספה”.
 *
 * למה קובץ ייעודי: הסורק הגנרי ב-ribbon-tabs.test.ts לוחץ על הכפתור העליון של
 * כל פקד ומוודא שמשהו קרה — וכאן הלחיצה רק פותחת דיאלוג. הפעולות עצמן, בחירה
 * מתוך רשימה ולחיצה על „מחק” או „שנה שם”, אינן נמדדות שם בכלל: החלפה בין
 * `remove` ל-`rename` הייתה עוברת את כל החבילה בירוק. אותה סיבה בדיוק שהולידה
 * את fields-menu.test.ts.
 *
 * הדיאלוג נבדק דרך ה-DOM של ה-document ולא דרך ה-wrapper, מפני שהוא מרונדר
 * ב-Teleport לגוף הדף — כמו LinkDialog, ומאותו טעם.
 */
import { describe, expect, it } from 'vitest';
import { DOMWrapper } from '@vue/test-utils';
import BookmarkDialog from '../../src/ui/panels/BookmarkDialog.vue';
import InsertTab from '../../src/ui/ribbon/tabs/InsertTab.vue';
import { BOOKMARK_NAME_HINT, BOOKMARK_NAME_TAKEN_HINT } from '../../src/engine/bookmarks';
import { autoUnmount, createSuperdocDouble, mountUi, settle, tipSelector, tipStartsSelector } from './harness';

autoUnmount();

/** אלמנט מתוך ה-Teleport, כ-wrapper שאפשר ללחוץ עליו. */
function teleported(selector: string): DOMWrapper<Element> {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`לא נמצא ${selector} בגוף הדף`);
  return new DOMWrapper(element);
}

/** הכפתורים בתחתית הדיאלוג, לפי הסדר שהתבנית קובעת. */
function footerButton(label: string): DOMWrapper<Element> {
  const buttons = [...document.querySelectorAll('.bookmark-dialog .bd-btn')];
  const found = buttons.find((button) => button.textContent?.trim() === label);
  if (!found) throw new Error(`לא נמצא הכפתור „${label}” בדיאלוג`);
  return new DOMWrapper(found);
}

const BOOKMARK_BUTTON = tipStartsSelector('סימון הפסקה');

describe('BookmarkDialog', () => {
  it('סגור אינו מרונדר בכלל', () => {
    mountUi(BookmarkDialog, { props: { isOpen: false } });
    expect(document.querySelector('.bookmark-dialog')).toBeNull();
  });

  it('פתיחה ממקדת את שדה השם', async () => {
    const harness = mountUi(BookmarkDialog, { props: { isOpen: false } });
    await harness.wrapper.setProps({ isOpen: true });
    await settle();

    expect(document.activeElement).toBe(document.querySelector('#bd-name-input'));
  });

  it('שם עברי תקין מאפשר „הוסף” ואינו מציג שגיאה', async () => {
    const harness = mountUi(BookmarkDialog, { props: { isOpen: true } });
    await settle();

    await teleported('#bd-name-input').setValue('פרק_ראשון');
    await settle();

    expect(document.querySelector('.bd-error')).toBeNull();
    expect(footerButton('הוסף').attributes('disabled')).toBeUndefined();

    await footerButton('הוסף').trigger('click');
    expect(harness.wrapper.emitted('add')).toEqual([['פרק_ראשון']]);
  });

  it('שם עם רווח חוסם את „הוסף” ומסביר מה מותר', async () => {
    const harness = mountUi(BookmarkDialog, { props: { isOpen: true } });
    await settle();

    await teleported('#bd-name-input').setValue('שם עם רווח');
    await settle();

    expect(teleported('.bd-error').text()).toBe(BOOKMARK_NAME_HINT);
    expect(footerButton('הוסף').attributes('disabled')).toBeDefined();
    expect(harness.wrapper.emitted('add')).toBeUndefined();
  });

  it('„מחק” ו„שנה שם” מנוטרלים עד שנבחרה סימנייה מהרשימה', async () => {
    mountUi(BookmarkDialog, { props: { isOpen: true, names: ['הקדמה', 'פרק_א'] } });
    await settle();

    expect(footerButton('מחק').attributes('disabled')).toBeDefined();
    expect(footerButton('שנה שם').attributes('disabled')).toBeDefined();
  });

  it('בחירה ברשימה היא היעד של „מחק” — ולא הפריט הראשון', async () => {
    // זו הבדיקה שהסורק הגנרי אינו יכול לעשות: הוא אינו לוחץ על פריט ברשימה.
    const harness = mountUi(BookmarkDialog, {
      props: { isOpen: true, names: ['הקדמה', 'פרק_א'] },
    });
    await settle();

    const items = [...document.querySelectorAll('.bd-list-item')];
    expect(items.map((item) => item.textContent?.trim())).toEqual(['הקדמה', 'פרק_א']);

    await new DOMWrapper(items[1]!).trigger('click');
    await settle();

    await footerButton('מחק').trigger('click');
    expect(harness.wrapper.emitted('remove')).toEqual([['פרק_א']]);
  });

  it('„שנה שם” שולח את היעד שנבחר ואת השם החדש, ולא להפך', async () => {
    const harness = mountUi(BookmarkDialog, {
      props: { isOpen: true, names: ['הקדמה', 'פרק_א'] },
    });
    await settle();

    await new DOMWrapper(document.querySelectorAll('.bd-list-item')[0]!).trigger('click');
    await settle();
    await teleported('#bd-name-input').setValue('הקדמת_המחבר');
    await settle();

    await footerButton('שנה שם').trigger('click');
    expect(harness.wrapper.emitted('rename')).toEqual([[{ from: 'הקדמה', to: 'הקדמת_המחבר' }]]);
  });

  it('שם זהה לשם הקיים אינו „שינוי שם”', async () => {
    mountUi(BookmarkDialog, { props: { isOpen: true, names: ['הקדמה'] } });
    await settle();

    // הבחירה ממלאת את השדה בשם עצמו, ולכן זהו בדיוק המצב שאחרי לחיצה.
    await new DOMWrapper(document.querySelectorAll('.bd-list-item')[0]!).trigger('click');
    await settle();

    expect(footerButton('שנה שם').attributes('disabled')).toBeDefined();
  });

  it('שם שכבר קיים נחסם כאן, ובשם המפורש', async () => {
    // המנוע כן דוחה שם כפול, אבל ההודעה שלו מגיעה למשתמש כתרגום הגנרי של
    // `INVALID_INPUT` — „ערך שאינו חוקי” על שם תקין לגמרי. לכן זה נחסם כאן.
    const harness = mountUi(BookmarkDialog, { props: { isOpen: true, names: ['הקדמה'] } });
    await settle();

    await teleported('#bd-name-input').setValue('הקדמה');
    await settle();

    expect(teleported('.bd-error').text()).toBe(BOOKMARK_NAME_TAKEN_HINT);
    expect(footerButton('הוסף').attributes('disabled')).toBeDefined();
    expect(harness.wrapper.emitted('add')).toBeUndefined();
  });

  it('„שם תפוס” ו„שם פסול” אינם אותה הודעה', async () => {
    mountUi(BookmarkDialog, { props: { isOpen: true, names: ['הקדמה'] } });
    await settle();

    await teleported('#bd-name-input').setValue('שם עם רווח');
    await settle();
    expect(teleported('.bd-error').text()).toBe(BOOKMARK_NAME_HINT);

    await teleported('#bd-name-input').setValue('הקדמה');
    await settle();
    expect(teleported('.bd-error').text()).toBe(BOOKMARK_NAME_TAKEN_HINT);
  });

  it('שינוי שם ליעד תפוס חסום, ולשם פנוי מותר', async () => {
    mountUi(BookmarkDialog, { props: { isOpen: true, names: ['הקדמה', 'פרק_א'] } });
    await settle();

    await new DOMWrapper(document.querySelectorAll('.bd-list-item')[0]!).trigger('click');
    await settle();
    await teleported('#bd-name-input').setValue('פרק_א');
    await settle();
    expect(footerButton('שנה שם').attributes('disabled')).toBeDefined();

    await teleported('#bd-name-input').setValue('פרק_ב');
    await settle();
    expect(footerButton('שנה שם').attributes('disabled')).toBeUndefined();
  });

  it('בחירה ברשימה אינה מדליקה שגיאה — גם על שם שהגיע מ-Word', async () => {
    // מסמך שנוצר ב-Word יכול להחזיק שם שאינו עומד בכללים שלנו. לחיצה עליו
    // כדי למחוק אותו אינה הקלדה, ושגיאה אדומה עליה מאשימה את המשתמש בטעות
    // שלא עשה. מרגע שהוא נוגע בשדה — זו כבר הקלדה, והשגיאה נדלקת.
    mountUi(BookmarkDialog, { props: { isOpen: true, names: ['שם עם רווח'] } });
    await settle();

    await new DOMWrapper(document.querySelectorAll('.bd-list-item')[0]!).trigger('click');
    await settle();

    expect(document.querySelector('.bd-error')).toBeNull();
    expect(footerButton('מחק').attributes('disabled')).toBeUndefined();

    await teleported('#bd-name-input').setValue('שם עם רווח ועוד');
    await settle();
    expect(teleported('.bd-error').text()).toBe(BOOKMARK_NAME_HINT);
  });

  it('מסמך בלי סימניות אומר זאת, ואינו מציג רשימה ריקה', async () => {
    mountUi(BookmarkDialog, { props: { isOpen: true, names: [] } });
    await settle();

    expect(document.querySelector('.bd-list')).toBeNull();
    expect(document.querySelector('.bookmark-dialog')!.textContent).toContain('אין סימניות במסמך');
  });
});

describe('„סימנייה” בלשונית „הוספה”', () => {
  it('הלחיצה קוראת את הסימניות מהמסמך ופותחת את הדיאלוג', async () => {
    const harness = mountUi(InsertTab, { superdoc: createSuperdocDouble() });
    await settle();

    await harness.wrapper.find(BOOKMARK_BUTTON).trigger('click');
    await settle();

    expect(harness.superdoc.ops()).toContain('bookmarks.list');
    expect(document.querySelector('.bookmark-dialog')).not.toBeNull();
  });

  it('„הוסף” מגיע ל-`bookmarks.insert` עם השם שהוקלד', async () => {
    const harness = mountUi(InsertTab, { superdoc: createSuperdocDouble() });
    await settle();

    await harness.wrapper.find(BOOKMARK_BUTTON).trigger('click');
    await settle();

    await teleported('#bd-name-input').setValue('הקדמת_המחבר');
    await settle();
    await footerButton('הוסף').trigger('click');
    await settle();

    const inputs = harness.superdoc.inputs('bookmarks.insert') as { name: string }[];
    expect(inputs.map((input) => input.name)).toEqual(['הקדמת_המחבר']);
    // הרשימה נקראת מחדש אחרי הפעולה: הדיאלוג נשאר פתוח ומציג את המסמך.
    expect(harness.superdoc.ops().filter((op) => op === 'bookmarks.list').length).toBeGreaterThan(1);
    expect(harness.failures()).toEqual([]);
  });

  it('שם פסול אינו מגיע למנוע בכלל — הכפתור חסום', async () => {
    const harness = mountUi(InsertTab, { superdoc: createSuperdocDouble() });
    await settle();

    await harness.wrapper.find(BOOKMARK_BUTTON).trigger('click');
    await settle();

    await teleported('#bd-name-input').setValue('שם עם רווח');
    await settle();

    expect(footerButton('הוסף').attributes('disabled')).toBeDefined();
    expect(harness.superdoc.ops()).not.toContain('bookmarks.insert');
  });

  it('פעולת סימניות שהמנוע חוסם מדווחת בעברית ואינה מפילה את הלשונית', async () => {
    const superdoc = createSuperdocDouble({
      failures: { 'bookmarks.insert': { code: 'PRECONDITION_FAILED' } },
    });
    const harness = mountUi(InsertTab, { superdoc });
    await settle();

    await harness.wrapper.find(BOOKMARK_BUTTON).trigger('click');
    await settle();
    await teleported('#bd-name-input').setValue('הקדמה');
    await settle();
    await footerButton('הוסף').trigger('click');
    await settle();

    const failures = harness.failures();
    expect(failures).toHaveLength(1);
    expect(failures[0]!.commandId).toBe('bookmark-insert');
    expect(failures[0]!.outcome.ok === false && failures[0]!.outcome.message).toContain(
      'הוספת הסימנייה נכשלה',
    );
  });

  it('מנוע בלי `bookmarks.rename` — הפקד מנוטרל עם הסבר, ולא נעלם', async () => {
    const harness = mountUi(InsertTab, {
      superdoc: createSuperdocDouble({ denied: ['bookmarks.rename'] }),
    });
    await settle();

    const button = harness.wrapper.find(tipSelector('הפעולה אינה זמינה בגרסה הזאת של המנוע'));
    expect(button.exists()).toBe(true);
    expect(button.attributes('disabled')).toBeDefined();
  });
});
