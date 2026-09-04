/**
 * הבדיקות כאן נגזרות מביקורת ויזואלית שמצאה בספריית האייקונים ארבעה סוגי
 * תקלות שכולן „נכשלות בשקט” — הן לא מפילות שום דבר, הן פשוט נראות רע:
 *
 * 1. גריד לא אחיד. `word` ו-`paste` היו על viewBox 24, `launcher` על 16 וכל
 *    השאר על 20. ה-SvgIcon קובע גודל בפיקסלים, ולכן גריד שונה = עובי קווים
 *    שונה באותה שורה בסרגל.
 * 2. paths שחורגים מה-viewBox ולכן נחתכים. `dirRtl`/`dirLtr` חרגו 1.1 יחידות
 *    מעל הגבול העליון ו-`cut` 1.3 מתחת לתחתון. חריגה כזאת אינה נראית בקוד
 *    ואינה מפילה כלום — היא רק חותכת חלק מהצורה במסך.
 * 3. משקל אופטי פרוע: `reject` תפס 47%x47% מה-viewBox ליד `footnote` שתפס
 *    90%x75%.
 * 4. שם אייקון שלא קיים ב-ICONS. `SvgIcon` מחזיר `ICONS[name] || ''`, כלומר
 *    כפתור עם שם שגוי מוצג בלי אייקון ובלי שגיאה.
 *
 * לכן הבדיקות רצות על הנתונים האמיתיים: ICONS עצמו, וסריקת קובצי ה-Vue
 * שבפועל קוראים לו — ולא על כפילים.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ICONS, PLANNED_ICONS } from '../../src/ui/icons/icons';

const VIEWBOX = '0 0 20 20';
const [VB_X, VB_Y, VB_W, VB_H] = VIEWBOX.split(' ').map(Number) as [
  number,
  number,
  number,
  number,
];

/** סובלנות לשגיאת דגימה של קשתות ולעיגול המספרים ב-path. */
const EPS = 0.05;

interface Point {
  x: number;
  y: number;
}

/**
 * המרת קשת מ-endpoint parameterization ל-center parameterization לפי נספח
 * F.6 של מפרט SVG, ואז דגימה של נקודות על הקשת.
 *
 * הדגימה אינה קוסמטיקה: הקצוות של קשת נמצאים בדרך כלל *בין* נקודות הקצה
 * שלה, ובדיוק שם היו החריגות של `dirRtl`/`dirLtr` — טופס חצי-עיגול שיצא מעל
 * הגבול העליון בזמן ששתי נקודות הקצה שלו בתוך ה-viewBox.
 */
function arcPoints(
  x0: number,
  y0: number,
  rxIn: number,
  ryIn: number,
  phiDeg: number,
  largeArc: number,
  sweep: number,
  x: number,
  y: number,
  steps = 48
): Point[] {
  if (rxIn === 0 || ryIn === 0) return [{ x, y }];
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx2 = (x0 - x) / 2;
  const dy2 = (y0 - y) / 2;
  const x1p = cos * dx2 + sin * dy2;
  const y1p = -sin * dx2 + cos * dy2;
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);

  // רדיוס קטן מהמיתר: המפרט מחייב להגדיל אותו עד שהקשת אפשרית.
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }

  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let coef = den === 0 ? 0 : Math.sqrt(Math.max(0, num / den));
  if (largeArc === sweep) coef = -coef;
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x0 + x) / 2;
  const cy = sin * cxp + cos * cyp + (y0 + y) / 2;

  const angle = (ux: number, uy: number, vx: number, vy: number): number => {
    const dot = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy));
    const a = Math.acos(Math.min(1, Math.max(-1, dot)));
    return ux * vy - uy * vx < 0 ? -a : a;
  };

  const ux = (x1p - cxp) / rx;
  const uy = (y1p - cyp) / ry;
  const vx = (-x1p - cxp) / rx;
  const vy = (-y1p - cyp) / ry;
  const theta1 = angle(1, 0, ux, uy);
  let delta = angle(ux, uy, vx, vy);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;

  const out: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = theta1 + (delta * i) / steps;
    out.push({
      x: cos * rx * Math.cos(t) - sin * ry * Math.sin(t) + cx,
      y: sin * rx * Math.cos(t) + cos * ry * Math.sin(t) + cy,
    });
  }
  return out;
}

/**
 * דגימה של עקומת בזייה לפי דה-קסטלז'ו. נדרשת מאותה סיבה שקשת נדגמת: הטופס של
 * העקומה נמצא *בין* הנקודות שנרשמו ב-`d`, ולא עליהן.
 *
 * הדגימה אינה מחליפה את נקודות הבקרה — היא מדידה **שנייה** לצידן. ראו
 * `walkPath`: לבדיקת החריגה מה-viewBox נכון להיות שמרני ולספור נקודות בקרה,
 * ולבדיקת יחס המילוי נכון למדוד את הדיו עצמו.
 */
function bezierPoints(points: Point[], steps = 48): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    let level = points;
    while (level.length > 1) {
      const next: Point[] = [];
      for (let k = 0; k < level.length - 1; k += 1) {
        next.push({
          x: level[k]!.x + (level[k + 1]!.x - level[k]!.x) * t,
          y: level[k]!.y + (level[k + 1]!.y - level[k]!.y) * t,
        });
      }
      level = next;
    }
    out.push(level[0]!);
  }
  return out;
}

/**
 * שיקוף נקודת הבקרה סביב הנקודה הנוכחית. בהיעדר בקרה קודמת המפרט אומר
 * שהשיקוף הוא הנקודה הנוכחית עצמה — כלומר העקומה יוצאת ממנה ישר.
 */
function reflect(last: Point | null, cx: number, cy: number): Point {
  return last ? { x: 2 * cx - last.x, y: 2 * cy - last.y } : { x: cx, y: cy };
}

const ARITY: Record<string, number> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
};

/**
 * תת-נתיב אחד — צורה אחת בתוך ה-`d`: הטבעת החיצונית של מסגרת, החור שבתוכה,
 * שורת טקסט. ההפרדה נדרשת כי „האייקון הוא משולש” היא טענה על **צורה** ולא על
 * ה-path כולו, ומשולש האזהרה שהיה כאן היה תת-הנתיב הראשון מתוך ארבעה.
 */
interface Subpath {
  pts: Point[];
  /** רק קווים ישרים — כלומר ה-`pts` הן הקודקודים עצמם ולא דגימה או נקודות בקרה. */
  straight: boolean;
}

/**
 * נקודות המעטפת של path, מקובצות לתת-נתיבים. לעקומות בזייה יש כאן שני מצבים,
 * כי לשתי הבדיקות שצורכות אותן יש צורך הפוך:
 *
 * - ברירת המחדל סופרת את **נקודות הבקרה**. הן חוסמות את העקומה מלמעלה, ולכן
 *   ה-bounding box שמבוסס עליהן שמרני — הוא עלול לדווח חריגה מה-viewBox שאין,
 *   אך לא יפספס חריגה שיש. זה מה שבדיקת הגבולות צריכה.
 * - `sampleCurves` דוגם את העקומה עצמה. בדיקת יחס המילוי אוכפת גם **רצפה**, ושם
 *   שמרנות היא בדיוק הכיוון הלא נכון: נקודת בקרה שנמצאת מחוץ לדיו מנפחת את
 *   המעטפת, וכך אייקון קטן מדי עובר בשקט. נמדד: `replace` (`arrow_swap`) הוא
 *   69.75% דיו אמיתי, ונקודות הבקרה מעגלות אותו ל-70.00% — בדיוק הרצפה.
 *
 * הפירוק לתת-נתיבים נעשה כאן ולא בחיתוך המחרוזת על `M`: `m` היא moveto **יחסי**
 * לסוף התת-נתיב הקודם (כך נכתב משולש האזהרה: `...z m0 3.8...`), ולכן חיתוך
 * טקסטואלי היה מחשב את הקודקודים של כל צורה שנייה והלאה במקום הלא נכון.
 */
function walkPath(d: string, sampleCurves = false): Subpath[] {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+)/g) ?? [];
  const subs: Subpath[] = [];
  let current: Subpath = { pts: [], straight: true };
  const push = (point: Point): void => {
    current.pts.push(point);
  };
  const startSubpath = (): void => {
    if (current.pts.length) subs.push(current);
    current = { pts: [], straight: true };
  };
  let cmd = '';
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  let i = 0;
  /** נקודת הבקרה האחרונה, לשיקוף ב-S ו-T (מפרט SVG §9.3.6). */
  let lastControl: Point | null = null;

  while (i < tokens.length) {
    const token = tokens[i]!;
    if (/[A-Za-z]/.test(token)) {
      cmd = token;
      i += 1;
      if (cmd === 'Z' || cmd === 'z') {
        cx = startX;
        cy = startY;
        continue;
      }
    }
    if (!cmd) break;

    const upper = cmd.toUpperCase();
    const rel = cmd !== upper;
    const need = ARITY[upper];
    if (need === undefined) throw new Error(`פקודת path לא מוכרת: ${cmd}`);
    if (i + need > tokens.length) break;
    const a = tokens.slice(i, i + need).map(Number);
    i += need;

    const ax = (v: number): number => (rel ? cx + v : v);
    const ay = (v: number): number => (rel ? cy + v : v);

    switch (upper) {
      case 'M':
        cx = ax(a[0]!);
        cy = ay(a[1]!);
        startX = cx;
        startY = cy;
        lastControl = null;
        startSubpath();
        push({ x: cx, y: cy });
        // אחרי M נוספים, זוגות נוספים הם L (מפרט SVG §9.3.3).
        cmd = rel ? 'l' : 'L';
        break;
      case 'L':
      case 'T': {
        const end = { x: ax(a[0]!), y: ay(a[1]!) };
        if (upper === 'T') {
          // T היא בזייה, ולכן היא מבטלת את „ישר” גם אם הנקודה שנרשמה היא קצה.
          current.straight = false;
          const control = reflect(lastControl, cx, cy);
          if (sampleCurves) {
            for (const point of bezierPoints([{ x: cx, y: cy }, control, end])) push(point);
          } else {
            push(control);
          }
          lastControl = control;
        } else {
          lastControl = null;
        }
        cx = end.x;
        cy = end.y;
        push(end);
        break;
      }
      case 'H':
        cx = ax(a[0]!);
        lastControl = null;
        push({ x: cx, y: cy });
        break;
      case 'V':
        cy = ay(a[0]!);
        lastControl = null;
        push({ x: cx, y: cy });
        break;
      case 'C':
      case 'S':
      case 'Q': {
        const pairs = upper === 'C' ? [0, 2, 4] : [0, 2];
        current.straight = false;
        const nodes = pairs.map((p) => ({ x: ax(a[p]!), y: ay(a[p + 1]!) }));
        // ב-S וב-Q הבקרה הראשונה אינה נרשמת ב-`d`: היא שיקוף של הבקרה הקודמת
        // סביב הנקודה הנוכחית. בלי לשחזר אותה הדגימה מתארת עקומה אחרת.
        const controls: Point[] =
          upper === 'S'
            ? [reflect(lastControl, cx, cy), ...nodes.slice(0, -1)]
            : nodes.slice(0, -1);
        const end = nodes[nodes.length - 1]!;
        if (sampleCurves) {
          for (const point of bezierPoints([{ x: cx, y: cy }, ...controls, end])) push(point);
        } else {
          for (const node of nodes) push(node);
        }
        lastControl = controls[controls.length - 1] ?? null;
        cx = end.x;
        cy = end.y;
        break;
      }
      case 'A': {
        const ex = ax(a[5]!);
        const ey = ay(a[6]!);
        current.straight = false;
        for (const point of arcPoints(cx, cy, a[0]!, a[1]!, a[2]!, a[3]!, a[4]!, ex, ey)) push(point);
        lastControl = null;
        cx = ex;
        cy = ey;
        break;
      }
    }
  }
  if (current.pts.length) subs.push(current);
  return subs;
}

/** כל נקודות המעטפת, בלי חלוקה לצורות — לבדיקות ה-viewBox ויחס המילוי. */
function pathPoints(d: string, sampleCurves = false): Point[] {
  return walkPath(d, sampleCurves).flatMap((sub) => sub.pts);
}

/**
 * ה-`d` של כל path ב-SVG, עם ה-`transform` של ה-`<g>` שעוטף אותו אם יש כזה.
 *
 * הפירוק הזה נחוץ מרגע שיש בסט אייקון נגזר: התוכן של `toc` עטוף
 * ב-`<g transform>` שמשקף אותו, וקוראת שאוספת `d=` בלבד מודדת את הקווים
 * במקום שבו הם *לא* מצוירים. נמדד: `transform="translate(100 0)"` דוחף את כל
 * התוכן מחוץ ל-viewBox — דף ריק בלי שורות על הכפתור — ועבר את כל הבדיקות
 * כאן, כי אף אחת מהן לא הסתכלה על ה-transform.
 */
function pathsWithTransform(svg: string): { d: string; transform: string | null }[] {
  const out: { d: string; transform: string | null }[] = [];
  let transform: string | null = null;
  for (const m of svg.matchAll(/<g\b[^>]*>|<\/g>|\sd="([^"]+)"/g)) {
    if (m[0].startsWith('</g')) transform = null;
    else if (m[0].startsWith('<g')) {
      // רמה אחת בלבד. קינון היה מתקפל כאן ל-transform של ה-`<g>` הפנימי
      // לבדו, כלומר מדידה שגויה בשקט — וזה בדיוק מה שאין לו זכות קיום כאן.
      if (transform !== null) throw new Error('קינון <g> אינו נתמך במדידה');
      transform = /transform="([^"]+)"/.exec(m[0])?.[1] ?? '';
    } else out.push({ d: m[1]!, transform });
  }
  return out;
}

/**
 * החלת `transform` על נקודות. נתמכים `translate` ו-`scale` בלבד, ומשורשרים
 * מימין לשמאל כמו במפרט. כל דבר אחר **נזרק** ולא מוחזר כמו שהוא: transform
 * שלא נמדד הוא בדיוק המצב שהבדיקות כאן קיימות כדי למנוע.
 */
function applyTransform(pts: Point[], transform: string | null): Point[] {
  if (!transform) return pts;
  const OP = /(translate|scale)\(\s*(-?[\d.]+)(?:[\s,]+(-?[\d.]+))?\s*\)/g;
  const ops = [...transform.matchAll(OP)];
  const rest = transform.replace(OP, '').trim();
  if (!ops.length || rest !== '') throw new Error(`transform שאינו נתמך: ${transform}`);
  let out = pts;
  for (const op of ops.reverse()) {
    const a = Number(op[2]);
    const b = op[3] === undefined ? (op[1] === 'scale' ? a : 0) : Number(op[3]);
    out =
      op[1] === 'translate'
        ? out.map((p) => ({ x: p.x + a, y: p.y + b }))
        : out.map((p) => ({ x: p.x * a, y: p.y * b }));
  }
  return out;
}

interface Measured {
  viewBox: string | null;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function measure(svg: string, sampleCurves = false): Measured {
  const vb = /viewBox="([^"]+)"/.exec(svg);
  const pts = pathsWithTransform(svg).flatMap((p) =>
    applyTransform(pathPoints(p.d, sampleCurves), p.transform)
  );
  if (!pts.length) throw new Error('לא נמצא אף path באייקון');
  return {
    viewBox: vb ? vb[1]! : null,
    minX: Math.min(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxX: Math.max(...pts.map((p) => p.x)),
    maxY: Math.max(...pts.map((p) => p.y)),
  };
}

const NAMES = Object.keys(ICONS);
/** מעטפת שמרנית, כולל נקודות בקרה — לבדיקת החריגה מה-viewBox. */
const MEASURED = new Map(NAMES.map((name) => [name, measure(ICONS[name]!)]));
/** הדיו עצמו, בדגימת עקומות — לבדיקות יחס המילוי. ראו `walkPath`. */
const INK = new Map(NAMES.map((name) => [name, measure(ICONS[name]!, true)]));

/**
 * טווח יחס המילוי: המידה הדומיננטית של ה-bounding box חייבת לתפוס 70%–85%
 * מה-viewBox, והמידה הקטנה לפחות 50%. המספרים אינם שרירותיים — הם הטווח
 * שבו הסט נמצא בפועל אחרי הנרמול, ולכן אייקון חדש שנופל מחוץ להם הוא אייקון
 * שייראה גדול או קטן מהשכנים שלו באותה שורה.
 *
 * התקרה הייתה 84% כל עוד כל הסט צויר בבית. היא עלתה ל-85% כשהסט עבר ל-Fluent
 * System Icons, כי הגריד של Fluent מכוון לפי צורת הגליף ולא לפי ריבוע אחד:
 * `info` (עיגול) יושב 2–18 = 80%, אבל `document_add` (דף עם תג) יושב 2–19
 * לגובה = 85%, ו-`folder_open` 2–18.99 לרוחב = 84.98%. שתיהן דיו אמיתי ולא
 * שגיאת מדידה — ראו `walkPath`.
 *
 * שלושה אייקונים יושבים על התקרה ממש, וכולם עוברים דרך סובלנות העיגול של
 * 0.001: `clearFormatting` (85.08%, הגבוה בסט), `numberList` (85.02%)
 * ו-`document_add` (85.00%). כלומר התקרה האפקטיבית היא 85.1%, ומי שקובע אותה
 * הוא `clearFormatting` — לא `document_add`. אין מרווח להעלאה שקטה נוספת.
 */
const DOMINANT_MIN = 0.7;
const DOMINANT_MAX = 0.85;
const MINOR_MIN = 0.5;

/**
 * אייקונים שטוחים לגיטימית: הצורה שלהם *היא* קו, חץ או אלכסון דק, ולכן המידה
 * הקטנה שלהם נמוכה בכוונה ואין מה לאכוף עליה. הם עדיין נבדקים על המידה
 * הדומיננטית, בטווח רחב יותר — כדי שאייקון שהתכווץ לכתם לא יעבור בשקט.
 *
 * ארבעת ה-chevron-ים הם 60%x33%, ו-`replace` (`arrow_swap`, שני חצים) הוא
 * 60%x69.75% — בכולם גם המידה הדומיננטית מתחת ל-70%, כי חץ אינו ממלא את הגריד
 * באף אחד מהצירים. מי שרק המידה הקטנה שלו נופלת שייך ל-MINOR_EXEMPT ולא לכאן.
 *
 * הרשימה סגורה במכוון: כל תוספת אליה היא החלטה עיצובית שצריכה להיות מוסברת
 * כאן, ולא דרך לעקוף כשל בבדיקה. הבדיקה „כל שם ברשימות ההחרגה באמת זקוק
 * להחרגה” אוכפת גם את הכיוון ההפוך — אבל היא בודקת כל רשימה מול מה שהרשימה
 * מרפה, ולכן שם שיושב ברשימה הרחבה מדי אינו נתפס בה. זו הסיבה להפרדה.
 */
const FLAT_ICONS = new Set([
  'chevronDown',
  'chevronUp',
  'chevronLeft',
  'chevronRight',
  'replace',
]);
const FLAT_DOMINANT_MIN = 0.55;

/**
 * החרגה של המידה הקטנה **בלבד**: הצורה צרה בציר אחד מסיבה שאינה תלויה בגריד,
 * אבל בציר השני היא ממלאת אותו כרגיל — ולכן המידה הדומיננטית שלה נבדקת בטווח
 * המלא, 70%–85%, בלי הנחה.
 *
 * - `bold` (47.5%x70%) הוא ה-B של Fluent. רוחב האות נקבע בטיפוגרפיה, ולמתוח
 *   אותו ל-50% פירושו לעוות אותה. `italic` (65%) ו-`underline` (50%) עוברים
 *   בלעדיה, ולכן אינם כאן.
 * - `link` (81%x40%) ו-`ruler` (40%x80%) הם אלכסונים דקים — שרשרת וסרגל —
 *   שהמידה הקטנה שלהם 40% מעצם הצורה.
 *
 * `link` ו-`ruler` היו ב-FLAT_ICONS, וזה הוריד להם גם את רצפת המידה
 * הדומיננטית מ-70% ל-55% — הקלה שאף אחד מהם לא ביקש ולא צריך (81% ו-80%).
 * הרשימה סגורה במכוון, כמו FLAT_ICONS.
 */
const MINOR_EXEMPT = new Set(['bold', 'link', 'ruler']);

describe('גריד האייקונים', () => {
  it('הספרייה אינה ריקה, וכל שם מפנה ל-SVG', () => {
    expect(NAMES.length).toBeGreaterThan(50);
    for (const name of NAMES) {
      expect(ICONS[name], name).toMatch(/^<svg[\s\S]*<\/svg>$/);
    }
  });

  it(`לכל אייקון viewBox="${VIEWBOX}" בדיוק`, () => {
    const wrong = NAMES.filter((n) => MEASURED.get(n)!.viewBox !== VIEWBOX).map(
      (n) => `${n}: ${MEASURED.get(n)!.viewBox}`
    );
    expect(wrong).toEqual([]);
  });

  it('כל האייקונים משתמשים ב-currentColor ולא בצבע קבוע', () => {
    const hardcoded = NAMES.filter((n) => /(?:fill|stroke)="(?!currentColor|none)/.test(ICONS[n]!));
    expect(hardcoded).toEqual([]);
  });
});

describe('גבולות ה-viewBox', () => {
  it('אף נקודה על אף path אינה חורגת מה-viewBox', () => {
    const over: string[] = [];
    for (const name of NAMES) {
      const m = MEASURED.get(name)!;
      const parts: string[] = [];
      if (m.minX < VB_X - EPS) parts.push(`שמאל ${(m.minX - VB_X).toFixed(2)}`);
      if (m.minY < VB_Y - EPS) parts.push(`למעלה ${(m.minY - VB_Y).toFixed(2)}`);
      if (m.maxX > VB_X + VB_W + EPS) parts.push(`ימין +${(m.maxX - VB_X - VB_W).toFixed(2)}`);
      if (m.maxY > VB_Y + VB_H + EPS) parts.push(`למטה +${(m.maxY - VB_Y - VB_H).toFixed(2)}`);
      if (parts.length) over.push(`${name}: ${parts.join(', ')}`);
    }
    expect(over).toEqual([]);
  });

  it('הדגימה של בזייה מודדת את העקומה ולא את נקודות הבקרה', () => {
    // עקומה מ-(4,10) ל-(16,10) עם שתי בקרות ב-y=2. הטופס מגיע ל-y=4 בלבד —
    // שלושה רבעים מהדרך אל הבקרות — ולכן ההפרש בין שני המצבים הוא בדיוק מה
    // שהחביא את `replace` מתחת לרצפה.
    const d = 'M4 10C4 2 16 2 16 10';
    expect(Math.min(...pathPoints(d).map((p) => p.y))).toBeCloseTo(2, 2);
    expect(Math.min(...pathPoints(d, true).map((p) => p.y))).toBeCloseTo(4, 2);
  });

  it('הדגימה של קשתות באמת מודדת את טופס הקשת ולא רק את נקודות הקצה', () => {
    // חצי-עיגול מ-(10,10) ל-(10,2) שטופסו יוצא שמאלה עד x=6: שתי נקודות
    // הקצה בתוך ה-viewBox, והטופס הוא מה שקובע. זו התבנית שהחביאה את
    // החריגה ב-dirRtl/dirLtr.
    const pts = pathPoints('M10 10a4 4 0 0 1 0-8z');
    expect(Math.min(...pts.map((p) => p.x))).toBeCloseTo(6, 2);
    expect(Math.min(...pts.map((p) => p.y))).toBeCloseTo(2, 2);
  });

  it('המדידה מחילה את ה-transform של ה-`<g>` העוטף', () => {
    // בלי זה השער שלמעלה עובר בירוק על אייקון שכל התוכן שלו נדחף מחוץ
    // ל-viewBox: הקווים עצמם תקינים, וה-`transform` הוא מה שמזיז אותם. נמדד
    // על `toc` — `translate(100 0)` במקום השיקוף נותן „ימין +94”.
    const svg = (t: string) =>
      `<svg viewBox="0 0 20 20"><g transform="${t}"><path d="M4 4h4v4h-4z"/></g></svg>`;
    expect(measure(svg('translate(100 0)')).maxX).toBeCloseTo(108, 2);
    // השיקוף של `toc`: סביב x=10, ולכן 4..8 הופך ל-12..16 והרוחב נשמר.
    const mirrored = measure(svg('translate(20 0) scale(-1 1)'));
    expect(mirrored.minX).toBeCloseTo(12, 2);
    expect(mirrored.maxX).toBeCloseTo(16, 2);
    // transform שלא נמדד נזרק, ולא מוחזר בשקט כאילו אינו קיים.
    expect(() => measure(svg('rotate(90)'))).toThrow(/transform/);
  });
});

/**
 * הקודקודים של תת-נתיב שבנוי רק מקווים ישרים, בלי כפילויות — למשל נקודת
 * הסגירה שחוזרת על נקודת הפתיחה. תת-נתיב עם עקומה מחזיר `null`: שם הנקודות
 * שנרשמו הן דגימה ונקודות בקרה, ולא קודקודים של פוליגון.
 */
function polygonVertices(sub: Subpath): Point[] | null {
  if (!sub.straight) return null;
  const seen = new Set<string>();
  const out: Point[] = [];
  for (const point of sub.pts) {
    const key = `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(point);
  }
  return out;
}

/**
 * מתחת לזה משולש הוא פרט בתוך אייקון (ראש החץ של `indentIncrease`, המשולש
 * של `replace`, הדגל של `dirRtl`); מעל זה הוא **הצורה של האייקון**. הסט בפועל
 * נמצא הרחק משני צדי הגבול: הפרטים תופסים עד 35% מהמידה, ומשולש האזהרה שהיה
 * כאן תפס 78%x75%.
 */
const WARNING_TRIANGLE_MIN = 0.5;

describe('סמנטיקה של הצורה', () => {
  it('אין אייקון שהוא משולש שממלא את ה-viewBox — זה סימן האזהרה המוסכם', () => {
    // מה שקרה: `otzaria` היה משולש חלול עם מקף אנכי ונקודה מתחתיו — כלומר
    // משולש + סימן קריאה — על כפתור „פתח ספרייה”. שום בדיקה לא התלוננה, כי
    // הגאומטריה הייתה תקינה לחלוטין: viewBox נכון, בתוך הגבולות, יחס מילוי
    // בטווח. „נראה כמו ספר” אינו ניתן לבדיקה, אבל „הצורה היא סימן אזהרה” כן:
    // משולש שהוא הצורה הראשית של אייקון פירושו אזהרה או שגיאה בכל סט אייקונים
    // מוכר, ואין לנו אף פקד שזה תפקידו.
    const warnings: string[] = [];
    for (const name of NAMES) {
      for (const part of pathsWithTransform(ICONS[name]!)) {
        for (const sub of walkPath(part.d)) {
          const vertices = polygonVertices({
            ...sub,
            pts: applyTransform(sub.pts, part.transform),
          });
          if (!vertices || vertices.length !== 3) continue;
          const w = (Math.max(...vertices.map((v) => v.x)) - Math.min(...vertices.map((v) => v.x))) / VB_W;
          const h = (Math.max(...vertices.map((v) => v.y)) - Math.min(...vertices.map((v) => v.y))) / VB_H;
          if (w >= WARNING_TRIANGLE_MIN && h >= WARNING_TRIANGLE_MIN) {
            warnings.push(`${name}: משולש ${(w * 100).toFixed(0)}%x${(h * 100).toFixed(0)}%`);
          }
        }
      }
    }
    expect(warnings).toEqual([]);
  });

  it('הגלאי אכן מזהה את משולש האזהרה שהיה כאן', () => {
    // בלי הבדיקה הזאת שער כמו זה שלמעלה יכול לעבור בירוק מפני שהוא אינו מודד
    // כלום — למשל אחרי שינוי בפירוק תת-הנתיבים.
    const [triangle] = walkPath('M10 2l-8 15h16L10 2zm0 3.8l5.5 10.2H4.5L10 5.8z');
    const vertices = polygonVertices(triangle!);
    expect(vertices).toHaveLength(3);
    const w = Math.max(...vertices!.map((v) => v.x)) - Math.min(...vertices!.map((v) => v.x));
    expect(w / VB_W).toBeGreaterThanOrEqual(WARNING_TRIANGLE_MIN);
  });
});

describe('משקל אופטי', () => {
  it('יחס המילוי של כל אייקון בטווח המוגדר', () => {
    const bad: string[] = [];
    for (const name of NAMES) {
      const m = INK.get(name)!;
      const w = (m.maxX - m.minX) / VB_W;
      const h = (m.maxY - m.minY) / VB_H;
      const dominant = Math.max(w, h);
      const minor = Math.min(w, h);
      const flat = FLAT_ICONS.has(name);
      const minorExempt = MINOR_EXEMPT.has(name);
      const min = flat ? FLAT_DOMINANT_MIN : DOMINANT_MIN;
      const detail = `${name}: ${(w * 100).toFixed(0)}%x${(h * 100).toFixed(0)}%`;
      if (dominant < min - 0.001 || dominant > DOMINANT_MAX + 0.001) {
        bad.push(`${detail} — מידה דומיננטית ${(dominant * 100).toFixed(0)}% מחוץ לטווח`);
      } else if (!flat && !minorExempt && minor < MINOR_MIN - 0.001) {
        bad.push(`${detail} — מידה קטנה ${(minor * 100).toFixed(0)}% מתחת למינימום`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('רשימות ההחרגה אינן מכילות שמות שאינם קיימים', () => {
    expect([...FLAT_ICONS].filter((n) => !(n in ICONS))).toEqual([]);
    expect([...MINOR_EXEMPT].filter((n) => !(n in ICONS))).toEqual([]);
  });

  it('כל שם ברשימות ההחרגה באמת זקוק להחרגה', () => {
    // בלי זה ההחרגות מתרחבות בשקט: אייקון שהוחלף ועכשיו עובר את הכלל הרגיל
    // נשאר ברשימה, וההחרגה מכסה אותו לנצח. כך `strikethrough` יצא מ-FLAT_ICONS
    // כשהוא הוחלף בגרסת Fluent שיחס המילוי שלה 70%x70%.
    const ratio = (name: string): { dominant: number; minor: number } => {
      const m = INK.get(name)!;
      const w = (m.maxX - m.minX) / VB_W;
      const h = (m.maxY - m.minY) / VB_H;
      return { dominant: Math.max(w, h), minor: Math.min(w, h) };
    };
    const needless: string[] = [];
    for (const name of FLAT_ICONS) {
      const { dominant, minor } = ratio(name);
      if (dominant >= DOMINANT_MIN - 0.001 && minor >= MINOR_MIN - 0.001) {
        needless.push(`${name} ב-FLAT_ICONS`);
      }
    }
    for (const name of MINOR_EXEMPT) {
      if (ratio(name).minor >= MINOR_MIN - 0.001) needless.push(`${name} ב-MINOR_EXEMPT`);
    }
    expect(needless).toEqual([]);
  });
});

// vitest רץ משורש המאגר, ולכן cwd הוא השורש (כמו ב-engine-boundaries).
const SRC = join(process.cwd(), 'src');

function vueFiles(dir = SRC): string[] {
  return sourceFiles(dir).filter((file) => file.endsWith('.vue'));
}

/** כל קובצי המקור — גם .ts, כי שם נבחרים אייקונים בזמן ריצה. */
function sourceFiles(dir = SRC): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(full));
    else if (/\.(vue|ts)$/.test(entry.name)) files.push(full);
  }
  return files;
}

/**
 * שימושים בפועל של אייקונים בתבניות. שתי החרגות מכוונות:
 *
 * - הערות HTML מוסרות. ב-RibbonGroup.vue יש כפתור launcher בהערה (הוא הוסר
 *   מהעיצוב), ואייקון שרק הערה מזכירה אינו „בשימוש”.
 * - מאפיין שקדם לו `:` הוא binding דינמי (`:name="icon"`), כלומר השם נקבע
 *   בזמן ריצה מ-prop של הרכיב — ואת הערך האמיתי נותן אתר הקריאה, שגם הוא
 *   נסרק כאן.
 *
 * מה שסריקת המאפיינים הזאת **אינה** רואה: שם שנבחר בביטוי, כמו
 * `:name="isCollapsed ? 'chevronDown' : 'chevronUp'"` ב-Ribbon.vue, או שם
 * שמוחזר מפונקציה ב-.ts (כך נבחרים chevronLeft/chevronRight בגלריית
 * הסגנונות). בגללה `chevronUp` נראה בטעות כאייקון ללא צרכן ונכנס
 * ל-PLANNED_ICONS. ראו dynamicIconNames.
 */
function usedIcons(): Map<string, string[]> {
  const used = new Map<string, string[]>();
  for (const file of vueFiles()) {
    const text = readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    for (const m of text.matchAll(/(?<!:)\b(?:icon|name)="([A-Za-z][A-Za-z0-9]*)"/g)) {
      const name = m[1]!;
      const where = used.get(name) ?? [];
      where.push(relative(process.cwd(), file));
      used.set(name, where);
    }
  }
  return used;
}

/**
 * שמות אייקונים שנבחרים בזמן ריצה: מחרוזת מצוטטת בכל קובץ מקור, שמצטלבת עם
 * שמות ה-ICONS. פחות מדויק מסריקת מאפיינים — מחרוזת שמקרית לה אותו שם תיחשב
 * שימוש — ולכן היא משמשת רק כדי **להרחיב** את קבוצת „בשימוש”, ולא כדי לאמת
 * שהשם קיים. עדיף מהחלופה: אייקון שכן מחובר לפקד ונראה כמיותם, ואז נדחף
 * ל-PLANNED_ICONS וההחרגה גדלה בשקט.
 */
function dynamicIconNames(): Set<string> {
  const known = new Set(NAMES);
  const found = new Set<string>();
  // icons.ts עצמו מוחרג: PLANNED_ICONS הוא מחרוזות מצוטטות של שמות אייקונים,
  // וסריקה שלו הייתה מדווחת שכל אייקון מתוכנן „בשימוש”.
  const definition = join(SRC, 'ui/icons/icons.ts');
  for (const file of sourceFiles()) {
    if (file === definition) continue;
    const text = readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    for (const m of text.matchAll(/['"`]([A-Za-z][A-Za-z0-9]*)['"`]/g)) {
      if (known.has(m[1]!)) found.add(m[1]!);
    }
  }
  return found;
}

describe('אתרי הקריאה לאייקונים', () => {
  const used = usedIcons();
  const referenced = new Set([...used.keys(), ...dynamicIconNames()]);

  it('הסריקה אכן מצאה שימושים (הגנה מפני regex שהפסיק להתאים)', () => {
    expect(used.size).toBeGreaterThan(40);
    expect(used.has('bold')).toBe(true);
  });

  it('כל שם אייקון שמופיע בתבנית Vue קיים ב-ICONS', () => {
    // SvgIcon מחזיר `ICONS[name] || ''`, ולכן שם שגוי = כפתור בלי אייקון,
    // בלי שגיאה ובלי שאף אחד ישים לב. זו הבדיקה שמונעת את זה.
    const missing = [...used.entries()]
      .filter(([name]) => !(name in ICONS))
      .map(([name, files]) => `${name} (${[...new Set(files)].join(', ')})`);
    expect(missing).toEqual([]);
  });

  it('אין אייקון מוגדר שאינו בשימוש, למעט רשימת PLANNED_ICONS', () => {
    const planned = new Set<string>(PLANNED_ICONS);
    const orphans = NAMES.filter((n) => !referenced.has(n) && !planned.has(n));
    expect(orphans).toEqual([]);
  });

  it('כל שם ב-PLANNED_ICONS מוגדר, ואינו בשימוש בפועל', () => {
    // אייקון מתוכנן שכבר חובר לפקד צריך לצאת מהרשימה, אחרת ההחרגה מתרחבת
    // בשקט ומכסה גם אייקונים שנשכחו.
    expect(PLANNED_ICONS.filter((n) => !(n in ICONS))).toEqual([]);
    expect(PLANNED_ICONS.filter((n) => referenced.has(n))).toEqual([]);
  });

  it('פעולות הקובץ מקבלות אייקונים נפרדים ונכונים', () => {
    // ארבע הפעולות האלה חלקו קודם אייקונים שגויים: „פתח קובץ” הציג זכוכית
    // מגדלת, „מסמך חדש” הציג את לוגו האפליקציה, ו„שמור בשם” ו„ייצוא ל-Word”
    // הציגו את אותו אייקון בדיוק.
    // הנרמול אינו מתקן כשל: במאגר עצמו כל הקבצים LF, ובלעדיו הבדיקה עוברת.
    // הוא הגנה על מי שיעבוד ב-Windows עם `core.autocrlf=true`.
    const fileTab = readFileSync(join(SRC, 'ui/ribbon/tabs/FileTab.vue'), 'utf8').replace(
      /\r\n/g,
      '\n'
    );
    // הזיווג נמדד ב-`\s+` ולא ברווחי הזחה ספורים. הטענה כאן היא **איזה אייקון
    // מוצמד לאיזו תווית**, וההזחה אינה חלק ממנה: פקד שיורד למחסנית
    // (`RibbonStack`) מוזח רמה פנימה, וההשוואה שהייתה כאן נפלה על שתי רמות
    // הזחה ולא על אייקון שגוי. שער שנשבר מסידור מחדש מלמד להתעלם ממנו.
    for (const [icon, label] of [
      ['newDoc', 'מסמך חדש'],
      ['folder', 'פתח קובץ'],
      ['save', 'שמור'],
      ['saveAs', 'שמור בשם...'],
      ['exportPdf', 'ייצוא ל-PDF'],
    ] as const) {
      const quoted = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(fileTab, label).toMatch(new RegExp(`icon="${icon}"\\s+label="${quoted}"`));
    }
    const icons = [...fileTab.matchAll(/icon="([A-Za-z]+)"/g)].map((m) => m[1]!);
    expect(new Set(icons).size, 'אין אייקון כפול בלשונית קובץ').toBe(icons.length);
  });

  it('trackChanges ו-info אינם אותו path', () => {
    // הם היו זהים לחלוטין, ולכן „עקוב אחר שינויים” קיבל אייקון מידע.
    expect(ICONS.trackChanges).not.toBe(ICONS.info);
  });

  it('אין שני אייקונים עם אותו path בכלל', () => {
    const byPath = new Map<string, string[]>();
    for (const name of NAMES) {
      // כולל ה-`transform`, כדי ששני אייקונים שההבדל היחיד ביניהם הוא שיקוף
      // לא ייחשבו כפילות.
      const paths = pathsWithTransform(ICONS[name]!)
        .map((p) => `${p.transform ?? ''}:${p.d}`)
        .join('|');
      byPath.set(paths, [...(byPath.get(paths) ?? []), name]);
    }
    const dupes = [...byPath.values()].filter((g) => g.length > 1).map((g) => g.join(' = '));
    expect(dupes).toEqual([]);
  });
});
