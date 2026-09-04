/**
 * מי שזוכר. אוסף את מצב ההפעלה, מחליט מתי לכתוב אותו, ומחזיק את טיוטת
 * השחזור.
 *
 * ## שני קצבים, ולא אחד
 *
 * מה שנשמר כאן נחלק לשניים שעלותם שונה בסדרי גודל:
 *
 * - **הרשומה** — מסמך, סמן, גודל תצוגה, לשונית. כתיבה אחת ל-`storage`,
 *   מיקרו-שניות. השהיה קצרה (`PERSIST_DELAY_MS`).
 * - **הטיוטה** — ייצוא DOCX מלא, המרה ל-base64, ומעבר בגשר. עשרות עד מאות
 *   מילישניות על מסמך אמיתי. השהיה ארוכה (`DRAFT_DELAY_MS`).
 *
 * קצב אחד לשניהם היה מכריח לבחור בין „הסמן נשמר לעיתים רחוקות” לבין „ייצוא
 * מלא כל שתי שניות של הקלדה”. שני קצבים הם מה שמאפשר לשניהם להיות נכונים.
 *
 * ## למה הטיוטה קיימת בכלל, כשיש שמירה אוטומטית
 *
 * השמירה האוטומטית כותבת לקובץ של המשתמש, ולכן היא פועלת רק כשיש לאן: מסמך
 * חדש שטרם נשמר אין לו יעד, ומסמך שנפתח לקריאה בלבד — גם כן. גם המתג עצמו
 * עשוי להיות כבוי, וזו בחירה לגיטימית שאין לעקוף. בכל שלושת המצבים אין שום
 * דבר בדיסק, וסגירת אוצריא מחקה את העבודה.
 *
 * הטיוטה היא במקום אחר לגמרי — המרחב הפרטי של התוסף — ולכן היא **אינה**
 * עוקפת את המתג: המשתמש אמר „אל תכתוב לקובץ שלי”, לא „תשכח מה שכתבתי”. זו
 * בדיוק ההפרדה ש-Word עושה בין „שמירה אוטומטית” ל„שחזור אוטומטי”.
 *
 * ## מה מוחק את הטיוטה — ומה **אינו** מוחק
 *
 * שני מסלולים בלבד, ושניהם אומרים „העבודה הזאת כבר לא נחוצה”:
 *
 * - **`noteSaved`** — העבודה בדיסק. מרגע זה הטיוטה אינה מוסיפה דבר, והשארתה
 *   פירושה שהפתיחה הבאה תעדיף עותק ישן על פני הקובץ עצמו.
 * - **`discardDraft`** — המשתמש אמר במפורש „למחוק את השינויים”.
 *
 * **כתיבה שנכשלה אינה מוחקת.** טיוטה שעל הדיסק מאוחרת תמיד לשמירה האחרונה,
 * ולכן היא מחזיקה עבודה שאין בקובץ. „ישנה” היא ביחס למה שעל המסך, לא ביחס
 * לדיסק — ומולו היא תמיד החדשה מבין השתיים.
 *
 * **מעבר מסמך אינו מוחק.** זה נראה סביר — ובפועל השמיד עבודה בשלושה מסלולים
 * שאיש לא התכוון אליהם: פתיחה שנכשלה ונפלה למסמך ריק, טיוטה של מסמך אחר
 * שהמשתמש עוד יחזור אליו, ותשובת „לא” לשאלה על קובץ שהשתנה מבחוץ. בשלושתם
 * לא נאמר „למחוק”. המצביע ברשומה נושא את ה-token של המסמך שהטיוטה שייכת לו,
 * ולכן הוא מזדהה בעצמו ואינו זקוק לניקוי מונע.
 *
 * ## מה שאינו מובטח, ונאמר במפורש
 *
 * `flush` הוא הזדמנות, לא ערובה: הרגע שבו אוצריא נסגרת בכוח או קורסת אינו
 * מריץ שום קוד. מה שמגן שם הם שני הקבועים — `DRAFT_DELAY_MS` בהפוגה הרגילה,
 * ו-`DRAFT_MAX_WAIT_MS` כשההקלדה אינה נעצרת כלל. יחד הם ההבטחה: **לכל היותר
 * דקה של עבודה נמצאת באוויר**, מול ברירת המחדל של Word שהיא עשר דקות.
 */
import type { CaretAnchor } from '../engine/caret-anchor';
import type { WorkspaceWrite } from '../host/workspace';
import {
  activeEntry,
  emptySessionWithId,
  withActiveEntry,
  type DocumentSessionId,
  type SessionDocument,
  type SessionState,
  type SessionView,
} from './session-state';

/** השהיית הכתיבה של הרשומה, אחרי השינוי האחרון. */
export const PERSIST_DELAY_MS = 2_000;

/** השהיית כתיבת הטיוטה, אחרי העריכה האחרונה. ראו „שני קצבים” בראש הקובץ. */
export const DRAFT_DELAY_MS = 10_000;

/**
 * התקרה על ההשהיה: כמה זמן מותר לעבור בין טיוטה לטיוטה, גם כשההקלדה אינה
 * נעצרת.
 *
 * בלעדיה ההשהיה הייתה נדחית שוב ושוב — זו בדיוק המשמעות של debounce — ומי
 * שכותב ברצף עשר דקות היה מגלה שלא נכתב דבר. עם התקרה, ההבטחה נאמרת במספר
 * אחד: **לכל היותר דקה של עבודה נמצאת באוויר**, ולא משנה כיצד הוא מקליד.
 */
export const DRAFT_MAX_WAIT_MS = 60_000;

export interface SessionKeeperDeps {
  /**
   * מזהה הטאב שהזוכר הזה שייך לו (`DocumentSession.id`, App.vue). זורע בו
   * את ה-state הפנימי (`emptySessionWithId`) — לא `emptySession()` הסתמי —
   * כדי ש-`activeId` שנכתב ל-storage תמיד יצביע על רשומה שבאמת קיימת
   * באוסף שלו. ראו את ההנמקה המלאה ליד `emptySessionWithId`.
   */
  id: DocumentSessionId;
  /** כותבת את הרשומה. כשל אינו מדווח לממשק — הוא כבר בלוג. */
  persist: (state: SessionState) => Promise<void>;
  /** מייצא את המסמך הפעיל, לטיוטה. */
  exportDocument: () => Promise<Blob>;
  /** כותבת את הטיוטה, ומדווחת אם לא נכתבה ומדוע. */
  writeDraft: (content: Blob) => Promise<WorkspaceWrite>;
  /** מוחקת את קובץ הטיוטה. */
  removeDraft: () => Promise<void>;
  /** הנתיב שהטיוטה נכתבת אליו. נשמר ברשומה כדי שהפתיחה הבאה תדע איפה לחפש. */
  draftPath: string;
  /**
   * קוראת את מקום הסמן. מקבלת את העוגן הקודם כדי שהקריאה תוכל לדלג על פתירת
   * סדר הפסקאות כשהסמן לא עזב את הפסקה — ראו engine/caret-anchor.ts.
   */
  readCaret: (previous: CaretAnchor | null) => Promise<CaretAnchor | null>;
  /** האם יש עבודה שאינה בדיסק. */
  isDirty: () => boolean;
  /** האם שמירה רצה כרגע. ייצוא נוסף בזמן הזה נדחה ואינו מבוטל. */
  isSaving: () => boolean;
  /**
   * ממתין לסבב השמירה שרץ. בשימוש ב-`flush` בלבד — ראו את ההנמקה שם.
   */
  settleSave: () => Promise<void>;
  /**
   * נקרא כשמסמך גדול מהמכסה, ולכן אין לו טיוטה כלל.
   *
   * זו אינה תקלה חולפת אלא תכונה של המסמך, ולכן היא מדווחת: ההבטחה של
   * המודול הזה — „לכל היותר דקה של עבודה באוויר” — פשוט אינה חלה כאן, ומי
   * שאינו יודע זאת בוטח ברשת ביטחון שאינה פרושה. פעם אחת לכל מסמך, מפני
   * שהתשובה קבועה וחזרה עליה כל עשר שניות היא הטרדה.
   */
  onDraftTooLarge?: () => void;
}

export interface SetDocumentOptions {
  /** גודל הקובץ בדיסק, כדי שנדע לזהות עריכה חיצונית בפתיחה הבאה. */
  sourceSize?: number | null;
  /**
   * לא למחוק את הטיוטה.
   *
   * למסלול אחד בלבד: המסמך **נפתח מהטיוטה**. שם הטיוטה אינה שריד של מסמך
   * קודם אלא בדיוק מה שעל המסך, והמחיקה הרגילה הייתה משמידה עבודה שנייה
   * לפני שהיא נכתבת מחדש — ובחלון הזה קריסה מוחקת הכול.
   */
  keepDraft?: boolean;
}

export interface SessionKeeper {
  /** הרשומה כפי שהיא בזיכרון. */
  readonly state: SessionState;
  /**
   * האם יש עבודה שאינה בדיסק **וגם** אינה בטיוטה — כלומר עבודה שקיימת רק
   * בזיכרון של המנוע.
   *
   * זהו השער שלפני „טאב נרדם” (App.vue, `sleepTab`): שחרור מנוע של טאב ברקע
   * הוא מחיקה של כל מה שיש בו בזיכרון, ולכן מותר רק כשכל מה שבו כבר נמצא
   * במקום שאפשר לקרוא ממנו בחזרה. אחרי `flush()` התשובה היא `false` בכל
   * מקרה שבו הטיוטה נכתבה בהצלחה; היא נשארת `true` בדיוק במקרים שבהם
   * הכתיבה לא הצליחה — מסמך גדול מהמכסה, גשר שנפל — ואלה בדיוק המקרים שבהם
   * אסור לשחרר.
   *
   * שני התנאים ולא אחד: `isDirty` לבדו נשאר דלוק גם מיד אחרי כתיבת טיוטה
   * (הוא מדבר על הדיסק, לא על הטיוטה), ומונה השינויים לבדו זז גם מתזוזת סמן
   * במסמך שנשמר כבר.
   */
  readonly hasUnwrittenWork: boolean;
  /** מאמצת רשומה שנקראה בעלייה, לפני שמשהו נכתב עליה. */
  adopt(state: SessionState | null): void;
  /** מסמך נפתח, נשמר בשם, או נסגר. מבטלת טיוטה של המסמך הקודם. */
  setDocument(document: SessionDocument | null, options?: SetDocumentOptions): void;
  /** שינוי במצב התצוגה. */
  updateView(patch: Partial<SessionView>): void;
  /** משהו זז — הסמן, המסמך. מתזמן כתיבה. */
  noteChange(): void;
  /** המסמך נשמר לדיסק: הטיוטה אינה נדרשת יותר. */
  noteSaved(sourceSize?: number | null): Promise<void>;
  /** המשתמש ביקש במפורש למחוק שינויים שלא נשמרו. ראו את המימוש. */
  discardDraft(): Promise<void>;
  /** כותב עכשיו את כל מה שיש. אידמפוטנטי — ראו host/lifecycle.ts. */
  flush(): Promise<void>;
  dispose(): void;
}

export function createSessionKeeper(deps: SessionKeeperDeps): SessionKeeper {
  let state: SessionState = emptySessionWithId(deps.id);
  let disposed = false;

  let persistTimer: ReturnType<typeof setTimeout> | undefined;
  let draftTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * סבב אחד בכל רגע, ובסדר. שתי כתיבות במקביל אינן מסוכנות ל-`storage`, אבל
   * שני ייצואים במקביל הם עבודה כפולה על אותו מסמך — ובעיקר: הן יכולות
   * להסתיים בסדר הפוך, כלומר טיוטה ישנה שנכתבת אחרי חדשה.
   */
  let chain: Promise<void> = Promise.resolve();

  /** מזהה המסמך הפתוח. `setDocument` מעלה אותו, וסבב עם ערך ישן נזרק. */
  let epoch = 0;

  /** גודל הקובץ בדיסק, כפי שדווח בפתיחה או בשמירה האחרונה. */
  let sourceSize: number | null = null;

  /** האם כבר נאמר על המסמך הזה שהוא גדול מכדי שתיכתב לו טיוטה. */
  let reportedTooLarge = false;

  /**
   * המועד שאחריו אסור לדחות עוד את כתיבת הטיוטה. `null` = אין עבודה שממתינה
   * לכתיבה, והספירה תתחיל מהעריכה הבאה.
   */
  let draftDeadline: number | null = null;

  /**
   * מונה השינויים, ומה שממנו כבר נכתבה טיוטה.
   *
   * `isDirty` אינו מספיק לשאלה „יש מה לכתוב?”: הוא נשאר `true` כל עוד המסמך
   * לא נשמר לדיסק, כלומר גם מיד אחרי שהטיוטה נכתבה. בלי המונה, שלושת מקורות
   * היציאה (ראו host/lifecycle.ts) היו מייצרים שלושה ייצואים מלאים של אותו
   * מסמך בדיוק, ברגע שהמשתמש עוזב.
   */
  let revision = 0;
  let draftedRevision = 0;

  function clearTimer(timer: ReturnType<typeof setTimeout> | undefined): undefined {
    if (timer !== undefined) clearTimeout(timer);
    return undefined;
  }

  function run(task: () => Promise<void>): Promise<void> {
    chain = chain.then(task, task);
    return chain;
  }

  /** מוסיפה את הסבב לתור ובולעת כשל: זו רשת ביטחון, לא פעולה של המשתמש. */
  function schedule(task: () => Promise<void>): void {
    void run(task).catch((error: unknown) => {
      console.warn('[otzaria-word] שמירת מצב ההפעלה נכשלה', error);
    });
  }

  async function persistNow(): Promise<void> {
    if (disposed) return;
    persistTimer = clearTimer(persistTimer);

    const mine = epoch;
    const caret = await deps.readCaret(activeEntry(state)?.caret ?? null);
    // הסמן נקרא אסינכרונית; אם בינתיים הוחלף המסמך, הוא שייך למסמך שכבר אינו
    // פתוח ואסור לו להיכנס לרשומה של החדש.
    if (disposed || mine !== epoch) return;

    // `caret` שהוא `null` אינו מוחק את מה שידענו: הבחירה עשויה להיות מחוץ
    // למסמך ברגע הזה (מיקוד בשדה בדיאלוג), וזו אינה סיבה לשכוח איפה היה.
    if (caret) state = withActiveEntry(state, { caret });
    await deps.persist(state);
  }

  /**
   * `final` = זו ההזדמנות האחרונה (יציאה), ואין סבב נוסף אחריה. ההבדל היחיד
   * הוא מה עושים כששמירה רצה: בזמן רגיל דוחים, ביציאה ממתינים.
   */
  async function writeDraftNow(final = false): Promise<void> {
    if (disposed) return;
    draftTimer = clearTimer(draftTimer);
    if (!deps.isDirty() || revision === draftedRevision) {
      draftDeadline = null;
      return;
    }

    // שמירה שרצה כבר מייצאת את אותו מסמך. הטיוטה ממתינה לסבב הבא במקום
    // להריץ ייצוא שני במקביל לה.
    //
    // הדחייה **דוחפת את התקרה קדימה**, ולא מנסה שוב מיד: כשהטיימר ירה דווקא
    // מפני שהתקרה הגיעה, `scheduleDraft` היה מחשב המתנה של אפס ומתזמן את
    // עצמו מחדש בלולאה — עשרות בדיקות בשנייה לכל אורך הייצוא.
    if (deps.isSaving()) {
      /**
       * ביציאה אין „סבב הבא”. דחייה כאן פירושה שהעבודה שנעשתה מאז הטיוטה
       * האחרונה תלויה כולה בהצלחת השמירה שרצה — וכשל שלה (הקובץ נעול, הרשת
       * נפלה) היה משאיר אותה בלי שום עותק. לכן ממתינים לסבב ובודקים מחדש:
       * אם הוא הצליח, `noteSaved` כבר ניקה ואין מה לכתוב; אם לא, הטיוטה
       * נכתבת. ההמתנה בטוחה גם מפני שהיא מונעת שני ייצואים במקביל על אותו
       * מנוע — בדיוק מה שהדחייה נועדה למנוע.
       */
      if (final) {
        const mineBeforeWait = epoch;
        await deps.settleSave();
        if (disposed || mineBeforeWait !== epoch) return;
        if (!deps.isDirty() || revision === draftedRevision) {
          draftDeadline = null;
          return;
        }
      } else {
        draftDeadline = Date.now() + DRAFT_DELAY_MS;
        scheduleDraft();
        return;
      }
    }
    // מכאן והלאה נכתבת טיוטה, ולכן הספירה לתקרה מתחילה מחדש בעריכה הבאה.
    draftDeadline = null;
    const writing = revision;

    const mine = epoch;
    let exported: Blob;
    try {
      exported = await deps.exportDocument();
    } catch (error) {
      console.warn('[otzaria-word] ייצוא הטיוטה נכשל', error);
      return;
    }
    if (disposed || mine !== epoch) return;

    const written = await deps.writeDraft(exported);
    if (disposed || mine !== epoch) return;

    if (written !== 'written') {
      /**
       * הטיוטה הקודמת **נשארת**, ובכוונה.
       *
       * טיוטה שעל הדיסק מאוחרת תמיד לשמירה האחרונה — `noteSaved` מוחק אותה
       * בכל שמירה — ולכן היא מחזיקה עבודה שאין בקובץ. „ישנה” כאן היא ביחס
       * למה שעל המסך, לא ביחס לדיסק; מולו היא תמיד החדשה מבין השתיים.
       * מחיקתה בגלל כתיבה שנכשלה הייתה משמידה את העבודה היחידה ששרדה, וזה
       * ההפך הגמור ממה שהמודול הזה קיים בשבילו. גיל הטיוטה נאמר למשתמש
       * בשחזור (`savedAt`), וכך „חלקית” אינה מגיעה בהפתעה.
       *
       * `draftedRevision` אינו מתקדם, ולכן הסבב הבא ינסה שוב את אותה עבודה.
       */
      if (written === 'too-large' && !reportedTooLarge) {
        reportedTooLarge = true;
        deps.onDraftTooLarge?.();
      }
      return;
    }

    draftedRevision = writing;
    state = withActiveEntry(state, {
      draft: {
        path: deps.draftPath,
        savedAt: Date.now(),
        documentToken: activeEntry(state)?.document?.token ?? null,
        sourceSize,
      },
    });
    await persistNow();
  }

  function schedulePersist(): void {
    if (disposed) return;
    persistTimer = clearTimer(persistTimer);
    persistTimer = setTimeout(() => schedule(persistNow), PERSIST_DELAY_MS);
  }

  /**
   * מתזמנת כתיבת טיוטה: השהיה מהעריכה האחרונה, אבל לא מעבר ל-`DRAFT_MAX_WAIT_MS`
   * מהעריכה **הראשונה** שטרם נכתבה. ראו את ההנמקה ליד הקבועים.
   */
  function scheduleDraft(): void {
    if (disposed || !deps.isDirty()) return;

    const now = Date.now();
    if (draftDeadline === null) draftDeadline = now + DRAFT_MAX_WAIT_MS;

    draftTimer = clearTimer(draftTimer);
    const wait = Math.max(0, Math.min(DRAFT_DELAY_MS, draftDeadline - now));
    draftTimer = setTimeout(() => schedule(writeDraftNow), wait);
  }

  return {
    get state() {
      return state;
    },

    get hasUnwrittenWork() {
      return deps.isDirty() && revision !== draftedRevision;
    },

    adopt(loaded) {
      state = loaded ?? emptySessionWithId(deps.id);
    },

    setDocument(document, options = {}) {
      const { sourceSize: size = null, keepDraft = false } = options;
      // כל סבב שבאוויר שייך למסמך הקודם, ומכאן והלאה התוצאה שלו נזרקת.
      epoch += 1;
      persistTimer = clearTimer(persistTimer);
      draftTimer = clearTimer(draftTimer);
      draftDeadline = null;
      revision = 0;
      draftedRevision = 0;
      sourceSize = size;
      reportedTooLarge = false;

      /**
       * הסמן נמחק רק כשהמסמך באמת התחלף.
       *
       * שתי הטעויות שהתנאי הזה מונע, וכל אחת מהן בכיוון אחר: מחיקה תמידית
       * הייתה מאבדת את המקום בכל פתיחה חוזרת של **אותו** מסמך — כלומר בדיוק
       * המסלול שהתכונה נכתבה בשבילו. אי-מחיקה הייתה משאירה את הסמן של מסמך
       * א' ברשומה שכבר מזוהה כמסמך ב', ואז הוא היה מוחל עליו: קפיצה שרירותית
       * לאמצע מסמך אחר.
       */
      const previousEntry = activeEntry(state);
      const sameDocument = (previousEntry?.document?.token ?? null) === (document?.token ?? null);

      /**
       * טיוטה שנשמרת עוברת לבעלות המסמך שנפתח ממנה.
       *
       * בלי ההעברה היא הייתה נשארת רשומה על המסמך הקודם — וזה בדיוק המסלול
       * שבו קובץ שלא נמצא נפתח כמסמך חדש: התוכן על המסך, אבל הרשומה טוענת
       * שהוא שייך ל-token שאינו נפתר, ולכן הפתיחה **הבאה** הייתה פוסלת אותו.
       *
       * בלי `keepDraft` המצביע נשאר כפי שהוא — ולא מתאפס. הוא נושא את ה-token
       * של הבעלים שלו, ולכן טיוטה שאינה שייכת למסמך שנפתח נפסלת בקריאה
       * (`decideDraftRecovery`) ואינה זקוקה לניקוי מונע. איפוס כאן היה מנתק
       * את הרשומה מקובץ שעדיין מחזיק עבודה.
       */
      const previousDraft = previousEntry?.draft ?? null;
      const draft =
        keepDraft && previousDraft
          ? { ...previousDraft, documentToken: document?.token ?? null, sourceSize: size }
          : previousDraft;

      state = withActiveEntry(state, {
        document,
        caret: sameDocument ? (previousEntry?.caret ?? null) : null,
        draft,
      });
      schedule(async () => {
        await deps.persist(state);
      });
    },

    /**
     * המשתמש אמר במפורש „אל תשמור” — ולכן מה שהטיוטה מחזיקה אינו מבוקש יותר.
     *
     * זהו המסלול **היחיד** שמוחק טיוטה מלבד שמירה מוצלחת, וזו החלטה: מחיקה
     * על כל מעבר מסמך נראתה סבירה ובפועל השמידה עבודה בשלושה מסלולים שאיש
     * לא התכוון אליהם — פתיחה שנכשלה, טיוטה של מסמך אחר שהמשתמש עוד יחזור
     * אליו, ותשובת „לא” לשאלה על קובץ שהשתנה מבחוץ. בכל שלושתם לא נאמר
     * „למחוק”, ובקובץ הזה מוחקים רק כשנאמר.
     */
    async discardDraft() {
      const hadDraft = activeEntry(state)?.draft !== null;
      state = withActiveEntry(state, { draft: null });
      await run(async () => {
        if (hadDraft) await deps.removeDraft();
        await deps.persist(state);
      });
    },

    updateView(patch) {
      const next = { ...state.view, ...patch };
      const unchanged = (Object.keys(patch) as Array<keyof SessionView>).every(
        (key) => state.view[key] === next[key],
      );
      if (unchanged) return;

      state = { ...state, view: next };
      schedulePersist();
    },

    noteChange() {
      revision += 1;
      schedulePersist();
      scheduleDraft();
    },

    async noteSaved(size = null) {
      draftTimer = clearTimer(draftTimer);
      draftDeadline = null;
      sourceSize = size ?? sourceSize;

      // המצב נקרא ומשתנה **בתוך** התור ולא לפניו. לפניו הוא היה מתאר את
      // הרגע שבו השמירה הסתיימה, בעוד המחיקה עצמה רצה אחרי סבב טיוטה שכבר
      // המתין — כלומר הרשומה הצביעה לקובץ שנמחק אחריה.
      await run(async () => {
        if (activeEntry(state)?.draft === null) {
          await persistNow();
          return;
        }
        state = withActiveEntry(state, { draft: null });
        await deps.removeDraft();
        await persistNow();
      });
    },

    flush() {
      if (disposed) return Promise.resolve();
      persistTimer = clearTimer(persistTimer);
      draftTimer = clearTimer(draftTimer);
      return run(async () => {
        // הטיוטה קודם, והרשומה תמיד: `writeDraftNow` עשוי לצאת מוקדם — מסמך
        // נקי, או שכבר נכתבה טיוטה מאותו שינוי — ואז מצב תצוגה שהמתין
        // להשהיה שבוטלה כאן היה הולך לאיבוד.
        if (deps.isDirty()) await writeDraftNow(true);
        await persistNow();
      }).catch((error: unknown) => {
        console.warn('[otzaria-word] שמירת מצב ההפעלה נכשלה', error);
      });
    },

    dispose() {
      disposed = true;
      epoch += 1;
      persistTimer = clearTimer(persistTimer);
      draftTimer = clearTimer(draftTimer);
      draftDeadline = null;
    },
  };
}
