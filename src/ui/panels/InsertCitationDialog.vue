<template>
  <!-- Teleport מאותו טעם כמו בשאר הדיאלוגים. ראו BookmarkDialog.vue. -->
  <Teleport to="body">
    <div
      v-if="isOpen"
      ref="dialogRef"
      class="insert-citation-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="DIALOG_TITLE"
      tabindex="-1"
      @keydown.esc.stop="$emit('close')"
    >
      <div class="ic-header">
        <span class="ic-title">{{ DIALOG_TITLE }}</span>
        <button
          type="button"
          class="ic-close-btn"
          data-tip-title="סגור"
          data-tip-shortcut="Esc"
          aria-label="סגור את הוספת הציטוט"
          @click="$emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="ic-body">
        <div
          v-if="sources.length > 0"
          class="ic-list"
          role="listbox"
          aria-label="המקורות שאפשר לצטט"
        >
          <button
            v-for="source in sources"
            :key="source.id"
            type="button"
            class="ic-list-item"
            :class="{ 'ic-list-item--selected': source.id === selected }"
            role="option"
            :aria-selected="source.id === selected"
            @pointerdown.prevent
            @click="selected = source.id"
            @dblclick="onInsert"
          >
            <span class="ic-list-text">{{ source.label }}</span>
          </button>
        </div>
        <p
          v-else
          class="ic-note"
          role="note"
        >
          אין מקורות במסמך. יש להוסיף מקור ב„נהל מקורות” לפני שאפשר לצטט.
        </p>

        <!--
          הנוסח מדויק בכוונה, ומדוד: השדה שנכתב הוא `CITATION <tag>` תקני,
          והתצוגה שעל המסך היא הכותרת בסוגריים מרובעים. הניסוח הסופי —
          „(כהן, תשע״ה)” — נבנה ב-Word מהסגנון הביבליוגרפי. הבטחה לניסוח
          מסוים כאן הייתה שקר. ההנמקה המלאה ב-engine/citations.ts.
        -->
        <p
          class="ic-note"
          role="note"
        >
          הציטוט נכנס במקום הסמן כשדה. הניסוח הסופי שלו נבנה כשהמסמך נפתח
          ב-Word, לפי סגנון הביבליוגרפיה שבמסמך.
        </p>
      </div>

      <div class="ic-footer">
        <button
          type="button"
          class="ic-btn ic-btn-primary"
          :disabled="!canInsert"
          @pointerdown.prevent
          @click="onInsert"
        >
          הוסף
        </button>
        <button
          type="button"
          class="ic-btn"
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
 * „הוסף ציטוט” של קבוצת „ציטוטים וביבליוגרפיה”.
 *
 * מציג בלבד: אינו קורא למנוע ואינו בונה קוד שדה.
 *
 * ## מקור אחד, ולא סימון מרובה
 *
 * `citations.insert` מקבל `sourceIds: string[]`, ומפתה להציע כאן תיבות
 * סימון. הוא אינו מוצע, ומטעם שנמדד: בשני מקורות נכתב
 * `CITATION src-a;src-b`, ותחביר ריבוי המקורות של Word הוא המתג `\m`.
 * רשימה שמאפשרת לבחור שניים הייתה מייצרת שדה שהמסמך שבור בגללו. ההנמקה
 * המלאה ב-engine/citations.ts.
 *
 * נשאר פתוח אחרי „הוסף”, כמו דיאלוג הסימניות ומאותו טעם: אותו מקור מצוטט
 * במקומות רבים בספר אחד. לכן הכפתור האחרון הוא „סגור” ולא „ביטול”.
 *
 * `sources` מגיע כ-prop ואינו נקרא כאן: מי שקורא את המסמך היא הלשונית.
 */
import { computed, nextTick, ref, watch } from 'vue';
import type { CitationSourceSummary } from '../../engine/citations';

const props = withDefaults(
  defineProps<{
    isOpen?: boolean;
    /** המקורות שבמסמך, כפי שהלשונית קראה אותם. */
    sources?: readonly CitationSourceSummary[];
  }>(),
  { isOpen: false, sources: () => [] }
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'insert', sourceId: string): void;
}>();

const DIALOG_TITLE = 'הוספת ציטוט';

const selected = ref('');
/**
 * שורש הדיאלוג. אין כאן שדה קלט למקד — הרשימה היא כפתורים — ולכן בלי המיקוד
 * הזה הפוקוס נשאר על כפתור הרצועה, מחוץ ל-Teleport, ו-Escape **אינו** מגיע
 * למאזין שעל השורש. ה-`title` על כפתור הסגירה מבטיח „Esc”, וכל שאר
 * הדיאלוגים ממקדים בפתיחה. ראו IndexEntryDialog.vue.
 */
const dialogRef = ref<HTMLElement | null>(null);

/**
 * הבחירה דורשת מקור **שעדיין ברשימה**: הרשימה נקראת מחדש אחרי כל פעולה,
 * ומקור שנמחק בינתיים היה משאיר כאן מזהה מת שהלחיצה עליו שולחת למנוע.
 */
const canInsert = computed(() =>
  props.sources.some((source) => source.id === selected.value)
);

watch(
  () => props.isOpen,
  (open) => {
    if (!open) return;
    // המקור הראשון כברירת מחדל: ברוב המסמכים יש מקור אחד או שניים, ובחירה
    // ריקה הייתה מחייבת לחיצה מיותרת בכל ציטוט.
    selected.value = props.sources[0]?.id ?? '';
    nextTick(() => {
      dialogRef.value?.focus();
    });
  }
);

function onInsert(): void {
  if (!canInsert.value) return;
  emit('insert', selected.value);
}
</script>

<style scoped>
.insert-citation-dialog {
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

.ic-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-block-end: 1px solid var(--color-outline-variant);
  padding: 6px 8px 6px 12px;
  background: var(--color-surface-container-high);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
}

.ic-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-on-surface);
}

.ic-close-btn {
  background: none;
  border: none;
  font-size: 14px;
  color: var(--color-on-surface-variant);
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--radius-xs);
}

.ic-close-btn:hover {
  background: var(--word-btn-hover);
  color: var(--color-error);
}

.ic-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ic-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: 180px;
  overflow-y: auto;
  border: 1px solid var(--color-outline-variant);
  border-radius: var(--radius-xs);
  padding: 2px;
  background: var(--color-surface);
}

.ic-list-item {
  display: flex;
  align-items: center;
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

.ic-list-item:hover {
  background: var(--word-btn-hover);
}

.ic-list-item--selected {
  background: var(--color-primary-subtle);
}

.ic-list-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ic-note {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--color-on-surface-variant);
}

.ic-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  padding: 8px 12px;
  border-block-start: 1px solid var(--color-outline-variant);
  background: var(--color-surface-container-high);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
}

.ic-btn {
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

.ic-btn:hover:not(:disabled) {
  background: var(--word-btn-hover);
  border-color: var(--word-blue);
}

/* הטקסט על הכפתור הממולא הוא `--color-on-primary` ולא לבן קבוע — ראו
   ההסבר ב-LinkDialog.vue. */
.ic-btn-primary {
  background: var(--word-blue);
  color: var(--color-on-primary);
  border-color: var(--word-blue);
}

.ic-btn-primary:hover:not(:disabled) {
  background: var(--word-blue-dark);
}

.ic-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
