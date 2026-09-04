<template>
  <!-- Teleport מאותו טעם כמו בשאר הדיאלוגים. ראו BookmarkDialog.vue. -->
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="toc-entry-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="DIALOG_TITLE"
      @keydown.esc.stop="$emit('close')"
    >
      <div class="te-header">
        <span class="te-title">{{ DIALOG_TITLE }}</span>
        <button
          type="button"
          class="te-close-btn"
          data-tip-title="סגור"
          data-tip-shortcut="Esc"
          aria-label="סגור את סימון הערכים"
          @click="$emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="te-body">
        <div class="te-row">
          <label
            for="te-text"
            class="te-label"
          >טקסט הערך:</label>
          <input
            id="te-text"
            ref="textInputRef"
            v-model="text"
            type="text"
            class="te-input"
            placeholder="למשל: הלכות שבת"
            aria-label="טקסט הערך שיופיע בתוכן העניינים"
            @keydown.enter="onMark"
          >
        </div>

        <div class="te-row">
          <label
            for="te-level"
            class="te-label"
          >רמה:</label>
          <select
            id="te-level"
            v-model.number="level"
            class="te-select"
            aria-label="רמת הערך בתוכן העניינים"
          >
            <option
              v-for="item in LEVELS"
              :key="item"
              :value="item"
            >
              {{ item }}
            </option>
          </select>
        </div>

        <div
          v-if="entries.length > 0"
          class="te-list"
          role="listbox"
          aria-label="הערכים המסומנים במסמך"
        >
          <button
            v-for="entry in entries"
            :key="entry.nodeId"
            type="button"
            class="te-list-item"
            :class="{ 'te-list-item--selected': entry.nodeId === selected }"
            role="option"
            :aria-selected="entry.nodeId === selected"
            @pointerdown.prevent
            @click="select(entry)"
          >
            <span class="te-list-text">{{ entry.text }}</span>
            <span class="te-list-level">רמה {{ entry.level }}</span>
          </button>
        </div>
        <p
          v-else
          class="te-note"
          role="note"
        >
          אין ערכים מסומנים במסמך
        </p>

        <p
          class="te-note"
          role="note"
        >
          הערך נכנס כשדה בלתי נראה בסוף הפסקה שבה הסמן, ומופיע בתוכן העניינים
          אחרי „עדכן טבלה”.
        </p>
      </div>

      <div class="te-footer">
        <button
          type="button"
          class="te-btn te-btn-primary"
          :disabled="!canMark"
          @pointerdown.prevent
          @click="onMark"
        >
          סמן
        </button>
        <button
          type="button"
          class="te-btn"
          :disabled="!canUnmark"
          @pointerdown.prevent
          @click="onUnmark"
        >
          בטל סימון
        </button>
        <button
          type="button"
          class="te-btn"
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
 * „סמן ערך” — הכנסת שדה `TC` והצגת הערכים שכבר סומנו.
 *
 * מציג בלבד: אינו קורא למנוע ואינו בונה קוד שדה. הוולידציה כאן היא
 * **תצוגתית**, וההכרעה עצמה היא `normalizeTocEntryText` ו-`isValidTocLevel`
 * ב-engine/toc.ts — אותן פונקציות שהמודול קורא להן לפני השליחה. שני נוסחים
 * לאותה שאלה היו מאפשרים דיאלוג שמאשר ערך שהמודול ידחה.
 *
 * נשאר פתוח אחרי „סמן” ואחרי „בטל סימון”, כמו דיאלוג הסימניות ומאותו טעם:
 * סימון ערכים הוא רצף — מסמנים כמה, מבטלים אחד, ורק אז סוגרים. לכן הכפתור
 * האחרון הוא „סגור” ולא „ביטול”.
 *
 * `entries` מגיע כ-prop ואינו נקרא כאן: מי שקורא את המסמך היא הלשונית, והיא
 * זו שקוראת מחדש אחרי כל פעולה. ראו BookmarkDialog.vue.
 */
import { computed, nextTick, ref, watch } from 'vue';
import {
  TOC_LEVEL_MAX,
  TOC_LEVEL_MIN,
  isValidTocLevel,
  normalizeTocEntryText,
  type TocEntrySummary,
} from '../../engine/toc';

const props = withDefaults(
  defineProps<{
    isOpen?: boolean;
    /** הערכים המסומנים במסמך, כפי שהלשונית קראה אותם. */
    entries?: readonly TocEntrySummary[];
    /** הטקסט שהמשתמש סימן בעורך, כהצעה ראשונה. */
    selectedText?: string;
  }>(),
  { isOpen: false, entries: () => [], selectedText: '' }
);

const emit = defineEmits<{
  (e: 'close'): void;
  /** ערך שעבר ולידציה. */
  (e: 'mark', entry: { text: string; level: number }): void;
  (e: 'unmark', nodeId: string): void;
}>();

const DIALOG_TITLE = 'סימון ערך לתוכן העניינים';

const LEVELS = Array.from(
  { length: TOC_LEVEL_MAX - TOC_LEVEL_MIN + 1 },
  (_, index) => TOC_LEVEL_MIN + index
);

const text = ref('');
const level = ref<number>(TOC_LEVEL_MIN);
/** הערך שנבחר ברשימה, או `''` כשאין. יעד ביטול הסימון. */
const selected = ref('');
const textInputRef = ref<HTMLInputElement | null>(null);

const canMark = computed(
  () => normalizeTocEntryText(text.value) !== null && isValidTocLevel(level.value)
);

/**
 * ביטול דורש בחירה **שעדיין ברשימה**: אחרי ביטול מוצלח ה-prop מתעדכן,
 * והבחירה הישנה מצביעה על ערך שאינו קיים עוד — לחיצה שנייה עליה הייתה
 * מחזירה „הערך לא נמצא” על משהו שהמשתמש כבר ביטל.
 */
const canUnmark = computed(
  () => selected.value !== '' && props.entries.some((entry) => entry.nodeId === selected.value)
);

watch(
  () => props.isOpen,
  (open) => {
    if (!open) return;
    // הטקסט המסומן בעורך הוא ההצעה, בדיוק כמו ב„סמן ערך” של Word. טקסט
    // שנשאר מפתיחה קודמת היה נכתב על פסקה אחרת מזו שהמשתמש מתכוון אליה.
    text.value = props.selectedText;
    level.value = TOC_LEVEL_MIN;
    selected.value = '';
    nextTick(() => {
      textInputRef.value?.focus();
      textInputRef.value?.select();
    });
  }
);

/** בחירה ברשימה ממלאת גם את השדות — כך ברור על מה „בטל סימון” יחול. */
function select(entry: TocEntrySummary): void {
  selected.value = entry.nodeId;
  text.value = entry.text;
  if (isValidTocLevel(entry.level)) level.value = entry.level;
}

function onMark(): void {
  const normalized = normalizeTocEntryText(text.value);
  if (normalized === null || !isValidTocLevel(level.value)) return;
  emit('mark', { text: normalized, level: level.value });
}

function onUnmark(): void {
  if (!canUnmark.value) return;
  emit('unmark', selected.value);
  selected.value = '';
}
</script>

<style scoped>
.toc-entry-dialog {
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

.te-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-block-end: 1px solid var(--color-outline-variant);
  padding: 6px 8px 6px 12px;
  background: var(--color-surface-container-high);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
}

.te-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-on-surface);
}

.te-close-btn {
  background: none;
  border: none;
  font-size: 14px;
  color: var(--color-on-surface-variant);
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--radius-xs);
}

.te-close-btn:hover {
  background: var(--word-btn-hover);
  color: var(--color-error);
}

.te-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.te-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.te-label {
  width: 85px;
  font-size: 11px;
  color: var(--color-on-surface);
  flex-shrink: 0;
}

.te-input {
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

.te-input:focus,
.te-select:focus {
  border-color: var(--word-blue);
  box-shadow: 0 0 0 1px var(--word-blue);
}

.te-select {
  padding: 4px 8px;
  border: 1px solid var(--color-outline-variant);
  border-radius: var(--radius-xs);
  background: var(--color-surface);
  color: var(--color-on-surface);
  font-family: var(--font-main);
  font-size: 12px;
  outline: none;
}

.te-list {
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

.te-list-item {
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

.te-list-item:hover {
  background: var(--word-btn-hover);
}

.te-list-item--selected {
  background: var(--color-primary-subtle);
}

.te-list-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.te-list-level {
  font-size: 11px;
  color: var(--color-on-surface-variant);
  flex-shrink: 0;
}

.te-note {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--color-on-surface-variant);
}

.te-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  padding: 8px 12px;
  border-block-start: 1px solid var(--color-outline-variant);
  background: var(--color-surface-container-high);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
}

.te-btn {
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

.te-btn:hover:not(:disabled) {
  background: var(--word-btn-hover);
  border-color: var(--word-blue);
}

/* הטקסט על הכפתור הממולא הוא `--color-on-primary` ולא לבן קבוע — ראו
   ההסבר ב-LinkDialog.vue. */
.te-btn-primary {
  background: var(--word-blue);
  color: var(--color-on-primary);
  border-color: var(--word-blue);
}

.te-btn-primary:hover:not(:disabled) {
  background: var(--word-blue-dark);
}

.te-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
