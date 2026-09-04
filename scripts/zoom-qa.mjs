/**
 * QA חי לשני פקדי הזום בלשונית „תצוגה”: „גודל אמיתי” ו„רוחב עמוד”,
 * ולתקרת ההיקף של Word (500%) בסליידר שורת המצב.
 *
 * הבדיקות המורכבות מוכיחות את ה-payload; הן אינן יכולות להוכיח שהמנוע **עשה**
 * משהו עם ה-payload. כאן הכפתור נלחץ על ה-dist הארוז, במנוע חי, ונמדדים:
 *
 *   1. מצב הכפתור (disabled) ברגע הלחיצה, אחרי שהמנוע מוכן.
 *   2. מצב הזום שהמנוע מדווח (`getZoomState`) — מה שהתווית אמורה להציג.
 *   3. הרינדור: רוחב העמוד וכל אלמנט שעבר transform בתוך `.superdoc` —
 *      מה שהמשתמש באמת רואה. תווית שזזה בלי שהעמוד זז היא התלונה עצמה.
 *
 *   npm run build && node scripts/zoom-qa.mjs
 */
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage, requireChrome } from './cdp.mjs';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const OBSERVE_MS = 40_000;

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('dist/index.html אינו קיים — הריצו npm run build תחילה');
  process.exit(1);
}
requireChrome();

/** Host-דמה שעונה ל-RPC, כמו מצב „שחזור” ב-boot-check. + לכידת קונסולה. */
const STUB = `<script>
  window.__qaConsole = [];
  ['warn', 'error', 'log'].forEach(function (kind) {
    var original = console[kind].bind(console);
    console[kind] = function () {
      window.__qaConsole.push(kind + ': ' + [...arguments].map(String).join(' '));
      original.apply(null, arguments);
    };
  });
  window.Otzaria = {
    call: function (method) {
      if (method === 'app.getInfo') return Promise.resolve({ success: true, data: { version: '9.9.9', platform: 'zoom-qa' }, error: null });
      if (method === 'app.getTheme') return Promise.resolve({ success: true, data: { mode: 'light', colorScheme: {}, typography: {} }, error: null });
      return Promise.resolve({ success: false, data: null, error: { message: 'no' } });
    },
    on: function () {},
    off: function () {}
  };
</script>`;

const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const latchEnd = html.indexOf('</script>') + '</script>'.length;
const path = join(DIST, 'zoom-qa-tmp.html');
writeFileSync(path, html.slice(0, latchEnd) + STUB + html.slice(latchEnd));
const expr = `(async () => {
  const q = (sel) => document.querySelector(sel);
  const qa = (sel) => [...document.querySelectorAll(sel)];
  const settle = (ms) => new Promise((r) => setTimeout(r, ms));

  // ממתין לממשק, למנוע ולידית ה-QA.
  const deadline = Date.now() + ${OBSERVE_MS};
  while (Date.now() < deadline) {
    if (q('.word-tab-strip') && q('.superdoc') && window.__otzariaEditor) break;
    await settle(250);
  }
  if (!q('.word-tab-strip') || !window.__otzariaEditor) return { fatal: 'האתחול לא הושלם' };
  const sd = window.__otzariaEditor.superdoc;

  // ממתין שפקודת הזום תהיה זמינה — המצב שמשתמש אמיתי פוגש כשהוא לוחץ.
  // „רוחב עמוד” אינו משתמש עוד ב-zoom-fit-width (ראו engine/fit-width.ts),
  // ולכן הזמינות הרלוונטית היא של פקודת zoom בלבד.
  while (Date.now() < deadline) {
    const zoom = sd.ui?.commands?.get('zoom')?.getState?.();
    if (zoom?.enabled) break;
    await settle(250);
  }

  // סריקה: מה שהמשתמש רואה בפועל. שני תיקונים למדידה:
  // • העמודים הנראים (מחלקת superdoc-page) ולא תיבת ה-layout: המנוע מפצה את
  //   רוחב הפריסה על ה-scale (width = container/zoom), ולכן תיבת ה-layout
  //   אינה משתנה עם הזום בכלל — העדות הוויזואלית היא ב-rect של העמוד.
  // • scaled נשאר לאבחון בלבד: נוכחות transform אינה ראיה לשינוי, כי
  //   scale(1) גם הוא matrix ולא none.
  function scan(tag) {
    const sdoc = q('.superdoc');
    const scaled = [];
    if (sdoc) {
      for (const el of sdoc.querySelectorAll('*')) {
        const t = getComputedStyle(el).transform;
        if (t && t !== 'none') {
          scaled.push({
            cls: String(el.className ?? '').slice(0, 70),
            w: Math.round(el.getBoundingClientRect().width),
          });
          if (scaled.length >= 10) break;
        }
      }
    }
    const visible = qa('.superdoc-page').map((el) => {
      const b = el.getBoundingClientRect();
      return { left: Math.round(b.left), width: Math.round(b.width) };
    });
    const page = q('.superdoc__sub-document');
    return {
      tag,
      label: q('.zoom-pct-btn') ? q('.zoom-pct-btn').textContent.trim() : null,
      zoomState: typeof sd.getZoomState === 'function' ? sd.getZoomState() : null,
      sliderMax: q('.zoom-slider') ? q('.zoom-slider').getAttribute('max') : null,
      pageRect: page ? Math.round(page.getBoundingClientRect().width) : null,
      visible,
      scaled,
      warns: (window.__qaConsole ?? []).splice(0).slice(-5),
    };
  }

  async function clickTab(name) {
    const tab = qa('.word-tab-btn').find((b) => b.textContent.trim() === name);
    if (!tab) return false;
    tab.click();
    await settle(500);
    return true;
  }

  async function clickZoomButton(title) {
    const btn = q('button[data-tip-title="' + title + '"],button[data-tip-desc="' + title + '"]');
    if (!btn) return { found: false };
    const before = { disabled: btn.disabled };
    btn.click();
    await settle(1800);
    return { found: true, ...before };
  }

  const out = { steps: [] };
  out.steps.push(scan('baseline'));

  if (!(await clickTab('תצוגה'))) return { fatal: 'לשונית תצוגה לא נמצאה' };

  const fitBtn = q('button[data-tip-title="התאם את תצוגת העמוד לרוחב החלון"],button[data-tip-desc="התאם את תצוגת העמוד לרוחב החלון"]');
  const hundredBtn = q('button[data-tip-title="הצג את המסמך בגודלו האמיתי (100%)"],button[data-tip-desc="הצג את המסמך בגודלו האמיתי (100%)"]');
  out.buttonStates = { fitDisabled: fitBtn?.disabled ?? null, hundredDisabled: hundredBtn?.disabled ?? null };

  const fit = await clickZoomButton('התאם את תצוגת העמוד לרוחב החלון');
  out.steps.push({ button: 'רוחב עמוד', ...fit });
  out.steps.push(scan('after-fit-width'));

  const hundred = await clickZoomButton('הצג את המסמך בגודלו האמיתי (100%)');
  out.steps.push({ button: 'גודל אמיתי', ...hundred });
  out.steps.push(scan('after-100'));

  // בקרה: מסלול מנוע טהור, בלי הממשק שלנו. האם setZoom בכלל משנה רינדור?
  if (typeof sd.setZoom === 'function') {
    sd.setZoom(60);
    await settle(2000);
    out.steps.push(scan('after-direct-setZoom-60'));
    // בקרת התקרה: 500% — מעבר ל-max שהמנוע מדווח (גבול ה-fit-width שלו).
    // setZoom אינו מצמצם (נמדד ב-bundle), ולכן הסליידר שלנו מציע עד 500.
    sd.setZoom(500);
    await settle(2000);
    out.steps.push(scan('after-direct-setZoom-500'));
    sd.setZoomMode('fit-width');
    await settle(2000);
    out.steps.push(scan('after-direct-fit-width'));
  }

  out.consoleTail = (window.__qaConsole ?? []).slice(-10);
  return out;
})();`;

let failures = 0;
let page;
try {
  page = await openPage(`file://${path}`, { label: 'zoom-qa' });
  const result = (await page.cdp.evaluate(expr)) ?? { fatal: 'אין תוצאה' };
  console.log(JSON.stringify(result, null, 2));

  if (result.fatal || !result.steps) {
    console.error('✗ הריצה נכשלה להשלים אתחול');
    failures += 1;
  } else {
    const byTag = Object.fromEntries(result.steps.filter((s) => s.tag).map((s) => [s.tag, s]));
    const base = byTag['baseline'];
    const fit = byTag['after-fit-width'];
    const hundred = byTag['after-100'];
    const direct60 = byTag['after-direct-setZoom-60'];

    if (result.buttonStates.fitDisabled) {
      console.error('✗ „רוחב עמוד” מנוטרל גם אחרי שהמנוע מוכן');
      failures += 1;
    }

    // מה משתנה ויזואלית: התווית (הערך שהמנוע מדווח) והעמודים ה**נראים**.
    // תיבת ה-layout ונוכחות transform אינן ראיה — המנוע מפצה את הרוחב
    // (`width: container/zoom`) ומשאיר scale(1) גם ב-100%.
    const changed = (a, b) =>
      a?.label !== b?.label || JSON.stringify(a?.visible) !== JSON.stringify(b?.visible);

    if (!changed(base, fit)) {
      console.error('✗ „רוחב עמוד”: הרינדור לא השתנה בכלל');
      failures += 1;
    } else if (fit.zoomState?.mode !== 'manual') {
      console.error('✗ „רוחב עמוד” הכניס את המנוע ל-zoomMode fit-width — לולאת המשוב חזרה');
      failures += 1;
    } else {
      const pct = Number.parseInt(fit.label ?? '', 10);
      if (!(pct > 20)) {
        console.error(`✗ „רוחב עמוד” הגיע ל-${fit.label} — קריסה לרצפה, לא התאמה`);
        failures += 1;
      } else {
        console.log(`✓ „רוחב עמוד” שינה את הרינדור ל-${fit.label}, ב-manual (בלי לולאת המשוב)`);
      }
    }
    if (!changed(fit, hundred)) {
      console.error('✗ „100%”: הרינדור לא חזר לגודל 100%');
      failures += 1;
    } else {
      console.log('✓ „100%” שינה את הרינדור');
    }
    if (direct60 && !changed(hundred, direct60)) {
      console.error('✗ בקרה: גם setZoom ישיר לא משנה רינדור — העדר החלה הוא במנוע');
      failures += 1;
    } else if (direct60) {
      console.log('✓ בקרה: setZoom ישיר משנה רינדור');
    }

    // תקרת ההיקף של Word: הסליידר מציע עד 500%, ו-setZoom(500) בפועל
    // מגדיל את העמוד הנראה פי ~5 לעומת 100%.
    if (hundred?.sliderMax !== '500') {
      console.error(`✗ הסליידר בשורת המצב מדווח max=${hundred?.sliderMax} במקום 500`);
      failures += 1;
    } else {
      console.log('✓ הסליידר בשורת המצב מציע עד 500%');
    }
    const fivehundred = byTag['after-direct-setZoom-500'];
    if (fivehundred) {
      const w100 = hundred?.visible?.[0]?.width ?? 0;
      const w500 = fivehundred.visible?.[0]?.width ?? 0;
      if (!(w100 > 0) || !(w500 > 0)) {
        console.error('✗ בקרת 500%: לא נמדד רוחב עמוד נראה');
        failures += 1;
      } else if (w500 / w100 < 3) {
        console.error(`✗ בקרת 500%: רוחב העמוד עבר מ-${w100}px ל-${w500}px בלבד — ההגדלה לא הוחלה`);
        failures += 1;
      } else {
        console.log(`✓ בקרת 500%: העמוד הנראה גדל ${w100}px → ${w500}px (פי ${(w500 / w100).toFixed(1)})`);
      }
    }
    // תיעוד חי של באג המנוע שבגללו „רוחב עמוד” מחושב אצלנו: מסלול
    // zoom-fit-width של המנוע עצמו מתכווץ לרצפה. לא נכשל בגללו — הוא לא
    // בשימוש — אבל הריצה משמרת את ההוכחה.
    const engineFit = byTag['after-direct-fit-width'];
    if (engineFit) {
      const pct = Number.parseInt(engineFit.label ?? '', 10);
      const floor = Number.parseInt(String(engineFit.zoomState?.min ?? '10'), 10);
      if (pct <= floor + 5) {
        console.log(`ℹ בקרה: zoom-fit-width של המנוע עצמו מתכווץ ל-${engineFit.label} (הרצפה ${floor}) — הבאג שהוביל לעקיפה עדיין קיים`);
      } else {
        console.log(`ℹ בקרה: zoom-fit-width של המנוע החזיר ${engineFit.label} — ייתכן שהבאג תוקן במנוע, שקלו לחזור לפקודה המובנית`);
      }
    }
  }
} catch (error) {
  console.error(`zoom-qa נכשל: ${error.message}`);
  failures += 1;
} finally {
  page?.close();
  rmSync(path, { force: true });
}

process.exit(failures ? 1 : 0);