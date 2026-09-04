/**
 * שער QA לקבוצות „פיסקה", „סגנונות" ו„עריכה" בלשונית „בית".
 *
 * כל פקד נבדק בלחיצת עכבר אמיתית, וההוכחה היא ה-docx המיוצא או מצב מנוע
 * קריא (`ui.commands`, `superdoc.config`, `ui.selection`). „הצלחה" שהפקודה
 * מדווחת אינה נספרת כהוכחה.
 *
 * ### חמישה דברים שנמדדו על המסגרת עצמה, וחייבו עזר מקומי
 * (אין לגעת ב-`harness.mjs`/`qa-api.js` — הם משותפים לשערים שרצים במקביל)
 *
 * 1. **חלון ברירת המחדל הוא 756×413.** גלריית הסגנונות וקבוצת „עריכה"
 *    יושבות בקצה הרצועה, והדיאלוגים גולשים מתחת לתחתית — לחיצה על „אישור"
 *    פשוט אינה נוחתת. השער מגדיל ל-1440×1000 דרך
 *    `Emulation.setDeviceMetricsOverride` לפני כל מדידה, והגלישה עצמה
 *    נמדדת ומדווחת כממצא נפרד.
 * 2. **`lineRect` של המסגרת רץ על `.superdoc-line, .superdoc-fragment`
 *    יחד**, וה-fragment מחזיר מלבן שלילי אחרי כל reflow (נמדד: `x = -495`).
 *    לכן `caretAt(k)` כאן לוחץ על `.superdoc-line` בלבד **ומאמת** מול
 *    `doc.selection.current()` + `blocks.list()` שהסמן באמת בפסקה k. בלי
 *    האימות הזה כל הבדיקות מכאן ואילך נוחתות על אותה פסקה, וזה נמדד.
 * 3. **`galleryRect` מחזיר מלבן גם לכרטיס שגולל מחוץ למכל החותך** — שני
 *    הסגנונות האחרונים לא הוחלו מעולם, והשער דיווח „לא נכתב pStyle".
 *    `clickStyle` גולל פנימה ומוודא שהכרטיס בתוך המכל לפני הלחיצה.
 * 4. **קריאה ל-Document API שנתקעת מקפיאה את `awaitPromise` של CDP לנצח.**
 *    כל קריאה כזאת מרוצה מול שעון בתוך הדף.
 * 5. **המנוע מתדרדר אחרי כמה עשרות `export.toDocx` באותו דף** (נמדד: ייצוא
 *    שלא חזר תוך 60 שניות, ואחריו דף שאינו מגיב). לכן השער רץ בשני
 *    שלבים, כל אחד בדפדפן משלו.
 *
 * יציאה 9362 — שערים אחרים רצים במקביל על יציאות אחרות.
 */
import { execSync } from 'node:child_process';
import { openApp, createReport, sleep } from './harness.mjs';

const PORT = Number(process.env.QA_PORT ?? 9362);
const report = createReport('בית — פיסקה, סגנונות, עריכה');

/** דפדפן ששרד ריצה קודמת מחזיק את היציאה, ו-`openPage` מתחבר אליו במקום
 *  לחדש — כלומר המסמך של הריצה הקודמת נמדד כאילו הוא של זו (נמדד). */
function killStray() {
  try {
    execSync(`pkill -9 -f "remote-debugging-port=${PORT}" || true`, { stdio: 'ignore' });
  } catch { /* אין מה לנקות */ }
}

/* ------------------------------------------------------------------ */
/* קריאת ה-OOXML                                                       */
/* ------------------------------------------------------------------ */

const short = (s, n = 240) => (s == null ? 'null' : String(s).slice(0, n));

/**
 * שעון על הבטחה שעלולה לא לחזור לעולם — לא רק `docx()`. נמדד (ריצה זו):
 * אחרי כ-29 ייצואי docx באותו דף המנוע נדרדר, ו-`app.log()` הפשוט ביותר
 * (קריאת מערך שכבר קיים בדף) נשאר תלוי לנצח על ה-`awaitPromise` של CDP —
 * לא רק Document API. השלב עצמו סיים את כל הצעדים שלו (רואים בלוג), ורק
 * הקריאה הסוגרת של `phase()` קפאה, ובלעדי שעון כאן השער כולו לא היה חוזר.
 */
function withTimeout(promise, ms, label) {
  let timer;
  const guard = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ __timedOut: true, label }), ms);
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

function paragraphs(files) {
  return (files?.['word/document.xml'] ?? '').match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) ?? [];
}

/** ה-pPr של הפסקה שהטקסט שלה הוא `text`. '' כשאין pPr, null כשאין פסקה. */
function pPrOf(files, text) {
  const p = paragraphs(files).find((x) => x.includes(`>${text}<`));
  if (!p) return null;
  return p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? '';
}

/** מפה טקסט→pPr — לראות בבת אחת על מי נחתה הפעולה. */
function pPrMap(files) {
  const out = {};
  for (const p of paragraphs(files)) {
    out[p.match(/<w:t[^>]*>([^<]*)<\/w:t>/)?.[1] ?? ''] = p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? '';
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* העזרים שמעל `app`                                                   */
/* ------------------------------------------------------------------ */

function makeCtx(app) {
  const js = app.js;

  const TIMED = (ms) => `new Promise(r => setTimeout(() => r(null), ${ms}))`;

  const CURRENT_BLOCK = `(async () => { try {
    const d = window.__otzariaEditor.superdoc.activeEditor.doc;
    const s = await Promise.race([d.selection.current(), ${TIMED(5000)}]);
    const listed = await Promise.race([d.blocks.list(), ${TIMED(5000)}]);
    if (!s || !listed) return JSON.stringify({ idx: -1, timeout: true });
    const blocks = (listed && listed.blocks) || [];
    const id = ((s && s.target && s.target.segments) || []).map(x => x.blockId).find(Boolean);
    return JSON.stringify({ idx: blocks.findIndex(b => b.nodeId === id), n: blocks.length, empty: s && s.empty });
  } catch (e) { return JSON.stringify({ idx: -1, error: String(e && e.message) }); } })()`;

  const currentBlock = () => js(CURRENT_BLOCK).then(JSON.parse);

  /** מלבן השורה ה-k (`.superdoc-line` בלבד), עם נקודת לחיצה בתוך הטקסט. */
  const LINE = (k) => `(() => {
    const e = document.querySelectorAll('.superdoc-line')[${k}];
    if (!e) return 'null';
    const r = e.getBoundingClientRect();
    return JSON.stringify({ x: Math.round(r.x + r.width - 14), y: Math.round(r.y + r.height / 2),
      left: Math.round(r.x + 6), right: Math.round(r.x + r.width - 6), text: (e.textContent || '').slice(0, 20) });
  })()`;

  /** מיקום הטקסט בשורה k ביחס לתיבתה — ההוכחה הוויזואלית ליישור. */
  const TEXT_BOX = (k) => `(() => {
    const e = document.querySelectorAll('.superdoc-line')[${k}];
    if (!e) return 'null';
    const box = e.getBoundingClientRect();
    const range = document.createRange(); range.selectNodeContents(e);
    const t = range.getBoundingClientRect();
    return JSON.stringify({ left: Math.round(t.left - box.left), right: Math.round(box.right - t.right),
      w: Math.round(t.width), box: Math.round(box.width) });
  })()`;

  /** ממקמת סמן בפסקה k ומאמתת מול המנוע; reflow מזיז את הגאומטריה תוך כדי. */
  async function caretAt(k) {
    let last = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const raw = await js(LINE(k));
      if (raw === 'null') throw new Error(`אין שורה ${k}`);
      const r = JSON.parse(raw);
      await app.clickAt(r.x, r.y);
      await app.sleep(450);
      last = await currentBlock();
      if (last.idx === k) return { ...r, ...last };
      await app.sleep(400);
    }
    throw new Error(`הסמן לא הגיע לפסקה ${k} (נמצא ב-${JSON.stringify(last)})`);
  }

  /** בוחרת את הפסקה k כטווח: גרירה מקצה לקצה. */
  async function selectPara(k) {
    const r = JSON.parse(await js(LINE(k)));
    const m = (type, x, buttons) => app.cdp.send('Input.dispatchMouseEvent',
      { type, x, y: r.y, button: buttons ? 'left' : 'none', buttons, clickCount: 1 });
    await m('mouseMoved', r.right, 0);
    await m('mousePressed', r.right, 1);
    await app.sleep(80);
    await m('mouseMoved', r.left, 1);
    await app.sleep(80);
    await app.cdp.send('Input.dispatchMouseEvent',
      { type: 'mouseReleased', x: r.left, y: r.y, button: 'left', buttons: 0, clickCount: 1 });
    await app.sleep(700);
    return { rect: r, block: await currentBlock(), selection: await app.selection() };
  }

  /** לחיצה על אלמנט לפי בורר CSS — אחרי גלילה לתוך המסך, עם דיווח אם הוא בחוץ. */
  async function clickEl(selector, index = 0, after = 700) {
    const raw = await js(`(() => {
      const e = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
      if (!e) return 'null';
      e.scrollIntoView({ block: 'center' });
      const r = e.getBoundingClientRect();
      return JSON.stringify({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2),
        inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, disabled: !!e.disabled });
    })()`);
    if (raw === 'null') return { found: false };
    const r = JSON.parse(raw);
    await app.clickAt(r.x, r.y);
    await app.sleep(after);
    return { found: true, ...r };
  }

  /** כתיבה לשדה לפי בורר CSS (`input`+`change`, כדי ש-v-model יראה). */
  const fill = (selector, index, value) =>
    js(`(() => {
      const e = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
      if (!e) return 'not-found';
      if (e.type === 'checkbox' || e.type === 'radio') e.checked = ${JSON.stringify(!!value)};
      else e.value = ${JSON.stringify(String(value))};
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
      return 'ok';
    })()`);

  /** ייצוא docx עם שעון — ייצוא שנתקע לא ישתק את השער כולו. */
  async function docx(label = '') {
    let timer;
    const guard = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`ייצוא ה-docx נתקע (${label})`)), 60_000);
    });
    try {
      return await Promise.race([app.docx(), guard]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** לחיצה על כרטיס סגנון — אחרי גלילה שלו לתוך המכל החותך. */
  async function clickStyle(label) {
    const raw = await js(`(() => {
      const card = Array.from(document.querySelectorAll('.style-card'))
        .find(c => (c.getAttribute('data-tip-title') || '') === ${JSON.stringify(label)});
      if (!card) return 'null';
      card.scrollIntoView({ block: 'nearest', inline: 'center' });
      const r = card.getBoundingClientRect();
      const box = card.closest('.style-cards-scroll').getBoundingClientRect();
      return JSON.stringify({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2),
        inBox: r.left >= box.left - 1 && r.right <= box.right + 1, disabled: !!card.disabled });
    })()`);
    if (raw === 'null') return { found: false };
    await app.sleep(500);
    const r = JSON.parse(raw);
    await app.clickAt(r.x, r.y);
    await app.sleep(1500);
    return { found: true, ...r };
  }

  async function clean() {
    const status = await withTimeout(app.status(), 8_000, 'status');
    const messages = await withTimeout(app.messages(), 8_000, 'messages');
    const log = await withTimeout(app.log(), 8_000, 'log');
    if (status?.__timedOut || messages?.__timedOut || log?.__timedOut) {
      return { ok: false, detail: 'הדף הפסיק להגיב (timeout על status/messages/log) — ככל הנראה הידרדרות המנוע אחרי הרבה ייצואים באותו דף', status: null, unresponsive: true };
    }
    const errors = [
      status?.error ? `status: ${status.text}` : null,
      messages.length ? `messages: ${JSON.stringify(messages)}` : null,
      log.length ? `log: ${JSON.stringify(log)}` : null,
    ].filter(Boolean);
    return { ok: errors.length === 0, detail: errors.join(' | '), status };
  }

  /** סוגרת כל דיאלוג שנשאר פתוח — אחרת הצעד הבא מודד את הדיאלוג הקודם. */
  async function closeDialogs() {
    for (let i = 0; i < 4; i++) {
      const open = JSON.parse(await js(`JSON.stringify(Array.from(document.querySelectorAll('[role="dialog"]')).map(d=>d.className))`));
      if (open.length === 0) return;
      await app.escape();
      await app.sleep(300);
    }
    console.log('!! דיאלוגים שנשארו פתוחים:', await js(`JSON.stringify(Array.from(document.querySelectorAll('[role="dialog"]')).map(d=>d.className))`));
  }

  async function step(name, fn) {
    try {
      await app.reset();
      await fn();
    } catch (error) {
      report.fail(name, `השער זרק: ${error?.message ?? error}`);
      console.log(`!! ${name}: ${error?.stack ?? error}`);
    }
  }

  /** זורעת שש פסקאות ומאמתת שהן אכן שש. */
  async function seed(lines) {
    await app.caret(1);
    for (let i = 0; i < lines.length; i++) {
      await app.type(lines[i]);
      if (i < lines.length - 1) { await app.press('Enter', 'Enter', 13); await app.sleep(350); }
    }
    await app.sleep(2500);
    const files = await docx('זריעה');
    const paras = paragraphs(files);
    console.log('טקסט על המסך:', JSON.stringify(await app.screenText()));
    console.log('פסקאות ב-docx:', paras.length, '| pPr התחלתי:', JSON.stringify(pPrMap(files)));
    if (paras.length !== lines.length) report.fail('זריעת המסמך', `${paras.length} פסקאות במקום ${lines.length}`);
    return files;
  }

  return { js, currentBlock, caretAt, selectPara, clickEl, fill, docx, clickStyle, clean, closeDialogs, step, seed, LINE, TEXT_BOX };
}

/** מריצה שלב בדפדפן משלו — המנוע מתדרדר אחרי כמה עשרות ייצואים. */
/**
 * שעון גורף על כל גוף השלב — לא רק על קריאה בודדת.
 *
 * נמדד (שתי ריצות עצמאיות, זהות): התהליך נתקע לצמיתות מיד אחרי הצעד
 * „תפריט פסקה — בחלון נמוך" (הקטנת החלון ל-756×413 כשדיאלוג הפסקה פתוח),
 * ואף פעם לא הגיע לשלב ב׳ — לא כי `body()` המשיך לרוץ לאט, אלא כי איזשהו
 * `js()` גולמי בתוך הצעד הזה (למשל בתוך `closeDialogs`) חיכה לתשובת CDP
 * שהדף המוקפא לא ישלח לעולם, וללא שעון על כל הגוף ה-`await phase(...)`
 * העליון לא נפתר — וה-Node עצמו קרס עם „Detected unsettled top-level
 * await" אחרי שה-WebSocket מת. שעון פר-קריאה (כמו על `docx()`) לא מספיק
 * כשהתקיעה יכולה לקרות בכל אחת מעשרות הקריאות הגולמיות שאין להן שעון
 * (`closeDialogs`, `clickEl`, `js(LINE(k))` וכו') — לכן השעון כאן עוטף
 * את כל גוף השלב, ו-`killStray()` ב-finally הורג את תהליך Chrome
 * בכוח בלי להמתין ל-`app.close()` שעצמו עשוי להיתלות מול דף מת.
 */
const PHASE_BODY_TIMEOUT_MS = 150_000;

async function phase(label, body) {
  killStray();
  await sleep(1500);
  console.log(`\n########## ${label} ##########`);
  const app = await openApp({ name: 'home-para', port: PORT });
  try {
    console.log('חלון לפני ההגדלה:', await app.js('JSON.stringify({w:innerWidth,h:innerHeight})'));
    await app.cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await app.sleep(2500);
    console.log('חלון אחרי ההגדלה:', await app.js('JSON.stringify({w:innerWidth,h:innerHeight})'));
    await app.tab('בית');
    const outcome = await Promise.race([
      body(app, makeCtx(app)).then(() => ({ finished: true })),
      new Promise((resolve) => setTimeout(() => resolve({ finished: false }), PHASE_BODY_TIMEOUT_MS)),
    ]);
    if (!outcome.finished) {
      report.fail(`השלב „${label}" נתקע`,
        `הדף הפסיק להגיב באמצע השלב ולא סיים בתוך ${PHASE_BODY_TIMEOUT_MS}ms — זהו תקיעה של הדפדפן/השער, לא של המשתמש האמיתי (ראו תיעוד ב-docs). כל צעד שלא הגיע להירשם עד כה בדוח לא נמדד בריצה הזאת`);
      console.log(`!! ${label}: תקוע — לא סיים בתוך ${PHASE_BODY_TIMEOUT_MS}ms, ממשיכים הלאה בכוח`);
    } else {
      const tailLog = await withTimeout(app.log(), 8_000, 'end-of-phase log');
      console.log('לוג הדף בסוף השלב:', tailLog?.__timedOut ? 'timeout — הדף לא הגיב (המנוע ככל הנראה נדרדר)' : JSON.stringify(tailLog));
    }
  } catch (error) {
    report.fail(`השלב „${label}"`, `נפל: ${error?.message ?? error}`);
    console.log(`!! ${label}: ${error?.stack ?? error}`);
  } finally {
    killStray();
    try { app.close(); } catch { /* הדף כבר מת — הריגת התהליך למעלה מספיקה */ }
  }
  await sleep(1500);
}

const LINES = ['alpha rho', 'beta', 'gamma', 'delta', 'epsilon rho', 'zeta'];

/* ================================================================== */
/* שלב א' — פיסקה                                                      */
/* ================================================================== */

await phase('שלב א — קבוצת „פיסקה"', async (app, ctx) => {
  const { js, caretAt, selectPara, clickEl, fill, docx, clickStyle, clean, closeDialogs, step, seed, TEXT_BOX } = ctx;

  /* -------- מצב הפתיחה --------
   *
   * השורה הזאת מדדה עד עכשיו את ההפוך: „מסמך טרי הוא בלי סמן, ולכן כל פקדי
   * הפסקה מושבתים ב-`reason=selection-required`”. זה אינו נכון יותר, ולא
   * מפני שמשהו נשבר — `applyDocumentStartCaret` (engine/caret-anchor.ts,
   * נקרא בסוף `openDocumentInto`) מציב סמן בתחילת המסמך בפתיחה, כמו Word,
   * כי קודם כל הקלדה נבלעה עד קליק עכבר.
   *
   * ומצב „בלי סמן” אינו בר-השגה כאן: `app.reset()` מנקה את הודעות הדמה
   * ואינו נוגע בבחירה, ואין דרך אחרת בשער לבטל סמן שהוצב. לכן השורה מודדת
   * עכשיו את מה שהפיצ'ר מבטיח — שאפשר לעצב מיד עם הפתיחה, בלי קליק מקדים —
   * ואת מה שלא השתנה: „סימני עיצוב” זמין כי הוא אינו תלוי בחירה.
   *
   * נמדד לפני ואחרי, על אותה מכונה: על d38a36c ‏`indent-increase` חזר
   * `enabled:false, reason:"selection-required"`, ועל 8c776e9 ‏`enabled:true`.
   */
  await step('פתיחה עם סמן — פקדי הפסקה זמינים מיד', async () => {
    const ids = ['bullet-list', 'numbered-list', 'indent-increase', 'indent-decrease',
      'direction-rtl', 'direction-ltr', 'text-align', 'line-height', 'linked-style'];
    const states = {};
    for (const id of ids) states[id] = await app.cmd(id);
    const names = ['תבליטים', 'מספור', 'הקטן הזחה', 'הגדל הזחה', 'כיוון פסקה מימין לשמאל',
      'כיוון פסקה משמאל לימין', 'יישור לימין', 'מרכז', 'יישור לשמאל', 'יישור לשני הצדדים'];
    const ui = {};
    for (const n of names) ui[n] = (await app.state(n)).disabled;
    const gallery = await app.galleryItems();
    const marks = await app.cmd('formatting-marks');
    console.log('בפתיחה — פקודות:', JSON.stringify(states));
    console.log('בפתיחה — מושבתים:', JSON.stringify(ui), '| גלריה מושבתת?', gallery.every((g) => g.disabled), '| marks:', JSON.stringify(marks));
    Object.values(ui).every((disabled) => disabled === false) &&
    ids.every((id) => states[id].enabled === true) &&
    gallery.every((g) => !g.disabled) &&
    marks.enabled
      ? report.pass('פתיחה עם סמן — פקדי הפסקה זמינים מיד', 'סמן הפתיחה הוצב: כל פקדי הפסקה והגלריה זמינים בלי קליק מקדים, ו„סימני עיצוב" זמין כתמיד')
      : report.fail('פתיחה עם סמן — פקדי הפסקה זמינים מיד', JSON.stringify({ ui, states, galleryDisabled: gallery.map((g) => g.disabled), marks }));
  });

  await seed(LINES);

  /* -------- יישור -------- */
  const ALIGN = [
    ['יישור לימין', 'right', 'right'],
    ['מרכז', 'center', 'center'],
    ['יישור לשמאל', 'left', 'left'],
    ['יישור לשני הצדדים', 'justify', null],
  ];
  for (const [label, cmdValue, visual] of ALIGN) {
    await step(label, async () => {
      await caretAt(0);
      const before = await app.state(label);
      if (before.disabled) { report.fail(label, `מושבת עם סמן: ${JSON.stringify(before)}`); return; }
      await app.click(label);
      await app.sleep(600);
      const after = await app.state(label);
      const cmd = await app.cmd('text-align');
      const box = JSON.parse((await js(TEXT_BOX(0))) ?? 'null');
      const files = await docx(label);
      const pPr = pPrOf(files, 'alpha rho');
      const jc = (pPr || '').match(/<w:jc w:val="([^"]+)"\/>/)?.[1] ?? null;
      const bidi = /<w:bidi\s*\/>/.test(pPr || '');
      const c = await clean();
      const seen = box === null ? null
        : Math.abs(box.left - box.right) <= 4 ? 'center'
          : box.left < box.right ? 'left' : 'right';
      console.log(`${label}: jc=${jc} bidi=${bidi} box=${JSON.stringify(box)} נראה=${seen} active=${after.active} cmd=${JSON.stringify(cmd)}`);
      const other = Object.entries(pPrMap(files)).filter(([t, v]) => t !== 'alpha rho' && /<w:jc/.test(v));
      if (jc === null) report.fail(label, `לא נכתב <w:jc>: pPr=${short(pPr, 160)}`);
      else if (!c.ok) report.fail(label, `נכתב w:jc="${jc}" אך נותרה שגיאה — ${c.detail}`);
      else if (other.length) report.fail(label, `נכתב גם לפסקאות אחרות: ${JSON.stringify(other)}`);
      else if (visual && seen !== visual) report.fail(label, `נכתב w:jc="${jc}" אך על המסך הטקסט ${seen} (${JSON.stringify(box)})`);
      else if (cmd.value !== cmdValue) report.partial(label, `w:jc="${jc}" אך הפקודה מדווחת value=${cmd.value}`);
      else if (!after.active) report.partial(label, `w:jc="${jc}" אך החיווי הפעיל לא נדלק`);
      else report.pass(label, `w:jc="${jc}"${bidi ? ' (פסקת bidi — left/right הם start/end)' : ''}${visual ? `, הטקסט ${seen} על המסך` : `, הטקסט ${seen} (שורה יחידה — גם Word אינו מותח שורה אחרונה)`}, חיווי דלוק`);
    });
  }

  await step('יישור — לחיצה שנייה', async () => {
    await caretAt(0);
    await app.click('מרכז'); await app.sleep(400);
    await app.click('מרכז'); await app.sleep(600);
    const jc = (pPrOf(await docx('align2'), 'alpha rho') || '').match(/<w:jc w:val="([^"]+)"\/>/)?.[1] ?? null;
    console.log('לחיצה שנייה על „מרכז": jc=', jc);
    jc === 'center'
      ? report.pass('יישור — לחיצה שנייה', 'לחיצה חוזרת שומרת את היישור (ב-Word אינו מתג)')
      : report.partial('יישור — לחיצה שנייה', `לחיצה שנייה שינתה ל-${jc}`);
  });

  await step('יישור על טווח מסומן', async () => {
    const sel = await selectPara(1);
    console.log('טווח:', JSON.stringify(sel));
    await app.click('יישור לשני הצדדים');
    await app.sleep(600);
    const jc = (pPrOf(await docx('range'), 'beta') || '').match(/<w:jc w:val="([^"]+)"\/>/)?.[1] ?? null;
    console.log('טווח מסומן → jc=', jc, '| בחירה=', JSON.stringify(await app.selection()));
    jc === 'both'
      ? report.pass('יישור על טווח מסומן', `בחירת טווח (empty=${sel.selection?.empty}) → w:jc="both"`)
      : report.fail('יישור על טווח מסומן', `jc=${jc}; ${JSON.stringify(sel)}`);
  });

  /* -------- מרווח בין שורות -------- */
  await step('מרווח בין שורות', async () => {
    await caretAt(1);
    const opts = await app.options('מרווח בין שורות');
    console.log('אפשרויות:', JSON.stringify(opts));
    const results = [];
    for (const opt of opts) {
      await caretAt(1);
      await app.selectValue('מרווח בין שורות', opt.value);
      await app.sleep(900);
      const pPr = pPrOf(await docx(`spacing-${opt.value}`), 'beta') || '';
      results.push({
        value: opt.value,
        line: pPr.match(/<w:spacing[^>]*w:line="(\d+)"/)?.[1] ?? null,
        rule: pPr.match(/<w:spacing[^>]*w:lineRule="([^"]+)"/)?.[1] ?? null,
        shown: (await app.state('מרווח בין שורות')).value,
        expected: Math.round(Number(opt.value) * 240),
      });
      console.log(`מרווח ${opt.value}: ${JSON.stringify(results[results.length - 1])}`);
    }
    const c = await clean();
    const bad = results.filter((r) => Number(r.line) !== r.expected);
    const shownBad = results.filter((r) => r.shown !== r.value);
    if (bad.length) report.fail('מרווח בין שורות', `ערכים שלא נכתבו: ${JSON.stringify(bad)}`);
    else if (shownBad.length) report.partial('מרווח בין שורות', `נכתבו נכון אך הבורר מציג ערך אחר: ${JSON.stringify(shownBad)}`);
    else if (!c.ok) report.fail('מרווח בין שורות', c.detail);
    else report.pass('מרווח בין שורות', `כל ${results.length} הערכים: ${results.map((r) => `${r.value}→w:line=${r.line}`).join(', ')} (lineRule=auto)`);
  });

  /* -------- הזחה -------- */
  await step('הגדל הזחה', async () => {
    await caretAt(2);
    const before = await app.state('הגדל הזחה');
    if (before.disabled) { report.fail('הגדל הזחה', 'מושבת עם סמן'); return; }
    await app.click('הגדל הזחה'); await app.sleep(700);
    const one = (pPrOf(await docx('ind1'), 'gamma') || '').match(/<w:ind[^>]*>/)?.[0] ?? null;
    await caretAt(2);
    await app.click('הגדל הזחה'); await app.sleep(700);
    const files = await docx('ind2');
    const two = (pPrOf(files, 'gamma') || '').match(/<w:ind[^>]*>/)?.[0] ?? null;
    const c = await clean();
    console.log('הגדל הזחה: אחת=', one, '| שתיים=', two, '|', c.detail, '| כל הפסקאות:', JSON.stringify(pPrMap(files)));
    const v1 = Number(one?.match(/w:(?:left|start)="(-?\d+)"/)?.[1] ?? NaN);
    const v2 = Number(two?.match(/w:(?:left|start)="(-?\d+)"/)?.[1] ?? NaN);
    if (!Number.isFinite(v1)) report.fail('הגדל הזחה', `לא נכתב w:ind — pPr=${short(pPrOf(files, 'gamma'))}`);
    else if (!(v2 > v1)) report.fail('הגדל הזחה', `לחיצה שנייה לא הגדילה: ${v1} → ${v2}`);
    else if (!c.ok) report.fail('הגדל הזחה', `נכתב אך נותרה שגיאה — ${c.detail}`);
    else report.pass('הגדל הזחה', `w:ind ${v1} → ${v2} twips (${v2 - v1} = 1.27 ס"מ לכל לחיצה, כמו Word)`);
  });

  await step('הקטן הזחה', async () => {
    await caretAt(2);
    const beforeV = Number((pPrOf(await docx('dedent-b'), 'gamma') || '').match(/w:(?:left|start)="(-?\d+)"/)?.[1] ?? NaN);
    await app.click('הקטן הזחה'); await app.sleep(700);
    const afterV = Number((pPrOf(await docx('dedent-a'), 'gamma') || '').match(/w:(?:left|start)="(-?\d+)"/)?.[1] ?? 0);
    const c = await clean();
    console.log('הקטן הזחה:', beforeV, '→', afterV, '|', c.detail);
    Number.isFinite(beforeV) && afterV < beforeV && c.ok
      ? report.pass('הקטן הזחה', `w:ind ${beforeV} → ${afterV} twips`)
      : report.fail('הקטן הזחה', `${beforeV} → ${afterV}; ${c.detail}`);
  });

  await step('הקטן הזחה בהזחה אפס', async () => {
    await caretAt(3);
    await app.click('הקטן הזחה'); await app.sleep(700);
    const pPr = pPrOf(await docx('dedent0'), 'delta') || '';
    const c = await clean();
    console.log('הקטן הזחה על פסקה ללא הזחה: pPr=', short(pPr), '| status=', JSON.stringify(c.status));
    if (/w:(?:left|start)="-/.test(pPr)) report.fail('הקטן הזחה בהזחה אפס', `נכתבה הזחה שלילית: ${short(pPr)}`);
    else if (c.status?.error) report.partial('הקטן הזחה בהזחה אפס',
      `לא נכתבה הזחה שלילית (טוב), אבל המשתמש מקבל הודעת שגיאה על NO_OP: „${c.status.text}" — ב-Word הלחיצה פשוט אינה עושה דבר`);
    else report.pass('הקטן הזחה בהזחה אפס', `לא נכתבה הזחה שלילית (pPr=${short(pPr, 90)})`);
  });

  /* -------- כיווניות --------
   * docs/button-audit.md, שורה ה' (״קשה לתקן״): „הכתיבה מצליחה; הפקודה אינה
   * מדווחת active”. המעקף (HomeTab.vue) קורא bidi ישירות מה-pPr דרך
   * readParagraphIndents, ולא מ-cmd.active — ולכן שלושת הצעדים הבאים בודקים
   * את חיווי ה-DOM (app.state(...).active, שקורא class="active" מהכפתור
   * עצמו) ולא את cmd.active, שנשאר false גם אחרי התיקון (זו בדיוק העובדה
   * שהמעקף עוקף).
   */
  await step('כיוון פסקה מימין לשמאל', async () => {
    await caretAt(3);
    const base = pPrOf(await docx('rtl-b'), 'delta');
    const before = await app.state('כיוון פסקה מימין לשמאל');
    if (before.disabled) { report.fail('כיוון פסקה מימין לשמאל', 'מושבת עם סמן'); return; }
    await app.click('כיוון פסקה מימין לשמאל');
    await app.sleep(700);
    const pPr = pPrOf(await docx('rtl-a'), 'delta') || '';
    const after = await app.state('כיוון פסקה מימין לשמאל');
    const afterLtr = await app.state('כיוון פסקה משמאל לימין');
    const cmd = await app.cmd('direction-rtl');
    const c = await clean();
    console.log('RTL: לפני=', short(base), '| אחרי=', short(pPr), '| active(DOM)=', after.active, '| activeLtr(DOM)=', afterLtr.active, JSON.stringify(cmd), '|', c.detail);
    const hasBidi = /<w:bidi\s*\/>|<w:bidi w:val="(1|true|on)"\/>/.test(pPr);
    if (!hasBidi) report.fail('כיוון פסקה מימין לשמאל', `אין <w:bidi/> אחרי הלחיצה: ${short(pPr)} | ${c.detail}`);
    else if (!c.ok) report.fail('כיוון פסקה מימין לשמאל', `<w:bidi/> נכתב אך נותרה שגיאה — ${c.detail}`);
    else if (!after.active) report.fail('כיוון פסקה מימין לשמאל',
      `<w:bidi/> נכתב, אבל החיווי (class="active") לא נדלק — cmd.active=${cmd?.active} (הבאג המתועד), והמעקף שקורא bidi מה-pPr לא תפס`);
    else if (afterLtr.active) report.fail('כיוון פסקה מימין לשמאל',
      `„מימין לשמאל" דלוק אך „משמאל לימין" נשאר דלוק גם הוא — לא הדדי`);
    else report.pass('כיוון פסקה מימין לשמאל', `<w:bidi/> נכתב, חיווי דלוק (נקרא מה-pPr; cmd.active=${cmd?.active} כמתועד)`);
  });

  await step('כיוון פסקה משמאל לימין', async () => {
    await caretAt(3);
    await app.click('כיוון פסקה משמאל לימין');
    await app.sleep(700);
    const pPr = pPrOf(await docx('ltr'), 'delta') || '';
    const ltr = await app.state('כיוון פסקה משמאל לימין');
    const rtl = await app.state('כיוון פסקה מימין לשמאל');
    const dom = JSON.parse(await js(`(() => { const e = document.querySelectorAll('.superdoc-line')[3];
      return e ? JSON.stringify({ dir: e.getAttribute('dir'), align: e.style.textAlign }) : 'null'; })()`));
    const c = await clean();
    console.log('LTR: pPr=', short(pPr), '| activeLtr(DOM)=', ltr.active, 'activeRtl(DOM)=', rtl.active, '| DOM=', JSON.stringify(dom), '|', c.detail);
    const bidiOff = !/<w:bidi\s*\/>/.test(pPr);
    const bidiZero = /<w:bidi w:val="0"\/>/.test(pPr);
    if (!bidiOff) report.fail('כיוון פסקה משמאל לימין', `<w:bidi/> נשאר: ${short(pPr)} | ${c.detail}`);
    else if (!c.ok) report.fail('כיוון פסקה משמאל לימין', `נותרה שגיאה — ${c.detail}`);
    else if (!ltr.active) report.fail('כיוון פסקה משמאל לימין',
      `המסמך השתנה כראוי — ${bidiZero ? '<w:bidi w:val="0"/>' : 'ה-bidi הוסר'} וה-DOM ${JSON.stringify(dom)} — אבל החיווי (class="active") לא נדלק`);
    else if (rtl.active) report.fail('כיוון פסקה משמאל לימין',
      `„משמאל לימין" דלוק, אבל „מימין לשמאל" נשאר דלוק גם הוא — לא הדדי`);
    else report.pass('כיוון פסקה משמאל לימין', `${bidiZero ? '<w:bidi w:val="0"/>' : 'ה-bidi הוסר'}, DOM ${JSON.stringify(dom)}, חיווי דלוק`);
  });

  await step('כיוון פסקה — מעבר בין פסקאות מעדכן חי, בלי לחיצה נוספת', async () => {
    // פסקה 3 (delta) הופכת ל-LTR בלחיצה; פסקה 1 (beta) נשארת RTL כברירת
    // המחדל של המסמך. המעבר ביניהן דרך הסמן (לא דרך הכפתור) הוא בדיוק מה
    // שההסבר בתיעוד תובע: „עם עדכון live כשהסמן זז”.
    await caretAt(3);
    await app.click('כיוון פסקה משמאל לימין');
    await app.sleep(700);
    const onDelta = { ltr: await app.state('כיוון פסקה משמאל לימין'), rtl: await app.state('כיוון פסקה מימין לשמאל') };

    await caretAt(1); // beta — לא נגעו בה, נשארת bidi כברירת המחדל
    await app.sleep(400); // > BIDI_SELECTION_DEBOUNCE_MS (150ms) שב-HomeTab.vue
    const onBeta = { ltr: await app.state('כיוון פסקה משמאל לימין'), rtl: await app.state('כיוון פסקה מימין לשמאל') };

    await caretAt(3); // חזרה ל-delta
    await app.sleep(400);
    const backOnDelta = { ltr: await app.state('כיוון פסקה משמאל לימין'), rtl: await app.state('כיוון פסקה מימין לשמאל') };

    const c = await clean();
    console.log('מעבר פסקאות: על delta=', JSON.stringify(onDelta), '| על beta=', JSON.stringify(onBeta), '| חזרה ל-delta=', JSON.stringify(backOnDelta), '|', c.detail);

    if (!onDelta.ltr.active || onDelta.rtl.active) {
      report.fail('כיוון פסקה — מעבר בין פסקאות', `מצב פתיחה שגוי על delta: ${JSON.stringify(onDelta)}`);
    } else if (!onBeta.rtl.active || onBeta.ltr.active) {
      report.fail('כיוון פסקה — מעבר בין פסקאות',
        `מעבר לפסקת beta (RTL כברירת מחדל, בלי לחיצה) לא עדכן את החיווי: ${JSON.stringify(onBeta)}`);
    } else if (!backOnDelta.ltr.active || backOnDelta.rtl.active) {
      report.fail('כיוון פסקה — מעבר בין פסקאות',
        `חזרה ל-delta (LTR) לא שחזרה את החיווי: ${JSON.stringify(backOnDelta)}`);
    } else if (!c.ok) {
      report.fail('כיוון פסקה — מעבר בין פסקאות', `שגיאה בשורת המצב — ${c.detail}`);
    } else {
      report.pass('כיוון פסקה — מעבר בין פסקאות',
        'delta (LTR) → beta (RTL, בלי לחיצה) → חזרה ל-delta (LTR): שלושתם עדכנו נכון');
    }
  });

  /* -------- סימני עיצוב -------- */
  await step('הצג/הסתר סימני עיצוב', async () => {
    const MARKS = `JSON.stringify({
      dom: document.querySelectorAll('.superdoc-formatting-paragraph-mark').length,
      pilcrow: (document.querySelector('.editor-stack') || document.body).textContent.split('\\u00B6').length - 1,
      cfg: !!(window.__otzariaEditor.superdoc.config &&
              window.__otzariaEditor.superdoc.config.layoutEngineOptions &&
              window.__otzariaEditor.superdoc.config.layoutEngineOptions.showFormattingMarks) })`;
    const s0 = JSON.parse(await js(MARKS));
    const c0 = await app.cmd('formatting-marks');
    await app.click('הצג/הסתר סימני עיצוב'); await app.sleep(1500);
    const s1 = JSON.parse(await js(MARKS));
    const c1 = await app.cmd('formatting-marks');
    const ui1 = await app.state('הצג/הסתר סימני עיצוב');
    /* אולי הסימנים מצוירים רק בעימוד הבא: כותבים תו ומוחקים כדי לכפות
       reflow, ומודדים שוב — כך „לא צויר" אינו „טרם צויר". */
    await caretAt(0);
    await app.type('x'); await app.sleep(700);
    await app.press('Backspace', 'Backspace', 8); await app.sleep(1500);
    const sReflow = JSON.parse(await js(MARKS));
    console.log('סימני עיצוב אחרי reflow כפוי:', JSON.stringify(sReflow));
    await app.click('הצג/הסתר סימני עיצוב'); await app.sleep(1500);
    const s2 = JSON.parse(await js(MARKS));
    const c2 = await app.cmd('formatting-marks');
    const c = await clean();
    console.log('סימני עיצוב:', JSON.stringify({ s0, s1, sReflow, s2, c0, c1, c2, ui: ui1.active }), '|', c.detail);
    const engineToggles = c0.active === false && c1.active === true && c2.active === false;
    if (!engineToggles) report.fail('הצג/הסתר סימני עיצוב', `מצב המנוע לא התהפך: ${JSON.stringify({ c0, c1, c2 })}`);
    else if (!c.ok) report.fail('הצג/הסתר סימני עיצוב', `נותרה שגיאה — ${c.detail}`);
    else if ((s1.dom > s0.dom || sReflow.dom > s0.dom) && s2.dom === s0.dom)
      report.pass('הצג/הסתר סימני עיצוב', `סימני ¶ ב-DOM ${s0.dom}→${s1.dom}→${s2.dom}, config ${s0.cfg}→${s1.cfg}→${s2.cfg}, חיווי דלוק`);
    else report.fail('הצג/הסתר סימני עיצוב',
      `המתג עצמו מתהפך (config ${s0.cfg}→${s1.cfg}→${s2.cfg}, active true/false, חיווי דלוק) אך **שום סימן ¶ אינו מצויר** — לא מיד (${s0.dom}→${s1.dom}) ולא אחרי reflow כפוי (${sReflow.dom}), על מסמך בן 6 פסקאות. כלומר הפקד מדליק דגל שאין לו ביטוי על המסך`);
  });

  /* -------- תבליטים ומספור -------- */
  await step('תבליטים', async () => {
    await caretAt(4);
    const before = await app.state('תבליטים');
    if (before.disabled) { report.fail('תבליטים', 'מושבת עם סמן'); return; }
    await app.click('תבליטים');
    await app.sleep(1400);
    const files = await docx('bullet');
    const pPr = pPrOf(files, 'epsilon rho') || '';
    const numbering = files['word/numbering.xml'] ?? null;
    const after = await app.state('תבליטים');
    const cmd = await app.cmd('bullet-list');
    const c = await clean();
    const numId = pPr.match(/<w:numId w:val="(\d+)"\/>/)?.[1] ?? null;
    console.log('תבליטים: pPr=', short(pPr), '| numId=', numId, '| cmd=', JSON.stringify(cmd), '|', c.detail);
    if (!/<w:numPr>/.test(pPr)) report.fail('תבליטים', `לא נכתב <w:numPr>: ${short(pPr)} | ${c.detail}`);
    else if (!numbering) report.partial('תבליטים', '<w:numPr> נכתב אך אין word/numbering.xml ב-docx');
    else if (!/w:numFmt w:val="bullet"/.test(numbering)) report.partial('תבליטים', '<w:numPr> נכתב אך אין numFmt="bullet"');
    else if (!c.ok) report.fail('תבליטים', `נכתב אך נותרה שגיאה — ${c.detail}`);
    else if (!after.active) report.partial('תבליטים', 'נכתב אך החיווי לא נדלק');
    else report.pass('תבליטים', `<w:numPr numId=${numId}> + pStyle=ListParagraph + numFmt="bullet" ב-numbering.xml, חיווי דלוק`);
  });

  await step('תבליטים — לחיצה שנייה מבטלת', async () => {
    await caretAt(4);
    const beforeHas = /<w:numPr>/.test(pPrOf(await docx('bullet-off-b'), 'epsilon rho') || '');
    await app.click('תבליטים'); await app.sleep(1400);
    const pPr = pPrOf(await docx('bullet-off-a'), 'epsilon rho') || '';
    const after = await app.state('תבליטים');
    console.log('ביטול תבליטים: היה numPr?', beforeHas, '| עכשיו pPr=', short(pPr), '| active=', after.active);
    beforeHas && !/<w:numPr>/.test(pPr) && !after.active
      ? report.pass('תבליטים — לחיצה שנייה מבטלת', '<w:numPr> ירד והחיווי כבה')
      : report.fail('תבליטים — לחיצה שנייה מבטלת', `היה=${beforeHas} pPr=${short(pPr)} active=${after.active}`);
  });

  await step('מספור', async () => {
    await caretAt(5);
    const before = await app.state('מספור');
    if (before.disabled) { report.fail('מספור', 'מושבת עם סמן'); return; }
    await app.click('מספור'); await app.sleep(1400);
    const files = await docx('numbered');
    const pPr = pPrOf(files, 'zeta') || '';
    const numbering = files['word/numbering.xml'] ?? '';
    const after = await app.state('מספור');
    const cmd = await app.cmd('numbered-list');
    const c = await clean();
    const numId = pPr.match(/<w:numId w:val="(\d+)"\/>/)?.[1] ?? null;
    console.log('מספור: pPr=', short(pPr), '| numId=', numId, '| cmd=', JSON.stringify(cmd), '|', c.detail);
    if (!/<w:numPr>/.test(pPr)) report.fail('מספור', `לא נכתב <w:numPr>: ${short(pPr)} | ${c.detail}`);
    else if (!/w:numFmt w:val="decimal"/.test(numbering)) report.partial('מספור', '<w:numPr> נכתב אך אין numFmt="decimal"');
    else if (!c.ok) report.fail('מספור', `נכתב אך נותרה שגיאה — ${c.detail}`);
    else if (!after.active) report.partial('מספור', 'נכתב אך החיווי לא נדלק');
    else report.pass('מספור', `<w:numPr numId=${numId}> + numFmt="decimal" lvlText="%1.", חיווי דלוק`);
    await caretAt(5);
    await app.click('מספור'); await app.sleep(1200);
  });

  /* -------- תפריט „רשימה" -------- */
  await step('תפריט „רשימה" (כל פריטיו)', async () => {
    const state = await app.state('רשימה');
    const menus = await js(`document.querySelectorAll('.ribbon-menu').length`);
    const unresolved = await js(`JSON.stringify(Array.from(new Set(Array.from(document.querySelectorAll('.word-ribbon-body *')).map(e=>e.tagName).filter(t=>/RIBBONMENU/.test(t)))))`);
    const listsApi = await js(`(() => { try { const d = window.__otzariaEditor.superdoc.activeEditor.doc;
      return JSON.stringify({ hasLists: !!d.lists, apply: typeof (d.lists && d.lists.setLevelNumberStyle) }); } catch (e) { return 'ERR ' + e.message; } })()`);
    console.log('רשימה: state=', JSON.stringify(state), '| .ribbon-menu=', menus, '| tagName לא-פתור=', unresolved, '| doc.lists=', listsApi);
    menus === 0
      ? report.fail('תפריט „רשימה" (כל פריטיו)',
        `הכפתור אינו קיים ב-DOM: .ribbon-menu=0, ובמקומו אלמנט לא-פתור ${unresolved} (Vue לא הצליח לפתור את הקומפוננטה). שבעת סגנונות המספור — כולל hebrew1 (א׳ ב׳ ג׳) — „התחל מחדש מ-1", „המשך מספור קודם" ו„המר לטקסט" בלתי-נגישים לחלוטין. ה-API עצמו קיים: ${listsApi}`)
      : report.pass('תפריט „רשימה"', `נמצא (${menus})`);
  });

  /* -------- דיאלוג „תפריט פסקה" -------- */
  await step('תפריט פסקה — פתיחה ומילוי מוקדם', async () => {
    await caretAt(2);
    const indBefore = (pPrOf(await docx('pd-pre'), 'gamma') || '').match(/<w:ind[^>]*>/)?.[0] ?? null;
    await app.click('תפריט פסקה');
    await app.sleep(1600);
    const dlg = await app.dialog();
    if (!dlg || !/פסקה/.test(dlg.label || '')) {
      report.fail('תפריט פסקה — פתיחה ומילוי מוקדם', `לא נפתח: ${JSON.stringify(dlg)} | status=${JSON.stringify((await clean()).status)}`);
      return;
    }
    const left = dlg.controls.find((x) => x.id === 'pd-ind-left')?.value;
    const expectedCm = indBefore ? (Number(indBefore.match(/w:(?:left|start)="(\d+)"/)?.[1] ?? 0) / (1440 / 2.54)).toFixed(2) : '0.00';
    console.log('דיאלוג פסקה: ind ב-docx=', indBefore, '| pd-ind-left=', left, '| צפוי=', expectedCm);
    console.log('פקדי הדיאלוג:', JSON.stringify(dlg.controls.map((x) => [x.tag, x.id || x.name, x.value, x.checked])));
    left === expectedCm
      ? report.pass('תפריט פסקה — פתיחה ומילוי מוקדם', `נפתח על מצב הפסקה האמיתי: ${indBefore} → ${left} ס"מ`)
      : report.fail('תפריט פסקה — פתיחה ומילוי מוקדם', `ה-docx אומר ${indBefore} אך הדיאלוג הציג ${left} ס"מ`);
  });

  await step('תפריט פסקה — אישור (כניסות, ריווח, שמירה)', async () => {
    if (!(await app.dialog())) { report.skip('תפריט פסקה — אישור', 'הדיאלוג אינו פתוח'); return; }
    console.log('מילוי:', await fill('#pd-ind-left', 0, '1'), await fill('#pd-ind-right', 0, '0.5'), await fill('#pd-special', 0, 'firstLine'));
    await app.sleep(250);
    console.log('amount:', await fill('.para-dialog input[type=number]', 2, '0.5'));
    console.log('spacing:', await fill('#pd-sp-before', 0, '6'), await fill('#pd-sp-after', 0, '12'));
    console.log('line:', await fill('#pd-line', 0, 'exact'));
    await app.sleep(300);
    console.log('linePt:', await fill('.para-dialog input[type=number]', 5, '18'));
    console.log('keeps:', await fill('.para-dialog input[type=checkbox]', 0, true), await fill('.para-dialog input[type=checkbox]', 1, true));
    await app.sleep(300);
    console.log('לפני אישור:', JSON.stringify((await app.dialog()).controls.map((x) => [x.id || x.name, x.value, x.checked, x.disabled])));
    const ok = await clickEl('.para-dialog .pd-btn-primary', 0, 2500);
    const err = await js(`(() => { const e = document.querySelector('.pd-error'); return e ? e.textContent.trim() : null; })()`);
    const stillOpen = !!(await app.dialog());
    const pPr = pPrOf(await docx('pd-submit'), 'gamma') || '';
    const c = await clean();
    console.log('אחרי אישור:', JSON.stringify(ok), '| עדיין פתוח?', stillOpen, '| שגיאה=', err, '| pPr=', short(pPr, 400), '|', c.detail);
    const ind = pPr.match(/<w:ind[^>]*>/)?.[0] ?? '';
    const sp = pPr.match(/<w:spacing[^>]*>/)?.[0] ?? '';
    const checks = {
      'כניסה שמאל 1 ס״מ→567': /w:(?:left|start)="567"/.test(ind),
      'כניסה ימין 0.5→283': /w:(?:right|end)="283"/.test(ind),
      'שורה ראשונה 0.5→283': /w:firstLine="283"/.test(ind),
      'ריווח לפני 6נק׳→120': /w:before="120"/.test(sp),
      'ריווח אחרי 12נק׳→240': /w:after="240"/.test(sp),
      'מרווח מדויק 18נק׳→360': /w:line="360"/.test(sp),
      'lineRule=exact': /w:lineRule="exact"/.test(sp),
      keepNext: /<w:keepNext\s*\/>/.test(pPr),
      keepLines: /<w:keepLines\s*\/>/.test(pPr),
    };
    console.log('בדיקות:', JSON.stringify(checks), '| ind=', ind, '| sp=', sp);
    const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    if (failed.length === 0 && c.ok) report.pass('תפריט פסקה — אישור', `כל תשעת השדות נכתבו: ${ind} ${sp} + <w:keepNext/><w:keepLines/>`);
    else if (failed.length === Object.keys(checks).length) report.fail('תפריט פסקה — אישור', `שום דבר לא נכתב (פתוח=${stillOpen}, שגיאה=${err}). pPr=${short(pPr, 300)} | ${c.detail}`);
    else report.partial('תפריט פסקה — אישור', `לא נכתבו: ${failed.join(' / ')} | ind=${ind} sp=${sp} | ${c.detail}`);
    await closeDialogs();
  });

  /*
   * שלוש הבדיקות הבאות — תוספת: הביקורת הסטטית מצאה שהיעד שהדיאלוג כותב
   * אליו מקבע `nodeType:'paragraph'` (במקום לגזור אותו מהבלוק בפועל), וש-
   * הכניסות נקראות רק מ-`indent.left`/`indent.right` (במקום גם מ-
   * `indent.start`/`indent.end`). השער עד כה לא בדק אף אחד מהם — כל
   * הבדיקות רצות על פסקה רגילה, ואף לא פותחות מחדש דיאלוג שכבר נסגר.
   */

  await step('תפריט פסקה — קריאה חוזרת אחרי סגירה ופתיחה (הכניסות לא מתאפסות)', async () => {
    // באג 2: `setIndentation({left,right})` נכתב בפסקה עברית (bidi) לוגית —
    // `w:start`/`w:end` ולא בהכרח `w:left`/`w:right` (נמדד ב-docs/engine-gaps.md,
    // ואותו דבר בדיוק מה שגרם לרגקס בבדיקה הקודמת לקבל את שתי הצורות). קריאה
    // שמתעלמת מ-`start`/`end` הייתה מציגה לדיאלוג הזה 0.00/0.00 — כלומר
    // „מוחקת למראית עין" את הכניסות שהמשתמש קבע ברגע שסוגרים ופותחים מחדש.
    await caretAt(2);
    await app.click('תפריט פסקה');
    await app.sleep(1600);
    const dlg = await app.dialog();
    if (!dlg || !/פסקה/.test(dlg.label || '')) {
      report.fail('תפריט פסקה — קריאה חוזרת', `לא נפתח: ${JSON.stringify(dlg)}`);
      await closeDialogs();
      return;
    }
    const left = dlg.controls.find((x) => x.id === 'pd-ind-left')?.value;
    const right = dlg.controls.find((x) => x.id === 'pd-ind-right')?.value;
    console.log('קריאה חוזרת: pd-ind-left=', left, '| pd-ind-right=', right, '(צפוי מהאישור הקודם: 1.00 / 0.50)');
    left === '1.00' && right === '0.50'
      ? report.pass('תפריט פסקה — קריאה חוזרת', `הכניסות שנקבעו קודם עדיין מוצגות: left=${left} right=${right}`)
      : report.fail('תפריט פסקה — קריאה חוזרת',
        `הדיאלוג הציג left=${left} right=${right} במקום 1.00/0.50 — הכניסות „התאפסו" בקריאה החוזרת`);
    await closeDialogs();
  });

  await step('תפריט פסקה — על כותרת (nodeType:heading, לא paragraph מקובע)', async () => {
    // באג 1: היעד שנשלח למנוע חייב לשאת את ה-nodeType האמיתי של הבלוק.
    // כתובת עם nodeType:'paragraph' מקובע על כותרת היא כתובת פסולה, וכל
    // כתיבה חזרה (setIndentation/setSpacing/setKeepOptions) הייתה נכשלת.
    await caretAt(3);
    const styled = await clickStyle('כותרת 1');
    if (!styled.found) { report.skip('תפריט פסקה — על כותרת', 'כרטיס „כותרת 1" לא נמצא בגלריה'); return; }
    await app.sleep(600);
    const pStyleBefore = (pPrOf(await docx('heading-style'), 'delta') || '').match(/w:pStyle w:val="([^"]+)"/)?.[1] ?? null;
    if (!pStyleBefore || !/heading/i.test(pStyleBefore)) {
      report.skip('תפריט פסקה — על כותרת', `הסגנון לא הוחל: pStyle=${pStyleBefore}`);
      return;
    }
    await caretAt(3);
    await app.click('תפריט פסקה'); await app.sleep(1600);
    if (!(await app.dialog())) { report.fail('תפריט פסקה — על כותרת', 'הדיאלוג לא נפתח על כותרת'); return; }
    await fill('#pd-ind-left', 0, '1.5');
    await app.sleep(250);
    const ok = await clickEl('.para-dialog .pd-btn-primary', 0, 2200);
    const err = await js(`(() => { const e = document.querySelector('.pd-error'); return e ? e.textContent.trim() : null; })()`);
    const stillOpen = !!(await app.dialog());
    const files = await docx('heading-ind');
    const pPr = pPrOf(files, 'delta') || '';
    const c = await clean();
    const ind = pPr.match(/<w:ind[^>]*>/)?.[0] ?? null;
    console.log('כותרת + הזחה: pStyle=', pStyleBefore, '| ok=', JSON.stringify(ok), '| עדיין פתוח?', stillOpen, '| שגיאה=', err, '| ind=', ind, '|', c.detail);
    ind && /w:(?:left|start)="850"/.test(ind) && c.ok
      ? report.pass('תפריט פסקה — על כותרת', `<w:ind> נכתב על פסקת כותרת (pStyle=${pStyleBefore}): ${ind}`)
      : report.fail('תפריט פסקה — על כותרת',
        `לא נכתב/נכשל על כותרת: ind=${ind} | פתוח=${stillOpen} | שגיאה=${err} | ${c.detail}`);
    await closeDialogs();
  });

  await step('תפריט פסקה — על פריט רשימה (nodeType:listItem, לא paragraph מקובע)', async () => {
    await caretAt(4);
    let pPrBefore = pPrOf(await docx('listitem-check'), 'epsilon rho') || '';
    if (!/<w:numPr>/.test(pPrBefore)) {
      await app.click('תבליטים');
      await app.sleep(1200);
      pPrBefore = pPrOf(await docx('listitem-setup'), 'epsilon rho') || '';
    }
    if (!/<w:numPr>/.test(pPrBefore)) {
      report.skip('תפריט פסקה — על פריט רשימה', `לא הצלחתי להפוך את הפסקה לפריט רשימה: ${short(pPrBefore)}`);
      return;
    }
    await caretAt(4);
    await app.click('תפריט פסקה'); await app.sleep(1600);
    if (!(await app.dialog())) { report.fail('תפריט פסקה — על פריט רשימה', 'הדיאלוג לא נפתח על פריט רשימה'); return; }
    await fill('#pd-ind-right', 0, '0.5');
    await app.sleep(250);
    const ok = await clickEl('.para-dialog .pd-btn-primary', 0, 2200);
    const err = await js(`(() => { const e = document.querySelector('.pd-error'); return e ? e.textContent.trim() : null; })()`);
    const stillOpen = !!(await app.dialog());
    const files = await docx('listitem-ind');
    const pPr = pPrOf(files, 'epsilon rho') || '';
    const c = await clean();
    const ind = pPr.match(/<w:ind[^>]*>/)?.[0] ?? null;
    console.log('פריט רשימה + הזחה: ok=', JSON.stringify(ok), '| עדיין פתוח?', stillOpen, '| שגיאה=', err, '| ind=', ind, '|', c.detail);
    ind && /w:(?:right|end)="283"/.test(ind) && /<w:numPr>/.test(pPr) && c.ok
      ? report.pass('תפריט פסקה — על פריט רשימה', `<w:ind> נכתב על פריט רשימה בלי לאבד את המספור: ${ind}`)
      : report.fail('תפריט פסקה — על פריט רשימה',
        `לא נכתב/נכשל על פריט רשימה: ind=${ind} | numPr נשאר=${/<w:numPr>/.test(pPr)} | פתוח=${stillOpen} | שגיאה=${err} | ${c.detail}`);
    await closeDialogs();
  });

  await step('תפריט פסקה — עצירות טאב', async () => {
    await caretAt(2);
    await app.click('תפריט פסקה'); await app.sleep(1600);
    if (!(await app.dialog())) { report.skip('תפריט פסקה — עצירות טאב', 'הדיאלוג לא נפתח'); return; }
    const hasTabUi = await js(`!!Array.from(document.querySelectorAll('.para-dialog legend')).find(l => l.textContent.indexOf('עצירות') >= 0)`);
    if (!hasTabUi) {
      report.partial('תפריט פסקה — עצירות טאב', 'מקטע הטאבים אינו מוצג (canManageParagraphTabs=false)');
      await closeDialogs();
      return;
    }
    const numbers = await js(`document.querySelectorAll('.para-dialog input[type=number]').length`);
    console.log('מילוי טאב:', await fill('.para-dialog input[type=number]', numbers - 1, '2'),
      await fill('.para-dialog select[aria-label="יישור עצירת הטאב"]', 0, 'right'),
      await fill('.para-dialog select[aria-label="מוביל עצירת הטאב"]', 0, 'dot'));
    await app.sleep(300);
    const added = await clickEl('.para-dialog .pd-group:last-of-type .pd-row .pd-btn', 0, 2200);
    const tabs = (pPrOf(await docx('tab-add'), 'gamma') || '').match(/<w:tabs>[\s\S]*?<\/w:tabs>/)?.[0] ?? null;
    const list = await js(`JSON.stringify(Array.from(document.querySelectorAll('.para-dialog .pd-tab-row span')).map(s=>s.textContent.trim()))`);
    console.log('אחרי „הוסף":', JSON.stringify(added), '| tabs=', tabs, '| ברשימת הדיאלוג=', list);
    const wrote = tabs !== null && /w:pos="1134"/.test(tabs);
    let cleared = null;
    if (wrote) {
      const idx = Number(await js(`Array.from(document.querySelectorAll('.para-dialog button')).findIndex(b=>b.textContent.trim()==='נקה את כל העצירות')`));
      if (idx >= 0) {
        await clickEl('.para-dialog button', idx, 2200);
        cleared = (pPrOf(await docx('tab-clear'), 'gamma') || '').match(/<w:tabs>[\s\S]*?<\/w:tabs>/)?.[0] ?? null;
      }
    }
    const c = await clean();
    console.log('אחרי ניקוי: tabs=', cleared, '|', c.detail);
    if (wrote && cleared === null) report.pass('תפריט פסקה — עצירות טאב', `„הוסף" כתב ${tabs} והופיע ברשימה ${list}; „נקה את כל העצירות" הוריד את <w:tabs>`);
    else if (wrote) report.partial('תפריט פסקה — עצירות טאב', `הוספה עבדה (${tabs}) אך הניקוי השאיר ${cleared}`);
    else report.fail('תפריט פסקה — עצירות טאב', `„הוסף" לא כתב <w:tabs> (לחיצה=${JSON.stringify(added)}) | ${c.detail}`);
    await closeDialogs();
  });

  await step('תפריט פסקה — ביטול אינו כותב', async () => {
    await caretAt(1);
    const before = pPrOf(await docx('cancel-b'), 'beta');
    await app.click('תפריט פסקה'); await app.sleep(1600);
    if (!(await app.dialog())) { report.skip('תפריט פסקה — ביטול אינו כותב', 'לא נפתח'); return; }
    await fill('#pd-ind-left', 0, '3');
    await app.sleep(200);
    const closed = await clickEl('.para-dialog .pd-footer .pd-btn:not(.pd-btn-primary)', 0, 1400);
    const stillOpen = !!(await app.dialog());
    const after = pPrOf(await docx('cancel-a'), 'beta');
    console.log('ביטול:', JSON.stringify(closed), '| עדיין פתוח?', stillOpen, '| before=', short(before), '| after=', short(after));
    if (before !== after) report.fail('תפריט פסקה — ביטול אינו כותב', `ה-pPr השתנה: ${short(before)} → ${short(after)}`);
    else if (stillOpen) report.partial('תפריט פסקה — ביטול אינו כותב', 'לא נכתב דבר, אך הדיאלוג לא נסגר');
    else report.pass('תפריט פסקה — ביטול אינו כותב', 'הדיאלוג נסגר וה-pPr לא השתנה');
    await closeDialogs();
  });

  /* -------- גלישת הדיאלוג בחלון נמוך -------- */
  await step('תפריט פסקה — בחלון נמוך', async () => {
    await app.cdp.send('Emulation.setDeviceMetricsOverride', { width: 756, height: 413, deviceScaleFactor: 1, mobile: false });
    await app.sleep(2500);
    await caretAt(0);
    await app.click('תפריט פסקה');
    await app.sleep(1800);
    const geo = await js(`(() => { const d = document.querySelector('.para-dialog'); if (!d) return 'null';
      const btn = Array.from(d.querySelectorAll('button')).find(b => b.textContent.trim() === 'אישור');
      if (!btn) return 'null';
      const r = btn.getBoundingClientRect();
      return JSON.stringify({ viewport: innerHeight, okBottom: Math.round(r.bottom), inView: r.bottom <= innerHeight,
        scrollable: d.scrollHeight > d.clientHeight + 2 }); })()`);
    console.log('חלון 756×413:', geo);
    await closeDialogs();
    await app.cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await app.sleep(1500);
    if (geo === 'null') { report.skip('תפריט פסקה — בחלון נמוך', 'הדיאלוג/הכפתור לא נמצאו'); return; }
    const g = JSON.parse(geo);
    g.inView
      ? report.pass('תפריט פסקה — בחלון נמוך', 'כפתור „אישור" בתוך המסך גם בחלון נמוך')
      : report.fail('תפריט פסקה — בחלון נמוך',
        `בחלון בגובה ${g.viewport}px כפתור „אישור" יושב ב-${g.okBottom}px — מחוץ למסך, והדיאלוג אינו נגלל (scrollable=${g.scrollable}). הפקד בלתי-לחיץ, וכל הדיאלוג חסר תועלת`);
  });
});

/* ================================================================== */
/* שלב ב' — סגנונות ועריכה                                             */
/* ================================================================== */

await phase('שלב ב — „סגנונות" ו„עריכה"', async (app, ctx) => {
  const { js, caretAt, clickEl, fill, docx, clickStyle, clean, closeDialogs, step, seed } = ctx;

  await seed(LINES);

  /* -------- גלריית הסגנונות -------- */
  await step('גלריית סגנונות — החלת סגנון', async () => {
    await caretAt(1);
    const items = await app.galleryItems();
    console.log('פריטים:', JSON.stringify(items));
    if (items.some((i) => i.disabled)) { report.fail('גלריית סגנונות — החלת סגנון', `מושבתים עם סמן: ${JSON.stringify(items)}`); return; }
    const hit = await clickStyle('כותרת 1');
    const pPr = pPrOf(await docx('style'), 'beta') || '';
    const pStyle = pPr.match(/<w:pStyle w:val="([^"]+)"\s*\/>/)?.[1] ?? null;
    const active = (await app.galleryItems()).filter((i) => i.active).map((i) => i.label);
    const cmd = await app.cmd('linked-style');
    const c = await clean();
    console.log('סגנון: לחיצה=', JSON.stringify(hit), '| pStyle=', pStyle, '| cmd=', JSON.stringify(cmd), '| פעיל=', JSON.stringify(active), '|', c.detail);
    if (!pStyle) report.fail('גלריית סגנונות — החלת סגנון', `לא נכתב <w:pStyle>: ${short(pPr)} | ${c.detail}`);
    else if (!/heading/i.test(pStyle)) report.partial('גלריית סגנונות — החלת סגנון', `נכתב <w:pStyle w:val="${pStyle}"> ולא סגנון כותרת`);
    else if (!c.ok) report.fail('גלריית סגנונות — החלת סגנון', `נכתב ${pStyle} אך נותרה שגיאה — ${c.detail}`);
    else if (!active.includes('כותרת 1')) report.partial('גלריית סגנונות — החלת סגנון', `<w:pStyle w:val="${pStyle}"> נכתב אך החיווי הפעיל הוא ${JSON.stringify(active)}`);
    else report.pass('גלריית סגנונות — החלת סגנון', `<w:pStyle w:val="${pStyle}">, החיווי הפעיל על „כותרת 1"`);
  });

  await step('גלריית סגנונות — כל שבעת הסגנונות', async () => {
    const items = await app.galleryItems();
    const results = [];
    for (const item of items) {
      await caretAt(3);
      const hit = await clickStyle(item.label);
      const pPr = pPrOf(await docx(`style-${item.label}`), 'delta') || '';
      const pStyle = pPr.match(/<w:pStyle w:val="([^"]+)"\s*\/>/)?.[1] ?? null;
      const active = (await app.galleryItems()).filter((i) => i.active).map((i) => i.label).join(',');
      results.push({ label: item.label, pStyle, active, inBox: hit.inBox });
      console.log(`סגנון „${item.label}" → pStyle=${pStyle}, פעיל=${active}, לחיצה=${JSON.stringify(hit)}`);
    }
    const c = await clean();
    const noWrite = results.filter((r) => r.pStyle === null && r.label !== 'רגיל');
    const wrongActive = results.filter((r) => r.active !== r.label);
    if (noWrite.length) report.fail('גלריית סגנונות — כל שבעת הסגנונות', `סגנונות שלא נכתבו: ${JSON.stringify(noWrite)}`);
    else if (wrongActive.length) report.partial('גלריית סגנונות — כל שבעת הסגנונות', `נכתבו, אך החיווי הפעיל אינו תואם: ${JSON.stringify(wrongActive)}`);
    else report.pass('גלריית סגנונות — כל שבעת הסגנונות', results.map((r) => `${r.label}→${r.pStyle ?? 'ללא pStyle'}`).join(' | ') + (c.ok ? '' : ` | ${c.detail}`));
  });

  await step('גלריית סגנונות — כפתורי גלילה', async () => {
    /* הצעד הקודם (״כל שבעת הסגנונות״) מסיים ב-scrollIntoView על הכרטיס
       **האחרון** בגלריה — ולכן בלי איפוס המכל כבר יושב בקצה הגלילה שלו
       (scrollLeft = -(sw-cw)) לפני שהצעד הזה בכלל התחיל. במצב הזה ״הבא״
       נעדר כדין (אין עוד מה לגלול קדימה — בדיוק כמו ב-Word), ורק ״קודם״
       פעיל; זו לא שבירה של הפקד אלא תוצר לוואי של סדר הבדיקות. איפוס
       ל-scrollLeft=0 (תחילת הרצועה, כרטיס ״רגיל״) לפני המדידה מבטל את
       התלות הזאת ומודד את שני הכיוונים מנקודת מוצא נקייה. */
    await js(`(() => { const e = document.querySelector('.style-cards-scroll'); if (e) e.scrollLeft = 0; })()`);
    await app.sleep(400);
    const geo = JSON.parse(await js(`(() => { const e = document.querySelector('.style-cards-scroll');
      return e ? JSON.stringify({ l: Math.round(e.scrollLeft), sw: e.scrollWidth, cw: e.clientWidth, dir: getComputedStyle(e).direction }) : 'null'; })()`));
    const next = await app.state('הסגנונות הבאים');
    const prev = await app.state('הסגנונות הקודמים');
    console.log('גלילה (אחרי איפוס ל-0):', JSON.stringify(geo), '| הבא נמצא?', next.found, '| קודם נמצא?', prev.found);
    if (geo.sw <= geo.cw + 2) {
      (!next.found && !prev.found)
        ? report.pass('גלריית סגנונות — כפתורי גלילה', `אין מה לגלול (${geo.sw} ≤ ${geo.cw}) והכפתורים אינם מוצגים — כמו Word`)
        : report.fail('גלריית סגנונות — כפתורי גלילה', `אין מה לגלול (${geo.sw}≤${geo.cw}) אך הכפתורים מוצגים`);
      return;
    }
    if (!next.found) {
      report.partial('גלריית סגנונות — כפתורי גלילה',
        `גם אחרי איפוס ל-scrollLeft=0 „הסגנונות הבאים" אינו נמצא (״קודם" נמצא=${prev.found}) — יש מה לגלול (${geo.sw}>${geo.cw}) אך הכפתור להתקדם קדימה חסר`);
      return;
    }
    await app.click('הסגנונות הבאים'); await app.sleep(1200);
    const mid = await js(`Math.round(document.querySelector('.style-cards-scroll').scrollLeft)`);
    await app.click('הסגנונות הקודמים'); await app.sleep(1200);
    const back = await js(`Math.round(document.querySelector('.style-cards-scroll').scrollLeft)`);
    console.log('scrollLeft:', geo.l, '→', mid, '→', back);
    mid !== geo.l && back !== mid
      ? report.pass('גלריית סגנונות — כפתורי גלילה', `scrollLeft ${geo.l} → ${mid} → ${back} (RTL: ערכים שליליים, dir=${geo.dir})`)
      : report.fail('גלריית סגנונות — כפתורי גלילה', `scrollLeft ${geo.l} → ${mid} → ${back}`);
  });

  /* -------- חפש -------- */
  await closeDialogs();
  const COUNTER = `(() => { const e = document.querySelector('.fr-counter'); return e ? e.textContent.trim() : null; })()`;

  await step('חפש', async () => {
    await caretAt(0);
    const clicked = await app.click('חפש');
    await app.sleep(1000);
    if (!(await js(`!!document.querySelector('.find-replace-dialog')`))) {
      report.fail('חפש', `הדיאלוג לא נפתח (clicked=${clicked}) | ${JSON.stringify(await clean())}`);
      return;
    }
    const focused = await js(`document.activeElement && document.activeElement.id`);
    await fill('#fr-search-input', 0, 'rho');
    await app.sleep(1600);
    const counter = await js(COUNTER);
    const c = await clean();
    console.log('חיפוש „rho": מונה=', counter, '| מיקוד=', focused, '|', c.detail);
    /מתוך 2$/.test(counter ?? '')
      ? report.pass('חפש', `נפתח והמיקוד בשדה (${focused}); חיפוש-בזמן-הקלדה מצא „${counter}" משני המופעים`)
      : report.fail('חפש', `מונה התוצאות: „${counter}" (במסמך שני מופעים של rho) | ${c.detail}`);
  });

  await step('חפש — מצא הבא / מצא קודם', async () => {
    if (!(await js(`!!document.querySelector('.find-replace-dialog')`))) { report.skip('חפש — מצא הבא / מצא קודם', 'אין דיאלוג'); return; }
    const seq = [await js(COUNTER)];
    console.log('כפתורים:', await js(`JSON.stringify(Array.from(document.querySelectorAll('.find-replace-dialog .fr-btn')).map(b=>[b.textContent.trim(),!!b.disabled]))`));
    for (const [label, idx] of [['מצא הבא', 0], ['מצא הבא', 0], ['מצא קודם', 1]]) {
      const r = await clickEl('.find-replace-dialog .fr-btn', idx, 1000);
      seq.push(await js(COUNTER));
      console.log(label, JSON.stringify(r), '→', seq[seq.length - 1]);
    }
    const c = await clean();
    console.log('רצף המונה:', JSON.stringify(seq), '|', c.detail);
    new Set(seq).size > 1
      ? report.pass('חפש — מצא הבא / מצא קודם', `המונה נע בין ההתאמות: ${seq.join(' → ')}`)
      : report.fail('חפש — מצא הבא / מצא קודם', `המונה קפוא על „${seq[0]}" | ${c.detail}`);
  });

  await step('חפש — שאילתה ללא תוצאות', async () => {
    if (!(await js(`!!document.querySelector('.find-replace-dialog')`))) { report.skip('חפש — שאילתה ללא תוצאות', 'אין דיאלוג'); return; }
    await fill('#fr-search-input', 0, 'qqzzxx');
    await app.sleep(2000);
    const counter = await js(COUNTER);
    const c = await clean();
    console.log('ללא תוצאות: מונה=', counter, '|', c.detail);
    counter === 'אין תוצאות' && !c.status?.error
      ? report.pass('חפש — שאילתה ללא תוצאות', '„אין תוצאות", בלי שגיאה ובלי שפקדי ההחלפה נעלמים')
      : report.partial('חפש — שאילתה ללא תוצאות', `מונה=„${counter}" | ${c.detail}`);
    await closeDialogs();
  });

  /* -------- החלפה -------- */
  await step('החלפה — הדיאלוג', async () => {
    await caretAt(0);
    const clicked = await app.click('החלפה');
    await app.sleep(1000);
    if (!(await js(`!!document.querySelector('.find-replace-dialog')`))) { report.fail('החלפה — הדיאלוג', `לא נפתח (clicked=${clicked})`); return; }
    const tabs = await js(`JSON.stringify(Array.from(document.querySelectorAll('.find-replace-dialog .fr-tab')).map(t=>t.textContent.trim()))`);
    const hasInput = await js(`!!document.querySelector('#fr-replace-input')`);
    const note = await js(`(() => { const e = document.querySelector('.fr-note'); return e ? e.textContent.trim() : null; })()`);
    console.log('החלפה: לשוניות=', tabs, '| שדה החלפה?', hasInput, '| הערה=', note);
    if (hasInput) { report.pass('החלפה — הדיאלוג', `נפתח במצב „החלף" עם שדה ההחלפה (לשוניות ${tabs})`); return; }
    // בלי התאמות `canReplace` של המנוע הוא false — זו התנהגות מכוונת שמתועדת
    // ב-engine/search.ts; מה שנבדק הוא שהיא מתקנת את עצמה ברגע שיש התאמה.
    await fill('#fr-search-input', 0, 'rho');
    await app.sleep(1800);
    const nowHas = await js(`!!document.querySelector('#fr-replace-input')`);
    console.log('אחרי שיש התאמות — שדה החלפה?', nowHas, '| מונה=', await js(COUNTER));
    nowHas
      ? report.partial('החלפה — הדיאלוג',
        `Ctrl+H/„החלפה" נפתח **בלי** פקדי ההחלפה כל עוד אין התאמות (canReplace=false לפני חיפוש), עם ההערה „${note}"; ברגע שיש התאמה הלשונית והשדה מופיעים. מכוון לפי engine/search.ts, אבל המשתמש שביקש „החלפה" רואה מסך חיפוש בלבד`)
      : report.fail('החלפה — הדיאלוג', `פקדי ההחלפה אינם מופיעים גם כשיש התאמות. הערה: „${note}"`);
  });

  await step('החלפה — החלף מופע יחיד', async () => {
    if (!(await js(`!!document.querySelector('#fr-replace-input')`))) { report.skip('החלפה — החלף מופע יחיד', 'אין פקדי החלפה'); return; }
    await fill('#fr-search-input', 0, 'rho');
    await app.sleep(1600);
    await fill('#fr-replace-input', 0, 'TAV');
    await app.sleep(300);
    const before = (await docx('rep-b'))['word/document.xml'];
    const btns = JSON.parse(await js(`JSON.stringify(Array.from(document.querySelectorAll('.find-replace-dialog .fr-btn')).map(b=>b.textContent.trim()))`));
    console.log('כפתורים:', JSON.stringify(btns), '| מונה=', await js(COUNTER));
    const r = await clickEl('.find-replace-dialog .fr-btn', btns.indexOf('החלף'), 2500);
    const doc = (await docx('rep-a'))['word/document.xml'];
    const b = (before.match(/rho/g) ?? []).length;
    const a = (doc.match(/rho/g) ?? []).length;
    const t = (doc.match(/TAV/g) ?? []).length;
    const c = await clean();
    console.log('החלף:', JSON.stringify(r), '| rho', b, '→', a, '| TAV=', t, '|', c.detail);
    a === b - 1 && t >= 1
      ? report.pass('החלפה — החלף מופע יחיד', `rho ${b}→${a} ו„TAV" נכתב ל-document.xml; שורת המצב: ${JSON.stringify(c.status)}`)
      : report.fail('החלפה — החלף מופע יחיד', `rho ${b}→${a}, TAV=${t} | ${c.detail}`);
  });

  await step('החלפה — החלף הכל', async () => {
    if (!(await js(`!!document.querySelector('#fr-replace-input')`))) { report.skip('החלפה — החלף הכל', 'אין פקדי החלפה'); return; }
    await fill('#fr-search-input', 0, 'e');
    await app.sleep(1800);
    await fill('#fr-replace-input', 0, 'Q');
    await app.sleep(300);
    const texts = (x) => (x.match(/<w:t[^>]*>[^<]*<\/w:t>/g) ?? []).join('');
    const before = texts((await docx('all-b'))['word/document.xml']);
    const b = (before.match(/e/g) ?? []).length;
    const counter = await js(COUNTER);
    const btns = JSON.parse(await js(`JSON.stringify(Array.from(document.querySelectorAll('.find-replace-dialog .fr-btn')).map(x=>x.textContent.trim()))`));
    const r = await clickEl('.find-replace-dialog .fr-btn', btns.indexOf('החלף הכל'), 3500);
    const after = texts((await docx('all-a'))['word/document.xml']);
    const a = (after.match(/e/g) ?? []).length;
    const q = (after.match(/Q/g) ?? []).length;
    const c = await clean();
    console.log('החלף הכל:', JSON.stringify(r), '| מונה לפני=', counter, '| "e"', b, '→', a, '| Q=', q, '|', c.detail);
    console.log('טקסטים אחרי:', JSON.stringify(after));
    a === 0 && q >= b
      ? report.pass('החלפה — החלף הכל', `כל ${b} המופעים הוחלפו (Q=${q}); שורת המצב: ${JSON.stringify(c.status)}`)
      : a < b
        ? report.partial('החלפה — החלף הכל', `הוחלפו רק חלק: ${b}→${a}, Q=${q} | ${c.detail}`)
        : report.fail('החלפה — החלף הכל', `לא הוחלף דבר: ${b}→${a} | ${c.detail}`);
    await closeDialogs();
  });

  /* -------- בחר הכל -------- */
  await step('בחר הכל', async () => {
    await caretAt(0);
    const before = await app.selection();
    const state = await app.state('בחר הכל');
    if (state.disabled) { report.fail('בחר הכל', `מושבת: ${JSON.stringify(state)}`); return; }
    await app.click('בחר הכל');
    await app.sleep(1400);
    const after = await app.selection();
    const c = await clean();
    console.log('בחר הכל: לפני=', JSON.stringify(before), '| אחרי=', JSON.stringify(after), '|', c.detail);
    if (!after || after.empty !== false) report.fail('בחר הכל', `הבחירה נשארה ריקה: ${JSON.stringify(before)} → ${JSON.stringify(after)} | ${c.detail}`);
    else if (!c.ok) report.fail('בחר הכל', `נבחר אך נותרה שגיאה — ${c.detail}`);
    else report.pass('בחר הכל', `הבחירה חדלה להיות ריקה (empty ${before?.empty} → ${after.empty})`);
  });
});

killStray();
report.print();
process.exit(0);
