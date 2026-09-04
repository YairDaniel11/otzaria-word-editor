<template>
  <!--
    Teleport ולא רינדור במקום — אותו טעם בדיוק כמו ב-LinkDialog.vue:
    `.word-ribbon-body` מוגדר `overflow-y: hidden`, ודיאלוג שנפתח מתוך לשונית
    נחתך בגובה הרצועה.
  -->
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="bookmark-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="DIALOG_TITLE"
      @keydown.esc.stop="$emit('close')"
    >
      <div class="bd-header">
        <span class="bd-title">{{ DIALOG_TITLE }}</span>
        <button
          type="button"
          class="bd-close-btn"
          data-tip-title="סגור"
          data-tip-shortcut="Esc"
          aria-label="סגור את הסימניות"
          @click="$emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="bd-body">
        <div class="bd-input-row">
          <label
            for="bd-name-input"
            class="bd-label"
          >שם הסימנייה:</label>
          <input
            id="bd-name-input"
            ref="nameInputRef"
            v-model="name"
            type="text"
            class="bd-input"
            placeholder="למשל: פרק_ראשון"
            aria-label="שם הסימנייה"
            :aria-invalid="showError"
            :aria-describedby="showError ? 'bd-name-error' : undefined"
            @input="edited = true"
            @keydown.enter="onAdd"
          >
        </div>

        <p
          v-if="showError"
          id="bd-name-error"
          class="bd-error"
          role="alert"
        >
          {{ errorText }}
        </p>

        <!--
          הרשימה היא `listbox` ולא `<select>`: היא צריכה להיות גלויה כולה כמו
          בדיאלוג של Word, ולא להיפתח בלחיצה נוספת.
        -->
        <div
          v-if="names.length > 0"
          class="bd-list"
          role="listbox"
          aria-label="הסימניות שבמסמך"
        >
          <button
            v-for="item in names"
            :key="item"
            type="button"
            class="bd-list-item"
            :class="{ 'bd-list-item--selected': item === selected }"
            role="option"
            :aria-selected="item === selected"
            @pointerdown.prevent
            @click="select(item)"
          >
            {{ item }}
          </button>
        </div>
        <p
          v-else
          class="bd-note"
          role="note"
        >
          אין סימניות במסמך
        </p>

        <p
          class="bd-note"
          role="note"
        >
          הסימנייה מסמנת את הפסקה שבה הסמן. מחיקתה מסירה את הסימון בלבד, והטקסט
          נשאר במקומו.
        </p>
      </div>

      <div class="bd-footer">
        <button
          type="button"
          class="bd-btn bd-btn-primary"
          :disabled="!canAdd"
          @pointerdown.prevent
          @click="onAdd"
        >
          הוסף
        </button>
        <button
          type="button"
          class="bd-btn"
          :disabled="!canRename"
          @pointerdown.prevent
          @click="onRename"
        >
          שנה שם
        </button>
        <button
          type="button"
          class="bd-btn"
          :disabled="!canRemove"
          @pointerdown.prevent
          @click="onRemove"
        >
          מחק
        </button>
        <button
          type="button"
          class="bd-btn"
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
 * דיאלוג הסימניות — התרגום של „הוספה → קישורים → סימנייה” ב-Word העברי.
 *
 * מציג בלבד: אינו קורא למנוע ואינו בונה payload. הוולידציה שיושבת כאן היא
 * **תצוגתית** — האם להציג שגיאה ואם לאפשר אישור — וההכרעה עצמה היא
 * `normalizeBookmarkName` ב-engine/bookmarks.ts, אותה פונקציה שהמודול קורא
 * לה לפני השליחה. שני נוסחים לאותה שאלה היו מאפשרים דיאלוג שמאשר שם שהמודול
 * ידחה, כלומר כפתור שנלחץ ולא קורה כלום. זו התבנית של LinkDialog.vue מול
 * `normalizeLinkHref`, ומאותו טעם.
 *
 * שאלה אחת נשאלת כאן ורק כאן: **האם השם כבר תפוס.** המנוע יודע לענות עליה,
 * אבל התשובה שלו מגיעה למשתמש כתרגום הגנרי של `INVALID_INPUT` — „הפעולה
 * קיבלה ערך שאינו חוקי” על שם תקין לגמרי. הדיאלוג מחזיק את `names` ממילא,
 * ולכן הוא זה שאומר את זה בשם המפורש. ראו `BOOKMARK_NAME_TAKEN_HINT`.
 *
 * ההבדל מ-LinkDialog: הדיאלוג הזה **נשאר פתוח** אחרי „הוסף” או „מחק”. בדיאלוג
 * הסימניות של Word ניהול הסימניות הוא רצף — מוסיפים אחת, מוחקים שתיים, ורק
 * אז סוגרים — ודיאלוג שנסגר בכל פעולה היה מכריח לפתוח אותו מחדש שלוש פעמים.
 * לכן גם הכפתור האחרון הוא „סגור” ולא „ביטול”: אין כאן מה לבטל, הפעולות
 * כבר בוצעו.
 *
 * `names` מגיע כ-prop ולא נקרא כאן: מי שקורא את המסמך הוא הלשונית, והיא זו
 * שקוראת מחדש אחרי כל פעולה. דיאלוג שקורא מהמנוע בעצמו היה מחזיק מסלול שני
 * לאותו מידע.
 *
 * אין „עבור אל”. ההנמקה ב-engine/bookmarks.ts.
 */
import { computed, nextTick, ref, watch } from 'vue';
import {
  BOOKMARK_NAME_HINT,
  BOOKMARK_NAME_TAKEN_HINT,
  normalizeBookmarkName,
} from '../../engine/bookmarks';

const props = withDefaults(
  defineProps<{
    isOpen?: boolean;
    /** שמות הסימניות שבמסמך, כפי שהלשונית קראה אותם. */
    names?: readonly string[];
  }>(),
  { isOpen: false, names: () => [] }
);

const emit = defineEmits<{
  (e: 'close'): void;
  /** שם שעבר ולידציה. */
  (e: 'add', name: string): void;
  (e: 'remove', name: string): void;
  (e: 'rename', change: { from: string; to: string }): void;
}>();

const DIALOG_TITLE = 'סימנייה';

const name = ref('');
/** הסימנייה שנבחרה ברשימה, או `''` כשאין. יעד המחיקה ושינוי השם. */
const selected = ref('');
/**
 * האם המשתמש **הקליד** בשדה מאז שהדיאלוג נפתח או מאז בחירה ברשימה. רק
 * הקלדה מדליקה שגיאה — ראו `select`.
 */
const edited = ref(false);
const nameInputRef = ref<HTMLInputElement | null>(null);

const normalized = computed(() => normalizeBookmarkName(name.value));

/**
 * „כבר קיים” נחסם כאן ולא במנוע.
 *
 * המנוע כן דוחה שם כפול, אבל הקבלה שלו מגיעה למשתמש כתרגום הגנרי של
 * `INVALID_INPUT` („ערך שאינו חוקי”) — על שם תקין לגמרי. ההסבר המלא ליד
 * `BOOKMARK_NAME_TAKEN_HINT` ב-engine/bookmarks.ts.
 *
 * ההשוואה היא על `normalized` ולא על `name.value` הגולמי, מפני שזה בדיוק
 * הערך שנשלח למנוע ושייכתב לרשימה — „הקדמה  ” ו„הקדמה” הם אותה סימנייה.
 */
const isTaken = computed(
  () => normalized.value !== null && props.names.includes(normalized.value)
);

const canAdd = computed(() => normalized.value !== null && !isTaken.value);

/**
 * מחיקה דורשת בחירה **שעדיין ברשימה**: אחרי מחיקה מוצלחת ה-prop מתעדכן,
 * והבחירה הישנה מצביעה על שם שאינו קיים עוד — לחיצה שנייה עליה הייתה
 * מחזירה „הסימנייה לא נמצאה” על משהו שהמשתמש כבר מחק.
 */
const canRemove = computed(() => selected.value !== '' && props.names.includes(selected.value));

/** שינוי שם דורש גם יעד קיים, גם שם חדש תקין, וגם שהם אינם זהים. */
const canRename = computed(
  () => canRemove.value && canAdd.value && normalized.value !== selected.value
);

/**
 * השגיאה מוצגת רק אחרי שהמשתמש הקליד משהו. הצגה על שדה ריק פירושה דיאלוג
 * שנפתח עם הודעת שגיאה, בלי שאיש עשה כלום. כמו ב-LinkDialog.
 *
 * שני נוסחים ולא אחד: „שם פסול” ו„שם תפוס” הם שתי טעויות שונות, ותיקון אחד
 * אינו מתקן את השנייה. הודעה שאומרת „מתחיל באות…” על שם שמתחיל באות היא
 * הודעה ששולחת את המשתמש לתקן דבר תקין.
 */
const errorText = computed<string | null>(() => {
  if (!edited.value || name.value.trim() === '') return null;
  if (normalized.value === null) return BOOKMARK_NAME_HINT;
  return isTaken.value ? BOOKMARK_NAME_TAKEN_HINT : null;
});

const showError = computed(() => errorText.value !== null);

watch(
  () => props.isOpen,
  (open) => {
    if (!open) return;
    // הדיאלוג נפתח נקי בכל פעם: שם שנשאר מפתיחה קודמת היה נכתב למסמך אחר
    // מזה שהמשתמש התכוון אליו.
    name.value = '';
    selected.value = '';
    edited.value = false;
    nextTick(() => {
      nameInputRef.value?.focus();
      nameInputRef.value?.select();
    });
  }
);

/**
 * בחירה ברשימה ממלאת גם את השדה — כך „שנה שם” הוא הקלדה מעל השם הקיים,
 * וכך גם ברור על מה „מחק” יחול.
 *
 * `edited` מתאפס כאן, ולכן הבחירה עצמה אינה מדליקה שגיאה. בחירה אינה
 * הקלדה: השם ברשימה כבר במסמך — הוא תפוס בהגדרה, ואם המסמך הגיע מ-Word גם
 * ייתכן שאינו עומד בכללים שלנו (שם עם רווח נכתב שם בלי בעיה). שגיאה אדומה
 * על לחיצה שהמשתמש עשה כדי **למחוק** סימנייה מאשימה אותו במשהו שלא עשה.
 * מרגע שהוא נוגע בשדה — זו כבר הקלדה, והשגיאה נדלקת כרגיל.
 */
function select(item: string): void {
  selected.value = item;
  name.value = item;
  edited.value = false;
}

function onAdd(): void {
  if (!canAdd.value) return;
  emit('add', normalized.value as string);
}

function onRemove(): void {
  if (!canRemove.value) return;
  emit('remove', selected.value);
  selected.value = '';
}

function onRename(): void {
  if (!canRename.value) return;
  emit('rename', { from: selected.value, to: normalized.value as string });
  selected.value = '';
}
</script>

<style scoped>
.bookmark-dialog {
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

.bd-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-block-end: 1px solid var(--color-outline-variant);
  padding: 6px 8px 6px 12px;
  background: var(--color-surface-container-high);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
}

.bd-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-on-surface);
}

.bd-close-btn {
  background: none;
  border: none;
  font-size: 14px;
  color: var(--color-on-surface-variant);
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--radius-xs);
}

.bd-close-btn:hover {
  background: var(--word-btn-hover);
  color: var(--color-error);
}

.bd-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bd-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bd-label {
  width: 85px;
  font-size: 11px;
  color: var(--color-on-surface);
  flex-shrink: 0;
}

.bd-input {
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

.bd-input:focus {
  border-color: var(--word-blue);
  box-shadow: 0 0 0 1px var(--word-blue);
}

.bd-input[aria-invalid='true'] {
  border-color: var(--color-error);
}

.bd-list {
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

.bd-list-item {
  border: 0;
  background: transparent;
  color: var(--color-on-surface);
  font: inherit;
  font-size: 12px;
  /* `start` ולא `right`: המעטפת `dir="rtl"`, וערך מוחלט היה שובר שם לועזי. */
  text-align: start;
  padding: 4px 8px;
  border-radius: var(--radius-xs);
  cursor: pointer;
}

.bd-list-item:hover {
  background: var(--word-btn-hover);
}

.bd-list-item--selected {
  background: var(--color-primary-subtle);
}

.bd-note {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--color-on-surface-variant);
}

.bd-error {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--color-error);
}

.bd-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  padding: 8px 12px;
  border-block-start: 1px solid var(--color-outline-variant);
  background: var(--color-surface-container-high);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
}

.bd-btn {
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

.bd-btn:hover:not(:disabled) {
  background: var(--word-btn-hover);
  border-color: var(--word-blue);
}

/* הטקסט על הכפתור הממולא הוא `--color-on-primary` ולא לבן קבוע — ראו
   ההסבר ב-LinkDialog.vue. */
.bd-btn-primary {
  background: var(--word-blue);
  color: var(--color-on-primary);
  border-color: var(--word-blue);
}

.bd-btn-primary:hover:not(:disabled) {
  background: var(--word-blue-dark);
}

.bd-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
