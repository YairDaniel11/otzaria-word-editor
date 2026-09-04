<template>
  <div
    v-if="question"
    class="modal-backdrop"
    @click.self="$emit('choose', 'cancel')"
  >
    <div
      ref="dialogRef"
      class="unsaved-dialog"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="QUESTION_ID"
      tabindex="-1"
      @keydown.esc.stop="$emit('choose', 'cancel')"
      @keydown.tab="onTab"
    >
      <p
        :id="QUESTION_ID"
        class="unsaved-question"
      >
        {{ question.content }}
      </p>

      <div class="unsaved-footer">
        <button
          v-if="question.canSave"
          ref="saveRef"
          type="button"
          class="unsaved-btn unsaved-btn-primary"
          data-choice="save"
          @pointerdown.prevent
          @click="$emit('choose', 'save')"
        >
          שמור
        </button>
        <button
          type="button"
          class="unsaved-btn unsaved-btn-danger"
          data-choice="discard"
          @pointerdown.prevent
          @click="$emit('choose', 'discard')"
        >
          לא לשמור
        </button>
        <button
          ref="cancelRef"
          type="button"
          class="unsaved-btn"
          data-choice="cancel"
          @pointerdown.prevent
          @click="$emit('choose', 'cancel')"
        >
          ביטול
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * „המסמך לא נשמר” — שאלה אחת, שלושה כפתורים.
 *
 * ## למה דיאלוג שלנו ולא של אוצריא
 *
 * `ui.showConfirm` דו-כפתורי, ולכן הבחירה משלושה מצבים נבנתה עד כה משתי
 * שאלות רצופות: „לשמור?” ואחריה „למחוק?”. מי שרצה לסגור בלי לשמור שילם שתי
 * לחיצות בכל פעם. הקומפוננטה הזאת היא מה שמחליף את שתיהן; ההחלטה עצמה נשארה
 * ב-sessions/open-flow.ts, וההמתנה לתשובה ב-composables/use-unsaved-prompt.ts.
 *
 * ## מה מודאלי אמיתי מחייב
 *
 * `AboutDialog` הוא התקדים במאגר, ושלושת הדברים שהוא עושה נדרשים גם כאן —
 * ואף יותר, מפני שזה הדיאלוג היחיד בתוכנה שתשובה שגויה בו מוחקת עבודה:
 * שם נגיש (`aria-labelledby` + `aria-describedby`), מיקוד ראשוני, ומלכודת
 * מיקוד. `aria-modal="true"` בלי מלכודת הוא הצהרה שקרית — הוא אומר לקורא
 * מסך שאין מה לקרוא מחוץ לחלון, בזמן ש-Tab מוציא את המשתמש לרצועה שמאחוריו.
 *
 * ## שלוש החלטות התנהגות
 *
 * 1. **המיקוד הראשוני על „שמור”**, ולכן `Enter` שומר. כשאין „שמור” (טאב
 *    ששוחזר ואין ממה לייצא) הוא עובר ל„ביטול” — ולא ל„לא לשמור”: מקש שנלחץ
 *    מתוך הרגל לא אמור למחוק דבר.
 * 2. **Esc ולחיצה על הרקע הם „ביטול”.** אין כפתור „✕” בפינה, ובכוונה: שלוש
 *    הבחירות הן התוכן של החלון, ו„✕” היה בחירה רביעית שמשמעותה אינה כתובה
 *    על שום כפתור.
 * 3. **„לא לשמור” צבוע כהרסני** (`--color-error`) אך אינו ממולא: הוא בחירה
 *    לגיטימית ושכיחה, לא אזהרה. הממולא היחיד הוא הבחירה הבטוחה.
 *
 * ## ומה שאין כאן
 *
 * אין כותרת, אין „✕”, ואין שורת הסבר על הגיבוי. שאלה עם שלושה כפתורים היא כל
 * מה שהמשתמש צריך כדי להחליט, וכל שורה נוספת מרחיקה את השאלה מהתשובה. הגיבוי
 * עצמו קורה בכל מקרה (`sessions/discard-backup.ts`), ומה שנאמר עליו נאמר רק
 * כשהוא **נכשל** — שם זה מידע, וכאן זו היתה הרגעה.
 */
import { nextTick, ref, watch } from 'vue';
import type { UnsavedChoice, UnsavedQuestion } from '../../sessions/open-flow';

const props = withDefaults(
  defineProps<{
    /** השאלה הפתוחה, או `null` כשאין. */
    question?: UnsavedQuestion | null;
  }>(),
  { question: null },
);

defineEmits<{
  (e: 'choose', choice: UnsavedChoice): void;
}>();

/** השאלה היא גם השם הנגיש של החלון: אין כותרת אחרת שתהיה. */
const QUESTION_ID = 'unsaved-dialog-question';

const dialogRef = ref<HTMLElement | null>(null);
const saveRef = ref<HTMLButtonElement | null>(null);
const cancelRef = ref<HTMLButtonElement | null>(null);

/** לאן המיקוד חוזר בסגירה — בלעדיו הוא נופל ל-`body`, וההקלדה לא נכנסת לאיש. */
let focusOnClose: HTMLElement | null = null;

watch(
  () => props.question,
  (question) => {
    if (question) {
      focusOnClose = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      // אחרי הרינדור: לפניו אין למה למקד.
      void nextTick(() => {
        (saveRef.value ?? cancelRef.value ?? dialogRef.value)?.focus();
      });
      return;
    }

    const target = focusOnClose;
    focusOnClose = null;
    // רק אם הוא עוד במסמך: הטאב שנסגר לקח איתו את ה-„×” שנלחץ.
    if (target && document.contains(target)) target.focus();
  },
  /**
   * `immediate` מפני שהמיקוד אינו אמור להיות תלוי בשאלה מי הגיע ראשון —
   * ההרכבה או השאלה. במעטפת הקומפוננטה חיה מרגע העלייה והשאלה מגיעה אחריה,
   * אבל קומפוננטה שמורכבת עם שאלה פתוחה (בדיקה, או מעטפת שתעטוף אותה
   * ב-`v-if`) הייתה נשארת בלי מיקוד כלל — כלומר מודאל שאי אפשר לענות עליו
   * מהמקלדת.
   */
  { immediate: true },
);

/** הפקדים שאפשר למקד בתוך החלון, בסדר ה-DOM. */
function focusables(): HTMLElement[] {
  const root = dialogRef.value;
  if (!root) return [];
  return [...root.querySelectorAll<HTMLElement>('button')].filter(
    (element) => !element.hasAttribute('disabled'),
  );
}

/**
 * מלכודת המיקוד: Tab מהאחרון חוזר לראשון, ו-Shift+Tab מהראשון קופץ לאחרון.
 * זהה ל-`AboutDialog` — ראו ההנמקה שם.
 */
function onTab(event: KeyboardEvent): void {
  const items = focusables();
  if (items.length === 0) return;

  const first = items[0]!;
  const last = items[items.length - 1]!;
  const active = document.activeElement;

  if (event.shiftKey && (active === first || active === dialogRef.value)) {
    event.preventDefault();
    last.focus();
    return;
  }
  if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: var(--color-scrim);
  /* מעל שאר הדיאלוגים (2000) ומעל ה-backdrop של „אודות” (3000): זו השאלה
     שחוסמת פעולה, והיא חייבת להיות מה שנראה. */
  z-index: 3100;
  display: flex;
  align-items: center;
  justify-content: center;
}

.unsaved-dialog {
  background: var(--color-surface);
  border: 1px solid var(--color-outline);
  border-radius: var(--radius-md);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.24);
  width: 360px;
  max-width: 90vw;
  font-family: var(--font-main);
  overflow: hidden;
}

/* השורה היחידה בחלון, ולכן היא נושאת את המשקל שכותרת הייתה נושאת. */
.unsaved-question {
  margin: 0;
  padding: 20px 20px 16px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-on-surface);
}

/* בלי קו מפריד ובלי רקע משלו: החלון כולו הוא שאלה וכפתורים, ופס תחתון
   מצויר היה מחלק אותו לשני אזורים שאין ביניהם הבדל. */
.unsaved-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 0 20px 20px;
}

.unsaved-btn {
  padding: 5px 14px;
  font-size: 12px;
  font-family: var(--font-main);
  border: 1px solid var(--color-outline-variant);
  border-radius: var(--radius-xs);
  background: var(--color-surface);
  color: var(--color-on-surface);
  cursor: pointer;
  transition: all 0.08s;
}

.unsaved-btn:hover {
  background: var(--word-btn-hover);
  border-color: var(--word-blue);
}

/* הטקסט על הכפתור הממולא הוא `--color-on-primary` ולא לבן קבוע — ראו
   ההסבר ב-LinkDialog.vue. */
.unsaved-btn-primary {
  background: var(--word-blue);
  color: var(--color-on-primary);
  border-color: var(--word-blue);
  font-weight: 600;
}

.unsaved-btn-primary:hover {
  background: var(--word-blue-dark);
  border-color: var(--word-blue-dark);
}

.unsaved-btn-danger {
  color: var(--color-error);
}

.unsaved-btn-danger:hover {
  background: var(--color-error-subtle);
  border-color: var(--color-error);
}
</style>
