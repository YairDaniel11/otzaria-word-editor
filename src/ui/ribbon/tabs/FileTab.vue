<template>
  <div class="ribbon-tab-pane file-tab">
    <RibbonGroup title="קובץ ומסמך">
      <RibbonButton
        icon="newDoc"
        label="מסמך חדש"
        shortcut-id="new-document"
        variant="large"
        :tooltip="switchTooltip('יצירת מסמך Word ריק חדש')"
        :disabled="isSwitchBlocked"
        @click="$emit('new-doc')"
      />
      <RibbonButton
        icon="folder"
        label="פתח קובץ"
        shortcut-id="open-document"
        variant="large"
        :tooltip="switchTooltip('פתיחת מסמך Word (.docx) מהמחשב')"
        :disabled="isSwitchBlocked"
        @click="$emit('open-doc')"
      />
    </RibbonGroup>

    <!--
      שני פקדים **גדולים**, ולא גדול ומחסנית: „שמור” ו„שמור בשם” אינם פעולה
      והווריאנט שלה אלא שני יעדי כתיבה — הקובץ שהמסמך יושב עליו, וקובץ חדש —
      ועל מסמך שטרם נשמר הם אף אותה פעולה בדיוק (בלי יעד, ה-commit פותח את
      דיאלוג „שמור בשם”; ראו sessions/save-coordinator.ts). קבוצה של שני
      גדולים היא גם מה ש„קובץ ומסמך” ו„מידע” כבר עושות בלשונית הזאת.
    -->
    <RibbonGroup title="שמירה">
      <RibbonButton
        icon="save"
        label="שמור"
        variant="large"
        :tooltip="saveTooltip('שמירת שינויים במסמך')"
        shortcut-id="save"
        :disabled="isSaveBlocked"
        @click="$emit('save-doc')"
      />
      <RibbonButton
        icon="saveAs"
        label="שמור בשם..."
        variant="large"
        :tooltip="saveTooltip('שמירת המסמך כקובץ חדש')"
        shortcut-id="save-as"
        :disabled="isSaveBlocked"
        @click="$emit('save-as-doc')"
      />
    </RibbonGroup>

    <!--
      כאן היה „ייצוא ל-Word” כפקד הגדול, והוא הוסר: הוא הוריד עותק `.docx`
      לתיקיית ההורדות דרך `<a download>` — בלי יעד קבוע, בלי לנקות את הדגל
      „לא נשמר”, ובלי שהשמירה האוטומטית נתפסת על העותק. כלומר הוא נראה כמו
      שמירה ולא היה שמירה, ומי שחיפש „להוציא את הקובץ ל-Word” כבר מקבל בדיוק
      את זה מ„שמור בשם”, שכותב `.docx` דרך מסלול הכתיבה של אוצריא.
    -->
    <RibbonGroup title="ייצוא והדפסה">
      <RibbonStack>
        <RibbonButton
          icon="exportPdf"
          label="ייצוא ל-PDF"
          variant="small"
          :tooltip="pdfExportTooltip"
          :disabled="!hasDocument || !hasPdfExport"
          @click="$emit('export-pdf')"
        />
        <RibbonButton
          icon="print"
          label="הדפסה"
          variant="small"
          :tooltip="documentTooltip('הדפסת המסמך')"
          shortcut-id="print"
          :disabled="!hasDocument"
          @click="$emit('print-doc')"
        />
      </RibbonStack>
    </RibbonGroup>

    <RibbonGroup title="יציאה">
      <RibbonButton
        icon="exit"
        label="יציאה"
        variant="large"
        :tooltip="exitTooltip"
        :disabled="isExitBlocked"
        @click="$emit('exit-app')"
      />
    </RibbonGroup>

    <!--
      „מידע” נצמדת לקצה השמאלי של הרצועה, כמו „עזרה” ב-Word: היא אינה שלב
      בזרימת העבודה של הקובץ, ומקומה בקצה קבוע ולא בתור אחרי „יציאה”.

      שני הפקדים נשארים **גדולים** ואינם יורדים למחסנית. הסיבה כתובה כמה
      שורות מכאן: „קיצורים” הוא הרשימה שמי שאינו
      יודע את הקיצורים מחפש, והקטנתו הייתה מרחיקה בדיוק את מה שההערה ההיא
      ביקשה לקרב. קבוצה בת שני פקדים גם אינה צפופה, ואין מה לחסוך בה.
    -->
    <RibbonGroup
      title="מידע"
      end
    >
      <!-- הפקד היחיד בלשונית בלי `:disabled`, ובכוונה: הדיאלוג הוא של התוסף,
           הוא אינו נוגע במסמך ואינו נוגע במנוע, ואין מצב שבו הוא אינו זמין.
           `:disabled="false"` קבוע היה חיווט מדומה — הוא נראה כמו תנאי ואינו
           תנאי. tests/unit/tab-controls.test.ts מקבע את ההחרגה הזאת בשמה. -->
      <RibbonButton
        icon="info"
        label="אודות"
        variant="large"
        tooltip="אודות עורך Word לאוצריא"
        @click="$emit('about')"
      />
      <!-- דיאלוג שמגיעים אליו רק בקיצור הוא דיאלוג שאיש לא ימצא: הוא **כל
           הרשימה** של הקיצורים, כלומר בדיוק מה שמי שאינו יודע אותם מחפש.
           ה-tooltip מציג את הצירוף מהרג'יסטרי, ולכן הכפתור גם מלמד אותו. -->
      <RibbonButton
        icon="book"
        label="קיצורים"
        variant="large"
        tooltip="רשימת קיצורי המקלדת"
        shortcut-id="shortcuts-help"
        @click="$emit('shortcuts-help')"
      />
    </RibbonGroup>
  </div>
</template>

<script setup lang="ts">
/**
 * „קובץ”.
 *
 * ## למה כאן התנאי שונה מכל שאר הלשוניות
 *
 * זו הייתה הלשונית האחרונה בלי `:disabled` על אף פקד (בשאר: 31 ב„בית”, 7
 * ב„סקירה”, 6 ב„אוצריא”, 5 ב„הוספה”, 5 ב„פריסה”, 4 ב„הפניות”, 4 ב„תצוגה”), וזה
 * לא במקרה: הפקדים כאן אינם פקודות מנוע ואינם פעולות Document API, אלא פעולות
 * **מעטפת**. אין להם `CommandState` ואין להם `capabilities` לשאול, ולכן
 * `useCommand` ו-`readDocCapabilities` — שני המסלולים שכל שאר הלשוניות נשענות
 * עליהם — אינם רלוונטיים כאן בכלל.
 *
 * מה שכן קובע הוא שלושה מצבים שהמעטפת מחזיקה: האם יש מסמך פתוח, האם השמירה
 * רצה כרגע, והאם פתיחה רצה כרגע. שלושתם מגיעים כ-props מ-App.vue דרך
 * `Ribbon.vue`.
 *
 * ## למה props ולא inject
 *
 * `provide/inject` היה חוסך את המסירה דרך הרצועה, וזה מה שנעשה ל-
 * `COMMAND_ADAPTER` ול-`ACTIVE_SUPERDOC`. ההבדל: אלה חוזים מול **המנוע**,
 * שמספר קוראים בכמה לשוניות צורכים. מצב המעטפת נצרך בלשונית אחת, והוא בדיוק
 * מה ש-props נועדו לו — מפתח הזרקה חדש בשביל צרכן אחד הוא חיווט סמוי במקום
 * חיווט שאפשר לקרוא.
 *
 * ## התנאי לכל פקד, ומאיפה הוא
 *
 * הם אינם המצאה אלא בדיוק מה ש-App.vue כבר עושה, רק גלוי מראש במקום כשל אחרי
 * לחיצה:
 *
 *   * „מסמך חדש” / „פתח קובץ” — `onPickAndOpen` יוצא מיד כש-`isOpening`,
 *     ו-`decideDocumentSwitch` מחזיר `cancel` עם `reason: 'saving'` בזמן
 *     שמירה („השמירה עוד רצה — רגע אחד”).
 *   * „שמור” / „שמור בשם” — `onSave` יוצא מיד בלי מסמך, ומפעיל הפעולות של
 *     הקיצורים חוסם את Ctrl+S בזמן שמירה. אותו תנאי בדיוק, ולא שני תנאים
 *     לאותה פעולה.
 *   * „ייצוא ל-PDF” / „הדפסה” — שניהם דורשים מסמך פתוח ולא דורשים שהוא יהיה
 *     שמור: שניהם קוראים את מה שמצויר עכשיו. לייצוא ל-PDF יש תנאי נוסף —
 *     `hasPdfExport`, כלומר האם ה-Host מכיר את `ui.exportPdf`.
 */
import { computed } from 'vue';
import RibbonGroup from '../common/RibbonGroup.vue';
import RibbonStack from '../common/RibbonStack.vue';
import RibbonButton from '../common/RibbonButton.vue';

const props = withDefaults(
  defineProps<{
    /** האם יש מסמך פתוח (session חי במנוע). */
    hasDocument?: boolean;
    /** האם סבב שמירה רץ כרגע. */
    isSaving?: boolean;
    /** האם פתיחת מסמך רצה כרגע. */
    isOpening?: boolean;
    /** האם סגירת המסמכים והמעבר לספרייה כבר רצים. */
    isExiting?: boolean;
    /**
     * האם ה-Host מכיר את `ui.exportPdf`.
     *
     * הפקד מנוטרל כשאין — התוסף רץ גם מחוץ לאוצריא (`host/dev-stub.ts`), וגם
     * בתוך גרסה ישנה יותר ממנה: `ui.exportPdf` נוסף ב-0.9.97. כפתור שנלחץ
     * ומחזיר „הפעולה אינה מוכרת” גרוע מכפתור מנוטרל שהטולטיפ שלו מסביר.
     */
    hasPdfExport?: boolean;
  }>(),
  {
    // ברירת המחדל היא „אין מסמך ואין פעולה שרצה”, כלומר המצב לפני שהמעטפת
    // פתחה משהו. נכשלת סגור: לשונית שהורכבה בלי מידע אינה מציעה לשמור מסמך
    // שאינה יודעת עליו דבר.
    hasDocument: false,
    isSaving: false,
    isOpening: false,
    isExiting: false,
    hasPdfExport: false,
  },
);

defineEmits<{
  (e: 'new-doc'): void;
  (e: 'open-doc'): void;
  (e: 'save-doc'): void;
  (e: 'save-as-doc'): void;
  (e: 'print-doc'): void;
  (e: 'export-pdf'): void;
  (e: 'about'): void;
  (e: 'shortcuts-help'): void;
  (e: 'exit-app'): void;
}>();

/** מעבר מסמך — חדש או פתיחה. אינו דורש מסמך פתוח, אבל כן שקט מסביב. */
const isSwitchBlocked = computed(() => props.isOpening || props.isSaving);
/** „יציאה” אינה יכולה להתחיל שוב לפני שהניסיון הקודם הוכרע. */
const isExitBlocked = computed(() => isSwitchBlocked.value || props.isExiting);

const isSaveBlocked = computed(() => !props.hasDocument || props.isSaving);

const NO_DOCUMENT = 'אין מסמך פתוח';
const SAVING_NOW = 'השמירה רצה כרגע — רגע אחד';
const OPENING_NOW = 'פתיחת מסמך רצה כרגע';
const EXITING_NOW = 'סגירת המסמכים רצה כרגע — רגע אחד';

/** ה-tooltip אומר **למה** הפקד מנוטרל, ולא חוזר על התווית. */
function switchTooltip(enabledText: string): string {
  if (props.isOpening) return OPENING_NOW;
  if (props.isSaving) return SAVING_NOW;
  return enabledText;
}

function saveTooltip(enabledText: string): string {
  if (!props.hasDocument) return NO_DOCUMENT;
  if (props.isSaving) return SAVING_NOW;
  return enabledText;
}

function documentTooltip(enabledText: string): string {
  return props.hasDocument ? enabledText : NO_DOCUMENT;
}

/**
 * שני טעמים שונים לנטרול, ולכן שני נוסחים: „אין מסמך” הוא זמני ומוכר,
 * ו„אין תמיכה ב-Host” הוא קבוע ואינו באשמת המשתמש — הוא צריך לדעת שאין טעם
 * ללחוץ שוב, ולמה.
 */
const pdfExportTooltip = computed(() => {
  if (!props.hasDocument) return NO_DOCUMENT;
  if (!props.hasPdfExport) return 'ייצוא ל-PDF דורש גרסה עדכנית יותר של אוצריא';
  return 'שמירת המסמך כקובץ PDF';
});

/**
 * „יציאה” אינו דורש מסמך פתוח — יציאה ממסך שאין בו מסמך היא בקשה תקפה — אבל
 * הוא כן דורש שקט מסביב, ולכן `isSwitchBlocked` כמו „מסמך חדש” ו„פתח קובץ”:
 * בזמן שמירה השאלה „לשמור לפני יציאה?” הייתה מציעה שמירה שנייה על מה שנשמר
 * כרגע, ובזמן פתיחה היציאה סוגרת מסמך שנטען לתוכו ברגע זה ממש.
 *
 * ה-tooltip אומר גם מה הכפתור עושה, כי „יציאה” מלשונית בתוך אוצריא אינו מובן
 * מאליו — ומאז שהיא סוגרת, זה גם ההבדל בינה לבין „פתח ספרייה” בלשונית
 * „אוצריא”, שהוא ניווט בלבד. הנוסח נמדד מול ההתנהגות: כל עוד היציאה לא סגרה,
 * כתוב כאן „המסמך יישאר פתוח” בעוד הלחיצה שאלה „לצאת בלי לשמור?”.
 */
const exitTooltip = computed(() => {
  if (props.isExiting) return EXITING_NOW;
  if (props.isOpening) return OPENING_NOW;
  if (props.isSaving) return SAVING_NOW;
  return 'סגירת המסמך וחזרה למסך הספרייה של אוצריא';
});
</script>

<style scoped>
/* `width: 100%` אינו קישוט: בלעדיו הפאנל מתכווץ לרוחב תוכנו, אין מרווח פנוי,
   ו-`margin-inline-start: auto` של קבוצת „מידע” אינו בולע דבר — ההצמדה לקצה
   פשוט אינה קורית. ראו `.word-ribbon-group--end` ב-ribbon.css. */
.ribbon-tab-pane {
  display: flex;
  align-items: stretch;
  gap: 0;
  height: 100%;
  width: 100%;
}
</style>
