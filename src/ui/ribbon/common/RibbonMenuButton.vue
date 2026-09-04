<template>
  <div
    ref="containerRef"
    class="ribbon-menu"
    @keydown.escape="onEscape"
  >
    <!--
      מצב מפוצל: לחיצה על הגוף מפעילה, לחיצה על החץ פותחת. המעטפת
      (`.word-split`) חיה ב-styles/ribbon.css יחד עם `.word-btn` שהיא עוטפת.
    -->
    <div
      v-if="split"
      class="word-split"
      :class="{ 'word-split--open': isOpen }"
    >
      <RibbonButton
        :icon="icon"
        :label="label"
        :variant="variant"
        :tooltip="tooltip"
        :description="description"
        :active="active"
        :disabled="actionDisabled ?? disabled"
        @click="$emit('action')"
      />
      <button
        type="button"
        class="word-split__arrow"
        :data-tip-title="menuString(menuTooltip || label)"
        :data-tip-desc="menuDescription ? menuString(menuDescription) : undefined"
        :aria-label="menuString(menuTooltip || label)"
        :disabled="disabled"
        aria-haspopup="menu"
        :aria-expanded="isOpen ? 'true' : 'false'"
        @pointerdown.prevent
        @click="toggle"
      >
        <SvgIcon
          name="chevronDown"
          :size="8"
        />
      </button>
    </div>

    <RibbonButton
      v-else
      :icon="icon"
      :label="label"
      :variant="variant"
      :active="isOpen"
      :disabled="disabled"
      :tooltip="tooltip"
      aria-haspopup="menu"
      :aria-expanded="isOpen ? 'true' : 'false'"
      @click="toggle"
    />

    <!--
      `:style` ולא מיקום ב-CSS: `.word-ribbon-body` חותך אנכית, ולכן התפריט
      `position: fixed` בקואורדינטות שנמדדות — composables/popover-position.ts.
    -->
    <div
      v-if="isOpen"
      ref="popoverRef"
      class="ribbon-menu__popover"
      role="menu"
      :aria-label="menuString(label)"
      :style="popoverStyle"
      @pointerdown.prevent.stop
    >
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        class="ribbon-menu__item"
        role="menuitem"
        @click="choose(item.id)"
      >
        <span class="ribbon-menu__item-label">{{ menuString(item.label) }}</span>
        <span
          v-if="item.hint"
          class="ribbon-menu__item-hint"
        >{{ menuString(item.hint) }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * כפתור בסרגל שפותח תפריט בחירה — התבנית ש-Word משתמש בה ל„שוליים”, „כיוון”,
 * „גודל” ו„עמודות”.
 *
 * למה קומפוננטה חדשה ולא הרחבה של `TablePicker.vue`: התוכן שם הוא גריד תאים
 * עם hover מתמשך, וכאן זו רשימת פריטים; מה שמשותף הוא רק מכניקת הפופאובר.
 * הרחבה של הקיים הייתה מוסיפה לו slot ומצב שאין לו צורך.
 *
 * שתי נקודות שאינן קוסמטיות:
 *
 * 1. **`@pointerdown.prevent` על הפקדים.** בלעדיו הלחיצה גוזלת את המיקוד
 *    מהעורך, הבחירה במסמך אובדת, וכל פעולה שנשענת על הסמן נכשלת
 *    ב-`selection-required`. ב-`RibbonButton` זה כבר קיים; כאן זה נדרש גם על
 *    הפופאובר עצמו, ולכן `@pointerdown.prevent.stop` על המכל שלו.
 * 2. **`.stop` באותו handler** הוא מה שמונע מהמאזין הגלובלי לסגור את התפריט
 *    ברגע שנוגעים בתוכו — אותה מכניקה כמו ב-TablePicker.
 */
import { ref, onMounted, onUnmounted } from 'vue';
import RibbonButton from './RibbonButton.vue';
import SvgIcon from '../../icons/SvgIcon.vue';
import { menuString } from '../i18n';
import { usePopoverPosition } from '../../../composables/popover-position';

/** פריט בתפריט. מקומי בכוונה: `<script setup>` אינו מייצא, והצרכן מעביר literal. */
interface MenuItem {
  id: string;
  label: string;
  /** שורה שנייה קטנה — היחידות או ההסבר. אופציונלית. */
  hint?: string;
}

const props = withDefaults(
  defineProps<{
    icon: string;
    label: string;
    tooltip?: string;
    disabled?: boolean;
    items: readonly MenuItem[];
    /**
     * הגודל של הכפתור הפותח, בדיוק כמו ב-`RibbonButton`.
     *
     * היה כאן `variant="large"` מקודד, וזה החזיק כל עוד כל תפריט היה פקד
     * ראשי. „מספרי שורות” ו„גבולות עמוד” ב„פריסה” אינם: ב-Word הם שני קטנים
     * בעמודה לצד ארבעת הגדולים, ובלי ה-prop הזה לא הייתה דרך לומר זאת.
     *
     * ברירת המחדל נשארת `large`, ולכן כל אתר קריאה קיים אינו משתנה.
     */
    variant?: 'large' | 'small' | 'icon-only';
    /**
     * כפתור מפוצל: הגוף מפעיל פעולה (`action`), והחץ פותח את התפריט.
     *
     * זו התבנית של „תבליטים” ו„מספור” ב-Word, ושל בורר הצבע כאן — ולכן היא
     * דגל על הקומפוננטה הזאת ולא קומפוננטה שלישית: הפופאובר, המיקום, סגירת
     * ה-Escape והלחיצה-בחוץ זהים לחלוטין, ומה שנבדל הוא ראש הפקד בלבד.
     */
    split?: boolean;
    /** מצב לחוץ של כפתור הפעולה. במצב מפוצל בלבד — בלעדיו אין מה לדלוק. */
    active?: boolean;
    /**
     * ניטרול נפרד לכפתור הפעולה. „תבליטים” ו„מספור” נשענים על פקודה
     * (`bullet-list`) שאינה אותה יכולת כמו התפריט (`canManageLists`), ואחת
     * מהן יכולה להיות זמינה בלי השנייה. חסר = כמו `disabled`.
     */
    actionDisabled?: boolean;
    /** שורת ההסבר בטולטיפ של כפתור הפעולה — בדיוק כמו ב-`RibbonButton`. */
    description?: string;
    /**
     * שם החץ — הכותרת בטולטיפ וגם השם הנגיש שלו (החץ הוא אייקון בלבד).
     * חסר = ה-`label` של הפקד.
     *
     * שם ולא משפט: שערי ה-QA מאתרים פקד לפי תחילית השם (qa-api.js), וההסבר
     * שייך ל-`menuDescription`.
     */
    menuTooltip?: string;
    /** שורת ההסבר בטולטיפ של החץ — מה יש בתפריט, או למה הוא מנוטרל. */
    menuDescription?: string;
  }>(),
  { variant: 'large', split: false, active: false },
);

const emit = defineEmits<{
  (e: 'select', id: string): void;
  /** לחיצה על גוף הכפתור המפוצל. אינו נפלט במצב הרגיל. */
  (e: 'action'): void;
}>();

const containerRef = ref<HTMLElement | null>(null);
const popoverRef = ref<HTMLElement | null>(null);
const isOpen = ref(false);

const { popoverStyle } = usePopoverPosition(containerRef, popoverRef, isOpen);

function close(): void {
  isOpen.value = false;
}

function toggle(): void {
  if (props.disabled) return;
  isOpen.value = !isOpen.value;
}

function choose(id: string): void {
  close();
  emit('select', id);
}

/**
 * Escape סוגר את התפריט ומחזיר את המיקוד לכפתור.
 *
 * `stopPropagation` רק כשהתפריט פתוח: Escape סוגר גם דיאלוגים ומצב מיקוד
 * ברמת המעטפת, ואירוע שנחטף בזמן שהתפריט סגור היה מנטרל אותם בשקט.
 */
function onEscape(event: KeyboardEvent): void {
  if (!isOpen.value) return;
  event.stopPropagation();
  close();
  // במצב מפוצל הכפתור שפתח הוא החץ, ולא הראשון בסדר ה-DOM.
  const opener = props.split ? '.word-split__arrow' : 'button';
  containerRef.value?.querySelector<HTMLElement>(opener)?.focus();
}

function handleClickOutside(event: PointerEvent): void {
  if (containerRef.value && !containerRef.value.contains(event.target as Node)) close();
}

onMounted(() => {
  document.addEventListener('pointerdown', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('pointerdown', handleClickOutside);
});
</script>

<style scoped>
.ribbon-menu {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
}

/* `top` / `left` / `max-height` מגיעים מ-`:style` — ראו popover-position.ts.
   `overflow-y: auto` הוא הצד השני של אותה החלטה: כשאין מקום לגובה המלא התפריט
   נגלל בתוך עצמו, ולא נחתך. */
.ribbon-menu__popover {
  position: fixed;
  z-index: 1000;
  min-width: 200px;
  background: var(--color-surface);
  border: 1px solid var(--color-outline);
  border-radius: var(--radius-sm);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.16);
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  overflow-y: auto;
}

.ribbon-menu__item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  width: 100%;
  padding: 5px 8px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-on-surface);
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.ribbon-menu__item:hover {
  background: var(--color-primary-subtle);
}

.ribbon-menu__item-label {
  font-size: 12px;
}

.ribbon-menu__item-hint {
  font-size: 10px;
  opacity: 0.7;
}
</style>
