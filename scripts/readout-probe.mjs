/**
 * שער החיווי: האם הרצועה מהבהבת בזמן הקלדה.
 *
 * ## התקלה שהשער הזה נולד ממנה
 *
 * „כשאני מקליד, העיצוב לא קיים; כשאני מפסיק, הוא חוזר.” נמדד כאן על ה-dist
 * הארוז: ב-40 שניות של הקלדה רגילה כפתור „יישור לימין” איבד את החיווי הדלוק
 * וקיבל אותו בחזרה **34 פעמים**. ההנמקה המלאה, כולל למה זה קורה ומה הכלל
 * שמתקן, ב-src/engine/readout-hold.ts.
 *
 * ## מה נמדד, ולמה דווקא כך
 *
 * הסף הוא **הבהוב ולא ערך**: המדידה סופרת מצבים שבהם החיווי עוזב את מה שהוא
 * מציג וחוזר אליו בתוך חלון קצר. זו ההבחנה שמפרידה בין הבאג לבין התנהגות
 * נכונה — כשהמשתמש מזיז את הסמן לפסקה מיושרת אחרת, החיווי משתנה **פעם אחת**
 * ואינו חוזר; הבאג הוא דווקא החזרה. סף על „כמה זמן היה ריק” היה מודד את
 * מהירות המכונה, ולא את הקוד.
 *
 * הדגימה בתוך הדף (16ms) ולא דרך CDP: הלוך-ושוב של הפרוטוקול מפספס חלונות
 * של 300ms, וזה בדיוק סדר הגודל של ההבהוב.
 *
 * **מה נמדד כאן הוא החיווי שמקורו ב-`CommandState.value`** — ארבעת כפתורי
 * היישור ושלושת הבוררים. `CommandState.active` הוא ציר אחר: הוא בוליאני שאין
 * בו „לא ידוע”, המנוע גוזר אותו מ-`selection.activeMarks`, והוא **אינו** מוחזק
 * בכוונה (ההנמקה ב-readout-hold.ts). לכן הוא אינו נמדד כאן.
 *
 * מונע דרך CDP ולא ב-jsdom: מנוע ה-DOCX האמיתי, workers אמיתיים ו-`file://`
 * אמיתי הם מה שמייצר את הקריאות האסינכרוניות שההבהוב נולד מהן.
 *
 *   npm run build && npm run check:readout
 */
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage, requireChrome, sleep } from './cdp.mjs';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const INDEX = join(DIST, 'index.html');
const PROBE = join(DIST, '__readout-probe.html');

/** כמה להמתין למסמך לפני שמוותרים. נדיב: המנוע פורס 14MB בדרך. */
const OPEN_MS = 45_000;

/**
 * חזרה לאותו חיווי בתוך החלון הזה היא הבהוב, ולא שינוי. 1500ms בנדיבות:
 * חלונות ה-`stale` שנמדדו היו 300–900ms, ושינוי אמיתי שהמשתמש עשה אינו חוזר
 * לעצמו בכלל.
 */
const BLINK_WINDOW_MS = 1_500;

if (!existsSync(INDEX)) {
  console.error('dist/index.html אינו קיים — הריצו npm run build תחילה');
  process.exit(1);
}
requireChrome();

const INSTRUMENT = `
<script>
(function () {
  var BOOT = {
    plugin: { id: 'readout-probe', version: '0' },
    app: { version: '9.9.9', platform: 'readout-probe', language: 'he' },
    theme: { mode: 'light', colorScheme: {}, typography: {} },
    connectivity: { isOnline: false }, permissions: []
  };
  window.Otzaria = {
    call: function (m) {
      if (m === 'app.getInfo') return Promise.resolve({ success: true, data: BOOT.app, error: null });
      if (m === 'app.getTheme') return Promise.resolve({ success: true, data: BOOT.theme, error: null });
      return Promise.resolve({ success: false, data: null, error: { message: 'no', code: 'error.not_supported' } });
    },
    on: function () {}, off: function () {}
  };
  window.dispatchEvent(new CustomEvent('plugin.boot', { detail: BOOT }));

  var P = window.__readout = { samples: [], log: [] };
  ['error','warn'].forEach(function (lvl) {
    var o = console[lvl];
    console[lvl] = function () {
      try { P.log.push(lvl + ': ' + Array.prototype.map.call(arguments, String).join(' ').slice(0, 300)); } catch (e) {}
      return o.apply(console, arguments);
    };
  });

  var ALIGN = ['יישור לימין', 'מרכז', 'יישור לשמאל', 'יישור לשני הצדדים'];

  /** התווית של כפתור היישור הדלוק, או '' כשאין אף אחד — כלומר „מעורב”. */
  function alignSig() {
    var root = document.querySelector('.word-ribbon-container');
    if (!root) return 'no-ribbon';
    var buttons = root.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      // data-tip-title ולא title: התכונה המולדת הוסרה מכל התוסף, כדי שמערכת
      // ההפעלה לא תצייר טולטיפ שני מעל הכרטיס המעוצב. (בלי גרשיים אחוריים —
      // הקוד הזה יושב בתוך template literal שמוזרק לדף.)
      var title = buttons[i].getAttribute('data-tip-title') || '';
      for (var j = 0; j < ALIGN.length; j++) {
        if (title.indexOf(ALIGN[j]) !== 0) continue;
        if (buttons[i].classList.contains('active')) return ALIGN[j];
      }
    }
    return '';
  }

  /** הערכים שהבוררים מציגים: גופן, גודל, מרווח שורות. */
  function pickerSig() {
    var root = document.querySelector('.word-ribbon-container');
    if (!root) return 'no-ribbon';
    var out = [];
    var sels = root.querySelectorAll('select');
    for (var i = 0; i < sels.length; i++) out.push(sels[i].value);
    return out.join('|');
  }

  /** מצב הבחירה, כדי שדוח הכשל יראה מה קרה ולא רק שקרה. */
  function selSig() {
    var s = window.__otzariaEditor, ui = s && s.ui;
    if (!ui) return 'no-ui';
    try {
      var sel = ui.selection.get();
      return sel.status + '|' + (sel.empty ? 'caret' : 'range');
    } catch (e) { return 'throw'; }
  }

  P.start = function () {
    if (!document.querySelector('.word-ribbon-container')) return false;
    P.t0 = performance.now();
    P.timer = setInterval(function () {
      P.samples.push({
        t: Math.round(performance.now() - P.t0),
        align: alignSig(), pickers: pickerSig(), sel: selSig(), stage: P.stage || ''
      });
      if (P.samples.length > 8000) clearInterval(P.timer);
    }, 16);
    return true;
  };

  P.stop = function () { clearInterval(P.timer); return P.samples.length; };
  P.mark = function (name) { P.stage = name; return name; };
})();
</script>
`;

const html = readFileSync(INDEX, 'utf8');
const afterLatch = html.indexOf('</script>') + '</script>'.length;
if (afterLatch <= '</script>'.length) {
  console.error('לא נמצא ה-latch ב-dist/index.html — אין לאן להזריק את המדידה');
  process.exit(1);
}
writeFileSync(PROBE, html.slice(0, afterLatch) + INSTRUMENT + html.slice(afterLatch));

const errors = [];
let samples = [];
let pageLog = [];

try {
  const { cdp, close } = await openPage(`file:///${PROBE.split('\\').join('/')}`, {
    label: 'readout',
  });
  try {
    for (let waited = 0; waited < OPEN_MS; waited += 500) {
      await sleep(500);
      const ready = await cdp.evaluate(
        '!!window.__otzariaEditor && !document.getElementById("otzaria-splash")',
      );
      if (ready) break;
    }
    // הקטלוג של הסגנונות והגופנים נפתר אחרי הפתיחה; מדידה לפני זה הייתה
    // מודדת את העלייה ולא את ההקלדה.
    await sleep(3_000);

    /**
     * סמן במסמך דורש לחיצה על **שורת טקסט**, לא על העמוד: העורך של המנוע
     * (v2, presentation) קולט הקלדה ב-textarea מוסתר, ולחיצה על שטח ריק
     * ממקדת אותו בלי לפתור יעד בחירה — כלומר הקלדה שלא נכנסת לשום מקום.
     */
    const line = await cdp.evaluate(
      '(function(){' +
        'var l = document.querySelector(".superdoc-line") || document.querySelector(".superdoc-fragment");' +
        'if (!l) return "none";' +
        'var r = l.getBoundingClientRect();' +
        'return JSON.stringify({ x: Math.round(r.x + Math.min(20, r.width / 2)), y: Math.round(r.y + r.height / 2) });' +
      '})()',
    );
    if (line === 'none') throw new Error('לא נמצאה שורת טקסט במסמך — אין לאן למקם סמן');
    const at = JSON.parse(line);

    const click = async (dx = 0) => {
      const x = at.x + dx;
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y: at.y, button: 'left', buttons: 1, clickCount: 1 });
      await sleep(60);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y: at.y, button: 'left', buttons: 0, clickCount: 1 });
    };
    const press = async (key, code, vk, modifiers = 0, text) => {
      await cdp.send('Input.dispatchKeyEvent', {
        type: text ? 'keyDown' : 'rawKeyDown', key, code, text, unmodifiedText: text,
        windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers,
      });
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers,
      });
    };
    const typeText = async (chars, gapMs) => {
      for (const ch of chars) {
        await press(ch, `Key${ch.toUpperCase()}`, ch.toUpperCase().charCodeAt(0), 0, ch);
        await sleep(gapMs);
      }
    };

    await click();
    await sleep(1_500);

    if (!(await cdp.evaluate('window.__readout.start()'))) {
      throw new Error('הרצועה אינה ב-DOM — אין מה למדוד');
    }
    await sleep(500);

    const mark = (name) => cdp.evaluate(`window.__readout.mark(${JSON.stringify(name)})`);

    // הקלדה רצופה — המסלול שהתקלה דווחה עליו.
    await mark('הקלדה');
    await typeText('abcdefghijklmno'.split(''), 70);
    await mark('מנוחה');
    await sleep(2_500);

    // הזזת סמן, ואז סימון טווח: שני המסלולים שהמשתמש תיאר כ„נודד מחוץ למקום
    // ההקלדה”.
    await mark('הזזת סמן');
    for (let i = 0; i < 6; i++) {
      await press('ArrowLeft', 'ArrowLeft', 37);
      await sleep(120);
    }
    await sleep(2_000);

    await mark('סימון טווח');
    for (let i = 0; i < 6; i++) {
      await press('ArrowRight', 'ArrowRight', 39, 8);
      await sleep(120);
    }
    await sleep(2_000);

    await mark('לחיצה במקום אחר');
    await click(120);
    await mark('מנוחה סופית');
    await sleep(3_000);

    await cdp.evaluate('window.__readout.stop()');
    samples = JSON.parse(await cdp.evaluate('JSON.stringify(window.__readout.samples)'));
    pageLog = JSON.parse(await cdp.evaluate('JSON.stringify(window.__readout.log.slice(0, 25))'));
  } finally {
    close();
  }
} finally {
  rmSync(PROBE, { force: true });
}

/* ------------------------------------------------------------------ */
/* החשבון                                                              */
/* ------------------------------------------------------------------ */

/** רצפים של אותו ערך, כדי שאפשר יהיה לדבר על „עזב וחזר”. */
function runsOf(field) {
  const runs = [];
  for (const sample of samples) {
    const value = sample[field];
    const last = runs[runs.length - 1];
    if (last && last.value === value) {
      last.until = sample.t;
      continue;
    }
    runs.push({ value, from: sample.t, until: sample.t, sel: sample.sel, stage: sample.stage });
  }
  return runs;
}

/**
 * הבהוב: החיווי עזב ערך וחזר אליו בתוך החלון. זה ולא „היה ריק” — שינוי אמיתי
 * שהמשתמש עשה אינו חוזר לעצמו.
 */
function blinksOf(runs) {
  const found = [];
  for (let i = 2; i < runs.length; i++) {
    if (runs[i].value !== runs[i - 2].value) continue;
    if (runs[i].from - runs[i - 2].until > BLINK_WINDOW_MS) continue;
    found.push({
      value: runs[i - 2].value,
      through: runs[i - 1].value,
      atMs: runs[i - 1].from,
      forMs: runs[i].from - runs[i - 1].from,
      sel: runs[i - 1].sel,
      stage: runs[i - 1].stage,
    });
  }
  return found;
}

if (samples.length === 0) {
  errors.push('לא נאספה אף דגימה — המדידה לא רצה');
}

const alignRuns = runsOf('align');
const pickerRuns = runsOf('pickers');
const alignBlinks = blinksOf(alignRuns);
const pickerBlinks = blinksOf(pickerRuns);

console.log(`נאספו ${samples.length} דגימות ב-${samples[samples.length - 1]?.t ?? 0}ms`);
console.log('');
console.log('חיווי היישור — מה הוצג, לפי סדר:');
for (const run of alignRuns.slice(0, 40)) {
  console.log(
    `  ${String(run.from).padStart(6)}–${String(run.until).padStart(6)}ms  ` +
      `${(run.value || '«אף אחד»').padEnd(20)} בחירה=${run.sel.padEnd(14)} ${run.stage}`,
  );
}
if (alignRuns.length > 40) console.log(`  … ועוד ${alignRuns.length - 40}`);

console.log('');
console.log(`הבהובים בחיווי היישור: ${alignBlinks.length}`);
for (const blink of alignBlinks.slice(0, 12)) {
  console.log(
    `  ב-${blink.atMs}ms: „${blink.value}” → „${blink.through || '«אף אחד»'}” → „${blink.value}” ` +
      `(${blink.forMs}ms, בחירה=${blink.sel}, שלב=${blink.stage})`,
  );
}
console.log(`הבהובים בבוררי הגופן: ${pickerBlinks.length}`);
for (const blink of pickerBlinks.slice(0, 12)) {
  console.log(`  ב-${blink.atMs}ms: „${blink.value}” → „${blink.through}” → „${blink.value}” (${blink.forMs}ms, בחירה=${blink.sel})`);
}

if (pageLog.length) {
  console.log('');
  console.log('מה שהדף אמר:');
  for (const line of pageLog) console.log(`  ${line}`);
}

// המדידה חייבת לראות חיווי כלשהו, אחרת אפס הבהובים אינו אומר דבר.
if (samples.length > 0 && !alignRuns.some((run) => run.value !== '' && run.value !== 'no-ribbon')) {
  errors.push('אף כפתור יישור לא היה דלוק באף דגימה — המדידה אינה מודדת את מה שהיא חושבת');
}

if (alignBlinks.length > 0) {
  errors.push(
    `חיווי היישור הבהב ${alignBlinks.length} פעמים — החזקת הקריאה ` +
      '(src/engine/readout-hold.ts) אינה מגיעה למסך',
  );
}
if (pickerBlinks.length > 0) {
  errors.push(`בוררי הגופן הבהבו ${pickerBlinks.length} פעמים`);
}

console.log('');
if (errors.length > 0) {
  console.error('שער החיווי נכשל:');
  for (const error of errors) console.error(`  • ${error}`);
  process.exit(1);
}
console.log('שער החיווי עבר: החיווי ברצועה לא הבהב באף שלב.');
