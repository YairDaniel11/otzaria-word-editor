<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="shuni-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      tabindex="-1"
      @keydown.esc.stop="$emit('close')"
    >
      <div class="shuni-header">
        <span class="shuni-title">{{ title }}</span>
        <button
          type="button"
          class="shuni-close-btn"
          data-tip-title="סגור"
          data-tip-shortcut="Esc"
          :aria-label="`סגור את ${title}`"
          @click="$emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="shuni-body">
        <p class="shuni-note">{{ note }}</p>
        <label
          v-for="(item, index) in items"
          :key="index"
          class="shuni-item"
        >
          <input
            v-model="selectedIndex"
            type="radio"
            name="shuni-profile"
            :value="index"
          >
          <span class="shuni-item-label">{{ item }}</span>
        </label>
      </div>

      <div class="shuni-footer">
        <button
          type="button"
          class="shuni-btn shuni-btn-primary"
          :disabled="busy || selectedIndex === null"
          @pointerdown.prevent
          @click="onSubmit"
        >
          החל על כל המקטעים
        </button>
        <button
          type="button"
          class="shuni-btn"
          @pointerdown.prevent
          @click="$emit('close')"
        >
          ביטול
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * דיאלוג בחירה גנרי לכלי האחידות: רשימת פרופילים שנמצאו במסמך, והמשתמש
 * בוחר את הנכון — הוא יוחל על כל המקטעים. משרת גם את „גודל עמוד ושוליים”
 * וגם את „רוחב טורים” (FormEditingErrors המקורי).
 */
import { ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    isOpen?: boolean;
    busy?: boolean;
    title?: string;
    note?: string;
    /** תוויות הפרופילים, בסדר שהמנוע החזיר. */
    items?: readonly string[];
  }>(),
  { isOpen: false, busy: false, title: '', note: '', items: () => [] },
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'submit', index: number): void;
}>();

const selectedIndex = ref<number | null>(null);

watch(
  () => props.isOpen,
  (open) => {
    if (open) selectedIndex.value = props.items.length === 1 ? 0 : null;
  },
);

function onSubmit(): void {
  if (props.busy || selectedIndex.value === null) return;
  emit('submit', selectedIndex.value);
}
</script>

<style scoped>
.shuni-dialog {
  position: fixed;
  top: 140px;
  inset-inline-start: 40px;
  z-index: 2000;
  background: var(--color-surface);
  border: 1px solid var(--color-outline);
  border-radius: var(--radius-sm);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
  width: 420px;
  font-family: var(--font-main);
  user-select: none;
}

.shuni-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-block-end: 1px solid var(--color-outline-variant);
  padding: 6px 8px 6px 12px;
  background: var(--color-surface-container-high);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
}

.shuni-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-on-surface);
}

.shuni-close-btn {
  background: none;
  border: none;
  font-size: 14px;
  color: var(--color-on-surface-variant);
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--radius-xs);
}

.shuni-close-btn:hover {
  background: var(--word-btn-hover);
  color: var(--color-error);
}

.shuni-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 320px;
  overflow-y: auto;
}

.shuni-note {
  margin: 0 0 4px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--color-on-surface-variant);
}

.shuni-item {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 12px;
  color: var(--color-on-surface);
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--radius-xs);
}

.shuni-item:hover {
  background: var(--word-btn-hover);
}

.shuni-item-label {
  line-height: 1.5;
}

.shuni-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  padding: 8px 12px;
  border-block-start: 1px solid var(--color-outline-variant);
  background: var(--color-surface-container-high);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
}

.shuni-btn {
  padding: 4px 10px;
  font-size: 11px;
  font-family: var(--font-main);
  border: 1px solid var(--color-outline-variant);
  border-radius: var(--radius-xs);
  background: var(--color-surface);
  color: var(--color-on-surface);
  cursor: pointer;
  transition: all 0.08s;
}

.shuni-btn:hover:not(:disabled) {
  background: var(--word-btn-hover);
  border-color: var(--word-blue);
}

.shuni-btn-primary {
  background: var(--word-blue);
  color: var(--color-on-primary);
  border-color: var(--word-blue);
}

.shuni-btn-primary:hover:not(:disabled) {
  background: var(--word-blue-dark);
}

.shuni-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
