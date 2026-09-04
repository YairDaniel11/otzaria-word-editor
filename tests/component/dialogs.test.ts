/**
 * שלושת הדיאלוגים, כפי שהמשתמש פוגש אותם.
 *
 * שני דברים כאן אינם קוסמטיים, ושניהם התחילו כתקלה אמיתית:
 *
 *   1. **מונה התוצאות** ב-FindReplaceDialog היה ref מקומי שרק נמחק ואף פעם לא
 *      נכתב — כלומר קוד מת, אף שהמנוע מספק `total` ו-`activeIndex`. הוא prop
 *      מעכשיו, וההרכבה היא הדרך היחידה לאמת שהוא באמת מוצג.
 *   2. **הוולידציה של הקישור** היא `normalizeLinkHref` של המנוע ולא נוסח שני,
 *      ובכלל זה דחיית `javascript:` — שאינה כתובת חסרת טעם אלא הרצת קוד בהקשר
 *      של מי שיפתח את המסמך. דיאלוג שמאשר כתובת שהבונה דוחה הוא כפתור שנלחץ
 *      ולא קורה כלום, ולכן שתי השאלות חייבות להיות אותה שאלה.
 *
 * `LinkDialog` נבדק דרך ה-DOM של ה-document ולא דרך ה-wrapper, מפני שהוא
 * מרונדר ב-Teleport לגוף הדף — וזה מכוון: `.word-ribbon-body` חותך בגובה, ולכן
 * דיאלוג שנפתח מתוך לשונית אינו יכול להישאר בעץ שלה.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DOMWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import FindReplaceDialog from '../../src/ui/panels/FindReplaceDialog.vue';
import LinkDialog from '../../src/ui/panels/LinkDialog.vue';
import AboutDialog from '../../src/ui/panels/AboutDialog.vue';
import { LINK_HREF_HINT } from '../../src/engine/payloads';
import { REPLACE_UNAVAILABLE_TEXT } from '../../src/engine/search';
import { autoUnmount, mountUi, settle } from './harness';

autoUnmount();

/** אלמנט מתוך ה-Teleport, כ-wrapper שאפשר ללחוץ עליו. */
function teleported(selector: string): DOMWrapper<Element> {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`לא נמצא ${selector} בגוף הדף`);
  return new DOMWrapper(element);
}

describe('FindReplaceDialog', () => {
  it('סגור אינו מרונדר בכלל', () => {
    const harness = mountUi(FindReplaceDialog, { props: { isOpen: false } });
    expect(harness.wrapper.find('[role="dialog"]').exists()).toBe(false);
  });

  it('פתיחה ממקדת את שדה החיפוש', async () => {
    const harness = mountUi(FindReplaceDialog, { props: { isOpen: false } });
    await harness.wrapper.setProps({ isOpen: true });
    await settle();

    expect(document.activeElement).toBe(harness.wrapper.find('#fr-search-input').element);
  });

  /**
   * „חפש במסמך” של Tell Me מגיע כ-`initialQuery`. הוא של אותה פתיחה בלבד:
   * פתיחה רגילה (ריקה) חייבת לשמור את מה שהמשתמש חיפש קודם, כמו ב-Word.
   */
  it('שאילתה מבחוץ נכנסת בפתיחה, וגם בדיאלוג שכבר פתוח', async () => {
    const harness = mountUi(FindReplaceDialog, { props: { isOpen: false, initialQuery: 'אלף' } });
    await harness.wrapper.setProps({ isOpen: true });
    await settle();

    const input = harness.wrapper.find<HTMLInputElement>('#fr-search-input');
    expect(input.element.value).toBe('אלף');
    expect(harness.wrapper.emitted('query-change')).toEqual([['אלף']]);

    await harness.wrapper.setProps({ initialQuery: 'בית' });
    await settle();
    expect(input.element.value).toBe('בית');
  });

  it('פתיחה בלי שאילתה מבחוץ אינה מוחקת את החיפוש האחרון', async () => {
    const harness = mountUi(FindReplaceDialog, { props: { isOpen: true } });
    await settle();

    const input = harness.wrapper.find<HTMLInputElement>('#fr-search-input');
    await input.setValue('גימל');
    await harness.wrapper.setProps({ isOpen: false });
    await harness.wrapper.setProps({ isOpen: true });
    await settle();

    expect(input.element.value).toBe('גימל');
  });

  it('מונה התוצאות מוצג כהודעת מצב חיה', async () => {
    const harness = mountUi(FindReplaceDialog, {
      props: { isOpen: true, resultText: '3 מתוך 12' },
    });
    await settle();

    const counter = harness.wrapper.find('[role="status"]');
    expect(counter.text()).toBe('3 מתוך 12');
    expect(counter.attributes('aria-live')).toBe('polite');
  });

  it('בלי מונה — אין תיבה ריקה שנראית כמו „אין תוצאות”', async () => {
    const harness = mountUi(FindReplaceDialog, { props: { isOpen: true, resultText: '' } });
    await settle();
    expect(harness.wrapper.find('[role="status"]').exists()).toBe(false);
  });

  it('`canReplace: false` מסתיר את פקדי ההחלפה ומסביר במקומם', async () => {
    // Ctrl+H מבקש „החלף” גם כשהמנוע אינו מאפשר החלפה, ואז הדיאלוג נשאר בחיפוש.
    const harness = mountUi(FindReplaceDialog, {
      props: { isOpen: true, canReplace: false, initialMode: 'replace' },
    });
    await settle();

    expect(harness.wrapper.find('#fr-replace-input').exists()).toBe(false);
    expect(harness.wrapper.findAll('[role="tab"]')).toHaveLength(1);
    expect(harness.wrapper.find('[role="note"]').text()).toBe(REPLACE_UNAVAILABLE_TEXT);
    expect(harness.wrapper.text()).not.toContain('החלף הכל');
  });

  it('`canReplace: true` פותח את מצב ההחלפה, ושני הכפתורים פולטים את הטקסט', async () => {
    const harness = mountUi(FindReplaceDialog, {
      props: { isOpen: true, canReplace: true, initialMode: 'replace' },
    });
    await settle();

    await harness.wrapper.find('#fr-search-input').setValue('רש״י');
    await harness.wrapper.find('#fr-replace-input').setValue('רשב״י');

    const buttons = harness.wrapper.findAll('.fr-btn');
    const replace = buttons.find((button) => button.text() === 'החלף');
    const replaceAll = buttons.find((button) => button.text() === 'החלף הכל');
    await replace?.trigger('click');
    await replaceAll?.trigger('click');

    // `SearchHandle.replace` מקבל ארגומנט אחד — הטקסט החלופי בלבד.
    expect(harness.wrapper.emitted('replace')).toEqual([['רשב״י']]);
    expect(harness.wrapper.emitted('replace-all')).toEqual([['רשב״י']]);
  });

  it('החלפה שנשלחה למנוע מנטרלת את הפקדים עד שהיא חוזרת', async () => {
    const harness = mountUi(FindReplaceDialog, {
      props: { isOpen: true, canReplace: true, initialMode: 'replace', isReplacing: true },
    });
    await settle();
    await harness.wrapper.find('#fr-search-input').setValue('רש״י');

    const replace = harness.wrapper
      .findAll('.fr-btn')
      .find((button) => button.text() === 'החלף');
    expect(replace?.attributes('disabled')).toBeDefined();
  });

  it('Enter מחפש קדימה, Shift+Enter אחורה, ושדה ריק אינו מחפש כלל', async () => {
    const harness = mountUi(FindReplaceDialog, { props: { isOpen: true } });
    await settle();

    const input = harness.wrapper.find('#fr-search-input');
    await input.trigger('keydown', { key: 'Enter' });
    expect(harness.wrapper.emitted('find')).toBeUndefined();

    await input.setValue('בבא מציעא');
    await input.trigger('keydown', { key: 'Enter' });
    await input.trigger('keydown', { key: 'Enter', shiftKey: true });

    expect(harness.wrapper.emitted('find')).toEqual([
      ['בבא מציעא', 'next'],
      ['בבא מציעא', 'prev'],
    ]);
  });

  it('הקלדה פולטת `query-change` — ההשקטה אינה בקומפוננטה', async () => {
    const harness = mountUi(FindReplaceDialog, { props: { isOpen: true } });
    await settle();

    await harness.wrapper.find('#fr-search-input').setValue('תוספות');
    expect(harness.wrapper.emitted('query-change')).toEqual([['תוספות']]);
  });

  it('Escape סוגר', async () => {
    const harness = mountUi(FindReplaceDialog, { props: { isOpen: true } });
    await settle();

    await harness.wrapper.find('[role="dialog"]').trigger('keydown.esc');
    expect(harness.wrapper.emitted('close')).toHaveLength(1);
  });
});

describe('LinkDialog', () => {
  it('סגור אינו בגוף הדף', () => {
    mountUi(LinkDialog, { props: { isOpen: false } });
    expect(document.querySelector('.link-dialog')).toBeNull();
  });

  it('פתיחה ממקדת את שדה הכתובת', async () => {
    const harness = mountUi(LinkDialog, { props: { isOpen: false } });
    await harness.wrapper.setProps({ isOpen: true });
    await settle();

    expect(document.activeElement).toBe(document.querySelector('#ld-href-input'));
  });

  it('כתובת שאינה חוקית — שגיאה מוצגת, והאישור חסום', async () => {
    mountUi(LinkDialog, { props: { isOpen: true } });
    await settle();

    const href = teleported('#ld-href-input');
    await href.setValue('בבא מציעא');
    await nextTick();

    expect(teleported('.ld-error').text()).toBe(LINK_HREF_HINT);
    expect(href.attributes('aria-invalid')).toBe('true');
    expect(teleported('.ld-btn-primary').attributes('disabled')).toBeDefined();
  });

  it('`javascript:` נדחה — הוא הרצת קוד ולא כתובת', async () => {
    const harness = mountUi(LinkDialog, { props: { isOpen: true } });
    await settle();

    await teleported('#ld-href-input').setValue('javascript:alert(1)');
    await nextTick();

    expect(teleported('.ld-btn-primary').attributes('disabled')).toBeDefined();
    await teleported('.ld-btn-primary').trigger('click');
    expect(harness.wrapper.emitted('submit')).toBeUndefined();
  });

  it('דיאלוג שנפתח נקי אינו מציג שגיאה לפני שאיש הקליד', async () => {
    mountUi(LinkDialog, { props: { isOpen: true } });
    await settle();
    expect(document.querySelector('.ld-error')).toBeNull();
  });

  it('כתובת חוקית נפלטת עם הטקסט להצגה', async () => {
    const harness = mountUi(LinkDialog, { props: { isOpen: true, hasRange: false } });
    await settle();

    await teleported('#ld-href-input').setValue('https://otzaria.org');
    await teleported('#ld-text-input').setValue('אוצריא');
    await nextTick();
    await teleported('.ld-btn-primary').trigger('click');

    expect(harness.wrapper.emitted('submit')).toEqual([
      [{ href: 'https://otzaria.org', text: 'אוצריא' }],
    ]);
  });

  it('עם טווח מסומן אין שדה טקסט — המנוע מתעלם ממנו', async () => {
    // המסלול הוא `hyperlinks.wrap`, שמעטיף את הטקסט הקיים. שדה שאין לו השפעה
    // גרוע משדה שאינו קיים.
    mountUi(LinkDialog, {
      props: { isOpen: true, hasRange: true, selectedText: 'ועיין שם' },
    });
    await settle();

    expect(document.querySelector('#ld-text-input')).toBeNull();
    expect(teleported('.ld-note').text()).toContain('ועיין שם');
  });

  it('פתיחה חוזרת מנקה את הכתובת מהפעם הקודמת', async () => {
    const harness = mountUi(LinkDialog, { props: { isOpen: true } });
    await settle();
    await teleported('#ld-href-input').setValue('https://otzaria.org');

    await harness.wrapper.setProps({ isOpen: false });
    await harness.wrapper.setProps({ isOpen: true });
    await settle();

    expect((document.querySelector('#ld-href-input') as HTMLInputElement).value).toBe('');
  });

  it('Escape סוגר', async () => {
    const harness = mountUi(LinkDialog, { props: { isOpen: true } });
    await settle();

    await teleported('.link-dialog').trigger('keydown.esc');
    expect(harness.wrapper.emitted('close')).toHaveLength(1);
  });
});

describe('AboutDialog', () => {
  /** vitest רץ משורש המאגר, ולכן package.json נמצא ביחס ל-cwd. */
  const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
    version: string;
    dependencies: Record<string, string>;
  };

  it('סגור אינו מרונדר', () => {
    const harness = mountUi(AboutDialog, { props: { isOpen: false } });
    expect(harness.wrapper.find('[role="dialog"]').exists()).toBe(false);
  });

  it('פתוח מכריז על עצמו כדיאלוג מודאלי, עם שם נגיש', async () => {
    // `aria-modal` בלי שם היה חלון שקורא מסך מכריז „דיאלוג” ולא אומר איזה.
    const harness = mountUi(AboutDialog, { props: { isOpen: true } });
    await settle();

    const dialog = harness.wrapper.find('[role="dialog"]');
    expect(dialog.attributes('aria-modal')).toBe('true');

    const titleId = dialog.attributes('aria-labelledby');
    expect(titleId).toBeTruthy();
    expect(harness.wrapper.find(`#${titleId}`).text()).toBe('וורד לאוצריא');
    expect(harness.wrapper.find('.about-close-btn').attributes('aria-label')).toBeTruthy();
  });

  it('הגרסאות המוצגות הן אלה שב-package.json', async () => {
    // שני מספרים קשיחים בקומפוננטה (ראו ההסבר שם), ולכן הדריפט נתפס כאן:
    // שדרוג גרסה שישכח את הדיאלוג מפיל את הבדיקה הזאת.
    const harness = mountUi(AboutDialog, { props: { isOpen: true } });
    await settle();

    const text = harness.wrapper.text();
    expect(text).toContain(`גרסה ${pkg.version}`);
    expect(text).toContain(`SuperDoc ${pkg.dependencies.superdoc}`);
    expect(text).toContain('AGPL-3.0');
  });

  it('הפתיחה ממקדת פקד בתוך החלון, והסגירה מחזירה את המיקוד', async () => {
    // בלי זה המיקוד נשאר על הכפתור שברצועה שמאחורי חלון שהוכרז „מודאלי”.
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const harness = mountUi(AboutDialog, { props: { isOpen: false } });
    await harness.wrapper.setProps({ isOpen: true });
    await settle();

    expect(harness.wrapper.find('[role="dialog"]').element.contains(document.activeElement)).toBe(
      true,
    );

    await harness.wrapper.setProps({ isOpen: false });
    await settle();

    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('Tab אינו יוצא מהחלון — אחרת ההצהרה `aria-modal` שקרית', async () => {
    const harness = mountUi(AboutDialog, { props: { isOpen: false } });
    await harness.wrapper.setProps({ isOpen: true });
    await settle();

    const dialog = harness.wrapper.find('[role="dialog"]');
    const buttons = harness.wrapper.findAll('button');
    const first = buttons[0].element as HTMLElement;
    const last = buttons[buttons.length - 1].element as HTMLElement;

    last.focus();
    await dialog.trigger('keydown', { key: 'Tab' });
    expect(document.activeElement, 'מהאחרון חזרה לראשון').toBe(first);

    await dialog.trigger('keydown', { key: 'Tab', shiftKey: true });
    expect(document.activeElement, 'ומהראשון אחורה לאחרון').toBe(last);
  });

  it('Escape סוגר גם מתוך החלון עצמו', async () => {
    const harness = mountUi(AboutDialog, { props: { isOpen: true } });
    await settle();

    await harness.wrapper.find('[role="dialog"]').trigger('keydown.esc');
    expect(harness.wrapper.emitted('close')).toHaveLength(1);
  });

  it('שני כפתורי הסגירה והלחיצה על הרקע סוגרים', async () => {
    const harness = mountUi(AboutDialog, { props: { isOpen: true } });
    await settle();

    await harness.wrapper.find('.about-close-btn').trigger('click');
    await harness.wrapper.find('.about-btn').trigger('click');
    // `@click.self`: לחיצה על הרקע בלבד, ולא על הדיאלוג שבתוכו.
    await harness.wrapper.find('.modal-backdrop').trigger('click');

    expect(harness.wrapper.emitted('close')).toHaveLength(3);
  });

  it('לחיצה בתוך הדיאלוג אינה סוגרת אותו', async () => {
    const harness = mountUi(AboutDialog, { props: { isOpen: true } });
    await settle();

    await harness.wrapper.find('.about-body').trigger('click');
    expect(harness.wrapper.emitted('close')).toBeUndefined();
  });
});
