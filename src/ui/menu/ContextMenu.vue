<template>
  <div
    v-if="open && sections.length > 0"
    ref="cardRef"
    class="ctx-menu"
    role="menu"
    aria-label="תפריט הקשר"
    data-context-menu
    tabindex="-1"
    :style="cardStyle"
    @keydown="onKeydown"
  >
    <template
      v-for="(section, index) in drawn"
      :key="section.id"
    >
      <div
        v-if="index > 0"
        class="ctx-menu__sep"
        role="separator"
      />
      <div
        class="ctx-menu__section"
        :class="`ctx-menu__section--${section.layout}`"
        role="group"
        :aria-label="section.label"
      >
        <ContextMenuButton
          v-for="entry in section.entries"
          :key="entry.id"
          :ref="(element) => registerFocuser(entry.id, element)"
          :entry="entry"
          :layout="buttonLayout(section)"
          :focused="entry.id === focusedId"
          @run="onRun"
        />
        <ContextMenuFontPicker
          v-for="control in section.controls ?? []"
          :key="control"
          :ref="(element) => registerFocuser(control, element)"
          :control="control"
          @done="onControlDone"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * הכרטיס של תפריט ההקשר.
 *
 * ## מה הוא עושה, ומה הוא במפורש אינו עושה
 *
 * הוא מצייר מקטעים שהמודל בנה, מודד את עצמו וממקם את עצמו בנקודה שנלחצה,
 * ומנהל מיקוד וניווט מקלדת. הוא **אינו** מחליט מה מופיע (זה
 * `context-menu-model.ts`), אינו קורא למנוע (הפקד עושה זאת, או ההורה), ואינו
 * מטפל ב-`Escape`.
 *
 * ## למה Escape אינו כאן
 *
 * במעטפת יש בעלים אחד ל-Escape — `closeTopmost` ב-App.vue, שמנוהל דרך
 * הרג'יסטרי של הקיצורים. מאזין מקומי כאן היה יוצר בעלים שני, ומאזין כזה כבר
 * נכתב פעם ב-`RibbonMenuButton` ואינו יורה מעולם (הפופאובר שם אינו מקבל מיקוד
 * כלל). התפריט נסגר מ-Escape מפני שההורה מוסיף אותו כענף הראשון בשרשרת.
 *
 * ## שתי מדידות שקובעות התנהגות
 *
 * - **המיקום נמדד בשני מעברים.** הכרטיס נפרס מוסתר (`visibility: hidden`),
 *   נמדד, ורק אז מקבל קואורדינטות — אחרת פריים אחד מצויר בפינה השגויה.
 * - **גלילה סוגרת ואינה ממקמת מחדש.** עוגן-נקודה מתיישן ברגע שהתוכן זז: מלבן
 *   הכפתור זז יחד עם הכפתור, אבל הנקודה שנלחצה נשארת במקום שכבר אין בו כלום.
 * - **המדידה קובעת גם את סדר הציור.** כרטיס שהתהפך למעלה מצייר את המקטעים
 *   בסדר הפוך, כדי שמה שצמוד לסמן יישאר צמוד לו. ראו `drawn`.
 */
import { computed, nextTick, onUnmounted, ref, watch, type ComponentPublicInstance, type CSSProperties } from 'vue';
import ContextMenuButton from './ContextMenuButton.vue';
import ContextMenuFontPicker from './ContextMenuFontPicker.vue';
import { contextMenuFocusOrder, type ContextMenuEntry, type ContextMenuSection } from './context-menu-model';
import { contextMenuPlacement, type MenuPoint } from './menu-placement';
import { isRightToLeft } from '../../composables/popover-position';

const props = defineProps<{
  open: boolean;
  point: MenuPoint | null;
  sections: readonly ContextMenuSection[];
}>();

const emit = defineEmits<{
  (e: 'run', entry: ContextMenuEntry): void;
  (e: 'close'): void;
}>();

const cardRef = ref<HTMLElement | null>(null);
const focusedId = ref<string | null>(null);

/** הצורה שנמדדת לפני שיש מה למדוד — אותה תבנית של composables/popover-position. */
const UNMEASURED: CSSProperties = {
  position: 'fixed',
  top: '0px',
  left: '0px',
  visibility: 'hidden',
};

const cardStyle = ref<CSSProperties>({ ...UNMEASURED });

/**
 * לאיזה צד של הנקודה הכרטיס נפתח בפועל. נקבע במדידה (`place`).
 */
const side = ref<'below' | 'above'>('below');

/**
 * המקטעים בסדר שבו הם **מצוירים**, ולא בסדר שהמודל בנה.
 *
 * ## למה
 *
 * כשאין מקום מתחת לנקודה הכרטיס מתהפך למעלה, כלומר הקצה **התחתון** שלו נוגע
 * בסמן. בסדר הרגיל זה מרחיק מהסמן בדיוק את מה שקרוב אליו ביותר בפתיחה למטה:
 * שורת הלוח, שורת הגופן ושורת העיצוב נוחתות בראש הכרטיס, כלומר בקצה הרחוק,
 * ובלחיצה בתחתית העמוד — המצב הנפוץ, כי שם נמצא סוף הטקסט — הן דורשות לחזור
 * עם העכבר לאורך כל הכרטיס.
 *
 * ההיפוך שומר על מה שהסדר הזה בא לומר: **המרחק מהסמן**. מה שהיה ראשון בפתיחה
 * למטה הוא האחרון בפתיחה למעלה, ולכן הוא הצמוד לנקודה בשני המקרים.
 *
 * ההיפוך הוא על **מקטעים** ולא על פריטים: מקטע הוא קבוצה שנקראת יחד („קישור”,
 * „הערת שוליים”), והיפוך בתוכה היה מערבב רשימה ולא מקרב אותה.
 *
 * המדידה אינה נעשית שוב אחרי ההיפוך, ואינה צריכה: אותם מקטעים ואותם מפרידים
 * בסדר אחר הם אותו גובה ואותו רוחב בדיוק.
 */
const drawn = computed(() =>
  side.value === 'above' ? [...props.sections].reverse() : props.sections,
);

/**
 * מי מקבל מיקוד, לפי מזהה.
 *
 * פונקציה ולא אלמנט, וזה מה שהשתנה כשנוספה שורת הגופן: שם המשטח שמקבל מיקוד
 * הוא ה-`input` **בתוך** הפקד, ורק הפקד יודע מה בתוכו. כפתור נשאר כפתור —
 * הסגירה עליו היא `node.focus()`.
 */
const focusers = new Map<string, () => void>();

function registerFocuser(id: string, element: Element | ComponentPublicInstance | null): void {
  const instance = element as (ComponentPublicInstance & { focusSelf?: () => void }) | null;
  if (typeof instance?.focusSelf === 'function') {
    focusers.set(id, instance.focusSelf);
    return;
  }
  const node = instance?.$el ?? (element as Element | null);
  if (node instanceof HTMLElement) focusers.set(id, () => node.focus());
  else focusers.delete(id);
}

/**
 * צורת הכפתורים במקטע.
 *
 * `ContextMenuButton` מכיר שתי צורות בלבד, ומקטע הבוררים אינו מחזיק כפתורים
 * כלל — ולכן הוא אינו נשאל, והברירה כאן היא בין השתיים שקיימות.
 */
function buttonLayout(section: ContextMenuSection): 'icons' | 'items' {
  return section.layout === 'items' ? 'items' : 'icons';
}

/**
 * מזהי כל מה שהחצים עוברים עליו — פריטים ובוררים.
 *
 * מ-`drawn` ולא מ-`sections`: החץ למטה חייב להזיז מיקוד למה שנמצא למטה
 * **על המסך**. בכרטיס שהתהפך זה הסדר ההפוך מזה שהמודל בנה.
 */
const focusOrder = computed(() => contextMenuFocusOrder(drawn.value));

function place(): void {
  const card = cardRef.value;
  const point = props.point;
  if (!card || !point) return;

  // `offsetWidth`/`offsetHeight` ולא `getBoundingClientRect`: המלבן מוחזר
  // **אחרי** ה-transform, והכרטיס נמדד בפריים הראשון של אנימציית הכניסה —
  // כלומר ב-`scale(0.98)`. כרטיס בן 264px היה נמדד כ-258.7, וב-RTL הקצה הימני
  // שלו היה נוחת 5.3px מעבר לנקודה שנלחצה, כלומר מכסה אותה.
  const placement = contextMenuPlacement(
    point,
    { width: card.offsetWidth, height: card.offsetHeight },
    { width: window.innerWidth, height: window.innerHeight },
    { rtl: isRightToLeft(card) },
  );

  side.value = placement.side;
  cardStyle.value = {
    position: 'fixed',
    top: `${placement.top}px`,
    left: `${placement.left}px`,
    maxHeight: `${placement.maxHeight}px`,
  };
  // אחרי שהתקרה וההיפוך נכנסו ל-DOM, ולא באותה שורה: `drawn` נגזר מ-`side`,
  // ולפני העדכון הכרטיס עדיין מצויר בסדר הקודם ובלי `max-height`.
  void nextTick(revealCaretEdge);
}

/**
 * גוללת את הכרטיס אל הקצה שצמוד לסמן.
 *
 * ## הבאג שזה סוגר
 *
 * כרטיס שהתהפך למעלה מצויר בסדר הפוך (ראו `drawn`), כלומר מה שצמוד לסמן יושב
 * ב**סוף** ה-DOM. כשהתוכן גבוה מהתקרה הכרטיס נגלל, ו-`scrollTop: 0` מראה
 * דווקא את הקצה הרחוק — כלומר ההיפוך דוחף מתחת לקו בדיוק את מה שהוא נועד
 * לקרב. שני התנאים נפגשים בפועל: התקרה נגזרת מהמקום שנשאר מעל הנקודה, ושורת
 * הגופן הוסיפה לכרטיס מקטע שלם.
 *
 * נמדד ב-Chrome על ה-dist, חלון 756×413: `scrollHeight: 326` מול
 * `clientHeight: 268`, ו„הוסף למילון” — הפריט **היחיד** בכרטיס שנוגע במילה
 * שנלחצה — נחתך לגמרי. לחיצה לפי המלבן שלו נחתה על `.superdoc-text-run`,
 * כלומר על המסמך, והתפריט פשוט נסגר (`scripts/qa/spellcheck-qa.mjs`).
 *
 * ## למה גלילה ולא ביטול ההיפוך
 *
 * זו ההשלמה של ההיפוך ולא עקיפה שלו: מה שהוא מבטיח הוא **מרחק מהסמן**, ואחרי
 * הגלילה ההבטחה הזאת נכונה בשני המצבים — מה שנראה בלי לגלול הוא מה שקרוב
 * לנקודה שנלחצה. ביטול ההיפוך היה מחזיר את הפריט למקום נראה ומרחיק אותו
 * מהעכבר בדיוק בלחיצה בתחתית החלון, שהיא המקרה הנפוץ.
 *
 * בפתיחה למטה אין מה לעשות: שם הקצה הצמוד לסמן הוא הראשון, והוא כבר נראה.
 * כרטיס שאינו נגלל בכלל מקבל השמה שנצמדת לאפס, כלומר no-op.
 */
function revealCaretEdge(): void {
  const card = cardRef.value;
  if (!card || side.value !== 'above') return;
  card.scrollTop = card.scrollHeight;
}

function focusEntry(id: string | null): void {
  focusedId.value = id;
  if (id) void nextTick(() => focusers.get(id)?.());
}

/**
 * צעד ברשימה השטוחה. פריט מנוטרל **אינו** מדולג: הוא `aria-disabled` ולא
 * `disabled`, ולכן הוא בר-מיקוד — כך המשתמש יודע שהפעולה קיימת ואינה זמינה,
 * במקום שהיא תיעלם לו מתחת לחצים.
 */
function step(delta: number): void {
  const list = focusOrder.value;
  if (list.length === 0) return;
  const current = focusedId.value === null ? -1 : list.indexOf(focusedId.value);
  const next = current === -1 ? 0 : (current + delta + list.length) % list.length;
  focusEntry(list[next]);
}

function onKeydown(event: KeyboardEvent): void {
  // טאב לפני הכול, וגם מתוך בורר: הוא סוגר את הכרטיס תמיד, אחרת המיקוד היה
  // בורח ממנו והוא היה נשאר פתוח מאחור.
  if (event.key === 'Tab') {
    // `preventDefault` כדי שהדפדפן לא ימשיך להזיז מיקוד לתוך כרטיס שנסגר.
    event.preventDefault();
    emit('close');
    return;
  }

  /**
   * מקלדת **בתוך בורר** שייכת לבורר: שם החצים פותחים את הרשימה ובוחרים בה,
   * ו-Home/End מזיזים סמן בטקסט. בלי היציאה הזאת החץ הראשון בתוך רשימת הגופנים
   * היה קורע את המיקוד ממנה אל הפריט הבא בתפריט.
   *
   * Escape אינו נוגע בזה: הוא אינו מטופל כאן בכלל (ראו הערת הראש), והבורר עצמו
   * עוצר אותו כשהרשימה פתוחה.
   */
  if (event.target instanceof Element && event.target.closest('[data-context-menu-control]')) {
    return;
  }

  const card = cardRef.value;
  // בעברית החץ שמאלה מתקדם בשורת האייקונים, וימינה חוזר.
  const forwardKey = card && isRightToLeft(card) ? 'ArrowLeft' : 'ArrowRight';
  const backKey = forwardKey === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';

  switch (event.key) {
    case 'ArrowDown':
    case forwardKey:
      event.preventDefault();
      step(1);
      break;
    case 'ArrowUp':
    case backKey:
      event.preventDefault();
      step(-1);
      break;
    case 'Home':
      event.preventDefault();
      focusEntry(focusOrder.value[0] ?? null);
      break;
    case 'End':
      event.preventDefault();
      focusEntry(focusOrder.value[focusOrder.value.length - 1] ?? null);
      break;
    default:
      break;
  }
}

function onPointerDown(event: PointerEvent): void {
  const card = cardRef.value;
  if (card && event.target instanceof Node && card.contains(event.target)) return;
  emit('close');
}

/** גלילה **בתוך** הכרטיס אינה סוגרת אותו; כל גלילה אחרת כן. */
function onScroll(event: Event): void {
  const card = cardRef.value;
  if (card && event.target instanceof Node && card.contains(event.target)) return;
  emit('close');
}

function onResize(): void {
  emit('close');
}

function bind(): void {
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onResize);
}

function unbind(): void {
  document.removeEventListener('pointerdown', onPointerDown, true);
  document.removeEventListener('scroll', onScroll, true);
  window.removeEventListener('resize', onResize);
}

/**
 * הנקודה והמקטעים נצפים יחד עם `open`, ולא רק הוא.
 *
 * תפריט שכבר פתוח יכול להיפתח **מחדש** במקום אחר: `Shift+F10` בזמן שהוא פתוח,
 * או לחיצה ימנית שנייה. אז `open` נשאר `true`, ובלי המעקב הזה הכרטיס היה
 * מצייר את הדגם החדש בקואורדינטות הישנות ועם מיקוד על פריט שכבר אינו קיים.
 */
watch(
  () => [props.open, props.point, props.sections] as const,
  async ([open]) => {
    if (!open) {
      unbind();
      focusers.clear();
      focusedId.value = null;
      cardStyle.value = { ...UNMEASURED };
      // הצד נמדד בכל פתיחה מחדש. בלי האיפוס פתיחה שנייה הייתה מציירת בסדר של
      // הראשונה עד שהמדידה תחזור — כלומר פריים אחד בסדר הלא נכון.
      side.value = 'below';
      return;
    }

    // האיפוס **לפני** ההמתנה: אחריה יש פריים שבו הכרטיס כבר מציג את הדגם
    // החדש עם הסימון של הפתיחה הקודמת.
    // בלי פריט מסומן מראש — כמו ב-Word. המיקוד יושב על הכרטיס עצמו, והחץ
    // הראשון בוחר את הפריט הראשון (`step` מטפל ב„אין נבחר”).
    focusedId.value = null;

    bind();
    await nextTick();
    place();
    cardRef.value?.focus();
  },
  // `immediate` כדי שהרכבה שנולדת פתוחה תתנהג כמו פתיחה: בלעדיו כרטיס שהורכב
  // עם `open: true` היה מצויר בלי מיקום ובלי מיקוד, וזה גם המצב בבדיקות.
  { immediate: true },
);

onUnmounted(unbind);

function onRun(entry: ContextMenuEntry): void {
  emit('run', entry);
  emit('close');
}

/**
 * המשתמש סיים עם בורר הגופן או הגודל. אין `run` להעלות — הפקד הריץ את הפקודה
 * בעצמו, בדיוק כמו כפתור של פקודת מנוע — ומה שנשאר הוא הסגירה, שהיא ההתנהגות
 * של כל פעולה אחרת בכרטיס: פעולה אחת, והכרטיס נעלם.
 *
 * „סיים” ולא „הוחל”, ובכוונה: הבורר הוא `input`, כלומר הוא לוקח מיקוד — ומי
 * שאינו מחזיר אותו משאיר את ההקלדה הבאה בתוך התיבה. לכן גם `Escape` בתיבה וגם
 * בחירת הערך שהיא כבר מציגה סוגרים את הכרטיס, אף שאין להם מה להחיל. את המיקוד
 * מחזיר הפקד עצמו (`RibbonCombo`, `focusDocument`), והסגירה (`App.vue`,
 * `closeContextMenu`) מחזירה אותו שוב — כדי שכרטיס לא יישאר פתוח מעל מסמך ממוקד.
 */
function onControlDone(): void {
  emit('close');
}

defineExpose({ place });
</script>

<style scoped>
/* `top` / `left` / `max-height` מגיעים מ-`:style`. הצל, המסגרת והרדיוס הם
   אלה של פופאוברי הרצועה — כרטיס שנראה אחרת היה נראה כמו חלון של מישהו אחר.

   z-index 2500: מעל „חיפוש והחלפה” (2000), שאינו מודאלי ואפשר לערוך מתחתיו —
   תפריט שנפתח לידו ומוסתר על ידו הוא באג — ומתחת ל„אודות” ו„קיצורי מקלדת”
   (3000), שמעליהם ממילא אין תפריט: מודאל פתוח חוסם את הפתיחה מלכתחילה. */
.ctx-menu {
  position: fixed;
  z-index: 2500;
  min-width: 240px;
  max-width: 320px;
  padding: 4px;
  background: var(--color-surface);
  border: 1px solid var(--color-outline);
  border-radius: var(--radius-md);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.16);
  overflow-y: auto;
  animation: ctx-menu-in 90ms cubic-bezier(0.2, 0, 0, 1);
}

@media (prefers-reduced-motion: reduce) {
  .ctx-menu {
    animation: none;
  }
}

@keyframes ctx-menu-in {
  from {
    opacity: 0;
    transform: scale(0.98);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* הכרטיס מקבל מיקוד בפתיחה (tabindex="-1") — בלי טבעת: הוא המכל, לא פקד. */
.ctx-menu:focus {
  outline: none;
}

.ctx-menu__section--icons {
  display: flex;
  gap: 2px;
  padding: 2px;
}

/* שורת הבוררים: הגופן נמתח, הגודל ברוחב קבוע — הפקדים עצמם קובעים גובה. */
.ctx-menu__section--fonts {
  display: flex;
  gap: 4px;
  padding: 2px;
}

.ctx-menu__section--items {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.ctx-menu__sep {
  height: 1px;
  margin: 4px 6px;
  background: var(--color-outline-variant);
}
</style>
