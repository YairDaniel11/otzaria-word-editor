/**
 * שער רוחבי: קומפוננטה שמופיעה בתבנית ואינה מיובאת בסקריפט.
 *
 * זה בדיוק סוג הבאג שהסתתר ב-HomeTab.vue: `<RibbonMenuButton>` בתבנית,
 * בלי `import RibbonMenuButton ...` בסקריפט. Vue אינו נופל על זה — הוא
 * מרנדר "אלמנט לא-פתור" בשקט (שום `<button>`, שום שגיאת ריצה), אבל **כן**
 * מדפיס אזהרת dev דרך `console.warn`: `Failed to resolve component: X`.
 * `vue-tsc` לא תופס את זה כי ה-props על התג עוברים type-check מול איפה
 * שהקומפוננטה *מוגדרת* בכל מקום אחר במאגר, לא מול מה שממש מיובא כאן —
 * וסריקת מקור (regex) בכלל לא בודקת ייבוא מול שימוש.
 *
 * הבדיקה כאן מרכיבה כל לשונית סרגל בפועל, ותופסת את האזהרה של Vue עצמו —
 * כלומר תופסת **כל** קומפוננטה לא-מיובאת בכל לשונית, לא רק את זו שכבר תוקנה.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Component } from 'vue';
import FileTab from '../../src/ui/ribbon/tabs/FileTab.vue';
import HomeTab from '../../src/ui/ribbon/tabs/HomeTab.vue';
import InsertTab from '../../src/ui/ribbon/tabs/InsertTab.vue';
import LayoutTab from '../../src/ui/ribbon/tabs/LayoutTab.vue';
import OtzariaTab from '../../src/ui/ribbon/tabs/OtzariaTab.vue';
import ReferencesTab from '../../src/ui/ribbon/tabs/ReferencesTab.vue';
import ReviewTab from '../../src/ui/ribbon/tabs/ReviewTab.vue';
import ViewTab from '../../src/ui/ribbon/tabs/ViewTab.vue';
import DeveloperTab from '../../src/ui/ribbon/tabs/DeveloperTab.vue';
import ShulchanTab from '../../src/ui/ribbon/tabs/ShulchanTab.vue';
import Ribbon from '../../src/ui/ribbon/Ribbon.vue';
import { autoUnmount, createSuperdocDouble, mountUi, settle } from './harness';

autoUnmount();

const withSelection = () =>
  createSuperdocDouble({ selection: { hasRange: true, text: 'טקסט נבחר' } });

const TABS: ReadonlyArray<{ name: string; component: Component; props?: Record<string, unknown> }> = [
  { name: 'קובץ', component: FileTab, props: { hasDocument: true } },
  { name: 'בית', component: HomeTab },
  { name: 'הוספה', component: InsertTab },
  { name: 'פריסה', component: LayoutTab },
  { name: 'הפניות', component: ReferencesTab },
  { name: 'סקירה', component: ReviewTab },
  { name: 'תצוגה', component: ViewTab },
  { name: 'מפתחים', component: DeveloperTab },
  { name: 'שולחן העורך', component: ShulchanTab },
  { name: 'אוצריא', component: OtzariaTab },
  { name: 'הרצועה עצמה', component: Ribbon, props: { hasDocument: true } },
];

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe('אין קומפוננטה לא-פתורה באף לשונית', () => {
  for (const tab of TABS) {
    it(`„${tab.name}”: כל תג בתבנית נפתר לקומפוננטה מיובאת`, async () => {
      mountUi(tab.component, { superdoc: withSelection(), props: tab.props });
      await settle();

      const unresolved = warnSpy.mock.calls
        .map((call) => call.join(' '))
        .filter((message) => message.includes('Failed to resolve component'));

      expect(unresolved, `אזהרות "קומפוננטה לא נפתרה" ב„${tab.name}”`).toEqual([]);
    });
  }
});

describe('בדיקת הבקרה של השער', () => {
  it('תג שאינו מיובא באמת מדפיס את האזהרה — אחרת השער למעלה עובר מהסיבה הלא נכונה', async () => {
    const { defineComponent, h, resolveComponent } = await import('vue');
    const BrokenComponent = defineComponent({
      name: 'BrokenComponent',
      setup() {
        // קומפוננטה שאינה רשומה בשום מקום — בדיוק כמו RibbonMenuButton לפני
        // התיקון, שהיה לו תג בתבנית בלי import תואם.
        return () => h(resolveComponent('TotallyUnimportedThing'));
      },
    });

    mountUi(BrokenComponent);
    await settle();

    const unresolved = warnSpy.mock.calls
      .map((call) => call.join(' '))
      .filter((message) => message.includes('Failed to resolve component'));
    expect(unresolved.length).toBeGreaterThan(0);
  });
});
