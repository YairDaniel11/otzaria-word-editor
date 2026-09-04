<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="shfw-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="TITLE"
      tabindex="-1"
      @keydown.esc.stop="$emit('close')"
    >
      <div class="shfw-header">
        <span class="shfw-title">{{ TITLE }}</span>
        <button
          type="button"
          class="shfw-close-btn"
          data-tip-title="סגור"
          data-tip-shortcut="Esc"
          aria-label="סגור את עיצוב המילה הראשונה"
          @click="$emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="shfw-body">
        <p class="shfw-note">
          מעצב את המילה הראשונה של כל פסקה מסומנת. הגודל נגזר מגופן גוף
          הפסקה, ולכן פסקאות בגדלים שונים נשארות פרופורציונליות.
        </p>

        <div class="shfw-row">
          <label
            for="shfw-size-mode"
            class="shfw-label"
          >גודל:</label>
          <select
            id="shfw-size-mode"
            v-model="sizeMode"
            class="shfw-select"
          >
            <option value="percent">הגדלה באחוזים מגוף הפסקה</option>
            <option value="fixed">גודל מוחלט בנקודות</option>
            <option value="none">ללא שינוי</option>
          </select>
        </div>

        <div class="shfw-row">
          <label
            for="shfw-style"
            class="shfw-label"
          >רק בסגנון:</label>
          <select
            id="shfw-style"
            v-model="styleId"
            class="shfw-select"
            aria-label="הגבלת העיצוב לפסקאות בסגנון אחד בלבד"
          >
            <option :value="null">כל הפסקאות שבבחירה</option>
            <option
              v-for="style in styles"
              :key="style.id"
              :value="style.id"
            >
              {{ style.label }}
            </option>
          </select>
        </div>

        <div
          v-if="sizeMode === 'percent'"
          class="shfw-row"
        >
          <label
            for="shfw-percent"
            class="shfw-label"
          >אחוז ההגדלה:</label>
          <input
            id="shfw-percent"
            v-model="percentText"
            class="shfw-number"
            type="number"
            min="1"
            max="500"
            step="5"
            aria-label="אחוז ההגדלה של המילה הראשונה מעל גוף הפסקה"
            @keydown.enter="onApply"
          >
          <span class="shfw-unit">%</span>
        </div>

        <div
          v-if="sizeMode === 'fixed'"
          class="shfw-row"
        >
          <label
            for="shfw-fixed"
            class="shfw-label"
          >גודל בנקודות:</label>
          <input
            id="shfw-fixed"
            v-model="fixedText"
            class="shfw-number"
            type="number"
            min="5"
            max="100"
            step="0.5"
            aria-label="גודל המילה הראשונה בנקודות"
            @keydown.enter="onApply"
          >
          <span class="shfw-unit">נק'</span>
        </div>

        <label class="shfw-check">
          <input
            v-model="bold"
            type="checkbox"
          >
          <span>מודגש</span>
        </label>
        <label class="shfw-check">
          <input
            v-model="italic"
            type="checkbox"
          >
          <span>נטוי</span>
        </label>
        <label class="shfw-check">
          <input
            v-model="underline"
            type="checkbox"
          >
          <span>קו תחתון</span>
        </label>
        <label class="shfw-check">
          <input
            v-model="raiseBaseline"
            type="checkbox"
          >
          <span>יישור כלפי מעלה — ראש המילה מתיישר עם ראש השורה</span>
        </label>
        <label class="shfw-check">
          <input
            v-model="skipHeadings"
            type="checkbox"
          >
          <span>דלג על כותרות ועל פסקאות ממורכזות</span>
        </label>

        <p
          v-if="showError"
          class="shfw-error"
          role="alert"
        >
          {{ ERROR_HINT }}
        </p>
      </div>

      <div class="shfw-footer">
        <button
          type="button"
          class="shfw-btn shfw-btn-primary"
          :disabled="!canApply"
          @pointerdown.prevent
          @click="onApply"
        >
          עצב
        </button>
        <button
          type="button"
          class="shfw-btn"
          :disabled="busy"
          data-tip-title="ניקוי עיצוב המילה הראשונה בפסקאות המסומנות"
          @pointerdown.prevent
          @click="$emit('remove')"
        >
          הסר עיצוב
        </button>
        <button
          type="button"
          class="shfw-btn"
          @pointerdown.prevent
          @click="onCancel"
        >
          ביטול
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * „עיצוב מילה ראשונה” — האפשרויות של FormatFirstWord + FormDinami מהתבנית
 * המקורית, במסלול העיצוב הישיר (ראו engine/shulchan/first-word.ts על ההבדל
 * מ„לפי סגנון” — אין יצירת סגנונות במנוע). „גודל קבוע” של המקור פירושו
 * גודל הגוף בלי הגדלה; כאן הוא נקרא „גודל מוחלט בנקודות” כדי לא להתבלבל.
 * האפשרויות נזכרות בין הפעלות, כמו `GetSavedSetting` ב-FormDinami.
 */
import { computed, ref, watch } from 'vue';
import {
  defaultFirstWordOptions,
  type FirstWordOptions,
} from '../../engine/shulchan/first-word';
import { useRememberedOptions } from '../../composables/useRememberedOptions';

const props = withDefaults(
  defineProps<{
    isOpen?: boolean;
    busy?: boolean;
    /** סגנונות הפסקה של המסמך, לסינון „רק בסגנון” — מגלריית הסגנונות. */
    styles?: readonly { id: string; label: string }[];
  }>(),
  { isOpen: false, busy: false, styles: () => [] },
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'apply', options: FirstWordOptions): void;
  (e: 'remove'): void;
}>();

const TITLE = 'עיצוב מילה ראשונה';
const ERROR_HINT = 'אחוז ההגדלה: מספר בין 1 ל-500; גודל מוחלט: 5 עד 100 נקודות';

const remembered = useRememberedOptions('first-word', defaultFirstWordOptions);
const sizeMode = ref<FirstWordOptions['sizeMode']>('percent');
const percentText = ref('30');
const fixedText = ref('18');
const bold = ref(true);
const italic = ref(false);
const underline = ref(false);
const raiseBaseline = ref(false);
const skipHeadings = ref(true);
const styleId = ref<string | null>(null);

watch(
  () => props.isOpen,
  (open) => {
    if (!open) return;
    void remembered.load().then((options) => {
      if (!props.isOpen) return;
      sizeMode.value = options.sizeMode;
      percentText.value = String(options.sizePercent);
      fixedText.value = String(options.fixedSizePt);
      bold.value = options.bold;
      italic.value = options.italic;
      underline.value = options.underline;
      raiseBaseline.value = options.raiseBaseline;
      skipHeadings.value = options.skipHeadings;
      // סגנון שנזכר ממסמך אחר ואינו במסמך הזה — חוזר ל„כל הפסקאות”.
      styleId.value = props.styles.some((style) => style.id === options.styleId) ? options.styleId : null;
    });
  },
);

const percent = computed(() => Number(percentText.value));
const fixed = computed(() => Number(fixedText.value));

const isValid = computed(() => {
  if (sizeMode.value === 'percent') return Number.isFinite(percent.value) && percent.value >= 1 && percent.value <= 500;
  if (sizeMode.value === 'fixed') return Number.isFinite(fixed.value) && fixed.value >= 5 && fixed.value <= 100;
  return true;
});

const showError = computed(() => !isValid.value);
const canApply = computed(() => isValid.value && !props.busy);

function current(): FirstWordOptions {
  return {
    sizeMode: sizeMode.value,
    sizePercent: percent.value,
    fixedSizePt: fixed.value,
    bold: bold.value,
    italic: italic.value,
    underline: underline.value,
    raiseBaseline: raiseBaseline.value,
    skipHeadings: skipHeadings.value,
    styleId: styleId.value,
  };
}

function onApply(): void {
  if (!canApply.value) return;
  const options = current();
  void remembered.save(options);
  emit('apply', options);
}

/** ביטול שומר רק מה שתקין — ערך פסול בשדה מספרי אינו נזכר. */
function onCancel(): void {
  if (isValid.value) void remembered.save(current());
  emit('close');
}
</script>

<style scoped>
.shfw-dialog {
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

.shfw-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-block-end: 1px solid var(--color-outline-variant);
  padding: 6px 8px 6px 12px;
  background: var(--color-surface-container-high);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
}

.shfw-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-on-surface);
}

.shfw-close-btn {
  background: none;
  border: none;
  font-size: 14px;
  color: var(--color-on-surface-variant);
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--radius-xs);
}

.shfw-close-btn:hover {
  background: var(--word-btn-hover);
  color: var(--color-error);
}

.shfw-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.shfw-note {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--color-on-surface-variant);
}

.shfw-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.shfw-label {
  font-size: 11px;
  color: var(--color-on-surface);
  flex-shrink: 0;
  width: 84px;
}

.shfw-unit {
  font-size: 11px;
  color: var(--color-on-surface-variant);
}

.shfw-select,
.shfw-number {
  padding: 4px 8px;
  border: 1px solid var(--color-outline-variant);
  border-radius: var(--radius-xs);
  background: var(--color-surface);
  color: var(--color-on-surface);
  font-family: var(--font-main);
  font-size: 12px;
  outline: none;
}

.shfw-number {
  width: 90px;
}

.shfw-select:focus,
.shfw-number:focus {
  border-color: var(--word-blue);
  box-shadow: 0 0 0 1px var(--word-blue);
}

.shfw-check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-on-surface);
  cursor: pointer;
}

.shfw-error {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--color-error);
}

.shfw-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  padding: 8px 12px;
  border-block-start: 1px solid var(--color-outline-variant);
  background: var(--color-surface-container-high);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
}

.shfw-btn {
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

.shfw-btn:hover:not(:disabled) {
  background: var(--word-btn-hover);
  border-color: var(--word-blue);
}

.shfw-btn-primary {
  background: var(--word-blue);
  color: var(--color-on-primary);
  border-color: var(--word-blue);
}

.shfw-btn-primary:hover:not(:disabled) {
  background: var(--word-blue-dark);
}

.shfw-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
