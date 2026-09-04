/**
 * שער: `title` על אלמנט DOM — כישלון בנייה.
 *
 * ## התקלה שהשער הזה סוגר
 *
 * המשתמש צילם שני טולטיפים זה מעל זה על „כיוון פסקה משמאל לימין”: הכרטיס
 * המעוצב של התוכנה, ומעליו המלבן האפור של מערכת ההפעלה. מקור המלבן הוא תכונת
 * `title` על הכפתור.
 *
 * הניסיון המתבקש — להשאיר את `title` ולהסיר אותו בריחוף — **אינו עובד**, ולא
 * בגלל באג שאפשר לתקן. הדפדפן קורא את התכונה בתזוזת העכבר ולא כשהוא מצייר:
 * הטקסט נלכד כבר בתזוזה שבה הסמן נעצר, ההשהיה שלו רצה, והמלבן מצויר גם אם
 * התכונה ירדה מה-DOM בינתיים. Blink גם מטפס להורים בחיפוש `title`
 * (`HitTestResult::Title`), כך שגם „נעביר אותו לעוטף” אינו מוצא.
 *
 * לכן הפתרון אינו ניהול של הבעיה אלא ביטולה: `title` אינו קיים באף אלמנט DOM
 * בתוכנה, והטולטיפ מוצהר בתכונות `data-tip-*` בלבד. מפקד שנמדד ב-Chrome על
 * ה-dist הארוז לפני ההמרה מצא 61 תכונות `title` — כולן מהמקור שלנו, אף אחת לא
 * מהמנוע — כלומר ההמרה מסלקת את המחלקה כולה.
 *
 * ## למה שער, ולא הסתמכות על זהירות
 *
 * 47 אלמנטים הומרו. `title` הוא הדבר הראשון שיד כותבת כשהיא רוצה טולטיפ, הוא
 * עובר type-check, הוא אינו מפיל דבר — והתוצאה שלו נראית רק בעין, ורק אם
 * מרחפים דווקא על הפקד הזה. זה בדיוק הפרופיל של תקלה שחוזרת.
 *
 * ## למה AST ולא regex
 *
 * `<RibbonGroup title="קובץ ומסמך">` הוא **prop של קומפוננטה**, לא תכונת DOM:
 * הוא נהיה כותרת הקבוצה ואינו מגיע לדפדפן. 40 כאלה במאגר, ו-regex לא מבחין
 * בינם לבין `<button title="…">`. הפרסר של Vue כן — הוא מוסר את שם התג, ותג
 * שמתחיל באות קטנה הוא אלמנט DOM.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import { parse } from 'vue/compiler-sfc';
import {
  TIP_DESCRIPTION_ATTR,
  TIP_SHORTCUT_ATTR,
  TIP_TITLE_ATTR,
} from '../../src/ui/tooltip/tooltip-content';

const SRC = join(__dirname, '..', '..', 'src');

/** נתיב יחסי בהפרדת '/', גם ב-Windows — רשימות ההיתר כתובות כך. */
function rel(file: string): string {
  return relative(SRC, file).split(sep).join('/');
}

/** שם תג שמתחיל באות קטנה הוא אלמנט DOM; באות גדולה — קומפוננטה. */
const NATIVE_TAG = /^[a-z]/;

const KNOWN_TIP_ATTRS = new Set([TIP_TITLE_ATTR, TIP_SHORTCUT_ATTR, TIP_DESCRIPTION_ATTR]);

function sourceFiles(dir: string, suffix: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sourceFiles(path, suffix, found);
    else if (path.endsWith(suffix)) found.push(path);
  }
  return found;
}

interface TemplateNode {
  type: number;
  tag?: string;
  loc?: { start: { line: number } };
  props?: Array<{
    type: number;
    name: string;
    arg?: { content?: string };
    loc: { start: { line: number } };
  }>;
  children?: TemplateNode[];
}

/** שם התכונה כפי שתגיע ל-DOM: `title` ו-`:title` הם אותו דבר. */
function attributeName(prop: NonNullable<TemplateNode['props']>[number]): string | null {
  if (prop.type === 6) return prop.name;
  if (prop.name === 'bind') return prop.arg?.content ?? null;
  return null;
}

interface Finding {
  where: string;
  what: string;
}

/**
 * הקומפוננטות שמצהירות על `title` כ-prop — ולכן הוא שלהן, ואינו מגיע ל-DOM.
 *
 * `<RibbonGroup title="קובץ ומסמך">` הוא כותרת הקבוצה. `<RibbonButton title=…>`
 * הוא משהו אחר לגמרי: הקומפוננטה אינה מצהירה עליו, אין `inheritAttrs: false`
 * באף עוטף במאגר, ולכן Vue מדביק אותו על ה-`<button>` השורשי — כלומר הבאג
 * המקורי חוזר, ובכתיב שנראה בדיוק כמו כל prop אחר.
 */
function componentsWithTitleProp(): Set<string> {
  const declared = new Set<string>();

  for (const file of sourceFiles(SRC, '.vue')) {
    const { descriptor } = parse(readFileSync(file, 'utf8'), { filename: file });
    const setup = descriptor.scriptSetup?.content ?? '';
    const props = /defineProps<\{([\s\S]*?)\}>/.exec(setup)?.[1] ?? '';
    // ברמה הראשונה בלבד: `meta?: { title: string }` הוא שדה בתוך prop אחר,
    // ורישום בעלות עליו היה פותח את `title` על הקומפוננטה כולה.
    if (/(^|\n) {4}title\??\s*:/.test(props)) {
      declared.add(basename(file, '.vue'));
    }
  }

  return declared;
}

const TITLE_PROP_OWNERS = componentsWithTitleProp();

/** תגי `<title>` שנמצאו בדרך — ראו הבדיקה שמייחדת להם. */
const TITLE_TAGS: string[] = [];

/**
 * כל התכונות שיגיעו ל-DOM, לפי קובץ ושורה.
 *
 * תג באות קטנה הוא אלמנט, ולכן הכול עליו מגיע ל-DOM. תג באות גדולה הוא
 * קומפוננטה, ומה שהיא לא הצהירה עליו **גם הוא** מגיע ל-DOM — דרך
 * ה-fallthrough. שתי הדרכים נסרקות, וההבחנה היא ההצהרה ולא צורת הכתיב.
 */
function domAttributes(): Array<Finding & { name: string }> {
  const found: Array<Finding & { name: string }> = [];

  for (const file of sourceFiles(SRC, '.vue')) {
    const { descriptor, errors } = parse(readFileSync(file, 'utf8'), { filename: file });
    expect(errors, `${rel(file)} אינו נפרס`).toEqual([]);

    const root = descriptor.template?.ast as TemplateNode | undefined;
    if (!root) continue;

    const walk = (node: TemplateNode): void => {
      // 1 = ELEMENT ב-AST של Vue.
      if (node.type === 1 && node.tag === 'title') {
        TITLE_TAGS.push(`${rel(file)}:${node.loc?.start.line ?? 0}`);
      }
      if (node.type === 1 && node.tag) {
        const native = NATIVE_TAG.test(node.tag);
        for (const prop of node.props ?? []) {
          const name = attributeName(prop);
          if (!name) continue;
          // prop מוצהר נעצר בקומפוננטה ואינו מגיע לדפדפן.
          if (!native && TITLE_PROP_OWNERS.has(node.tag) && name === 'title') continue;
          found.push({
            name,
            what: `<${node.tag}>${native ? '' : ' — נוזל דרך fallthrough'}`,
            where: `${rel(file)}:${prop.loc.start.line}`,
          });
        }
      }
      for (const child of node.children ?? []) walk(child);
    };

    walk(root);
  }

  return found;
}

const ATTRIBUTES = domAttributes();

describe('הטולטיפ המולד אינו יכול לחזור', () => {
  it('שום אלמנט DOM במקור אינו נושא title', () => {
    const offenders = ATTRIBUTES.filter((attribute) => attribute.name === 'title').map(
      (attribute) => `${attribute.where} ${attribute.what}`,
    );

    // ההודעה היא חלק מהשער: מי שנופל כאן צריך לדעת מה לכתוב במקום.
    expect(
      offenders,
      `יש להצהיר על טולטיפ ב-${TIP_TITLE_ATTR} (ובמידת הצורך ${TIP_SHORTCUT_ATTR} ` +
        `ו-${TIP_DESCRIPTION_ATTR}), ועל השם הנגיש ב-aria-label בנפרד`,
    ).toEqual([]);
  });

  it('אין תג <title> בתבנית ולא במחרוזות SVG — גם הוא מצייר מלבן מולד', () => {
    // התכונה והתג הם שני דברים שונים: `<svg><title>שם</title></svg>` נותן
    // טולטיפ מולד בדיוק כמו `title="שם"`, והבדיקה שלמעלה סורקת תכונות בלבד.
    expect(TITLE_TAGS, 'שם נגיש לאייקון נכתב ב-aria-label על הפקד, לא ב-<title>').toEqual([]);

    // האייקונים אינם תבנית אלא מחרוזות שנכנסות ב-`v-html` (ui/icons/icons.ts),
    // ולכן ה-AST אינו רואה אותם כלל.
    const inStrings = SCRIPTS.filter((body) => /<title[\s>]/.test(body.code)).map(
      (body) => body.where,
    );
    expect(inStrings, '<title> בתוך מחרוזת SVG').toEqual([]);
  });

  it('אין תכונת data-tip- בשם שהשכבה אינה קוראת', () => {
    const typos = ATTRIBUTES.filter(
      (attribute) => attribute.name.startsWith('data-tip') && !KNOWN_TIP_ATTRS.has(attribute.name),
    ).map((attribute) => `${attribute.where} ${attribute.name}`);

    // בלי זה `data-tip-titel` היה תכונה שקטה שאיש אינו קורא, והטולטיפ פשוט
    // לא היה מופיע — בלי שגיאה ובלי שהעין תבחין בכך בסריקה של הקוד.
    expect(typos, `שמות התכונות המוכרים: ${[...KNOWN_TIP_ATTRS].join(', ')}`).toEqual([]);
  });

  it('הסריקה עצמה מוצאת מה שהיא אמורה — אחרת היא ירוקה על כלום', () => {
    // בלי הבדיקה הזאת שגיאה בפרסר (`descriptor.template` ריק, למשל) הייתה
    // מחזירה רשימה ריקה, וכל השער היה עובר בלי לבדוק דבר.
    const tipTitles = ATTRIBUTES.filter((attribute) => attribute.name === TIP_TITLE_ATTR);
    expect(tipTitles.length).toBeGreaterThan(30);
    expect(ATTRIBUTES.some((attribute) => attribute.name === 'aria-label')).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* המסלול השני: כתיבה מ-JS                                            */
/* ------------------------------------------------------------------ */

/**
 * `element.setAttribute('title', …)` מצייר את אותו מלבן בדיוק, והסריקה של
 * התבניות אינה רואה אותו. זה אינו תרחיש תיאורטי: `engine/hf-chrome.ts` עושה
 * את זה, וזה עבר את השער.
 *
 * שם זה מותר, ולכן ההיתר מפורש ומנומק ולא מרומז — ה-DOM של הכותרת העליונה
 * והתחתונה הוא של המנוע, יושב בתוך `.editor-stack`, ו-`TIP_EXCLUDED_SELECTOR`
 * מוציא אותו מהשכבה מכוונה. שם `title` הוא הטולטיפ **היחיד** שיש, והמרתו
 * הייתה משתיקה אותו בלי תחליף.
 */
const TITLE_FROM_JS_ALLOWED = ['engine/hf-chrome.ts'];

/**
 * שלוש הצורות שכותבות את התכונה: `el.setAttribute('title', …)`, העוטף
 * `setAttribute(el, 'title', …)` שיש כאן במאגר, ו-`el.title = …`.
 *
 * הצורה הראשונה נשכחה בגרסה הראשונה של השער, ובדיקת מוטציה היא שמצאה זאת —
 * ולכן היא גם קבועה למטה כבדיקה, ולא נשארה פעולה חד-פעמית שנעשתה ביד.
 */
const TITLE_WRITE = /setAttribute\(\s*(?:[^,()]+,\s*)?(['"`])title\1|\.title\s*=(?!=)/;

/** גם `<script>` בתוך קובץ Vue הוא JS, ולכן הוא נסרק כאן ולא ב-AST שלמעלה. */
function scriptBodies(): Array<{ where: string; code: string }> {
  const bodies: Array<{ where: string; code: string }> = [];

  for (const file of sourceFiles(SRC, '.ts')) {
    bodies.push({ where: rel(file), code: readFileSync(file, 'utf8') });
  }
  for (const file of sourceFiles(SRC, '.vue')) {
    const { descriptor } = parse(readFileSync(file, 'utf8'), { filename: file });
    const code = [descriptor.script?.content, descriptor.scriptSetup?.content]
      .filter(Boolean)
      .join('\n');
    if (code) bodies.push({ where: rel(file), code });
  }

  return bodies;
}

const SCRIPTS = scriptBodies();

describe('גם כתיבה מ-JS אינה יכולה להחזיר אותו', () => {
  it('אף קובץ מלבד ההיתר המנומק אינו כותב title לאלמנט', () => {
    const offenders = SCRIPTS.filter(
      (body) => !TITLE_FROM_JS_ALLOWED.includes(body.where) && TITLE_WRITE.test(body.code),
    ).map((body) => body.where);

    expect(
      offenders,
      `יש להצהיר על טולטיפ ב-${TIP_TITLE_ATTR}. אם מדובר ב-DOM של המנוע בתוך ` +
        '`.editor-stack` — להוסיף ל-TITLE_FROM_JS_ALLOWED עם הנימוק',
    ).toEqual([]);
  });

  it('ההיתר עצמו אינו רקוב — הקובץ קיים, ובאמת כותב title', () => {
    // היתר שאין לו מה להתיר הוא היתר שנשאר פתוח לשימוש הבא, שאינו מנומק.
    for (const allowed of TITLE_FROM_JS_ALLOWED) {
      const body = SCRIPTS.find((candidate) => candidate.where === allowed);
      expect(body, `${allowed} אינו קיים עוד — יש להסיר אותו מ-TITLE_FROM_JS_ALLOWED`).toBeTruthy();
      expect(TITLE_WRITE.test(body?.code ?? ''), `${allowed} אינו כותב title עוד`).toBe(true);
    }
  });

  it('הסריקה מוצאת קוד — אחרת היא ירוקה על כלום', () => {
    expect(SCRIPTS.length).toBeGreaterThan(50);
    expect(SCRIPTS.some((body) => body.where.endsWith('.vue'))).toBe(true);
  });

  it('שלוש צורות הכתיבה נתפסות — כולל זו שנשכחה', () => {
    // `el.setAttribute('title', …)` עברה את הגרסה הראשונה של הביטוי, שדרש
    // ארגומנט לפני שם התכונה. בדיקת מוטציה מצאה זאת, וזו היא.
    for (const violation of [
      `el.setAttribute('title', 'x')`,
      `setAttribute(el, 'title', 'x')`,
      `el.title = 'x'`,
      'element.setAttribute("title", name)',
    ]) {
      expect(TITLE_WRITE.test(violation), violation).toBe(true);
    }

    // ולא לתפוס את מה שאינו התכונה: `data-tip-title`, ו-`title` כמשתנה או prop.
    for (const innocent of [
      `el.setAttribute('data-tip-title', 'x')`,
      `const title = 'x'`,
      `props.title === 'x'`,
      `el.setAttribute('aria-label', title)`,
    ]) {
      expect(TITLE_WRITE.test(innocent), innocent).toBe(false);
    }
  });
});
