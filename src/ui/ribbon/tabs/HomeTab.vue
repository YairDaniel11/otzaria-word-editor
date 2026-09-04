<template>
  <div class="ribbon-tab-pane home-tab">
    <!-- קבוצה 1: לוח -->
    <RibbonGroup title="לוח">
      <RibbonButton
        icon="paste"
        label="הדבק"
        variant="large"
        :tooltip="pasteTooltip"
        shortcut-id="paste"
        :disabled="!canPaste"
        @click="doPaste"
      />
      <RibbonStack>
        <RibbonButton
          icon="cut"
          label="גזור"
          variant="small"
          :tooltip="cutTooltip"
          shortcut-id="cut"
          :disabled="!canCut"
          @click="doCut"
        />
        <RibbonButton
          icon="copy"
          label="העתק"
          variant="small"
          :tooltip="copyTooltip"
          shortcut-id="copy"
          :disabled="!canCopy"
          @click="doCopy"
        />
        <RibbonButton
          icon="formatPainter"
          label="מברשת עיצוב"
          variant="small"
          tooltip="העתק עיצוב ממקום אחד והחל במקום אחר"
          shortcut-id="format-painter"
          :active="formatPainterCmd.active.value"
          :disabled="!formatPainterCmd.enabled.value"
          @click="formatPainterCmd.run()"
        />
      </RibbonStack>
    </RibbonGroup>

    <!-- קבוצה 2: גופן -->
    <RibbonGroup
      title="גופן"
      :column-flow="true"
    >
      <!-- שורה עליונה: גופן, גודל, הגדל/הקטן, נקה -->
      <div class="word-group-row">
        <!--
          `:model-value` ולא `v-model`: הערך המוצג הוא computed שמקורו במנוע,
          ואין לפקד רשות לכתוב אליו. מה שהמשתמש בוחר עובר בפקודה, וחוזר משם.
        -->
        <!--
          RibbonCombo ולא RibbonSelect: מרגע שהמכונה נמנית הרשימה מונה מאות
          שמות, ובבורר נייטיב אין חיפוש. ראו common/RibbonCombo.vue.
        -->
        <RibbonCombo
          :model-value="fonts.family.value"
          :options="fonts.familyOptions.value"
          :disabled="!fonts.familyEnabled.value"
          :sample="fonts.sampleText.value"
          width="130px"
          title="גופן"
          @update:model-value="fonts.setFamily"
          @preview="fonts.hoverFamily"
          @preview-end="fonts.endHoverFamily"
        />
        <!--
          גם הגודל הוא RibbonCombo, ולא `<select>` שהיה כאן: בסולם של Word יש
          ארבעה עשר גדלים, והמסמכים שנערכים כאן משתמשים גם ב-13, ב-15 וב-10.5.
          בבורר סגור הם היו נגישים רק דרך „הגדל/הקטן” — כלומר לא נגישים.
          `normalize` הוא מה שהופך את התיבה לתיבת ערך: ראו common/RibbonCombo.vue.
        -->
        <RibbonCombo
          :model-value="fonts.size.value"
          :options="fonts.sizeOptions.value"
          :disabled="!fonts.sizeEnabled.value"
          :normalize="fonts.normalizeSize"
          empty-text="Enter מחיל את הגודל שהוקלד"
          list-min-width="52px"
          width="54px"
          title="גודל גופן"
          @update:model-value="fonts.setSize"
        />
        <RibbonButton
          icon="growFont"
          variant="icon-only"
          tooltip="הגדל גופן"
          description="מגדיל את הטקסט המסומן בדרגה אחת בכל לחיצה"
          shortcut-id="font-grow"
          :disabled="!fonts.sizeEnabled.value"
          @click="fonts.grow"
        />
        <RibbonButton
          icon="shrinkFont"
          variant="icon-only"
          tooltip="הקטן גופן"
          description="מקטין את הטקסט המסומן בדרגה אחת בכל לחיצה"
          shortcut-id="font-shrink"
          :disabled="!fonts.sizeEnabled.value"
          @click="fonts.shrink"
        />
        <RibbonButton
          icon="clearFormatting"
          variant="icon-only"
          tooltip="נקה את כל העיצוב"
          description="מחזיר את הטקסט המסומן לעיצוב הרגיל, והתוכן נשאר"
          shortcut-id="clear-formatting"
          :disabled="!clearFormatCmd.enabled.value"
          @click="clearFormatCmd.run()"
        />

        <!--
          „גופן מתקדם" — פתח הדיאלוג, כמו פתח ה„גופן" של Word בקצה הקבוצה.
          הדיאלוג עצמו נכשל סגור כשאין Document API, ולכן הכפתור נשאר לחיץ
          והפתיחה מסבירה. `@pointerdown.prevent` מונע גזילת המיקוד מהעורך —
          הבחירה חייבת לשרוד עד החלת העיצוב.
        -->
        <RibbonButton
          label="מתקדם"
          variant="small"
          description="ריווח תווים, מיקום ביחס לשורה, אפקטים וגופן מורכב"
          :disabled="fontAdvInFlight"
          @click="onOpenFontAdvanced"
        />
      </div>

      <!-- שורה תחתונה: B, I, U, S, sub, super, highlight, color -->
      <div class="word-group-row">
        <RibbonButton
          icon="bold"
          variant="icon-only"
          tooltip="מודגש"
          description="מעבה את הטקסט המסומן"
          shortcut-id="bold"
          :active="boldCmd.active.value"
          :disabled="!boldCmd.enabled.value"
          @click="boldCmd.run()"
        />
        <RibbonButton
          icon="italic"
          variant="icon-only"
          tooltip="נטוי"
          description="מטה את הטקסט המסומן"
          shortcut-id="italic"
          :active="italicCmd.active.value"
          :disabled="!italicCmd.enabled.value"
          @click="italicCmd.run()"
        />
        <RibbonButton
          icon="underline"
          variant="icon-only"
          tooltip="קו תחתון"
          description="מוסיף קו מתחת לטקסט המסומן"
          shortcut-id="underline"
          :active="underlineCmd.active.value"
          :disabled="!underlineCmd.enabled.value"
          @click="underlineCmd.run()"
        />
        <RibbonButton
          icon="strikethrough"
          variant="icon-only"
          tooltip="קו חוצה"
          description="מעביר קו באמצע הטקסט המסומן"
          shortcut-id="strikethrough"
          :active="strikeCmd.active.value"
          :disabled="!strikeCmd.enabled.value"
          @click="strikeCmd.run()"
        />
        <RibbonButton
          icon="subscript"
          variant="icon-only"
          :tooltip="vertAlignTooltip('subscript')"
          label="כתב תחתי"
          shortcut-id="subscript"
          :disabled="!canSetVertAlign"
          @click="onVertAlign('subscript')"
        />
        <RibbonButton
          icon="superscript"
          variant="icon-only"
          :tooltip="vertAlignTooltip('superscript')"
          label="כתב עליון"
          shortcut-id="superscript"
          :disabled="!canSetVertAlign"
          @click="onVertAlign('superscript')"
        />

        <div class="word-separator" />

        <ColorPickerPopover
          :model-value="highlightColor"
          icon="highlight"
          title="צבע סימון טקסט"
          default-color="#FFFF00"
          :disabled="!highlightCmd.enabled.value"
          @change="onHighlightChange"
        />
        <ColorPickerPopover
          :model-value="textColor"
          icon="fontColor"
          title="צבע גופן"
          default-color="#000000"
          :disabled="!fontColorCmd.enabled.value"
          @change="onTextColorChange"
        />
      </div>
    </RibbonGroup>

    <!-- קבוצה 3: פיסקה -->
    <RibbonGroup
      title="פיסקה"
      :column-flow="true"
    >
      <!-- שורה עליונה: תבליטים, מספור, הזחה, כיווניות, סימני עיצוב -->
      <div class="word-group-row">
        <!--
          „תבליטים” ו„מספור” הם כפתורים מפוצלים: הגוף מחיל את הרשימה, והחץ
          פותח את פעולות הרשימה. עד עכשיו הן ישבו בכפתור „רשימה” נפרד לצדם —
          שלושה פקדים לדבר אחד, ומי שרצה מספור עברי היה צריך לדעת שהוא מסתתר
          מאחורי כפתור שאינו הכפתור שיצר את הרשימה.
        -->
        <RibbonMenuButton
          split
          icon="bulletList"
          label="תבליטים"
          variant="icon-only"
          tooltip="תבליטים"
          description="הופך את הפסקאות המסומנות לרשימה מסומנת בנקודות"
          menu-tooltip="פעולות תבליטים"
          :menu-description="bulletMenuHint"
          :active="bulletCmd.active.value"
          :action-disabled="!bulletCmd.enabled.value"
          :disabled="!listsAvailable"
          :items="bulletMenuItems"
          @action="bulletCmd.run()"
          @select="onListMenuSelect"
        />
        <RibbonMenuButton
          split
          icon="numberList"
          label="מספור"
          variant="icon-only"
          tooltip="מספור"
          description="הופך את הפסקאות המסומנות לרשימה ממוספרת"
          menu-tooltip="פעולות מספור"
          :menu-description="numberMenuHint"
          :active="numberedCmd.active.value"
          :action-disabled="!numberedCmd.enabled.value"
          :disabled="!listsAvailable"
          :items="numberMenuItems"
          @action="numberedCmd.run()"
          @select="onListMenuSelect"
        />
        <RibbonButton
          icon="indentDecrease"
          variant="icon-only"
          tooltip="הקטן הזחה"
          description="מקרב את הפסקה לשולי הדף"
          shortcut-id="indent-decrease"
          :disabled="!indentDecCmd.enabled.value"
          @click="indentDecCmd.run()"
        />
        <RibbonButton
          icon="indentIncrease"
          variant="icon-only"
          tooltip="הגדל הזחה"
          description="מרחיק את הפסקה משולי הדף"
          shortcut-id="indent-increase"
          :disabled="!indentIncCmd.enabled.value"
          @click="indentIncCmd.run()"
        />

        <div class="word-separator" />

        <RibbonButton
          icon="dirRtl"
          variant="icon-only"
          tooltip="כיוון פסקה מימין לשמאל"
          description="מסדר את הפסקה לקריאה בעברית: ההזחה והיישור בצד ימין"
          shortcut-id="direction-rtl"
          :active="dirRtlActive"
          :disabled="!dirRtlCmd.enabled.value"
          @click="runDirectionRtl()"
        />
        <RibbonButton
          icon="dirLtr"
          variant="icon-only"
          tooltip="כיוון פסקה משמאל לימין"
          description="מסדר את הפסקה לקריאה בלטינית: ההזחה והיישור בצד שמאל"
          shortcut-id="direction-ltr"
          :active="dirLtrActive"
          :disabled="!dirLtrCmd.enabled.value"
          @click="runDirectionLtr()"
        />
        <RibbonButton
          icon="pilcrow"
          variant="icon-only"
          tooltip="הצג/הסתר סימני עיצוב"
          description="מציג סימני פסקה, טאבים ורווחים על המסך. הם אינם מודפסים"
          shortcut-id="formatting-marks"
          :active="marksCmd.active.value"
          :disabled="!marksCmd.enabled.value"
          @click="marksCmd.run()"
        />
      </div>

      <!-- שורה תחתונה: יישור ימין, מרכז, שמאל, מלא, מרווח שורות -->
      <div class="word-group-row">
        <RibbonButton
          icon="alignRight"
          variant="icon-only"
          tooltip="יישור לימין"
          description="מיישר את הפסקה לשוליים הימניים"
          shortcut-id="align-right"
          :active="alignCmd.value.value === 'right'"
          :disabled="!alignCmd.enabled.value"
          @click="onAlign('right')"
        />
        <RibbonButton
          icon="alignCenter"
          variant="icon-only"
          tooltip="מרכז"
          description="ממרכז את הפסקה בין שני השוליים"
          shortcut-id="align-center"
          :active="alignCmd.value.value === 'center'"
          :disabled="!alignCmd.enabled.value"
          @click="onAlign('center')"
        />
        <RibbonButton
          icon="alignLeft"
          variant="icon-only"
          tooltip="יישור לשמאל"
          description="מיישר את הפסקה לשוליים השמאליים"
          shortcut-id="align-left"
          :active="alignCmd.value.value === 'left'"
          :disabled="!alignCmd.enabled.value"
          @click="onAlign('left')"
        />
        <RibbonButton
          icon="alignJustify"
          variant="icon-only"
          tooltip="יישור לשני הצדדים"
          description="מותח את השורות עד שני השוליים, מלבד השורה האחרונה"
          shortcut-id="align-justify"
          :active="alignCmd.value.value === 'justify'"
          :disabled="!alignCmd.enabled.value"
          @click="onAlign('justify')"
        />

        <div class="word-separator" />

        <RibbonSelect
          :model-value="selectedLineSpacing"
          :options="spacingSelectOptions"
          :disabled="!lineSpacingCmd.enabled.value"
          width="48px"
          title="מרווח בין שורות"
          @update:model-value="onLineSpacingChange"
        />

        <div class="word-separator" />

        <!--
          „תפריט פסקה” — פתח הדיאלוג, כמו פתח ה„פסקה” של Word בקצה הקבוצה.
          זמינותו אינה של פקודה: הדיאלוג עצמו נכשל סגור כשאין Document API,
          ולכן הכפתור נשאר לחיץ והפתיחה מסבירה. `@pointerdown.prevent` מונע
          גזילת המיקוד מהעורך — הבחירה חייבת לשרוד עד פתיחת הדיאלוג.
        -->
        <RibbonButton
          icon="pilcrow"
          variant="icon-only"
          tooltip="תפריט פסקה"
          description="כניסות, ריווח בין פסקאות, מרווח שורות ועצירות טאב"
          :disabled="paraInFlight"
          @click="onOpenParagraph"
        />
      </div>
    </RibbonGroup>

    <!-- קבוצה 4: סגנונות -->
    <RibbonGroup
      title="סגנונות"
      class="styles-group"
    >
      <!-- `disabled` ולא רק `current-style`: בלי בחירה במסמך הפקודה
           `linked-style` נכשלת, וגלריה שנראית פעילה מזמינה לחיצה שלא תעשה
           כלום. הדיווח על הכשל עצמו הוא של `useCommand().run()`. -->
      <StyleGallery
        :current-style="String(styleCmd.value.value || 'Normal')"
        :disabled="!styleCmd.enabled.value"
        @select-style="onApplyStyle"
      />
    </RibbonGroup>

    <!-- קבוצה 5: עריכה -->
    <RibbonGroup title="עריכה">
      <RibbonStack>
        <RibbonButton
          icon="search"
          label="חפש"
          variant="small"
          tooltip="חיפוש טקסט במסמך"
          shortcut-id="find"
          @click="$emit('open-find')"
        />
        <RibbonButton
          icon="replace"
          label="החלפה"
          variant="small"
          tooltip="החלפת טקסט במסמך"
          shortcut-id="replace"
          @click="$emit('open-replace')"
        />
        <!--
          Ctrl+A אינו פקודה של ה-controller — אין במנוע `select-all` — ולכן
          הקיצור מנתב לאותו מסלול Document API שהכפתור הזה מנתב אליו
          (`selectWholeDocument`), ולא לבחירה המקורית של משטח העריכה, שאינה
          מגיעה לכל המסמך בפריסה מרובת עמודים.
        -->
        <RibbonButton
          icon="select"
          label="בחר הכל"
          shortcut-id="select-all"
          variant="small"
          :tooltip="selectAllTooltip"
          :disabled="!canSelectAll"
          @click="doSelectAll"
        />
      </RibbonStack>
    </RibbonGroup>

    <ParagraphDialog
      :is-open="paragraphOpen"
      :busy="paraInFlight"
      :tabs-enabled="tabsEnabled"
      :snapshot="paraSnapshot"
      @close="paragraphOpen = false"
      @submit="onParagraphSubmit"
      @tab-add="onParagraphTabAdd"
      @tab-remove="onParagraphTabRemove"
      @tabs-clear="onParagraphTabsClear"
    />

    <FontAdvancedDialog
      :is-open="fontAdvOpen"
      :busy="fontAdvInFlight"
      @close="fontAdvOpen = false"
      @submit="onFontAdvancedSubmit"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onUnmounted, ref, shallowRef, watch } from 'vue';
import type { SuperDoc } from 'superdoc';
import RibbonGroup from '../common/RibbonGroup.vue';
import RibbonStack from '../common/RibbonStack.vue';
import RibbonButton from '../common/RibbonButton.vue';
import RibbonMenuButton from '../common/RibbonMenuButton.vue';
import RibbonSelect, { type SelectOption } from '../common/RibbonSelect.vue';
import RibbonCombo from '../common/RibbonCombo.vue';
import ColorPickerPopover from '../common/ColorPickerPopover.vue';
import StyleGallery from '../common/StyleGallery.vue';
import { useCommand } from '../../../composables/useCommand';
import { useFontControls } from '../../../composables/use-font-controls';
import { applyOptimistically, withCurrent } from '../../../composables/picker-value';
import { COMMAND_REPORTER, type CommandReporter } from '../../../composables/keys';
import type { CommandOutcome } from '../../../engine/command-adapter';
import { ACTIVE_SUPERDOC } from '../../../engine/document-api';
import { readDocCapabilities, type DocCapabilityReport } from '../../../engine/doc-capabilities';
import {
  copySelection,
  cutSelection,
  pasteFromClipboard,
  selectWholeDocument,
} from '../../../engine/clipboard';
import {
  readVertAlignSupport,
  toggleVertAlign,
  type VertAlignKind,
  type VertAlignSupport,
} from '../../../engine/vert-align';
import ParagraphDialog from '../../panels/ParagraphDialog.vue';
import FontAdvancedDialog from '../../panels/FontAdvancedDialog.vue';
import {
  TWIPS_PER_CM,
  TWIPS_PER_PT,
  addParagraphTabStop,
  applyParagraphIndentation,
  applyParagraphKeepOptions,
  applyParagraphSpacing,
  clearAllParagraphTabStops,
  emptyParagraphFormat,
  readParagraphFormat,
  readParagraphIndents,
  removeParagraphTabStop,
  type TabStop,
} from '../../../engine/paragraph-format';
import {
  applyFontAdvanced,
  type FontAdvancedPatch,
} from '../../../engine/font-advanced';
import {
  NUMBER_STYLE_LABELS,
  continuePreviousList,
  convertListToText,
  restartListAt,
  setListNumberStyle,
  setListToBullets,
} from '../../../engine/lists';
import {
  DEFAULT_LINE_HEIGHT,
  alignmentPayload,
  colorPayload,
  lineHeightPayload,
  parseColor,
  parseLineHeight,
  stylePayload,
  type ParagraphAlignment,
} from '../../../engine/payloads';

defineEmits<{
  (e: 'open-find'): void;
  (e: 'open-replace'): void;
}>();

const SPACING_OPTIONS: SelectOption[] = [
  { value: '1.0', label: '1.0' },
  { value: '1.15', label: '1.15' },
  { value: '1.5', label: '1.5' },
  { value: '2.0', label: '2.0' },
  { value: '2.5', label: '2.5' },
  { value: '3.0', label: '3.0' },
];

// פקודות SuperDoc
const boldCmd = useCommand('bold');
const italicCmd = useCommand('italic');
const underlineCmd = useCommand('underline');
const strikeCmd = useCommand('strikethrough');
const clearFormatCmd = useCommand('clear-formatting');
const formatPainterCmd = useCommand('copy-format');

const fontColorCmd = useCommand('text-color');
const highlightCmd = useCommand('highlight-color');

const bulletCmd = useCommand('bullet-list');
const numberedCmd = useCommand('numbered-list');
const indentIncCmd = useCommand('indent-increase');
const indentDecCmd = useCommand('indent-decrease');
const dirRtlCmd = useCommand('direction-rtl');
const dirLtrCmd = useCommand('direction-ltr');
const marksCmd = useCommand('formatting-marks');
const alignCmd = useCommand('text-align');
const lineSpacingCmd = useCommand('line-height');
const styleCmd = useCommand('linked-style');

/**
 * בורר הגופן ובורר הגודל. המצב שלהם אינו כאן אלא ב-use-font-controls.ts, ומאותו
 * טעם שבו האפשרויות אינן כאן: אותם שני בוררים מופיעים גם בתפריט הלחצן הימני,
 * ועותק פרטי לכל אחד מהם היה מציג בהם ערכים שונים באותו רגע — בדיוק ברגע שבו
 * המנוע אינו מדווח ערך.
 */
const fonts = useFontControls();

/* ------------------------------------------------------------------ */
/* מה שהמנוע מדווח על הבחירה                                            */
/* ------------------------------------------------------------------ */

/**
 * `CommandState.value` הוא המקור לערך שהפקד מציג — לא ref מקומי. שלושת
 * הבוררים היו פעם refs שאותחלו לערך קשיח ולעולם לא התעדכנו: לחיצה על טקסט
 * ב-20pt השאירה „12” בתיבה. בורר הגופן והגודל עברו ל-use-font-controls.ts;
 * מה שנשאר כאן הוא מרווח השורות ושני הצבעים.
 */
const engineLineHeight = computed(() => parseLineHeight(lineSpacingCmd.value.value));
const engineTextColor = computed(() => parseColor(fontColorCmd.value.value));
const engineHighlight = computed(() => parseColor(highlightCmd.value.value));

/**
 * מה שהמנוע דיווח לאחרונה.
 *
 * למה בכלל נדרש זיכרון כזה: המנוע מדווח `undefined` בשני מצבים שונים — בחירה
 * עם יותר מערך אחד, ורגע שבו הוא עוד לא פתר את הבחירה. הבורר הוא **פקד**, ולא
 * דוח; לרוקן אותו בכל תנועת סמן היה גרוע יותר מלהציג את הערך האחרון שכן ידענו.
 */
const lastLineHeight = ref(DEFAULT_LINE_HEIGHT);

/**
 * מה שהמשתמש בחר וטרם קיבל תשובה מהמנוע. `null` = אין בקשה באוויר.
 *
 * למה שכבה נפרדת ולא כתיבה לזיכרון שלמעלה, וזה **הבאג שהיה כאן**: הזיכרון
 * נכתב לפני `run()` ולא הוחזר בכשל, ולכן הבורר הציג גופן שלא הוחל על שום דבר —
 * אותה תקלה בדיוק שתוקנה בזום, שבה הסרגל הזיז את התווית ורוחב העמוד לא זז.
 * מסוכן ממנה היה „הגדל גופן” (שעבר מכאן ל-use-font-controls.ts), שמחשב מהערך
 * הזה: שלוש לחיצות על מסמך שדוחה שלחו 14, 16, 18 — הפקד התרחק מהמסמך בכל לחיצה.
 *
 * ההפרדה גם מה שמתקן את המקרה הקשה יותר, שבו למנוע **יש** ערך: כתיבה לזיכרון
 * לא שינתה שם את הערך המוצג בכלל (המנוע גובר עליו), ולכן לא היה רינדור חוזר —
 * ו-Vue מסנכרן `<select :value>` רק כשהערך הקשור משתנה. כלומר הבחירה שנדחתה
 * נשארה על המסך עד לרינדור חוזר מסיבה אחרת לגמרי. עם שכבת ה-`pending` הערך
 * המוצג משתנה בשני הכיוונים, והסנכרון נקשר לתשובה עצמה.
 */
const pendingLineHeight = ref<number | null>(null);

watch(engineLineHeight, (value) => {
  if (value) lastLineHeight.value = value;
});

/**
 * סדר העדיפויות: מה שנבחר וטרם נענה, אחר כך מה שהמנוע מדווח, ולבסוף האחרון
 * שידענו. בקשה שנדחתה נעלמת מהשכבה הראשונה, ואז המסמך חוזר להיות מה שמוצג.
 */
const currentLineHeight = computed(
  () => pendingLineHeight.value ?? engineLineHeight.value ?? lastLineHeight.value,
);

/** „1.5” ולא „1.50”, כדי שהערך יתאים לאפשרות בבורר. */
const selectedLineSpacing = computed(() => currentLineHeight.value.toFixed(2).replace(/0$/, ''));

/** צבע הפקד תמיד משקף את המסמך; ברירת המחדל היא מה שהכפתור יחיל בלחיצה. */
const textColor = computed(() => engineTextColor.value ?? '');
const highlightColor = computed(() => engineHighlight.value ?? '');

const spacingSelectOptions = computed(() =>
  withCurrent(SPACING_OPTIONS, selectedLineSpacing.value),
);

/* ------------------------------------------------------------------ */
/* הפעלה                                                              */
/* ------------------------------------------------------------------ */

// כל ה-payloads נבנים ב-engine/payloads.ts, ולא כליטרל כאן: מה שנשלח לפקודה
// הוא חוזה מול ולידטור בתוך המנוע, והוולידטור נכשל **סגור**. ראו את הטבלה
// שם, ואת בדיקת החוזה ב-tests/contract/command-payloads.test.ts.
function onTextColorChange(color: string | null): void {
  void fontColorCmd.run(colorPayload(color));
}

function onHighlightChange(color: string | null): void {
  void highlightCmd.run(colorPayload(color));
}

function onLineSpacingChange(val: string): void {
  const multiplier = parseLineHeight(val);
  if (multiplier === null) return;
  const payload = lineHeightPayload(multiplier);
  if (payload === null) return;
  void applyOptimistically(pendingLineHeight, lastLineHeight, multiplier, () =>
    lineSpacingCmd.run(payload),
  );
}

function onAlign(alignment: ParagraphAlignment): void {
  void alignCmd.run(alignmentPayload(alignment));
}

function onApplyStyle(styleId: string): void {
  const payload = stylePayload(styleId);
  if (payload === null) return;
  void styleCmd.run(payload);
}

/* ------------------------------------------------------------------ */
/* לוח                                                                */
/* ------------------------------------------------------------------ */

/**
 * פעולות הלוח אינן פקודות ב-registry של ה-controller — אין להן מזהה בקטלוג —
 * ולכן הן עוברות ב-Document API דרך engine/clipboard.ts, ומדווחות ידנית. ראו
 * ReferencesTab: אותו דפוס בדיוק, כולל קריאת היכולות בכל החלפת מסמך.
 */
const fallbackReporter: CommandReporter = (outcome, id) => {
  if (!outcome.ok) console.warn(`[otzaria-word] ${id}: ${outcome.message}`);
};

const superdoc = inject(ACTIVE_SUPERDOC, shallowRef<SuperDoc | null>(null));

const report = inject(COMMAND_REPORTER, fallbackReporter);

/* ------------------------------------------------------------------ */
/* חיווי „פעיל” של RTL/LTR                                             */
/* ------------------------------------------------------------------ */

/**
 * חיווי „פעיל” של RTL/LTR — לא מ-`dirRtlCmd.active`/`dirLtrCmd.active`.
 *
 * docs/button-audit.md (שורה ה', „קשה לתקן”) תיעד: „הכתיבה מצליחה; הפקודה
 * אינה מדווחת active”. **נמדד מחדש מול superdoc@2.10.0 (Chrome headless,
 * ה-dist הארוז) לפני שנגעו כאן — הבאג עדיין קיים.** לחיצה על „כיוון פסקה
 * מימין לשמאל" כותבת `<w:bidi/>` תקין, אבל `ui.commands.get('direction-rtl')
 * .getState()` המיידי שאחריה מחזיר `{supported:true, enabled:true,
 * active:false}` — בדיוק כמו שהתיעוד טען (scripts/qa/home-paragraph-qa.mjs,
 * מקטע „כיוון פסקה”).
 *
 * המעקף, כמו שהתיעוד המליץ: לקרוא `bidi` מה-`pPr` של הפסקה עצמה, ולא לסמוך
 * על הפקודה. בניגוד ל-`pageBreakBefore` (engine/page-break.ts) — ששם
 * `doc.get()` לא החזיר את התכונה בכלל וגרר מעקב מקומי — `bidi` **כן** חוזר
 * מ-`doc.get()` (נמדד שם, בהערת הפתיחה של page-break.ts: „תכונות אותה פסקה
 * בדיוק שחוזרות מ-doc.get() הן {bidi:true} בלבד"). כלומר אין צורך במעקב
 * מקומי: `readParagraphIndents` (engine/paragraph-format.ts) כבר קוראת בדיוק
 * את זה — היא אותה קריאה שהסרגל האופקי משתמש בה כדי לצייר את סמן ההזחה
 * (engine/page-ruler.ts), וכאן היא משמשת לצורך אחר: מקור אמת ל-`:active`.
 */
const paragraphBidi = shallowRef<boolean | null>(null);

/** מונה דורות: קריאה א-סינכרונית שמתאפסת לא תדרוס תשובה טרייה יותר. */
let bidiGeneration = 0;

async function refreshParagraphBidi(): Promise<void> {
  const mine = ++bidiGeneration;
  const reading = await readParagraphIndents(superdoc.value);
  if (mine !== bidiGeneration) return;
  paragraphBidi.value = reading ? reading.indents.bidi : null;
}

/**
 * השהיית הקריאה אחרי תזוזת סמן — אותו ערך ואותה הנמקה כמו
 * `RULER_SELECTION_DEBOUNCE_MS`/`PAGE_BREAK_SELECTION_DEBOUNCE_MS`
 * (page-ruler.ts, InsertTab.vue): חיווי שמתעדכן חצי שנייה אחרי הסמן נראה
 * תקוע.
 */
const BIDI_SELECTION_DEBOUNCE_MS = 150;
let bidiSelectionTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleBidiRefresh(): void {
  clearTimeout(bidiSelectionTimer);
  bidiSelectionTimer = setTimeout(() => void refreshParagraphBidi(), BIDI_SELECTION_DEBOUNCE_MS);
}

/**
 * מנוי על תזוזת סמן, כדי שהחיווי יתעדכן כשהסמן עובר לפסקה אחרת בלי לחיצה על
 * הכפתור עצמו. אותו דפוס בדיוק כמו `pageBreakOn` ב-InsertTab.vue: `observe`
 * מחובר ישירות מהלשונית (הצרכן היחיד), ומתחלף בכל החלפת מסמך.
 *
 * פער ידוע, מאותה משפחה כמו זה שתועד ב-page-break.ts „QA עצמאי” ל-Undo/Redo:
 * Ctrl+Z שמבטל שינוי כיוון בלי להזיז את הסמן לא יריץ מחדש קריאה כאן, והחיווי
 * יישאר על הערך הישן עד תזוזת סמן הבאה. בניגוד ל-`PageBreakTracker` — שהיה
 * יכול להישאר שגוי **לצמיתות** כי הוא זיכרון מקומי — כאן זו קריאה חיה מהמסמך
 * בכל פעם שהיא כן רצה, כך שהפער נסגר מעצמו בתזוזת הסמן הבאה, ולא רק בלחיצה
 * נוספת על הכפתור.
 */
let unsubscribeBidiSelection: (() => void) | null = null;

watch(
  superdoc,
  (host) => {
    paragraphBidi.value = null;
    unsubscribeBidiSelection?.();
    unsubscribeBidiSelection = null;

    const observeSelection = (host as SuperDoc | null | undefined)?.ui?.selection?.observe;
    if (typeof observeSelection === 'function') {
      try {
        unsubscribeBidiSelection =
          observeSelection.call((host as SuperDoc).ui.selection, scheduleBidiRefresh) ?? null;
      } catch {
        unsubscribeBidiSelection = null;
      }
    }
    // נפילה בטוחה למנוע בלי `observe`, וגם קריאה ראשונה שאינה תלויה ב„ירה
    // מיד" של המנוע.
    scheduleBidiRefresh();
  },
  { immediate: true }
);

onUnmounted(() => {
  unsubscribeBidiSelection?.();
  clearTimeout(bidiSelectionTimer);
});

/**
 * מה שהכפתורים מציגים בפועל. `paragraphBidi.value === null` פירושו „אין
 * עדיין קריאה תקפה" (אין סמן, מסמך נטען) — ואז נופלים חזרה למה שהמנוע
 * מדווח, כדי לא לייצר טענה שלא נמדדה. בפועל זה כמעט תמיד `false` (הבאג
 * המתועד למעלה), אבל זו נפילה זהה לזו שהייתה קיימת לפני התיקון, לא גרועה
 * ממנה.
 */
const dirRtlActive = computed(() =>
  paragraphBidi.value !== null ? paragraphBidi.value === true : dirRtlCmd.active.value,
);
const dirLtrActive = computed(() =>
  paragraphBidi.value !== null ? paragraphBidi.value === false : dirLtrCmd.active.value,
);

/**
 * לחיצה על כפתורי הכיוון: מריצה את הפקודה (שכותבת `<w:bidi>` נכון — זה
 * עצמו לא שבור, ראו התיעוד למעלה) ומרעננת מיד את החיווי, בלי לחכות
 * ל-debounce של תזוזת סמן. הלחיצה עצמה לא מזיזה את הסמן, ולכן בלי הרענון
 * המיידי הזה `ui.selection.observe` שמעל לא היה יורה כלל.
 */
async function runDirectionRtl(): Promise<void> {
  await dirRtlCmd.run();
  await refreshParagraphBidi();
}
async function runDirectionLtr(): Promise<void> {
  await dirLtrCmd.run();
  await refreshParagraphBidi();
}

const capabilities = shallowRef<DocCapabilityReport | null>(null);

/** קריאת היכולות א-סינכרונית, ותשובה של מסמך קודם לא תדרוס את הנוכחי. */
let generation = 0;

watch(
  superdoc,
  async (host) => {
    const mine = ++generation;
    capabilities.value = null;
    const result = await readDocCapabilities(host);
    if (mine === generation) capabilities.value = result;
  },
  { immediate: true }
);

const canCopy = computed(() => capabilities.value?.can('canCopySelection') ?? false);

/** „גזור” הוא סדרוּר **ומחיקה**. מנוע שיודע רק להעתיק משאיר „העתק” פעיל. */
const canCut = computed(
  () => canCopy.value && (capabilities.value?.can('canDeleteSelection') ?? false),
);

const canPaste = computed(() => capabilities.value?.can('canPasteContent') ?? false);

/**
 * „בחר הכל” עובר ב-`ranges.resolve` (גבולות גוף המסמך) ואז ב-
 * `ui.selection.apply`. רק הראשון נשאל ביכולות — לשני אין מזהה פעולה בקטלוג,
 * והוא נכשל סגור עם `reason` משלו.
 */
const canSelectAll = computed(() => capabilities.value?.can('canResolveRange') ?? false);

type ClipboardQuestion =
  | 'canCopySelection'
  | 'canDeleteSelection'
  | 'canPasteContent'
  | 'canResolveRange';

function tooltipFor(enabled: boolean, question: ClipboardQuestion, text: string): string {
  if (enabled) return text;
  return capabilities.value?.explain(question) || 'המסמך עדיין נטען';
}

const copyTooltip = computed(() =>
  tooltipFor(canCopy.value, 'canCopySelection', 'העתקת הבחירה ללוח'),
);
const cutTooltip = computed(() =>
  tooltipFor(
    canCut.value,
    canCopy.value ? 'canDeleteSelection' : 'canCopySelection',
    'גזירת הבחירה ללוח',
  ),
);
const pasteTooltip = computed(() =>
  tooltipFor(canPaste.value, 'canPasteContent', 'הדבקת תוכן מהלוח'),
);
const selectAllTooltip = computed(() =>
  tooltipFor(canSelectAll.value, 'canResolveRange', 'בחירת כל הטקסט במסמך'),
);

async function doCopy(): Promise<void> {
  report(await copySelection(superdoc.value), 'clipboard-copy');
}

async function doCut(): Promise<void> {
  report(await cutSelection(superdoc.value), 'clipboard-cut');
}

async function doPaste(): Promise<void> {
  report(await pasteFromClipboard(superdoc.value), 'clipboard-paste');
}

async function doSelectAll(): Promise<void> {
  report(await selectWholeDocument(superdoc.value), 'select-all');
}

/* ------------------------------------------------------------------ */
/* כתב עליון וכתב תחתי                                                 */
/* ------------------------------------------------------------------ */

/**
 * שני הפקדים היו `:disabled="true"` קשיח עם tooltip שהאשים את המנוע („אינו
 * נתמך במנוע הנוכחי”). הטענה לא הייתה נכונה: `format.vertAlign` הוא פעולה
 * ציבורית בקטלוג, ומה שחסר היה פקודה ברצועה. הם עוברים מעכשיו ב-Document API,
 * בדיוק כמו פעולות הלוח שמעל — ההסבר המלא, כולל למה אין כאן חיווי „דלוק”,
 * ב-engine/vert-align.ts.
 *
 * זמינות נפרדת מזו של הלוח: היא נשענת גם על נוכחות `doc.format.vertAlign`
 * בפאסדה ולא רק על מפת היכולות, וזו בדיקה שהדוח הכללי אינו עושה.
 */
const vertAlign = shallowRef<VertAlignSupport>({ available: false, explanation: 'המסמך עדיין נטען' });

/** ראו למעלה: תשובה של מסמך קודם לא תדרוס את הנוכחי. */
let vertAlignGeneration = 0;

watch(
  superdoc,
  async (host) => {
    const mine = ++vertAlignGeneration;
    vertAlign.value = { available: false, explanation: 'המסמך עדיין נטען' };
    const support = await readVertAlignSupport(host);
    if (mine === vertAlignGeneration) vertAlign.value = support;
  },
  { immediate: true }
);

const canSetVertAlign = computed(() => vertAlign.value.available);

const VERT_ALIGN_TEXT: Record<VertAlignKind, string> = {
  // התווית אומרת בדיוק מה הלחיצה עושה: היא מחילה על **הטקסט המסומן**, והיא
  // מכבה בלחיצה שנייה. שני הדברים הם ההתנהגות שנמדדה, ולא הבטחה.
  superscript: 'הרמת הטקסט המסומן לכתב עליון; לחיצה נוספת מחזירה אותו לשורה',
  subscript: 'הנמכת הטקסט המסומן לכתב תחתי; לחיצה נוספת מחזירה אותו לשורה',
};

function vertAlignTooltip(kind: VertAlignKind): string {
  if (canSetVertAlign.value) return VERT_ALIGN_TEXT[kind];
  return vertAlign.value.explanation || 'המסמך עדיין נטען';
}

async function onVertAlign(kind: VertAlignKind): Promise<void> {
  report(await toggleVertAlign(superdoc.value, kind), `vert-align-${kind}`);
}

/* ------------------------------------------------------------------ */
/* תפריט פסקה                                                          */
/* ------------------------------------------------------------------ */

/**
 * דיאלוג „פסקה” — כניסות, ריווח, אפשרויות שמירה וטאבים, דרך
 * `doc.format.paragraph.*` (engine/paragraph-format.ts). אין לזה פקודה בקטלוג,
 * ולכן המסלול הוא Document API — אותו דפוס של פעולות הלוח מעל.
 *
 * `paraInFlight` הוא TOCTOU-lock ולא נוחות: הדיאלוג נפתח על **תצלום** מצב
 * הפסקה (`readParagraphFormat`), ושלושת סעיפי „אישור” כותבים מצב מלא. פעולה
 * שנייה שתיקלט בזמן שהראשונה באוויר הייתה כותבת על תצלום מיושן.
 */
const paragraphOpen = shallowRef(false);
const paraInFlight = shallowRef(false);
/** יעד הפסקה שהתצלום נלקח ממנו; כל פעולת „אישור” חוזרת אליו. */
let paraTarget: unknown = null;
const paraSnapshot = shallowRef(emptyParagraphFormat());

const tabsEnabled = computed(() => capabilities.value?.can('canManageParagraphTabs') ?? false);

async function runParagraph(action: () => Promise<void>): Promise<void> {
  if (paraInFlight.value) return;
  paraInFlight.value = true;
  try {
    await action();
  } finally {
    paraInFlight.value = false;
  }
}

/**
 * קוראת את מצב הפסקה ואז פותחת — בדיוק `openWithState` של LayoutTab:
 * דיאלוג שנפתח ריק וממלא את עצמו כעבור tick הוא דיאלוג שהמשתמש עשוי לאשר
 * לפני שהוא מלא. כשל קריאה מסביר ולא פותח דיאלוג על ערכים ריקים.
 */
async function onOpenParagraph(): Promise<void> {
  if (paraInFlight.value) return;
  paraInFlight.value = true;
  try {
    const result = await readParagraphFormat(superdoc.value);
    if (!result.ok) {
      report(result.outcome, 'paragraph-open');
      return;
    }
    paraTarget = result.target;
    paraSnapshot.value = result.snapshot;
    paragraphOpen.value = true;
  } finally {
    paraInFlight.value = false;
  }
}

function onParagraphSubmit(payload: {
  leftCm: number;
  rightCm: number;
  special: 'none' | 'firstLine' | 'hanging';
  amountCm: number;
  beforePt: number;
  afterPt: number;
  lineTwips: number;
  lineRule: 'auto' | 'exact' | 'atLeast';
  keepNext: boolean;
  keepLines: boolean;
  widowControl: boolean;
}): void {
  paragraphOpen.value = false;
  const target = paraTarget;
  // המרת היחידות כאן ולא בדיאלוג: engine/paragraph-format.ts הוא המקום היחיד
  // שמכיר את שתי המערכות (cm/pt אצל המשתמש, twips ב-API).
  const indentation = {
    leftTwips: Math.round(payload.leftCm * TWIPS_PER_CM),
    rightTwips: Math.round(payload.rightCm * TWIPS_PER_CM),
    special: payload.special,
    amountTwips: Math.round(payload.amountCm * TWIPS_PER_CM),
  };
  const spacing = {
    beforeTwips: Math.round(payload.beforePt * TWIPS_PER_PT),
    afterTwips: Math.round(payload.afterPt * TWIPS_PER_PT),
    lineTwips: payload.lineTwips,
    rule: payload.lineRule,
  };
  const keep = {
    keepNext: payload.keepNext,
    keepLines: payload.keepLines,
    widowControl: payload.widowControl,
  };
  void runParagraph(async () => {
    // שלוש פעולות על אותו pPr; כשל אחד אינו מבטל את האחרים, וכל אחת מדווחת
    // בפני עצמה — NO_OP כבר מטופל בתוך המודול.
    const outcomes = [
      await applyParagraphIndentation(superdoc.value, target, indentation),
      await applyParagraphSpacing(superdoc.value, target, spacing),
      await applyParagraphKeepOptions(superdoc.value, target, keep),
    ];
    for (const [index, outcome] of outcomes.entries()) {
      if (!outcome.ok) {
        report(outcome, ['paragraph-indent', 'paragraph-spacing', 'paragraph-keep'][index]);
        return;
      }
    }
    report({ ok: true }, 'paragraph-format');
  });
}

function onParagraphTabAdd(tab: {
  positionTwips: number;
  alignment: 'left' | 'center' | 'right' | 'decimal' | 'bar';
  leader?: string;
}): void {
  void runParagraph(async () => {
    // ה-leader מגיע מה-select של הדיאלוג עם ערכי ה-union בלבד; ההיצמדות
    // ל-union נבדקת שוב בתוך המודול.
    const outcome = await addParagraphTabStop(superdoc.value, paraTarget, tab as TabStop);
    report(outcome, 'paragraph-tab-add');
  });
}

function onParagraphTabRemove(payload: { positionTwips: number }): void {
  void runParagraph(async () => {
    const outcome = await removeParagraphTabStop(superdoc.value, paraTarget, payload.positionTwips);
    report(outcome, 'paragraph-tab-remove');
  });
}

function onParagraphTabsClear(): void {
  void runParagraph(async () => {
    const outcome = await clearAllParagraphTabStops(superdoc.value, paraTarget);
    report(outcome, 'paragraph-tabs-clear');
  });
}

/* ------------------------------------------------------------------ */
/* גופן מתקדם                                                          */
/* ------------------------------------------------------------------ */

/**
 * דיאלוג „גופן מתקדם" — קריאה אחת ל-`format.apply` (engine/font-advanced.ts).
 * אין לו פקודה ב-registry, ולכן המסלול הוא Document API — כמו פעולות הלוח
 * ותפריט הפסקה מעל.
 */
const fontAdvOpen = shallowRef(false);
const fontAdvInFlight = shallowRef(false);

function onOpenFontAdvanced(): void {
  // אין קריאת מצב לפני הפתיחה: format.apply הוא patch לפי מפתח, ואין
  // קריאה ציבורית של עיצוב ריצות בבחירה (ראו vert-align.ts). הדיאלוג
  // נפתח על „ללא שינוי" ושולח רק מה שהמשתמש מילא.
  if (fontAdvInFlight.value) return;
  fontAdvOpen.value = true;
}

function onFontAdvancedSubmit(patch: FontAdvancedPatch): void {
  fontAdvOpen.value = false;
  if (fontAdvInFlight.value) return;
  fontAdvInFlight.value = true;
  void (async () => {
    try {
      report(await applyFontAdvanced(superdoc.value, patch), 'font-advanced');
    } finally {
      fontAdvInFlight.value = false;
    }
  })();
}

/* ------------------------------------------------------------------ */
/* רשימה (גל 14א)                                                      */
/* ------------------------------------------------------------------ */

/**
 * פעולות רשימה שאין להן פקודה בקטלוג: המספור העברי (hebrew1 — נמדד),
 * התחלה מחדש, המשך מספור קודם, והמרה לטקסט. `listsInFlight` הוא נעילת
 * TOCTOU: `canContinuePrevious` בוליאני ואין לסמוך עליו בין קריאות.
 */
const listsInFlight = shallowRef(false);

/** אישור דו-לחיצה ל„המר לטקסט" — בלתי-הפיך (נמדד: הסמן מועתק לטקסט). */
const convertArmed = shallowRef(false);

const listsAvailable = computed(() => capabilities.value?.can('canManageLists') ?? false);

/**
 * סדר סגנונות המספור בתפריט — עברי ראשון.
 *
 * `NUMBER_STYLE_LABELS` הוא מפה, וסדר ההכנסה שלה הוא סדר ה-`numFmt` של
 * ECMA-376: `decimal` בראש ו-`hebrew1` שישי. זה הסדר הנכון למי שקורא את
 * התקן, ולא למי שכותב כאן מסמך — ולכן הסדר לתצוגה נכתב במפורש, ואינו נגזר
 * מסדר המפה. `bullet` אינו כאן: הוא התפריט של „תבליטים”, לא של „מספור”.
 */
const NUMBER_STYLE_ORDER = [
  'hebrew1',
  'hebrew2',
  'decimal',
  'upperLetter',
  'lowerLetter',
  'upperRoman',
  'lowerRoman',
] as const;

/** „המר לטקסט” — אותו פריט בשני התפריטים, כולל מצב החימוש. */
const convertItem = computed(() => ({
  id: 'convert',
  label: convertArmed.value ? 'לחץ שוב לאישור — הפעולה בלתי-הפיכה' : 'המר לטקסט…',
}));

const numberMenuItems = computed(() => [
  ...NUMBER_STYLE_ORDER.map((id) => ({ id: `style:${id}`, label: NUMBER_STYLE_LABELS[id] })),
  { id: 'restart', label: 'התחל מחדש מ-1' },
  { id: 'continue', label: 'המשך מספור קודם' },
  convertItem.value,
]);

/**
 * התפריט של „תבליטים”. `to-bullets` אינו כפילות של הכפתור שמעליו: הכפתור
 * מחיל רשימה על פסקאות, וזה מחליף את סגנון הסמן של רשימה **קיימת** — כלומר
 * הדרך להפוך רשימה ממוספרת לתבליטים בלי לפרק אותה ולבנות מחדש. לכן הוא אינו
 * מקבל `createList` ב-`onListMenuSelect`, בשונה מסגנוני המספור: על פסקה רגילה
 * הוא מסרב ואינו נוגע במסמך.
 */
const bulletMenuItems = computed(() => [
  { id: 'to-bullets', label: 'הפוך רשימה ממוספרת לתבליטים' },
  convertItem.value,
]);

/**
 * שורת ההסבר בטולטיפ של חץ התפריט — מה יש בו, ובמצב מנוטרל למה אין. השם
 * עצמו („פעולות תבליטים” / „פעולות מספור”) קבוע ואינו מתחלף בין המצבים: הוא
 * גם השם הנגיש של החץ, וגם הידית שבה שערי ה-QA מאתרים אותו.
 */
function listsMenuHint(available: string): string {
  if (listsAvailable.value) return available;
  return capabilities.value?.explain('canManageLists') || 'המסמך עדיין נטען';
}

const bulletMenuHint = computed(() =>
  listsMenuHint('החלפת רשימה ממוספרת לתבליטים, והמרה לטקסט'),
);

const numberMenuHint = computed(() =>
  listsMenuHint('סגנון מספור (כולל עברי), התחלה מחדש והמרה לטקסט'),
);

async function runList(action: () => Promise<CommandOutcome>): Promise<void> {
  if (listsInFlight.value) return;
  listsInFlight.value = true;
  try {
    report(await action(), 'lists');
  } finally {
    listsInFlight.value = false;
  }
}

function onListMenuSelect(id: string): void {
  // כל פעולה שאינה „המר לטקסט” מנטרלת את החימוש שלו: המשתמש עשה משהו אחר
  // בינתיים, ולחיצה הבאה על „המר” חייבת להיות שוב לחיצה ראשונה.
  if (id !== 'convert') convertArmed.value = false;

  if (id.startsWith('style:')) {
    const style = id.slice('style:'.length);
    // סגנון מספור על פסקה שאינה רשימה ממספר אותה קודם (issue #14 ג׳). ראו
    // `SetNumberStyleOptions.createList` ב-engine/lists.ts.
    void runList(() => setListNumberStyle(superdoc.value, style, { createList: numberedCmd.run }));
    return;
  }

  if (id === 'to-bullets') {
    void runList(() => setListToBullets(superdoc.value));
    return;
  }

  if (id === 'restart') {
    void runList(() => restartListAt(superdoc.value, 1));
    return;
  }

  if (id === 'continue') {
    void runList(() => continuePreviousList(superdoc.value));
    return;
  }

  if (id === 'convert') {
    // אישור דו-לחיצה: הפעולה בלתי-הפיכה (נמדד). לחיצה ראשונה חומשת,
    // שנייה מבצעת. כל בחירה אחרת בדרך מנטרלת (ראו למעלה) — אחרת „המר
    // לטקסט” היה נשאר חמוש בשני התפריטים עד סוף החיים של הלשונית.
    if (!convertArmed.value) {
      convertArmed.value = true;
      return;
    }
    convertArmed.value = false;
    void runList(() => convertListToText(superdoc.value));
  }
}
</script>

<style scoped>
.ribbon-tab-pane {
  display: flex;
  align-items: stretch;
  gap: 0;
  height: 100%;
  width: 100%;
}
</style>
