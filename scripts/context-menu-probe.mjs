/**
 * שער המדידה של תפריט הלחצן הימני (docs/context-menu-plan.md §8).
 *
 * ## למה מודדים לפני שכותבים ממשק
 *
 * תפריט הקשר פועל על „מה שנלחץ”, ובעורך הזה אין לנו גישה לשאלה הזאת דרך
 * ה-DOM: `tests/unit/engine-boundaries.test.ts` אוסר selector אל ה-DOM הפנימי
 * של SuperDoc. מה שנשאר הוא **הבחירה של המנוע** — ולכן כל התפריט תלוי בשאלה
 * אחת שאיש לא מדד: מה קורה לבחירה כשלוחצים לחצן ימני.
 *
 * שתי תשובות אפשריות, ושתיהן משנות את התוכן של התפריט:
 *
 *   - המנוע מזיז את הסמן ללחיצה (כמו Word) — התפריט יכול להציע פעולות על
 *     המקום שנלחץ.
 *   - המנוע אינו מזיז — התפריט ייפתח על בחירה ישנה, כלומר „מחק” ימחק במקום
 *     אחר ממה שהמשתמש רואה. במצב כזה גל 1 מצטמצם לפעולות שאינן תלויות במיקום.
 *
 * ## מה נמדד כאן
 *
 *   ש1  האם `contextmenu` נורה בכלל, ומה סדר המאזינים מול זה של המנוע
 *       (SuperDoc רושם capture על ה-document).
 *   ש2  האם `preventDefault` על האירוע נבלע בשקט או מתקבל.
 *   ש3  הבחירה: לחיצה ימנית **בתוך** בחירה קיימת חייבת לשמור אותה, ולחיצה
 *       **מחוצה** לה צריכה להזיז את הסמן. זה השער החוסם.
 *   ש4  האם `preventDefault` על `pointerdown` של כפתור ימני — מה שהרצועה עושה
 *       כדי לא לאבד את המיקוד — מבטל את `contextmenu` שאחריו.
 *
 * ## מה השער הזה **אינו** מוכיח
 *
 * הוא רץ ב-Chrome, ואוצריא מריצה את התוסף ב-WebView2 במצב visual hosting, שם
 * כל אירוע עכבר מועבר ידנית דרך `SendMouseInput` (docs/engine-gaps.md).
 * `contextmenu` עצמו מסונתז ב-Chromium מהודעת הכפתור — בדיוק כמו `clickCount`
 * בלחיצה הכפולה, ש-`DOUBLE_CLICK` שלה אינו קיים בחבילה כלל. ש1 וש2 נבדקים
 * שוב באוצריא עם DevTools; מה שנמדד כאן הוא התנהגות **המנוע**, שהיא זהה בשתי
 * הסביבות.
 *
 *   npm run build && node scripts/context-menu-probe.mjs
 */
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage, requireChrome, sleep } from './cdp.mjs';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const INDEX = join(DIST, 'index.html');
const PROBE = join(DIST, '__context-menu-probe.html');

/** המנוע פורס 14MB לפני שיש מסמך. נדיב, כמו בשאר השערים. */
const READY_MS = 45_000;

if (!existsSync(INDEX)) {
  console.error('dist/index.html אינו קיים — הריצו npm run build תחילה');
  process.exit(1);
}
requireChrome();

/** מאחז אוצריא מזויף, כמו בשאר השערים: בלעדיו התוסף אינו מסיים boot. */
const STUB = `
<script>
  window.Otzaria = {
    call: function (method) {
      if (method === 'app.getInfo') return Promise.resolve({ success: true, data: { version: '9', platform: 'probe' }, error: null });
      if (method === 'app.getTheme') return Promise.resolve({ success: true, data: { mode: 'light', colorScheme: {}, typography: {} }, error: null });
      return Promise.resolve({ success: false, data: null, error: { message: 'no' } });
    },
    on: function () {},
    off: function () {}
  };
</script>`;

const html = readFileSync(INDEX, 'utf8');
const latchEnd = html.indexOf('</script>') + '</script>'.length;
writeFileSync(PROBE, html.slice(0, latchEnd) + STUB + html.slice(latchEnd));

/**
 * ההמתנה היא **מצד Node**, לולאה של קריאות קצרות, ולא לולאה אחת ארוכה בתוך
 * הדף. נמדד: `openPage` מתחבר ל-target ברגע שהוא מופיע ברשימה, כלומר לפני
 * שהמסמך האמיתי התחיל; ביטוי שממתין בתוך הדף נתקע בהקשר שלפני הניווט, לא רואה
 * לעולם את `__otzariaEditor`, ומדווח „העורך לא עלה” על עורך שעלה תוך חמש שניות.
 * קריאה חדשה בכל סבב תמיד נוחתת בהקשר החי.
 */
const READY = '!!window.__otzariaEditor && !document.getElementById("otzaria-splash")';
const BOLD_READY = `(() => {
  try {
    return window.__otzariaEditor.superdoc.ui.commands.get('bold').getState().supported === true;
  } catch (error) {
    return false;
  }
})()`;

async function waitFor(expression, label) {
  for (let waited = 0; waited < READY_MS; waited += 500) {
    if ((await cdp.evaluate(expression)) === true) return true;
    await sleep(500);
  }
  throw new Error(label);
}

/** פסקאות עם טקסט ייחודי לכל שורה — כדי שהבחירה תזוהה לפי מה שנבחר. */
const FILL = `(async () => {
  const doc = window.__otzariaEditor.superdoc.activeEditor.doc;
  const paragraphs = [];
  for (let i = 0; i < 24; i++) {
    paragraphs.push('<p>פסקה ' + (i + 1) + ' — אלף בית גימל דלת הא וו זין חית טית יוד כף למד מם נון</p>');
  }
  await doc.insert({ value: paragraphs.join(''), type: 'html' });
  await new Promise((r) => setTimeout(r, 4000));
  return true;
})()`;

/**
 * שתי נקודות לחיצה, שתיהן על שורת טקסט אמיתית ובשתי פסקאות **שונות**.
 *
 * `.superdoc-line` הוא ה-DOM של המנוע, וכאן — בסקריפט מדידה, לא ב-src — זה
 * מותר: אותה תבנית של page-gutter-probe.mjs. מה שאסור הוא לבנות על זה ממשק.
 */
const POINTS = `(() => {
  const height = window.innerHeight;
  const usable = Array.from(document.querySelectorAll('.superdoc-line'))
    .map((line) => line.getBoundingClientRect())
    .filter((box) => box.width > 80 && box.height > 4 && box.top > 0 && box.bottom < height - 8)
    .map((box) => ({ x: box.left + box.width / 2, y: box.top + box.height / 2 }));

  // אימות שהנקודה באמת על טקסט: בלעדיו „הסמן לא זז” יכול להיות „לא לחצנו על
  // כלום”, וזה בדיוק מה שקרה במדידה הקודמת.
  const onText = usable.filter((point) => {
    const element = document.elementFromPoint(point.x, point.y);
    return !!element && !!element.closest('.superdoc-line');
  });
  if (onText.length < 4) {
    return { error: 'לא נמצאו די נקודות על טקסט בתוך החלון: ' + onText.length + ' מתוך ' + usable.length };
  }
  return { near: onText[1], far: onText[onText.length - 1], viewport: { width: window.innerWidth, height } };
})()`;

/** ש5: האם הבחירה של המנוע שורדת מעבר מיקוד אל פקד של הממשק שלנו. */
const FOCUS_AWAY = `(() => {
  const button = document.querySelector('.word-ribbon button, .word-title-bar button, button');
  if (!button) return 'אין כפתור בממשק למקד אליו';
  button.focus();
  return document.activeElement === button ? 'ok' : 'המיקוד לא עבר';
})()`;

/** ש6: מה באמת יושב ב-`story` — הצורה שסעיף „כותרת עליונה/תחתונה” נשען עליה. */
const STORY = `(async () => {
  const doc = window.__otzariaEditor.superdoc.activeEditor.doc;
  try {
    const info = await doc.selection.current();
    const story = info && info.target ? info.target.story : undefined;
    return { type: typeof story, value: story === undefined ? '«undefined»' : JSON.stringify(story).slice(0, 120) };
  } catch (error) {
    return { type: 'error', value: String(error && error.message) };
  }
})()`;

/**
 * ש7: האם `hyperlinks.list` ו-`footnotes.list` מחזירים מיקום.
 *
 * העטיפות שלנו (hyperlinks-manage.ts, footnotes.ts) משטחות את התשובה ומוותרות
 * על כל מה שאינו href/תוכן. השאלה כאן היא מה **המנוע** מחזיר, כי בלי blockId
 * או טווח אי אפשר לדעת שהסמן עומד על קישור — וזה כל גל 2.
 */
const OBJECT_FIELDS = `(async () => {
  const doc = window.__otzariaEditor.superdoc.activeEditor.doc;
  const out = {};
  try {
    await doc.insert({ value: '<p>שורה עם <a href="https://example.com">קישור</a> בתוכה</p>', type: 'html' });
    await new Promise((r) => setTimeout(r, 1500));
  } catch (error) {
    out.insert = 'כשל: ' + String(error && error.message);
  }
  try {
    const links = await doc.hyperlinks.list();
    const stories = (links && links.stories) || [];
    const first = (stories[0] && stories[0].hyperlinks && stories[0].hyperlinks[0]) || null;
    out.hyperlink = first ? Object.keys(first).join(',') + ' :: ' + JSON.stringify(first).slice(0, 200) : 'אין קישורים ברשימה';
    out.hyperlinkStory = stories[0] ? Object.keys(stories[0]).join(',') : '«אין story»';
  } catch (error) {
    out.hyperlink = 'כשל: ' + String(error && error.message);
  }
  try {
    const notes = await doc.footnotes.list();
    const items = Array.isArray(notes) ? notes : (notes && notes.notes) || [];
    out.note = items[0] ? Object.keys(items[0]).join(',') : 'אין הערות במסמך (צפוי — לא הוכנסה אחת)';
  } catch (error) {
    out.note = 'כשל: ' + String(error && error.message);
  }
  return out;
})()`;

/** מה המנוע מדווח על הבחירה, בצורה שאפשר להשוות בין שתי קריאות. */
const SELECTION = `(async () => {
  const doc = window.__otzariaEditor.superdoc.activeEditor.doc;
  try {
    const info = await doc.selection.current({ includeText: true });
    if (!info) return { ok: false, why: 'החזיר undefined' };
    const segments = (info.target && info.target.segments) || [];
    const first = segments[0] || {};
    return {
      ok: true,
      empty: info.empty === true,
      text: typeof info.text === 'string' ? info.text.slice(0, 40) : '',
      blockId: typeof first.blockId === 'string' ? first.blockId : null,
      range: first.range ? first.range.start + '..' + first.range.end : null,
      segments: segments.length,
    };
  } catch (error) {
    return { ok: false, why: String(error && error.message) };
  }
})()`;

/**
 * מאזינים שמקליטים את מה שקרה בפועל.
 *
 * `contextmenu` נרשם גם ב-capture וגם ב-bubble: SuperDoc רושם capture משלו על
 * ה-document, ומה שנמדד כאן הוא האם השלב שאנחנו מתכננים להאזין בו רואה את
 * האירוע, ומה מצב `defaultPrevented` כשהוא מגיע אליו.
 */
const INSTALL = `(() => {
  window.__probe = { events: [], blockPointerDown: false };
  const log = (name, event) => window.__probe.events.push({
    name,
    button: event.button,
    prevented: event.defaultPrevented,
    at: Math.round(performance.now()),
  });
  document.addEventListener('contextmenu', (event) => log('contextmenu:capture', event), true);
  document.addEventListener('contextmenu', (event) => log('contextmenu:bubble', event));
  document.addEventListener('pointerdown', (event) => {
    if (event.button !== 2) return;
    log('pointerdown:right', event);
    if (window.__probe.blockPointerDown) event.preventDefault();
  }, true);
  return true;
})()`;

const page = await openPage(`file:///${PROBE.split('\\').join('/')}`, { label: 'context-menu' });
const { cdp, close } = page;

/* חלון מפורש, כמו ב-ribbon-geometry-probe. ‏Chrome ב-headless נותן כאן
   756x413 — נמדד — ואחרי הרצועה ורצועת הטאבים נשארות ארבע שורות טקסט
   בתוך החלון, בזמן שהמדידה דורשת ארבע נקודות שנוחתות על טקסט. גבול כזה
   נופל על שינוי גובה כלשהו בממשק ומדווח „המדידה לא רצה”, וזה בדיוק מה
   שקרה. הגודל אינו נמדד כאן — הוא רק צריך להכיל את מה שנמדד. */
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});
const errors = [];
const notes = [];
let setupFailure = null;

/** לחיצה אמיתית דרך CDP. `dispatchEvent` מתוך הדף אינו נאמן — ראו tooltip-probe. */
async function click(x, y, button) {
  const buttons = button === 'right' ? 2 : 1;
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, buttons, clickCount: 1 });
  await sleep(60);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, buttons: 0, clickCount: 1 });
  await sleep(400);
}

/**
 * שלוש לחיצות בוחרות את הפסקה כולה — נמדד במאגר (docs/engine-gaps.md), ולכן
 * זו הדרך האמינה ליצור בחירה שנקודת האמצע של השורה נמצאת **בתוכה**. גרירה
 * דרך CDP נמדדה כאן כבוחרת חמישה תווים בלבד, וזה היה הופך את „לחיצה ימנית
 * בתוך הבחירה” למדידה של לחיצה מחוץ לה.
 */
async function tripleClick(x, y) {
  for (let clickCount = 1; clickCount <= 3; clickCount += 1) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount });
    await sleep(40);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount });
    await sleep(60);
  }
  await sleep(500);
}

/** Escape אמיתי דרך CDP. הכרטיס והרשימה שבתוכו נסגרים בו, כל אחד בתורו. */
async function escape() {
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(300);
}

const events = async () => cdp.evaluate('window.__probe.events.splice(0)');
const describe = (selection) =>
  selection.ok
    ? `${selection.empty ? 'סמן' : 'טווח'} · בלוק ${selection.blockId ?? '«אין»'} · ${selection.range ?? '«אין»'} · „${selection.text}”`
    : `כשל: ${selection.why}`;

try {
  await waitFor(READY, 'העורך לא עלה בזמן');
  await waitFor(BOLD_READY, 'קטלוג הפקודות של המנוע לא נפתר בזמן');
  // הסגנונות והגופנים נפתרים אחרי הפתיחה; מדידה לפני זה מודדת את העלייה.
  await sleep(2_000);

  await cdp.evaluate(FILL);
  await cdp.evaluate(INSTALL);

  const points = await cdp.evaluate(POINTS);
  if (!points || points.error) throw new Error(points?.error ?? 'לא נמצאו נקודות לחיצה');

  // ── ש3, חלק א: בחירת פסקה, ואז לחיצה ימנית בתוכה ────────────────────────
  await tripleClick(points.near.x, points.near.y);
  const selected = await cdp.evaluate(SELECTION);
  notes.push(`הבחירה אחרי שלוש לחיצות:       ${describe(selected)}`);
  if (!selected.ok || selected.empty) {
    errors.push('שלוש הלחיצות לא יצרו בחירה — המדידה אינה מודדת את מה שהיא חושבת');
  }

  await click(points.near.x, points.near.y, 'right');
  const afterInside = await cdp.evaluate(SELECTION);
  const insideEvents = await events();
  notes.push(`אחרי לחיצה ימנית בתוך הבחירה:  ${describe(afterInside)}`);

  const kept =
    afterInside.ok &&
    !afterInside.empty &&
    afterInside.blockId === selected.blockId &&
    afterInside.range === selected.range;
  notes.push(`ש3א — הבחירה נשמרה: ${kept ? 'כן' : 'לא'}`);
  if (!kept) {
    errors.push(
      'לחיצה ימנית בתוך בחירה קיימת הרסה אותה — תפריט הקשר על בחירה אינו אפשרי ' +
        'בלי לשחזר את הבחירה בעצמנו לפני הפתיחה',
    );
  }

  // ── ש1 + ש2: האם האירוע נורה, ובאיזה שלב ─────────────────────────────────
  const sawCapture = insideEvents.some((event) => event.name === 'contextmenu:capture');
  const sawBubble = insideEvents.some((event) => event.name === 'contextmenu:bubble');
  notes.push(`ש1 — contextmenu נורה: capture=${sawCapture ? 'כן' : 'לא'}, bubble=${sawBubble ? 'כן' : 'לא'}`);
  if (!sawBubble) {
    errors.push('האירוע אינו מגיע לשלב ה-bubble — מישהו עוצר אותו, וזה המקום שהתפריט מתכנן להאזין בו');
  }
  const preventedOnArrival = insideEvents.find((event) => event.name === 'contextmenu:bubble')?.prevented;
  notes.push(`ש2 — האירוע הגיע כשהוא כבר מבוטל: ${preventedOnArrival ? 'כן' : 'לא'}`);

  // ── ש3, חלק ב: לחיצה ימנית מחוץ לבחירה ───────────────────────────────────
  await click(points.far.x, points.far.y, 'right');
  const afterOutside = await cdp.evaluate(SELECTION);
  await events();
  notes.push(`אחרי לחיצה ימנית מחוץ לבחירה:  ${describe(afterOutside)}`);

  const moved = afterOutside.ok && afterOutside.blockId !== selected.blockId;
  notes.push(`ש3ב — הסמן זז ללחיצה: ${moved ? 'כן' : 'לא'} (ידוע: לא. נעקף בשכבה)`);

  /**
   * הבקרה שהופכת „לא זז” לממצא.
   *
   * בלעדיה „הסמן לא זז” יכול להיות בדיוק אותו דבר כמו „הנקודה לא הייתה על
   * טקסט” — ואז המדידה מאשימה את המנוע במה שהיא עצמה עשתה. לחיצה **שמאלית**
   * באותה נקודה בדיוק היא מה שמפריד בין השניים.
   */
  await click(points.far.x, points.far.y, 'left');
  const afterLeft = await cdp.evaluate(SELECTION);
  await events();
  notes.push(`בקרה — אחרי לחיצה שמאלית באותה נקודה: ${describe(afterLeft)}`);
  const leftMoved = afterLeft.ok && afterLeft.blockId !== selected.blockId;
  notes.push(`בקרה — לחיצה שמאלית מזיזה את הסמן: ${leftMoved ? 'כן' : 'לא'}`);

  if (!leftMoved) {
    errors.push(
      'גם לחיצה שמאלית לא הזיזה את הסמן בנקודה הזאת — הנקודה אינה על טקסט, ' +
        'ולכן ש3ב אינו מודד את המנוע. יש לתקן את בחירת הנקודות לפני שמסיקים משהו',
    );
  } else if (moved) {
    // הפתעה לטובה, אבל היא בכל זאת שינוי התנהגות: השכבה שמזיזה את הסמן
    // (composables/use-context-menu.ts) נבנתה בדיוק מפני שהמנוע אינו מזיז.
    notes.push('שימו לב: המנוע התחיל להזיז את הסמן בלחיצה ימנית — העקיפה מיותרת עכשיו');
  }

  // ── ש4: preventDefault על pointerdown של כפתור ימני ──────────────────────
  await cdp.evaluate('window.__probe.blockPointerDown = true');
  await click(points.far.x, points.far.y, 'right');
  const blockedEvents = await events();
  await cdp.evaluate('window.__probe.blockPointerDown = false');

  const stillFired = blockedEvents.some((event) => event.name === 'contextmenu:bubble');
  notes.push(`ש4 — עם preventDefault על pointerdown ימני, contextmenu עדיין נורה: ${stillFired ? 'כן' : 'לא'}`);
  if (!stillFired) {
    errors.push(
      'preventDefault על pointerdown של כפתור ימני מבטל את contextmenu — ' +
        'התפריט חייב לשמור את המיקוד בדרך אחרת מזו של הרצועה',
    );
  }

  // ── ש5: האם בחירת המנוע שורדת מעבר מיקוד לפקד של הממשק ────────────────────
  //
  // זו השאלה שמכריעה את צורת הקומפוננטה: הרצועה מונעת מהפקד לקבל מיקוד
  // (`@pointerdown.prevent`) כדי לא לאבד את הבחירה — ותפריט שאי אפשר למקד בו
  // הוא תפריט שאי אפשר לנווט בו במקלדת.
  await tripleClick(points.near.x, points.near.y);
  const beforeBlur = await cdp.evaluate(SELECTION);
  const focusMoved = await cdp.evaluate(FOCUS_AWAY);
  await sleep(400);
  const afterBlur = await cdp.evaluate(SELECTION);
  notes.push(`ש5 — מעבר המיקוד: ${focusMoved}`);
  notes.push(`ש5 — הבחירה אחרי מעבר המיקוד: ${describe(afterBlur)}`);

  const survived =
    focusMoved === 'ok' &&
    afterBlur.ok &&
    !afterBlur.empty &&
    afterBlur.blockId === beforeBlur.blockId &&
    afterBlur.range === beforeBlur.range;
  notes.push(`ש5 — הבחירה שרדה מיקוד בממשק: ${survived ? 'כן' : 'לא'}`);
  if (focusMoved !== 'ok') {
    errors.push(`ש5 לא נמדד: ${focusMoved}`);
  } else if (!survived) {
    errors.push(
      'מיקוד בפקד של הממשק מאבד את הבחירה במסמך — כלומר תפריט שמקבל מיקוד ' +
        '(וזה מה שניווט מקלדת דורש) חייב לצלם את הבחירה בפתיחה ולשחזר אותה ' +
        'לפני כל פקודה',
    );
  }

  // ── ש10: `getRects` מחזיר מלבנים בקואורדינטות חלון שמכסים את הבחירה ───────
  //
  // זה השער החשוב ביותר לקוד שנכתב: `pointInRects` משווה `clientX/clientY` של
  // הלחיצה למלבנים האלה, ומזה נגזר „הלחיצה בתוך הבחירה — אל תיגע בה”. אם
  // המלבנים יעברו יום אחד למרחב אחר, ההשוואה תחזיר תמיד `false` — וכל לחיצה
  // ימנית **בתוך** בחירה תהרוס אותה, כלומר בדיוק ההתנהגות שהתפריט נבנה למנוע.
  await tripleClick(points.near.x, points.near.y);
  const geometry = await cdp.evaluate(`(() => {
    const handle = window.__otzariaEditor.superdoc.ui.selection;
    if (typeof handle.getRects !== 'function') return { ok: false, why: 'אין getRects' };
    const rects = handle.getRects() || [];
    const at = { x: ${Math.round(points.near.x)}, y: ${Math.round(points.near.y)} };
    return {
      ok: true,
      count: rects.length,
      covers: rects.some((r) => at.x >= r.left && at.x <= r.right && at.y >= r.top && at.y <= r.bottom),
      first: rects[0] ? Math.round(rects[0].left) + ',' + Math.round(rects[0].top) : '«אין»',
    };
  })()`);
  notes.push(
    `ש10 — getRects: ${
      geometry.ok ? `${geometry.count} מלבנים, מכסים את נקודת הלחיצה: ${geometry.covers ? 'כן' : 'לא'} (ראשון ב-${geometry.first})` : geometry.why
    }`,
  );
  // **אינו שער.** נמדד שהמלבנים ריקים בהרכבה הזאת גם על בחירה בת 61 תווים,
  // ולכן הקוד אינו נשען עליהם: הכלל שהחליף אותם הוא „בחירה קיימת לא נהרסת”,
  // בלי גיאומטריה בכלל. השורה נשארת כמדידה — ביום שהמלבנים יחזרו, הם ישפרו
  // את הדיוק (נקודה בתוך הבחירה תעצור הזזה גם כשיש רק סמן).
  if (geometry.ok && geometry.count > 0 && !geometry.covers) {
    notes.push('ש10 — יש מלבנים והם אינם מכסים את נקודת הלחיצה: כדאי לבדוק את מרחב הקואורדינטות');
  }

  // ── ש11: האם הגיאומטריה שורדת מעבר מיקוד ─────────────────────────────────
  //
  // דווח מהשטח: „מדגיש קטע, לוחץ ימני כמה פעמים, והבחירה נעלמת”. החשד —
  // בלחיצה הראשונה התפריט לוקח מיקוד, ובשנייה `getRects` כבר מחזיר ריק, ולכן
  // `pointInRects` אומר „מחוץ לבחירה” ומזיז את הסמן — כלומר **הורס** אותה.
  // ש5 מדד שהבחירה עצמה שורדת; זה מודד אם המלבנים שלה שורדים.
  const geometryAfterBlur = await cdp.evaluate(`(() => {
    const sd = window.__otzariaEditor.superdoc;
    const before = (sd.ui.selection.getRects() || []).length;
    const button = document.querySelector('.word-ribbon button, button');
    if (!button) return { ok: false, why: 'אין כפתור בממשק' };
    button.focus();
    const after = (sd.ui.selection.getRects() || []).length;
    const snapshot = sd.ui.selection.getSnapshot ? sd.ui.selection.getSnapshot() : null;
    return { ok: true, before, after, empty: snapshot ? snapshot.empty : '«אין getSnapshot»' };
  })()`);
  notes.push(
    `ש11 — מלבני הבחירה: לפני מיקוד ${geometryAfterBlur.before}, אחרי ${geometryAfterBlur.after}, ` +
      `getSnapshot().empty=${geometryAfterBlur.empty}`,
  );
  if (geometryAfterBlur.ok && geometryAfterBlur.before > 0 && geometryAfterBlur.after === 0) {
    notes.push('ש11 — הגיאומטריה נעלמת עם המיקוד: אסור להסיק „מחוץ לבחירה” מרשימה ריקה');
  }

  // ── ש12: האם יש עוגן לסמן — מה ש-Shift+F10 נפתח עליו ─────────────────────
  await tripleClick(points.near.x, points.near.y);
  const anchor = await cdp.evaluate(`(() => {
    const handle = window.__otzariaEditor.superdoc.ui.selection;
    if (typeof handle.getAnchorRect !== 'function') return '«אין getAnchorRect»';
    try {
      const rect = handle.getAnchorRect({ placement: 'end' });
      return rect ? Math.round(rect.left) + ',' + Math.round(rect.top) : 'null';
    } catch (error) {
      return 'זרק: ' + String(error && error.message);
    }
  })()`);
  notes.push(`ש12 — getAnchorRect על בחירה קיימת: ${anchor}`);
  if (anchor === 'null' || String(anchor).startsWith('«')) {
    notes.push('ש12 — אין עוגן: Shift+F10 חייב נפילה לאחור, אחרת הוא אינו פותח דבר');
  }

  // ── ש8: האם יש בכלל דרך למפות נקודה למיקום במסמך ─────────────────────────
  //
  // ש3ב הראה שהמנוע מתעלם מכפתור ימני. לפני שמוותרים על „התפריט פועל על מה
  // שנלחץ” — מה בכלל יש במשטח הציבורי שאפשר למפות בו נקודה למיקום.
  const surface = await cdp.evaluate(`(() => {
    const sd = window.__otzariaEditor.superdoc;
    const doc = sd.activeEditor.doc;
    const keys = (value) => { try { return Object.keys(value || {}).join(','); } catch (e) { return 'ERR'; } };
    return {
      doc: keys(doc),
      selection: keys(doc.selection),
      ranges: keys(doc.ranges),
      uiSelection: keys(sd.ui && sd.ui.selection),
    };
  })()`);
  notes.push(`ש8 — doc:           ${surface.doc}`);
  notes.push(`ש8 — doc.selection: ${surface.selection}`);
  notes.push(`ש8 — doc.ranges:    ${surface.ranges}`);
  notes.push(`ש8 — ui.selection:  ${surface.uiSelection}`);

  // ── ש9: האם לחיצה שמאלית מסונתזת מזיזה את הסמן ───────────────────────────
  //
  // אם כן, התפריט יכול להזיז את הסמן ללחיצה בעצמו לפני שהוא נפתח — כלומר
  // התנהגות Word — במקום לפעול על בחירה ישנה.
  const syntheticMoved = await cdp.evaluate(`(async () => {
    const doc = window.__otzariaEditor.superdoc.activeEditor.doc;
    const x = ${Math.round(points.far.x)}, y = ${Math.round(points.far.y)};
    const target = document.elementFromPoint(x, y);
    if (!target) return { ok: false, why: 'אין אלמנט בנקודה' };
    const common = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1, view: window };
    target.dispatchEvent(new PointerEvent('pointerdown', { ...common, pointerId: 1, isPrimary: true, pointerType: 'mouse' }));
    target.dispatchEvent(new MouseEvent('mousedown', common));
    target.dispatchEvent(new PointerEvent('pointerup', { ...common, buttons: 0, pointerId: 1, isPrimary: true, pointerType: 'mouse' }));
    target.dispatchEvent(new MouseEvent('mouseup', { ...common, buttons: 0 }));
    target.dispatchEvent(new MouseEvent('click', { ...common, buttons: 0, detail: 1 }));
    await new Promise((r) => setTimeout(r, 500));
    const info = await doc.selection.current();
    const segments = (info && info.target && info.target.segments) || [];
    const first = segments[0] || {};
    return { ok: true, blockId: first.blockId || null, range: first.range ? first.range.start + '..' + first.range.end : null };
  })()`);
  notes.push(
    `ש9 — לחיצה שמאלית מסונתזת: ${
      syntheticMoved.ok ? `בלוק ${syntheticMoved.blockId} · ${syntheticMoved.range}` : syntheticMoved.why
    }`,
  );
  // זו הדרך היחידה שיש לתפריט להזיז את הסמן ללחיצה. אם היא תפסיק לעבוד,
  // התפריט ייפתח על בחירה ישנה — כלומר יפעל במקום אחר ממה שהמשתמש רואה.
  if (!syntheticMoved.ok || !syntheticMoved.blockId) {
    errors.push('לחיצה מסונתזת אינה מזיזה את הסמן — הזזת הסמן בתפריט ההקשר אינה עובדת עוד');
  }

  // ── ש13: אין טולטיפ של מערכת ההפעלה על האייקונים ─────────────────────────
  //
  // לאייקונים אין תווית גלויה, ולכן יש להם טולטיפ — ומה שאין להם הוא `title`,
  // שהוא מה שמערכת ההפעלה מציירת בעצמה במלבן אפור מעל הכרטיס. השכבה אינה
  // מכבה אותו יותר אלא הוא אינו קיים (`data-tip-*` בלבד, ראו
  // tests/unit/native-title.test.ts); מה שנמדד כאן הוא ששני חצאי החוזה
  // מתקיימים **בתוך התפריט**, שהוא DOM חדש שהשכבה לא נבנתה מולו: אין title,
  // ובכל זאת נפתח כרטיס.
  await click(points.near.x, points.near.y, 'right');
  await sleep(900);

  const menuOpen = await cdp.evaluate('!!document.querySelector("[data-context-menu]")');
  notes.push(`ש13 — התפריט נפתח בלחיצה ימנית: ${menuOpen ? 'כן' : 'לא'}`);

  if (menuOpen) {
    const iconAt = await cdp.evaluate(`(() => {
      const icon = document.querySelector('[data-context-menu] [data-entry-id="bold"]');
      if (!icon) return null;
      const box = icon.getBoundingClientRect();
      return {
        x: Math.round(box.left + box.width / 2),
        y: Math.round(box.top + box.height / 2),
        title: icon.getAttribute('title'),
        tipTitle: icon.getAttribute('data-tip-title'),
      };
    })()`);
    notes.push(
      `ש13 — title על האייקון לפני ריחוף: ${iconAt ? (iconAt.title ?? '«אין, וכך צריך»') : '«אין אייקון»'}`,
    );

    if (iconAt && !iconAt.tipTitle) {
      errors.push('לאייקון בתפריט אין `data-tip-title` — הוא אינו עוגן, ולכן לא יקבל שום טולטיפ');
    }

    if (iconAt) {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: iconAt.x, y: iconAt.y, buttons: 0 });
      await sleep(200);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: iconAt.x + 1, y: iconAt.y, buttons: 0 });
      await sleep(900);

      const hovering = await cdp.evaluate(`(() => {
        const icon = document.querySelector('[data-context-menu] [data-entry-id="bold"]');
        const card = document.querySelector('.word-tip');
        return {
          nativeTitle: icon ? icon.getAttribute('title') : '«אין אייקון»',
          card: card ? (card.textContent || '').trim().slice(0, 40) : null,
        };
      })()`);
      notes.push(`ש13 — בזמן ריחוף: כרטיס=${hovering.card ?? '«לא נפתח»'}, title מולד=${hovering.nativeTitle ?? '«הוסר»'}`);

      if (hovering.nativeTitle) {
        errors.push(
          'האייקון בתפריט שומר את תכונת `title` בזמן ריחוף — מערכת ההפעלה תצייר ' +
            'טולטיפ משלה מעל הכרטיס של הממשק',
        );
      }
      if (!hovering.card) {
        errors.push('ריחוף על אייקון בתפריט אינו פותח כרטיס טולטיפ — לפקד בלי תווית אין שום הסבר');
      }
    }
  }
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(300);

  // ── ש14: שורת הגופן בכרטיס, והרשימה שנפתחת מתוכה ─────────────────────────
  //
  // שני דברים שאין דרך למדוד ב-jsdom, ושניהם שקטים כשהם נשברים:
  //
  //   1. **הרשימה של הבורר.** היא `position: fixed` בתוך כרטיס שהוא
  //      `overflow-y: auto`. jsdom אינו מחשב פריסה ואינו חותך כלום, ולכן רשימה
  //      שנחתכת נראית שם תקינה לחלוטין. מה שנמדד כאן הוא מה שהמשתמש רואה: האם
  //      נקודה שבתוך הרשימה **פוגעת** בה, והאם המלבן שלה בתוך החלון — בשני
  //      הצירים. האופקי אינו קוסמטיקה: הרשימה רחבה מהתיבה בכוונה
  //      (`width: max-content`, ראו RibbonCombo.vue), ולכן כרטיס שנפתח סמוך
  //      לקצה מוציא אותה מהחלון בלי לגרוע דבר מהגובה — ובדיקה שמדדה גובה
  //      בלבד הייתה מאשרת אותה בירוק.
  //   2. **שני הבוררים מציגים אותו ערך.** זו כל הסיבה שהמצב יצא למעטפת
  //      (`FONT_MEMORY`), וכאן הרצועה והתפריט חיים באותו דף באמת.
  //
  // ## למה שתי נקודות ולא אחת
  //
  // `points.near` היא השורה השנייה בחלון, ולכן הכרטיס שם נפתח **למטה** תמיד —
  // וזה הצד שאינו נשבר. המדידה נכתבה בשביל הכרטיס שאין מקום מתחתיו: הוא
  // מתהפך `above`, ה-`maxHeight` שלו קטן יותר, ושורת הגופן שבו יורדת לתחתית
  // הכרטיס (ContextMenu.vue, `drawn`) — כלומר הרשימה נפתחת ממקום אחר לגמרי.
  // `points.far` היא השורה האחרונה שבחלון, כלומר בדיוק המצב הזה.
  const sidesSeen = [];

  for (const spot of [
    { label: 'נקודה עליונה', at: points.near },
    { label: 'נקודה תחתונה', at: points.far },
  ]) {
    await click(spot.at.x, spot.at.y, 'right');
    await sleep(900);

    /**
     * לאיזה צד הכרטיס נפתח בפועל, והאם הוא גולל בעצמו.
     *
     * נמדד מה-DOM ולא נלקח מהקומפוננטה: השאלה היא מה נמצא על המסך, ושדה פנימי
     * שמסכים איתו אינו עדות על מדידה שנכשלה.
     */
    const card = await cdp.evaluate(`(() => {
      const card = document.querySelector('[data-context-menu]');
      if (!card) return null;
      const box = card.getBoundingClientRect();
      return {
        top: Math.round(box.top),
        bottom: Math.round(box.bottom),
        height: Math.round(box.height),
        maxHeight: card.style.maxHeight || '«אין»',
        scrolls: card.scrollHeight > card.clientHeight + 1,
      };
    })()`);

    const side = card ? (card.bottom <= spot.at.y + 4 ? 'above' : 'below') : null;
    if (side) sidesSeen.push(side);
    notes.push(
      `ש14 — ${spot.label} (y=${Math.round(spot.at.y)}): ${
        card
          ? `כרטיס ${side}, ${card.top}..${card.bottom} (${card.height}px), max-height=${card.maxHeight}, גולל=${card.scrolls}`
          : '«הכרטיס לא נפתח»'
      }`,
    );

    if (!card) {
      errors.push(`לחיצה ימנית ב${spot.label} אינה פותחת כרטיס כלל`);
      continue;
    }

    const fontPicker = await cdp.evaluate(`(() => {
      const input = document.querySelector('[data-context-menu] [data-context-menu-control] input');
      if (!input) return null;
      const box = input.getBoundingClientRect();
      const shown = [...document.querySelectorAll('input[data-tip-title="גופן"]')].map((node) => node.value);
      return {
        x: Math.round(box.left + box.width / 2),
        y: Math.round(box.top + box.height / 2),
        value: input.value,
        shown,
      };
    })()`);

    notes.push(
      `ש14 — ${spot.label}: בורר הגופן בכרטיס ${
        fontPicker
          ? `„${fontPicker.value}”, התיבות שבדף: ${JSON.stringify(fontPicker.shown)}`
          : '«אין»'
      }`,
    );

    if (!fontPicker) {
      errors.push(
        `אין בורר גופן בתפריט ההקשר (${spot.label}) — שורת הגופן אינה מצוירת`,
      );
      await escape();
      continue;
    }

    /*
      שתי תיבות בדף הן **תנאי למדידה** ולא נתון נוסף: השאלה היא אם הרצועה
      והכרטיס מציגים אותו דבר, ובלי שתיהן אין מה להשוות. קודם התנאי הזה היה
      `if (shown.length === 2 && ...)`, כלומר לשונית אחרת ברצועה — או תיבה
      שנעלמה — היו מבטלות את השער בשקט. שער שמדלג בלי לומר אינו שער.
    */
    if (fontPicker.shown.length !== 2) {
      errors.push(
        `נמצאו ${fontPicker.shown.length} תיבות גופן בדף במקום שתיים (הרצועה והכרטיס) — ` +
          `„הזיכרון המשותף” לא נמדד בכלל (${spot.label})`,
      );
    } else if (fontPicker.shown[0] !== fontPicker.shown[1]) {
      errors.push(
        `בורר הגופן בתפריט מציג „${fontPicker.shown[1]}” בזמן שהרצועה מציגה ` +
          `„${fontPicker.shown[0]}” — הזיכרון המשותף אינו מגיע לשניהם`,
      );
    }

    await click(fontPicker.x, fontPicker.y, 'left');
    await sleep(500);

    const fontList = await cdp.evaluate(`(() => {
      const list = document.querySelector('[data-context-menu] [role="listbox"]');
      if (!list) return { open: false };
      const box = list.getBoundingClientRect();
      const x = Math.round(box.left + box.width / 2);
      const y = Math.round(box.top + 8);
      const hit = document.elementFromPoint(x, y);
      return {
        open: true,
        height: Math.round(box.height),
        rect: [
          Math.round(box.left),
          Math.round(box.top),
          Math.round(box.right),
          Math.round(box.bottom),
        ],
        inViewport:
          box.top >= -1 &&
          box.bottom <= window.innerHeight + 1 &&
          box.left >= -1 &&
          box.right <= window.innerWidth + 1,
        hits: !!(hit && (list === hit || list.contains(hit))),
        hitAt: hit ? hit.className || hit.tagName : null,
      };
    })()`);

    notes.push(
      `ש14 — ${spot.label}: רשימת הגופנים מתוך הכרטיס ${
        fontList.open
          ? `${fontList.height}px ב-[${fontList.rect}], בחלון=${fontList.inViewport}, נפגעת=${fontList.hits} (${fontList.hitAt})`
          : '«לא נפתחה»'
      }`,
    );

    if (!fontList.open) {
      errors.push(
        `לחיצה על בורר הגופן בתפריט אינה פותחת רשימה (${spot.label}) — הפקד אינו שמיש`,
      );
    } else if (!fontList.hits || !fontList.inViewport || fontList.height < 24) {
      errors.push(
        `רשימת הגופנים שנפתחת מתוך תפריט ההקשר נחתכת (${spot.label}): מלבן ` +
          `[${fontList.rect}] בחלון ${points.viewport.width}×${points.viewport.height}, ` +
          `בחלון=${fontList.inViewport}, נפגעת=${fontList.hits}`,
      );
    }

    // שתיים: הראשונה סוגרת את הרשימה (הבורר עוצר את Escape), והשנייה את הכרטיס.
    await escape();
    await escape();
  }

  /*
    המקרה שהמדידה נכתבה בשבילו חייב להיות בין שני המקרים שנמדדו. בלי השורה
    הזאת, שינוי גובה בממשק או בחלון המדידה היה מחזיר את השער למדוד `below`
    פעמיים — כלומר לעבור בירוק בלי לגעת בצד שנשבר.
  */
  notes.push(`ש14 — הצדדים שנמדדו: ${sidesSeen.join(', ') || '«אף אחד»'}`);
  if (!sidesSeen.includes('above')) {
    errors.push(
      'שתי נקודות המדידה פתחו כרטיס למטה, ולכן המקרה שש14 נכתבה בשבילו — ' +
        'כרטיס שהתהפך למעלה, שבו שורת הגופן יורדת לתחתית — לא נמדד בכלל',
    );
  }

  // ── ש6: מה יושב ב-story ──────────────────────────────────────────────────
  const story = await cdp.evaluate(STORY);
  notes.push(`ש6 — story בגוף המסמך: טיפוס ${story.type}, ערך ${story.value}`);

  // ── ש7: האם לעצמים יש מיקום ברשימות של המנוע ─────────────────────────────
  const fields = await cdp.evaluate(OBJECT_FIELDS);
  if (fields.insert) notes.push(`ש7 — הכנסת קישור: ${fields.insert}`);
  notes.push(`ש7 — שדות של קישור:  ${fields.hyperlink}`);
  notes.push(`ש7 — שדות של story:  ${fields.hyperlinkStory}`);
  notes.push(`ש7 — שדות של הערה:   ${fields.note}`);
} catch (error) {
  // כשל בהרמה אינו ממצא על התפריט: הוא נאמר בשורה אחת, והמדידה נעצרת.
  setupFailure = error instanceof Error ? error.message : String(error);
} finally {
  await close();
  try {
    rmSync(PROBE, { force: true });
  } catch {
    /* קובץ זמני שנשאר ב-dist אינו סיבה להכשיל מדידה */
  }
}

if (setupFailure) {
  console.error(`המדידה לא רצה: ${setupFailure}`);
  process.exit(1);
}

console.log('שער תפריט ההקשר — מה שנמדד:');
for (const note of notes) console.log(`  ${note}`);
console.log('');

if (errors.length > 0) {
  console.error('שער תפריט ההקשר נכשל:');
  for (const error of errors) console.error(`  • ${error}`);
  process.exit(1);
}

console.log('השער עבר: כל מה שתפריט ההקשר נשען עליו במנוע עדיין מתנהג כפי שנמדד.');
