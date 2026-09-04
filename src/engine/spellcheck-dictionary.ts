/**
 * טעינת המילון התורני — ורק כשהמשתמש הדליק את הבדיקה.
 *
 * ## למה נכס נפרד, ולא `import` של הנתונים
 *
 * ה-build הוא IIFE יחיד עם `inlineDynamicImports: true` (vite.config.ts), ולכן
 * גם `await import('...')` היה נבלע לתוך `assets/app.js`. כלומר: כל משתמש היה
 * משלם 1.3MB בפריסה ובזיכרון על תכונה שברירת המחדל שלה כבויה — ובעורך שכבר
 * פורס 16MB בעלייה זה בדיוק המחיר שאין סיבה לשלם.
 *
 * לכן המילון יוצא כנכס נפרד (`assets/torah-dictionary.js`, תוסף
 * `torahDictionaryAsset` ב-vite.config.ts) ונטען בהזרקת `<script>` בזמן ריצה.
 *
 * ## למה `<script>` ולא `fetch`
 *
 * אוצריא מריצה את התוסף מ-`file://` (docs/spike.md §שער A), ושם ה-origin
 * opaque ו-`fetch` על קובץ מקומי נחסם. תגית `<script>` היא המסלול שכבר נמדד
 * עובד באריזה הזאת — זה בדיוק מה ש-`assets/engine-workers.js` עושה, ומאותה
 * סיבה.
 *
 * ## כשל אינו נופל על המשתמש
 *
 * נכס חסר או פגום מחזיר `null`, והמתג ברצועה מדווח „טעינת המילון נכשלה”
 * ונשאר כבוי. עורך שנופל בגלל בדיקת איות הוא גרוע יותר מעורך בלי בדיקת איות.
 */
import {
  createDictionary,
  TORAH_DICTIONARY_FILE,
  TORAH_DICTIONARY_GLOBAL,
  type Dictionary,
} from './spellcheck';
import { loadSpellcheckWords, saveSpellcheckWords } from '../host/settings';

/** יחסי לדף — הוא נטען מ-`file://`. השם עצמו משותף עם תוסף הבנייה. */
const DICTIONARY_SRC = `./${TORAH_DICTIONARY_FILE}`;

/** כמה להמתין לנכס לפני שמוותרים. */
const LOAD_TIMEOUT_MS = 20_000;

/** הזרקת הנכס. מוחלף בבדיקות — אין `<script>` אמיתי ב-jsdom. */
type PackedLoader = () => Promise<string | null>;

function packedFromWindow(): string | null {
  const value = (globalThis as Record<string, unknown>)[TORAH_DICTIONARY_GLOBAL];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * מזריקה את הנכס פעם אחת ומחזירה את המחרוזת הארוזה.
 *
 * ה-`timeout` אינו חגורה כפולה: `<script>` שנתקע מ-`file://` אינו יורה `error`
 * ואינו יורה `load` — בלעדיו ההבטחה הזאת לא הייתה נפתרת לעולם, והמתג ברצועה
 * היה נשאר „טוען…” עד סוף ההפעלה.
 */
function injectDictionaryScript(): Promise<string | null> {
  const ready = packedFromWindow();
  if (ready !== null) return Promise.resolve(ready);

  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: string | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    const timer = setTimeout(() => finish(null), LOAD_TIMEOUT_MS);

    const script = document.createElement('script');
    script.async = false;
    script.src = DICTIONARY_SRC;
    script.addEventListener('load', () => finish(packedFromWindow()));
    script.addEventListener('error', () => finish(null));
    document.head.appendChild(script);
  });
}

let pending: Promise<Dictionary | null> | null = null;
let loaded: Dictionary | null = null;

/**
 * המילון, בטעינה עצלה וחד-פעמית. קריאות מקבילות (שני טאבים שנפתחים יחד)
 * חולקות את אותה הבטחה — לא שתי הזרקות של אותו נכס.
 *
 * כשל **אינו** נזכר: משתמש שכיבה והדליק שוב מקבל ניסיון נוסף, כי הכשל
 * השכיח כאן הוא נכס שעדיין לא נפרס ולא נכס שאינו קיים.
 */
export function loadTorahDictionary(loader: PackedLoader = injectDictionaryScript): Promise<Dictionary | null> {
  if (loaded) return Promise.resolve(loaded);
  if (pending) return pending;

  pending = (async () => {
    const [packed, userWords] = await Promise.all([loader(), loadSpellcheckWords()]);
    if (packed === null) return null;
    loaded = createDictionary(packed, userWords);
    return loaded;
  })()
    .catch(() => null)
    .finally(() => {
      pending = null;
    });

  return pending;
}

/** מוחקת את המילון הטעון. לבדיקות בלבד — בזמן ריצה אין מסלול שמפרק אותו. */
export function resetTorahDictionary(): void {
  loaded = null;
  pending = null;
}

/**
 * הוספת מילה למילון המשתמש, ושמירתה. `false` = המילה כבר מוכרת (או שאין
 * מילון טעון), ואז גם אין מה לכתוב.
 */
export async function rememberUserWord(dictionary: Dictionary | null, word: string): Promise<boolean> {
  if (!dictionary || !dictionary.addUserWord(word)) return false;
  await saveSpellcheckWords(dictionary.userWords());
  return true;
}
