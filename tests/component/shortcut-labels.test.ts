/**
 * התווית שהמשתמש רואה. עד עכשיו היא הייתה מחרוזת חופשית ב-tooltip, ולכן
 * „Ctrl+B” הופיע על כפתור „מודגש” שנתיים בלי שאיש קשר את הצירוף. כאן נבדק
 * שהיא באה מהרשימה — ורק ממנה.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import RibbonButton from '../../src/ui/ribbon/common/RibbonButton.vue';
import FileTab from '../../src/ui/ribbon/tabs/FileTab.vue';
import HomeTab from '../../src/ui/ribbon/tabs/HomeTab.vue';
import InsertTab from '../../src/ui/ribbon/tabs/InsertTab.vue';
import ViewTab from '../../src/ui/ribbon/tabs/ViewTab.vue';
import { SHORTCUTS, shortcutLabel } from '../../src/ui/shortcuts/registry';
import { autoUnmount, mountUi, settle, tipMessage, tipOf } from './harness';

autoUnmount();

describe('תווית הקיצור בכפתור', () => {
  it('התווית נשלפת מהרשימה, ויושבת בשדה משלה', () => {
    const wrapper = mount(RibbonButton, {
      props: { label: 'שמור', shortcutId: 'save' },
    });

    // שדה נפרד, ולא סוגריים בסוף מחרוזת: הכרטיס מצייר אותו כשבשבת מקשים,
    // ובדיקה שנעולה על הפורמט של הסוגריים הייתה נשברת מכל שינוי עיצובי.
    expect(wrapper.attributes('data-tip-title')).toBe('שמור');
    expect(wrapper.attributes('data-tip-shortcut')).toBe('Ctrl+S');
  });

  it('הצירוף נכנס לשם הנגיש של כפתור אייקון — שם אין דרך אחרת לדעת אותו', () => {
    const wrapper = mount(RibbonButton, {
      props: { icon: 'save', tooltip: 'שמור', shortcutId: 'save' },
    });

    expect(wrapper.attributes('aria-label')).toBe('שמור (Ctrl+S)');
    // `title` הוא מה שצייר טולטיפ שני, אפור, מעל הכרטיס. הוא אינו חוזר.
    expect(wrapper.attributes('title')).toBeUndefined();
  });

  it('כפתור עם תווית גלויה אינו מקבל aria-label שדורס אותה', () => {
    const wrapper = mount(RibbonButton, {
      props: { label: 'שמור', variant: 'large', shortcutId: 'save' },
    });

    // השם הנגיש מגיע מהתוכן. `aria-label` כאן היה מוסיף „(Ctrl+S)” כרעש,
    // ושובר שליטה קולית שמצפה שהשם יהיה מה שכתוב על הכפתור.
    expect(wrapper.attributes('aria-label')).toBeUndefined();
    expect(wrapper.text()).toContain('שמור');
    expect(wrapper.attributes('data-tip-shortcut')).toBe('Ctrl+S');
  });

  it('tooltip מפורש יורד להסבר, והתווית נשארת הכותרת', () => {
    const wrapper = mount(RibbonButton, {
      props: { label: 'שמור', tooltip: 'שמירת המסמך', shortcutId: 'save' },
    });

    expect(wrapper.attributes('data-tip-title')).toBe('שמור');
    expect(wrapper.attributes('data-tip-desc')).toBe('שמירת המסמך');
  });

  it('כפתור בלי קיצור אינו ממציא שבשבת ריקה', () => {
    const wrapper = mount(RibbonButton, { props: { label: 'אודות' } });

    expect(wrapper.attributes('data-tip-title')).toBe('אודות');
    expect(wrapper.attributes('data-tip-shortcut')).toBeUndefined();
  });

  it('shortcutLabel מחזירה את מה שברשימה', () => {
    for (const shortcut of SHORTCUTS) {
      expect(shortcutLabel(shortcut.id)).toBe(shortcut.label);
    }
  });
});

describe('הרצועה מציגה את הצירופים האמיתיים', () => {
  it('„שמור” ו„שמור בשם” מציגים את הצירוף מהרשימה', async () => {
    const { wrapper } = mountUi(FileTab, { props: { hasDocument: true } });

    const pairs = wrapper
      .findAll('button')
      .map((button) => `${tipMessage(button)} | ${tipOf(button).shortcut}`);

    expect(pairs).toContain('שמירת שינויים במסמך | Ctrl+S');
    expect(pairs).toContain('שמירת המסמך כקובץ חדש | Ctrl+Shift+S');
    expect(pairs).toContain('הדפסת המסמך | Ctrl+P');
  });

  it('אין באף לשונית צירוף שאינו ברשימה', async () => {
    // הבדיקה רצה על כל הלשוניות שיש בהן קיצור, ולא על אחת: התוויות שהיו
    // שקריות ישבו דווקא ב„בית”.
    //
    // מאז שהצירוף יושב ב-`data-tip-shortcut` אין כאן עוד ניחוש: קודם נשלפו
    // סוגריים מסוף ה-`title` ונדרש סינון („הוספת תמונה מקובץ (PNG או JPEG)”
    // אינו צירוף), והיום כל מה שבשדה הזה *מתיימר* להיות צירוף — ולכן נבדק.
    const labels = new Set(SHORTCUTS.map((shortcut) => shortcut.label));
    const tabs = [FileTab, HomeTab, InsertTab, ViewTab];
    let checked = 0;

    for (const tab of tabs) {
      const { wrapper } = mountUi(tab, { props: { hasDocument: true } });
      await settle();

      for (const button of wrapper.findAll('button')) {
        const shortcut = tipOf(button).shortcut;
        if (!shortcut) continue;
        checked += 1;
        expect(labels, `${tipOf(button).title}: ${shortcut}`).toContain(shortcut);
      }
    }

    // אחרת הלולאה עוברת על ריק ואינה בודקת דבר.
    expect(checked).toBeGreaterThan(8);
  });
});
