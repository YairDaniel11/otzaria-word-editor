/**
 * רישום כלי „שולחן העורך” כ**כלים מובנים** של ערכת המאקרו (superdoc-macros
 * 0.9.0, `registerTool`): הם מופיעים בדיאלוג ניהול המאקרו לצד ההקלטות
 * והסקריפטים, רצים תחת אותו שומר ריצה-אחת, וניתן להצמיד להם קיצור מקלדת
 * שנשמר בין הפעלות.
 *
 * הכלים כאן רצים עם **ברירות המחדל** — קיצור מקלדת אינו פותח דיאלוג. מי
 * שרוצה לכוונן (אחוז הגדלה, סוג סוגריים, אילו תיקונים) עובר דרך לשונית
 * „שולחן העורך” ברצועה, ששם הדיאלוגים.
 */
import type { MacroKit, MacroOutcome } from 'superdoc-macros';
import type { ShulchanTarget } from './shulchan-doc';
import { copyFixSummaryText, defaultTyposOptions, runCopyFix, runTypos, typosSummaryText } from './typos';
import { defaultAlternatingOptions, runTextAlternating, alternatingSummaryText } from './text-alternating';
import { convertBracketsToFootnotes, convertFootnotesToBrackets, conversionSummaryText } from './brackets-notes';
import { applyFirstWordDesign, defaultFirstWordOptions, firstWordSummaryText, removeFirstWordDesign } from './first-word';
import { applyExactLineSpacing, lineSpacingSummaryText, removeExactLineSpacing } from './line-spacing';

/**
 * ממפה תוצאת כלי ל-MacroOutcome של הערכה. סיכום ההצלחה נמסר החוצה דרך
 * `onSummary` — ל-outcome תקין אין שדה הודעה, ושורת המצב עדיין צריכה לומר
 * מה קרה.
 */
function toOutcome(
  result: { ok: boolean; message?: string },
  summary: string,
  onSummary: (text: string) => void,
): MacroOutcome {
  if (!result.ok) return { ok: false, message: result.message ?? 'הפעולה נכשלה' };
  onSummary(summary);
  return { ok: true };
}

/**
 * רושמת את הכלים על ה-kit של המסמך הפתוח. נקראת פעם אחת לכל התקנה —
 * ה-kit נבנה מחדש בכל פתיחת מסמך, ולכן אין צורך בביטול רישום.
 */
export function registerShulchanTools(
  kit: MacroKit,
  host: () => ShulchanTarget,
  onSummary: (text: string) => void,
): void {
  /* `kit.registerTool` זורק על id כפול או שם פסול, והקריאה לכאן יושבת על
     מסלול פתיחת המסמך: חריגה כאן הייתה מפילה פתיחה של מסמך בגלל לשונית
     כלים. הכלים הם תוספת, לא תנאי — מי שלא נרשם פשוט אינו מופיע בדיאלוג,
     והלשונית ברצועה עובדת בלעדיו. */
  const register: MacroKit['registerTool'] = (tool) => {
    try {
      kit.registerTool(tool);
    } catch (error) {
      console.warn(`[otzaria-word] רישום הכלי ${tool.id} נכשל`, error);
    }
  };

  register({
    id: 'shulchan.typos',
    name: 'שולחן העורך: שגיאות מצויות',
    description: 'תיקון שגיאות הקלדה נפוצות בכל המסמך, בברירות המחדל',
    run: async () => {
      const result = await runTypos(host(), defaultTyposOptions());
      return toOutcome(result, typosSummaryText(result), onSummary);
    },
  });

  register({
    id: 'shulchan.copy-fix',
    name: 'שולחן העורך: תיקון העתקה מתוכנות',
    description: 'רווחים קשיחים שהגיעו מהדבקה הופכים לרווחים רגילים, בפסקאות המסומנות',
    run: async () => {
      const result = await runCopyFix(host());
      return toOutcome(result, copyFixSummaryText(result), onSummary);
    },
  });

  register({
    id: 'shulchan.text-alternating',
    name: 'שולחן העורך: טקסט מתחלף',
    description: 'הדגשת דיבור-המתחיל בפסקאות המסומנות (: עד .)',
    run: async () => {
      const result = await runTextAlternating(host(), defaultAlternatingOptions());
      return toOutcome(result, alternatingSummaryText(result), onSummary);
    },
  });

  register({
    id: 'shulchan.brackets-to-notes',
    name: 'שולחן העורך: סוגריים ⟵ הערות',
    description: 'כל קטע בסוגריים עגולים בפסקאות המסומנות הופך להערת שוליים',
    run: async () => {
      const result = await convertBracketsToFootnotes(host(), 'round');
      return toOutcome(result, conversionSummaryText(result, 'to-notes'), onSummary);
    },
  });

  register({
    id: 'shulchan.notes-to-brackets',
    name: 'שולחן העורך: הערות ⟵ סוגריים',
    description: 'תוכן הערות השוליים שבבחירה חוזר לגוף בסוגריים עגולים',
    run: async () => {
      const result = await convertFootnotesToBrackets(host(), 'round');
      return toOutcome(result, conversionSummaryText(result, 'to-brackets'), onSummary);
    },
  });

  register({
    id: 'shulchan.first-word',
    name: 'שולחן העורך: עיצוב מילה ראשונה',
    description: 'הגדלה והדגשה של המילה הראשונה בפסקאות המסומנות, בברירות המחדל',
    run: async () => {
      const result = await applyFirstWordDesign(host(), defaultFirstWordOptions());
      return toOutcome(result, firstWordSummaryText(result, false), onSummary);
    },
  });

  register({
    id: 'shulchan.first-word-remove',
    name: 'שולחן העורך: הסרת עיצוב מילה ראשונה',
    description: 'ניקוי העיצוב הישיר של המילה הראשונה בפסקאות המסומנות',
    run: async () => {
      const result = await removeFirstWordDesign(host());
      return toOutcome(result, firstWordSummaryText(result, true), onSummary);
    },
  });

  register({
    id: 'shulchan.line-spacing',
    name: 'שולחן העורך: מרווח שורות אחיד',
    description: 'קיבוע מרווח „בדיוק” בגובה שורה של גופן הגוף, בפסקאות המסומנות',
    run: async () => {
      const result = await applyExactLineSpacing(host());
      return toOutcome(result, lineSpacingSummaryText(result, false), onSummary);
    },
  });

  register({
    id: 'shulchan.line-spacing-remove',
    name: 'שולחן העורך: ביטול מרווח אחיד',
    description: 'החזרת מרווח „בדיוק” למרווח „מרובה” שקול, בפסקאות המסומנות',
    run: async () => {
      const result = await removeExactLineSpacing(host());
      return toOutcome(result, lineSpacingSummaryText(result, true), onSummary);
    },
  });
}
