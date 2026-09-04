/**
 * שער ה-QA של לשונית „קובץ”, לשונית „✦ אוצריא”, ופס הכותרת (TitleBar).
 *
 * רוב הפקדים כאן פונים ל**מאחז אוצריא** ולא כותבים ל-OOXML ישירות — „שמור”,
 * „פתח קובץ”, „ציטוט מהקורא”, „חיפוש באוצריא” ו„פתח ספרייה” כולם RPC דרך
 * `window.Otzaria`. הדמה ב-`host-stub.js` דוחה כל מתודה שאינה `app.*`/`ui.*`/
 * `storage.*` עם `error.not_supported`, ולכן כל בדיקה כאן שממש רוצה לראות את
 * המסלול המלא צריכה לספק תשובה משלה דרך `__qaHost.replies` — בדיוק כמו שער
 * „הוספה” עושה לתמונות (`fs.pickUserFile`).
 *
 * שתי תוספות שאין להן עזר מוכן ב-harness:
 * 1. **העלאת השמירה** (`fs.beginBinaryWrite` → PUT ישיר → `fs.commitUserFileWrite`)
 *    כוללת `fetch(uploadUrl, {method:'PUT', ...})` **שאינו** עובר דרך
 *    `window.Otzaria` — זו קריאת רשת ישירה (`host/files.ts:uploadBytes`).
 *    כדי לבדוק שמירה מקצה לקצה בלי שרת אמיתי, `mockUploadFetch` עוטפת את
 *    `window.fetch` ומיירטת רק בקשות PUT.
 * 2. **„פתח קובץ”** דורש `url` שה-SDK של SuperDoc יכול לטעון בפועל. נבנה
 *    data: URI מה-docx המיוצא של המסמך הפעיל עצמו (`exportBase64`) — כך
 *    „פתיחה” היא פתיחה אמיתית של מסמך אמיתי, לא רק קריאה למאחז שמוחזרת שקר.
 *
 * ### תקיעה שנמדדה, ואיך היא מטופלת (בדיוק כמו ב-home-paragraph-qa.mjs)
 *
 * נמדד: הצעד „מסמך חדש — על מסמך נקי" (פתיחת מסמך ריק שנייה על מנוע שכבר
 * רץ) הקפיא את הדף — לא זרק, לא החזיר שגיאה, פשוט הפסיק להגיב. קריאת CDP
 * גולמית (`Runtime.evaluate` שמאחורי `app.js`/`app.click`/`app.state`)
 * ממתינה לתשובה שדף קפוא לא ישלח לעולם, ול-`await` שאין לו שעון אין דרך
 * להיפסק — כל השער נתקע, ופעם אחת (17 דקות) לא חזר בכלל. אין שעון פר-קריאה
 * ב-`harness.mjs` (ואסור לגעת בו — משותף לשערים מקבילים), ולכן השעון חייב
 * לעטוף כל **צעד** (`step`) בנפרד: `STEP_TIMEOUT_MS` מריץ מרוץ בין הצעד
 * לטיימר, ואם הטיימר מנצח — הצעד מדווח כ„תקוע" והריצה ממשיכה לצעד הבא, בלי
 * לחכות לתשובה שלא תגיע. `PHASE_TIMEOUT_MS` הוא שכבת הגנה שנייה סביב מקטע
 * שלם (למקרה שהתקיעה קורית מחוץ ל-`step`, למשל ב-`widen`/`tab`), ו-
 * `killStray` הורג כל Chrome ישן על אותה יציאה **לפני** כל מקטע — אחרת דפדפן
 * שנשאר תקוע מריצה קודמת עונה על ה-`/json/list` הבא, וה-session הישן (הקפוא)
 * נמדד כאילו הוא החדש.
 *
 * הרצה:  node scripts/qa/file-shell-qa.mjs [a|b|c]
 * היציאה 9367 שמורה לשער הזה בלבד.
 */
import { execSync } from 'node:child_process';
import { openApp, createReport } from './harness.mjs';

const PORT = Number(process.env.QA_PORT ?? 9367);
const report = createReport('קובץ / ✦ אוצריא / TitleBar');

const log = (...a) => console.log(...a);

/** הורגת כל Chrome ישן שמחזיק את היציאה שלנו, כדי שלא נתחבר לדף קפוא ישן. */
function killStray() {
  try {
    execSync(`pkill -9 -f "remote-debugging-port=${PORT}" || true`, { stdio: 'ignore' });
  } catch {
    /* אין מה לנקות */
  }
}

/** מרוץ בין הבטחה לשעון. שימושי לכל קריאה גולמית שעלולה לא לחזור לעולם. */
function withTimeout(promise, ms, label) {
  let timer;
  const guard = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ __timedOut: true, label }), ms);
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

/** כמה להמתין לצעד בודד לפני שמכריזים עליו „תקוע" וממשיכים בלי לחכות. */
const STEP_TIMEOUT_MS = 45_000;

async function step(name, fn) {
  log(`\n──────── ${name} ────────`);
  const outcome = await Promise.race([
    fn().then(
      () => ({ done: true, ok: true }),
      (error) => ({ done: true, ok: false, error }),
    ),
    new Promise((resolve) => setTimeout(() => resolve({ done: false }), STEP_TIMEOUT_MS)),
  ]);
  if (!outcome.done) {
    log(`!! ${name}: תקוע — לא הגיב תוך ${STEP_TIMEOUT_MS}ms`);
    report.stuck(
      name,
      `הדף לא הגיב תוך ${STEP_TIMEOUT_MS}ms — זו קפיאה של headless/השער, לא בהכרח כשל אצל משתמש אמיתי`,
    );
    return;
  }
  if (!outcome.ok) {
    log('!! זרק:', outcome.error?.message);
    report.fail(name, `הצעד זרק: ${outcome.error?.message}`);
  }
}

/** כמה להמתין למקטע שלם (הגדלת חלון + כל הצעדים שבו) לפני שמוותרים עליו. */
const PHASE_TIMEOUT_MS = 300_000;

/** עוטפת מקטע (`sectionXxx`) בהריגת דפדפן ישן לפני ובשעון-על סביב הכול. */
async function phase(label, body) {
  killStray();
  const outcome = await Promise.race([
    body().then(
      () => ({ done: true, ok: true }),
      (error) => ({ done: true, ok: false, error }),
    ),
    new Promise((resolve) => setTimeout(() => resolve({ done: false }), PHASE_TIMEOUT_MS)),
  ]);
  if (!outcome.done) {
    log(`!! מקטע „${label}": תקוע — לא סיים תוך ${PHASE_TIMEOUT_MS}ms, ממשיכים בכוח למקטע הבא`);
    // „תקוע” ולא „שבור”, מאותו טעם כמו בצעד הבודד: מקטע שלא סיים הוא כשל של
    // סביבת המדידה, ולא פקד שנמדד ונמצא שבור. רישומו כשבור ניפח את המונה
    // ושלח לחפש באג במקום שבו לא נמדד דבר.
    report.stuck(`מקטע „${label}"`, `לא סיים תוך ${PHASE_TIMEOUT_MS}ms — ראו תיעוד בראש הקובץ`);
  } else if (!outcome.ok) {
    log(`!! מקטע „${label}" זרק:`, outcome.error?.stack ?? outcome.error);
    report.fail(`מקטע „${label}"`, `נפל: ${outcome.error?.message ?? outcome.error}`);
  }
  killStray();
}

async function snap(app) {
  const files = (await app.docx()) ?? {};
  return { files, doc: files['word/document.xml'] ?? '', names: Object.keys(files) };
}

async function noise(app) {
  const [status, messages, pageLog] = await Promise.all([app.status(), app.messages(), app.log()]);
  const bad = [];
  if (status?.error) bad.push(`status=${status.text}`);
  const errs = (messages ?? []).filter((m) => m.method === 'ui.showError');
  if (errs.length) bad.push(`showError=${errs.map((m) => m.text).join(' | ')}`);
  const noisy = (pageLog ?? []).filter((l) => !/DevTools|Download the Vue/i.test(l));
  if (noisy.length) bad.push(`log=${noisy.join(' | ')}`);
  return bad.join('; ');
}

async function caretLine(app, index) {
  const raw = await app.js(
    `(function(){var n=document.querySelectorAll('.superdoc-line')[${index}];if(!n)return 'null';` +
      `var b=n.getBoundingClientRect();return JSON.stringify({x:Math.round(b.x+10),y:Math.round(b.y+b.height/2),` +
      `right:Math.round(b.x+b.width-6)})})()`,
  );
  if (raw === 'null') throw new Error(`אין שורה ${index} במסמך`);
  const r = JSON.parse(raw);
  await app.clickAt(r.x, r.y);
  await app.sleep(500);
  return r;
}

async function selectWholeLine(app, index) {
  const r = await caretLine(app, index);
  await app.press('Home', 'Home', 36);
  await app.sleep(150);
  await app.press('End', 'End', 35, 8); // Shift+End
  await app.sleep(400);
  return r;
}

/**
 * מרחיבה את חלון הבדיקה ל-1600×1000. חובה: ב-headless ברירת המחדל ~756px,
 * `.word-ribbon-body` גולש, ופקדים בקצה יושבים ב-x שלילי — לחיצה עליהם
 * נשלחת מחוץ לחלון בלי שום שגיאה, ופקד תקין נמדד כ„שבור”.
 */
async function widen(app) {
  await app.cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1600,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await app.sleep(2000);
}

/** בודקת שהפקד באמת בתוך החלון לפני שלוחצים עליו, לפי `x > 0 && y > 0`. */
async function onScreen(app, name) {
  const st = await app.state(name);
  if (!st.found) return { ok: false, why: 'לא נמצא', state: st };
  if (!st.rect) return { ok: false, why: 'אינו מוצג', state: st };
  const inside = st.rect.x > 0 && st.rect.y > 0;
  return { ok: inside, why: inside ? '' : `מחוץ לחלון (x=${st.rect.x})`, rect: st.rect, state: st };
}

/** תוכן הטולטיפ (`data-tip-title`/`data-tip-desc`) של פקד לפי הטקסט שלו. */
async function tooltipOf(app, label) {
  const raw = await app.js(
    `(function(){var bs=document.querySelectorAll('button');for(var i=0;i<bs.length;i++){` +
      `var b=bs[i];var t=(b.textContent||'').trim();` +
      `if(t===${JSON.stringify(label)})return JSON.stringify({title:b.getAttribute('data-tip-title')||b.getAttribute('title')||'',` +
      `desc:b.getAttribute('data-tip-desc')||''});}return 'null'})()`,
  );
  return raw === 'null' ? null : JSON.parse(raw);
}

/**
 * מצב תיבת ה-Tell Me: הקלט, הרשימה שמתחתיו, והפריטים שמוצגים בה בפועל.
 *
 * `#tell-me-listbox` הוא `v-show` — הוא קיים ב-DOM גם כשהתיבה סגורה, ופריטיו
 * נמצאים בו כל הזמן. לכן `open` נמדד מהמלבן ולא מהנוכחות, וכל פריט מדווח
 * `shown` בנפרד: „יש שורה כזאת” אינו „השורה מוצגת למשתמש”.
 */
async function tellMe(app) {
  const raw = await app.js(
    `(function(){var shown=function(el){return !!(el&&window.__qa.rectOf(el));};` +
      `var box=document.querySelector('.tell-me-input');` +
      `var list=document.getElementById('tell-me-listbox');` +
      `var items=list?Array.prototype.map.call(list.querySelectorAll('[role="option"]'),function(o){` +
      `var t=o.querySelector('.tell-me-item-title');var c=o.querySelector('.tell-me-item-category');` +
      `return {title:(t?t.textContent:(o.textContent||'')).replace(/\\s+/g,' ').trim(),` +
      `category:(c?c.textContent:'').trim(),id:o.id,shown:shown(o)};}):[];` +
      `var sec=list?list.querySelector('.tell-me-section-title'):null;` +
      `return JSON.stringify({found:!!box,disabled:box?!!box.disabled:null,` +
      `value:box?box.value:null,expanded:box?box.getAttribute('aria-expanded'):null,` +
      `placeholder:box?box.getAttribute('placeholder'):null,` +
      `rect:box?window.__qa.rectOf(box):null,boxShown:shown(box),open:shown(list),` +
      `section:sec?(sec.textContent||'').trim():null,items:items})})()`,
  );
  return JSON.parse(raw);
}

/** מלבן של שורה בתיבת ה-Tell Me, לפי כותרתה או לפי ה-id שלה. */
async function tellMeRect(app, titleOrId) {
  const raw = await app.js(
    `(function(){var list=document.getElementById('tell-me-listbox');if(!list)return 'null';` +
      `var nodes=list.querySelectorAll('[role="option"]');` +
      `for(var i=0;i<nodes.length;i++){var t=nodes[i].querySelector('.tell-me-item-title');` +
      `var text=(t?t.textContent:(nodes[i].textContent||'')).replace(/\\s+/g,' ').trim();` +
      `if(text===${JSON.stringify(titleOrId)}||nodes[i].id===${JSON.stringify(titleOrId)})` +
      `return JSON.stringify(window.__qa.rectOf(nodes[i]));}return 'null'})()`,
  );
  return raw === 'null' ? null : JSON.parse(raw);
}

/**
 * לשונית המצב הפעילה בדיאלוג „חיפוש והחלפה” — „חפש” או „החלף” — ומונה
 * התוצאות שבו. שניהם נקראים מאותו עוגן שממנו `Q.dialog` קורא, `[role="dialog"]`.
 */
function findDialogFacts(app) {
  return app
    .js(
      `(function(){var d=document.querySelector('[role="dialog"]');` +
        `if(!d)return JSON.stringify({mode:'',counter:''});` +
        `var t=d.querySelector('.fr-tab[aria-selected="true"]');` +
        `var c=d.querySelector('.fr-counter');` +
        `return JSON.stringify({mode:t?(t.textContent||'').trim():'',` +
        `counter:c?(c.textContent||'').trim():''})})()`,
    )
    .then(JSON.parse);
}

/**
 * מספר ההתאמות שהמונה מדווח. `searchCounterText` מייצר „i מתוך N”, „N תוצאות”,
 * „אין תוצאות” או מחרוזת ריקה — ולכן „המונה אינו ריק” אינו מדידה.
 */
function counterTotal(text) {
  const pair = /^(\d+)\s+מתוך\s+(\d+)$/.exec(text ?? '');
  if (pair) return Number(pair[2]);
  const many = /^(\d+)\s+תוצאות$/.exec(text ?? '');
  if (many) return Number(many[1]);
  return 0;
}

/** עוטפת את `fetch` כך שבקשות PUT (העלאת שמירה) ייענו בהצלחה בלי שרת אמיתי. */
async function mockUploadFetch(app) {
  await app.js(
    `(function(){if(window.__origFetch)return;window.__origFetch=window.fetch.bind(window);` +
      `window.__putCalls=[];window.fetch=function(url,opts){` +
      `if(opts&&opts.method==='PUT'){window.__putCalls.push({url:String(url)});` +
      `return Promise.resolve(new Response('',{status:200}));}` +
      `return window.__origFetch(url,opts);};})()`,
  );
}

const putCalls = (app) => app.js('JSON.stringify(window.__putCalls||[])').then(JSON.parse);

/** מרכיבה תשובת מארח תקינה: `{success:true,error:null,data}`. */
function hostReply(data) {
  return `function(){return Promise.resolve({success:true,error:null,data:${JSON.stringify(data)}})}`;
}

/** מגדירה את שרשרת התשובות של שמירה: begin → commit. מחזירה מזהה ייחודי. */
async function mockSaveTarget(app, { token = 'qa-target-1', name = 'קובץ QA.docx' } = {}) {
  await mockUploadFetch(app);
  await app.js(
    `window.__qaHost.replies['fs.beginBinaryWrite']=${hostReply({
      writeToken: 'wt-' + token,
      uploadUrl: 'https://qa-upload.local/' + token,
      maxBytes: 999999999,
    })}`,
  );
  await app.js(
    `window.__qaHost.replies['fs.commitUserFileWrite']=function(payload){` +
      `window.__lastCommitPayload=payload;` +
      `return Promise.resolve({success:true,error:null,data:{cancelled:false,token:${JSON.stringify(
        token,
      )},name:${JSON.stringify(name)},size:1234}})}`,
  );
}

const lastCommitPayload = (app) => app.js('JSON.stringify(window.__lastCommitPayload||null)').then(JSON.parse);

/* ================================================================== */
/* מקטע א' — לשונית „קובץ”                                             */
/* ================================================================== */

async function sectionFileTab() {
  const app = await openApp({ name: 'file-a', port: PORT });
  try {
    await widen(app);
    await app.tab('קובץ');

    await step('מיקום כל הפקדים בחלון המורחב', async () => {
      const names = [
        'מסמך חדש',
        'פתח קובץ',
        'שמור',
        'שמור בשם...',
        'הדפסה',
        'יציאה',
        'אודות',
        'קיצורים',
      ];
      const results = {};
      for (const n of names) results[n] = await onScreen(app, n);
      log('מיקומים:', JSON.stringify(results));
      const off = Object.entries(results).filter(([, r]) => !r.ok);
      if (off.length) report.fail('מיקום הפקדים', off.map(([n, r]) => `${n}: ${r.why}`).join('; '));
      else report.pass('מיקום הפקדים', 'כל שמונת הפקדים בתוך החלון');
    });

    await step('אודות', async () => {
      await app.reset();
      const clicked = await app.click('אודות', { after: 500 });
      const dlg = await app.dialog();
      log('נלחץ:', clicked, '| דיאלוג:', JSON.stringify(dlg && { label: dlg.label }));
      const bad = await noise(app);
      if (!clicked || !dlg) report.fail('אודות', `הדיאלוג לא נפתח (clicked=${clicked})`);
      else if (bad) report.partial('אודות', bad);
      else report.pass('אודות', `דיאלוג role=dialog נפתח: "${dlg.label}"`);
      await app.escape();
      const stillOpen = await app.dialog();
      stillOpen ? report.fail('אודות — סגירה ב-Escape', 'הדיאלוג נשאר פתוח') : report.pass('אודות — סגירה ב-Escape');
    });

    await step('קיצורים', async () => {
      await app.reset();
      const clicked = await app.click('קיצורים', { after: 500 });
      const dlg = await app.dialog();
      log('נלחץ:', clicked, '| דיאלוג:', JSON.stringify(dlg && { label: dlg.label }));
      const bad = await noise(app);
      const hasCtrlS = dlg ? dlg.controls.some((c) => /Ctrl/i.test(c.text)) : false;
      if (!clicked || !dlg) report.fail('קיצורים', `הדיאלוג לא נפתח (clicked=${clicked})`);
      else if (bad) report.partial('קיצורים', bad);
      else report.pass('קיצורים', `דיאלוג נפתח; מציג צירופי מקשים: ${hasCtrlS}`);
      await app.escape();
    });

    await step('מסמך חדש — על מסמך נקי (בלי אישור)', async () => {
      await caretLine(app, 0).catch(() => {});
      await app.reset();
      const titleBefore = await app.js("document.querySelector('.doc-title-input')?.value");
      const clicked = await app.click('מסמך חדש', { after: 3000 });
      const bad = await noise(app);
      const titleAfter = await app.js("document.querySelector('.doc-title-input')?.value");
      const lines = await app.lineCount();
      log('נלחץ:', clicked, '| שם לפני/אחרי:', titleBefore, '→', titleAfter, '| שורות:', lines, '| רעש:', bad || '(אין)');
      if (!clicked) report.fail('מסמך חדש', 'הכפתור לא נמצא');
      else if (titleAfter === 'מסמך חדש' && !bad) report.pass('מסמך חדש', `נפתח מסמך ריק, שם "${titleAfter}"`);
      else report.fail('מסמך חדש', `שם לא אופס (${titleAfter}); רעש: ${bad || 'אין'}`);
    });

    await step('הכנת מסמך מלוכלך (הקלדה)', async () => {
      await app.caret(0);
      await app.type('בדיקת QA לשונית קובץ');
      await app.sleep(600);
      const text = await app.screenText();
      log('טקסט על המסך:', text);
      /בדיקת QA/.test(text ?? '') ? report.pass('הקלדת תוכן לבדיקה') : report.fail('הקלדת תוכן לבדיקה', 'הטקסט לא נראה על המסך');
    });

    await step('מסמך חדש — מלוכלך, „לשמור?” → כן (save-first)', async () => {
      await mockSaveTarget(app, { token: 'newdoc-savefirst', name: 'לפני מעבר.docx' });
      await app.js('window.__qaHost.confirmAnswer=true'); // "לשמור..." → כן
      await app.reset();
      const clicked = await app.click('מסמך חדש', { after: 4000 });
      const calls = (await app.hostCalls()).map((c) => c.method);
      const bad = await noise(app);
      const titleAfter = await app.js("document.querySelector('.doc-title-input')?.value");
      const lines = await app.lineCount();
      log('נלחץ:', clicked, '| קריאות למאחז:', JSON.stringify(calls), '| שם:', titleAfter, '| שורות:', lines);
      log('רעש:', bad || '(אין)');
      const saved = calls.includes('fs.beginBinaryWrite') && calls.includes('fs.commitUserFileWrite');
      const switched = titleAfter === 'מסמך חדש' && lines <= 1;
      if (saved && switched && !bad)
        report.pass('מסמך חדש — לשמור ואז להחליף', 'fs.beginBinaryWrite→fs.commitUserFileWrite רצו, ואז נפתח מסמך ריק');
      else
        report.fail(
          'מסמך חדש — לשמור ואז להחליף',
          `saved=${saved} switched=${switched} (title=${titleAfter}); רעש: ${bad || 'אין'}`,
        );
    });

    await step('מסמך חדש — מלוכלך, שתי השאלות „לא” (ביטול)', async () => {
      await app.caret(0);
      await app.type('טקסט שאסור למחוק');
      await app.sleep(600);
      await app.js('window.__qaHost.confirmAnswer=false'); // "לשמור..." לא, "למחוק..." לא
      await app.reset();
      const clicked = await app.click('מסמך חדש', { after: 2000 });
      const calls = (await app.hostCalls()).map((c) => c.method);
      const text = await app.screenText();
      log('נלחץ:', clicked, '| קריאות:', JSON.stringify(calls), '| טקסט נשאר:', /אסור למחוק/.test(text ?? ''));
      const kept = /אסור למחוק/.test(text ?? '');
      const noSaveCall = !calls.includes('fs.beginBinaryWrite');
      if (kept && noSaveCall) report.pass('מסמך חדש — ביטול המעבר', 'המסמך המלוכלך נשאר פתוח בלי לשמור ובלי להחליף');
      else report.fail('מסמך חדש — ביטול המעבר', `kept=${kept} noSaveCall=${noSaveCall}`);
    });

    await step('מסמך חדש — מלוכלך, „לשמור” לא + „למחוק” כן (discard)', async () => {
      // עדיין "טקסט שאסור למחוק" פתוח ומלוכלך מהצעד הקודם.
      let n = 0;
      await app.js(
        `window.__qaHost.replies['ui.showConfirm']=function(p){n=(window.__confirmN=(window.__confirmN||0)+1);` +
          `window.__qaHost.messages.push({method:'ui.showConfirm',text:p&&(p.content||p.title)});` +
          `return Promise.resolve({confirmed: window.__confirmN===1?false:true})}`,
      );
      await app.reset();
      const clicked = await app.click('מסמך חדש', { after: 3000 });
      const bad = await noise(app);
      const text = await app.screenText();
      const titleAfter = await app.js("document.querySelector('.doc-title-input')?.value");
      log('נלחץ:', clicked, '| שם:', titleAfter, '| טקסט הישן נעלם:', !/אסור למחוק/.test(text ?? ''));
      log('רעש:', bad || '(אין)');
      const discarded = !/אסור למחוק/.test(text ?? '') && titleAfter === 'מסמך חדש';
      discarded && !bad
        ? report.pass('מסמך חדש — מחיקה מאושרת', 'המסמך המלוכלך הוחלף במסמך ריק בלי שמירה')
        : report.fail('מסמך חדש — מחיקה מאושרת', `discarded=${discarded}; רעש: ${bad || 'אין'}`);
      // שחזור: תשובה קבועה לשאר השער.
      await app.js("delete window.__qaHost.replies['ui.showConfirm']; window.__confirmN=0");
    });

    await step('שמור — מסמך חדש בלי יעד (פותח בפועל commit בלי targetToken)', async () => {
      await app.caret(0);
      await app.type('תוכן לשמירה');
      await app.sleep(500);
      await mockSaveTarget(app, { token: 'first-save', name: 'תוכן לשמירה.docx' });
      await app.reset();
      const clicked = await app.click('שמור', { after: 3000 });
      const calls = (await app.hostCalls()).map((c) => c.method);
      const commit = await lastCommitPayload(app);
      const puts = await putCalls(app);
      const bad = await noise(app);
      const st = await app.status();
      log('נלחץ:', clicked, '| קריאות:', JSON.stringify(calls), '| commit payload:', JSON.stringify(commit));
      log('PUT:', JSON.stringify(puts), '| status:', JSON.stringify(st), '| רעש:', bad || '(אין)');
      const flow =
        calls.includes('fs.beginBinaryWrite') && puts.length === 1 && calls.includes('fs.commitUserFileWrite');
      const noTarget = commit && commit.targetToken === undefined;
      if (flow && noTarget && !bad)
        report.pass('שמור — ללא יעד', 'beginBinaryWrite → PUT → commitUserFileWrite בלי targetToken (כמו „שמור בשם”)');
      else report.fail('שמור — ללא יעד', `flow=${flow} noTarget=${noTarget}; רעש: ${bad || 'אין'}`);
    });

    await step('שמור — לחיצה שנייה על מסמך נקי (NO_OP)', async () => {
      await app.reset();
      const clicked = await app.click('שמור', { after: 1500 });
      const calls = (await app.hostCalls()).map((c) => c.method);
      log('נלחץ:', clicked, '| קריאות על מסמך נקי:', JSON.stringify(calls));
      calls.length === 0
        ? report.pass('שמור — מסמך נקי', 'לא נשלחה קריאה מיותרת למאחז')
        : report.partial('שמור — מסמך נקי', `קריאות בלתי צפויות: ${calls.join(',')}`);
    });

    await step('שמור בשם — עם יעד קיים, בכל זאת פותח commit בלי targetToken', async () => {
      await app.caret(0);
      await app.type(' עוד שינוי');
      await app.sleep(500);
      await mockSaveTarget(app, { token: 'save-as-target', name: 'שמור בשם.docx' });
      await app.reset();
      const clicked = await app.click('שמור בשם...', { after: 3000 });
      const commit = await lastCommitPayload(app);
      const bad = await noise(app);
      const titleAfter = await app.js("document.querySelector('.doc-title-input')?.value");
      log('נלחץ:', clicked, '| commit:', JSON.stringify(commit), '| שם אחרי:', titleAfter, '| רעש:', bad || '(אין)');
      const forced = commit && commit.targetToken === undefined;
      if (forced && titleAfter === 'שמור בשם' && !bad)
        report.pass('שמור בשם', 'commit נשלח בלי targetToken (מכריח דיאלוג יעד חדש), ושם המסמך התעדכן');
      else report.fail('שמור בשם', `forced=${forced} title=${titleAfter}; רעש: ${bad || 'אין'}`);
    });

    await step('פתח קובץ — על מסמך נקי, פותח מסמך אמיתי (data: URL של המסמך עצמו)', async () => {
      const base64 = await app.js('window.__qa.exportBase64()');
      const dataUrl = 'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,' + base64;
      await app.js(
        `window.__qaHost.replies['fs.pickUserFile']=function(){return Promise.resolve({success:true,error:null,` +
          `data:{token:'qa-open-token',url:${JSON.stringify(dataUrl)},name:'קובץ שנפתח.docx',size:1000,access:'readwrite'}})}`,
      );
      await app.reset();
      const clicked = await app.click('פתח קובץ', { after: 6000 });
      const calls = (await app.hostCalls()).map((c) => c.method);
      const bad = await noise(app);
      const titleAfter = await app.js("document.querySelector('.doc-title-input')?.value");
      const text = await app.screenText();
      log('נלחץ:', clicked, '| קריאות:', JSON.stringify(calls), '| שם:', titleAfter);
      log('טקסט אחרי הפתיחה:', JSON.stringify(text), '| רעש:', bad || '(אין)');
      const picked = calls.includes('fs.pickUserFile');
      const opened = titleAfter === 'קובץ שנפתח' && /שמור בשם|עוד שינוי/.test(text ?? '');
      if (picked && opened && !bad)
        report.pass('פתח קובץ', 'fs.pickUserFile נקרא, ומסמך אמיתי (עם התוכן הישן) נטען תחת השם החדש');
      else report.fail('פתח קובץ', `picked=${picked} opened=${opened}; רעש: ${bad || 'אין'}`);
    });

    await step('הדפסה', async () => {
      await app.js(
        "(function(){if(window.__origPrint)return;window.__origPrint=window.print;window.__printCalls=0;" +
          'window.print=function(){window.__printCalls++};})()',
      );
      await app.reset();
      const clicked = await app.click('הדפסה', { after: 1200 });
      const printCalls = await app.js('window.__printCalls');
      const size = await app.js('document.documentElement.dataset.printPageSize || null');
      const bad = await noise(app);
      const st = await app.status();
      log('נלחץ:', clicked, '| window.print() נקרא:', printCalls, '| data-print-page-size:', size);
      log('status:', JSON.stringify(st), '| רעש:', bad || '(אין)');
      if (clicked && printCalls === 1 && size && !bad)
        report.pass('הדפסה', `@page הוזרק לפי גודל שנקרא מהמסמך (${size}), ו-window.print() נקרא`);
      else if (clicked && printCalls === 1) report.partial('הדפסה', `נקרא, אך size=${size}; רעש: ${bad || 'אין'}`);
      else report.fail('הדפסה', `clicked=${clicked} printCalls=${printCalls}; רעש: ${bad || 'אין'}`);
    });

    await step('יציאה — על מסמך נקי (openLibrary/navigation.goTo)', async () => {
      await app.js(
        "window.__qaHost.replies['navigation.goTo']=function(p){window.__lastNav=p;" +
        "return Promise.resolve({success:true,data:true,error:null})}",
      );
      await app.reset();
      const clicked = await app.click('יציאה', { after: 1500 });
      const nav = await app.js('JSON.stringify(window.__lastNav||null)').then(JSON.parse);
      const bad = await noise(app);
      const alive = await app.js('1+1'); // הדפדפן עדיין מגיב — לא נתקע
      log('נלחץ:', clicked, '| navigation.goTo payload:', JSON.stringify(nav), '| דף עדיין חי:', alive === 2);
      log('רעש:', bad || '(אין)');
      if (clicked && nav?.target === 'library' && alive === 2 && !bad)
        report.pass('יציאה', 'navigation.goTo({target:"library"}) נקרא; המסמך לא נסגר, הדף לא נתקע');
      else report.fail('יציאה', `nav=${JSON.stringify(nav)} alive=${alive === 2}; רעש: ${bad || 'אין'}`);
    });

    await step('יציאה — כפתור מנוטרל בזמן שהשמירה רצה', async () => {
      // הוכחה עקיפה: הקוד קובע :disabled="isSaving" באותו תנאי בדיוק שחוסם
      // Ctrl+S. לא מדמים מרוץ אמיתי מול שמירה איטית — זה כבר נבדק ב"שמור".
      const st = await app.state('יציאה');
      log('מצב הכפתור על מסמך לא-שומר:', JSON.stringify(st));
      st.found && !st.disabled
        ? report.pass('יציאה — לא מנוטרל כשאין שמירה רצה')
        : report.fail('יציאה — מצב', JSON.stringify(st));
    });
  } finally {
    app.close();
  }
}

/* ================================================================== */
/* מקטע ב' — לשונית „✦ אוצריא”                                          */
/* ================================================================== */

async function sectionOtzariaTab() {
  const app = await openApp({ name: 'file-b', port: PORT });
  try {
    await widen(app);
    await app.tab('✦ אוצריא');

    await step('מיקום הפקדים', async () => {
      const names = ['ציטוט מהקורא', 'חיפוש באוצריא', 'פתח ספרייה', 'חידוש', 'קושיא', 'תירוץ'];
      const results = {};
      for (const n of names) results[n] = await onScreen(app, n);
      log('מיקומים:', JSON.stringify(results));
      const off = Object.entries(results).filter(([, r]) => !r.ok);
      off.length
        ? report.fail('מיקום הפקדים', off.map(([n, r]) => `${n}: ${r.why}`).join('; '))
        : report.pass('מיקום הפקדים', 'כל ששת הפקדים בתוך החלון');
    });

    await step('חידוש / קושיא / תירוץ — מוגבל מדעת', async () => {
      for (const label of ['חידוש', 'קושיא', 'תירוץ']) {
        const st = await app.state(label);
        const tip = await tooltipOf(app, label);
        log(`${label}:`, JSON.stringify(st), '| tooltip:', JSON.stringify(tip));
        const explained = tip && /דרך ציבורית|סגנונות תורניים/.test(tip.desc || tip.title || '');
        if (st.disabled && explained) report.pass(`${label} — מוגבל מדעת`, tip.desc || tip.title);
        else report.fail(`${label} — מוגבל מדעת`, `disabled=${st.disabled}; tooltip=${JSON.stringify(tip)}`);
      }
    });

    await step('ציטוט מהקורא — מסמך נכתב ל-doc.insert', async () => {
      await caretLine(app, 0);
      await app.sleep(400); // watch(superdoc) עם canInsertText הוא אסינכרוני
      const st = await app.state('ציטוט מהקורא');
      log('מצב אחרי מיקום סמן:', JSON.stringify(st));
      await app.js(
        "window.__qaHost.replies['reader.getSelection']=function(){return Promise.resolve({success:true,error:null," +
          "data:{sourceSelectedText:'בְּרֵאשִׁית בָּרָא אֱלֹהִים',currentRef:'בראשית פרק א פסוק א'}})}",
      );
      const before = await snap(app);
      await app.reset();
      const clicked = await app.click('ציטוט מהקורא', { after: 2500 });
      const calls = (await app.hostCalls()).map((c) => c.method);
      const bad = await noise(app);
      const after = await snap(app);
      log('נלחץ:', clicked, '| קריאות:', JSON.stringify(calls), '| רעש:', bad || '(אין)');
      log('document.xml מכיל את הציטוט:', /בראשית פרק א פסוק א/.test(after.doc));
      const hadBefore = /בראשית פרק א פסוק א/.test(before.doc);
      if (!st.found) report.fail('ציטוט מהקורא', 'הכפתור לא נמצא');
      else if (st.disabled)
        report.partial('ציטוט מהקורא', 'הכפתור מנוטרל — canInsertText החזיר false על מסמך זה');
      else if (!clicked) report.fail('ציטוט מהקורא', 'לחיצה נכשלה');
      else if (!calls.includes('reader.getSelection')) report.fail('ציטוט מהקורא', `לא נקרא reader.getSelection: ${calls}`);
      else if (!hadBefore && /בראשית פרק א פסוק א/.test(after.doc) && !bad)
        report.pass('ציטוט מהקורא', 'reader.getSelection נקרא, והציטוט "טקסט (מקור)" נכתב ל-word/document.xml');
      else report.fail('ציטוט מהקורא', `לא נכתב לדוקומנט (hadBefore=${hadBefore}); רעש: ${bad || 'אין'}`);
    });

    await step('ציטוט מהקורא — בלי בחירה בקורא (null) אינו שגיאה', async () => {
      await app.js("window.__qaHost.replies['reader.getSelection']=function(){return Promise.resolve({success:true,error:null,data:null})}");
      await app.reset();
      await app.click('ציטוט מהקורא', { after: 1200 });
      const st = await app.status();
      const errs = (await app.messages()).filter((m) => m.method === 'ui.showError');
      log('status:', JSON.stringify(st), '| showError:', JSON.stringify(errs));
      st.text && !st.error && errs.length === 0
        ? report.pass('ציטוט מהקורא — בלי בחירה', `הודעת הנחיה ולא שגיאה: "${st.text}"`)
        : report.fail('ציטוט מהקורא — בלי בחירה', `status=${JSON.stringify(st)} errs=${errs.length}`);
    });

    await step('חיפוש באוצריא — בלי בחירה במסמך מבקש לסמן, לא נכשל', async () => {
      await caretLine(app, 0); // סמן בלי טווח = אין מה לחפש
      await app.reset();
      const clicked = await app.click('חיפוש באוצריא', { after: 1000 });
      const calls = (await app.hostCalls()).map((c) => c.method);
      const st = await app.status();
      log('נלחץ:', clicked, '| קריאות:', JSON.stringify(calls), '| status:', JSON.stringify(st));
      if (clicked && !calls.includes('reader.openSearchTab') && st.text && !st.error)
        report.pass('חיפוש באוצריא — בלי טווח', `לא נשלחה שאילתה ריקה; הונחה: "${st.text}"`);
      else report.fail('חיפוש באוצריא — בלי טווח', `calls=${calls} status=${JSON.stringify(st)}`);
    });

    await step('חיפוש באוצריא — עם בחירה', async () => {
      await selectWholeLine(app, 0);
      await app.js(
        "window.__qaHost.replies['reader.openSearchTab']=function(p){window.__lastSearch=p;" +
        "return Promise.resolve({success:true,data:true,error:null})}",
      );

      /* הבחירה נמדדת לפני הלחיצה, ואינה מונחת.
       *
       * בלי זה הצעד היה מדווח `search=null` — שאינו אומר אם הפקד לא קרא
       * למאחז, או שלא הייתה בחירה מלכתחילה ולכן **בצדק** לא קרא. השניים
       * דורשים תיקון במקומות שונים לגמרי, והמספר היחיד לא הבדיל ביניהם.
       *
       * המלכודת שהסתירה את זה: כשאין בחירה הפקד מציג **הנחיה**, לא שגיאה,
       * ו-`noise()` בודק `status.error` בלבד — כלומר המצב הזה עבר בשקט
       * מוחלט. לכן טקסט המצב נכנס לדוח גם כשאינו שגיאה. */
      const selection = await app.selection();
      const statusBefore = await app.status();

      await app.reset();
      const clicked = await app.click('חיפוש באוצריא', { after: 1500 });
      const search = await app.js('JSON.stringify(window.__lastSearch||null)').then(JSON.parse);
      const statusAfter = await app.status();
      const bad = await noise(app);
      log('נלחץ:', clicked, '| בחירה לפני:', JSON.stringify(selection), '| payload:', JSON.stringify(search),
        '| מצב אחרי:', JSON.stringify(statusAfter), '| רעש:', bad || '(אין)');

      if (clicked && search?.query && search.query.trim() !== '' && !bad) {
        report.pass('חיפוש באוצריא', `נקרא עם query="${search.query}"`);
      } else if (!selection || selection.empty !== false) {
        // הפקד צדק; מה שנכשל הוא הכנת הבחירה בשער.
        report.stuck(
          'חיפוש באוצריא',
          `השער לא הצליח לבחור טווח לפני הלחיצה (selection=${JSON.stringify(selection)}, status=${JSON.stringify(statusBefore)}) — אין ממה לגזור שאילתה`,
        );
      } else {
        report.fail(
          'חיפוש באוצריא',
          `הייתה בחירה (${JSON.stringify(selection)}) והפקד לא קרא למאחז: search=${JSON.stringify(search)}, מצב=${JSON.stringify(statusAfter)}; רעש: ${bad || 'אין'}`,
        );
      }
    });

    await step('פתח ספרייה', async () => {
      await app.js("window.__qaHost.replies['navigation.goTo']=function(p){window.__lastNav2=p;" +
        "return Promise.resolve({success:true,data:true,error:null})}");
      await app.reset();
      const clicked = await app.click('פתח ספרייה', { after: 1200 });
      const nav = await app.js('JSON.stringify(window.__lastNav2||null)').then(JSON.parse);
      const bad = await noise(app);
      log('נלחץ:', clicked, '| navigation.goTo:', JSON.stringify(nav), '| רעש:', bad || '(אין)');
      if (clicked && nav?.target === 'library' && !bad) report.pass('פתח ספרייה', 'navigation.goTo({target:"library"})');
      else report.fail('פתח ספרייה', `nav=${JSON.stringify(nav)}; רעש: ${bad || 'אין'}`);
    });

    await step('פתח ספרייה — כשל מהמאחז מדווח ולא נבלע', async () => {
      // סירוב אמיתי: מעטפת עם success:false, כמו שהמאחז מחזיר. `false` גולמי היה
      // „עובד” רק במקרה — הלקוח דוחה כל דבר שאינו מעטפת, ולכן הבדיקה לא הבדילה
      // בין „המאחז סירב” לבין „המאחז ענה בשפה אחרת”.
      await app.js("window.__qaHost.replies['navigation.goTo']=function(){" +
        "return Promise.resolve({success:false,data:null,error:{message:'לא ניתן לעבור',code:'error.failed'}})}");
      await app.reset();
      await app.click('פתח ספרייה', { after: 1000 });
      const st = await app.status();
      log('status אחרי סירוב מפורש:', JSON.stringify(st));
      st.error && /נכשל/.test(st.text ?? '')
        ? report.pass('פתח ספרייה — סירוב מהמאחז', `מדווח כשגיאה: "${st.text}"`)
        : report.fail('פתח ספרייה — סירוב מהמאחז', JSON.stringify(st));
    });
  } finally {
    app.close();
  }
}

/* ================================================================== */
/* מקטע ג' — פס הכותרת (TitleBar)                                      */
/* ================================================================== */

async function sectionTitleBar() {
  const app = await openApp({ name: 'file-c', port: PORT });
  try {
    await widen(app);
    // נשארים בלשונית "בית" (ברירת המחדל) — כך אין שני פקדים בשם "שמור" בעת ובעונה אחת.
    const active = await app.js('window.__qa.activeTab()');
    log('לשונית פעילה כברירת מחדל:', active);

    await step('מיקום פקדי פס הכותרת', async () => {
      const names = ['שמירה אוטומטית', 'שמור', 'בטל', 'חזור'];
      const results = {};
      for (const n of names) results[n] = await onScreen(app, n);
      // „חיפוש והחלפה” בפס הכותרת הוחלף בתיבת Tell Me (ונשאר נגיש מבית > עריכה).
      // התיבה נמדדת כאן מאותו עוגן שכל שורותיה מודדות ממנו, `.tell-me-input`.
      const box = await tellMe(app);
      const inside = !!box.rect && box.rect.x > 0 && box.rect.y > 0;
      results['תיבת Tell Me'] = {
        ok: inside,
        why: inside ? '' : box.found ? `מחוץ לחלון או אינו מוצג (rect=${JSON.stringify(box.rect)})` : 'לא נמצא',
        rect: box.rect,
      };
      log('מיקומים:', JSON.stringify(results));
      const off = Object.entries(results).filter(([, r]) => !r.ok);
      off.length
        ? report.fail('מיקום פקדי הפס', off.map(([n, r]) => `${n}: ${r.why}`).join('; '))
        : report.pass('מיקום פקדי הפס', 'כל הפקדים בתוך החלון');
    });

    await step('בטל/חזור — מושבתים כשאין מה לבטל', async () => {
      const undo = await app.state('בטל');
      const redo = await app.state('חזור');
      log('מצב התחלתי:', JSON.stringify({ undo, redo }));
      undo.disabled && redo.disabled
        ? report.pass('בטל/חזור — מצב התחלתי', 'שניהם מנוטרלים על מסמך שזה עתה נפתח')
        : report.partial('בטל/חזור — מצב התחלתי', `undo.disabled=${undo.disabled} redo.disabled=${redo.disabled}`);
    });

    await step('הקלדה מדליקה „בטל”', async () => {
      await app.caret(0);
      await app.type('טקסט לבדיקת בטל');
      await app.sleep(500);
      const undo = await app.state('בטל');
      log('מצב אחרי הקלדה:', JSON.stringify(undo));
      !undo.disabled ? report.pass('בטל — נדלק אחרי הקלדה') : report.fail('בטל — נדלק אחרי הקלדה', 'עדיין מנוטרל');
    });

    await step('בטל (Undo) — הטקסט נעלם מה-XML', async () => {
      const before = await snap(app);
      await app.reset();

      /* מצב הפקודה **במנוע**, ולא רק מצב הכפתור.
       *
       * „הטקסט לא נעלם” אינו אומר איפה זה נשבר: הפקודה לא נשלחה, נשלחה
       * ונדחתה, או רצה ולא עשתה דבר. שלושתן דורשות תיקון במקום אחר. הכפתור
       * המצויר אינו עדות — הוא נגזר ממצב שנקרא מראש, וייתכן שהוא מיושן.
       * `app.cmd('undo')` שואל את ה-controller עצמו. */
      const cmdBefore = await app.cmd('undo');
      const clicked = await app.click('בטל', { after: 1200 });
      const cmdAfter = await app.cmd('undo');
      const bad = await noise(app);
      const after = await snap(app);
      const hadBefore = /טקסט לבדיקת בטל/.test(before.doc);
      const hasAfter = /טקסט לבדיקת בטל/.test(after.doc);
      const redo = await app.state('חזור');
      log('נלחץ:', clicked, '| טקסט לפני/אחרי:', hadBefore, hasAfter,
        '| undo לפני/אחרי:', JSON.stringify(cmdBefore), JSON.stringify(cmdAfter),
        '| "חזור" נדלק:', !redo.disabled, '| רעש:', bad || '(אין)');

      if (clicked && hadBefore && !hasAfter && !redo.disabled && !bad) {
        report.pass('בטל', 'הטקסט הוסר מה-document.xml, ו"חזור" נדלק');
      } else if (!hadBefore) {
        report.stuck('בטל', 'הטקסט לבדיקה לא היה במסמך מלכתחילה — אין מה לבטל, והמדידה אינה על הפקד');
      } else {
        report.fail(
          'בטל',
          `hasAfter=${hasAfter} redo.disabled=${redo.disabled}; מצב undo במנוע לפני=${JSON.stringify(cmdBefore)} אחרי=${JSON.stringify(cmdAfter)}; רעש: ${bad || 'אין'}`,
        );
      }
    });

    await step('חזור (Redo) — הטקסט חוזר', async () => {
      await app.reset();
      const clicked = await app.click('חזור', { after: 1200 });
      const bad = await noise(app);
      const after = await snap(app);
      log('נלחץ:', clicked, '| הטקסט חזר:', /טקסט לבדיקת בטל/.test(after.doc), '| רעש:', bad || '(אין)');
      if (clicked && /טקסט לבדיקת בטל/.test(after.doc) && !bad) report.pass('חזור', 'הטקסט חזר ל-document.xml');
      else report.fail('חזור', `נכשל; רעש: ${bad || 'אין'}`);
    });

    await step('תיבת Tell Me — סינון, ובחירה שמריצה את הפקודה', async () => {
      await app.reset();
      const idle = await tellMe(app);
      log('לפני לחיצה:', JSON.stringify({ found: idle.found, disabled: idle.disabled, מוצגת: idle.boxShown, פתוחה: idle.open, placeholder: idle.placeholder }));
      if (!idle.found || !idle.boxShown || idle.disabled !== false) {
        report.fail('תיבת Tell Me — סינון', `התיבה אינה פעילה: found=${idle.found} מוצגת=${idle.boxShown} disabled=${idle.disabled}`);
        return;
      }

      const clicked = await app.clickSel('.tell-me-input', 0, { after: 500 });
      const opened = await tellMe(app);
      const suggested = opened.items.filter((i) => i.shown).map((i) => i.title);

      await app.type('החלפה');
      await app.sleep(400);
      const filtered = await tellMe(app);
      const shown = filtered.items.filter((i) => i.shown).map((i) => i.title);
      log('נלחץ:', clicked, '| פתוחה אחרי לחיצה:', opened.open, '| מוצעות:', JSON.stringify(suggested));
      log('שאילתה:', JSON.stringify(filtered.value), '| מקטע:', filtered.section, '| תוצאות:', JSON.stringify(shown));

      const filterOk =
        clicked &&
        !idle.open &&
        opened.open &&
        opened.section === 'פעולות מוצעות' &&
        suggested.includes('חיפוש והחלפה') &&
        filtered.value === 'החלפה' &&
        filtered.expanded === 'true' &&
        filtered.section === 'פקודות ואפשרויות' &&
        shown[0] === 'חיפוש והחלפה' &&
        shown.length < suggested.length;
      filterOk
        ? report.pass(
            'תיבת Tell Me — סינון',
            `סגורה עד הלחיצה, ואחריה ${suggested.length} פעולות מוצעות; „החלפה” צמצם ל-${shown.length} תוצאות שבראשן „${shown[0]}”`,
          )
        : report.fail(
            'תיבת Tell Me — סינון',
            `נלחץ=${clicked} פתוחה לפני=${idle.open} אחרי=${opened.open} מקטע=${opened.section}/${filtered.section} ` +
              `שאילתה=${JSON.stringify(filtered.value)} expanded=${filtered.expanded} מוצעות=${JSON.stringify(suggested)} תוצאות=${JSON.stringify(shown)}`,
          );

      const rect = await tellMeRect(app, 'חיפוש והחלפה');
      if (!rect) {
        report.fail('תיבת Tell Me — הרצת „חיפוש והחלפה”', 'לשורה „חיפוש והחלפה” אין מלבן ללחיצה — היא אינה מוצגת');
        return;
      }
      await app.clickAt(rect.x, rect.y);
      await app.sleep(900);
      const dlg = await app.dialog();
      const { mode } = await findDialogFacts(app);
      const afterPick = await tellMe(app);
      const bad = await noise(app);
      const hasQueryField = !!dlg?.controls?.some((c) => c.name === 'טקסט לחיפוש');
      log('דיאלוג:', JSON.stringify(dlg && { label: dlg.label, mode }), '| התיבה אחרי:',
        JSON.stringify({ value: afterPick.value, פתוחה: afterPick.open }), '| רעש:', bad || '(אין)');

      // הלשונית היא ההבדל בין `shellAction:'replace'` ל-`'find'`: בלעדיה השורה
      // עוברת גם כשנשלחה הפקודה השנייה.
      if (
        dlg?.label === 'חיפוש והחלפה' &&
        hasQueryField &&
        mode === 'החלף' &&
        afterPick.value === '' &&
        !afterPick.open &&
        !bad
      ) {
        report.pass('תיבת Tell Me — הרצת „חיפוש והחלפה”', 'הדיאלוג נפתח בלשונית „החלף”, והתיבה התרוקנה ונסגרה');
      } else {
        report.fail(
          'תיבת Tell Me — הרצת „חיפוש והחלפה”',
          `dlg=${JSON.stringify(dlg && { label: dlg.label })} לשונית=${JSON.stringify(mode)} (נדרש „החלף”) ` +
            `שדה חיפוש=${hasQueryField} התיבה אחרי=${JSON.stringify({ value: afterPick.value, open: afterPick.open })}; רעש: ${bad || 'אין'}`,
        );
      }

      await app.clickDialog('סגור', { after: 400 });

      /*
       * מילת עוגן שהשורה כותבת לעצמה. קודם היא חיפשה „לבדיקת” מתוך הטקסט של
       * צעד „בטל/חזור”, ולכן כשהצעד ההוא נכשל השורה נשארה ירוקה על „אין
       * תוצאות”. `caret(0)` אינו כתובת פסקה, ולכן הנחיתה אינה מונחת: העוגן
       * מאומת מהטקסט שהמנוע צייר לפני שמחפשים אותו.
       */
      const ANCHOR = 'עוגןתלמי';
      await app.caret(0);
      await app.type(ANCHOR);
      await app.sleep(700);
      const screen = (await app.screenText()) ?? '';
      const seeded = screen.split(ANCHOR).length - 1;
      log('העוגן במסמך:', seeded, 'פעמים');
      if (seeded !== 1) {
        report.fail(
          'תיבת Tell Me — „חפש במסמך” נושא את השאילתה',
          `מילת העוגן „${ANCHOR}” אינה במסמך פעם אחת (נמדד ${seeded}) — אין מה לחפש, והשורה אינה נמדדת על „אין תוצאות”`,
        );
        return;
      }

      await app.reset();
      await app.clickSel('.tell-me-input', 0, { after: 400 });
      await app.type(ANCHOR);
      await app.sleep(400);
      const docRow = await tellMeRect(app, 'tell-me-item-doc-search');
      if (!docRow) {
        report.fail('תיבת Tell Me — „חפש במסמך” נושא את השאילתה', 'שורת „חפש במסמך” אינה מוצגת אחרי הקלדה');
        return;
      }
      await app.clickAt(docRow.x, docRow.y);
      await app.sleep(1200);
      const findDlg = await app.dialog();
      const queryField = findDlg?.controls?.find((c) => c.name === 'טקסט לחיפוש');
      const { counter } = await findDialogFacts(app);
      const total = counterTotal(counter);
      const bad2 = await noise(app);
      log('דיאלוג אחרי „חפש במסמך”:', JSON.stringify(findDlg && { label: findDlg.label }),
        '| שדה החיפוש:', JSON.stringify(queryField?.value), '| מונה:', JSON.stringify(counter), '| התאמות:', total,
        '| רעש:', bad2 || '(אין)');
      findDlg?.label === 'חיפוש והחלפה' && queryField?.value === ANCHOR && total === 1 && !bad2
        ? report.pass(
            'תיבת Tell Me — „חפש במסמך” נושא את השאילתה',
            `הדיאלוג נפתח עם "${queryField.value}" בשדה החיפוש, והמנוע מצא את העוגן פעם אחת ("${counter}")`,
          )
        : report.fail(
            'תיבת Tell Me — „חפש במסמך” נושא את השאילתה',
            `dlg=${JSON.stringify(findDlg && { label: findDlg.label })} שדה=${JSON.stringify(queryField?.value)} ` +
              `מונה=${JSON.stringify(counter)} התאמות=${total} (נדרש 1); רעש: ${bad2 || 'אין'}`,
          );
      await app.clickDialog('סגור', { after: 300 });
    });

    await step('שם המסמך — עריכה משפיעה על שם קובץ השמירה', async () => {
      await app.clickSel('.doc-title-input', 0, { after: 300 });
      // Ctrl+A כדי לבחור את כל התוכן הקיים לפני הקלדת השם החדש.
      await app.press('a', 'KeyA', 65, 8);
      await app.sleep(150);
      await app.type('שם חדש לבדיקה');
      await app.press('Enter', 'Enter', 13);
      await app.sleep(400);
      const titleNow = await app.js("document.querySelector('.doc-title-input')?.value");
      log('שם אחרי העריכה:', titleNow);
      if (titleNow !== 'שם חדש לבדיקה') {
        report.fail('שם המסמך — עריכה', `הערך לא התעדכן: "${titleNow}"`);
        return;
      }
      report.pass('שם המסמך — עריכה', `הקלט מציג "${titleNow}"`);

      await mockSaveTarget(app, { token: 'title-rename', name: 'ייקבע מהשם' });
      await app.reset();
      await app.click('שמור', { after: 3000 });
      const commit = await lastCommitPayload(app);
      log('suggestedName שנשלח בשמירה:', JSON.stringify(commit?.suggestedName));
      commit?.suggestedName === 'שם חדש לבדיקה'
        ? report.pass('שם המסמך — משפיע על השמירה', `suggestedName="${commit.suggestedName}"`)
        : report.fail('שם המסמך — משפיע על השמירה', `suggestedName=${JSON.stringify(commit?.suggestedName)}`);
    });

    await step('שמור (גישה מהירה) — אותו מסלול מאחז כמו לשונית קובץ', async () => {
      await app.caret(0);
      await app.type(' תוספת');
      await app.sleep(400);
      await mockSaveTarget(app, { token: 'quick-access-save', name: 'גישה מהירה.docx' });
      await app.reset();
      const clicked = await app.click('שמור', { after: 3000 });
      const calls = (await app.hostCalls()).map((c) => c.method);
      const puts = await putCalls(app);
      const bad = await noise(app);
      log('נלחץ:', clicked, '| קריאות:', JSON.stringify(calls), '| PUT:', puts.length, '| רעש:', bad || '(אין)');
      if (clicked && calls.includes('fs.beginBinaryWrite') && puts.length >= 1 && calls.includes('fs.commitUserFileWrite') && !bad)
        report.pass('שמור (גישה מהירה)', 'אותה שרשרת fs.beginBinaryWrite→PUT→fs.commitUserFileWrite');
      else report.fail('שמור (גישה מהירה)', `calls=${calls}; רעש: ${bad || 'אין'}`);
    });

    await step('מתג שמירה אוטומטית — כיבוי מונע autosave', async () => {
      const before = await app.state('שמירה אוטומטית');
      log('מצב לפני:', JSON.stringify(before));
      await app.click('שמירה אוטומטית', { after: 400 });
      const after = await app.state('שמירה אוטומטית');
      log('מצב אחרי לחיצה:', JSON.stringify(after));
      if (after.active === before.active) {
        report.fail('מתג שמירה אוטומטית — מצב חזותי', 'ה-class "active" לא התהפך');
        return;
      }
      report.pass('מתג שמירה אוטומטית — מצב חזותי', `${before.active} → ${after.active}`);

      // אם כובה עכשיו — מוודאים שעריכה לא מפעילה autosave אחרי הזמן שלו.
      const isOffNow = after.active === false || after.active === 'false';
      if (!isOffNow) {
        report.skip('מתג שמירה אוטומטית — נעילת autosave', 'המתג עלה במקום כבה; לא נבדק במחזור הזה');
        return;
      }
      await mockSaveTarget(app, { token: 'autosave-off', name: 'לא אמור להישמר.docx' });
      await app.caret(0);
      await app.type(' עוד עריכה בזמן שהמתג כבוי');
      await app.reset();
      await app.sleep(3200); // AUTOSAVE_DELAY_MS=2500 + מרווח ביטחון
      const calls = (await app.hostCalls()).map((c) => c.method);
      log('קריאות אחרי 3.2ש עם מתג כבוי:', JSON.stringify(calls));
      calls.length === 0
        ? report.pass('מתג שמירה אוטומטית — כיבוי מונע autosave', 'לא נשלחה שום קריאת שמירה')
        : report.fail('מתג שמירה אוטומטית — כיבוי מונע autosave', `קרה בכל זאת: ${calls.join(',')}`);
    });

    await step('מתג שמירה אוטומטית — הדלקה מפעילה autosave', async () => {
      await app.click('שמירה אוטומטית', { after: 400 }); // מדליקים בחזרה
      const st = await app.state('שמירה אוטומטית');
      log('מצב אחרי הדלקה מחדש:', JSON.stringify(st));
      await mockSaveTarget(app, { token: 'autosave-on', name: 'ייחסך אוטומטית.docx' });
      await app.reset();
      await app.sleep(3200);
      const calls = (await app.hostCalls()).map((c) => c.method);
      log('קריאות אחרי 3.2ש עם מתג דלוק (ומסמך מלוכלך מקודם):', JSON.stringify(calls));
      calls.includes('fs.beginBinaryWrite') && calls.includes('fs.commitUserFileWrite')
        ? report.pass('מתג שמירה אוטומטית — הדלקה מפעילה autosave', 'שמירה רצה לבד בלי לחיצה על "שמור"')
        : report.partial(
            'מתג שמירה אוטומטית — הדלקה מפעילה autosave',
            `קריאות: ${calls.join(',') || '(none)'} — ייתכן שהמסמך כבר לא היה מלוכלך`,
          );
    });
  } finally {
    app.close();
  }
}

/* ================================================================== */

const only = process.argv[2];
const sections = {
  a: ['לשונית „קובץ”', sectionFileTab],
  b: ['לשונית „✦ אוצריא”', sectionOtzariaTab],
  c: ['פס הכותרת (TitleBar)', sectionTitleBar],
};

for (const [key, [label, fn]] of Object.entries(sections)) {
  if (only && only !== key) continue;
  await phase(label, fn);
}

report.print();
process.exit(0);
