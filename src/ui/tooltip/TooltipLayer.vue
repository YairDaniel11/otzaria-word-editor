<template>
  <!--
    מופע אחד לכל התוכנה. `position: fixed` בקואורדינטות שנמדדות — אותה החלטה
    ומאותה סיבה כמו בפופאוברים של הרצועה (composables/popover-position.ts):
    `.word-ribbon-body` חותך אנכית, ורק `fixed` יוצא מהחיתוך.

    ה-`key` נדרש כדי שאנימציית הכניסה תרוץ מחדש כשהטולטיפ *עובר* מכפתור לכפתור
    ולא נסגר ביניהם: בלעדיו Vue היה מחזיר את אותו אלמנט, ו-`animation` שכבר רצה
    אינה מתחילה שוב.
  -->
  <div
    v-if="content"
    :key="tipKey"
    ref="tipRef"
    class="word-tip"
    :class="`word-tip--${side}`"
    role="tooltip"
    :style="tipStyle"
  >
    <div class="word-tip__head">
      <span class="word-tip__title">{{ content.title }}</span>
      <kbd
        v-if="content.shortcut"
        class="word-tip__key"
        dir="ltr"
      >{{ content.shortcut }}</kbd>
    </div>
    <p
      v-if="content.description"
      :id="DESCRIPTION_ID"
      class="word-tip__desc"
    >
      {{ content.description }}
    </p>
  </div>
</template>

<script setup lang="ts">
/**
 * הטולטיפ של התוכנה — שכבה אחת, לכל הפקדים.
 *
 * ## מה הוחלף
 *
 * עד עכשיו הטולטיפ היה תכונת `title` מולדת: מלבן של מערכת ההפעלה, בגופן שאינו
 * הגופן של הממשק, שמופיע אחרי שנייה שלמה ומציג את השם, ההסבר והצירוף כמחרוזת
 * אחת. כאן הוא כרטיס במעטפת: כותרת, צירוף המקשים לצדה, וההסבר מתחתיהם.
 *
 * ## למה שכבה אחת ומסירת אירועים, ולא מאזינים בכל פקד
 *
 * שתי סיבות, ואף אחת מהן אינה נוחות:
 *
 * 1. **כפתור מנוטרל.** הדפדפן אינו שולח אירועי עכבר לפקד `disabled` — האירוע
 *    מנותב להורה. בדיוק שם הטולטיפ הכי נחוץ: הוא נושא את *הסיבה* („אין
 *    בחירה”, „הפעולה אינה זמינה בגרסה הזאת של המנוע”). לכן העוגן נפתר גם
 *    ב-`elementFromPoint`, שהיא בדיקה גיאומטרית ואינה תלויה בשליחת אירועים.
 * 2. **טולטיפ אחד בלבד על המסך.** טיימר וסטייט לכל פקד היו מאפשרים שניים
 *    בבת אחת בזמן מעבר מהיר בין כפתורים.
 *
 * ## אין כאן כיבוי של הטולטיפ המולד, כי אין מה לכבות
 *
 * הגרסה הראשונה השאירה `title` על הפקדים והסירה אותו בריחוף. זה נכשל, ונראה
 * בצילום מסך: הכרטיס והמלבן האפור זה מעל זה על „כיוון פסקה משמאל לימין”.
 * הדפדפן קורא את `title` **בתזוזת העכבר** ולא כשהוא מצייר, כך שהטקסט כבר נלכד
 * בתזוזה שבה הסמן נעצר וההשהיה שלו כבר רצה; הסרה שמתרחשת אחריה אינה מבטלת
 * כלום. אין תזמון שמנצח את זה — כל עוד התכונה על האלמנט כשהעכבר עוצר, המלבן
 * יצויר.
 *
 * לכן `title` אינו קיים באף אלמנט DOM בתוכנה (ראו `TIP_ANCHOR_SELECTOR`
 * ב-tooltip-content.ts, ואת השער tests/unit/native-title.test.ts שאוכף זאת).
 * מה שהיה כאן מנגנון השאלה-והחזרה של שלוש תכונות — נמחק: הבעיה אינה מנוהלת,
 * היא אינה קיימת.
 */
import { nextTick, onUnmounted, ref, shallowRef, type CSSProperties } from 'vue';
import { popoverPlacement } from '../../composables/popover-position';
import {
  TIP_ANCHOR_SELECTOR,
  TIP_EXCLUDED_SELECTOR,
  readTip,
  type TipContent,
} from './tooltip-content';

/** כמה זמן העכבר צריך לנוח על הפקד לפני שהכרטיס נפתח. */
const SHOW_DELAY_MS = 400;

/**
 * אותו זמן, כשכרטיס אחר *כבר* פתוח.
 *
 * מעבר על שורת כפתורים ברצועה הוא פעולה אחת מבחינת המשתמש, ולא שמונה: אחרי
 * שהטולטיפ הראשון נפתח, השאר עוקבים אחרי העכבר כמעט מיד — זו ההתנהגות של Word.
 */
const SWITCH_DELAY_MS = 70;

/**
 * השהיית הסגירה ביציאה.
 *
 * בין שני כפתורים סמוכים יש רווח של פיקסלים בודדים, והעכבר חולף בו. סגירה
 * מיידית הייתה מהבהבת שם — הכרטיס נסגר ונפתח באותו רגע.
 */
const HIDE_DELAY_MS = 120;

/** המרווח בין הפקד לכרטיס. גדול מזה של פופאובר: כרטיס אינו „נפתח מ”הכפתור. */
const TIP_GAP_PX = 8;

/** ה-id שמקשר את הפקד להסבר. השם קבוע — יש מופע אחד בכל רגע. */
const DESCRIPTION_ID = 'word-tip-desc';

const content = shallowRef<TipContent | null>(null);
const side = ref<'below' | 'above'>('below');
const tipKey = ref(0);
const tipRef = ref<HTMLElement | null>(null);

/**
 * לפני שהכרטיס נמדד אין לו מקום.
 *
 * הוא חייב להיות ב-DOM כדי שיהיה לו גודל, ואסור שייראה על הקואורדינטה השגויה
 * ולו לפריים אחד — `visibility: hidden` הוא מה שמפריד בין השניים. אותה תבנית
 * בדיוק כמו ב-popover-position.ts.
 */
const UNPLACED: CSSProperties = { top: '0px', left: '0px', visibility: 'hidden' };

const tipStyle = ref<CSSProperties>({ ...UNPLACED });

/** הפקד שהכרטיס הפתוח מתאר. null = אין כרטיס. */
let anchor: HTMLElement | null = null;

/**
 * פקד שהמשתמש לחץ עליו והעכבר עדיין עליו.
 *
 * לחיצה סוגרת את הכרטיס — המשתמש כבר יודע מה הכפתור עושה. בלי הזיכרון הזה הוא
 * היה נפתח שוב מיד, כי העכבר לא זז והפקד עדיין תחתיו.
 */
let muted: HTMLElement | null = null;

let showTimer = 0;
let hideTimer = 0;

function clearTimers(): void {
  window.clearTimeout(showTimer);
  window.clearTimeout(hideTimer);
  showTimer = 0;
  hideTimer = 0;
}

function describe(element: HTMLElement, tip: TipContent): void {
  if (tip.description && !element.hasAttribute('aria-describedby')) {
    element.setAttribute('aria-describedby', DESCRIPTION_ID);
  }
}

function undescribe(element: HTMLElement | null): void {
  if (element?.getAttribute('aria-describedby') === DESCRIPTION_ID) {
    element.removeAttribute('aria-describedby');
  }
}

/** מודדת את הכרטיס ומצמידה אותו לפקד. נקראת אחרי שהוא כבר ב-DOM. */
function place(): void {
  const tip = tipRef.value;
  const element = anchor;
  if (!tip || !element || !element.isConnected) {
    hide();
    return;
  }

  const placement = popoverPlacement(
    element.getBoundingClientRect(),
    { width: tip.offsetWidth, height: tip.offsetHeight },
    { width: window.innerWidth, height: window.innerHeight },
    { align: 'center', gap: TIP_GAP_PX },
  );

  side.value = placement.side;
  tipStyle.value = { top: `${placement.top}px`, left: `${placement.left}px` };
}

function hide(): void {
  clearTimers();
  undescribe(anchor);
  anchor = null;
  content.value = null;
  tipStyle.value = { ...UNPLACED };
}

function show(element: HTMLElement, tip: TipContent): void {
  undescribe(anchor);

  anchor = element;
  content.value = tip;
  tipKey.value += 1;
  tipStyle.value = { ...UNPLACED };

  describe(element, tip);

  void nextTick(place);
}

/** מתזמנת פתיחה. הזמן קצר כשכרטיס אחר כבר פתוח — ראו SWITCH_DELAY_MS. */
function schedule(element: HTMLElement, tip: TipContent): void {
  clearTimers();
  const delay = content.value ? SWITCH_DELAY_MS : SHOW_DELAY_MS;
  showTimer = window.setTimeout(() => show(element, tip), delay);
}

function scheduleHide(): void {
  if (!content.value && !showTimer) return;
  clearTimers();
  hideTimer = window.setTimeout(hide, HIDE_DELAY_MS);
}

/**
 * הפקד שמתחת לנקודה, או null.
 *
 * שני מסלולים בכוונה: `event.target` הוא הזול, וכשהוא אינו מוביל לעוגן נופלים
 * ל-`elementFromPoint`. זה מה שמאתר **כפתור מנוטרל**, שאירועי עכבר אינם נשלחים
 * אליו כלל אלא להורה שלו. הסינון של אזור המסמך קודם לשניהם: הוא מה שמונע בדיקה
 * גיאומטרית בכל תנועת עכבר בזמן הקלדה או בחירה.
 */
function anchorAt(event: PointerEvent): HTMLElement | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  if (target.closest(TIP_EXCLUDED_SELECTOR)) return null;

  const direct = target.closest(TIP_ANCHOR_SELECTOR);
  if (direct instanceof HTMLElement) return direct;

  const hit = document.elementFromPoint(event.clientX, event.clientY);
  if (!hit || hit.closest(TIP_EXCLUDED_SELECTOR)) return null;
  const found = hit.closest(TIP_ANCHOR_SELECTOR);
  return found instanceof HTMLElement ? found : null;
}

function onPointerMove(event: PointerEvent): void {
  const element = anchorAt(event);

  if (element !== muted) muted = null;
  if (!element || element === muted) {
    if (anchor || showTimer) scheduleHide();
    return;
  }

  // כבר על אותו פקד: מבטלים סגירה שנקבעה בעת חלוף על הרווח בין כפתורים.
  if (element === anchor) {
    window.clearTimeout(hideTimer);
    hideTimer = 0;
    return;
  }

  const tip = readTip(element);
  if (!tip) {
    scheduleHide();
    return;
  }
  schedule(element, tip);
}

function onPointerDown(event: PointerEvent): void {
  muted = anchorAt(event);
  hide();
}

/**
 * מיקוד מקלדת פותח מיד, בלי השהיה: המשתמש הגיע לפקד במכוון, ואין תנועת עכבר
 * שההשהיה מסננת. `:focus-visible` ולא `:focus` — לחיצת עכבר גם ממקדת, ושם
 * המסלול של העכבר הוא שמטפל.
 */
function onFocusIn(event: FocusEvent): void {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.closest(TIP_EXCLUDED_SELECTOR)) return;

  let keyboard = false;
  try {
    keyboard = target.matches(':focus-visible');
  } catch {
    // jsdom אינו מכיר את הפסאודו-קלאס. שם אין מיקוד חזותי בכלל.
    keyboard = false;
  }
  if (!keyboard) return;

  const element = target.closest(TIP_ANCHOR_SELECTOR);
  if (!(element instanceof HTMLElement)) return;
  const tip = readTip(element);
  if (!tip) return;

  clearTimers();
  show(element, tip);
}

function onFocusOut(event: FocusEvent): void {
  if (event.target === anchor) hide();
}

function onKeyDown(event: KeyboardEvent): void {
  // Escape מסלק את הכרטיס בלי לסגור שום דבר אחר — ולכן אינו נעצר כאן.
  if (event.key === 'Escape') hide();
}

/**
 * גלילה או שינוי גודל מזיזים את הפקד מתחת לכרטיס. סגירה, ולא מיקום מחדש:
 * טולטיפ הוא מצב חולף, והמשתמש יקבל אותו שוב ברגע שהעכבר ינוח.
 */
function onViewportChange(): void {
  if (anchor || showTimer) hide();
}

// `capture` בשלושת הראשונים: אירוע שנעצר בדרך למעלה (הרצועה עוצרת
// `pointerdown` כדי לא לגזול את המיקוד מהעורך) לא היה מגיע לכאן אחרת.
// `scroll` אינו מבעבע כלל, ולכן גם שם — גלילת הרצועה עצמה היא המקרה.
document.addEventListener('pointermove', onPointerMove, true);
document.addEventListener('pointerdown', onPointerDown, true);
document.addEventListener('pointercancel', hide, true);
document.addEventListener('scroll', onViewportChange, true);
document.addEventListener('focusin', onFocusIn);
document.addEventListener('focusout', onFocusOut);
document.addEventListener('keydown', onKeyDown);
window.addEventListener('resize', onViewportChange);
window.addEventListener('blur', hide);

onUnmounted(() => {
  hide();
  document.removeEventListener('pointermove', onPointerMove, true);
  document.removeEventListener('pointerdown', onPointerDown, true);
  document.removeEventListener('pointercancel', hide, true);
  document.removeEventListener('scroll', onViewportChange, true);
  document.removeEventListener('focusin', onFocusIn);
  document.removeEventListener('focusout', onFocusOut);
  document.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('resize', onViewportChange);
  window.removeEventListener('blur', hide);
});
</script>

<style scoped>
/* מעל הכול: פופאוברים 1000, דיאלוגים 2000, „אודות” ו„קיצורים” 3000. טולטיפ
   מסביר גם פקד שבתוך דיאלוג, ולכן הוא הגבוה מכולם.

   `pointer-events: none` אינו קוסמטי: הכרטיס יושב 8px מהפקד ועלול לחפוף פקד
   שכן, ובלעדיו הוא היה חוסם את ה-hover ואת הלחיצה עליו. */
.word-tip {
  position: fixed;
  z-index: 4000;
  box-sizing: border-box;
  max-width: 272px;
  padding: 8px 10px 9px;
  background: var(--color-surface);
  border: 1px solid var(--color-outline-variant);
  border-radius: var(--radius-md);
  /* שתי שכבות: הרחוקה נותנת את ההרמה מעל הרצועה, והצמודה מגדירה את הקצה. צל
     אחד גדול נראה מרוח, וצל אחד קטן אינו מרים. */
  box-shadow:
    0 10px 28px -8px rgba(0, 0, 0, 0.28),
    0 2px 6px -2px rgba(0, 0, 0, 0.12);
  color: var(--color-on-surface);
  font-family: var(--font-main);
  text-align: start;
  pointer-events: none;
  animation: word-tip-in 0.12s ease-out;
}

/* הכניסה מגיעה מכיוון הפקד: כרטיס שנפתח מתחתיו עולה מלמעלה כלפי מטה. */
@keyframes word-tip-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
}

.word-tip--above {
  animation-name: word-tip-in-above;
}

@keyframes word-tip-in-above {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .word-tip {
    animation: none;
  }
}

/* `baseline` ולא `center`: הכותרת והצירוף בגדלים שונים, ויישור למרכז היה מרים
   את הצירוף מעל שורת הבסיס של הכותרת. */
.word-tip__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.word-tip__title {
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.35;
}

/* אותו שבשבת מקשים כמו בדיאלוג „קיצורי מקלדת” — `dir="ltr"` על האלמנט עצמו,
   כי „Ctrl + Shift ימני” נשבר בלעדיו (ההסבר המלא ב-ShortcutsDialog.vue). */
.word-tip__key {
  flex: none;
  padding: 1px 6px;
  background: var(--color-surface-container-high);
  border: 1px solid var(--color-outline-variant);
  border-radius: var(--radius-xs);
  color: var(--color-on-surface-variant);
  font-family: var(--font-main);
  font-size: 10.5px;
  line-height: 1.5;
  white-space: nowrap;
}

/* ההסבר נבדל מהכותרת בצבע ובמשקל, ולא בקו מפריד: קו בכרטיס בן שתי שורות הופך
   אותו לטבלה קטנה. `margin` מפורש — `<p>` מגיע עם שוליים של הדפדפן. */
.word-tip__desc {
  margin: 5px 0 0;
  color: var(--color-on-surface-variant);
  font-size: 11.5px;
  line-height: 1.5;
}
</style>
