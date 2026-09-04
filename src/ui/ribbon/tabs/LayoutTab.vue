<template>
  <div class="ribbon-tab-pane layout-tab">
    <!-- קבוצה 1: הגדרת עמוד -->
    <RibbonGroup title="הגדרת עמוד">
      <RibbonMenuButton
        icon="margins"
        label="שוליים"
        :tooltip="tip('canSetPageMargins', 'הגדרת שולי הדף (רגיל, צר, רחב)')"
        :disabled="!can('canSetPageMargins')"
        :items="marginItems"
        @select="onMargins"
      />
      <RibbonMenuButton
        icon="orientation"
        label="כיוון"
        :tooltip="tip('canSetPageSetup', 'כיוון הדף: לאורך או לרוחב')"
        :disabled="!can('canSetPageSetup')"
        :items="orientationItems"
        @select="onOrientation"
      />
      <RibbonMenuButton
        icon="paperSize"
        label="גודל"
        :tooltip="tip('canSetPageSetup', 'בחירת גודל נייר (A4, Letter)')"
        :disabled="!can('canSetPageSetup')"
        :items="paperItems"
        @select="onPaperSize"
      />
      <RibbonMenuButton
        icon="columns"
        label="עמודות"
        :tooltip="tip('canSetColumns', 'פיצול הטקסט לשתי עמודות או יותר')"
        :disabled="!can('canSetColumns')"
        :items="columnItems"
        @select="onColumns"
      />
      <!--
        שני אלה במחסנית ולא בשורה: ב-Word הקבוצה „הגדרת עמוד” היא ארבעה
        פקדים גדולים (שוליים, כיוון, גודל, עמודות) ועמודה של קטנים לצידם.
        שניהם גם „כותב נכון, לא מוצג” — המנוע אינו מצייר `lnNumType` ולא
        `pgBorders` (docs/button-audit.md), ולכן הם בוודאי אינם הראשיים כאן.
      -->
      <RibbonStack>
        <RibbonMenuButton
          icon="numberList"
          label="מספרי שורות"
          variant="small"
          :tooltip="tip('canSetLineNumbering', 'מספור השורות בשולי הדף')"
          :disabled="!can('canSetLineNumbering')"
          :items="lineNumberItems"
          @select="onLineNumbering"
        />
        <RibbonMenuButton
          icon="borders"
          label="גבולות עמוד"
          variant="small"
          :tooltip="tip('canSetPageBorders', 'מסגרת סביב העמוד')"
          :disabled="!can('canSetPageBorders')"
          :items="pageBorderItems"
          @select="onPageBorders"
        />
      </RibbonStack>
    </RibbonGroup>

    <!-- קבוצה 2: מקטע. „יישור אנכי”, „מספור עמודים” ו„מרחק הכותרת” יושבים
         ב-Word בדיאלוג „הגדרת עמוד → פריסה” ובדיאלוג „עיצוב מספרי עמודים”,
         ולא בגלריות של הסרגל; „ברירות מחדל” (גל 13) הוא רביעי ואינו משם אלא
         מ„גופן → הגדר כברירת מחדל”. („שלושת אלה” שנכתב כאן קודם נשאר מאחור
         כשהרביעי נוסף.)

         „יישור אנכי” הוא הראשי, ושלושת האחרים במחסנית לצידו: הוא היחיד שנוגע
         בזרימת הטקסט בעמוד; השאר הם הגדרות של המסמך. -->
    <RibbonGroup title="מקטע">
      <RibbonMenuButton
        icon="lineSpacing"
        label="יישור אנכי"
        :tooltip="tip('canSetVerticalAlign', 'מיקום הטקסט בגובה העמוד')"
        :disabled="!can('canSetVerticalAlign')"
        :items="verticalAlignItems"
        @select="onVerticalAlign"
      />
      <RibbonStack>
        <RibbonButton
          icon="pageNumber"
          label="מספור עמודים"
          variant="small"
          :tooltip="tip('canSetPageNumbering', 'תבנית מספרי העמודים ומספר ההתחלה')"
          :disabled="!can('canSetPageNumbering')"
          @click="onOpenPageNumbering"
        />
        <RibbonButton
          icon="header"
          label="מרחק הכותרת"
          variant="small"
          :tooltip="tip('canSetHeaderFooterMargins', 'מרחק הכותרת העליונה והתחתונה מקצה הדף')"
          :disabled="!can('canSetHeaderFooterMargins')"
          @click="onOpenHeaderDistance"
        />
        <!-- גל 13: ברירות מחדל לגופן של המסמך כולו (styles.apply על docDefaults). -->
        <RibbonButton
          icon="fontColor"
          label="ברירות מחדל"
          variant="small"
          :tooltip="tip('canSetDocDefaults', 'גופן וגודל ברירת המחדל של המסמך כולו')"
          :disabled="!can('canSetDocDefaults')"
          @click="onOpenDocDefaults"
        />
      </RibbonStack>
    </RibbonGroup>


    <PageNumberingDialog
      :is-open="pageNumberingOpen"
      :format="layoutState.pageNumberFormat"
      :start="layoutState.pageNumberStart"
      :busy="inFlight"
      @close="pageNumberingOpen = false"
      @submit="onPageNumberingSubmit"
    />

    <HeaderDistanceDialog
      :is-open="headerDistanceOpen"
      :distance="layoutState.headerDistanceCm"
      :busy="inFlight"
      @close="headerDistanceOpen = false"
      @submit="onHeaderDistanceSubmit"
    />

    <DocDefaultsDialog
      :is-open="docDefaultsOpen"
      :busy="docDefaultsInFlight"
      :current-size-pt="docDefaultsSizePt"
      @close="docDefaultsOpen = false"
      @submit="onDocDefaultsSubmit"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * „פריסה” — כל הפקדים דרך `doc.sections`, ולא דרך פקודת Ribbon.
 *
 * למה לא דרך ה-registry: אין ב-`COMMAND_CATALOG` של המנוע פקודות לשוליים,
 * לכיוון, לגודל נייר, לעמודות, למספרי שורות, לגבולות עמוד, ליישור אנכי,
 * למספור העמודים או למרחק הכותרת. המסלול הציבורי היחיד הוא ה-Document API,
 * והוא יושב על המופע ולא על ה-controller — ומכאן ההזרקה של `ACTIVE_SUPERDOC`
 * במקום `useCommand`.
 *
 * שלוש התוצאות של „לבדוק capability בעת boot” (§12) גלויות כאן:
 *   1. `:disabled` מגיע מהיכולת שהמנוע מדווח, ולא מהנחה שלנו.
 *   2. tooltip של פקד מנוטרל מסביר **למה** הוא מנוטרל.
 *   3. כשל של קבלה מגיע למשתמש בעברית, דרך אותו מדווח שכל פקודה משתמשת בו —
 *      ולא דרך מנגנון דיווח שני.
 *
 * ## `inFlight` — למה נעילה ולא רק בדיקה
 *
 * שלוש מהפעולות כאן קוראות את מצב המקטעים ואז משנות אותו: „גודל” קורא את
 * הכיוון הנוכחי, „מספרי שורות” קורא את `countBy`/`start` כדי לא למחוק אותם,
 * ושני הדיאלוגים נפתחים על מה שבמסמך. הקריאה חוצה גבול macrotask, ולחיצה
 * שנייה שנקלטת בזמן הזה פועלת על תצלום שכבר אינו נכון. זו בדיוק המלכודת
 * שנמדדה בגל 9 על הערות השוליים: `get` נוסף רק מקצר את החלון, ומה שסוגר
 * אותו הוא שהפעולה השנייה לא תיקלט כלל.
 *
 * לכן `inFlight` נדלק כשפעולה יוצאת וכבה ב-`finally`, ומנטרל בזמן הזה את כל
 * פקדי הלשונית — כולל פתיחת הדיאלוגים, שהיא עצמה קריאה למנוע.
 *
 * הוא עובר גם **אל שני הדיאלוגים**, כ-`busy`, ולא רק אל הרצועה: דיאלוג פתוח
 * ולחיצה על פקד ברצועה הם מצב שאפשר להעמיד, ובו „אישור” היה נלחץ,
 * `run()` היה יוצא ב-`return` שקט, והדיאלוג היה נסגר בלי שקרה דבר ובלי
 * הודעה. זו אותה תבנית שנקבעה ב-ReferencesTab.vue של גל 9.
 */
import { computed, inject, shallowRef, watch } from 'vue';
import type { SuperDoc } from 'superdoc';
import RibbonGroup from '../common/RibbonGroup.vue';
import RibbonStack from '../common/RibbonStack.vue';
import RibbonButton from '../common/RibbonButton.vue';
import RibbonMenuButton from '../common/RibbonMenuButton.vue';
import PageNumberingDialog from '../../panels/PageNumberingDialog.vue';
import HeaderDistanceDialog from '../../panels/HeaderDistanceDialog.vue';
import DocDefaultsDialog from '../../panels/DocDefaultsDialog.vue';
import { ACTIVE_SUPERDOC } from '../../../engine/document-api';
import {
  COMMAND_REPORTER,
  type CommandReporter,
} from '../../../composables/keys';
import type { CommandOutcome } from '../../../engine/command-adapter';
import {
  readDocCapabilities,
  type DocCapabilityQuestion,
  type DocCapabilityReport,
} from '../../../engine/doc-capabilities';
import {
  COLUMN_CHOICES,
  LINE_NUMBER_CHOICES,
  MARGIN_PRESETS,
  ORIENTATIONS,
  PAGE_BORDER_PRESETS,
  PAPER_SIZES,
  VERTICAL_ALIGNS,
  applyColumns,
  applyHeaderDistance,
  applyLineNumbering,
  applyMarginPreset,
  applyOrientation,
  applyPageBorders,
  applyPageNumbering,
  applyPaperSize,
  applyVerticalAlign,
  emptyPageLayoutState,
  readPageLayoutState,
  type HeaderDistanceSettings,
  type PageLayoutState,
  type PageNumberingSettings,
  type PageOrientation,
} from '../../../engine/page-setup';
import {
  applyDocStyleDefaults,
  readDefaultFontSizePt,
} from '../../../engine/doc-style-defaults';

/** ברירת המחדל כשאין מדווח — הרכבה חלקית בבדיקות. זהה להתנהגות של `useCommand`. */
const fallbackReporter: CommandReporter = (outcome, id) => {
  if (!outcome.ok) console.warn(`[otzaria-word] ${id}: ${outcome.message}`);
};

const superdoc = inject(ACTIVE_SUPERDOC, shallowRef<SuperDoc | null>(null));
const report = inject(COMMAND_REPORTER, fallbackReporter);

const capabilities = shallowRef<DocCapabilityReport | null>(null);
const layoutState = shallowRef<PageLayoutState>(emptyPageLayoutState());
const pageNumberingOpen = shallowRef(false);
const headerDistanceOpen = shallowRef(false);

/** פעולה על המסמך באוויר. ראו „`inFlight` — למה נעילה” בהערת הפתיחה. */
const inFlight = shallowRef(false);

/**
 * מונה דורות: קריאת היכולות א-סינכרונית, ומסמך שנפתח אחרי מסמך אחר עשוי
 * להשיב לפניו. בלי המונה התשובה של המסמך הקודם הייתה דורסת את זו של הנוכחי.
 */
let generation = 0;

watch(
  superdoc,
  async (host) => {
    const mine = ++generation;
    capabilities.value = null;
    // דיאלוג שנשאר פתוח על מסמך שהתחלף היה מציג את הערכים של הקודם.
    pageNumberingOpen.value = false;
    headerDistanceOpen.value = false;
    layoutState.value = emptyPageLayoutState();
    const result = await readDocCapabilities(host);
    if (mine === generation) capabilities.value = result;
  },
  { immediate: true }
);

/** עד שהיכולות נקראו — הכול מנוטרל. „אולי כן” הוא בדיוק הכפתור המת. */
function can(question: DocCapabilityQuestion): boolean {
  return !inFlight.value && (capabilities.value?.can(question) ?? false);
}

function tip(question: DocCapabilityQuestion, enabledText: string): string {
  const explanation = capabilities.value?.explain(question);
  return capabilities.value?.can(question) ? enabledText : explanation || 'המסמך עדיין נטען';
}

const marginItems = MARGIN_PRESETS.map((preset) => ({
  id: preset.id,
  label: preset.label,
  hint: preset.hint,
}));

const orientationItems = ORIENTATIONS.map((item) => ({
  id: item.id,
  label: item.label,
  hint: item.hint,
}));

const paperItems = PAPER_SIZES.map((size) => ({
  id: size.id,
  label: size.label,
  hint: size.hint,
}));

const columnItems = COLUMN_CHOICES.map((choice) => ({
  id: String(choice.count),
  label: choice.label,
  hint: choice.hint,
}));

const lineNumberItems = LINE_NUMBER_CHOICES.map((choice) => ({
  id: choice.id,
  label: choice.label,
  hint: choice.hint,
}));

const pageBorderItems = PAGE_BORDER_PRESETS.map((preset) => ({
  id: preset.id,
  label: preset.label,
  hint: preset.hint,
}));

const verticalAlignItems = computed(() =>
  VERTICAL_ALIGNS.map((item) => ({ id: item.id, label: item.label, hint: item.hint }))
);

/**
 * מריצה פעולה ומדווחת עליה. הדיווח כאן ולא במודול: המודול אינו יודע להציג.
 *
 * `inFlight` נדלק כאן ולא בכל קורא בנפרד — פעולה שתשכח להדליק אותו תפתח
 * בדיוק את החלון שהוא נסגר בשבילו.
 */
async function run(id: string, action: () => Promise<CommandOutcome>): Promise<void> {
  if (inFlight.value) return;
  inFlight.value = true;
  try {
    report(await action(), id);
  } finally {
    inFlight.value = false;
  }
}

function onMargins(id: string): void {
  void run('page-margins', () => applyMarginPreset(superdoc.value, id));
}

function onOrientation(id: string): void {
  void run('page-orientation', () => applyOrientation(superdoc.value, id as PageOrientation));
}

function onPaperSize(id: string): void {
  void run('page-size', () => applyPaperSize(superdoc.value, id));
}

function onColumns(id: string): void {
  void run('page-columns', () => applyColumns(superdoc.value, Number(id)));
}

function onLineNumbering(id: string): void {
  void run('page-line-numbering', () => applyLineNumbering(superdoc.value, id));
}

function onPageBorders(id: string): void {
  void run('page-borders', () => applyPageBorders(superdoc.value, id));
}

function onVerticalAlign(id: string): void {
  void run('page-vertical-align', () => applyVerticalAlign(superdoc.value, id));
}

/**
 * קוראת את מצב המקטע ואז פותחת. הקריאה לפני הפתיחה ולא אחריה: דיאלוג שנפתח
 * ריק וממלא את עצמו כעבור tick הוא דיאלוג שהמשתמש עשוי לאשר לפני שהוא מלא.
 */
async function openWithState(open: (value: boolean) => void): Promise<void> {
  if (inFlight.value) return;
  inFlight.value = true;
  try {
    layoutState.value = await readPageLayoutState(superdoc.value);
    open(true);
  } finally {
    inFlight.value = false;
  }
}

function onOpenPageNumbering(): void {
  void openWithState((value) => {
    pageNumberingOpen.value = value;
  });
}

function onOpenHeaderDistance(): void {
  void openWithState((value) => {
    headerDistanceOpen.value = value;
  });
}

function onPageNumberingSubmit(settings: PageNumberingSettings): void {
  pageNumberingOpen.value = false;
  void run('page-numbering', () => applyPageNumbering(superdoc.value, settings));
}

function onHeaderDistanceSubmit(settings: HeaderDistanceSettings): void {
  headerDistanceOpen.value = false;
  void run('page-header-distance', () => applyHeaderDistance(superdoc.value, settings));
}

/* ------------------------------------------------------------------ */
/* ברירות מחדל למסמך (גל 13)                                           */
/* ------------------------------------------------------------------ */

/**
 * „ברירות מחדל" — גופן/גודל ברירת המחדל של המסמך כולו, דרך `styles.apply`
 * על docDefaults (engine/doc-style-defaults.ts). הגודל הנוכחי נקרא ב-dryRun
 * בפתיחה, למילוי מקדים של ה-placeholder.
 */
const docDefaultsOpen = shallowRef(false);
const docDefaultsInFlight = shallowRef(false);
const docDefaultsSizePt = shallowRef<number | null>(null);

async function onOpenDocDefaults(): Promise<void> {
  if (docDefaultsInFlight.value) return;
  docDefaultsInFlight.value = true;
  try {
    // dryRun היא קריאת המצב; כשלה אינו חוסם פתיחה — השדה נפתח „ללא שינוי".
    docDefaultsSizePt.value = await readDefaultFontSizePt(superdoc.value);
    docDefaultsOpen.value = true;
  } finally {
    docDefaultsInFlight.value = false;
  }
}

function onDocDefaultsSubmit(patch: { fontFamily?: string; fontSizePt?: number }): void {
  docDefaultsOpen.value = false;
  if (docDefaultsInFlight.value) return;
  docDefaultsInFlight.value = true;
  void (async () => {
    try {
      report(await applyDocStyleDefaults(superdoc.value, patch), 'doc-style-defaults');
    } finally {
      docDefaultsInFlight.value = false;
    }
  })();
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
