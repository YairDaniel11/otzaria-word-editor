<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      ref="rootRef"
      class="para-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="DIALOG_TITLE"
      tabindex="-1"
      @keydown.esc.stop="$emit('close')"
    >
      <div class="pd-header">
        <span class="pd-title">{{ DIALOG_TITLE }}</span>
        <button
          type="button"
          class="pd-close-btn"
          data-tip-title="סגור"
          data-tip-shortcut="Esc"
          aria-label="סגור את תפריט הפסקה"
          @click="$emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="pd-body">
        <!-- כניסות -->
        <fieldset class="pd-group">
          <legend>כניסה</legend>
          <div class="pd-row">
            <label
              for="pd-ind-left"
              class="pd-label"
            >לפני טקסט:</label>
            <input
              id="pd-ind-left"
              v-model="leftCm"
              class="pd-number"
              type="number"
              min="0"
              max="55.87"
              step="0.1"
              aria-label="כניסה לפני הטקסט, בסנטימטרים"
              @keydown.enter="onSubmit"
            >
            <span class="pd-unit">ס"מ</span>
          </div>
          <div class="pd-row">
            <label
              for="pd-ind-right"
              class="pd-label"
            >אחרי טקסט:</label>
            <input
              id="pd-ind-right"
              v-model="rightCm"
              class="pd-number"
              type="number"
              min="0"
              max="55.87"
              step="0.1"
              aria-label="כניסה אחרי הטקסט, בסנטימטרים"
              @keydown.enter="onSubmit"
            >
            <span class="pd-unit">ס"מ</span>
          </div>
          <div class="pd-row">
            <label
              for="pd-special"
              class="pd-label"
            >מיוחד:</label>
            <select
              id="pd-special"
              v-model="special"
              class="pd-select"
            >
              <option value="none">ללא</option>
              <option value="firstLine">שורה ראשונה</option>
              <option value="hanging">תלויה</option>
            </select>
            <input
              v-model="amountCm"
              class="pd-number"
              type="number"
              min="0"
              step="0.1"
              :disabled="special === 'none'"
              aria-label="מידת הכניסה המיוחדת, בסנטימטרים"
              @keydown.enter="onSubmit"
            >
            <span class="pd-unit">ס"מ</span>
          </div>
        </fieldset>

        <!-- ריווח -->
        <fieldset class="pd-group">
          <legend>ריווח</legend>
          <div class="pd-row">
            <label
              for="pd-sp-before"
              class="pd-label"
            >לפני:</label>
            <input
              id="pd-sp-before"
              v-model="beforePt"
              class="pd-number"
              type="number"
              min="0"
              step="1"
              aria-label="ריווח לפני הפסקה, בנקודות"
              @keydown.enter="onSubmit"
            >
            <span class="pd-unit">נק'</span>
            <label
              for="pd-sp-after"
              class="pd-label pd-label-after"
            >אחרי:</label>
            <input
              id="pd-sp-after"
              v-model="afterPt"
              class="pd-number"
              type="number"
              min="0"
              step="1"
              aria-label="ריווח אחרי הפסקה, בנקודות"
              @keydown.enter="onSubmit"
            >
            <span class="pd-unit">נק'</span>
          </div>
          <div class="pd-row">
            <label
              for="pd-line"
              class="pd-label"
            >מרווח שורות:</label>
            <select
              id="pd-line"
              v-model="lineMode"
              class="pd-select"
            >
              <option value="240">בודדת</option>
              <option value="360">1.5 שורות</option>
              <option value="480">כפולה</option>
              <option value="exact">מדויקת</option>
              <option value="atLeast">לפחות</option>
            </select>
            <template v-if="lineMode === 'exact' || lineMode === 'atLeast'">
              <input
                v-model="linePt"
                class="pd-number"
                type="number"
                min="0"
                step="1"
                aria-label="גובה השורה, בנקודות"
                @keydown.enter="onSubmit"
              >
              <span class="pd-unit">נק'</span>
            </template>
          </div>
        </fieldset>

        <!-- אפשרויות שמירה -->
        <fieldset class="pd-group">
          <legend>אפשרויות שמירה</legend>
          <div class="pd-checks">
            <label class="pd-check">
              <input
                v-model="keepNext"
                type="checkbox"
              >
              השאר עם הבא
            </label>
            <label class="pd-check">
              <input
                v-model="keepLines"
                type="checkbox"
              >
              השאר שורות יחד
            </label>
            <label class="pd-check">
              <input
                v-model="widowControl"
                type="checkbox"
              >
              בקרת אלמנות ויתומים
            </label>
          </div>
        </fieldset>

        <!-- טאבים -->
        <fieldset
          v-if="tabsEnabled"
          class="pd-group"
        >
          <legend>עצירות טאב</legend>
          <p
            class="pd-note"
            role="note"
          >
            הוספה והסרה מוחלות מיד על הפסקה שבה הסמן.
          </p>
          <ul
            v-if="tabs.length > 0"
            class="pd-tabs"
          >
            <li
              v-for="(tab, index) in tabs"
              :key="`${tab.positionTwips}-${index}`"
              class="pd-tab-row"
            >
              <span>{{ formatTab(tab) }}</span>
              <button
                type="button"
                class="pd-btn pd-btn-small"
                :disabled="busy"
                aria-label="הסר עצירת טאב"
                @pointerdown.prevent
                @click="$emit('tab-remove', { positionTwips: tab.positionTwips })"
              >
                הסר
              </button>
            </li>
          </ul>
          <p
            v-else
            class="pd-note"
          >
            אין עצירות טאב בפסקה זו.
          </p>
          <div class="pd-row">
            <input
              v-model="newTabCm"
              class="pd-number"
              type="number"
              min="0.1"
              step="0.1"
              placeholder="מיקום"
              aria-label="מיקום עצירת טאב חדשה, בסנטימטרים"
            >
            <select
              v-model="newTabAlignment"
              class="pd-select"
              aria-label="יישור עצירת הטאב"
            >
              <option value="left">שמאל</option>
              <option value="center">מרכז</option>
              <option value="right">ימין</option>
              <option value="decimal">עשרוני</option>
            </select>
            <select
              v-model="newTabLeader"
              class="pd-select"
              aria-label="מוביל עצירת הטאב"
            >
              <option value="">ללא</option>
              <option value="dot">........</option>
              <option value="hyphen">--------</option>
              <option value="underscore">________</option>
            </select>
            <button
              type="button"
              class="pd-btn"
              :disabled="busy || !canAddTab"
              @pointerdown.prevent
              @click="onAddTab"
            >
              הוסף
            </button>
          </div>
          <button
            v-if="tabs.length > 0"
            type="button"
            class="pd-btn"
            :disabled="busy"
            @pointerdown.prevent
            @click="$emit('tabs-clear')"
          >
            נקה את כל העצירות
          </button>
        </fieldset>

        <p
          v-if="showError"
          class="pd-error"
          role="alert"
        >
          {{ INVALID_HINT }}
        </p>

      </div>

      <div class="pd-footer">
        <button
          type="button"
          class="pd-btn pd-btn-primary"
          :disabled="busy || !canSubmit"
          @pointerdown.prevent
          @click="onSubmit"
        >
          אישור
        </button>
        <button
          type="button"
          class="pd-btn"
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
 * „פסקה” — כניסות, ריווח, אפשרויות שמירה וטאבים; ההנמקות ב-engine/paragraph-format.ts.
 *
 * שתי הכרעות מבניות:
 *
 * 1. **מילוי מוקדם מהמסמך.** `setIndentation`/`setSpacing` מחליפים את
 *    `<w:ind>`/`<w:spacing>` כולו (נמדד), ולכן הדיאלוג נפתח על ה-prop
 *    `snapshot` — תצלום שקרא `readParagraphFormat` — ואישור שולח מצב מלא.
 *    דיאלוג שנפתח ריק היה מוחק בשקט כניסות קיימות.
 * 2. **הטאבים מיידיים** ושאר הסעיפים ב„אישור”. `setTabStop` מוסיף בלי לגעת
 *    באחרות (נמדד), כך שהוספה והסרה הן פעולות עצמאיות בטוחות; הכניסות
 *    והריווח הן replace ודורשות אישור אחד ששולח את המצב כולו.
 *
 * רשימת הדיאלוג (checklist): tabindex="-1" + focus() ב-nextTick, Enter על
 * שדות קלט, prop `busy` שמנטרל את פעולות המסמך ומשאיר את „ביטול”/Esc חיים,
 * RTL לוגי בלבד, ו-@pointerdown.prevent על כל כפתור.
 */
import { computed, nextTick, ref, watch } from 'vue';
import {
  TWIPS_PER_CM,
  TWIPS_PER_PT,
  type LineSpacingRule,
  type TabAlignment,
  type TabLeader,
} from '../../engine/paragraph-format';

const DIALOG_TITLE = 'פסקה';
const INVALID_HINT = 'הערכים חייבים להיות מספרים חוקיים ולא-שליליים.';

const props = defineProps<{
  isOpen: boolean;
  busy: boolean;
  tabsEnabled: boolean;
  snapshot: {
    indentation: { leftTwips: number; rightTwips: number; firstLineTwips: number; hangingTwips: number };
    spacing: { beforeTwips: number; afterTwips: number; lineTwips: number; rule: string };
    keepNext: boolean;
    keepLines: boolean;
    widowControl: boolean;
    tabs: readonly { positionTwips: number; alignment: string; leader?: string }[];
  };
}>();

const emit = defineEmits<{
  close: [];
  submit: [
    payload: {
      leftCm: number;
      rightCm: number;
      special: 'none' | 'firstLine' | 'hanging';
      amountCm: number;
      beforePt: number;
      afterPt: number;
      lineTwips: number;
      lineRule: LineSpacingRule;
      keepNext: boolean;
      keepLines: boolean;
      widowControl: boolean;
    },
  ];
  'tab-add': [tab: { positionTwips: number; alignment: TabAlignment; leader?: TabLeader }];
  'tab-remove': [payload: { positionTwips: number }];
  'tabs-clear': [];
}>();

const cmToTwips = (cm: number): number => Math.round(cm * TWIPS_PER_CM);
const twipsToCmText = (twips: number): string => (twips / TWIPS_PER_CM).toFixed(2);
const ptToTwips = (pt: number): number => Math.round(pt * TWIPS_PER_PT);
const twipsToPtText = (twips: number): string => String(Math.round(twips / TWIPS_PER_PT));

const rootRef = ref<HTMLElement | null>(null);

/** השדות הנערכים. מתאפסים מה-snapshot בכל פתיחה — ראו ה-watch למטה. */
const leftCm = ref('0');
const rightCm = ref('0');
const special = ref<'none' | 'firstLine' | 'hanging'>('none');
const amountCm = ref('1.25');
const beforePt = ref('0');
const afterPt = ref('0');
const lineMode = ref<string>('240');
const linePt = ref('12');
const keepNext = ref(false);
const keepLines = ref(false);
const widowControl = ref(true);

/** עותק מקומי של רשימת הטאבים; ההוספות/הסרות עצמן מופעלות אצל ההורה. */
const tabs = ref<Array<{ positionTwips: number; alignment: string; leader?: string }>>([]);

watch(
  () => props.isOpen,
  async (open) => {
    if (!open) return;
    const snap = props.snapshot;
    leftCm.value = twipsToCmText(snap.indentation.leftTwips);
    rightCm.value = twipsToCmText(snap.indentation.rightTwips);
    // „מיוחד”: שתי התכונות לעולם לא קיימות יחד ב-OOXML; מה שקיים מוצג.
    if (snap.indentation.firstLineTwips > 0) {
      special.value = 'firstLine';
      amountCm.value = twipsToCmText(snap.indentation.firstLineTwips);
    } else if (snap.indentation.hangingTwips > 0) {
      special.value = 'hanging';
      amountCm.value = twipsToCmText(snap.indentation.hangingTwips);
    } else {
      special.value = 'none';
      amountCm.value = twipsToCmText(567);
    }
    beforePt.value = twipsToPtText(snap.spacing.beforeTwips);
    afterPt.value = twipsToPtText(snap.spacing.afterTwips);
    if (snap.spacing.rule === 'exact' || snap.spacing.rule === 'atLeast') {
      lineMode.value = snap.spacing.rule;
      linePt.value = twipsToPtText(snap.spacing.lineTwips);
    } else {
      const known = ['240', '360', '480'];
      lineMode.value = known.includes(String(snap.spacing.lineTwips)) ? String(snap.spacing.lineTwips) : '240';
      linePt.value = twipsToPtText(snap.spacing.lineTwips || 240);
    }
    keepNext.value = snap.keepNext;
    keepLines.value = snap.keepLines;
    widowControl.value = snap.widowControl;
    tabs.value = [...snap.tabs];

    // פריט 1 ב-checklist: בלי מיקוד על השורש, Escape מפסיק לעבוד אחרי קליק
    // על גוף הדיאלוג.
    await nextTick();
    rootRef.value?.focus();
  },
);

function parseNonNegative(value: string): number | null {
  const parsed = Number(value);
  return typeof parsed === 'number' && Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parsePositive(value: string): number | null {
  const parsed = Number(value);
  return typeof parsed === 'number' && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

const newTabCm = ref('');
const newTabAlignment = ref<TabAlignment>('left');
const newTabLeader = ref('');

const canAddTab = computed(() => parsePositive(newTabCm.value) !== null);

const showError = computed(() => {
  for (const value of [leftCm.value, rightCm.value, amountCm.value, beforePt.value, afterPt.value, linePt.value]) {
    if (parseNonNegative(value) === null) return true;
  }
  return false;
});

const canSubmit = computed(() => !showError.value);

function onAddTab(): void {
  const cm = parsePositive(newTabCm.value);
  if (cm === null) return;
  emit('tab-add', {
    positionTwips: cmToTwips(cm),
    alignment: newTabAlignment.value,
    ...(newTabLeader.value !== '' ? { leader: newTabLeader.value as TabLeader } : {}),
  });
  // אופטימי: הרשימה מתעדכנת מיד; כשל של המנוע יגיע דרך ה-reporter של ההורה,
  // והתצלום בפתיחה הבאה יחזיר את האמת מהמסמך.
  tabs.value.push({
    positionTwips: cmToTwips(cm),
    alignment: newTabAlignment.value,
    ...(newTabLeader.value !== '' ? { leader: newTabLeader.value } : {}),
  });
  newTabCm.value = '';
}

function formatTab(tab: { positionTwips: number; alignment: string; leader?: string }): string {
  const ALIGNMENT_LABELS: Record<string, string> = {
    left: 'שמאל',
    center: 'מרכז',
    right: 'ימין',
    decimal: 'עשרוני',
    bar: 'קו אנכי',
  };
  const position = (tab.positionTwips / TWIPS_PER_CM).toFixed(2);
  return `${position} ס"מ · ${ALIGNMENT_LABELS[tab.alignment] ?? tab.alignment}${tab.leader ? ' · מוביל' : ''}`;
}

function onSubmit(): void {
  if (props.busy || !canSubmit.value) return;
  const amount = parseNonNegative(amountCm.value) ?? 0;
  const rule: LineSpacingRule = lineMode.value === 'exact' || lineMode.value === 'atLeast'
    ? lineMode.value
    : 'auto';
  const lineTwips = rule === 'auto' ? Number(lineMode.value) : ptToTwips(parseNonNegative(linePt.value) ?? 0);
  emit('submit', {
    leftCm: parseNonNegative(leftCm.value) ?? 0,
    rightCm: parseNonNegative(rightCm.value) ?? 0,
    special: special.value,
    amountCm: amount,
    beforePt: parseNonNegative(beforePt.value) ?? 0,
    afterPt: parseNonNegative(afterPt.value) ?? 0,
    lineTwips,
    lineRule: rule,
    keepNext: keepNext.value,
    keepLines: keepLines.value,
    widowControl: widowControl.value,
  });
}
</script>

<style scoped>
.para-dialog {
  position: fixed;
  top: 140px;
  inset-inline-start: 40px;
  z-index: 2000;
  background: var(--color-surface);
  border: 1px solid var(--color-outline);
  border-radius: var(--radius-sm);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
  width: 360px;
  max-height: calc(100vh - 200px);
  overflow-block: auto;
  font-family: var(--font-main);
  user-select: none;
}

.pd-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-block-end: 1px solid var(--color-outline-variant);
  padding: 6px 8px 6px 12px;
  background: var(--color-surface-container-high);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
}

.pd-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-on-surface);
}

.pd-close-btn {
  background: none;
  border: none;
  font-size: 14px;
  color: var(--color-on-surface-variant);
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--radius-xs);
}

.pd-close-btn:hover {
  background: var(--word-btn-hover);
  color: var(--color-error);
}

.pd-body {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pd-group {
  border: 1px solid var(--color-outline-variant);
  border-radius: var(--radius-xs);
  padding: 6px 8px 8px;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pd-group legend {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-on-surface-variant);
  padding-inline: 4px;
}

.pd-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pd-label {
  font-size: 11px;
  color: var(--color-on-surface);
  flex-shrink: 0;
}

.pd-label-after {
  margin-inline-start: auto;
}

.pd-unit {
  font-size: 11px;
  color: var(--color-on-surface-variant);
}

.pd-number,
.pd-select {
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

.pd-select {
  width: auto;
}

.pd-number:focus,
.pd-select:focus {
  border-color: var(--word-blue);
  box-shadow: 0 0 0 1px var(--word-blue);
}

.pd-number:disabled {
  opacity: 0.45;
}

.pd-checks {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pd-check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-on-surface);
}

.pd-tabs {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pd-tab-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--color-on-surface);
  padding-block: 2px;
}

.pd-note {
  margin: 0;
  font-size: 10.5px;
  line-height: 1.4;
  color: var(--color-on-surface-variant);
}

.pd-error {
  margin: 0;
  font-size: 11px;
  color: var(--color-error);
}

.pd-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  padding: 8px 12px;
  border-block-start: 1px solid var(--color-outline-variant);
  background: var(--color-surface-container-high);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
}

.pd-btn {
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

.pd-btn:hover:not(:disabled) {
  background: var(--word-btn-hover);
  border-color: var(--word-blue);
}

/* הטקסט על הכפתור הממולא הוא `--color-on-primary` ולא לבן קבוע — ראו
   LinkDialog.vue. */
.pd-btn-primary {
  background: var(--word-blue);
  color: var(--color-on-primary);
  border-color: var(--word-blue);
}

.pd-btn-primary:hover:not(:disabled) {
  background: var(--word-blue-dark);
}

.pd-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
