/**
 * שכבת הטולטיפ — ui/tooltip/TooltipLayer.vue.
 *
 * ## מה שהיה כאן, ולמה הוא נמחק
 *
 * הגרסה הראשונה השאירה `title` על הפקדים והסירה אותו בריחוף, כדי שמערכת ההפעלה
 * לא תצייר מלבן אפור מעל הכרטיס. הבדיקות כאן שמרו על מנגנון ההשאלה הזה: פקד
 * שכל תוכנו `title` חדל להיות עוגן ברגע שהתכונה ירדה ממנו, ולכן היא הועברה
 * ל-`data-tip-title` לאורך ההשהיה.
 *
 * כל זה נמחק, כי המנגנון לא עבד: הדפדפן קורא את `title` בתזוזת העכבר ולא כשהוא
 * מצייר, כך שהטקסט נלכד כבר בתזוזה שבה הסמן נעצר וההסרה שאחריה אינה מבטלת דבר.
 * המשתמש צילם את שני הטולטיפים זה מעל זה. היום `title` אינו קיים באף אלמנט
 * בתוכנה (tests/unit/native-title.test.ts אוכף זאת), והשכבה אינה נוגעת בתכונות
 * של הפקדים כלל.
 *
 * ## מה כן נמדד כאן
 *
 * ההתנהגות שנשארה: פתיחה בהשהיה, מעבר בין פקדים, סגירה בלחיצה, וההבהוב שנמדד
 * ב-Chrome — תזוזה של פיקסל אחד על אותו פקד אינה סוגרת את הכרטיס.
 *
 * ## למה `elementFromPoint` מזויף כאן
 *
 * ב-jsdom הוא אינו קיים, ו-`anchorAt` קורא לו בכל פעם שהמסלול הישיר לא מצא
 * עוגן. בלי הזיוף הקריאה **זורקת**, המאזין נופל באמצע, והכרטיס נשאר פתוח
 * במקרה — כלומר הבדיקה הייתה עוברת בירוק דווקא על הקוד השבור. הזיוף מחזיר
 * את מה שדפדפן אמיתי מחזיר: את האלמנט שתחת הסמן.
 *
 * הכיסוי בדפדפן אמיתי הוא ב-scripts/tooltip-probe.mjs, ששם גם המסלול של
 * כפתור מנוטרל נמדד.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import TooltipLayer from '../../src/ui/tooltip/TooltipLayer.vue';

/** SHOW_DELAY_MS בקומפוננטה. הבדיקה מקדמת שעון מזויף, ולא ממתינה באמת. */
const SHOW_DELAY_MS = 400;
/** HIDE_DELAY_MS בקומפוננטה, בתוספת שוליים. */
const HIDE_DELAY_MS = 200;

let wrapper: VueWrapper | null = null;
let hit: Element | null = null;

/** תנועת עכבר, עם ה-target שדפדפן היה שולח. */
function pointerMove(target: Element, x: number, y: number): void {
  const event = new MouseEvent('pointermove', { bubbles: true, clientX: x, clientY: y });
  Object.defineProperty(event, 'target', { value: target });
  document.dispatchEvent(event);
}

function pointerDown(target: Element, x: number, y: number): void {
  const event = new MouseEvent('pointerdown', { bubbles: true, clientX: x, clientY: y });
  Object.defineProperty(event, 'target', { value: target });
  document.dispatchEvent(event);
}

/** פקד שמצהיר על טולטיפ, כפי שכל פקד בתוכנה עושה היום. */
function control(attributes: Record<string, string>): HTMLElement {
  const button = document.createElement('button');
  for (const [name, value] of Object.entries(attributes)) button.setAttribute(name, value);
  document.body.appendChild(button);
  return button;
}

function mountLayer(): void {
  wrapper = mount(TooltipLayer, { attachTo: document.body });
}

beforeEach(() => {
  vi.useFakeTimers();
  (document as unknown as { elementFromPoint: (x: number, y: number) => Element | null })
    .elementFromPoint = () => hit;
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  hit = null;
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('הכרטיס', () => {
  it('נפתח אחרי ההשהיה, עם שלושת השדות', async () => {
    const bold = control({
      'data-tip-title': 'מודגש',
      'data-tip-shortcut': 'Ctrl+B',
      'data-tip-desc': 'מעבה את הטקסט המסומן',
    });
    hit = bold;
    mountLayer();

    pointerMove(bold, 10, 10);
    expect(wrapper!.find('.word-tip').exists()).toBe(false);

    vi.advanceTimersByTime(SHOW_DELAY_MS + 20);
    await wrapper!.vm.$nextTick();

    expect(wrapper!.find('.word-tip__title').text()).toBe('מודגש');
    expect(wrapper!.find('.word-tip__key').text()).toBe('Ctrl+B');
    expect(wrapper!.find('.word-tip__desc').text()).toBe('מעבה את הטקסט המסומן');
  });

  it('שורד תזוזת עכבר נוספת על אותו פקד — זה ההבהוב שנמדד ב-Chrome', async () => {
    const badge = control({ 'data-tip-title': 'וורד לאוצריא' });
    hit = badge;
    mountLayer();

    pointerMove(badge, 10, 10);
    vi.advanceTimersByTime(SHOW_DELAY_MS + 20);
    await wrapper!.vm.$nextTick();
    expect(wrapper!.find('.word-tip').exists()).toBe(true);

    pointerMove(badge, 11, 11);
    vi.advanceTimersByTime(HIDE_DELAY_MS);
    await wrapper!.vm.$nextTick();

    expect(wrapper!.find('.word-tip').exists()).toBe(true);
  });

  it('נסגר ביציאה, ואינו משאיר תכונות על הפקד', async () => {
    const badge = control({ 'data-tip-title': 'וורד לאוצריא' });
    hit = badge;
    mountLayer();

    pointerMove(badge, 10, 10);
    vi.advanceTimersByTime(SHOW_DELAY_MS + 20);
    await wrapper!.vm.$nextTick();

    hit = null;
    pointerMove(document.body, 900, 900);
    vi.advanceTimersByTime(HIDE_DELAY_MS);
    await wrapper!.vm.$nextTick();

    expect(wrapper!.find('.word-tip').exists()).toBe(false);
    // השכבה קוראת בלבד: אין השאלה, אין החזרה, ואין שארית.
    expect(badge.attributes.length).toBe(1);
    expect(badge.getAttribute('data-tip-title')).toBe('וורד לאוצריא');
  });

  it('לחיצה סוגרת, והכרטיס אינו נפתח שוב כל עוד העכבר על אותו פקד', async () => {
    const button = control({ 'data-tip-title': 'כיוון פסקה משמאל לימין' });
    hit = button;
    mountLayer();

    pointerMove(button, 10, 10);
    vi.advanceTimersByTime(SHOW_DELAY_MS + 20);
    await wrapper!.vm.$nextTick();
    expect(wrapper!.find('.word-tip').exists()).toBe(true);

    pointerDown(button, 10, 10);
    await wrapper!.vm.$nextTick();
    expect(wrapper!.find('.word-tip').exists()).toBe(false);

    pointerMove(button, 11, 10);
    vi.advanceTimersByTime(SHOW_DELAY_MS + 20);
    await wrapper!.vm.$nextTick();
    expect(wrapper!.find('.word-tip').exists()).toBe(false);
  });

  it('עובר מפקד לפקד בלי להיסגר ביניהם', async () => {
    const rtl = control({ 'data-tip-title': 'כיוון פסקה מימין לשמאל' });
    const ltr = control({ 'data-tip-title': 'כיוון פסקה משמאל לימין' });
    hit = rtl;
    mountLayer();

    pointerMove(rtl, 10, 10);
    vi.advanceTimersByTime(SHOW_DELAY_MS + 20);
    await wrapper!.vm.$nextTick();
    expect(wrapper!.find('.word-tip__title').text()).toBe('כיוון פסקה מימין לשמאל');

    // SWITCH_DELAY_MS הוא 70 — הרבה פחות מהפתיחה הראשונה.
    hit = ltr;
    pointerMove(ltr, 40, 10);
    vi.advanceTimersByTime(100);
    await wrapper!.vm.$nextTick();

    expect(wrapper!.find('.word-tip__title').text()).toBe('כיוון פסקה משמאל לימין');
  });

  it('פקד בלי תכונות טולטיפ אינו פותח דבר', async () => {
    const plain = document.createElement('button');
    plain.setAttribute('title', 'טולטיפ מולד, אם מישהו יחזיר אותו');
    document.body.appendChild(plain);
    hit = plain;
    mountLayer();

    pointerMove(plain, 10, 10);
    vi.advanceTimersByTime(SHOW_DELAY_MS + 20);
    await wrapper!.vm.$nextTick();

    // `title` אינו עוגן. זו ההצהרה שהשכבה אינה מנסה עוד להתחרות בדפדפן — היא
    // מסתמכת על כך שהתכונה אינה קיימת (tests/unit/native-title.test.ts).
    expect(wrapper!.find('.word-tip').exists()).toBe(false);
  });
});

describe('ההסבר מקושר לפקד לקוראי מסך', () => {
  it('aria-describedby נקשר בפתיחה ויורד בסגירה', async () => {
    const button = control({
      'data-tip-title': 'הגדל גופן',
      'data-tip-desc': 'מגדיל את הטקסט המסומן בדרגה אחת בכל לחיצה',
    });
    hit = button;
    mountLayer();

    pointerMove(button, 10, 10);
    vi.advanceTimersByTime(SHOW_DELAY_MS + 20);
    await wrapper!.vm.$nextTick();

    expect(button.getAttribute('aria-describedby')).toBe('word-tip-desc');
    expect(wrapper!.find('#word-tip-desc').exists()).toBe(true);

    hit = null;
    pointerMove(document.body, 900, 900);
    vi.advanceTimersByTime(HIDE_DELAY_MS);
    await wrapper!.vm.$nextTick();

    expect(button.hasAttribute('aria-describedby')).toBe(false);
  });
});
