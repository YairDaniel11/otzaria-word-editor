/**
 * החלפת מסמך אטומית.
 *
 * הקמת מנוע היא אסינכרונית ויכולה להיכשל — קובץ פגום, DOCX מוגן בסיסמה, worker
 * שלא עלה. אם מפרקים את המסמך הפעיל לפני שהחדש מוכן, כשל כזה משאיר את המשתמש
 * בלי שום מסמך, כלומר עבודה שנעלמת. לכן המסמך המועמד נטען ל-host משלו,
 * וההחלפה קורית רק אחרי שהוא מוכן:
 *
 *   הצליח   → הישן מפורק, החדש נחשף.
 *   נכשל    → המועמד מוסר, הישן נשאר פעיל בדיוק כפי שהיה.
 *   הוחלף   → המועמד מפרק את עצמו; לא נוגעים בפעיל.
 *
 * ה-host של המועמד יושב באותו מקום כמו הפעיל (`position: absolute; inset: 0`)
 * והוא `visibility: hidden` — ולא `display: none` — כדי שיהיה לו box אמיתי
 * למדידה. עימוד שנמדד באלמנט בגודל אפס אינו עימוד.
 */
import type { EditorSession } from '../engine/create-editor';

/**
 * נקראת פעם אחת לכל ניסיון פתיחה, עם ה-host שנוצר עבורו.
 *
 * ה-`signal` הוא של הניסיון הזה בלבד, והוא מורם כש-`cancel()` נקרא או
 * כשפתיחה חדשה יותר החליפה אותו. מי שמממש חייב לכבד אותו: בלעדיו „ביטול”
 * פירושו רק שהתוצאה נזרקת, בזמן שהמנוע ממשיך לבנות את המסמך עד הסוף.
 */
export type OpenEditor = (
  host: HTMLElement,
  source?: string | File | Blob,
  signal?: AbortSignal,
) => Promise<EditorSession>;

export type SwapOutcome =
  /** המסמך החדש פעיל. */
  | { status: 'opened'; session: EditorSession }
  /** הפתיחה נכשלה. המסמך שהיה פעיל נשאר פעיל. */
  | { status: 'failed'; error: Error }
  /**
   * הבקשה הזאת אינה עוד מה שמחכים לו: פתיחה חדשה יותר החליפה אותה, `cancel()`
   * ביטל אותה, או ה-swap פורק. שלושתן אינן שגיאה ואין להן מה לומר למשתמש.
   */
  | { status: 'superseded' };

export const HOST_CLASS = 'editor-stack__host';
export const PENDING_CLASS = 'editor-stack__host--pending';

export interface EditorSwap {
  /** ה-session הפעיל, או null אם אין מסמך פתוח. */
  readonly current: EditorSession | null;
  /** האם יש פתיחה בתהליך. */
  readonly isOpening: boolean;
  /**
   * עולה ב-1 בכל פעם ש-`current` **באמת** הוחלף במסמך אחר — לא בכל ניסיון
   * פתיחה. פתיחה שנכשלה או שהוחלפה על ידי בקשה חדשה יותר אינה נוגעת ב-`current`
   * (ראו `SwapOutcome`), ולכן אינה מעלה את המונה הזה.
   *
   * למה זה קיים: `current.superdoc` הוא מופע `SuperDoc` חדש בכל פתיחה מוצלחת
   * (`createEditor` בונה `new SuperDoc(...)` בכל קריאה — נמדד: תיוג
   * `window.__otzariaEditor.superdoc` בדפדפן לפני „מסמך חדש”/„פתח קובץ” לא
   * שרד אחרי), ולכן זהות אובייקט כבר מספיקה כדי לזהות מסמך אחר. המונה הזה
   * קיים בכל זאת בשביל צרכן שרוצה איתות מפורש ובלתי-תלוי בפרט מימוש של
   * SuperDoc (למשל `PageBreakTracker.syncDocument`, engine/page-break.ts) —
   * מספר עולה מבטיח שאותו ערך לעולם לא חוזר, גם אם גרסת מנוע עתידית תשנה
   * את חוזה הזהות של `superdoc`.
   */
  readonly documentGeneration: number;
  open(source?: string | File | Blob): Promise<SwapOutcome>;
  /**
   * „דלג”: נוטש כל פתיחה שבדרך ומשאיר את המסמך הפעיל בדיוק כפי שהיה. מחזיר
   * `false` כשלא היה מה לנטוש.
   *
   * מה שהוא עושה מעל „להתעלם מהתוצאה”: מרים את ה-`signal` של הפתיחה, וזה מה
   * שמפרק את המנוע החצי-בנוי ומשחרר את ה-workers שלו. הפתיחה עצמה תסתיים
   * כ-`superseded` — ולא כ-`failed` — מפני שהדור מתקדם לפני האיתות.
   *
   * מה שהוא **אינו** יכול: לשחרר חוט ראשי שנתקע בלולאה של המנוע. שם גם
   * הלחיצה עצמה אינה מגיעה. ראו OPEN_TIMEOUT_MS ב-engine/create-editor.ts.
   */
  cancel(): boolean;
  /**
   * משחררת את המסמך הפתוח — המנוע, ה-workers וה-host שלו — ומשאירה את ה-swap
   * מוכן לפתיחה חדשה על אותו container.
   *
   * זהו „טאב שנרדם”: מסמך ברקע שלא נגעו בו זמן מה משוחרר מהזיכרון, ונפתח שוב
   * מהרשומה שלו כשחוזרים אליו (App.vue, `sleepTab`/`openPendingTab`). ההבדל
   * מ-`destroy` אינו בכוונה בלבד: `destroy` הוא **סופי** — פתיחה אחריו
   * מוחזרת כ-`superseded` ואינה נוגעת ב-container, שממילא כבר הוסר עם הטאב
   * (`DocumentSession.destroy`). `close` משאיר את ה-swap פתוח לפתיחה הבאה.
   */
  close(): void;
  /**
   * פירוק סופי. משחרר כמו `close`, ובנוסף נועל: כל `open` שיגיע אחריו יוחזר
   * כ-`superseded` בלי לבנות מנוע. בלי הנעילה, „close” ו„destroy” היו אותו
   * דבר בדיוק, וההבחנה ביניהן הייתה הערה בלבד — כלומר פתיחה על טאב שכבר
   * נסגר הייתה בונה מנוע שלם לתוך container שאינו במסמך.
   */
  destroy(): void;
}

export function createEditorSwap(container: HTMLElement, openEditor: OpenEditor): EditorSwap {
  let current: EditorSession | null = null;
  let currentHost: HTMLElement | null = null;
  let generation = 0;
  /** ראו `EditorSwap.documentGeneration`. עולה רק כש-`current` באמת מוחלף. */
  let documentGeneration = 0;
  let pending = 0;
  /** ראו `EditorSwap.destroy` — פירוק סופי, בשונה מ-`close`. */
  let destroyed = false;
  /**
   * הפתיחות שעוד לא הסתיימו: ה-host שלהן — כדי שנטישה תוכל לנקות אותו — וה-
   * controller שמרים את האיתות. המפתח הוא ה-host, שהוא הזהות היחידה של ניסיון
   * פתיחה שיש כאן משני הצדדים.
   */
  const opening = new Map<HTMLElement, AbortController>();

  /**
   * נוטש את כל מה שבדרך: מקדם את הדור, מסיר את ה-hosts, ומרים את האיתות.
   *
   * הדור **לפני** האיתות, ולא אחריו: הדחייה שהאיתות גורם מגיעה למסלול הכשל
   * של `open`, ושם מה שקובע אם היא תדווח כשגיאה למשתמש או תיבלע כ-superseded
   * הוא בדיוק המונה הזה.
   */
  function abandonPending(): void {
    generation += 1;
    for (const [host, controller] of opening) {
      host.remove();
      controller.abort();
    }
    opening.clear();
  }

  function createHost(): HTMLElement {
    const host = document.createElement('div');
    host.className = `${HOST_CLASS} ${PENDING_CLASS}`;
    container.appendChild(host);
    return host;
  }

  function discard(session: EditorSession | null, host: HTMLElement | null): void {
    try {
      session?.destroy();
    } catch (error) {
      // פירוק המנוע הוא שרשרת ארוכה (unmount של Vue, surfaces, controller).
      // זריקה שם אינה יכולה להשאיר את ה-swap במצב לא-עקבי או להפוך open
      // לדחייה שאינה בחוזה שלו.
      console.error('[otzaria-word] כשל בפירוק מסמך', error);
    }
    host?.remove();
  }

  /**
   * משחררת את הפתוח ואת מה שבדרך. `close` ו-`destroy` הן אותה פעולה בדיוק —
   * ראו `EditorSwap.close`.
   *
   * כל פתיחה שבדרך תיראה את עצמה כמוחלפת ותפרק את עצמה. ה-host שלה מוסר כאן,
   * כי הוא משתנה מקומי ב-`open` ואינו נגיש מבחוץ; פתיחה שלא תסתיים לעולם לא
   * תשאיר אותו על המסך.
   */
  function release(): void {
    abandonPending();
    const previous = current;
    const previousHost = currentHost;
    current = null;
    currentHost = null;
    discard(previous, previousHost);
  }

  return {
    get current() {
      return current;
    },

    get isOpening() {
      return pending > 0;
    },

    get documentGeneration() {
      return documentGeneration;
    },

    async open(source) {
      // ה-swap פורק: אין container לפתוח לתוכו, ומנוע שייבנה כאן לא יראה
      // אף אחד ולא ישוחרר בידי איש. `superseded` ולא `failed` — זו אינה
      // תקלה שיש לדווח עליה למשתמש, בדיוק כמו פתיחה שהוחלפה.
      if (destroyed) return { status: 'superseded' };

      const mine = ++generation;
      const host = createHost();
      const aborts = new AbortController();
      opening.set(host, aborts);
      pending += 1;

      let session: EditorSession;
      try {
        session = await openEditor(host, source, aborts.signal);
      } catch (error) {
        opening.delete(host);
        host.remove();
        pending -= 1;
        if (mine !== generation) return { status: 'superseded' };
        return {
          status: 'failed',
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
      opening.delete(host);
      pending -= 1;

      // בקשה חדשה יותר כבר בדרך, או שכבר הוחלף: המועמד הזה מפרק את עצמו ואינו
      // נוגע בפעיל — גם אם הוא זה שהתיישב אחרון.
      if (mine !== generation) {
        discard(session, host);
        return { status: 'superseded' };
      }

      // ההשמה לפני הפירוק: כשל בפירוק הישן לא יכול להשאיר את ה-swap מצביע
      // על session הרוס ואת החדש בלי בעלים.
      const previous = current;
      const previousHost = currentHost;
      current = session;
      currentHost = host;
      // כאן ולא במקום אחר: זו הנקודה היחידה שבה `current` באמת מוחלף
      // במסמך אחר — לא בכל ניסיון פתיחה (ראו `EditorSwap.documentGeneration`).
      documentGeneration += 1;
      host.classList.remove(PENDING_CLASS);
      discard(previous, previousHost);
      return { status: 'opened', session };
    },

    cancel() {
      if (pending === 0) return false;
      abandonPending();
      return true;
    },

    close() {
      release();
    },

    destroy() {
      release();
      destroyed = true;
    },
  };
}
