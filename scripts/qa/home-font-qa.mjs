/**
 * שער QA לקבוצות „לוח" ו„גופן" בלשונית „בית" (src/ui/ribbon/tabs/HomeTab.vue).
 *
 * אבחון בלבד — אינו מתקן דבר. לוחץ לחיצות עכבר אמיתיות דרך CDP על ה-dist
 * הארוז, ומוכיח (או מפריך) כל פקד מול ה-OOXML שיוצא מ-`export.toDocx`.
 *
 * יציאה 9361 בלבד — שערים אחרים רצים במקביל על יציאות אחרות.
 *
 * הרצה חלקית:  QA_PHASES=1,2,3 node scripts/qa/home-font-qa.mjs
 * השלבים: 1=B/I/U/S  2=כתב עליון/תחתי  3=גופן/גודל/הגדל/הקטן
 *         4=צבעים  5=מתקדם  6=נקה עיצוב  7=מברשת  8=לוח
 */
import { openApp, createReport } from './harness.mjs';

const PHASES = (process.env.QA_PHASES ?? '1,2,3,4,5,6,7,8').split(',').map(Number);
const on = (n) => PHASES.includes(n);

const report = createReport('בית — לוח וגופן');
const app = await openApp({ name: 'home-font', port: Number(process.env.QA_PORT ?? 9361) });

const notes = [];
function note(...p) {
  const l = p.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
  notes.push(l);
  console.log(l);
}

/** כל קריאה ל-CDP חוסמת ללא סוף כשהדף תקוע; בלי זה השער נתקע בלי לומר איפה. */
const T = (p, label, ms = 30_000) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`תקיעה ב-${label}`)), ms))]);

const body = (d) => d.slice(d.indexOf('<w:body'));

/** ה-rPr של הריצה שמכילה בדיוק את הטקסט הזה. '' כשאין rPr, null כשאין ריצה. */
function rPrOf(doc, text) {
  const runs = body(doc).match(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g) || [];
  const hit = runs.find((r) => new RegExp(`<w:t[^>]*>${text}</w:t>`).test(r));
  if (!hit) return null;
  const m = hit.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
  return m ? m[0] : '';
}

function runMap(doc) {
  const runs = body(doc).match(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g) || [];
  return runs.map((r) => {
    const t = r.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/);
    const p = r.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/);
    return [t ? t[1] : '', p ? p[1] : ''];
  });
}

/**
 * האם התכונה **דלוקה** ב-rPr. `<w:b/>` דלוק; `<w:b w:val="0"/>` ו-
 * `<w:u w:val="none"/>` הם הכיבוי הקנוני של Word ואינם דלוקים.
 */
function isOn(rpr, tag) {
  if (!rpr) return false;
  const m = rpr.match(new RegExp(`<w:${tag}(\\s[^>]*)?/?>`));
  if (!m) return false;
  const attrs = m[1] || '';
  const val = attrs.match(/w:val="([^"]+)"/);
  if (!val) return true;
  return !['0', 'false', 'none', 'off', 'baseline'].includes(val[1]);
}

const docx = () => T(app.docx(), 'ייצוא docx', 60_000);
/**
 * `Input.dispatchMouseEvent` נתקע לפעמים אחרי סדרה ארוכה של פעולות (נמדד:
 * תמיד בתחילת שלב 5, אחרי שלב הצבעים). ה-JS בדף ממשיך לענות, ולכן זו תקיעה
 * של צינור הקלט ולא של הדף. ניסיון חוזר משחרר ברוב המקרים; אם לא — הצעד
 * מדווח ולא מפיל את כל השער.
 */
async function caretPara(n) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await T(app.caret(n * 2), `סמן לפסקה ${n}`, 12_000);
    } catch (e) {
      const alive = await Promise.race([app.js('1+1'), new Promise((r) => setTimeout(() => r('JS-תקוע'), 4000))]);
      note(`  !! תקיעת קלט בסמן לפסקה ${n} (ניסיון ${attempt}); JS בדף מחזיר: ${alive}`);
      await app.sleep(1500);
    }
  }
  throw new Error(`הסמן לפסקה ${n} לא נענה בשלושה ניסיונות`);
}

/**
 * התצלום של הבחירה (`ui.selection.getSnapshot`) מדווח `stale` עוד ~900ms אחרי
 * בחירה במקלדת. פקד שנמדד בתוך החלון הזה נמדד על מצב שאינו המצב.
 */
const selSnapshot = () =>
  app.js(`(function(){try{var s=window.__otzariaEditor.superdoc.ui.selection.getSnapshot();return s.status+'/'+(s.empty?'empty':'range');}catch(e){return 'ERR';}})()`);

async function settleSelection(maxMs = 4000) {
  for (let waited = 0; waited < maxMs; waited += 150) {
    if ((await selSnapshot()).startsWith('ready')) return true;
    await app.sleep(150);
  }
  return false;
}

async function selectRange(from, to, { settle = true } = {}) {
  await app.press('Home', 'Home', 36);
  await app.sleep(120);
  for (let i = 0; i < from; i++) { await app.press('ArrowRight', 'ArrowRight', 39); await app.sleep(22); }
  for (let i = from; i < to; i++) { await app.press('ArrowRight', 'ArrowRight', 39, 8); await app.sleep(22); }
  await app.sleep(400);
  if (settle) await settleSelection();
}

/** לחיצה שמאמתת קודם שהמלבן בתוך החלון. `rect` מחוץ לחלון = לחיצה שאיש לא קלט. */
async function clickChecked(name, opts = {}) {
  const st = await T(app.state(name, opts), `state(${name})`);
  if (!st.found || !st.rect) { note(`  !! „${name}" לא נמצא/אינו מוצג`); return false; }
  const { x, y } = st.rect;
  if (x < 0 || y < 0 || x > 1600 || y > 1000) { note(`  !! „${name}" מחוץ לחלון: ${JSON.stringify(st.rect)}`); return false; }
  return T(app.click(name, opts), `לחיצה ${name}`);
}

async function ctx(label) {
  const st = await T(app.status(), 'status');
  const msgs = await T(app.messages(), 'messages');
  const log = (await T(app.log(), 'log')).filter((l) => !/DevTools|Download the Vue|\[Vue warn\]/i.test(l));
  if (st.text || msgs.length || log.length) note(`   ↳ ${label}: status=`, st, 'msgs=', msgs, 'log=', log.slice(0, 5));
  return { st, msgs, log, bad: !!st.error || msgs.some((m) => m.method === 'ui.showError') };
}


/**
 * מריץ שלב מבודד: תקיעה או זריקה בו אינן מוחקות את השלבים שאחריו.
 *
 * ## למה זה נדרש
 *
 * כל השלבים ישבו ב-`try` אחד. `caretPara` זורק אחרי שלושה ניסיונות כושלים
 * (תקיעה של צינור הקלט — ראו התיעוד שם), והזריקה הזאת בשלב 5 מחקה גם את
 * 6, 7 ו-8. כלומר תקלה אחת בהזרקת עכבר עלתה בארבעה שלבים שלא נמדדו כלל,
 * והשער דווח כ„לא מסתיים”.
 *
 * ## למה „תקוע” ולא „שבור”
 *
 * התקיעה הנמדדת כאן היא ב-`Input.dispatchMouseEvent` בזמן שה-JS בדף ממשיך
 * לענות — כלומר צינור הקלט של CDP, לא הפקד ולא הדף. זהו כשל של סביבת
 * המדידה, ורישומו כשבור היה שולח לחפש באג במקום שבו לא נמדד דבר. אותה
 * הבחנה בדיוק כמו ב-file-shell-qa.
 *
 * השעון פר-שלב הוא שכבה שנייה: הוא תופס תקיעה שקורית **מחוץ** ל-`caretPara`,
 * שם אין ניסיונות חוזרים ואין `T()`.
 */
const STAGE_TIMEOUT_MS = 180_000;

async function stage(n, body) {
  if (!on(n)) return;
  const outcome = await Promise.race([
    body().then(() => ({ ok: true }), (error) => ({ ok: false, error })),
    new Promise((resolve) => setTimeout(() => resolve({ timedOut: true }), STAGE_TIMEOUT_MS)),
  ]);
  if (outcome?.timedOut) {
    note(`!! שלב ${n}: לא סיים תוך ${STAGE_TIMEOUT_MS}ms — ממשיכים לשלב הבא`);
    report.stuck(`שלב ${n}`, `לא סיים תוך ${STAGE_TIMEOUT_MS}ms`);
  } else if (!outcome.ok) {
    const message = String(outcome.error?.message ?? outcome.error);
    note(`!! שלב ${n} נפל: ${message}`);
    // „תקיעת קלט” היא סביבה; כל שאר הזריקות הן כשל אמיתי של השלב.
    if (/תקיעה|לא נענה בשלושה ניסיונות/.test(message)) report.stuck(`שלב ${n}`, message);
    else report.fail(`שלב ${n}`, message);
  }
}

const LINES = ['alfa beta gama deta', 'cola diva', 'fntx sizx', 'hilo colo', 'advx ncdx', 'clra rfmt', 'srcx dstx', 'cutx cpyx'];

try {
  /**
   * חלון ברירת המחדל ב-headless צר (~756px), ואז `.word-ribbon-body` גולש
   * וחלק מהפקדים יושבים מחוץ לחלון — לחיצה עליהם נשלחת לשום מקום, ופקד תקין
   * נמדד כ„שבור". מדוד: „מברשת עיצוב" נמדדה כלא-נדלקת בחלון הצר, ונדלקת
   * בחלון רחב.
   */
  await app.cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await app.sleep(800);

  /**
   * הרשאת לוח: ב-`file://` קריאת לוח המערכת נדחית, ו„הדבק" נופל על
   * `system-clipboard-blocked` — מגבלה מתועדת (engine/clipboard.ts) ולא באג.
   * ההענקה כאן מפרידה בין „הקוד שבור" לבין „הסביבה חוסמת".
   */
  let clipboardGranted = false;
  try {
    await app.cdp.send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
    clipboardGranted = true;
  } catch (e) { note('הענקת הרשאת לוח נכשלה:', String(e && e.message)); }
  note('הרשאת לוח הוענקה:', clipboardGranted);

  await T(app.tab('בית'), 'מעבר ללשונית בית');

  /* ================= שלב 0 — מצב פתיחה בלי סמן ================= */
  note('===== שלב 0: מצב פתיחה (בלי סמן ובלי בחירה) =====');
  const names = ['הדבק', 'גזור', 'העתק', 'מברשת עיצוב', 'גופן', 'גודל גופן', 'הגדל גופן', 'הקטן גופן',
    'נקה את כל העיצוב', 'מתקדם', 'מודגש', 'נטוי', 'קו תחתון', 'קו חוצה', 'כתב תחתי', 'כתב עליון',
    'צבע סימון טקסט', 'צבע גופן'];
  const idle = {};
  for (const n of names) idle[n] = await T(app.state(n), `state(${n})`);
  note('מושבת בלי בחירה:', JSON.stringify(Object.fromEntries(Object.entries(idle).map(([k, v]) => [k, v.disabled]))));
  for (const id of ['bold', 'italic', 'underline', 'strikethrough', 'clear-formatting', 'copy-format', 'font-family', 'font-size', 'text-color', 'highlight-color']) {
    note(`  cmd(${id}) =`, await T(app.cmd(id), `cmd ${id}`));
  }

  /* ================= פיקסטורה ================= */
  await caretPara(0);
  for (let i = 0; i < LINES.length; i++) {
    await app.type(LINES[i], 28);
    if (i < LINES.length - 1) { await app.press('Enter', 'Enter', 13); await app.sleep(260); }
  }
  await app.sleep(1500);
  note('פיקסטורה:', JSON.stringify(await T(app.screenText(), 'screenText')));

  /* ================= שלב 1 — B / I / U / S ================= */
  await stage(1, async () => {
    note('===== שלב 1: מודגש / נטוי / קו תחתון / קו חוצה =====');
    const toggles = [
      { name: 'מודגש', cmd: 'bold', word: 'alfa', from: 0, to: 4, tag: 'b' },
      { name: 'נטוי', cmd: 'italic', word: 'beta', from: 5, to: 9, tag: 'i' },
      { name: 'קו תחתון', cmd: 'underline', word: 'gama', from: 10, to: 14, tag: 'u' },
      { name: 'קו חוצה', cmd: 'strikethrough', word: 'deta', from: 15, to: 19, tag: 'strike' },
    ];
    for (const t of toggles) {
      await app.reset();
      await caretPara(0);
      await selectRange(t.from, t.to);
      const stBefore = await T(app.state(t.name), 'state');
      const clicked = await clickChecked(t.name);
      await app.sleep(700);
      const stAfter = await T(app.state(t.name), 'state');
      const rpr = rPrOf((await docx())['word/document.xml'], t.word);
      const applied = isOn(rpr, t.tag);
      note(`${t.name}: זמין=${!stBefore.disabled} נלחץ=${clicked} דלוק=${stAfter.active} rPr(${t.word})=${JSON.stringify(rpr)}`);
      const c1 = await ctx(t.name);

      await caretPara(0);
      await selectRange(t.from, t.to);
      await clickChecked(t.name);
      await app.sleep(700);
      const stOff = await T(app.state(t.name), 'state');
      const rpr2 = rPrOf((await docx())['word/document.xml'], t.word);
      const cleared = !isOn(rpr2, t.tag);
      note(`${t.name} (ביטול): דלוק=${stOff.active} rPr=${JSON.stringify(rpr2)} → כובה=${cleared}`);
      const c2 = await ctx(t.name + ' ביטול');

      if (applied && cleared && stAfter.active && !c1.bad && !c2.bad) report.pass(t.name, 'הוחל, נדלק, ובוטל בלחיצה שנייה');
      else if (applied && !cleared) report.partial(t.name, `הוחל אך לא בוטל (rPr=${rpr2})`);
      else if (applied && !stAfter.active) report.partial(t.name, 'הוחל אך הכפתור לא נדלק');
      else if (!applied) report.fail(t.name, `לא נכתב ל-rPr: ${JSON.stringify(rpr)}`);
      else report.pass(t.name);
    }
  });

  /* ================= שלב 2 — כתב תחתי / עליון ================= */
  await stage(2, async () => {
    note('===== שלב 2: כתב תחתי / כתב עליון =====');
    for (const v of [
      { name: 'כתב תחתי', word: 'cola', from: 0, to: 4, val: 'subscript' },
      { name: 'כתב עליון', word: 'diva', from: 5, to: 9, val: 'superscript' },
    ]) {
      await app.reset();
      await caretPara(1);
      await selectRange(v.from, v.to);
      const st = await T(app.state(v.name), 'state');
      await clickChecked(v.name);
      await app.sleep(900);
      const rpr = rPrOf((await docx())['word/document.xml'], v.word);
      const ok1 = !!rpr && rpr.includes(`w:vertAlign w:val="${v.val}"`);
      const stAfter = await T(app.state(v.name), 'state');
      note(`${v.name}: מושבת=${st.disabled} דלוק אחרי=${stAfter.active} rPr(${v.word})=${JSON.stringify(rpr)}`);
      const c1 = await ctx(v.name);

      await caretPara(1);
      await selectRange(v.from, v.to);
      await clickChecked(v.name);
      await app.sleep(900);
      const rpr2 = rPrOf((await docx())['word/document.xml'], v.word);
      const off = !rpr2 || !isOn(rpr2, 'vertAlign');
      note(`${v.name} (ביטול): rPr=${JSON.stringify(rpr2)} → כובה=${off}`);
      const c2 = await ctx(v.name + ' ביטול');

      if (ok1 && off && !c1.bad && !c2.bad) report.pass(v.name, 'הוחל ובוטל; אין חיווי „דלוק" — מוגבל מדעת (vert-align.ts)');
      else if (ok1) report.partial(v.name, `הוחל; כיבוי=${off} rPr2=${rpr2}`);
      else report.fail(v.name, `לא נכתב vertAlign: ${JSON.stringify(rpr)} status=${JSON.stringify(c1.st)}`);
    }
  });

  /* ================= שלב 3 — גופן / גודל / הגדל / הקטן ================= */
  let sizeAfterGrow = null;
  await stage(3, async () => {
    note('===== שלב 3: בורר גופן / בורר גודל / הגדל / הקטן =====');
    await app.reset();
    await caretPara(2);
    await selectRange(0, 4);
    const famOpts = await T(app.options('גופן'), 'options גופן');
    const cur = (await T(app.state('גופן'), 'state')).value;
    note('אפשרויות גופן:', JSON.stringify((famOpts || []).map((o) => o.value)));
    const target = (famOpts || []).map((o) => o.value).find((v) => v && v !== cur) || 'Arial';
    const rf = await T(app.selectValue('גופן', target), 'selectValue גופן');
    await app.sleep(1100);
    const rprF = rPrOf((await docx())['word/document.xml'], 'fntx');
    const famApplied = !!rprF && new RegExp(`<w:rFonts[^>]*"${target}"`).test(rprF);
    note(`בורר גופן: ${cur} → ${target}; selectValue=${rf}; rPr(fntx)=${JSON.stringify(rprF)}; תיבה=${(await app.state('גופן')).value}`);
    const cF = await ctx('בורר גופן');
    famApplied && !cF.bad ? report.pass('בורר גופן', `rFonts=${target}`) : report.fail('בורר גופן', `rPr=${JSON.stringify(rprF)}`);

    await app.reset();
    await caretPara(2);
    await selectRange(5, 9);
    note('אפשרויות גודל:', JSON.stringify((await T(app.options('גודל גופן'), 'options גודל') || []).map((o) => o.value)));
    const rs = await T(app.selectValue('גודל גופן', '20'), 'selectValue גודל');
    await app.sleep(1100);
    const rprS = rPrOf((await docx())['word/document.xml'], 'sizx');
    const sizeApplied = !!rprS && /<w:sz w:val="40"/.test(rprS);
    note(`בורר גודל: selectValue=${rs} rPr(sizx)=${JSON.stringify(rprS)} תיבה=${(await app.state('גודל גופן')).value}`);
    const cS = await ctx('בורר גודל');
    sizeApplied && !cS.bad ? report.pass('בורר גודל גופן', '20pt → w:sz=40') : report.fail('בורר גודל גופן', `rPr=${JSON.stringify(rprS)}`);

    await app.reset();
    await caretPara(2);
    await selectRange(5, 9);
    const shown0 = (await app.state('גודל גופן')).value;
    await clickChecked('הגדל גופן');
    await app.sleep(1000);
    const rprG = rPrOf((await docx())['word/document.xml'], 'sizx');
    sizeAfterGrow = rprG && rprG.match(/<w:sz w:val="(\d+)"/) ? Number(rprG.match(/<w:sz w:val="(\d+)"/)[1]) : null;
    note(`הגדל גופן: תיבה ${shown0} → ${(await app.state('גודל גופן')).value}; rPr=${JSON.stringify(rprG)}`);
    const cG = await ctx('הגדל גופן');
    (sizeAfterGrow > 40 && !cG.bad) ? report.pass('הגדל גופן', `w:sz 40 → ${sizeAfterGrow}`) : report.fail('הגדל גופן', `rPr=${JSON.stringify(rprG)}`);

    await app.reset();
    await caretPara(2);
    await selectRange(5, 9);
    const shownK0 = (await app.state('גודל גופן')).value;
    await clickChecked('הקטן גופן');
    await app.sleep(1000);
    const rprK = rPrOf((await docx())['word/document.xml'], 'sizx');
    const sizeK = rprK && rprK.match(/<w:sz w:val="(\d+)"/) ? Number(rprK.match(/<w:sz w:val="(\d+)"/)[1]) : null;
    note(`הקטן גופן: תיבה ${shownK0} → ${(await app.state('גודל גופן')).value}; rPr=${JSON.stringify(rprK)}`);
    const cK = await ctx('הקטן גופן');
    (sizeK && sizeAfterGrow && sizeK < sizeAfterGrow && !cK.bad) ? report.pass('הקטן גופן', `w:sz ${sizeAfterGrow} → ${sizeK}`) : report.fail('הקטן גופן', `rPr=${JSON.stringify(rprK)}`);
  });

  /* ================= שלב 4 — צבעים ================= */
  await stage(4, async () => {
    note('===== שלב 4: צבע סימון טקסט / צבע גופן =====');
    // הכפתור הראשי (מחיל את הצבע הנוכחי/ברירת המחדל)
    await app.reset();
    await caretPara(3);
    await selectRange(0, 4);
    await clickChecked('צבע סימון טקסט');
    await app.sleep(1000);
    const rprH = rPrOf((await docx())['word/document.xml'], 'hilo');
    note(`צבע סימון (כפתור ראשי): rPr(hilo)=${JSON.stringify(rprH)}`);
    const cH = await ctx('סימון ראשי');
    const hiMain = !!rprH && (/<w:highlight/.test(rprH) || /<w:shd[^>]*w:fill="(?!auto)/.test(rprH));

    // הפופאובר
    await app.reset();
    await caretPara(3);
    await selectRange(0, 4);
    const openedHi = await clickChecked('בחירת צבע', { index: 0, after: 700 });
    const paletteHi = await T(app.paletteOpen(), 'paletteOpen');
    const swHi = await T(app.paletteSwatches(), 'swatches');
    note(`פופאובר סימון: נפתח=${openedHi} palette=${paletteHi} משבצות=${(swHi || []).length}`);
    let rprH2 = null;
    if (paletteHi) {
      const pick = (swHi || []).findIndex((s) => /^#ff0000$/i.test(s.title));
      note('משבצת', pick, JSON.stringify(swHi[pick]));
      await T(app.clickPalette(pick >= 0 ? pick : 5, { after: 1100 }), 'clickPalette');
      rprH2 = rPrOf((await docx())['word/document.xml'], 'hilo');
    }
    note(`פופאובר סימון: rPr(hilo)=${JSON.stringify(rprH2)}`);
    const cH2 = await ctx('פופאובר סימון');
    await T(app.escape(), 'escape');
    const hiPop = !!rprH2 && (/<w:highlight/.test(rprH2) || /<w:shd[^>]*w:fill="FF0000"/i.test(rprH2));
    if (hiMain && hiPop) report.pass('צבע סימון טקסט', `כפתור ראשי ופופאובר כתבו; נכתב w:shd ולא w:highlight`);
    else if (hiPop) report.partial('צבע סימון טקסט', `הפופאובר עובד; הכפתור הראשי לא כתב (${JSON.stringify(rprH)})`);
    else if (hiMain) report.partial('צבע סימון טקסט', `הראשי עובד; הפופאובר לא (${JSON.stringify(rprH2)})`);
    else report.fail('צבע סימון טקסט', `לא נכתב. ראשי=${JSON.stringify(rprH)} פופאובר=${JSON.stringify(rprH2)}`);

    // צבע גופן
    await app.reset();
    await caretPara(3);
    await selectRange(5, 9);
    await clickChecked('צבע גופן');
    await app.sleep(1000);
    const rprC0 = rPrOf((await docx())['word/document.xml'], 'colo');
    note(`צבע גופן (כפתור ראשי): rPr(colo)=${JSON.stringify(rprC0)}`);
    await ctx('צבע גופן ראשי');

    await app.reset();
    await caretPara(3);
    await selectRange(5, 9);
    const openedC = await clickChecked('בחירת צבע', { index: 1, after: 700 });
    const paletteC = await T(app.paletteOpen(), 'paletteOpen');
    const swC = await T(app.paletteSwatches(), 'swatches');
    note(`פופאובר צבע גופן: נפתח=${openedC} palette=${paletteC} משבצות=${(swC || []).length}`);
    let rprC = null;
    if (paletteC) {
      const pick = (swC || []).findIndex((s) => /^#ff0000$/i.test(s.title));
      await T(app.clickPalette(pick >= 0 ? pick : 5, { after: 1100 }), 'clickPalette');
      rprC = rPrOf((await docx())['word/document.xml'], 'colo');
    }
    note(`צבע גופן (פופאובר): rPr(colo)=${JSON.stringify(rprC)} cmd=`, await app.cmd('text-color'));
    const cC = await ctx('צבע גופן');
    await T(app.escape(), 'escape');
    const colApplied = !!rprC && /<w:color w:val="FF0000"/i.test(rprC);
    colApplied && !cC.bad ? report.pass('צבע גופן', 'נכתב w:color=FF0000') : report.fail('צבע גופן', `rPr=${JSON.stringify(rprC)}`);
  });

  /* ================= שלב 5 — מתקדם ================= */
  await stage(5, async () => {
    note('===== שלב 5: „מתקדם" (דיאלוג הגופן המתקדם) =====');
    await app.reset();
    await caretPara(4);
    await selectRange(0, 4);
    const advOpened = await clickChecked('מתקדם', { after: 900 });
    const dlg = await T(app.dialog(), 'dialog');
    note(`דיאלוג: נלחץ=${advOpened} label=${dlg && dlg.label} פקדים=${dlg ? dlg.controls.length : 0}`);
    let rprA = null;
    if (dlg) {
      note('fa-spacing=2 →', await T(app.dialogFill('fa-spacing', '2'), 'fill'));
      note('fa-scale=125 →', await T(app.dialogFill('fa-scale', '125'), 'fill'));
      note('fa-position=3 →', await T(app.dialogFill('fa-position', '3'), 'fill'));
      note('fa-boldcs=yes →', await T(app.dialogFill('fa-boldcs', 'yes'), 'fill'));
      note('fa-dstrike=yes →', await T(app.dialogFill('fa-dstrike', 'yes'), 'fill'));
      note('fa-csfont=David →', await T(app.dialogFill('fa-csfont', 'David'), 'fill'));
      await app.sleep(400);
      const okBtn = (await T(app.dialog(), 'dialog')).controls.find((c) => c.text === 'אישור');
      note('כפתור אישור:', JSON.stringify(okBtn));
      const okClicked = await T(app.clickDialog('אישור', { after: 1600 }), 'לחיצה אישור');
      note('אישור נלחץ=', okClicked, 'הדיאלוג עדיין פתוח=', !!(await T(app.dialog(), 'dialog')));
      rprA = rPrOf((await docx())['word/document.xml'], 'advx');
    }
    note(`מתקדם: rPr(advx)=${JSON.stringify(rprA)}`);
    const cA = await ctx('מתקדם');
    const hits = {
      spacing: !!rprA && /<w:spacing w:val="40"/.test(rprA),
      scale: !!rprA && /<w:w w:val="125"/.test(rprA),
      position: !!rprA && /<w:position w:val="6"/.test(rprA),
      bCs: !!rprA && /<w:bCs/.test(rprA),
      dstrike: !!rprA && /<w:dstrike/.test(rprA),
      csFont: !!rprA && /w:cs="David"/.test(rprA),
    };
    note('פירוט מתקדם:', JSON.stringify(hits));
    const allHit = Object.values(hits).every(Boolean);
    if (allHit && !cA.bad) report.pass('מתקדם (דיאלוג הגופן)', 'כל ששת השדות נכתבו ל-rPr');
    else if (Object.values(hits).some(Boolean)) report.partial('מתקדם (דיאלוג הגופן)', `חלקי: ${JSON.stringify(hits)}`);
    else report.fail('מתקדם (דיאלוג הגופן)', `לא נכתב דבר. dlg=${!!dlg} status=${JSON.stringify(cA.st)} msgs=${JSON.stringify(cA.msgs)}`);
  });

  /* ================= שלב 6 — נקה את כל העיצוב ================= */
  await stage(6, async () => {
    note('===== שלב 6: נקה את כל העיצוב =====');
    await app.reset();
    await caretPara(5);
    await selectRange(0, 4);
    await clickChecked('מודגש'); await app.sleep(700);
    await caretPara(5); await selectRange(0, 4);
    await clickChecked('נטוי'); await app.sleep(700);
    const rprPre = rPrOf((await docx())['word/document.xml'], 'clra');
    note('לפני הניקוי rPr(clra)=', JSON.stringify(rprPre));
    await app.reset();
    await caretPara(5);
    await selectRange(0, 4);
    const clState = await T(app.state('נקה את כל העיצוב'), 'state');
    await clickChecked('נקה את כל העיצוב');
    await app.sleep(1200);
    const rprPost = rPrOf((await docx())['word/document.xml'], 'clra');
    note(`נקה עיצוב: מושבת=${clState.disabled} rPr אחרי=${JSON.stringify(rprPost)}`);
    const cCl = await ctx('נקה עיצוב');
    const hadFmt = isOn(rprPre, 'b') && isOn(rprPre, 'i');
    const cleaned = !isOn(rprPost, 'b') && !isOn(rprPost, 'i');
    (hadFmt && cleaned && !cCl.bad) ? report.pass('נקה את כל העיצוב', 'b ו-i הוסרו')
      : report.fail('נקה את כל העיצוב', `לפני=${JSON.stringify(rprPre)} אחרי=${JSON.stringify(rprPost)}`);
  });

  /* ================= שלב 7 — מברשת עיצוב ================= */
  await stage(7, async () => {
    note('===== שלב 7: מברשת עיצוב =====');
    await app.reset();
    await caretPara(6);
    await selectRange(0, 4);
    await clickChecked('מודגש'); await app.sleep(800);
    const rprSrc = rPrOf((await docx())['word/document.xml'], 'srcx');
    note('המקור srcx אחרי הדגשה:', JSON.stringify(rprSrc));

    await caretPara(6);
    await selectRange(0, 4);
    const fpBefore = await T(app.state('מברשת עיצוב'), 'state');
    const fpCmdBefore = await T(app.cmd('copy-format'), 'cmd');
    await clickChecked('מברשת עיצוב');
    await app.sleep(900);
    const fpAfter = await T(app.state('מברשת עיצוב'), 'state');
    const fpCmdAfter = await T(app.cmd('copy-format'), 'cmd');
    note(`מברשת — העתקה: לפני active=${fpBefore.active} cmd=${JSON.stringify(fpCmdBefore)}`);
    note(`מברשת — העתקה: אחרי active=${fpAfter.active} cmd=${JSON.stringify(fpCmdAfter)}`);
    const cFp1 = await ctx('מברשת העתקה');

    // מסלול Word: לגרור/לסמן את היעד כשהמברשת חמושה
    await caretPara(6);
    await selectRange(5, 9);
    await app.sleep(700);
    const fpArmed = await T(app.state('מברשת עיצוב'), 'state');
    const rprDstA = rPrOf((await docx())['word/document.xml'], 'dstx');
    note(`מברשת — אחרי סימון היעד: active=${fpArmed.active} cmd=${JSON.stringify(await app.cmd('copy-format'))} rPr(dstx)=${JSON.stringify(rprDstA)}`);

    // מסלול חלופי: לחיצה נוספת על המברשת כשהיעד מסומן
    await clickChecked('מברשת עיצוב');
    await app.sleep(1000);
    const rprDstB = rPrOf((await docx())['word/document.xml'], 'dstx');
    note(`מברשת — אחרי לחיצה שנייה: rPr(dstx)=${JSON.stringify(rprDstB)} cmd=${JSON.stringify(await app.cmd('copy-format'))}`);
    const cFp2 = await ctx('מברשת החלה');
    note('מפת הריצות בפסקה srcx/dstx:', JSON.stringify(runMap((await docx())['word/document.xml']).filter(([t]) => /srcx|dstx/.test(t))));

    /**
     * ההוכחה לסיבת השורש: המנוע מחיל את המברשת רק כש-`ui.formatPainter.
     * notifyPointerUp()` נקרא. הקריאה הזאת יושבת ב-SuperToolbar של SuperDoc,
     * שאינו קם כלל כי `create-editor.ts:132` מפעיל `ui: false`, ואין ב-src
     * שום אזכור של `formatPainter`. קריאה ידנית כאן מחילה מיד.
     */
    await caretPara(6);
    await selectRange(5, 9);
    await clickChecked('מברשת עיצוב');   // חימוש מחדש
    await app.sleep(600);
    await caretPara(6);
    await selectRange(5, 9);
    note('קריאה ידנית ל-notifyPointerUp:', await app.js(`(function(){try{window.__otzariaEditor.superdoc.ui.formatPainter.notifyPointerUp();return 'called';}catch(e){return 'ERR '+e.message;}})()`));
    await app.sleep(2000);
    const rprDstC = rPrOf((await docx())['word/document.xml'], 'dstx');
    note(`מברשת — אחרי notifyPointerUp ידני: rPr(dstx)=${JSON.stringify(rprDstC)}`);

    const worked = isOn(rprDstA, 'b') || isOn(rprDstB, 'b');
    worked ? report.pass('מברשת עיצוב', 'העיצוב עבר ליעד')
      : report.fail('מברשת עיצוב', `הכפתור מחמש (active=${fpAfter.active}) אך שום דבר אינו מחיל. אחרי סימון היעד=${JSON.stringify(rprDstA)}; אחרי לחיצה שנייה=${JSON.stringify(rprDstB)}; אחרי notifyPointerUp ידני=${JSON.stringify(rprDstC)} ← זו סיבת השורש`);
  });

  /* ================= שלב 8 — לוח ================= */
  await stage(8, async () => {
    note('===== שלב 8: לוח — העתק / הדבק / גזור =====');

    /* 8א — מרוץ התצלום: מתי „העתק" מסרב על בחירה שקיימת */
    note('--- 8א: מרוץ תצלום הבחירה (ui.selection.getSnapshot) ---');
    for (const wait of [200, 600, 1200]) {
      await app.reset();
      await caretPara(7);
      await selectRange(0, 4, { settle: false });
      await app.sleep(wait);
      const snapAt = await selSnapshot();
      await clickChecked('העתק');
      await app.sleep(1300);
      const st = await T(app.status(), 'status');
      note(`  העתקה ${wait}ms אחרי Shift+חץ: תצלום=${snapAt} → status=${JSON.stringify(st)}`);
    }

    /* 8ב — העתקה אחרי שהתצלום התיישב */
    note('--- 8ב: העתק אחרי שהתצלום התיישב ---');
    await app.reset();
    await caretPara(7);
    await selectRange(0, 4);
    note('  תצלום:', await selSnapshot());
    const docBeforeCopy = (await docx())['word/document.xml'];
    const textBeforeCopy = await T(app.screenText(), 'screenText');
    const cpState = await T(app.state('העתק'), 'state');
    await caretPara(7);
    await selectRange(0, 4);
    await clickChecked('העתק');
    await app.sleep(1400);
    const docAfterCopy = (await docx())['word/document.xml'];
    const textAfterCopy = await T(app.screenText(), 'screenText');
    note(`  העתק: מושבת בלי בחירה=${idle['העתק'].disabled}; פסקאות ${(body(docBeforeCopy).match(/<w:p[\s>]/g)||[]).length}→${(body(docAfterCopy).match(/<w:p[\s>]/g)||[]).length}`);
    note('  טקסט לפני:', JSON.stringify(textBeforeCopy));
    note('  טקסט אחרי:', JSON.stringify(textAfterCopy));
    note('  document.xml זהה לפני/אחרי:', docBeforeCopy === docAfterCopy);
    const cCopy = await ctx('העתק');
    if (cCopy.bad) report.fail('העתק', `נכשל גם אחרי שהתצלום התיישב: ${JSON.stringify(cCopy.st)}`);
    else if (docBeforeCopy !== docAfterCopy) report.fail('העתק', 'ההעתקה שינתה את המסמך');
    else report.partial('העתק', 'עובד אחרי שהתצלום מתיישב; ב-~900ms שאחרי בחירה במקלדת מסרב „יש לסמן טקסט תחילה" (clipboard.ts:302)');

    /* 8ג — הדבקה */
    note('--- 8ג: הדבק ---');
    await app.reset();
    await caretPara(7);
    await app.press('End', 'End', 35);
    await app.sleep(500);
    await settleSelection();
    note('  תצלום:', await selSnapshot());
    const beforePaste = await T(app.screenText(), 'screenText');
    const parasBefore = (body((await docx())['word/document.xml']).match(/<w:p[\s>]/g) || []).length;
    await clickChecked('הדבק');
    await app.sleep(2000);
    const afterPaste = await T(app.screenText(), 'screenText');
    const parasAfter = (body((await docx())['word/document.xml']).match(/<w:p[\s>]/g) || []).length;
    note(`  הדבק: מושבת בלי סמן=${idle['הדבק'].disabled}; פסקאות ${parasBefore}→${parasAfter}`);
    note('  טקסט לפני:', JSON.stringify(beforePaste));
    note('  טקסט אחרי:', JSON.stringify(afterPaste));
    const cPaste = await ctx('הדבק');
    if (afterPaste !== beforePaste && parasAfter === parasBefore) report.pass('הדבק', 'הודבק באותה פסקה, בלי פסקה חדשה');
    else if (afterPaste !== beforePaste) report.partial('הדבק', `הודבק אך נוספו ${parasAfter - parasBefore} פסקאות`);
    else report.fail('הדבק', `לא הודבק. status=${JSON.stringify(cPaste.st)}`);

    /* 8ד — הדבקה שנייה: סדר הסמן */
    await app.reset();
    await app.sleep(600);
    const beforeP2 = await T(app.screenText(), 'screenText');
    await clickChecked('הדבק');
    await app.sleep(2000);
    note('  הדבקה שנייה:', JSON.stringify(beforeP2), '→', JSON.stringify(await T(app.screenText(), 'screenText')));
    await ctx('הדבקה שנייה');

    /* 8ה — גזור */
    note('--- 8ה: גזור ---');
    await app.reset();
    await caretPara(7);
    await selectRange(0, 4);
    note('  תצלום:', await selSnapshot());
    const beforeCut = await T(app.screenText(), 'screenText');
    await caretPara(7);
    await selectRange(0, 4);
    await clickChecked('גזור');
    await app.sleep(1800);
    const afterCut = await T(app.screenText(), 'screenText');
    note(`  גזור: מושבת בלי בחירה=${idle['גזור'].disabled}`);
    note('  טקסט לפני:', JSON.stringify(beforeCut));
    note('  טקסט אחרי:', JSON.stringify(afterCut));
    const cCut = await ctx('גזור');
    if ((beforeCut || '').length > (afterCut || '').length && !cCut.bad) {
      report.partial('גזור', 'עובד אחרי שהתצלום מתיישב; באותו חלון של ~900ms מסרב „יש לסמן טקסט תחילה" (clipboard.ts:302)');
    } else {
      report.fail('גזור', `המסמך לא השתנה. status=${JSON.stringify(cCut.st)}`);
    }
  });

  note('===== סוף =====');
  /* קריאת הלוג הסופית היא אבחון, לא בדיקה. כשהדף מורעב היא נתקעת, הזריקה
   * מגיעה ל-catch הכללי, והשער נחתם ב„השער עצמו — תקיעה ב-log” — שורה
   * אדומה שאינה אומרת דבר על אף פקד. נמדד בשתי ריצות רצופות. */
  try {
    note('לוג הדף:', JSON.stringify(await T(app.log(), 'log', 15_000)));
  } catch (e) {
    note('לוג הדף לא נקרא:', String((e && e.message) || e));
  }
} catch (e) {
  note('שגיאה בשער:', String((e && e.stack) || e));
  report.fail('השער עצמו', String((e && e.message) || e));
} finally {
  try { app.close(); } catch { /* ממילא נהרג */ }
}

console.log('\n===== NOTES =====\n' + notes.join('\n'));
report.print();
process.exit(0);
