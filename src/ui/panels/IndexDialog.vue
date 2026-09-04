<template>
  <!-- Teleport מאותו טעם כמו בשאר הדיאלוגים. ראו BookmarkDialog.vue. -->
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="index-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="DIALOG_TITLE"
      @keydown.esc.stop="$emit('close')"
    >
      <div class="id-header">
        <span class="id-title">{{ DIALOG_TITLE }}</span>
        <button
          type="button"
          class="id-close-btn"
          data-tip-title="סגור"
          data-tip-shortcut="Esc"
          aria-label="סגור את הגדרות המפתח"
          @click="$emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="id-body">
        <div class="id-row">
          <label
            for="id-columns"
            class="id-label"
          >טורים:</label>
          <select
            id="id-columns"
            ref="firstFieldRef"
            v-model.number="columns"
            class="id-select"
            aria-label="מספר הטורים שהמפתח יוצג בהם"
          >
            <option
              v-for="count in COLUMNS"
              :key="count"
              :value="count"
            >
              {{ count }}
            </option>
          </select>
        </div>

        <p
          v-if="showError"
          class="id-error"
          role="alert"
        >
          {{ INDEX_COLUMNS_HINT }}
        </p>

        <label class="id-check">
          <input
            v-model="runIn"
            type="checkbox"
          >
          <span>תת-הערכים רצופים בשורה אחת ולא כל אחד בשורה</span>
        </label>

        <!--
          שתי ההגדרות האלה הן היחידות שנמדדו גם כמשפיעות על קוד השדה וגם
          כהפיכות לחלוטין, והן גם השתיים שיש להן פקד בדיאלוג „מפתח” של Word
          העברי. „טווח אותיות” ו„מיון מוטעם” אינם כאן — הראשון מקבל כל
          מחרוזת שהיא, השני חסר משמעות בעברית. ההנמקה המלאה
          ב-engine/index-field.ts.
        -->
        <p
          class="id-note"
          role="note"
        >
          ההגדרות נכתבות לקוד השדה של המפתח, ובאות לידי ביטוי כשהמסמך נפתח
          ב-Word.
        </p>
      </div>

      <div class="id-footer">
        <button
          type="button"
          class="id-btn id-btn-primary"
          :disabled="!canSubmit"
          @pointerdown.prevent
          @click="onSubmit"
        >
          אישור
        </button>
        <button
          type="button"
          class="id-btn"
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
 * „מפתח מותאם אישית” — התרגום של הדיאלוג שנפתח מ„הפניות → הוסף מפתח”
 * ב-Word העברי, בשני הפקדים שלו שהמנוע באמת כותב.
 *
 * מציג בלבד: אינו קורא למנוע. הוולידציה כאן היא **תצוגתית**, וההכרעה עצמה
 * היא `isValidIndexColumns` ב-engine/index-field.ts — אותה פונקציה שהמודול
 * קורא לה לפני השליחה. שני נוסחים לאותה שאלה היו מאפשרים דיאלוג שמאשר ערך
 * שהמודול ידחה, כלומר כפתור שנלחץ ולא קורה כלום.
 *
 * הדיאלוג נסגר באישור, בשונה מדיאלוג סימון הערכים: יש כאן פעולה אחת, ואין
 * רצף שממשיכים בו אחריה.
 */
import { computed, nextTick, ref, watch } from 'vue';
import {
  DEFAULT_INDEX_COLUMNS,
  INDEX_COLUMNS_HINT,
  INDEX_COLUMNS_MAX,
  INDEX_COLUMNS_MIN,
  isValidIndexColumns,
  type IndexSettings,
} from '../../engine/index-field';

const props = withDefaults(
  defineProps<{
    isOpen?: boolean;
    /** מספר הטורים שנקרא מהמסמך, או `null` כשהמנוע לא הצהיר עליו. */
    columns?: number | null;
    runIn?: boolean;
  }>(),
  { isOpen: false, columns: null, runIn: false }
);

const emit = defineEmits<{
  (e: 'close'): void;
  /** הגדרות שעברו ולידציה. */
  (e: 'submit', settings: IndexSettings): void;
}>();

const DIALOG_TITLE = 'מפתח מותאם אישית';

/** 1…4 — הטווח שהדיאלוג „מפתח” של Word מתיר. */
const COLUMNS = Array.from(
  { length: INDEX_COLUMNS_MAX - INDEX_COLUMNS_MIN + 1 },
  (_, index) => INDEX_COLUMNS_MIN + index
);

const columns = ref<number>(DEFAULT_INDEX_COLUMNS);
const runIn = ref(false);
const firstFieldRef = ref<HTMLSelectElement | null>(null);

const canSubmit = computed(() => isValidIndexColumns(columns.value));
/**
 * בלם ולא הודעה שהמשתמש יפגוש: המקור הוא `<select>` שמאוכלס מ-`COLUMNS`, ולכן
 * הערך תמיד בטווח והשגיאה אינה ניתנת להצגה היום. הוא נשאר מפני שהוא היחיד
 * שיתפוס אם השדה יהפוך לקלט חופשי — והמנוע, שנמדד מקבל `\c 99` בהצלחה
 * וכותב קוד שדה שבור, לא יתפוס.
 */
const showError = computed(() => !canSubmit.value);

watch(
  () => props.isOpen,
  (open) => {
    if (!open) return;
    // נפתח על מה שבמסמך ולא על מה שנבחר בפתיחה הקודמת: דיאלוג שזוכר בחירה
    // ישנה היה מחזיר אותה לתוך המסמך באישור.
    columns.value = props.columns ?? DEFAULT_INDEX_COLUMNS;
    runIn.value = props.runIn;
    nextTick(() => firstFieldRef.value?.focus());
  }
);

function onSubmit(): void {
  if (!canSubmit.value) return;
  emit('submit', { columns: columns.value, runIn: runIn.value });
}
</script>

<style scoped>
.index-dialog {
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

.id-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-block-end: 1px solid var(--color-outline-variant);
  padding: 6px 8px 6px 12px;
  background: var(--color-surface-container-high);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
}

.id-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-on-surface);
}

.id-close-btn {
  background: none;
  border: none;
  font-size: 14px;
  color: var(--color-on-surface-variant);
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--radius-xs);
}

.id-close-btn:hover {
  background: var(--word-btn-hover);
  color: var(--color-error);
}

.id-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.id-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.id-label {
  width: 85px;
  font-size: 11px;
  color: var(--color-on-surface);
  flex-shrink: 0;
}

.id-select {
  padding: 4px 8px;
  border: 1px solid var(--color-outline-variant);
  border-radius: var(--radius-xs);
  background: var(--color-surface);
  color: var(--color-on-surface);
  font-family: var(--font-main);
  font-size: 12px;
  outline: none;
}

.id-select:focus {
  border-color: var(--word-blue);
  box-shadow: 0 0 0 1px var(--word-blue);
}

.id-check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--color-on-surface);
  cursor: pointer;
}

.id-error {
  margin: 0;
  font-size: 11px;
  color: var(--color-error);
}

.id-note {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--color-on-surface-variant);
}

.id-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  padding: 8px 12px;
  border-block-start: 1px solid var(--color-outline-variant);
  background: var(--color-surface-container-high);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
}

.id-btn {
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

.id-btn:hover:not(:disabled) {
  background: var(--word-btn-hover);
  border-color: var(--word-blue);
}

/* הטקסט על הכפתור הממולא הוא `--color-on-primary` ולא לבן קבוע — ראו
   ההסבר ב-LinkDialog.vue. */
.id-btn-primary {
  background: var(--word-blue);
  color: var(--color-on-primary);
  border-color: var(--word-blue);
}

.id-btn-primary:hover:not(:disabled) {
  background: var(--word-blue-dark);
}

.id-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
