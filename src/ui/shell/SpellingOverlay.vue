<template>
  <div
    ref="rootRef"
    class="spelling-layer"
    aria-hidden="true"
  >
    <span
      v-for="mark in marks"
      :key="mark.key"
      class="spelling-layer__mark"
      :style="{
        left: `${mark.leftPx}px`,
        top: `${mark.topPx}px`,
        width: `${mark.widthPx}px`,
      }"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * שכבת „בדיקת איות תורנית" — קו גלי מתחת לכל מילה שאינה במילון.
 *
 * ## למה שכבה, ולא סימון בתוך המסמך
 *
 * המימוש שממנו נלקח המנגנון (issue #25) עטף מילים ב-`<mark>` דרך
 * `createTreeWalker`, וזה בדיוק מה שאסור כאן: ProseMirror מנהל את אותם
 * צמתים, והחלפה תחתיו נלחמת בו ומזיזה את הסמן תוך כדי הקלדה. גם אין למנוע
 * API של decorations שמותר לנו לקרוא לו (‏superdoc/ui אינו חושף אחד).
 *
 * לכן זו שכבה מעל המסמך, בדיוק כמו „גבולות עמוד", „מספרי שורות" ו„סימני
 * עיצוב": קריאה בלבד מה-DOM של המנוע, ציור משלנו, ואפס נגיעה במסמך.
 *
 * ## שני מקורות, ומה מפעיל מדידה מחדש
 *
 *   1. **מה לסמן** — `dictionary` (engine/spellcheck.ts). `null` = הבדיקה
 *      כבויה או שהמילון לא נטען, ואז אין מדידה בכלל: `measureAllPageTextSegments`
 *      הוא הדבר היקר כאן, ואין טעם למדוד מה שאיש לא רואה. אותה הכרעה בדיוק
 *      כמו `visible:false` ב-PilcrowOverlay.
 *   2. **איפה** — `measureAllPageTextSegments` (engine/page-ruler.ts), על
 *      העמודים הגלויים בלבד.
 *
 * המדידה מופעלת משני ערוצים, ושניהם נדרשים:
 *   - `watchAllPageRects` — גלילה, שינוי גודל, `viewport.observe`, ומדידות
 *     ההתיישבות. **מלבני העמודים הם רק ההדק**: הם נמדדים ביחס לשכבה הזאת,
 *     שאינה נגללת, ולכן כל גלילה מזיזה אותם — וזה בדיוק האות שהגיאומטריה
 *     שמתחת השתנתה. השכבה עצמה אינה מציירת אותם.
 *   - `revision` — מונה שעולה (בהשקטה) אחרי עריכה במסמך. עריכה בתוך פסקה
 *     אינה מזיזה שום מלבן עמוד, ולכן הערוץ הראשון אינו יורה עליה כלל.
 *
 * `SETTLE_RESCAN_MS` הוא מדידה שנייה אחרי העריכה: המנוע מעמד מחדש
 * א-סינכרונית, והמדידה שרצה באותו tick עדיין רואה את הפריסה הקודמת.
 */
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue';
import {
  measureAllPageTextSegments,
  sameTextSegments,
  watchAllPageRects,
  type MeasuredSegment,
  type PageRectWatch,
  type ViewportSource,
} from '../../engine/page-ruler';
import { findMisspellings, type Dictionary } from '../../engine/spellcheck';
import { buildSpellingMarks, wordAtPoint } from '../../engine/spelling-layer';

/** מדידה שנייה אחרי עריכה, כשהעימוד כבר התיישב. */
const SETTLE_RESCAN_MS = 300;

const props = withDefaults(
  defineProps<{
    /** ה-host המצויר של המסמך הפתוח, מ-`paintedHost(ui)`. */
    host?: HTMLElement | null;
    /** ה-controller, בשביל `viewport.observe` — אותו prop כמו שאר השכבות. */
    viewportSource?: ViewportSource | null;
    /** המילון הטעון, או `null` כשהבדיקה כבויה. `null` עוצר גם את המדידה. */
    dictionary?: Dictionary | null;
    /** מונה שעולה אחרי עריכה במסמך. */
    revision?: number;
  }>(),
  {
    host: null,
    viewportSource: null,
    dictionary: null,
    revision: 0,
  },
);

const rootRef = shallowRef<HTMLElement | null>(null);
const segments = shallowRef<readonly MeasuredSegment[]>([]);

let watcher: PageRectWatch | null = null;
let settle: ReturnType<typeof setTimeout> | undefined;
let frame: number | null = null;
/**
 * דגל נפרד מ-`frame`, בדיוק כמו ב-watchers של page-ruler.ts. `frame` מחזיק
 * את המזהה לביטול בלבד: `frame = requestAnimationFrame(cb)` שבו `cb` רץ
 * סינכרונית (‏polyfill, וגם ה-stub שהבדיקות כאן משתמשות בו) מאפס את `frame`
 * מבפנים ואז ההשמה דורסת אותו בחזרה — כלומר גרסה ששוערת על `frame` הייתה
 * מפסיקה למדוד אחרי הפריים הראשון.
 */
let pending = false;

function rescanNow(): void {
  const host = props.host;
  const root = rootRef.value;
  const dictionary = props.dictionary;
  if (!host || !root || !dictionary) {
    segments.value = [];
    return;
  }
  const next = measureAllPageTextSegments(host, root, (text) => findMisspellings(text, dictionary));
  if (sameTextSegments(next, segments.value)) return;
  segments.value = next;
}

/** מדידה אחת לכל פריים ציור, בדיוק כמו ה-watchers ב-page-ruler.ts. */
function scheduleRescan(): void {
  if (pending) return;
  if (typeof requestAnimationFrame !== 'function') {
    rescanNow();
    return;
  }
  pending = true;
  frame = requestAnimationFrame(() => {
    pending = false;
    frame = null;
    rescanNow();
  });
}

function stopWatching(): void {
  watcher?.dispose();
  watcher = null;
  clearTimeout(settle);
  if (frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
  frame = null;
  pending = false;
}

watch(
  [() => props.host, rootRef, () => props.dictionary],
  ([host, root, dictionary]) => {
    stopWatching();
    segments.value = [];
    if (!host || !root || !dictionary) return;
    watcher = watchAllPageRects({
      host,
      reference: root,
      ui: props.viewportSource,
      // המלבנים עצמם אינם נצרכים — ראו הערת הראש, „מה מפעיל מדידה מחדש".
      onChange: scheduleRescan,
    });
    scheduleRescan();
  },
  { immediate: true, flush: 'post' },
);

watch(
  () => props.revision,
  () => {
    if (!props.dictionary) return;
    scheduleRescan();
    clearTimeout(settle);
    settle = setTimeout(scheduleRescan, SETTLE_RESCAN_MS);
  },
);

onBeforeUnmount(stopWatching);

const marks = computed(() => buildSpellingMarks(segments.value));

/**
 * המילה שמתחת לנקודה (בקואורדינטות `MouseEvent`), או `null`. זה מה שמאפשר
 * ל„הוסף למילון" בתפריט ההקשר לדעת על מה הוא מדבר — בלי hit-test על ה-DOM
 * של המנוע, שממילא אסור (tests/unit/engine-boundaries.test.ts). ההמרה
 * לקואורדינטות השכבה כאן, וההכרעה עצמה ב-engine/spelling-layer.ts.
 */
function wordAt(clientX: number, clientY: number): string | null {
  const root = rootRef.value;
  if (!root) return null;
  const box = root.getBoundingClientRect();
  return wordAtPoint(segments.value, clientX - box.left, clientY - box.top);
}

defineExpose({ wordAt });
</script>

<style scoped>
.spelling-layer {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  /* מעל תוכן המסמך שהמנוע מצייר, מתחת לכל דיאלוג/תפריט — אותו z-index כמו
     שאר השכבות. */
  z-index: 1;
}

/*
  הקו הגלי מצויר כמסכה על צבע, ולא כ-SVG צבוע: הצבע חייב להגיע מ---color-error
  שאוצריא כותבת לפי הנושא (host/theme.ts), ו-data URI אינו יכול לקרוא טוקן.
  דפדפן בלי `mask-image` מקבל פס אחיד באותו צבע — פחות יפה, ועדיין קריא.

  ה-`stroke` במסכה אינו צבע אלא צורה: מסכת `mask-image` נקראת מערוץ האלפא,
  וכל צבע אטום נותן אותה מסכה בדיוק. `currentColor` אומר את זה במפורש, ולא
  מתחזה להחלטת צבע שהייתה צריכה לבוא מטוקן.
*/
.spelling-layer__mark {
  position: absolute;
  height: 3px;
  background-color: var(--color-error);
  -webkit-mask-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='6' height='3'><path d='M0 2.2 Q1.5 0.2 3 2.2 T6 2.2' fill='none' stroke='currentColor' stroke-width='1.1'/></svg>");
  mask-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='6' height='3'><path d='M0 2.2 Q1.5 0.2 3 2.2 T6 2.2' fill='none' stroke='currentColor' stroke-width='1.1'/></svg>");
  -webkit-mask-repeat: repeat-x;
  mask-repeat: repeat-x;
  -webkit-mask-size: 6px 3px;
  mask-size: 6px 3px;
}
</style>
