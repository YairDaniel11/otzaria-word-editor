/**
 * תיקון מה שהמנוע אינו קורא נכון, לפני שהוא רואה אותו.
 *
 * שני תיקונים יושבים כאן, ומשני טעמים שונים: הראשון מפני שאין שום מקום אחר
 * שיכול לתפוס אותו (קיפאון על החוט הראשי), והשני מפני שאין שום מקום אחר שבו
 * הוא נכון (הדגשה שצריכה להיכנס לחישוב הפריסה). מה שמשותף לשניהם, וזה מה
 * שמצדיק שכן אחד: שניהם חייבים לקרות **לפני** שהבייטים נמסרים.
 *
 * ## התיקון הראשון: ערך שמקפיא את המנוע
 *
 * `<w:defaultTabStop w:val="0"/>` ב-`word/settings.xml` שולח את בונה עצירות
 * הטאב של המנוע ללולאה שאינה נגמרת: הוא מקדם מיקום בצעדים של הערך הזה, וצעד
 * של אפס אינו מקדם. נמדד ב-superdoc 2.8.0 וגם ב-2.10.0 — מסמך Word ריק ותקין
 * שמכריחים בו את המאפיין הזה לאפס מקפיא את הדפדפן לצמיתות.
 *
 * הלולאה רצה על **החוט הראשי**, וזאת הנקודה שקובעת את הצורה של הקובץ הזה:
 * `OPEN_TIMEOUT_MS` ב-create-editor.ts אינו יכול להציל כאן, מפני שהטיימר שלו
 * צריך בדיוק את החוט שחסום. אין שום שעון-שמירה שיכול לתפוס את זה מבחוץ. הדרך
 * היחידה היא לא למסור למנוע את הערך מלכתחילה — כלומר כאן, לפני הפתיחה.
 *
 * ## התיקון השני: הדגשה של כתב מורכב שאינה מגיעה למסך
 *
 * `<w:bCs/>` היא „מודגש לכתב מורכב”, וזה מה ש-Word העברי כותב כשמדגישים בחירה
 * שכולה עברית: `w:bCs` לבדה, בלי `w:b`. Word מרנדר הדגשה של ריצה עברית מ-
 * `bCs`; המנוע מרנדר אותה מ-`w:b` בלבד. התוצאה היא מסמך שכותרותיו מודגשות
 * ב-Word ומגיעות אלינו דקות.
 *
 * נמדד ב-superdoc 2.10.0 (engine 0.9.0), על הקובץ שדווח, ב-Chrome אמיתי:
 * עשר הכותרות נצבעו `font-weight: 400`; אותו קובץ בדיוק עם `<w:b/>` שהושלם
 * לצד כל `<w:bCs/>` — כולן 700. ראו scripts/qa/bold-cs-qa.mjs.
 *
 * ### למה כאן, ולא בגיליון סגנונות
 *
 * קיפאון אין לתפוס אחר כך; הדגשה, לכאורה, כן. אלא שאין במה: ה-DOM שהמנוע
 * מצייר אינו נושא שום סימן ל-`bCs` — `.superdoc-text-run` מקבל `styleid` ו-
 * `style` מחושב עם `font-weight` סופי, ולא את מאפייני הריצה — ולכן אין למה
 * להיתלות בסלקטור. וגם אילו היה: המשקל נכנס לחישוב שבירת השורות ולעימוד,
 * והדגשה שנצבעת אחרי הפריסה מזיזה טקסט מתחת לפריסה שכבר חושבה. המנוע חייב
 * לדעת, ולכן זה נכתב לתוך ה-XML.
 *
 * ### מה זה עושה למסמך, במפורש
 *
 * `w:b` נכתב לצד `w:bCs`, וממילא גם ייוצא. על ריצה עברית אין לזה משמעות
 * ב-Word — הוא קורא `bCs` בכל מקרה — אבל על טקסט **לטיני שיושב באותו `rPr`**
 * זה שינוי אמיתי: הוא יוצג מודגש גם ב-Word, ולא היה. זה המחיר, והוא נבחר
 * ביודעין: מסמך עברי שכותרותיו אינן מודגשות הוא באג שהמשתמש רואה בכל עמוד,
 * ואנגלית בתוך כותרת של מסמך עברי היא מקרה קצה.
 *
 * `<w:b w:val="0"/>` **אינו** נהפך. היעדר `w:b` הוא מה ש-Word השאיר מאחור;
 * `w:b` מכובה הוא אמירה מפורשת של מי שכתב את הקובץ, ואין לנו רשות להפוך אותה.
 *
 * וההיקף הרחב ביותר של אותו מחיר: `bCs` על `w:rPrDefault` ב-`styles.xml`
 * מקבלת `w:b` בדיוק כמו כל `rPr` אחרת, ואז **כל** ריצה לטינית במסמך תהיה
 * מודגשת ב-Word אחרי שמירה — ברירת מחדל של המסמך, לא כותרת. זה הכלל עצמו
 * ולא חריג ממנו, וזה נאמר כאן כי הסקלה שונה. בקורפוס של 81 מסמכי Word אמיתיים
 * אין אף אחד שנושא `bCs` דולקת ב-`rPrDefault`.
 *
 * ## הכלל: לתקן, ולא לחסום
 *
 * כל כשל בדרך — zip שלא נקרא, חלק חסר, דחיסה שלא נתמכת — מחזיר את המקור כמות
 * שהוא. שלב מקדים שנכשל אינו אמור למנוע פתיחה של מסמך שהיה נפתח בלעדיו: הוא
 * תיקון, לא שער. לכן אין כאן אף מסלול שזורק.
 *
 * ## למה zip מלא ולא חיפוש-והחלפה על הבייטים
 *
 * החלקים דחוסים בתוך הארכיון, ולכן אי אפשר לגעת בהם בלי לפרוס אותם. כל חלק
 * שלא תוקן מועתק בייט-בבייט בדיוק כפי שהיה, וכך הקובץ שנמסר למנוע זהה למקור
 * בכל מה שאינו התיקון עצמו.
 *
 * ### החלק שתוקן נכתב דחוס, ורק אחרי שהדחיסה אומתה
 *
 * הגרסה הראשונה כתבה את החלק המתוקן כרשומה לא-דחוסה (`STORED`), מהטעם ש„דוחס
 * שמתנהג אחרת מהצפוי הוא באג שקט”. שני דברים שנמדדו הפכו את זה:
 *
 * 1. **המחיר לא היה „פי 2 עד פי 4”.** על 81 מסמכים אמיתיים, 34 תוקנו, וסך
 *    ה-Blob שנמסר למנוע גדל מ-68.8MB ל-359.7MB — **פי 5.2**, והגרוע פי 15.3:
 *    מסמך של 4.3MB הגיע למנוע כ-35.9MB. חמישה מסמכים חצו 17MB. וזה בדיוק על
 *    מסמכי הספרים שהם קהל היעד.
 * 2. **הבאג „השקט” אינו שקט.** ה-CRC נמדד על הבייטים הלא-דחוסים, והמנוע פורס
 *    את החלק מיד בפתיחה — deflate שגוי הוא כשל רועש בפתיחה, לא שינוי שקט
 *    במסמך. ובכל זאת אין כאן הסתמכות על זה: הפלט נפרס בחזרה ומושווה למקור
 *    (`deflateVerified`), ורק אז נכתב. דוחס שגוי נופל ל-`STORED`, לא למסמך.
 *
 * `CompressionStream('deflate-raw')` הוא אותו API שהקובץ הזה כבר משתמש בהופכי
 * שלו, ועם אותה נפילה-חזרה כשהוא חסר או נכשל: `STORED`, שהוא רשומת ZIP חוקית
 * לגמרי. אותם 59 `document.xml`: 337.1MB גלוי מול 25.9MB דחוס, ב-~41ms למסמך.
 *
 * זה זיכרון ולא קובץ — הייצוא דוחס מחדש מהמנוע, ולכן שום רשומה שנכתבה כאן
 * אינה מגיעה לדיסק. ורק על מסמכים שיש בהם מה לתקן: מסמך שאין בו `bCs` אינו
 * נכתב מחדש בכלל.
 */
import { DOCX_MIME } from './export';
import { NO_VBA, readDocumentVba, type DocumentVba } from './vba-import';

/** החלק שבו יושבות הגדרות המסמך. */
export const SETTINGS_PART = 'word/settings.xml';

/**
 * החלק שמתאר את הגופנים שהמסמך משתמש בהם — כולל כאלה שאינם מותקנים.
 *
 * אינו מתוקן כאן ואינו נוגע לקיפאון; הוא נקרא ונמסר החוצה, מפני שזה המקום
 * היחיד שכבר פותח את הארכיון. מה שנעשה איתו נמצא ב-engine/docx-fonts.ts.
 */
export const FONT_TABLE_PART = 'word/fontTable.xml';

/**
 * ברירת המחדל של Word לעצירת טאב, ב-twips (720 = חצי אינץ' = 1.27 ס"מ).
 *
 * זה גם מה ש-OOXML מגדיר כערך כשהמאפיין נעדר לגמרי, ולכן כתיבתו במפורש שקולה
 * למחיקת המאפיין — ומפורשת יותר למי שיפתח את הקובץ אחר כך.
 */
export const DEFAULT_TAB_STOP_TWIPS = 720;

/**
 * בייטים שגובים מ-`ArrayBuffer` רגיל.
 *
 * הכינוי מפורש מפני ש-TypeScript מבדיל מאז 5.7 בין `ArrayBuffer` ל-
 * `SharedArrayBuffer`, ו-`Uint8Array` סתם כולל את שניהם — צורה ש-`Blob`
 * ו-`DecompressionStream` אינם מקבלים.
 */
type Bytes = Uint8Array<ArrayBuffer>;

const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_LOCAL_HEADER_SIZE = 30;
const ZIP_CENTRAL_HEADER_SIZE = 46;
const ZIP_EOCD_SIZE = 22;

/** דגל „הגדלים מגיעים אחרי הנתונים”. הכתיבה כאן תמיד יודעת אותם מראש. */
const ZIP_FLAG_DATA_DESCRIPTOR = 0x0008;
/** דגל הצפנה. ארכיון מוצפן אינו משהו שיש כאן מה לעשות איתו. */
const ZIP_FLAG_ENCRYPTED = 0x0001;

const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

/** „גרסה נדרשת” 2.0 — המינימום שרשומת deflate מצהירה עליו (APPNOTE 4.4.3.2). */
const ZIP_VERSION_DEFLATE = 20;

/** הסימן שהארכיון הוא ZIP64. אין כאלה ב-DOCX ריאלי, ולכן פשוט לא נוגעים בהם. */
const ZIP64_MARKER_32 = 0xffffffff;
const ZIP64_MARKER_16 = 0xffff;

interface ZipEntry {
  /** שם החלק, לזיהוי. */
  name: string;
  /** בייטי השם כפי שהיו — כדי לא לקודד מחדש שם שאינו UTF-8. */
  nameBytes: Bytes;
  versionMadeBy: number;
  versionNeeded: number;
  flags: number;
  method: number;
  modTime: number;
  modDate: number;
  crc: number;
  internalAttrs: number;
  externalAttrs: number;
  /** התוכן כפי שהוא מאוחסן — דחוס או לא, לפי `method`. */
  data: Bytes;
  uncompressedSize: number;
}

/** שם האלמנט שהערך שבו מקפיא את המנוע. */
const DEFAULT_TAB_STOP_ELEMENT = 'defaultTabStop';

/**
 * מתקנת את `settings.xml`. `null` = אין מה לתקן.
 *
 * הבדיקה היא על **הערך** ולא על המחרוזת `"0"`: גם `-1` וגם ערך שאינו מספר
 * מגיעים למנוע כאותו צעד-אפס.
 *
 * ## למה זה סורק, ולא רגקס אחד
 *
 * הגרסה הראשונה כאן הייתה `/<w:defaultTabStop\b[^>]*\/>/`, וסקירה יריבה מצאה
 * בה **שלוש** דרכים שבהן הקיפאון פשוט אינו נמנע. לא „תיקון פחות מדויק” — הוא
 * לא קורה, והמשתמש נשאר עם אוצריא תקועה שאין ממנה יציאה:
 *
 * | הקלט | מה קרה |
 * |---|---|
 * | `<!-- …val="720"… --><w:defaultTabStop w:val="0"/>` | ההתאמה הראשונה היא זו שבהערה, ערכה תקין, ולכן `null` |
 * | `<w:defaultTabStop w:val="0"></w:defaultTabStop>` | XML חוקי לגמרי, אבל אינו נגמר ב-`/>` ולכן לא הותאם |
 * | `<w:defaultTabStop w:foo="a>b" w:val="0"/>` | `[^>]*` נעצר על ה-`>` שבתוך הערך |
 *
 * ובכיוון ההפוך, `<!-- <w:defaultTabStop w:val="0"/> -->` **תוקן בתוך ההערה**
 * — כלומר עריכה של טקסט שאינו עיצוב.
 *
 * לכן כאן אותו סורק של התיקון השני: מודע למרכאות, מדלג על הערות, CDATA
 * והוראות עיבוד, ואינו נעול על הקידומת `w`.
 *
 * ## ולמה נכתב רק **הערך**
 *
 * במקום להחליף את האלמנט כולו ב-`<w:defaultTabStop w:val="720"/>`. כך צורת
 * האלמנט נשמרת — סוגר-עצמו נשאר סוגר-עצמו, וזוג פתיחה-סגירה נשאר זוג — ואין
 * מסלול שבו נכתב תג סוגר-עצמו וסגירתו הקודמת נשארת תלושה. הקידומת ומרכאות
 * הערך נשמרות אף הן, מאותו טעם: כתיבה חוזרת של מה שלא היה צריך להשתנות היא
 * בדיוק מה שהמודול הזה מבטיח לא לעשות.
 */
export function repairSettings(xml: string): string | null {
  const token = new RegExp(TOKEN_SOURCE.source, 'g');
  for (let match = token.exec(xml); match; match = token.exec(xml)) {
    const closer = SKIPPED_SPANS.get(match[0]);
    if (closer !== undefined) {
      const end = xml.indexOf(closer, token.lastIndex);
      // הערה שאינה נסגרת. שום התאמה שאחריה אינה אמינה, ותיקון במקום הלא נכון
      // גרוע מאי-תיקון: הקיפאון לפחות משוחזר ונראה.
      if (end < 0) return null;
      token.lastIndex = end + closer.length;
      continue;
    }

    const [, closing, prefix, name, attributes] = match;
    if (closing || name !== DEFAULT_TAB_STOP_ELEMENT) continue;

    const current = valueOf(attributes);
    const twips = current === null ? Number.NaN : Number(current.trim());
    if (Number.isFinite(twips) && twips > 0) return null;

    const attributesAt = match.index + 1 + closing.length + prefix.length + 1 + name.length;
    if (current === null) {
      // אין `w:val` בכלל. הוא נדרש ב-`CT_TwipsMeasure`, ולכן זה מסמך שגוי —
      // אבל הכתיבה כאן היא בדיוק מה שהערך הנעדר אומר, ולכן היא גם התיקון.
      // נכנס לפני ה-`/` של תג סוגר-עצמו, ובסוף המאפיינים בכל צורה אחרת — ואחרי
      // שהרווח שלפני ה-`/` (אם יש) נדחף אל אחרי הערך, כדי לא לכתוב שניים.
      const before = attributes.slice(0, attributes.length - (attributes.endsWith('/') ? 1 : 0));
      const insertAt = attributesAt + before.trimEnd().length;
      return (
        xml.slice(0, insertAt) +
        ` ${prefix}:val="${DEFAULT_TAB_STOP_TWIPS}"` +
        xml.slice(insertAt)
      );
    }

    // מקום הערך עצמו: ההתאמה נגמרת במרכאת הסיום, ולכן הערך הוא האורך שלו
    // אחורה ממנה. כך המאפיין, הקידומת וסוג המרכאות נשארים תו-בתו.
    const inside = VAL_ATTRIBUTE.exec(attributes);
    if (!inside) return null;
    const valueEnd = attributesAt + inside.index + inside[0].length - 1;
    const valueStart = valueEnd - current.length;
    return (
      xml.slice(0, valueStart) + String(DEFAULT_TAB_STOP_TWIPS) + xml.slice(valueEnd)
    );
  }

  return null;
}

/**
 * החלקים שבהם יושבות תכונות ריצה, וכולם באותה סכימה של WordprocessingML.
 *
 * `styles.xml` הוא הרוב המעשי — כותרת מודגשת היא כמעט תמיד סגנון ולא עיצוב
 * ישיר — אבל עיצוב ישיר קיים, וכך גם כותרת עליונה, הערת שוליים ומספור רשימה.
 * כולם עוברים באותו כלל אחד, מפני שזה **אותו** כלל: `rPr` היא `rPr`.
 *
 * מה שאינו כאן ובכוונה: `word/glossary/*` (בלוקים לשימוש חוזר; אינם מרונדרים)
 * ו-`word/settings.xml`, שיש לו תיקון משלו.
 *
 * `stylesWithEffects.xml` **כן** כאן: זה חלק אמיתי של Word 2010 ובו גיליון
 * סגנונות שלם. Word 2010 קורא מ-`bCs` בעצמו ולכן אינו נפגע, אבל להשאיר גיליון
 * סגנונות שלם מחוץ לכלל „`rPr` היא `rPr`” הוא חוסר עקביות, לא החלטה.
 *
 * הספרה אופציונלית בכל השמות שיכולים לשאת אותה, ולא רק בארבעה מהם — הצורה
 * הקודמת התירה `document2` ולא `footnotes2`, וזו הייתה השמטה ולא כלל.
 */
export const CONTENT_PARTS =
  /^word\/(?:document|styles|stylesWithEffects|numbering|footnotes|endnotes|comments|header|footer)\d*\.xml$/i;

/**
 * ערכי `ST_OnOff` שמשמעותם „כבוי”. כל ערך אחר — ובכלל זה היעדר `w:val` — דולק,
 * וזה מה שהתקן אומר: `<w:bCs/>` בלי מאפיין היא הדגשה פעילה.
 */
const OFF_VALUES = new Set(['0', 'false', 'off']);

/**
 * מאפיין `w:val`, לשני התיקונים כאחד.
 *
 * שני סוגי המרכאות, ולא רק כפולות: XML מתיר את שניהם, ו-`w:val='0'` שנקרא
 * כדולק היה הופך „לא מודגש” שנכתב במפורש למודגש — כלומר שינוי במסמך, בדיוק מה
 * שהמודול הזה מבטיח לא לעשות. הקידומת אופציונלית מאותו טעם שהסורק אינו נעול
 * על `w:` (ראו TOKEN_SOURCE).
 *
 * התחילית היא `\s` ולא `\b`, כדי שהמאפיין יתחיל במקום שבו מאפיין באמת מתחיל:
 * `\b` היה מתאים גם ל-`val='0'` **בתוך ערך** של מאפיין אחר. (`\s` אינו סוגר
 * את המקרה של רווח בתוך ערך כזה, למשל `w:foo="a val='0'"`, ולשם צריך פרסר
 * ולא רגקס. לאף אחד משני האלמנטים שכאן אין מאפיין מלבד `val`.)
 *
 * מה שנשאר לא-מטופל: ישות מספרית (`w:val="&#48;"`). היא חוקית, ואף כלי
 * מציאותי אינו כותב אותה.
 *
 * קבוצה 1 — ערך במרכאות כפולות; קבוצה 2 — בבודדות.
 */
const VAL_ATTRIBUTE = /\s(?:[\w.-]+:)?val\s*=\s*(?:"([^"]*)"|'([^']*)')/;

/** הערך שב-`w:val`, או `null` כשאינו שם. */
function valueOf(attributes: string): string | null {
  const match = VAL_ATTRIBUTE.exec(attributes);
  return match ? (match[1] ?? match[2]) : null;
}

/** האם דגל `ST_OnOff` דולק, לפי מאפייני התג. */
function isOn(attributes: string): boolean {
  const value = valueOf(attributes);
  return value === null || !OFF_VALUES.has(value.trim().toLowerCase());
}

/**
 * הסורק: תג, פתיחת הערה, או פתיחת CDATA — לפי סדר הופעתם.
 *
 * **המאפיינים מודעים למרכאות** (`[^>"']` או מחרוזת מצוטטת), ולא `[^>]*`. זה
 * אינו הידור: `<w:rPrChange w:author="a>b">` הוא XML חוקי לגמרי, ורגקס שנעצר
 * על ה-`>` הראשון היה קורא אותו כתג אחר לגמרי.
 *
 * הקידומת נלכדת ואינה נעולה על `w`: החבילה רשאית לקשור את מרחב השמות של
 * WordprocessingML לכל קידומת. מי שנעול על `w:` גם מפספס מסמך כזה לגמרי, וגם —
 * גרוע יותר — אינו רואה `ns0:b` קיימת ומוסיף `w:b` שנייה לצדה.
 *
 * **אבל קידומת היא חובה כאן, וזו מגבלה:** חבילה שקושרת את מרחב השמות
 * כברירת מחדל (`<document xmlns="…/wordprocessingml/2006/main">` ואז `<bCs/>`
 * בלי קידומת) אינה מותאמת כלל, ושני התיקונים פשוט אינם קורים — בשקט. Word
 * כותב קידומת תמיד; מחולל צד-שלישי אינו חייב. הכיוון שמרני (לא לתקן, ולא
 * לתקן לא נכון), ולכן זה מתועד ולא נסגר: לזהות „האם התג הזה בכלל
 * WordprocessingML” בלי קידומת דורש מעקב אחר הכרזות מרחב שמות, כלומר פרסר.
 *
 * הערות, CDATA והוראות עיבוד נבלעות שלמות. שלושתן נראות לרגקס בדיוק כמו תגים
 * (`<!-- <w:rPr><w:bCs/></w:rPr> -->`), והתיקון בתוכן היה עריכה של טקסט
 * המשתמש — או של הצהרה — ולא של העיצוב. הצהרת ה-XML עצמה (`<?xml … ?>`) לא
 * הותאמה גם קודם, מפני ש-`?` אינו ב-`[\w.-]`; מה שנסגר כאן הוא הוראת עיבוד
 * שיש **בתוכה** משהו שנראה כמו תג.
 */
const TOKEN_SOURCE =
  /<!--|<!\[CDATA\[|<\?|<(\/?)([\w.-]+):([\w.-]+)((?:[^>"']|"[^"]*"|'[^']*')*)>/;

/**
 * לכל פותח כזה — הסוגר שלו. מה שביניהם אינו XML שיש בו מה לתקן, וכל מה
 * שהסורק צריך לעשות איתו הוא לדלג עליו שלם.
 */
const SKIPPED_SPANS = new Map([
  ['<!--', '-->'],
  ['<![CDATA[', ']]>'],
  ['<?', '?>'],
]);

/** הכנסה אחת: המקום, והקידומת שבה לכתוב. */
interface BoldInsert {
  at: number;
  prefix: string;
}

/** מה שנאסף על ה-`rPr` החיה בזמן הסריקה. */
interface RunPropsScope {
  /** האם `b` מופיעה בה — בכל קידומת ובכל צורה, גם מכובה. */
  hasBold: boolean;
  /** מקום התג `bCs`, או `null` כשאינו שם. */
  boldCsAt: number | null;
  /** האם ה-`bCs` שנמצא דולק. */
  boldCsOn: boolean;
  /** הקידומת של ה-`bCs` שנמצא. */
  prefix: string;
}

/**
 * משלימה `<w:b/>` לצד כל `<w:bCs/>` דולקת שאין לצדה `w:b`. `null` = אין מה
 * לתקן.
 *
 * ## למה סורק ולא רגקס על `<w:rPr>…</w:rPr>`
 *
 * מפני ש-`rPr` **מקננת**: `<w:rPr>…<w:rPrChange><w:rPr>…</w:rPr></w:rPrChange>
 * </w:rPr>`. רגקס לא-להוט היה קושר את הפתיחה החיצונית לסגירה הפנימית, כלומר
 * מודד את התכונות של השינוי המסומן במקום של הריצה — ובדיוק במסמכים שיש בהם
 * מעקב שינויים, שהם המסמכים שאין רשות לשבור.
 *
 * ## מה מוגן, ואיך — הכלל שקובע
 *
 * **`rPr` שיושבת בתוך `rPr` אחרת אינה עיצוב חי, ומדולגת.** ב-`CT_RPr` האיבר
 * היחיד שמכיל `rPr` הוא `w:rPrChange`, ולכן קינון **הוא** ההגדרה של „זו
 * היסטוריה”. אין כאן זיהוי של `rPrChange` בשמו, ובכוונה: הניסיון הראשון ספר
 * `<w:rPrChange>` פתוחות מול סגורות, ומונה כזה נשבר משלוש דרכים שנמדדו — שם
 * מחבר שיש בו `>`, קידומת שאינה `w`, וסגירה תלושה שהורידה אותו מתחת לאפס ואז
 * כתבה **לתוך** ההיסטוריה הבאה. הגרועה מכולן: מונה שנתקע על 1 מכבה את התיקון
 * מאותו בייט ועד סוף החלק, בשקט.
 *
 * המחיר של הכלל הצר: `rPr` שיושבת בתוך `w:pPrChange` אינה מוגנת. `CT_PPrBase`
 * — ה-`pPr` שבתוך `pPrChange` — אינו מכיל `rPr` כלל, ולכן Word אינו יכול
 * לכתוב שם אחת. זה מה שהכלל מכסה ומה שאינו, בלי להבטיח יותר.
 *
 * ## סדר האלמנטים
 *
 * `<w:b/>` נכתב **מיד לפני** `<w:bCs/>`. `CT_RPr` היא רצף (`xsd:sequence`) ובו
 * `b` באה לפני `bCs`; נמדד גם על קורפוס: ב-10,855 `rPr` שנכתבו בידי Word ויש
 * בהן את שתיהן, `b` קדמה ב-100%, ו-0 בסדר ההפוך. סכימת OOXML לא נמצאה במכונה
 * (נסרקו ה-node_modules, הרפו, ושתי התקנות Office), ולכן זו עדות ולא הוכחה.
 */
export function repairComplexScriptBold(xml: string): string | null {
  // חיפוש מחרוזת אחד לפני הסריקה. `document.xml` של ספר הוא מגה-בייטים, ורובם
  // המכריע של המסמכים אינם נוגעים לזה בכלל.
  if (!xml.includes('bCs')) return null;

  const inserts: BoldInsert[] = [];
  /** עומק ה-`rPr`. 1 = העיצוב החי; 2 ומעלה = היסטוריה של שינוי מסומן. */
  let depth = 0;
  let scope: RunPropsScope | null = null;

  // רגקס חדש לכל קריאה, ולא אחד גלובלי שמאפסים לו `lastIndex`: `lastIndex` הוא
  // מצב, ומצב משותף בין קריאות הוא מלכודת שמחכה למי שיקרא מכאן פעמיים. המחיר
  // זניח — נקרא לכל היותר פעם אחת לחלק.
  const token = new RegExp(TOKEN_SOURCE.source, 'g');
  for (let match = token.exec(xml); match; match = token.exec(xml)) {
    const closer = SKIPPED_SPANS.get(match[0]);
    if (closer !== undefined) {
      const end = xml.indexOf(closer, token.lastIndex);
      // הערה שאינה נסגרת: אין יותר תגים שאפשר לסמוך עליהם, וחצי סריקה גרועה
      // מלא-סריקה. מה שנאסף עד כאן מוחל, וזה בטוח — הוא כולו מלפני ההערה.
      if (end < 0) break;
      token.lastIndex = end + closer.length;
      continue;
    }

    const [, closing, prefix, name, attributes] = match;
    const selfClosing = attributes.endsWith('/');

    if (name === 'rPr') {
      if (selfClosing) continue;
      if (!closing) {
        depth += 1;
        if (depth === 1) {
          scope = { hasBold: false, boldCsAt: null, boldCsOn: false, prefix };
        }
        continue;
      }
      // סגירה בלי פתיחה — מסמך קטוע. מתעלמים, ולא יורדים מתחת לאפס.
      if (depth === 0) continue;
      depth -= 1;
      if (depth === 0 && scope) {
        if (scope.boldCsOn && scope.boldCsAt !== null && !scope.hasBold) {
          inserts.push({ at: scope.boldCsAt, prefix: scope.prefix });
        }
        scope = null;
      }
      continue;
    }

    if (depth !== 1 || !scope || closing) continue;
    if (name === 'b') scope.hasBold = true;
    else if (name === 'bCs') {
      // המקום מה**ראשונה**, המצב מה**אחרונה** — ושני חצאי ההחלטה שונים
      // בכוונה. `rPr` עם שתי `bCs` פסולה מלכתחילה, אבל התוצאה אסור לה להיות
      // פסולה **יותר**: `CT_RPr` היא `xsd:sequence` שבו `b` בא לפני `bCs`,
      // ולכן הוספה לפני ה-`bCs` השנייה מציבה `b` **אחרי** `bCs` — כלומר חלק
      // שהסכימה של Word פוסלת. המצב נלקח מהאחרונה, כי בכפילות Word מכריע
      // „האחרון קובע”.
      if (scope.boldCsAt === null) scope.boldCsAt = match.index;
      scope.boldCsOn = isOn(attributes);
      scope.prefix = prefix;
    }
  }

  if (inserts.length === 0) return null;

  // הפיצול מניח סדר עולה, וזה מובטח מבנית: הכנסה נרשמת רק כשה-`rPr` **החיצונית**
  // נסגרת, והבאה אחריה נפתחת אחריה. הבדיקה „אינה משנה דבר מלבד ה-b שהוסיפה”
  // היא מה ששומר על ההנחה הזאת.
  //
  // מערך ו-`join` **לא בגלל מהירות** — נמדד, ואין הפרש. `+=` נראה מהיר פי
  // עשרה בהרכבה (V8 בונה cons-string ודוחה את השיטוח), אבל השיטוח נפרע
  // ב-`TextEncoder().encode` שקורא את התווים, ואז השניים שווים בתוך הרעש:
  // על 28,400 הכנסות ב-3.5MB נמדדו 31 מול 27ms בהרצה אחת ו-48 מול 50ms
  // בשנייה. מדידה של ההרכבה בלבד כאן היא מדידה של שום דבר.
  //
  // מה שכן: הצורה הזאת אומרת „חתוך, הכנס, חתוך” במקום לתחזק מחרוזת מצטברת.
  const parts: string[] = [];
  let at = 0;
  for (const insert of inserts) {
    parts.push(xml.slice(at, insert.at), `<${insert.prefix}:b/>`);
    at = insert.at;
  }
  parts.push(xml.slice(at));
  return parts.join('');
}

/**
 * מה שנאמר למשתמש כשהדגשת כתב מורכב הושלמה.
 *
 * מנוסח כמצב ולא כשגיאה, ואומר גם את מה שיקרה אחר כך — השמירה תכתוב את
 * ההשלמה לקובץ, וזה החלק שהמשתמש אינו יכול לנחש.
 */
export const COMPLEX_SCRIPT_BOLD_NOTICE =
  'הדגשה שמוצגת ב-Word ולא הוצגה כאן הושלמה במסמך — שמירה תכתוב אותה לקובץ';

/** תיקון אחד: על אילו חלקים הוא חל, מה הוא עושה, ומה נרשם ביומן כשעשה. */
interface PartRepair {
  matches(name: string): boolean;
  /** `null` = אין מה לתקן בחלק הזה. */
  repair(xml: string): string | null;
  note(name: string): string;
  /**
   * מה שנאמר למשתמש בשורת המצב כשהתיקון הוחל, או `null` כשאין מה לומר לו.
   *
   * שדה מפורש ולא גזירה מנוסח ה-`note`: שורת המצב שהמשתמש רואה אינה אמורה
   * להיות תלויה במחרוזת שנכתבת ליומן, ושינוי נוסח ביומן אינו אמור להעלים
   * אותה בשקט.
   */
  notice: string | null;
}

/**
 * התיקונים, בסדר שבו הם מוחלים. שניים כרגע; הרשימה קיימת כדי שהשלישי לא
 * יידרש להוסיף עוד מקרה פרטי ל-`preflightDocx`.
 */
const REPAIRS: PartRepair[] = [
  {
    // ללא תלות ברישיות, כמו `CONTENT_PARTS`. שני התיקונים ניגשים לאותו
    // ארכיון, ו„`Word/Settings.xml` מקבל אחד ולא את השני” הוא חוסר עקביות
    // שאין לו טעם — גם אם אין כלי שכותב כך.
    matches: (name) => name.toLowerCase() === SETTINGS_PART,
    repair: repairSettings,
    note: () =>
      `${SETTINGS_PART}: defaultTabStop מתוקן ל-${DEFAULT_TAB_STOP_TWIPS} — הערך שהיה מקפיא את המנוע`,
    // `defaultTabStop` אינו נראה למשתמש בשום צורה — הוא רק ההפרש בין מסמך
    // שנפתח למסמך שקופא — ושורת מצב שמדווחת על כל דבר היא שורת מצב שאיש אינו
    // קורא.
    notice: null,
  },
  {
    matches: (name) => CONTENT_PARTS.test(name),
    repair: repairComplexScriptBold,
    note: (name) => `${name}: <w:b/> הושלם לצד <w:bCs/> — בלעדיו הדגשת עברית אינה מגיעה למסך`,
    notice: COMPLEX_SCRIPT_BOLD_NOTICE,
  },
];

/** מה שהשלב המקדים מוציא: המסמך שיימסר למנוע, ומה שנקרא עליו בדרך. */
export interface PreflightResult {
  /** המקור שיש למסור למנוע. זהה למקור שנכנס כשלא נגענו בו. */
  source: string | File | Blob | undefined;
  /** תוכן `FONT_TABLE_PART`, או `null` כשאין או שלא נקרא. */
  fontTable: string | null;
  /**
   * המאקרו שבמסמך — לקריאה בלבד (engine/vba-import.ts).
   *
   * כאן מאותו טעם כמו טבלת הגופנים: הבייטים כבר נקראו והארכיון כבר נפתח, וזה
   * גם **הרגע** הנכון — הידיעה שבמסמך יש מאקרו שWord מריץ בפתיחה שייכת לזמן
   * הפתיחה, לא לזמן שבו המשתמש יחשוב לחפש אותה.
   */
  vba: DocumentVba;
  /**
   * הודעה למשתמש כשהמסמך תוקן, או `null` כשלא נגענו בו.
   *
   * **למה זה יוצא מכאן ולא נשאר ב-`console`:** התיקון השני נכתב לתוך המסמך,
   * וממילא ייצא איתו בשמירה. משתמש שהמסמך שלו שונה זכאי לדעת שהוא שונה, וזה
   * אינו מידע שאפשר להשאיר ביומן שאיש אינו פותח. אותו מסלול בדיוק שבו
   * `vba.status` מגיע לשורת המצב (App.vue).
   *
   * `notes` המפורטים נשארים ביומן: שורת מצב אינה המקום לשמות חלקים.
   */
  notice: string | null;
}

/**
 * מקור המסמך, אחרי תיקון. מחזירה את המקור עצמו כשאין מה לתקן — כולל כשהבדיקה
 * עצמה לא הצליחה לרוץ.
 *
 * הבייטים שנקראו כאן הם מה שנמסר למנוע (כ-Blob), גם כשלא נגענו בהם: מקור
 * URL היה גורם למנוע לקרוא את הקובץ שנית מ-loopback. רק כשל בקריאה עצמה
 * משאיר את המקור כפי שהתקבל.
 *
 * טבלת הגופנים נקראת באותה הזדמנות: הבייטים כבר כאן והארכיון כבר נפתח, ולכן
 * קריאה שנייה שלהם רק בשביל הטבלה הייתה בזבוז.
 */
export async function preflightSource(
  source: string | File | Blob | undefined,
): Promise<PreflightResult> {
  if (source === undefined) return { source, fontTable: null, vba: NO_VBA, notice: null };

  let bytes: Bytes;
  try {
    bytes =
      typeof source === 'string'
        ? new Uint8Array(await (await fetch(source)).arrayBuffer())
        : new Uint8Array(await source.arrayBuffer());
  } catch (error) {
    console.warn('[otzaria-word] הבדיקה המקדימה לא קראה את המסמך', error);
    return { source, fontTable: null, vba: NO_VBA, notice: null };
  }

  const asRead = (): Blob => (source instanceof Blob ? source : new Blob([bytes], { type: DOCX_MIME }));
  const fontTable = await readDocxPart(bytes, FONT_TABLE_PART);
  // על בייטי המקור ולא על המתוקנים: התיקונים נוגעים לחלקי ה-XML של הגוף
  // והסגנונות, ואין טעם לקרוא את המאקרו מעותק שנכתב מחדש.
  const vba = await readDocumentVba(bytes);

  let repaired: DocxRepair | null;
  try {
    repaired = await preflightDocx(bytes);
  } catch (error) {
    // „לתקן, ולא לחסום” גם כאן: הזריקה היחידה שנשארה בפנים היא הקצאה של
    // ארכיון גדול מדי, ומסמך שהיה נפתח בלי השלב הזה ייפתח בלעדיו.
    console.warn('[otzaria-word] הבדיקה המקדימה נכשלה, והמסמך נמסר כמות שהוא', error);
    return { source: asRead(), fontTable, vba, notice: null };
  }
  if (!repaired) return { source: asRead(), fontTable, vba, notice: null };

  // כל תיקון נרשם בנפרד: מי שיקרא את היומן על מסמך שהתנהג במפתיע צריך לדעת
  // **מה** שונה בו, ולא רק שנגענו.
  for (const note of repaired.notes) console.warn(`[otzaria-word] ${note}`);
  return {
    source: new Blob([repaired.bytes], { type: DOCX_MIME }),
    fontTable,
    vba,
    notice: repaired.notice,
  };
}

/**
 * תוכן חלק מתוך ה-DOCX כטקסט. `null` כשאינו קיים, כשהארכיון אינו נקרא, או
 * כשהדחיסה אינה נתמכת — שלושה מקרים שבהם פשוט אין לנו מה לומר עליו.
 */
export async function readDocxPart(bytes: Bytes, name: string): Promise<string | null> {
  const entry = readZip(bytes)?.find((candidate) => candidate.name === name);
  return entry ? readEntryText(entry) : null;
}

/** מסמך שתוקן: הבייטים שיימסרו למנוע, ומה שנעשה בהם. */
export interface DocxRepair {
  bytes: Bytes;
  /** שורה לכל תיקון שהוחל, לפי הסדר. ריק אינו אפשרי — בלי תיקון אין תוצאה. */
  notes: string[];
  /**
   * מה שיש לומר למשתמש, או `null` כשכל מה שתוקן אינו נראה לו. רק התיקון
   * שנכתב לתוך המסמך מגיע לשורת המצב — ראו `PartRepair.notice`.
   */
  notice: string | null;
}

/**
 * בייטי DOCX מתוקנים, או `null` כשאין מה לתקן ואין מה לדווח.
 *
 * מיוצאת בנפרד מ-`preflightSource` כדי שאפשר יהיה לבדוק אותה בלי רשת ובלי
 * `Blob` — היא כל הלוגיקה שיש כאן.
 *
 * חלק שאינו נקרא (דחיסה שאינה נתמכת, נתונים שאינם נפרסים) מדולג ואינו מפיל את
 * שאר התיקונים: אין קשר בין החלקים, ומסמך שאחד מהם אינו נקרא אינו סיבה למסור
 * את השני שבור.
 */
export async function preflightDocx(bytes: Bytes): Promise<DocxRepair | null> {
  const entries = readZip(bytes);
  if (!entries) return null;

  const notes: string[] = [];
  let notice: string | null = null;
  const patched = new Map<ZipEntry, ZipEntry>();

  for (const entry of entries) {
    const repairs = REPAIRS.filter((candidate) => candidate.matches(entry.name));
    if (repairs.length === 0) continue;

    const original = await readEntryText(entry);
    if (original === null) continue;

    let xml = original;
    for (const repair of repairs) {
      const next = repair.repair(xml);
      if (next === null) continue;
      xml = next;
      notes.push(repair.note(entry.name));
      notice ??= repair.notice;
    }
    if (xml !== original) patched.set(entry, await rewriteEntry(entry, new TextEncoder().encode(xml)));
  }

  if (patched.size === 0) return null;

  const rewritten = entries.map((entry) => patched.get(entry) ?? entry);
  return { bytes: writeZip(rewritten), notes, notice };
}

/**
 * הרשומה של חלק שתוקן: דחוסה כשאפשר, ו-`STORED` כשלא.
 *
 * ה-CRC והגודל הלא-דחוס נמדדים על התוכן, ולא על מה שנכתב — כך ZIP מגדיר אותם,
 * וכך גם קורא שפורס את הרשומה יודע לאמת אותה. הדחיסה היא **בונוס**, לא תנאי:
 * אם `CompressionStream` חסר או נכשל, הרשומה נכתבת גלויה, ובשני המקרים הקורא
 * מקבל בדיוק את אותם בייטים אחרי הפריסה.
 *
 * `versionNeeded` מורם ל-2.0 כשנכתב deflate: רשומה שהמקור שלה היה `STORED`
 * (1.0) ועכשיו דחוסה מצהירה על מה שהיא. מקור שכבר היה 2.0 ומעלה נשאר כפי שהוא.
 */
async function rewriteEntry(entry: ZipEntry, content: Bytes): Promise<ZipEntry> {
  const deflated = await deflateVerified(content);
  return {
    ...entry,
    flags: entry.flags & ~ZIP_FLAG_DATA_DESCRIPTOR,
    method: deflated ? METHOD_DEFLATE : METHOD_STORED,
    versionNeeded: deflated ? Math.max(entry.versionNeeded, ZIP_VERSION_DEFLATE) : entry.versionNeeded,
    crc: crc32(content),
    data: deflated ?? content,
    uncompressedSize: content.byteLength,
  };
}

/**
 * פענוח XML של חלק, **בלי לפשוט את ה-BOM**.
 *
 * ברירת המחדל של `TextDecoder` מוחקת U+FEFF, ו-`TextEncoder` אינו מחזיר אותו,
 * ולכן חלק שהתחיל ב-BOM היה נכתב מחדש בלעדיו. אין לזה נזק תפקודי — ההצהרה
 * אומרת UTF-8 — אבל ההבטחה בכותרת הקובץ היא „זהה למקור בכל מה שאינו התיקון
 * עצמו”, וזה חלק ממנה.
 */
function decodeXml(bytes: Bytes): string {
  return new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
}

/** תוכן החלק כטקסט, או `null` כשאי אפשר לפרוס אותו. */
async function readEntryText(entry: ZipEntry): Promise<string | null> {
  if (entry.method === METHOD_STORED) return decodeXml(entry.data);
  if (entry.method !== METHOD_DEFLATE) return null;

  const inflated = await inflateRaw(entry.data);
  return inflated && decodeXml(inflated);
}

/**
 * פריסת deflate גולמי דרך `DecompressionStream`.
 *
 * `null` כשהסביבה אינה מכירה אותו או כשהנתונים אינם נפרסים — שני מקרים שבהם
 * אין לנו מה לומר על המסמך, ולכן הוא נמסר למנוע כמות שהוא.
 */
function inflateRaw(data: Bytes): Promise<Bytes | null> {
  const Decompression = (globalThis as { DecompressionStream?: typeof DecompressionStream })
    .DecompressionStream;
  if (!Decompression) return Promise.resolve(null);
  return pipeThrough(data, () => new Decompression('deflate-raw'), 'פריסת חלק מהמסמך נכשלה');
}

/**
 * דחיסת deflate גולמי דרך `CompressionStream` — ההופכי של `inflateRaw`, באותו
 * API ובאותה נפילה-חזרה.
 *
 * `null` כשהסביבה אינה מכירה אותו או כשהדחיסה נכשלה. בשני המקרים החלק נכתב
 * `STORED`, ולכן זה אינו כשל של התיקון אלא רק ויתור על החיסכון בזיכרון.
 */
function deflateRaw(data: Bytes): Promise<Bytes | null> {
  const Compression = (globalThis as { CompressionStream?: typeof CompressionStream })
    .CompressionStream;
  if (!Compression) return Promise.resolve(null);
  return pipeThrough(data, () => new Compression('deflate-raw'), 'דחיסת חלק מהמסמך נכשלה');
}

/**
 * דחיסה שאומתה: הפלט נפרס בחזרה ומושווה למקור לפני שהוא נכתב.
 *
 * זה מה שעונה על החשש שבגללו לא הייתה כאן דחיסה עד עכשיו — „דוחס שמתנהג אחרת
 * מהצפוי הוא באג שקט במסמך של המשתמש”. אחרי סבב מלא של דחיסה-ופריסה עם
 * השוואת CRC, דוחס שגוי אינו יכול להיות שקט: הוא נופל כאן ל-`STORED`. המחיר
 * הוא פריסה נוספת של החלק, ובשביל `document.xml` של ספר זה עשרות מילישניות
 * על פתיחה שממילא נמדדת במאות.
 *
 * `null` גם כשהדחיסה אינה קטנה מהמקור: רשומה גלויה קצרה יותר היא פשוט
 * הרשומה הנכונה.
 */
async function deflateVerified(content: Bytes): Promise<Bytes | null> {
  const deflated = await deflateRaw(content);
  if (!deflated || deflated.byteLength >= content.byteLength) return null;

  const restored = await inflateRaw(deflated);
  if (!restored || restored.byteLength !== content.byteLength || crc32(restored) !== crc32(content)) {
    console.warn('[otzaria-word] הדחיסה לא שחזרה את החלק בדיוק — נכתב לא-דחוס');
    return null;
  }
  return deflated;
}

/** מעבירה בייטים דרך זרם-טרנספורמציה ואוספת את הפלט. `null` ומיומן על כשל. */
async function pipeThrough(
  data: Bytes,
  transform: () => ReadableWritablePair<Uint8Array, BufferSource>,
  failure: string,
): Promise<Bytes | null> {
  try {
    const source = new ReadableStream<BufferSource>({
      start(controller) {
        controller.enqueue(data);
        controller.close();
      },
    });
    const reader = source.pipeThrough(transform()).getReader();

    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }

    const out = new Uint8Array(total);
    let at = 0;
    for (const chunk of chunks) {
      out.set(chunk, at);
      at += chunk.byteLength;
    }
    return out;
  } catch (error) {
    console.warn(`[otzaria-word] ${failure}`, error);
    return null;
  }
}

/**
 * קריאת הארכיון מהספרייה המרכזית שלו — ולא מסריקת כותרות מקומיות, שהיא ניחוש
 * כשיש בהן data descriptor. `null` פירושו „לא ארכיון שאני מבין”, וזו תשובה
 * חוקית לגמרי: המנוע יקבל את המקור.
 */
function readZip(bytes: Bytes): ZipEntry[] | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocd(view);
  if (eocd < 0) return null;

  const count = view.getUint16(eocd + 10, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (count === ZIP64_MARKER_16 || centralOffset === ZIP64_MARKER_32) return null;

  const entries: ZipEntry[] = [];
  let at = centralOffset;
  for (let i = 0; i < count; i++) {
    if (at + ZIP_CENTRAL_HEADER_SIZE > bytes.byteLength) return null;
    if (view.getUint32(at, true) !== ZIP_CENTRAL_SIGNATURE) return null;

    const flags = view.getUint16(at + 8, true);
    if (flags & ZIP_FLAG_ENCRYPTED) return null;

    const compressedSize = view.getUint32(at + 20, true);
    const uncompressedSize = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const localOffset = view.getUint32(at + 42, true);
    if (compressedSize === ZIP64_MARKER_32 || localOffset === ZIP64_MARKER_32) return null;

    const nameBytes = bytes.subarray(at + ZIP_CENTRAL_HEADER_SIZE, at + ZIP_CENTRAL_HEADER_SIZE + nameLength);
    const data = entryData(bytes, view, localOffset, compressedSize);
    if (!data) return null;

    entries.push({
      name: new TextDecoder().decode(nameBytes),
      nameBytes: nameBytes.slice(),
      versionMadeBy: view.getUint16(at + 4, true),
      versionNeeded: view.getUint16(at + 6, true),
      flags,
      method: view.getUint16(at + 10, true),
      modTime: view.getUint16(at + 12, true),
      modDate: view.getUint16(at + 14, true),
      crc: view.getUint32(at + 16, true),
      internalAttrs: view.getUint16(at + 36, true),
      externalAttrs: view.getUint32(at + 38, true),
      data,
      uncompressedSize,
    });

    at += ZIP_CENTRAL_HEADER_SIZE + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** הבייטים המאוחסנים של רשומה, לפי הכותרת המקומית שלה. */
function entryData(
  bytes: Bytes,
  view: DataView,
  localOffset: number,
  compressedSize: number,
): Bytes | null {
  if (localOffset + ZIP_LOCAL_HEADER_SIZE > bytes.byteLength) return null;
  if (view.getUint32(localOffset, true) !== ZIP_LOCAL_SIGNATURE) return null;

  const nameLength = view.getUint16(localOffset + 26, true);
  const extraLength = view.getUint16(localOffset + 28, true);
  const start = localOffset + ZIP_LOCAL_HEADER_SIZE + nameLength + extraLength;
  if (start + compressedSize > bytes.byteLength) return null;

  return bytes.subarray(start, start + compressedSize);
}

/**
 * מיקום ה-EOCD. נסרק מהסוף, כי לארכיון מותרת הערה בת עד 64KB אחריו.
 */
function findEocd(view: DataView): number {
  const last = view.byteLength - ZIP_EOCD_SIZE;
  const first = Math.max(0, view.byteLength - ZIP_EOCD_SIZE - 0xffff);
  for (let at = last; at >= first; at--) {
    if (view.getUint32(at, true) === ZIP_EOCD_SIGNATURE) return at;
  }
  return -1;
}

/**
 * כתיבת הארכיון מחדש.
 *
 * שדות ה-extra וההערות אינם נכתבים: הם נושאים חותמות זמן ומידע של מערכת
 * הקבצים, ואינם חלק ממה ש-DOCX הוא. מה שכן נשמר בדיוק הוא סדר הרשומות,
 * השמות, שיטת הדחיסה והבייטים עצמם.
 */
function writeZip(entries: ZipEntry[]): Bytes {
  let size = ZIP_EOCD_SIZE;
  for (const entry of entries) {
    size += ZIP_LOCAL_HEADER_SIZE + entry.nameBytes.byteLength + entry.data.byteLength;
    size += ZIP_CENTRAL_HEADER_SIZE + entry.nameBytes.byteLength;
  }

  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  const offsets: number[] = [];
  let at = 0;

  for (const entry of entries) {
    offsets.push(at);
    view.setUint32(at, ZIP_LOCAL_SIGNATURE, true);
    view.setUint16(at + 4, entry.versionNeeded, true);
    view.setUint16(at + 6, entry.flags & ~ZIP_FLAG_DATA_DESCRIPTOR, true);
    view.setUint16(at + 8, entry.method, true);
    view.setUint16(at + 10, entry.modTime, true);
    view.setUint16(at + 12, entry.modDate, true);
    view.setUint32(at + 14, entry.crc, true);
    view.setUint32(at + 18, entry.data.byteLength, true);
    view.setUint32(at + 22, entry.uncompressedSize, true);
    view.setUint16(at + 26, entry.nameBytes.byteLength, true);
    view.setUint16(at + 28, 0, true);
    at += ZIP_LOCAL_HEADER_SIZE;
    out.set(entry.nameBytes, at);
    at += entry.nameBytes.byteLength;
    out.set(entry.data, at);
    at += entry.data.byteLength;
  }

  const centralOffset = at;
  entries.forEach((entry, index) => {
    view.setUint32(at, ZIP_CENTRAL_SIGNATURE, true);
    view.setUint16(at + 4, entry.versionMadeBy, true);
    view.setUint16(at + 6, entry.versionNeeded, true);
    view.setUint16(at + 8, entry.flags & ~ZIP_FLAG_DATA_DESCRIPTOR, true);
    view.setUint16(at + 10, entry.method, true);
    view.setUint16(at + 12, entry.modTime, true);
    view.setUint16(at + 14, entry.modDate, true);
    view.setUint32(at + 16, entry.crc, true);
    view.setUint32(at + 20, entry.data.byteLength, true);
    view.setUint32(at + 24, entry.uncompressedSize, true);
    view.setUint16(at + 28, entry.nameBytes.byteLength, true);
    view.setUint16(at + 30, 0, true);
    view.setUint16(at + 32, 0, true);
    view.setUint16(at + 34, 0, true);
    view.setUint16(at + 36, entry.internalAttrs, true);
    view.setUint32(at + 38, entry.externalAttrs, true);
    view.setUint32(at + 42, offsets[index], true);
    at += ZIP_CENTRAL_HEADER_SIZE;
    out.set(entry.nameBytes, at);
    at += entry.nameBytes.byteLength;
  });

  view.setUint32(at, ZIP_EOCD_SIGNATURE, true);
  view.setUint16(at + 4, 0, true);
  view.setUint16(at + 6, 0, true);
  view.setUint16(at + 8, entries.length, true);
  view.setUint16(at + 10, entries.length, true);
  view.setUint32(at + 12, at - centralOffset, true);
  view.setUint32(at + 16, centralOffset, true);
  view.setUint16(at + 20, 0, true);

  return out;
}

let crcTable: Uint32Array | null = null;

/**
 * CRC32 כפי ש-ZIP מגדיר אותו. טבלה אחת, בייט אחר בייט.
 *
 * מיוצאת בשביל הבדיקה בלבד — אין לה קורא אחר מחוץ למודול. מה שהבדיקה שומרת
 * עליו הוא שוויון עם מימוש ייחוס: CRC שגוי הוא ארכיון שבור, וזה כשל שקט.
 *
 * **„slice-by-4” נכתב כאן ונמדד איטי יותר, ולכן הוסר.** מאז שהתיקון השני
 * נכנס החלק שנכתב מחדש עשוי להיות `document.xml` של ספר שלם, ולכן נראה
 * שכדאי. נמדד ב-Node 24, שלוש הרצות, מינימום מתוך חמש חזרות בכל אחת:
 *
 *     גודל     בייט-בבייט     slice-by-4
 *     5.6MB    33–50ms        77–127ms
 *     64KB     0.31–0.63ms    0.81–1.05ms
 *     512B     0.002ms        0.018–0.024ms
 *
 * גם הווריאנט בלי `>>> 0` בתוך הלולאה — כלומר בלי לייצר uint32 שיוצא מטווח
 * ה-Smi בכל איטרציה — נשאר איטי מהפשוט בכל הגדלים. V8 מהדר את הלולאה הצרה
 * הזאת טוב יותר ממה שארבע טבלאות (4KB במקום 1KB) מרוויחות. **לא לכתוב את
 * זה שוב בלי למדוד.**
 */
export function crc32(bytes: Bytes): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let value = i;
      for (let bit = 0; bit < 8; bit++) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      crcTable[i] = value >>> 0;
    }
  }

  let crc = 0xffffffff;
  for (let i = 0; i < bytes.byteLength; i++) {
    crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
