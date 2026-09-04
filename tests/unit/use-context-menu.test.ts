/**
 * מי פותח את תפריט ההקשר, ומה קורה לסמן.
 *
 * שלוש משפחות ההתנהגות שנבדקות כאן הן אלה שהתגלו בביקורת על גל 1, וכולן
 * בלתי נראות בהרכבת הקומפוננטה:
 *
 * 1. **ניתוב המשטח.** שדה טקסט של הממשק חייב לקבל את התפריט של WebView2 —
 *    שם „הדבק” הנייטיבי הוא היכולת, לא באג. הרצועה חייבת לקבל `preventDefault`
 *    בלי תפריט. אזור המסמך — תפריט.
 * 2. **הלחיצה המסונתזת.** היא לחיצה לכל דבר, ולכן היא נשלחת רק אל טקסט: לא אל
 *    כפתור שהמנוע צייר בתוך אזור המסמך, ולא אל התפריט הפתוח.
 * 3. **מרוץ התצלום.** שתי קריאות א-סינכרוניות מפרידות בין הלחיצה לפתיחה, וכל
 *    מה שקורה ביניהן — סגירה, לחיצה שנייה, החלפת מסמך — חייב לנצח.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { shallowRef } from 'vue';
import type { SuperDoc } from 'superdoc';
import { useContextMenu, type ContextMenuDeps } from '../../src/composables/use-context-menu';

/** מלבן הבחירה שהכפיל מדווח — הריבוע 100..200 על שני הצירים. */
const SELECTION_RECT = { top: 100, bottom: 200, left: 100, right: 200 };

interface Fake {
  host: SuperDoc;
  applyCalls: unknown[];
  capabilitiesGetCalls: number;
}

function fakeSuperdoc(
  over: {
    rects?: readonly unknown[];
    anchor?: unknown;
    caret?: boolean;
    objectSelection?: boolean;
    throwOnRects?: boolean;
  } = {},
): Fake {
  const applyCalls: unknown[] = [];
  let capabilitiesGetCalls = 0;
  // סמן מכווץ: אין טווח ואין טקסט, כלומר אין מה לאבד בהזזת הסמן.
  const selectionInfo = over.objectSelection
    ? // בחירת אובייקט (תא טבלה/תמונה): אין target/segments בכלל — hasRange
      // ו-text יוצאים false, אבל `empty: false` מדווח שיש בחירה אמיתית.
      { empty: false, text: '', target: null }
    : over.caret
      ? { empty: true, text: '', target: { segments: [{ blockId: 'B1', range: { start: 4, end: 4 } }], story: { kind: 'story', storyType: 'body' } } }
      : {
          empty: false,
          text: 'טקסט',
          target: {
            segments: [{ blockId: 'B1', range: { start: 0, end: 4 } }],
            story: { kind: 'story', storyType: 'body' },
          },
        };
  const host = {
    ui: {
      selection: {
        getRects: () => {
          if (over.throwOnRects) throw new Error('boom');
          return over.rects ?? [SELECTION_RECT];
        },
        getAnchorRect: () => over.anchor ?? { top: 300, bottom: 320, left: 400, right: 420 },
      },
    },
    activeEditor: {
      doc: {
        selection: { current: () => selectionInfo },
        capabilities: {
          get: () => {
            capabilitiesGetCalls += 1;
            return {
              operations: {
                'clipboard.serializeSelection': { enabled: true },
                'clipboard.insert': { enabled: true },
                delete: { enabled: true },
                'hyperlinks.insert': { enabled: true },
                'footnotes.insert': { enabled: true },
                'ranges.resolve': { enabled: true },
              },
            };
          },
        },
        focus: () => {},
      },
    },
  } as unknown as SuperDoc;

  const fake: Fake = { host, applyCalls, capabilitiesGetCalls: 0 };
  // `capabilitiesGetCalls` על ה-fake הוא getter חי, לא העתק שנקפא ב-0.
  Object.defineProperty(fake, 'capabilitiesGetCalls', { get: () => capabilitiesGetCalls });
  return fake;
}

interface Setup {
  controller: ReturnType<typeof useContextMenu>;
  deps: ContextMenuDeps;
  documentArea: HTMLElement;
  runAction: ReturnType<typeof vi.fn>;
}

let cleanup: (() => void)[] = [];

function setup(over: Partial<ContextMenuDeps> = {}, fake = fakeSuperdoc()): Setup {
  const documentArea = document.createElement('div');
  const shell = document.createElement('div');
  shell.append(documentArea);
  document.body.append(shell);
  cleanup.push(() => shell.remove());

  const runAction = vi.fn(() => true);
  const deps: ContextMenuDeps = {
    superdoc: shallowRef<SuperDoc | null>(fake.host),
    isDocumentSurface: (target) => target instanceof Node && documentArea.contains(target),
    isModalOpen: () => false,
    runAction,
    report: () => {},
    ...over,
  };

  return { controller: useContextMenu(deps), deps, documentArea, runAction };
}

/** אירוע לחיצה ימנית אמיתי — `button: 2`, שזה מה שהמנתב מבדיל לפיו. */
function rightClick(target: EventTarget, at = { x: 150, y: 150 }): MouseEvent {
  const event = new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: at.x,
    clientY: at.y,
  });
  Object.defineProperty(event, 'target', { value: target });
  return event;
}

/** שתי הקריאות למנוע הן מיקרו-משימות; זה מה שמריץ אותן עד הסוף. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  cleanup = [];
  // jsdom אינו מממש `elementFromPoint`. ברירת המחדל כאן היא „אין כלום תחת
  // הנקודה”, וכל בדיקה שמעניין אותה מה יש שם דורסת אותה.
  const original = document.elementFromPoint;
  document.elementFromPoint = () => null;
  cleanup.push(() => {
    document.elementFromPoint = original;
  });
});

afterEach(() => {
  for (const dispose of cleanup) dispose();
});

describe('ניתוב המשטח', () => {
  it('בשדה טקסט של הממשק התפריט של המאכסן נשאר — אין preventDefault', () => {
    const { controller } = setup();
    const input = document.createElement('input');
    document.body.append(input);
    cleanup.push(() => input.remove());

    const event = rightClick(input);
    controller.handleContextMenu(event);

    expect(event.defaultPrevented).toBe(false);
    expect(controller.isOpen.value).toBe(false);
  });

  it('ברצועה — התפריט של המאכסן נחסם, ושלנו אינו נפתח', async () => {
    const { controller } = setup();
    const ribbon = document.createElement('div');
    document.body.append(ribbon);
    cleanup.push(() => ribbon.remove());

    const event = rightClick(ribbon);
    controller.handleContextMenu(event);
    await settle();

    expect(event.defaultPrevented).toBe(true);
    expect(controller.isOpen.value).toBe(false);
  });

  it('באזור המסמך התפריט נפתח בנקודה שנלחצה', async () => {
    const { controller, documentArea } = setup();

    controller.handleContextMenu(rightClick(documentArea, { x: 640, y: 480 }));
    await settle();

    expect(controller.isOpen.value).toBe(true);
    expect(controller.point.value).toEqual({ x: 640, y: 480 });
    expect(controller.sections.value.length).toBeGreaterThan(0);
  });

  it('openAtCaret בזמן שהתפריט כבר פתוח הוא no-op — לא פותח מחדש', async () => {
    // ContextMenu.vue's onKeydown אינו עוצר F10/מקש התפריט, ולכן לחיצה שנייה
    // בזמן שהתפריט פתוח יכולה להגיע לכאן שוב. פתיחה חוזרת הייתה מרעננת
    // sections/point בלי לפרק את ContextMenuButton, ומשאירה frozen תקוע.
    const { controller, documentArea } = setup();

    controller.handleContextMenu(rightClick(documentArea));
    await settle();
    expect(controller.isOpen.value).toBe(true);
    const pointAfterFirstOpen = controller.point.value;

    expect(controller.openAtCaret()).toBe(true);
    await settle();

    expect(controller.point.value).toEqual(pointAfterFirstOpen);
  });

  it('מודאל פתוח חוסם גם את הלחיצה וגם את המקלדת', async () => {
    const { controller, documentArea } = setup();
    const dialog = document.createElement('div');
    dialog.setAttribute('aria-modal', 'true');
    document.body.append(dialog);
    cleanup.push(() => dialog.remove());

    controller.handleContextMenu(rightClick(documentArea));
    await settle();

    expect(controller.isOpen.value).toBe(false);
    expect(controller.openAtCaret()).toBe(false);
  });
});

describe('הזזת הסמן', () => {
  /**
   * הבדיקה המרכזית כאן, והיא נכתבה מדיווח מהשטח: „מדגיש קטע, לוחץ ימני, וההדגשה
   * נעלמת”. הגרסה הראשונה נשענה על `getRects` כדי לדעת אם הלחיצה בתוך הבחירה,
   * ובמנוע האמיתי המלבנים ריקים תמיד (שער ש10) — כלומר כל לחיצה נחשבה „מחוץ”
   * והרסה את הבחירה.
   */
  it('בחירה קיימת אינה נהרסת — גם כשאין גיאומטריה וגם רחוק ממנה', async () => {
    const { controller, documentArea } = setup({}, fakeSuperdoc({ rects: [] }));
    const seen: string[] = [];
    documentArea.addEventListener('mousedown', () => seen.push('mousedown'));
    document.elementFromPoint = () => documentArea;

    controller.handleContextMenu(rightClick(documentArea, { x: 900, y: 900 }));
    await settle();

    expect(seen).toEqual([]);
    expect(controller.isOpen.value).toBe(true);
  });

  it('getRects שזורק נבלע לטובת „אין גיאומטריה”, ומדווח ללוג', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { controller, documentArea } = setup({}, fakeSuperdoc({ caret: true, throwOnRects: true }));
    document.elementFromPoint = () => documentArea;

    controller.handleContextMenu(rightClick(documentArea, { x: 150, y: 150 }));
    await settle();

    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('בחירת אובייקט (תא טבלה/תמונה) אינה נהרסת, גם ש-hasRange ו-text שקריים', async () => {
    // ש1 מהביקורת: `hasRange`/`text` בלבד היו מזהים את זה כ„אין בחירה”
    // (target הוא null, אין segments) ומריצים moveCaretTo למרות בחירה קיימת.
    const { controller, documentArea } = setup({}, fakeSuperdoc({ rects: [], objectSelection: true }));
    const seen: string[] = [];
    documentArea.addEventListener('mousedown', () => seen.push('mousedown'));
    document.elementFromPoint = () => documentArea;

    controller.handleContextMenu(rightClick(documentArea, { x: 900, y: 900 }));
    await settle();

    expect(seen).toEqual([]);
    expect(controller.isOpen.value).toBe(true);
  });

  it('סמן בלבד — הסמן זז ללחיצה, כי אין מה לאבד', async () => {
    const { controller, documentArea } = setup({}, fakeSuperdoc({ rects: [], caret: true }));
    const seen: string[] = [];
    for (const name of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      documentArea.addEventListener(name, () => seen.push(name));
    }
    document.elementFromPoint = () => documentArea;

    controller.handleContextMenu(rightClick(documentArea, { x: 800, y: 800 }));
    await settle();

    expect(seen).toEqual(['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']);
  });

  it('סמן בלבד, אבל הנקודה בתוך מלבן בחירה — לא נוגעים', async () => {
    const { controller, documentArea } = setup({}, fakeSuperdoc({ caret: true }));
    const seen: string[] = [];
    documentArea.addEventListener('mousedown', () => seen.push('mousedown'));
    document.elementFromPoint = () => documentArea;

    controller.handleContextMenu(rightClick(documentArea, { x: 150, y: 150 }));
    await settle();

    expect(seen).toEqual([]);
  });

  it('אינה משגרת אל כפתור שיושב בתוך אזור המסמך', async () => {
    const { controller, documentArea } = setup();
    // כזה הוא ה„×” של עריכת כותרת, שהמנוע מצייר בתוך אזור המסמך.
    const chrome = document.createElement('button');
    documentArea.append(chrome);
    const clicks: string[] = [];
    chrome.addEventListener('click', () => clicks.push('click'));
    document.elementFromPoint = () => chrome;

    controller.handleContextMenu(rightClick(documentArea, { x: 800, y: 800 }));
    await settle();

    expect(clicks).toEqual([]);
  });

  it('אינה משגרת אל התפריט הפתוח עצמו', async () => {
    const { controller, documentArea } = setup();
    const card = document.createElement('div');
    card.setAttribute('data-context-menu', '');
    const item = document.createElement('span');
    card.append(item);
    documentArea.append(card);
    const clicks: string[] = [];
    item.addEventListener('click', () => clicks.push('click'));
    document.elementFromPoint = () => item;

    controller.handleContextMenu(rightClick(documentArea, { x: 800, y: 800 }));
    await settle();

    expect(clicks).toEqual([]);
  });

  it('אירוע שנולד מהמקלדת אינו מזיז את הסמן — הוא נפתח על העוגן', async () => {
    const { controller, documentArea } = setup();
    const seen: string[] = [];
    documentArea.addEventListener('mousedown', () => seen.push('mousedown'));
    document.elementFromPoint = () => documentArea;

    // כך הדפדפן משגר `contextmenu` אחרי Shift+F10: כפתור 0, detail 0.
    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 0,
      clientY: 0,
    });
    Object.defineProperty(event, 'target', { value: documentArea });
    controller.handleContextMenu(event);
    await settle();

    expect(seen).toEqual([]);
    expect(controller.point.value).toEqual({ x: 420, y: 320 });
  });

  it('long-press ממסך מגע (אותה חתימה: button 0, detail 0) נפתח בנקודה שנלחצה, לא על העוגן', async () => {
    const { controller, documentArea } = setup();

    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 640,
      clientY: 480,
    });
    Object.defineProperty(event, 'target', { value: documentArea });
    // `sourceCapabilities.firesTouchEvents`: תוסף Chromium ל-MouseEvent
    // שמסמן אירוע שסונתז מ-touch — הוא מה שמבחין בין long-press לבין
    // Shift+F10, ששניהם מגיעים עם אותם button/detail.
    Object.defineProperty(event, 'sourceCapabilities', {
      value: { firesTouchEvents: true },
    });
    controller.handleContextMenu(event);
    await settle();

    expect(controller.point.value).toEqual({ x: 640, y: 480 });
  });
});

describe('מרוץ התצלום', () => {
  it('סגירה בזמן שהתצלום בדרך אינה מחזירה את התפריט', async () => {
    const { controller, documentArea } = setup();

    controller.handleContextMenu(rightClick(documentArea));
    controller.close();
    await settle();

    expect(controller.isOpen.value).toBe(false);
    expect(controller.point.value).toBeNull();
  });

  it('מבין שתי לחיצות מנצחת האחרונה שנלחצה', async () => {
    const { controller, documentArea } = setup();

    controller.handleContextMenu(rightClick(documentArea, { x: 100, y: 100 }));
    controller.handleContextMenu(rightClick(documentArea, { x: 900, y: 900 }));
    await settle();

    expect(controller.point.value).toEqual({ x: 900, y: 900 });
  });

  it('החלפת מסמך באמצע מבטלת את הפתיחה', async () => {
    const first = fakeSuperdoc();
    const superdoc = shallowRef<SuperDoc | null>(first.host);
    const { controller, documentArea } = setup({ superdoc }, first);

    controller.handleContextMenu(rightClick(documentArea));
    superdoc.value = fakeSuperdoc().host;
    await settle();

    expect(controller.isOpen.value).toBe(false);
  });

  it('מודאל שנפתח באמצע (בזמן שהתצלום בדרך) מונע פתיחה — לא רק לפניו', async () => {
    const { controller, documentArea } = setup();

    controller.handleContextMenu(rightClick(documentArea));
    // נפתח **אחרי** handleContextMenu אבל לפני שהתצלום השתקף — בדיוק החלון
    // ש-isBlockedByModal אמור לחסום גם כשהוא נבדק רק לפני הלחיצה.
    const dialog = document.createElement('div');
    dialog.setAttribute('aria-modal', 'true');
    document.body.append(dialog);
    cleanup.push(() => dialog.remove());
    await settle();

    expect(controller.isOpen.value).toBe(false);
  });

  it('היכולות נקראות פעם אחת למופע superdoc — לא בכל פתיחה', async () => {
    const fake = fakeSuperdoc();
    const { controller, documentArea } = setup({}, fake);

    controller.handleContextMenu(rightClick(documentArea, { x: 100, y: 100 }));
    await settle();
    controller.close();
    controller.handleContextMenu(rightClick(documentArea, { x: 200, y: 200 }));
    await settle();

    expect(fake.capabilitiesGetCalls).toBe(1);
  });

  it('החלפת מסמך קוראת יכולות מחדש — לא ממשיכה עם המטמון של הקודם', async () => {
    const first = fakeSuperdoc();
    const superdoc = shallowRef<SuperDoc | null>(first.host);
    const { controller, documentArea } = setup({ superdoc }, first);

    controller.handleContextMenu(rightClick(documentArea));
    await settle();

    const second = fakeSuperdoc();
    superdoc.value = second.host;
    controller.handleContextMenu(rightClick(documentArea));
    await settle();

    expect(first.capabilitiesGetCalls).toBe(1);
    expect(second.capabilitiesGetCalls).toBe(1);
  });

  it('מודל ריק (המסמך עדיין נטען) אינו פותח תפריט בלתי-נראה', async () => {
    const notReady = fakeSuperdoc();
    (notReady.host as unknown as { activeEditor: { doc: { capabilities?: unknown } } }).activeEditor.doc.capabilities =
      undefined;
    const { controller, documentArea } = setup({}, notReady);

    controller.handleContextMenu(rightClick(documentArea));
    await settle();

    expect(controller.isOpen.value).toBe(false);
    expect(controller.sections.value).toEqual([]);
  });
});

describe('הרצת פריט', () => {
  it('פעולת מעטפת נמסרת למפעיל הפעולות', () => {
    const { controller, runAction } = setup();

    controller.run({
      id: 'link',
      label: 'קישור…',
      icon: 'link',
      run: { kind: 'action', action: 'link' },
    });

    expect(runAction).toHaveBeenCalledWith('link');
  });
});
