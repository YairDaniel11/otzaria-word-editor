<template>
  <!--
    Teleport ולא רינדור במקום: `.word-ribbon-body` מוגדר `overflow-y: hidden`
    (styles/ribbon.css), ודיאלוג שנפתח מתוך לשונית נחתך בגובה הרצועה. `fixed`
    לבדו לא היה עוזר אם לאב יש transform, ו-Teleport מוציא את הצומת מהעץ הזה
    לגמרי.
  -->
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="link-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="dialogTitle"
      @keydown.esc.stop="$emit('close')"
    >
      <div class="ld-header">
        <span class="ld-title">{{ dialogTitle }}</span>
        <button
          type="button"
          class="ld-close-btn"
          data-tip-title="סגור"
          data-tip-shortcut="Esc"
          aria-label="סגור את הוספת הקישור"
          @click="$emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="ld-body">
        <div class="ld-input-row">
          <label
            for="ld-href-input"
            class="ld-label"
          >כתובת:</label>
          <input
            id="ld-href-input"
            ref="hrefInputRef"
            v-model="href"
            type="text"
            class="ld-input"
            placeholder="https://"
            dir="ltr"
            aria-label="כתובת הקישור"
            :aria-invalid="showError"
            :aria-describedby="showError ? 'ld-href-error' : undefined"
            @keydown.enter="submit"
          >
        </div>

        <!--
          שדה הטקסט מוצג רק כשאין טווח מסומן. עם טווח המסלול במנוע הוא
          `hyperlinks.wrap`, שמעטיף את הטקסט הקיים ומתעלם מ-`text` לגמרי —
          שדה שאין לו השפעה גרוע משדה שאינו קיים.
        -->
        <div
          v-if="!hasRange"
          class="ld-input-row"
        >
          <label
            for="ld-text-input"
            class="ld-label"
          >טקסט להצגה:</label>
          <input
            id="ld-text-input"
            v-model="text"
            type="text"
            class="ld-input"
            placeholder="ברירת מחדל: הכתובת עצמה"
            aria-label="הטקסט שיוצג במקום הכתובת"
            @keydown.enter="submit"
          >
        </div>

        <!-- הטקסט המסומן מוצג כדי שיהיה ברור על מה הקישור יוחל. -->
        <p
          v-else
          class="ld-note"
          role="note"
        >
          הקישור יוחל על הטקסט המסומן{{ selectedText ? `: „${selectedText}”` : '' }}
        </p>

        <p
          v-if="showError"
          id="ld-href-error"
          class="ld-error"
          role="alert"
        >
          {{ LINK_HREF_HINT }}
        </p>
      </div>

      <div class="ld-footer">
        <button
          type="button"
          class="ld-btn ld-btn-primary"
          :disabled="!canSubmit"
          @pointerdown.prevent
          @click="submit"
        >
          הוסף קישור
        </button>
        <button
          type="button"
          class="ld-btn ld-btn-secondary"
          @pointerdown.prevent
          @click="$emit('close')"
        >
          ביטול
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * דיאלוג הוספת קישור. מציג בלבד: אינו קורא למנוע ואינו בונה payload.
 *
 * הוולידציה שכן יושבת כאן היא **תצוגתית** — האם להציג שגיאה ואם לאפשר אישור.
 * ההכרעה עצמה היא `normalizeLinkHref` ב-engine/payloads.ts, אותה פונקציה
 * שבונה את ה-payload בפועל. שני נוסחים לאותה שאלה היו מאפשרים דיאלוג שמאשר
 * כתובת שהבונה ידחה — כלומר כפתור שנלחץ ולא קורה כלום.
 *
 * `javascript:` נדחה שם, וזו גם בעיית אבטחה ולא רק כתובת חסרת טעם: הוא הרצת
 * קוד בהקשר של מי שיפתח את המסמך.
 *
 * התקדים הסגנוני והמבני הוא FindReplaceDialog.vue — `role="dialog"`, Escape,
 * מיקוד ראשוני, שמות נגישים, ואותם טוקנים.
 */
import { computed, nextTick, ref, watch } from 'vue';
import { LINK_HREF_HINT, normalizeLinkHref } from '../../engine/payloads';

const props = withDefaults(
  defineProps<{
    isOpen?: boolean;
    /** האם יש טווח מסומן. `true` = הקישור יעטוף אותו ואין שדה טקסט. */
    hasRange?: boolean;
    /** הטקסט המסומן, לתצוגה בלבד. */
    selectedText?: string;
  }>(),
  { isOpen: false, hasRange: false, selectedText: '' }
);

const emit = defineEmits<{
  (e: 'close'): void;
  /** כתובת שעברה ולידציה, והטקסט שהמשתמש הזין (ריק = ברירת המחדל של המנוע). */
  (e: 'submit', link: { href: string; text: string }): void;
}>();

const href = ref('');
const text = ref('');
const hrefInputRef = ref<HTMLInputElement | null>(null);

const dialogTitle = 'הוספת קישור';

const normalized = computed(() => normalizeLinkHref(href.value));
const canSubmit = computed(() => normalized.value !== null);

/**
 * השגיאה מוצגת רק אחרי שהמשתמש הקליד משהו. הצגה על שדה ריק פירושה דיאלוג
 * שנפתח עם הודעת שגיאה, בלי שאיש עשה כלום.
 */
const showError = computed(() => href.value.trim() !== '' && !canSubmit.value);

watch(
  () => props.isOpen,
  (open) => {
    if (!open) return;
    // הדיאלוג נפתח נקי בכל פעם: כתובת שנשארה מפתיחה קודמת הייתה נכתבת
    // למסמך אחר מזה שהמשתמש התכוון אליו.
    href.value = '';
    text.value = '';
    nextTick(() => {
      hrefInputRef.value?.focus();
      hrefInputRef.value?.select();
    });
  }
);

function submit(): void {
  if (!canSubmit.value) return;
  emit('submit', { href: href.value, text: text.value });
}
</script>

<style scoped>
.link-dialog {
  position: fixed;
  top: 140px;
  inset-inline-start: 40px;
  z-index: 2000;
  background: var(--color-surface);
  border: 1px solid var(--color-outline);
  border-radius: var(--radius-sm);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
  width: 360px;
  font-family: var(--font-main);
  user-select: none;
}

.ld-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-block-end: 1px solid var(--color-outline-variant);
  padding: 6px 8px 6px 12px;
  background: var(--color-surface-container-high);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
}

.ld-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-on-surface);
}

.ld-close-btn {
  background: none;
  border: none;
  font-size: 14px;
  color: var(--color-on-surface-variant);
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--radius-xs);
}

.ld-close-btn:hover {
  background: var(--word-btn-hover);
  color: var(--color-error);
}

.ld-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ld-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ld-label {
  width: 85px;
  font-size: 11px;
  color: var(--color-on-surface);
  flex-shrink: 0;
}

.ld-input {
  flex: 1;
  min-width: 0;
  padding: 4px 8px;
  border: 1px solid var(--color-outline-variant);
  border-radius: var(--radius-xs);
  background: var(--color-surface);
  color: var(--color-on-surface);
  font-family: var(--font-main);
  font-size: 12px;
  outline: none;
}

.ld-input:focus {
  border-color: var(--word-blue);
  box-shadow: 0 0 0 1px var(--word-blue);
}

.ld-input[aria-invalid='true'] {
  border-color: var(--color-error);
}

.ld-note {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--color-on-surface-variant);
}

.ld-error {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--color-error);
}

.ld-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  padding: 8px 12px;
  border-block-start: 1px solid var(--color-outline-variant);
  background: var(--color-surface-container-high);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
}

.ld-btn {
  padding: 4px 10px;
  font-size: 11px;
  font-family: var(--font-main);
  border: 1px solid var(--color-outline-variant);
  border-radius: var(--radius-xs);
  background: var(--color-surface);
  color: var(--color-on-surface);
  cursor: pointer;
  transition: all 0.08s;
}

.ld-btn:hover:not(:disabled) {
  background: var(--word-btn-hover);
  border-color: var(--word-blue);
}

/* הטקסט על הכפתור הממולא הוא `--color-on-primary` ולא לבן קבוע: זה בדיוק
   התפקיד שלו ב-M3 („טקסט/אייקון בתוך אלמנטים בצבע primary”), והוא מגיע
   מהערכה. `#ffffff` שהיה כאן נמדד במצב כהה כלבן על כחול-בהיר — כמעט בלתי
   קריא, כי שם ה-primary עצמו בהיר וה-onPrimary שלו כהה. */
.ld-btn-primary {
  background: var(--word-blue);
  color: var(--color-on-primary);
  border-color: var(--word-blue);
}

.ld-btn-primary:hover:not(:disabled) {
  background: var(--word-blue-dark);
}

.ld-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
