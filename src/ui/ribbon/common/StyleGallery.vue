<template>
  <div class="style-gallery-container">
    <div
      ref="scrollContainerRef"
      class="style-cards-scroll"
      role="group"
      :aria-label="menuString('סגנונות')"
      @scroll.passive="measure"
    >
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        class="style-card"
        :class="{ active: activeId === item.id }"
        :data-tip-title="menuString(item.label)"
        :aria-pressed="activeId === item.id"
        :disabled="disabled"
        @pointerdown.prevent
        @click="$emit('select-style', item.id)"
      >
        <span
          class="style-card-preview"
          :style="item.previewStyle"
        >
          {{ item.previewText }}
        </span>
        <span class="style-card-name">{{ menuString(item.label) }}</span>
      </button>
    </div>

    <!-- הכפתורים מוצגים רק כשיש לאן לגלול, כמו ב-Word. הם אינם מושבתים עם
         הגלריה: עיון ברשימה אינו מצריך בחירה במסמך. -->
    <div
      v-if="canScrollStart || canScrollEnd"
      class="gallery-nav-btns"
    >
      <button
        v-if="canScrollStart"
        type="button"
        class="nav-btn"
        :data-tip-title="menuString('הסגנונות הקודמים')"
        :aria-label="menuString('הסגנונות הקודמים')"
        @pointerdown.prevent
        @click="scrollToward('start')"
      >
        <SvgIcon
          :name="galleryScrollIcon('start', isRtl)"
          :size="10"
        />
      </button>
      <button
        v-if="canScrollEnd"
        type="button"
        class="nav-btn"
        :data-tip-title="menuString('הסגנונות הבאים')"
        :aria-label="menuString('הסגנונות הבאים')"
        @pointerdown.prevent
        @click="scrollToward('end')"
      >
        <SvgIcon
          :name="galleryScrollIcon('end', isRtl)"
          :size="10"
        />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import SvgIcon from '../../icons/SvgIcon.vue';
import { menuString } from '../i18n';
import { STYLE_GALLERY } from '../../../composables/keys';
import {
  fallbackStyleGallery,
  galleryScrollAvailability,
  galleryScrollDelta,
  galleryScrollIcon,
  type GalleryScrollAvailability,
  type ScrollToward,
} from '../../../engine/style-gallery';

const props = withDefaults(
  defineProps<{
    /**
     * הסגנון שפקודת `linked-style` מדווחת. משמש רק כשאין גלריה מהמסמך —
     * כשיש, `activeParagraphStyleId` של המנוע מדויק ממנו (הוא יודע להבחין
     * בבחירה מעורבת).
     */
    currentStyle?: string;
    disabled?: boolean;
  }>(),
  {
    currentStyle: 'Normal',
    disabled: false,
  },
);

defineEmits<{
  (e: 'select-style', styleId: string): void;
}>();

/**
 * ברירת המחדל של ה-inject היא רשת הביטחון ולא רשימה ריקה: קומפוננטה שמורכבת
 * בלי המעטפת (בדיקה, או רצועה שעולה לפני שנפתח מסמך) צריכה גלריה עובדת.
 * הצורה עם factory (`true`) ולא ערך ישיר — כדי שהרשימה לא תיבנה בכל הרכבה
 * גם כשהמעטפת כן מספקת את המפתח.
 */
const gallery = inject(STYLE_GALLERY, () => shallowRef(fallbackStyleGallery()), true);

const items = computed(() => gallery.value.items);

/**
 * בחירה מעורבת מחזירה `null` מהמנוע, ואז אין כרטיס מסומן — Word מציג גלריה
 * בלי בחירה, ולא את הסגנון של הפסקה הראשונה כאילו הוא של כולן. לכן כשהרשימה
 * מהמסמך, התשובה של המנוע קובעת גם כשהיא `null`.
 */
const activeId = computed(() =>
  gallery.value.fromDocument ? gallery.value.activeId : props.currentStyle,
);

const scrollContainerRef = ref<HTMLElement | null>(null);

/**
 * כיווניות המכולה. ברירת המחדל `true` כי המעטפת כולה `dir="rtl"`, והמדידה
 * בהרכבה היא מה שמכסה מסמך או משטח שכיווניותם אחרת — הכיוון של הגלילה
 * ושל החצים תלוי בו.
 */
const isRtl = ref(true);

const availability = ref<GalleryScrollAvailability>({
  canScrollStart: false,
  canScrollEnd: false,
});
const canScrollStart = computed(() => availability.value.canScrollStart);
const canScrollEnd = computed(() => availability.value.canScrollEnd);

function measure(): void {
  const element = scrollContainerRef.value;
  if (!element) return;
  availability.value = galleryScrollAvailability({
    scrollLeft: element.scrollLeft,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  });
}

function scrollToward(toward: ScrollToward): void {
  const element = scrollContainerRef.value;
  if (!element) return;
  element.scrollBy({ left: galleryScrollDelta(toward, isRtl.value), behavior: 'smooth' });
}

let observer: ResizeObserver | null = null;

onMounted(() => {
  const element = scrollContainerRef.value;
  if (!element) return;

  // רק `ltr` מפורש מבטל את ברירת המחדל: ב-jsdom ובמשטחים שלא פתרו כיווניות
  // הערך יוצא ריק, ואז ההנחה הנכונה היא הכיווניות של המעטפת.
  if (globalThis.getComputedStyle?.(element).direction === 'ltr') isRtl.value = false;

  // הרוחב של הרצועה משתנה עם החלון, וגלריה שנכנסה כולה בחלון רחב אינה נכנסת
  // בצר. בלי המדידה החוזרת הכפתורים היו נקבעים פעם אחת בהרכבה.
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => measure());
    observer.observe(element);
  }

  measure();
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});

// הקטלוג נפתר אחרי פתיחת המסמך, ואז הרשימה מתחלפת ורוחבה משתנה. `nextTick`
// כדי שהמדידה תרוץ על ה-DOM שאחרי הרינדור.
watch(items, () => void nextTick(measure));
</script>

<style scoped>
.style-gallery-container {
  /* המידות של הגלריה במקום אחד, כי הן תלויות זו בזו: תקרת הרוחב של מיכל
     הגלילה מחושבת מהן, ובלי החישוב היא מספר קסם שחותך כרטיס באמצע — זה מה
     שקרה. הכרטיס ברוחב **קבוע** ולא בטווח, אחרת אין גבול כרטיס להיצמד אליו. */
  --style-card-width: 68px;
  --style-card-gap: 3px;
  --style-cards-padding: 2px;
  --style-cards-visible: 5;

  display: flex;
  align-items: center;
  gap: 2px;
  background: var(--color-surface);
  border: 1px solid var(--color-outline-variant);
  border-radius: var(--radius-sm);
  padding: 2px;
  /* בדיוק גובה התוכן של קבוצה — הגלריה יושבת לצד כפתורים גדולים, וכל מספר
     שאינו הטוקן היה משאיר אותה נמוכה או גבוהה מהם. ראו tokens.css. */
  height: var(--ribbon-content-h);
  /* מהודקת לתוכן. `width: 100%` עם `flex: 1 1 auto` שהיו כאן מתחו אותה על כל
     מה שהקבוצה נתנה, והשאירו לצד הכרטיסים שטח לבן שנראה כמו משבצת סגנון
     ריקה — זו התלונה. `0 1 auto` = אינה גדלה, ומצטמצמת כשהרצועה צרה. */
  flex: 0 1 auto;
  min-width: 0;
  max-width: 100%;
}

.style-cards-scroll {
  display: flex;
  align-items: stretch;
  gap: var(--style-card-gap);
  overflow-x: auto;
  scrollbar-width: none;
  height: 100%;
  padding-inline: var(--style-cards-padding);
  /* התקרה היא מה שמונע מגלריה של מסמך עשיר בסגנונות לדחוף את שאר הקבוצות
     מהרצועה: הקטלוג של Word מחזיר לעיתים חמישה-עשר סגנונות מהירים, ולא חמישה.

     והיא חשובה **בדיוק**: חמישה כרטיסים, ארבעה מרווחים ביניהם, ושני הריפודים
     — כלומר גבול כרטיס. תקרה עגולה (340px) הותירה את הכרטיס החמישי חצוי, וב-
     Word הגלריה מציגה כרטיסים שלמים בלבד. `box-sizing: border-box` גלובלי,
     ולכן הריפוד נכלל בתקרה. */
  max-width: calc(
    var(--style-cards-visible) * var(--style-card-width) +
      (var(--style-cards-visible) - 1) * var(--style-card-gap) +
      2 * var(--style-cards-padding)
  );
  min-width: 0;
  /* וגם אחרי גלילה: הצמדה לגבול כרטיס, כדי שגלילה בגלגלת או צעד שלא יצא עגול
     לא יעצרו באמצע כרטיס. */
  scroll-snap-type: inline mandatory;
}

.style-cards-scroll::-webkit-scrollbar {
  display: none;
}

.style-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: var(--style-card-width);
  padding: 3px 6px;
  scroll-snap-align: start;
  background: var(--color-surface);
  border: 1px solid var(--color-outline-variant);
  border-radius: var(--radius-xs);
  cursor: pointer;
  transition: all 0.08s ease;
  white-space: nowrap;
  overflow: hidden;
}

.style-card:hover:not(:disabled) {
  background: var(--word-btn-hover);
  border-color: var(--word-blue);
}

.style-card.active {
  background: var(--word-btn-active);
  border-color: var(--word-blue);
  box-shadow: 0 0 0 1px var(--word-blue);
}

/* בלי בחירה במסמך הפקודה `linked-style` נכשלת, ולכן הכרטיס נראה כמו מה שהוא. */
.style-card:disabled {
  cursor: default;
  opacity: 0.45;
}

.style-card-preview {
  display: block;
  max-width: 100%;
  font-family: var(--font-main);
  line-height: 1.2;
  margin-bottom: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.style-card-name {
  max-width: 100%;
  font-size: 9px;
  color: var(--color-on-surface-variant);
  overflow: hidden;
  text-overflow: ellipsis;
}

.gallery-nav-btns {
  display: flex;
  flex-direction: column;
  gap: 1px;
  height: 100%;
  justify-content: space-around;
  border-inline-start: 1px solid var(--color-outline-variant);
  padding-inline-start: 1px;
}

.nav-btn {
  background: none;
  border: none;
  padding: 2px;
  cursor: pointer;
  color: var(--color-on-surface-variant);
  border-radius: var(--radius-xs);
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-btn:hover {
  background: var(--word-btn-hover);
  color: var(--word-blue);
}
</style>
