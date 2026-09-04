<template>
  <!--
    Teleport ולא רינדור במקום — אותו טעם כמו בכל דיאלוג אחר במאגר:
    `.word-ribbon-body` מוגדר `overflow-y: hidden`, ודיאלוג שנפתח מתוך לשונית
    נחתך בגובה הרצועה.
  -->
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="pagenum-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="DIALOG_TITLE"
      tabindex="-1"
      @keydown.esc.stop="$emit('close')"
    >
      <div class="pn-header">
        <span class="pn-title">{{ DIALOG_TITLE }}</span>
        <button
          type="button"
          class="pn-close-btn"
          data-tip-title="סגור"
          data-tip-shortcut="Esc"
          aria-label="סגור את עיצוב מספרי העמודים"
          @click="$emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="pn-body">
        <div class="pn-row">
          <label
            for="pn-format"
            class="pn-label"
          >תבנית מספרים:</label>
          <select
            id="pn-format"
            ref="firstFieldRef"
            v-model="format"
            class="pn-select"
            aria-label="תבנית המספרים של מספרי העמודים"
          >
            <option
              v-for="item in PAGE_NUMBER_FORMATS"
              :key="item.id"
              :value="item.id"
            >
              {{ item.label }}
            </option>
          </select>
        </div>

        <label class="pn-check">
          <input
            v-model="restart"
            type="checkbox"
          >
          <span>התחל מחדש מהמספר:</span>
        </label>

        <div class="pn-row">
          <input
            v-model="startText"
            class="pn-number"
            type="number"
            min="1"
            :max="NUMBER_START_MAX"
            step="1"
            :disabled="!restart"
            aria-label="המספר שממנו מתחיל מספור העמודים"
            @keydown.enter="onSubmit"
          >
        </div>

        <p
          v-if="showError"
          class="pn-error"
          role="alert"
        >
          {{ PAGE_NUMBER_START_HINT }}
        </p>

        <!--
          ההערה אינה קישוט. נמדד ש-`sections.setPageNumbering` דורש לפחות שדה
          אחד ואין לו פעולת ניקוי, כלומר `w:pgNumType/@w:start` שנכתב אינו
          ניתן למחיקה מכאן. משתמש שמסמן „התחל מחדש” ומתחרט צריך לדעת את זה
          לפני שהוא מאשר, ולא אחרי.
        -->
        <p
          class="pn-note"
          role="note"
        >
          ההגדרה חלה על כל מקטעי המסמך. אחרי קביעת מספר התחלה אין דרך להחזיר
          את המסמך ל„המשך מהמקטע הקודם” מתוך התוסף.
        </p>

      </div>

      <div class="pn-footer">
        <button
          type="button"
          class="pn-btn pn-btn-primary"
          :disabled="!canSubmit"
          @pointerdown.prevent
          @click="onSubmit"
        >
          אישור
        </button>
        <button
          type="button"
          class="pn-btn"
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
 * „עיצוב מספרי עמודים” — התרגום של הדיאלוג שנפתח מ„הוספה → מספר עמוד →
 * עיצוב מספרי עמודים” ב-Word העברי, בלשונית שבה הוא באמת נוגע במקטע.
 *
 * מציג בלבד: אינו קורא למנוע. הוולידציה כאן היא **תצוגתית**, וההכרעה עצמה
 * היא `normalizePageNumberStart` ב-engine/page-setup.ts — אותה פונקציה
 * שהמודול קורא לה לפני השליחה. שני נוסחים לאותה שאלה היו מאפשרים דיאלוג
 * שמאשר ערך שהמודול ידחה, כלומר כפתור שנלחץ ולא קורה כלום.
 *
 * נפתח על מה שבמסמך: `sections.list()` מחזיר `pageNumbering`, ולכן הטופס
 * אינו מנחש. זה מה שהבדיל בין הדיאלוג הזה ובין ההגדרות של הערות השוליים,
 * שאין להן קריאה בכלל ולכן לא נשלחו.
 */
import { computed, nextTick, ref, watch } from 'vue';
import {
  NUMBER_START_MAX,
  PAGE_NUMBER_FORMATS,
  PAGE_NUMBER_START_HINT,
  normalizePageNumberStart,
  type PageNumberFormat,
  type PageNumberingSettings,
} from '../../engine/page-setup';

const props = withDefaults(
  defineProps<{
    isOpen?: boolean;
    /** מה שנקרא מהמסמך, או `null` כשאין `w:pgNumType` — המצב הרגיל. */
    format?: PageNumberFormat | null;
    start?: number | null;
    /**
     * פעולה על המסמך שיצאה לדרך וטרם חזרה, כפי שהלשונית מדווחת אותה.
     *
     * אותה תבנית של `busy` ב-NoteDialog מגל 9, ומאותה סיבה: הנעילה של
     * הלשונית מנטרלת את פקדי הרצועה, ובלי ה-prop הזה „אישור” נשאר פעיל בזמן
     * שפעולה אחרת באוויר — ואז `run()` יוצא ב-`return` שקט, הדיאלוג נסגר, לא
     * קרה כלום ואין הודעה.
     */
    busy?: boolean;
  }>(),
  { isOpen: false, format: null, start: null, busy: false }
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'submit', settings: PageNumberingSettings): void;
}>();

const DIALOG_TITLE = 'עיצוב מספרי עמודים';

/** ברירת המחדל של Word, וזו שגם מסמך בלי `w:pgNumType` מתנהג לפיה. */
const DEFAULT_FORMAT: PageNumberFormat = 'decimal';

const format = ref<PageNumberFormat>(DEFAULT_FORMAT);
const restart = ref(false);
const startText = ref('1');
const firstFieldRef = ref<HTMLSelectElement | null>(null);

const normalizedStart = computed(() => normalizePageNumberStart(startText.value));
/** כשהתיבה אינה מסומנת המספר אינו נשלח כלל, ולכן ערכו אינו מעניין. */
const isValid = computed(() => !restart.value || normalizedStart.value !== null);
/**
 * `busy` נכנס ל„אפשר לאשר” אבל **לא** ל„להציג שגיאה”: הודעת השגיאה מדברת על
 * המספר שהוקלד, ופעולה אחרת שרצה במקביל אינה אומרת עליו דבר. „ביטול” ו„סגור”
 * נשארים פעילים — הם אינם נוגעים במסמך, בדיוק כמו ב-NoteDialog.
 */
const canSubmit = computed(() => isValid.value && !props.busy);
const showError = computed(() => restart.value && normalizedStart.value === null);

watch(
  () => props.isOpen,
  (open) => {
    if (!open) return;
    // נפתח על מה שבמסמך ולא על מה שנבחר בפתיחה הקודמת: דיאלוג שזוכר בחירה
    // ישנה היה מציג הגדרות של מסמך אחר.
    format.value = props.format ?? DEFAULT_FORMAT;
    restart.value = props.start !== null;
    startText.value = String(props.start ?? 1);
    nextTick(() => firstFieldRef.value?.focus());
  }
);

function onSubmit(): void {
  if (!canSubmit.value) return;
  emit('submit', {
    format: format.value,
    start: restart.value ? normalizedStart.value : null,
  });
}
</script>

<style scoped>
.pagenum-dialog {
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

.pn-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-block-end: 1px solid var(--color-outline-variant);
  padding: 6px 8px 6px 12px;
  background: var(--color-surface-container-high);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
}

.pn-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-on-surface);
}

.pn-close-btn {
  background: none;
  border: none;
  font-size: 14px;
  color: var(--color-on-surface-variant);
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--radius-xs);
}

.pn-close-btn:hover {
  background: var(--word-btn-hover);
  color: var(--color-error);
}

.pn-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pn-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pn-label {
  font-size: 11px;
  color: var(--color-on-surface);
  flex-shrink: 0;
}

.pn-select,
.pn-number {
  padding: 4px 8px;
  border: 1px solid var(--color-outline-variant);
  border-radius: var(--radius-xs);
  background: var(--color-surface);
  color: var(--color-on-surface);
  font-family: var(--font-main);
  font-size: 12px;
  outline: none;
}

.pn-number {
  width: 90px;
}

.pn-select:focus,
.pn-number:focus {
  border-color: var(--word-blue);
  box-shadow: 0 0 0 1px var(--word-blue);
}

.pn-number:disabled {
  opacity: 0.4;
}

.pn-check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--color-on-surface);
  cursor: pointer;
}

.pn-note {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--color-on-surface-variant);
}

.pn-error {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--color-error);
}

.pn-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  padding: 8px 12px;
  border-block-start: 1px solid var(--color-outline-variant);
  background: var(--color-surface-container-high);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
}

.pn-btn {
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

.pn-btn:hover:not(:disabled) {
  background: var(--word-btn-hover);
  border-color: var(--word-blue);
}

/* הטקסט על הכפתור הממולא הוא `--color-on-primary` ולא לבן קבוע — ראו
   ההסבר ב-LinkDialog.vue. */
.pn-btn-primary {
  background: var(--word-blue);
  color: var(--color-on-primary);
  border-color: var(--word-blue);
}

.pn-btn-primary:hover:not(:disabled) {
  background: var(--word-blue-dark);
}

.pn-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
