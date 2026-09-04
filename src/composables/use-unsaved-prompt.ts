/**
 * הגשר בין החלטה שמחכה לתשובה לבין דיאלוג שמצויר על המסך.
 *
 * ## למה נדרש מודול ולא `ref` במעטפת
 *
 * `decideDocumentSwitch` (sessions/open-flow.ts) היא פונקציה אסינכרונית
 * שממתינה לתשובת המשתמש. כשהשאלה הייתה של אוצריא (`ui.showConfirm`) ההמתנה
 * הייתה חינם — הגשר החזיר הבטחה. דיאלוג שלנו אינו מחזיר דבר: הוא נצבע,
 * המשתמש לוחץ, ומגיע אירוע. כאן יושבת ההמרה בין השניים, והיא מצב אמיתי
 * (מי מחכה, ולמה) ולא עיטור.
 *
 * ## שתי ההחלטות שבפנים
 *
 * 1. **שאלה שנייה בזמן שהראשונה פתוחה נענית `cancel` מיד.** אין תור ואין
 *    החלפה. החלפה הייתה משאירה את המסמך הראשון תלוי לנצח (ההבטחה שלו לא
 *    נפתרת אף פעם), ותור היה מציג למשתמש שאלה שנייה על מסמך שהוא כבר לא
 *    בהקשר שלו. `cancel` הוא הכיוון הבטוח: לא קורה כלום. בפועל זה כמעט לא
 *    מגיע — הדיאלוג מכריז `aria-modal`, ו-`isModalDialogOpen` ב-App.vue
 *    חוסמת בגללו את קיצורי המקלדת שמתחילים פתיחה או סגירה.
 *
 * 2. **סגירה בלי בחירה היא `cancel`.** Esc, לחיצה על הרקע, וגם `dispose`
 *    בפירוק המעטפת. הבטחה שאינה נפתרת היא `await` שלא חוזר ממנו — כלומר
 *    פעולה שנתקעה בשקט.
 */
import { shallowRef, type ShallowRef } from 'vue';
import type { UnsavedChoice, UnsavedQuestion } from '../sessions/open-flow';

export interface UnsavedPrompt {
  /** מה שמוצג כרגע, או `null` כשאין שאלה פתוחה. */
  question: ShallowRef<UnsavedQuestion | null>;
  /** שואלת, ומחזירה את מה שהמשתמש בחר. */
  ask: (question: UnsavedQuestion) => Promise<UnsavedChoice>;
  /** הדיאלוג ענה. אין שאלה פתוחה — אינה עושה דבר. */
  answer: (choice: UnsavedChoice) => void;
  /** פירוק המעטפת: מי שממתין מקבל `cancel` ולא נשאר תלוי. */
  dispose: () => void;
}

export function createUnsavedPrompt(): UnsavedPrompt {
  const question = shallowRef<UnsavedQuestion | null>(null);
  let pending: ((choice: UnsavedChoice) => void) | null = null;

  function settle(choice: UnsavedChoice): void {
    const resolve = pending;
    pending = null;
    question.value = null;
    resolve?.(choice);
  }

  return {
    question,

    ask(next) {
      // ראו החלטה 1 בראש הקובץ: לא מחליפים שאלה פתוחה.
      if (pending) return Promise.resolve<UnsavedChoice>('cancel');

      question.value = next;
      return new Promise<UnsavedChoice>((resolve) => {
        pending = resolve;
      });
    },

    answer(choice) {
      settle(choice);
    },

    dispose() {
      settle('cancel');
    },
  };
}
