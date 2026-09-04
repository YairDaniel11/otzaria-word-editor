<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="shunc-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="TITLE"
      tabindex="-1"
      @keydown.esc.stop="$emit('close')"
    >
      <div class="shunc-header">
        <span class="shunc-title">{{ TITLE }}</span>
        <button
          type="button"
          class="shunc-close-btn"
          data-tip-title="סגור"
          data-tip-shortcut="Esc"
          aria-label="סגור את רשימת הסוגריים הלא סגורים"
          @click="$emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="shunc-body">
        <div class="shunc-row">
          <label
            for="shunc-mode"
            class="shunc-label"
          >אופן הסריקה:</label>
          <select
            id="shunc-mode"
            class="shunc-select"
            :value="mode"
            :disabled="busy"
            aria-label="האם כל פסקה נבדקת לעצמה, או שהמסמך כולו נבדק כיחידה אחת"
            @change="onModeChange"
          >
            <option
              v-for="option in UNCLOSED_SCAN_MODE_LABELS"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </div>
        <p
          v-if="findings.length === 0"
          class="shunc-note"
        >
          הסריקה הושלמה — לא נמצאו סוגריים לא מאוזנים.
        </p>
        <template v-else>
          <p class="shunc-note">
            נמצאו {{ findings.length }} ממצאים. לחיצה על ממצא קופצת אליו במסמך:
          </p>
          <button
            v-for="(finding, index) in findings"
            :key="index"
            type="button"
            class="shunc-item"
            @click="$emit('reveal', index)"
          >
            <span class="shunc-kind">{{ PAREN_FINDING_LABELS[finding.kind] }}</span>
            <span
              class="shunc-excerpt"
              dir="rtl"
            >{{ finding.excerpt }}</span>
          </button>
        </template>
      </div>

      <div class="shunc-footer">
        <button
          type="button"
          class="shunc-btn"
          :disabled="busy"
          @pointerdown.prevent
          @click="$emit('rescan')"
        >
          סרוק שוב
        </button>
        <button
          type="button"
          class="shunc-btn"
          @pointerdown.prevent
          @click="$emit('close')"
        >
          סגור
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * „סוגריים לא סגורים” — רשימת הממצאים של הסריקה, במקום ה„הבא/הבא” של
 * הטופס המקורי: הכול נגלה מראש, ולחיצה קופצת לממצא. בורר המצב הוא שני
 * מצבי `Search(entireDocument)` של המקור; שינויו סורק מחדש מיד, והלשונית
 * — שמחזיקה את המצב — זוכרת אותו בין הפעלות.
 */
import {
  PAREN_FINDING_LABELS,
  UNCLOSED_SCAN_MODE_LABELS,
  type ParenFinding,
  type UnclosedScanMode,
} from '../../engine/shulchan/unclosed-parens';

withDefaults(
  defineProps<{
    isOpen?: boolean;
    busy?: boolean;
    findings?: readonly ParenFinding[];
    mode?: UnclosedScanMode;
  }>(),
  { isOpen: false, busy: false, findings: () => [], mode: 'paragraph' },
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'rescan'): void;
  (e: 'reveal', index: number): void;
  (e: 'update:mode', mode: UnclosedScanMode): void;
}>();

const TITLE = 'סוגריים לא סגורים';

function onModeChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  emit('update:mode', value === 'document' ? 'document' : 'paragraph');
  emit('rescan');
}
</script>

<style scoped>
.shunc-dialog {
  position: fixed;
  top: 140px;
  inset-inline-start: 40px;
  z-index: 2000;
  background: var(--color-surface);
  border: 1px solid var(--color-outline);
  border-radius: var(--radius-sm);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
  width: 420px;
  font-family: var(--font-main);
  user-select: none;
}

.shunc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-block-end: 1px solid var(--color-outline-variant);
  padding: 6px 8px 6px 12px;
  background: var(--color-surface-container-high);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
}

.shunc-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-on-surface);
}

.shunc-close-btn {
  background: none;
  border: none;
  font-size: 14px;
  color: var(--color-on-surface-variant);
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--radius-xs);
}

.shunc-close-btn:hover {
  background: var(--word-btn-hover);
  color: var(--color-error);
}

.shunc-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 320px;
  overflow-y: auto;
}

.shunc-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-block-end: 6px;
}

.shunc-label {
  font-size: 11px;
  color: var(--color-on-surface);
  flex-shrink: 0;
}

.shunc-select {
  padding: 4px 8px;
  border: 1px solid var(--color-outline-variant);
  border-radius: var(--radius-xs);
  background: var(--color-surface);
  color: var(--color-on-surface);
  font-family: var(--font-main);
  font-size: 12px;
  outline: none;
}

.shunc-select:focus {
  border-color: var(--word-blue);
  box-shadow: 0 0 0 1px var(--word-blue);
}

.shunc-note {
  margin: 0 0 4px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--color-on-surface-variant);
}

.shunc-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  text-align: start;
  font-family: var(--font-main);
  font-size: 12px;
  color: var(--color-on-surface);
  background: none;
  border: 1px solid var(--color-outline-variant);
  border-radius: var(--radius-xs);
  padding: 5px 8px;
  cursor: pointer;
}

.shunc-item:hover {
  background: var(--word-btn-hover);
  border-color: var(--word-blue);
}

.shunc-kind {
  flex-shrink: 0;
  font-weight: 600;
  color: var(--color-error);
}

.shunc-excerpt {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shunc-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  padding: 8px 12px;
  border-block-start: 1px solid var(--color-outline-variant);
  background: var(--color-surface-container-high);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
}

.shunc-btn {
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

.shunc-btn:hover:not(:disabled) {
  background: var(--word-btn-hover);
  border-color: var(--word-blue);
}

.shunc-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
