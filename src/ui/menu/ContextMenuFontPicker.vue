<template>
  <div
    ref="rootRef"
    class="ctx-font"
    :class="`ctx-font--${control}`"
    data-context-menu-control
  >
    <RibbonCombo
      v-if="control === 'font-family'"
      :model-value="fonts.family.value"
      :options="fonts.familyOptions.value"
      :disabled="!fonts.familyEnabled.value"
      :sample="fonts.sampleText.value"
      width="100%"
      title="גופן"
      @done="onDone"
      @update:model-value="fonts.setFamily"
      @preview="fonts.hoverFamily"
      @preview-end="fonts.endHoverFamily"
    />
    <!--
      אותם props בדיוק של תיבת הגודל ברצועה (HomeTab.vue), כולל `normalize`:
      תיבה שכאן מתנהגת כבורר סגור וכאן כתיבת ערך הייתה שני פקדים שנראים אחד.
    -->
    <RibbonCombo
      v-else
      :model-value="fonts.size.value"
      :options="fonts.sizeOptions.value"
      :disabled="!fonts.sizeEnabled.value"
      :normalize="fonts.normalizeSize"
      empty-text="Enter מחיל את הגודל שהוקלד"
      list-min-width="52px"
      width="100%"
      title="גודל גופן"
      @done="onDone"
      @update:model-value="fonts.setSize"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * בורר גופן או בורר גודל, בתוך כרטיס תפריט ההקשר.
 *
 * ## מה כאן, ומה במפורש לא
 *
 * הפקד עצמו הוא `RibbonCombo` — **אותו** רכיב של הרצועה, עם אותם props. אין
 * כאן בורר שני שנראה כמו הראשון: לחיצה ימנית שמציגה רשימת גופנים מקובצת ורצועה
 * שמציגה אותה בסדר אחר היו שני פקדים לאותה שאלה.
 *
 * גם המצב אינו כאן: `useFontControls` קורא את `FONT_MEMORY` שהמעטפת מספקת, כלומר
 * הערך המוצג הוא בדיוק זה שברצועה — וזו כל הנקודה. גופן שהוחל מכאן מופיע מיד
 * למעלה, וגופן שהוחל למעלה מופיע כאן בפתיחה הבאה.
 *
 * ## למה יש כאן `div` עוטף
 *
 * שני דברים תלויים בו, ושניהם של הכרטיס ולא של הפקד:
 *
 * 1. **מיקוד מהחצים.** `ContextMenu.vue` מחזיק מפה של „מי מקבל מיקוד לפי
 *    מזהה”, והמשטח שמקבל מיקוד כאן הוא ה-`input` **בתוך** הפקד. `focusSelf`
 *    הוא מה שמוסר אותו, ולכן הכרטיס אינו צריך לדעת איך הפקד בנוי בפנים.
 * 2. **`data-context-menu-control`.** החצים בכרטיס מזיזים מיקוד; בתוך בורר הם
 *    פותחים רשימה ובוחרים בה. הכרטיס בודק את התכונה הזאת ומשאיר את המקלדת
 *    לפקד, אחרת החץ הראשון בתוך הרשימה היה קורע את המיקוד ממנה.
 */
import { ref } from 'vue';
import RibbonCombo from '../ribbon/common/RibbonCombo.vue';
import { useFontControls } from '../../composables/use-font-controls';
import type { ContextMenuControl } from './context-menu-model';

const props = defineProps<{
  control: ContextMenuControl;
}>();

const emit = defineEmits<{
  /**
   * הפקד סיים — הכרטיס נסגר, כמו אחרי כל פריט אחר בתפריט.
   *
   * `done` ולא „הוחל”, וזה תיקון של באג ולא שינוי שם: האירוע נפלט קודם מתוך
   * המטפלים של `update:modelValue`, כלומר רק כשהערך **השתנה**. `RibbonCombo`
   * פולט `update:modelValue` בבחירה בלבד (`choose`), ולכן לחיצה על הגופן שהתיבה
   * כבר מציגה — מילה ב-Arial, פתיחת הרשימה, לחיצה על „Arial” — לא סגרה את
   * הכרטיס ולא החזירה מיקוד, וההקלדה הבאה נכנסה לתיבת הגופן. אותו דבר קרה
   * ב-`Escape`: הפקד פולט `done` ומחזיר את המשתמש, ובלי מאזין נדרש `Escape`
   * שני. זה „הסמן לא כותב” של Y-PLONI#14 סעיף א.
   *
   * ההחלה **אינה** תנאי לפליטה, וזו הנקודה: „סיימתי עם הפקד” היא שאלה על
   * המשתמש, ולא על מה שהמסמך קיבל. גם ויתור, וגם בחירה שהוולידטור דחה, הם
   * סיום — ובשני המצבים הכרטיס חייב להיעלם ולהחזיר את המיקוד למסמך.
   */
  (e: 'done'): void;
}>();

const fonts = useFontControls();
const rootRef = ref<HTMLElement | null>(null);

/**
 * `RibbonCombo` פולט `done` **לפני** `update:modelValue` (ראו שם), ולכן הסגירה
 * רצה לפני ההחלה — בדיוק כמו ברצועה, שבה `returnFocusToDocument` מוקדם ל-
 * `fonts.setFamily`. ההחלה עצמה אינה נאבדת: `emit` הוא סינכרוני, ההסרה מה-DOM
 * היא של הפריסה הבאה, ולכן הפקודה נשלחת מפקד שעדיין מורכב. מה שקריטי הוא
 * שהמיקוד יחזור בכלל — נמדד ב-`scripts/qa/context-font-focus-probe.mjs`.
 */
function onDone(): void {
  emit('done');
}

/**
 * מיקוד למשטח שמקבל אותו בפועל.
 *
 * `defineExpose` ולא `tabindex` על השורש: הפקד הוא `input` אמיתי, ושורש שמקבל
 * מיקוד היה יוצר תחנת מיקוד שנייה לאותו פקד.
 */
function focusSelf(): void {
  rootRef.value?.querySelector<HTMLElement>('input, select')?.focus();
}

defineExpose({ focusSelf, control: props.control });
</script>

<style scoped>
.ctx-font {
  display: flex;
  align-items: center;
  min-width: 0;
}

/* הגופן לוקח את מה שנשאר, והגודל רוחב קבוע — כמו ברצועה, ובאותו יחס. */
.ctx-font--font-family {
  flex: 1 1 auto;
}

.ctx-font--font-size {
  flex: 0 0 56px;
}
</style>
