/**
 * הרשומה שנשמרת בין הפעלות, ושתי ההחלטות שנגזרות ממנה.
 *
 * שתי השאלות שהקובץ הזה שומר עליהן, ושתיהן שאלות על אובדן עבודה:
 *
 * 1. **על איזה מסמך מוחל מה שנזכר.** רשומה שייכת למסמך אחד; אם ה-token לא
 *    נפתר ונפתח מסמך אחר, הסמן והזום של הראשון אסור להם לגעת בשני.
 * 2. **מתי טיוטה נפתחת בשקט ומתי שואלים.** טיוטה נכתבת מעל מה שבדיסק, ולכן
 *    היא בטוחה רק כשהקובץ לא זז מתחתיה.
 */
import { describe, it, expect } from 'vitest';
import {
  SESSION_VERSION,
  activeEntry,
  decideDraftRecovery,
  defaultView,
  documentViewFor,
  draftAgeLabel,
  draftPathFor,
  emptyDocumentEntry,
  emptySession,
  normalizeSession,
  sessionForEntry,
  sessionFromLastDocument,
  withActiveEntry,
  type SessionDraft,
  type SessionState,
} from '../../src/sessions/session-state';

const anchor = { start: { blockId: 'b7', ordinal: 4, offset: 12 }, end: null };

/** רשומה עם מסמך פעיל אחד, בטלאי — כמו הרשומה היחידה של הצורה הישנה. */
function session(patch: Partial<{
  document: SessionState['documents'][number]['document'];
  view: SessionState['view'];
  caret: SessionState['documents'][number]['caret'];
  draft: SessionDraft | null;
}> = {}): SessionState {
  const { view, ...entryPatch } = patch;
  const base = withActiveEntry(emptySession(), entryPatch);
  return view ? { ...base, view } : base;
}

describe('normalizeSession', () => {
  it('קורא רשומה מלאה', () => {
    const stored = session({
      document: { token: 'tok', name: 'א.docx', writable: true },
      view: { zoom: 150, focusMode: true, ribbonTab: 'references', ribbonCollapsed: true },
      caret: anchor,
      draft: { path: draftPathFor('tok'), savedAt: 17, documentToken: 'tok', sourceSize: 900 },
    });

    expect(normalizeSession(JSON.parse(JSON.stringify(stored)))).toEqual(stored);
  });

  it('רשומה מגרסה אחרת נזרקת ואינה מנוסה בכל זאת', () => {
    // שדה ששינה משמעות הוא בדיוק המקום שבו שחזור שקט הופך לנזק שקט.
    expect(normalizeSession({ ...emptySession(), version: SESSION_VERSION + 1 })).toBeNull();
    expect(normalizeSession(null)).toBeNull();
    expect(normalizeSession('לא אובייקט')).toBeNull();
  });

  it('שדה פגום מתאפס ואינו פוסל את שאר הרשומה', () => {
    // ארבעה דברים בלתי תלויים ברשומת מסמך אחת: לשונית פגומה אינה סיבה לאבד
    // את המסמך ואת הטיוטה.
    const read = normalizeSession({
      version: SESSION_VERSION,
      documents: [{ id: 'd1', document: { token: 'tok' }, caret: { start: { blockId: '', offset: 3 } }, draft: { savedAt: 5 } }],
      activeId: 'd1',
      view: { zoom: -4, focusMode: 'כן', ribbonTab: 42 },
    });

    expect(read).toEqual({
      version: SESSION_VERSION,
      documents: [{ id: 'd1', document: { token: 'tok', name: 'מסמך', writable: false }, caret: null, draft: null }],
      activeId: 'd1',
      view: defaultView(),
    });
  });

  it('רשומת מסמך בלי id נשמטת, ו-activeId שלא נפתר נופל לרשומה שנשארה', () => {
    const read = normalizeSession({
      version: SESSION_VERSION,
      documents: [{ document: { token: 'no-id' } }, { id: 'd2', document: { token: 'tok' } }],
      activeId: 'missing',
      view: defaultView(),
    });

    expect(read?.documents).toHaveLength(1);
    expect(read?.activeId).toBe('d2');
  });

  it('מזהה שחוזר פעמיים נשמט — טאב אינו יכול לחלוק זהות עם אחר', () => {
    // המזהה קובע את נתיב הטיוטה ואת המקום במפת הטאבים: שני טאבים עליו היו
    // דורסים זה את הטיוטה של זה, והשני היה מותיר פאנל יתום במסך.
    const read = normalizeSession({
      version: SESSION_VERSION,
      documents: [
        { id: 'd1', document: { token: 'א' } },
        { id: 'd1', document: { token: 'ב' } },
        { id: 'd2', document: { token: 'ג' } },
      ],
      activeId: 'd2',
      view: defaultView(),
    });

    expect(read?.documents.map((entry) => entry.id)).toEqual(['d1', 'd2']);
    expect(read?.documents[0]?.document?.token, 'הראשון נשמר, הכפילות נשמטת').toBe('א');
    expect(read?.activeId).toBe('d2');
  });

  it('היסט וסדר שליליים נקראים כערכים חוקיים ולא כפגם', () => {
    const read = normalizeSession({
      ...session(),
      documents: session().documents.map((entry) => ({
        ...entry,
        caret: { start: { blockId: 'b1', ordinal: -2, offset: -9 }, end: null },
      })),
    });

    // סדר שלילי אינו מקום בסדר המסמך, ולכן הוא „לא ידוע”; היסט שלילי נקצץ
    // לתחילת הפסקה, שהוא המקום היחיד שאפשר לפרש אותו בו.
    expect(activeEntry(read)?.caret).toEqual({
      start: { blockId: 'b1', ordinal: null, offset: 0 },
      end: null,
    });
  });
});

describe('sessionFromLastDocument', () => {
  it('משתמש שמעדכן מגרסה קודמת אינו מאבד את המסמך שעבד עליו', () => {
    const migrated = sessionFromLastDocument({ token: 'tok', name: 'ב.docx', writable: false });

    expect(activeEntry(migrated)?.document).toEqual({ token: 'tok', name: 'ב.docx', writable: false });
    expect(activeEntry(migrated)?.caret, 'אין מה לדעת על הסמן מגרסה שלא שמרה אותו').toBeNull();
  });

  it('אין מסמך קודם — אין רשומה', () => {
    expect(sessionFromLastDocument(null)).toBeNull();
  });
});

describe('documentViewFor', () => {
  const stored = session({
    document: { token: 'tok', name: 'א.docx', writable: true },
    view: { zoom: 150, focusMode: true, ribbonTab: 'view', ribbonCollapsed: false },
    caret: anchor,
  });

  it('אותו מסמך מקבל את הזום ואת הסמן', () => {
    expect(documentViewFor(stored, 'tok')).toEqual({ zoom: 150, caret: anchor });
  });

  it('מסמך אחר אינו מקבל דבר', () => {
    // התרחיש: ה-token לא נפתר, נפתח מסמך חדש, ועליו הייתה מוחלת קפיצה
    // שרירותית לאמצע מסמך אחר.
    expect(documentViewFor(stored, 'other')).toEqual({ zoom: null, caret: null });
    expect(documentViewFor(stored, null)).toEqual({ zoom: null, caret: null });
    expect(documentViewFor(null, 'tok')).toEqual({ zoom: null, caret: null });
  });

  it('מסמך חדש שנזכר מקבל את הסמן שלו', () => {
    // מסמך בלי קובץ הוא `null` בשני הצדדים, וזו התאמה ולא כשל.
    const newDoc = session({ caret: anchor, view: { ...defaultView(), zoom: 90 } });
    expect(documentViewFor(newDoc, null)).toEqual({ zoom: 90, caret: anchor });
  });
});

describe('decideDraftRecovery', () => {
  const draft: SessionDraft = {
    path: draftPathFor('tok'),
    savedAt: 100,
    documentToken: 'tok',
    sourceSize: 5_000,
  };

  it('אותו מסמך, אותו גודל בדיסק — משחזרים', () => {
    expect(decideDraftRecovery({ draft, openingToken: 'tok', diskSize: 5_000 })).toEqual({
      action: 'restore',
    });
  });

  it('טיוטה של מסמך אחר אינה מוחלת', () => {
    // התרחיש היחיד שבו התכונה יכולה למחוק עבודה: תוכן של מסמך אחד שנפתח מעל
    // מסמך אחר, ואז נשמר לקובץ שלו.
    expect(decideDraftRecovery({ draft, openingToken: 'other', diskSize: 5_000 })).toEqual({
      action: 'discard',
      reason: 'other-document',
    });
    expect(decideDraftRecovery({ draft, openingToken: null, diskSize: null })).toEqual({
      action: 'discard',
      reason: 'other-document',
    });
  });

  it('אין טיוטה — אין מה לשחזר', () => {
    expect(decideDraftRecovery({ draft: null, openingToken: 'tok', diskSize: 1 })).toEqual({
      action: 'discard',
      reason: 'none',
    });
  });

  it('הקובץ שינה את גודלו מאז — שואלים ולא מכריעים', () => {
    expect(decideDraftRecovery({ draft, openingToken: 'tok', diskSize: 7_000 })).toEqual({
      action: 'ask',
    });
  });

  it('גודל שלא דווח אינו „השתנה” ואינו מייצר שאלה', () => {
    // אוצריא מחזירה 0 כשאין לה גודל. שאלה על סמך לא-מידע היא הטרדה.
    expect(decideDraftRecovery({ draft, openingToken: 'tok', diskSize: 0 })).toEqual({
      action: 'restore',
    });
    expect(decideDraftRecovery({ draft, openingToken: 'tok', diskSize: null })).toEqual({
      action: 'restore',
    });
    expect(
      decideDraftRecovery({
        draft: { ...draft, sourceSize: null },
        openingToken: 'tok',
        diskSize: 9_999,
      }),
    ).toEqual({ action: 'restore' });
  });

  it('מסמך חדש שנשמרה ממנו טיוטה משוחזר גם בלי קובץ', () => {
    // זה המסלול שבו אין שום דבר אחר לחזור אליו: אין token, אין קובץ, ורק
    // הטיוטה מחזיקה את מה שנכתב.
    const unsaved: SessionDraft = { ...draft, documentToken: null, sourceSize: null };
    expect(decideDraftRecovery({ draft: unsaved, openingToken: null, diskSize: null })).toEqual({
      action: 'restore',
    });
  });
});

describe('גיל הטיוטה', () => {
  const now = 1_700_000_000_000;

  it('אומר „פחות מדקה” על טיוטה טרייה', () => {
    expect(draftAgeLabel(now - 30_000, now)).toBe('לפני פחות מדקה');
  });

  it('נוקט לשון יחיד, זוגי ורבים כנדרש בעברית', () => {
    expect(draftAgeLabel(now - 60_000, now)).toBe('לפני דקה');
    expect(draftAgeLabel(now - 2 * 60_000, now)).toBe('לפני שתי דקות');
    expect(draftAgeLabel(now - 7 * 60_000, now)).toBe('לפני 7 דקות');
    expect(draftAgeLabel(now - 60 * 60_000, now)).toBe('לפני שעה');
    expect(draftAgeLabel(now - 2 * 60 * 60_000, now)).toBe('לפני שעתיים');
    expect(draftAgeLabel(now - 5 * 60 * 60_000, now)).toBe('לפני 5 שעות');
    expect(draftAgeLabel(now - 24 * 60 * 60_000, now)).toBe('לפני יום');
    expect(draftAgeLabel(now - 48 * 60 * 60_000, now)).toBe('לפני יומיים');
    expect(draftAgeLabel(now - 4 * 24 * 60 * 60_000, now)).toBe('לפני 4 ימים');
  });

  it('שותק כשאין מה לומר', () => {
    // `savedAt` שהוא 0 הוא „לא נרשם” (ראו `readDraft`), ושעון שזז אחורה בין
    // הפעלות נותן גיל שלילי. „לפני מינוס שעה” גרוע משתיקה.
    expect(draftAgeLabel(0, now)).toBeNull();
    expect(draftAgeLabel(now + 60_000, now)).toBeNull();
    expect(draftAgeLabel(Number.NaN, now)).toBeNull();
  });
});

describe('activeEntry / withActiveEntry', () => {
  it('withActiveEntry מוסיפה רשומה כשאין עדיין אחת פעילה', () => {
    const empty: SessionState = { version: SESSION_VERSION, documents: [], activeId: null, view: defaultView() };
    const next = withActiveEntry(empty, { document: { token: 't', name: 'שם', writable: true } });

    expect(next.documents).toHaveLength(1);
    expect(activeEntry(next)?.document?.token).toBe('t');
  });

  it('draftPathFor מייצרת נתיב שונה לכל מזהה מסמך', () => {
    expect(draftPathFor('a')).not.toBe(draftPathFor('b'));
  });
});

describe('sessionForEntry', () => {
  it('הרשומה שטאב מחזיק לעצמו היא הרשומה שלו בלבד, והיא הפעילה בה', () => {
    // בלי זה כל טאב היה מחזיק עותק של האוסף כולו, וסגירת טאב לא הייתה מוחקת
    // אותו: העותק שאצל השכן היה מחזיר אותו בעלייה הבאה.
    const entry = { ...emptyDocumentEntry('doc-7'), document: { token: 't', name: 'ז.docx', writable: true } };
    const state = sessionForEntry(entry, { ...defaultView(), zoom: 130 });

    expect(state.documents).toEqual([entry]);
    expect(state.activeId).toBe('doc-7');
    expect(activeEntry(state)).toBe(entry);
    expect(state.version).toBe(SESSION_VERSION);
  });

  it('מצב התצוגה מועתק ואינו משותף בין טאבים', () => {
    const view = defaultView();
    const state = sessionForEntry(emptyDocumentEntry('doc-1'), view);

    state.view.zoom = 200;

    expect(view.zoom, 'שינוי אצל טאב אחד אינו זולג לשני').toBeNull();
  });
});
