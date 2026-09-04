<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="shcrop-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="TITLE"
      tabindex="-1"
      @keydown.esc.stop="onCancel"
    >
      <div class="shcrop-header">
        <span class="shcrop-title">{{ TITLE }}</span>
        <button
          type="button"
          class="shcrop-close-btn"
          data-tip-title="סגור"
          data-tip-shortcut="Esc"
          aria-label="סגור את סימני החיתוך"
          @click="onCancel"
        >
          ✕
        </button>
      </div>

      <div class="shcrop-body">
        <p class="shcrop-note">
          הדף והשוליים של כל מקטע יוגדלו במידה שנבחרה, ובפינות יצוירו סימני חיתוך.
          הסימנים מוצגים בעורך, בהדפסה ובייצוא ל-PDF; בקובץ ה-Word נשמר רק הדף המוגדל.
        </p>
        <label class="shcrop-row">
          <span>רוחב סימני החיתוך במילימטרים ({{ CROP_MARKS_MIN_MM }}–{{ CROP_MARKS_MAX_MM }})</span>
          <input
            v-model.number="mm"
            type="number"
            :min="CROP_MARKS_MIN_MM"
            :max="CROP_MARKS_MAX_MM"
            step="1"
            class="shcrop-num"
          >
        </label>
        <p
          v-if="existingMm !== null"
          class="shcrop-note shcrop-note--warn"
        >
          במסמך זה כבר יש סימני חיתוך של {{ existingMm }} מ"מ. „הסר” מחזיר את הדף לגודלו המקורי.
        </p>
      </div>

      <div class="shcrop-footer">
        <button
          type="button"
          class="shcrop-btn shcrop-btn-primary"
          :disabled="busy || existingMm !== null || !isValidCropMm(mm)"
          @pointerdown.prevent
          @click="onAdd"
        >
          הוסף סימני חיתוך
        </button>
        <button
          type="button"
          class="shcrop-btn"
          :disabled="busy || existingMm === null"
          @pointerdown.prevent
          @click="$emit('remove')"
        >
          הסר סימני חיתוך
        </button>
        <button
          type="button"
          class="shcrop-btn"
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
 * „סימני חיתוך” — המידה במ"מ (ה-InputBox של המקור, בטווח 5-50), ושני
 * הכפתורים של תפריט המקור: הוספה והסרה. הלוגיקה ב-engine/shulchan/crop-marks.ts.
 */
import { ref, watch } from 'vue';
import {
  CROP_MARKS_MAX_MM,
  CROP_MARKS_MIN_MM,
  DEFAULT_CROP_MARKS_MM,
  isValidCropMm,
} from '../../engine/shulchan/crop-marks';
import { useRememberedOptions } from '../../composables/useRememberedOptions';

const props = withDefaults(
  defineProps<{
    isOpen?: boolean;
    busy?: boolean;
    /** המידה של הסימנים הקיימים במסמך, או `null` כשאין. */
    existingMm?: number | null;
  }>(),
  { isOpen: false, busy: false, existingMm: null },
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'add', mm: number): void;
  (e: 'remove'): void;
}>();

const TITLE = 'סימני חיתוך';

const remembered = useRememberedOptions('crop-marks', () => ({ mm: DEFAULT_CROP_MARKS_MM }));
const mm = ref(DEFAULT_CROP_MARKS_MM);

watch(
  () => props.isOpen,
  (open) => {
    if (!open) return;
    void remembered.load().then((options) => {
      if (props.isOpen && isValidCropMm(options.mm)) mm.value = options.mm;
    });
  },
);

function onAdd(): void {
  if (props.busy || !isValidCropMm(mm.value)) return;
  void remembered.save({ mm: mm.value });
  emit('add', mm.value);
}

function onCancel(): void {
  if (isValidCropMm(mm.value)) void remembered.save({ mm: mm.value });
  emit('close');
}
</script>

<style scoped>
.shcrop-dialog {
  position: fixed;
  top: 140px;
  inset-inline-start: 40px;
  z-index: 2000;
  background: var(--color-surface);
  border: 1px solid var(--color-outline);
  border-radius: var(--radius-sm);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
  width: 380px;
  font-family: var(--font-main);
  user-select: none;
}

.shcrop-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-block-end: 1px solid var(--color-outline-variant);
  padding: 6px 8px 6px 12px;
  background: var(--color-surface-container-high);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
}

.shcrop-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-on-surface);
}

.shcrop-close-btn {
  background: none;
  border: none;
  font-size: 14px;
  color: var(--color-on-surface-variant);
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--radius-xs);
}

.shcrop-close-btn:hover {
  background: var(--word-btn-hover);
  color: var(--color-error);
}

.shcrop-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.shcrop-note {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--color-on-surface-variant);
}

.shcrop-note--warn {
  color: var(--color-on-surface);
}

.shcrop-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-on-surface);
}

.shcrop-num {
  width: 64px;
  padding: 2px 4px;
  font-size: 12px;
  font-family: var(--font-main);
  border: 1px solid var(--color-outline-variant);
  border-radius: var(--radius-xs);
  background: var(--color-surface);
  color: var(--color-on-surface);
}

.shcrop-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  padding: 8px 12px;
  border-block-start: 1px solid var(--color-outline-variant);
  background: var(--color-surface-container-high);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
}

.shcrop-btn {
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

.shcrop-btn:hover:not(:disabled) {
  background: var(--word-btn-hover);
  border-color: var(--word-blue);
}

.shcrop-btn-primary {
  background: var(--word-blue);
  color: var(--color-on-primary);
  border-color: var(--word-blue);
}

.shcrop-btn-primary:hover:not(:disabled) {
  background: var(--word-blue-dark);
}

.shcrop-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
