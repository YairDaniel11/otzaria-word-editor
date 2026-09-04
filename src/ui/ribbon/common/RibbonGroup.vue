<template>
  <div
    class="word-ribbon-group"
    :class="{ 'word-ribbon-group--end': end }"
  >
    <div
      class="word-group-content"
      :class="{ 'column-flow': columnFlow }"
    >
      <slot />
    </div>
    <div class="word-group-footer">
      <span class="word-group-title">{{ menuString(title) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { menuString } from '../i18n';

/* אין כאן `launcher`: כפתור ההרחבה בפינת הקבוצה הוסר מהעיצוב (b2f0635),
   ה-HTML שלו הוסר (e66dc8f), וה-prop עצמו נשאר אחריו בלי צרכן. הוא הוסר ביחד
   עם כל אתרי הקריאה שהעבירו אותו — prop שאינו מוצהר נוזל ל-`$attrs` ומרונדר
   כתכונת DOM על ה-div של הקבוצה. */
withDefaults(
  defineProps<{
    title: string;
    columnFlow?: boolean;
    /**
     * הצמדה לקצה הרצועה — בעברית, שמאל. מה ש-Word עושה ל„עזרה”: קבוצה שאינה
     * חלק מהזרימה של הפעולות, ולכן יושבת בקצה קבוע ולא בתור.
     *
     * הכלל עצמו (`margin-inline-start: auto`) ב-ribbon.css, וכתוב שם גם התנאי
     * שהוא דורש: `width: 100%` על `.ribbon-tab-pane` של הלשונית. בלי מרווח
     * פנוי אין מה ש-`auto` יבלע, וההצמדה פשוט אינה קורית.
     */
    end?: boolean;
  }>(),
  {
    columnFlow: false,
    end: false,
  }
);
</script>
