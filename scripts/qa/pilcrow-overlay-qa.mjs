/**
 * שער QA ממוקד: „סימני עיצוב" — ¶ בפועל ב-DOM (src/ui/shell/PilcrowOverlay.vue +
 * engine/formatting-marks-layer.ts), לא רק ש`active` מתהפך במנוע (זה כבר
 * נמדד ונמצא שבור ב-scripts/qa/review-view-qa.mjs — המנוע עצמו אינו מצייר
 * כלום, ראו docs/superdoc-2.10-review.md).
 *
 * `success: true` / `active: true` אינם הוכחה כאן — בדיוק כמו
 * page-border-overlay-qa.mjs / line-number-overlay-qa.mjs.
 *
 * הרצה:
 *   node scripts/qa/pilcrow-overlay-qa.mjs
 * יציאה 9380 בלבד.
 */
import { openApp, createReport } from './harness.mjs';

const PORT = Number(process.env.QA_PORT ?? 9380);
const report = createReport('סימני עיצוב — ציור ¶ בפועל בעורך', { strict: true });

const app = await openApp({ name: 'pilcrow-overlay', port: PORT });

await app.cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 1600,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});
await app.sleep(1200);

/** כל סימני ה-¶ המצוירים כרגע. */
async function marks() {
  const raw = await app.js(`(function () {
    var els = Array.prototype.slice.call(document.querySelectorAll('.pilcrow-layer__mark'));
    var items = els.map(function (el) {
      var r = el.getBoundingClientRect();
      return { text: (el.textContent || '').trim(), top: r.top, left: r.left };
    });
    items.sort(function (a, b) { return a.top - b.top; });
    return JSON.stringify({ count: items.length, items: items });
  })()`);
  return JSON.parse(raw);
}

try {
  await app.caret(0);

  // מסמך שלוש-פסקאות: רגילה, ריקה (Enter כפול), ופסקה ארוכה שגולשת לשתי
  // שורות — בדיוק שלושת התרחישים שנדרשו.
  await app.type('paragraph one is short');
  await app.press('Enter', 'Enter', 13);
  await app.press('Enter', 'Enter', 13); // פסקה ריקה
  await app.type(
    'this is a much longer paragraph that should wrap across more than a single visual line on the page',
  );
  await app.sleep(600);

  const before = await marks();
  log('לפני הדלקה:', JSON.stringify(before));
  if (before.count > 0) {
    report.fail('אין ¶ לפני הדלקה', `כבר יש ${before.count} סימנים לפני שהפקד נלחץ`);
  } else {
    report.pass('אין ¶ לפני הדלקה', 'ברירת המחדל — כבוי, כמו ב-Word');
  }

  // הדלקה מלשונית „תצוגה".
  const tabOk = await app.tab('תצוגה');
  const clicked = await app.click('סימני עיצוב', { after: 900 });
  if (!clicked) {
    report.fail('הדלקת סימני עיצוב', 'הכפתור „סימני עיצוב" לא נמצא/מנוטרל בלשונית תצוגה');
  } else {
    const after = await marks();
    log('אחרי הדלקה:', JSON.stringify(after));
    // 3 פסקאות זכאיות (nodeType==='paragraph'): רגילה, ריקה, וארוכה. כולן.
    if (after.count >= 3 && after.items.every((m) => m.text === '¶')) {
      report.pass('הדלקת סימני עיצוב', `${after.count} סימני ¶ צוירו, כולם התו הנכון`);
    } else {
      report.fail(
        'הדלקת סימני עיצוב',
        `צפויים לפחות 3 סימנים, כולם "¶" — התקבל ${after.count}: ${JSON.stringify(after.items)}`,
      );
    }

    // שלוש שורות נפרדות (topPx שונה משמעותית) — לא כולן על אותה שורה.
    const distinctRows = new Set(after.items.map((m) => Math.round(m.top / 5)));
    if (distinctRows.size >= 3) {
      report.pass('שלוש שורות נפרדות', `${distinctRows.size} שורות מובחנות`);
    } else {
      report.fail('שלוש שורות נפרדות', `רק ${distinctRows.size} שורות מובחנות — ¶ לא התפזרו נכון`);
    }
  }

  // עדכון חי עם עריכת טקסט: הוספת פסקה רביעית אחרי שהסימנים כבר דלוקים.
  // ממקמים סמן מחדש קודם: הלחיצה על כפתור הרצועה למעלה גנבה פוקוס מהמסמך,
  // ובלעדי הרענון הזה ההקלדה הבאה לא הייתה נכנסת למסמך בכלל (בדיוק המלכודת
  // שכל שער QA אחר כאן נזהר ממנה — ראו caret() אחרי כל אינטראקציה ברצועה).
  await app.caret(0);
  await app.press('End', 'End', 35, 2); // Ctrl+End — סוף המסמך, לא רק סוף השורה הראשונה
  await app.sleep(200);
  await app.press('Enter', 'Enter', 13);
  await app.type('fourth paragraph added live');
  await app.sleep(900);
  const afterEdit = await marks();
  log('אחרי עריכה חיה:', JSON.stringify(afterEdit));
  if (afterEdit.count >= 4) {
    report.pass('עדכון חי עם עריכה', `${afterEdit.count} סימנים אחרי הוספת פסקה — כולל את הפסקה החדשה`);
  } else {
    report.fail('עדכון חי עם עריכה', `צפויים לפחות 4 סימנים אחרי עריכה — התקבל ${afterEdit.count}`);
  }

  // כיבוי — הסימנים נעלמים.
  const clickedOff = await app.click('סימני עיצוב', { after: 700 });
  const afterOff = await marks();
  log('אחרי כיבוי:', JSON.stringify(afterOff));
  if (clickedOff && afterOff.count === 0) {
    report.pass('כיבוי סימני עיצוב', 'כל הסימנים הוסרו מה-DOM');
  } else {
    report.fail('כיבוי סימני עיצוב', `צפוי 0 סימנים אחרי כיבוי — התקבל ${afterOff.count}`);
  }

  // מסמך עברי (RTL) — בדיקת כיוון: לפחות סימן אחד עם left קרוב לשולי הדף
  // הימניים (RTL — הפסקה מתחילה מימין, ה-¶ יושב בקצה השמאלי של הטקסט).
  await app.click('סימני עיצוב', { after: 700 }); // הדלקה מחדש
  await app.caret(0);
  await app.press('End', 'End', 35, 2); // Ctrl+End — סוף המסמך, אחרי לחיצת הרצועה
  await app.sleep(200);
  await app.press('Enter', 'Enter', 13);
  await app.type('שלום עולם בעברית');
  await app.sleep(700);
  const hebrew = await marks();
  log('אחרי פסקה עברית:', JSON.stringify(hebrew));
  if (hebrew.count > 0) {
    report.pass('פסקה עברית מסומנת', `${hebrew.count} סימנים אחרי הוספת פסקה עברית`);
  } else {
    report.fail('פסקה עברית מסומנת', 'לא נוסף אף סימן על פסקה עברית');
  }
} catch (error) {
  report.fail('ריצה', `זרק: ${error?.message}`);
} finally {
  app.close();
}

function log(...a) {
  console.log(...a);
}

process.exit(report.print() > 0 ? 1 : 0);
