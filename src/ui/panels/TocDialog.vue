<template>
  <!--
    Teleport ולא רינדור במקום — אותו טעם בדיוק כמו ב-BookmarkDialog.vue:
    `.word-ribbon-body` מוגדר `overflow-y: hidden`, ודיאלוג שנפתח מתוך לשונית
    נחתך בגובה הרצועה.
  -->
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="toc-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="DIALOG_TITLE"
      @keydown.esc.stop="$emit('close')"
    >
      <div class="td-header">
        <span class="td-title">{{ DIALOG_TITLE }}</span>
        <button
          type="button"
          class="td-close-btn"
          data-tip-title="סגור"
          data-tip-shortcut="Esc"
          aria-label="סגור את הגדרות תוכן העניינים"
          @click="$emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="td-body">
        <div class="td-row">
          <label
            for="td-from"
            class="td-label"
          >מרמת כותרת:</label>
          <select
            id="td-from"
            ref="firstFieldRef"
            v-model.number="from"
            class="td-select"
            aria-label="הרמה הראשונה שתיכלל בתוכן העניינים"
          >
            <option
              v-for="level in LEVELS"
              :key="level"
              :value="level"
            >
              {{ level }}
            </option>
          </select>

          <label
            for="td-to"
            class="td-label td-label--inline"
          >עד רמה:</label>
          <select
            id="td-to"
            v-model.number="to"
            class="td-select"
            aria-label="הרמה האחרונה שתיכלל בתוכן העניינים"
          >
            <option
              v-for="level in LEVELS"
              :key="level"
              :value="level"
            >
              {{ level }}
            </option>
          </select>
        </div>

        <p
          v-if="showError"
          class="td-error"
          role="alert"
        >
          {{ TOC_LEVELS_HINT }}
        </p>

        <label class="td-check">
          <input
            v-model="asLinks"
            type="checkbox"
          >
          <span>הערכים בתוכן העניינים יהיו קישורים</span>
        </label>

        <!--
          שתי ההגדרות האלה הן כל מה שהמנוע באמת מיישם. „מנהיג נקודות” ו„הצג
          מספרי עמודים” אינם כאן: הראשון נבלע בשקט, והשני הוא מתג חד-כיווני
          שאי אפשר להדליק בחזרה. ההנמקה, כולל המדידה, ב-engine/toc.ts.
        -->
        <p
          class="td-note"
          role="note"
        >
          ההגדרות חלות על תוכן העניינים שבמסמך, והטבלה נבנית מחדש מיד לאחריהן.
        </p>
      </div>

      <div class="td-footer">
        <button
          type="button"
          class="td-btn td-btn-primary"
          :disabled="!canSubmit"
          @pointerdown.prevent
          @click="onSubmit"
        >
          אישור
        </button>
        <button
          type="button"
          class="td-btn"
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
 * „תוכן עניינים מותאם אישית” — התרגום של הדיאלוג שנפתח מ„הפניות → תוכן
 * עניינים → תוכן עניינים מותאם אישית” ב-Word העברי.
 *
 * מציג בלבד: אינו קורא למנוע. הוולידציה כאן היא **תצוגתית**, וההכרעה עצמה
 * היא `normalizeTocLevels` ב-engine/toc.ts — אותה פונקציה שהמודול קורא לה
 * לפני השליחה. שני נוסחים לאותה שאלה היו מאפשרים דיאלוג שמאשר טווח שהמודול
 * ידחה, כלומר כפתור שנלחץ ולא קורה כלום. זו התבנית של BookmarkDialog.vue
 * מול `normalizeBookmarkName`, ומאותו טעם.
 *
 * הדיאלוג הזה **נסגר** באישור, בשונה מדיאלוג הסימניות: יש כאן פעולה אחת,
 * ואין שום רצף שממשיכים בו אחריה.
 *
 * מה שאין כאן — „מנהיג נקודות” ו„הצג מספרי עמודים” — אינו השמטה אלא ממצא:
 * שניהם מתקבלים במנוע עם `success: true` ואינם משנים דבר, ומספרי העמודים
 * הם בנוסף מתג שאי אפשר להחזיר אחורה. ההנמקה המלאה ב-engine/toc.ts.
 */
import { computed, nextTick, ref, watch } from 'vue';
import {
  TOC_LEVELS_HINT,
  TOC_LEVEL_MAX,
  TOC_LEVEL_MIN,
  normalizeTocLevels,
  type TocSettings,
} from '../../engine/toc';

const props = withDefaults(
  defineProps<{
    isOpen?: boolean;
    /** ההגדרות שנקראו מהמסמך, או `null` כשהמנוע לא הצהיר על טווח. */
    levels?: { from: number; to: number } | null;
    hyperlinks?: boolean;
  }>(),
  { isOpen: false, levels: null, hyperlinks: false }
);

const emit = defineEmits<{
  (e: 'close'): void;
  /** הגדרות שעברו ולידציה. */
  (e: 'submit', settings: TocSettings): void;
}>();

const DIALOG_TITLE = 'תוכן עניינים מותאם אישית';

/** 1…9 — הטווח ש-Word מתיר במתג `\o`. */
const LEVELS = Array.from(
  { length: TOC_LEVEL_MAX - TOC_LEVEL_MIN + 1 },
  (_, index) => TOC_LEVEL_MIN + index
);

/**
 * ברירת המחדל כשהמסמך אינו מצהיר על טווח: `1-3`, בדיוק כמו ב-Word. טבלה
 * שנוצרה כאן נכתבת כ-`TOC \h` בלי `\o` בכלל, ולכן זה המצב הרגיל ולא קצה.
 */
const DEFAULT_LEVELS = { from: 1, to: 3 } as const;

const from = ref<number>(DEFAULT_LEVELS.from);
const to = ref<number>(DEFAULT_LEVELS.to);
const asLinks = ref(false);
const firstFieldRef = ref<HTMLSelectElement | null>(null);

const normalized = computed(() => normalizeTocLevels(from.value, to.value));
const canSubmit = computed(() => normalized.value !== null);
/** השגיאה מוצגת רק על צירוף פסול בפועל — בחירה משני התפריטים אינה „הקלדה”. */
const showError = computed(() => normalized.value === null);

watch(
  () => props.isOpen,
  (open) => {
    if (!open) return;
    // נפתח על מה שבמסמך ולא על מה שנבחר בפתיחה הקודמת: דיאלוג שזוכר בחירה
    // ישנה היה מציג הגדרות של טבלה אחרת.
    from.value = props.levels?.from ?? DEFAULT_LEVELS.from;
    to.value = props.levels?.to ?? DEFAULT_LEVELS.to;
    asLinks.value = props.hyperlinks;
    nextTick(() => firstFieldRef.value?.focus());
  }
);

function onSubmit(): void {
  const levels = normalized.value;
  if (levels === null) return;
  emit('submit', { levels, hyperlinks: asLinks.value });
}
</script>

<style scoped>
.toc-dialog {
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

.td-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-block-end: 1px solid var(--color-outline-variant);
  padding: 6px 8px 6px 12px;
  background: var(--color-surface-container-high);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
}

.td-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-on-surface);
}

.td-close-btn {
  background: none;
  border: none;
  font-size: 14px;
  color: var(--color-on-surface-variant);
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--radius-xs);
}

.td-close-btn:hover {
  background: var(--word-btn-hover);
  color: var(--color-error);
}

.td-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.td-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.td-label {
  font-size: 11px;
  color: var(--color-on-surface);
  flex-shrink: 0;
}

.td-label--inline {
  margin-inline-start: 8px;
}

.td-select {
  padding: 4px 8px;
  border: 1px solid var(--color-outline-variant);
  border-radius: var(--radius-xs);
  background: var(--color-surface);
  color: var(--color-on-surface);
  font-family: var(--font-main);
  font-size: 12px;
  outline: none;
}

.td-select:focus {
  border-color: var(--word-blue);
  box-shadow: 0 0 0 1px var(--word-blue);
}

.td-check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--color-on-surface);
  cursor: pointer;
}

.td-note {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--color-on-surface-variant);
}

.td-error {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--color-error);
}

.td-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  padding: 8px 12px;
  border-block-start: 1px solid var(--color-outline-variant);
  background: var(--color-surface-container-high);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
}

.td-btn {
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

.td-btn:hover:not(:disabled) {
  background: var(--word-btn-hover);
  border-color: var(--word-blue);
}

/* הטקסט על הכפתור הממולא הוא `--color-on-primary` ולא לבן קבוע — ראו
   ההסבר ב-LinkDialog.vue. */
.td-btn-primary {
  background: var(--word-blue);
  color: var(--color-on-primary);
  border-color: var(--word-blue);
}

.td-btn-primary:hover:not(:disabled) {
  background: var(--word-blue-dark);
}

.td-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
