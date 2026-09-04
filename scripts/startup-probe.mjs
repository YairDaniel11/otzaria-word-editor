/**
 * שער העלייה: כמה זמן המשתמש רואה מסך ריק, ומה סדר הטעינה בפועל.
 *
 * הכשל שהשער הזה נולד ממנו: שני הבאנדלים היו `<script src>` ב-`<head>`, ולכן
 * ה-`<body>` לא נפרס עד ששניהם נפרסו והורצו. נמדד ב-Chromium מ-`file://` —
 * ה-origin שממנו אוצריא טוענת תוסף ארוז — צביעה ראשונה ב-3074ms, כולה
 * המתנה. שום דבר לא נכשל; פשוט לא היה מה לראות.
 *
 * מה נמדד, ולמה דווקא כך:
 *
 * הסף המרכזי הוא **יחסי ולא בשניות**: הצביעה הראשונה חייבת לקדום לסיום
 * ההרצה של `app.js`. זו העובדה שהפיצול קנה, והיא נכונה על כל מכונה — סף
 * במילישניות היה נכשל על מכונה איטית ועובר על מהירה, כלומר מודד את החומרה
 * ולא את הקוד. סף מוחלט נדיב נשאר לצדו רק כרשת ביטחון למקרה שהצביעה מתעכבת
 * מסיבה אחרת לגמרי.
 *
 * הסדר נמדד גם הוא: `engine-workers.js` לפני `app.js` (הראשון מציב את
 * `__SUPERDOC_WORKER_SOURCES__`, והשני צורך אותו בהקמת המנוע), ושניהם
 * **אחרי** הצביעה — ‏17MB שחוזרים למסלול העלייה הם הרגרסיה שיש למנוע.
 *
 * מונע דרך CDP ולא ב-`--dump-dom`: ברגע שהמנוע עולה, אירוע ה-load אינו מגיע
 * (נמדד — הדפדפן נתלה), ו-`--virtual-time-budget` נתקע מול ה-workers.
 *
 *   npm run build && npm run check:startup
 */
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage, requireChrome, sleep } from './cdp.mjs';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const INDEX = join(DIST, 'index.html');
const PROBE = join(DIST, '__startup-probe.html');

/** רשת ביטחון בלבד. הסף שקובע הוא היחסי — ראו הכותרת. */
const FIRST_PAINT_CEILING_MS = 2_000;

/** כמה להמתין למסמך לפני שמוותרים. נדיב: המנוע פורס 17MB בדרך. */
const OBSERVE_MS = 45_000;

if (!existsSync(INDEX)) {
  console.error('dist/index.html אינו קיים — הריצו npm run build תחילה');
  process.exit(1);
}
requireChrome();

/**
 * Host-דמה של אוצריא + מדידה. מוזרק מיד אחרי ה-latch, כלומר לפני כל שאר
 * הסקריפטים — בדיוק כמו שאוצריא עצמה מזריקה את ה-SDK ויורה את plugin.boot.
 */
const INSTRUMENT = `
<script>
(function () {
  var THEME = {"primary": "#7a5a12", "surface": "#fbf8f3", "onSurface": "#2b2416", "onSurfaceVariant": "#6d6353", "outlineVariant": "#ded3c2"};
  var BOOT_DELAY_MS = 250;

  var marks = {};
  window.__startup = marks;
  function mark(name) { if (marks[name] === undefined) marks[name] = Math.round(performance.now()); }
  mark('docStart');

  var BOOT = {
    plugin: { id: 'startup-probe', version: '0' },
    app: { version: '9.9.9', platform: 'startup-probe', language: 'he' },
    theme: { mode: 'light', colorScheme: THEME, typography: {} },
    connectivity: { isOnline: false },
    permissions: []
  };
  window.Otzaria = {
    call: function (method) {
      if (method === 'app.getInfo') return Promise.resolve({ success: true, data: BOOT.app, error: null });
      if (method === 'app.getTheme') return Promise.resolve({ success: true, data: BOOT.theme, error: null });
      return Promise.resolve({ success: false, data: null, error: { message: 'not supported', code: 'error.not_supported' } });
    },
    on: function () {}, off: function () {}
  };
  /* האירוע נורה **מאוחר**, ולא מיד, ובכוונה: אוצריא מזריקה את הגשר ואז משגרת
     אותו, כלומר אחרי שמסך הטעינה כבר צויר. שיגור מיידי כאן הסתיר באג אמיתי —
     מסך הטעינה קרא את ערכת הנושא פעם אחת, פספס את האירוע, ונשאר על צבע
     ברירת המחדל של התוסף בתוך ממשק בצבע אחר לגמרי. */
  setTimeout(function () {
    window.dispatchEvent(new CustomEvent('plugin.boot', { detail: BOOT }));
  }, BOOT_DELAY_MS);

  // קונסולה ושגיאות: כשהשער נכשל, זה בדרך כלל מה שמסביר למה. SuperDoc
  // „נכשל פתוח" בכמה מסלולים — הוא מדפיס ונופל ל-stub במקום לזרוק — ובלי
  // הלכידה הזאת הכשל נראה כמו הבטחה שפשוט לא נפתרה.
  marks.console = [];
  ['error', 'warn'].forEach(function (level) {
    var original = console[level];
    console[level] = function () {
      try {
        marks.console.push(level + ': ' + Array.prototype.map.call(arguments, String).join(' '));
      } catch (ignored) { /* לכידה לא תפיל את הדף */ }
      return original.apply(console, arguments);
    };
  });
  window.addEventListener('error', function (event) {
    marks.console.push('uncaught: ' + (event.message || String(event.error)));
  });
  window.addEventListener('unhandledrejection', function (event) {
    marks.console.push('rejected: ' + String(event.reason && (event.reason.message || event.reason)));
  });

  new PerformanceObserver(function (list) {
    list.getEntries().forEach(function (entry) { mark('paint:' + entry.name); });
  }).observe({ type: 'paint', buffered: true });

  /* רצף הטקסטים שמסך הטעינה באמת הציג.

     זה מה שתופס תחנה שמדווחת אך נבלעת: מסך הטעינה מתעלם מיעד נמוך מהנוכחי,
     ולכן תחנה שממוספרת נמוך אך מדווחת מאוחר פשוט אינה מגיעה למסך — ושום
     בדיקה סטטית על סדר המספרים אינה רואה את זה. נמדד: „מרכיב את הממשק…”
     דווח מ-onload של app.js, אחרי ש-main.ts כבר קידם ל-68, ולא הוצג מעולם. */
  marks.stages = [];
  (function watchStage() {
    var stage = document.getElementById('otzaria-splash-stage');
    if (!stage) { requestAnimationFrame(watchStage); return; }
    function note() {
      var text = (stage.textContent || '').trim();
      var last = marks.stages[marks.stages.length - 1];
      if (!last || last[1] !== text) marks.stages.push([Math.round(performance.now()), text]);
    }
    note();
    new MutationObserver(note).observe(stage, { childList: true, characterData: true, subtree: true });
  })();

  // סקריפט שמוזרק ב-JS יורה load אחרי שהוא **הורץ**, לא רק ירד — וזה מה
  // שמעניין כאן. ה-observer תופס אותו בזמן ההוספה ל-DOM.
  new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) {
      var added = records[i].addedNodes;
      for (var j = 0; j < added.length; j++) {
        var node = added[j];
        if (node.nodeType !== 1 || node.tagName !== 'SCRIPT' || !node.src) continue;
        (function (element) {
          var name = element.src.split('/').pop();
          element.addEventListener('load', function () { mark('ran:' + name); });
        })(node);
      }
    }
    if (document.getElementById('otzaria-splash')) mark('splashInDom');
    if (document.querySelector('.word-app-shell')) mark('shellMounted');
    if (document.querySelector('.super-editor, .superdoc, [class*="page-container"]')) {
      mark('documentRendered');
    }
    if (!document.getElementById('otzaria-splash') && marks.splashInDom !== undefined) {
      mark('splashRemoved');
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
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
let marks = {};

try {
  const { cdp, close } = await openPage(`file:///${PROBE.split('\\').join('/')}`, {
    label: 'startup',
  });
  try {
    for (let waited = 0; waited < OBSERVE_MS; waited += 500) {
      await sleep(500);
      const done = await cdp.evaluate(
        'JSON.stringify({ ready: !!window.__startup, done: !!(window.__startup && window.__startup.splashRemoved) })',
      );
      const state = JSON.parse(done);
      if (state.done) break;
    }
    marks = JSON.parse(await cdp.evaluate('JSON.stringify(window.__startup || {})'));
    marks.boot = await cdp.evaluate('document.documentElement.dataset.boot || null');
    marks.diagnostic = JSON.parse(
      await cdp.evaluate(
        'JSON.stringify({' +
          ' splashPresent: !!document.getElementById("otzaria-splash"),' +
          ' splashStage: (document.getElementById("otzaria-splash-stage") || {}).textContent || null,' +
          ' shell: !!document.querySelector(".word-app-shell"),' +
          ' status: (document.querySelector(".word-statusbar") || {}).textContent || null,' +
          ' editorChildren: (document.querySelector(".editor-stack") || { children: [] }).children.length,' +
          ' splashAccent: getComputedStyle(document.documentElement).getPropertyValue("--splash-accent").trim()' +
        '})',
      ),
    );
  } finally {
    close();
  }
} finally {
  rmSync(PROBE, { force: true });
}

const base = marks.docStart ?? 0;
const at = (name) => (marks[name] === undefined ? undefined : marks[name] - base);

const paint = at('paint:first-contentful-paint') ?? at('paint:first-paint');
const appRan = at('ran:app.js');
const workersRan = at('ran:engine-workers.js');

console.log('ציר הזמן של העלייה (ms מתחילת המסמך):');
for (const [label, value] of [
  ['מסך הטעינה ב-DOM', at('splashInDom')],
  ['צביעה ראשונה', paint],
  ['app.js סיים לרוץ', appRan],
  ['קליפת הממשק', at('shellMounted')],
  ['engine-workers.js סיים לרוץ', workersRan],
  ['המסמך על המסך', at('documentRendered')],
  ['מסך הטעינה הוסר', at('splashRemoved')],
]) {
  console.log(`  ${label.padEnd(30)} ${value === undefined ? '—' : `${value}ms`}`);
}
console.log(`  ${'תוצאת אתחול'.padEnd(30)} ${marks.boot ?? '—'}`);
console.log('  מצב בסיום:', JSON.stringify(marks.diagnostic));

const stages = Array.isArray(marks.stages) ? marks.stages : [];
console.log('');
console.log('מה שמסך הטעינה הציג בפועל:');
for (const [when, text] of stages) console.log(`  ${String(when - base).padStart(6)}ms  ${text}`);
if (marks.console && marks.console.length) {
  console.log(''); console.log('מה שהדף אמר:');
  for (const line of marks.console.slice(0, 25)) console.log(`  ${line}`);
}

if (at('splashInDom') === undefined) {
  errors.push('מסך הטעינה לא הופיע ב-DOM כלל');
}
if (paint === undefined) {
  errors.push('לא נמדדה צביעה ראשונה');
}
if (appRan === undefined) {
  errors.push('assets/app.js לא הורץ — התוסף לא נטען');
}

/**
 * כל תחנה שהטוען מצהיר עליה חייבת להופיע על המסך.
 *
 * מסך הטעינה בולע יעד נמוך מהנוכחי — גם את הטקסט — ולכן תחנה שממוספרת נמוך
 * אך מדווחת מאוחר נעלמת **בשקט**. הבדיקה הסטטית ב-tests/unit/splash.test.ts
 * מודדת את סדר המספרים בלבד ואינה יכולה לראות את זה; רק הרצה אמיתית יכולה.
 *
 * הטקסטים נקראים מה-HTML הארוז ולא נכתבים כאן, כדי שתחנה חדשה תיכנס לשער
 * מעצמה ולא תדרוש עדכון בשני מקומות.
 */
const shown = new Set(stages.map(([, text]) => text));
const declared = Array.from(readFileSync(INDEX, 'utf8').matchAll(/\btext:\s*'([^']+)'/g), (m) => m[1]);
if (declared.length === 0) {
  errors.push('לא נמצאו תחנות בטוען שב-dist/index.html — ייתכן שצורתו השתנתה');
}
for (const text of declared) {
  if (!shown.has(text)) errors.push(`התחנה „${text}” דווחה אך לא הוצגה — נבלעה על ידי תחנה גבוהה יותר`);
}

// הסף שקובע: הצביעה קודמת לסיום ההרצה של הבאנדל.
if (paint !== undefined && appRan !== undefined && paint >= appRan) {
  errors.push(
    `הצביעה הראשונה (${paint}ms) אינה קודמת לסיום ההרצה של app.js (${appRan}ms) — ` +
      'הבאנדל חזר לחסום את ציור מסך הטעינה',
  );
}
if (paint !== undefined && paint > FIRST_PAINT_CEILING_MS) {
  errors.push(`הצביעה הראשונה ב-${paint}ms, מעל התקרה של ${FIRST_PAINT_CEILING_MS}ms`);
}

if (workersRan === undefined) {
  errors.push('assets/engine-workers.js לא הורץ — המנוע יקום בלי workers');
} else {
  if (appRan !== undefined && workersRan > appRan) {
    errors.push('engine-workers.js רץ אחרי app.js — המנוע קם בלי ה-workers');
  }
  if (paint !== undefined && workersRan < paint) {
    errors.push('engine-workers.js רץ לפני הצביעה הראשונה — הוא חזר לחסום את המסך');
  }
}

if (at('documentRendered') === undefined) {
  errors.push('לא נפתח מסמך — המנוע לא הגיע למסך');
}
if (at('splashRemoved') === undefined) {
  errors.push('מסך הטעינה לא הוסר — הוא נשאר פרוש מעל הממשק');
}
if (marks.boot !== 'event' && marks.boot !== 'recovered') {
  errors.push(`תוצאת האתחול היא "${marks.boot}" — plugin.boot לא נתפס`);
}

/**
 * מסך הטעינה חייב לאמץ את צבעי אוצריא גם כשהאירוע מגיע **אחרי** שהוא כבר
 * צויר — וזה המקרה הרגיל, לא הקצה. הבאג שהיה כאן: קריאה חד-פעמית מה-latch,
 * שמכסה רק שיגור מוקדם, והשאירה פס התקדמות בצבע ברירת המחדל של התוסף בתוך
 * ממשק בצבע של אוצריא. הצבע שנבדק הוא זה שה-Host-דמה שלח, ולא ברירת מחדל
 * כלשהי, ולכן התאמה כאן פירושה שהאימוץ באמת קרה.
 */
const adopted = marks.diagnostic?.splashAccent;
if (adopted !== undefined && adopted.toLowerCase() !== '#7a5a12') {
  errors.push(
    `מסך הטעינה לא אימץ את צבע הנושא של אוצריא (--splash-accent הוא "${adopted}") — ` +
      'ככל הנראה ערכת הנושא נקראת פעם אחת ולא מאזינים ל-plugin.boot',
  );
}

if (errors.length) {
  console.error('\nשער העלייה נכשל:');
  for (const error of errors) console.error(`  שגיאה: ${error}`);
  process.exit(1);
}

console.log('\nשער העלייה עבר: מסך הטעינה מצויר לפני הבאנדל, והמנוע נטען אחריו.');
