<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      ref="rootRef"
      class="docdef-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="DIALOG_TITLE"
      tabindex="-1"
      @keydown.esc.stop="$emit('close')"
    >
      <div class="dd-header">
        <span class="dd-title">{{ DIALOG_TITLE }}</span>
        <button
          type="button"
          class="dd-close-btn"
          data-tip-title="סגור"
          data-tip-shortcut="Esc"
          aria-label="סגור את ברירות המחדל של המסמך"
          @click="$emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="dd-body">
        <!--
          מילוי מקדים חלקי בכוונה: הגודל נקרא (dryRun), שם הגופן אינו נקרא —
          צורת `before` ל-record לא נמדדה, ושדה שנפתח עם ניחוש הוא שדה שמשקר.
          patch לפי מפתח: מה שלא נשלח אינו נוגע בברירת המחדל הקיימת.
        -->
        <div class="dd-row">
          <label
            for="dd-family"
            class="dd-label"
          >גופן ברירת מחדל:</label>
          <input
            id="dd-family"
            v-model="fontFamily"
            class="dd-text"
            type="text"
            maxlength="100"
            placeholder="ללא שינוי"
            aria-label="שם גופן ברירת המחדל של המסמך"
            @keydown.enter="onSubmit"
          >
        </div>
        <div class="dd-row">
          <label
            for="dd-size"
            class="dd-label"
          >גודל ברירת מחדל:</label>
          <input
            id="dd-size"
            v-model="fontSize"
            class="dd-number"
            type="number"
            min="0.5"
            max="800"
            step="0.5"
            :placeholder="sizePlaceholder"
            aria-label="גודל ברירת המחדל, בנקודות"
            @keydown.enter="onSubmit"
          >
          <span class="dd-unit">נק'</span>
        </div>

        <p class="dd-note">חל על המסמך כולו: טקסט שאינו נושא עיצוב ישיר יוצג לפי ברירת המחדל.</p>

        <p
          v-if="showError"
          class="dd-error"
          role="alert"
        >
          {{ INVALID_HINT }}
        </p>

      </div>

      <div class="dd-footer">
        <button
          type="button"
          class="dd-btn dd-btn-primary"
          :disabled="busy || !canSubmit"
          @pointerdown.prevent
          @click="onSubmit"
        >
          אישור
        </button>
        <button
          type="button"
          class="dd-btn"
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
 * „ברירות מחדל למסמך" — גופן/גודל ברירת המחדל, דרך `styles.apply` על
 * docDefaults (engine/doc-style-defaults.ts). היחידות: נקודות בממשק,
 * חצאי-נקודות במנוע — ההמרה במודול. אין מילוי מקדים לשם הגופן: צורת
 * `before` ל-record לא נמדדה, ושדה שנפתח עם ניחוש הוא שדה שמשקר.
 */
import { computed, nextTick, ref, watch } from 'vue';

const DIALOG_TITLE = 'ברירות מחדל למסמך';
const INVALID_HINT = 'הערכים שהוקלדו אינם תקינים.';

const props = defineProps<{
  isOpen: boolean;
  busy: boolean;
  /** הגודל הנוכחי בנקודות, כפי שנקרא ב-dryRun. `null` = לא נודע. */
  currentSizePt: number | null;
}>();

const emit = defineEmits<{
  close: [];
  submit: [patch: { fontFamily?: string; fontSizePt?: number }];
}>();

const rootRef = ref<HTMLElement | null>(null);
const fontFamily = ref('');
const fontSize = ref('');

const sizePlaceholder = computed(() =>
  props.currentSizePt !== null ? String(props.currentSizePt) : 'ללא שינוי',
);

watch(
  () => props.isOpen,
  async (open) => {
    if (!open) return;
    fontFamily.value = '';
    fontSize.value = '';
    await nextTick();
    rootRef.value?.focus();
  },
);

/**
 * v-model על `type="number"` ממיר אוטומטית למספר — ראו FontAdvancedDialog.vue,
 * ששם אותו כשל בדיוק תועד ותוקן. `fontSize` הוא `string | number` בזמן ריצה
 * (מוקלד אצלנו כ-`string` בלבד, ולכן `.trim()` על מספר קרס את הדיאלוג), והפרסור
 * חייב לבדוק את הטיפוס בפועל לפני קריאה למתודות של מחרוזת.
 */
function asText(value: string | number): string {
  return typeof value === 'string' ? value : String(value);
}

function parseSize(value: string | number): number | undefined | null {
  const text = asText(value);
  if (text.trim() === '') return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

const showError = computed(() => parseSize(fontSize.value) === null);

/**
 * לפחות שדה אחד מולא. שני השדות ריקים = אין מה להחיל.
 *
 * בלי זה „אישור” היה **פעיל** על דיאלוג ריק, ולחיצה עליו הייתה סוגרת אותו
 * בלי לעשות דבר — כלומר כפתור ראשי שנראה כמו פעולה ומתנהג כמו „ביטול”. זה
 * בדיוק סוג הכפתור המת שכל האודיט הזה נועד לחסל, והוא נמדד בשער הפריסה
 * („ברירות מחדל — שני שדות ריקים”).
 *
 * שני התנאים נפרדים בכוונה: `showError` הוא „מה שהוקלד אינו גודל”, וזה מצב
 * שמלווה בהודעת שגיאה. „לא הוקלד כלום” אינו שגיאה ואינו ראוי להודעה — הוא
 * פשוט אינו פעולה, ולכן הוא נעילה שקטה של הכפתור.
 */
const hasChange = computed(
  () => fontFamily.value.trim() !== '' || asText(fontSize.value).trim() !== '',
);
const canSubmit = computed(() => hasChange.value && !showError.value);

function onSubmit(): void {
  if (props.busy || !canSubmit.value) return;

  // `canSubmit` כבר מבטיח ששדה אחד לפחות מולא ושהגודל תקין, ולכן ה-patch כאן
  // אינו יכול לצאת ריק — ואין ענף „אין מה לעשות”. הענף הזה היה קיים, והוא מה
  // שהסתיר את הכפתור הפעיל: הוא הפך „אישור” על דיאלוג ריק לסגירה שקטה.
  const patch: { fontFamily?: string; fontSizePt?: number } = {};
  if (fontFamily.value.trim() !== '') patch.fontFamily = fontFamily.value.trim();
  const size = parseSize(fontSize.value);
  if (size !== null && size !== undefined) patch.fontSizePt = size;

  emit('submit', patch);
}
</script>

<style scoped>
.docdef-dialog {
  position: fixed;
  top: 140px;
  inset-inline-start: 40px;
  z-index: 2000;
  background: var(--color-surface);
  border: 1px solid var(--color-outline);
  border-radius: var(--radius-sm);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
  width: 340px;
  font-family: var(--font-main);
  user-select: none;
}

.dd-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-block-end: 1px solid var(--color-outline-variant);
  padding: 6px 8px 6px 12px;
  background: var(--color-surface-container-high);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
}

.dd-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-on-surface);
}

.dd-close-btn {
  background: none;
  border: none;
  font-size: 14px;
  color: var(--color-on-surface-variant);
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--radius-xs);
}

.dd-close-btn:hover {
  background: var(--word-btn-hover);
  color: var(--color-error);
}

.dd-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dd-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dd-label {
  font-size: 11px;
  color: var(--color-on-surface);
  flex-shrink: 0;
  width: 110px;
}

.dd-unit {
  font-size: 11px;
  color: var(--color-on-surface-variant);
}

.dd-text,
.dd-number {
  padding: 4px 8px;
  border: 1px solid var(--color-outline-variant);
  border-radius: var(--radius-xs);
  background: var(--color-surface);
  color: var(--color-on-surface);
  font-family: var(--font-main);
  font-size: 12px;
  outline: none;
  width: 120px;
}

.dd-number {
  width: 80px;
}

.dd-text:focus,
.dd-number:focus {
  border-color: var(--word-blue);
  box-shadow: 0 0 0 1px var(--word-blue);
}

.dd-note {
  margin: 0;
  font-size: 10.5px;
  line-height: 1.4;
  color: var(--color-on-surface-variant);
}

.dd-error {
  margin: 0;
  font-size: 11px;
  color: var(--color-error);
}

.dd-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  padding: 8px 12px;
  border-block-start: 1px solid var(--color-outline-variant);
  background: var(--color-surface-container-high);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
}

.dd-btn {
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

.dd-btn:hover:not(:disabled) {
  background: var(--word-btn-hover);
  border-color: var(--word-blue);
}

.dd-btn-primary {
  background: var(--word-blue);
  color: var(--color-on-primary);
  border-color: var(--word-blue);
}

.dd-btn-primary:hover:not(:disabled) {
  background: var(--word-blue-dark);
}

.dd-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>

