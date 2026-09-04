<template>
  <div
    ref="rootRef"
    class="page-marking-layer"
    aria-hidden="true"
  >
    <span
      v-for="mark in marks"
      :key="mark.key"
      class="page-marking-layer__mark"
      :class="`page-marking-layer__mark--${mark.kind}`"
      :style="{
        left: `${mark.leftPx}px`,
        top: `${mark.topPx}px`,
        width: `${mark.widthPx}px`,
        height: `${mark.heightPx}px`,
      }"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * שכבת „סימון עמודים” של שולחן העורך — מסגרת בצבע הראשי על המילה הראשונה של
 * כל עמוד ובצבע השגיאה על האחרונה; בצבע המשני על עמוד ש„בדיקה” מצאה שהשבירה בתחילתו זזה.
 *
 * אותה תבנית בדיוק כמו SpellingOverlay.vue: קריאה בלבד מה-DOM של המנוע
 * דרך engine/page-ruler.ts (`measurePageEdgeWords`), ציור משלנו מעל, ואפס
 * נגיעה במסמך. `enabled: false` = אין מדידה בכלל. המדידה מופעלת ממעקב
 * מלבני העמודים (גלילה/זום/עימוד מחדש) ומ-`revision` אחרי עריכה, עם מדידה
 * שנייה אחרי שהעימוד התיישב. למה זו שכבה ולא צביעה בקובץ — ב-
 * engine/shulchan/page-marking.ts.
 */
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue';
import {
  measurePageEdgeWords,
  watchAllPageRects,
  type PageEdgeWords,
  type PageRectWatch,
  type ViewportSource,
} from '../../engine/page-ruler';

const SETTLE_RESCAN_MS = 300;

const props = withDefaults(
  defineProps<{
    host?: HTMLElement | null;
    viewportSource?: ViewportSource | null;
    enabled?: boolean;
    /** עמודים (אינדקס מ-0) שהבדיקה מצאה שזזו. */
    changedPages?: ReadonlySet<number>;
    revision?: number;
  }>(),
  { host: null, viewportSource: null, enabled: false, changedPages: () => new Set<number>(), revision: 0 },
);

const rootRef = shallowRef<HTMLElement | null>(null);
const edges = shallowRef<readonly PageEdgeWords[]>([]);

let watcher: PageRectWatch | null = null;
let settle: ReturnType<typeof setTimeout> | undefined;
let frame: number | null = null;
let pending = false;

function measureNow(): readonly PageEdgeWords[] {
  const next = props.enabled ? measurePageEdgeWords(props.host ?? null, rootRef.value) : [];
  edges.value = next;
  return next;
}

function scheduleRescan(): void {
  if (pending) return;
  if (typeof requestAnimationFrame !== 'function') {
    measureNow();
    return;
  }
  pending = true;
  frame = requestAnimationFrame(() => {
    pending = false;
    frame = null;
    measureNow();
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
  [() => props.host, rootRef, () => props.enabled],
  ([host, root, enabled]) => {
    stopWatching();
    edges.value = [];
    if (!host || !root || !enabled) return;
    watcher = watchAllPageRects({ host, reference: root, ui: props.viewportSource, onChange: scheduleRescan });
    scheduleRescan();
  },
  { immediate: true, flush: 'post' },
);

watch(
  () => props.revision,
  () => {
    if (!props.enabled) return;
    scheduleRescan();
    clearTimeout(settle);
    settle = setTimeout(scheduleRescan, SETTLE_RESCAN_MS);
  },
);

onBeforeUnmount(stopWatching);

interface Mark {
  key: string;
  kind: 'first' | 'last' | 'changed';
  leftPx: number;
  topPx: number;
  widthPx: number;
  heightPx: number;
}

const marks = computed<Mark[]>(() => {
  const out: Mark[] = [];
  for (const page of edges.value) {
    const changed = props.changedPages.has(page.pageIndex);
    const push = (word: PageEdgeWords['first'], kind: 'first' | 'last'): void => {
      word?.rects.forEach((rect, index) => {
        out.push({
          key: `${page.pageIndex}:${kind}:${index}`,
          kind: changed && kind === 'first' ? 'changed' : kind,
          leftPx: rect.leftPx,
          topPx: rect.topPx,
          widthPx: rect.widthPx,
          heightPx: rect.heightPx,
        });
      });
    };
    push(page.first, 'first');
    push(page.last, 'last');
  }
  return out;
});

/** מדידה סינכרונית טרייה — ל„סמן”/„בדוק” בלשונית. */
defineExpose({ measure: measureNow });
</script>

<style scoped>
.page-marking-layer {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 1;
}

.page-marking-layer__mark {
  position: absolute;
  box-sizing: border-box;
  border-radius: 2px;
  border: 2px solid transparent;
}

/* המקור צבע ירוק/אדום קשיח; כאן טוקנים של הערכה (tests/unit/css-hygiene.test.ts):
   הצבע הראשי לתחילת עמוד, צבע השגיאה לסופו, והמשני לעמוד שזז. */
.page-marking-layer__mark--first {
  border-color: var(--color-primary);
  background: var(--color-primary-subtle);
}

.page-marking-layer__mark--last {
  border-color: var(--color-error);
  background: var(--color-error-subtle);
}

.page-marking-layer__mark--changed {
  border-color: var(--color-secondary);
  background: var(--color-secondary-subtle);
}
</style>
