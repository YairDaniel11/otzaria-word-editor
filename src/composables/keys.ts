/**
 * מפתחות ה-provide/inject של המעטפת.
 *
 * `InjectionKey` מטופס ולא מחרוזת: מפתח מוקלד שגוי הוא באג שקט — הפקד עולה,
 * ה-inject נופל לברירת המחדל, והכפתור פשוט לא עושה כלום. עם המפתחות האלה
 * ה-typecheck תופס אותו.
 */
import type { InjectionKey, Ref } from 'vue';
import type { CommandAdapter, CommandOutcome } from '../engine/command-adapter';
import type { FontOptions } from '../engine/font-options';
import type { StyleGalleryState } from '../engine/style-gallery';
import type { ReadoutSelection } from '../engine/readout-hold';
import type { PageEdgeWords } from '../engine/page-ruler';
import type { FontMemory } from './use-font-controls';

/** האדפטר של ה-session הפעיל. `null` עד שיש מסמך פתוח. */
export const COMMAND_ADAPTER: InjectionKey<Ref<CommandAdapter | null>> = Symbol('commandAdapter');

/**
 * מי שיודע להציג הודעה למשתמש. ה-adapter מחזיר תוצאה עם הודעה בעברית, אבל עד
 * עכשיו כל 38 אתרי הקריאה ב-Ribbon עשו `void cmd.run()` וזרקו אותה — כלומר
 * שלוש טבלאות התרגום ב-command-adapter.ts היו קוד מת, וכשל פקודה נראה למשתמש
 * כמו כפתור שבור. ההזרקה הזאת היא מה שמחזיר אותן למסך בלי לגעת באתרי הקריאה.
 */
export const COMMAND_REPORTER: InjectionKey<CommandReporter> = Symbol('commandReporter');

/** מקבלת את תוצאת הפקודה. נקראת גם בהצלחה, כדי שנוכל לנקות הודעה קודמת. */
export type CommandReporter = (outcome: CommandOutcome, commandId: string) => void;

/**
 * הודעת-מידע לשורת המצב — „בוצעו 3 תיקונים”, „הומרו 2 הערות”. ערוץ נפרד
 * מ-`COMMAND_REPORTER` בכוונה: המדווח מקבל תוצאות פקודה, והצלחה שם רק
 * מנקה שגיאה קודמת. כלי שמסכם כמה עשה צריך להגיד את זה בקול, בלי
 * לזייף outcome כושל.
 */
export const STATUS_NOTIFIER: InjectionKey<(text: string) => void> = Symbol('statusNotifier');

/**
 * אפשרויות הגופן של המסמך הפתוח (`ui.fonts` דרך engine/font-options.ts).
 *
 * מפתח **צר** בכוונה, ולא ה-`ui` הגולמי: התכנית (§4) קובעת שכל מה שקומפוננטה
 * רואה עובר דרך שכבה שאפשר לבדוק. `ui` בקומפוננטה היה פותח לה את כל 20
 * ה-handles של ה-controller, כולל מסלולי mutation שאין להם קשר לבורר גופן.
 */
export const FONT_OPTIONS: InjectionKey<Ref<FontOptions>> = Symbol('fontOptions');

/**
 * גלריית הסגנונות של המסמך הפתוח (`ui.styles` דרך engine/style-gallery.ts).
 *
 * מפתח נפרד ולא הרחבה של `FONT_OPTIONS`, ומאותו טעם צר: הגלריה היא הקטלוג
 * **של המסמך**, נפתרת אסינכרונית אחרי הפתיחה, ורק מי שמנהל את ה-session יודע
 * מתי להירשם ומתי לשחרר. הקומפוננטה רואה מצב קריא בלבד.
 */
export const STYLE_GALLERY: InjectionKey<Ref<StyleGalleryState>> = Symbol('styleGallery');

/**
 * הזיכרון של בוררי הגופן — „האחרון שהמנוע דיווח” ו„מה שנבחר וטרם נענה”.
 *
 * מפתח ולא מצב בתוך הפקד, מפני שאותם שני בוררים מופיעים בשני מקומות: הרצועה
 * ותפריט הלחצן הימני. עותק פרטי לכל אחד מהם פירושו שברגע שהמנוע אינו מדווח
 * ערך — כלומר מיד אחרי שהתפריט הזיז את הסמן — התפריט מציג ברירת מחדל בזמן
 * שהרצועה מציגה את גופן המסמך. ראו use-font-controls.ts.
 */
export const FONT_MEMORY: InjectionKey<FontMemory> = Symbol('fontMemory');

/**
 * מצב הבחירה כפי שהחזקת החיווי צריכה אותו (`ui.selection` דרך
 * engine/readout-hold.ts).
 *
 * מפתח נפרד ולא הרחבה של `COMMAND_ADAPTER`, מאותו טעם צר כמו שני המפתחות
 * שמעליו: האדפטר הוא „הרץ פקודה, ותן לי את מצבה”, והבחירה היא עובדה על
 * המסמך שכל הפקדים חולקים. הזרקה אחת ולא מנוי לכל פקד — 38 מנויים ל-
 * `ui.selection` על אותו slice היו 38 עותקים של אותה תשובה.
 */
export const READOUT_SELECTION: InjectionKey<Ref<ReadoutSelection>> = Symbol('readoutSelection');

/**
 * מונה שעולה בכל פעם שהמסמך הפעיל **באמת** הוחלף (`EditorSwap.documentGeneration`,
 * sessions/editor-swap.ts) — לא בכל ניסיון פתיחה, ולא בכל מעבר ל-`null`.
 *
 * למה בכלל צריך מונה נפרד, ולא רק להשוות זהות של `ACTIVE_SUPERDOC`: ברוב
 * הצרכנים זהות האובייקט מספיקה (`watch(superdoc, ...)` כבר עושה בדיוק זאת).
 * המונה קיים לצרכן שרוצה איתות "מסמך אחר" **בלתי-תלוי** בחוזה הזהות של
 * `SuperDoc` עצמו — כלומר לא צריך להניח ש-superdoc.instance !== previous
 * תמיד נכון בכל גרסת מנוע. `PageBreakTracker.syncDocument` (engine/page-break.ts)
 * הוא הצרכן הראשון: הוא צריך למחוק את הידע שלו כשמסמך אחר נפתח, ולא כשאותו
 * מסמך בדיוק נטען מחדש ברכיב (למשל לשונית שהוחלפה וחזרה).
 */
export const DOCUMENT_GENERATION: InjectionKey<Ref<number>> = Symbol('documentGeneration');

/**
 * מתג בדיקת האיות התורנית, ל-`ui/ribbon/tabs/ReviewTab.vue`.
 *
 * מפתח משלו ולא `CommandId`: אין למנוע פקודת איות, וזו תכונה של שכבת התצוגה
 * שלנו לגמרי (‏ui/shell/SpellingOverlay.vue). `busy` אינו קישוט — ההדלקה
 * מושכת נכס של 1.3MB (engine/spellcheck-dictionary.ts), וכפתור שאינו אומר
 * שהוא באמצע נראה שבור.
 */
export interface SpellcheckHandle {
  /** האם הבדיקה דלוקה **ומילון טעון**. */
  readonly enabled: Ref<boolean>;
  /** המילון בטעינה כרגע. */
  readonly busy: Ref<boolean>;
  toggle: () => void;
}

export const SPELLCHECK: InjectionKey<SpellcheckHandle> = Symbol('spellcheck');

/**
 * „סימון עמודים” של שולחן העורך, ל-`ui/ribbon/tabs/ShulchanTab.vue`.
 *
 * השכבה שמציירת (ui/shell/PageMarkingOverlay.vue) יושבת ב-App.vue מעל
 * המסמך, והלשונית רק מדליקה/מכבה אותה ומבקשת מדידה טרייה ל„סמן”/„בדוק”.
 * `changedPages` — העמודים ש„בדיקה” מצאה שזזו, מסומנים בכתום.
 */
export interface PageMarkingHandle {
  readonly enabled: Ref<boolean>;
  readonly changedPages: Ref<ReadonlySet<number>>;
  setEnabled: (enabled: boolean) => void;
  setChangedPages: (pages: ReadonlySet<number>) => void;
  /** מדידה טרייה של מילות הקצה של כל עמוד מצויר (engine/page-ruler.ts). */
  measure: () => readonly PageEdgeWords[];
}

export const PAGE_MARKING: InjectionKey<PageMarkingHandle> = Symbol('pageMarking');

/**
 * פתיחת מסמך חדש מ-Blob בטאב נוסף — „פירוק מסמך” של שולחן העורך צריך מסמך
 * שני להערות. המסלול הוא `openDocument(undefined, { draft })` של App.vue:
 * המסמך נפתח כטיוטה לא-שמורה, ו„שמור” בו פותח „שמור בשם”. `false` = לא נפתח.
 */
export const DRAFT_OPENER: InjectionKey<(blob: Blob) => Promise<boolean>> = Symbol('draftOpener');
