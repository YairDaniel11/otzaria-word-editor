/**
 * שכבת בדיקת האיות, כרכיב: מה שהיא **מפרקת**, ומתי היא בכלל מודדת.
 *
 * החשבון עצמו נבדק ביחידה (spelling-layer.test.ts, page-ruler.test.ts). מה
 * שאפשר לבדוק רק בהרכבה הוא מחזור החיים, וזה בדיוק מה ששובר עורך בשקט:
 * מאזין גלילה שנשאר על host של מסמך שנסגר, טיימר התיישבות שיורה על רכיב
 * מפורק, ומדידה שממשיכה לרוץ אחרי שהמשתמש כיבה את הבדיקה.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import SpellingOverlay from '../../src/ui/shell/SpellingOverlay.vue';
import { createDictionary, packWords, type Dictionary } from '../../src/engine/spellcheck';

const dictionary: Dictionary = createDictionary(packWords(['אמר', 'בית']));

/** jsdom אינו מפריס, ולכן כל מלבן נקבע במפורש. */
function withRect<T extends HTMLElement>(element: T, top = 0, height = 500): T {
  element.getBoundingClientRect = () =>
    ({ left: 0, right: 800, width: 800, top, bottom: top + height, height, x: 0, y: top }) as DOMRect;
  return element;
}

/** host עם עמוד אחד, ובו פסקה שיש בה מילה שאינה במילון. */
function paintedHost(text = 'אמר זזזזז'): HTMLElement {
  const host = withRect(document.createElement('div'));
  const page = withRect(document.createElement('div'));
  page.setAttribute('data-page-index', '0');
  const line = document.createElement('div');
  line.textContent = text;
  page.appendChild(line);
  host.appendChild(page);
  document.body.appendChild(host);
  return host;
}

let restoreRects: (() => void) | null = null;

beforeEach(() => {
  const original = Range.prototype.getClientRects;
  Range.prototype.getClientRects = function fake(this: Range) {
    const rect = { left: 0, top: 0, width: 10 * this.toString().length, height: 20, right: 10, bottom: 20 } as DOMRect;
    return Object.assign([rect], { item: () => rect }) as unknown as DOMRectList;
  };
  restoreRects = () => {
    Range.prototype.getClientRects = original;
  };
  // המדידה מתוזמנת ב-rAF; הרצה מיידית מוציאה את התזמון מהבדיקות.
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  restoreRects?.();
  restoreRects = null;
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

const marks = (wrapper: ReturnType<typeof mount>) => wrapper.findAll('.spelling-layer__mark');

describe('שכבת בדיקת האיות', () => {
  it('בלי מילון אין סימון — וגם אין מדידה', () => {
    const walker = vi.spyOn(document, 'createTreeWalker');
    const wrapper = mount(SpellingOverlay, { props: { host: paintedHost(), dictionary: null } });

    expect(marks(wrapper)).toHaveLength(0);
    expect(walker).not.toHaveBeenCalled();
    walker.mockRestore();
  });

  it('עם מילון — המילה שאינה בו מסומנת', async () => {
    const wrapper = mount(SpellingOverlay, { props: { host: paintedHost(), dictionary } });
    await nextTick();

    expect(marks(wrapper)).toHaveLength(1);
  });

  it('כיבוי מוחק את הסימונים', async () => {
    const wrapper = mount(SpellingOverlay, { props: { host: paintedHost(), dictionary } });
    await nextTick();
    expect(marks(wrapper)).toHaveLength(1);

    await wrapper.setProps({ dictionary: null });
    expect(marks(wrapper)).toHaveLength(0);
  });

  it('`revision` מפעיל מדידה מחדש — כולל אחרי שהעימוד התיישב', async () => {
    // רק השעונים: `useFakeTimers` המלא מזייף גם `requestAnimationFrame`
    // ומחליף את ה-stub שמריץ אותו מיד, כלומר אף מדידה לא הייתה רצה.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const host = paintedHost();
      const wrapper = mount(SpellingOverlay, { props: { host, dictionary } });
      await nextTick();
      expect(marks(wrapper)).toHaveLength(1);

      // מלבני העמוד לא זזו, ולכן מעקב הגיאומטריה לא יורה: זו בדיוק העריכה
      // שרק `revision` תופס.
      host.querySelector('div > div')!.textContent = 'אמר בית';
      await wrapper.setProps({ revision: 1 });
      await nextTick();
      expect(marks(wrapper)).toHaveLength(0);

      // ומדידת ההתיישבות שאחריה אינה נופלת ואינה מחזירה סימון רפאים.
      vi.runAllTimers();
      await nextTick();
      expect(marks(wrapper)).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('`wordAt` מחזירה את המילה שנלחצה, ו-`null` מחוצה לה', async () => {
    const wrapper = mount(SpellingOverlay, { props: { host: paintedHost(), dictionary } });
    await nextTick();

    const exposed = wrapper.vm as unknown as { wordAt: (x: number, y: number) => string | null };
    expect(exposed.wordAt(5, 5)).toBe('זזזזז');
    expect(exposed.wordAt(5, 400)).toBeNull();
  });

  it('פירוק מסיר את מאזין הגלילה ומבטל את טיימר ההתיישבות', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const host = paintedHost();
      const removeListener = vi.spyOn(host, 'removeEventListener');
      const wrapper = mount(SpellingOverlay, { props: { host, dictionary } });
      await nextTick();

      await wrapper.setProps({ revision: 1 });
      wrapper.unmount();

      expect(removeListener).toHaveBeenCalledWith('scroll', expect.any(Function));
      // טיימר ההתיישבות שנקבע לפני הפירוק אינו יורה על רכיב שכבר אינו קיים.
      expect(() => vi.runAllTimers()).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });
});
