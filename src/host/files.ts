/**
 * קבצי משתמש דרך ה-SDK של אוצריא.
 *
 * הבייטים אינם עוברים בגשר ה-JS בשני הכיוונים. בקריאה: אוצריא מגישה את הקובץ
 * משרת loopback ומחזירה `url` שנמסר ישירות ל-`Config.document` של SuperDoc.
 * בכתיבה: התוסף מקבל `uploadUrl` ושולח אליו PUT יחיד, וה-commit הוא שמחליט
 * לאן הבייטים נכתבים. ה-url תקף לריצה אחת בלבד — הפורט משתנה בכל הפעלה —
 * ולכן ה-token הוא מה שנשמר, ובעלייה חוזרת קוראים `fs.resolveFileUrl`.
 */
import { call, tryCall, isPermissionDenied } from './otzaria-client';
import { bytesToBase64 } from './base64';
import { DOCX_MIME, type WordExtension } from '../engine/export';
import { EMBEDDABLE_IMAGE_EXTENSIONS, imageMimeForFileName } from '../engine/payloads';

export interface UserFile {
  token: string;
  url: string;
  name: string;
  size: number;
  /** קיים מ-0.9.97. `readwrite` = ה-token יכול לשמש כיעד כתיבה. */
  access?: 'read' | 'readwrite';
}

interface PickResponse extends Partial<UserFile> {
  cancelled?: boolean;
}

/**
 * פותחת את בורר הקבצים של אוצריא. `null` = המשתמש ביטל — זה אינו כשל, ואין
 * לפרק בגללו את המסמך הפתוח.
 *
 * `readwrite` מבקש token שניתן לכתוב אליו בחזרה בלי דיאלוג נוסף. אם ההרשאה
 * חסרה, הבקשה נכשלת — ולכן נופלים לקריאה בלבד: עדיף מסמך שנפתח ואינו נשמר
 * מאשר מסמך שלא נפתח.
 */
export async function pickDocxFile(
  options: { title?: string; access?: 'read' | 'readwrite' } = {},
): Promise<UserFile | null> {
  const { title, access = 'readwrite' } = options;

  const request = async (mode: 'read' | 'readwrite'): Promise<UserFile | null> => {
    const res = await call<PickResponse>('fs.pickUserFile', {
      // `docm` ולא רק `docx`: מסמך עם מאקרו הוא אותה חבילת OOXML בדיוק, והוא
      // נפתח ונערך כאן כמו כל מסמך אחר — המאקרו עצמם אינם מורצים (אין מנוע
      // VBA בדפדפן) אבל נשמרים כמות שהם, ואפשר לראות את הקוד שלהם ב-Alt+F8.
      // בלי הסיומת הזאת הקובץ פשוט לא הופיע בבורר, ולמשתמש לא הייתה שום דרך
      // לפתוח את המסמך שהוא עובד עליו שנים.
      extensions: ['docx', 'docm'],
      access: mode,
      ...(title ? { title } : {}),
    });
    if (!res || res.cancelled || !res.token || !res.url) return null;
    return {
      token: res.token,
      url: res.url,
      name: res.name ?? 'מסמך',
      size: res.size ?? 0,
      access: res.access ?? mode,
    };
  };

  try {
    return await request(access);
  } catch (error) {
    // הזיהוי נעשה ב-otzaria-client לפי ה-`code` שאוצריא נתנה, עם ההודעה
    // כגיבוי. הבדיקה שהייתה כאן קראה **תוכן מחרוזת** בלבד, כלומר נשענה על
    // נוסח שאוצריא בחרה ויכולה לשנות בלי התראה — ואז „אין הרשאת כתיבה” היה
    // מפיל את הפתיחה במקום ליפול לקריאה בלבד.
    if (access === 'read' || !isPermissionDenied(error)) throw error;
    console.warn('[otzaria-word] אין הרשאת כתיבה; נפתח לקריאה בלבד', error);
    return request('read');
  }
}

/**
 * בורר תמונה. `access: 'read'` ולא `readwrite`: תמונה נקראת ומוטמעת במסמך,
 * ואין שום מסלול שכותב אליה בחזרה — בקשת הרשאת כתיבה עליה הייתה הרשאה מיותרת
 * ודיאלוג נוסף שיכול להיכשל.
 *
 * `extensions` הוא הרשימה שהמנוע מטמיע בפועל (ראו `EMBEDDABLE_IMAGE_EXTENSIONS`)
 * ולא רשימת תמונות רחבה: הדיאלוג מסנן לפיה, וכך המשתמש אינו בוחר GIF שייכשל
 * רק אחרי שהוא כבר לחץ „פתח”.
 *
 * `null` = ביטול. אינו כשל ואין להציג עליו שגיאה.
 */
export async function pickImageFile(options: { title?: string } = {}): Promise<UserFile | null> {
  const { title = 'בחירת תמונה' } = options;
  const res = await call<PickResponse>('fs.pickUserFile', {
    extensions: [...EMBEDDABLE_IMAGE_EXTENSIONS],
    access: 'read',
    title,
  });
  if (!res || res.cancelled || !res.token || !res.url) return null;
  return {
    token: res.token,
    url: res.url,
    name: res.name ?? 'תמונה',
    size: res.size ?? 0,
    access: res.access ?? 'read',
  };
}

/**
 * הגבול שמעליו תמונה אינה מוטמעת.
 *
 * לא גבול של ה-SDK אלא שלנו, ומשתי סיבות: ה-data URI תופס שליש יותר מהבייטים
 * (base64), והבייטים עצמם נכתבים לתוך ה-DOCX — כלומר תמונה של 30MB מייצרת
 * מסמך של 30MB שכל שמירה שלו עוברת שוב בגשר. 10MB מכסה כל צילום מטלפון,
 * ומעליו ההודעה מסבירה מה לעשות במקום להיתקע.
 */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * התוצאה של קריאת תמונה. מטופסת ולא זריקה, כדי שהקורא בממשק יציג הודעה אחת
 * בעברית ולא יעטוף כל מסלול ב-try. הדפוס זהה ל-`SearchOutcome` ב-engine/search.ts.
 */
export type ImageDataUrlResult =
  | { ok: true; dataUrl: string }
  | { ok: false; message: string; reason: string };

/**
 * קוראת את בייטי התמונה מ-URL ה-loopback וממירה אותם ל-data URI.
 *
 * למה בכלל: `create.image` דורש data URI בבסיס 64 ודוחה URL — ראו ההסבר המלא
 * ב-engine/payloads.ts. גם אילו קיבל URL, ה-URL של אוצריא תקף לריצה אחת (הפורט
 * משתנה בכל הפעלה) והקובץ אינו קיים במכונה של מי שיקבל את המסמך — כלומר תמונה
 * שבורה. ההמרה כאן היא מה שהופך את התמונה לחלק מהמסמך.
 *
 * ה-mime נגזר משם הקובץ ולא מ-`Content-Type` של התגובה: השרת מגיש קבצי משתמש
 * ו-`application/octet-stream` הוא תשובה חוקית שלו, בעוד ה-mime שב-data URI הוא
 * זה שקובע אם המנוע ינתב את הבייטים ל-PNG או ל-JPEG.
 */
export async function readImageAsDataUrl(file: UserFile): Promise<ImageDataUrlResult> {
  const mime = imageMimeForFileName(file.name);
  if (!mime) {
    return {
      ok: false,
      reason: 'unsupported-format',
      message: `אפשר להוסיף תמונות מסוג ${EMBEDDABLE_IMAGE_EXTENSIONS.join(', ')} בלבד`,
    };
  }

  // נבדק לפני ההורדה כשהבורר דיווח גודל: אין טעם למשוך 40MB דרך הגשר כדי
  // לדחות אותם. `size: 0` פירושו שלא דווח, והבדיקה האמיתית היא זו שאחרי.
  if (file.size > MAX_IMAGE_BYTES) return tooLarge();

  let bytes: Uint8Array;
  try {
    const response = await fetch(file.url);
    if (!response.ok) {
      return {
        ok: false,
        reason: 'fetch-failed',
        message: `קריאת התמונה נכשלה (${response.status})`,
      };
    }
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    return {
      ok: false,
      reason: 'fetch-threw',
      message: error instanceof Error ? error.message : 'קריאת התמונה נכשלה',
    };
  }

  if (bytes.byteLength === 0) {
    return { ok: false, reason: 'empty', message: 'הקובץ שנבחר ריק' };
  }
  if (bytes.byteLength > MAX_IMAGE_BYTES) return tooLarge();

  return { ok: true, dataUrl: `data:${mime};base64,${bytesToBase64(bytes)}` };
}

function tooLarge(): ImageDataUrlResult {
  const limit = Math.round(MAX_IMAGE_BYTES / (1024 * 1024));
  return {
    ok: false,
    reason: 'too-large',
    message: `התמונה גדולה מ-${limit}MB. כדאי להקטין אותה לפני ההוספה`,
  };
}

export interface WriteTicket {
  writeToken: string;
  uploadUrl: string;
  maxBytes: number;
}

export interface CommitResult {
  cancelled: boolean;
  token?: string;
  name?: string;
  size?: number;
}

/** פותחת העלאה. `expectedSize` מאפשר דחייה מוקדמת של קובץ גדול מדי. */
export async function beginBinaryWrite(expectedSize: number): Promise<WriteTicket> {
  const res = await call<Partial<WriteTicket>>('fs.beginBinaryWrite', {
    purpose: 'user-file',
    expectedSize,
  });
  if (!res?.writeToken || !res.uploadUrl) {
    throw new Error('אוצריא לא החזירה יעד לשמירה');
  }
  return {
    writeToken: res.writeToken,
    uploadUrl: res.uploadUrl,
    maxBytes: res.maxBytes ?? 0,
  };
}

/**
 * אבחון חד-פעמי לכשל רשת בהעלאה („Failed to fetch”).
 *
 * „Failed to fetch” הוא כל מה שהדפדפן אומר, והוא מכסה שני עולמות שונים
 * לגמרי: שרת ה-loopback אינו נגיש בכלל, או שדווקא ה-PUT נחסם (שער בקשות
 * של ה-WebView, preflight שנכשל). ההבחנה נמדדת: GET לנתיב קובץ של השרת.
 * אם ה-GET עובר (כל סטטוס HTTP הוא הוכחת נגישות) — הבעיה ב-PUT עצמו; אם
 * גם הוא נופל — השרת אינו נגיש מהדף.
 *
 * למה `/f/probe` ולא השורש: שער ה-WebView של אוצריא מאשר לתוסף רק נתיבי
 * `/f/` (ובגרסאות שלפני התיקון של `/w/` — רק אותם), ו-GET לשורש היה נחסם
 * באותו שער בדיוק כמו ה-PUT, כך ששני המקרים היו נראים „השרת אינו נגיש”.
 * token שאינו קיים מחזיר 404 מהשרת עצמו — וזו ההוכחה שהוא נגיש.
 *
 * הבדיקה עצמה נעשית פעם אחת לכל חיי הדף: שמירה אוטומטית רצה כל כמה שניות,
 * ובדיקה בכל כשל הייתה מציפה את הלוג ואת השרת. **הממצא, לעומת זאת, מוצמד
 * לכל כשל.** קודם עמד כאן דגל בוליאני, ולכן הכשל השני והלאה קיבל „העלאת
 * המסמך נכשלה: Failed to fetch” חשוף — אותה תקלה בדיוק, בהודעה שאינה אומרת
 * דבר, ותלוי רק בשאלה אם זה הניסיון הראשון. צילום מסך של שורת המצב הוא ערוץ
 * הדיווח בפועל, ולכן הממצא חייב להיות בו בכל פעם.
 *
 * מה נשמר בין כשלים הוא רק מה שקבוע לכל חיי הדף: תוצאת ה-GET, המסקנה ממנה
 * (`blockedByHost`) וה-`דף`. ה-`יעד` **אינו** נשמר ומורכב מחדש בכל כשל, כי
 * לכל שמירה יש `uploadUrl` משלה — write-token אחר, ולעיתים מסמך אחר לגמרי.
 * כששמרנו את מחרוזת האבחון כולה, שורת המצב של הכשל החמישי הציגה את היעד של
 * הכשל הראשון; ומכיוון שצילום המסך הוא הדיווח, זה שלח את המפתח לרדוף אחרי
 * כתיבה ל-token ישן שמעולם לא קרתה.
 */
interface UploadProbe {
  /** הדף שממנו יצא ה-PUT. */
  page: string;
  /** תיאור תוצאת ה-GET — הוכחת נגישות, או הכשל שלה. */
  probe: string;
  /** השרת נגיש ודווקא ה-PUT נחסם, כלומר שער הבקשות של אוצריא. */
  blockedByHost: boolean;
}

let uploadProbe: Promise<UploadProbe> | undefined;

async function uploadFailureDetail(uploadUrl: string): Promise<string> {
  uploadProbe ??= probeUploadHost(uploadUrl);
  const { page, probe, blockedByHost } = await uploadProbe;
  const detail = `דף=${page}, יעד=${uploadUrl}, ${probe}`;
  // שרת נגיש ו-PUT חסום פירושו שער הבקשות של אוצריא, ולא תקלת רשת: התוסף
  // אינו יכול לעקוף אותו, ולכן ההודעה אומרת מה כן אפשר לעשות.
  const advice = blockedByHost ? ' — גרסת אוצריא הזאת חוסמת את כתיבת המסמך; נדרש עדכון' : '';
  return `${advice} [${detail}]`;
}

async function probeUploadHost(uploadUrl: string): Promise<UploadProbe> {
  let probe: string;
  let blockedByHost = false;
  try {
    const origin = new URL(uploadUrl).origin;
    const res = await fetch(`${origin}/f/probe`, { method: 'GET' });
    probe = `GET לשרת עבר (${res.status}) — ה-PUT עצמו נחסם`;
    blockedByHost = true;
  } catch (probeError) {
    probe = `גם GET לשרת נכשל (${
      probeError instanceof Error ? probeError.message : String(probeError)
    }) — השרת אינו נגיש מהדף`;
  }

  const page = window.location.origin || window.location.protocol;
  // לוג אחד לכל חיי הדף, כמו הבדיקה עצמה — שמירה אוטומטית שנכשלת שוב ושוב
  // הייתה מציפה אותו. ה-`יעד` אינו כאן דווקא משום שהוא משתנה בין כשל לכשל:
  // הוא נמצא בהודעת השגיאה של כל כשל בנפרד.
  console.error('[otzaria-word] אבחון כשל העלאה:', `דף=${page}, ${probe}`);
  return { page, probe, blockedByHost };
}

/**
 * שולחת את הבייטים ב-PUT יחיד. לא עוברת בגשר — `fetch` ישירות לשרת ה-loopback.
 * `keepalive` אינו בשימוש בכוונה: הוא מוגבל לגוף קטן, וכאן מדובר במסמך.
 */
export async function uploadBytes(uploadUrl: string, blob: Blob): Promise<void> {
  let response: Response;
  try {
    response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': blob.type || DOCX_MIME },
      body: blob,
    });
  } catch (error) {
    // TypeError של fetch: הבקשה לא הגיעה לשרת בכלל. ראו uploadFailureDetail.
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`העלאת המסמך נכשלה: ${reason}${await uploadFailureDetail(uploadUrl)}`);
  }
  if (!response.ok) {
    throw new Error(`העלאת המסמך נכשלה (${response.status})`);
  }
}

/**
 * מבטל העלאה שלא תגיע ל-commit — למשל שמירה שהמסמך שלה הוחלף באמצע. בלי זה
 * הקובץ הזמני והסלוט במכסה נתפסים עד שה-token פג (שתי דקות).
 *
 * לא זורק: זהו ניקוי, ואם הוא נכשל אין למשתמש מה לעשות עם זה.
 */
export async function abortBinaryWrite(writeToken: string): Promise<void> {
  const ok = await tryCall<boolean>('fs.abortBinaryWrite', { writeToken });
  if (ok !== true) {
    console.warn('[otzaria-word] ביטול ההעלאה לא הושלם', writeToken);
  }
}

export interface CommitOptions {
  writeToken: string;
  /** יעד קיים לכתיבה. בלעדיו נפתח „שמור בשם”. */
  targetToken?: string;
  suggestedName?: string;
  title?: string;
  /**
   * הסיומת שהמאחז מצמיד לשם בדיאלוג „שמור בשם”, ושלפיה הוא מסנן בו.
   *
   * לא קבוע `docx`: המאחז מצמיד את הסיומת לשם **אלא אם** הוא כבר מסתיים בה,
   * ולכן `docx` קבוע על מסמך מאקרו הציע לשמור את `ספר.docm` בשם
   * `ספר.docm.docx` — ועוד סינן את הדיאלוג ל-`docx`. כלומר בדיוק החבילה
   * עם `vbaProject` שנושאת שם `.docx` שאותה יש להימנע ממנה.
   * ראו `resolveSaveExtension` ב-engine/export.ts.
   *
   * `txt` — ייצוא לפורמט ספר של אוצריא (engine/otzaria-book.ts), שעובר
   * באותו מסלול שמירה בדיוק.
   */
  extension?: WordExtension | 'txt';
}

/** כותבת את ההעלאה לקובץ. `cancelled` פירושו שהמשתמש סגר את „שמור בשם”. */
export async function commitUserFileWrite(options: CommitOptions): Promise<CommitResult> {
  const { writeToken, targetToken, suggestedName, title, extension } = options;
  const res = await call<CommitResult>('fs.commitUserFileWrite', {
    writeToken,
    ...(targetToken ? { targetToken } : {}),
    ...(suggestedName ? { suggestedName } : {}),
    ...(title ? { title } : {}),
    extension: extension ?? 'docx',
  });
  if (!res) throw new Error('השמירה לא הושלמה');
  if (res.cancelled) return { cancelled: true };
  if (!res.token) throw new Error('השמירה הושלמה בלי מזהה קובץ');
  return res;
}

/**
 * ממירה token שמור ל-URL חדש. `null` פירושו שהקובץ הוזז, נמחק, או שההרשאה
 * בוטלה — המשתמש צריך לבחור אותו מחדש, ולא לקבל לולאת שגיאה.
 */
export async function resolveFileUrl(token: string): Promise<UserFile | null> {
  try {
    const res = await call<Partial<UserFile>>('fs.resolveFileUrl', { token });
    if (!res?.url) return null;
    return { token, url: res.url, name: res.name ?? 'מסמך', size: res.size ?? 0 };
  } catch {
    return null;
  }
}
