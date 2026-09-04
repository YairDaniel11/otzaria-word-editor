<template>
  <!-- Teleport מאותו טעם כמו בשאר הדיאלוגים. ראו BookmarkDialog.vue. -->
  <Teleport to="body">
    <div
      v-if="isOpen"
      ref="dialogRef"
      class="note-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="DIALOG_TITLE"
      tabindex="-1"
      @keydown.esc.stop="$emit('close')"
    >
      <div class="np-header">
        <span class="np-title">{{ DIALOG_TITLE }}</span>
        <button
          type="button"
          class="np-close-btn"
          data-tip-title="סגור"
          data-tip-shortcut="Esc"
          aria-label="סגור את ההערות"
          @click="$emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="np-body">
        <div
          v-if="notes.length > 0"
          class="np-list"
          role="listbox"
          aria-label="ההערות שבמסמך"
        >
          <button
            v-for="note in notes"
            :key="`${note.type}-${note.id}`"
            type="button"
            class="np-list-item"
            :class="{ 'np-list-item--selected': isSelected(note) }"
            role="option"
            :aria-selected="isSelected(note)"
            @pointerdown.prevent
            @click="select(note)"
          >
            <span class="np-list-text">{{ note.display }}</span>
          </button>
        </div>
        <p
          v-else
          class="np-note"
          role="note"
        >
          אין הערות במסמך
        </p>

        <div class="np-row">
          <label
            for="np-content"
            class="np-label"
          >תוכן:</label>
          <input
            id="np-content"
            ref="contentInputRef"
            v-model="content"
            type="text"
            class="np-input"
            :disabled="selected === null || busy"
            :placeholder="selected === null ? 'יש לבחור הערה מהרשימה' : 'תוכן ההערה'"
            aria-label="תוכן ההערה שנבחרה"
            @keydown.enter="onSubmit"
          >
        </div>

        <!--
          המספר מוצג ברשימה מפני שהוא מה שמזהה הערה, והמשפט הזה קיים מפני
          שהוא **אינו** בהכרח המספר שיופיע ב-Word: המנוע מספר לפי סדר
          היצירה ואינו ממספר מחדש אחרי הסרה, ו-Word מספר לפי סדר ההופעה
          במסמך ומחשב בכל פתיחה. אמירה שקטה כאן עדיפה על משתמש שסופר.
        -->
        <p
          class="np-note"
          role="note"
        >
          המספרים כאן הם סדר היצירה. Word ממספר את ההערות מחדש לפי סדר הופעתן
          במסמך בכל פתיחה.
        </p>

        <!--
          אזהרה שנמדדה, ולא זהירות כללית: כתובת ההערה אינה נושאת את סוגה,
          ולכן הערת סיום שמספרה זהה למספר של הערת שוליים קיימת אינה ניתנת
          לפנייה. הפעולה תסרב, ועדיף שהמשתמש ידע לפני הלחיצה. ההנמקה
          ב-engine/footnotes.ts.
        -->
        <p
          v-if="ambiguous"
          class="np-note np-warn"
          role="alert"
        >
          הערת הסיום הזאת נושאת את אותו מספר כמו הערת שוליים שבמסמך, והמנוע
          אינו יודע להבדיל ביניהן — אי אפשר לערוך אותה או להסיר אותה כאן.
        </p>
      </div>

      <div class="np-footer">
        <button
          type="button"
          class="np-btn np-btn-primary"
          :disabled="!canSubmit"
          @pointerdown.prevent
          @click="onSubmit"
        >
          שמור שינויים
        </button>
        <button
          type="button"
          class="np-btn"
          :disabled="!canRemove"
          @pointerdown.prevent
          @click="onRemove"
        >
          הסר הערה
        </button>
        <button
          type="button"
          class="np-btn"
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
 * „נהל הערות” של קבוצת „הערות שוליים” — עריכה והסרה של ההערות שכבר במסמך.
 *
 * **אין כאן הוספה**, וזו אינה השמטה: `footnotes.insert` מכניס את ההערה
 * במקום הסמן, והסמן אינו בעורך מרגע שהדיאלוג נפתח (נמדד — בלי בחירה חיה
 * הפעולה מוחזרת `PRECONDITION_FAILED / live-selection-unavailable`). לכן
 * ההוספה נשארה על שני הכפתורים שברצועה, שם הסמן עדיין במסמך, והדיאלוג הוא
 * מה שעושים אחרי שההערה כבר קיימת.
 *
 * מציג בלבד: אינו קורא למנוע. הוולידציה כאן היא **תצוגתית**, וההכרעה עצמה
 * היא `normalizeNoteContent` ב-engine/footnotes.ts — אותה פונקציה שהמודול
 * קורא לה לפני השליחה. שני נוסחים לאותה שאלה היו מאפשרים דיאלוג שמאשר תוכן
 * שהמודול ידחה.
 *
 * נשאר פתוח אחרי כל פעולה, כמו דיאלוג הסימניות: ספר עם מאות הערות שוליים
 * נערך בסדרה, ודיאלוג שנסגר אחרי כל אחת היה מס.
 *
 * `notes` מגיע כ-prop ואינו נקרא כאן: מי שקורא את המסמך היא הלשונית, והיא
 * זו שקוראת מחדש אחרי כל פעולה. ראו BookmarkDialog.vue.
 */
import { computed, nextTick, ref, watch } from 'vue';
import {
  normalizeNoteContent,
  type NoteRef,
  type NoteSummary,
} from '../../engine/footnotes';

const props = withDefaults(
  defineProps<{
    isOpen?: boolean;
    /** ההערות שבמסמך, כפי שהלשונית קראה אותן. */
    notes?: readonly NoteSummary[];
    /**
     * פעולה על הערה שיצאה לדרך וטרם חזרה. ההנמקה בהערת ה„נעילה” למטה.
     */
    busy?: boolean;
  }>(),
  { isOpen: false, notes: () => [], busy: false }
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'update', payload: { ref: NoteRef; content: string }): void;
  (e: 'remove', ref: NoteRef): void;
}>();

const DIALOG_TITLE = 'הערות שוליים והערות סיום';

const content = ref('');
/** ההערה שנבחרה ברשימה, או `null` כשלא נבחרה. */
const selected = ref<NoteRef | null>(null);
const contentInputRef = ref<HTMLInputElement | null>(null);
const dialogRef = ref<HTMLElement | null>(null);

function isSelected(note: NoteSummary): boolean {
  return selected.value?.id === note.id && selected.value?.type === note.type;
}

/**
 * הבחירה דורשת הערה **שעדיין ברשימה**: אחרי כל פעולה ה-prop מתחלף, והמזהה
 * שנבחר עשוי כבר לא להיות שם. לחיצה שנייה על בחירה ישנה הייתה מכוונת
 * להערה אחרת מזו שהמשתמש רואה מסומנת.
 */
const live = computed(() =>
  props.notes.find(
    (note) => note.id === selected.value?.id && note.type === selected.value?.type
  )
);

/**
 * הערת סיום שיש הערת שוליים באותו מספר — כלומר כתובת שהמנוע יפתור להערה
 * האחרת. אותה בדיקה בדיוק שהמודול עושה מול `footnotes.get`, כאן רק כדי
 * להסביר מראש ולנטרל. ראו האזהרה בתבנית.
 *
 * **מושווה `id` ונאמר למשתמש „אותו מספר”, וזו הנחה ולא זהות.** מה שמתנגש
 * הוא ה-`noteId` שבכתובת, ומה שהמשתמש רואה ברשימה הוא `displayNumber`;
 * בכל המדידות של הגל השניים היו זהים (המנוע מקצה `noteId` רץ לכל סוג
 * ומדווח אותו גם כ-`displayNumber`), ולכן הניסוח מדויק היום. מסמך docx
 * מיובא שבו `w:id` אינם רציפים יפריד ביניהם, ואז האזהרה תדבר על מספר שאינו
 * על המסך — הרגע שבו יש להחליף את הניסוח בזיהוי שהמשתמש רואה.
 */
const ambiguous = computed(
  () =>
    live.value?.type === 'endnote' &&
    props.notes.some((note) => note.type === 'footnote' && note.id === live.value?.id)
);

/**
 * ## הנעילה בזמן פעולה
 *
 * `busy` מנטרל את שני כפתורי הפעולה ואת שדה התוכן, **ואינו סוגר את
 * הדיאלוג**. שתי סיבות, וההנמקה המלאה של הנעילה עצמה ב-ReferencesTab.vue:
 * הדיאלוג נשאר פתוח אחרי כל פעולה מלכתחילה (ספר נערך בסדרה), וסגירה
 * שהייתה קופצת באמצע פעולה הייתה מוחקת את הבחירה ואת הטקסט שהמשתמש
 * הקליד — כלומר עונש על מי שלחץ „שמור” בזמן ששמירה קודמת עדיין רצה. גם
 * „סגור” נשאר פעיל: סגירה אינה נוגעת במסמך, והנעילה חיה בלשונית ולא כאן.
 */
const canRemove = computed(
  () => live.value !== undefined && !ambiguous.value && !props.busy
);

const canSubmit = computed(
  () => canRemove.value && normalizeNoteContent(content.value) !== null
);

function select(note: NoteSummary): void {
  selected.value = { id: note.id, type: note.type };
  content.value = note.content;
  nextTick(() => contentInputRef.value?.focus());
}

watch(
  () => props.isOpen,
  (open) => {
    if (!open) return;
    selected.value = null;
    content.value = '';
    // המסגרת עצמה ולא שדה התוכן, כמו בדיאלוג הוספת הציטוט: התוכן מנוטרל כל
    // עוד לא נבחרה הערה, ואלמנט מנוטרל אינו יכול לקבל מיקוד — כלומר בלי זה
    // אף אלמנט בדיאלוג אינו ממוקד, ו-Escape (שיושב על המסגרת) אינו מגיע.
    nextTick(() => dialogRef.value?.focus());
  }
);

function onSubmit(): void {
  if (!canSubmit.value || !selected.value) return;
  emit('update', { ref: selected.value, content: content.value });
  // הבחירה **נשמרת**, שלא כמו בדיאלוג הכיתובים: שם העריכה היא הסרה והוספה
  // מחדש ולכן הכתובת מתחלפת, וכאן `footnotes.update` מחליף את התוכן במקום
  // ו-`noteId` נשאר מה שהיה (נמדד). המשתמש יכול להמשיך לתקן את אותה הערה.
}

function onRemove(): void {
  if (!canRemove.value || !selected.value) return;
  emit('remove', selected.value);
  selected.value = null;
  content.value = '';
}
</script>

<style scoped>
.note-dialog {
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

.np-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-block-end: 1px solid var(--color-outline-variant);
  padding: 6px 8px 6px 12px;
  background: var(--color-surface-container-high);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
}

.np-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-on-surface);
}

.np-close-btn {
  background: none;
  border: none;
  font-size: 14px;
  color: var(--color-on-surface-variant);
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--radius-xs);
}

.np-close-btn:hover {
  background: var(--word-btn-hover);
  color: var(--color-error);
}

.np-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.np-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.np-label {
  width: 55px;
  font-size: 11px;
  color: var(--color-on-surface);
  flex-shrink: 0;
}

.np-input {
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

.np-input:focus {
  border-color: var(--word-blue);
  box-shadow: 0 0 0 1px var(--word-blue);
}

.np-input:disabled {
  opacity: 0.5;
  cursor: default;
}

.np-list {
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

.np-list-item {
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

.np-list-item:hover {
  background: var(--word-btn-hover);
}

.np-list-item--selected {
  background: var(--color-primary-subtle);
}

.np-list-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.np-warn {
  color: var(--color-error);
}

.np-note {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--color-on-surface-variant);
}

.np-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  padding: 8px 12px;
  border-block-start: 1px solid var(--color-outline-variant);
  background: var(--color-surface-container-high);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
}

.np-btn {
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

.np-btn:hover:not(:disabled) {
  background: var(--word-btn-hover);
  border-color: var(--word-blue);
}

/* הטקסט על הכפתור הממולא הוא `--color-on-primary` ולא לבן קבוע — ראו
   ההסבר ב-LinkDialog.vue. */
.np-btn-primary {
  background: var(--word-blue);
  color: var(--color-on-primary);
  border-color: var(--word-blue);
}

.np-btn-primary:hover:not(:disabled) {
  background: var(--word-blue-dark);
}

.np-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
