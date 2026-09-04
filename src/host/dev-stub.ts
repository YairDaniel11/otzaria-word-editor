/**
 * stub לפיתוח בדפדפן רגיל, כשאין window.Otzaria.
 * נטען רק ב-import.meta.env.DEV ולכן אינו נכנס ל-build.
 *
 * הוא משגר plugin.boot כ-CustomEvent על window — בדיוק כמו אוצריא — ולא
 * קורא ל-callbacks ישירות, כדי שה-latch שב-otzaria-client ייבדק בפיתוח באותו
 * מסלול שבו הוא עובד בייצור.
 *
 * מה שהוא **כן** מדמה: בורר קבצים אמיתי, מסלול הכתיבה המלא (begin → PUT →
 * commit) עם הורדה אמיתית ב„שמור בשם”, storage, ודיאלוגי אישור. כך אפשר לעבור
 * את כל הזרימה בדפדפן — פתיחה, עריכה, שמירה, שמירה בשם ופתיחה חוזרת — בלי
 * אוצריא. מה שהוא **אינו** מדמה: כתיבה אטומית לדיסק, הרשאות, ואת ה-WebView.
 * לאלה יש שער Windows.
 */
import type { BootPayload, OtzariaGlobal } from '../types/otzaria_plugin';

const BOOT: BootPayload = {
  plugin: { id: 'dev', version: '0.0.0' },
  app: {
    version: '0.9.97',
    platform: 'dev',
    locale: 'he-IL',
    language: 'he',
    textDirection: 'rtl',
    devMode: true,
    runMode: 'foreground',
  },
  theme: {
    mode: 'light',
    colorScheme: {
      primary: '#1565C0',
      onPrimary: '#ffffff',
      secondary: '#6750A4',
      onSecondary: '#ffffff',
      surface: '#f8f9fa',
      onSurface: '#1a1a2e',
      onSurfaceVariant: '#49454f',
      surfaceContainerHigh: '#ece6f0',
      surfaceContainerHighest: '#e0e0e0',
      outline: '#cbd5e1',
      error: '#b00020',
      onError: '#ffffff',
    },
    typography: {
      fontFamily: 'FrankRuhlCLM',
      fontSize: 18,
      lineHeight: 1.5,
      commentatorsFontFamily: 'Shofar',
      commentatorsFontSize: 14,
    },
  },
  connectivity: { isOfflineMode: false, hasNetwork: false, isOnline: false },
  permissions: ['fs.user_files.read', 'fs.user_files.write'],
};

/** קבצים שה„משתמש” בחר בריצה הזאת. נעלמים ברענון — כמו grant אמיתי שאבד. */
const files = new Map<string, { name: string; url: string; writable: boolean }>();
/** העלאות שממתינות ל-commit. */
const uploads = new Map<string, Blob>();
const UPLOAD_PREFIX = 'https://dev-stub.invalid/w/';
let counter = 0;

const storagePrefix = 'otzaria-word-dev:';
const workspacePrefix = 'otzaria-word-dev-fs:';

function pickFile(): Promise<{ file: File | null }> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.docx';
    input.addEventListener('change', () => resolve({ file: input.files?.[0] ?? null }), {
      once: true,
    });
    input.addEventListener('cancel', () => resolve({ file: null }), { once: true });
    input.click();
  });
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function handle(method: string, payload: Record<string, unknown> = {}): Promise<unknown> {
  switch (method) {
    case 'fs.pickUserFile': {
      const { file } = await pickFile();
      if (!file) return { cancelled: true };
      const token = `dev-file-${++counter}`;
      const url = URL.createObjectURL(file);
      const writable = payload.access === 'readwrite';
      files.set(token, { name: file.name, url, writable });
      return {
        cancelled: false,
        token,
        url,
        name: file.name,
        size: file.size,
        access: writable ? 'readwrite' : 'read',
      };
    }

    case 'fs.resolveFileUrl': {
      const entry = files.get(String(payload.token));
      // ברענון הדף ה-blob אבד. זה בדיוק מה שקורה כשקובץ הוזז — והמסלול הזה
      // צריך להיבדק גם הוא.
      if (!entry) throw new Error('error.not_found: dev stub lost the file on reload');
      return { token: payload.token, url: entry.url, name: entry.name, size: 0 };
    }

    case 'fs.beginBinaryWrite': {
      const writeToken = `dev-write-${++counter}`;
      return {
        writeToken,
        uploadUrl: `${UPLOAD_PREFIX}${writeToken}`,
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
        maxBytes: 100 * 1024 * 1024,
      };
    }

    case 'fs.abortBinaryWrite': {
      uploads.delete(String(payload.writeToken));
      return true;
    }

    case 'fs.commitUserFileWrite': {
      const blob = uploads.get(String(payload.writeToken));
      if (!blob) throw new Error('error.not_found: unknown or incomplete upload');
      uploads.delete(String(payload.writeToken));

      const target = payload.targetToken ? files.get(String(payload.targetToken)) : undefined;
      if (target) {
        // „שמור” לקובץ קיים. אין דיסק כאן, ולכן רק מדווחים — הבייטים אמיתיים.
        console.info(`[stub] נשמר ל-${target.name} (${blob.size} בייטים)`);
        return { cancelled: false, token: payload.targetToken, name: target.name, size: blob.size };
      }

      // הסיומת מהקריאה, כמו באוצריא — קבוע `.docx` היה מציע `ספר.txt.docx`
      // בייצוא לפורמט אוצריא.
      const suggestedBase = String(payload.suggestedName ?? 'מסמך');
      const extension = String(payload.extension ?? 'docx');
      const suggested = suggestedBase.toLowerCase().endsWith(`.${extension}`)
        ? suggestedBase
        : `${suggestedBase}.${extension}`;
      const name = window.prompt('שמור בשם (dev):', suggested);
      if (name === null) return { cancelled: true };
      // הורדה אמיתית, כדי שאפשר יהיה לפתוח את התוצר ב-Word.
      download(blob, name);
      const token = `dev-file-${++counter}`;
      files.set(token, { name, url: URL.createObjectURL(blob), writable: true });
      return { cancelled: false, token, name, size: blob.size };
    }

    // מה שמאפשר ל-resolveBoot לשחזר את מצב האתחול כשהאירוע אבד. אוצריא מעניקה
    // את app.info.read כהרשאת בסיס, ולכן זה עובד גם שם בלי הצהרה במניפסט.
    case 'app.getInfo':
      return BOOT.app;
    case 'app.getTheme':
      return BOOT.theme;
    case 'app.getGrantedPermissions':
      return BOOT.permissions;

    case 'storage.get': {
      const raw = window.localStorage.getItem(storagePrefix + String(payload.key));
      return raw === null ? null : JSON.parse(raw);
    }
    case 'storage.set':
      window.localStorage.setItem(
        storagePrefix + String(payload.key),
        JSON.stringify(payload.value ?? null),
      );
      return true;
    case 'storage.remove':
      window.localStorage.removeItem(storagePrefix + String(payload.key));
      return true;

    /**
     * המרחב הפרטי של התוסף (`fs.*`), על localStorage.
     *
     * למה זה חייב להיות ב-stub: בלעדיו אין דרך לעבור בפיתוח את המסלול שבו
     * מסמך שלא נשמר חוזר אחרי סגירה — והמסלול הזה הוא בדיוק זה שאסור לו
     * להישבר. הנתונים שורדים רענון, כמו שהם שורדים סגירה באוצריא.
     */
    case 'fs.writeFile': {
      const content = String(payload.content ?? '');
      window.localStorage.setItem(workspacePrefix + String(payload.path), content);
      return { path: payload.path, size: content.length, usedBytes: content.length, quotaBytes: 0 };
    }
    case 'fs.readFile': {
      const content = window.localStorage.getItem(workspacePrefix + String(payload.path));
      if (content === null) throw new Error('error.not_found: no such file');
      return { path: payload.path, encoding: payload.encoding ?? 'utf8', size: content.length, content };
    }
    case 'fs.deleteEntry':
      window.localStorage.removeItem(workspacePrefix + String(payload.path));
      return true;
    case 'fs.stat': {
      const content = window.localStorage.getItem(workspacePrefix + String(payload.path));
      if (content === null) return { exists: false };
      return {
        exists: true,
        path: payload.path,
        name: String(payload.path),
        type: 'file',
        size: content.length,
        modified: new Date().toISOString(),
      };
    }

    case 'ui.showConfirm':
      return {
        confirmed: window.confirm(`${String(payload.title)}\n\n${String(payload.content)}`),
      };
    case 'ui.showError':
      console.error('[stub] שגיאה:', payload.message);
      return true;
    case 'ui.showMessage':
    case 'ui.showSuccess':
      console.info('[stub]', payload.message);
      return true;

    /**
     * `ui.exportPdf` — מחוץ לאוצריא אין דיאלוג „שמור בשם” של מערכת ההפעלה
     * ואין מנוע שמייצר PDF. הכפיל מדפיס את מה שהיה נשלח ומדווח ביטול: זהו
     * המצב שאינו יוצר קובץ ואינו מתחזה להצלחה, ובכל זאת מריץ את כל מסלול
     * ההכנה (`@page` והגלון) שאותו כן אפשר לבדוק בדפדפן.
     *
     * ה-`version` של הכפיל הוא 0.9.97, ולכן הפקד **כן** פעיל בפיתוח — אחרת
     * מסלול ההכנה לא היה נבדק כלל מחוץ לאוצריא.
     */
    case 'ui.exportPdf':
      console.info('[stub] ui.exportPdf', payload);
      return { saved: false, name: null };

    /**
     * `library.refreshUserBooks` — אין ספרייה בפיתוח. „אפס ספרים נקלטו” הוא
     * המצב האמיתי מחוץ לאוצריא, והוא גם מפעיל את נוסח ההודעה שמסביר על
     * תיקייה אישית — הנוסח שדווקא צריך בדיקה בדפדפן.
     */
    case 'library.refreshUserBooks':
      console.info('[stub] library.refreshUserBooks');
      return { addedBooks: 0, updatedBooks: 0, errors: [] };

    default:
      console.info('[stub] call לא ממומש:', method, payload);
      return null;
  }
}

export function installDevStub(): void {
  if ((window as Partial<Window>).Otzaria) return;

  // ה-PUT של ההעלאה אינו יוצא לרשת — נתפס כאן ונשמר בזיכרון.
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (init?.method === 'PUT' && url.startsWith(UPLOAD_PREFIX)) {
      const writeToken = url.slice(UPLOAD_PREFIX.length);
      const body = init.body;
      uploads.set(writeToken, body instanceof Blob ? body : new Blob([]));
      return new Response(null, { status: 204 });
    }
    return realFetch(input, init);
  };

  const stub = {
    async call(method: string, payload?: Record<string, unknown>) {
      try {
        return { success: true, data: await handle(method, payload), error: null };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const [code] = message.split(':');
        return { success: false, data: null, error: { code, message } };
      }
    },
    on(event: string, cb: (payload: unknown) => void) {
      window.addEventListener(event, (e) => cb((e as CustomEvent).detail));
    },
    off() {
      // ה-stub אינו שומר הפניות; אין צורך בביטול בפיתוח.
    },
  };

  // ה-stub מממש רק את מה שהתוסף באמת קורא לו, ולא את כל העומסים של
  // OtzariaGlobal — לכן ההמרה המפורשת.
  window.Otzaria = stub as unknown as OtzariaGlobal;

  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('plugin.boot', { detail: BOOT }));
  }, 0);
}
