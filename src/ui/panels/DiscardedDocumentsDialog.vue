<template>
  <div
    v-if="isOpen"
    class="modal-backdrop"
    @click.self="$emit('close')"
  >
    <div
      ref="dialogRef"
      class="discarded-dialog"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="TITLE_ID"
      tabindex="-1"
      @keydown.esc.stop="$emit('close')"
      @keydown.tab="onTab"
    >
      <div class="discarded-header">
        <div class="discarded-header__title">
          <SvgIcon
            name="undo"
            :size="20"
            class="discarded-header__icon"
          />
          <span :id="TITLE_ID">מסמכים שנסגרו בלי לשמור</span>
        </div>
        <button
          type="button"
          class="discarded-close-btn"
          data-tip-title="סגור"
          data-tip-shortcut="Esc"
          aria-label="סגור את חלון המסמכים שנסגרו בלי לשמור"
          @click="$emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="discarded-body">
        <p class="discarded-note">
          העותקים האחרונים שנשמרו כשנבחר „לא לשמור”. פתיחה יוצרת מסמך חדש —
          הקובץ המקורי אינו משתנה עד שתשמרו אותו בעצמכם.
        </p>

        <p
          v-if="entries.length === 0"
          class="discarded-empty"
          role="status"
        >
          אין מסמכים שנסגרו בלי לשמור.
        </p>

        <ul
          v-else
          class="discarded-list"
        >
          <li
            v-for="entry in entries"
            :key="entry.slot"
            class="discarded-row"
          >
            <button
              type="button"
              class="discarded-open"
              :disabled="busy"
              :data-slot="entry.slot"
              :data-tip-title="`פתח את ${entry.name}`"
              data-tip-desc="נפתח כמסמך חדש, בטאב נוסף"
              @click="$emit('open', entry.slot)"
            >
              <span class="discarded-name">{{ entry.name }}</span>
              <span class="discarded-meta">{{ metaOf(entry) }}</span>
            </button>
            <button
              type="button"
              class="discarded-forget"
              :disabled="busy"
              :data-slot="entry.slot"
              :aria-label="`הסר את ${entry.name} מהגיבוי`"
              data-tip-title="הסר מהגיבוי"
              data-tip-desc="מוחק את העותק. אין דרך לשחזר אותו אחר כך"
              @click="$emit('forget', entry.slot)"
            >
              ✕
            </button>
          </li>
        </ul>
      </div>

      <div class="discarded-footer">
        <button
          ref="closeRef"
          type="button"
          class="discarded-btn"
          @click="$emit('close')"
        >
          סגור
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * „מסמכים שנסגרו בלי לשמור” — חמשת הגיבויים האחרונים.
 *
 * ## מה החלון הזה אינו
 *
 * הוא **אינו** רשימת „אחרונים”. שם יושבים קבצים שקיימים בדיסק וה-token שלהם
 * פותח אותם; כאן יושבים עותקים של עבודה שהמשתמש אמר עליה „לא לשמור”, והם
 * קיימים רק במרחב הפרטי של התוסף (`sessions/discard-backup.ts`). ההבחנה
 * אינה סמנטית: פתיחה כאן אינה נוגעת בקובץ המקורי, ולכן אינה יכולה לדרוס
 * אותו — וזה נאמר בגוף החלון, מפני שזו השאלה הראשונה של מי שנכנס לכאן
 * („אם אפתח, מה יקרה לקובץ שלי?”).
 *
 * ## הגיל אינו קישוט
 *
 * העותק נכתב ברגע ה„לא לשמור”, וייתכן שהוא מלפני יומיים. שורה שאומרת רק שם
 * מאלצת את המשתמש לפתוח כדי לדעת מה יש בה; „לפני יומיים · 42KB” מאפשר לזהות
 * מיד — בדיוק כמו גיל הטיוטה בהודעת השחזור (`draftAgeLabel`).
 *
 * ## שני כפתורים בשורה, ולא תפריט
 *
 * „פתח” הוא השורה כולה, ו„✕” הוא הסרה. ההסרה מפורשת ואינה מתחבאת: מה שיש
 * כאן הוא עבודה של המשתמש, ומחיקה שלה מאחורי תפריט היא מחיקה שקורית בטעות.
 */
import { nextTick, ref, watch } from 'vue';
import { draftAgeLabel } from '../../sessions/session-state';
import type { DiscardedDocument } from '../../sessions/discard-backup';
import SvgIcon from '../icons/SvgIcon.vue';

const props = withDefaults(
  defineProps<{
    isOpen?: boolean;
    /** הרשומות, מהחדש לישן (`sortedBackups`). */
    entries?: readonly DiscardedDocument[];
    /** פעולה על מסמך שיצאה לדרך וטרם חזרה — פתיחה אורכת שניות. */
    busy?: boolean;
  }>(),
  { isOpen: false, entries: () => [], busy: false },
);

defineEmits<{
  (e: 'close'): void;
  (e: 'open', slot: number): void;
  (e: 'forget', slot: number): void;
}>();

const TITLE_ID = 'discarded-dialog-title';

const dialogRef = ref<HTMLElement | null>(null);
const closeRef = ref<HTMLButtonElement | null>(null);

/** לאן המיקוד חוזר בסגירה — בלעדיו הוא נופל ל-`body`. */
let focusOnClose: HTMLElement | null = null;

/**
 * „לפני שעתיים · 42KB”, או רק אחד מהם כשהשני אינו ידוע.
 *
 * `size: 0` ו-`discardedAt: 0` הם „לא ידוע” ברשומה (ראו `normalizeBackups`),
 * ולא ערכים אמיתיים — „0KB” היה נראה כמו מסמך ריק, וזה שקר על עותק שנכתב.
 */
function metaOf(entry: DiscardedDocument): string {
  const parts: string[] = [];
  const age = draftAgeLabel(entry.discardedAt, Date.now());
  if (age) parts.push(age);
  if (entry.size > 0) parts.push(sizeLabel(entry.size));
  return parts.join(' · ');
}

function sizeLabel(bytes: number): string {
  const kb = bytes / 1024;
  if (kb < 1) return '‎1KB>';
  if (kb < 1024) return `${Math.round(kb)}KB`;
  return `${(kb / 1024).toFixed(1)}MB`;
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      focusOnClose = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      void nextTick(() => {
        // הפריט הראשון ולא „סגור”: מי שפתח את החלון בא לפתוח משהו.
        (firstRow() ?? closeRef.value ?? dialogRef.value)?.focus();
      });
      return;
    }

    const target = focusOnClose;
    focusOnClose = null;
    if (target && document.contains(target)) target.focus();
  },
);

function firstRow(): HTMLElement | null {
  return dialogRef.value?.querySelector<HTMLElement>('.discarded-open') ?? null;
}

/** הפקדים שאפשר למקד בתוך החלון, בסדר ה-DOM. */
function focusables(): HTMLElement[] {
  const root = dialogRef.value;
  if (!root) return [];
  return [...root.querySelectorAll<HTMLElement>('button')].filter(
    (element) => !element.hasAttribute('disabled'),
  );
}

/**
 * מלכודת המיקוד. `aria-modal="true"` בלי מלכודת הוא הצהרה שקרית — ראו
 * `AboutDialog`, שהוא התקדים במאגר.
 */
function onTab(event: KeyboardEvent): void {
  const items = focusables();
  if (items.length === 0) return;

  const first = items[0]!;
  const last = items[items.length - 1]!;
  const active = document.activeElement;

  if (event.shiftKey && (active === first || active === dialogRef.value)) {
    event.preventDefault();
    last.focus();
    return;
  }
  if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: var(--color-scrim);
  /* מעל דיאלוג „פתח מסמך” שממנו נכנסים לכאן. */
  z-index: 3050;
  display: flex;
  align-items: center;
  justify-content: center;
}

.discarded-dialog {
  width: min(520px, 92vw);
  max-height: min(600px, 86vh);
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border: 1px solid var(--color-outline);
  border-radius: var(--radius-md);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.24);
  font-family: var(--font-main);
  font-size: var(--font-size-ui);
  overflow: hidden;
}

.discarded-header {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--color-surface-container-high);
  border-block-end: 1px solid var(--color-outline);
}

.discarded-header__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1.08em;
  font-weight: 600;
  color: var(--color-on-surface);
}

.discarded-header__icon {
  color: var(--word-blue);
}

.discarded-close-btn {
  background: none;
  border: none;
  font-size: 1em;
  color: var(--color-on-surface-variant);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: var(--radius-xs);
}

.discarded-close-btn:hover {
  background: var(--word-btn-hover);
  color: var(--color-error);
}

.discarded-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.discarded-note {
  margin: 0;
  font-size: 0.88em;
  line-height: 1.5;
  color: var(--color-on-surface-variant);
}

.discarded-empty {
  margin: 0;
  padding: 12px 0;
  text-align: center;
  color: var(--color-on-surface-variant);
}

.discarded-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.discarded-row {
  display: flex;
  align-items: stretch;
  gap: 4px;
}

.discarded-open {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  background: none;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  font-family: var(--font-main);
  font-size: 1em;
  color: var(--color-on-surface);
  text-align: start;
  cursor: pointer;
}

.discarded-open:hover:not(:disabled) {
  background: var(--word-btn-hover);
  border-color: var(--color-outline-variant);
}

.discarded-open:disabled,
.discarded-forget:disabled {
  opacity: 0.5;
  cursor: default;
}

.discarded-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.discarded-meta {
  flex-shrink: 0;
  font-size: 0.85em;
  color: var(--color-on-surface-variant);
}

.discarded-forget {
  flex-shrink: 0;
  width: 30px;
  background: none;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--color-on-surface-variant);
  cursor: pointer;
}

.discarded-forget:hover:not(:disabled) {
  background: var(--color-error-subtle);
  color: var(--color-error);
}

.discarded-footer {
  flex: 0 0 auto;
  display: flex;
  justify-content: flex-end;
  padding: 10px 16px;
  border-block-start: 1px solid var(--color-outline-variant);
  background: var(--color-surface-container-high);
}

.discarded-btn {
  padding: 5px 14px;
  font-family: var(--font-main);
  font-size: 0.92em;
  border: 1px solid var(--color-outline-variant);
  border-radius: var(--radius-xs);
  background: var(--color-surface);
  color: var(--color-on-surface);
  cursor: pointer;
}

.discarded-btn:hover {
  background: var(--word-btn-hover);
  border-color: var(--word-blue);
}
</style>
