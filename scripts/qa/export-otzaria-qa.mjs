/**
 * שער: „ייצוא לאוצריא” — המסמך נשמר כספר בפורמט הספרייה.
 *
 * שלושה דברים שבדיקת יחידה אינה יכולה למדוד, וכולם נמדדים כאן על ה-dist
 * הארוז מ-file://:
 *
 *   1. **מה נכתב בפועל.** הבנייה נבדקת ביחידה (tests/unit/otzaria-book.test.ts),
 *      אבל מה שנשלח ב-PUT עובר דרך `Blob` ומסלול השמירה הבינארי — וזה מה
 *      שנקלט לספרייה. השער קורא את גוף ההעלאה ומאמת אותו מול החוזה של
 *      אוצריא: שורה ראשונה `<h1>`, ובלי `\n` בתוך פסקה.
 *   2. **שורת המצב אינה ממתינה לרענון הספרייה.** `library.refreshUserBooks`
 *      סורק את כל התיקיות האישיות (‏timeout של 15 דקות באוצריא), והמתנה לו
 *      לפני ההודעה השאירה את המשתמש בלי אישור על קובץ שכבר נכתב. הדמה כאן
 *      **תולה** את הרענון בכוונה, והשער דורש „נשמר” בזמן שהוא תלוי.
 *   3. **התוצאה מגיעה כשהיא חוזרת.** משחררים את הרענון עם `addedBooks: 1`,
 *      והשורה חייבת להתחלף ל„נקלט”.
 *
 *   node scripts/qa/export-otzaria-qa.mjs
 */
import { openApp, createReport } from './harness.mjs';

const report = createReport('ייצוא לאוצריא', { strict: true });

/**
 * הדמה עונה על מסלול השמירה, לוכדת את גוף ה-PUT, ומחזיקה את הרענון תלוי עד
 * ש-`__qaBook.releaseRefresh()` נקראת. בלי המסלול הזה הייצוא היה נכשל בדמה
 * ולא במוצר — בדיוק הכשל השקרי שאין טעם למדוד.
 */
const INSTRUMENT = `
<script>
(function () {
  var seen = (window.__qaBook = { body: null, commits: [], refreshCalls: 0 });
  var release = null;
  seen.releaseRefresh = function (data) {
    if (release) { release(data || { addedBooks: 1, updatedBooks: 0, errors: [] }); release = null; return true; }
    return false;
  };

  function install() {
    if (!window.__qaHost) return setTimeout(install, 20);
    var H = window.__qaHost;
    H.replies['fs.beginBinaryWrite'] = function () {
      return Promise.resolve({ success: true, data: { writeToken: 'w1', uploadUrl: 'https://qa.local/upload/w1' }, error: null });
    };
    H.replies['fs.commitUserFileWrite'] = function (payload) {
      seen.commits.push(payload);
      return Promise.resolve({ success: true, data: { cancelled: false, token: 'book-1', name: (payload && payload.suggestedName) || 'x', size: 1024 }, error: null });
    };
    H.replies['fs.abortBinaryWrite'] = function () { return Promise.resolve({ success: true, data: {}, error: null }); };
    // תלוי בכוונה: כך נמדד שההודעה אינה ממתינה לסריקה.
    H.replies['library.refreshUserBooks'] = function () {
      seen.refreshCalls++;
      return new Promise(function (resolve) {
        release = function (data) { resolve({ success: true, data: data, error: null }); };
      });
    };
  }
  install();

  var fetch0 = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf('https://qa.local/upload/') === 0) {
      var body = init && init.body;
      return Promise.resolve(body && body.text ? body.text() : '').then(function (text) {
        seen.body = text;
        return new Response('', { status: 200 });
      });
    }
    return fetch0.apply(this, arguments);
  };
})();
</script>
`;

const app = await openApp({
  name: 'exportotzaria',
  port: Number(process.env.QA_PORT ?? 9531),
  extra: INSTRUMENT,
});

const book = (expr) => app.js(`(function(){ var B = window.__qaBook; return ${expr}; })()`);

try {
  await app.cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false,
  });
  await app.sleep(400);
  await app.caret(0);
  await app.type('shalom');
  await app.sleep(900);

  await app.tab('✦ אוצריא');
  const state = await app.state('ייצוא לאוצריא');
  console.log('מצב הפקד:', JSON.stringify(state));
  state.found && !state.disabled
    ? report.pass('הפקד קיים ופעיל', JSON.stringify(state.rect))
    : report.fail('הפקד', JSON.stringify(state));

  await app.click('ייצוא לאוצריא');
  await app.sleep(1500);

  /* ---------- מה נכתב ---------- */
  const body = await book('B.body');
  console.log('גוף ה-PUT:', JSON.stringify(body));
  const lines = typeof body === 'string' ? body.split('\n') : [];
  /^<h1>.+<\/h1>$/.test(lines[0] ?? '')
    ? report.pass('השורה הראשונה היא כותרת הספר', lines[0])
    : report.fail('כותרת הספר', JSON.stringify(lines[0] ?? null));

  lines.length > 0 && lines.every((line) => line.trim() !== '')
    ? report.pass('אין שורה ריקה — כל שורה היא כתובת', `${lines.length} שורות`)
    : report.fail('שורות', JSON.stringify(lines));

  const commit = (await book('B.commits[0]')) ?? {};
  console.log('ה-commit:', JSON.stringify(commit));
  commit.extension === 'txt' && String(commit.suggestedName ?? '').endsWith('.txt')
    ? report.pass('נשמר כ-txt, כפי שהספרייה קוראת', JSON.stringify(commit.suggestedName))
    : report.fail('סיומת', JSON.stringify(commit));

  /* ---------- ההודעה אינה ממתינה לרענון ---------- */
  const pending = await app.status();
  const refreshCalls = await book('B.refreshCalls');
  console.log('שורת מצב בזמן שהרענון תלוי:', JSON.stringify(pending), '| קריאות רענון:', refreshCalls);
  refreshCalls === 1 && pending && !pending.error && String(pending.text).includes('נשמר')
    ? report.pass('„נשמר” מוצג בזמן שהרענון עוד רץ', pending.text)
    : report.fail('הודעה בזמן רענון', `${JSON.stringify(pending)} calls=${refreshCalls}`);

  /* ---------- והתוצאה כשהיא חוזרת ---------- */
  const released = await book('B.releaseRefresh()');
  await app.sleep(600);
  const settled = await app.status();
  console.log('שורת מצב אחרי שהרענון חזר:', JSON.stringify(settled));
  released && settled && !settled.error && String(settled.text).includes('נקלט')
    ? report.pass('הקליטה בספרייה מדווחת כשהרענון חוזר', settled.text)
    : report.fail('הודעה אחרי רענון', JSON.stringify(settled));

  console.log('לוג הדף:', JSON.stringify(await app.log()));
} finally {
  app.close();
}

process.exit(report.print() > 0 ? 1 : 0);
