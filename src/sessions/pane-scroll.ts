/**
 * מיקום הגלילה של מסמך, ומה ששומר עליו כשהמסמך יורד מהמסך.
 *
 * ## הבאג שהמודול הזה קיים בשבילו — כפי שנמדד, ולא כפי שהונח
 *
 * הדיווח הוא „הוא זוכר איפה אני, וברגע שאני מתחיל לגלול הוא חוזר לראש”.
 * ההסבר שהיה כתוב כאן קודם — „`display: none` הורס את קופסת הפריסה ולכן
 * `scrollTop` אבד” — **הופרך במדידה** (Chrome אמיתי, שני מסמכים חיים):
 *
 * - הדפדפן דווקא **משחזר בעצמו**: מיכל שנגלל ל-840, עבר `display: none`
 *   וחזר, קרא 840 — באותה משימה סינכרונית (840→0→840).
 * - גם השחזור שלנו יושב: `scrollTop` נמדד נכון בכל נקודות הזמן אחרי מעבר
 *   טאב — מיד, מיקרו-משימה, rAF, rAF שני ו-150ms — כולן 720.
 * - ואז **גלגלת אחת** → 0. הכתיבה היא של המנוע:
 *   `@superdoc/docx-engine` מחזיק snapshot **יחיד** של שורש הגלילה, ומזרים
 *   אליו בגלגלת הראשונה את הערך שנשמר בו — 0, שנקרא בזמן שהפאנל של הטאב
 *   האחר היה מוסתר. נמדד `{"ev":"set","asked":0,"was":720,"got":0}`.
 * - עם טאב אחד אין איפוס בכלל. התופעה קיימת רק כששני מסמכים חיים, כלומר
 *   רק כשיש שני מנועים שחולקים את אותו snapshot. הרשומה המלאה
 *   ב-`docs/engine-gaps.md`.
 *
 * ## שלוש פעולות, ולא אחת
 *
 * ההבדל ביניהן הוא מי מותר לו לדרוס את מי:
 *
 * - **`applyPaneScroll`** — „החזר את המיקום שנשמר”. נקראת כשטאב חוזר להיות
 *   פעיל, ואז מה שנשמר הוא האמת היחידה.
 * - **`repairPaneScroll`** — „תקן רק אם באמת אבד”. נקראת כשהתוסף חוזר מהרקע,
 *   ושם המיכל **לא בהכרח** איבד דבר. כתיבה גורפת שם הייתה מסוכנת: אילו
 *   המיקום שרד, והמסמך בינתיים התעמד מחדש והתקצר, היינו קופצים למקום שכבר
 *   אינו קיים. לכן היא כותבת אך ורק כשהמיכל יושב על אפס ואנחנו זוכרים אחרת —
 *   כלומר בדיוק החתימה של „המיקום נמחק”.
 * - **`guardPaneScroll`** — אותה סמנטיקה בדיוק של `repairPaneScroll`, אבל
 *   מחוברת לאירוע הגלילה הראשון אחרי מעבר טאב. זה מה שתופס את הכתיבה של
 *   המנוע: היא אינה קורית בזמן שאנחנו מסתכלים אלא בגלגלת של המשתמש.
 *
 * ## למה זה מודול ולא שתי שורות במעטפת
 *
 * שתי השורות האלה הן ההבדל בין „הגלילה נשמרת” ל„הגלילה קופצת”, וזה בדיוק סוג
 * הקוד שנמחק בשקט ברפקטור הבא. כאן הוא נבדק.
 *
 * ## מה **אינו** נשמר, ובכוונה
 *
 * מיקום הגלילה חי לאורך ההפעלה בלבד (`DocumentSession.ui.scroll`), ואינו נכתב
 * לרשומת ההפעלה כמו הזום והסמן (`sessions/session-state.ts`). זו בחירה ולא
 * שכחה: הסמן הוא **מקום בטקסט** והזום הוא העדפה, ושניהם נכונים גם אחרי
 * שהמסמך נערך במקום אחר או נפרס אחרת. מיקום הגלילה הוא פיקסלים במיכל, והוא
 * מאבד את משמעותו ברגע שגובה החלון, הזום או המסמך עצמו השתנו בין ההפעלות —
 * ושחזור הסמן ממילא מביא את הטקסט הנכון אל המסך.
 */

/** מיקום גלילה, בפיקסלי CSS. */
export interface PaneScroll {
  top: number;
  left: number;
}

/**
 * ראש המסמך — גם ברירת המחדל של טאב שעוד לא נגללו בו.
 *
 * קפוא: הוא נמסר כארגומנט ל-`applyPaneScroll` ומושווה בכל ההשוואות כאן,
 * וכתיבה בשוגג לתוכו הייתה מזיזה את „ראש המסמך” לכל הקוראים בבת אחת.
 */
export const PANE_SCROLL_ORIGIN: Readonly<PaneScroll> = Object.freeze({ top: 0, left: 0 });

/**
 * מה שנדרש ממיכל הגלילה. אלמנט אמיתי מקיים את זה מאליו, ובדיקה יכולה למסור
 * אובייקט פשוט — הדבר היחיד שנמדד כאן הוא שני מספרים.
 */
export type ScrollPane = Pick<HTMLElement, 'scrollTop' | 'scrollLeft'>;

/**
 * ערך גלילה חוקי: כל מספר סופי, **כולל שלילי**.
 *
 * שלילי אינו פגם: מיכל `direction: rtl` בכרום מדווח `scrollLeft` שלילי, ולא
 * חיובי — נמדד טווח `[-1000, 0]`. הפסילה שהייתה כאן קודם („רק חיובי”) הפכה
 * כל מיקום אופקי במיכל כזה לאפס, כלומר „חזור לתחילת השורה” בכל מעבר טאב.
 * היום אין נזק בפועל מפני ש-`.editor-stack__host` הוא `direction: ltr`
 * בכוונה (`src/styles/shell.css`), אבל זו מלכודת שנפתחת בשקט ברגע שמישהו
 * יהפוך אותו — ולכן התיקון כאן ולא שם.
 *
 * מה שכן נפסל: `NaN`, אינסוף, וכל דבר שאינו מספר. אלה היו נשמרים ומוחזרים
 * אחר כך כהשמה ל-`scrollTop`.
 */
function readAxis(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** המיקום הנוכחי של המיכל, או ראש המסמך כשאין מיכל. */
export function readPaneScroll(pane: ScrollPane | null | undefined): PaneScroll {
  if (!pane) return { ...PANE_SCROLL_ORIGIN };
  return { top: readAxis(pane.scrollTop), left: readAxis(pane.scrollLeft) };
}

/** האם שני המיקומים זהים. */
export function samePaneScroll(a: PaneScroll, b: PaneScroll): boolean {
  return a.top === b.top && a.left === b.left;
}

/**
 * מחזירה את המיקום השמור למיכל. מחזירה `true` אם משהו נכתב בפועל.
 *
 * כתיבה רק כשיש הבדל: השמה ל-`scrollTop` היא בקשת גלילה לכל דבר, והיא מבטלת
 * גלילה חלקה שרצה באותו רגע. „אותו ערך” הוא המצב הנפוץ (טאב שנשאר בראש),
 * ואין סיבה שהוא יעלה משהו.
 */
export function applyPaneScroll(pane: ScrollPane | null | undefined, scroll: PaneScroll): boolean {
  if (!pane) return false;
  let wrote = false;
  if (pane.scrollTop !== scroll.top) {
    pane.scrollTop = scroll.top;
    wrote = true;
  }
  if (pane.scrollLeft !== scroll.left) {
    pane.scrollLeft = scroll.left;
    wrote = true;
  }
  return wrote;
}

/**
 * מתקנת מיקום שאבד — ורק אותו. מחזירה `true` אם תיקנה.
 *
 * „אבד” מוגדר בצמצום: המיכל יושב על ראש המסמך, והמיקום השמור אינו שם. כל מצב
 * אחר — כולל „המיכל במקום אחר לגמרי” — אינו אובדן אלא מצב שיש לו בעלים, ואין
 * לגעת בו. ראו „שלוש פעולות” בראש הקובץ.
 */
export function repairPaneScroll(pane: ScrollPane | null | undefined, scroll: PaneScroll): boolean {
  if (!pane) return false;
  if (samePaneScroll(scroll, PANE_SCROLL_ORIGIN)) return false;
  if (!samePaneScroll(readPaneScroll(pane), PANE_SCROLL_ORIGIN)) return false;
  return applyPaneScroll(pane, scroll);
}

/** מיכל שאפשר גם להאזין לו. `HTMLElement` מקיים את זה, וכפיל בבדיקה גם. */
export interface WatchableScrollPane extends ScrollPane {
  addEventListener: (type: 'scroll', listener: () => void) => void;
  removeEventListener: (type: 'scroll', listener: () => void) => void;
}

/**
 * שומרת על המיקום מפני האיפוס של המנוע בגלילה הראשונה. מחזירה פונקציית
 * פירוק, וקריאה חוזרת לפירוק אינה עושה דבר.
 *
 * ## למה מאזין ולא עוד השמה
 *
 * המנוע כותב את האפס **מתוך הגלגלת של המשתמש** ולא בזמן מעבר הטאב (ראו
 * המדידה בראש הקובץ), ולכן שום השמה שלנו — מיידית, ב-rAF או אחרי 150ms —
 * אינה מגיעה אחריו. הרגע היחיד שבו אפשר לתפוס אותו הוא אירוע הגלילה
 * הראשון שאחרי ההפעלה.
 *
 * ## שלושת המצבים שהאירוע הראשון יכול לתאר
 *
 * - **המיכל על ראש המסמך ואנחנו זוכרים אחרת** — זו החתימה של האיפוס, בדיוק
 *   כמו ב-`repairPaneScroll`. מחזירים, ומתפרקים.
 * - **המיכל בדיוק על המיקום השמור** — זה ההד של השחזור שלנו עצמו (השמה
 *   ל-`scrollTop` יורה `scroll`). לא קרה כלום, וממשיכים לחכות.
 * - **כל מיקום אחר** — המשתמש גלל בעצמו. מכאן והלאה המיקום שלו הוא הנכון,
 *   ומתפרקים בלי לכתוב.
 *
 * המחיר הידוע: משתמש שהמיקום השמור שלו קרוב לראש המסמך, וגלילתו הראשונה היא
 * דווקא **אל** ראש המסמך, יוחזר פעם אחת. זה בלתי ניתן להפרדה — האיפוס של
 * המנוע נראה בדיוק כך — והוא נבחר על פני „כל גלגלת ראשונה קופצת לראש”.
 */
export function guardPaneScroll(
  pane: WatchableScrollPane | null | undefined,
  scroll: PaneScroll,
): () => void {
  // אין מה לשמור על ראש המסמך: האיפוס מחזיר בדיוק אותו.
  if (!pane || samePaneScroll(scroll, PANE_SCROLL_ORIGIN)) return () => {};

  // ל-`const` ולא לפרמטר: הצרה של פרמטר אינה נשמרת בתוך פונקציה מקוננת.
  const host = pane;
  let armed = true;

  const dispose = (): void => {
    if (!armed) return;
    armed = false;
    host.removeEventListener('scroll', onScroll);
  };

  function onScroll(): void {
    const at = readPaneScroll(host);
    if (samePaneScroll(at, scroll)) return;

    // הפירוק **לפני** הכתיבה: ההשמה שלנו יורה `scroll` בעצמה, ובלי זה
    // המאזין היה נכנס שוב לתוך עצמו.
    dispose();
    if (samePaneScroll(at, PANE_SCROLL_ORIGIN)) applyPaneScroll(host, scroll);
  }

  host.addEventListener('scroll', onScroll);
  return dispose;
}
