/**
 * ביטול בבורר הקבצים אינו כשל: הוא לא אמור להשמיד מסמך פתוח ולא להציג
 * שגיאה. token שאינו נפתר פירושו קובץ שהוזז או נמחק — גם זה לא שגיאה אלא
 * מצב שדורש בחירה מחדש.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  MAX_IMAGE_BYTES,
  commitUserFileWrite,
  pickDocxFile,
  pickImageFile,
  readImageAsDataUrl,
  resolveFileUrl,
  type UserFile,
} from '../../src/host/files';

function hostReturns(data: unknown): ReturnType<typeof vi.fn> {
  const call = vi.fn(async () => ({ success: true, data, error: null }));
  window.Otzaria = { call } as never;
  return call;
}

afterEach(() => {
  delete (window as Partial<Window>).Otzaria;
  vi.unstubAllGlobals();
});

describe('pickDocxFile', () => {
  it('מבקשת docx לכתיבה ומחזירה את הקובץ', async () => {
    const call = hostReturns({
      cancelled: false,
      token: 'tok',
      url: 'http://127.0.0.1:1/f',
      name: 'חידושים.docx',
      size: 1234,
      access: 'readwrite',
    });

    await expect(pickDocxFile()).resolves.toEqual({
      token: 'tok',
      url: 'http://127.0.0.1:1/f',
      name: 'חידושים.docx',
      size: 1234,
      access: 'readwrite',
    });
    // ברירת המחדל היא readwrite, אחרת „שמור” יצטרך דיאלוג בכל פעם.
    // `docm` ברשימה: מסמך עם מאקרו הוא אותה חבילת OOXML בדיוק, ובלי הסיומת
    // הזאת הוא לא הופיע בבורר כלל — למשתמש לא הייתה שום דרך לפתוח את המסמך
    // שהוא עובד עליו שנים.
    expect(call).toHaveBeenCalledWith('fs.pickUserFile', {
      extensions: ['docx', 'docm'],
      access: 'readwrite',
    });
  });

  it('מעבירה כותרת לדיאלוג כשנמסרה', async () => {
    const call = hostReturns({ cancelled: true });

    await pickDocxFile({ title: 'בחר מסמך' });

    expect(call).toHaveBeenCalledWith('fs.pickUserFile', {
      extensions: ['docx', 'docm'],
      access: 'readwrite',
      title: 'בחר מסמך',
    });
  });

  it('מחזירה מסמך עם מאקרו כמו כל מסמך אחר', async () => {
    hostReturns({
      cancelled: false,
      token: 'tok',
      url: 'http://127.0.0.1:1/f',
      name: 'מאקרו.docm',
      size: 99,
      access: 'readwrite',
    });

    // הבורר אינו מבחין בין השניים, וגם אינו אמור: מה שמבחין הוא סיומת השמירה
    // (engine/export.ts) וקריאת המאקרו (engine/vba-import.ts).
    await expect(pickDocxFile()).resolves.toMatchObject({ name: 'מאקרו.docm' });
  });

  it('בלי הרשאת כתיבה נופלת לקריאה בלבד ולא מפילה את הפתיחה', async () => {
    const call = vi.fn(async (_method: string, payload?: Record<string, unknown>) => {
      if (payload?.access === 'readwrite') {
        return {
          success: false,
          data: null,
          error: { code: 'error.permission_denied', message: 'permission_denied' },
        };
      }
      return {
        success: true,
        data: { cancelled: false, token: 't', url: 'u', name: 'a.docx', size: 1 },
        error: null,
      };
    });
    window.Otzaria = { call } as never;

    const file = await pickDocxFile();

    expect(file?.access).toBe('read');
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('מזהה כשל הרשאה מה-code גם כשההודעה אינה מזכירה אותו', async () => {
    // הזיהוי היה בחיפוש מחרוזת בהודעה. אוצריא מפרידה בין `code` להודעה,
    // וההודעה היא טקסט חופשי — גרסה שתנסח אותה אחרת הייתה מפילה את הפתיחה
    // במקום ליפול לקריאה בלבד.
    const call = vi.fn(async (_method: string, payload?: Record<string, unknown>) => {
      if (payload?.access === 'readwrite') {
        return {
          success: false,
          data: null,
          error: { code: 'error.permission_denied', message: 'ההרשאה לא אושרה' },
        };
      }
      return {
        success: true,
        data: { cancelled: false, token: 't', url: 'u', name: 'a.docx', size: 1 },
        error: null,
      };
    });
    window.Otzaria = { call } as never;

    const file = await pickDocxFile();

    expect(file?.access).toBe('read');
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('מזהה כשל הרשאה גם מהודעה בלי code — גרסת אוצריא ותיקה', async () => {
    // תאימות לאחור: envelope בלי `code` הוא כל מה שגרסה קודמת נותנת, וההודעה
    // היא הסימן היחיד שנשאר.
    const call = vi.fn(async (_method: string, payload?: Record<string, unknown>) => {
      if (payload?.access === 'readwrite') {
        return { success: false, data: null, error: { message: 'permission_denied' } };
      }
      return {
        success: true,
        data: { cancelled: false, token: 't', url: 'u', name: 'a.docx', size: 1 },
        error: null,
      };
    });
    window.Otzaria = { call } as never;

    const file = await pickDocxFile();

    expect(file?.access).toBe('read');
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('שגיאה שאינה הרשאה אינה מנסה שוב', async () => {
    const call = vi.fn(async () => ({
      success: false,
      data: null,
      error: { code: 'error.internal', message: 'boom' },
    }));
    window.Otzaria = { call } as never;

    await expect(pickDocxFile()).rejects.toThrow('boom');
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('ביטול מחזיר null', async () => {
    hostReturns({ cancelled: true });

    await expect(pickDocxFile()).resolves.toBeNull();
  });

  it('תשובה בלי url מחזירה null ולא אובייקט חלקי', async () => {
    hostReturns({ cancelled: false, token: 'tok' });

    await expect(pickDocxFile()).resolves.toBeNull();
  });
});

describe('resolveFileUrl', () => {
  it('מחזירה url חדש לאותו token', async () => {
    const call = hostReturns({ url: 'http://127.0.0.1:2/f', name: 'a.docx', size: 5 });

    await expect(resolveFileUrl('tok')).resolves.toEqual({
      token: 'tok',
      url: 'http://127.0.0.1:2/f',
      name: 'a.docx',
      size: 5,
    });
    expect(call).toHaveBeenCalledWith('fs.resolveFileUrl', { token: 'tok' });
  });

  it('כשל של ה-Host מחזיר null ולא זריקה', async () => {
    window.Otzaria = {
      call: vi.fn(async () => ({
        success: false,
        data: null,
        error: { code: 'error.not_found', message: 'הקובץ לא נמצא' },
      })),
    } as never;

    await expect(resolveFileUrl('tok')).resolves.toBeNull();
  });
});

describe('pickImageFile', () => {
  it('מבקשת רק את הסיומות שהמנוע מטמיע, ולקריאה בלבד', async () => {
    const call = hostReturns({
      cancelled: false,
      token: 'tok',
      url: 'http://127.0.0.1:1/i',
      name: 'ציון.png',
      size: 4096,
    });

    await expect(pickImageFile()).resolves.toEqual({
      token: 'tok',
      url: 'http://127.0.0.1:1/i',
      name: 'ציון.png',
      size: 4096,
      access: 'read',
    });

    // gif/bmp/webp אינם ברשימה בכוונה: `create.image` דוחה אותם, וסיומת
    // שתיכשל אחרי הבחירה גרועה מסיומת שלא הוצעה.
    expect(call).toHaveBeenCalledWith('fs.pickUserFile', {
      extensions: ['png', 'jpg', 'jpeg'],
      access: 'read',
      title: 'בחירת תמונה',
    });
  });

  it('ביטול מחזיר null ולא כשל', async () => {
    hostReturns({ cancelled: true });

    await expect(pickImageFile()).resolves.toBeNull();
  });

  it('תשובה בלי url מחזירה null ולא אובייקט חלקי', async () => {
    hostReturns({ cancelled: false, token: 'tok', name: 'a.png' });

    await expect(pickImageFile()).resolves.toBeNull();
  });

  it('דחיית הרשאה מגיעה לקורא ואינה נבלעת', async () => {
    // אין נפילה חזרה כמו ב-pickDocxFile: הבקשה כאן ממילא `read`, וההרשאה
    // `fs.user_files.read` היא היחידה שנדרשת. אם היא נדחתה אין מסלול שני.
    window.Otzaria = {
      call: vi.fn(async () => ({
        success: false,
        data: null,
        error: { code: 'error.permission_denied', message: 'permission_denied' },
      })),
    } as never;

    await expect(pickImageFile()).rejects.toThrow('permission_denied');
  });

  it('כשל RPC אחר מגיע לקורא', async () => {
    window.Otzaria = {
      call: vi.fn(async () => ({
        success: false,
        data: null,
        error: { code: 'error.internal', message: 'boom' },
      })),
    } as never;

    await expect(pickImageFile()).rejects.toThrow('boom');
  });
});

/** קובץ מהבורר, לצורך `readImageAsDataUrl`. */
function imageFile(overrides: Partial<UserFile> = {}): UserFile {
  return {
    token: 'tok',
    url: 'http://127.0.0.1:1/i',
    name: 'ציון.png',
    size: 8,
    access: 'read',
    ...overrides,
  };
}

/** תגובת loopback עם בייטים. `fetch` ולא הגשר — כך גם בקוד. */
function loopbackReturns(bytes: Uint8Array, init: { ok?: boolean; status?: number } = {}) {
  const fetchMock = vi.fn(async () => ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('readImageAsDataUrl', () => {
  it('ממירה את הבייטים ל-data URI — לא מעבירה את ה-URL', async () => {
    // זו נקודת אובדן הנתונים כולה: `create.image` דורש base64 data URI, ו-URL
    // של ה-loopback היה גם נדחה וגם שובר את התמונה בפתיחה הבאה.
    const fetchMock = loopbackReturns(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));

    const result = await readImageAsDataUrl(imageFile({ size: 4 }));

    expect(result).toEqual({ ok: true, dataUrl: 'data:image/png;base64,iVBORw==' });
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:1/i');
  });

  it('ה-mime נגזר מהסיומת ולא מהתגובה', async () => {
    // שרת ה-loopback רשאי להחזיר `application/octet-stream`, וה-mime שב-data
    // URI הוא זה שקובע לאיזה מסלול המנוע ינתב את הבייטים.
    loopbackReturns(new Uint8Array([0xff, 0xd8, 0xff]));

    const result = await readImageAsDataUrl(imageFile({ name: 'צילום.JPG', size: 3 }));

    expect(result).toEqual({ ok: true, dataUrl: 'data:image/jpeg;base64,/9j/' });
  });

  it('סיומת שהמנוע אינו מטמיע נדחית לפני ההורדה', async () => {
    const fetchMock = loopbackReturns(new Uint8Array([1, 2, 3]));

    const result = await readImageAsDataUrl(imageFile({ name: 'הנפשה.gif' }));

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    if (!result.ok) expect(result.reason).toBe('unsupported-format');
  });

  it('webp נדחה גם הוא — המנוע פורס אותו ואז דוחה במפורש', async () => {
    const result = await readImageAsDataUrl(imageFile({ name: 'a.webp' }));

    expect(result.ok).toBe(false);
  });

  it('קובץ גדול מהמותר נדחה לפני ההורדה', async () => {
    const fetchMock = loopbackReturns(new Uint8Array([1]));

    const result = await readImageAsDataUrl(imageFile({ size: MAX_IMAGE_BYTES + 1 }));

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    if (!result.ok) expect(result.reason).toBe('too-large');
  });

  it('גודל שהבורר לא דיווח נתפס אחרי ההורדה', async () => {
    // `size: 0` פירושו „לא דווח”, ולכן הבדיקה השנייה היא זו שמגנה בפועל.
    loopbackReturns(new Uint8Array(MAX_IMAGE_BYTES + 1));

    const result = await readImageAsDataUrl(imageFile({ size: 0 }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('too-large');
  });

  it('תגובה שאינה ok מוחזרת כהודעה ולא כזריקה', async () => {
    loopbackReturns(new Uint8Array([1]), { ok: false, status: 404 });

    const result = await readImageAsDataUrl(imageFile());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('fetch-failed');
      expect(result.message).toContain('404');
    }
  });

  it('זריקה של fetch הופכת להודעה בעברית', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('הרשת נפלה');
      }),
    );

    const result = await readImageAsDataUrl(imageFile());

    expect(result).toEqual({ ok: false, reason: 'fetch-threw', message: 'הרשת נפלה' });
  });

  it('קובץ ריק אינו „הצלחה עם data URI ריק”', async () => {
    // `data:image/png;base64,` היה עובר את ה-regex של המנוע ונכשל רק בפרסור
    // הכותרת, עם הודעה באנגלית על מידות.
    loopbackReturns(new Uint8Array(0));

    const result = await readImageAsDataUrl(imageFile({ size: 0 }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('empty');
  });

  it('קובץ גדול אינו זורק RangeError בהמרה', async () => {
    // `String.fromCharCode(...bytes)` על מערך גדול חורג ממגבלת הארגומנטים,
    // ולכן ההמרה בגושים. 200KB עוברים את גבול ה-32KB פי כמה.
    loopbackReturns(new Uint8Array(200 * 1024).fill(0x41));

    const result = await readImageAsDataUrl(imageFile({ size: 200 * 1024 }));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.dataUrl.startsWith('data:image/png;base64,QUFB')).toBe(true);
  });
});

/**
 * הסיומת שנשלחת ל-`fs.commitUserFileWrite` היא מה שהמאחז מצמיד לשם בדיאלוג
 * „שמור בשם”, ומה שהוא מסנן לפיו. `docx` קבוע היה מציע לשמור את `ספר.docm`
 * בשם `ספר.docm.docx` — המאחז מצמיד את הסיומת אלא אם השם כבר מסתיים בה —
 * כלומר בדיוק חבילה עם `vbaProject` שנושאת שם `.docx`, מה שהעורך אמור
 * למנוע. ראו `resolveSaveExtension` ב-engine/export.ts.
 */
describe('commitUserFileWrite — הסיומת', () => {
  it('מעבירה את הסיומת המבוקשת למאחז', async () => {
    const call = hostReturns({ cancelled: false, token: 'tok', name: 'ספר.docm', size: 10 });

    await commitUserFileWrite({ writeToken: 'w1', suggestedName: 'ספר.docm', extension: 'docm' });

    expect(call).toHaveBeenCalledWith('fs.commitUserFileWrite', {
      writeToken: 'w1',
      suggestedName: 'ספר.docm',
      extension: 'docm',
    });
  });

  it('בלי סיומת מפורשת נשארת docx — התנהגות המסלול הרגיל', async () => {
    const call = hostReturns({ cancelled: false, token: 'tok', name: 'ספר.docx', size: 10 });

    await commitUserFileWrite({ writeToken: 'w1', suggestedName: 'ספר.docx' });

    expect(call).toHaveBeenCalledWith(
      'fs.commitUserFileWrite',
      expect.objectContaining({ extension: 'docx' }),
    );
  });
});

/**
 * „Failed to fetch” של ה-PUT הוא כל מה שהדפדפן אומר, ולכן `uploadBytes`
 * מריצה בדיקה אחת שמבחינה בין „השרת אינו נגיש” ל„דווקא ה-PUT נחסם”, ומצמידה
 * את הממצא להודעה — שורת המצב היא ערוץ הדיווח בפועל.
 *
 * הבדיקה כאן היא על **הכשל השני**: קודם עמד שם דגל בוליאני שכיבה את האבחון
 * אחרי הפעם הראשונה, ולכן אותה תקלה בדיוק הציגה „העלאת המסמך נכשלה: Failed
 * to fetch” חשוף מהניסיון השני והלאה. הבדיקה עצמה עדיין רצה פעם אחת.
 */
describe('uploadBytes — אבחון כשל רשת', () => {
  it('הממצא מוצמד לכל כשל, וה-probe נשלח פעם אחת', async () => {
    vi.resetModules();
    const { uploadBytes } = await import('../../src/host/files');

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/f/probe')) return { status: 404 } as Response;
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetchMock);

    const put = (): Promise<Error> =>
      uploadBytes('http://127.0.0.1:1/w/tok', new Blob(['x'])).then(
        () => new Error('לא נזרק'),
        (error: unknown) => error as Error,
      );

    const first = await put();
    const second = await put();

    for (const failure of [first, second]) {
      expect(failure.message).toContain('העלאת המסמך נכשלה');
      expect(failure.message).toContain('ה-PUT עצמו נחסם');
      expect(failure.message).toContain('נדרש עדכון');
    }
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/f/probe')),
    ).toHaveLength(1);
  });

  /**
   * הבדיקה נשמרת בין כשלים — אבל ה-`יעד` לא. לכל שמירה יש `uploadUrl` משלה
   * (write-token אחר, ולעיתים מסמך אחר), וכששמרנו את מחרוזת האבחון כולה
   * הכשל השני הציג בשורת המצב את היעד של הראשון. מכיוון שצילום המסך של
   * שורת המצב הוא הדיווח בפועל, זה נראה כמו כתיבה ל-token ישן שלא קרתה.
   */
  it('היעד הוא של הכשל הנוכחי ולא של הראשון, אף שה-probe נשמר', async () => {
    vi.resetModules();
    const { uploadBytes } = await import('../../src/host/files');

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/f/probe')) return { status: 404 } as Response;
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetchMock);

    const put = (uploadUrl: string): Promise<Error> =>
      uploadBytes(uploadUrl, new Blob(['x'])).then(
        () => new Error('לא נזרק'),
        (error: unknown) => error as Error,
      );

    const first = await put('http://127.0.0.1:1/w/token-ראשון');
    const second = await put('http://127.0.0.1:1/w/token-שני');

    expect(first.message).toContain('יעד=http://127.0.0.1:1/w/token-ראשון');
    expect(second.message).toContain('יעד=http://127.0.0.1:1/w/token-שני');
    expect(second.message).not.toContain('token-ראשון');
    // הממצא עצמו עדיין נשמר: הכשל השני לא הריץ בדיקה חדשה.
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/f/probe')),
    ).toHaveLength(1);
  });

  it('שרת שאינו נגיש — הממצא אומר זאת, בלי לתלות את הכשל בגרסת אוצריא', async () => {
    vi.resetModules();
    const { uploadBytes } = await import('../../src/host/files');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    await expect(
      uploadBytes('http://127.0.0.1:1/w/tok', new Blob(['x'])),
    ).rejects.toThrow(/השרת אינו נגיש מהדף/);
  });
});
