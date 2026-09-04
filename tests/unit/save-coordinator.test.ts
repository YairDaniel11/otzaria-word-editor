/**
 * כל הבדיקות כאן נגזרות מכלל אחד: מסמך שלא נשמר בוודאות נשאר מלוכלך. הרגרסיה
 * של הכלל הזה היא עבודה שנעלמת — משתמש שרואה „נשמר”, סוגר, ומגלה שהקובץ
 * בגרסה קודמת.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AUTOSAVE_DELAY_MS,
  createSaveCoordinator,
  type SaveCommitInput,
  type SaveCommitOutput,
  type SaveCoordinator,
  type SaveSnapshot,
} from '../../src/sessions/save-coordinator';

interface Harness {
  coordinator: SaveCoordinator;
  commits: SaveCommitInput[];
  /** כל commit מוצלח, כפי שדווח דרך `onSaved`. */
  saved: Array<{ token: string; name: string; size: number }>;
  /** ה-writeTokens ששוחררו דרך fs.abortBinaryWrite. */
  aborts: string[];
  uploads: Array<{ url: string; size: number }>;
  states: SaveSnapshot[];
  exportCount: () => number;
  /** משנה את מה שהייצוא הבא יעשה. */
  onExport: (fn: () => Promise<Blob> | Blob) => void;
  onCommit: (fn: (input: SaveCommitInput) => Promise<SaveCommitOutput>) => void;
  onUpload: (fn: (url: string, blob: Blob) => Promise<void>) => void;
  onBeginWrite: (fn: (size: number) => Promise<{ writeToken: string; uploadUrl: string }>) => void;
  onAbort: (fn: (writeToken: string) => Promise<void>) => void;
}

function harness(): Harness {
  const commits: SaveCommitInput[] = [];
  const saved: Array<{ token: string; name: string; size: number }> = [];
  const aborts: string[] = [];
  const uploads: Array<{ url: string; size: number }> = [];
  const states: SaveSnapshot[] = [];
  let exports = 0;
  let ticket = 0;

  let exportImpl: () => Promise<Blob> | Blob = () => new Blob(['docx']);
  let commitImpl: (input: SaveCommitInput) => Promise<SaveCommitOutput> = async (input) => ({
    cancelled: false,
    token: input.targetToken ?? 'token-new',
    name: 'חידושים.docx',
  });
  let uploadImpl: (url: string, blob: Blob) => Promise<void> = async () => {};
  let abortImpl: (writeToken: string) => Promise<void> = async () => {};
  let beginImpl: (size: number) => Promise<{ writeToken: string; uploadUrl: string }> = async () => {
    ticket += 1;
    return { writeToken: `w${ticket}`, uploadUrl: `http://127.0.0.1/w/w${ticket}` };
  };

  const coordinator = createSaveCoordinator({
    exportDocument: async () => {
      exports += 1;
      return exportImpl();
    },
    beginWrite: (size) => beginImpl(size),
    upload: async (url, blob) => {
      uploads.push({ url, size: blob.size });
      await uploadImpl(url, blob);
    },
    commit: async (input) => {
      commits.push({ ...input });
      return commitImpl(input);
    },
    abort: async (writeToken) => {
      aborts.push(writeToken);
      await abortImpl(writeToken);
    },
    onStateChange: (snapshot) => states.push(snapshot),
    onSaved: (info) => saved.push(info),
  });

  return {
    coordinator,
    commits,
    saved,
    aborts,
    uploads,
    states,
    exportCount: () => exports,
    onExport: (fn) => {
      exportImpl = fn;
    },
    onCommit: (fn) => {
      commitImpl = fn;
    },
    onUpload: (fn) => {
      uploadImpl = fn;
    },
    onBeginWrite: (fn) => {
      beginImpl = fn;
    },
    onAbort: (fn) => {
      abortImpl = fn;
    },
  };
}

/**
 * מריק microtasks. הסבב מגיע ל-upload רק אחרי ה-await של הייצוא, ולכן מיד
 * אחרי saveNow ה-hook עוד לא נקרא.
 */
async function flush(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

// כשל שמירה נרשם ל-console.warn (fail() בקואורדינטור); הבדיקות כאן מייצרות
// אותו בכוונה, ובלי ההשתקה כל ריצה מדפיסה עקבות מחסנית של כשלים מתוכננים.
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('saveNow', () => {
  it('מסמך נקי שכבר נשמר לקובץ אינו נשמר שוב', async () => {
    const h = harness();
    // היעד הוא חצי מההגדרה של „נקי”: מסמך בלי `targetToken` אינו נקי אלא
    // חסר עותק בדיסק. ראו הבדיקה שמתחת.
    h.coordinator.reset({ token: 'tok', name: 'חידושים.docx' });

    await expect(h.coordinator.saveNow()).resolves.toEqual({ status: 'clean' });
    expect(h.exportCount()).toBe(0);
  });

  it('„שמור” על מסמך שלא נכתב לדיסק מעולם פותח „שמור בשם”, גם כשאין בו עריכה', async () => {
    // הלחיצה שנבלעה: מסמך חדש ונקי החזיר `clean` ולא עשה **דבר** — לא דיאלוג
    // ולא הודעה. מסמך בלי `targetToken` אינו „נקי”, הוא „אין לו עותק בשום
    // מקום”, ולכן הוא כן עובר סבב — וה-commit יוצא בלי `targetToken`, כלומר
    // המאחז פותח את הדיאלוג.
    const h = harness();

    const outcome = await h.coordinator.saveNow({ suggestedName: 'מסמך חדש.docx' });

    expect(outcome).toEqual({ status: 'saved', token: 'token-new', name: 'חידושים.docx', size: 4 });
    expect(h.exportCount()).toBe(1);
    expect(h.commits[0]?.targetToken, 'בלי יעד — כלומר „שמור בשם”').toBeUndefined();
  });

  it('שמירה ראשונה בלי יעד עוברת דרך „שמור בשם” ומאמצת את ה-token', async () => {
    const h = harness();
    h.coordinator.markDirty();

    const outcome = await h.coordinator.saveNow();

    expect(outcome).toEqual({
      status: 'saved',
      token: 'token-new',
      name: 'חידושים.docx',
      // גודל הבייטים שנכתבו. ראו `onSaved` — זה הבסיס להשוואה מול הדיסק.
      size: 4,
    });
    // בלי targetToken — כלומר ה-commit פותח דיאלוג.
    expect(h.commits[0].targetToken).toBeUndefined();
    expect(h.coordinator.snapshot).toMatchObject({
      isDirty: false,
      state: 'idle',
      targetToken: 'token-new',
    });
  });

  it('שמירה חוזרת כותבת לאותו יעד בלי דיאלוג', async () => {
    const h = harness();
    h.coordinator.markDirty();
    await h.coordinator.saveNow();

    h.coordinator.markDirty();
    await h.coordinator.saveNow();

    expect(h.commits).toHaveLength(2);
    expect(h.commits[1].targetToken).toBe('token-new');
  });

  it('„שמור בשם” על מסמך נקי מייצא ופותח דיאלוג', async () => {
    const h = harness();
    h.coordinator.adoptTarget({ token: 'tok', name: 'a.docx' });

    const outcome = await h.coordinator.saveNow({ forceSaveAs: true });

    expect(outcome.status).toBe('saved');
    expect(h.exportCount()).toBe(1);
    expect(h.commits[0].targetToken).toBeUndefined();
  });

  it('ביטול „שמור בשם” משאיר את המסמך מלוכלך ובלי שגיאה', async () => {
    const h = harness();
    h.coordinator.markDirty();
    h.onCommit(async () => ({ cancelled: true }));

    const outcome = await h.coordinator.saveNow();

    expect(outcome).toEqual({ status: 'cancelled' });
    expect(h.coordinator.snapshot).toMatchObject({
      isDirty: true,
      state: 'idle',
      lastError: null,
      targetToken: null,
    });
  });
});

describe('כשלים', () => {
  it('כשל ייצוא משאיר מלוכלך ואינו מעלה כלום', async () => {
    const h = harness();
    h.coordinator.markDirty();
    h.onExport(() => Promise.reject(new Error('המנוע קרס')));

    const outcome = await h.coordinator.saveNow();

    expect(outcome.status).toBe('failed');
    expect(outcome.status === 'failed' && outcome.message).toContain('המנוע קרס');
    expect(h.uploads).toEqual([]);
    expect(h.coordinator.snapshot).toMatchObject({ isDirty: true, state: 'error' });
  });

  it('כשל העלאה משאיר מלוכלך ואינו עושה commit', async () => {
    const h = harness();
    h.coordinator.markDirty();
    h.onUpload(() => Promise.reject(new Error('413')));

    const outcome = await h.coordinator.saveNow();

    expect(outcome.status).toBe('failed');
    expect(h.commits).toEqual([]);
    expect(h.coordinator.snapshot).toMatchObject({ isDirty: true, state: 'error' });
  });

  it('כשל העלאה משחרר את ההעלאה', async () => {
    const h = harness();
    h.coordinator.markDirty();
    h.onUpload(() => Promise.reject(new Error('413')));

    await h.coordinator.saveNow();

    // הכשל אינו סיבה להשאיר את הסלוט תפוס עד הפקיעה.
    expect(h.aborts).toEqual(['w1']);
  });

  it('כשל ייצוא אינו מנסה לשחרר העלאה שלא נפתחה', async () => {
    const h = harness();
    h.coordinator.markDirty();
    h.onExport(() => Promise.reject(new Error('המנוע קרס')));

    await h.coordinator.saveNow();

    expect(h.aborts).toEqual([]);
  });

  it('שמירה מוצלחת אינה משחררת — ה-commit צרך את ההעלאה', async () => {
    const h = harness();
    h.coordinator.markDirty();

    await h.coordinator.saveNow();

    expect(h.aborts).toEqual([]);
  });

  it('כשל בשחרור אינו הופך לכשל שמירה', async () => {
    const h = harness();
    h.coordinator.markDirty();
    h.onUpload(() => Promise.reject(new Error('413')));
    h.onAbort(() => Promise.reject(new Error('גם הביטול נפל')));

    const outcome = await h.coordinator.saveNow();

    // הכשל שמדווח הוא של ההעלאה, לא של הניקוי.
    expect(outcome.status).toBe('failed');
    expect(outcome.status === 'failed' && outcome.message).toContain('413');
  });

  it('כשל ב-beginWrite מדווח על כשל בהכנת השמירה ולא כשל בהעלאה', async () => {
    const h = harness();
    h.coordinator.markDirty();
    h.onBeginWrite(() => Promise.reject(new Error('error.permission_denied')));

    const outcome = await h.coordinator.saveNow();

    expect(outcome.status).toBe('failed');
    if (outcome.status === 'failed') {
      expect(outcome.message).toContain('הכנת השמירה באוצריא נכשלה');
      expect(outcome.message).toContain('error.permission_denied');
      expect(outcome.message).not.toContain('העלאת המסמך נכשלה');
    }
  });

  it('כשל commit משאיר מלוכלך ואינו מאמץ יעד', async () => {
    const h = harness();
    h.coordinator.markDirty();
    h.onCommit(() => Promise.reject(new Error('error.permission_denied')));

    const outcome = await h.coordinator.saveNow();

    expect(outcome.status).toBe('failed');
    expect(h.coordinator.snapshot).toMatchObject({ isDirty: true, targetToken: null });
  });

  it('commit שחוזר בלי token נחשב כשל', async () => {
    const h = harness();
    h.coordinator.markDirty();
    h.onCommit(async () => ({ cancelled: false }));

    const outcome = await h.coordinator.saveNow();

    expect(outcome.status).toBe('failed');
    expect(h.coordinator.snapshot).toMatchObject({ isDirty: true, targetToken: null });
  });

  it('נסיון חוזר אחרי כשל מצליח ומנקה את השגיאה', async () => {
    const h = harness();
    h.coordinator.markDirty();
    h.onUpload(() => Promise.reject(new Error('נפל')));
    await h.coordinator.saveNow();

    h.onUpload(async () => {});
    const outcome = await h.coordinator.saveNow();

    expect(outcome.status).toBe('saved');
    expect(h.coordinator.snapshot).toMatchObject({
      isDirty: false,
      state: 'idle',
      lastError: null,
    });
  });
});

describe('שמירות מתחרות', () => {
  it('שתי קריאות במקביל אינן מריצות שני סבבים', async () => {
    const h = harness();
    h.coordinator.markDirty();
    let release!: () => void;
    h.onUpload(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    const first = h.coordinator.saveNow();
    const second = h.coordinator.saveNow();
    expect(second).toBe(first);

    await flush();
    release();
    await first;

    expect(h.exportCount()).toBe(1);
    expect(h.commits).toHaveLength(1);
  });

  it('עריכה בזמן שמירה מריצה סבב נוסף ואינה מסומנת כשמורה', async () => {
    const h = harness();
    h.coordinator.markDirty();
    let release!: () => void;
    h.onUpload(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    const saving = h.coordinator.saveNow();
    await flush();
    // המשתמש הקליד בזמן שהסבב הראשון באוויר.
    h.coordinator.markDirty();
    h.onUpload(async () => {});
    release();
    const outcome = await saving;

    expect(outcome.status).toBe('saved');
    // שני סבבים: הראשון לא הכיל את ההקלדה, השני כן.
    expect(h.exportCount()).toBe(2);
    expect(h.coordinator.snapshot.isDirty).toBe(false);
    // הסבב השני כותב ליעד שהתקבל בראשון — בלי דיאלוג נוסף.
    expect(h.commits[1].targetToken).toBe('token-new');
  });

  it('עריכה בזמן שמירה שנכשלה משאירה מלוכלך בלי סבב נוסף', async () => {
    const h = harness();
    h.coordinator.markDirty();
    let release!: (error: Error) => void;
    h.onUpload(
      () =>
        new Promise<void>((_, reject) => {
          release = reject;
        }),
    );

    const saving = h.coordinator.saveNow();
    await flush();
    h.coordinator.markDirty();
    release(new Error('נפל'));
    const outcome = await saving;

    expect(outcome.status).toBe('failed');
    expect(h.exportCount()).toBe(1);
    expect(h.coordinator.snapshot.isDirty).toBe(true);
  });
});

describe('autosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('אינו רץ בלי יעד כתיבה', async () => {
    const h = harness();

    h.coordinator.markDirty();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);

    // בלי יעד, autosave היה פותח „שמור בשם” מעצמו.
    expect(h.exportCount()).toBe(0);
    expect(h.coordinator.snapshot.isDirty).toBe(true);
  });

  it('רץ אחרי debounce כשיש יעד', async () => {
    const h = harness();
    h.coordinator.adoptTarget({ token: 'tok', name: 'a.docx' });

    h.coordinator.markDirty();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 1);
    expect(h.exportCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(h.exportCount()).toBe(1);
    expect(h.commits[0].targetToken).toBe('tok');
  });

  it('הקלדה רצופה דוחה את ה-autosave ואינה מייצאת בכל הקשה', async () => {
    const h = harness();
    h.coordinator.adoptTarget({ token: 'tok', name: 'a.docx' });

    for (let i = 0; i < 5; i += 1) {
      h.coordinator.markDirty();
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 100);
    }
    expect(h.exportCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(h.exportCount()).toBe(1);
  });

  it('שמירה ידנית מבטלת autosave ממתין', async () => {
    const h = harness();
    h.coordinator.adoptTarget({ token: 'tok', name: 'a.docx' });
    h.coordinator.markDirty();

    await h.coordinator.saveNow();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);

    expect(h.exportCount()).toBe(1);
  });

  it('dispose מבטל autosave ממתין', async () => {
    const h = harness();
    h.coordinator.adoptTarget({ token: 'tok', name: 'a.docx' });
    h.coordinator.markDirty();

    h.coordinator.dispose();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);

    expect(h.exportCount()).toBe(0);
  });
});

/**
 * המתג „שמירה אוטומטית” בפס הכותרת היה דקורטיבי: הדגל נכתב בממשק, ואיש לא
 * קרא אותו — כל `markDirty` הריץ autosave. הבדיקות כאן הן החוזה שהופך אותו
 * למתג, ובראשן זו שהייתה נשברת בלי שאיש ישים לב: **שמירה ידנית חייבת לעבוד
 * גם כשהמתג כבוי.** המתג מכבה את האוטומטיות, לא את השמירה.
 */
describe('מתג השמירה האוטומטית', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('כבוי — עריכה אינה מריצה שמירה', async () => {
    const h = harness();
    h.coordinator.adoptTarget({ token: 'tok', name: 'a.docx' });
    h.coordinator.setAutosaveEnabled(false);

    h.coordinator.markDirty();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 4);

    expect(h.exportCount()).toBe(0);
    expect(h.coordinator.snapshot.isDirty).toBe(true);
  });

  it('כיבוי בזמן שיש סבב ממתין מבטל אותו', async () => {
    const h = harness();
    h.coordinator.adoptTarget({ token: 'tok', name: 'a.docx' });
    h.coordinator.markDirty();

    // חצי הדרך אל ה-autosave, ואז המשתמש מכבה.
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 100);
    h.coordinator.setAutosaveEnabled(false);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 4);

    expect(h.exportCount()).toBe(0);
  });

  it('שמירה ידנית עובדת גם כשהמתג כבוי', async () => {
    const h = harness();
    h.coordinator.adoptTarget({ token: 'tok', name: 'a.docx' });
    h.coordinator.setAutosaveEnabled(false);
    h.coordinator.markDirty();

    await expect(h.coordinator.saveNow()).resolves.toMatchObject({ status: 'saved' });
    expect(h.exportCount()).toBe(1);
    expect(h.coordinator.snapshot.isDirty).toBe(false);
  });

  it('הדלקה חוזרת שומרת מסמך מלוכלך אחרי ההשהיה הרגילה, ולא מיד', async () => {
    const h = harness();
    h.coordinator.adoptTarget({ token: 'tok', name: 'a.docx' });
    h.coordinator.setAutosaveEnabled(false);
    h.coordinator.markDirty();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
    expect(h.exportCount()).toBe(0);

    h.coordinator.setAutosaveEnabled(true);
    // מיד אחרי הלחיצה עוד לא רץ כלום — לחיצה על מתג אינה ייצוא והעלאה.
    expect(h.exportCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(h.exportCount()).toBe(1);
    expect(h.coordinator.snapshot.isDirty).toBe(false);
  });

  it('הדלקה חוזרת על מסמך נקי אינה מריצה שמירה', async () => {
    const h = harness();
    h.coordinator.adoptTarget({ token: 'tok', name: 'a.docx' });

    h.coordinator.setAutosaveEnabled(false);
    h.coordinator.setAutosaveEnabled(true);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);

    expect(h.exportCount()).toBe(0);
  });

  it('הדלקה חוזרת בלי יעד כתיבה אינה פותחת „שמור בשם” מעצמה', async () => {
    const h = harness();
    h.coordinator.setAutosaveEnabled(false);
    h.coordinator.markDirty();
    h.coordinator.setAutosaveEnabled(true);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);

    expect(h.exportCount()).toBe(0);
    expect(h.commits).toEqual([]);
  });

  it('מעבר מסמך אינו מדליק את המתג מחדש — הוא העדפה של המשתמש', async () => {
    const h = harness();
    h.coordinator.setAutosaveEnabled(false);

    h.coordinator.reset({ token: 'tok2', name: 'b.docx' });
    h.coordinator.markDirty();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 4);

    expect(h.exportCount()).toBe(0);
  });
});

describe('מצב', () => {
  it('מדווח את שלבי השמירה בסדר', async () => {
    const h = harness();
    h.coordinator.markDirty();

    await h.coordinator.saveNow();

    // מכווצים חזרות רצופות: כל publish נוסף (למשל סימון isSaving) אינו שלב.
    const stages = h.states
      .map((s) => s.state)
      .filter((value, index, all) => value !== all[index - 1]);

    expect(stages).toEqual(['idle', 'exporting', 'uploading', 'committing', 'idle']);
  });

  it('reset מנקה dirty, שגיאה ויעד', async () => {
    const h = harness();
    h.coordinator.markDirty();
    h.onExport(() => Promise.reject(new Error('נפל')));
    await h.coordinator.saveNow();

    h.coordinator.reset({ token: 'other', name: 'b.docx' });

    expect(h.coordinator.snapshot).toEqual({
      state: 'idle',
      isDirty: false,
      targetToken: 'other',
      name: 'b.docx',
      lastError: null,
      isSaving: false,
    });
  });

  it('adoptTarget מגדיר יעד בלי לשנות dirty', () => {
    const h = harness();
    h.coordinator.markDirty();

    h.coordinator.adoptTarget({ token: 'tok', name: 'a.docx' });

    expect(h.coordinator.snapshot).toMatchObject({ isDirty: true, targetToken: 'tok' });
  });

  it('מעביר את גודל ה-Blob ל-beginWrite', async () => {
    const h = harness();
    h.coordinator.markDirty();
    h.onExport(() => new Blob(['0123456789']));
    const sizes: number[] = [];
    h.onBeginWrite(async (size) => {
      sizes.push(size);
      return { writeToken: 'w', uploadUrl: 'u' };
    });

    await h.coordinator.saveNow();

    expect(sizes).toEqual([10]);
    expect(h.uploads).toEqual([{ url: 'u', size: 10 }]);
  });
});
describe('מעבר מסמך בזמן שמירה', () => {
  it('סבב של המסמך הקודם אינו מאמץ מחדש את היעד שלו', async () => {
    const h = harness();
    h.coordinator.markDirty();
    let release!: () => void;
    h.onUpload(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    // א' נשמר…
    const savingA = h.coordinator.saveNow();
    await flush();
    // …ובאמצע נפתח ב'.
    h.coordinator.reset({ token: 'token-B', name: 'ב.docx' });
    release();

    // התוצאה של א' נזרקת: היא לא נוגעת ביעד, במצב ולא ב-dirty של ב'.
    await expect(savingA).resolves.toEqual({ status: 'stale' });
    expect(h.coordinator.snapshot).toMatchObject({
      targetToken: 'token-B',
      name: 'ב.docx',
      isDirty: false,
      state: 'idle',
    });
  });

  it('השמירה הבאה של המסמך החדש כותבת ליעד שלו, לא לקודם', async () => {
    const h = harness();
    h.coordinator.markDirty();
    let release!: () => void;
    h.onUpload(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    const savingA = h.coordinator.saveNow();
    await flush();
    h.coordinator.reset({ token: 'token-B', name: 'ב.docx' });
    h.onUpload(async () => {});
    release();
    await savingA;

    h.coordinator.markDirty();
    await h.coordinator.saveNow();

    // זו הרגרסיה שהבדיקה הזאת מקבעת: בלי ה-epoch, ה-commit של א' היה מאמץ
    // מחדש את token-A, וכאן היינו רואים אותו כיעד.
    expect(h.commits[h.commits.length - 1].targetToken).toBe('token-B');
  });

  it('כשל של סבב שהוחלף אינו מסמן שגיאה על המסמך החדש', async () => {
    const h = harness();
    h.coordinator.markDirty();
    let reject!: (error: Error) => void;
    h.onUpload(
      () =>
        new Promise<void>((_, rej) => {
          reject = rej;
        }),
    );

    const savingA = h.coordinator.saveNow();
    await flush();
    h.coordinator.reset({ token: 'token-B', name: 'ב.docx' });
    reject(new Error('נפל'));

    await expect(savingA).resolves.toEqual({ status: 'stale' });
    expect(h.coordinator.snapshot).toMatchObject({ state: 'idle', lastError: null });
  });

  it('סבב מוחלף אינו כותב את הבייטים שלו לקובץ של המסמך החדש', async () => {
    // הבאג שהיה כאן: ה-commit קרא את היעד בזמן ה-commit, ולכן אחרי מעבר מסמך
    // הוא קיבל את היעד של החדש — והבייטים של הישן דרסו את הקובץ שלו.
    const h = harness();
    h.coordinator.adoptTarget({ token: 'token-A', name: 'א.docx' });
    h.coordinator.markDirty();
    let release!: () => void;
    h.onUpload(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    const savingA = h.coordinator.saveNow();
    await flush();
    h.coordinator.reset({ token: 'token-B', name: 'ב.docx' });
    release();

    await expect(savingA).resolves.toEqual({ status: 'stale' });
    // ה-commit לא נקרא בכלל — לא ליעד של ב' וגם לא ליעד של א'.
    expect(h.commits).toEqual([]);
  });

  it('היעד מצולם בתחילת הסבב, ואינו נקרא מחדש ב-commit', async () => {
    // adoptTarget משנה את היעד בלי מעבר מסמך, ולכן ה-epoch אינו מגן כאן.
    // סבב שקורא את היעד בזמן ה-commit היה כותב לקובץ שהוחלף מתחתיו.
    const h = harness();
    h.coordinator.adoptTarget({ token: 'token-A', name: 'א.docx' });
    h.coordinator.markDirty();
    let release!: () => void;
    h.onUpload(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    const saving = h.coordinator.saveNow();
    await flush();
    h.coordinator.adoptTarget({ token: 'token-X', name: 'אחר.docx' });
    release();
    await saving;

    expect(h.commits[0].targetToken).toBe('token-A');
  });

  it('עריכה שנרשמה אחרי מעבר מסמך אינה מריצה סבב על המסמך החדש', async () => {
    const h = harness();
    h.coordinator.adoptTarget({ token: 'token-A', name: 'א.docx' });
    h.coordinator.markDirty();
    let release!: () => void;
    h.onUpload(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    const savingA = h.coordinator.saveNow();
    await flush();
    h.coordinator.reset({ token: 'token-B', name: 'ב.docx' });
    // ב' מלוכלך: בלי ההגנה בתנאי הלופ, הסבב של א' היה ממשיך לסבב נוסף,
    // מייצא את ב' ומעלה אותו — כתיבה עיוורת של מסמך אחד תוך סבב של אחר.
    h.coordinator.markDirty();
    h.onUpload(async () => {});
    release();

    await expect(savingA).resolves.toEqual({ status: 'stale' });
    expect(h.exportCount()).toBe(1);
    expect(h.uploads).toHaveLength(1);
  });

  it('סבב מוחלף משחרר את ההעלאה שלו מיד', async () => {
    // בלי זה הקובץ הזמני והסלוט במכסה נתפסים עד שה-token פג — שתי שמירות
    // כאלה וההתוסף אינו יכול לשמור בכלל.
    const h = harness();
    h.coordinator.adoptTarget({ token: 'token-A', name: 'א.docx' });
    h.coordinator.markDirty();
    let release!: () => void;
    h.onUpload(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    const savingA = h.coordinator.saveNow();
    await flush();
    h.coordinator.reset({ token: 'token-B', name: 'ב.docx' });
    release();

    await expect(savingA).resolves.toEqual({ status: 'stale' });
    expect(h.aborts).toEqual(['w1']);
    expect(h.commits).toEqual([]);
  });

  it('כשל ייצוא בסבב מוחלף אינו מסמן שגיאה על המסמך החדש', async () => {
    const h = harness();
    h.coordinator.markDirty();
    let reject!: (error: Error) => void;
    h.onExport(
      () =>
        new Promise<Blob>((_, rej) => {
          reject = rej;
        }),
    );

    const savingA = h.coordinator.saveNow();
    await flush();
    h.coordinator.reset({ token: 'token-B', name: 'ב.docx' });
    reject(new Error('המנוע קרס'));

    await expect(savingA).resolves.toEqual({ status: 'stale' });
    expect(h.coordinator.snapshot).toMatchObject({ state: 'idle', lastError: null });
  });

  it('כשל commit בסבב מוחלף אינו מסמן שגיאה על המסמך החדש', async () => {
    const h = harness();
    h.coordinator.adoptTarget({ token: 'token-A', name: 'א.docx' });
    h.coordinator.markDirty();
    let reject!: (error: Error) => void;
    // ה-commit נחסם, וה-reset קורה אחרי שהוא כבר התחיל.
    h.onCommit(
      () =>
        new Promise<SaveCommitOutput>((_, rej) => {
          reject = rej;
        }),
    );

    const savingA = h.coordinator.saveNow();
    await flush();
    h.coordinator.reset({ token: 'token-B', name: 'ב.docx' });
    reject(new Error('error.permission_denied'));

    await expect(savingA).resolves.toEqual({ status: 'stale' });
    expect(h.coordinator.snapshot).toMatchObject({
      state: 'idle',
      lastError: null,
      targetToken: 'token-B',
    });
  });

  it('הלופ אינו מריץ סבב נוסף אחרי מעבר מסמך', async () => {
    const h = harness();
    h.coordinator.adoptTarget({ token: 'token-A', name: 'א.docx' });
    h.coordinator.markDirty();
    let release!: () => void;
    h.onUpload(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    const savingA = h.coordinator.saveNow();
    await flush();
    // עריכה נוספת של א', שבלי ה-epoch הייתה מפעילה סבב שני…
    h.coordinator.markDirty();
    h.coordinator.reset({ token: 'token-B', name: 'ב.docx' });
    h.onUpload(async () => {});
    release();
    await savingA;

    // …ולכן היה מייצא את ב' וכותב אותו ליעד של א'.
    expect(h.exportCount()).toBe(1);
    expect(h.commits).toEqual([]);
  });

  it('„שמור” על המסמך החדש אינו מצטרף לסבב של הקודם', async () => {
    const h = harness();
    h.coordinator.adoptTarget({ token: 'token-A', name: 'א.docx' });
    h.coordinator.markDirty();
    let release!: () => void;
    h.onUpload(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    const savingA = h.coordinator.saveNow();
    await flush();
    h.coordinator.reset({ token: 'token-B', name: 'ב.docx' });
    h.coordinator.markDirty();
    h.onUpload(async () => {});

    // אותה קריאה שקודם הייתה מחזירה את ה-promise של א' (ולכן `stale`, כלומר
    // „לחצתי שמור וכלום לא קרה”).
    const savingB = h.coordinator.saveNow();
    expect(savingB).not.toBe(savingA);
    release();

    await expect(savingB).resolves.toMatchObject({ status: 'saved' });
    expect(h.commits[h.commits.length - 1].targetToken).toBe('token-B');
    expect(h.coordinator.snapshot.isDirty).toBe(false);
  });

  it('dispose בזמן סבב מונע אימוץ יעד ופרסום מצב', async () => {
    const h = harness();
    h.coordinator.markDirty();
    let release!: () => void;
    h.onUpload(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    const saving = h.coordinator.saveNow();
    await flush();
    h.coordinator.dispose();
    const statesAfterDispose = h.states.length;
    release();

    await expect(saving).resolves.toEqual({ status: 'stale' });
    expect(h.coordinator.snapshot.targetToken).toBeNull();
    expect(h.states).toHaveLength(statesAfterDispose);
  });

  it('isSaving מדווח נכון, כדי שהמעטפת תחסום מעבר מסמך', async () => {
    const h = harness();
    h.coordinator.markDirty();
    let release!: () => void;
    h.onUpload(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    expect(h.coordinator.snapshot.isSaving).toBe(false);
    const saving = h.coordinator.saveNow();
    expect(h.coordinator.snapshot.isSaving).toBe(true);

    await flush();
    release();
    await saving;

    expect(h.coordinator.snapshot.isSaving).toBe(false);
  });
});

describe('„שמור בשם” על מסמך נקי', () => {
  it('ביטול משאיר את המסמך נקי ואת היעד כפי שהיה', async () => {
    const h = harness();
    h.coordinator.adoptTarget({ token: 'tok', name: 'a.docx' });
    h.onCommit(async () => ({ cancelled: true }));

    const outcome = await h.coordinator.saveNow({ forceSaveAs: true });

    expect(outcome).toEqual({ status: 'cancelled' });
    // הרגרסיה: קודם הגדלנו revision כדי לכפות ייצוא, וההגדלה שרדה את הביטול
    // וסימנה מסמך שמור כלא-שמור.
    expect(h.coordinator.snapshot).toMatchObject({
      isDirty: false,
      targetToken: 'tok',
      state: 'idle',
    });
  });

  it('הצלחה אינה משאירה את המסמך מלוכלך', async () => {
    const h = harness();
    h.coordinator.adoptTarget({ token: 'tok', name: 'a.docx' });

    await h.coordinator.saveNow({ forceSaveAs: true });

    expect(h.coordinator.snapshot.isDirty).toBe(false);
  });
});

/**
 * `onSaved` הוא ההודעה „העבודה בדיסק”, והוא קיים מפני שרוב השמירות **אינן**
 * עוברות במעטפת: ה-autosave יורה מתוך הקואורדינטור עצמו. מי שנתלה על אתר
 * הקריאה ל-`saveNow` שומע רק את השמירה הידנית — וזה בדיוק מה שהשאיר טיוטת
 * שחזור חיה אחרי שמירה אוטומטית.
 */
describe('onSaved', () => {
  it('נורה גם על שמירה אוטומטית, לא רק על שמירה ידנית', async () => {
    vi.useFakeTimers();
    try {
      const h = harness();
      h.coordinator.adoptTarget({ token: 'tok', name: 'א.docx' });
      h.coordinator.markDirty();

      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
      await vi.advanceTimersByTimeAsync(0);

      expect(h.commits, 'ה-autosave אכן רץ').toHaveLength(1);
      expect(h.saved).toHaveLength(1);
      expect(h.saved[0].token).toBe('tok');
    } finally {
      vi.useRealTimers();
    }
  });

  it('נושא את גודל הבייטים שנכתבו בפועל', async () => {
    // זה הנתון שמאפשר לזהות אחר כך עריכה חיצונית של הקובץ. בלעדיו נשאלת
    // שאלה על „קובץ שהשתנה מבחוץ” אחרי כל שמירה רגילה.
    const h = harness();
    h.onExport(() => new Blob(['0123456789']));
    h.coordinator.adoptTarget({ token: 'tok', name: 'א.docx' });
    h.coordinator.markDirty();

    await h.coordinator.saveNow();

    expect(h.saved[0].size).toBe(10);
  });

  it('אינו נורה כשהשמירה נכשלה או בוטלה', async () => {
    const h = harness();
    h.onCommit(async () => ({ cancelled: true }));
    h.coordinator.adoptTarget({ token: 'tok', name: 'א.docx' });
    h.coordinator.markDirty();

    await h.coordinator.saveNow({ forceSaveAs: true });

    expect(h.saved, 'ביטול אינו שמירה').toHaveLength(0);
  });
});

describe('settled', () => {
  it('נפתר מיד כשאין שמירה', async () => {
    const h = harness();
    await expect(h.coordinator.settled()).resolves.toBeUndefined();
  });

  it('ממתין לסבב שרץ, ורק אז מחזיר', async () => {
    // זה החוזה שהיציאה נשענת עליו: זוכר-ההפעלה אינו מייצא במקביל לשמירה
    // שמייצאת את אותו מסמך, ולכן הוא חייב לדעת מתי היא נגמרה.
    const h = harness();
    let release = (): void => {};
    // השער נבנה לפני הסבב: השמה מתוך ה-callback הייתה מגיעה רק כשההעלאה
    // מתחילה, ועד אז `release` היה עדיין הכלום שהוא אותחל אליו.
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    h.onUpload(() => gate);
    h.coordinator.adoptTarget({ token: 'tok', name: 'א.docx' });
    h.coordinator.markDirty();

    const save = h.coordinator.saveNow();
    let done = false;
    const waiting = h.coordinator.settled().then(() => {
      done = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(done, 'עוד לא — השמירה באוויר').toBe(false);

    release();
    await save;
    await waiting;
    expect(done).toBe(true);
    expect(h.coordinator.snapshot.isSaving).toBe(false);
  });

  it('אינו נדחה כששמירה נכשלת', async () => {
    // הקורא רוצה לדעת ש„הרגע הזה נגמר”, לא מה הייתה התוצאה — ודחייה כאן
    // הייתה מפילה את מסלול היציאה בדיוק כשהוא הכי נחוץ.
    const h = harness();
    h.onExport(() => {
      throw new Error('הייצוא נכשל');
    });
    h.coordinator.adoptTarget({ token: 'tok', name: 'א.docx' });
    h.coordinator.markDirty();

    const save = h.coordinator.saveNow();
    await expect(h.coordinator.settled()).resolves.toBeUndefined();
    await save;
  });
});
