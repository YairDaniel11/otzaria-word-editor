/**
 * חוזה ה-payload של פקודות המנוע.
 *
 * למה מודול נפרד ולא ליטרל באתר הקריאה: ה-payload שפקד שולח הוא **חוזה** מול
 * ולידטור בתוך superdoc, לא ארגומנט שמועבר כמו שהוא. הוולידטור נכשל **סגור** —
 * `buildInlineFormatInput` מחזיר `null` על ערך שאינו מוכר, וה-controller מחזיר
 * `false` בלי לגעת במסמך. כלומר `{ fontFamily: 'X' }` נראה סביר לחלוטין בקוד
 * ובבדיקה, ולא מחיל כלום.
 *
 * בדיוק זה קרה: `{ fontFamily }`, `{ fontSize }`, `{ color }` ו-`{ zoom }` —
 * ארבעה payloads שנבנו לפי שם השדה של הפקודה, ולא לפי מה שהמנוע מחלץ. הבדיקה
 * שאישרה אותם השוותה מול mock שרשם ארגומנטים, ולכן לא יכלה לתפוס את זה.
 * הפונקציות כאן טהורות דווקא כדי שבדיקת החוזה
 * (tests/contract/command-payloads.test.ts) תריץ **אותן** מול הוולידטורים
 * האמיתיים של החבילה, ולא מול מחרוזת מועתקת.
 *
 * מה שהמנוע מחלץ, כפי שנמדד ב-superdoc@2.8.0:
 *
 * | פקודה                     | מה שמגיע לוולידטור         | מה שהוא מקבל          |
 * |---------------------------|----------------------------|------------------------|
 * | font-family               | `buildInlineFormatInput`   | סקלר או `{ value }`    |
 * | font-size                 | + `normalizeFontSizePayload`| מספר, `'16pt'`, `{value}`|
 * | text-color/highlight-color| + `normalizeColorPayload`  | `'#RRGGBB'` / `null`   |
 * | zoom                      | `normalizeZoomPayload`     | **מספר** אחוזים בלבד   |
 * | text-align                | `unwrapScalar([alignment])` | גם `{ alignment }`    |
 * | line-height               | `unwrapScalar([lineHeight])`| גם `{ lineHeight }`   |
 * | linked-style              | `unwrapScalar([style])`     | גם `{ style }`        |
 *
 * שתי השורות האחרונות הן הסיבה שהמפתחות `alignment`/`lineHeight`/`style`
 * נשארים כפי שהם: `unwrapScalar` מכיר אותם בשמם. `fontFamily`, `fontSize`,
 * `color` ו-`zoom` אינם ברשימה של אף unwrap — ולכן הם היו כשל שקט.
 */

/** יישור פסקה, בערכים שהמנוע מנרמל אליהם. */
export type ParagraphAlignment = 'left' | 'center' | 'right' | 'justify';

/**
 * סולם הגדלים של Word. `growFontSize` נע עליו ולא ב-+2 עיוור, כי זה מה שהמשתמש
 * מכיר: 12 → 14 → 16 → 18 → 20 → 24, ולא 12 → 14 → 16 → 18 → 20 → 22.
 */
export const WORD_FONT_SIZES: readonly number[] = [
  8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72,
];

/**
 * הגודל שמסמך חדש נפתח בו. משמש כמקור אחרון לבורר הגודל וללחצני הגדל/הקטן,
 * כשהמנוע לא מדווח גודל בכלל (בחירה מעורבת, או מסמך שעוד לא נטען).
 */
export const DEFAULT_FONT_SIZE_PT = 12;

/** מרווח השורות שמסמך חדש נפתח בו. */
export const DEFAULT_LINE_HEIGHT = 1.5;

/**
 * `w:spacing/@w:line` נמדד ב-240ths של שורה: 240 = שורה בודדת, 360 = 1.5.
 * המנוע מנרמל מכפיל ל-240ths בעצמו; הקבוע כאן משמש לכיוון ההפוך, מהערך
 * שהמנוע מדווח אל המכפיל שהבורר מציג.
 */
export const TWENTIETHS_PER_LINE = 240;

/* ------------------------------------------------------------------ */
/* פענוח ערכים — משמש גם לקלט מהבורר וגם למה שהמנוע מדווח               */
/* ------------------------------------------------------------------ */

/**
 * שם גופן מערך שהמנוע דיווח או מבחירה בבורר. `null` = אין ערך שאפשר להחיל
 * (בחירה מעורבת מדווחת `undefined`, ומחרוזת ריקה נדחית על ידי המנוע).
 */
export function parseFontFamily(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * גודל גופן בנקודות. מקבלת גם `'16pt'` (הצורה שה-v1 שלח וש-`fontSize` במסמך
 * עשוי לחזור בה) וגם `16` או `'16'` (הצורה שהמנוע מדווח, מ-`fontSizePt`).
 * חצאי נקודות נשמרים — המנוע מדווח 20.5 על טקסט כזה, ועיגול היה משנה אותו.
 */
export function parseFontSizePt(value: unknown): number | null {
  const raw = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseFloat(value.replace(/\s*pt$/i, '').trim()) : NaN;
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return raw;
}

/**
 * צבע ב-`#RRGGBB`. הצורה בלי `#` מתקבלת גם היא, כי המנוע מדווח את הצבע
 * שבמסמך והמסמך לא בהכרח כותב אותו עם `#`.
 */
export function parseColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toUpperCase();
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) return `#${trimmed.toUpperCase()}`;
  return null;
}

/**
 * מכפיל מרווח שורות. המנוע מנרמל מכפיל ל-240ths, ולכן ערך גדול מ-10 הוא
 * 240ths שצריך לחלק — וערך קטן ממנו הוא כבר מכפיל. אותו גבול שהמנוע עצמו
 * משתמש בו (`normalizeLineHeightPayload`), כדי ששתי ההמרות יסכימו.
 *
 * הערה: ב-superdoc@2.8.0 `line-height` הוא פקודת פסקה **בלי** `value` במצב
 * הפקד — נמדד ש-`routedCommandValue` מחזיר `undefined` עבורה. כלומר הכיוון
 * הזה אינו בשימוש כרגע, והוא כאן כדי שברגע שהמנוע יתחיל לדווח ערך, הבורר
 * ישקף אותו בלי שינוי נוסף.
 */
export function parseLineHeight(value: unknown): number | null {
  const raw = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseFloat(value.trim()) : NaN;
  if (!Number.isFinite(raw) || raw <= 0) return null;
  if (raw <= 10) return raw;
  return Math.round((raw / TWENTIETHS_PER_LINE) * 100) / 100;
}

/* ------------------------------------------------------------------ */
/* בניית payload                                                       */
/* ------------------------------------------------------------------ */

/**
 * `font-family`. סקלר ולא `{ fontFamily }`: ה-spec הוא `value-string`,
 * ו-`buildInlineFormatInput` מחלץ `payload.value` או את ה-payload עצמו —
 * מפתח בשם השדה נשאר אובייקט, ואובייקט אינו string.
 */
export function fontFamilyPayload(family: string): string | null {
  return parseFontFamily(family);
}

/**
 * `font-size`. מספר ולא `{ fontSize }`: ה-spec הוא `value-number`, והחילוץ
 * מגיע ל-`Number({ fontSize: '16pt' })` — כלומר `NaN`, כלומר כשל סגור.
 */
export function fontSizePayload(size: number | string): number | null {
  return parseFontSizePt(size);
}

/**
 * `text-color` / `highlight-color`. `{ value }` בכוונה ולא סקלר: זה המסלול
 * היחיד שמאפשר גם ניקוי — המנוע מתעד `if (value === null) return { target,
 * value: null }` כמסלול הניקוי, ומחרוזת ריקה נדחית שם במפורש.
 */
export function colorPayload(hex: string | null): { value: string | null } {
  if (hex === null) return { value: null };
  return { value: parseColor(hex) };
}

/**
 * `zoom`. אחוזים כמספר: `instanceCommandPayloadIsValid` דורש
 * `typeof payload === 'number'` אחרי הנרמול, ולכן `{ zoom: 1 }` נופל שם עוד
 * לפני `SuperDoc.setZoom`.
 *
 * מתחת ל-5% מוחזרת הצורה `'3%'`: `normalizeZoomPayload` מפרש מספר בטווח
 * `0..5` כשבר מדור v1 ומכפיל אותו ב-100, ולכן `3` היה הופך ל-300%. עם `%`
 * מפורש הוא מכבד את הערך כאחוזים.
 */
export function zoomPayload(percent: number): number | string | null {
  if (!Number.isFinite(percent) || percent <= 0) return null;
  return percent > 5 ? percent : `${percent}%`;
}

/**
 * `line-height`. המפתח `lineHeight` נשאר — `unwrapScalar` מכיר אותו בשמו,
 * וזו פקודה שעבדה. הפונקציה כאן כדי שכל בניית payload תהיה במקום אחד ותהיה
 * נבדקת מול אותו ולידטור.
 */
export function lineHeightPayload(multiplier: number): { lineHeight: number } | null {
  if (!Number.isFinite(multiplier) || multiplier <= 0) return null;
  return { lineHeight: multiplier };
}

/** `text-align`. המפתח `alignment` מוכר ל-`unwrapScalar`. */
export function alignmentPayload(alignment: ParagraphAlignment): { alignment: ParagraphAlignment } {
  return { alignment };
}

/** `linked-style`. המפתח `style` מוכר ל-`unwrapScalar`. */
export function stylePayload(styleId: string): { style: string } | null {
  const trimmed = styleId.trim();
  return trimmed === '' ? null : { style: trimmed };
}

/* ------------------------------------------------------------------ */
/* סולם הגדלים                                                         */
/* ------------------------------------------------------------------ */

/**
 * הגודל הבא בסולם של Word. גודל שאינו בסולם (למשל 20.5, שהמנוע מדווח על טקסט
 * כזה) עולה לערך הבא **מעליו** ולא ב-+2, וגודל בקצה נשאר בו: 72 הוא הגדול
 * ביותר בבורר, והחזרת 76 הייתה מציגה בבורר ערך שאינו בו.
 */
export function grownFontSize(current: number): number {
  const next = WORD_FONT_SIZES.find((size) => size > current);
  return next ?? WORD_FONT_SIZES[WORD_FONT_SIZES.length - 1];
}

/** הגודל הקודם בסולם. 8 הוא הקטן ביותר בבורר ולכן הוא הרצפה. */
export function shrunkFontSize(current: number): number {
  const smaller = WORD_FONT_SIZES.filter((size) => size < current);
  return smaller.length > 0 ? smaller[smaller.length - 1] : WORD_FONT_SIZES[0];
}

/**
 * הטווח שהמסמך עצמו מכיר: `w:sz` נמדד בחצאי נקודות (`ST_HpsMeasure`
 * ב-ECMA-376), ולכן 1638pt הוא הגדול ביותר שאפשר לכתוב שם — אותו טווח בדיוק
 * ש-Word מודיע עליו כשמקלידים גודל שאינו בו.
 */
export const MIN_FONT_SIZE_PT = 1;
export const MAX_FONT_SIZE_PT = 1638;

/**
 * מה שנחשב גודל שהוקלד: מספר, נקודה או פסיק עשרוני, ו-`pt` אופציונלי בסוף.
 *
 * למה רגקס ולא `Number.parseFloat`, שהיה כאן: הוא מקבל **פענוח חלקי** — כלומר
 * „12px” הוא 12, „12abc” הוא 12, ו„1 2” הוא 1. שלושת אלה הם שגיאות הקלדה שאף
 * אחד מהם אינו מזיק בפועל (הגודל שיצא הוא הספרות שהוקלדו), ואילו הרביעי כן:
 * **„12,5” יצא 12 בשקט.** פסיק הוא סימן העשרוני של המקלדת העברית ושל חצי
 * אירופה, ומי שהקליד 12,5 קיבל 12 בלי שום סימן שהחצי נבלע. מכאן שהמחרוזת
 * כולה חייבת להיות מספר, והפסיק ממופה לנקודה.
 *
 * `\d` הוא ASCII בלבד ב-JavaScript, ולכן ספרות ערביות-הודיות („١٢”) נדחות
 * כאן — אותה תשובה שהן קיבלו קודם מ-`parseFloat`, ובמפורש הפעם.
 */
const FONT_SIZE_INPUT = /^(\d+(?:[.,]\d*)?|[.,]\d+)\s*(?:pt)?$/i;

/**
 * גודל שהמשתמש **הקליד** בתיבה, בדרך אל הפקודה. `null` = אין כאן מספר, ואין
 * מה להחיל — התיבה חוזרת לגודל שבמסמך.
 *
 * שלוש הכרעות, ואף אחת מהן אינה מובנת מאליה:
 *
 * 1. **עיגול לחצי נקודה.** `w:sz` הוא חצאי נקודות, ולכן 12.3 ייכתב במסמך
 *    ממילא כ-12.5. תיבה שממשיכה להציג „12.3” מעל מסמך שמחזיק 12.5 היא תיבה
 *    שמשקרת, וזה בדיוק הפער שהבוררים כאן נבנו כדי לא לייצר.
 * 2. **הידוק לטווח ולא דחייה.** מי שהקליד 5000 התכוון לגדול שאפשר, והתיבה
 *    מציגה מיד 1638 — התשובה גלויה לעין, בלי דיאלוג השגיאה שנפתח ב-Word.
 * 3. **אפס ומטה נדחים.** בניגוד ל-5000, „0” או „-12” אינם כוונה שאפשר לכבד,
 *    והידוק שלהם ל-1 היה מחיל גודל שאיש לא ביקש.
 * 4. **המחרוזת כולה, ולא רישא שלה.** ראו `FONT_SIZE_INPUT`.
 */
export function parseFontSizeInput(text: string): number | null {
  const digits = FONT_SIZE_INPUT.exec(text.trim())?.[1];
  if (digits === undefined) return null;
  const parsed = parseFontSizePt(digits.replace(',', '.'));
  if (parsed === null) return null;
  const halves = Math.round(parsed * 2) / 2;
  return Math.min(MAX_FONT_SIZE_PT, Math.max(MIN_FONT_SIZE_PT, halves));
}

/* ------------------------------------------------------------------ */
/* תמונה                                                              */
/* ------------------------------------------------------------------ */

/**
 * **`create.image` מטמיע בייטים ואינו מפנה ל-URL.** נמדד במימוש
 * (`@superdoc/docx-engine`, שני המשפטים הראשונים ב-`create.image`):
 *
 *     const parsed = /^data:([^;,]+);base64,(.*)$/i.exec(input.src);
 *     if (!parsed) return failure('INVALID_INPUT',
 *       'create.image currently requires a base64 data URI.');
 *     ...
 *     if (parsed.format === 'webp') return failure('INVALID_INPUT',
 *       'create.image currently requires PNG or JPEG input.');
 *
 * ואחריהם הבייטים שנפרסו נכתבים ל-`/word/media/imageN.<ext>` ונרשמים ב-rels.
 *
 * למה זו נקודת אובדן נתונים, ולא פרט מימוש: בורר הקבצים של אוצריא מחזיר `url`
 * של שרת ה-loopback, והפורט שלו משתנה בכל הפעלה. URL כזה נדחה כאן **סגור** —
 * וזה למעשה מצב טוב, כי אם הוא היה מתקבל התמונה הייתה נשמרת כהפניה לקובץ
 * מקומי: שבורה בפתיחה הבאה, ושבורה לגמרי במסמך שיישלח למישהו אחר. לכן
 * `host/files.ts` קורא את הבייטים מה-loopback וממיר אותם ל-data URI, וזה
 * הדבר היחיד שנשלח למנוע.
 *
 * המידות אינן נשלחות: בהיעדר `size` המנוע קורא אותן מכותרת ה-PNG/JPEG שפירסר,
 * ושליחת מידות משלנו הייתה מחייבת לפרסר את הכותרת בעצמנו.
 */
export const EMBEDDABLE_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg'] as const;

/**
 * הסיומות שהבורר מציע. **צרה בכוונה** מול הרשימה הרחבה שאפשר היה לתת:
 * `webp` נפרס אך נדחה במפורש ב-`create.image`, ו-`gif`, `bmp`, `svg` ו-`tiff`
 * אינם מגיעים לפרסר בכלל (המסלול היחיד הוא png/jpeg/webp). סיומת שהמנוע ידחה
 * אחרי שהמשתמש בחר קובץ היא כפתור שנראה עובד — בדיוק מה שנמנע כאן.
 */
export const EMBEDDABLE_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg'] as const;

/**
 * ה-mime של קובץ לפי שמו, או `null` לסיומת שהמנוע אינו מטמיע.
 *
 * לפי הסיומת ולא לפי `Content-Type` של שרת ה-loopback: השרת מגיש קבצי משתמש
 * ואינו מבטיח mime מדויק (`application/octet-stream` הוא תשובה חוקית שלו),
 * וה-mime שנכתב ל-data URI הוא זה שקובע לאיזה מסלול המנוע ינתב את הבייטים.
 */
export function imageMimeForFileName(name: string): (typeof EMBEDDABLE_IMAGE_MIME_TYPES)[number] | null {
  const extension = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (extension === 'png') return 'image/png';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  return null;
}

/**
 * אותו שער שהמנוע מפעיל, מוקדם יותר: אם ה-src אינו data URI של PNG/JPEG,
 * `create.image` יחזיר `INVALID_INPUT` עם הודעה באנגלית. עדיף לעצור כאן ולהציג
 * הסבר בעברית.
 *
 * `image/jpg` אינו ברשימה למרות שהמנוע מקבל גם אותו: אנחנו אלה שבונים את
 * ה-data URI, ואין סיבה לייצר שתי צורות לאותו פורמט.
 */
const EMBEDDABLE_IMAGE_SRC = /^data:(?:image\/png|image\/jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;

export function isEmbeddableImageSrc(src: unknown): boolean {
  return typeof src === 'string' && EMBEDDABLE_IMAGE_SRC.test(src);
}

/**
 * ה-payload של פקודת `image`. המפתח `src` הוא מה ש-`executeCreateCommand`
 * מחלץ (`record.src ?? record.value`), וה-`at` נקבע על ידי המנוע מהסמן —
 * ולכן אינו נשלח מכאן.
 *
 * `alt` בלבד ולא גם `title`: נמדד שהמנוע כותב `name: alt ?? title` ל-
 * `wp:docPr/@name` ואחר כך `description: title ?? alt` ל-`wp:docPr/@descr`,
 * כלומר ערך אחד ממלא את שני השדות ושליחת שניהם רק מפצלת אותם.
 */
export function imagePayload(input: { src: string; alt?: string }): { src: string; alt?: string } | null {
  if (!isEmbeddableImageSrc(input.src)) return null;
  const alt = input.alt?.trim();
  return alt ? { src: input.src, alt } : { src: input.src };
}

/* ------------------------------------------------------------------ */
/* קישור                                                              */
/* ------------------------------------------------------------------ */

/**
 * הסכימות שמותר לשלוח למנוע — היתר מפורש, ולא שלילה של מה שנזכר.
 *
 * `javascript:` אינו כתובת חסרת טעם אלא הרצת קוד בהקשר של מי שיפתח את המסמך,
 * ו-`data:` הוא אותו דבר בעטיפה אחרת. רשימת שלילה הייתה מפספסת את הצורה הבאה
 * שאיש לא חשב עליה; רשימת היתר נכשלת סגור על כל מה שאינה מכירה.
 *
 * `otzaria:` הוא קישור פנימי לספרייה (`otzaria://open/book/12?index=57`).
 * האפליקציה מפעילה אותו רק בלחיצת משתמש ורק לפעולות פתיחה, ומחוץ לאוצריא הוא
 * כתובת שאין לה מטפל — כלומר אין בו יותר כוח מקישור רגיל.
 */
export const LINK_SCHEMES = ['http:', 'https:', 'mailto:', 'otzaria:'] as const;

/**
 * הכתובת בצורתה הקנונית, או `null` אם אין לשלוח אותה למנוע.
 *
 * `new URL` ולא regex: הוא הפרסר שגם הדפדפן וגם Word ישתמשו בו, והוא זה
 * שיודע ש-`java\nscript:alert(1)` הוא `javascript:` — תווי בקרה מושמטים
 * בפרסור, ובדיקת תחילית על המחרוזת הגולמית הייתה מפספסת אותו.
 *
 * מוחזר `url.href` ולא מה שהמשתמש הקליד: זו הצורה שנבדקה, והיא היחידה
 * שמובטח שאין בה תווי בקרה שיישברו בתוך `w:hyperlink`. המחיר הוא לוכסן סוגר
 * שנוסף לדומיין חשוף (`https://foo.com` → `https://foo.com/`), וזו גם הצורה
 * שדפדפן מציג.
 *
 * כתובת בלי סכימה נדחית ואינה מושלמת ל-`https://` לבדה: השלמה כזאת מנחשת מה
 * המשתמש התכוון, והנחיה בדיאלוג עדיפה על ניחוש שנכתב למסמך.
 */
export function normalizeLinkHref(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (!(LINK_SCHEMES as readonly string[]).includes(url.protocol)) return null;
  return url.href;
}

/** מה שהדיאלוג צריך להציג כשהכתובת נדחתה. נוסח אחד, במקום אחד. */
export const LINK_HREF_HINT =
  'הכתובת חייבת להתחיל ב-https://‏, ב-mailto: או ב-otzaria://';

/**
 * ה-payload של פקודת `link`, לפי מה ש-`executeLinkCommand` מחלץ:
 *
 * | שדה     | מה המנוע עושה איתו                                          |
 * |---------|-------------------------------------------------------------|
 * | `href`  | `readLinkPayloadHref` — `href` או `value`, ואז `trim`        |
 * | `text`  | `readLinkPayloadText` — רק במסלול `hyperlinks.insert`        |
 * | `target`| `readLinkPayloadTarget` — הראשון שנבדק, לפני ה-capture       |
 *
 * `target` נשלח מפני שהדיאלוג גוזל את המיקוד מהעורך. `linkPayloadHasExplicitTarget`
 * הוא מה שמאפשר לפקודה לרוץ בלי בחירה חיה — ובלעדיו `commandSelectionIsReady`
 * היה נכשל, והקישור היה נכתב על טווח שכבר לא קיים או לא נכתב בכלל.
 *
 * `text` אינו נשלח כשיש טווח מסומן: המסלול אז הוא `hyperlinks.wrap`, שמעטיף
 * את הטקסט הקיים ומתעלם מ-`text` לגמרי. שליחתו הייתה יוצרת ציפייה שהטקסט
 * המסומן יוחלף.
 */
export function linkPayload(input: {
  href: string;
  /** הטקסט להצגה. משמש רק כשאין טווח מסומן. */
  text?: string;
  /** ה-`TextTarget` שנתפס מהבחירה לפני שהדיאלוג נפתח. */
  target?: unknown;
}): { href: string; text?: string; target?: unknown } | null {
  const href = normalizeLinkHref(input.href);
  if (href === null) return null;

  const text = input.text?.trim();
  return {
    href,
    ...(text ? { text } : {}),
    ...(input.target ? { target: input.target } : {}),
  };
}
