<template>
  <!-- רצועת טאבים אופקית מתחת לפס הכותרת — אחד לכל מסמך פתוח. -->
  <div class="word-doctabs-bar">
    <div
      class="word-doctabs-strip"
      role="tablist"
      aria-orientation="horizontal"
      aria-label="מסמכים פתוחים"
      @keydown="onTabKeydown"
    >
      <button
        v-for="(tab, index) in tabs"
        :id="docTabId(tab.id)"
        :key="tab.id"
        :ref="(el) => registerTabRef(el, index)"
        type="button"
        role="tab"
        class="word-doctab"
        :class="{ active: tab.id === activeId }"
        :aria-selected="tab.id === activeId ? 'true' : 'false'"
        :tabindex="tab.id === activeId ? 0 : -1"
        @click="$emit('select-tab', tab.id)"
      >
        <span
          v-if="tab.isDirty"
          class="word-doctab-dirty"
          aria-hidden="true"
        >•</span>
        <span class="word-doctab-title">{{ tab.title || 'מסמך ללא שם' }}</span>
        <span
          class="word-doctab-close"
          role="button"
          :aria-label="`סגור את ${tab.title || 'מסמך ללא שם'}`"
          @click.stop="$emit('close-tab', tab.id)"
        >×</span>
      </button>
    </div>

    <button
      type="button"
      class="word-doctabs-new"
      aria-label="פתח מסמך נוסף"
      data-tip-title="פתח מסמך נוסף"
      @click="$emit('new-tab')"
    >
      +
    </button>
  </div>
</template>

<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue';
import { nextTabIndex } from '../ribbon/aria';

export interface DocumentTabItem {
  id: string;
  title: string;
  isDirty: boolean;
}

const props = withDefaults(
  defineProps<{
    tabs?: DocumentTabItem[];
    activeId?: string | null;
  }>(),
  { tabs: () => [], activeId: null },
);

const emit = defineEmits<{
  (e: 'select-tab', id: string): void;
  (e: 'close-tab', id: string): void;
  (e: 'new-tab'): void;
}>();

function docTabId(id: string): string {
  return `word-doctab-${id}`;
}

/** רק הטאב הפעיל נמצא ב-tab order, ולכן החצים צריכים להזיז מיקוד בעצמם. */
const tabButtons: Array<HTMLButtonElement | null> = [];

function registerTabRef(el: Element | ComponentPublicInstance | null, index: number): void {
  tabButtons[index] = el instanceof HTMLButtonElement ? el : null;
}

/** אותה לוגיקת ניווט כמו לשוניות הרצועה — ראו ui/ribbon/aria.ts. */
function onTabKeydown(event: KeyboardEvent): void {
  const current = props.tabs.findIndex((tab) => tab.id === props.activeId);
  const next = nextTabIndex(event.key, current, props.tabs.length, 'rtl');
  if (next === null) return;

  event.preventDefault();
  const target = props.tabs[next];
  if (!target) return;
  emit('select-tab', target.id);
  tabButtons[next]?.focus();
}
</script>

<style scoped>
.word-doctabs-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  height: var(--tabbar-height);
  padding-inline: 8px;
  background: var(--color-surface-container-high);
  border-block-end: 1px solid var(--color-outline-variant);
  user-select: none;
}

.word-doctabs-strip {
  display: flex;
  align-items: stretch;
  gap: 2px;
  min-width: 0;
  height: 100%;
  overflow-x: auto;
  scrollbar-width: none;
}

.word-doctabs-strip::-webkit-scrollbar {
  display: none;
}

.word-doctab {
  display: flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--color-on-surface);
  font-family: var(--font-main);
  font-size: var(--font-size-tab);
  padding: 2px 8px;
  cursor: pointer;
  white-space: nowrap;
  max-width: 220px;
}

.word-doctab:hover:not(.active) {
  background: var(--word-btn-hover);
}

.word-doctab.active {
  background: var(--color-surface);
  border-color: var(--color-outline-variant);
  color: var(--color-primary);
}

.word-doctab-title {
  overflow: hidden;
  text-overflow: ellipsis;
}

.word-doctab-dirty {
  color: var(--color-secondary);
  line-height: 1;
  flex-shrink: 0;
}

.word-doctab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: var(--radius-sm);
  color: var(--color-on-surface-variant);
  flex-shrink: 0;
  line-height: 1;
}

.word-doctab-close:hover {
  background: var(--word-btn-active);
  color: var(--color-on-surface);
}

.word-doctabs-new {
  flex-shrink: 0;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--color-on-surface-variant);
  font-family: var(--font-main);
  font-size: var(--font-size-tab);
  line-height: 1;
  width: 20px;
  height: 20px;
  padding: 0;
  cursor: pointer;
}

.word-doctabs-new:hover {
  background: var(--word-btn-hover);
  color: var(--color-on-surface);
}
</style>
