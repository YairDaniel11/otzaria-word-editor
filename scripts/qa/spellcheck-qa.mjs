/**
 * שער בדיקת האיות התורנית, על ה-dist הארוז ב-Chrome אמיתי.
 *
 * ארבע טענות, וכל אחת היא דבר שהיה נשבר בשקט:
 *
 *   1. **עצלות בזמן ריצה** — הנכס של המילון (1.3MB) אינו נמשך עד שמדליקים,
 *      ונמשך פעם אחת. (הטענה המשלימה — שהוא לא נבלע ל-`assets/app.js`
 *      מלכתחילה — היא של `npm run check:dist`, ולא של השער הזה: הגלובל היה
 *      נשאר `undefined` גם אחרי נסיגה כזאת, והשער היה נשאר ירוק.)
 *   2. **דיוק** — פסקה תורנית שלמה, ובה בדיוק שתי מחרוזות ג'יבריש. הספירה
 *      **מדויקת** ולא „לפחות”: מילה תורנית שתסומן בטעות מרימה אותה, ומילת
 *      ג'יבריש שתפוספס מורידה אותה.
 *   3. **„הוסף למילון”** — לחיצה ימנית על מילה מסומנת מציעה להוסיף אותה,
 *      והסימון נעלם מכל המסמך.
 *   4. **מחיר** — הזמן שגלילה עולה **עם** הבדיקה מול **בלעדיה**, על אותו
 *      מסמך ובאותה הרצה. זו מדידה של הקוד שנארז, ולא של שכפול שלו.
 */
import { openApp, createReport, sleep } from './harness.mjs';

/** תקרות: מה שמעליהן כבר נראה למשתמש כתקיעה, ולא כמדידה איטית. */
const MAX_LOAD_MS = 3_000;
/**
 * התקרה לפריים הכבד ביותר בזמן גלילה, **עם** בדיקת האיות. פריים ב-60Hz הוא
 * 16.7ms, וחציו הוא הגבול שממנו והלאה הגלילה מתחילה להיראות קפואה.
 */
const MAX_FRAME_MS = 8;
/** והתוספת מעל אותה מדידה בדיוק בלי הבדיקה — כדי לבודד את מה שאנחנו הוספנו. */
const MAX_FRAME_COST_MS = 4;

/** כמה פעמים הפסקה חוזרת. שלוש נכנסות בעמוד אחד — כלומר הכול גלוי ונספר. */
const REPEATS = 3;
/** מילות הג'יבריש בכל חזרה. אומת מול המילון: אף אחת אינה ערך ואינה נגזרת. */
const UNKNOWN_PER_PARAGRAPH = 2;
const EXPECTED_MARKS = REPEATS * UNKNOWN_PER_PARAGRAPH;

/**
 * פסקה תורנית. כל מילה בה נבדקה מול המילון ונמצאה מוכרת, חוץ מ„זזזזזז”
 * ו„טטטטטט”.
 *
 * „ערוך” הוצא ממנה בכוונה: הוא מילה תורנית לגיטימית שחסרה במילון (ראו
 * TODOs), כלומר הוא מסומן. גרסה קודמת של השער הזה כללה אותו, והספירה שלה
 * הסתמכה עליו — כלומר התיקון הסביר ביותר למילון היה הופך אותה לאדומה בלי
 * ששום דבר במוצר נשבר. מאותה סיבה בדיוק „חחחחחח” הוחלף: הוא **כן** ערך
 * במילון, ולעולם לא היה מסומן.
 */
const PARAGRAPH =
  'ועיין בתוספות שכתב הרא"ש דהא דאמרינן בגמרא ותירצו דהמדובר בשעת הדחק ' +
  'ויש לעיין בשולחן כדעת הרמ"א ובמשנה ברורה זזזזזז טטטטטט ';

const report = createReport('שער בדיקת איות תורנית', { strict: true });
const app = await openApp({ name: 'spellcheck', port: Number(process.env.QA_PORT ?? 9362) });

/**
 * שלושים צעדי גלילה אמיתיים, ומה שהכבד שבפריימים שלהם עלה.
 *
 * שני דברים שהמדידה הזאת נזהרת מהם:
 *
 *   - **גלילה אמיתית ולא `dispatchEvent('scroll')`.** מלבני העמודים הם מה
 *     שמפעיל את המדידה, ואירוע מזויף אינו מזיז אותם — כלומר הוא היה מודד את
 *     הדף בלי להריץ את הקוד שנמדד בכלל.
 *   - **זמן ה-callback, ולא זמן הלולאה.** גרסה קודמת מדדה כמה זמן לוקח
 *     לגלול שלושים צעדים תוך המתנה לפריימים, וקיבלה 33.31ms לצעד בשני
 *     המצבים — כלומר בדיוק שני פריימים של 60Hz. זו מדידה של קצב הציור, לא
 *     של העבודה: היא הייתה מחזירה אותו מספר גם אם המדידה שלנו עלתה 15ms.
 *     כאן `requestAnimationFrame` עטוף לזמן ההרצה של כל callback, והמדידה
 *     שלנו רצה בתוך אחד מהם.
 */
const SCROLL_PROBE = `(async () => {
  const host = window.__otzariaEditor.ui.viewport.getHost();
  if (!host) return JSON.stringify({ error: 'no-host' });

  const durations = [];
  const original = window.requestAnimationFrame;
  window.requestAnimationFrame = function (callback) {
    return original.call(window, function (time) {
      const started = performance.now();
      try { callback(time); } finally { durations.push(performance.now() - started); }
    });
  };

  const frame = () => new Promise((resolve) => original.call(window, resolve));
  try {
    for (let i = 0; i < 30; i++) {
      host.scrollTop += (i % 2 === 0) ? 1 : -1;
      await frame();
      await frame();
    }
  } finally {
    window.requestAnimationFrame = original;
  }

  const total = durations.reduce((sum, value) => sum + value, 0);
  return JSON.stringify({
    frames: durations.length,
    maxMs: +Math.max(0, ...durations).toFixed(2),
    meanMs: +(durations.length ? total / durations.length : 0).toFixed(2),
  });
})()`;

const countMarks = () =>
  app.js("document.querySelectorAll('.spelling-layer__mark').length").then(Number);

try {
  /* 1. עצלות ------------------------------------------------------- */
  const beforeLoad = await app.js(
    "JSON.stringify({ global: typeof window.__OTZARIA_TORAH_DICTIONARY__, tags: document.querySelectorAll('script[src*=\"torah-dictionary\"]').length })",
  );
  console.log('לפני ההדלקה:', beforeLoad);
  JSON.parse(beforeLoad).global === 'undefined'
    ? report.pass('המילון אינו נמשך כל עוד הבדיקה כבויה')
    : report.fail('המילון נמשך בעלייה', beforeLoad);

  /* המסמך ---------------------------------------------------------- */
  const built = await app.js(`(async () => {
    const doc = window.__otzariaEditor.superdoc.activeEditor.doc;
    const listed = await doc.blocks.list({ includeText: true });
    const first = listed.blocks[0];
    await doc.replace({
      target: { kind: 'selection',
        start: { kind: 'text', blockId: first.nodeId, offset: 0 },
        end: { kind: 'text', blockId: first.nodeId, offset: (first.text || '').length } },
      text: new Array(${REPEATS}).fill(${JSON.stringify(PARAGRAPH)}).join(''),
    });
    return 'ok';
  })()`);
  console.log('בניית המסמך:', built);
  await sleep(1_500);

  const pages = Number(await app.js("document.querySelectorAll('[data-page-index]').length"));
  console.log('עמודים:', pages);
  pages === 1
    ? report.pass('כל המסמך בעמוד אחד — הספירה למטה מכסה אותו כולו')
    : report.fail('המסמך גלש ליותר מעמוד', `${pages} עמודים; הספירה המדויקת אינה תקפה`);

  /* המחיר, לפני ההדלקה --------------------------------------------- */
  const idle = JSON.parse(await app.js(SCROLL_PROBE));
  console.log('גלילה בלי בדיקת איות:', JSON.stringify(idle));

  /* 2. הדלקה -------------------------------------------------------- */
  await app.tab('סקירה');
  const startedAt = Date.now();
  const clicked = await app.click('בדיקת איות');
  clicked ? report.pass('נמצא המתג „בדיקת איות” ונלחץ') : report.fail('המתג „בדיקת איות” לא נמצא');

  let marks = 0;
  for (let waited = 0; waited < MAX_LOAD_MS + 5_000; waited += 250) {
    await sleep(250);
    marks = await countMarks();
    if (marks > 0) break;
  }
  const loadMs = Date.now() - startedAt;
  console.log(`טעינה עד לסימון הראשון: ${loadMs}ms, ${marks} סימונים`);

  loadMs <= MAX_LOAD_MS
    ? report.pass('זמן הטעינה סביר', `${loadMs}ms`)
    : report.fail('טעינת המילון איטית מדי', `${loadMs}ms > ${MAX_LOAD_MS}ms`);

  const loaded = JSON.parse(
    await app.js(
      "JSON.stringify({ chars: (window.__OTZARIA_TORAH_DICTIONARY__ || '').length, tags: document.querySelectorAll('script[src*=\"torah-dictionary\"]').length })",
    ),
  );
  console.log('אחרי ההדלקה:', JSON.stringify(loaded));
  loaded.tags === 1
    ? report.pass('הנכס נמשך פעם אחת בלבד')
    : report.fail('הנכס נמשך יותר מפעם אחת', JSON.stringify(loaded));

  /* 3. דיוק --------------------------------------------------------- */
  marks === EXPECTED_MARKS
    ? report.pass('בדיוק המילים שאינן במילון סומנו', String(marks))
    : report.fail(
        'מספר הסימונים אינו מה שנספר בטקסט',
        `${marks} במקום ${EXPECTED_MARKS} — ` +
          (marks > EXPECTED_MARKS ? 'מילה תורנית סומנה בטעות' : "מילת ג'יבריש לא סומנה"),
      );

  const boxes = Number(
    await app.js(`(() => {
      const seen = new Set();
      for (const el of document.querySelectorAll('.spelling-layer__mark')) {
        const box = el.getBoundingClientRect();
        seen.add(Math.round(box.left) + 'x' + Math.round(box.top));
      }
      return seen.size;
    })()`),
  );
  boxes === marks
    ? report.pass('כל סימון במקום משלו — אין ציור כפול')
    : report.fail('שני סימונים על אותו מלבן', `${boxes} ייחודיים מתוך ${marks}`);

  /* 4. המחיר, אחרי ההדלקה ------------------------------------------- */
  const active = JSON.parse(await app.js(SCROLL_PROBE));
  const cost = +(active.maxMs - idle.maxMs).toFixed(2);
  console.log(`גלילה עם בדיקת איות: ${JSON.stringify(active)}`);

  active.maxMs <= MAX_FRAME_MS
    ? report.pass('הפריים הכבד בגלילה נשאר מתחת לחצי פריים', `${active.maxMs}ms`)
    : report.fail('פריים בגלילה חורג', `${active.maxMs}ms > ${MAX_FRAME_MS}ms`);
  cost <= MAX_FRAME_COST_MS
    ? report.pass('התוספת של הבדיקה לפריים זניחה', `+${cost}ms`)
    : report.fail('הבדיקה מייקרת את הפריים', `+${cost}ms > ${MAX_FRAME_COST_MS}ms`);

  /* 5. „הוסף למילון” ------------------------------------------------ */
  const markBox = JSON.parse(
    await app.js(`(() => {
      const el = document.querySelector('.spelling-layer__mark');
      if (!el) return 'null';
      const b = el.getBoundingClientRect();
      // מעל הקו הגלי, בתוך גוף המילה — שם המשתמש לוחץ.
      return JSON.stringify({ x: Math.round(b.left + b.width / 2), y: Math.round(b.top - 6) });
    })()`),
  );

  if (!markBox) {
    report.fail('אין סימון ללחוץ עליו');
  } else {
    for (const type of ['mousePressed', 'mouseReleased']) {
      await app.cdp.send('Input.dispatchMouseEvent', {
        type,
        x: markBox.x,
        y: markBox.y,
        button: 'right',
        buttons: type === 'mousePressed' ? 2 : 0,
        clickCount: 1,
      });
    }
    await sleep(600);

    const items = JSON.parse(
      await app.js(`(() => {
        const menu = document.querySelector('[role="menu"]');
        if (!menu) return 'null';
        return JSON.stringify(Array.prototype.map.call(menu.querySelectorAll('button'), (b) => (b.textContent || '').trim()));
      })()`),
    );
    console.log('פריטי התפריט:', JSON.stringify(Array.isArray(items) ? items.filter(Boolean) : items));

    const add = Array.isArray(items) ? items.find((label) => label.startsWith('הוסף את')) : null;
    if (!add) {
      report.fail('„הוסף למילון” אינו בתפריט על מילה מסומנת', JSON.stringify(items));
    } else {
      report.pass('„הוסף למילון” מוצע על מילה מסומנת', add);

      // `clickMenu` של המסגרת מכוון לתפריטי הרצועה (`.ribbon-menu__popover`),
      // ותפריט ההקשר הוא כרטיס אחר — לכן לחיצה לפי מלבן הפריט עצמו.
      const itemBox = JSON.parse(
        await app.js(`(() => {
          for (const button of document.querySelectorAll('[role="menu"] button')) {
            if (!(button.textContent || '').trim().startsWith('הוסף את')) continue;
            const b = button.getBoundingClientRect();
            return JSON.stringify({ x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) });
          }
          return 'null';
        })()`),
      );
      await app.clickAt(itemBox.x, itemBox.y);
      await sleep(1_500);

      const after = await countMarks();
      console.log(`סימונים לפני: ${marks}, אחרי ההוספה: ${after}`);
      // אותה מילה חוזרת בכל אחת מהחזרות, ולכן כולן יורדות יחד.
      after === marks - REPEATS
        ? report.pass('הסימון של המילה שנוספה נעלם מכל המסמך', `${marks} ⟵ ${after}`)
        : report.fail('הסימון לא ירד כצפוי', `${marks} ⟵ ${after}, ציפינו ל-${marks - REPEATS}`);
    }
  }

  /* 6. כיבוי -------------------------------------------------------- */
  await app.escape();
  await app.tab('סקירה');
  await app.click('בדיקת איות');
  await sleep(800);
  const off = await countMarks();
  off === 0
    ? report.pass('כיבוי מוחק את כל הסימונים')
    : report.fail('נשארו סימונים אחרי כיבוי', String(off));

  console.log('לוג הדף:', JSON.stringify(await app.log()));
} finally {
  app.close();
}

process.exit(report.print() > 0 ? 1 : 0);
