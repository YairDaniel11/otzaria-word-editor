/**
 * רצועת הטאבים (חלק 2). קומפוננטה "טיפשה" — props+events בלבד, בלי חיבור
 * ל-open-flow — ולכן נבדקת ישירות עם `mount`, בלי תשתית ה-injects של harness.
 */
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import DocumentTabsBar, { type DocumentTabItem } from '../../src/ui/shell/DocumentTabsBar.vue';
import { autoUnmount, settle } from './harness';

autoUnmount();

const TABS: DocumentTabItem[] = [
  { id: 'a', title: 'ספר ראשון', isDirty: false },
  { id: 'b', title: 'ספר שני', isDirty: true },
];

describe('רצועת הטאבים', () => {
  it('מרנדרת טאב לכל מסמך, עם role נגיש', async () => {
    const wrapper = mount(DocumentTabsBar, { props: { tabs: TABS, activeId: 'a' } });
    await settle();

    const tabs = wrapper.findAll('[role="tab"]');
    expect(tabs).toHaveLength(2);
    expect(wrapper.find('[role="tablist"]').exists()).toBe(true);
    expect(tabs[0].text()).toContain('ספר ראשון');
    expect(tabs[1].text()).toContain('ספר שני');
  });

  it('מסמך ללא שם מוצג כברירת מחדל', async () => {
    const wrapper = mount(DocumentTabsBar, {
      props: { tabs: [{ id: 'a', title: '', isDirty: false }], activeId: 'a' },
    });
    await settle();

    expect(wrapper.find('[role="tab"]').text()).toContain('מסמך ללא שם');
  });

  it('הטאב הפעיל מסומן, והשאר לא', async () => {
    const wrapper = mount(DocumentTabsBar, { props: { tabs: TABS, activeId: 'b' } });
    await settle();

    const tabs = wrapper.findAll('[role="tab"]');
    expect(tabs[0].attributes('aria-selected')).toBe('false');
    expect(tabs[1].attributes('aria-selected')).toBe('true');
    expect(tabs[1].classes()).toContain('active');
  });

  it('מצב "לא נשמר" מוצג רק על טאב מלוכלך', async () => {
    const wrapper = mount(DocumentTabsBar, { props: { tabs: TABS, activeId: 'a' } });
    await settle();

    const tabs = wrapper.findAll('[role="tab"]');
    expect(tabs[0].find('.word-doctab-dirty').exists()).toBe(false);
    expect(tabs[1].find('.word-doctab-dirty').exists()).toBe(true);
  });

  it('לחיצה על טאב פולטת select-tab עם המזהה הנכון', async () => {
    const wrapper = mount(DocumentTabsBar, { props: { tabs: TABS, activeId: 'a' } });
    await settle();

    await wrapper.findAll('[role="tab"]')[1].trigger('click');
    expect(wrapper.emitted('select-tab')).toEqual([['b']]);
  });

  it('לחיצה על כפתור הסגירה פולטת close-tab, ולא select-tab', async () => {
    const wrapper = mount(DocumentTabsBar, { props: { tabs: TABS, activeId: 'a' } });
    await settle();

    await wrapper.findAll('.word-doctab-close')[1].trigger('click');
    expect(wrapper.emitted('close-tab')).toEqual([['b']]);
    expect(wrapper.emitted('select-tab')).toBeUndefined();
  });

  it('כפתור "+" פולט new-tab', async () => {
    const wrapper = mount(DocumentTabsBar, { props: { tabs: TABS, activeId: 'a' } });
    await settle();

    await wrapper.find('.word-doctabs-new').trigger('click');
    expect(wrapper.emitted('new-tab')).toHaveLength(1);
  });

  it('ניווט מקלדת בין טאבים (RTL: חץ שמאלה מתקדם) פולט select-tab', async () => {
    const wrapper = mount(DocumentTabsBar, { props: { tabs: TABS, activeId: 'a' } });
    await settle();

    await wrapper.find('[role="tablist"]').trigger('keydown', { key: 'ArrowLeft' });
    expect(wrapper.emitted('select-tab')).toEqual([['b']]);
  });

  it('כפתור הסגירה נגיש: aria-label בעברית עם שם המסמך', async () => {
    const wrapper = mount(DocumentTabsBar, { props: { tabs: TABS, activeId: 'a' } });
    await settle();

    const close = wrapper.findAll('.word-doctab-close')[0];
    expect(close.attributes('aria-label')).toBe('סגור את ספר ראשון');
  });

  it('רשימה ריקה אינה נופלת', async () => {
    const wrapper = mount(DocumentTabsBar, { props: { tabs: [], activeId: null } });
    await settle();

    expect(wrapper.findAll('[role="tab"]')).toHaveLength(0);
  });
});
