<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      ref="rootRef"
      class="fontadv-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="DIALOG_TITLE"
      tabindex="-1"
      @keydown.esc.stop="$emit('close')"
    >
      <div class="fa-header">
        <span class="fa-title">{{ DIALOG_TITLE }}</span>
        <button
          type="button"
          class="fa-close-btn"
          data-tip-title="סגור"
          data-tip-shortcut="Esc"
          aria-label="סגור את תפריט הגופן המתקדם"
          @click="$emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="fa-body">
        <p
          class="fa-note"
          role="note"
        >
          השינויים יחולו על הטקסט המסומן. „ללא שינוי" אינו נשלח למנוע.
        </p>

        <!-- מרווחים ומתיחה -->
        <fieldset class="fa-group">
          <legend>מרווחים ומתיחה</legend>
          <div class="fa-row">
            <label
              for="fa-scale"
              class="fa-label"
            >מתיחה אופקית:</label>
            <input
              id="fa-scale"
              v-model="charScale"
              class="fa-number"
              type="number"
              min="1"
              max="600"
              step="1"
              placeholder="%"
              aria-label="מתיחה אופקית של התווים, באחוזים"
              @keydown.enter="onSubmit"
            >
            <span class="fa-unit">%</span>
          </div>
          <div class="fa-row">
            <label
              for="fa-spacing"
              class="fa-label"
            >ריווח תווים:</label>
            <input
              id="fa-spacing"
              v-model="letterSpacing"
              class="fa-number"
              type="number"
              step="1"
              aria-label="ריווח בין תווים, בנקודות. שלילי = מכווץ"
              @keydown.enter="onSubmit"
            >
            <span class="fa-unit">נק'</span>
          </div>
          <div class="fa-row">
            <label
              for="fa-kerning"
              class="fa-label"
            >קרנינג מעל:</label>
            <input
              id="fa-kerning"
              v-model="kerning"
              class="fa-number"
              type="number"
              min="0"
              step="1"
              aria-label="גודל מינימלי לקרנינג, בנקודות"
              @keydown.enter="onSubmit"
            >
            <span class="fa-unit">נק'</span>
          </div>
        </fieldset>

        <!-- מיקום -->
        <fieldset class="fa-group">
          <legend>מיקום</legend>
          <div class="fa-row">
            <label
              for="fa-position"
              class="fa-label"
            >הרמה/הנמכה:</label>
            <input
              id="fa-position"
              v-model="position"
              class="fa-number"
              type="number"
              step="1"
              aria-label="מיקום התו בנקודות. חיובי = מוגבה, שלילי = מונמך"
              @keydown.enter="onSubmit"
            >
            <span class="fa-unit">נק'</span>
          </div>
        </fieldset>

        <!-- אפקטים -->
        <fieldset class="fa-group">
          <legend>אפקטים</legend>
          <div class="fa-grid">
            <label
              for="fa-dstrike"
              class="fa-label"
            >קו חוצה כפול:</label>
            <select
              id="fa-dstrike"
              v-model="dstrike"
              class="fa-select"
            >
              <option value="">ללא שינוי</option>
              <option value="yes">כן</option>
              <option value="no">לא</option>
            </select>
            <label
              for="fa-outline"
              class="fa-label"
            >מסגרת לתו:</label>
            <select
              id="fa-outline"
              v-model="outline"
              class="fa-select"
            >
              <option value="">ללא שינוי</option>
              <option value="yes">כן</option>
              <option value="no">לא</option>
            </select>
            <label
              for="fa-shadow"
              class="fa-label"
            >צל:</label>
            <select
              id="fa-shadow"
              v-model="shadow"
              class="fa-select"
            >
              <option value="">ללא שינוי</option>
              <option value="yes">כן</option>
              <option value="no">לא</option>
            </select>
            <label
              for="fa-emboss"
              class="fa-label"
            >חרוט:</label>
            <select
              id="fa-emboss"
              v-model="emboss"
              class="fa-select"
            >
              <option value="">ללא שינוי</option>
              <option value="yes">כן</option>
              <option value="no">לא</option>
            </select>
            <label
              for="fa-imprint"
              class="fa-label"
            >שקוע:</label>
            <select
              id="fa-imprint"
              v-model="imprint"
              class="fa-select"
            >
              <option value="">ללא שינוי</option>
              <option value="yes">כן</option>
              <option value="no">לא</option>
            </select>
            <label
              for="fa-vanish"
              class="fa-label"
            >טקסט מוסתר:</label>
            <select
              id="fa-vanish"
              v-model="vanish"
              class="fa-select"
            >
              <option value="">ללא שינוי</option>
              <option value="yes">כן</option>
              <option value="no">לא</option>
            </select>
          </div>
          <!-- vanish מסתיר תוכן: האזהרה כאן ולא ב-tooltip בלבד, כי זו הפעולה
               היחידה בדיאלוג שהמשתמש עלול לחשוב ש„לא עבדה". -->
          <p
            v-if="vanish === 'yes'"
            class="fa-warning"
            role="note"
          >
            הטקסט המסומן יוסתר מעיני הקורא. ניתן להחזירו בעזרת „לא".
          </p>
        </fieldset>

        <!-- גופן מורכב (CS) — הליבה העברית -->
        <fieldset class="fa-group">
          <legend>גופן מורכב (עברית)</legend>
          <div class="fa-row">
            <label
              for="fa-sizecs"
              class="fa-label"
            >גודל:</label>
            <input
              id="fa-sizecs"
              v-model="fontSizeCs"
              class="fa-number"
              type="number"
              min="0.5"
              step="0.5"
              aria-label="גודל הגופן המורכב, בנקודות"
              @keydown.enter="onSubmit"
            >
            <span class="fa-unit">נק'</span>
          </div>
          <div class="fa-row">
            <label
              for="fa-csfont"
              class="fa-label"
            >גופן מורכב:</label>
            <input
              id="fa-csfont"
              v-model="complexFontName"
              class="fa-text"
              type="text"
              maxlength="100"
              placeholder="למשל David"
              aria-label="שם הגופן המורכב"
              @keydown.enter="onSubmit"
            >
          </div>
          <div class="fa-grid">
            <label
              for="fa-boldcs"
              class="fa-label"
            >מודגש (מורכב):</label>
            <select
              id="fa-boldcs"
              v-model="boldCs"
              class="fa-select"
            >
              <option value="">ללא שינוי</option>
              <option value="yes">כן</option>
              <option value="no">לא</option>
            </select>
            <label
              for="fa-italiccs"
              class="fa-label"
            >נטוי (מורכב):</label>
            <select
              id="fa-italiccs"
              v-model="italicCs"
              class="fa-select"
            >
              <option value="">ללא שינוי</option>
              <option value="yes">כן</option>
              <option value="no">לא</option>
            </select>
            <label
              for="fa-cs"
              class="fa-label"
            >השתמש במורכב:</label>
            <select
              id="fa-cs"
              v-model="complexScript"
              class="fa-select"
            >
              <option value="">ללא שינוי</option>
              <option value="yes">כן</option>
              <option value="no">לא</option>
            </select>
            <label
              for="fa-rtl"
              class="fa-label"
            >מימין לשמאל:</label>
            <select
              id="fa-rtl"
              v-model="rtl"
              class="fa-select"
            >
              <option value="">ללא שינוי</option>
              <option value="yes">כן</option>
              <option value="no">לא</option>
            </select>
            <label
              for="fa-lang"
              class="fa-label"
            >שפת הגהה:</label>
            <select
              id="fa-lang"
              v-model="proofingLang"
              class="fa-select"
            >
              <option value="">ללא שינוי</option>
              <option value="he-IL">עברית (he-IL)</option>
              <option value="en-US">אנגלית (en-US)</option>
            </select>
          </div>
        </fieldset>

        <p
          v-if="showError"
          class="fa-error"
          role="alert"
        >
          {{ INVALID_HINT }}
        </p>


      </div>

      <div class="fa-footer">
        <button
          type="button"
          class="fa-btn fa-btn-primary"
          :disabled="busy || !canSubmit"
          @pointerdown.prevent
          @click="onSubmit"
        >
          אישור
        </button>
        <button
          type="button"
          class="fa-btn"
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
 * „גופן מתקדם" — ריווח תווים, מיקום, אפקטים, טקסט מוסתר והליבה העברית (CS).
 * ההנמקות ב-engine/font-advanced.ts.
 *
 * שתי הכרעות:
 *
 * 1. **אין מילוי מוקדם** — ואין סיכון הרסני כמו ב„פסקה". `format.apply`
 *    הוא patch לפי מפתח: מפתח שלא נשלח אינו נוגע בעיצוב קיים. לכן כל שדה
 *    פותח „ללא שינוי"/ריק, ורק מה שהמשתמש מילא יוצא למנוע. זה שונה
 *    לגמרי מ-setIndentation, שמחליף אלמנט שלם.
 * 2. **הבוליאנים תלת-מצביים** („ללא שינוי / כן / לא"): אין קריאת מצב
 *    לריצות בבחירה (אותה סיבה שתועדה ב-vert-align.ts), וcheckbox שאינו
 *    יודע לומר „לא" היה כופה „כן" על מה שהמשתמש לא נגע בו.
 */
import { computed, nextTick, ref, watch } from 'vue';
import type { FontAdvancedPatch } from '../../engine/font-advanced';

const DIALOG_TITLE = 'גופן מתקדם';
const INVALID_HINT = 'הערכים שהוקלדו אינם בטווח המותר — עיין בשדות המסומנים.';

const props = defineProps<{
  isOpen: boolean;
  busy: boolean;
}>();

const emit = defineEmits<{
  close: [];
  submit: [patch: FontAdvancedPatch];
}>();

const rootRef = ref<HTMLElement | null>(null);

/** מחרוזות ריקות = „ללא שינוי". */
const charScale = ref('');
const letterSpacing = ref('');
const kerning = ref('');
const position = ref('');
const fontSizeCs = ref('');
const complexFontName = ref('');
const dstrike = ref('');
const outline = ref('');
const shadow = ref('');
const emboss = ref('');
const imprint = ref('');
const vanish = ref('');
const boldCs = ref('');
const italicCs = ref('');
const complexScript = ref('');
const rtl = ref('');
const proofingLang = ref('');

watch(
  () => props.isOpen,
  async (open) => {
    if (!open) return;
    // איפוס ל„ללא שינוי" בכל פתיחה: הדיאלוג אינו זוכר ערכים בין פעמים,
    // כדי שאישור לא-מכוון לא יחזור על עיצוב של פעם קודמת על בחירה חדשה.
    charScale.value = '';
    letterSpacing.value = '';
    kerning.value = '';
    position.value = '';
    fontSizeCs.value = '';
    complexFontName.value = '';
    dstrike.value = '';
    outline.value = '';
    shadow.value = '';
    emboss.value = '';
    imprint.value = '';
    vanish.value = '';
    boldCs.value = '';
    italicCs.value = '';
    complexScript.value = '';
    rtl.value = '';
    proofingLang.value = '';

    await nextTick();
    rootRef.value?.focus();
  },
);

/**
 * v-model על `type="number"` ממיר אוטומטית למספר — הקלט עשוי להיות שני הסוגים.
 */
function asText(value: string | number): string {
  return typeof value === 'string' ? value : String(value);
}

function parseOptionalInt(value: string | number): number | undefined | null {
  const text = asText(value);
  if (text.trim() === '') return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function parseOptionalNumber(value: string | number): number | undefined | null {
  const text = asText(value);
  if (text.trim() === '') return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/** '' → לא נשלח; 'yes' → true; 'no' → false. */
function tri(value: string): boolean | undefined {
  if (value === 'yes') return true;
  if (value === 'no') return false;
  return undefined;
}

const showError = computed(() => {
  // ארבעת השדות הראשונים מקבלים שלמים בלבד (המנוע כותב twips/חצאי-נקודות
  // מהכפלה); fontSizeCs מקבל חצאי נקודות (נמדד: 12.5 → szCs 25).
  for (const raw of [charScale.value, letterSpacing.value, kerning.value, position.value]) {
    if (asText(raw).trim() !== '' && parseOptionalInt(raw) === null) return true;
  }
  if (asText(fontSizeCs.value).trim() !== '' && parseOptionalNumber(fontSizeCs.value) === null) return true;
  return false;
});

const canSubmit = computed(() => !showError.value);

/** „לא לשלוח / לשלוח"; הערך עבר כבר את שער ה-`canSubmit`. */
function isPresent(value: number | undefined | null): value is number {
  return value !== undefined && value !== null;
}

function onSubmit(): void {
  if (props.busy || !canSubmit.value) return;

  const patch: FontAdvancedPatch = {};
  const charScaleValue = parseOptionalInt(charScale.value);
  if (isPresent(charScaleValue)) patch.charScale = charScaleValue;
  const spacingValue = parseOptionalInt(letterSpacing.value);
  if (isPresent(spacingValue)) patch.letterSpacingPt = spacingValue;
  const kerningValue = parseOptionalInt(kerning.value);
  if (isPresent(kerningValue)) patch.kerningPt = kerningValue;
  const positionValue = parseOptionalInt(position.value);
  if (isPresent(positionValue)) patch.positionPt = positionValue;
  const sizeCsValue = parseOptionalNumber(fontSizeCs.value);
  if (isPresent(sizeCsValue)) patch.fontSizeCsPt = sizeCsValue;

  const dstrikeValue = tri(dstrike.value);
  if (dstrikeValue !== undefined) patch.dstrike = dstrikeValue;
  const outlineValue = tri(outline.value);
  if (outlineValue !== undefined) patch.outline = outlineValue;
  const shadowValue = tri(shadow.value);
  if (shadowValue !== undefined) patch.shadow = shadowValue;
  const embossValue = tri(emboss.value);
  if (embossValue !== undefined) patch.emboss = embossValue;
  const imprintValue = tri(imprint.value);
  if (imprintValue !== undefined) patch.imprint = imprintValue;
  const vanishValue = tri(vanish.value);
  if (vanishValue !== undefined) patch.vanish = vanishValue;
  const boldCsValue = tri(boldCs.value);
  if (boldCsValue !== undefined) patch.boldCs = boldCsValue;
  const italicCsValue = tri(italicCs.value);
  if (italicCsValue !== undefined) patch.italicCs = italicCsValue;
  const csValue = tri(complexScript.value);
  if (csValue !== undefined) patch.complexScript = csValue;
  const rtlValue = tri(rtl.value);
  if (rtlValue !== undefined) patch.rtl = rtlValue;

  if (complexFontName.value.trim() !== '') patch.complexFontName = complexFontName.value.trim();
  if (proofingLang.value !== '') patch.proofingLangBidi = proofingLang.value;

  emit('submit', patch);
}
</script>

<style scoped>
.fontadv-dialog {
  position: fixed;
  top: 140px;
  inset-inline-start: 40px;
  z-index: 2000;
  background: var(--color-surface);
  border: 1px solid var(--color-outline);
  border-radius: var(--radius-sm);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
  width: 380px;
  max-height: calc(100vh - 200px);
  overflow-block: auto;
  font-family: var(--font-main);
  user-select: none;
}

.fa-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-block-end: 1px solid var(--color-outline-variant);
  padding: 6px 8px 6px 12px;
  background: var(--color-surface-container-high);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
}

.fa-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-on-surface);
}

.fa-close-btn {
  background: none;
  border: none;
  font-size: 14px;
  color: var(--color-on-surface-variant);
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--radius-xs);
}

.fa-close-btn:hover {
  background: var(--word-btn-hover);
  color: var(--color-error);
}

.fa-body {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.fa-note,
.fa-warning {
  margin: 0;
  font-size: 10.5px;
  line-height: 1.4;
  color: var(--color-on-surface-variant);
}

.fa-warning {
  color: var(--color-error);
}

.fa-group {
  border: 1px solid var(--color-outline-variant);
  border-radius: var(--radius-xs);
  padding: 6px 8px 8px;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fa-group legend {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-on-surface-variant);
  padding-inline: 4px;
}

.fa-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.fa-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 8px;
  align-items: center;
}

.fa-label {
  font-size: 11px;
  color: var(--color-on-surface);
  flex-shrink: 0;
}

.fa-unit {
  font-size: 11px;
  color: var(--color-on-surface-variant);
}

.fa-number,
.fa-select,
.fa-text {
  padding: 3px 6px;
  border: 1px solid var(--color-outline-variant);
  border-radius: var(--radius-xs);
  background: var(--color-surface);
  color: var(--color-on-surface);
  font-family: var(--font-main);
  font-size: 12px;
  outline: none;
  width: 72px;
}

.fa-select {
  width: auto;
  min-width: 90px;
}

.fa-text {
  width: 140px;
}

.fa-number:focus,
.fa-select:focus,
.fa-text:focus {
  border-color: var(--word-blue);
  box-shadow: 0 0 0 1px var(--word-blue);
}

.fa-error {
  margin: 0;
  font-size: 11px;
  color: var(--color-error);
}

.fa-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  padding: 8px 12px;
  border-block-start: 1px solid var(--color-outline-variant);
  background: var(--color-surface-container-high);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
}

.fa-btn {
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

.fa-btn:hover:not(:disabled) {
  background: var(--word-btn-hover);
  border-color: var(--word-blue);
}

/* הטקסט על הכפתור הממולא הוא `--color-on-primary` ולא לבן קבוע — ראו
   LinkDialog.vue. */
.fa-btn-primary {
  background: var(--word-blue);
  color: var(--color-on-primary);
  border-color: var(--word-blue);
}

.fa-btn-primary:hover:not(:disabled) {
  background: var(--word-blue-dark);
}

.fa-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
