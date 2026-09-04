<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="shred-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="TITLE"
      tabindex="-1"
      @keydown.esc.stop="onCancel"
    >
      <div class="shred-header">
        <span class="shred-title">{{ TITLE }}</span>
        <button
          type="button"
          class="shred-close-btn"
          data-tip-title="סגור"
          data-tip-shortcut="Esc"
          aria-label="סגור את צמצום המסמך"
          @click="onCancel"
        >
          ✕
        </button>
      </div>

      <div
        v-if="progress"
        class="shred-body"
      >
        <p class="shred-note">
          {{ progress }}
        </p>
        <p class="shred-note">
          הצמצום רץ על המסמך כולו. אפשר לעצור — מה שכבר צומצם נשאר, וניתן לבטל ב-Ctrl+Z.
        </p>
      </div>

      <div
        v-else
        class="shred-body"
      >
        <p class="shred-note">
          המסמך יצומצם בסבבים עד שיגיע ליעד העמודים. בכל סבב כל ערוץ מסומן מצטמצם ב-10%
          (הגופן — בנקודה), ולפי התדירות שנבחרה: „1” = בכל סבב, „2” = כל סבב שני.
        </p>
        <label class="shred-row">
          <span>יעד עמודים</span>
          <input
            v-model.number="form.targetPages"
            type="number"
            min="1"
            step="1"
            class="shred-num"
          >
        </label>
        <label class="shred-row">
          <input
            v-model="use.margins"
            type="checkbox"
          >
          <span>שוליים (עד 1 ס"מ) — כל</span>
          <input
            v-model.number="form.marginsEvery"
            type="number"
            min="1"
            max="10"
            class="shred-num shred-num--small"
            :disabled="!use.margins"
          >
          <span>סבבים</span>
        </label>
        <label class="shred-row">
          <input
            v-model="use.paraSpace"
            type="checkbox"
          >
          <span>ריווח בין פסקאות — כל</span>
          <input
            v-model.number="form.paraSpaceEvery"
            type="number"
            min="1"
            max="10"
            class="shred-num shred-num--small"
            :disabled="!use.paraSpace"
          >
          <span>סבבים</span>
        </label>
        <label class="shred-row">
          <input
            v-model="use.lineSpace"
            type="checkbox"
          >
          <span>מרווח בין שורות (עד 12 נק') — כל</span>
          <input
            v-model.number="form.lineSpaceEvery"
            type="number"
            min="1"
            max="10"
            class="shred-num shred-num--small"
            :disabled="!use.lineSpace"
          >
          <span>סבבים</span>
        </label>
        <label class="shred-row">
          <input
            v-model="use.font"
            type="checkbox"
          >
          <span>גופן — כל</span>
          <input
            v-model.number="form.fontEvery"
            type="number"
            min="1"
            max="10"
            class="shred-num shred-num--small"
            :disabled="!use.font"
          >
          <span>סבבים, לא פחות מ-</span>
          <input
            v-model.number="form.fontLimitPt"
            type="number"
            min="5"
            max="99"
            class="shred-num shred-num--small"
            :disabled="!use.font"
          >
          <span>נק'</span>
        </label>
        <p class="shred-note shred-note--warn">
          ספירת העמודים היא של העורך ולא של Word, ונמדדת אחרי כל שינוי מהעמודים המוצגים — ייתכן פער של עמוד.
        </p>
      </div>

      <div class="shred-footer">
        <button
          v-if="progress"
          type="button"
          class="shred-btn shred-btn-primary"
          @pointerdown.prevent
          @click="$emit('stop')"
        >
          עצור
        </button>
        <template v-else>
          <button
            type="button"
            class="shred-btn shred-btn-primary"
            :disabled="!canSubmit"
            @pointerdown.prevent
            @click="onSubmit"
          >
            צמצם
          </button>
          <button
            type="button"
            class="shred-btn"
            @pointerdown.prevent
            @click="onCancel"
          >
            ביטול
          </button>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * „צמצום מסמך” — היעד והערוצים, כמו FormDocReduction בתבנית המקור; ובזמן
 * הריצה — ההתקדמות וכפתור „עצור”, כמו FormRunning. הלוגיקה ב-
 * engine/shulchan/doc-reduction.ts; הבחירה נזכרת בין הפעלות.
 */
import { computed, reactive, watch } from 'vue';
import { defaultDocReductionOptions, type DocReductionOptions } from '../../engine/shulchan/doc-reduction';
import { useRememberedOptions } from '../../composables/useRememberedOptions';

const props = withDefaults(
  defineProps<{
    isOpen?: boolean;
    busy?: boolean;
    /** טקסט ההתקדמות בזמן ריצה; `null` = הטופס. */
    progress?: string | null;
  }>(),
  { isOpen: false, busy: false, progress: null },
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'submit', options: DocReductionOptions): void;
  (e: 'stop'): void;
}>();

const TITLE = 'צמצום מסמך';

const remembered = useRememberedOptions('doc-reduction', defaultDocReductionOptions);
const form = reactive<DocReductionOptions>(defaultDocReductionOptions());
/** ערוץ כבוי נשמר כ-`0` בתדירות (כמו במקור); בטופס הוא תיבת סימון. */
const use = reactive({ margins: true, paraSpace: true, lineSpace: true, font: true });

function applyLoaded(options: DocReductionOptions): void {
  use.margins = options.marginsEvery > 0;
  use.paraSpace = options.paraSpaceEvery > 0;
  use.lineSpace = options.lineSpaceEvery > 0;
  use.font = options.fontEvery > 0;
  const defaults = defaultDocReductionOptions();
  Object.assign(form, {
    ...options,
    marginsEvery: options.marginsEvery > 0 ? options.marginsEvery : defaults.marginsEvery,
    paraSpaceEvery: options.paraSpaceEvery > 0 ? options.paraSpaceEvery : defaults.paraSpaceEvery,
    lineSpaceEvery: options.lineSpaceEvery > 0 ? options.lineSpaceEvery : defaults.lineSpaceEvery,
    fontEvery: options.fontEvery > 0 ? options.fontEvery : defaults.fontEvery,
  });
}

watch(
  () => props.isOpen,
  (open) => {
    if (!open) return;
    void remembered.load().then((options) => {
      if (props.isOpen) applyLoaded(options);
    });
  },
);

function positiveInt(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

const canSubmit = computed(
  () =>
    !props.busy &&
    positiveInt(form.targetPages) &&
    (use.margins || use.paraSpace || use.lineSpace || use.font) &&
    (!use.margins || positiveInt(form.marginsEvery)) &&
    (!use.paraSpace || positiveInt(form.paraSpaceEvery)) &&
    (!use.lineSpace || positiveInt(form.lineSpaceEvery)) &&
    (!use.font || (positiveInt(form.fontEvery) && positiveInt(form.fontLimitPt))),
);

function current(): DocReductionOptions {
  return {
    targetPages: form.targetPages,
    marginsEvery: use.margins ? form.marginsEvery : 0,
    paraSpaceEvery: use.paraSpace ? form.paraSpaceEvery : 0,
    lineSpaceEvery: use.lineSpace ? form.lineSpaceEvery : 0,
    fontEvery: use.font ? form.fontEvery : 0,
    fontLimitPt: form.fontLimitPt,
  };
}

function onSubmit(): void {
  if (!canSubmit.value) return;
  const options = current();
  void remembered.save(options);
  emit('submit', options);
}

function onCancel(): void {
  if (props.progress) return;
  void remembered.save(current());
  emit('close');
}
</script>

<style scoped>
.shred-dialog {
  position: fixed;
  top: 140px;
  inset-inline-start: 40px;
  z-index: 2000;
  background: var(--color-surface);
  border: 1px solid var(--color-outline);
  border-radius: var(--radius-sm);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
  width: 440px;
  font-family: var(--font-main);
  user-select: none;
}

.shred-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-block-end: 1px solid var(--color-outline-variant);
  padding: 6px 8px 6px 12px;
  background: var(--color-surface-container-high);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
}

.shred-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-on-surface);
}

.shred-close-btn {
  background: none;
  border: none;
  font-size: 14px;
  color: var(--color-on-surface-variant);
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--radius-xs);
}

.shred-close-btn:hover {
  background: var(--word-btn-hover);
  color: var(--color-error);
}

.shred-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.shred-note {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--color-on-surface-variant);
}

.shred-note--warn {
  color: var(--color-on-surface);
}

.shred-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12px;
  color: var(--color-on-surface);
}

.shred-num {
  width: 64px;
  padding: 2px 4px;
  font-size: 12px;
  font-family: var(--font-main);
  border: 1px solid var(--color-outline-variant);
  border-radius: var(--radius-xs);
  background: var(--color-surface);
  color: var(--color-on-surface);
}

.shred-num--small {
  width: 48px;
}

.shred-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  padding: 8px 12px;
  border-block-start: 1px solid var(--color-outline-variant);
  background: var(--color-surface-container-high);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
}

.shred-btn {
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

.shred-btn:hover:not(:disabled) {
  background: var(--word-btn-hover);
  border-color: var(--word-blue);
}

.shred-btn-primary {
  background: var(--word-blue);
  color: var(--color-on-primary);
  border-color: var(--word-blue);
}

.shred-btn-primary:hover:not(:disabled) {
  background: var(--word-blue-dark);
}

.shred-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
