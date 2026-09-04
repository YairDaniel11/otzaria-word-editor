/**
 * דיאלוג „גופן מתקדם", וההגעה אליו מלשונית „בית".
 *
 * למה קובץ ייעודי: הסורק הגנרי לא בודק את תוכן ה-payload. מה שנבדק כאן:
 * רק שדות שמולאו יוצאים למנוע („ללא שינוי" = לא נשלח), אזהרת ה-vanish
 * מופיעה בזמן, והכשל של המנוע מדווח בעברית. הדיאלוג נבדק דרך ה-DOM —
 * Teleport לגוף הדף, כמו BookmarkDialog.
 */
import { describe, expect, it } from 'vitest';
import { DOMWrapper } from '@vue/test-utils';
import FontAdvancedDialog from '../../src/ui/panels/FontAdvancedDialog.vue';
import HomeTab from '../../src/ui/ribbon/tabs/HomeTab.vue';
import { autoUnmount, createSuperdocDouble, mountUi, settle, tipSelector } from './harness';

autoUnmount();

function teleported(selector: string): DOMWrapper<Element> {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`לא נמצא ${selector} בגוף הדף`);
  return new DOMWrapper(element);
}

function footerButton(label: string): DOMWrapper<Element> {
  const buttons = [...document.querySelectorAll('.fontadv-dialog .fa-footer .fa-btn')];
  const found = buttons.find((button) => button.textContent?.trim() === label);
  if (!found) throw new Error(`לא נמצא הכפתור „${label}" בדיאלוג`);
  return new DOMWrapper(found);
}

const ADVANCED_BUTTON = tipSelector('מתקדם');

describe('FontAdvancedDialog (בדיד)', () => {
  it('סגור אינו מרונדר בכלל', () => {
    mountUi(FontAdvancedDialog, { props: { isOpen: false, busy: false } });
    expect(document.querySelector('.fontadv-dialog')).toBeNull();
  });

  it('פתיחה ממקדת את שורש הדיאלוג', async () => {
    const harness = mountUi(FontAdvancedDialog, { props: { isOpen: false, busy: false } });
    await harness.wrapper.setProps({ isOpen: true });
    await settle();

    expect(document.activeElement).toBe(document.querySelector('.fontadv-dialog'));
  });

  it('Escape סוגר', async () => {
    const harness = mountUi(FontAdvancedDialog, { props: { isOpen: true, busy: false } });
    await settle();

    await teleported('.fontadv-dialog').trigger('keydown.esc');
    expect(harness.wrapper.emitted('close')).toHaveLength(1);
  });

  it('busy מנטרל „אישור" ומשאיר „ביטול" חי', () => {
    mountUi(FontAdvancedDialog, { props: { isOpen: true, busy: true } });

    expect(footerButton('אישור').attributes('disabled')).toBeDefined();
    expect(footerButton('ביטול').attributes('disabled')).toBeUndefined();
  });

  it('שדות לא-ממולאים אינם נשלחים — רק מה שהמשתמש מילא', async () => {
    const harness = mountUi(FontAdvancedDialog, { props: { isOpen: true, busy: false } });
    await settle();

    await teleported('#fa-scale').setValue('150');
    await teleported('#fa-dstrike').setValue('yes');
    await settle();
    await footerButton('אישור').trigger('click');
    await settle();

    const emissions = harness.wrapper.emitted('submit');
    expect(emissions).toHaveLength(1);
    expect(emissions?.[0]?.[0]).toEqual({ charScale: 150, dstrike: true });
  });

  it('„טקסט מוסתר = כן" מציג אזהרה גלויה', async () => {
    mountUi(FontAdvancedDialog, { props: { isOpen: true, busy: false } });
    await settle();

    expect(document.querySelector('.fa-warning')).toBeNull();
    await teleported('#fa-vanish').setValue('yes');
    await settle();

    expect(teleported('.fa-warning').text()).toContain('יוסתר');
  });
});

describe('„גופן מתקדם" בלשונית „בית"', () => {
  it('הלחיצה פותחת את הדיאלוג', async () => {
    const harness = mountUi(HomeTab, { superdoc: createSuperdocDouble() });
    await settle();

    await harness.wrapper.find(ADVANCED_BUTTON).trigger('click');
    await settle();

    expect(document.querySelector('.fontadv-dialog')).not.toBeNull();
  });

  it('„אישור" מגיע ל-format.apply פעם אחת, עם ה-inline שנבנה', async () => {
    const harness = mountUi(HomeTab, {
      superdoc: createSuperdocDouble({ selection: { hasRange: true } }),
    });
    await settle();
    await harness.wrapper.find(ADVANCED_BUTTON).trigger('click');
    await settle();

    await teleported('#fa-scale').setValue('125');
    await teleported('#fa-position').setValue('3');
    await settle();
    await footerButton('אישור').trigger('click');
    await settle();

    const inputs = harness.superdoc.inputs('format.apply') as { inline: Record<string, unknown> }[];
    expect(inputs).toHaveLength(1);
    expect(inputs[0]!.inline).toEqual({ charScale: 125, position: 3 });
    expect(harness.failures()).toEqual([]);
  });

  it('כשל של המנוע מדווח בעברית ואינו מפיל את הלשונית', async () => {
    const superdoc = createSuperdocDouble({
      failures: { 'format.apply': { code: 'PRECONDITION_FAILED' } },
      selection: { hasRange: true },
    });
    const harness = mountUi(HomeTab, { superdoc });
    await settle();
    await harness.wrapper.find(ADVANCED_BUTTON).trigger('click');
    await settle();

    await teleported('#fa-scale').setValue('200');
    await settle();
    await footerButton('אישור').trigger('click');
    await settle();

    const failures = harness.failures();
    expect(failures).toHaveLength(1);
    expect(failures[0]!.commandId).toBe('font-advanced');
    expect(failures[0]!.outcome.ok === false && failures[0]!.outcome.message).toContain(
      'החלת עיצוב הגופן נכשלה',
    );
    // הלשונית חיה: פתיחה חוזרת עובדת.
    await harness.wrapper.find(ADVANCED_BUTTON).trigger('click');
    await settle();
    expect(document.querySelector('.fontadv-dialog')).not.toBeNull();
  });
});
