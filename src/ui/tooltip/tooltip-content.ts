/**
 * מה כתוב בטולטיפ — התוכן, במנותק מהתצוגה ומה-DOM.
 *
 * ## מה שהיה כאן קודם
 *
 * הטולטיפ של התוכנה היה תכונת `title` מולדת: מלבן אפור של מערכת ההפעלה, בגופן
 * שאינו הגופן של הממשק, ללא היררכיה בתוכו. הצירוף נדחף לאותה מחרוזת בסוגריים,
 * ולכן „מברשת עיצוב” ו„העתק עיצוב ממקום אחד והחל במקום אחר” הוצגו כשורה אחת
 * ארוכה — למשתמש לא הייתה דרך לראות מה השם ומה ההסבר.
 *
 * הטולטיפ החדש מציג שלושה שדות: **כותרת**, **צירוף מקשים** באותה שורה,
 * ו**הסבר** מתחתיהם. המודול הזה קובע מאין כל אחד מהם מגיע.
 *
 * ## למה מודול טהור
 *
 * הכלל שממפה את ה-props הקיימים לשלושת השדות הוא ההחלטה היחידה כאן שאפשר
 * לשבור בשקט: 126 אתרי קריאה כבר מעבירים `label` ו-`tooltip`, ובחלקם
 * ה-`tooltip` הוא *שם* („מודגש”) ובחלקם *הסבר* („העתק עיצוב ממקום אחד…”).
 * כפונקציה טהורה אפשר למדוד את ההבחנה (tests/unit/tooltip-content.test.ts),
 * והקומפוננטה נשארת חיווט.
 */

/** שלושת השדות שהטולטיפ מצייר. מחרוזת ריקה = השדה אינו מוצג. */
export interface TipContent {
  title: string;
  shortcut: string;
  description: string;
}

/**
 * התכונות שאלמנט מצהיר בהן על טולטיפ עשיר.
 *
 * למה תכונות DOM ולא props של קומפוננטה: השכבה שמציגה את הטולטיפ אחת לכל
 * התוכנה (`TooltipLayer.vue`), והיא מאזינה במסירה (delegation) על המסמך. לולא
 * זאת כל פקד היה צריך לחווט לעצמו מאזינים, טיימר ומיקום — וגם אז כפתור
 * *מנוטרל* היה נשאר בלי טולטיפ, כי דפדפן אינו שולח אירועי עכבר לפקד מנוטרל.
 */
export const TIP_TITLE_ATTR = 'data-tip-title';
export const TIP_SHORTCUT_ATTR = 'data-tip-shortcut';
export const TIP_DESCRIPTION_ATTR = 'data-tip-desc';

/**
 * מה שהופך אלמנט לעוגן. תכונה אחת, ו-`title` אינו בה.
 *
 * זו לא קוסמטיקה אלא **הדרך היחידה** שיש לתוכנה למנוע טולטיפ כפול, ולכן היא
 * גם החוזה שהשער tests/unit/native-title.test.ts אוכף על כל קובצי ה-Vue.
 *
 * הניסיון הקודם היה להשאיר `title` ולכבות אותו בריחוף. זה אינו עובד: הדפדפן
 * קורא את התכונה **בתזוזת העכבר**, לא כשהוא מצייר, ומרגע שהטקסט נלכד בתזוזה
 * שבה הסמן נעצר — ההשהיה שלו כבר רצה, והמלבן האפור צויר גם אחרי שהתכונה ירדה
 * מה-DOM. נמדד בצילום מסך: הכרטיס והמלבן זה מעל זה על „כיוון פסקה משמאל
 * לימין”. Blink גם מטפס להורים בחיפוש `title` (`HitTestResult::Title`), כך
 * שגם „נשים אותו על העוטף” לא היה עוזר.
 *
 * לכן `title` אינו מופיע באף אלמנט DOM בתוכנה. מפקד על ה-dist הארוז מדד 61
 * תכונות `title`, **כולן** מהמקור שלנו ואף אחת לא מהמנוע — כלומר ההמרה לתכונות
 * `data-tip-*` מסלקת את המחלקה כולה, ולא רק את המופע שדווח.
 */
export const TIP_ANCHOR_SELECTOR = `[${TIP_TITLE_ATTR}]`;

/**
 * מה שלא מקבל טולטיפ של המעטפת.
 *
 * אזור המסמך הוא DOM שהמנוע מצייר, ולא הממשק שלנו. הוא לעולם אינו נושא תכונות
 * `data-tip-*`, ולכן הסינון אינו נדרש כדי לזהות עוגן — הוא נדרש כדי **לא לחשב
 * כלום**: בלעדיו כל תנועת עכבר בזמן הקלדה או בחירה הייתה מפעילה בדיקה
 * גיאומטרית (`elementFromPoint`) בתוך המסמך.
 */
export const TIP_EXCLUDED_SELECTOR = '.editor-stack';

function clean(value: string | null | undefined): string {
  return (value ?? '').trim();
}

export interface TipSource {
  /** תווית הפקד — השם הקצר שמופיע גם על הכפתור עצמו. */
  label?: string;
  /** ה-prop הקיים. לפי אתר הקריאה הוא שם או הסבר — ראו למטה. */
  tooltip?: string;
  /** הסבר מפורש. גובר על כל גזירה. */
  description?: string;
  /** תווית הצירוף מהרג'יסטרי, למשל `Ctrl+B`. */
  shortcut?: string;
}

/**
 * שלושת השדות, בהינתן מה שאתר הקריאה מסר.
 *
 * הכלל, ולמה הוא כזה:
 *
 * 1. **`description` מפורש גובר.** זה המסלול לפקדים שנכתב להם הסבר משלהם.
 * 2. **יש `label` וה-`tooltip` שונה ממנו → ה-`tooltip` הוא ההסבר.** זה בדיוק
 *    המקרה של „מברשת עיצוב” / „העתק עיצוב ממקום אחד והחל במקום אחר”, וגם של
 *    כפתור מנוטרל שה-`tooltip` שלו הוא *הסיבה* („אין בחירה”) — הכותרת נשארת
 *    שם הפקד, והסיבה יורדת לשורת ההסבר במקום להחליף את השם.
 * 3. **אחרת ה-`tooltip` הוא הכותרת.** אלה הכפתורים חסרי התווית שברצועה
 *    (`variant: 'icon-only'`), שבהם ה-`tooltip` תמיד היה השם: „מודגש”, „נטוי”.
 *
 * המקרה שהכלל *לא* מטפל בו הוא `tooltip` ארוך על כפתור בלי `label` — שם אין
 * ממה לגזור כותרת, וההסבר יוצג ככותרת. זה המצב הקיים בדיוק, ולכן אינו רגרסיה;
 * הדרך לתקן אתר קריאה כזה היא להוסיף לו `description`.
 */
export function tipParts(source: TipSource): TipContent {
  const label = clean(source.label);
  const tooltip = clean(source.tooltip);
  const explicit = clean(source.description);

  const title = label || tooltip;
  const derived = label && tooltip && tooltip !== label ? tooltip : '';

  return {
    title,
    shortcut: clean(source.shortcut),
    description: explicit || derived,
  };
}

/**
 * התוכן שאלמנט מצהיר עליו, או null אם אינו עוגן.
 */
export function readTip(element: Element): TipContent | null {
  const content = tipParts({
    tooltip: element.getAttribute(TIP_TITLE_ATTR) ?? '',
    shortcut: element.getAttribute(TIP_SHORTCUT_ATTR) ?? '',
    description: element.getAttribute(TIP_DESCRIPTION_ATTR) ?? '',
  });

  return content.title || content.description ? content : null;
}
