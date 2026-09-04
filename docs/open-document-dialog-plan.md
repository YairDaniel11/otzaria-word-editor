# מסך „פתח קובץ” — תוכנית עבודה

מסך פתיחה מודרני שמחליף את הקפיצה הישירה לבורר הקבצים של אוצריא: למעלה
כרטיסי תבנית מרובעים (מסמך ריק, ותבניות ערוכות לספרי קודש), ולמטה רשימת
המסמכים שנפתחו לאחרונה.

## מה קובע את הגבולות

ארבע החלטות שהתקבלו לפני הכתיבה, וכל אחת מהן חוסמת ענף שלם של עבודה:

1. **פופאפ מהרצועה בלבד.** „פתח קובץ”, „מסמך חדש”, ‏Ctrl+O ו-Ctrl+N פותחים
   אותו. אין מסך פתיחה אוטומטי כשאין מסמך — הוא היה מתנגש עם שחזור ההפעלה
   (`restoreTabs`) ועם מסך הטעינה, ושניהם כבר מציירים על אותו אזור.
2. **„שני טורים” נכתב כ-`w:cols` אמיתי, עם אזהרה בכרטיס.** המנוע ממלא
   טורים שמאל→ימין גם ב-`w:bidi` (נמדד; ראו `rtlColumnNote` ב-page-setup.ts
   ו-`scripts/qa/column-selection-probe.mjs`), והייצוא נכון. הכרטיס אומר את
   זה מראש במקום שהמשתמש יגלה אחרי שהקליד עמוד.
3. **חמש תבניות:** ריק, ספר קודש בשני טורים, מהדורה מבוארת, מסמך עם דף שער,
   קונטרס A5.
4. **„אחרונים” מלא:** רשימה, הסרה, הצמדה וחיפוש.

## מה כבר קיים ואין לכתוב מחדש

| צורך | מה שכבר במאגר |
|---|---|
| בורר קבצים של אוצריא | `pickDocxFile` — host/files.ts |
| פתיחת token שמור מהפעלה קודמת | `resolveFileUrl` — host/files.ts |
| „לשמור לפני שפותחים אחר” | `decideDocumentSwitch` — sessions/open-flow.ts |
| פתיחה לטאב הנכון | `ensureOpenTargetTab` / `openDocument` — App.vue |
| גיל במילים („לפני שעתיים”) | `draftAgeLabel` — sessions/session-state.ts |
| KV של אוצריא | `storage.get/set` דרך `tryCall` — host/settings.ts |
| גודל נייר, שוליים, טורים, מספור, כותרת רצה | engine/page-setup.ts, engine/header-footer.ts |
| ברירות מחדל עבריות למסמך חדש | `applyHebrewDocumentDefaults` — engine/document-defaults.ts |
| מודאל עם מלכודת מיקוד ו-`aria-modal` | `AboutDialog.vue` הוא התקדים |

## החוזים — נקבעים כאן כדי שכל הסוכנים יעבדו במקביל

### `src/sessions/recent-documents.ts` (טהור, נבדק בלי גשר)

```ts
export interface RecentDocument {
  token: string;      // fs token של אוצריא; שורד הפעלות, ה-URL לא
  name: string;
  size: number;       // 0 = לא דווח
  openedAt: number;   // Date.now() בפתיחה האחרונה
  pinned: boolean;
}

export const MAX_RECENT_DOCUMENTS = 20;   // מוצמדים אינם נספרים בתקרה

export function normalizeRecents(raw: unknown): RecentDocument[];
export function rememberRecent(list, entry: Omit<RecentDocument,'pinned'>): RecentDocument[];
export function forgetRecent(list, token: string): RecentDocument[];
export function setRecentPinned(list, token: string, pinned: boolean): RecentDocument[];
export function filterRecents(list, query: string): RecentDocument[];
export function sortedRecents(list): RecentDocument[];  // מוצמדים ראשונים, ואז לפי openedAt יורד
```

הכללים שהבדיקות מקבעות: `token` חוזר מעדכן במקום להכפיל; הצמדה שורדת את
התקרה; ערך פגום נשמט ואינו פוסל את הרשימה; חיפוש מנרמל גרשיים ורווחים.

### `src/host/settings.ts` — תוספת

```ts
export async function loadRecentDocuments(): Promise<unknown>;   // גולמי; הפירוש ב-normalizeRecents
export async function saveRecentDocuments(list: readonly RecentDocument[]): Promise<void>;
```

מפתח `recent-documents`. אותה תבנית כמו `loadSessionRecord`: הגשר מחזיר
גולמי, והפירוש יושב במודול נבדק.

### `src/engine/templates.ts`

```ts
export type TemplateId = 'blank' | 'two-column' | 'annotated' | 'title-page' | 'kuntres-a5';

export interface TemplatePreview {   // מודל ציור, לא SVG קשיח
  columns: 1 | 2;
  hasTitleBlock: boolean;
  hasRunningHead: boolean;
  hasFootnoteBand: boolean;
  ratio: 'a4' | 'a5';
}

export interface DocumentTemplate {
  id: TemplateId;
  label: string;
  hint: string;
  note?: string;         // „הטורים מצוירים הפוך בעורך; הקובץ נשמר נכון”
  preview: TemplatePreview;
}

export const DOCUMENT_TEMPLATES: readonly DocumentTemplate[];
export function findTemplate(id: string): DocumentTemplate | undefined;
export async function applyTemplate(host, id: TemplateId): Promise<CommandOutcome>;
```

`applyTemplate` רץ **אחרי** ש-`openDocument()` פתח מסמך ריק, ומשתמש רק
במשטחים הציבוריים שכבר יש להם צרכן במאגר: `applyPaperSize`,
`applyPageMargins`, `applyColumns`, `ensureHeaderFooter`, `applyPageNumbering`,
`doc.insert`, `doc.create.paragraph`, `doc.format.paragraph.*`. כשל בשלב אחד
אינו מבטל את המסמך — הוא חוזר כ-`CommandOutcome` עם הודעה, והמסמך נשאר
פתוח עם מה שכן הוחל.

### `src/ui/panels/OpenDocumentDialog.vue`

```
props:  isOpen, templates, recents, busy, searchQuery
emits:  close, browse, create-from-template(id), open-recent(token),
        toggle-pin(token, pinned), forget-recent(token), update:searchQuery
```

הקומפוננטה **אינה** קוראת ל-storage ואינה מכירה את הגשר. כל המצב מגיע
כ-props, וכל פעולה יוצאת כאירוע — אותו קו בדיוק כמו `FindReplaceDialog`
ו-`MacrosDialog`.

## שלבים

| # | שלב | קבצים בבעלות | מצב |
|---|---|---|---|
| 1 | **עיצוב** — מפרט חזותי מלא | `docs/open-document-dialog-design.md` (1039 שורות) | ✅ |
| 2 | **אחרונים** — מודל + אחסון + בדיקות | sessions/recent-documents.ts, host/settings.ts, tests/unit/recent-documents.test.ts | ✅ 35 בדיקות |
| 3 | **תבניות** — הגדרות + צנרת החלה + בדיקות | engine/templates.ts, tests/unit/templates.test.ts | ✅ 22 בדיקות |
| 4 | **הקומפוננטה** — לפי מפרט העיצוב | ui/panels/OpenDocumentDialog.vue, tests/component/open-document-dialog.test.ts | ✅ 38 בדיקות |
| 5 | **חיווט** — App.vue, הקיצורים | App.vue, ui/ribbon/i18n.ts | ✅ |
| 6 | **אימות** — כולל שער בדפדפן | scripts/open-dialog-probe.mjs (`npm run check:open-dialog`) | ✅ 30 טענות |

שלבים 2–4 רצו במקביל: אין ביניהם קובץ משותף, והחוזים למעלה נקבעו מראש.

## שני שינויים מעבר לתוכנית, ולמה

**A5 נוסף ל-`PAPER_SIZES`.** `page-setup.ts` הכיר A4 ו-Letter בלבד, ולכן
„קונטרס A5” נכתב תחילה כ-A4 עם `note` שמודיע על הפער — בעוד שהכרטיס מצייר
גיליון קטן. זה בדיוק „התצוגה המקדימה מבטיחה מה שהקובץ אינו מקיים” שהמפרט
אוסר. הפער נסגר במקורו: `'a5'` (148 × 210 מ״מ, `w:code` 11) הוא עכשיו גודל
מלא, ו-`applyPaperSize` מקבל אותו כמו כל אחר. תופעת לוואי מכוונת — הוא זמין
גם בבורר גודל הנייר בלשונית „פריסה”, וזהו הגודל השני בשכיחותו בספרי קודש.

**`onNewDocument` מחזירה `boolean`.** „מסמך חדש מתבנית” חייב לדעת אם מסמך
אכן נפתח: החלת תבנית אחרי פתיחה שבוטלה הייתה נוגעת במסמך **הקודם**, שנשאר על
המסך. זו הסיבה היחידה לערך המוחזר.

## מה נמדד בדפדפן ולא ב-jsdom

`scripts/open-dialog-probe.mjs` מריץ את ה-dist הארוז בשלושה רוחבי חלון
(1440/800/520) ומודד: מספר העמודות ברשת בכל אחד (5/4/2), שהגיליון מצויר
ברוחב אמיתי וביחס של דף, שגיליון ה-A5 מוקטן ל-148/210 (נמדד 0.7048), שאין
גלילה אופקית בגוף הדף, שהרשימה בכיווניות שמציבה את פס הגלילה בימין, ושהשורה
בלי גיל ובלי גודל אינה מציגה „0 בייט”. הוא גם מצלם — `tmp/open-dialog-*.png`.

## שערים שהעבודה הזאת חייבת לעבור

* `npm run typecheck && npm run test && npm run build && npm run check:dist`
* `tests/component/no-unresolved-components.test.ts` — כל קומפוננטה מיובאת
* `tests/unit/css-hygiene.test.ts` — צבע/גופן דרך טוקן בלבד, בלי ערך קשיח
* `npm run check:rtl` — הדיאלוג הוא RTL, והוא נמדד ולא מוצהר
* אין אייקון חדש ב-`icons.ts` בלי רישום ב-THIRD_PARTY_NOTICES.md
  (`npm run check:icons`) — לכן התצוגות המקדימות של התבניות מצוירות
  כ-SVG של הפרויקט **בתוך הקומפוננטה**, ואינן נכנסות לסט האייקונים.

## מה נשאר בחוץ, ולמה

* **מסך פתיחה אוטומטי** — ראו החלטה 1.
* **תבניות מקובץ `.docx` ארוז** — היו נותנות סגנונות אמיתיים, אבל דורשות
  נכס בינארי חדש בכל אריזה ובנייה שלו מחוץ למאגר. ההחלה דרך ה-API הציבורי
  נבדקת ביחידה, ומשתמשת בקוד שכבר קיים.
* **תצוגה מקדימה של תוכן הקובץ ברשימת האחרונים** — דורשת לקרוא כל קובץ
  בפתיחת הדיאלוג. שם, גודל, וזמן הם מה שיש בלי לגעת בדיסק.
