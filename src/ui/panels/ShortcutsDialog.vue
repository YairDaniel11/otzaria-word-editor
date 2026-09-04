<template>
  <div
    v-if="isOpen"
    class="modal-backdrop"
    @click.self="$emit('close')"
  >
    <div
      ref="dialogRef"
      class="shortcuts-dialog"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="TITLE_ID"
      tabindex="-1"
      @keydown.esc.stop="$emit('close')"
      @keydown.tab="onTab"
    >
      <div class="shortcuts-header">
        <span :id="TITLE_ID">קיצורי מקלדת</span>
        <button
          type="button"
          class="shortcuts-close-btn"
          data-tip-title="סגור"
          data-tip-shortcut="Esc"
          aria-label="סגור את רשימת הקיצורים"
          @click="$emit('close')"
        >
          ✕
        </button>
      </div>

      <!--
        `tabindex="0"` כדי שאפשר יהיה לגלול במקלדת: שמונים הרשומות בגובה
        84vh גולשות, ובדיאלוג יש שתי תחנות Tab בלבד — ואף אחת מהן אינה גוללת.
      -->
      <div
        class="shortcuts-body"
        tabindex="0"
      >
        <section
          v-for="group in groups"
          :key="group.group"
          class="shortcuts-group"
        >
          <h3 class="shortcuts-group-title">
            {{ group.title }}
          </h3>
          <dl class="shortcuts-list">
            <template
              v-for="item in group.items"
              :key="item.id"
            >
              <dt class="shortcut-combo">
                <!-- ראו ההסבר ב-<script>: הצירוף הוא טקסט משמאל לימין. -->
                <kbd dir="ltr">{{ item.label }}</kbd>
              </dt>
              <dd class="shortcut-desc">
                {{ item.description }}
                <span
                  v-if="item.native"
                  class="shortcut-native"
                >(של הדפדפן)</span>
              </dd>
            </template>
          </dl>
        </section>
      </div>

      <div class="shortcuts-footer">
        <button
          ref="primaryRef"
          type="button"
          class="shortcuts-btn"
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
 * „קיצורי מקלדת” — הרשימה שהמשתמש רואה.
 *
 * **היא נבנית מהרג'יסטרי, ולא נכתבת כאן.** זו כל הנקודה: רשימה כתובה ביד
 * מתיישנת בקומיט הראשון שמוסיף קיצור, וזה בדיוק הכשל שהתוכנית הזאת באה לחסל
 * — שתים-עשרה תוויות ברצועה הבטיחו צירוף שאין לו מאזין. כאן אין מה לשכוח
 * לעדכן: רשומה חדשה ב-`ui/shortcuts/registry.ts` מופיעה כאן מעצמה.
 *
 * **הכיווניות:** תוכן הדיאלוג עברי, כלומר הקשר RTL. הצירוף עצמו הוא טקסט
 * לטיני שנקרא משמאל לימין, ובלי `dir="ltr"` מפורש תווית מעורבת כמו
 * „Ctrl + Shift ימני” נשברת — האלגוריתם הדו-כיווני מזיז את המילה העברית
 * לתחילת השורה, והמשתמש קורא „ימני Ctrl + Shift”. ה-`dir` על ה-`<kbd>`
 * מבודד את הצירוף מההקשר.
 *
 * הנגישות היא מה שהתקדים במאגר דורש (`AboutDialog`, `LinkDialog`): שם נגיש,
 * מיקוד ראשוני, מלכודת Tab והחזרת מיקוד. `aria-modal="true"` הוא הצהרה שכל
 * מה שמאחור אינו קיים, ובלי מלכודת היא פשוט שקרית.
 */
import { nextTick, ref, watch } from 'vue';
import { shortcutsByGroup } from '../shortcuts/registry';

/** מקשר את החלון לכותרת שלו — השם הנגיש. */
const TITLE_ID = 'shortcuts-dialog-title';

/**
 * נקרא פעם אחת: הרג'יסטרי הוא `as const` ואינו משתנה בזמן ריצה, ולכן חישוב
 * מחדש בכל פתיחה היה עבודה בלי תוצאה.
 */
const groups = shortcutsByGroup();

const props = withDefaults(defineProps<{ isOpen?: boolean }>(), { isOpen: false });

defineEmits<{
  (e: 'close'): void;
}>();

const dialogRef = ref<HTMLElement | null>(null);
const primaryRef = ref<HTMLButtonElement | null>(null);

/** לאן המיקוד חוזר בסגירה — בלעדיו הוא נופל ל-`body` ו-Tab מתחיל מהתחלה. */
let focusOnClose: HTMLElement | null = null;

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      focusOnClose = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      void nextTick(() => {
        (primaryRef.value ?? dialogRef.value)?.focus();
      });
      return;
    }

    const target = focusOnClose;
    focusOnClose = null;
    // רק אם הוא עוד במסמך: הרצועה היא „mount on active”, ולשונית שהתחלפה
    // בזמן שהחלון היה פתוח לקחה איתה את הכפתור שנלחץ.
    if (target && document.contains(target)) target.focus();
  },
);

/** הפקדים שאפשר למקד בתוך החלון, בסדר ה-DOM. */
function focusables(): HTMLElement[] {
  const root = dialogRef.value;
  if (!root) return [];
  const selector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  return [...root.querySelectorAll<HTMLElement>(selector)].filter(
    (element) => !element.hasAttribute('disabled'),
  );
}

/** מלכודת המיקוד: Tab מהאחרון חוזר לראשון, ו-Shift+Tab מהראשון קופץ לאחרון. */
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
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.shortcuts-dialog {
  background: var(--color-surface);
  border: 1px solid var(--color-outline);
  border-radius: 8px;
  /* אותו צל של שאר הדיאלוגים: שחור ניטרלי, מוחרג בבדיקת הצבעים הקשיחים. */
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.24);
  width: min(720px, 92vw);
  max-height: 84vh;
  display: flex;
  flex-direction: column;
  outline: none;
}

.shortcuts-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  background: var(--color-surface-container-high);
  border-bottom: 1px solid var(--color-outline-variant);
  font-family: var(--font-main);
  font-size: 15px;
  font-weight: 600;
  color: var(--color-on-surface);
}

.shortcuts-close-btn {
  background: none;
  border: none;
  color: var(--color-on-surface-variant);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 4px 6px;
  border-radius: 4px;
}

.shortcuts-close-btn:hover {
  background: var(--word-btn-hover);
}

.shortcuts-body {
  overflow-y: auto;
  padding: 12px 16px;
  /* שתי עמודות של קבוצות במסך רחב, אחת בצר. */
  columns: 2;
  column-gap: 28px;
}

@media (max-width: 640px) {
  .shortcuts-body {
    columns: 1;
  }
}

.shortcuts-group {
  break-inside: avoid;
  margin-bottom: 14px;
}

.shortcuts-group-title {
  margin: 0 0 6px;
  font-family: var(--font-main);
  font-size: 12px;
  font-weight: 700;
  color: var(--color-primary);
}

.shortcuts-list {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 10px;
  margin: 0;
}

.shortcut-combo {
  margin: 0;
}

.shortcut-combo kbd {
  display: inline-block;
  background: var(--color-surface-container-high);
  border: 1px solid var(--color-outline-variant);
  border-radius: 4px;
  padding: 1px 6px;
  font-family: var(--font-main);
  font-size: 11px;
  white-space: nowrap;
  color: var(--color-on-surface);
}

.shortcut-desc {
  margin: 0;
  font-family: var(--font-main);
  font-size: 12px;
  color: var(--color-on-surface-variant);
}

.shortcut-native {
  opacity: 0.7;
}

.shortcuts-footer {
  display: flex;
  justify-content: flex-start;
  padding: 10px 16px;
  border-top: 1px solid var(--color-outline-variant);
}

.shortcuts-btn {
  background: var(--word-blue);
  color: var(--color-on-primary);
  border: none;
  border-radius: 4px;
  padding: 6px 18px;
  font-family: var(--font-main);
  font-size: 13px;
  cursor: pointer;
}

.shortcuts-btn:hover {
  background: var(--word-blue-dark);
}
</style>
