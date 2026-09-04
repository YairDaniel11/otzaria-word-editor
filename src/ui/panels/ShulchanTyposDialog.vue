<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="shtypos-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="TITLE"
      tabindex="-1"
      @keydown.esc.stop="$emit('close')"
    >
      <div class="shtypos-header">
        <span class="shtypos-title">{{ TITLE }}</span>
        <button
          type="button"
          class="shtypos-close-btn"
          data-tip-title="סגור"
          data-tip-shortcut="Esc"
          aria-label="סגור את תיקון השגיאות המצויות"
          @click="$emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="shtypos-body">
        <p class="shtypos-note">
          התיקונים רצים על המסמך כולו. יש לסמן את סוגי השגיאות לתיקון:
        </p>
        <label
          v-for="option in TYPOS_OPTION_LABELS"
          :key="option.key"
          class="shtypos-check"
        >
          <input
            v-model="selected[option.key]"
            type="checkbox"
          >
          <span>{{ option.label }}</span>
        </label>
      </div>

      <div class="shtypos-footer">
        <button
          type="button"
          class="shtypos-btn shtypos-btn-primary"
          :disabled="!canSubmit"
          @pointerdown.prevent
          @click="onSubmit"
        >
          תקן
        </button>
        <button
          type="button"
          class="shtypos-btn"
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
 * „שגיאות מצויות” — בחירת סוגי התיקונים, כמו FormTyposCommon בתבנית המקור.
 * מציג בלבד: הכללים עצמם ב-engine/shulchan/typos.ts, והלשונית מריצה אותם.
 * הבחירה נזכרת בין הפעלות (useRememberedOptions), כמו קובץ ה-INI של המקור.
 */
import { computed, reactive, watch } from 'vue';
import {
  TYPOS_OPTION_LABELS,
  defaultTyposOptions,
  type TyposOptions,
} from '../../engine/shulchan/typos';
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
  (e: 'submit', options: TyposOptions): void;
}>();

const TITLE = 'תיקון שגיאות מצויות';

const remembered = useRememberedOptions('typos', defaultTyposOptions);
const selected = reactive<TyposOptions>(defaultTyposOptions());

watch(
  () => props.isOpen,
  (open) => {
    if (!open) return;
    void remembered.load().then((options) => {
      if (props.isOpen) Object.assign(selected, options);
    });
  },
);

const canSubmit = computed(
  () => !props.busy && Object.values(selected).some((value) => value === true),
);

function onSubmit(): void {
  if (!canSubmit.value) return;
  void remembered.save({ ...selected });
  emit('submit', { ...selected });
}

/** גם ביטול שומר — כמו במקור, מה שהמשתמש סימן אינו נעלם בסגירה. */
function onCancel(): void {
  void remembered.save({ ...selected });
  emit('close');
}
</script>

<style scoped>
.shtypos-dialog {
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

.shtypos-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-block-end: 1px solid var(--color-outline-variant);
  padding: 6px 8px 6px 12px;
  background: var(--color-surface-container-high);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
}

.shtypos-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-on-surface);
}

.shtypos-close-btn {
  background: none;
  border: none;
  font-size: 14px;
  color: var(--color-on-surface-variant);
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--radius-xs);
}

.shtypos-close-btn:hover {
  background: var(--word-btn-hover);
  color: var(--color-error);
}

.shtypos-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.shtypos-note {
  margin: 0 0 4px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--color-on-surface-variant);
}

.shtypos-check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-on-surface);
  cursor: pointer;
}

.shtypos-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  padding: 8px 12px;
  border-block-start: 1px solid var(--color-outline-variant);
  background: var(--color-surface-container-high);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
}

.shtypos-btn {
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

.shtypos-btn:hover:not(:disabled) {
  background: var(--word-btn-hover);
  border-color: var(--word-blue);
}

.shtypos-btn-primary {
  background: var(--word-blue);
  color: var(--color-on-primary);
  border-color: var(--word-blue);
}

.shtypos-btn-primary:hover:not(:disabled) {
  background: var(--word-blue-dark);
}

.shtypos-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
