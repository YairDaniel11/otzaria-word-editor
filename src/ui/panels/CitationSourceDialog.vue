<template>
  <!-- Teleport מאותו טעם כמו בשאר הדיאלוגים. ראו BookmarkDialog.vue. -->
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="citation-source-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="DIALOG_TITLE"
      @keydown.esc.stop="$emit('close')"
    >
      <div class="cs-header">
        <span class="cs-title">{{ DIALOG_TITLE }}</span>
        <button
          type="button"
          class="cs-close-btn"
          data-tip-title="סגור"
          data-tip-shortcut="Esc"
          aria-label="סגור את ניהול המקורות"
          @click="$emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="cs-body">
        <div
          v-if="sources.length > 0"
          class="cs-list"
          role="listbox"
          aria-label="המקורות שבמסמך"
        >
          <button
            v-for="source in sources"
            :key="source.id"
            type="button"
            class="cs-list-item"
            :class="{ 'cs-list-item--selected': source.id === selected }"
            role="option"
            :aria-selected="source.id === selected"
            @pointerdown.prevent
            @click="select(source)"
          >
            <span class="cs-list-text">{{ source.label }}</span>
            <span
              v-if="source.citedCount > 0"
              class="cs-list-badge"
            >{{ source.citedCount }} ציטוטים</span>
          </button>
        </div>
        <p
          v-else
          class="cs-note"
          role="note"
        >
          אין מקורות במסמך
        </p>

        <div class="cs-row">
          <label
            for="cs-type"
            class="cs-label"
          >סוג המקור:</label>
          <select
            id="cs-type"
            v-model="draft.type"
            class="cs-input"
            aria-label="סוג המקור"
            :disabled="selected !== ''"
          >
            <option
              v-for="option in CITATION_SOURCE_TYPES"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </div>

        <div class="cs-row">
          <label
            for="cs-title"
            class="cs-label"
          >כותרת:</label>
          <input
            id="cs-title"
            ref="titleInputRef"
            v-model="draft.title"
            type="text"
            class="cs-input"
            placeholder="למשל: שולחן ערוך, אורח חיים"
            aria-label="כותרת המקור"
            @keydown.enter="onSubmit"
          >
        </div>

        <div class="cs-row cs-row--top">
          <label
            for="cs-authors"
            class="cs-label"
          >מחבר:</label>
          <textarea
            id="cs-authors"
            v-model="draft.authors"
            class="cs-input cs-textarea"
            rows="2"
            placeholder="שם לכל שורה"
            aria-label="מחברי המקור, שם לכל שורה"
          />
        </div>

        <div class="cs-row">
          <label
            for="cs-year"
            class="cs-label"
          >שנה:</label>
          <input
            id="cs-year"
            v-model="draft.year"
            type="text"
            class="cs-input"
            placeholder="למשל: תשע״ה"
            aria-label="שנת ההוצאה"
            @keydown.enter="onSubmit"
          >
        </div>

        <template v-if="showJournalFields">
          <div class="cs-row">
            <label
              for="cs-journal"
              class="cs-label"
            >שם הקובץ:</label>
            <input
              id="cs-journal"
              v-model="draft.journalName"
              type="text"
              class="cs-input"
              aria-label="שם כתב העת או הקובץ"
              @keydown.enter="onSubmit"
            >
          </div>
          <div class="cs-row">
            <label
              for="cs-volume"
              class="cs-label"
            >כרך:</label>
            <input
              id="cs-volume"
              v-model="draft.volume"
              type="text"
              class="cs-input"
              aria-label="כרך"
              @keydown.enter="onSubmit"
            >
          </div>
          <div class="cs-row">
            <label
              for="cs-pages"
              class="cs-label"
            >עמודים:</label>
            <input
              id="cs-pages"
              v-model="draft.pages"
              type="text"
              class="cs-input"
              aria-label="טווח העמודים"
              @keydown.enter="onSubmit"
            >
          </div>
        </template>
        <template v-else>
          <div class="cs-row">
            <label
              for="cs-city"
              class="cs-label"
            >עיר:</label>
            <input
              id="cs-city"
              v-model="draft.city"
              type="text"
              class="cs-input"
              placeholder="למשל: ירושלים"
              aria-label="עיר ההוצאה"
              @keydown.enter="onSubmit"
            >
          </div>
          <div class="cs-row">
            <label
              for="cs-publisher"
              class="cs-label"
            >מוציא לאור:</label>
            <input
              id="cs-publisher"
              v-model="draft.publisher"
              type="text"
              class="cs-input"
              placeholder="למשל: מוסד הרב קוק"
              aria-label="המוציא לאור"
              @keydown.enter="onSubmit"
            >
          </div>
        </template>

        <!--
          הנוסח מדויק בכוונה, ומדוד: שם בלי פסיק נכנס כולו כשם אחד, ושם עם
          פסיק מתפצל. זו הדרך היחידה לתת „רמב״ם” וגם „כהן, יוסף” באותו שדה.
          ההנמקה המלאה ב-engine/citations.ts.
        -->
        <p
          class="cs-note"
          role="note"
        >
          שם שכולל פסיק נקרא „שם משפחה, שם פרטי”. שם בלי פסיק נשמר כמות שהוא.
        </p>

        <!--
          אזהרה ולא חסימה שקטה: המנוע מוחק מקור מצוטט בהצלחה ומשאיר את שדה
          ה-`CITATION` מצביע לתג שאינו קיים (נמדד). המודול מסרב, וכאן
          מוסבר מראש למה הכפתור אינו זמין.
        -->
        <p
          v-if="selectedCitedCount > 0"
          class="cs-note cs-warn"
          role="alert"
        >
          יש במסמך ציטוטים שמפנים אל המקור הזה, ולכן אי אפשר למחוק אותו לפני
          שיוסרו.
        </p>
      </div>

      <div class="cs-footer">
        <button
          type="button"
          class="cs-btn cs-btn-primary"
          :disabled="!canSubmit"
          @pointerdown.prevent
          @click="onSubmit"
        >
          {{ selected === '' ? 'הוסף מקור' : 'שמור שינויים' }}
        </button>
        <button
          type="button"
          class="cs-btn"
          :disabled="selected === ''"
          @pointerdown.prevent
          @click="startNew"
        >
          מקור חדש
        </button>
        <button
          type="button"
          class="cs-btn"
          :disabled="!canRemove"
          @pointerdown.prevent
          @click="onRemove"
        >
          מחק מקור
        </button>
        <button
          type="button"
          class="cs-btn"
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
 * „נהל מקורות” של קבוצת „ציטוטים וביבליוגרפיה”.
 *
 * מציג בלבד: אינו קורא למנוע ואינו בונה קוד שדה. הוולידציה כאן היא
 * **תצוגתית**, וההכרעה עצמה היא `normalizeCitationTitle` ב-engine/citations.ts
 * — אותה פונקציה שהמודול קורא לה לפני השליחה. שני נוסחים לאותה שאלה היו
 * מאפשרים דיאלוג שמאשר מקור שהמודול ידחה.
 *
 * ## למה הרשימה והטופס באותו חלון
 *
 * ב-Word „נהל מקורות” הוא רשימה, ו„צור מקור” הוא חלון שני שנפתח מעליה.
 * כאן זה חלון אחד, ומטעם מעשי: בספר תורני המקורות נכנסים בזה אחר זה
 * בעשרות, ורוב העריכות הן תיקון של שדה בודד. חלון שכל תיקון פותח וסוגר
 * חלון-בן היה הופך את הפעולה הנפוצה למסע.
 *
 * `sources` מגיע כ-prop ואינו נקרא כאן: מי שקורא את המסמך היא הלשונית, והיא
 * זו שקוראת מחדש אחרי כל פעולה. ראו BookmarkDialog.vue.
 *
 * ## שני שדות שמשתנים לפי הסוג, ואחד שנעול
 *
 * „עיר” ו„מוציא לאור” מתחלפים ב„שם הקובץ”/„כרך”/„עמודים” כשהסוג הוא מאמר,
 * וזו אינה קוסמטיקה: המודול שולח רק את השדות שיש להם מובן לסוג, מפני
 * שהמנוע כותב לקובץ כל שדה שהוא מקבל — גם `<b:Volume>` על ספר.
 *
 * סוג המקור נעול בעריכה. `CitationSourceUpdateInput.patch` הוא
 * `Partial<CitationSourceFields>` בלבד, ואין בחוזה מסלול שמשנה `type`;
 * פקד שנראה כאילו הוא משנה אותו ואינו משנה הוא בדיוק ההצלחה המדומה
 * שהתוסף הזה נבנה כדי לא לייצר.
 */
import { computed, nextTick, reactive, ref, watch } from 'vue';
import {
  CITATION_SOURCE_TYPES,
  emptyCitationSourceDraft,
  normalizeCitationTitle,
  usesJournalFields,
  type CitationSourceDraft,
  type CitationSourceSummary,
} from '../../engine/citations';

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
  (e: 'add', draft: CitationSourceDraft): void;
  (e: 'update', payload: { id: string; draft: CitationSourceDraft }): void;
  (e: 'remove', id: string): void;
}>();

const DIALOG_TITLE = 'ניהול מקורות';

/** מזהה המקור שנבחר, או `''` כשהטופס הוא „מקור חדש”. */
const selected = ref('');
const draft = reactive<CitationSourceDraft>(emptyCitationSourceDraft());
const titleInputRef = ref<HTMLInputElement | null>(null);

const showJournalFields = computed(() => usesJournalFields(draft.type));

const canSubmit = computed(() => normalizeCitationTitle(draft.title) !== null);

/**
 * הבחירה שעדיין ברשימה. אחרי מחיקה מוצלחת ה-prop מתעדכן, ובחירה שנשארה
 * הייתה מפנה לישות שכבר אינה קיימת — כלומר לחיצה שנייה על „מחק” הייתה
 * שולחת מזהה מת.
 */
const selectedSource = computed(() =>
  props.sources.find((source) => source.id === selected.value)
);

const selectedCitedCount = computed(() => selectedSource.value?.citedCount ?? 0);

const canRemove = computed(
  () => selectedSource.value !== undefined && selectedCitedCount.value === 0
);

function fill(next: CitationSourceDraft): void {
  Object.assign(draft, next);
}

watch(
  () => props.isOpen,
  (open) => {
    if (!open) return;
    startNew();
    nextTick(() => {
      titleInputRef.value?.focus();
    });
  }
);

/**
 * הרשימה נקראת מחדש אחרי כל פעולה, ולכן היא מתחלפת תחת הידיים. מקור שנמחק
 * מחזיר את הטופס למצב „מקור חדש”; מקור שנערך מרענן את הטופס מהערכים
 * שבמסמך, כדי שמה שנראה יהיה מה שנשמר ולא מה שהוקלד.
 */
watch(
  () => props.sources,
  (sources) => {
    if (selected.value === '') return;
    const still = sources.find((source) => source.id === selected.value);
    if (!still) startNew();
    else fill(still.draft);
  }
);

function startNew(): void {
  selected.value = '';
  fill(emptyCitationSourceDraft());
}

function select(source: CitationSourceSummary): void {
  selected.value = source.id;
  fill(source.draft);
}

/**
 * גם `Enter` בכל שדה טקסט, כמו ב-IndexEntryDialog: הטופס הזה ממולא בעשרות
 * מקורות בזה אחר זה, ודרישה לעכבר בין מקור למקור היא מה שהופך את הפעולה
 * הנפוצה למסע. השמירה עוברת דרך אותו שער — כותרת ריקה אינה נשלחת גם כאן.
 */
function onSubmit(): void {
  if (!canSubmit.value) return;
  const payload: CitationSourceDraft = { ...draft };
  if (selected.value === '') emit('add', payload);
  else emit('update', { id: selected.value, draft: payload });
}

function onRemove(): void {
  if (!canRemove.value) return;
  emit('remove', selected.value);
}
</script>

<style scoped>
.citation-source-dialog {
  position: fixed;
  top: 140px;
  inset-inline-start: 40px;
  z-index: 2000;
  background: var(--color-surface);
  border: 1px solid var(--color-outline);
  border-radius: var(--radius-sm);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
  width: 400px;
  font-family: var(--font-main);
  user-select: none;
}

.cs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-block-end: 1px solid var(--color-outline-variant);
  padding: 6px 8px 6px 12px;
  background: var(--color-surface-container-high);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
}

.cs-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-on-surface);
}

.cs-close-btn {
  background: none;
  border: none;
  font-size: 14px;
  color: var(--color-on-surface-variant);
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--radius-xs);
}

.cs-close-btn:hover {
  background: var(--word-btn-hover);
  color: var(--color-error);
}

.cs-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cs-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cs-row--top {
  align-items: flex-start;
}

.cs-label {
  width: 85px;
  font-size: 11px;
  color: var(--color-on-surface);
  flex-shrink: 0;
}

.cs-input {
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

.cs-textarea {
  resize: vertical;
  line-height: 1.5;
}

.cs-input:focus {
  border-color: var(--word-blue);
  box-shadow: 0 0 0 1px var(--word-blue);
}

.cs-input:disabled {
  opacity: 0.55;
  cursor: default;
}

.cs-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: 130px;
  overflow-y: auto;
  border: 1px solid var(--color-outline-variant);
  border-radius: var(--radius-xs);
  padding: 2px;
  background: var(--color-surface);
}

.cs-list-item {
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

.cs-list-item:hover {
  background: var(--word-btn-hover);
}

.cs-list-item--selected {
  background: var(--color-primary-subtle);
}

.cs-list-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cs-list-badge {
  font-size: 11px;
  color: var(--color-on-surface-variant);
  flex-shrink: 0;
}

.cs-note {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--color-on-surface-variant);
}

.cs-warn {
  color: var(--color-error);
}

.cs-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  padding: 8px 12px;
  border-block-start: 1px solid var(--color-outline-variant);
  background: var(--color-surface-container-high);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
}

.cs-btn {
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

.cs-btn:hover:not(:disabled) {
  background: var(--word-btn-hover);
  border-color: var(--word-blue);
}

/* הטקסט על הכפתור הממולא הוא `--color-on-primary` ולא לבן קבוע — ראו
   ההסבר ב-LinkDialog.vue. */
.cs-btn-primary {
  background: var(--word-blue);
  color: var(--color-on-primary);
  border-color: var(--word-blue);
}

.cs-btn-primary:hover:not(:disabled) {
  background: var(--word-blue-dark);
}

.cs-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
