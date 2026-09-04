import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TellMeSearch from '../../src/ui/shell/TellMeSearch.vue';
import { autoUnmount, settle } from './harness';

autoUnmount();

describe('קומפוננטת TellMeSearch (חיפוש אפשרויות ופקודות)', () => {
  it('מציגה את שדה החיפוש עם מאפייני נגישות תקניים', () => {
    const wrapper = mount(TellMeSearch);
    const input = wrapper.find('.tell-me-input');

    expect(input.exists()).toBe(true);
    expect(input.attributes('role')).toBe('combobox');
    expect(input.attributes('aria-autocomplete')).toBe('list');
    expect(input.attributes('aria-expanded')).toBe('false');
    expect(input.attributes('aria-label')).toBe('חיפוש אפשרויות, פקודות ועזרה');
    expect(wrapper.find('.tell-me-dropdown').isVisible()).toBe(false);
  });

  it('מיקוד בשדה פותח את התפריט עם הפעולות המוצעות', async () => {
    const wrapper = mount(TellMeSearch);
    const input = wrapper.find('.tell-me-input');

    await input.trigger('focus');
    await settle();

    expect(wrapper.find('.tell-me-dropdown').isVisible()).toBe(true);
    expect(input.attributes('aria-expanded')).toBe('true');
    expect(wrapper.text()).toContain('פעולות מוצעות');

    const items = wrapper.findAll('.tell-me-item');
    expect(items.length).toBeGreaterThan(0);
  });

  it('הקלדה מסננת את הפקודות בזמן אמת', async () => {
    const wrapper = mount(TellMeSearch);
    const input = wrapper.find('.tell-me-input');

    await input.trigger('focus');
    await input.setValue('טבלה');
    await settle();

    expect(wrapper.text()).toContain('פקודות ואפשרויות');
    const items = wrapper.findAll('.tell-me-item');
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].text()).toContain('טבלה');
  });

  it('לחיצה על פקודת מנוע פולטת run-command וסוגרת את התפריט', async () => {
    const wrapper = mount(TellMeSearch);
    const input = wrapper.find('.tell-me-input');

    await input.trigger('focus');
    await input.setValue('טבלה');
    await settle();

    const tableItem = wrapper.findAll('.tell-me-item')[0];
    await tableItem.trigger('click');
    await settle();

    const emitted = wrapper.emitted('run-command');
    expect(emitted).toBeDefined();
    expect(emitted![0]).toEqual(['table-insert', { rows: 3, cols: 3 }]);
    expect(wrapper.find('.tell-me-dropdown').isVisible()).toBe(false);
  });

  it('לחיצה על פעולת מעטפת פולטת run-action וסוגרת את התפריט', async () => {
    const wrapper = mount(TellMeSearch);
    const input = wrapper.find('.tell-me-input');

    await input.trigger('focus');
    await input.setValue('שמירה');
    await settle();

    const saveItem = wrapper.findAll('.tell-me-item')[0];
    await saveItem.trigger('click');
    await settle();

    const emitted = wrapper.emitted('run-action');
    expect(emitted).toBeDefined();
    expect(emitted![0]).toEqual(['save']);
    expect(wrapper.find('.tell-me-dropdown').isVisible()).toBe(false);
  });

  it('כשיש שאילתה מופיעה אפשרות "חפש במסמך" ולחיצה עליה פולטת open-find', async () => {
    const wrapper = mount(TellMeSearch);
    const input = wrapper.find('.tell-me-input');

    await input.trigger('focus');
    await input.setValue('שלום עולם');
    await settle();

    const findItem = wrapper.find('#tell-me-item-doc-search');
    expect(findItem.exists()).toBe(true);
    expect(findItem.text()).toContain('חפש במסמך: "שלום עולם"');

    await findItem.trigger('click');
    await settle();

    const emitted = wrapper.emitted('open-find');
    expect(emitted).toBeDefined();
    expect(emitted![0]).toEqual(['שלום עולם']);
  });

  it('ניווט במקלדת עם Enter מפעיל את הפקודה הנבחרת', async () => {
    const wrapper = mount(TellMeSearch);
    const input = wrapper.find('.tell-me-input');

    await input.trigger('focus');
    await input.setValue('הדפסה');
    await settle();

    // לחיצה על Enter מפעילה את הפקודה הראשונה ברשימה
    await input.trigger('keydown', { key: 'Enter' });
    await settle();

    const emitted = wrapper.emitted('run-action');
    expect(emitted).toBeDefined();
    expect(emitted![0]).toEqual(['print']);
  });

  it('ניווט בחצים לבחירת שורת חיפוש במסמך ו-Enter', async () => {
    const wrapper = mount(TellMeSearch);
    const input = wrapper.find('.tell-me-input');

    await input.trigger('focus');
    await input.setValue('הדפסה');
    await settle();

    // חץ למטה יורד לפריט השני (חפש במסמך)
    await input.trigger('keydown', { key: 'ArrowDown' });
    await settle();

    await input.trigger('keydown', { key: 'Enter' });
    await settle();

    const emitted = wrapper.emitted('open-find');
    expect(emitted).toBeDefined();
    expect(emitted![0]).toEqual(['הדפסה']);
  });

  it('לחיצה על Escape סוגרת את התפריט ומנקה את השאילתה', async () => {
    const wrapper = mount(TellMeSearch);
    const input = wrapper.find('.tell-me-input');

    await input.trigger('focus');
    await input.setValue('חיפוש כלשהו');
    await settle();

    expect(wrapper.find('.tell-me-dropdown').isVisible()).toBe(true);

    await input.trigger('keydown', { key: 'Escape' });
    await settle();

    expect(wrapper.find('.tell-me-dropdown').attributes('style')).toContain('display: none');
    expect(input.attributes('aria-expanded')).toBe('false');
    expect((input.element as HTMLInputElement).value).toBe('');
  });

  it('לחיצה על כפתור הניקוי (✕) מנקה את השאילתה', async () => {
    const wrapper = mount(TellMeSearch);
    const input = wrapper.find('.tell-me-input');

    await input.setValue('טקסט לבדיקה');
    await settle();

    const clearBtn = wrapper.find('.tell-me-clear-btn');
    expect(clearBtn.exists()).toBe(true);

    await clearBtn.trigger('click');
    await settle();

    expect((input.element as HTMLInputElement).value).toBe('');
  });
});
