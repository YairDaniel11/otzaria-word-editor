/**
 * הצמדת לחיצה לשורה הקרובה — engine/pointer-snap.ts, נמדד במנוע אמיתי.
 *
 * ## הפער שנמדד לפני התיקון (superdoc 2.11.0, docx-engine 0.10.0)
 *
 * לחיצה בכל נקודה שאינה על גליף החזירה את הסמן לתחילת הטקסט:
 *
 *     משמאל לסוף שורה עברית (x=150 על השורה)   → היסט 0 של אותה שורה
 *     בשוליים הימניים, לפני תחילת השורה        → היסט 0
 *     מתחת לשורה האחרונה, בכל x                → הפסקה **הראשונה**, היסט 0
 *     גרירה מהשורה הראשונה אל מתחת לטקסט       → הבחירה מתאפסת לתחילת הבלוק
 *
 * ב-Word כל אחת מאלה נוחתת במקום הקרוב ביותר ללחיצה: סוף השורה, תחילתה,
 * סוף השורה האחרונה, והבחירה מתרחבת עד סוף הטקסט.
 *
 * ## מה נמדד כאן
 *
 * מסמך של שלוש פסקאות — עברית ארוכה, ריקה, עברית קצרה — והלחיצות שלמעלה,
 * כל אחת עם הציפייה של Word. הבחירה נקראת מ-`ui.selection.getSnapshot()`
 * (מזהה בלוק והיסט), והבלוקים מזוהים בבקרה: לחיצה **בתוך** כל שורה, שהיא
 * גם בדיקת השפיות שהמדידה עצמה עובדת.
 *
 * ## שני כללי מדידה
 *
 *   - **לחיצה = `press`, 40ms, `release`** (`app.clickAt`). בלי ההשהיה
 *     המנוע אינו מאפס את העוגן — נלמד ב-column-selection-probe.mjs.
 *   - **Emulation.setDeviceMetricsOverride**: חלון headless הוא 800x600, ואזור
 *     הכתיבה של A4 עם שוליים מתחיל מתחת לקו הזה.
 *
 * הרצה:  CHROME=<נתיב> node scripts/qa/click-snap-qa.mjs
 */
import { openApp, createReport, sleep } from './harness.mjs';

const PORT = Number(process.env.QA_PORT ?? 9388);
const report = createReport('הצמדת לחיצה לשורה הקרובה', { strict: true });

const LONG = 'שורה ראשונה ארוכה יותר';
const SHORT = 'קצר';

const app = await openApp({ name: 'click-snap', port: PORT });
await app.cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 1200,
  height: 1400,
  deviceScaleFactor: 1,
  mobile: false,
});
await sleep(1_000);

const mouse = (type, x, y, extra = {}) =>
  app.cdp.send('Input.dispatchMouseEvent', {
    type,
    x,
    y,
    button: 'left',
    buttons: type === 'mousePressed' ? 1 : 0,
    clickCount: 1,
    ...extra,
  });

/** הבחירה כפי שהמנוע מחזיק אותה, ומיקום הסמן המצויר. */
const selection = () =>
  app
    .js(`(() => {
      const caret = document.querySelector('.sd-v2-local-selection-caret');
      const rect = caret ? caret.getBoundingClientRect() : null;
      const snap = window.__otzariaEditor?.ui?.selection?.getSnapshot();
      const t = snap?.selectionTarget;
      return JSON.stringify({
        startBlock: t?.start?.blockId ?? null, start: t?.start?.offset ?? null,
        endBlock: t?.end?.blockId ?? null, end: t?.end?.offset ?? null,
        caretX: rect ? Math.round(rect.left) : null, caretY: rect ? Math.round(rect.top) : null,
      });
    })()`)
    .then(JSON.parse);

/** מלבני הגליפים של כל צומת טקסט בעמוד הראשון, בסדר המסמך. */
const glyphBoxes = () =>
  app
    .js(`(() => {
      const page = document.querySelector('[data-page-index]');
      const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
      const out = [];
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const rect = range.getClientRects()[0];
        if (rect) out.push({ text: node.nodeValue, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
      }
      const pageBox = page.getBoundingClientRect();
      return JSON.stringify({ boxes: out, page: { left: pageBox.left, right: pageBox.right, top: pageBox.top, bottom: pageBox.bottom } });
    })()`)
    .then(JSON.parse);

async function click(x, y) {
  await app.clickAt(x, y);
  await sleep(250);
  return selection();
}

const collapsed = (sel) => sel.startBlock === sel.endBlock && sel.start === sel.end;
const describe = (sel) => `${sel.startBlock}:${sel.start}→${sel.endBlock}:${sel.end}, סמן x=${sel.caretX}`;

try {
  /* -------------------- בניית המסמך -------------------- */
  await app.caret(0);
  await app.type(LONG);
  await app.press('Enter', 'Enter', 13);
  await app.press('Enter', 'Enter', 13);
  await app.type(SHORT);
  await sleep(800);

  const { boxes, page } = await glyphBoxes();
  if (boxes.length !== 3) {
    report.stuck('המסמך נבנה', `נמדדו ${boxes.length} צומתי טקסט במקום 3`);
    throw new Error('stop');
  }
  const [line1, line2, line3] = boxes;
  const mid = (box) => (box.top + box.bottom) / 2;

  /* -------------------- בקרה: לחיצות בתוך הטקסט -------------------- */
  const inside1 = await click(line1.right - 30, mid(line1));
  const inside3 = await click(line3.right - 8, mid(line3));
  const onEmpty = await click(line2.right - 2, mid(line2));
  const ids = { line1: inside1.startBlock, line2: onEmpty.startBlock, line3: inside3.startBlock };
  const sane =
    collapsed(inside1) && inside1.start > 0 && inside1.start < LONG.length &&
    collapsed(inside3) && inside3.start >= 0 && inside3.start <= SHORT.length &&
    ids.line1 && ids.line3 && ids.line1 !== ids.line3;
  if (!sane) {
    report.stuck('בקרה: לחיצה בתוך שורה מציבה סמן בתוכה', `${describe(inside1)}; ${describe(inside3)}`);
    throw new Error('stop');
  }
  report.pass('בקרה: לחיצה בתוך שורה מציבה סמן בתוכה', `שורה 1 היסט ${inside1.start}, שורה 3 היסט ${inside3.start}`);

  /* -------------------- הלחיצות שהיו שבורות -------------------- */

  // 1. משמאל לסוף השורה העברית: סוף השורה, לא תחילתה.
  await click(line1.right - 30, mid(line1));
  const beyondEnd = await click(page.left + 40, mid(line1));
  const endOk = collapsed(beyondEnd) && beyondEnd.startBlock === ids.line1 && beyondEnd.start === LONG.length;
  (endOk ? report.pass : report.fail).call(
    report,
    'משמאל לסוף שורה עברית — הסמן בסוף השורה',
    `${describe(beyondEnd)}; צפוי היסט ${LONG.length}, סמן x≈${Math.round(line1.left)}`,
  );

  // 2. בשוליים הימניים, לפני תחילת השורה: תחילתה. (היה נכון גם קודם — במקרה.)
  await click(line1.right - 30, mid(line1));
  const beforeStart = await click(page.right - 20, mid(line1));
  const startOk = collapsed(beforeStart) && beforeStart.startBlock === ids.line1 && beforeStart.start === 0;
  (startOk ? report.pass : report.fail).call(report, 'בשוליים הימניים ליד שורה — הסמן בתחילתה', describe(beforeStart));

  // 3. מתחת לשורה האחרונה: סופה — לא הפסקה הראשונה.
  await click(line1.right - 30, mid(line1));
  const below = await click(page.left + 300, line3.bottom + 200);
  const belowOk = collapsed(below) && below.startBlock === ids.line3 && below.start === SHORT.length;
  (belowOk ? report.pass : report.fail).call(
    report,
    'מתחת לכל הטקסט — סוף השורה האחרונה',
    `${describe(below)}; צפוי ${ids.line3}:${SHORT.length}`,
  );

  // 4. מתחת לטקסט, אבל אופקית מעל גליף של השורה האחרונה: ה-x נשמר.
  await click(line1.right - 30, mid(line1));
  const belowOver = await click(line3.right - 4, line3.bottom + 200);
  const belowOverOk = collapsed(belowOver) && belowOver.startBlock === ids.line3 && belowOver.start < SHORT.length;
  (belowOverOk ? report.pass : report.fail).call(report, 'מתחת לטקסט, מעל גליף — אותו x, השורה האחרונה', describe(belowOver));

  // 5. שורה ריקה: לחיצה במרחק ממנה נוחתת בה — לא בשכנותיה.
  await click(line1.right - 30, mid(line1));
  const empty = await click(page.left + 300, mid(line2));
  const emptyOk = collapsed(empty) && empty.startBlock === ids.line2;
  (emptyOk ? report.pass : report.fail).call(report, 'לחיצה על שורה ריקה, רחוק מהגליף — הסמן בפסקה הריקה', describe(empty));

  // 6. מעל השורה הראשונה (השוליים העליונים): השורה הראשונה, ב-x של הלחיצה.
  await click(line3.right - 8, mid(line3));
  const above = await click(line1.right - 30, page.top + 30);
  const aboveOk = collapsed(above) && above.startBlock === ids.line1 && above.start > 0 && above.start < LONG.length;
  (aboveOk ? report.pass : report.fail).call(report, 'בשוליים העליונים — השורה הראשונה, באותו x', describe(above));

  // 7. גרירה מהשורה הראשונה אל מתחת לטקסט: הראש מגיע לסוף הטקסט, לא מתאפס.
  //
  // מה נמדד כאן הוא **הראש** (`end`) בלבד. העוגן של גרירה ב-CDP headless אינו
  // יציב: המנוע מתחיל את הגרירה רק אחרי סף תנועה, ולפעמים מעגן אותה בצעד
  // הראשון ולא בלחיצה — נמדד בשלוש הרצות עם תזמונים שונים, ובלי ההצמדה גם.
  // גרירה שכלל לא התחילה (בחירה מכווצת אחרי השחרור) היא כשל מדידה, לא של
  // הפקד, ולכן „תקוע” ולא „שבור”.
  await click(line3.right - 8, mid(line3));
  const from = { x: line1.right - 30, y: mid(line1) };
  await mouse('mousePressed', from.x, from.y);
  await sleep(100);
  const trail = [];
  for (let step = 1; step <= 10; step++) {
    await mouse('mouseMoved', from.x - step * 20, from.y + step * 15, { buttons: 1 });
    await sleep(60);
    trail.push(await selection());
  }
  await mouse('mouseReleased', from.x - 200, from.y + 150);
  await sleep(500);
  const dragged = await selection();
  const ranged = [...trail, dragged].filter((sample) => !collapsed(sample));
  const reset = ranged.find((sample) => sample.endBlock === ids.line1 && sample.end === 0);
  const dragName = 'גרירה אל מתחת לטקסט — הראש נמשך עד סוף המסמך';
  if (reset) {
    report.fail(dragName, `הראש התאפס לתחילת הבלוק: ${describe(reset)}`);
  } else if (ranged.length === 0) {
    report.stuck(dragName, `הגרירה לא התחילה ב-CDP: ${describe(dragged)}`);
  } else {
    const endOk = ranged.every((sample) => sample.endBlock === ids.line3 && sample.end === SHORT.length);
    (endOk ? report.pass : report.fail).call(
      report,
      dragName,
      `${ranged.map(describe).join('; ')}; צפוי ראש ${ids.line3}:${SHORT.length}`,
    );
  }
} catch (error) {
  if (error?.message !== 'stop') report.stuck('הריצה', error?.message ?? String(error));
} finally {
  app.close();
}

report.print();
