<template>
  <button
    type="button"
    class="ctx-btn"
    :class="[layout === 'icons' ? 'ctx-btn--icon' : 'ctx-btn--item', { 'is-active': isActive }]"
    :role="entry.toggle ? 'menuitemcheckbox' : 'menuitem'"
    :data-entry-id="entry.id"
    :aria-checked="entry.toggle ? (isActive ? 'true' : 'false') : undefined"
    :aria-disabled="isDisabled ? 'true' : undefined"
    :tabindex="focused ? 0 : -1"
    :data-tip-title="layout === 'icons' ? entry.label : undefined"
    :data-tip-shortcut="layout === 'icons' && shortcut ? shortcut : undefined"
    :aria-label="layout === 'icons' ? accessibleName : undefined"
    @click="onClick"
  >
    <SvgIcon
      :name="entry.icon"
      :size="layout === 'icons' ? 18 : 16"
    />
    <span
      v-if="layout === 'items'"
      class="ctx-btn__label"
    >{{ entry.label }}</span>
    <span
      v-if="layout === 'items' && shortcut"
      class="ctx-btn__shortcut"
      dir="ltr"
    >{{ shortcut }}</span>
  </button>
</template>

<script setup lang="ts">
/**
 * פקד יחיד בתפריט ההקשר — אייקון בשורה העליונה או שורת כתיבה.
 *
 * ## למה קומפוננטה משלו, ולא `RibbonButton`
 *
 * שתי סיבות, ושתיהן נמדדו:
 *
 * 1. **`RibbonButton` נושא `@pointerdown.prevent` קשיח.** ברצועה זה נדרש —
 *    כפתור שם אינו אמור לקבל מיקוד, והלחיצה הייתה גוזלת אותו מהמסמך. בתפריט
 *    הקשר זה בדיוק ההפך: תפריט שאי אפשר למקד בו הוא תפריט שאי אפשר לנווט בו
 *    במקלדת. שער ש5 (scripts/context-menu-probe.mjs) מדד שהבחירה של המנוע
 *    **שורדת** מעבר מיקוד לפקד בממשק, ולכן המחיר הזה אינו קיים כאן.
 * 2. **ה-role שונה.** בתוך `role="menu"` פקד מתג הוא `menuitemcheckbox` עם
 *    `aria-checked`, ולא כפתור עם `aria-pressed`. `RibbonButton` מדווח
 *    `aria-pressed`, וזה נכון שם ופסול כאן.
 *
 * ## המצב של הפקד מגיע משני מקומות, לפי סוגו
 *
 * פקודת מנוע שואלת את `useCommand` — אותו מסלול, אותו `CommandState` ואותה
 * החזקת קריאה של הרצועה. פעולת מעטפת ופעולת לוח מקבלות את מצבן מהמודל, שכבר
 * הצליב יכולות עם תצלום הבחירה. אין כאן מקור אמת שלישי.
 */
import { computed, shallowRef, watch } from 'vue';
import type { CommandState } from 'superdoc/ui';
import SvgIcon from '../icons/SvgIcon.vue';
import { useCommand } from '../../composables/useCommand';
import { shortcutLabel } from '../shortcuts/registry';
import type { ContextMenuEntry } from './context-menu-model';

const props = defineProps<{
  entry: ContextMenuEntry;
  layout: 'icons' | 'items';
  /** האם זה הפקד שמחזיק את המיקוד ברשימה (roving tabindex). */
  focused: boolean;
}>();

const emit = defineEmits<{
  (e: 'run', entry: ContextMenuEntry): void;
}>();

/**
 * הקריאה מותנית בסוג, וזה מותר: לכל פריט יש מופע קומפוננטה משלו עם `key`
 * יציב, ולכן הסוג אינו משתנה תחת אותו setup.
 */
const command = props.entry.run.kind === 'command' ? useCommand(props.entry.run.command) : null;

/**
 * המצב **מוקפא** ברגע הפתיחה, ואינו רודף אחרי המנוע.
 *
 * ## התקלה שזה מתקן
 *
 * „הוא מהבהב — למשל המספור.” `CommandState` נפתר מקריאות א-סינכרוניות
 * שמתאפסות בכל מוטציה, ופתיחת התפריט עצמה מזיזה את הסמן — כלומר בדיוק ברגע
 * שהכרטיס נצבע, המצבים מתאפסים וחוזרים. ברצועה זה מטופל בהחזקת הקריאה
 * (engine/readout-hold.ts), אבל שם הפקד חי לאורך זמן וצריך להתעדכן.
 *
 * תפריט הקשר הוא ההפך: הוא **תצלום של רגע**. הוא נפתח, ונסגר בפעולה אחת, ואין
 * שום דבר במסמך שיכול להשתנות בזמן שהוא פתוח. פקד שמשנה את מראהו תחת היד היא
 * התנהגות שאין לה מה לתאר.
 *
 * מה שמוקפא הוא הקריאה הראשונה ש**נפתרה** (`supported`), ולא הראשונה שהגיעה:
 * לפני שהמנוע ענה כל הפקודות מדווחות „לא נתמך”, והקפאה שם הייתה מציגה כרטיס
 * מת. עד שהיא מגיעה, המצב החי מוצג כרגיל.
 */
const frozen = shallowRef<CommandState | null>(null);

watch(
  () => command?.state.value,
  (state) => {
    if (!frozen.value && state?.supported) frozen.value = { ...state };
  },
  { immediate: true },
);

const shown = computed<CommandState | null>(() => frozen.value ?? command?.state.value ?? null);

const isDisabled = computed(() => {
  if (shown.value) return !shown.value.supported || !shown.value.enabled;
  return props.entry.disabled === true;
});

const isActive = computed(() => shown.value?.active === true);

const shortcut = computed(() => (props.entry.shortcutId ? shortcutLabel(props.entry.shortcutId) : ''));

/**
 * השם הנגיש — **רק בשורת האייקונים**, ורק שם גם הטולטיפ (בתבנית).
 *
 * שורת כתיבה כבר אומרת את שמה על המסך ואת הצירוף שלה לצדו, ולכן היא אינה
 * מצהירה על `data-tip-*` כלל: כרטיס שכתוב בו „קישור…” מעל השורה שכתוב בה
 * „קישור…” הוא כפילות. גם Word אינו עושה זאת.
 *
 * באייקון אין תווית גלויה, ולכן הצירוף נכנס לשם הנגיש — הוא הדבר היחיד שיאמר
 * אותו לקורא מסך. בכרטיס עצמו הוא שדה נפרד (`data-tip-shortcut`) ולא סוגריים
 * בסוף מחרוזת.
 */
const accessibleName = computed(() =>
  shortcut.value ? `${props.entry.label} (${shortcut.value})` : props.entry.label,
);

/**
 * פקודת מנוע רצה **כאן**, דרך ה-`useCommand` של הפקד עצמו — בדיוק כמו כפתור
 * ברצועה, כולל הדיווח בעברית על כשל. שאר הסוגים נמסרים למעלה, ובשני המקרים
 * ה-`run` שנפלט הוא גם האות לסגור את התפריט.
 */
function onClick(): void {
  if (isDisabled.value) return;
  if (command) void command.run();
  emit('run', props.entry);
}
</script>

<style scoped>
.ctx-btn {
  display: flex;
  align-items: center;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-on-surface);
  font: inherit;
  cursor: pointer;
}

.ctx-btn:hover:not([aria-disabled='true']) {
  background: var(--word-btn-hover);
}

.ctx-btn.is-active:not([aria-disabled='true']) {
  background: var(--word-btn-active);
  border-color: var(--word-btn-active-border);
}

.ctx-btn.is-active:hover:not([aria-disabled='true']) {
  background: var(--word-btn-active-hover);
}

/* `aria-disabled` ולא התכונה `disabled`, ובכוונה: פריט תפריט מנוטרל חייב
   להישאר בר-מיקוד, אחרת החצים מדלגים עליו והמשתמש אינו יודע שהוא קיים. זו
   ההתנהגות של ARIA menu, ושל Word. האטימות היא זו של הרצועה (ribbon.css). */
.ctx-btn[aria-disabled='true'] {
  opacity: 0.38;
  cursor: default;
}

.ctx-btn:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}

.ctx-btn--icon {
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
}

.ctx-btn--item {
  gap: 8px;
  width: 100%;
  height: 30px;
  padding: 0 10px;
  text-align: start;
}

.ctx-btn__label {
  flex: 1;
  font-size: 13px;
}

/* `dir="ltr"` בתבנית: „Ctrl+K” בתוך שורה עברית מתהפך בלעדיו — אותה הכרעה
   שכבר נעשתה ב-ShortcutsDialog וב-TooltipLayer. */
.ctx-btn__shortcut {
  color: var(--color-on-surface-variant);
  font-size: 11px;
}
</style>
