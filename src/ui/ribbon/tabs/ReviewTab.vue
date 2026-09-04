<template>
  <div class="ribbon-tab-pane review-tab">
    <!-- הגהה -->
    <RibbonGroup title="הגהה">
      <RibbonButton
        icon="proofing"
        label="בדיקת איות"
        variant="large"
        :tooltip="spellcheckTooltip"
        :active="spellcheck.enabled.value"
        :disabled="spellcheck.busy.value"
        @pointerdown.prevent
        @click="spellcheck.toggle()"
      />
    </RibbonGroup>

    <!-- תגובות -->
    <RibbonGroup title="תגובות">
      <RibbonButton
        icon="comment"
        label="תגובה חדשה"
        variant="large"
        tooltip="הוספת תגובה — תתווסף בשלב הבא, יחד עם זהות המחבר ופאנל התגובות"
        :disabled="true"
      />
    </RibbonGroup>

    <!-- הגנת מסמך (גל 19) -->
    <RibbonGroup title="הגנה">
      <RibbonButton
        icon="proofing"
        label="הגבל עריכה"
        variant="large"
        :tooltip="protectionTooltip"
        :disabled="protectionInFlight"
        @pointerdown.prevent
        @click="onToggleProtection"
      />
    </RibbonGroup>


    <!-- מעקב -->
    <RibbonGroup title="מעקב אחר שינויים">
      <RibbonButton
        icon="trackChanges"
        label="עקוב אחר שינויים"
        shortcut-id="track-changes"
        variant="large"
        :tooltip="isSuggesting ? 'כיבוי מצב מעקב אחר שינויים' : 'הפעלת מצב מעקב אחר שינויים במסמך'"
        :active="isSuggesting"
        :disabled="!modeCmd.enabled.value"
        @click="onToggleTrackChanges"
      />
    </RibbonGroup>

    <!--
      „שינויים”. שני הפקדים על השינוי הנוכחי גדולים, ושני פקדי „הכל” במחסנית
      לצידם — הצורה של Word, שם „קבל” ו„דחה” הם שני כפתורים גדולים ווריאנטי
      „הכל” יושבים בתפריט שמתחתם.

      זו גם הקבוצה שבגללה כל הרצועה קפצה: היא החזיקה מחסנית של **ארבעה**
      כפתורים קטנים (102px), הרצועה כאן יצאה 126px מול 96px בכל שאר הלשוניות,
      והמסמך זז 30px בכל כניסה ויציאה מהלשונית. ארבעה בעמודה אחת גם לא היה
      קריא: „קבל/דחה/קבל הכל/דחה הכל” הוא סולם, ולא שני צמדים.
    -->
    <RibbonGroup title="שינויים">
      <RibbonButton
        icon="accept"
        label="קבל שינוי"
        variant="large"
        tooltip="קבלת השינוי הנוכחי"
        :disabled="!acceptCmd.enabled.value"
        @click="acceptCmd.run()"
      />
      <RibbonButton
        icon="reject"
        label="דחה שינוי"
        variant="large"
        tooltip="דחיית השינוי הנוכחי"
        :disabled="!rejectCmd.enabled.value"
        @click="rejectCmd.run()"
      />
      <RibbonStack>
        <RibbonButton
          icon="accept"
          label="קבל את כל השינויים"
          variant="small"
          tooltip="קבלת כל השינויים במסמך"
          :disabled="!acceptAllCmd.enabled.value"
          @click="acceptAllCmd.run()"
        />
        <RibbonButton
          icon="reject"
          label="דחה את כל השינויים"
          variant="small"
          tooltip="דחיית כל השינויים במסמך"
          :disabled="!rejectAllCmd.enabled.value"
          @click="rejectAllCmd.run()"
        />
      </RibbonStack>
    </RibbonGroup>
  </div>
</template>

<script setup lang="ts">
/**
 * „סקירה”.
 *
 * **„עקוב אחר שינויים” הוא מצב המסמך.** ב-v2 אין פקודת „track changes on/off”
 * נפרדת: `document-mode` עם `'suggesting'` *הוא* מצב המעקב, וזו הפקודה
 * שה-registry שלנו כבר מכיל. שני דברים שנמדדו בקטלוג של המנוע וקובעים את
 * המימוש כאן:
 *   - הפקודה מנותבת דרך `instanceRoute: setDocumentMode`, והמצב שלה מדווח
 *     `active: false` **תמיד** — `chromeActiveState` מחזיר `false` לכל מה שאינו
 *     סרגל או סימני עיצוב. המצב הדלוק נלקח לכן מ-`value`, שנושא את המצב
 *     הנוכחי של המסמך, ולא מ-state מקומי שיצא מסינכרון ברגע שמישהו אחר משנה
 *     את המצב.
 *   - ה-payload מנורמל: מחרוזת או `{ mode }`. נשלח `{ mode }` כדי שיהיה מפורש.
 *
 * מסמך במצב `viewing` יעבור ב-toggle ל-`suggesting`, כלומר גם ייצא מצפייה
 * בלבד. זה מכוון: המשתמש ביקש להתחיל לעקוב אחר שינויים.
 *
 * **„הגבל עריכה" (למטה) כותב לאותו `document-mode` בדיוק** — היא זו שמעבירה
 * אותו ל-`'viewing'` כדי לחסום קלט בפועל (ראו engine/protection.ts). מסמך
 * שהיה ב-`suggesting` ואז הוגן ייראה כאן `isSuggesting: false` (המסמך ב-
 * `viewing`, לא ב-`suggesting`) — וזה נכון: אי אפשר גם לחסום קלט וגם להשאיר
 * מעקב פעיל. הביטול משחזר את `'suggesting'`, לא רק את `enforced`.
 *
 * **„בדיקת איות” היא מתג של שכבת התצוגה שלנו, לא פקודת מנוע.** אין למנוע
 * פקודת איות ואין לו decorations שמותר לנו לקרוא להם, ולכן הסימון הוא שכבה
 * מעל המסמך (ui/shell/SpellingOverlay.vue) והמצב מגיע מ-`SPELLCHECK`
 * (composables/keys.ts) ולא מ-`useCommand`. הלחיצה הראשונה גם **מושכת את
 * המילון** — נכס נפרד של 1.3MB (issue #25, engine/spellcheck-dictionary.ts) —
 * ולכן `busy` מנטרל את הכפתור בזמן הטעינה במקום להשאיר אותו נראה-מת. הקיצור
 * `F7` שהוצג כאן פעם לא היה רשום בשום מקום והוסר.
 *
 * **„תגובה חדשה” מנוטרלת במפורש, ולא כפתור מת:** היא דורשת טקסט תגובה
 * **וזהות מחבר קבועה מהגדרת משתמש מקומית** (§13.1). זהות המשתמש אינה קיימת
 * עדיין בהגדרות, ותגובה בלי מחבר אינה תגובה. חצי מימוש כאן היה יוצר מערכת
 * תגובות מקבילה — בדיוק מה שהתכנית אוסרת.
 */
import { computed, inject, ref, shallowRef, watch } from 'vue';
import RibbonGroup from '../common/RibbonGroup.vue';
import RibbonStack from '../common/RibbonStack.vue';
import RibbonButton from '../common/RibbonButton.vue';
import { useCommand } from '../../../composables/useCommand';
import {
  disableProtection,
  enableReadOnlyProtection,
  syncProtectionRuntime,
} from '../../../engine/protection';
import { ACTIVE_SUPERDOC } from '../../../engine/document-api';
import {
  COMMAND_ADAPTER,
  COMMAND_REPORTER,
  SPELLCHECK,
  type CommandReporter,
  type SpellcheckHandle,
} from '../../../composables/keys';

const acceptCmd = useCommand('acceptChange');
const rejectCmd = useCommand('rejectChange');
const acceptAllCmd = useCommand('acceptAllChanges');
const rejectAllCmd = useCommand('rejectAllChanges');
const modeCmd = useCommand('document-mode');

const isSuggesting = computed(() => modeCmd.value.value === 'suggesting');

/* ------------------------------------------------------------------ */
/* בדיקת איות תורנית                                                   */
/* ------------------------------------------------------------------ */

/** ברירת מחדל מנוטרלת: בהרכבת רכיב בלי המעטפת הכפתור פשוט אינו עושה כלום. */
const spellcheckFallback: SpellcheckHandle = {
  enabled: ref(false),
  busy: ref(false),
  toggle: () => {},
};
const spellcheck = inject(SPELLCHECK, spellcheckFallback);

const spellcheckTooltip = computed(() => {
  if (spellcheck.busy.value) return 'טוען את המילון התורני…';
  return spellcheck.enabled.value
    ? 'כיבוי בדיקת האיות התורנית'
    : 'סימון מילים שאינן במילון התורני. לחיצה ימנית על מילה מסומנת מאפשרת להוסיף אותה למילון';
});

/* ------------------------------------------------------------------ */
/* הגנת מסמך (גל 19)                                                   */
/* ------------------------------------------------------------------ */

/**
 * „הגבל עריכה" — מתג הפעלה/ביטול של קריאה-בלבד, דרך `protection.*`
 * (engine/protection.ts). כתיבת ה-XML (`setEditingRestriction`/
 * `clearEditingRestriction`) אינה מספיקה לחסימה בפועל: המנוע שוער קלט
 * ופקודות לפי `document-mode === 'viewing'` בלבד, ולכן `engine/protection.ts`
 * מעביר גם אותו, יחד עם ה-XML — ראו הערת הראש שם. מסלול הביטול נמדד **לפני**
 * ההפעלה ועובד בלי סיסמה; אחרי ההפעלה 4 יכולות נופלות ל-false — ולכן
 * ה-tooltip אומר במדויק מה יקרה, ואישור דו-לחיצה לפני הנעילה.
 *
 * `modeBeforeProtection` שומר את מצב המסמך (`'editing'`/`'suggesting'`) כפי
 * שהיה **לפני** שההפעלה כפתה `'viewing'`, כדי שהביטול ישחזר אותו במדויק:
 * מסמך שהיה במעקב שינויים לא אמור לצאת ממנו רק בגלל שהוגן ואז שוחרר.
 */
const superdoc = inject(ACTIVE_SUPERDOC, shallowRef(null));
const commands = inject(COMMAND_ADAPTER, ref(null));
const fallbackReporter: CommandReporter = (outcome, id) => {
  if (!outcome.ok) console.warn(`[otzaria-word] ${id}: ${outcome.message}`);
};
const report = inject(COMMAND_REPORTER, fallbackReporter);

/** מצב מקומי; המנוע הוא מקור האמת בכל קריאת get. */
const protectionEnforced = ref(false);
const protectionInFlight = ref(false);
const protectionConfirm = ref(false);
const modeBeforeProtection = ref<string | null>(null);
let protectionGeneration = 0;

watch(
  superdoc,
  async (host) => {
    const mine = ++protectionGeneration;
    // מסמך חדש: אין זיכרון של מצב קודם, ואם הוא נטען כשהוא כבר מוגן —
    // syncProtectionRuntime הוא זה שכופה 'viewing' בפועל ולא רק מציג מנעול.
    const state = await syncProtectionRuntime(host, commands.value);
    if (mine !== protectionGeneration || !state) return;
    protectionEnforced.value = state.enforced;
    modeBeforeProtection.value = null;
  },
  { immediate: true },
);

const protectionTooltip = computed(() => {
  if (protectionInFlight.value) return 'הפעולה מתבצעת…';
  if (protectionConfirm.value) return 'לחץ שוב לאישור: המסמך יינעל לקריאה בלבד (ניתן לביטול מכאן)';
  if (protectionEnforced.value) {
    return modeBeforeProtection.value === 'suggesting'
      ? 'ביטול ההגבלה — המסמך יחזור למצב מעקב אחר שינויים'
      : 'ביטול ההגבלה — המסמך יחזור לעריכה מלאה';
  }
  return 'הצג את המסמך במצב „קריאה בלבד". ניתן לבטל מכאן בכל עת.';
});

async function syncProtectionEnforced(): Promise<void> {
  const mine = ++protectionGeneration;
  const state = await syncProtectionRuntime(superdoc.value, commands.value);
  if (mine === protectionGeneration && state) protectionEnforced.value = state.enforced;
}

async function onToggleProtection(): Promise<void> {
  if (protectionInFlight.value) return;

  // „המר לטקסט" של הרשימות חימש דו-לחיצה; כאן אותו עיקרון לנעילה.
  if (!protectionEnforced.value && !protectionConfirm.value) {
    protectionConfirm.value = true;
    return;
  }
  protectionConfirm.value = false;

  protectionInFlight.value = true;
  try {
    if (protectionEnforced.value) {
      const restoreMode = modeBeforeProtection.value ?? 'editing';
      const outcome = await disableProtection(superdoc.value, commands.value, restoreMode);
      report(outcome, 'protection-toggle');
      if (outcome.ok) {
        modeBeforeProtection.value = null;
        await syncProtectionEnforced();
      }
    } else {
      const outcome = await enableReadOnlyProtection(superdoc.value, commands.value);
      report(outcome, 'protection-toggle');
      if (outcome.ok) {
        modeBeforeProtection.value = outcome.previousMode;
        await syncProtectionEnforced();
      }
    }
  } finally {
    protectionInFlight.value = false;
  }
}

/** `run` של ה-composable כבר מדווח כשל למשתמש; אין כאן טיפול שני. */
function onToggleTrackChanges(): void {
  void modeCmd.run({ mode: isSuggesting.value ? 'editing' : 'suggesting' });
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
