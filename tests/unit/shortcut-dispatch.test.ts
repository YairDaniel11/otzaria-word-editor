/**
 * המנתב — שלוש ההכרעות שקודם היו פזורות ב-App.vue ולכן לא נבדקו: פוקוס בשדה
 * טקסט, דיאלוג מודאלי פתוח, ומתי מותר לבלוע את ההתנהגות של הדפדפן.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  createShortcutDispatcher,
  isTextEntryTarget,
  type ShortcutDispatcherDeps,
} from '../../src/ui/shortcuts/dispatch';
import type { Shortcut } from '../../src/ui/shortcuts/registry';

const BOLD: Shortcut = {
  id: 'bold',
  label: 'Ctrl+B',
  description: 'מודגש',
  group: 'font',
  code: 'KeyB',
  ctrl: true,
  command: 'bold',
};

const SAVE: Shortcut = {
  id: 'save',
  label: 'Ctrl+S',
  description: 'שמירה',
  group: 'file',
  code: 'KeyS',
  ctrl: true,
  action: 'save',
  inTextEntry: true,
};

const ESCAPE: Shortcut = {
  id: 'escape',
  label: 'Esc',
  description: 'סגירה',
  group: 'app',
  code: 'Escape',
  action: 'escape',
  inTextEntry: true,
  inModal: true,
};

const PASTE: Shortcut = {
  id: 'paste',
  label: 'Ctrl+V',
  description: 'הדבקה',
  group: 'clipboard',
  code: 'KeyV',
  ctrl: true,
  native: true,
};

/** פעולת מעטפת עם payload — רשומת `tab-goto` היא המקרה האמיתי. */
const TAB_GOTO: Shortcut = {
  id: 'tab-goto-3',
  label: 'Alt+3',
  description: 'מעבר לטאב השלישי',
  group: 'tabs',
  code: 'Digit3',
  alt: true,
  action: 'tab-goto',
  payload: 3,
};

const ALL = [BOLD, SAVE, ESCAPE, PASTE, TAB_GOTO];

/** יעד מזויף למאזין, כדי שהבדיקה תוכל לוודא שהוא נרשם ושהוא נותק. */
function fakeTarget() {
  const listeners: EventListener[] = [];
  return {
    count: () => listeners.length,
    fire: (event: unknown) => listeners.forEach((listener) => listener(event as Event)),
    addEventListener: (_type: string, listener: unknown) => {
      listeners.push(listener as EventListener);
    },
    removeEventListener: (_type: string, listener: unknown) => {
      const index = listeners.indexOf(listener as EventListener);
      if (index >= 0) listeners.splice(index, 1);
    },
  };
}

function setup(over: Partial<ShortcutDispatcherDeps> = {}) {
  const runCommand = vi.fn();
  const runAction = vi.fn(() => true);
  const target = fakeTarget();
  const dispatcher = createShortcutDispatcher({
    runCommand,
    runAction,
    shortcuts: ALL,
    target,
    ...over,
  });
  return { runCommand, runAction, target, dispatcher };
}

function event(over: Record<string, unknown> = {}): KeyboardEvent {
  return {
    key: '',
    code: '',
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    target: null,
    preventDefault: vi.fn(),
    ...over,
  } as unknown as KeyboardEvent;
}

function element(tag: string, attributes: Record<string, string> = {}): HTMLElement {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

describe('isTextEntryTarget', () => {
  it('שדות הטקסט של הממשק שלנו', () => {
    expect(isTextEntryTarget(element('input'))).toBe(true);
    expect(isTextEntryTarget(element('textarea'))).toBe(true);
    expect(isTextEntryTarget(element('select'))).toBe(true);
    expect(isTextEntryTarget(element('div', { role: 'textbox' }))).toBe(true);
  });

  it('אזור המסמך של המנוע אינו שדה טקסט', () => {
    // דווקא שם קיצורי המסמך חייבים לעבוד — זה כל העניין.
    expect(isTextEntryTarget(element('div'))).toBe(false);
    expect(isTextEntryTarget(element('button'))).toBe(false);
    expect(isTextEntryTarget(null)).toBe(false);
  });
});

describe('משטח ההקלדה של המנוע', () => {
  // הבאג שנמדד בדפדפן אמיתי: המנוע מקבל הקשות דרך `<textarea>` נסתר ברוחב
  // פיקסל אחד בתוך אזור המסמך, ולכן `event.target` של כל הקשה בזמן הקלדה הוא
  // TEXTAREA. בדיקת ה-tag לבדה חסמה את **כל** הקיצורים בדיוק כשהפוקוס במסמך.
  const composing = element('textarea');

  it('שדה טקסט בתוך אזור המסמך אינו חוסם', () => {
    const { dispatcher, runCommand } = setup({ isDocumentSurface: () => true });

    dispatcher.handle(event({ code: 'KeyB', ctrlKey: true, target: composing }));

    expect(runCommand).toHaveBeenCalledExactlyOnceWith('bold', undefined);
  });

  it('אותו שדה מחוץ לאזור המסמך כן חוסם', () => {
    const { dispatcher, runCommand } = setup({ isDocumentSurface: () => false });

    dispatcher.handle(event({ code: 'KeyB', ctrlKey: true, target: composing }));

    expect(runCommand).not.toHaveBeenCalled();
  });

  it('בלי ההכרעה הזאת ברירת המחדל היא לחסום — כדי ששדה החיפוש יישאר שלו', () => {
    const { dispatcher, runCommand } = setup();

    dispatcher.handle(event({ code: 'KeyB', ctrlKey: true, target: element('input') }));

    expect(runCommand).not.toHaveBeenCalled();
  });
});

describe('המנתב', () => {
  it('צירוף מוכר: הפקודה רצה דרך האדפטר, וברירת המחדל נבלעת', () => {
    const { dispatcher, runCommand } = setup();
    const keyEvent = event({ code: 'KeyB', ctrlKey: true });

    expect(dispatcher.handle(keyEvent)).toBe(true);
    expect(runCommand).toHaveBeenCalledWith('bold', undefined);
    expect(keyEvent.preventDefault).toHaveBeenCalled();
  });

  it('פעולת מעטפת רצה בשמה', () => {
    const { dispatcher, runAction } = setup();

    expect(dispatcher.handle(event({ code: 'KeyS', ctrlKey: true }))).toBe(true);
    expect(runAction).toHaveBeenCalledWith('save', undefined);
  });

  it('פעולת מעטפת מקבלת את ה-payload של הרשומה', () => {
    // בלי זה שמונה רשומות `Alt+1`…`Alt+8` היו מריצות את אותה פעולה בלי שום
    // דרך לדעת לאיזה טאב לעבור — כלומר כולן היו עוברות לאותו אחד.
    const { dispatcher, runAction } = setup();

    expect(dispatcher.handle(event({ code: 'Digit3', altKey: true }))).toBe(true);
    expect(runAction).toHaveBeenCalledWith('tab-goto', 3);
  });

  it('צירוף לא מוכר אינו נבלע', () => {
    const { dispatcher, runCommand, runAction } = setup();
    const keyEvent = event({ code: 'KeyG', ctrlKey: true });

    expect(dispatcher.handle(keyEvent)).toBe(false);
    expect(keyEvent.preventDefault).not.toHaveBeenCalled();
    expect(runCommand).not.toHaveBeenCalled();
    expect(runAction).not.toHaveBeenCalled();
  });

  it('צירוף של הדפדפן מתועד אך אינו נבלע', () => {
    // preventDefault על Ctrl+V היה מבטל את ההדבקה עצמה.
    const { dispatcher, runCommand } = setup();
    const keyEvent = event({ code: 'KeyV', ctrlKey: true });

    expect(dispatcher.handle(keyEvent)).toBe(false);
    expect(keyEvent.preventDefault).not.toHaveBeenCalled();
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('פוקוס בשדה טקסט חוסם קיצור מסמך', () => {
    const { dispatcher, runCommand } = setup();
    const keyEvent = event({ code: 'KeyB', ctrlKey: true, target: element('input') });

    expect(dispatcher.handle(keyEvent)).toBe(false);
    expect(keyEvent.preventDefault).not.toHaveBeenCalled();
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('פוקוס בשדה טקסט אינו חוסם רשומה שהוכרזה כמותרת שם', () => {
    const { dispatcher, runAction } = setup();

    expect(dispatcher.handle(event({ code: 'KeyS', ctrlKey: true, target: element('input') }))).toBe(
      true,
    );
    expect(dispatcher.handle(event({ code: 'Escape', target: element('input') }))).toBe(true);
    expect(runAction).toHaveBeenNthCalledWith(1, 'save', undefined);
    expect(runAction).toHaveBeenNthCalledWith(2, 'escape', undefined);
  });

  it('אזור המסמך אינו חוסם — הקיצורים עובדים בתוכו', () => {
    const { dispatcher, runCommand } = setup();

    expect(dispatcher.handle(event({ code: 'KeyB', ctrlKey: true, target: element('div') }))).toBe(
      true,
    );
    expect(runCommand).toHaveBeenCalledWith('bold', undefined);
  });

  it('role=textbox נחשב שדה טקסט', () => {
    const { dispatcher } = setup();
    const target = element('div', { role: 'textbox' });

    expect(dispatcher.handle(event({ code: 'KeyB', ctrlKey: true, target }))).toBe(false);
  });

  it('דיאלוג מודאלי פתוח חוסם הכול חוץ מ-Escape', () => {
    const { dispatcher, runAction, runCommand } = setup({ isModalOpen: () => true });

    expect(dispatcher.handle(event({ code: 'KeyB', ctrlKey: true }))).toBe(false);
    expect(dispatcher.handle(event({ code: 'KeyS', ctrlKey: true }))).toBe(false);
    expect(dispatcher.handle(event({ code: 'Escape' }))).toBe(true);
    expect(runCommand).not.toHaveBeenCalled();
    expect(runAction).toHaveBeenCalledExactlyOnceWith('escape', undefined);
  });

  it('נרשם ליעד ומנותק ב-dispose', () => {
    const { dispatcher, target, runCommand } = setup();
    expect(target.count()).toBe(1);

    target.fire(event({ code: 'KeyB', ctrlKey: true }));
    expect(runCommand).toHaveBeenCalledTimes(1);

    dispatcher.dispose();
    expect(target.count()).toBe(0);

    target.fire(event({ code: 'KeyB', ctrlKey: true }));
    expect(runCommand).toHaveBeenCalledTimes(1);
  });

  it('אירוע שכבר טופל אינו רץ שוב', () => {
    // המאזין יושב על window בשלב ה-bubble, כלומר אחרי ה-keymap של מנוע
    // העריכה. בלי הבדיקה הזאת צירוף שהמנוע קושר בעצמו היה מופעל פעמיים —
    // והמשתמש היה רואה הדגשה שמתבטלת מיד.
    const { dispatcher, runCommand } = setup();
    const keyEvent = event({ code: 'KeyB', ctrlKey: true, defaultPrevented: true });

    expect(dispatcher.handle(keyEvent)).toBe(false);
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('פעולה שלא טיפלה אינה בולעת את ברירת המחדל', () => {
    // `Escape` בלי חלון פתוח: אם נבלע אותו, שברנו את ה-Escape של המנוע.
    const { dispatcher } = setup({ runAction: vi.fn(() => false) });
    const keyEvent = event({ code: 'Escape' });

    expect(dispatcher.handle(keyEvent)).toBe(false);
    expect(keyEvent.preventDefault).not.toHaveBeenCalled();
  });

  it('פעולה שטיפלה בולעת', () => {
    const { dispatcher } = setup({ runAction: vi.fn(() => true) });
    const keyEvent = event({ code: 'Escape' });

    expect(dispatcher.handle(keyEvent)).toBe(true);
    expect(keyEvent.preventDefault).toHaveBeenCalled();
  });

  it('dispose חוזר אינו נופל', () => {
    const { dispatcher } = setup();
    dispatcher.dispose();
    expect(() => dispatcher.dispose()).not.toThrow();
  });
});
