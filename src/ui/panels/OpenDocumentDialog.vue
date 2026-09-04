<template>
  <div
    v-if="isOpen"
    class="modal-backdrop"
    @click.self="$emit('close')"
  >
    <div
      ref="dialogRef"
      class="open-dialog"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="TITLE_ID"
      :aria-busy="busy"
      tabindex="-1"
      @keydown.esc.stop="$emit('close')"
      @keydown.tab="onTab"
    >
      <!-- כותרת -->
      <div class="open-header">
        <div class="open-header__title">
          <SvgIcon
            name="folder"
            :size="20"
            class="open-header__icon"
          />
          <span :id="TITLE_ID">פתח מסמך</span>
        </div>
        <button
          type="button"
          class="open-close-btn"
          data-tip-title="סגור"
          data-tip-shortcut="Esc"
          aria-label="סגור את חלון פתיחת המסמך"
          @click="$emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="open-body">
        <!-- מסמך חדש -->
        <section
          class="tpl-section"
          :aria-labelledby="TPL_TITLE_ID"
        >
          <h3
            :id="TPL_TITLE_ID"
            class="section-title"
          >
            מסמך חדש
          </h3>
          <div
            class="tpl-grid"
            role="toolbar"
            aria-orientation="horizontal"
            :aria-labelledby="TPL_TITLE_ID"
            @keydown="onCardKeydown"
          >
            <button
              v-for="(template, index) in templates"
              :key="template.id"
              :ref="(el) => setCardRef(el, index)"
              type="button"
              class="tpl-card"
              :disabled="busy"
              :tabindex="index === activeCard ? 0 : -1"
              :aria-describedby="describedBy(template)"
              :data-tip-title="template.label"
              :data-tip-desc="tipDescription(template)"
              @focus="activeCard = index"
              @click="$emit('create-from-template', template.id)"
            >
              <svg
                class="tpl-sheet"
                viewBox="-2 -2 214 301"
                aria-hidden="true"
                focusable="false"
              >
                <g
                  v-if="sheetOf(template).scaled"
                  transform="translate(31 43.8) scale(0.704762)"
                >
                  <rect
                    v-for="(shape, i) in sheetOf(template).rects"
                    :key="`r${i}`"
                    :class="shape.strong ? 'pv-ink pv-ink--strong' : shape.sheet ? 'pv-sheet' : 'pv-ink'"
                    :x="shape.x"
                    :y="shape.y"
                    :width="shape.width"
                    :height="shape.height"
                  />
                  <line
                    v-for="(shape, i) in sheetOf(template).lines"
                    :key="`l${i}`"
                    class="pv-rule"
                    :x1="shape.x1"
                    :y1="shape.y1"
                    :x2="shape.x2"
                    :y2="shape.y2"
                  />
                </g>
                <template v-else>
                  <rect
                    v-for="(shape, i) in sheetOf(template).rects"
                    :key="`r${i}`"
                    :class="shape.strong ? 'pv-ink pv-ink--strong' : shape.sheet ? 'pv-sheet' : 'pv-ink'"
                    :x="shape.x"
                    :y="shape.y"
                    :width="shape.width"
                    :height="shape.height"
                  />
                  <line
                    v-for="(shape, i) in sheetOf(template).lines"
                    :key="`l${i}`"
                    class="pv-rule"
                    :x1="shape.x1"
                    :y1="shape.y1"
                    :x2="shape.x2"
                    :y2="shape.y2"
                  />
                </template>
              </svg>
              <span class="tpl-label">{{ template.label }}</span>
            </button>
          </div>

          <!--
            התיאורים חיים **מחוץ** לכפתורים, ובכוונה: טקסט בתוך הכפתור נספר
            לתוך השם הנגיש שלו גם כשהוא מוסתר ויזואלית, ואז „ספר קודש — שני
            טורים” היה נקרא כשם בן עשרים מילה. כאן הם יעד של `aria-describedby`
            בלבד, והם המקבילה המדויקת של הטולטיפ שהעכבר והמיקוד מגלים.
          -->
          <div class="tpl-descriptions">
            <span
              v-for="template in templates"
              :id="`${TPL_ID_BASE}-${template.id}-desc`"
              :key="template.id"
            >{{ tipDescription(template) }}</span>
          </div>
        </section>

        <!-- עיון בקבצים -->
        <button
          type="button"
          class="open-browse"
          :disabled="busy"
          @click="$emit('browse')"
        >
          <SvgIcon
            name="folder"
            :size="18"
            class="open-browse__icon"
          />
          <span class="open-browse__label">עיון בקבצים…</span>
          <span class="open-browse__hint">בחר קובץ Word מהמחשב</span>
          <SvgIcon
            name="chevronLeft"
            :size="16"
            class="open-browse__chevron"
          />
        </button>

        <!-- מסמכים אחרונים -->
        <section
          class="rec-section"
          :aria-labelledby="REC_TITLE_ID"
        >
          <div class="rec-head">
            <h3
              :id="REC_TITLE_ID"
              class="section-title"
            >
              מסמכים אחרונים
            </h3>
            <p
              v-if="countText"
              class="rec-count"
              role="status"
              aria-live="polite"
            >
              {{ countText }}
            </p>
            <div
              v-if="recents.length > 0"
              class="rec-search"
            >
              <SvgIcon
                name="search"
                :size="14"
                class="rec-search__icon"
              />
              <input
                class="rec-search__input"
                type="text"
                :value="searchQuery"
                :disabled="busy"
                aria-label="סינון מסמכים אחרונים לפי שם"
                @input="onSearchInput"
              >
              <button
                v-if="searchQuery !== ''"
                type="button"
                class="rec-search__clear"
                aria-label="נקה את הסינון"
                :disabled="busy"
                @click="$emit('update:searchQuery', '')"
              >
                ✕
              </button>
            </div>
          </div>

          <!-- אין אחרונים כלל -->
          <div
            v-if="recents.length === 0"
            class="rec-empty"
          >
            <SvgIcon
              name="folder"
              :size="28"
              class="rec-empty__icon"
            />
            <p class="rec-empty__title">
              עדיין אין מסמכים אחרונים
            </p>
            <p class="rec-empty__hint">
              מסמך שתפתח מכאן או מ„עיון בקבצים…” יופיע כאן.
            </p>
          </div>

          <!-- סינון בלי תוצאות -->
          <div
            v-else-if="visible.length === 0"
            class="rec-empty"
            role="status"
            aria-live="polite"
          >
            <p class="rec-empty__title">
              אין מסמך שתואם ל„{{ searchQuery }}”
            </p>
            <button
              type="button"
              class="rec-empty__clear"
              @click="$emit('update:searchQuery', '')"
            >
              נקה סינון
            </button>
          </div>

          <ul
            v-else
            class="rec-list"
            :aria-labelledby="REC_TITLE_ID"
            @keydown="onRowKeydown"
          >
            <li
              v-for="(item, index) in visible"
              :key="item.token"
              :ref="(el) => setRowRef(el, index)"
              class="rec-row"
              :class="{ 'rec-row--last-pinned': index === lastPinnedIndex }"
            >
              <button
                type="button"
                class="rec-open"
                data-col="open"
                :aria-label="openLabel(item)"
                :data-tip-title="item.name"
                :tabindex="index === activeRow ? 0 : -1"
                :disabled="busy"
                @focus="onRowFocus(index, 'open')"
                @click="$emit('open-recent', item.token)"
              >
                <!--
                  `dir="auto"` — בלעדיו שם קובץ לועזי יורש rtl, והחיתוך
                  (`text-overflow`) נופל ב-inline-end שהוא **תחילת** השם:
                  `Shulchan_Aruch_..._vol2_final.docx` היה מוצג כ-
                  `…_vol2_final.docx`, כלומר בדיוק החלק המזהה נעלם.
                  `RibbonCombo.vue` עושה את זה מאותו נימוק.
                -->
                <span
                  class="rec-name"
                  dir="auto"
                >{{ item.name }}</span>
                <span
                  v-if="metaParts(item).length > 0"
                  class="rec-meta"
                >
                  <template
                    v-for="(part, i) in metaParts(item)"
                    :key="i"
                  >
                    <span
                      v-if="i > 0"
                      aria-hidden="true"
                    > · </span>{{ part }}
                  </template>
                </span>
              </button>
              <span class="rec-actions">
                <button
                  type="button"
                  class="rec-iconbtn rec-pin"
                  data-col="pin"
                  :aria-pressed="item.pinned"
                  :aria-label="item.pinned ? `בטל הצמדה של ${item.name}` : `הצמד את ${item.name} לראש הרשימה`"
                  :data-tip-title="item.pinned ? 'בטל הצמדה' : 'הצמד לראש הרשימה'"
                  :tabindex="index === activeRow ? 0 : -1"
                  :disabled="busy"
                  @focus="onRowFocus(index, 'pin')"
                  @click="$emit('toggle-pin', item.token, !item.pinned)"
                >
                  <SvgIcon
                    name="bookmark"
                    :size="15"
                  />
                </button>
                <button
                  type="button"
                  class="rec-iconbtn rec-forget"
                  data-col="forget"
                  :aria-label="`הסר את ${item.name} מרשימת האחרונים`"
                  data-tip-title="הסר מהרשימה"
                  :tabindex="index === activeRow ? 0 : -1"
                  :disabled="busy"
                  @focus="onRowFocus(index, 'forget')"
                  @click="$emit('forget-recent', item.token)"
                >
                  <SvgIcon
                    name="reject"
                    :size="15"
                  />
                </button>
              </span>
            </li>
          </ul>
        </section>
      </div>

      <div class="open-footer">
        <p
          class="open-status"
          role="status"
          aria-live="polite"
        >
          {{ busy ? 'פותח מסמך…' : '' }}
        </p>
        <div class="open-footer__end">
          <!--
            נקודת הכניסה למסמכים שנסגרו בלי לשמור. מרונדרת **רק** כשיש מה
            לשחזר (`discardedCount > 0`): כפתור שמוביל לרשימה ריקה הוא כפתור
            שנלחץ פעם אחת ולא נלחץ שוב, וברירת המחדל 0 גם מבטיחה שהוא לא
            יופיע לפני שמי שמחזיק את מסך השחזור חיווט אותו.
          -->
          <button
            v-if="discardedCount > 0"
            type="button"
            class="open-discarded"
            :disabled="busy"
            data-tip-title="מסמכים שנסגרו בלי לשמור"
            data-tip-desc="חמשת האחרונים נשמרו כגיבוי, ואפשר לפתוח אותם מכאן"
            @click="$emit('show-discarded')"
          >
            נסגרו בלי לשמור ({{ discardedCount }})
          </button>
          <button
            type="button"
            class="open-btn"
            @click="$emit('close')"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * „פתח מסמך” — כרטיסי התבניות למעלה, והמסמכים האחרונים למטה.
 *
 * המימוש נאמן ל-`docs/open-document-dialog-design.md`, וכל מספר כאן מגיע משם.
 * מה שלא מגיע משם מסומן בהערה עם הנימוק.
 *
 * ## מה הקומפוננטה אינה עושה
 *
 * היא אינה קוראת ל-`storage`, אינה מכירה את הגשר, ואינה פותחת מסמכים. כל המצב
 * מגיע ב-props וכל פעולה יוצאת כאירוע — אותו קו בדיוק כמו `FindReplaceDialog`
 * ו-`MacrosDialog`. המצב היחיד שהיא כן מחזיקה הוא מיקום ה-roving tabindex,
 * שהוא מיקוד ולא נתונים.
 *
 * ## הסינון: למה הוא כן כאן
 *
 * §11 במפרט מטיל את הסינון על `App.vue`, ו-§4.1 ו-§10 דורשים שני דברים
 * שסינון בחוץ אינו יכול לספק: המונה „3 מתוך 12”, וההבחנה בין „אין אחרונים
 * בכלל” לבין „הסינון לא מצא”. שניהם צריכים את **הרשימה המלאה ואת המסוננת
 * יחד**, ובחוזה ה-props יש שדה אחד. לכן `recents` הוא המלא, והמסונן נגזר כאן
 * דרך `filterRecents` — **אותה פונקציה נבדקת** מ-`sessions/recent-documents.ts`,
 * ולא כלל חדש. זו כוונת §11 („הכללים חיים שם”) בלי לשבור את §10.
 *
 * ## מלכודת המיקוד
 *
 * הועתקה מ-`AboutDialog.vue` — כולל `tabindex="-1"` על החלון, `@keydown.esc.stop`,
 * שמירת `document.activeElement` והבדיקה `document.contains` לפני ההחזרה.
 * ה-`focusables()` שם מדלג מעצמו על `tabindex="-1"`, ולכן ה-roving tabindex
 * מצטמצם לעצירה אחת ברצועה ולשלוש בשורה הפעילה בלי לגעת במלכודת.
 */
import { computed, nextTick, ref, watch } from 'vue';
import SvgIcon from '../icons/SvgIcon.vue';
import { nextTabIndex } from '../ribbon/aria';
import { draftAgeLabel } from '../../sessions/session-state';
import { filterRecents, sortedRecents, type RecentDocument } from '../../sessions/recent-documents';
import type { DocumentTemplate, TemplatePreview } from '../../engine/templates';

const TITLE_ID = 'open-dialog-title';
const TPL_TITLE_ID = 'open-dialog-templates-title';
const REC_TITLE_ID = 'open-dialog-recents-title';
const TPL_ID_BASE = 'open-dialog-tpl';

const props = withDefaults(
  defineProps<{
    isOpen?: boolean;
    templates?: readonly DocumentTemplate[];
    recents?: readonly RecentDocument[];
    busy?: boolean;
    searchQuery?: string;
    /**
     * כמה מסמכים שנסגרו בלי לשמור יש בגיבוי (`sessions/discard-backup.ts`).
     * `0` = אין מה לשחזר, והכניסה אינה מרונדרת כלל.
     */
    discardedCount?: number;
  }>(),
  {
    // נכשל סגור: דיאלוג שהורכב בלי מידע אינו מציג תבניות שאינו מכיר ואינו
    // מציע לפתוח קבצים שלא נמסרו לו.
    isOpen: false,
    templates: () => [],
    recents: () => [],
    busy: false,
    searchQuery: '',
    discardedCount: 0,
  },
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'browse'): void;
  (e: 'create-from-template', id: string): void;
  (e: 'open-recent', token: string): void;
  (e: 'toggle-pin', token: string, pinned: boolean): void;
  (e: 'forget-recent', token: string): void;
  (e: 'update:searchQuery', value: string): void;
  /** „נסגרו בלי לשמור” — מסך השחזור עצמו אינו של הדיאלוג. */
  (e: 'show-discarded'): void;
}>();

/* ------------------------------------------------------------------ */
/* הרשימה הנראית                                                       */
/* ------------------------------------------------------------------ */

/**
 * מיון חוזר על רשימה שכבר ממוינת הוא no-op — `sortedRecents` יציב — והוא מה
 * שמבטיח שהקו מתחת למוצמדת האחרונה מסמן גבול אמיתי ולא נקודה שרירותית, גם אם
 * מי שהרכיב את הדיאלוג מסר רשימה בסדר אחר.
 */
const visible = computed(() => sortedRecents(filterRecents(props.recents, props.searchQuery)));

/** האינדקס שאחריו נגמרים המוצמדים — ורק אם יש גם לא-מוצמדים אחריו. */
const lastPinnedIndex = computed(() => {
  const list = visible.value;
  let last = -1;
  for (let i = 0; i < list.length; i += 1) {
    if (list[i]!.pinned) last = i;
  }
  // קו שיושב בתחתית הרשימה אינו מפריד בין שתי קבוצות אלא מצייר גבול לרשימה.
  return last >= 0 && last < list.length - 1 ? last : -1;
});

/**
 * „12 מסמכים” בלי סינון, „3 מתוך 12” עם סינון, ריק כשאין רשימה.
 *
 * הצורות של 1 ו-2 אינן קישוט: „1 מסמכים” אינו עברית, וזה בדיוק מה שהמשתמש
 * רואה כשנשאר לו קובץ אחד. אותה הכרעה כמו `inParagraphsText`
 * (engine/shulchan/shulchan-doc.ts) ו-`draftAgeLabel`.
 */
const countText = computed(() => {
  const total = props.recents.length;
  if (total === 0) return '';
  if (props.searchQuery.trim() !== '') return `${visible.value.length} מתוך ${total}`;
  if (total === 1) return 'מסמך אחד';
  if (total === 2) return 'שני מסמכים';
  return `${total} מסמכים`;
});

/* ------------------------------------------------------------------ */
/* המטא של השורה                                                       */
/* ------------------------------------------------------------------ */

/**
 * גודל הקובץ במילים. `0` הוא „לא דווח” ולא „ריק” — זה חוזה מפורש
 * ב-`RecentDocument`, ו„0 בייט” היה הופך חוסר מידע לעובדה שגויה.
 */
function sizeLabel(size: number): string | null {
  if (!Number.isFinite(size) || size <= 0) return null;
  if (size < 1024) return `${size} בייט`;
  if (size < 1048576) return `${(size / 1024).toFixed(0)} ק״ב`;
  return `${(size / 1048576).toFixed(1)} מ״ב`;
}

/** הגיל והגודל, בלי מה שחסר. רשימה ריקה = אין מה לצייר בשורה השנייה. */
function metaParts(item: RecentDocument): string[] {
  const parts: string[] = [];
  const age = draftAgeLabel(item.openedAt, Date.now());
  if (age) parts.push(age);
  const size = sizeLabel(item.size);
  if (size) parts.push(size);
  return parts;
}

/**
 * השם הנגיש של כפתור הפתיחה. **מתחיל בשם הקובץ הנראה** — זו דרישת WCAG 2.5.3
 * („Label in Name”), והיא גם מה שמאפשר פקודת קול. „מוצמד” בסוף מחליף את כותרת
 * הקבוצה החזותית שהעיצוב ויתר עליה (§9.7 במפרט).
 */
function openLabel(item: RecentDocument): string {
  const parts = [item.name, ...metaParts(item)];
  if (item.pinned) parts.push('מוצמד');
  return parts.join(', ');
}

/* ------------------------------------------------------------------ */
/* התצוגה המקדימה                                                      */
/* ------------------------------------------------------------------ */

interface SheetRect {
  x: number;
  y: number;
  width: number;
  height: number;
  /** גיליון הנייר עצמו — מסגרת, לא דיו. */
  sheet?: boolean;
  /** כותרת: עבה יותר מהגוף, ולכן גם כהה יותר. */
  strong?: boolean;
}

interface SheetLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** מידות A4 אמיתיות במ״מ. המקורות: `PAPER_SIZES` ו-`MARGIN_PRESETS` ב-page-setup.ts. */
const MARGIN = 25.4;
const TEXT_START = MARGIN;
const TEXT_WIDTH = 159.2;
const TEXT_END = TEXT_START + TEXT_WIDTH;
const COLUMN_WIDTH = 73.25;
const ROW_PITCH = 19;
const ROW_THICKNESS = 7;

/**
 * שורות גוף בטור אחד, בקצב קבוע. השורה האחרונה קצרה **ונצמדת לימין** — הקצה
 * המשונן נופל בשמאל, וזה מה שהופך את הציור לדף עברי: בשני טורים שווי-רוחב אין
 * שום דבר אחר שמבדיל RTL מ-LTR.
 */
function bodyRows(top: number, bottom: number, x: number, width: number, shortWidth: number | null): SheetRect[] {
  const rows: SheetRect[] = [];
  for (let i = 0; ; i += 1) {
    const y = top + ROW_PITCH * i;
    if (y + ROW_THICKNESS > bottom) break;
    rows.push({ x, y, width, height: ROW_THICKNESS });
  }
  if (shortWidth !== null && rows.length > 0) {
    const last = rows[rows.length - 1]!;
    last.width = shortWidth;
    last.x = x + width - shortWidth;
  }
  return rows;
}

interface Sheet {
  rects: SheetRect[];
  lines: SheetLine[];
  /** A5 — אותו ציור בקנה מידה, ולא ציור שני. ראו §5.4 במפרט. */
  scaled: boolean;
}

function buildSheet(preview: TemplatePreview): Sheet {
  const rects: SheetRect[] = [{ x: 0, y: 0, width: 210, height: 297, sheet: true }];
  const lines: SheetLine[] = [];

  if (preview.hasRunningHead) {
    // `y = 12.7` הוא בדיוק `w:header="720"`. מספר העמוד בקצה השמאלי, כפי
    // שכותרת RTL עם עצירת טאב ימנית מניחה אותו.
    rects.push({ x: 113.0, y: 12.7, width: 71.6, height: 5 });
    rects.push({ x: TEXT_START, y: 12.7, width: 8, height: 5 });
  }

  const bodyTop = MARGIN;
  let bodyBottom = 271.6;

  if (preview.hasTitleBlock) {
    /*
     * **עמוד שער, ולא כותרת שמעל גוף.**
     *
     * הציור הקודם העמיד גוש כותרת, קו אופקי מתחתיו, ותשע שורות גוף באותו
     * עמוד — כלומר „מסמך עם כותרת”. מה שהתבנית מייצרת בפועל הוא אחר לגמרי:
     * `pageBreakBefore` שולח את הגוף לעמוד **הבא**, אין שום קו, ובעמוד
     * הראשון יושבות שלוש פסקאות בלבד (שם הספר, המחבר, השנה).
     *
     * כלומר הציור סתר גם את התבנית וגם את הרמז שלה עצמה („שער נפרד, ואחריו
     * גוף המסמך”), וזה בדיוק מה שהמפרט אוסר: דגל שאין לו כיסוי בהחלה הוא
     * ציור שמשקר. שלוש המסות כאן הן שלוש הפסקאות, ממורכזות ובסדר גודל יורד,
     * והעמוד ריק סביבן — כי זה מה שעמוד שער הוא.
     *
     * `return` מיידי: אין גוף לצייר, ולכן גם אין טעם להמשיך לחישוב השורות.
     */
    rects.push({ x: 50, y: 90, width: 110, height: 12, strong: true });
    rects.push({ x: 72, y: 116, width: 66, height: 7, strong: true });
    rects.push({ x: 93, y: 136, width: 24, height: 6 });
    return { rects, lines, scaled: preview.ratio === 'a5' };
  }

  if (preview.hasFootnoteBand) {
    bodyBottom = 219;
    // המפריד יוצא **מקצה ההתחלה** — בעברית, מימין. כך Word מצייר אותו.
    lines.push({ x1: TEXT_END, y1: 228, x2: 131.5, y2: 228 });
    /*
     * **אותו עובי כמו הגוף**, ולא דק ממנו.
     *
     * הציור הראשון נתן לרצועה `height: 5` מול `ROW_THICKNESS: 7` בגוף,
     * כלומר הצהיר „הביאור קטן מהפנים”. זו טענת פרופורציה, והיא בדיוק סוג
     * הטענה שהציור הזה כן מתחייב עליה (בשונה מקנה המידה של A5, שמצהיר על
     * גיליון קטן יותר ולא על מספרים — ראו §5.4 במפרט).
     *
     * ובפועל היא אינה נכונה: `applyDocStyleDefaults` חל על `docDefaults`,
     * כלומר על **שני הזרמים**, והביאור יוצא בדיוק בגודל הפנים. מה שמבדיל
     * את הרצועה הוא המפריד שמעליה והצפיפות — ושניהם אמיתיים. הגודל אינו,
     * ולכן הוא יורד מהציור.
     *
     * הקצב 14 (מול 19 בגוף) הוא מה שנשאר, והוא חסום מלמטה: השורה השלישית
     * יושבת ב-263 ומסתיימת ב-270, כלומר בתוך קו השוליים (271.6).
     */
    rects.push({ x: TEXT_START, y: 235, width: TEXT_WIDTH, height: ROW_THICKNESS });
    rects.push({ x: TEXT_START, y: 249, width: TEXT_WIDTH, height: ROW_THICKNESS });
    rects.push({ x: 97.0, y: 263, width: 87.6, height: ROW_THICKNESS });
  }

  if (preview.columns === 2) {
    // הטור הראשון (ימין) מלא עד הסוף — הטקסט ממשיך ממנו לשני, ולכן רק השני
    // נגמר באמצע שורה.
    rects.push(...bodyRows(bodyTop, bodyBottom, 111.35, COLUMN_WIDTH, null));
    rects.push(...bodyRows(bodyTop, bodyBottom, TEXT_START, COLUMN_WIDTH, 44));
  } else {
    rects.push(...bodyRows(bodyTop, bodyBottom, TEXT_START, TEXT_WIDTH, 95.5));
  }

  return { rects, lines, scaled: preview.ratio === 'a5' };
}

/** נבנה פעם אחת לכל תבנית — הציור אינו תלוי במצב, ואין טעם לבנות אותו בכל רינדור. */
const sheets = computed(() => {
  const map = new Map<string, Sheet>();
  for (const template of props.templates) map.set(template.id, buildSheet(template.preview));
  return map;
});

const EMPTY_SHEET: Sheet = { rects: [], lines: [], scaled: false };

function sheetOf(template: DocumentTemplate): Sheet {
  return sheets.value.get(template.id) ?? EMPTY_SHEET;
}

/**
 * הרמז וההערה — טקסט אחד, ושני צרכנים לו: הטולטיפ (`data-tip-desc`) ותיאור
 * הנגישות (`aria-describedby`). מקור אחד, כדי שמה שהעכבר מגלה ומה שקורא מסך
 * מכריז לא יתפצלו בשקט.
 *
 * ההערה מופרדת בנקודה ולא בפסיק: היא משפט על הקובץ, לא פריט ברשימה.
 */
function tipDescription(template: DocumentTemplate): string {
  return template.note ? `${template.hint}. ${template.note}` : template.hint;
}

/**
 * שם הכרטיס מגיע מהתווית **הגלויה** שבתוכו, ולא מ-`aria-label`: זה הכלל
 * שמתועד ב-`RibbonButton.vue` — `aria-label` על פקד עם תווית גלויה דורס
 * אותה, מוסיף רעש, ושובר שליטה קולית שמצפה שהשם יהיה מה שכתוב על הכפתור.
 * התיאור נשאר תיאור.
 */
function describedBy(template: DocumentTemplate): string {
  return `${TPL_ID_BASE}-${template.id}-desc`;
}

/* ------------------------------------------------------------------ */
/* חיפוש                                                               */
/* ------------------------------------------------------------------ */

function onSearchInput(event: Event): void {
  emit('update:searchQuery', (event.target as HTMLInputElement).value);
}

/* ------------------------------------------------------------------ */
/* roving tabindex — כרטיסים                                           */
/* ------------------------------------------------------------------ */

const activeCard = ref(0);
const cardRefs = ref<(HTMLElement | null)[]>([]);

function setCardRef(el: unknown, index: number): void {
  cardRefs.value[index] = el instanceof HTMLElement ? el : null;
}

/**
 * `nextTabIndex(..., 'rtl')` ולא לוגיקה חדשה: היא כבר קובעת ש-ArrowLeft מתקדם
 * בממשק עברי, היא כבר נבדקת (tests/unit/ribbon-aria.test.ts), ואותו קוד כבר
 * מניע את הרצועה ואת טאבי המסמכים.
 *
 * `ArrowUp`/`ArrowDown` אינם מקושרים בכוונה: מספר העמודות ברשת נגזר מ-`auto-fit`
 * ומשתנה עם רוחב החלון (5/4/3/2/1), כלומר „למטה” היה מזיז מספר שונה של כרטיסים
 * בכל חלון. חמישה פריטים נגישים בלחיצת חץ אחת או שתיים.
 */
function onCardKeydown(event: KeyboardEvent): void {
  const next = nextTabIndex(event.key, activeCard.value, props.templates.length, 'rtl');
  if (next === null) return;
  event.preventDefault();
  activeCard.value = next;
  void nextTick(() => cardRefs.value[next]?.focus());
}

/* ------------------------------------------------------------------ */
/* roving tabindex — שורות                                             */
/* ------------------------------------------------------------------ */

type RowColumn = 'open' | 'pin' | 'forget';

const activeRow = ref(0);
/** ה-token של השורה הפעילה — הזהות שהמצביע רודף אחריה. ראו ה-`watch` למטה. */
const activeToken = ref<string | null>(null);
const activeColumn = ref<RowColumn>('open');
const rowRefs = ref<(HTMLElement | null)[]>([]);

function setRowRef(el: unknown, index: number): void {
  rowRefs.value[index] = el instanceof HTMLElement ? el : null;
}

function onRowFocus(index: number, column: RowColumn): void {
  activeRow.value = index;
  activeToken.value = visible.value[index]?.token ?? null;
  activeColumn.value = column;
}

/**
 * חץ מזיז **שורה** וממקד את אותו כפתור בשורה החדשה — לא את הראשון בה. בלי זה
 * מי שירד מכפתור ההסרה היה נוחת על כפתור הפתיחה, ומסלול המקלדת „הסר, הסר,
 * הסר” היה דורש שלוש הקשות טאב בין כל שתי הסרות.
 *
 * בלי ה-roving הזה רשימה של עשרים שורות היא 60 עצירות Tab בין תיבת החיפוש
 * לכפתור „סגור”.
 */
function onRowKeydown(event: KeyboardEvent): void {
  const count = visible.value.length;
  if (count === 0) return;

  let next: number | null = null;
  if (event.key === 'ArrowDown') next = Math.min(activeRow.value + 1, count - 1);
  else if (event.key === 'ArrowUp') next = Math.max(activeRow.value - 1, 0);
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = count - 1;
  if (next === null) return;

  event.preventDefault();
  activeRow.value = next;
  activeToken.value = visible.value[next]?.token ?? null;
  void nextTick(() => {
    const row = rowRefs.value[next];
    const target = row?.querySelector<HTMLElement>(`[data-col="${activeColumn.value}"]`);
    target?.focus();
    // `block: 'nearest'` ובלי `behavior: 'smooth'` — `scroll-behavior` אינו
    // מוגדר בשום מקום במאגר, וגלילה מונפשת בניווט מקלדת מפגרת אחרי ההקשה הבאה.
    //
    // ה-`?.` על המתודה עצמה אינו הגנה ספקולטיבית: ב-jsdom היא אינה קיימת כלל,
    // וההרכבה בבדיקות הפילה דחייה לא-מטופלת על כל לחיצת חץ (נמדד). המיקוד כבר
    // קרה בשורה שמעל — הגלילה היא נוחות, ואין סיבה שהיעדרה יזרוק.
    target?.scrollIntoView?.({ block: 'nearest' });
  });
}

/**
 * המצביע עוקב אחרי ה-**token**, לא אחרי המספר.
 *
 * שלוש פעולות מזיזות שורות מתחת למצביע, ואף אחת מהן אינה מזיזה את המיקוד
 * בעצמה — ולכן `@focus` אינו יורה ו-`activeRow` היה נשאר על מספר שמצביע
 * לשורה אחרת לגמרי:
 *
 * 1. **הצמדה** — השורה קופצת לראש הרשימה. ArrowDown הבא היה מדלג אחורה
 *    למקום שבו היא ישבה קודם.
 * 2. **הסרה** — ה-`<li>` הממוקד יורד מה-DOM, והמיקוד נופל ל-`body`, כלומר
 *    **מחוץ למודאל**. „הסר, הסר, הסר” במקלדת נשבר אחרי הראשון.
 * 3. **סינון** — הרשימה מתקצרת.
 *
 * לכן: אם ה-token עדיין נראה, המצביע רודף אחריו. אם הוא נעלם, המצביע נשאר
 * במקומו (השורה הבאה תופסת את מקומו — ההתנהגות הצפויה בהסרה רצופה), ומצטמצם
 * לגבול הרשימה. וכשהמיקוד אכן נפל החוצה, הוא מוחזר לשורה שבמקום הזה.
 */
watch(visible, async (list) => {
  const index = activeToken.value === null ? -1 : list.findIndex((item) => item.token === activeToken.value);
  const next = index >= 0 ? index : Math.min(activeRow.value, Math.max(0, list.length - 1));
  activeRow.value = next;
  activeToken.value = list[next]?.token ?? null;

  // רק כשהמיקוד באמת אבד. בדיקה על `body` ולא „האם הוא בתוך הרשימה”: הצמדה
  // אינה מוציאה את המיקוד, והחזרה כפויה שם הייתה גונבת אותו ממי שכבר קיבל
  // אותו (למשל כפתור הניקוי בחיפוש).
  if (list.length === 0) return;
  if (document.activeElement !== document.body) return;
  await nextTick();
  const row = rowRefs.value[next];
  row?.querySelector<HTMLElement>(`[data-col="${activeColumn.value}"]`)?.focus();
});

/**
 * המיקוד אינו יכול להישאר על פקד שהתנטרל.
 *
 * שמירה אוטומטית יורה בזמן שהדיאלוג פתוח, `busy` הופך ל-true, והכרטיס או
 * השורה שהמשתמש עמד עליהם מקבלים `disabled` — הדפדפן מוציא מהם את המיקוד
 * ל-`body`, כלומר אל מחוץ למודאל, ומלכודת ה-Tab מפסיקה לתפוס. החלון עצמו
 * הוא `tabindex="-1"` בדיוק בשביל הרגע הזה.
 */
watch(
  () => props.busy,
  async (busy) => {
    if (!busy || !props.isOpen) return;
    await nextTick();
    if (document.activeElement === document.body) dialogRef.value?.focus();
  },
);

/* ------------------------------------------------------------------ */
/* מיקוד ומלכודת                                                       */
/* ------------------------------------------------------------------ */

const dialogRef = ref<HTMLElement | null>(null);

/** לאן המיקוד חוזר בסגירה — בלעדיו הוא נופל ל-`body` ו-Tab מתחיל מהתחלה. */
let focusOnClose: HTMLElement | null = null;

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      focusOnClose = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      // הכרטיס הראשון, ולא תיבת החיפוש: ה-props אינם כוללים „מאיזו כוונה
      // נפתחתי” (Ctrl+N מול Ctrl+O), ולכן יש כלל אחד לשני המסלולים. מיקוד
      // בשדה טקסט היה מבטל את Enter וכולא את החיצים.
      activeCard.value = 0;
      activeRow.value = 0;
      activeToken.value = null;
      activeColumn.value = 'open';
      void nextTick(() => {
        // `?? dialogRef` לא הספיק: כשהכרטיס **קיים אבל מנוטרל** ה-`??` אינו
        // נופל, ומיקוד על כפתור מנוטרל הוא no-op שקט — המיקוד היה נשאר
        // מאחורי המודאל. `openOpenDialog` (App.vue) כבר מונע את המצב הזה
        // מלכתחילה, וזו רשת הביטחון שלו.
        const card = cardRefs.value[0];
        (card && !(card as HTMLButtonElement).disabled ? card : dialogRef.value)?.focus();
      });
      return;
    }

    const target = focusOnClose;
    focusOnClose = null;
    // רק אם הוא עוד במסמך: הרצועה היא „mount on active”, ולשונית שהתחלפה
    // בזמן שהחלון היה פתוח לקחה איתה את הכפתור שנלחץ.
    if (target && document.contains(target)) target.focus();
  },
);

/** הפקדים שאפשר למקד בתוך החלון, בסדר ה-DOM. */
function focusables(): HTMLElement[] {
  const root = dialogRef.value;
  if (!root) return [];
  const selector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  return [...root.querySelectorAll<HTMLElement>(selector)].filter(
    // שני הסינונים נדרשים, וה-`tabindex` **אינו** מכוסה על ידי הסלקטור:
    // ה-`:not()` שם מסייג רק את האיבר `[tabindex]`, ולכן `<button
    // tabindex="-1">` עדיין תואם ל-`button` ונכנס לרשימה. עם ה-roving
    // tabindex שכאן זה אומר שכל חמשת הכרטיסים וכל שורות הרשימה נספרו
    // כעצירות, ו„הראשון” ו„האחרון” שמלכודת ה-Tab קופצת אליהם היו אלמנטים
    // שהדפדפן עצמו מדלג עליהם.
    (element) => !element.hasAttribute('disabled') && element.tabIndex >= 0,
  );
}

/**
 * מלכודת המיקוד: Tab מהאחרון חוזר לראשון, ו-Shift+Tab מהראשון קופץ לאחרון.
 * `aria-modal="true"` הוא הצהרה שכל מה שמחוץ לחלון אינו זמין; בלי המלכודת
 * המיקוד יוצא אל תוכן שהוכרז כלא קיים.
 */
function onTab(event: KeyboardEvent): void {
  const items = focusables();
  if (items.length === 0) return;

  const first = items[0]!;
  const last = items[items.length - 1]!;
  const active = document.activeElement;

  if (event.shiftKey && (active === first || active === dialogRef.value)) {
    event.preventDefault();
    last.focus();
    return;
  }
  if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}
</script>

<style scoped>
/* ------------------------------------------------------------------ */
/* המעטפת                                                              */
/* ------------------------------------------------------------------ */

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: var(--color-scrim);
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* `rgba(0,0,0,0.24)` הוא אחת משתי ההחרגות המפורשות של css-hygiene (צל ניטרלי),
   וזה בדיוק אותו ערך ששני הדיאלוגים האחרים כבר נושאים. */
.open-dialog {
  /*
   * 840 ולא 960, אחרי שהכרטיס ירד למסגרת אפס.
   *
   * 960 נבחר כשהכרטיס נשא גם רמז וגם הערה — שלוש שורות טקסט שדרשו רוחב.
   * מרגע שנשארו בו אייקון וכיתוב, כל אותו רוחב הפך למרווח ריק בין חמישה
   * כרטיסים.
   *
   * 840 הוא **הרוחב הקטן ביותר שעדיין מחזיק חמישה כרטיסים בשורה**, ולא
   * מספר עגול: הרשת דורשת `5×148 + 4×12 = 788` פיקסלים של תוכן (המינימום
   * ב-`minmax` והמרווח), ותיבת התוכן היא `W − 34` (ריפוד 2×16 וגבול 2×1).
   * מכאן `W ≥ 822`; 840 משאיר 18 פיקסלים של אוויר. מתחת ל-822 הרשת נשברת
   * לשתי שורות בחלון רחב, וזה בדיוק מה שהמפרט ביקש למנוע.
   *
   * נקודות המעבר לא זזו — `npm run check:open-dialog` מודד אותן: 1440 → 5
   * עמודות, 800 → 4, 520 → 2.
   */
  width: min(840px, 94vw);
  max-height: min(760px, 88vh);
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border: 1px solid var(--color-outline);
  border-radius: var(--radius-md);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.24);
  font-family: var(--font-main);
  font-size: var(--font-size-ui);
  overflow: hidden;
}

.open-header {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--color-surface-container-high);
  border-block-end: 1px solid var(--color-outline);
}

.open-header__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1.08em;
  font-weight: 600;
  color: var(--color-on-surface);
}

.open-header__icon {
  color: var(--word-blue);
}

.open-close-btn {
  background: none;
  border: none;
  font-size: 1em;
  color: var(--color-on-surface-variant);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: var(--radius-xs);
}

.open-close-btn:hover {
  background: var(--word-btn-hover);
  color: var(--color-error);
}

.open-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-title {
  margin: 0;
  font-size: 0.92em;
  font-weight: 700;
  color: var(--color-primary);
}

/* ------------------------------------------------------------------ */
/* כרטיסי התבניות                                                      */
/* ------------------------------------------------------------------ */

/* רשת הכרטיסים לעולם אינה מתכווצת: כרטיס שנחתך מתחת לקו הגלילה הוא תבנית
   שהמשתמש אינו יודע שקיימת. */
.tpl-section {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* `auto-fit` ולא `auto-fill`: `auto-fill` היה משאיר עמודות ריקות בחלון רחב,
   וחמישה כרטיסים היו נדחסים לצד אחד. */
.tpl-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
  gap: 12px;
}

/* **כרטיס בלי מסגרת** — אייקון, וכיתוב מתחתיו. הרמז וההערה עברו לטולטיפ
   (`data-tip-title`/`data-tip-desc`), וזו הסיבה שאין כאן יותר טקסט משני:
   חמישה כרטיסים ממוסגרים עם שלוש שורות טקסט כל אחד היו קיר, והגיליון —
   שהוא המידע האמיתי — נבלע בו.

   הדריסות אינן ניקיון: הכלל הגלובלי `button` ב-shell.css נותן ריפוד של
   כפתור, גבול, רקע ורדיוס — ובלי הדריסה הכרטיס יוצא ככפתור ממוסגר.

   גובה הכרטיס נגזר מהתוכן ואינו נכפה: `--line-height` נדרס בזמן ריצה בלי
   חסם (host/theme.ts), וריבוע קשיח היה חותך תווית בערכה עם ריווח גבוה. */
.tpl-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 6px 12px;
  background: none;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  color: var(--color-on-surface);
  font-family: var(--font-main);
  font-size: inherit;
  text-align: center;
  cursor: pointer;
  transition: background-color 0.08s ease;
}

/* מצב המנוחה חזר להיות שקוף, ולכן ההיררכיה חוזרת לזו של הרצועה: 8% ל-hover
   ו-12% ללחיצה. הנימוק שהצדיק את ההזזה דרגה מעלה — „8% היו *מחליפים* מילוי
   אטום” — אינו תקף יותר, ועכשיו הם **תוספת** על המשטח, בדיוק כמו בכל פקד
   אחר בתוכנה. `border-color` אינו משתנה: „בלי מסגרת” פירושו גם בריחוף. */
.tpl-card:hover:not(:disabled) {
  background: var(--word-btn-hover);
}

.tpl-card:active:not(:disabled) {
  background: var(--word-btn-active);
}

.tpl-sheet {
  --tpl-sheet-h: 6.5em;
  height: var(--tpl-sheet-h);
  width: auto;
  aspect-ratio: 214 / 301;
  display: block;
  flex-shrink: 0;
}

.tpl-label {
  margin-block-start: 8px;
  font-weight: 600;
  line-height: 1.25;
}

/* יעד של `aria-describedby` בלבד. `clip-path` ולא `display: none` ולא
   `visibility: hidden`: שני אלה מוציאים את האלמנט מעץ הנגישות, ואז התיאור
   שהם אמורים לספק פשוט אינו קיים. */
.tpl-descriptions {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* ------------------------------------------------------------------ */
/* התצוגה המקדימה                                                      */
/* ------------------------------------------------------------------ */

/* הגיליון הוא `--color-surface` על כרטיס שהוא `container-high`. במצב בהיר הדף
   בהיר מהשולחן, ובמצב כהה של M3 היחס מתהפך — ובשני המצבים הקצה נשמר על ידי
   ה-stroke. זו כל הסיבה שלגיליון יש מסגרת.
   `non-scaling-stroke` מנתק את העובי מה-viewBox: בקנה המידה כאן (0.263 פיקסל
   למ״מ בקצה הקטן) קו של חצי מ״מ היה 0.13px, כלומר לא נצבע. */
.pv-sheet {
  fill: var(--color-surface);
  stroke: var(--color-outline);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

.pv-rule {
  stroke: var(--color-outline);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
  fill: none;
}

/* `opacity` אינו צבע, ולכן הוא עובר את סורק הצבע הקשיח; כל fill ו-stroke כאן
   הם var(--color-*). שתי דרגות ולא שלוש — דרגה „חיוורת” שלישית נופלת מתחת
   לפיקסל בקנה המידה הזה. */
.pv-ink {
  fill: var(--color-on-surface-variant);
  opacity: 0.42;
}

.pv-ink--strong {
  opacity: 0.75;
}

/* ------------------------------------------------------------------ */
/* עיון בקבצים                                                         */
/* ------------------------------------------------------------------ */

/* שורה מלאה ולא כרטיס שישי: כרטיס היה מכניס „פתיחת קובץ קיים” לתוך „יצירת
   מסמך חדש”, והוא היה הכרטיס היחיד בלי תצוגת דף בשורה של חמישה. */
.open-browse {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  background: var(--color-surface-container-high);
  border: 1px solid var(--color-outline);
  border-radius: var(--radius-md);
  color: var(--color-on-surface);
  font-family: var(--font-main);
  font-size: inherit;
  text-align: start;
  cursor: pointer;
  transition: background-color 0.08s ease, border-color 0.08s ease;
}

.open-browse:hover:not(:disabled) {
  background: var(--word-btn-active);
  border-color: var(--color-primary);
}

.open-browse:active:not(:disabled) {
  background: var(--word-btn-active-hover);
}

.open-browse__icon {
  color: var(--word-blue);
}

.open-browse__label {
  font-weight: 600;
}

.open-browse__hint {
  flex: 1 1 auto;
  font-size: 0.88em;
  color: var(--color-on-surface-variant);
}

/* `chevronLeft` ולא Right — בממשק RTL „קדימה” הוא שמאלה, וזה בדיוק מה
   ש-`nextTabIndex` קובע ל-ArrowLeft בכל הרצועה. */
.open-browse__chevron {
  color: var(--color-on-surface-variant);
}

/* ------------------------------------------------------------------ */
/* מסמכים אחרונים                                                      */
/* ------------------------------------------------------------------ */

.rec-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1 1 auto;
  min-height: 0;
}

.rec-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.rec-count {
  margin: 0;
  font-size: 0.88em;
  color: var(--color-on-surface-variant);
}

.rec-search {
  margin-inline-start: auto;
  position: relative;
  display: flex;
  align-items: center;
  width: min(260px, 45%);
}

/* `type="text"` ולא `search`: אנחנו מציירים את האייקון ואת כפתור הניקוי בעצמנו,
   ולפקד המובנה אין דרך להתאים אותם לשפה. Escape כאן חייב להגיע למודאל. */
.rec-search__input {
  width: 100%;
  padding-block: 4px;
  padding-inline: 26px 24px;
  border: 1px solid var(--color-outline);
  border-radius: var(--radius-xs);
  background: var(--color-surface);
  color: var(--color-on-surface);
  font-family: var(--font-main);
  font-size: inherit;
  outline: none;
  transition: border-color 0.1s, box-shadow 0.1s;
}

.rec-search__input:focus {
  border-color: var(--word-blue);
  box-shadow: 0 0 0 1px var(--word-blue);
}

.rec-search__icon {
  position: absolute;
  inset-inline-start: 6px;
  pointer-events: none;
  color: var(--color-on-surface-variant);
}

.rec-search__clear {
  position: absolute;
  inset-inline-end: 2px;
  width: 20px;
  height: 20px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  border-radius: var(--radius-xs);
  color: var(--color-on-surface-variant);
  cursor: pointer;
}

.rec-search__clear:hover:not(:disabled) {
  background: var(--word-btn-hover);
  color: var(--color-on-surface);
}

/* `direction: ltr` כאן הוא הצהרה על **פס הגלילה** בלבד, לא על התוכן: הצד שבו
   הדפדפן מצייר אותו נגזר מכיווניות מיכל הגלילה ואין לו מאפיין נפרד, ובעברית
   ב-Word הוא מימין. כל ילד ישיר חייב להחזיר `rtl` — ראו `.rec-row`. אותו טריק
   בדיוק ש-shell.css מתעד על `.editor-stack__host`. */
.rec-list {
  list-style: none;
  margin: 0;
  padding: 0;
  flex: 1 1 auto;
  min-height: 96px;
  overflow-y: auto;
  border: 1px solid var(--color-outline);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  direction: ltr;
}

.rec-row {
  direction: rtl;
  display: flex;
  align-items: center;
  gap: 8px;
  padding-block: 4px;
  padding-inline: 10px 4px;
  transition: background-color 0.08s ease;
}

.rec-row:hover,
.rec-row:focus-within {
  background: var(--word-btn-hover);
}

/* הקו היחיד ברשימה. עשרים קווים הופכים רשימה למחברת משבצות; קו אחד אומר משהו. */
.rec-row--last-pinned {
  border-block-end: 1px solid var(--color-outline);
}

.rec-open {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
  background: none;
  border: 0;
  padding: 0;
  font: inherit;
  font-family: var(--font-main);
  text-align: start;
  color: var(--color-on-surface);
  border-radius: var(--radius-xs);
  cursor: pointer;
}

.rec-open:active:not(:disabled) {
  background: var(--word-btn-active);
}

/* הקיצוץ נופל ב-inline-end, כלומר בשמאל: ההתחלה נשמרת, כמו שקוראים. `min-width: 0`
   הוא מה שמאפשר לזה לקרות מול flex. */
.rec-name {
  flex: 1 1 auto;
  min-width: 0;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rec-meta {
  flex: 0 0 auto;
  font-size: 0.88em;
  white-space: nowrap;
  color: var(--color-on-surface-variant);
}

.rec-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

/* 24×24 הוא המינימום של WCAG 2.2 („Target Size”). הם לעולם אינם מוסתרים ואינם
   מועמים: אטימות נמוכה במנוחה שוברת את יחס הניגוד לפקדים לא-טקסטואליים, והסתרה
   עד hover הופכת אותם לעכבר-בלבד. */
.rec-iconbtn {
  width: 24px;
  height: 24px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--color-on-surface-variant);
  cursor: pointer;
  transition: background-color 0.08s ease, border-color 0.08s ease;
}

.rec-iconbtn:hover:not(:disabled) {
  background: var(--word-btn-hover);
  color: var(--color-on-surface);
}

.rec-pin[aria-pressed='true'] {
  color: var(--word-blue);
}

.rec-forget:hover:not(:disabled) {
  color: var(--color-error);
}

/* מצבי הריק — האזור מקבל את גובהו מהתוכן, והדיאלוג מתקצר במקום לשמור מקום
   למה שאין. */
.rec-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 16px 12px;
  text-align: center;
}

.rec-empty__icon {
  color: var(--color-on-surface-variant);
}

.rec-empty__title {
  margin: 0;
  font-weight: 600;
  color: var(--color-on-surface);
}

.rec-empty__hint {
  margin: 0;
  font-size: 0.88em;
  color: var(--color-on-surface-variant);
}

.rec-empty__clear {
  margin-block-start: 4px;
  padding: 2px 10px;
  background: none;
  border: 1px solid var(--color-outline);
  border-radius: var(--radius-xs);
  font-family: var(--font-main);
  font-size: 0.88em;
  color: var(--color-primary);
  cursor: pointer;
}

.rec-empty__clear:hover {
  background: var(--word-btn-hover);
}

/* ------------------------------------------------------------------ */
/* כותרת תחתונה                                                        */
/* ------------------------------------------------------------------ */

.open-footer {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  border-block-start: 1px solid var(--color-outline);
  background: var(--color-surface-container-high);
}

.open-footer__end {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* כיתוב, לא כפתור: הוא מוביל למסך ואינו מאשר דבר, ולכן אין לו גבול ואין לו
   מילוי — אותו משקל בדיוק כמו „נקה סינון” שברשימה. */
.open-discarded {
  padding: 2px 6px;
  background: none;
  border: none;
  border-radius: var(--radius-xs);
  font-family: var(--font-main);
  font-size: 0.88em;
  color: var(--color-primary);
  cursor: pointer;
}

.open-discarded:hover:not(:disabled) {
  background: var(--word-btn-hover);
}

.open-status {
  margin: 0;
  font-size: 0.88em;
  color: var(--color-on-surface-variant);
}

/* הטקסט על הכפתור הממולא הוא `--color-on-primary` ולא לבן קבוע — זה תפקידו
   ב-M3, והוא מגיע מהערכה גם במצב כהה. */
.open-btn {
  padding: 4px 16px;
  font-size: 1em;
  font-family: var(--font-main);
  background: var(--word-blue);
  color: var(--color-on-primary);
  border: none;
  border-radius: var(--radius-xs);
  cursor: pointer;
}

.open-btn:hover {
  background: var(--word-blue-dark);
}

/* משתמש שביקש „בלי תנועה” ביקש בלי תנועה — התבנית של ContextMenu ו-StatusBar. */
@media (prefers-reduced-motion: reduce) {
  .tpl-card,
  .open-browse,
  .rec-row,
  .rec-iconbtn,
  .rec-search__input {
    transition: none;
  }
}
</style>
