/**
 * הרגע שבו התוסף עובר לרקע, ומתי הוא חוזר.
 *
 * ## למה שלושה מקורות ולא אחד
 *
 * התוסף אינו אפליקציה שנסגרת אלא לשונית בתוך אוצריא, ו„המשתמש הלך” מגיע
 * בשלוש צורות שונות — שאף אחת מהן אינה מכסה את השתיים האחרות:
 *
 * - **`plugin.suspended`** — אוצריא מודיעה שה-WebView של החזית הושהה (המשתמש
 *   ניווט משם). זה המסלול הנקי, והיחיד שיודע להבדיל בין „עבר ללשונית אחרת
 *   באוצריא” לבין מזעור החלון. הוא גם היחיד שאינו קיים מחוץ לאוצריא.
 * - **`visibilitychange` → `hidden`** — מגיע גם כשהחלון עצמו הוסתר או מוזער,
 *   בלי שאוצריא ניווטה לשום מקום. זה מה שקורה כשהמשתמש עובר לתוכנה אחרת.
 * - **`pagehide`** — הדף עצמו נפרק. זו ההזדמנות **האחרונה**, ואחריה אין קוד
 *   שירוץ. `beforeunload` אינו בשימוש: הוא מיועד לשאול את המשתמש, ו-WebView
 *   מוטמע אינו מציג את השאלה הזאת בכלל.
 *
 * ## הכפילות היא הכוונה
 *
 * שלושתם עשויים לירות על אותה יציאה — ניווט באוצריא מייצר גם `suspended` וגם
 * `visibilitychange`. הקורא **חייב** להיות אידמפוטנטי, וזה בדיוק מה שכתוב
 * בחוזה של `SessionKeeper.flush`: שמירה נוספת של אותו מצב אינה עולה דבר,
 * ואילו יציאה שלא נתפסה עולה בעבודה של המשתמש.
 *
 * ## למה זה לא ב-otzaria-client
 *
 * שם יושב הגשר עצמו — `call`, `on`, ה-boot. כאן יושבת **מדיניות**: אילו
 * אירועים נחשבים „הלך” ואילו „חזר”. ההבחנה הזאת היא מה שנבדק, ומודול נפרד
 * הוא מה שמאפשר לבדוק אותה בלי לזייף SDK שלם.
 */
import { isAvailable, on } from './otzaria-client';

/** מבטל את כל ההרשמות שנעשו יחד. */
export type Unsubscribe = () => void;

function offAll(disposers: Unsubscribe[]): Unsubscribe {
  return () => {
    for (const dispose of disposers.splice(0)) {
      try {
        dispose();
      } catch (error) {
        console.warn('[otzaria-word] ביטול האזנת מחזור-חיים נכשל', error);
      }
    }
  };
}

/**
 * נרשמת לרגע שבו התוסף יורד מהמסך. ראו שלושת המקורות בראש הקובץ — הקורא
 * חייב להיות אידמפוטנטי.
 *
 * `plugin.suspended` נרשם רק כשה-SDK קיים: בפיתוח בדפדפן ובבדיקות אין גשר,
 * ושתי ההאזנות של ה-DOM עדיין עובדות שם — כלומר המסלול נבדק גם בלי אוצריא.
 */
export function onPluginHidden(listener: () => void): Unsubscribe {
  const disposers: Unsubscribe[] = [];

  if (isAvailable()) {
    try {
      disposers.push(on('plugin.suspended', () => listener()));
    } catch (error) {
      console.warn('[otzaria-word] ההאזנה ל-plugin.suspended נכשלה', error);
    }
  }

  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') listener();
  };
  document.addEventListener('visibilitychange', onVisibility);
  disposers.push(() => document.removeEventListener('visibilitychange', onVisibility));

  const onPageHide = (): void => listener();
  window.addEventListener('pagehide', onPageHide);
  disposers.push(() => window.removeEventListener('pagehide', onPageHide));

  return offAll(disposers);
}

/**
 * נרשמת לרגע שבו התוסף חוזר למסך. שלושת המקורות הם ההיפוך המדויק של
 * `onPluginHidden`, ומאותו טעם: אף אחד מהם אינו מכסה את השניים האחרים.
 *
 * ## למה יש כאן מאזין בכלל — ההערה שהייתה כאן קודם אמרה שאין
 *
 * ההנחה הייתה שהשהיה שומרת את ה-WebView בדיוק כפי שהיה. זה נכון כמעט לגמרי,
 * ובדיוק ה„כמעט” הוא הבעיה: **מיקום הגלילה** של מסמך אינו שורד את המעבר
 * לרקע בכל המסלולים. מה שנמדד — ודווח — הוא שהתמונה נראית נכונה בחזרה, אבל
 * הגלגול הראשון קופץ לראש המסמך, כלומר `scrollTop` האמיתי התאפס.
 *
 * הקורא חייב להיות אידמפוטנטי, בדיוק כמו של `onPluginHidden`: ניווט חזרה
 * באוצריא מייצר גם `plugin.resumed` וגם `visibilitychange`. התיקון עצמו
 * (sessions/pane-scroll.ts, `repairPaneScroll`) בנוי כך שקריאה שנייה אינה
 * עושה דבר.
 */
export function onPluginShown(listener: () => void): Unsubscribe {
  const disposers: Unsubscribe[] = [];

  if (isAvailable()) {
    try {
      disposers.push(on('plugin.resumed', () => listener()));
    } catch (error) {
      console.warn('[otzaria-word] ההאזנה ל-plugin.resumed נכשלה', error);
    }
  }

  const onVisibility = (): void => {
    if (document.visibilityState === 'visible') listener();
  };
  document.addEventListener('visibilitychange', onVisibility);
  disposers.push(() => document.removeEventListener('visibilitychange', onVisibility));

  // `pageshow` הוא החזרה מ-bfcache — דף שהוחזר מהמטמון אינו מריץ `load`
  // מחדש, וכל מה שתלוי ב„הדף נטען” היה מפספס אותו.
  const onPageShow = (): void => listener();
  window.addEventListener('pageshow', onPageShow);
  disposers.push(() => window.removeEventListener('pageshow', onPageShow));

  return offAll(disposers);
}
