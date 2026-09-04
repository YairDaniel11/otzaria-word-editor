<template>
  <div
    class="ribbon-select-wrapper"
    :style="{ width }"
  >
    <select
      :value="modelValue"
      class="ribbon-select"
      :disabled="disabled"
      :data-tip-title="menuString(title)"
      :aria-label="menuString(title)"
      @change="onChange"
      @keydown.escape="onEscape"
    >
      <option
        v-for="opt in options"
        :key="opt.value"
        :value="opt.value"
        :style="opt.preview ? { fontFamily: opt.preview } : undefined"
      >
        {{ menuString(opt.label) }}
      </option>
    </select>
    <SvgIcon
      name="chevronDown"
      :size="10"
      class="select-arrow"
    />
  </div>
</template>

<script setup lang="ts">
import { inject, shallowRef } from 'vue';
import type { SuperDoc } from 'superdoc';
import { ACTIVE_SUPERDOC } from '../../../engine/document-api';
import { focusDocument } from '../../../engine/focus';
import SvgIcon from '../../icons/SvgIcon.vue';
import { menuString } from '../i18n';

export interface SelectOption {
  value: string;
  label: string;
  /**
   * מה שהאפשרות תוצג בו — `font-family` של CSS. כך בורר הגופן מציג כל שם
   * בגופן עצמו, כמו ב-Word, וגם עונה על השאלה „האם הגופן הזה בכלל קיים כאן”
   * לפני שהמשתמש בוחר בו.
   */
  preview?: string;
}

withDefaults(
  defineProps<{
    modelValue?: string;
    /** `readonly` — האפשרויות מגיעות מהמנוע, ואין לפקד רשות לשנות אותן. */
    options: readonly SelectOption[];
    width?: string;
    disabled?: boolean;
    title?: string;
  }>(),
  {
    modelValue: '',
    width: 'auto',
    disabled: false,
    title: '',
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', val: string): void;
}>();

const superdoc = inject(ACTIVE_SUPERDOC, shallowRef<SuperDoc | null>(null));

/**
 * אחרי בחירה המיקוד חוזר למסמך — בכל פקד `<select>` ברצועה, גם כשהערך הוא
 * אפשרות של כלי (סוג הסוגריים בלשונית „שולחן העורך") ולא עיצוב: כך נוהגת
 * הרצועה של Word, ובלי זה ההקלדה הבאה נבלעת בפקד (issue #14 א׳).
 */
function onChange(event: Event): void {
  const target = event.target as HTMLSelectElement;
  emit('update:modelValue', target.value);
  target.blur();
  focusDocument(superdoc.value);
}

function onEscape(event: KeyboardEvent): void {
  // כמו ב-RibbonCombo: המקש נבלע כאן ואינו מגיע למאזין הקיצורים הגלובלי.
  event.stopPropagation();
  const target = event.target as HTMLSelectElement;
  target.blur();
  focusDocument(superdoc.value);
}
</script>

<style scoped>
.ribbon-select-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}

.ribbon-select {
  appearance: none;
  -webkit-appearance: none;
  background: var(--color-surface);
  border: 1px solid var(--color-outline-variant);
  border-radius: var(--radius-xs);
  color: var(--color-on-surface);
  font-family: var(--font-main);
  font-size: 11px;
  height: var(--ribbon-row-h);
  padding-inline-start: 6px;
  padding-inline-end: 18px;
  width: 100%;
  cursor: pointer;
  outline: none;
  transition: border-color 0.1s;
}

.ribbon-select:hover:not(:disabled) {
  border-color: var(--word-blue);
}

.ribbon-select:focus {
  border-color: var(--word-blue);
  box-shadow: 0 0 0 1px var(--word-blue);
}

.ribbon-select:disabled {
  opacity: 0.4;
  cursor: default;
}

.select-arrow {
  position: absolute;
  inset-inline-end: 4px;
  pointer-events: none;
  color: var(--color-on-surface-variant);
}
</style>
