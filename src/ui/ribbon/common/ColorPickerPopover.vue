<template>
  <div
    ref="containerRef"
    class="color-picker-container"
  >
    <div
      class="color-btn-wrapper"
      :class="{ active: isOpen }"
    >
      <button
        type="button"
        class="color-main-btn"
        :data-tip-title="menuString(title)"
        :aria-label="menuString(title)"
        :disabled="disabled"
        @pointerdown.prevent
        @click="applyCurrentColor"
      >
        <SvgIcon
          :name="icon"
          :size="18"
        />
        <div
          class="color-indicator-bar"
          :style="{ backgroundColor: modelValue || defaultColor }"
        />
      </button>
      <button
        type="button"
        class="color-arrow-btn"
        :disabled="disabled"
        :data-tip-title="menuString('בחירת צבע')"
        :aria-label="menuString('בחירת צבע')"
        @pointerdown.prevent
        @click="toggleDropdown"
      >
        <SvgIcon
          name="chevronDown"
          :size="8"
        />
      </button>
    </div>

    <!--
      פופאובר פלטת הצבעים של Office. `:style` ולא מיקום ב-CSS: `.word-ribbon-body`
      חותך אנכית, ולכן הפופאובר `position: fixed` בקואורדינטות שנמדדות —
      composables/popover-position.ts.
    -->
    <div
      v-if="isOpen"
      ref="popoverRef"
      class="color-palette-popover"
      :style="popoverStyle"
      @pointerdown.prevent.stop
    >
      <!--
        `.prevent` על המעטפת ולא רק על הדוגמיות: לחיצה על כותרת פלטה או
        ברווח שביניהן גזלה את הפוקוס מהמסמך. שדה הצבע המותאם נפתח ב-`click()`
        תכנותי, שביטול `pointerdown` אינו נוגע בו.
      -->
      <div
        v-if="allowClear"
        class="palette-section"
      >
        <button
          type="button"
          class="palette-clear-btn"
          @pointerdown.prevent
          @click="selectColor(null)"
        >
          <span class="clear-icon" />
          {{ menuString('ללא צבע') }}
        </button>
      </div>

      <!-- צבעי ערכת נושא (Theme Colors) -->
      <div class="palette-section">
        <div class="palette-title">
          {{ menuString('צבעי ערכת נושא') }}
        </div>
        <div class="theme-colors-grid">
          <div
            v-for="(col, colIndex) in THEME_COLUMNS"
            :key="colIndex"
            class="theme-column"
          >
            <button
              v-for="(hex, rowIndex) in col.shades"
              :key="rowIndex"
              type="button"
              class="color-swatch"
              :class="{ selected: modelValue?.toLowerCase() === hex.toLowerCase() }"
              :style="{ backgroundColor: hex }"
              :data-tip-title="shadeName(col.family, rowIndex)"
              :data-tip-desc="hex"
              :aria-label="shadeName(col.family, rowIndex)"
              @pointerdown.prevent
              @click="selectColor(hex)"
            />
          </div>
        </div>
      </div>

      <!-- צבעים סטנדרטיים (Standard Colors) -->
      <div class="palette-section">
        <div class="palette-title">
          {{ menuString('צבעים רגילים') }}
        </div>
        <div class="standard-colors-row">
          <button
            v-for="color in STANDARD_COLORS"
            :key="color.hex"
            type="button"
            class="color-swatch"
            :class="{ selected: modelValue?.toLowerCase() === color.hex.toLowerCase() }"
            :style="{ backgroundColor: color.hex }"
            :data-tip-title="menuString(color.name)"
            :data-tip-desc="color.hex"
            :aria-label="menuString(color.name)"
            @pointerdown.prevent
            @click="selectColor(color.hex)"
          />
        </div>
      </div>

      <!-- צבע מותאם אישית -->
      <div class="palette-section custom-color-section">
        <label
          class="custom-color-label"
          @pointerdown.prevent="openCustomColorPicker"
        >
          <span>{{ menuString('צבעים נוספים...') }}</span>
          <input
            ref="customColorRef"
            type="color"
            :value="modelValue || defaultColor"
            class="custom-color-input"
            @change="selectColor(($event.target as HTMLInputElement).value)"
          >
        </label>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject, ref, shallowRef, onMounted, onUnmounted } from 'vue';
import type { SuperDoc } from 'superdoc';
import { ACTIVE_SUPERDOC } from '../../../engine/document-api';
import { focusDocument } from '../../../engine/focus';
import SvgIcon from '../../icons/SvgIcon.vue';
import { menuString } from '../i18n';
import { usePopoverPosition } from '../../../composables/popover-position';

/**
 * שם הצבע, ולא רק הקוד שלו.
 *
 * `#1f497d` הוא מה שקורא מסך היה מכריז עד עכשיו — כלומר שמונה תווים באיות.
 * שם המשפחה כבר היה כאן כהערה, ומכאן הוא נתון: הוא נכנס לכותרת הטולטיפ
 * ולשם הנגיש, והקוד יורד לשורת ההסבר (הוא עדיין המידע שמעצב מחפש).
 *
 * „גוון 3” ולא „בהיר יותר 60%”: הסדר בעמודה אכן קבוע, אבל האחוזים הם מה
 * ש-Word מחשב מהערכה, ואין כאן חישוב כזה — מספר שאינו נמדד היה דיוק מדומה.
 */
const THEME_COLUMNS = [
  { family: 'לבן ואפור בהיר', shades: ['#ffffff', '#f2f2f2', '#d9d9d9', '#bfbfbf', '#a6a6a6', '#7f7f7f'] },
  { family: 'שחור ואפור כהה', shades: ['#000000', '#7f7f7f', '#595959', '#3f3f3f', '#262626', '#0c0c0c'] },
  { family: 'חום בהיר', shades: ['#eeece1', '#ddd9c3', '#c4bd97', '#948a54', '#494429', '#1d1b10'] },
  { family: 'כחול כהה', shades: ['#1f497d', '#c6d9f1', '#8db3e2', '#548dd4', '#366092', '#17365d'] },
  { family: 'כחול', shades: ['#4f81bd', '#dce6f1', '#b8cce4', '#95b3d7', '#376092', '#254061'] },
  { family: 'אדום', shades: ['#c0504d', '#f2dcdb', '#e6b8b7', '#da9694', '#963634', '#632423'] },
  { family: 'ירוק זית', shades: ['#9bbb59', '#ebf1dd', '#d7e3bc', '#c3d69b', '#76933c', '#4f6228'] },
  { family: 'סגול', shades: ['#8064a2', '#e5e0ec', '#ccc1da', '#b2a2c7', '#604a7b', '#403151'] },
  { family: 'טורקיז', shades: ['#4bacc6', '#dbeef3', '#b7dde8', '#92cddc', '#31859b', '#215967'] },
  { family: 'כתום', shades: ['#f79646', '#fdeada', '#fbd5b5', '#fac08f', '#e36c09', '#974806'] },
];

/** שמות הצבעים הסטנדרטיים, בסדר שבו הם מוצגים — כמו ב-Word. */
const STANDARD_COLORS = [
  { hex: '#c00000', name: 'אדום כהה' },
  { hex: '#ff0000', name: 'אדום' },
  { hex: '#ffc000', name: 'כתום' },
  { hex: '#ffff00', name: 'צהוב' },
  { hex: '#92d050', name: 'ירוק בהיר' },
  { hex: '#00b050', name: 'ירוק' },
  { hex: '#00b0f0', name: 'תכלת' },
  { hex: '#0070c0', name: 'כחול' },
  { hex: '#002060', name: 'כחול כהה' },
  { hex: '#7030a0', name: 'סגול' },
];

/**
 * „כחול, גוון 3”. הבסיס הוא הראשון בעמודה, ולכן הוא בשם המשפחה בלבד.
 *
 * התרגום כאן ולא בקורא: השם מורכב משם המשפחה ומהמילה „גוון”, ומחרוזת מורכבת
 * לא הייתה מתאימה לשום מפתח במילון. `menuString` נקראת מתוך ה-render של
 * התבנית, ולכן הקריאה כאן עדיין מגיבה לשינוי שפה.
 */
function shadeName(family: string, index: number): string {
  const name = menuString(family);
  return index === 0 ? name : `${name}, ${menuString('גוון')} ${index + 1}`;
}

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    icon: string;
    title: string;
    defaultColor?: string;
    allowClear?: boolean;
    disabled?: boolean;
  }>(),
  {
    modelValue: '',
    defaultColor: '#000000',
    allowClear: true,
    disabled: false,
  }
);

/**
 * `null` = „ללא צבע”, ולא מחרוזת ריקה. זה החוזה של המנוע: `format.color` /
 * `format.highlight` מתעדים `if (value === null) return { target, value: null }`
 * כמסלול הניקוי, ומחרוזת ריקה נדחית שם במפורש (`value.trim() === ''` → `null`
 * → הפקודה נכשלת סגור). ראו engine/payloads.ts.
 */
const emit = defineEmits<{
  (e: 'update:modelValue', color: string): void;
  (e: 'change', color: string | null): void;
}>();

const containerRef = ref<HTMLElement | null>(null);
const popoverRef = ref<HTMLElement | null>(null);
const customColorRef = ref<HTMLInputElement | null>(null);
const isOpen = ref(false);
const superdoc = inject(ACTIVE_SUPERDOC, shallowRef<SuperDoc | null>(null));

const { popoverStyle } = usePopoverPosition(containerRef, popoverRef, isOpen);

function toggleDropdown(): void {
  if (props.disabled) return;
  isOpen.value = !isOpen.value;
}

/**
 * גם הבחירה מהדו-שיח המקורי מגיעה לכאן, אבל ב-`change` ולא ב-`input`:
 * `input` יורה על כל תזוזה בתוך הדו-שיח, וכל ירייה סגרה את הפופאובר, שלחה
 * פקודת צבע למנוע והחזירה מיקוד למסמך — עוד לפני שהמשתמש סיים לבחור.
 */
function selectColor(hex: string | null): void {
  // `modelValue` נשאר מחרוזת — הוא מזין את פס הצבע שעל הכפתור, ו-CSS צריך שם
  // ערך ולא null. רק ה-`change`, כלומר מה שהופך ל-payload, נושא את ההבחנה.
  emit('update:modelValue', hex ?? '');
  emit('change', hex);
  isOpen.value = false;
  focusDocument(superdoc.value);
}

/**
 * `@pointerdown.prevent` על התווית מונע מהלחיצה לגזול את המיקוד מהעורך — בלעדיו
 * הבחירה במסמך אובדת והצבע לא מוחל על שום דבר. אבל הוא גם מבטל את ההתנהגות
 * המובנית של `label`, שפותחת את ה-`input[type=color]`, ולכן הפתיחה נעשית כאן.
 */
function openCustomColorPicker(): void {
  customColorRef.value?.click();
}

function applyCurrentColor(): void {
  if (props.disabled) return;
  const color = props.modelValue || props.defaultColor;
  emit('change', color);
}

function handleClickOutside(event: MouseEvent): void {
  if (containerRef.value && !containerRef.value.contains(event.target as Node)) {
    isOpen.value = false;
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('pointerdown', handleClickOutside);
});
</script>

<style scoped>
.color-picker-container {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
}

.color-btn-wrapper {
  display: inline-flex;
  align-items: stretch;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  transition: background 0.08s, border-color 0.08s;
  /* אותה שורה כמו `.btn-icon-only` ו-`RibbonSelect`: הפקד הזה יושב איתם
     באותה `.word-group-row` ב„גופן”, ו-24px קשיח היה משאיר אותו גבוה מהם
     בשתי נקודות. ראו tokens.css. */
  height: var(--ribbon-row-h);
}

.color-btn-wrapper:hover {
  background: var(--word-btn-hover);
  border-color: var(--color-outline-variant);
}

.color-btn-wrapper.active {
  background: var(--word-btn-active);
  border-color: var(--word-btn-active-border);
}

.color-main-btn {
  background: none;
  border: none;
  padding: 1px 4px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--color-on-surface);
  border-radius: var(--radius-sm) 0 0 var(--radius-sm);
}

.color-indicator-bar {
  width: 16px;
  height: 3px;
  border-radius: 1px;
  margin-top: 1px;
  box-shadow: 0 0 1px rgba(0, 0, 0, 0.4);
}

.color-arrow-btn {
  background: none;
  border: none;
  padding: 0 2px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-on-surface-variant);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}

/* פופאובר פלטת הצבעים. `top` / `left` / `max-height` מגיעים מ-`:style` — ראו
   popover-position.ts. `overflow-y: auto` הוא הצד השני של אותה החלטה: כשאין
   מקום לגובה המלא הפופאובר נגלל בתוך עצמו, ולא נחתך. */
.color-palette-popover {
  position: fixed;
  z-index: 1000;
  background: var(--color-surface);
  border: 1px solid var(--color-outline);
  border-radius: var(--radius-sm);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.16);
  padding: 8px;
  min-width: 176px;
  overflow-y: auto;
}

.palette-section {
  margin-bottom: 8px;
}

.palette-section:last-child {
  margin-bottom: 0;
}

.palette-title {
  font-size: 10px;
  font-weight: 600;
  color: var(--color-on-surface-variant);
  margin-bottom: 4px;
}

.palette-clear-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  background: none;
  border: 1px solid transparent;
  border-radius: var(--radius-xs);
  padding: 3px 6px;
  font-size: 11px;
  color: var(--color-on-surface);
  cursor: pointer;
  text-align: start;
}

.palette-clear-btn:hover {
  background: var(--word-btn-hover);
  border-color: var(--color-outline-variant);
}

.clear-icon {
  width: 12px;
  height: 12px;
  border: 1px dashed var(--color-outline);
  border-radius: 2px;
}

.theme-colors-grid {
  display: flex;
  gap: 2px;
}

.theme-column {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.standard-colors-row {
  display: flex;
  gap: 2px;
}

/* המסגרת של המשבצת ב-`--color-outline` ולא בשחור שקוף: משבצת כהה מהפלטה
   (`#000000`, `#1d1b10`) בלעה מסגרת של שחור-12% ונראתה בלי גבול בכלל, ובמצב
   כהה גם המשבצות הבהירות איבדו אותה מול הרקע. הצבעים של המשבצות עצמן הם
   פלטת Office והם **נתון ולא עיצוב** — ראו THEME_COLUMNS/STANDARD_COLORS. */
.color-swatch {
  width: 14px;
  height: 14px;
  border: 1px solid var(--color-outline);
  border-radius: 1px;
  cursor: pointer;
  padding: 0;
  transition: transform 0.08s;
}

.color-swatch:hover {
  transform: scale(1.2);
  z-index: 2;
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.3);
}

.color-swatch.selected {
  outline: 2px solid var(--word-blue);
  outline-offset: 1px;
}

.custom-color-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--color-on-surface);
  cursor: pointer;
  padding: 2px 4px;
  border-radius: var(--radius-xs);
}

.custom-color-label:hover {
  background: var(--word-btn-hover);
}

.custom-color-input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}
</style>
