<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="headerdist-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="DIALOG_TITLE"
      tabindex="-1"
      @keydown.esc.stop="$emit('close')"
    >
      <div class="hd-header">
        <span class="hd-title">{{ DIALOG_TITLE }}</span>
        <button
          type="button"
          class="hd-close-btn"
          data-tip-title="סגור"
          data-tip-shortcut="Esc"
          aria-label="סגור את מרחק הכותרת מקצה הדף"
          @click="$emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="hd-body">
        <div class="hd-row">
          <label
            for="hd-header"
            class="hd-label"
          >כותרת עליונה:</label>
          <input
            id="hd-header"
            ref="firstFieldRef"
            v-model="headerText"
            class="hd-number"
            type="number"
            min="0"
            :max="HEADER_DISTANCE_MAX_CM"
            step="0.05"
            aria-label="מרחק הכותרת העליונה מקצה הדף, בסנטימטרים"
            @keydown.enter="onSubmit"
          >
          <span class="hd-unit">ס"מ</span>
        </div>

        <div class="hd-row">
          <label
            for="hd-footer"
            class="hd-label"
          >כותרת תחתונה:</label>
          <input
            id="hd-footer"
            v-model="footerText"
            class="hd-number"
            type="number"
            min="0"
            :max="HEADER_DISTANCE_MAX_CM"
            step="0.05"
            aria-label="מרחק הכותרת התחתונה מקצה הדף, בסנטימטרים"
            @keydown.enter="onSubmit"
          >
          <span class="hd-unit">ס"מ</span>
        </div>

        <p
          v-if="showError"
          class="hd-error"
          role="alert"
        >
          {{ HEADER_DISTANCE_HINT }}
        </p>

        <!--
          התקרה אינה גחמה: נמדד שהמנוע מקבל `header: 99` ומחזיר `success: true`
          אחרי שכתב `w:header="142560"` — כותרת במרחק שני מטרים וחצי מקצה הדף,
          כלומר מחוץ לנייר. הטווח כאן הוא הטווח של Word.
        -->
        <p
          class="hd-note"
          role="note"
        >
          המרחק חל על כל מקטעי המסמך. ברירת המחדל של Word היא
          {{ HEADER_DISTANCE_DEFAULT_CM }} ס"מ.
        </p>
      </div>

      <div class="hd-footer">
        <button
          type="button"
          class="hd-btn hd-btn-primary"
          :disabled="!canSubmit"
          @pointerdown.prevent
          @click="onSubmit"
        >
          אישור
        </button>
        <button
          type="button"
          class="hd-btn"
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
 * „מרחק מקצה הדף” — שני השדות מתוך „הגדרת עמוד → פריסה → כותרות עליונות
 * ותחתונות” ב-Word העברי.
 *
 * הפקד הזה נדחה לכאן מגל 1 במפורש, ולא מפני שהוא קטן: הוא היחיד בלשונית
 * שדורש הקלדת מידה, וסנטימטרים הם היחידה שהמשתמש חושב בה בעוד שהמנוע מקבל
 * אינצ'ים. ההמרה יושבת ב-engine/page-setup.ts ולא כאן, כדי שהמודול יהיה
 * המקום היחיד שמכיר את שתי היחידות.
 *
 * מציג בלבד: הוולידציה כאן תצוגתית, וההכרעה היא `normalizeHeaderDistanceCm`
 * — אותה פונקציה שהמודול קורא לה לפני השליחה.
 *
 * ומכאן גם מה שנשלח: **הטקסט כמות שהוא**, ולא `Number(...)` שלו. הפונקציה
 * שמכריעה כאן מקבלת רווחים ופסיק עשרוני, ולכן `'1,5'` הוא ערך שהטופס מסמן
 * כתקין ואילו `Number('1,5')` הוא `NaN` — כלומר כפתור „אישור” פעיל שנגמר
 * בהודעת שגיאה מהמודול. שתי נוסחאות לאותה שאלה הן הבאג עצמו, ולכן יש אחת.
 */
import { computed, nextTick, ref, watch } from 'vue';
import {
  HEADER_DISTANCE_DEFAULT_CM,
  HEADER_DISTANCE_HINT,
  HEADER_DISTANCE_MAX_CM,
  normalizeHeaderDistanceCm,
  type HeaderDistanceSettings,
} from '../../engine/page-setup';

const props = withDefaults(
  defineProps<{
    isOpen?: boolean;
    /** מה שנקרא מהמסמך בסנטימטרים, או `null` כשהקריאה לא החזירה את שניהם. */
    distance?: { header: number; footer: number } | null;
    /**
     * פעולה על המסמך שיצאה לדרך וטרם חזרה, כפי שהלשונית מדווחת אותה.
     *
     * זו אותה תבנית של `busy` ב-NoteDialog מגל 9, ומאותה סיבה: הנעילה של
     * הלשונית מנטרלת את פקדי הרצועה, ובלי ה-prop הזה „אישור” נשאר פעיל בזמן
     * שפעולה אחרת באוויר — ואז `run()` יוצא ב-`return` שקט, הדיאלוג נסגר,
     * ולא קרה כלום ואין הודעה. כפתור שנלחץ ולא קרה כלום הוא בדיוק מה
     * שהנעילה נועדה למנוע.
     */
    busy?: boolean;
  }>(),
  { isOpen: false, distance: null, busy: false }
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'submit', settings: HeaderDistanceSettings): void;
}>();

const DIALOG_TITLE = 'מרחק הכותרת מקצה הדף';

const headerText = ref(String(HEADER_DISTANCE_DEFAULT_CM));
const footerText = ref(String(HEADER_DISTANCE_DEFAULT_CM));
const firstFieldRef = ref<HTMLInputElement | null>(null);

const normalized = computed(() => ({
  header: normalizeHeaderDistanceCm(headerText.value),
  footer: normalizeHeaderDistanceCm(footerText.value),
}));

const isValid = computed(
  () => normalized.value.header !== null && normalized.value.footer !== null
);
/**
 * `busy` נכנס ל„אפשר לאשר” אבל **לא** ל„להציג שגיאה”: הודעת השגיאה מדברת על
 * הערך שהוקלד, ופעולה אחרת שרצה במקביל אינה אומרת עליו דבר. „ביטול” ו„סגור”
 * נשארים פעילים — הם אינם נוגעים במסמך, בדיוק כמו ב-NoteDialog.
 */
const canSubmit = computed(() => isValid.value && !props.busy);
const showError = computed(() => !isValid.value);

/** שתי ספרות אחרי הנקודה: הקריאה מחזירה אינצ'ים, ו-`0.5"` הם 1.27 ס"מ. */
function toField(cm: number): string {
  return String(Math.round(cm * 100) / 100);
}

watch(
  () => props.isOpen,
  (open) => {
    if (!open) return;
    headerText.value = toField(props.distance?.header ?? HEADER_DISTANCE_DEFAULT_CM);
    footerText.value = toField(props.distance?.footer ?? HEADER_DISTANCE_DEFAULT_CM);
    nextTick(() => firstFieldRef.value?.focus());
  }
);

function onSubmit(): void {
  if (!canSubmit.value) return;
  // הטקסט, ולא המרה שלו. ראו „ומכאן גם מה שנשלח” בהערת הפתיחה.
  emit('submit', {
    headerCm: headerText.value,
    footerCm: footerText.value,
  });
}
</script>

<style scoped>
.headerdist-dialog {
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

.hd-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-block-end: 1px solid var(--color-outline-variant);
  padding: 6px 8px 6px 12px;
  background: var(--color-surface-container-high);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
}

.hd-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-on-surface);
}

.hd-close-btn {
  background: none;
  border: none;
  font-size: 14px;
  color: var(--color-on-surface-variant);
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--radius-xs);
}

.hd-close-btn:hover {
  background: var(--word-btn-hover);
  color: var(--color-error);
}

.hd-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hd-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.hd-label {
  font-size: 11px;
  color: var(--color-on-surface);
  flex-shrink: 0;
  width: 84px;
}

.hd-unit {
  font-size: 11px;
  color: var(--color-on-surface-variant);
}

.hd-number {
  padding: 4px 8px;
  border: 1px solid var(--color-outline-variant);
  border-radius: var(--radius-xs);
  background: var(--color-surface);
  color: var(--color-on-surface);
  font-family: var(--font-main);
  font-size: 12px;
  outline: none;
  width: 90px;
}

.hd-number:focus {
  border-color: var(--word-blue);
  box-shadow: 0 0 0 1px var(--word-blue);
}

.hd-note {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--color-on-surface-variant);
}

.hd-error {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--color-error);
}

.hd-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  padding: 8px 12px;
  border-block-start: 1px solid var(--color-outline-variant);
  background: var(--color-surface-container-high);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
}

.hd-btn {
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

.hd-btn:hover:not(:disabled) {
  background: var(--word-btn-hover);
  border-color: var(--word-blue);
}

/* הטקסט על הכפתור הממולא הוא `--color-on-primary` ולא לבן קבוע — ראו
   ההסבר ב-LinkDialog.vue. */
.hd-btn-primary {
  background: var(--word-blue);
  color: var(--color-on-primary);
  border-color: var(--word-blue);
}

.hd-btn-primary:hover:not(:disabled) {
  background: var(--word-blue-dark);
}

.hd-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
