/**
 * גופן שהמסמך מבקש ואינו קיים במכונה — ומה לשים במקומו.
 *
 * ## מה נשבר בלי זה
 *
 * `<w:lineRule w:val="auto"/>` — ברירת המחדל של Word — גוזר את גובה השורה
 * **ממדדי הגופן שנבחר בפועל**, ולא ממספר קבוע. כשהגופן קיים, הגובה נכון.
 * כשהוא חסר, הדפדפן נופל לגופן ברירת מחדל שה-ascent וה-descent שלו גדולים
 * בהרבה, וכל שורה גדלה איתם.
 *
 * נמדד על מסמך אמיתי: כותרות ב-`FrankRuehl DP` (אינו מותקן) קיבלו פסיעה של
 * 27.75pt במקום 18.75pt — 48% יותר — בזמן שהטקסט הרגיל, ב-`FrankRuehl` שכן
 * מותקן, יצא 17.25pt בדיוק כמו ב-Word. אותו מסמך, אותו `lineRule`, אותו מנוע;
 * ההבדל היחיד הוא אם הגופן נמצא.
 *
 * ## למה Word לא סובל מזה
 *
 * מפני שהמידע נמצא **בתוך הקובץ**. `word/fontTable.xml` מתאר כל גופן שהמסמך
 * משתמש בו, גם כזה שאינו מותקן: `w:panose1` — עשרה מספרים שמתארים את צורת
 * האות, ו-`w:sig` — אילו טווחי יוניקוד ודפי קוד הגופן מכסה. Word בוחר תחליף
 * **לפי הסיווג הזה**, ולכן המדדים יוצאים דומים.
 *
 * הדפדפן לעולם אינו רואה את הטבלה הזאת: בשבילו `font-family` היא מחרוזת, והוא
 * בוחר לפי **סדר ברשימה**. מה שהקובץ הזה עושה הוא להעביר לדפדפן את ההחלטה
 * ש-Word מקבל — לקרוא את הטבלה, ולכתוב ממנה כללי `@font-face`.
 *
 * ## המגבלה שקובעת את הצורה: `local()` רואה רק גופנים מותקנים
 *
 * נמדד, ולא הונח: גופן שקיים רק כ-`@font-face` מוזרק — וכך בדיוק אוצריא מגישה
 * את הגופנים שלה ל-WebView — **אינו נגיש** ל-`src: local()`. אותו קובץ, אותם
 * בייטים: דרך `local()` הפסיעה נשארה שבורה, ודרך `url(data:…)` היא התיישרה.
 *
 * לכן יש כאן שני מסלולים, בסדר הזה:
 *
 * 1. **בייטים מאוצריא** — `fonts.resolveFamilies` מחזירה `@font-face` מוכן עם
 *    הגופן הארוז או גופן מערכת. זה המסלול היחיד שעובד גם במכונה שאין בה כלום.
 * 2. **`local()`** — שרשרת של גופנים עבריים שסביר שמותקנים. אינו דורש דבר
 *    מאוצריא, ומכסה כל Windows שיש בו גופן עברי כלשהו.
 *
 * ## הכלל: לגעת רק במה שחסר
 *
 * גופן שנפתר — לא נוגעים בו. גופן שאינו מצהיר על כיסוי עברי — לא נוגעים בו:
 * ה-fallback הלטיני של הדפדפן סביר, והחלפה שלו היא התערבות בלי סיבה. וכל
 * כשל בדרך — אין טבלה, אין canvas, אין SDK — משאיר את המסמך כמות שהוא.
 */
import { tryCall } from '../host/otzaria-client';
import type { ResolveFontFamiliesResult } from '../types/otzaria_plugin';

/** גופן כפי ש-`word/fontTable.xml` מצהיר עליו. */
export interface DeclaredFont {
  name: string;
  /** `roman` | `swiss` | `modern` | `script` | `decorative` | `auto` */
  family: string | null;
  /** ערך `w:charset`, בהקסה כפי שהוא בקובץ. `B1` = עברית. */
  charset: string | null;
  /** עשר הספרות של PANOSE, או `null` כשלא הוצהר. */
  panose: string | null;
  /**
   * האם זהו גופן **עברי ייעודי** — ולא סתם גופן שיש בו עברית.
   *
   * ההבחנה הזאת אינה קוסמטית: `Arial` מצהיר `csb0="000001FF"`, ובתוכו גם
   * הביט של דף הקוד העברי — כי באמת יש בו עברית. גופן כזה, אם הוא חסר, אינו
   * אמור לקבל תחליף עברי: הטקסט שנכתב בו הוא לרוב לטיני, ושרשרת עברית הייתה
   * משנה את מראהו בלי סיבה. ראו `declaresHebrew`.
   */
  hebrew: boolean;
}

/** ה-id של הסגנון שמחזיק את הכללים. אחד, ונדרס בכל מסמך. */
export const FONT_ALIAS_STYLE_ID = 'otzaria-doc-font-aliases';

/**
 * דף הקוד העברי (1255) ב-`w:csb0`, וטווח היוניקוד העברי ב-`w:usb0`.
 *
 * שני סימנים ולא אחד מפני שגופנים עבריים ותיקים ממלאים רק את אחד מהם:
 * `FrankRuehl DP` מצהיר `usb0="00000803"` (ביט 11) ו-`csb0="00000021"`
 * (ביט 5), ויש כאלה שמצהירים רק charset.
 */
const CSB0_HEBREW_BIT = 0x20;
const USB0_HEBREW_BIT = 0x800;
/** `w:charset w:val="B1"` — 177, דף הקוד העברי. */
const CHARSET_HEBREW = 0xb1;

/**
 * התחליפים, לפי הסדר. הראשון שקיים במכונה זוכה.
 *
 * הרשימות קצרות בכוונה: כל שם כאן הוא גופן עברי שסביר למצוא ב-Windows או
 * שאוצריא אורזת. שם שאינו קיים פשוט מדולג על ידי הדפדפן, ולכן שרשרת ארוכה
 * אינה מסוכנת — היא רק חסרת תועלת.
 */
const SUBSTITUTES = {
  serif: ['FrankRuehl', 'FrankRuhlCLM', 'David', 'Narkisim', 'Times New Roman'],
  sans: ['Arial', 'Rubik', 'Assistant', 'Segoe UI'],
} as const;

/**
 * גופן עברי שאינו מצהיר על סריפים נחשב סריפי.
 *
 * זו ברירת מחדל ולא ניחוש: `w:family="auto"` ו-PANOSE אפסי הם מה שגופני ספרים
 * עבריים כותבים בפועל (נמדד על `FrankRuehl DP` — `02000600000000000000`),
 * והטקסט שנפתח בתוסף הזה הוא טקסט ספרים.
 */
const DEFAULT_SHAPE: keyof typeof SUBSTITUTES = 'serif';

/** מחרוזת המדידה. עברית **ולטינית** — גופן עברי עשוי לכסות רק אחת מהן. */
const PROBE_TEXT = 'אבגדהוזחטי ABCDEFGHIJ';

/**
 * קורא את `word/fontTable.xml`.
 *
 * סובלני: מאפיינים בכל סדר, אלמנטים חסרים, ו-`w:font` ריק. מה שלא נקרא פשוט
 * אינו מופיע ברשימה — אין כאן מסלול שזורק, מפני שטבלת גופנים פגומה אינה סיבה
 * לא לפתוח מסמך.
 */
export function parseFontTable(xml: string): DeclaredFont[] {
  const fonts: DeclaredFont[] = [];
  const blocks = xml.match(/<w:font\b[^>]*>[\s\S]*?<\/w:font>|<w:font\b[^>]*\/>/g) ?? [];

  for (const block of blocks) {
    const raw = /<w:font\b[^>]*\bw:name\s*=\s*"([^"]*)"/.exec(block)?.[1];
    if (!raw) continue;
    const name = decodeXml(raw);
    if (name === '') continue;

    const family = /<w:family\b[^>]*\bw:val\s*=\s*"([^"]*)"/.exec(block)?.[1] ?? null;
    const charset = /<w:charset\b[^>]*\bw:val\s*=\s*"([^"]*)"/.exec(block)?.[1] ?? null;
    const panose = /<w:panose1\b[^>]*\bw:val\s*=\s*"([^"]*)"/.exec(block)?.[1] ?? null;

    fonts.push({ name, family, charset, panose, hebrew: declaresHebrew(block, charset) });
  }
  return fonts;
}

/** ישויות ה-XML שמופיעות בשם גופן. שם כמו `Foo & Bar` נכתב בקובץ כ-`Foo &amp; Bar`. */
const XML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/** מפענחת ישויות. שם שלא פוענח היה נכתב ל-CSS כפי שהוא ומצביע על גופן אחר. */
function decodeXml(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body[0] === '#') {
      const code = Number.parseInt(body.slice(body[1] === 'x' || body[1] === 'X' ? 2 : 1), body[1] === 'x' || body[1] === 'X' ? 16 : 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match;
    }
    return XML_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/**
 * האם זהו גופן עברי **ייעודי**.
 *
 * `w:charset="B1"` הוא הצהרה מפורשת ומספיקה. אחרת נבחן `w:csb0`: הביט העברי
 * חייב להיות דלוק, אבל **גם** מספר דפי הקוד כולו חייב להיות קטן — גופן
 * פאן-יוניקוד כמו `Arial` מדליק תשעה דפי קוד, ובהם עברית, ואינו גופן עברי
 * במובן שחשוב כאן. גופן עברי אמיתי מדליק עברית ולכל היותר עוד אחד: נמדד על
 * `FrankRuehl DP` (`00000021` — לטינית ועברית) ועל `Guttman Drogolin`
 * (`00000020` — עברית בלבד).
 *
 * `w:usb0` משמש כשאין `csb0` כלל, או כשהוא קיים אך ריק (`00000000`) — צורה
 * נפוצה בגופנים מודרניים שמכריזים רק על טווחי יוניקוד ולא על דפי קוד ותיקים
 * כלל. `csb0` ריק אינו "מצהיר על היעדר עברית": הוא לא מצהיר כלום.
 */
function declaresHebrew(block: string, charset: string | null): boolean {
  if (charset !== null && Number.parseInt(charset, 16) === CHARSET_HEBREW) return true;

  const sig = /<w:sig\b[^>]*\/>/.exec(block)?.[0];
  if (!sig) return false;

  const read = (attr: string): number => {
    const raw = new RegExp(`\\b${attr}\\s*=\\s*"([^"]*)"`).exec(sig)?.[1];
    const value = raw === undefined ? Number.NaN : Number.parseInt(raw, 16);
    return Number.isFinite(value) ? value : Number.NaN;
  };

  const csb0 = read('w:csb0');
  if (Number.isFinite(csb0) && csb0 !== 0) {
    return (csb0 & CSB0_HEBREW_BIT) !== 0 && countBits(csb0) <= MAX_CODE_PAGES_FOR_HEBREW_FONT;
  }

  const usb0 = read('w:usb0');
  return Number.isFinite(usb0) && (usb0 & USB0_HEBREW_BIT) !== 0;
}

/** כמה דפי קוד גופן עברי ייעודי מדליק לכל היותר — עברית, ולכל היותר עוד אחד. */
const MAX_CODE_PAGES_FOR_HEBREW_FONT = 2;

function countBits(value: number): number {
  let count = 0;
  for (let bits = value >>> 0; bits !== 0; bits >>>= 1) count += bits & 1;
  return count;
}

/**
 * סריפי או חלק. `w:family` קודם — הוא הצהרה מפורשת; PANOSE הוא גיבוי.
 *
 * ספרת ה-serif-style של PANOSE (השנייה) מוגדרת 2–10 כסריפים ו-11–15 כחלקים;
 * 0 ו-1 הם „כל" ו„לא רלוונטי", כלומר חוסר מידע.
 */
export function shapeOf(font: DeclaredFont): keyof typeof SUBSTITUTES {
  if (font.family === 'roman') return 'serif';
  if (font.family === 'swiss' || font.family === 'modern') return 'sans';

  const serifStyle = font.panose ? Number.parseInt(font.panose.slice(2, 4), 16) : Number.NaN;
  if (Number.isFinite(serifStyle)) {
    if (serifStyle >= 2 && serifStyle <= 10) return 'serif';
    if (serifStyle >= 11 && serifStyle <= 15) return 'sans';
  }
  return DEFAULT_SHAPE;
}

/**
 * האם הדפדפן פותר את שם המשפחה.
 *
 * נמדד ברוחב על canvas ולא ב-`document.fonts.check()` — האחרון מחזיר `true`
 * גם לגופן שאינו קיים, וזה מתועד גם ב-`scripts/font-check.mjs` שנתקל בזה.
 * המדידה נעשית מול **שני** גופני בסיס שונים: משפחה שאינה נפתרת תיפול לבסיס
 * ותמדוד בדיוק כמוהו בשני המקרים, ומשפחה שנפתרת תיבדל לפחות באחד.
 *
 * `true` כשאי אפשר למדוד: בלי canvas אין לנו מה לומר, והחלפה על סמך ניחוש
 * גרועה מלא לגעת.
 */
export function isFamilyAvailable(name: string): boolean {
  const context = measurementContext();
  if (!context) return true;

  const width = (font: string): number => {
    context.font = font;
    return context.measureText(PROBE_TEXT).width;
  };
  const quoted = JSON.stringify(name);
  return (
    width(`72px ${quoted}, monospace`) !== width('72px monospace') ||
    width(`72px ${quoted}, serif`) !== width('72px serif')
  );
}

/** מחרוזת המדידה לכיסוי עברית בלבד. ראו `coversHebrew`. */
const HEBREW_PROBE_TEXT = 'אבגדהוזחטיכלמנסעפצקרשת';

/**
 * בסיסי המדידה של `coversHebrew` — שלושה, וכל אחד מהם קונה משהו אחר.
 *
 * `sans-serif` נוסף אחרי מדידה: `Times New Roman` — הדוגמה שהתיעוד עצמו
 * מביא — יצא `false`. הסיבה אינה באג בקוד אלא בבסיסים: ב-Windows `serif`
 * **הוא** Times New Roman, ולכן ההשוואה מולו שווה מהגדרה; ומול `monospace`
 * גם כן, מפני ש-Courier New אינו מכסה עברית ונופל בעצמו ל-fallback שהוא
 * Times New Roman. משפחה שהיא עצמה ברירת המחדל של בסיס ניתנת לזיהוי רק דרך
 * בסיס **אחר** שברירת המחדל שלו שונה — וזה `sans-serif` (Arial).
 *
 * ולמה זה אינו מייצר חיובי-שגוי: התאמת הגופן ב-CSS היא לכל תו בנפרד, ולכן
 * גופן בלי עברית נופל בשרשרת `"F", B` בדיוק ל-`B` — כלומר מודד את `B` בכל
 * אחד משלושת הבסיסים. נמדד בכרום ב-Windows על כל השמות שאמורים לצאת שליליים
 * (Wingdings 1/2/3, Webdings, Symbol, Marlett, Cambria Math, MS Gothic,
 * SimSun, Malgun Gothic, Yu Gothic, Nirmala UI, Ebrima, Leelawadee UI, ושם
 * שאינו מותקן) — כולם נשארו `false`.
 */
const HEBREW_PROBE_BASES: readonly string[] = ['monospace', 'serif', 'sans-serif'];

/**
 * זיכרון התשובות. `coversHebrew` נשאלת על כל שם ברשימה בכל מיזוג מחדש — מאות
 * שמות, וכל מיזוג הוא דיווח של המנוע.
 *
 * המפתח ממותת (`familyProbeKey`) ונושא את **דור** האליאסים, ושני אלה הם
 * תיקונים של תשובות שנמדדו שגויות:
 *
 * 1. **רישיות.** `Arial`, `ARIAL` ו-`arial` נמדדו כשלוש רשומות ושלוש מדידות,
 *    בזמן ש-`familyKey` ב-font-options.ts ממותת ומאחד אותן לאפשרות אחת.
 * 2. **דור.** `installDocumentFontAliases` דורס את `@font-face` בכל מסמך,
 *    כלומר התשובה **כן** משתנה תוך ההפעלה, ולשני הכיוונים: גופן שנפתר רק
 *    דרך האליאס נמדד `false` לפני ההזרקה ונשאר מסווג „בלי עברית” לתמיד
 *    (נמדד: `FrankRuhlCLM=false`), ו-`true` שנמדד בזכות מסמך א' נשאר אחרי
 *    שמסמך ב' דרס את הסגנון — ואז הדגימה נצבעת ב-fallback, בדיוק מה שהדגל
 *    קיים כדי למנוע.
 */
const hebrewCoverage = new Map<string, boolean>();

/**
 * הדור הנוכחי של `@font-face` המוזרק. מתקדם בכל `installDocumentFontAliases`.
 */
let aliasGeneration = 0;

/** המפתח שתשובת הכיסוי נשמרת תחתיו. ראו `hebrewCoverage`. */
function familyProbeKey(name: string): string {
  return `${aliasGeneration} ${name.trim().toLowerCase()}`;
}

/**
 * מודיעה שהאליאסים הוזרקו מחדש, ולכן כל תשובת כיסוי שנמדדה קודם אינה תקפה.
 *
 * הדור במפתח הוא מה שמפריד; הניקוי הוא כדי שהמפה לא תגדל בכל מסמך שנפתח.
 */
function advanceAliasGeneration(): void {
  aliasGeneration += 1;
  hebrewCoverage.clear();
}

/**
 * האם הגופן מצייר עברית **בעצמו**.
 *
 * זו שאלה אחרת מ-`isFamilyAvailable`, והבחנה שהבורר חי ממנה: שם שהדפדפן פותר
 * אינו בהכרח שם שיש בו אות עברית אחת. הבורר מציג דגימה של אותיות עבריות ליד
 * כל גופן שמכסה עברית, ודגימה בגופן שאינו מכסה הייתה נופלת ל-fallback — כלומר
 * מציגה את האותיות של גופן **אחר** תחת השם הזה.
 *
 * המדידה: רוחב מחרוזת עברית במשפחה מול הרוחב באותה שרשרת בלי המשפחה. גופן
 * בלי עברית נופל בדיוק לאותו fallback בשני המקרים ומודד זהה; גופן שמכסה
 * מצייר משלו ונבדל. שלושה בסיסים ולא אחד — ראו `HEBREW_PROBE_BASES`, כולל
 * למה `sans-serif` הוא זה שמזהה את `Times New Roman` עצמו.
 *
 * **`false` כשאין canvas**, וזה ההפך מ-`isFamilyAvailable`: שם „בלי מדידה אל
 * תיגע” הוא הצד הבטוח, וכאן הצד הבטוח הוא לא להבטיח. דגימה שלא נמדדה היא
 * דגימה שעלולה לשקר.
 *
 * ## למה זה החליף רשימה מתוחזקת ביד
 *
 * הסיווג היה קודם רשימת מועמדים ב-system-fonts.ts, וזה עבד רק על מה שברשימה:
 * גופן עברי שמותקן במכונה ולא נכתב בה — או גופן שהמסמך עצמו משתמש בו והמנוע
 * הביא — הופיע בבורר בלי דגימה ובקבוצה הלא נכונה. זה דווח, וזו התשובה: מודדים
 * את מה שיש, במקום לנחש מראש מה יהיה.
 */
export function coversHebrew(name: string): boolean {
  const key = familyProbeKey(name);
  const cached = hebrewCoverage.get(key);
  if (cached !== undefined) return cached;

  const context = measurementContext();
  if (!context) return false;

  const width = (font: string): number => {
    context.font = font;
    return context.measureText(HEBREW_PROBE_TEXT).width;
  };
  const quoted = JSON.stringify(name.trim());
  const covers = HEBREW_PROBE_BASES.some(
    (base) => width(`72px ${quoted}, ${base}`) !== width(`72px ${base}`),
  );

  hebrewCoverage.set(key, covers);
  return covers;
}

/**
 * האם יש כאן במה למדוד בכלל.
 *
 * `isFamilyAvailable` מחזירה „זמין” כשאין canvas, וזו ההכרעה הנכונה **שם**:
 * להחליף גופן על סמך ניחוש גרוע מלא לגעת. למי שבונה **רשימה** ההכרעה הפוכה
 * בדיוק — בלי מדידה עדיף בורר קצר ואמיתי מאשר עשרות שמות שאיש אינו יודע אם
 * קיימים. לכן השאלה „אפשר למדוד?” נחשפת בנפרד מהתשובה „זמין?”.
 */
export function canMeasureFonts(): boolean {
  return measurementContext() !== null;
}

let probeContext: CanvasRenderingContext2D | null | undefined;

/** `null` בסביבה בלי canvas — jsdom, למשל. נבנה פעם אחת. */
function measurementContext(): CanvasRenderingContext2D | null {
  if (probeContext !== undefined) return probeContext;
  try {
    probeContext = document.createElement('canvas').getContext('2d');
  } catch {
    probeContext = null;
  }
  return probeContext;
}

/** מה שיש לעשות עבור מסמך אחד. */
export interface AliasPlan {
  /** כללי `local()` — למשפחות שיש להן תחליף מותקן. */
  css: string;
  /**
   * משפחות שאין להן אף תחליף מותקן. **רק** להן צריך בייטים מאוצריא: גופן
   * ב-base64 שוקל מאות קילובייטים, ואין סיבה לשלוח אותו כשיש מקומי שעונה.
   */
  needBytes: DeclaredFont[];
  /** כל מה שלא נפתר, לדיווח. */
  missing: DeclaredFont[];
}

/**
 * ההחלטה כולה, בלי דפדפן ובלי מארח.
 *
 * `available` מוזרק כדי שאפשר יהיה לבדוק אותה: זו הלוגיקה שקובעת אם המסמך
 * ייראה נכון, ובדיקה שלה דרך canvas אמיתי הייתה בודקת את המכונה ולא את הקוד.
 */
export function planFontAliases(
  fonts: DeclaredFont[],
  available: (name: string) => boolean = isFamilyAvailable,
): AliasPlan {
  const rules: string[] = [];
  const needBytes: DeclaredFont[] = [];
  const missing: DeclaredFont[] = [];
  const seen = new Set<string>();

  for (const font of fonts) {
    if (!font.hebrew || seen.has(font.name)) continue;
    seen.add(font.name);
    if (available(font.name)) continue;
    missing.push(font);

    const chain = SUBSTITUTES[shapeOf(font)].filter((candidate) => available(candidate));
    if (chain.length === 0) {
      needBytes.push(font);
      continue;
    }
    const src = chain.map((candidate) => `local(${JSON.stringify(candidate)})`).join(',');
    rules.push(`@font-face{font-family:${JSON.stringify(font.name)};src:${src};}`);
  }
  return { css: rules.join('\n'), needBytes, missing };
}

/** התחליפים שיישלחו לאוצריא עבור משפחה — אותה שרשרת, בלי סינון זמינות. */
export function substitutesFor(font: DeclaredFont): string[] {
  return [...SUBSTITUTES[shapeOf(font)]];
}

/**
 * מתקינה את הכללים למסמך שנפתח. בטוחה לקריאה חוזרת — הסגנון נדרס.
 *
 * מחזירה את שמות המשפחות שלא נפתרו, לדיווח ולבדיקה. רשימה ריקה פירושה שהכול
 * נמצא במכונה ואין מה להחליף.
 *
 * ומקדמת את דור הכיסוי: הסגנון שנדרס כאן הוא בדיוק מה ש-`coversHebrew` מודדת
 * מולו, ותשובה שנמדדה מול הסגנון הקודם אינה תקפה יותר. ראו `hebrewCoverage`.
 */
export async function installDocumentFontAliases(fontTableXml: string | null): Promise<string[]> {
  const style = aliasStyleElement();
  if (!style) return [];

  const plan = planFontAliases(fontTableXml ? parseFontTable(fontTableXml) : []);

  // הבייטים אחרונים ובכוונה: שני כללים לאותה משפחה — האחרון קובע. מה שמגיע
  // מאוצריא הוא המסלול שעובד גם במכונה שאין בה כלום, ולכן הוא זה שינצח.
  const hosted = await hostFontFaceCss(plan.needBytes);

  style.textContent = [plan.css, hosted].filter((part) => part !== '').join('\n');
  // אחרי הכתיבה ולא לפניה, ו-`hostFontFaceCss` שבאמצע הוא הסיבה: מדידה
  // שנעשית בזמן ה-await נמדדת מול הסגנון הקודם, ואם הדור כבר התקדם היא
  // נשמרת תחת הדור החדש ונשארת שם שגויה. כאן היא נשמרת תחת הדור הישן,
  // כלומר נזרקת בשורה הבאה.
  advanceAliasGeneration();
  return plan.missing.map((font) => font.name);
}

/**
 * `@font-face` עם בייטים אמיתיים מאוצריא, או מחרוזת ריקה.
 *
 * `tryCall` ולא `call`: מארח ישן אינו מכיר את המתודה, וזה אינו כשל — פשוט
 * נשארים עם מה שיש. אין כאן שום דבר שמצדיק להפיל פתיחת מסמך.
 */
async function hostFontFaceCss(fonts: DeclaredFont[]): Promise<string> {
  if (fonts.length === 0) return '';
  const families = fonts.map((font) => ({
    name: font.name,
    substitutes: substitutesFor(font),
  }));
  const res = await tryCall<ResolveFontFamiliesResult>('fonts.resolveFamilies', { families });
  return typeof res?.css === 'string' ? res.css : '';
}

/** הסגנון שמחזיק את הכללים, נוצר בפעם הראשונה. `null` בלי DOM. */
function aliasStyleElement(): HTMLStyleElement | null {
  if (typeof document === 'undefined') return null;

  const existing = document.getElementById(FONT_ALIAS_STYLE_ID);
  if (existing instanceof HTMLStyleElement) return existing;

  const style = document.createElement('style');
  style.id = FONT_ALIAS_STYLE_ID;
  document.head.appendChild(style);
  return style;
}
