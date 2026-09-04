/**
 * הבדיקה המרכזית כאן היא "מסמך פעיל + פתיחה נכשלת ⇒ הקודם נשאר פעיל". זה
 * המצב שבו אובדת עבודה: קובץ פגום או מוגן בסיסמה שמפרק את המסמך שהמשתמש כתב.
 * שאר הבדיקות מכסות את מה שקורה כששתי פתיחות מתרוצצות, כולל סיום מחוץ לסדר.
 */
import { describe, it, expect, vi } from 'vitest';
import type { EditorSession } from '../../src/engine/create-editor';
import { createEditorSwap, HOST_CLASS, PENDING_CLASS } from '../../src/sessions/editor-swap';

interface Deferred {
  promise: Promise<EditorSession>;
  resolve: (session: EditorSession) => void;
  reject: (error: Error) => void;
}

function deferred(): Deferred {
  let resolve!: (session: EditorSession) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<EditorSession>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fakeSession(name: string): EditorSession & { name: string; destroy: ReturnType<typeof vi.fn> } {
  return {
    name,
    superdoc: {} as EditorSession['superdoc'],
    ui: {} as EditorSession['ui'],
    onDispose: vi.fn(),
    destroy: vi.fn(),
  } as unknown as EditorSession & { name: string; destroy: ReturnType<typeof vi.fn> };
}

function setup() {
  const container = document.createElement('div');
  document.body.replaceChildren(container);

  const opens: Array<{
    host: HTMLElement;
    source?: unknown;
    signal?: AbortSignal;
    deferred: Deferred;
  }> = [];
  const swap = createEditorSwap(container, (host, source, signal) => {
    const d = deferred();
    opens.push({ host, source, signal, deferred: d });
    return d.promise;
  });

  return { container, opens, swap };
}

const hosts = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>(`.${HOST_CLASS}`));

describe('createEditorSwap', () => {
  it('פתיחה ראשונה הופכת לפעילה ונחשפת', async () => {
    const { container, opens, swap } = setup();

    const promise = swap.open('a.docx');
    expect(hosts(container)).toHaveLength(1);
    expect(hosts(container)[0].classList.contains(PENDING_CLASS)).toBe(true);
    expect(swap.isOpening).toBe(true);

    const first = fakeSession('a');
    opens[0].deferred.resolve(first);

    await expect(promise).resolves.toEqual({ status: 'opened', session: first });
    expect(swap.current).toBe(first);
    expect(swap.isOpening).toBe(false);
    expect(hosts(container)).toHaveLength(1);
    expect(hosts(container)[0].classList.contains(PENDING_CLASS)).toBe(false);
  });

  it('מוסר את ה-source לפותח', async () => {
    const { opens, swap } = setup();
    void swap.open('http://127.0.0.1/f/tok');

    expect(opens[0].source).toBe('http://127.0.0.1/f/tok');
  });

  it('פתיחה מוצלחת מפרקת את הקודם ומשאירה host אחד', async () => {
    const { container, opens, swap } = setup();

    const first = fakeSession('a');
    const firstOpen = swap.open('a.docx');
    opens[0].deferred.resolve(first);
    await firstOpen;

    const second = fakeSession('b');
    const secondOpen = swap.open('b.docx');
    expect(hosts(container)).toHaveLength(2);
    expect(first.destroy).not.toHaveBeenCalled();

    opens[1].deferred.resolve(second);
    await secondOpen;

    expect(first.destroy).toHaveBeenCalledTimes(1);
    expect(swap.current).toBe(second);
    expect(hosts(container)).toHaveLength(1);
  });

  it('מסמך פעיל ופתיחה שנכשלת — הקודם נשאר פעיל', async () => {
    const { container, opens, swap } = setup();

    const first = fakeSession('a');
    const firstOpen = swap.open('a.docx');
    opens[0].deferred.resolve(first);
    await firstOpen;

    const failing = swap.open('corrupt.docx');
    opens[1].deferred.reject(new Error('הקובץ מוגן בסיסמה'));
    const outcome = await failing;

    expect(outcome).toEqual({ status: 'failed', error: expect.any(Error) });
    expect(outcome.status === 'failed' && outcome.error.message).toBe('הקובץ מוגן בסיסמה');
    // העיקר: המסמך שהמשתמש עבד עליו לא נגע ולא פורק.
    expect(swap.current).toBe(first);
    expect(first.destroy).not.toHaveBeenCalled();
    expect(hosts(container)).toHaveLength(1);
    expect(hosts(container)[0].classList.contains(PENDING_CLASS)).toBe(false);
  });

  it('כשל בפתיחה ראשונה משאיר את המצב ריק ובלי hosts', async () => {
    const { container, opens, swap } = setup();

    const failing = swap.open('corrupt.docx');
    opens[0].deferred.reject(new Error('הקובץ פגום'));

    const outcome = await failing;

    expect(outcome.status).toBe('failed');
    expect(swap.current).toBeNull();
    expect(swap.isOpening).toBe(false);
    expect(hosts(container)).toHaveLength(0);
  });

  it('פתיחה שהוחלפה מפרקת את עצמה ואינה נוגעת בפעיל', async () => {
    const { container, opens, swap } = setup();

    const slow = swap.open('slow.docx');
    const fast = swap.open('fast.docx');

    const fastSession = fakeSession('fast');
    opens[1].deferred.resolve(fastSession);
    await expect(fast).resolves.toEqual({ status: 'opened', session: fastSession });

    const slowSession = fakeSession('slow');
    opens[0].deferred.resolve(slowSession);

    await expect(slow).resolves.toEqual({ status: 'superseded' });
    expect(slowSession.destroy).toHaveBeenCalledTimes(1);
    expect(fastSession.destroy).not.toHaveBeenCalled();
    expect(swap.current).toBe(fastSession);
    expect(hosts(container)).toHaveLength(1);
  });

  it('כשל של פתיחה שהוחלפה אינו מדווח כשגיאה', async () => {
    const { opens, swap } = setup();

    const slow = swap.open('slow.docx');
    const fast = swap.open('fast.docx');
    opens[1].deferred.resolve(fakeSession('fast'));
    await fast;

    opens[0].deferred.reject(new Error('בוטל'));

    await expect(slow).resolves.toEqual({ status: 'superseded' });
  });

  it('destroy מפרק את הפעיל ומנקה את המסך', async () => {
    const { container, opens, swap } = setup();
    const first = fakeSession('a');
    const open = swap.open();
    opens[0].deferred.resolve(first);
    await open;

    swap.destroy();

    expect(first.destroy).toHaveBeenCalledTimes(1);
    expect(swap.current).toBeNull();
    expect(hosts(container)).toHaveLength(0);
  });

  it('פתיחה שהייתה בדרך בזמן destroy מפרקת את עצמה', async () => {
    const { container, opens, swap } = setup();

    const inFlight = swap.open();
    swap.destroy();
    const late = fakeSession('late');
    opens[0].deferred.resolve(late);

    await expect(inFlight).resolves.toEqual({ status: 'superseded' });
    expect(late.destroy).toHaveBeenCalledTimes(1);
    expect(swap.current).toBeNull();
    expect(hosts(container)).toHaveLength(0);
  });

  it('כשל בפירוק הישן אינו מפיל את ההחלפה', async () => {
    const { container, opens, swap } = setup();
    const first = fakeSession('a');
    const firstOpen = swap.open();
    opens[0].deferred.resolve(first);
    await firstOpen;
    first.destroy.mockImplementation(() => {
      throw new Error('destroy קרס');
    });

    const second = fakeSession('b');
    const secondOpen = swap.open();
    opens[1].deferred.resolve(second);

    // ההחלפה מצליחה, ה-swap מצביע על החדש, וה-host הישן מוסר בכל זאת.
    await expect(secondOpen).resolves.toEqual({ status: 'opened', session: second });
    expect(swap.current).toBe(second);
    expect(hosts(container)).toHaveLength(1);
    expect(hosts(container)[0].classList.contains(PENDING_CLASS)).toBe(false);
  });

  it('destroy פעמיים אינו זורק ואינו מפרק פעמיים', async () => {
    const { container, opens, swap } = setup();
    const first = fakeSession('a');
    const open = swap.open();
    opens[0].deferred.resolve(first);
    await open;

    swap.destroy();
    swap.destroy();

    expect(first.destroy).toHaveBeenCalledTimes(1);
    expect(hosts(container)).toHaveLength(0);
  });

  it('destroy מסיר את ה-host של פתיחה שלא הסתיימה', () => {
    const { container, swap } = setup();

    void swap.open();
    expect(hosts(container)).toHaveLength(1);

    swap.destroy();

    // הפתיחה עוד באוויר, אבל ה-host שלה אינו נשאר על המסך.
    expect(hosts(container)).toHaveLength(0);
  });

  /**
   * „דלג” בשורת המצב (sessions/document-load.ts, ui/shell/StatusBar.vue).
   *
   * מה שנמדד כאן הוא לא „הפתיחה נעצרה” — היא לא נעצרת, המנוע כבר בונה —
   * אלא שלושת הדברים שבלעדיהם „דלג” הוא הסתרה של הפס ולא ביטול:
   * המסמך הפעיל אינו נגע, האיתות מורם כדי שהמנוע יפורק, והתוצאה נבלעת
   * כ-superseded ולא מדווחת למשתמש כשגיאה.
   */
  describe('cancel', () => {
    it('מוסר את ה-signal של הניסיון לפותח', () => {
      const { opens, swap } = setup();
      void swap.open('a.docx');

      expect(opens[0].signal).toBeInstanceOf(AbortSignal);
      expect(opens[0].signal?.aborted).toBe(false);
    });

    it('מרים את האיתות — זה מה שמפרק את המנוע החצי-בנוי', () => {
      const { opens, swap } = setup();
      void swap.open('a.docx');

      expect(swap.cancel()).toBe(true);

      // בלי זה „דלג” היה מסתיר את הפס בזמן שהמכונה ממשיכה לבנות מסמך שנזנח.
      expect(opens[0].signal?.aborted).toBe(true);
    });

    it('מסיר מיד את ה-host של הפתיחה שנזנחה', () => {
      const { container, swap } = setup();
      void swap.open('a.docx');
      expect(hosts(container)).toHaveLength(1);

      swap.cancel();

      expect(hosts(container)).toHaveLength(0);
      expect(swap.isOpening).toBe(true);
    });

    it('מסמך פעיל נשאר פעיל בדיוק כפי שהיה', async () => {
      const { container, opens, swap } = setup();
      const first = fakeSession('a');
      const firstOpen = swap.open('a.docx');
      opens[0].deferred.resolve(first);
      await firstOpen;

      const cancelled = swap.open('b.docx');
      swap.cancel();
      opens[1].deferred.reject(new Error('פתיחת המסמך בוטלה'));

      // superseded ולא failed: אין שגיאה שתגיע לשורת המצב על פעולה שהמשתמש
      // עצמו ביקש.
      await expect(cancelled).resolves.toEqual({ status: 'superseded' });
      expect(swap.current).toBe(first);
      expect(first.destroy).not.toHaveBeenCalled();
      expect(hosts(container)).toHaveLength(1);
      expect(swap.documentGeneration).toBe(1);
    });

    it('פתיחה שבוטלה אך הצליחה בכל זאת מפרקת את עצמה', async () => {
      const { container, opens, swap } = setup();
      const inFlight = swap.open('a.docx');
      swap.cancel();

      // מנוע שאינו מכבד את האיתות, או שסיים בדיוק באותו רגע. המועמד אינו
      // מתיישב על המסך והוא זה שמפרק את עצמו.
      const late = fakeSession('late');
      opens[0].deferred.resolve(late);

      await expect(inFlight).resolves.toEqual({ status: 'superseded' });
      expect(late.destroy).toHaveBeenCalledTimes(1);
      expect(swap.current).toBeNull();
      expect(swap.documentGeneration).toBe(0);
      expect(hosts(container)).toHaveLength(0);
    });

    it('בלי פתיחה בדרך אינו מדווח שביטל', async () => {
      const { opens, swap } = setup();
      expect(swap.cancel()).toBe(false);

      const open = swap.open('a.docx');
      opens[0].deferred.resolve(fakeSession('a'));
      await open;

      // הפתיחה נגמרה: אין מה לבטל, וגם לא את המסמך שנפתח.
      expect(swap.cancel()).toBe(false);
      expect(swap.current).not.toBeNull();
    });

    it('מבטל את כל מה שבדרך, גם שתי פתיחות שמתרוצצות', () => {
      const { container, opens, swap } = setup();
      void swap.open('a.docx');
      void swap.open('b.docx');

      expect(swap.cancel()).toBe(true);

      expect(opens[0].signal?.aborted).toBe(true);
      expect(opens[1].signal?.aborted).toBe(true);
      expect(hosts(container)).toHaveLength(0);
    });

    it('אחרי ביטול אפשר לפתוח שוב', async () => {
      const { container, opens, swap } = setup();
      void swap.open('a.docx');
      swap.cancel();

      const again = swap.open('a.docx');
      const session = fakeSession('a');
      opens[1].deferred.resolve(session);

      await expect(again).resolves.toEqual({ status: 'opened', session });
      expect(swap.current).toBe(session);
      expect(hosts(container)).toHaveLength(1);
    });

    it('destroy מרים את האיתות של פתיחה שבדרך', () => {
      const { opens, swap } = setup();
      void swap.open('a.docx');

      swap.destroy();

      expect(opens[0].signal?.aborted).toBe(true);
    });
  });

  /**
   * ממצא QA (engine/page-break.ts, „QA עצמאי”): `PageBreakTracker.syncDocument`
   * הוחלפה מהשוואת זהות `host` להשוואת `documentGeneration` — מונה מפורש
   * שאינו נשען על התנהגות לא-מתועדת של `SuperDoc`. הבדיקות כאן על המונה עצמו:
   * הוא עולה **רק** כש-`current` באמת מוחלף — לא בכל ניסיון פתיחה.
   */
  describe('documentGeneration', () => {
    it('מתחיל מ-0 ועולה בפתיחה הראשונה המוצלחת', async () => {
      const { opens, swap } = setup();
      expect(swap.documentGeneration).toBe(0);

      const open = swap.open('a.docx');
      opens[0].deferred.resolve(fakeSession('a'));
      await open;

      expect(swap.documentGeneration).toBe(1);
    });

    it('עולה בכל פתיחה מוצלחת נוספת — מספר חדש לכל מסמך', async () => {
      const { opens, swap } = setup();

      const first = swap.open('a.docx');
      opens[0].deferred.resolve(fakeSession('a'));
      await first;
      const afterFirst = swap.documentGeneration;

      const second = swap.open('b.docx');
      opens[1].deferred.resolve(fakeSession('b'));
      await second;

      expect(swap.documentGeneration).toBe(afterFirst + 1);
      expect(swap.documentGeneration).not.toBe(afterFirst);
    });

    it('אינו עולה על פתיחה שנכשלה — המסמך הפעיל לא השתנה', async () => {
      const { opens, swap } = setup();
      const first = swap.open('a.docx');
      opens[0].deferred.resolve(fakeSession('a'));
      await first;
      const before = swap.documentGeneration;

      const failing = swap.open('corrupt.docx');
      opens[1].deferred.reject(new Error('פגום'));
      await failing;

      expect(swap.documentGeneration).toBe(before);
    });

    it('אינו עולה על פתיחה שהוחלפה על ידי בקשה חדשה יותר (superseded)', async () => {
      const { opens, swap } = setup();
      const before = swap.documentGeneration;

      const slow = swap.open('slow.docx');
      const fast = swap.open('fast.docx');
      opens[1].deferred.resolve(fakeSession('fast'));
      await fast;
      const afterFast = swap.documentGeneration;

      opens[0].deferred.resolve(fakeSession('slow'));
      await slow;

      // המועמד האיטי "התיישב" אחרון, אבל הוא superseded ואינו נוגע במונה.
      expect(swap.documentGeneration).toBe(afterFast);
      expect(swap.documentGeneration).toBe(before + 1);
    });

    it('קריאות חוזרות בלי פתיחה חדשה מחזירות את אותו ערך — "אותו מסמך"', async () => {
      const { opens, swap } = setup();
      const open = swap.open('a.docx');
      opens[0].deferred.resolve(fakeSession('a'));
      await open;

      const first = swap.documentGeneration;
      const second = swap.documentGeneration;

      expect(first).toBe(second);
    });
  });
});

describe('close', () => {
  it('משחררת את המסמך הפתוח ומשאירה את ה-swap מוכן לפתיחה חדשה', async () => {
    // זהו החוזה של „טאב נרדם” (App.vue, `sleepTab`): המנוע משוחרר, והטאב
    // נפתח שוב מהרשומה שלו כשחוזרים אליו. בלי הבדיקה הזאת „close” ו„destroy”
    // היו יכולים להיפרד בהתנהגות בלי שאיש ישים לב.
    const { container, opens, swap } = setup();
    const first = fakeSession('a');
    const firstOpen = swap.open('a.docx');
    opens[0].deferred.resolve(first);
    await firstOpen;

    swap.close();

    expect(swap.current, 'המסמך שוחרר').toBeNull();
    expect(first.destroy, 'והמנוע שלו פורק').toHaveBeenCalled();
    expect(hosts(container), 'וה-host שלו הוסר').toHaveLength(0);

    const second = fakeSession('b');
    const secondOpen = swap.open('b.docx');
    opens[1].deferred.resolve(second);

    await expect(secondOpen).resolves.toEqual({ status: 'opened', session: second });
    expect(swap.current, 'פתיחה חדשה על אותו container עובדת').toBe(second);
    expect(hosts(container)).toHaveLength(1);
  });

  it('`destroy` הוא סופי — ורק בזה הוא נבדל מ-`close`', async () => {
    // בלי הנעילה השתיים היו אותו קוד בדיוק, וההבחנה ביניהן הערה בלבד.
    const { container, opens, swap } = setup();
    const first = fakeSession('a');
    const firstOpen = swap.open('a.docx');
    opens[0].deferred.resolve(first);
    await firstOpen;

    swap.destroy();
    const after = await swap.open('b.docx');

    expect(after).toEqual({ status: 'superseded' });
    expect(opens, 'לא נבנה מנוע לתוך container שכבר אינו במסמך').toHaveLength(1);
    expect(hosts(container)).toHaveLength(0);
    expect(swap.current).toBeNull();
  });
});
