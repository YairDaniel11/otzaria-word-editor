/**
 * אשכול ה-state של מסמך בודד — טאב אחד ברצועת הטאבים.
 *
 * ## שני סוגי שדות, ולמה הם חיים באותו אובייקט
 *
 * - **המנועים** (`swap`/`save`/`keeper`/`metrics`/`ruler`/... /`searchAdapter`) —
 *   עצמאיים לחלוטין: הם עובדים גם כשהטאב ברקע (autosave, כתיבת טיוטה, מדידה).
 *   `App.vue` יוצר אותם דרך `initSaveCoordinator`/`initSessionKeeper` שלו, שכן
 *   התלויות שלהם הן סגירות (closures) ספציפיות שם.
 * - **`ui`** — תמונת מצב של מה שהמעטפת מציגה (כותרת, מטריקות, זום...). כשהטאב
 *   הזה פעיל, `App.vue` מחזיק את הערכים האלה ב-refs ברמת המודול (בדיוק כמו
 *   לפני ריבוי המסמכים); כשעוברים לטאב אחר, `activateTab` ב-App.vue שומר את
 *   ה-refs האלה לתוך `ui`, וטוען את `ui` של הטאב הבא. כך אין צורך לשכתב את כל
 *   הפונקציות שקוראות/כותבות ל-refs האלה — הן ממשיכות לפעול על „הטאב הפעיל”.
 *
 * `pane` הוא ה-container הייעודי של הטאב הזה בתוך `.editor-stack` — כל טאב
 * מקבל `<div>` משלו, ורק של הטאב הפעיל גלוי (ראו App.vue, `.document-pane`).
 * `swap` נוצר עליו ישירות ואינו מוחלף — זה מה שמאפשר למנוע להמשיך לרוץ ברקע
 * בלי הרס/יצירה מחדש בכל מעבר טאב.
 */
import type { DocumentSessionId } from './session-state';
import { createDocumentSessionId } from './session-state';
import type { EditorSwap } from './editor-swap';
import type { SaveCoordinator, SaveSnapshot } from './save-coordinator';
import type { SessionKeeper } from './session-keeper';
import type { DocMetricsAdapter, DocMetrics } from '../engine/doc-metrics';
import { emptyDocMetrics } from '../engine/doc-metrics';
import type { RulerModel, RulerReading, ViewportSource } from '../engine/page-ruler';
import type {
  LineNumberingModel,
  PageBorderModel,
  LineNumberingReading,
  PageBordersReading,
} from '../engine/page-setup';
import type { FormattingMarksModel } from '../engine/formatting-marks';
import type { TextCursorWatch } from '../engine/text-cursor';
import type { FormattingMarksBlock } from '../engine/formatting-marks-layer';
import type { CommandAdapter } from '../engine/command-adapter';
import type { SearchAdapter, SearchState } from '../engine/search';
import { idleSearchState } from '../engine/search';
import type { MacrosHandle } from '../engine/macros';
import type { FontsSliceLike } from '../engine/font-options';
import type { StyleGalleryState } from '../engine/style-gallery';
import { fallbackStyleGallery } from '../engine/style-gallery';
import type { ReadoutSelection } from '../engine/readout-hold';
import { UNSETTLED_SELECTION } from '../engine/readout-hold';
import type { ZoomState } from '../engine/zoom';
import { FALLBACK_ZOOM } from '../engine/zoom';
import type { RulerUnit } from '../engine/ruler-geometry';
import { NO_VBA, type DocumentVba } from '../engine/vba-import';
import type { WordExtension } from '../engine/export';
import { PANE_SCROLL_ORIGIN, type PaneScroll } from './pane-scroll';
import type { SuperDoc } from 'superdoc';

/**
 * תמונת המצב המוצגת של הטאב, כשהוא אינו פעיל. ראו ההסבר בראש הקובץ — אלה
 * בדיוק הערכים ש-App.vue מחזיק ב-refs ברמת המודול כש-הטאב הזה כן פעיל.
 */
export interface DocumentUiSnapshot {
  title: string;
  commandAdapter: CommandAdapter | null;
  activeSuperdoc: SuperDoc | null;
  activeEditorContainer: HTMLElement | null;
  documentGeneration: number;
  activeMacros: MacrosHandle | null;
  docMetrics: DocMetrics;
  zoom: ZoomState;
  canUndo: boolean;
  canRedo: boolean;
  rulerReading: RulerReading | null;
  rulerHost: HTMLElement | null;
  rulerViewport: ViewportSource | null;
  rulerUnit: RulerUnit;
  isDocumentEditable: boolean;
  isRulerVisible: boolean;
  pageBorders: PageBordersReading | null;
  lineNumbering: LineNumberingReading | null;
  formattingMarksBlocks: readonly FormattingMarksBlock[] | null;
  formattingMarksVisible: boolean;
  saveSnapshot: SaveSnapshot;
  searchState: SearchState;
  styleGallery: StyleGalleryState;
  engineFontSlice: FontsSliceLike | null;
  readoutSelection: ReadoutSelection;
  /** המאקרו של Word שבמסמך של הטאב הזה — לקריאה בלבד (engine/vba-import.ts). */
  documentVba: DocumentVba;
  /**
   * איפה המסמך הזה גלול. חלק מתמונת המצב ולא נשאל מה-DOM בחזרה, מסיבה שאין
   * לה מסלול עוקף: הפאנל של טאב שאינו פעיל מוסתר ב-`display: none`, וזה
   * מוחק את מיקום הגלילה של מיכל הגלילה שבתוכו. ראו sessions/pane-scroll.ts.
   */
  scroll: PaneScroll;
  /**
   * הסיומת שתחתיה הטאב הזה נשמר. פר-טאב ולא ברמת המעטפת: שמירה אוטומטית של
   * טאב ברקע חייבת לכתוב `.docm` אם **הוא** מסמך מאקרו, גם כשהמוצג אינו.
   */
  saveExtension: WordExtension;
}

export interface DocumentSession {
  readonly id: DocumentSessionId;
  /** ה-container הייעודי של הטאב הזה. ראו „פאנל” בראש הקובץ. */
  readonly pane: HTMLElement;
  /**
   * טאב שנוצר משחזור ההפעלה ועדיין לא נפתח בו המסמך — ראו „טעינה עצלה”
   * ב-App.vue, `restoreTabs`. `false` לכל טאב אחר, ולטאב ששוחזר מרגע
   * שנפתח בו המסמך.
   *
   * מה שהטאב הזה **כן** מחזיק כבר עכשיו הוא הרשומה שלו, בזוכר
   * (`keeper.state`): הקובץ, הסמן והמצביע לטיוטה. לכן הוא נכתב חזרה לרשומה
   * בסגירה גם אם המשתמש לא נגע בו, והטיוטה שלו אינה יתומה.
   */
  pendingRestore: boolean;
  /**
   * הטאב הזה נרדם **בהפעלה הנוכחית** (`sleepTab` ב-App.vue), ולא שוחזר
   * מהפעלה קודמת. משנה משפט אחד: „שוחזרו שינויים מההפעלה הקודמת” אינו נכון
   * על עבודה שנעשתה לפני דקה, ומשפט שאינו נכון בשורת המצב שוחק את האמון
   * בכל השאר שנאמר בה. מתאפס ברגע שהטאב נפתח מחדש.
   */
  slept: boolean;
  readonly swap: EditorSwap;
  readonly save: SaveCoordinator;
  readonly keeper: SessionKeeper;
  metrics: DocMetricsAdapter | null;
  ruler: RulerModel | null;
  /** סמן-הטקסט של העכבר על העמוד — ראו engine/text-cursor.ts. */
  textCursor: TextCursorWatch | null;
  pageBorders: PageBorderModel | null;
  lineNumbers: LineNumberingModel | null;
  formattingMarks: FormattingMarksModel | null;
  searchAdapter: SearchAdapter | null;
  /** תמונת המצב המוצגת, מעודכנת ב-`activateTab` (App.vue) בכל יציאה מהטאב. */
  ui: DocumentUiSnapshot;
  /**
   * מפרקת את כל מה שבאשכול — המנוע, השמירה, זוכר ההפעלה, ואת ה-`pane` עצמו.
   *
   * `removeDraft: true` הוא מסלול הסגירה-הסופית (טאב שנסגר בלי שמירה): טיוטת
   * המסמך הזה נמצאת בנתיב ייחודי לו (`draftPathFor`, ב-session-state.ts),
   * ובלי מחיקה מפורשת כאן היא נשארת יתומה במרחב הפרטי לצמיתות — לפני ריבוי
   * המסמכים נתיב קבוע ומשותף מיחזר את עצמו אוטומטית; עכשיו כל מסמך אחראי
   * לניקוי של עצמו.
   */
  destroy(options?: { removeDraft?: boolean }): Promise<void>;
}

export interface DocumentSessionParts {
  /** ברירת המחדל: מזהה חדש. מוגדר בפירוש כשמאמצים רשומה קיימת מה-storage. */
  id?: DocumentSessionId;
  pane: HTMLElement;
  swap: EditorSwap;
  save: SaveCoordinator;
  keeper: SessionKeeper;
  /** ראו `DocumentSession.pendingRestore`. ברירת המחדל: `false`. */
  pendingRestore?: boolean;
  /**
   * תמונת המצב ההתחלתית. מוגדרת לטאב ששוחזר: השם והנקודה של „לא נשמר”
   * צריכים להופיע ברצועת הטאבים **לפני** שהמסמך נטען — טאב ששמו „מסמך חדש”
   * עד שלוחצים עליו אינו שחזור אלא הבטחה.
   */
  ui?: DocumentUiSnapshot;
}

/** תמונת מצב ריקה — ברירת המחדל של טאב שעוד לא נפתח בו דבר. */
export function emptyUiSnapshot(): DocumentUiSnapshot {
  return {
    title: 'מסמך חדש',
    commandAdapter: null,
    activeSuperdoc: null,
    activeEditorContainer: null,
    documentGeneration: 0,
    activeMacros: null,
    docMetrics: emptyDocMetrics(),
    zoom: { ...FALLBACK_ZOOM },
    canUndo: false,
    canRedo: false,
    rulerReading: null,
    rulerHost: null,
    rulerViewport: null,
    rulerUnit: 'cm',
    isDocumentEditable: true,
    isRulerVisible: false,
    pageBorders: null,
    lineNumbering: null,
    formattingMarksBlocks: null,
    formattingMarksVisible: false,
    saveSnapshot: {
      state: 'idle',
      isDirty: false,
      isSaving: false,
      targetToken: null,
      name: null,
      lastError: null,
    },
    searchState: idleSearchState(),
    styleGallery: fallbackStyleGallery(),
    engineFontSlice: null,
    readoutSelection: UNSETTLED_SELECTION,
    documentVba: NO_VBA,
    scroll: { ...PANE_SCROLL_ORIGIN },
    saveExtension: 'docx',
  };
}

/** מרכיבה אשכול ממה שכבר נבנה. אינה יודעת לבנות swap/save/keeper בעצמה —
 * אלה תלויים בסגירות (closures) ספציפיות ל-App.vue, ראו initSaveCoordinator/
 * initSessionKeeper שם. */
export function createDocumentSession(parts: DocumentSessionParts): DocumentSession {
  const session: DocumentSession = {
    id: parts.id ?? createDocumentSessionId(),
    pane: parts.pane,
    swap: parts.swap,
    save: parts.save,
    keeper: parts.keeper,
    pendingRestore: parts.pendingRestore ?? false,
    slept: false,
    metrics: null,
    ruler: null,
    textCursor: null,
    pageBorders: null,
    lineNumbers: null,
    formattingMarks: null,
    searchAdapter: null,
    ui: parts.ui ?? emptyUiSnapshot(),
    async destroy(options = {}) {
      session.swap.destroy();
      session.save.dispose();
      if (options.removeDraft) await session.keeper.discardDraft();
      session.keeper.dispose();
      session.pane.remove();
    },
  };
  return session;
}
