/**
 * הרצועה עצמה: מעבר לשוניות, ניווט מקלדת ב-RTL, והכיווץ.
 *
 * `tests/unit/ribbon-aria.test.ts` מודד את הפונקציות הטהורות שמאחורי זה
 * (`nextTabIndex`, `isToggleButton`) — ובצדק, כי שם אפשר למדוד גם LTR שאין
 * במעטפת. מה שהוא **אינו** יכול למדוד הוא שהקומפוננטה באמת מחווטת אליהן: ש-
 * `aria-selected` זז, שהמיקוד עובר ללשונית שהחץ בחר, שהפאנל מצביע על הלשונית
 * הפעילה, ושכפתור „שמור” אינו מכריז על עצמו כמתג כבוי.
 *
 * הכיווניות אינה קוסמטית: WAI-ARIA קובע שהחצים נעים לפי הכיוון **החזותי**,
 * ובסרגל RTL הלשונית הבאה נמצאת שמאלה — כלומר ArrowLeft מתקדם. זה ההיפוך
 * שנשבר בלי שרואים.
 */
import { describe, expect, it } from 'vitest';
import Ribbon from '../../src/ui/ribbon/Ribbon.vue';
import { RIBBON_PANEL_ID, ribbonTabId } from '../../src/ui/ribbon/aria';
import { autoUnmount, buttonByTip, findButtonByTip, mountUi, settle } from './harness';

autoUnmount();

const TAB_LABELS = [
  'קובץ',
  'בית',
  'הוספה',
  'פריסה',
  'הפניות',
  'סקירה',
  'תצוגה',
  'מפתחים',
  'שולחן העורך',
  '✦ אוצריא',
];

/**
 * `hasDocument: true` כברירת מחדל: פקדי „קובץ” הם פעולות מעטפת, וברירת המחדל
 * שלהם היא „אין מסמך” — מה שמנטרל את „שמור” ומחליף את ה-tooltip שלו בהסבר.
 * הבדיקות כאן מודדות את הרצועה ולא את המצב הזה, ולכן הן מודדות מעטפת שיש בה
 * מסמך פתוח. הניטרול עצמו נמדד ב-ribbon-tabs.test.ts.
 */
async function mountRibbon(props: Record<string, unknown> = { hasDocument: true }) {
  const harness = mountUi(Ribbon, { props });
  await settle();
  return harness;
}

/** התווית של הלשונית שמסומנת כפעילה. */
function selectedLabel(harness: Awaited<ReturnType<typeof mountRibbon>>): string {
  const selected = harness.wrapper
    .findAll('[role="tab"]')
    .find((tab) => tab.attributes('aria-selected') === 'true');
  return selected?.text() ?? '(אין)';
}

function tabByLabel(harness: Awaited<ReturnType<typeof mountRibbon>>, label: string) {
  const tab = harness.wrapper.findAll('[role="tab"]').find((item) => item.text() === label);
  if (!tab) throw new Error(`אין לשונית „${label}”`);
  return tab;
}

describe('סרגל הלשוניות', () => {
  it('כל הלשוניות בסדרן, ו„בית” פעילה בפתיחה', async () => {
    const harness = await mountRibbon();
    const tabs = harness.wrapper.findAll('[role="tab"]');

    expect(tabs.map((tab) => tab.text())).toEqual(TAB_LABELS);
    expect(selectedLabel(harness)).toBe('בית');
  });

  it('רק הלשונית הפעילה נמצאת ב-tab order', async () => {
    // זו התנאי שמחייב את החצים להזיז מיקוד בעצמם, ובלעדיו הניווט אינו נגיש.
    const harness = await mountRibbon();
    const tabs = harness.wrapper.findAll('[role="tab"]');

    expect(tabs.filter((tab) => tab.attributes('tabindex') === '0')).toHaveLength(1);
    expect(tabByLabel(harness, 'בית').attributes('tabindex')).toBe('0');
    expect(tabByLabel(harness, 'קובץ').attributes('tabindex')).toBe('-1');
  });

  it('לחיצה מחליפה לשונית, וכל אחת מקושרת לפאנל אחד', async () => {
    const harness = await mountRibbon();

    await tabByLabel(harness, 'סקירה').trigger('click');
    await settle();

    expect(selectedLabel(harness)).toBe('סקירה');
    const panel = harness.wrapper.find('[role="tabpanel"]');
    expect(panel.attributes('id')).toBe(RIBBON_PANEL_ID);
    expect(panel.attributes('aria-labelledby')).toBe(ribbonTabId('review'));
    for (const tab of harness.wrapper.findAll('[role="tab"]')) {
      expect(tab.attributes('aria-controls')).toBe(RIBBON_PANEL_ID);
    }
  });

  it('רק תוכן הלשונית הפעילה מורכב', async () => {
    // „Mount on active”: הלשונית נבנית כשלוחצים עליה, וזו הסיבה שפקד יכול
    // לקרוא את זמינות ה-SDK פעם אחת ב-setup.
    const harness = await mountRibbon();
    expect(findButtonByTip(harness.wrapper, 'מודגש')).toBeDefined();

    await tabByLabel(harness, 'קובץ').trigger('click');
    await settle();

    expect(findButtonByTip(harness.wrapper, 'מודגש')).toBeUndefined();
    expect(harness.wrapper.findAll('[role="tabpanel"]')).toHaveLength(1);
  });
});

describe('ניווט מקלדת ב-RTL', () => {
  it('ArrowLeft מתקדם ו-ArrowRight חוזר — הכיוון החזותי', async () => {
    const harness = await mountRibbon();

    await tabByLabel(harness, 'בית').trigger('keydown', { key: 'ArrowLeft' });
    await settle();
    expect(selectedLabel(harness)).toBe('הוספה');

    await tabByLabel(harness, 'הוספה').trigger('keydown', { key: 'ArrowRight' });
    await settle();
    expect(selectedLabel(harness)).toBe('בית');
  });

  it('החץ מעביר גם את המיקוד, ולא רק את הבחירה', async () => {
    const harness = await mountRibbon();

    await tabByLabel(harness, 'בית').trigger('keydown', { key: 'ArrowLeft' });
    await settle();

    expect(document.activeElement).toBe(tabByLabel(harness, 'הוספה').element);
  });

  it('הניווט עוטף משני הקצוות', async () => {
    const harness = await mountRibbon();

    await tabByLabel(harness, 'בית').trigger('keydown', { key: 'ArrowRight' });
    await settle();
    expect(selectedLabel(harness)).toBe('קובץ');

    await tabByLabel(harness, 'קובץ').trigger('keydown', { key: 'ArrowRight' });
    await settle();
    expect(selectedLabel(harness)).toBe('✦ אוצריא');
  });

  it('Home ו-End קופצים לקצוות', async () => {
    const harness = await mountRibbon();

    await tabByLabel(harness, 'בית').trigger('keydown', { key: 'End' });
    await settle();
    expect(selectedLabel(harness)).toBe('✦ אוצריא');

    await tabByLabel(harness, '✦ אוצריא').trigger('keydown', { key: 'Home' });
    await settle();
    expect(selectedLabel(harness)).toBe('קובץ');
  });

  it('מקש שאינו ניווט אינו נחטף', async () => {
    const harness = await mountRibbon();

    for (const key of ['ArrowUp', 'ArrowDown', 'Tab', 'a']) {
      await tabByLabel(harness, 'בית').trigger('keydown', { key });
    }
    await settle();

    expect(selectedLabel(harness)).toBe('בית');
  });
});

describe('כיווץ הרצועה', () => {
  it('`aria-expanded` מדווח את המצב, והפאנל נסגר', async () => {
    const harness = await mountRibbon();
    const toggle = harness.wrapper.find('.word-ribbon-toggle');
    const panel = harness.wrapper.find('[role="tabpanel"]');

    expect(toggle.attributes('aria-expanded')).toBe('true');
    expect(toggle.attributes('aria-controls')).toBe(RIBBON_PANEL_ID);
    expect(panel.attributes('style')).toBeUndefined();

    await toggle.trigger('click');
    await settle();

    expect(toggle.attributes('aria-expanded')).toBe('false');
    // `v-show` — הפאנל נשאר בעץ (הלשונית לא מתפרקת), ורק מוסתר.
    expect(panel.attributes('style')).toContain('display: none');
    expect(toggle.attributes('aria-label')).toBe('הצג את הרצועה');
  });

  it('בחירת לשונית בזמן כיווץ פותחת את הרצועה', async () => {
    const harness = await mountRibbon();
    await harness.wrapper.find('.word-ribbon-toggle').trigger('click');
    await settle();

    await tabByLabel(harness, 'הוספה').trigger('click');
    await settle();

    expect(harness.wrapper.find('.word-ribbon-toggle').attributes('aria-expanded')).toBe('true');
    expect(selectedLabel(harness)).toBe('הוספה');
  });

  it('לחיצה כפולה על לשונית מכווצת ופותחת', async () => {
    const harness = await mountRibbon();
    const toggle = () => harness.wrapper.find('.word-ribbon-toggle').attributes('aria-expanded');

    await tabByLabel(harness, 'בית').trigger('dblclick');
    await settle();
    expect(toggle()).toBe('false');

    await tabByLabel(harness, 'בית').trigger('dblclick');
    await settle();
    expect(toggle()).toBe('true');
  });
});

describe('aria-pressed רק על מתגים', () => {
  it('מתג מדווח מצב, וכפתור פעולה אינו', async () => {
    // `withDefaults` הופך „מתג כבוי” ו„כפתור פעולה” לזהים מבפנים, וזו הסיבה
    // ש-`isToggleButton` קורא את `vnode.props`. כאן זה נמדד על ה-DOM עצמו:
    // עד התיקון קורא מסך הכריז „שמור” ו„מסמך חדש” כמתג כבוי.
    const harness = await mountRibbon();
    expect(buttonByTip(harness.wrapper, 'מודגש').attributes('aria-pressed')).toBe('false');

    await tabByLabel(harness, 'קובץ').trigger('click');
    await settle();

    for (const title of ['שמירת שינויים במסמך', 'יצירת מסמך Word ריק חדש']) {
      expect(buttonByTip(harness.wrapper, title).attributes('aria-pressed'), title).toBeUndefined();
    }
  });

  it('מתג דלוק מדווח `true`', async () => {
    const harness = mountUi(Ribbon);
    await settle();
    harness.adapter.setState('bold', { active: true });
    await settle();

    expect(buttonByTip(harness.wrapper, 'מודגש').attributes('aria-pressed')).toBe('true');
  });
});

describe('חיווט האירועים ל-App', () => {
  it('פקד בלשונית מגיע לרצועה כ-event, ולא נעצר בדרך', async () => {
    // הרצועה היא צינור: כל event שלשונית פולטת חייב מקבל בצד השני. שרשור
    // שנשמט אינו מפיל typecheck — הוא פשוט כפתור שלא עושה כלום.
    const harness = await mountRibbon();

    await buttonByTip(harness.wrapper, 'חיפוש טקסט במסמך').trigger('click');
    await tabByLabel(harness, 'קובץ').trigger('click');
    await settle();
    await buttonByTip(harness.wrapper, 'יצירת מסמך Word ריק חדש').trigger('click');
    await buttonByTip(harness.wrapper, 'אודות עורך Word לאוצריא').trigger('click');
    await tabByLabel(harness, 'תצוגה').trigger('click');
    await settle();
    await buttonByTip(harness.wrapper, 'מצב קריאה ומיקוד ללא הסחות דעת').trigger('click');

    expect(harness.wrapper.emitted('open-find')).toHaveLength(1);
    expect(harness.wrapper.emitted('new-doc')).toHaveLength(1);
    expect(harness.wrapper.emitted('about')).toHaveLength(1);
    expect(harness.wrapper.emitted('toggle-focus-mode')).toHaveLength(1);
  });
});
