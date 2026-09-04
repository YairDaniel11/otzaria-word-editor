<template>
  <!-- Teleport מאותו טעם כמו בשאר הדיאלוגים. ראו BookmarkDialog.vue. -->
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="index-entry-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="DIALOG_TITLE"
      @keydown.esc.stop="$emit('close')"
    >
      <div class="ie-header">
        <span class="ie-title">{{ DIALOG_TITLE }}</span>
        <button
          type="button"
          class="ie-close-btn"
          data-tip-title="סגור"
          data-tip-shortcut="Esc"
          aria-label="סגור את סימון ערכי המפתח"
          @click="$emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="ie-body">
        <div class="ie-row">
          <label
            for="ie-text"
            class="ie-label"
          >ערך ראשי:</label>
          <input
            id="ie-text"
            ref="textInputRef"
            v-model="text"
            type="text"
            class="ie-input"
            placeholder="למשל: שבת"
            aria-label="טקסט הערך הראשי במפתח"
            @keydown.enter="onMark"
          >
        </div>

        <div class="ie-row">
          <label
            for="ie-sub"
            class="ie-label"
          >תת-ערך:</label>
          <input
            id="ie-sub"
            v-model="subEntry"
            type="text"
            class="ie-input"
            placeholder="למשל: הדלקת נרות"
            aria-label="תת-הערך, תחת הערך הראשי"
            @keydown.enter="onMark"
          >
        </div>

        <div
          v-if="entries.length > 0"
          class="ie-list"
          role="listbox"
          aria-label="הערכים המסומנים במסמך"
        >
          <button
            v-for="entry in entries"
            :key="entry.id"
            type="button"
            class="ie-list-item"
            :class="{ 'ie-list-item--selected': entry.id === selected }"
            role="option"
            :aria-selected="entry.id === selected"
            @pointerdown.prevent
            @click="select(entry)"
          >
            <span class="ie-list-text">{{ entry.text }}</span>
            <span
              v-if="entry.subEntry"
              class="ie-list-sub"
            >{{ entry.subEntry }}</span>
          </button>
        </div>
        <p
          v-else
          class="ie-note"
          role="note"
        >
          אין ערכים מסומנים במסמך
        </p>

        <!--
          הנוסח מדויק בכוונה. המנוע מרנדר את בלוק ה-`INDEX` כרשימת הערכים
          בסדר הופעתם במסמך, בלי מיון ובלי מספרי עמודים — נמדד. השדות
          שנכתבים תקינים, ו-Word הוא שיבנה מהם מפתח ממוין וממוספר. הבטחה
          למיון כאן הייתה שקר.
        -->
        <p
          class="ie-note"
          role="note"
        >
          הערך נכנס כשדה בלתי נראה על הטקסט שסומן במסמך. המיון האלפביתי ומספרי
          העמודים נבנים כשהמסמך נפתח ב-Word.
        </p>
        <!--
          אזהרה ולא הברחה, וזו הכרעה שנמדדה: נקודתיים הן המפריד שבו Word
          מקודד תת-ערך, ולכן נקודתיים בתוך „ערך ראשי” יפצלו אותו. Word מתיר
          להבריח אותן ב-`\:`, אבל נמדד שהמנוע **אינו** מכיר את ההברחה —
          `XE "רשי\: הקדמה"` חזר מ-`entries.list` כערך `רשי\` עם תת-ערך
          ` הקדמה`. כלומר הברחה הייתה מתקנת את Word ושוברת את הרשימה כאן,
          ולכן המשתמש מקבל אזהרה במקום תיקון שקט.
        -->
        <p
          v-if="hasColon"
          class="ie-note ie-warn"
          role="alert"
        >
          הנקודתיים בטקסט הערך הן המפריד שבו Word מסמן תת-ערך, ולכן החלק שאחריהן
          ייקרא כתת-ערך.
        </p>
      </div>

      <div class="ie-footer">
        <button
          type="button"
          class="ie-btn ie-btn-primary"
          :disabled="!canMark"
          @pointerdown.prevent
          @click="onMark"
        >
          סמן
        </button>
        <button
          type="button"
          class="ie-btn"
          :disabled="!canUnmark"
          @pointerdown.prevent
          @click="onUnmark"
        >
          בטל סימון
        </button>
        <button
          type="button"
          class="ie-btn"
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
 * „סמן ערך” של קבוצת „מפתח” — הכנסת שדה `XE` והצגת הערכים שכבר סומנו.
 *
 * מציג בלבד: אינו קורא למנוע ואינו בונה קוד שדה. הוולידציה כאן היא
 * **תצוגתית**, וההכרעה עצמה היא `normalizeIndexEntryText`
 * ב-engine/index-field.ts — אותה פונקציה שהמודול קורא לה לפני השליחה. שני
 * נוסחים לאותה שאלה היו מאפשרים דיאלוג שמאשר ערך שהמודול ידחה.
 *
 * שני שדות הקלט הם בדיוק אלה של „סמן ערך של מפתח” ב-Word העברי: „ערך ראשי”
 * ו„תת-ערך”. הקידוד שלהם לשדה — נקודתיים בתוך הטקסט ולא מתג — הוא ההכרעה
 * המרכזית של הגל, וההנמקה המלאה שלו ב-engine/index-field.ts.
 *
 * נשאר פתוח אחרי „סמן” ואחרי „בטל סימון”, כמו דיאלוג הסימניות ומאותו טעם:
 * סימון ערכים במפתח הוא **הפעולה שחוזרת מאות פעמים בספר** — יותר מכל פעולה
 * אחרת בתוסף — ודיאלוג שנסגר אחרי כל ערך היה הופך אותה לבלתי אפשרית. לכן
 * הכפתור האחרון הוא „סגור” ולא „ביטול”.
 *
 * `entries` מגיע כ-prop ואינו נקרא כאן: מי שקורא את המסמך היא הלשונית, והיא
 * זו שקוראת מחדש אחרי כל פעולה. ראו BookmarkDialog.vue.
 */
import { computed, nextTick, ref, watch } from 'vue';
import {
  normalizeIndexEntryText,
  type IndexEntryDraft,
  type IndexEntrySummary,
} from '../../engine/index-field';

const props = withDefaults(
  defineProps<{
    isOpen?: boolean;
    /** הערכים המסומנים במסמך, כפי שהלשונית קראה אותם. */
    entries?: readonly IndexEntrySummary[];
    /** הטקסט שהמשתמש סימן בעורך, כהצעה ראשונה. */
    selectedText?: string;
  }>(),
  { isOpen: false, entries: () => [], selectedText: '' }
);

const emit = defineEmits<{
  (e: 'close'): void;
  /** ערך שעבר ולידציה. */
  (e: 'mark', entry: IndexEntryDraft): void;
  (e: 'unmark', address: unknown): void;
}>();

const DIALOG_TITLE = 'סימון ערך למפתח';

const text = ref('');
const subEntry = ref('');
/** מזהה הערך שנבחר ברשימה, או `''` כשאין. יעד ביטול הסימון. */
const selected = ref('');
const textInputRef = ref<HTMLInputElement | null>(null);

const canMark = computed(() => normalizeIndexEntryText(text.value) !== null);

/**
 * נקודתיים בטקסט הערך הראשי. אינן חוסמות — זו התנהגות חוקית של Word, ויש מי
 * שמתכוון לה — אבל הן שקטות מדי מכדי להשאיר בלי מילה.
 */
const hasColon = computed(() => text.value.includes(':'));

/**
 * ביטול דורש בחירה **שעדיין ברשימה**: הכתובת של שדה `XE` היא מיקומית, ואחרי
 * ביטול מוצלח ה-prop מתעדכן וההיסטים זזים. לחיצה שנייה על בחירה ישנה הייתה
 * מוחקת ערך אחר מזה שהמשתמש רואה מסומן.
 */
const canUnmark = computed(
  () => selected.value !== '' && props.entries.some((entry) => entry.id === selected.value)
);

watch(
  () => props.isOpen,
  (open) => {
    if (!open) return;
    // הטקסט המסומן בעורך הוא ההצעה, בדיוק כמו ב„סמן ערך” של Word. טקסט
    // שנשאר מפתיחה קודמת היה מסמן ערך על טקסט אחר לגמרי.
    text.value = props.selectedText;
    subEntry.value = '';
    selected.value = '';
    nextTick(() => {
      textInputRef.value?.focus();
      textInputRef.value?.select();
    });
  }
);

/** בחירה ברשימה ממלאת גם את השדות — כך ברור על מה „בטל סימון” יחול. */
function select(entry: IndexEntrySummary): void {
  selected.value = entry.id;
  text.value = entry.text;
  subEntry.value = entry.subEntry;
}

function onMark(): void {
  const normalized = normalizeIndexEntryText(text.value);
  if (normalized === null) return;
  emit('mark', { text: normalized, subEntry: subEntry.value });
}

function onUnmark(): void {
  if (!canUnmark.value) return;
  const entry = props.entries.find((item) => item.id === selected.value);
  if (!entry) return;
  emit('unmark', entry.address);
  selected.value = '';
}
</script>

<style scoped>
.index-entry-dialog {
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

.ie-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-block-end: 1px solid var(--color-outline-variant);
  padding: 6px 8px 6px 12px;
  background: var(--color-surface-container-high);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
}

.ie-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-on-surface);
}

.ie-close-btn {
  background: none;
  border: none;
  font-size: 14px;
  color: var(--color-on-surface-variant);
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--radius-xs);
}

.ie-close-btn:hover {
  background: var(--word-btn-hover);
  color: var(--color-error);
}

.ie-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ie-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ie-label {
  width: 85px;
  font-size: 11px;
  color: var(--color-on-surface);
  flex-shrink: 0;
}

.ie-input {
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

.ie-input:focus {
  border-color: var(--word-blue);
  box-shadow: 0 0 0 1px var(--word-blue);
}

.ie-list {
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

.ie-list-item {
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

.ie-list-item:hover {
  background: var(--word-btn-hover);
}

.ie-list-item--selected {
  background: var(--color-primary-subtle);
}

.ie-list-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ie-list-sub {
  font-size: 11px;
  color: var(--color-on-surface-variant);
  flex-shrink: 0;
}

.ie-warn {
  color: var(--color-error);
}

.ie-note {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--color-on-surface-variant);
}

.ie-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  padding: 8px 12px;
  border-block-start: 1px solid var(--color-outline-variant);
  background: var(--color-surface-container-high);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
}

.ie-btn {
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

.ie-btn:hover:not(:disabled) {
  background: var(--word-btn-hover);
  border-color: var(--word-blue);
}

/* הטקסט על הכפתור הממולא הוא `--color-on-primary` ולא לבן קבוע — ראו
   ההסבר ב-LinkDialog.vue. */
.ie-btn-primary {
  background: var(--word-blue);
  color: var(--color-on-primary);
  border-color: var(--word-blue);
}

.ie-btn-primary:hover:not(:disabled) {
  background: var(--word-blue-dark);
}

.ie-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
