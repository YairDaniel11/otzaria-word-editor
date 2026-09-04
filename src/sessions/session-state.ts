/**
 * מה שהתוסף זוכר בין הפעלות, וכיצד קוראים אותו בחזרה.
 *
 * ## הכלל שקובע את הצורה: אוסף מסמכים, עם אחד פעיל
 *
 * עד כאן נשמר מפתח אחד — `last-document` — והוא ענה על שאלה אחת: איזה קובץ
 * היה פתוח. „לפתוח בדיוק כמו לפני הסגירה” הן חמש שאלות: איזה קובץ, איפה היה
 * הסמן, באיזה גודל תצוגה, איזו לשונית הייתה פתוחה, ומה **לא נשמר**. ארבע
 * מהתשובות (קובץ, סמן, זום, טיוטה) שייכות למסמך מסוים; החמישית (הלשונית,
 * המיקוד, הכיווץ) שייכת למי שיושב מול המסך ואחת לכל ההפעלה. מכאן החלוקה:
 * `documents` הוא אוסף רשומות-מסמך, כל אחת נכתבת בבת אחת; `view` נפרד ומשותף.
 *
 * `documents` נכתב עם רשומה לכל טאב פתוח (App.vue, `persistCombinedSession`),
 * ובעלייה **כל** רשומה שבאוסף מקבלת טאב משלה (App.vue, `restoreTabs`). מה
 * שנטען מיד הוא המסמך של `activeId` בלבד; שאר הטאבים נטענים ברגע שעוברים
 * אליהם — ראו „טעינה עצלה” ב-App.vue, `restoreTabs`. לכן `sessionForEntry`:
 * כל טאב מקבל את הרשומה **שלו** כמצב הפנימי של הזוכר שלו, ולא את האוסף כולו.
 *
 * ## הכלל השני: כל חלק מזדהה מול המסמך שנפתח בפועל
 *
 * גם רשומה עקבית אינה מספיקה. ה-token של המסמך האחרון עשוי לא להיפתר (הקובץ
 * הוזז, ההרשאה בוטלה), ואז נפתח מסמך אחר לגמרי — ועליו אסור להחיל את הסמן
 * ואת הטיוטה של מי שלא נפתח. `documentViewFor` ו-`decideDraftRecovery` הן שתי
 * הפונקציות ששואלות את השאלה הזאת, וזו הסיבה שהן כאן ולא במעטפת: הן מחליטות
 * אם עבודה של המשתמש נמחקת או נכתבת למקום הלא נכון, וקוד כזה חייב להיות נבדק.
 *
 * ## גרסה
 *
 * `version` אינו קישוט: רשומה בצורה ישנה נזרקת ואינה „מנוסה בכל זאת”. שדה
 * שהשתנה משמעות הוא בדיוק המקום שבו שחזור שקט הופך לנזק שקט. המעבר מרשומה
 * יחידה לאוסף הוא בדיוק שינוי כזה, ולכן הגרסה עלתה.
 */
import type { CaretAnchor } from '../engine/caret-anchor';
import type { LastDocument } from '../host/settings';

/** הצורה הנוכחית. כל שינוי שאינו תוספת של שדה אופציונלי מעלה אותה. */
export const SESSION_VERSION = 2;

/**
 * מזהה מסמך/טאב במרחב ה-state של התוסף. מחרוזת בלבד — לא ה-token של הקובץ,
 * מפני שמסמך חדש-לא-שמור אין לו token, וטאב זקוק לזהות גם אז.
 */
export type DocumentSessionId = string;

let idCounter = 0;

/** מזהה חדש וייחודי לתהליך הריצה הזה. ראו `DocumentSessionId`. */
export function createDocumentSessionId(): DocumentSessionId {
  idCounter += 1;
  return `doc-${Date.now().toString(36)}-${idCounter}`;
}

/**
 * הנתיב של טיוטת מסמך במרחב הפרטי של התוסף.
 *
 * ייחודי לכל מסמך: לפני ריבוי המסמכים היה כאן קבוע שטוח אחד, מפני שמסמך יחיד
 * בלבד יכול היה להיות פתוח בכל רגע. עכשיו שכל מסמך מחזיק רשומה משלו, גם
 * הטיוטה שלו חייבת נתיב משלה — אחרת שני מסמכים פתוחים היו כותבים לאותו קובץ
 * ודורסים זה את הטיוטה של זה. השם עצמו מסתיים ב-`docx` מפני שזה בדיוק מה שיש
 * בו.
 *
 * **אחריות שנשארת אצל הקורא:** מחיקת טיוטה כשמסמך נסגר לצמיתות (בלי שמירה)
 * חייבת לקרות במפורש — ראו `discardDraft` ב-session-keeper.ts. בלי זה, נתיב
 * ייחודי לכל מסמך פירושו שקבצי טיוטה של מסמכים שנסגרו מצטברים במרחב הפרטי
 * במקום שקבוע אחד ומשותף היה ממחזר את עצמו אוטומטית.
 */
export function draftPathFor(id: DocumentSessionId): string {
  return `session-draft-${id}.docx`;
}

/** המסמך שהיה פתוח. `null` = מסמך חדש שאין לו קובץ. */
export interface SessionDocument {
  token: string;
  name: string;
  /** האם ה-token ניתן לכתיבה — כלומר „שמור” לא יפתח דיאלוג. */
  writable: boolean;
}

/** מה שהמשתמש כיוון בעצמו במעטפת, ואינו שייך למסמך מסוים. */
export interface SessionView {
  /** גודל התצוגה באחוזים, או `null` כשלא נמדד. */
  zoom: number | null;
  focusMode: boolean;
  /** מזהה הלשונית ברצועה. אינו מאומת כאן — הרצועה נופלת ל„בית” על מזהה זר. */
  ribbonTab: string | null;
  ribbonCollapsed: boolean;
}

/**
 * טיוטה של עבודה שלא נשמרה, במרחב הפרטי של התוסף.
 *
 * `documentToken` הוא מה שהופך אותה לבטוחה: טיוטה מוחלת **רק** על המסמך שהיא
 * נכתבה ממנו. בלעדיו טיוטה של מסמך א' הייתה יכולה להיפתח מעל מסמך ב' ואז
 * להישמר לקובץ שלו.
 *
 * `sourceSize` הוא גודל הקובץ בדיסק ברגע שהטיוטה נכתבה. הוא אינו זהה לגודל
 * הטיוטה, ואינו אמור להיות: הטיוטה מכילה שינויים שהקובץ אינו מכיל. מה שהוא
 * מגלה הוא שינוי **מבחוץ** — מישהו ערך את הקובץ ב-Word בין ההפעלות — ואז
 * שחזור שקט היה דורס אותו.
 */
export interface SessionDraft {
  path: string;
  /** `Date.now()` בזמן הכתיבה, להצגה ולאבחון. */
  savedAt: number;
  documentToken: string | null;
  sourceSize: number | null;
}

/** רשומת ההפעלה של מסמך אחד. ראו את החלוקה מ-`view` בראש הקובץ. */
export interface SessionDocumentEntry {
  id: DocumentSessionId;
  document: SessionDocument | null;
  caret: CaretAnchor | null;
  draft: SessionDraft | null;
}

export interface SessionState {
  version: number;
  /**
   * רשומות המסמכים הפתוחים, בסדר הטאבים. מזהה חוזר אינו חוקי — הוא זהות של
   * טאב, ו-`readDocuments` משמיטה כפילות במקום לתת לשני טאבים לחלוק אותה.
   */
  documents: SessionDocumentEntry[];
  /** מי מ-`documents` פעיל כרגע. `null` רק כש-`documents` ריק. */
  activeId: DocumentSessionId | null;
  view: SessionView;
}

/** מצב התצוגה של מי שעוד לא בחר דבר. */
export function defaultView(): SessionView {
  return { zoom: null, focusMode: false, ribbonTab: null, ribbonCollapsed: false };
}

/** רשומת מסמך ריקה — מסמך חדש שאין לו קובץ, סמן או טיוטה. */
export function emptyDocumentEntry(id: DocumentSessionId = createDocumentSessionId()): SessionDocumentEntry {
  return { id, document: null, caret: null, draft: null };
}

/**
 * רשומה ריקה: מסמך אחד, חדש, בלי היסטוריה. לא קבוע משותף — כדי שקורא לא
 * ישנה אותה לכולם.
 */
export function emptySession(): SessionState {
  return emptySessionWithId(createDocumentSessionId());
}

/**
 * כמו `emptySession`, אבל עם מזהה נתון ולא אחד שממציאה לעצמה.
 *
 * `SessionKeeper` (session-keeper.ts) חייב להשתמש בזה, ולא ב-`emptySession()`:
 * הוא נבנה עם מזהה הטאב שלו (`initSessionKeeper`, App.vue) כדי שהטיוטה תיכתב
 * לנתיב הנכון, אבל בלי הפונקציה הזאת ה-state הפנימי שלו היה פותח רשומה עם
 * מזהה **אחר** לגמרי — ואז `activeId` שנכתב ל-storage לא היה מצביע על אף
 * רשומה באוסף. שחזור בודד נסבל (`normalizeSession` נופל לרשומה הראשונה), אבל
 * ברשומה עם כמה טאבים זה בדיוק ה„מי היה פעיל” שנשבר.
 */
export function emptySessionWithId(id: DocumentSessionId): SessionState {
  const entry = emptyDocumentEntry(id);
  return { version: SESSION_VERSION, documents: [entry], activeId: entry.id, view: defaultView() };
}

/**
 * רשומה שיש בה רשומת-מסמך אחת, והיא הפעילה — הצורה שכל טאב מחזיק לעצמו.
 *
 * זהו הגשר בין האוסף שב-storage לבין הזוכרים: ב-storage יושבת רשומה אחת עם
 * כל הטאבים, אבל `SessionKeeper` הוא פר-טאב ויודע לכתוב רק את הרשומה שלו
 * (`withActiveEntry`), והרכבת האוסף המלא חוזרת ב-`persistCombinedSession`
 * (App.vue). לכן טאב שנוצר משחזור מאמץ **את הרשומה שלו בלבד** — אילו אימץ
 * את האוסף כולו, כל טאב היה כותב עותק של כולם, וסגירת טאב לא הייתה מוחקת
 * אותו מהרשומה: העותק שבזוכר של השכן היה מחזיר אותו בעלייה הבאה.
 *
 * `view` משותף לכל הטאבים (ראו „הכלל שקובע את הצורה” בראש הקובץ) ולכן הוא
 * מועתק לכולם; מי שנכתב ל-storage בפועל הוא של הטאב הפעיל.
 */
export function sessionForEntry(entry: SessionDocumentEntry, view: SessionView): SessionState {
  return { version: SESSION_VERSION, documents: [entry], activeId: entry.id, view: { ...view } };
}

/** רשומת המסמך הפעיל, או `null` כשאין אחת (רק כש-`documents` ריק). */
export function activeEntry(session: SessionState | null): SessionDocumentEntry | null {
  if (!session || session.activeId === null) return null;
  return session.documents.find((entry) => entry.id === session.activeId) ?? null;
}

/**
 * מחליפה את רשומת המסמך הפעיל בטלאי, ומוסיפה אותה אם אין עדיין רשומה פעילה.
 *
 * זו הדרך היחידה שראוי לכתוב בה למסמך הפעיל: מי שקורא אינו צריך לדעת אם
 * הרשומה כבר קיימת ברשימה או שזו הפעם הראשונה שיש מה לכתוב לה.
 */
export function withActiveEntry(
  session: SessionState,
  patch: Partial<Omit<SessionDocumentEntry, 'id'>>,
): SessionState {
  const current = activeEntry(session);
  const id = current?.id ?? session.activeId ?? createDocumentSessionId();
  const next: SessionDocumentEntry = { ...emptyDocumentEntry(id), ...current, ...patch, id };

  const documents = current
    ? session.documents.map((entry) => (entry.id === id ? next : entry))
    : [...session.documents, next];

  return { ...session, documents, activeId: id };
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readDocument(value: unknown): SessionDocument | null {
  if (!value || typeof value !== 'object') return null;
  const doc = value as Partial<SessionDocument>;
  const token = readString(doc.token);
  if (!token) return null;
  return {
    token,
    name: readString(doc.name) ?? 'מסמך',
    writable: doc.writable === true,
  };
}

function readView(value: unknown): SessionView {
  if (!value || typeof value !== 'object') return defaultView();
  const view = value as Partial<SessionView>;
  const zoom = readFiniteNumber(view.zoom);
  return {
    // גודל תצוגה שאינו חיובי אינו „ערך קיצוני” אלא ערך פגום, והפקדים היו
    // מקבלים ממנו סרגל תקוע. הגבולות עצמם נאכפים ב-engine/zoom.ts.
    zoom: zoom !== null && zoom > 0 ? zoom : null,
    focusMode: view.focusMode === true,
    ribbonTab: readString(view.ribbonTab),
    ribbonCollapsed: view.ribbonCollapsed === true,
  };
}

function readCaretPoint(value: unknown): CaretAnchor['start'] | null {
  if (!value || typeof value !== 'object') return null;
  const point = value as Partial<CaretAnchor['start']>;
  const blockId = readString(point.blockId);
  if (!blockId) return null;
  const ordinal = readFiniteNumber(point.ordinal);
  const offset = readFiniteNumber(point.offset) ?? 0;
  return {
    blockId,
    ordinal: ordinal !== null && ordinal >= 0 ? Math.trunc(ordinal) : null,
    offset: Math.max(0, Math.trunc(offset)),
  };
}

function readCaret(value: unknown): CaretAnchor | null {
  if (!value || typeof value !== 'object') return null;
  const anchor = value as Partial<CaretAnchor>;
  const start = readCaretPoint(anchor.start);
  if (!start) return null;
  return { start, end: readCaretPoint(anchor.end) };
}

function readDraft(value: unknown): SessionDraft | null {
  if (!value || typeof value !== 'object') return null;
  const draft = value as Partial<SessionDraft>;
  const path = readString(draft.path);
  if (!path) return null;
  const size = readFiniteNumber(draft.sourceSize);
  return {
    path,
    savedAt: readFiniteNumber(draft.savedAt) ?? 0,
    documentToken: readString(draft.documentToken),
    sourceSize: size !== null && size > 0 ? size : null,
  };
}

function readDocumentEntry(value: unknown): SessionDocumentEntry | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Partial<SessionDocumentEntry>;
  const id = readString(entry.id);
  if (!id) return null;
  return {
    id,
    document: readDocument(entry.document),
    caret: readCaret(entry.caret),
    draft: readDraft(entry.draft),
  };
}

function readDocuments(value: unknown): SessionDocumentEntry[] {
  if (!Array.isArray(value)) return [];
  const out: SessionDocumentEntry[] = [];
  const seen = new Set<DocumentSessionId>();
  for (const item of value) {
    const entry = readDocumentEntry(item);
    if (!entry) continue;
    // מזהה חוזר אינו רשומה נוספת אלא רשומה פגומה: המזהה הוא זהות הטאב, הוא
    // קובע את נתיב הטיוטה (`draftPathFor`) והוא המפתח במפת הטאבים. שני טאבים
    // עליו היו חולקים קובץ טיוטה אחד, והשני היה דורס את הראשון במפה ומשאיר
    // אחריו פאנל יתום. הראשון נשמר, הכפילות נשמטת.
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
  }
  return out;
}

/**
 * קוראת רשומה מה-storage. `null` = אין מה לשחזר: אין רשומה, היא אינה
 * אובייקט, או שהיא בגרסה אחרת.
 *
 * שאר השדות נקראים בסלחנות — שדה פגום מתאפס ואינו פוסל את הרשומה כולה. רשומת
 * מסמך שאין לה `id` תקין — או שהמזהה שלה כבר הופיע — נשמטת מהאוסף במקום לפסול
 * את כל הרשומה; `activeId` שלא מצביע לרשומה קיימת נופל לרשומה הראשונה שנשארה,
 * ואם אין אף אחת — ל-`null`.
 */
export function normalizeSession(raw: unknown): SessionState | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Partial<SessionState>;
  if (record.version !== SESSION_VERSION) return null;

  const documents = readDocuments(record.documents);
  const requestedActive = readString(record.activeId);
  const activeId =
    requestedActive && documents.some((entry) => entry.id === requestedActive)
      ? requestedActive
      : (documents[0]?.id ?? null);

  return {
    version: SESSION_VERSION,
    documents,
    activeId,
    view: readView(record.view),
  };
}

/**
 * מסלול השדרוג ממי שכבר יש לו `last-document` מגרסה קודמת של התוסף.
 *
 * בלעדיו כל משתמש קיים היה מקבל בעדכון „מסמך חדש” במקום המסמך שעבד עליו —
 * רגרסיה שנגרמה דווקא מהתכונה שנועדה לזכור יותר.
 */
export function sessionFromLastDocument(last: LastDocument | null): SessionState | null {
  if (!last) return null;
  return withActiveEntry(emptySession(), {
    document: { token: last.token, name: last.name, writable: last.writable },
  });
}

/**
 * החלק ששייך למסמך מסוים — ורק אם זה המסמך שנפתח בפועל.
 *
 * ## ההפרדה שמאחורי הפונקציה הזאת
 *
 * ברשומה יש שני סוגי מצב, ורק אחד מהם מותנה:
 *
 * - **מצב המעטפת** — מצב מיקוד, הלשונית ברצועה, כיווץ. זו העדפה של מי שיושב
 *   מול המסך, והיא נכונה בכל מסמך. היא מוחלת תמיד, ולכן אינה עוברת כאן.
 * - **מצב המסמך** — הסמן וגודל התצוגה. „עמוד 40, 150%” הוא משפט על מסמך
 *   מסוים. אם ה-token לא נפתר ונפתח מסמך אחר, החלת המצב הזה עליו היא קפיצה
 *   שרירותית לאמצע מסמך שהמשתמש לא ביקש.
 *
 * `openedToken` הוא ה-token של מה שעל המסך עכשיו; `null` = מסמך חדש בלי קובץ.
 * הבדיקה מול רשומת המסמך **הפעיל** בלבד — לא נבחר קובץ מתוך רשומות אחרות
 * באוסף, מאותו טעם שגרסה קודמת לא בחרה מסמך שאינו זה שהיה פתוח.
 */
export function documentViewFor(
  session: SessionState | null,
  openedToken: string | null,
): { zoom: number | null; caret: CaretAnchor | null } {
  const entry = activeEntry(session);
  const sameDocument = (entry?.document?.token ?? null) === openedToken;
  if (!session || !entry || !sameDocument) return { zoom: null, caret: null };
  return { zoom: session.view.zoom, caret: entry.caret };
}

/** מה לעשות עם טיוטה שנמצאה. */
export type DraftDecision =
  /** לפתוח את המסמך מהטיוטה. יש בה עבודה שאינה בקובץ. */
  | { action: 'restore' }
  /** הקובץ בדיסק השתנה מאז שהטיוטה נכתבה — לשאול את המשתמש. */
  | { action: 'ask' }
  /** אין מה לשחזר, או שהטיוטה אינה שייכת למסמך הזה. */
  | { action: 'discard'; reason: 'none' | 'other-document' };

export interface DraftRecoveryInput {
  draft: SessionDraft | null;
  /** ה-token של המסמך שעומדים לפתוח, או `null` למסמך חדש. */
  openingToken: string | null;
  /** גודל הקובץ בדיסק כרגע. `null` או 0 = אוצריא לא דיווחה. */
  diskSize: number | null;
}

/**
 * האם לפתוח מהטיוטה.
 *
 * שלוש ההחלטות, ולמה כל אחת:
 *
 * - **`other-document`** — טיוטה מוחלת רק על המסמך שהיא נכתבה ממנו. זהו הכלל
 *   שמונע את התרחיש היחיד שבו התכונה הזאת יכולה למחוק עבודה: תוכן של מסמך
 *   אחד שנפתח מעל מסמך אחר, ואז נשמר לקובץ שלו.
 * - **`ask`** — הקובץ בדיסק שינה את גודלו מאז שהטיוטה נכתבה, כלומר מישהו ערך
 *   אותו מבחוץ. שתי התשובות לגיטימיות, ורק המשתמש יודע איזו — ולכן שואלים
 *   במקום להכריע. גודל שלא דווח (`null` או 0) אינו „לא השתנה” ואינו „השתנה”:
 *   אין עליו מידע, והשאלה על סמך לא-מידע היא הטרדה.
 * - **`restore`** — יש עבודה שאינה בקובץ, והקובץ הוא אותו קובץ. זה המסלול
 *   הרגיל, והוא זה שהופך „חזרתי והכול כמו שהיה” לאמת.
 */
export function decideDraftRecovery(input: DraftRecoveryInput): DraftDecision {
  const { draft, openingToken, diskSize } = input;
  if (!draft) return { action: 'discard', reason: 'none' };
  if (draft.documentToken !== openingToken) {
    return { action: 'discard', reason: 'other-document' };
  }

  const known = diskSize !== null && diskSize > 0 && draft.sourceSize !== null;
  if (known && diskSize !== draft.sourceSize) return { action: 'ask' };

  return { action: 'restore' };
}

/**
 * גיל הטיוטה במילים, או `null` כשאין מה לומר.
 *
 * ## למה זה נאמר בכלל
 *
 * הטיוטה נכתבת בקצב משלה, ולכן היא כמעט אף פעם אינה בדיוק מה שהיה על המסך
 * ברגע הסגירה — בין השאר מפני שכתיבה שנכשלה משאירה בכוונה את הקודמת (ראו
 * `writeDraftNow` ב-session-keeper.ts). „שוחזרו השינויים” לבדו מבטיח שלמות
 * שאינה מובטחת, ומשתמש שיגלה זאת לבדו לא יבטח בשחזור שוב. מספר אחד — כמה
 * זמן עבר — הופך „חלקית” לצפוי במקום למפתיע.
 *
 * `now` הוא פרמטר ולא `Date.now()`: זו פונקציה טהורה, וזמן שנקרא בתוכה אינו
 * ניתן לבדיקה.
 */
export function draftAgeLabel(savedAt: number, now: number): string | null {
  if (!Number.isFinite(savedAt) || savedAt <= 0) return null;

  const elapsed = now - savedAt;
  // שעון שזז אחורה בין הפעלות נותן גיל שלילי. „לפני מינוס שעה” גרוע משתיקה.
  if (elapsed < 0) return null;

  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'לפני פחות מדקה';
  if (minutes === 1) return 'לפני דקה';
  if (minutes === 2) return 'לפני שתי דקות';
  if (minutes < 60) return `לפני ${minutes} דקות`;

  const hours = Math.floor(minutes / 60);
  if (hours === 1) return 'לפני שעה';
  if (hours === 2) return 'לפני שעתיים';
  if (hours < 24) return `לפני ${hours} שעות`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'לפני יום';
  if (days === 2) return 'לפני יומיים';
  return `לפני ${days} ימים`;
}
