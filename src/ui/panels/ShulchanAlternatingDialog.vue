<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="shalt-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="TITLE"
      tabindex="-1"
      @keydown.esc.stop="$emit('close')"
    >
      <div class="shalt-header">
        <span class="shalt-title">{{ TITLE }}</span>
        <button
          type="button"
          class="shalt-close-btn"
          data-tip-title="סגור"
          data-tip-shortcut="Esc"
          aria-label="סגור את עיצוב הטקסט המתחלף"
          @click="$emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="shalt-body">
        <p class="shalt-note">
          מדגיש דיבור-המתחיל בפסקאות המסומנות: מתחילת הפסקה עד תו הסיום,
          ואחר כך כל קטע שאחרי תו ההתחלה ועד תו הסיום הבא. אפשר לכתוב כמה
          תווים בכל שדה — כל אחד מהם הוא תוחם.
        </p>
        <div class="shalt-row">
          <label
            for="shalt-start"
            class="shalt-label"
          >תווי התחלה:</label>
          <input
            id="shalt-start"
            ref="firstFieldRef"
            v-model="startChar"
            class="shalt-char"
            type="text"
            aria-label="התווים שאחריהם מתחיל קטע מודגש"
            @keydown.enter="onSubmit"
          >
        </div>
        <div class="shalt-row">
          <label
            for="shalt-end"
            class="shalt-label"
          >תווי סיום:</label>
          <input
            id="shalt-end"
            v-model="endChar"
            class="shalt-char"
            type="text"
            aria-label="התווים שבהם מסתיים קטע מודגש"
            @keydown.enter="onSubmit"
          >
        </div>
      </div>

      <div class="shalt-footer">
        <button
          type="button"
          class="shalt-btn shalt-btn-primary"
          :disabled="!canSubmit"
          @pointerdown.prevent
          @click="onSubmit"
        >
          הדגש
        </button>
        <button
          type="button"
          class="shalt-btn"
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
 * „טקסט מתחלף” — תווי ההתחלה והסיום של הדגשת דיבור-המתחיל, כמו
 * FormTextAlternating בתבנית המקור (ברירות מחדל `:` ו-`.`). כל שדה הוא
 * **סט** תווים — כמו `MoveUntil` במקור — ולכן אין כאן מגבלת תו יחיד ואין
 * איסור על תו משותף לשני הסטים. הבחירה נזכרת בין הפעלות.
 */
import { computed, nextTick, ref, watch } from 'vue';
import {
  defaultAlternatingOptions,
  type AlternatingOptions,
} from '../../engine/shulchan/text-alternating';
import { useRememberedOptions } from '../../composables/useRememberedOptions';

const props = withDefaults(
  defineProps<{
    isOpen?: boolean;
    busy?: boolean;
  }>(),
  { isOpen: false, busy: false },
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'submit', options: AlternatingOptions): void;
}>();

const TITLE = 'טקסט מתחלף — הדגשת דיבור המתחיל';

const remembered = useRememberedOptions('text-alternating', defaultAlternatingOptions);
const startChar = ref(':');
const endChar = ref('.');
const firstFieldRef = ref<HTMLInputElement | null>(null);

watch(
  () => props.isOpen,
  (open) => {
    if (!open) return;
    void remembered.load().then((options) => {
      if (!props.isOpen) return;
      startChar.value = options.startChar;
      endChar.value = options.endChar;
    });
    nextTick(() => firstFieldRef.value?.focus());
  },
);

const canSubmit = computed(
  () => !props.busy && startChar.value.length > 0 && endChar.value.length > 0,
);

function current(): AlternatingOptions {
  return { startChar: startChar.value, endChar: endChar.value };
}

function onSubmit(): void {
  if (!canSubmit.value) return;
  void remembered.save(current());
  emit('submit', current());
}

function onCancel(): void {
  void remembered.save(current());
  emit('close');
}
</script>

<style scoped>
.shalt-dialog {
  position: fixed;
  top: 140px;
  inset-inline-start: 40px;
  z-index: 2000;
  background: var(--color-surface);
  border: 1px solid var(--color-outline);
  border-radius: var(--radius-sm);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
  width: 320px;
  font-family: var(--font-main);
  user-select: none;
}

.shalt-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-block-end: 1px solid var(--color-outline-variant);
  padding: 6px 8px 6px 12px;
  background: var(--color-surface-container-high);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
}

.shalt-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-on-surface);
}

.shalt-close-btn {
  background: none;
  border: none;
  font-size: 14px;
  color: var(--color-on-surface-variant);
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--radius-xs);
}

.shalt-close-btn:hover {
  background: var(--word-btn-hover);
  color: var(--color-error);
}

.shalt-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.shalt-note {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--color-on-surface-variant);
}

.shalt-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.shalt-label {
  font-size: 11px;
  color: var(--color-on-surface);
  flex-shrink: 0;
  width: 84px;
}

.shalt-char {
  padding: 4px 8px;
  border: 1px solid var(--color-outline-variant);
  border-radius: var(--radius-xs);
  background: var(--color-surface);
  color: var(--color-on-surface);
  font-family: var(--font-main);
  font-size: 12px;
  outline: none;
  width: 90px;
  text-align: center;
}

.shalt-char:focus {
  border-color: var(--word-blue);
  box-shadow: 0 0 0 1px var(--word-blue);
}

.shalt-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  padding: 8px 12px;
  border-block-start: 1px solid var(--color-outline-variant);
  background: var(--color-surface-container-high);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
}

.shalt-btn {
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

.shalt-btn:hover:not(:disabled) {
  background: var(--word-btn-hover);
  border-color: var(--word-blue);
}

.shalt-btn-primary {
  background: var(--word-blue);
  color: var(--color-on-primary);
  border-color: var(--word-blue);
}

.shalt-btn-primary:hover:not(:disabled) {
  background: var(--word-blue-dark);
}

.shalt-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
