/**
 * מסך הטעינה שב-`index.html`.
 *
 * למה הוא נבדק כאן ולא נבנה כרכיב: הוא חייב להיות מצויר לפני שנטענת שורה
 * אחת מהבאנדל — 16MB בין `engine-workers.js` ל-`app.js` — ולכן הוא
 * HTML+CSS+JS inline, מחוץ לבאנדל. המחיר הוא כפילות מול
 * `src/styles/tokens.css`, והשער הזה הוא מה שמחזיק אותה כנה.
 *
 * `src/host/splash.ts` הוא רק עטיפה מוטיפסת מעל ה-API שכאן; אם השם ישתנה
 * בצד אחד בלבד, כל קריאות ההתקדמות יהפכו ל-no-op **בשקט** — הממשק יעלה
 * כרגיל, ורק מסך הטעינה יקפא על „מתחיל”. לכן הזהות נבדקת ולא נזכרת.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const tokens = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8');
const splashModule = readFileSync(join(ROOT, 'src/host/splash.ts'), 'utf8');
const viteConfig = readFileSync(join(ROOT, 'vite.config.ts'), 'utf8');

/** ערך של משתנה CSS בבלוק ה-`:root` הראשון של הטקסט. */
function cssVar(text: string, name: string): string | undefined {
  const match = text.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
  return match?.[1].trim();
}

/**
 * מרים את מסך הטעינה האמיתי ב-jsdom: הסימון והסקריפט נלקחים מ-`index.html`
 * עצמו, ולא משוכפלים לכאן — בדיקה שמריצה עותק אינה בודקת את מה שנשלח.
 */
function runSplash(): {
  root: HTMLElement;
  note: HTMLElement;
  api: { set(next: number, text?: string): void; fail(text?: string, detail?: string): void; done(): void };
} {
  const markup = html.slice(html.indexOf('<div id="otzaria-splash"'), html.indexOf('<div id="app">'));
  const open = html.indexOf('<script>', html.indexOf('<div id="app">'));
  const script = html.slice(html.indexOf('>', open) + 1, html.indexOf('</script>', open));

  document.body.innerHTML = markup;
  new Function(script)();

  const api = (window as unknown as { __otzariaSplash: ReturnType<typeof runSplash>['api'] })
    .__otzariaSplash;
  return {
    root: document.getElementById('otzaria-splash') as HTMLElement,
    note: document.getElementById('otzaria-splash-note') as HTMLElement,
    api,
  };
}

describe('מסך הטעינה', () => {
  it('מצויר לפני כל סקריפט של התוסף', () => {
    const head = html.slice(0, html.indexOf('</head>'));
    // סקריפט עם src ב-head חוסם את פריסת ה-HTML, כלומר את מסך הטעינה עצמו.
    expect(/<script[^>]*\bsrc=/.test(head)).toBe(false);
    // ובגוף: הסימון קודם לתגית הכניסה של Vite.
    expect(html.indexOf('id="otzaria-splash"')).toBeLessThan(html.indexOf('src="/src/main.ts"'));
  });

  it('ה-latch של plugin.boot נשאר הסקריפט הראשון', () => {
    // מסך הטעינה נכנס אחרי ה-latch ולא לפניו: האירוע חד-פעמי, וכל שורה
    // שקודמת לו היא חלון שבו הוא הולך לאיבוד.
    expect(html.indexOf('__otzariaBoot')).toBeLessThan(html.indexOf('__otzariaSplash'));
  });

  it('הפלטה זהה לטוקנים של התוסף', () => {
    // הכפילות מכוונת (ראו הכותרת); מה שאסור הוא שתשקר.
    const pairs: Array<[string, string]> = [
      ['--splash-surface', '--color-surface'],
      ['--splash-on-surface', '--color-on-surface'],
      ['--splash-muted', '--color-on-surface-variant'],
      ['--splash-track', '--color-outline-variant'],
      ['--splash-accent', '--color-primary'],
      // צבע הכשל, ומופיע רק בכלל של data-failed.
      ['--splash-error', '--color-error'],
    ];

    for (const [splashName, tokenName] of pairs) {
      const expected = cssVar(tokens, tokenName);
      expect(expected, `${tokenName} חסר ב-tokens.css`).toBeDefined();
      expect(cssVar(html, splashName), `${splashName} מול ${tokenName}`).toBe(expected);
    }
  });

  it('עומד בכללי העיצוב של הוולידטור', () => {
    // הוולידטור של אוצריא סורק את בלוק ה-<style> של index.html — ה-CSS היחיד
    // בתוסף שאינו מוטמע ב-app.js — ומעיר על ערכים קשיחים: hex מחוץ להגדרת
    // משתנה, font-family בלי var(--font-*), font-size ו-border-radius ב-px,
    // ואפס שימוש ב-var(--color-*). חמש ההערות האלה ישבו על main בכל ריצה.
    // הכללים כאן הם שלו (extendedValidator.js, checkDesignCompliance), כדי
    // שהתיקון לא יישחק בשקט.
    const style = html.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] ?? '';
    expect(style).not.toBe('');
    const stripped = style
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/--[a-zA-Z_][\w-]*\s*:\s*[^;}]+;?/g, '');

    expect(stripped).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(stripped).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\s*\(/);
    for (const [, value] of stripped.matchAll(/font-family\s*:\s*([^;}]+)/g)) {
      expect(value).toMatch(/var\(\s*--font/);
    }
    for (const [, value] of stripped.matchAll(/font-size\s*:\s*([^;}]+)/g)) {
      expect(value.trim()).toMatch(/^(?:var\(|\d+(?:\.\d+)?(?:em|rem|%)$)/);
    }
    for (const [, value] of stripped.matchAll(/border-radius\s*:\s*([^;}]+)/g)) {
      // כמו אצל הוולידטור: ערך שמתחיל ב-var() עובר, גם אם ה-fallback שלו ב-px.
      if (/var\s*\(/.test(value)) continue;
      expect(value.trim()).not.toMatch(/\d\s*px/);
    }
    expect(style).toMatch(/var\(\s*--color-/);
  });

  it('מאמץ את ערכת הנושא גם כשהיא מגיעה מאוחר', () => {
    // הבאג שהיה כאן: קריאה חד-פעמית מה-latch. היא מכסה רק שיגור שקדם
    // לסקריפט — והוא רץ בזמן פריסת ה-HTML, כלומר כמעט תמיד ראשון. בפועל
    // plugin.boot מגיע אחריו, ומסך הטעינה נשאר על צבע ברירת המחדל של התוסף
    // לכל אורך חייו. שני המקורות נדרשים, ולכן שניהם נבדקים.
    expect(html).toMatch(/__otzariaBoot[\s\S]{0,200}applySplashTheme/);
    expect(html).toMatch(/addEventListener\([\s\S]{0,40}'plugin\.boot'/);

    // ותפקידי ה-SDK שנקראים — אותם חמישה שה-:root מגדיר.
    for (const role of ['surface', 'onSurface', 'onSurfaceVariant', 'outlineVariant', 'primary']) {
      expect(html, `scheme.${role} אינו ממופה`).toContain(`scheme.${role}`);
    }
  });

  it('אינו נשען על color-mix', () => {
    // ל-WebView2 שאוצריא מריצה אין תמיכה מובטחת; host/theme.ts גוזר בדיוק
    // מהסיבה הזאת ב-JS. כלל שלא נתמך כאן פירושו נצנוץ שקוף — פס שנראה תקוע.
    // הקריאה נבדקת ולא המילה: ההערה שמסבירה למה לא, מזכירה אותה בשמה.
    expect(html).not.toContain('color-mix(');
  });

  it('העטיפה המוטיפסת מדברת אל אותו API', () => {
    expect(splashModule).toContain('__otzariaSplash');

    // כל מתודה שהעטיפה קוראת חייבת להיות מוגדרת ב-HTML.
    const called = new Set(
      Array.from(splashModule.matchAll(/api\(\)\?\.(\w+)\(/g), (match) => match[1]),
    );
    expect(called.size).toBeGreaterThan(0);
    for (const method of called) {
      expect(html, `api().${method}() אינו קיים ב-index.html`).toMatch(
        new RegExp(`\\b${method}\\s*:\\s*function`),
      );
    }
  });

  it('תחנות הטוען קודמות לתחנות המודול', () => {
    // שתי התחנות הראשונות מדווחות מהטוען ב-vite.config.ts, לפני שקיים קוד
    // שיכול לייבא את splash.ts. אם הן יעברו את shellMounted, מסך הטעינה
    // יבלע דווקא את התחנות המאוחרות — והטקסט יקפא על „מרכיב את הממשק".
    const loaderStages = Array.from(viteConfig.matchAll(/\bat:\s*(\d+)/g), (m) => Number(m[1]));
    expect(loaderStages.length).toBe(2);

    const moduleStages = Array.from(
      splashModule.matchAll(/^\s*\w+:\s*(\d+),$/gm),
      (m) => Number(m[1]),
    );
    expect(Math.max(...loaderStages)).toBeLessThan(Math.min(...moduleStages));
    // ובתוך הטוען עצמו: הסדר הוא סדר ההרצה של שני הקבצים.
    expect(loaderStages).toEqual([...loaderStages].sort((a, b) => a - b));
  });

  it('חריגה שאיש אינו תופס הופכת לכשל על המסך', () => {
    // הבאג שהיה כאן: הטוען שב-vite.config.ts מכסה תגית שלא **נטענה**, ולא
    // קוד שנטען ונכשל בהרצה. ייבוא של סמל שאינו קיים ב-superdoc-macros
    // — נמדד — השאיר את המסך על „מתחיל" לנצח, בלי שום מילה למשתמש.
    const { root, note, api } = runSplash();
    expect(api).toBeTruthy();

    window.dispatchEvent(new ErrorEvent('error', { message: 'SyntaxError: boom' }));

    expect(root.getAttribute('data-failed')).toBe('1');
    expect(note.textContent).toContain('SyntaxError: boom');
  });

  it('„Script error.” המושתק אינו מוצג כפירוט', () => {
    // ב-file:// — התוסף הארוז — Chrome משתיק את החריגה ומוסר את המחרוזת
    // הזאת בלבד, בלי error/filename/lineno. נמדד. הצגתה היא מחרוזת אנגלית
    // גלויה למשתמש שגם אינה אומרת דבר.
    const { root, note, api } = runSplash();
    expect(api).toBeTruthy();

    window.dispatchEvent(new ErrorEvent('error', { message: 'Script error.' }));

    expect(root.getAttribute('data-failed')).toBe('1');
    expect(note.textContent).not.toContain('Script error.');
    expect(note.textContent).toContain('קונסולת הדף');
  });

  it('התקדמות אחרי חריגה מבטלת את הכשל', () => {
    // חריגה בעלייה אינה בהכרח קטלנית. מסך שנצבע אדום ונשאר אדום בזמן
    // שהתוסף כן עלה גרוע מהשתיקה שהוא בא להחליף.
    const { root, api } = runSplash();
    window.dispatchEvent(new ErrorEvent('error', { message: 'רעש' }));
    expect(root.getAttribute('data-failed')).toBe('1');

    api.set(68, 'מכין את סביבת העריכה…');
    expect(root.getAttribute('data-failed')).toBeNull();

    api.done();
    expect(root.getAttribute('data-done')).toBe('1');
  });

  it('התחנות עולות מונוטונית ואינן מגיעות ל-100', () => {
    // מסך הטעינה בולע דיווח נמוך מהיעד הנוכחי, ולכן תחנה שממוספרת מתחת
    // לקודמת בזמן פשוט נעלמת — כולל הטקסט שלה.
    const values = Array.from(
      splashModule.matchAll(/^\s*(\w+):\s*(\d+),$/gm),
      (match) => [match[1], Number(match[2])] as const,
    );
    expect(values.length).toBeGreaterThanOrEqual(2);

    const sorted = [...values].sort((a, b) => a[1] - b[1]);
    expect(values.map(([name]) => name)).toEqual(sorted.map(([name]) => name));
    // 100 שמור ל-done() בלבד. שלב שמגיע לשם משאיר „99% תקוע”.
    for (const [, value] of values) expect(value).toBeLessThan(100);
  });
});
