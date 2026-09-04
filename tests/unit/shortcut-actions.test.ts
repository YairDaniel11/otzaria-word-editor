/**
 * פעולות המעטפת. ההכרעה היחידה שיש כאן היא זו שהייתה פעם `saveShortcut`:
 * בזמן שמירה אין להריץ שמירה שנייה. הבדיקה עברה לכאן יחד עם ההכרעה, כדי
 * שהיא לא תיעלם עם המודול שנמחק.
 */
import { describe, it, expect, vi } from 'vitest';
import { createShellActionRunner, type ShellActionDeps } from '../../src/ui/shortcuts/actions';

function setup(over: Partial<ShellActionDeps> = {}) {
  const deps = {
    isSaving: () => false,
    save: vi.fn(),
    print: vi.fn(),
    openFind: vi.fn(),
    closeTopmost: vi.fn(() => true),
    newDocument: vi.fn(),
    openDocument: vi.fn(),
    selectAll: vi.fn(),
    pageBreak: vi.fn(),
    openLink: vi.fn(),
    growFont: vi.fn(),
    shrinkFont: vi.fn(),
    vertAlign: vi.fn(),
    insertNote: vi.fn(),
    toggleTrackChanges: vi.fn(),
    toggleFocusMode: vi.fn(),
    findAgain: vi.fn(() => true),
    insertCitation: vi.fn(),
    searchOtzaria: vi.fn(),
    openLibrary: vi.fn(),
    toggleMacroRecording: vi.fn(() => true),
    replayLastMacro: vi.fn(() => true),
    toggleMacrosDialog: vi.fn(() => true),
    toggleShortcutsHelp: vi.fn(() => true),
    openContextMenu: vi.fn(() => true),
    moveFocusRegion: vi.fn(() => true),
    newTab: vi.fn(),
    closeTab: vi.fn(),
    reopenClosedTab: vi.fn(),
    stepTab: vi.fn(),
    goToTab: vi.fn(),
    openTellMe: vi.fn(),
    ...over,
  };
  return { deps, run: createShellActionRunner(deps) };
}

describe('createShellActionRunner', () => {
  it('tell-me קורא ל-openTellMe ומחזיר true', () => {
    const { deps, run } = setup();

    expect(run('tell-me')).toBe(true);
    expect(deps.openTellMe).toHaveBeenCalledOnce();
  });

  it('shortcuts-help מחליף את מצב רשימת הקיצורים', () => {
    const { deps, run } = setup();

    expect(run('shortcuts-help')).toBe(true);
    expect(deps.toggleShortcutsHelp).toHaveBeenCalledOnce();
  });

  it('shortcuts-help מעל דיאלוג אחר אינו נבלע', () => {
    // המעטפת מסרבת לפתוח חלון שני, והצירוף חייב להמשיך הלאה.
    const { run } = setup({ toggleShortcutsHelp: () => false });

    expect(run('shortcuts-help')).toBe(false);
  });

  it('פעולות המאקרו מנותבות למטפלים ומדווחות שטופלו', () => {
    const { deps, run } = setup();

    expect(run('macro-record')).toBe(true);
    expect(run('macro-play')).toBe(true);
    expect(run('macro-manage')).toBe(true);
    expect(deps.toggleMacroRecording).toHaveBeenCalledOnce();
    expect(deps.replayLastMacro).toHaveBeenCalledOnce();
    expect(deps.toggleMacrosDialog).toHaveBeenCalledOnce();
  });

  it('פעולות מאקרו בלי מסמך פתוח אינן נבלעות', () => {
    // בלי מסמך אין מערכת מאקרו, והצירוף צריך להישאר של הדפדפן.
    const { run } = setup({
      toggleMacroRecording: () => false,
      replayLastMacro: () => false,
      toggleMacrosDialog: () => false,
    });

    expect(run('macro-record')).toBe(false);
    expect(run('macro-play')).toBe(false);
    expect(run('macro-manage')).toBe(false);
  });

  it('F6 מעביר אזור, ומדווח שטופל', () => {
    const { deps, run } = setup();

    expect(run('focus-next-region')).toBe(true);
    expect(run('focus-prev-region')).toBe(true);
    expect(deps.moveFocusRegion).toHaveBeenNthCalledWith(1, 'next');
    expect(deps.moveFocusRegion).toHaveBeenNthCalledWith(2, 'prev');
  });

  it('F6 שלא היה לו לאן לעבור אינו נבלע', () => {
    // אחרת היינו לוקחים מהמשתמש את מקש הניווט של הדפדפן בלי לתת לו דבר.
    const { run } = setup({ moveFocusRegion: () => false });

    expect(run('focus-next-region')).toBe(false);
  });

  it('save שומר, save-as פותח „שמור בשם”', () => {
    const { deps, run } = setup();

    run('save');
    run('save-as');

    expect(deps.save).toHaveBeenNthCalledWith(1, false);
    expect(deps.save).toHaveBeenNthCalledWith(2, true);
  });

  it('בזמן שמירה אין שמירה שנייה', () => {
    // הרגרסיה: saveNow היה מצטרף לסבב שכבר רץ, ולכן Ctrl+Shift+S נראה כאילו
    // פתח „שמור בשם” ובפועל לא נפתח שום דיאלוג.
    const { deps, run } = setup({ isSaving: () => true });

    run('save');
    run('save-as');

    expect(deps.save).not.toHaveBeenCalled();
  });

  it('print מדפיס', () => {
    const { deps, run } = setup();
    run('print');
    expect(deps.print).toHaveBeenCalledTimes(1);
  });

  it('find ו-replace פותחים את הדיאלוג במצב הנכון', () => {
    const { deps, run } = setup();

    run('find');
    run('replace');

    expect(deps.openFind).toHaveBeenNthCalledWith(1, 'find');
    expect(deps.openFind).toHaveBeenNthCalledWith(2, 'replace');
  });

  it('escape סוגר את החלון הפתוח', () => {
    const { deps, run } = setup();
    run('escape');
    expect(deps.closeTopmost).toHaveBeenCalledTimes(1);
  });

  it('escape בלי חלון פתוח אינו נופל', () => {
    const { run } = setup({ closeTopmost: vi.fn(() => false) });
    expect(() => run('escape')).not.toThrow();
  });

  it('כל פעולה מגיעה ליעד שלה בלבד', () => {
    const { deps, run } = setup();

    run('new-document');
    run('open-document');
    run('select-all');
    run('page-break');
    run('link');
    run('font-grow');
    run('font-shrink');
    run('superscript');
    run('subscript');

    expect(deps.openLink).toHaveBeenCalledTimes(1);
    expect(deps.growFont).toHaveBeenCalledTimes(1);
    expect(deps.shrinkFont).toHaveBeenCalledTimes(1);
    expect(deps.vertAlign).toHaveBeenNthCalledWith(1, 'superscript');
    expect(deps.vertAlign).toHaveBeenNthCalledWith(2, 'subscript');

    run('footnote');
    run('endnote');
    run('track-changes');
    run('focus-mode');
    run('find-next');
    run('find-prev');

    expect(deps.insertNote).toHaveBeenNthCalledWith(1, 'footnote');
    expect(deps.insertNote).toHaveBeenNthCalledWith(2, 'endnote');
    expect(deps.toggleTrackChanges).toHaveBeenCalledTimes(1);
    expect(deps.toggleFocusMode).toHaveBeenCalledTimes(1);
    expect(deps.findAgain).toHaveBeenNthCalledWith(1, 'next');
    expect(deps.findAgain).toHaveBeenNthCalledWith(2, 'prev');

    run('insert-citation');
    run('search-otzaria');
    run('open-library');

    expect(deps.insertCitation).toHaveBeenCalledTimes(1);
    expect(deps.searchOtzaria).toHaveBeenCalledTimes(1);
    expect(deps.openLibrary).toHaveBeenCalledTimes(1);
    expect(deps.newDocument).toHaveBeenCalledTimes(1);
    expect(deps.openDocument).toHaveBeenCalledTimes(1);
    expect(deps.selectAll).toHaveBeenCalledTimes(1);
    expect(deps.pageBreak).toHaveBeenCalledTimes(1);
    expect(deps.save).not.toHaveBeenCalled();
  });

  it('הדפסה ושמירה אינן מתערבבות', () => {
    const { deps, run } = setup({ isSaving: () => true });

    run('print');

    // שמירה שרצה חוסמת שמירה בלבד, לא כל פעולה אחרת.
    expect(deps.print).toHaveBeenCalledTimes(1);
  });

  describe('הטאבים', () => {
    it('כל פעולת טאב מנותבת למטפל שלה', () => {
      const { deps, run } = setup();

      expect(run('tab-new')).toBe(true);
      expect(run('tab-close')).toBe(true);
      expect(run('tab-reopen')).toBe(true);
      expect(deps.newTab).toHaveBeenCalledOnce();
      expect(deps.closeTab).toHaveBeenCalledOnce();
      expect(deps.reopenClosedTab).toHaveBeenCalledOnce();
    });

    it('הבא והקודם הם אותה פעולה עם כיוון', () => {
      const { deps, run } = setup();

      run('tab-next');
      run('tab-prev');

      expect(deps.stepTab).toHaveBeenNthCalledWith(1, 'next');
      expect(deps.stepTab).toHaveBeenNthCalledWith(2, 'prev');
    });

    it('tab-goto מעביר את המיקום שב-payload', () => {
      const { deps, run } = setup();

      expect(run('tab-goto', 3)).toBe(true);
      expect(deps.goToTab).toHaveBeenCalledExactlyOnceWith(3);
    });

    it('tab-goto בלי payload תקין אינו קורא למטפל — אך כן נבלע', () => {
      // הבליעה היא ההכרעה של הקבוצה כולה (ראו „הטאבים” ב-actions.ts):
      // `Alt+3` שמשתחרר לדפדפן אינו עושה שם דבר מועיל.
      const { deps, run } = setup();

      expect(run('tab-goto')).toBe(true);
      expect(run('tab-goto', 0)).toBe(true);
      expect(run('tab-goto', '2')).toBe(true);
      expect(deps.goToTab).not.toHaveBeenCalled();
    });

    it('tab-goto-last הוא „האחרון” ולא „מספר תשע”', () => {
      // `Ctrl+9` בדפדפן עובר ללשונית האחרונה, לא לתשיעית. ההבחנה היא בין
      // פעולה נפרדת לבין `payload: 9`, וזו הסיבה שהיא פעולה.
      const { deps, run } = setup();

      expect(run('tab-goto-last')).toBe(true);
      expect(deps.goToTab).toHaveBeenCalledExactlyOnceWith('last');
    });

    it('קיצור טאב נבלע גם כשהמעטפת לא הזיזה דבר', () => {
      // טאב יחיד: `stepTab` יוצא מיד. הצירוף עדיין חייב להיבלע — `Ctrl+Tab`
      // ו-`Ctrl+W` שמשתחררים ל-WebView2 מדלגים בין לשוניות שהמשתמש אינו
      // רואה, או סוגרים את החלון שהתוסף יושב בו.
      const { run } = setup({ stepTab: () => {}, closeTab: () => {} });

      expect(run('tab-next')).toBe(true);
      expect(run('tab-close')).toBe(true);
    });
  });
});
