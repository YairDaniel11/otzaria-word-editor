<template>
  <!-- Teleport מאותו טעם כמו בשאר הדיאלוגים. ראו BookmarkDialog.vue. -->
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="caption-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="DIALOG_TITLE"
      @keydown.esc.stop="$emit('close')"
    >
      <div class="cp-header">
        <span class="cp-title">{{ DIALOG_TITLE }}</span>
        <button
          type="button"
          class="cp-close-btn"
          data-tip-title="סגור"
          data-tip-shortcut="Esc"
          aria-label="סגור את הכיתובים"
          @click="$emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="cp-body">
        <div class="cp-row">
          <label
            for="cp-label"
            class="cp-label"
          >תווית:</label>
          <!--
            קלט חופשי עם `datalist` ולא `select`, וזה ממצא ולא נוחות: התווית
            נכתבת אל תוך קוד השדה כמחרוזת (`SEQ איור \* ARABIC`) והמנוע מקבל
            כל מחרוזת. רשימה סגורה כאן הייתה חוסמת „לוח” ו„תרשים” בלי סיבה.
          -->
          <input
            id="cp-label"
            ref="labelInputRef"
            v-model="label"
            type="text"
            class="cp-input"
            list="cp-label-options"
            placeholder="למשל: איור"
            aria-label="תווית הכיתוב, למשל איור או טבלה"
            @keydown.enter="onSubmit"
          >
          <datalist id="cp-label-options">
            <option
              v-for="option in labelOptions"
              :key="option"
              :value="option"
            />
          </datalist>
        </div>

        <div class="cp-row">
          <label
            for="cp-text"
            class="cp-label"
          >תיאור:</label>
          <input
            id="cp-text"
            v-model="text"
            type="text"
            class="cp-input"
            placeholder="למשל: שרטוט המשכן"
            aria-label="הטקסט שיופיע אחרי מספר הכיתוב"
            @keydown.enter="onSubmit"
          >
        </div>

        <div class="cp-row">
          <label
            for="cp-position"
            class="cp-label"
          >מיקום:</label>
          <!--
            נעול בעריכה, וזו אינה החמרה שרירותית: עריכה כאן היא הסרה והוספה
            מחדש באותו מקום (ראו engine/captions.ts), והמקום נגזר מהבלוק
            השכן ולא מבחירה חדשה. תיבה פעילה שאינה משפיעה היא הבטחה ריקה.
          -->
          <select
            id="cp-position"
            v-model="position"
            class="cp-input"
            :disabled="selected !== ''"
            :data-tip-title="selected === '' ? undefined : POSITION_LOCKED"
            aria-label="האם הכיתוב יופיע מעל הפסקה שבסמן או מתחתיה"
          >
            <option value="below">
              מתחת לפסקה שבסמן
            </option>
            <option value="above">
              מעל הפסקה שבסמן
            </option>
          </select>
        </div>

        <div
          v-if="captions.length > 0"
          class="cp-list"
          role="listbox"
          aria-label="הכיתובים שבמסמך"
        >
          <button
            v-for="caption in captions"
            :key="caption.id"
            type="button"
            class="cp-list-item"
            :class="{ 'cp-list-item--selected': caption.id === selected }"
            role="option"
            :aria-selected="caption.id === selected"
            @pointerdown.prevent
            @click="select(caption)"
          >
            <span class="cp-list-text">{{ caption.display }}</span>
          </button>
        </div>
        <p
          v-else
          class="cp-note"
          role="note"
        >
          אין כיתובים במסמך
        </p>

        <p
          class="cp-note"
          role="note"
        >
          הכיתוב נכנס כפסקה בסגנון „כיתוב”, עם שדה מספור שמתעדכן מאליו: כיתוב
          שנוסף באמצע מזיז את המספרים שאחריו.
        </p>

        <!--
          אזהרה ולא הברחה, כמו בנקודתיים של „סמן ערך למפתח”: התווית היא רצף
          המספור עצמו, ותווית שנכתבה אחרת — אפילו ברווח — מתחילה רצף שני
          ונפרד. זה מה שקורה במסמך, ולכן המשתמש שומע על כך לפני הלחיצה.
        -->
        <p
          v-if="startsNewSequence"
          class="cp-note cp-warn"
          role="alert"
        >
          התווית הזאת אינה בשימוש במסמך, ולכן המספור שלה יתחיל מ-1.
        </p>
      </div>

      <div class="cp-footer">
        <button
          type="button"
          class="cp-btn cp-btn-primary"
          :disabled="!canSubmit"
          @pointerdown.prevent
          @click="onSubmit"
        >
          <!-- `canRemove` ולא `selected`: בחירה שכבר אינה ברשימה אינה עריכה,
               והכפתור אינו מבטיח שמירה שלא תקרה. -->
          {{ canRemove ? 'שמור שינויים' : 'הוסף כיתוב' }}
        </button>
        <button
          type="button"
          class="cp-btn"
          :disabled="selected === ''"
          @pointerdown.prevent
          @click="startNew"
        >
          כיתוב חדש
        </button>
        <button
          type="button"
          class="cp-btn"
          :disabled="!canRemove"
          @pointerdown.prevent
          @click="onRemove"
        >
          הסר כיתוב
        </button>
        <button
          type="button"
          class="cp-btn"
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
 * „הוסף כיתוב” של קבוצת „כיתובים” — הוספה, עריכה והסרה של פסקת הכיתוב.
 *
 * דיאלוג אחד לשלוש הפעולות, כמו „סימנייה” ומאותו טעם: „ערוך” ו„הסר” דורשים
 * לבחור כיתוב מרשימה, והרשימה היא כבר הדיאלוג. פיצול היה מייצר שני חלונות
 * שמציגים את אותה רשימה.
 *
 * מציג בלבד: אינו קורא למנוע ואינו בונה קוד שדה. הוולידציה כאן היא
 * **תצוגתית**, וההכרעה עצמה היא `normalizeCaptionLabel` ב-engine/captions.ts
 * — אותה פונקציה שהמודול קורא לה לפני השליחה. שני נוסחים לאותה שאלה היו
 * מאפשרים דיאלוג שמאשר תווית שהמודול ידחה.
 *
 * נשאר פתוח אחרי כל פעולה, כמו דיאלוג הסימניות: ספר עם עשרים לוחות מקבל
 * עשרים כיתובים, ודיאלוג שנסגר אחרי כל אחד היה מס.
 *
 * `captions` מגיע כ-prop ואינו נקרא כאן: מי שקורא את המסמך היא הלשונית, והיא
 * זו שקוראת מחדש אחרי כל פעולה. ראו BookmarkDialog.vue.
 */
import { computed, nextTick, ref, watch } from 'vue';
import {
  CAPTION_LABELS,
  DEFAULT_CAPTION_LABEL,
  normalizeCaptionLabel,
  type CaptionDraft,
  type CaptionPosition,
  type CaptionSummary,
} from '../../engine/captions';

const props = withDefaults(
  defineProps<{
    isOpen?: boolean;
    /** הכיתובים שבמסמך, כפי שהלשונית קראה אותם. */
    captions?: readonly CaptionSummary[];
    /** התוויות שכבר בשימוש במסמך, להצעה לצד המובנות. */
    labels?: readonly string[];
  }>(),
  { isOpen: false, captions: () => [], labels: () => [] }
);

const emit = defineEmits<{
  (e: 'close'): void;
  /** טיוטה שעברה ולידציה. */
  (e: 'insert', draft: CaptionDraft): void;
  (e: 'update', payload: { id: string; draft: CaptionDraft }): void;
  (e: 'remove', id: string): void;
}>();

const DIALOG_TITLE = 'כיתוב';
const POSITION_LOCKED = 'בעריכה הכיתוב נשאר במקומו שבמסמך';

const label = ref<string>(DEFAULT_CAPTION_LABEL);
const text = ref('');
const position = ref<CaptionPosition>('below');
/** מזהה הכיתוב שנבחר ברשימה, או `''` כשמוסיפים חדש. */
const selected = ref('');
const labelInputRef = ref<HTMLInputElement | null>(null);

/** השלוש של Word תחילה, ואחריהן מה שכבר במסמך ואינו בהן. בלי כפילות. */
const labelOptions = computed(() => {
  const options: string[] = [...CAPTION_LABELS];
  for (const used of props.labels) {
    if (used !== '' && !options.includes(used)) options.push(used);
  }
  return options;
});

const canSubmit = computed(() => normalizeCaptionLabel(label.value) !== null);

/**
 * הסרה דורשת בחירה **שעדיין ברשימה**: `nodeId` של פסקה הוא כתובת חולפת
 * (`refStability: 'ephemeral'` בחוזה), ואחרי כל פעולה ה-prop מתחלף. לחיצה
 * שנייה על בחירה ישנה הייתה מכוונת לכיתוב אחר מזה שהמשתמש רואה מסומן.
 */
const canRemove = computed(
  () => selected.value !== '' && props.captions.some((caption) => caption.id === selected.value)
);

/** תווית שאין לה כיתוב במסמך — כלומר רצף מספור חדש. ראו האזהרה בתבנית. */
const startsNewSequence = computed(() => {
  const normalized = normalizeCaptionLabel(label.value);
  if (normalized === null) return false;
  return !props.captions.some((caption) => caption.label === normalized);
});

/**
 * הטופס חוזר לנקודת ההתחלה: תווית ברירת המחדל, בלי טקסט ובלי בחירה.
 *
 * פונקציה אחת לשתי הדרכים להתחיל כיתוב חדש — פתיחת הדיאלוג ו„כיתוב חדש”.
 * כשכל אחת מהן איפסה בנפרד הן איפסו שונה: „כיתוב חדש” השאיר את התווית של
 * הכיתוב שנבחר, כלומר אותה לחיצה נתנה שתי התנהגויות. תווית שנשארת מצמידה
 * את הכיתוב הבא לרצף מספור שאינו זה שהמשתמש מתכוון אליו.
 */
function resetForm(): void {
  label.value = DEFAULT_CAPTION_LABEL;
  text.value = '';
  position.value = 'below';
  selected.value = '';
}

watch(
  () => props.isOpen,
  (open) => {
    if (!open) return;
    resetForm();
    nextTick(() => {
      labelInputRef.value?.focus();
      labelInputRef.value?.select();
    });
  }
);

/** בחירה ברשימה ממלאת את הטופס — כך ברור על מה „שמור” ו„הסר” יחולו. */
function select(caption: CaptionSummary): void {
  selected.value = caption.id;
  label.value = caption.label;
  text.value = caption.text;
}

function startNew(): void {
  resetForm();
  labelInputRef.value?.focus();
}

function draftOf(): CaptionDraft {
  return { label: label.value, text: text.value, position: position.value };
}

function onSubmit(): void {
  if (!canSubmit.value) return;
  if (selected.value === '') {
    emit('insert', draftOf());
    return;
  }
  // אותה הגנה שב-`canRemove`, בצד השני: בחירה שכבר אינה ברשימה מכוונת
  // לכיתוב אחר מזה שהמשתמש רואה מסומן.
  if (!canRemove.value) return;
  emit('update', { id: selected.value, draft: draftOf() });
  // עריכה היא הסרה והוספה מחדש, ולכן הכיתוב מקבל `nodeId` **חדש** שהדיאלוג
  // אינו יודע (הפעולה מחזירה `CommandOutcome` בלבד). לכן ניקוי ולא בחירה
  // מחדש: בלעדיו הכפתור נשאר „שמור שינויים” על מזהה שאינו קיים עוד, ולחיצה
  // שנייה הייתה מקבלת „הכיתוב אינו נמצא במסמך”. הטופס נשאר מלא בכוונה —
  // רואים מה נשמר, והמצב הוא „הוסף” כמו שהכפתור אומר.
  selected.value = '';
}

function onRemove(): void {
  if (!canRemove.value) return;
  emit('remove', selected.value);
  selected.value = '';
}
</script>

<style scoped>
.caption-dialog {
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

.cp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-block-end: 1px solid var(--color-outline-variant);
  padding: 6px 8px 6px 12px;
  background: var(--color-surface-container-high);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
}

.cp-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-on-surface);
}

.cp-close-btn {
  background: none;
  border: none;
  font-size: 14px;
  color: var(--color-on-surface-variant);
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--radius-xs);
}

.cp-close-btn:hover {
  background: var(--word-btn-hover);
  color: var(--color-error);
}

.cp-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cp-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cp-label {
  width: 55px;
  font-size: 11px;
  color: var(--color-on-surface);
  flex-shrink: 0;
}

.cp-input {
  flex: 1;
  min-width: 0;
  padding: 4px 8px;
  border: 1px solid var(--color-outline-variant);
  border-radius: var(--radius-xs);
  background: var(--color-surface);
  color: var(--color-on-surface);
  font-family: var(--font-main);
  font-size: 12px;
  outline: none;
}

.cp-input:focus {
  border-color: var(--word-blue);
  box-shadow: 0 0 0 1px var(--word-blue);
}

.cp-input:disabled {
  opacity: 0.5;
  cursor: default;
}

.cp-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: 150px;
  overflow-y: auto;
  border: 1px solid var(--color-outline-variant);
  border-radius: var(--radius-xs);
  padding: 2px;
  background: var(--color-surface);
}

.cp-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: 0;
  background: transparent;
  color: var(--color-on-surface);
  font: inherit;
  font-size: 12px;
  /* `start` ולא `right`: המעטפת `dir="rtl"`, וערך מוחלט היה שובר טקסט לועזי. */
  text-align: start;
  padding: 4px 8px;
  border-radius: var(--radius-xs);
  cursor: pointer;
}

.cp-list-item:hover {
  background: var(--word-btn-hover);
}

.cp-list-item--selected {
  background: var(--color-primary-subtle);
}

.cp-list-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cp-warn {
  color: var(--color-error);
}

.cp-note {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--color-on-surface-variant);
}

.cp-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  padding: 8px 12px;
  border-block-start: 1px solid var(--color-outline-variant);
  background: var(--color-surface-container-high);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
}

.cp-btn {
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

.cp-btn:hover:not(:disabled) {
  background: var(--word-btn-hover);
  border-color: var(--word-blue);
}

/* הטקסט על הכפתור הממולא הוא `--color-on-primary` ולא לבן קבוע — ראו
   ההסבר ב-LinkDialog.vue. */
.cp-btn-primary {
  background: var(--word-blue);
  color: var(--color-on-primary);
  border-color: var(--word-blue);
}

.cp-btn-primary:hover:not(:disabled) {
  background: var(--word-blue-dark);
}

.cp-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
