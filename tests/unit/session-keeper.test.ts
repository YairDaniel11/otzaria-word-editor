/**
 * זוכר ההפעלה.
 *
 * ההבטחה שהקובץ הזה שומר עליה מנוסחת במספר אחד: **לכל היותר דקה של עבודה
 * נמצאת באוויר** — ולא משנה אם המשתמש עוצר להקליד או לא. סביבה: זמן מזויף,
 * כי כל ההתנהגות כאן היא מתי, ולא מה.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DRAFT_DELAY_MS,
  DRAFT_MAX_WAIT_MS,
  PERSIST_DELAY_MS,
  createSessionKeeper,
  type SessionKeeper,
  type SessionKeeperDeps,
} from '../../src/sessions/session-keeper';
import {
  activeEntry,
  draftPathFor,
  emptySession,
  withActiveEntry,
  type SessionState,
} from '../../src/sessions/session-state';
import type { CaretAnchor } from '../../src/engine/caret-anchor';
import type { WorkspaceWrite } from '../../src/host/workspace';

const anchor: CaretAnchor = { start: { blockId: 'b3', ordinal: 2, offset: 5 }, end: null };

/** נתיב הטיוטה שהבדיקות משתמשות בו — מסמך יחיד, כמו במציאות של היום. */
const DRAFT_PATH = draftPathFor('test-doc');

/** הרשומה האחרונה שנכתבה. `at(-1)` אינו ב-lib של הפרויקט. */
function last(records: SessionState[]): SessionState {
  return records[records.length - 1];
}

/** הרשומה הפעילה מתוך הרשומה האחרונה שנכתבה — הצורה החדשה היא אוסף. */
function lastEntry(records: SessionState[]) {
  return activeEntry(last(records));
}

interface Harness {
  keeper: SessionKeeper;
  deps: SessionKeeperDeps;
  persisted: SessionState[];
  drafts: number[];
  removals: number;
  exports: number;
  dirty: boolean;
  saving: boolean;
  caret: CaretAnchor | null;
  writeResult: WorkspaceWrite;
  /** כמה פעמים נאמר למשתמש שהמסמך גדול מדי לטיוטה. */
  tooLargeReports: number;
  /** מה שיוחזר מ-`settleSave`; ברירת המחדל היא הבטחה שנפתרת מיד. */
  onSettleSave: (() => Promise<void>) | null;
  /** מריצה את הטיימרים שהבשילו וממתינה לשרשרת האסינכרונית שהם פתחו. */
  tick: (ms: number) => Promise<void>;
}

function harness(): Harness {
  const state = {
    persisted: [] as SessionState[],
    drafts: [] as number[],
    removals: 0,
    exports: 0,
    dirty: false,
    saving: false,
    caret: null as CaretAnchor | null,
    writeResult: 'written' as WorkspaceWrite,
    tooLargeReports: 0,
    onSettleSave: null as (() => Promise<void>) | null,
  };

  const deps: SessionKeeperDeps = {
    id: 'test-doc',
    persist: async (snapshot) => {
      state.persisted.push(structuredClone(snapshot));
    },
    exportDocument: async () => {
      state.exports += 1;
      return new Blob([new Uint8Array([1, 2, 3])]);
    },
    writeDraft: async (content) => {
      if (state.writeResult !== 'written') return state.writeResult;
      state.drafts.push(content.size);
      return 'written';
    },
    removeDraft: async () => {
      state.removals += 1;
    },
    draftPath: DRAFT_PATH,
    readCaret: async () => state.caret,
    isDirty: () => state.dirty,
    isSaving: () => state.saving,
    settleSave: () => state.onSettleSave?.() ?? Promise.resolve(),
    onDraftTooLarge: () => {
      state.tooLargeReports += 1;
    },
  };

  const keeper = createSessionKeeper(deps);

  return {
    keeper,
    deps,
    get persisted() {
      return state.persisted;
    },
    get drafts() {
      return state.drafts;
    },
    get removals() {
      return state.removals;
    },
    get exports() {
      return state.exports;
    },
    get dirty() {
      return state.dirty;
    },
    set dirty(value: boolean) {
      state.dirty = value;
    },
    get saving() {
      return state.saving;
    },
    set saving(value: boolean) {
      state.saving = value;
    },
    get caret() {
      return state.caret;
    },
    set caret(value: CaretAnchor | null) {
      state.caret = value;
    },
    get writeResult() {
      return state.writeResult;
    },
    set writeResult(value: WorkspaceWrite) {
      state.writeResult = value;
    },
    get tooLargeReports() {
      return state.tooLargeReports;
    },
    get onSettleSave() {
      return state.onSettleSave;
    },
    set onSettleSave(value: (() => Promise<void>) | null) {
      state.onSettleSave = value;
    },
    async tick(ms: number) {
      await vi.advanceTimersByTimeAsync(ms);
      // הטיימר פותח שרשרת של await-ים (ייצוא, כתיבה, כתיבת רשומה); צריך
      // לתת לה להתנקז לפני שבודקים.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('הרשומה', () => {
  it('נכתבת בהשהיה אחת אחרי סדרת שינויים, ולא אחת לכל שינוי', async () => {
    const h = harness();
    h.caret = anchor;

    h.keeper.noteChange();
    h.keeper.noteChange();
    h.keeper.noteChange();
    expect(h.persisted, 'לפני ההשהיה לא נכתב דבר').toHaveLength(0);

    await h.tick(PERSIST_DELAY_MS);
    expect(h.persisted).toHaveLength(1);
    expect(activeEntry(h.persisted[0])?.caret).toEqual(anchor);
  });

  it('סמן שלא נקרא אינו מוחק את מה שכבר ידענו', async () => {
    // הבחירה עשויה להיות מחוץ למסמך ברגע הכתיבה — מיקוד בשדה בדיאלוג — וזו
    // אינה סיבה לשכוח איפה המשתמש היה.
    const h = harness();
    h.caret = anchor;
    h.keeper.noteChange();
    await h.tick(PERSIST_DELAY_MS);

    h.caret = null;
    h.keeper.noteChange();
    await h.tick(PERSIST_DELAY_MS);

    expect(activeEntry(h.persisted[1])?.caret).toEqual(anchor);
  });

  it('מצב תצוגה שלא השתנה אינו מייצר כתיבה', async () => {
    const h = harness();
    h.keeper.updateView({ zoom: 120 });
    await h.tick(PERSIST_DELAY_MS);
    expect(h.persisted).toHaveLength(1);

    h.keeper.updateView({ zoom: 120 });
    await h.tick(PERSIST_DELAY_MS);
    expect(h.persisted, 'אותו ערך — אין מה לכתוב').toHaveLength(1);
  });

  it('מצב התצוגה נאסף מכמה מקורות לרשומה אחת', async () => {
    const h = harness();
    h.keeper.updateView({ zoom: 150 });
    h.keeper.updateView({ focusMode: true });
    h.keeper.updateView({ ribbonTab: 'review', ribbonCollapsed: true });

    await h.tick(PERSIST_DELAY_MS);

    expect(last(h.persisted).view).toEqual({
      zoom: 150,
      focusMode: true,
      ribbonTab: 'review',
      ribbonCollapsed: true,
    });
  });
});

describe('הטיוטה', () => {
  it('נכתבת רק כשיש עבודה שאינה בדיסק', async () => {
    const h = harness();
    h.keeper.noteChange();
    await h.tick(DRAFT_DELAY_MS);
    expect(h.exports, 'מסמך נקי — אין מה לייצא').toBe(0);

    h.dirty = true;
    h.keeper.noteChange();
    await h.tick(DRAFT_DELAY_MS);
    expect(h.drafts).toEqual([3]);
  });

  it('הרשומה מצביעה לטיוטה שנכתבה, עם המסמך שהיא שייכת לו', async () => {
    const h = harness();
    h.keeper.setDocument({ token: 'tok', name: 'א.docx', writable: true }, { sourceSize: 4_096 });
    h.dirty = true;
    h.keeper.noteChange();

    await h.tick(DRAFT_DELAY_MS);

    expect(lastEntry(h.persisted)?.draft).toMatchObject({
      path: DRAFT_PATH,
      documentToken: 'tok',
      sourceSize: 4_096,
    });
  });

  it('הקלדה רצופה אינה דוחה את הכתיבה לנצח', async () => {
    // זו ההבטחה שהמודול קיים בשבילה: debounce לבדו היה נדחה שוב ושוב, ומי
    // שכותב ברצף עשר דקות היה מגלה שלא נכתב דבר.
    const h = harness();
    h.dirty = true;

    for (let elapsed = 0; elapsed < DRAFT_MAX_WAIT_MS; elapsed += DRAFT_DELAY_MS / 2) {
      h.keeper.noteChange();
      await h.tick(DRAFT_DELAY_MS / 2);
    }

    expect(h.drafts.length, 'נכתבה טיוטה למרות שההקלדה לא נעצרה').toBeGreaterThan(0);
  });

  it('שמירה שרצה דוחה את הייצוא ואינה מבטלת אותו', async () => {
    const h = harness();
    h.dirty = true;
    h.saving = true;
    h.keeper.noteChange();

    await h.tick(DRAFT_DELAY_MS);
    expect(h.exports, 'לא רצים שני ייצואים במקביל על אותו מסמך').toBe(0);

    h.saving = false;
    await h.tick(DRAFT_DELAY_MS);
    expect(h.drafts).toEqual([3]);
  });

  it('כתיבה שנכשלה **משאירה** את הטיוטה הקודמת', async () => {
    // טיוטה שעל הדיסק מאוחרת תמיד לשמירה האחרונה, ולכן היא מחזיקה עבודה
    // שאין בקובץ. „ישנה” היא ביחס למה שעל המסך, לא ביחס לדיסק — ומחיקתה
    // בגלל כתיבה שנכשלה משמידה את העותק היחיד ששרד.
    const h = harness();
    h.dirty = true;
    h.keeper.noteChange();
    await h.tick(DRAFT_DELAY_MS);
    const written = lastEntry(h.persisted)?.draft;
    expect(written).not.toBeNull();

    h.writeResult = 'failed';
    h.keeper.noteChange();
    await h.tick(DRAFT_MAX_WAIT_MS);

    expect(h.removals, 'אין למחוק עבודה בגלל כתיבה שנכשלה').toBe(0);
    expect(lastEntry(h.persisted)?.draft).toEqual(written);
  });

  it('כתיבה שנכשלה מנסה שוב בסבב הבא', async () => {
    // `draftedRevision` אינו מתקדם על כישלון, ולכן אותה עבודה עדיין ממתינה.
    const h = harness();
    h.dirty = true;
    h.writeResult = 'failed';
    h.keeper.noteChange();
    await h.tick(DRAFT_MAX_WAIT_MS);
    expect(h.drafts).toHaveLength(0);

    h.writeResult = 'written';
    h.keeper.noteChange();
    await h.tick(DRAFT_MAX_WAIT_MS);
    expect(h.drafts).toHaveLength(1);
  });

  it('מסמך גדול מהמכסה מדווח למשתמש פעם אחת, ולא בכל סבב', async () => {
    // התשובה קבועה — המסמך לא יקטן מעצמו — ולכן חזרה עליה כל עשר שניות היא
    // הטרדה. מסמך אחר מאפס: עליו התשובה אינה ידועה.
    const h = harness();
    h.dirty = true;
    h.writeResult = 'too-large';

    h.keeper.noteChange();
    await h.tick(DRAFT_MAX_WAIT_MS);
    h.keeper.noteChange();
    await h.tick(DRAFT_MAX_WAIT_MS);
    expect(h.tooLargeReports).toBe(1);

    h.keeper.setDocument({ token: 'other', name: 'אחר.docx', writable: true });
    h.keeper.noteChange();
    await h.tick(DRAFT_MAX_WAIT_MS);
    expect(h.tooLargeReports).toBe(2);
  });

  it('כשל חולף אינו מדווח למשתמש', async () => {
    // הסבב הבא עשוי להצליח, ואין מה להטריד בו את מי שרק מקליד.
    const h = harness();
    h.dirty = true;
    h.writeResult = 'failed';

    h.keeper.noteChange();
    await h.tick(DRAFT_MAX_WAIT_MS);

    expect(h.tooLargeReports).toBe(0);
  });

  it('שמירה מוצלחת מוחקת את הטיוטה', async () => {
    const h = harness();
    h.dirty = true;
    h.keeper.noteChange();
    await h.tick(DRAFT_DELAY_MS);

    h.dirty = false;
    await h.keeper.noteSaved(8_192);

    expect(h.removals).toBe(1);
    expect(lastEntry(h.persisted)?.draft).toBeNull();
  });

  it('מעבר למסמך אחר **אינו** מוחק את הטיוטה', async () => {
    // מחיקה כאן נראתה סבירה, ובפועל השמידה עבודה בשלושה מסלולים שאיש לא
    // התכוון אליהם — פתיחה שנכשלה, טיוטה של מסמך שיחזרו אליו, ותשובת „לא”
    // לשאלה על קובץ שהשתנה. המצביע נושא את ה-token של הבעלים, ולכן הוא
    // מזדהה בעצמו (`decideDraftRecovery`) ואינו זקוק לניקוי מונע.
    const h = harness();
    h.keeper.setDocument({ token: 'a', name: 'א.docx', writable: true });
    h.dirty = true;
    h.keeper.noteChange();
    await h.tick(DRAFT_DELAY_MS);

    h.keeper.setDocument({ token: 'b', name: 'ב.docx', writable: true });
    await h.tick(0);

    expect(h.removals).toBe(0);
    expect(lastEntry(h.persisted)?.draft, 'המצביע נשאר, ועדיין מסומן בבעליו').toMatchObject({
      documentToken: 'a',
    });
  });

  it('„למחוק את השינויים” הוא המסלול היחיד שמוחק מלבד שמירה', async () => {
    const h = harness();
    h.keeper.setDocument({ token: 'a', name: 'א.docx', writable: true });
    h.dirty = true;
    h.keeper.noteChange();
    await h.tick(DRAFT_DELAY_MS);

    await h.keeper.discardDraft();

    expect(h.removals).toBe(1);
    expect(lastEntry(h.persisted)?.draft).toBeNull();
  });

  it('גודל הקובץ מהשמירה מגיע לטיוטה הבאה', async () => {
    // בלעדיו הרשומה נשארת עם הגודל שהיה בפתיחה, ו„הקובץ השתנה מבחוץ” נשאל
    // אחרי כל שמירה רגילה — כלומר בדיוק כשהוא שגוי.
    const h = harness();
    h.keeper.setDocument({ token: 'a', name: 'א.docx', writable: true }, { sourceSize: 1_000 });
    h.dirty = true;
    h.keeper.noteChange();
    await h.tick(DRAFT_DELAY_MS);

    h.dirty = false;
    await h.keeper.noteSaved(1_500);

    h.dirty = true;
    h.keeper.noteChange();
    await h.tick(DRAFT_DELAY_MS);

    expect(lastEntry(h.persisted)?.draft).toMatchObject({ sourceSize: 1_500 });
  });

  it('שמירה שהסתיימה בזמן כתיבת טיוטה אינה משאירה מצביע לקובץ שנמחק', async () => {
    // `noteSaved` קורא את המצב בתוך התור ולא לפניו: לפניו הוא תיאר את הרגע
    // שבו השמירה הסתיימה, בעוד המחיקה רצה אחרי סבב טיוטה שכבר המתין.
    const h = harness();
    h.keeper.setDocument({ token: 'a', name: 'א.docx', writable: true });
    h.dirty = true;
    h.keeper.noteChange();

    const writing = h.tick(DRAFT_DELAY_MS);
    const saving = h.keeper.noteSaved(2_000);
    await Promise.all([writing, saving]);
    await h.tick(0);

    expect(lastEntry(h.persisted)?.draft, 'הרשומה והדיסק חייבים להסכים').toBeNull();
  });

  it('טיוטה שנשמרת עוברת לבעלות המסמך שנפתח ממנה', async () => {
    // המסלול: הקובץ לא נמצא, והעבודה שלא נשמרה נפתחה כמסמך חדש. בלי ההעברה
    // הרשומה הייתה ממשיכה לטעון שהטיוטה שייכת ל-token שאינו נפתר, והפתיחה
    // הבאה הייתה פוסלת אותה.
    const h = harness();
    h.keeper.setDocument({ token: 'a', name: 'א.docx', writable: true }, { sourceSize: 500 });
    h.dirty = true;
    h.keeper.noteChange();
    await h.tick(DRAFT_DELAY_MS);
    expect(lastEntry(h.persisted)?.draft).toMatchObject({ documentToken: 'a', sourceSize: 500 });

    h.keeper.setDocument(null, { keepDraft: true });
    await h.tick(0);

    expect(lastEntry(h.persisted)?.draft).toMatchObject({ documentToken: null, sourceSize: null });
  });

  it('פתיחה **מתוך** הטיוטה משאירה אותה על הדיסק', async () => {
    // המסלול היחיד שבו המחיקה הרגילה הייתה משמידה עבודה: הטיוטה היא בדיוק
    // מה שעל המסך, ובחלון שבין המחיקה לכתיבה הבאה קריסה מוחקת הכול.
    const h = harness();
    h.keeper.setDocument({ token: 'a', name: 'א.docx', writable: true });
    h.dirty = true;
    h.keeper.noteChange();
    await h.tick(DRAFT_DELAY_MS);

    h.keeper.setDocument({ token: 'a', name: 'א.docx', writable: true }, { keepDraft: true });
    await h.tick(0);

    expect(h.removals).toBe(0);
    expect(lastEntry(h.persisted)?.draft).not.toBeNull();
  });
});

describe('הסמן מול החלפת מסמך', () => {
  it('נמחק כשהמסמך התחלף', async () => {
    const h = harness();
    h.keeper.setDocument({ token: 'a', name: 'א.docx', writable: true });
    h.caret = anchor;
    h.keeper.noteChange();
    await h.tick(PERSIST_DELAY_MS);

    h.keeper.setDocument({ token: 'b', name: 'ב.docx', writable: true });
    await h.tick(0);

    expect(lastEntry(h.persisted)?.caret, 'סמן של מסמך אחד ברשומה של אחר').toBeNull();
  });

  it('נשמר כשאותו מסמך נפתח מחדש', async () => {
    // זה בדיוק המסלול שהתכונה נכתבה בשבילו; מחיקה תמידית הייתה מאבדת אותו.
    const h = harness();
    h.keeper.adopt(
      withActiveEntry(emptySession(), {
        document: { token: 'a', name: 'א.docx', writable: true },
        caret: anchor,
      }),
    );
    h.keeper.setDocument({ token: 'a', name: 'א.docx', writable: true });
    await h.tick(0);

    expect(lastEntry(h.persisted)?.caret).toEqual(anchor);
  });
});

describe('flush', () => {
  it('כותב מיד, בלי להמתין להשהיה', async () => {
    const h = harness();
    h.caret = anchor;
    h.keeper.noteChange();

    await h.keeper.flush();

    expect(h.persisted).toHaveLength(1);
  });

  it('כותב גם את הטיוטה כשיש עבודה שאינה בדיסק', async () => {
    const h = harness();
    h.dirty = true;
    h.keeper.noteChange();

    await h.keeper.flush();

    expect(h.drafts).toEqual([3]);
  });

  it('אידמפוטנטי — שלושת מקורות היציאה עשויים לירות יחד', async () => {
    // ניווט באוצריא מייצר גם `plugin.suspended` וגם `visibilitychange`, ולעיתים
    // גם `pagehide`. בלי הקיזוז, העזיבה הייתה עולה שלושה ייצואים מלאים של
    // אותו מסמך בדיוק.
    const h = harness();
    h.dirty = true;
    h.keeper.noteChange();

    await Promise.all([h.keeper.flush(), h.keeper.flush(), h.keeper.flush()]);

    expect(h.drafts.length, 'ייצוא אחד לכל יציאה, לא שלושה').toBe(1);
  });

  it('טיוטה נכתבת שוב אחרי שינוי נוסף', async () => {
    // הקיזוז שלמעלה אינו רשאי להפוך ל„נכתבה פעם אחת, ודי”.
    const h = harness();
    h.dirty = true;
    h.keeper.noteChange();
    await h.keeper.flush();

    h.keeper.noteChange();
    await h.keeper.flush();

    expect(h.drafts).toHaveLength(2);
  });

  it('בזמן שמירה ממתין לה, ואז כותב את מה שהשמירה לא הספיקה', async () => {
    // ביציאה אין „סבב הבא”. דחייה כאן הייתה תולה את כל העבודה שמאז הטיוטה
    // האחרונה בהצלחת השמירה שרצה — וכשל שלה היה משאיר אותה בלי עותק.
    const h = harness();
    h.dirty = true;
    h.saving = true;
    h.keeper.noteChange();

    // השמירה נכשלה: המסמך נשאר מלוכלך גם אחריה.
    h.onSettleSave = async () => {
      h.saving = false;
    };

    await h.keeper.flush();

    expect(h.drafts, 'הטיוטה נכתבת אחרי שהשמירה הסתיימה').toEqual([3]);
  });

  it('בזמן שמירה שהצליחה אינו מייצא לחינם', async () => {
    // `noteSaved` כבר ניקה, והמסמך נקי — אין עבודה שאינה בדיסק, ולכן אין מה
    // לכתוב. ייצוא כאן היה עבודה מיותרת בדיוק ברגע הרגיש ביותר.
    const h = harness();
    h.dirty = true;
    h.saving = true;
    h.keeper.noteChange();

    h.onSettleSave = async () => {
      h.saving = false;
      h.dirty = false;
    };

    await h.keeper.flush();

    expect(h.exports).toBe(0);
    expect(h.drafts).toHaveLength(0);
  });

  it('אחרי dispose אינו כותב', async () => {
    const h = harness();
    h.dirty = true;
    h.keeper.noteChange();
    h.keeper.dispose();

    await h.keeper.flush();
    await h.tick(DRAFT_MAX_WAIT_MS);

    expect(h.persisted).toHaveLength(0);
    expect(h.drafts).toHaveLength(0);
  });
});

/**
 * `hasUnwrittenWork` — השער שמאפשר ל„טאב נרדם” להיות בטוח.
 *
 * ## למה הבדיקות האלה קיימות
 *
 * שחרור המנוע של טאב ברקע (App.vue, `sleepTab`) מוחק מהזיכרון את כל מה
 * שהמסמך מחזיק. מה שמתיר אותו הוא התשובה `false` כאן — ההבטחה שכל מה שנמחק
 * ניתן לקריאה בחזרה מהטיוטה או מהדיסק. ביקורת מדדה שמוטציה שמוחקת את השער
 * הזה מ-`sleepTab` עוברת בירוק את כל בדיקות המעטפת, מפני שהכפיל של רכז
 * השמירה שם לעולם אינו „מלוכלך”. לכן הן כאן, על הדבר עצמו.
 *
 * שלושת המסלולים הם שלוש התשובות האפשריות של כתיבת הטיוטה: נכתבה, לא נכתבה,
 * ונכתבה אך העבודה המשיכה.
 */
describe('hasUnwrittenWork', () => {
  it('מסמך נקי — אין עבודה באוויר', () => {
    const h = harness();

    expect(h.keeper.hasUnwrittenWork).toBe(false);
  });

  it('עריכה שטרם נכתבה לטיוטה — יש', async () => {
    const h = harness();
    h.dirty = true;
    h.keeper.noteChange();

    expect(h.keeper.hasUnwrittenWork, 'ההשהיה עוד לא הבשילה').toBe(true);
  });

  it('אחרי `flush` שכתב את הטיוטה — אין', async () => {
    const h = harness();
    h.dirty = true;
    h.keeper.noteChange();

    await h.keeper.flush();

    expect(h.drafts.length, 'הטיוטה אכן נכתבה').toBe(1);
    expect(h.keeper.hasUnwrittenWork).toBe(false);
  });

  it('טיוטה שלא נכתבה — נשאר „יש”, וזה מה שמונע שחרור מנוע', async () => {
    // המסלול שמציל מסמך גדול מהמכסה: הוא לעולם לא יירדם, וישלם בזיכרון
    // במקום בעבודה. אותה תשובה בדיוק גם לכשל גשר (`failed`).
    for (const result of ['too-large', 'failed'] as const) {
      const h = harness();
      h.writeResult = result;
      h.dirty = true;
      h.keeper.noteChange();

      await h.keeper.flush();

      expect(h.keeper.hasUnwrittenWork, result).toBe(true);
    }
  });

  it('עריכה נוספת אחרי טיוטה מוצלחת — חוזר ל„יש”', async () => {
    const h = harness();
    h.dirty = true;
    h.keeper.noteChange();
    await h.keeper.flush();

    h.keeper.noteChange();

    expect(h.keeper.hasUnwrittenWork).toBe(true);
  });

  it('מסמך שנשמר לדיסק — אין, גם אם משהו זז מאז', async () => {
    // שני התנאים ולא אחד: מונה השינויים לבדו זז גם מתזוזת סמן במסמך שנשמר.
    const h = harness();
    h.dirty = false;
    h.keeper.noteChange();

    expect(h.keeper.hasUnwrittenWork).toBe(false);
  });
});
