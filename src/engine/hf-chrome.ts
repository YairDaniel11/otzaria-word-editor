/**
 * עברות ה-chrome של הכותרת העליונה והתחתונה — החלק שאינו CSS.
 *
 * החלוקה מול styles/engine-chrome.css: שם יושבות ארבע התוויות הקבועות של
 * הפאנל, מפני שהן static-hoisted vnodes של Vue וכלל CSS אינו מהבהב עליהן.
 * כאן יושב מה ש-CSS אינו יכול לגעת בו בכלל:
 *
 *   1. `title` של שני הכפתורים ו-`aria-label` של קבוצת הפקדים. תכונות, לא
 *      טקסט — ל-`content` אין דרך להגיע אליהן.
 *   2. התג הצף („Header”, „First Page Footer”, „Header -Section 2-”).
 *      הנוסח נגזר משלושה משתנים — סוג, ווריאנט ומספר מקטע — ומספר המקטע אינו
 *      קיים בשום תכונה: המנוע מרכיב אותו לתוך הטקסט. CSS יכול לכתוב מחרוזת
 *      קבועה, לא לשמר מספר.
 *   3. יחידת המידה בשורות המרחק. היא נגזרת מ-`measurementUnit` ומתחלפת בזמן
 *      ריצה, ולכן תרגום קבוע היה משקר ברגע שהיחידה מתחלפת.
 *
 * ## למה זה בטוח מול Vue
 *
 * המנוע מרנדר את השכבה הזאת בעצמו, ו-Vue יכתוב את הטקסט האנגלי בחזרה בכל
 * patch — למשל כשהסמן עובר מכותרת עליונה לתחתונה, או כשהיחידה מתחלפת (התג
 * ותא היחידה הם vnodes עם patchFlag של טקסט; נמדד באריזה). לכן זה
 * `MutationObserver` ולא מעבר חד-פעמי: אחרי כל כתיבה של המנוע אנחנו כותבים
 * שוב. שלוש הגנות מונעות לופ:
 *
 *   - כל כתיבה נרשמת ב-`written`, וטקסט שהוא כבר שלנו אינו מתורגם שוב. זה גם
 *     מה שמבדיל „המנוע כתב אנגלית מחדש” מ„זה הטקסט שאנחנו כתבנו”.
 *   - `takeRecords()` בסוף כל מעבר זורק את הרשומות שהכתיבות שלנו יצרו, כך
 *     שהמעבר אינו מזמן מעבר נוסף.
 *   - טקסט שאינו מזוהה נשאר כפי שהוא. אנגלית שנשארה היא באג קוסמטי; תווית
 *     ריקה או תווית של ווריאנט אחר היא באג שמטעה.
 *
 * ## למה עיגון בתכונות ולא בטקסט
 *
 * `data-sd-hf-region` ו-`data-sd-hf-variant` הם מזהים סמנטיים; „Header” הוא
 * מחרוזת תצוגה. מי שמתרגם לפי מחרוזת התצוגה מקבל, בשדרוג שמנסח מחדש, תווית
 * שקטה בלי תרגום — או גרוע מזה, התאמה שגויה. הטקסט האנגלי נקרא כאן רק במקום
 * אחד שאין בו תכונות: תגי ההמשך, ורק כדי לגזור מהם סוג ומספר מקטע.
 * הדקדוק שהמנוע בונה (`[First|Even|Odd] Page <Header|Footer>[ -Section N-]`)
 * מאומת ב-tests/contract/engine-hf-chrome.test.ts מול האריזה עצמה.
 *
 * ## שפת המשתמש
 *
 * הרצועה מוצגת באנגלית כששפת המשתמש אנגלית (ui/ribbon/i18n.ts, לפי
 * `app.language` מ-`plugin.boot`), ולמשתמש כזה האנגלית של המנוע היא בדיוק מה
 * שצריך: עברות שם הופכת תיקון לרגרסיה — רצועה אנגלית ושכבת כותרות עברית.
 * לכן `localizeEngineChrome` מחזיר מפרק ריק ב-`'en'`, ואינו מתקין observer
 * בכלל. הצד השני של העברות — styles/engine-chrome.css — נכבה מאותו סימן
 * (`[data-menu-locale='en']` על שורש ה-HTML, שנכתב ב-`setMenuLocale`), ולכן
 * שני החצאים נדלקים ונכבים יחד.
 */
import type { SuperDocMeasurementUnit } from 'superdoc';
import { menuLocale } from '../ui/ribbon/i18n';

/** התכונות שהמנוע מסמן בהן את השכבה. בדיקת החוזה מאמתת שכולן עוד קיימות. */
export const HF_HOOKS = {
  /** העוטף של האזור הפעיל. נושא גם את `role="group"` ואת ה-aria-label. */
  activeGroup: 'data-sd-header-footer-active',
  /** `header` או `footer`, על העוטף. */
  region: 'data-sd-hf-region',
  /** `default` | `first` | `even` | `odd`, על העוטף. */
  variant: 'data-sd-hf-variant',
  /** התג הצף של האזור הפעיל. */
  label: 'data-sd-hf-label',
  /** תג ההמשך, בעמודים שאינם העמוד שהסמן בו. אין עליו region/variant. */
  continuationLabel: 'data-sd-hf-continuation-label',
  /** כפתור „Options ▾”. */
  options: 'data-sd-hf-options',
  /** כפתור ה-„×”. */
  exit: 'data-sd-hf-exit',
  /** שורה בפאנל. הערכים ב-HF_OPTION_ROWS. */
  option: 'data-sd-hf-option',
} as const;

/**
 * ארבע השורות בפאנל, לפי המזהה שהמנוע נותן להן. שתי הראשונות מתורגמות
 * ב-CSS בלבד; שתי האחרונות מתורגמות ב-CSS, ויחידת המידה שלהן כאן.
 */
export const HF_OPTION_ROWS = [
  'different-first-page',
  'different-odd-even',
  'header-from-top',
  'footer-from-bottom',
] as const;

/** הטקסטים הקבועים. מוצאים כאן כדי שהבדיקות ימדדו נוסח ולא יחזרו עליו. */
export const HF_TEXTS = {
  groupLabel: 'פקדי כותרת עליונה ותחתונה',
  optionsButton: 'אפשרויות ▾',
  optionsTitle: 'אפשרויות כותרת עליונה ותחתונה',
  exitTitle: 'סגירת הכותרת העליונה והתחתונה',
} as const;

/** „כותרת עליונה”/„כותרת תחתונה” — הבסיס של כל תווית תג. */
const REGION_TEXT = {
  header: 'כותרת עליונה',
  footer: 'כותרת תחתונה',
} as const;

/**
 * מה שנוסף לבסיס לפי הווריאנט. `default` הוא הכותרת הרגילה, ולכן ריק —
 * בדיוק כמו במנוע, שם `default` מחזיר את הבסיס בלי תחילית.
 *
 * הערה על „אי-זוגי”: כשהמסמך מסומן „שונה בעמודים זוגיים ואי-זוגיים”, Word
 * קורא לכותרת הרגילה „של עמוד אי-זוגי”. המנוע אינו מדווח את המצב הזה בשכבה
 * הזאת — יש לו ווריאנט `odd` נפרד — ולכן `default` נשאר „כותרת עליונה”.
 */
const VARIANT_TEXT = {
  default: '',
  first: ' של עמוד ראשון',
  even: ' של עמוד זוגי',
  odd: ' של עמוד אי-זוגי',
} as const;

type Region = keyof typeof REGION_TEXT;
type Variant = keyof typeof VARIANT_TEXT;

/**
 * המחלקה שהמנוע נותן לתא יחידת המידה בשורות המרחק.
 *
 * מחלקה ולא תכונה, שלא כמו כל השאר ב-HF_HOOKS, מפני שאין לתא הזה תכונה
 * משלו — ומקום בסדר („ה-span האחרון בשורה”) היה נשען על סדר ילדים ולא על
 * מזהה. הקבוע גם מה שמאפשר לגיליון (styles/engine-chrome.css) לתקן את רוחב
 * התא: שער ההיגיינה (tests/unit/css-hygiene.test.ts) מחייב שכל מחלקה בסלקטור
 * גלובלי תופיע בקוד. בדיקת החוזה מאמתת שהמחלקה עוד קיימת באריזה.
 */
export const HF_UNIT_CLASS = 'v2-hf-distance-unit';

/**
 * היחידות שהמנוע כותב, והנוסח העברי לכל אחת.
 *
 * הטיפוס הוא ה-union הציבורי של superdoc ולא `Record<string, string>`,
 * ובכוונה: יחידה שלישית שתיווסף לו תיפול כאן כשגיאת קומפילציה, ולא תופיע
 * אצל המשתמש כ-`mm` באמצע עברית. בדיקת החוזה מודדת את אותו דבר מהצד השני —
 * על ה-`.d.ts` הארוז — כדי שגם ה-union יהיה מכוסה אם הייבוא יתחלף. הנוסח
 * הוא של page-setup.ts, שכבר מקליד ומציג את אותן יחידות.
 */
export const HF_UNIT_TEXT: Record<SuperDocMeasurementUnit, string> = {
  in: "אינץ'",
  cm: 'ס"מ',
};

/** האם המחרוזת שהמנוע כתב היא יחידה שיש לה נוסח. */
function isUnit(value: string): value is SuperDocMeasurementUnit {
  return value in HF_UNIT_TEXT;
}

/**
 * הדקדוק שהמנוע בונה בו את תווית התג. נקרא רק כשאין תכונות — כלומר בתגי
 * ההמשך — וגם שם רק כדי לגזור סוג, ווריאנט ומספר מקטע.
 */
const ENGLISH_LABEL = /^(?:(First|Even|Odd) Page )?(Header|Footer)(?: -Section (\d+)-)?$/;

const ENGLISH_VARIANT: Record<string, Variant> = {
  First: 'first',
  Even: 'even',
  Odd: 'odd',
};

function isRegion(value: string | null): value is Region {
  return value === 'header' || value === 'footer';
}

function isVariant(value: string | null): value is Variant {
  return value !== null && value in VARIANT_TEXT;
}

/**
 * הנוסח העברי לתווית תג, או `null` כשאין לו נוסח בטוח.
 *
 * `region`/`variant` הם התכונות של העוטף כשיש עוטף. תכונה שקיימת אבל אינה
 * מוכרת — ווריאנט חמישי בגרסה עתידית — מחזירה `null` בכוונה: תווית שנשארה
 * באנגלית היא פגם קוסמטי, ותווית שמצהירה „של עמוד ראשון” על משהו אחר היא
 * שקר על תוכן המסמך.
 */
export function hebrewLabel(
  source: string,
  region: string | null,
  variant: string | null,
): string | null {
  if (region !== null && !isRegion(region)) return null;
  if (variant !== null && !isVariant(variant)) return null;

  const parsed = ENGLISH_LABEL.exec(source.trim());
  // בלי התכונות ובלי התאמה לדקדוק אין ממה לגזור — וגם אין מה לעשות: זה גם
  // המצב שבו הטקסט הוא כבר עברית שכתבנו בעצמנו.
  if (parsed === null && (region === null || variant === null)) return null;

  const resolvedRegion: Region | null =
    region !== null && isRegion(region)
      ? region
      : parsed !== null
        ? parsed[2] === 'Header'
          ? 'header'
          : 'footer'
        : null;
  if (resolvedRegion === null) return null;

  const resolvedVariant: Variant =
    variant !== null && isVariant(variant)
      ? variant
      : parsed !== null && parsed[1] !== undefined
        ? ENGLISH_VARIANT[parsed[1]]
        : 'default';

  const section = parsed?.[3];
  const suffix = section === undefined ? '' : ` — מקטע ${section}`;
  return `${REGION_TEXT[resolvedRegion]}${VARIANT_TEXT[resolvedVariant]}${suffix}`;
}

/**
 * מה שכתבנו, לפי אלמנט. זה מה שמבדיל „המנוע כתב אנגלית מחדש” מ„זה הטקסט
 * שלנו”, ובלעדיו כל מעבר היה מנסה לתרגם את התרגום.
 */
const written = new WeakMap<Element, string>();

function relabel(element: Element, translate: (source: string) => string | null): void {
  const current = element.textContent ?? '';
  if (written.get(element) === current) return;

  const hebrew = translate(current);
  if (hebrew === null || hebrew === current) return;

  element.textContent = hebrew;
  written.set(element, hebrew);
}

function setAttribute(element: Element, name: string, value: string): void {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}

/** ה-span הראשון בין ילדיו הישירים: התווית עצמה, לפני הכפתורים. */
function firstSpan(element: Element): Element | null {
  for (const child of [...element.children]) {
    if (child.tagName === 'SPAN') return child;
  }
  return null;
}

/**
 * האם השכבה בכלל בעץ.
 *
 * ה-observer יושב על ה-container שהמנוע מרנדר לתוכו — כלומר על משטח העריכה —
 * ולכן הוא מתעורר על כל שינוי DOM במסמך: כל הקלדה, כל עימוד מחדש. שכבת
 * הכותרות קיימת רק בזמן שהסמן בכותרת, וזה מעט מהזמן. סלקטור אחד כאן חוסך
 * שמונה מעברים על עץ המסמך בכל שאר הזמן.
 *
 * שתי התכונות ולא אחת: העוטף הפעיל דורש גם `anchorRegion`, ותגי ההמשך
 * מרונדרים גם בלעדיו (נמדד באריזה). סלקטור אחד עם פסיק הוא עדיין מעבר אחד.
 */
function hasChrome(root: ParentNode): boolean {
  return root.querySelector(`[${HF_HOOKS.activeGroup}],[${HF_HOOKS.continuationLabel}]`) !== null;
}

/** מעבר אחד על כל מה שקיים כרגע. אידמפוטנטי — ראו `relabel`. */
function localizeOnce(root: ParentNode): void {
  if (!hasChrome(root)) return;

  for (const group of [...root.querySelectorAll(`[${HF_HOOKS.activeGroup}]`)]) {
    setAttribute(group, 'aria-label', HF_TEXTS.groupLabel);
  }

  for (const chip of [...root.querySelectorAll(`[${HF_HOOKS.label}]`)]) {
    const span = firstSpan(chip);
    if (span === null) continue;
    const host = chip.closest(`[${HF_HOOKS.region}]`);
    const region = host?.getAttribute(HF_HOOKS.region) ?? null;
    const variant = host?.getAttribute(HF_HOOKS.variant) ?? null;
    relabel(span, (source) => hebrewLabel(source, region, variant));
  }

  // תגי ההמשך: המנוע מרנדר אותם בווריאנט `default`, ובלי תכונות — הסוג ומספר
  // המקטע נגזרים מהטקסט עצמו.
  for (const chip of [...root.querySelectorAll(`[${HF_HOOKS.continuationLabel}]`)]) {
    const span = firstSpan(chip);
    if (span === null) continue;
    relabel(span, (source) => hebrewLabel(source, null, null));
  }

  // `title` מולד ולא `data-tip-*`, וזה ההיתר היחיד בתוכנה: זה DOM של המנוע
  // בתוך `.editor-stack`, שהשכבה מוציאה מכוונה (TIP_EXCLUDED_SELECTOR).
  // מאוכף ב-tests/unit/native-title.test.ts.
  for (const button of [...root.querySelectorAll(`[${HF_HOOKS.options}]`)]) {
    relabel(button, () => HF_TEXTS.optionsButton);
    setAttribute(button, 'title', HF_TEXTS.optionsTitle);
  }

  for (const button of [...root.querySelectorAll(`[${HF_HOOKS.exit}]`)]) {
    setAttribute(button, 'title', HF_TEXTS.exitTitle);
  }

  const distanceRows = `[${HF_HOOKS.option}="header-from-top"],[${HF_HOOKS.option}="footer-from-bottom"]`;
  for (const row of [...root.querySelectorAll(distanceRows)]) {
    const unit = row.querySelector(`.${HF_UNIT_CLASS}`);
    if (unit === null) continue;
    relabel(unit, (source) => {
      const name = source.trim();
      return isUnit(name) ? HF_UNIT_TEXT[name] : null;
    });
  }
}

export interface EngineChromeLocalizer {
  /** מעבר נוסף, ביקוש. ה-observer קורא לזה בעצמו על כל שינוי. */
  refresh(): void;
  /** מפסיק להאזין. הטקסט שכבר הוחלף נשאר — המנוע יכתוב עליו בעצמו. */
  dispose(): void;
}

/**
 * מתקין את העברות על עץ ה-DOM של המנוע ומחזיר מפרק.
 *
 * `root` הוא ה-container שהמנוע מרנדר לתוכו: הצמצום הזה הוא מה שמונע
 * מ-observer על כל המסמך לרוץ על כל הקלדה בממשק שלנו.
 */
export function localizeEngineChrome(root: ParentNode): EngineChromeLocalizer {
  // שפת המשתמש אנגלית — האנגלית של המנוע נכונה, ואין מה להתקין. ראו הערת
  // הפתיחה: הגיליון נכבה מאותו סימן.
  if (menuLocale() === 'en') {
    return { refresh: () => {}, dispose: () => {} };
  }

  localizeOnce(root);

  // ב-jsdom יש MutationObserver, אבל סביבת בדיקה מצומצמת עשויה לא לספק אותו,
  // ואז העברות עדיין נכונה — פשוט בלי חידוש אחרי patch של המנוע.
  const observer =
    typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver(() => {
          localizeOnce(root);
          observer?.takeRecords();
        });

  observer?.observe(root as Node, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    // רק שתי התכונות שהנוסח נגזר מהן. בלי הסינון כל שינוי `style` של השכבה —
    // והמנוע מזיז אותה בכל גלילה — היה מזמן מעבר.
    attributeFilter: [HF_HOOKS.region, HF_HOOKS.variant],
  });

  return {
    refresh: () => localizeOnce(root),
    dispose: () => observer?.disconnect(),
  };
}
