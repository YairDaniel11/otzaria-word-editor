<template>
  <div class="ribbon-tab-pane view-tab">
    <!-- תצוגות -->
    <RibbonGroup title="תצוגות">
      <RibbonButton
        icon="focusMode"
        label="מצב מיקוד"
        shortcut-id="focus-mode"
        variant="large"
        tooltip="מצב קריאה ומיקוד ללא הסחות דעת"
        @click="$emit('toggle-focus-mode')"
      />
    </RibbonGroup>

    <!-- הצג -->
    <RibbonGroup title="הצג">
      <RibbonStack>
        <RibbonButton
          icon="ruler"
          label="סרגל"
          variant="small"
          tooltip="הצג או הסתר את סרגל המידות"
          :active="rulerCmd.active.value"
          :disabled="!rulerCmd.enabled.value"
          @click="rulerCmd.run()"
        />
        <RibbonButton
          icon="pilcrow"
          label="סימני עיצוב"
          shortcut-id="formatting-marks"
          variant="small"
          tooltip="הצג סימני פסקאות ותווים נסתרים"
          :active="marksCmd.active.value"
          :disabled="!marksCmd.enabled.value"
          @click="marksCmd.run()"
        />
      </RibbonStack>
    </RibbonGroup>

    <!-- זום -->
    <RibbonGroup title="שינוי גודל תצוגה">
      <!--
        שני פקדים עם שני תפקידים נבדלים, שניהם דרך פקודת `zoom`:
        • „גודל אמיתי” — `setZoom(100)`: אחוז קבוע, פיקסל מול פיקסל (96dpi),
          בדיוק ה-„100%” של Word. לא תלוי בחלון.
        • „רוחב עמוד” — אחוז **מחושב** מרוחב החלון מול מידות הדף
          (engine/fit-width.ts): 740px מול A4 → 95%; חלון רחב → יותר.
        הם נראים זהים כשהחלון בעל רוחב A4 בערך — ואז זו גם המשמעות.
        `zoomPayload(100)` ולא `{ zoom: 1 }`: הזום הוא **אחוזים**, ואובייקט
        נדחה עוד לפני `SuperDoc.setZoom`. ראו engine/payloads.ts.
      -->
      <RibbonButton
        icon="zoom"
        label="גודל אמיתי"
        variant="large"
        tooltip="הצג את המסמך בגודלו האמיתי (100%)"
        :disabled="!zoomCmd.enabled.value"
        @click="zoomCmd.run(zoomPayload(100))"
      />
      <RibbonButton
        icon="fitWidth"
        label="רוחב עמוד"
        variant="large"
        tooltip="התאם את תצוגת העמוד לרוחב החלון"
        :disabled="!zoomCmd.enabled.value"
        @click="runFitPageWidth()"
      />
    </RibbonGroup>
  </div>
</template>

<script setup lang="ts">
import { inject, shallowRef } from 'vue';
import type { SuperDoc } from 'superdoc';
import RibbonGroup from '../common/RibbonGroup.vue';
import RibbonStack from '../common/RibbonStack.vue';
import RibbonButton from '../common/RibbonButton.vue';
import { useCommand } from '../../../composables/useCommand';
import { COMMAND_REPORTER, type CommandReporter } from '../../../composables/keys';
import { ACTIVE_SUPERDOC } from '../../../engine/document-api';
import { editorStackWidth, fitWidthPercent } from '../../../engine/fit-width';
import { zoomBounds } from '../../../engine/zoom';
import { zoomPayload } from '../../../engine/payloads';

defineEmits<{
  (e: 'toggle-focus-mode'): void;
}>();

/** ברירת המחדל כשאין מדווח — הרכבה חלקית בבדיקות. זהה להתנהגות של `useCommand`. */
const fallbackReporter: CommandReporter = (outcome, id) => {
  if (!outcome.ok) console.warn(`[otzaria-word] ${id}: ${outcome.message}`);
};

const zoomCmd = useCommand('zoom');
const rulerCmd = useCommand('ruler');
const marksCmd = useCommand('formatting-marks');
const activeSuperdoc = inject(ACTIVE_SUPERDOC, shallowRef<SuperDoc | null>(null));
const report = inject(COMMAND_REPORTER, fallbackReporter);

/**
 * „רוחב עמוד”.
 *
 * מזהה ה-`zoom-fit-width` של המנוע אינו בשימוש בכוונה — ההתאמה הפנימית שלו
 * נמדדה בלולאת משוב שמתכווצת לרצפה; החישוב והנימוק המלאים ב-engine/fit-width.ts.
 * הפעולה עצמה נשארת במסלול היחיד של כתיבה: פקודת `zoom` דרך האדפטר, כולל
 * הדיווח שלה.
 */
async function runFitPageWidth(): Promise<void> {
  const host = activeSuperdoc.value;

  if (!host) {
    report({ ok: false, message: 'אין מסמך פתוח', reason: 'not-ready' }, 'zoom');
    return;
  }

  // הגבולות מהמנוע דרך אותו נרמול של הסליידר בשורת המצב (כולל הרחבת
  // התקרה להיקף Word) — מקור אחד, לא קידוד נפרד כאן.
  const state =
    typeof (host as { getZoomState?: () => { min?: unknown; max?: unknown } }).getZoomState ===
    'function'
      ? (host as { getZoomState: () => { min?: unknown; max?: unknown } }).getZoomState()
      : null;
  const bounds = zoomBounds(state);

  const percent = await fitWidthPercent(host, editorStackWidth(), bounds);
  if (percent === null) {
    report(
      { ok: false, message: 'לא ניתן למדוד את רוחב העמוד — נסו שוב לאחר שהמסמך נטען', reason: 'geometry-unavailable' },
      'zoom',
    );
    return;
  }

  await zoomCmd.run(zoomPayload(percent));
}
</script>

<style scoped>
.ribbon-tab-pane {
  display: flex;
  align-items: stretch;
  gap: 0;
  height: 100%;
}
</style>
