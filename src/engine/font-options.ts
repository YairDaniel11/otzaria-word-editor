/**
 * אפשרויות הגופן שהבוררים מציגים.
 *
 * למה לא רשימה קשיחה בקומפוננטה, כפי שהיה: רשימה קשיחה אינה יודעת מה יש
 * **במסמך**. ב-superdoc@2.8.0 `ui.fonts` מרכיב את האפשרויות מהגופנים שהמסמך
 * הפתוח משתמש בהם ומדביק עליהם ברירות מחדל (`composeFontFamilyOptions`), ולכן
 * מסמך שנכתב ב-Aptos או ב-Cambria מציג אותם בראש הבורר — בדיוק כמו Word.
 * רשימה קשיחה הציגה עשרה שמות שאין להם קשר למסמך, ובחירה בגופן שהמסמך משתמש
 * בו הייתה אפשרית רק אם ניחשנו אותו מראש.
 *
 * מה שהמנוע **אינו** יכול לדעת: הגופן שנארז עם התוסף (`styles/fonts.ts`)
 * וגופני העברית שאוצריא מזריקה לסביבה. הם מותקנים אחרי שהמנוע בנה את הרשימה
 * שלו, ולכן הם נשמרים כאן ותמיד עומדים בראש — משתמש שפותח מסמך עברי צריך
 * למצוא את Frank Ruhl בשורה הראשונה, לא אחרי Verdana.
 *
 * ומה ששניהם אינם יכולים לדעת: מה **מותקן במכונה**. הרשימה הזאת שונה אצל כל
 * משתמש, והיא מגיעה מ-`system-fonts.ts` — אסינכרונית, ולכן היא פרמטר ולא
 * קריאה מכאן. ראו שם למה אין דרך אחרת להשיג אותה.
 *
 * ## למה יש כאן `group`
 *
 * מנייה אמיתית מחזירה מאות משפחות — 294 נמדדו ב-Windows — ורשימה שטוחה בגודל
 * כזה אינה שמישה. הקיבוץ נקבע כאן ולא בקומפוננטה מפני שכאן יודעים **מאיזה
 * מקור** כל אפשרות הגיעה; אחרי המיזוג המידע הזה אבוד. ארבע קבוצות, בסדר הזה:
 *
 * | קבוצה | מה בה |
 * |---|---|
 * | `''` (בראש, בלי כותרת) | הגופנים שלנו וזנב הלטינית — מה שתמיד שם |
 * | „גופנים אחרונים” | מה שהמנוע מדווח מהמסמך, עד `RECENT_FONT_LIMIT` |
 * | „עברית” | מה שמכסה עברית |
 * | „כל הגופנים” | כל השאר |
 *
 * ## למה יש מכסה על „אחרונים”, ולמה מה שנחתך אינו נעלם
 *
 * הקבוצה הזאת גדלה מעצמה: המנוע מרכיב אותה מהגופנים שהמסמך משתמש בהם, ומאז
 * שיש תצוגה חיה (composables/font-preview.ts) גם גופן שרוחפים מעליו נכנס לרגע
 * לשימוש המסמך ומצטרף אליה. עשרים שמות בראש הבורר הם עשרים שמות שדוחפים את כל
 * השאר למטה, ורשימה שמשתנה תוך כדי גלילה היא רשימה שבורחת מתחת לעכבר.
 *
 * המכסה היא על **התצוגה בקבוצה**, לא על הזמינות: מה שנחתך ממנה נכנס שוב בסוף,
 * תחת „כל הגופנים”. גופן שהמסמך נכתב בו ואינו מותקן במכונה היה נעלם מהבורר
 * לגמרי אחרת — וזה בדיוק מה שהרשימה מהמנוע נועדה למנוע.
 *
 * הצורה של `ui` מוגדרת כאן מבנית ולא מיובאת: הבדיקה מעבירה כפיל, ומימוש של
 * `FontsHandle` המלא בכפיל היה מחייב גם את שלושת מסלולי ה-subscription שאין
 * להם קשר לאפשרויות.
 */
import type { FontFamilyOption, FontSizeOption } from 'superdoc/ui';
import { coversHebrew } from './docx-fonts';
import { emptyInstalledFonts, type InstalledFontsSnapshot } from './system-fonts';
import { WORD_FONT_SIZES } from './payloads';

/** כותרות הקבוצות בבורר. `''` הוא „בראש, בלי כותרת”. */
export const FONT_GROUP_TOP = '';
export const FONT_GROUP_RECENT = 'גופנים אחרונים';
export const FONT_GROUP_HEBREW = 'עברית';
export const FONT_GROUP_ALL = 'כל הגופנים';

/**
 * כמה גופנים מציגה קבוצת „אחרונים”. ראו „למה יש מכסה” בהערת הפתיחה.
 *
 * שישה: מספיק כדי שמסמך רגיל יראה את הגופנים שלו בראש, ומעט מספיק כדי שהם לא
 * ידחפו את הרשימה כולה מתחת לקו. מה שמעבר לזה זמין תחת „כל הגופנים”.
 */
export const RECENT_FONT_LIMIT = 6;

/** אפשרות גופן אחת, עם הקבוצה שלה ועם מה שידוע על כיסוי העברית שלה. */
export interface FontFamilyChoice extends FontFamilyOption {
  group: string;
  /**
   * הגופן מכסה עברית, ולכן הבורר מצייר לפני שמו דגימה של אותיות עבריות
   * (`RibbonCombo`) — שם לטיני של גופן עברי אינו מראה דבר על צורת האותיות.
   *
   * **לא** „גופן עברי” במובן של ייעוד: `Arial` ו-`Times New Roman` מכסים
   * עברית, והדגימה בהם אמיתית בדיוק כמו ב-`FrankRuhlCLM`. וזה גם הגבול —
   * דגימה בגופן שאינו מכסה עברית הייתה נופלת ל-fallback, כלומר מציגה את
   * האותיות של **גופן אחר** תחת שמו. כיסוי הוא מה שהופך אותה לאמת.
   *
   * הדגל נקבע במיזוג ולא בפקד מאותו טעם שהקבוצה נקבעת שם: רק אז יודעים מאיזה
   * מקור האפשרות באה. ואי אפשר לגזור אותו מהקבוצה — שש המשפחות שלנו יושבות
   * בראש הרשימה (`FONT_GROUP_TOP`) וכולן עבריות.
   */
  hebrew: boolean;
}

/** מה שהבוררים ב-Ribbon מציגים. */
export interface FontOptions {
  families: readonly FontFamilyChoice[];
  sizes: readonly FontSizeOption[];
}

/** ה-slice שהמנוע מדווח. שני השדות אופציונליים — נקרא בהגנה. */
export interface FontsSliceLike {
  options?: readonly FontFamilyOption[];
  sizeOptions?: readonly FontSizeOption[];
}

/** מה שנצרך מ-`superdoc.ui`. הכול אופציונלי: גרסה בלי `fonts` נופלת בחן. */
export interface FontOptionsSource {
  fonts?: {
    getFamilyOptions?: () => readonly FontFamilyOption[];
    getSizeOptions?: () => readonly FontSizeOption[];
    observe?: (listener: (slice: FontsSliceLike) => void) => () => void;
  };
}

/**
 * הגופנים שלנו. Assistant נארז עם התוסף ולכן זמין בכל פלטפורמה; השאר מוזרקים
 * על ידי אוצריא. `previewFamily` הוא מה שמאפשר לבורר להציג כל שם בגופן שלו,
 * כמו ב-Word.
 */
export const OTZARIA_FONT_FAMILIES: readonly FontFamilyOption[] = [
  { value: 'Assistant', label: 'Assistant', previewFamily: "'Assistant', sans-serif" },
  { value: 'FrankRuhlCLM', label: 'Frank Ruhl', previewFamily: "'FrankRuhlCLM', serif" },
  { value: 'TaameyDavidCLM', label: 'David', previewFamily: "'TaameyDavidCLM', serif" },
  { value: 'Rubik', label: 'Rubik', previewFamily: "'Rubik', sans-serif" },
  { value: 'Shofar', label: 'Shofar', previewFamily: "'Shofar', serif" },
  { value: 'NotoRashiHebrew', label: 'Rashi', previewFamily: "'NotoRashiHebrew', serif" },
];

/**
 * גופני הלטינית שהיו ברשימה הקשיחה. נשארים כזנב אחרי אפשרויות המנוע: Aptos
 * ו-Segoe UI אינם ברירות המחדל של המנוע, ובלעדיהם הגופן של Word 365 ושל
 * Windows היו נעלמים מהבורר.
 */
export const LATIN_FONT_FAMILIES: readonly FontFamilyOption[] = [
  { value: 'Aptos', label: 'Aptos', previewFamily: "'Aptos', sans-serif" },
  { value: 'Segoe UI', label: 'Segoe UI', previewFamily: "'Segoe UI', sans-serif" },
  { value: 'Times New Roman', label: 'Times New Roman', previewFamily: "'Times New Roman', serif" },
  { value: 'Arial', label: 'Arial', previewFamily: 'Arial, sans-serif' },
];

/** סולם הגדלים של Word, בצורת אפשרויות בורר. */
export const FALLBACK_FONT_SIZES: readonly FontSizeOption[] = WORD_FONT_SIZES.map((size) => ({
  value: String(size),
  label: String(size),
}));

/** שם הגופן שמזוהה עם ערך — ההשוואה חסרת רגישות לאותיות, כמו במנוע. */
function familyKey(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * מיזוג בסדר קבוע: שלנו, של המנוע, זנב הלטינית, ואז מה שמותקן במכונה —
 * העבריים ואחריהם השאר. כפילויות נופלות לפי הערך ולא לפי התווית, כי המנוע
 * והרשימה שלנו נותנים לאותו גופן תוויות שונות (`TaameyDavidCLM` מול „David”),
 * ורק הערך הוא מה שנשלח לפקודה.
 *
 * הכפילות היא גם מה שקובע את הקבוצה: גופן שכבר הופיע בראש נשאר בראש ואינו
 * חוזר תחת „כל הגופנים”. לכן Arial יופיע פעם אחת בלבד, למעלה, גם כשהמכונה
 * מדווחת עליו.
 */
export function mergeFontFamilies(
  engineOptions: readonly FontFamilyOption[] | undefined,
  installed: InstalledFontsSnapshot = emptyInstalledFonts(),
  covers: (family: string) => boolean = coversHebrew,
): readonly FontFamilyChoice[] {
  /**
   * שני מקורות לידיעה, ולא אחד: מה שהמנייה **אמרה** ומה שהדפדפן **מדד**.
   *
   * המנייה יודעת רק על מה שהיא מכירה — במסלול המארח סיווג אמיתי, ובמסלול
   * המדידה רשימת מועמדים מתוחזקת ביד (system-fonts.ts). המדידה עונה על כל שם
   * שנשאלת עליו, כולל גופן שהמסמך הביא ואיש לא כתב ברשימה. זה מה שתיקן את
   * „יש גופנים עם עברית שאינם מוצגים ככאלה”.
   */
  const isHebrew = (option: FontFamilyOption): boolean => {
    if (typeof option?.value !== 'string') return false;
    return installed.hebrew.has(familyKey(option.value)) || covers(option.value.trim());
  };

  const engine = engineOptions ?? [];

  /**
   * לכל מקור: הקבוצה שלו, מה שידוע מראש על כיסוי העברית (`true`/`false` =
   * המקור יודע, `undefined` = נשאל `isHebrew`), ומכסה על כמה יתווספו ממנו.
   *
   * שש המשפחות שלנו מסומנות `true` ואינן נמדדות: הן מוזרקות **אחרי** שהמנייה
   * רצה, ובמדידה הן תלויות גם בטעינת ה-`@font-face`. דגימה שנעלמת לשנייה
   * מ-Frank Ruhl ואז חוזרת גרועה משתי האפשרויות.
   *
   * `false` מפורש לזנב („כל הגופנים”) ולא `undefined`: הוא סוּנן בדיוק לפי
   * `isHebrew`, ומאות מדידות חוזרות אינן צריכות לקרות שוב.
   *
   * שני המקורות האחרונים הם רשימת המנוע **בשנית**: מה שנחתך מהמכסה נכנס שם,
   * אחרי הכול. הכפילות אינה תקלה — הלולאה מדלגת על מה שכבר נוסף — והיא מה
   * שמבטיח שגופן של המסמך לא ייעלם מהבורר בגלל המכסה.
   *
   * ולמה **שניים**: העודף מפוצל לפי כיסוי בדיוק כמו המותקנים, אחרת גופן עברי
   * שנחתך מהמכסה נחת ב„כל הגופנים” — הדגל שלו נכון והדגימה מוצגת, אבל הקבוצה
   * מכריזה את ההפך ממה שהשורה מראה. השורה העברית נכנסת מיד אחרי המותקנים
   * העבריים ולא בסוף, מפני ש-`buildComboRows` פותח כותרת בכל **החלפה** של
   * קבוצה: מקור עברי אחרי „כל הגופנים” היה מייצר כותרת „עברית” שנייה.
   */
  const engineHebrew = engine.filter(isHebrew);
  const sources: readonly (readonly [readonly FontFamilyOption[], string, boolean?, number?])[] = [
    [OTZARIA_FONT_FAMILIES, FONT_GROUP_TOP, true],
    [LATIN_FONT_FAMILIES, FONT_GROUP_TOP],
    [engine, FONT_GROUP_RECENT, undefined, RECENT_FONT_LIMIT],
    [installed.families.filter(isHebrew), FONT_GROUP_HEBREW, true],
    [engineHebrew, FONT_GROUP_HEBREW, true],
    [installed.families.filter((option) => !isHebrew(option)), FONT_GROUP_ALL, false],
    [engine, FONT_GROUP_ALL, false],
  ];

  const merged: FontFamilyChoice[] = [];
  const seen = new Set<string>();

  for (const [options, group, hebrew, limit] of sources) {
    // נספר מה ש**נוסף**, ולא מה שנסרק: מכסה שסופרת גם שמות שכבר הופיעו למעלה
    // הייתה מציגה קבוצה ריקה בדיוק כשהמסמך משתמש בגופנים שלנו.
    let added = 0;
    for (const option of options) {
      if (limit !== undefined && added >= limit) break;
      const value = typeof option?.value === 'string' ? option.value.trim() : '';
      if (value === '') continue;
      const key = familyKey(value);
      if (seen.has(key)) continue;
      seen.add(key);
      added += 1;
      merged.push({
        value,
        label: typeof option.label === 'string' && option.label.trim() !== '' ? option.label : value,
        previewFamily: option.previewFamily ?? value,
        group,
        hebrew: hebrew ?? isHebrew(option),
      });
    }
  }

  return disambiguate(merged);
}

/**
 * שתי אפשרויות שונות עם אותה תווית — ומה עושים.
 *
 * נצפה ברגע שהמארח התחיל למנות: הבורר הציג „David” פעמיים. אחת היא
 * `TaameyDavidCLM` שהתווית שלה אצלנו היא „David”, והשנייה היא `David` של
 * Windows. שתיהן לגיטימיות ושונות זו מזו, אבל למשתמש הן נראו כתקלה — ובחירה
 * ביניהן הייתה הגרלה.
 *
 * מי שמקבל את ההבהרה הוא מי שהתווית שלו **אינה** הערך: אצלו יש מה להוסיף
 * („David (TaameyDavidCLM)”), ואילו אצל `David` התוספת הייתה „David (David)”.
 * לכן ההבהרה חד-צדדית, וגם השם המערכתי נשאר נקי.
 */
function disambiguate(options: readonly FontFamilyChoice[]): readonly FontFamilyChoice[] {
  const seen = new Map<string, number>();
  for (const option of options) {
    const key = option.label.toLowerCase();
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }

  return options.map((option) => {
    const collides = (seen.get(option.label.toLowerCase()) ?? 0) > 1;
    if (!collides || option.label === option.value) return option;
    return { ...option, label: `${option.label} (${option.value})` };
  });
}

/**
 * גדלים: איחוד של מה שהמנוע מציע עם סולם Word, ממוין כמספרים. מיון לפי
 * מחרוזת היה מציב את 8 אחרי 72.
 */
export function mergeFontSizes(
  engineOptions: readonly FontSizeOption[] | undefined,
): readonly FontSizeOption[] {
  const byValue = new Map<number, FontSizeOption>();

  for (const option of [...(engineOptions ?? []), ...FALLBACK_FONT_SIZES]) {
    const parsed = Number.parseFloat(String(option?.value ?? ''));
    if (!Number.isFinite(parsed) || parsed <= 0 || byValue.has(parsed)) continue;
    byValue.set(parsed, {
      value: String(option.value),
      label: typeof option.label === 'string' && option.label.trim() !== '' ? option.label : String(option.value),
    });
  }

  return [...byValue.entries()].sort((a, b) => a[0] - b[0]).map(([, option]) => option);
}

/**
 * המיזוג כולו, משני המקורות שמגיעים בזמנים שונים: המנוע מדווח בכל פתיחת מסמך,
 * והמנייה נוחתת פעם אחת אחרי האתחול. פונקציה טהורה בכוונה — מי שמחזיק את שני
 * המקורות (App.vue) מרכיב מחדש כשאחד מהם משתנה.
 */
export function composeFontOptions(
  slice: FontsSliceLike | null | undefined,
  installed: InstalledFontsSnapshot = emptyInstalledFonts(),
  covers: (family: string) => boolean = coversHebrew,
): FontOptions {
  return {
    families: mergeFontFamilies(slice?.options, installed, covers),
    sizes: mergeFontSizes(slice?.sizeOptions),
  };
}

/** מה שמוצג לפני שיש מסמך פתוח, וגם אם `ui.fonts` אינו זמין בכלל. */
export function fallbackFontOptions(): FontOptions {
  return composeFontOptions(null);
}

/** קריאה בהגנה: גרסת מנוע בלי `fonts` מחזירה `undefined`, לא חריגה. */
function safeRead<T>(read: (() => T) | undefined): T | undefined {
  if (typeof read !== 'function') return undefined;
  try {
    return read();
  } catch (error) {
    console.warn('[otzaria-word] קריאת אפשרויות הגופן מהמנוע נכשלה', error);
    return undefined;
  }
}

/**
 * מה שהמנוע מדווח ברגע זה, **בלי** מיזוג.
 *
 * גולמי ולא ממוזג מפני שהמיזוג צריך גם את המנייה, והיא אינה שייכת לכאן: מי
 * שמחזיק את שני המקורות הוא זה שמרכיב.
 */
export function readFontSlice(ui: FontOptionsSource | null | undefined): FontsSliceLike {
  const fonts = ui?.fonts;
  return {
    options: safeRead(fonts?.getFamilyOptions?.bind(fonts)),
    sizeOptions: safeRead(fonts?.getSizeOptions?.bind(fonts)),
  };
}

/**
 * מאזינה למה שהמנוע מדווח. `observe` של המנוע יורה מיד עם ה-snapshot הנוכחי
 * ואז על כל שינוי, ולכן אין צורך בקריאה נפרדת לפניה. בלי האזנה הבורר היה קופא
 * על האפשרויות של הרגע שבו המסמך נפתח — והמנוע פותר את גופני המסמך אחרי זה.
 *
 * מחזירה disposer גם כשאין `observe`, כדי שאתר הקריאה לא יצטרך להבחין.
 */
export function observeFontSlice(
  ui: FontOptionsSource | null | undefined,
  listener: (slice: FontsSliceLike) => void,
): () => void {
  const fonts = ui?.fonts;
  const observe = fonts?.observe;

  if (typeof observe !== 'function') {
    listener(readFontSlice(ui));
    return () => {};
  }

  const gate = changeGate(listener);

  try {
    return observe.call(fonts, (slice) => gate(slice ?? {}));
  } catch (error) {
    console.warn('[otzaria-word] האזנה לאפשרויות הגופן נכשלה', error);
    listener(readFontSlice(ui));
    return () => {};
  }
}

/**
 * שער שמעביר רק דיווח ש**באמת** שונה מקודמו.
 *
 * למה זה נדרש, ולמה זה לא אופטימיזציה מוקדמת: המנוע מרכיב את ה-slice מחדש
 * ב-`computeState`, ומדלל אותו מול הקודם בהשוואה רדודה — כלומר לפי **זהות
 * המערך**. המערך נבנה מחדש בכל `recompute`, וביניהם `recompute("host-selection")`
 * שיורה על כל תזוזת סמן. התוצאה: הבורר נבנה מחדש בכל הקלדה, בזמן שהרשימה
 * זהה לחלוטין.
 *
 * עם 14 שמות זה היה בזבוז שאפשר לחיות איתו. מרגע שהמנייה מחזירה מאות משפחות
 * (system-fonts.ts) זה מיזוג מלא ובנייה מחדש של כל הרשימה — פר הקשה.
 *
 * ההשוואה לפי **ערכים** ולא לפי זהות אובייקט: המנוע מנרמל ובונה אובייקט חדש
 * לכל שורה בכל סבב, ולכן השוואת זהות לא הייתה מסננת דבר.
 */
function changeGate(listener: (slice: FontsSliceLike) => void): (slice: FontsSliceLike) => void {
  let previous: string | null = null;

  return (slice) => {
    const signature = sliceSignature(slice);
    if (signature === previous) return;
    previous = signature;
    listener(slice);
  };
}

/**
 * טביעת האצבע של slice: כל מה שמגיע לבורר, בסדר שהמנוע דיווח.
 *
 * גם `label` ו-`previewFamily` ולא הערך בלבד: המנוע פותר את תוויות המסמך אחרי
 * הפתיחה, ודיווח שמשנה רק תווית הוא שינוי שהבורר אמור להראות. חתימה על הערך
 * לבדו הייתה בולעת אותו.
 *
 * `JSON.stringify` ולא צירוף עם מפריד: שם גופן יכול להכיל כמעט כל תו,
 * ומפריד שמופיע בתוך שם היה מייצר שתי רשימות שונות עם אותה חתימה.
 */
function sliceSignature(slice: FontsSliceLike): string {
  const rows = (
    options: readonly { value?: unknown; label?: unknown; previewFamily?: unknown }[] | undefined,
  ): string[][] =>
    (options ?? []).map((option) => [
      String(option?.value ?? ''),
      String(option?.label ?? ''),
      String(option?.previewFamily ?? ''),
    ]);
  return JSON.stringify([rows(slice.options), rows(slice.sizeOptions)]);
}
