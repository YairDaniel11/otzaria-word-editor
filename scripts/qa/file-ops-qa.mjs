/**
 * קבוצת „קובץ” ופס הכותרת — מה שנשאר בלי מדידה.
 *
 * השער הקודם (`file-shell-qa.mjs`) נחסם: הוא בדק את הפקדים ברצף אחד, ותקיעה
 * באמצע הרצף השאירה את שמור / שמור בשם / פתח / ייצוא / הדפסה / יציאה בלי
 * מדידה בכלל. (התקיעה עצמה בודדה בנפרד ב-`file-freeze-qa.mjs`: היא תלויה
 * ב-Escape שסוגר דיאלוג בפעם השנייה, ואינה קשורה לפקדים כאן.)
 *
 * לכן כאן כל פקד יושב **בשלב משלו**, כל שלב עטוף בשעון, ואף שלב אינו נשען על
 * מצב שהשאיר קודמו. שלב שנתקע נופל לבדו ואינו מוחק את מה שנמדד אחריו.
 *
 * הדמה עונה על `fs.*`: בלי זה „שמור” נכשל בדמה ולא במוצר, וזה בדיוק סוג
 * הכשל השקרי שהשער הזה נועד לא לייצר.
 *
 *   node scripts/qa/file-ops-qa.mjs           # הכול
 *   node scripts/qa/file-ops-qa.mjs undo save # שלבים נבחרים
 */
import { openApp, createReport, sleep } from './harness.mjs';

const PORT = Number(process.env.QA_PORT ?? 9373);
const report = createReport('קבוצת „קובץ” ופס הכותרת', { strict: true });

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`פג הזמן: ${label}`)), ms);
    }),
  ]);
}

/**
 * מלמדת את הדמה לענות על מסלול השמירה, ומנטרלת את `window.print` ואת ההורדה.
 * ב-headless `print()` פותח דיאלוג חוסם, ו-`<a download>` כותב לדיסק — שניהם
 * היו הופכים את השער למי שנתקע, במקום למי שמודד.
 */
const INSTRUMENT = `
<script>
(function () {
  var wait = function () { return new Promise(function (r) { setTimeout(r, 30); }); };
  var seen = (window.__qaFile = { uploads: 0, printed: 0, commits: [] });

  function install() {
    if (!window.__qaHost) return setTimeout(install, 20);
    var H = window.__qaHost;
    H.replies['fs.beginBinaryWrite'] = function () {
      return Promise.resolve({ success: true, data: { writeToken: 'w1', uploadUrl: 'https://qa.local/upload/w1' }, error: null });
    };
    H.replies['fs.commitUserFileWrite'] = function (payload) {
      seen.commits.push(payload);
      // token ולא targetToken: זה השדה ש-files.ts דורש, וטעות כאן נמדדת
      // כשמירה שנכשלה במוצר.
      return Promise.resolve({ success: true, data: { cancelled: false, token: 'file-1', name: (payload && payload.suggestedName) || 'x', size: 1024 }, error: null });
    };
    H.replies['fs.abortBinaryWrite'] = function () { return Promise.resolve({ success: true, data: {}, error: null }); };
    H.replies['fs.pickUserFile'] = function () {
      // ביטול הוא מעטפת מוצלחת עם cancelled: true, ולא שגיאה. המאחז האמיתי
      // עונה כך, ומעטפת שגיאה כאן הייתה נמדדת ככשל של הכפתור.
      return Promise.resolve({ success: true, data: { cancelled: true }, error: null });
    };
  }
  install();

  // ההעלאה עצמה היא PUT ל-uploadUrl. בלי היירוט היא יוצאת לרשת ונכשלת.
  var fetch0 = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf('https://qa.local/upload/') === 0) {
      seen.uploads++;
      return wait().then(function () { return new Response('', { status: 200 }); });
    }
    return fetch0.apply(this, arguments);
  };

  window.print = function () { seen.printed++; };
})();
</script>
`;

/** מופע חדש לכל שלב: שלב אינו יורש מצב — ולא תקיעה — משלב אחר. */
async function stage(name, body, { budgetMs = 180_000 } = {}) {
  const wanted = process.argv.slice(2);
  if (wanted.length && !wanted.includes(name)) return;

  console.log(`\n────── ${name} ──────`);
  let app = null;
  try {
    app = await openApp({ name: `fileops-${name}`, port: PORT, extra: INSTRUMENT });
    await app.cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false,
    });
    await sleep(400);
    await withTimeout(body(app), budgetMs, name);
  } catch (error) {
    console.log(`  ✗ ${error.message}`);
    report.fail(`${name} — השלב נכשל`, error.message);
  } finally {
    if (app) app.close();
  }
}

const file = (app) => app.js('JSON.stringify(window.__qaFile)').then(JSON.parse);
const paraCount = (files) => (files['word/document.xml'].match(/<w:p[ >]/g) || []).length;

/* ------------------------------------------------------------------ */

await stage('undo', async (app) => {
  await app.caret(0);
  await app.type('undotest');
  await sleep(1_200);

  let files = await app.docx();
  const before = files['word/document.xml'].includes('undotest');
  console.log(`  הטקסט נכנס? ${before}`);
  if (!before) return report.fail('בטל — לא היה מה לבטל', 'ההקלדה לא נכנסה למסמך');

  const undoState = await app.cmd('undo');
  console.log(`  מצב undo: ${JSON.stringify(undoState)}`);
  const clicked = await app.click('בטל', { after: 1_500 });
  console.log(`  נלחץ? ${clicked}`);

  // ההחזרה אינה מיידית: המנוע מיישב את המסמך אחרי הביטול.
  let gone = false;
  for (let i = 0; i < 12; i++) {
    files = await app.docx();
    gone = !files['word/document.xml'].includes('undotest');
    if (gone) break;
    await sleep(1_000);
  }
  console.log(`  הטקסט הוסר? ${gone} (אחרי המתנה)`);
  gone ? report.pass('בטל') : report.fail('בטל', 'הטקסט נשאר ב-document.xml גם אחרי 12 שניות');

  if (!gone) return;

  const redoState = await app.cmd('redo');
  console.log(`  מצב redo: ${JSON.stringify(redoState)}`);
  await app.click('חזור', { after: 1_500 });
  let back = false;
  for (let i = 0; i < 12; i++) {
    files = await app.docx();
    back = files['word/document.xml'].includes('undotest');
    if (back) break;
    await sleep(1_000);
  }
  console.log(`  הטקסט חזר? ${back}`);
  back ? report.pass('חזור') : report.fail('חזור', 'הטקסט לא חזר ל-document.xml');
});

await stage('save', async (app) => {
  await app.caret(0);
  await app.type('savetest');
  await sleep(1_000);
  await app.reset();

  await app.tab('קובץ');
  const clicked = await app.click('שמור', { after: 2_000 });
  console.log(`  נלחץ? ${clicked}`);

  let seen = null;
  for (let i = 0; i < 20; i++) {
    seen = await file(app);
    if (seen.commits.length) break;
    await sleep(1_000);
  }
  const calls = (await app.hostCalls()).map((c) => c.method);
  console.log(`  קריאות למאחז: ${JSON.stringify(calls)}`);
  console.log(`  העלאות: ${seen.uploads} | commits: ${JSON.stringify(seen.commits)}`);
  console.log(`  שורת מצב: ${JSON.stringify(await app.status())}`);

  const ok = calls.includes('fs.beginBinaryWrite') && calls.includes('fs.commitUserFileWrite');
  ok
    ? report.pass('שמור', `העלאה ${seen.uploads}, commit עם השם „${seen.commits[0]?.suggestedName}”`)
    : report.fail('שמור', `מסלול השמירה לא הושלם: ${JSON.stringify(calls)}`);
});

await stage('save-as', async (app) => {
  await app.caret(0);
  await app.type('saveastest');
  await sleep(1_000);
  await app.reset();

  await app.tab('קובץ');
  await app.click('שמור בשם', { after: 2_000 });
  let seen = null;
  for (let i = 0; i < 20; i++) {
    seen = await file(app);
    if (seen.commits.length) break;
    await sleep(1_000);
  }
  const calls = (await app.hostCalls()).map((c) => c.method);
  console.log(`  קריאות: ${JSON.stringify(calls)} | commits: ${JSON.stringify(seen.commits)}`);
  console.log(`  שורת מצב: ${JSON.stringify(await app.status())}`);
  calls.includes('fs.commitUserFileWrite')
    ? report.pass('שמור בשם', `commit עם „${seen.commits[0]?.suggestedName}”`)
    : report.fail('שמור בשם', JSON.stringify(calls));
});

await stage('print', async (app) => {
  await app.caret(0);
  await app.sleep(500);
  await app.reset();

  await app.tab('קובץ');
  await app.click('הדפסה', { after: 4_000 });
  const seen = await file(app);
  const status = await app.status();
  const style = await app.js(
    '(function(){var s=document.getElementById("otzaria-print-page");return s?s.textContent.slice(0,120):null;})()',
  );
  console.log(`  window.print נקרא: ${seen.printed} | שורת מצב: ${JSON.stringify(status)}`);
  console.log(`  כלל @page: ${JSON.stringify(style)}`);
  seen.printed > 0
    ? report.pass('הדפסה', `window.print נקרא, ${status.error ? 'עם שגיאה: ' + status.text : 'בלי שגיאה'}`)
    : report.fail('הדפסה', `window.print לא נקרא. שורת מצב: ${status.text}`);
});

await stage('exit', async (app) => {
  await app.caret(0);
  await app.type('exittest');
  await sleep(1_000);
  await app.reset();
  // „לא לשמור”, כדי שהיציאה לא תיבלע במסלול השמירה.
  await app.js('window.__qaHost.confirmAnswer = false');

  await app.tab('קובץ');
  await app.click('יציאה', { after: 3_000 });
  const calls = (await app.hostCalls()).map((c) => c.method);
  const messages = await app.messages();
  const status = await app.status();
  console.log(`  קריאות: ${JSON.stringify(calls)}`);
  console.log(`  הודעות: ${JSON.stringify(messages)}`);
  console.log(`  שורת מצב: ${JSON.stringify(status)}`);
  const alive = await app.js('1+1');
  console.log(`  הדף חי אחרי היציאה? ${alive === 2}`);

  if (calls.includes('ui.showConfirm')) {
    report.pass('יציאה — שואל לפני שיוצא', `שאל, וענינו „לא”. שורת מצב: ${status.text ?? '—'}`);
  } else {
    report.partial('יציאה', `לא נשאלה שאלה על מסמך לא-שמור. קריאות: ${JSON.stringify(calls)}`);
  }
});

await stage('open', async (app) => {
  await app.reset();
  await app.tab('קובץ');
  await app.click('פתח קובץ', { after: 2_500 });
  const calls = (await app.hostCalls()).map((c) => c.method);
  const status = await app.status();
  console.log(`  קריאות: ${JSON.stringify(calls)} | שורת מצב: ${JSON.stringify(status)}`);
  // הדמה עונה „בוטל”, ולכן הציפייה היא שהבורר נקרא ושהביטול אינו שגיאה.
  if (!calls.includes('fs.pickUserFile')) {
    report.fail('פתח קובץ', `בורר הקובץ לא נקרא: ${JSON.stringify(calls)}`);
  } else if (status.error) {
    report.partial('פתח קובץ', `ביטול הבורר הוצג כשגיאה: „${status.text}”`);
  } else {
    report.pass('פתח קובץ', 'הבורר נקרא, וביטול אינו שגיאה');
  }
});

await stage('autosave', async (app) => {
  await app.reset();
  const before = await app.state('שמירה אוטומטית לדיסק', { selector: 'button' });
  console.log(`  לפני: ${JSON.stringify(before)}`);
  const clicked = await app.click('שמירה אוטומטית לדיסק', { after: 1_200 });
  const after = await app.state('שמירה אוטומטית לדיסק', { selector: 'button' });
  console.log(`  נלחץ? ${clicked} | אחרי: ${JSON.stringify(after)}`);
  const calls = (await app.hostCalls()).map((c) => c.method);
  console.log(`  קריאות: ${JSON.stringify(calls)}`);

  if (!clicked || !before.found) return report.fail('מתג שמירה אוטומטית', 'הפקד לא נמצא');
  before.active !== after.active
    ? report.pass('מתג שמירה אוטומטית', `${before.active} → ${after.active}, נשמר בהגדרות: ${calls.includes('storage.set')}`)
    : report.fail('מתג שמירה אוטומטית', `המצב לא השתנה (${before.active})`);
});

process.exit(report.print() > 0 ? 1 : 0);
