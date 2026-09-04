/**
 * בחירה בגרירה על פני שני טורים במקטע `w:bidi` — מה נבחר, ומה המשתמש רואה.
 *
 * ## למה יש גשש נפרד לזה
 *
 * `docs/superdoc-2.10-review.md` כבר מדד שסדר מילוי הטורים במנוע קבוע
 * שמאל→ימין ואינו קורא את `w:bidi`, וסיכם ש„הנזק בתצוגה בלבד” מפני שה-docx
 * המיוצא יוצא שלם. הגשש הזה מודד את מה שאותו סיכום פספס: **הנזק אינו בתצוגה
 * בלבד — הוא באינטראקציה.** בעברית הטור שנקרא ראשון הוא הימני, והוא ה*שני*
 * בסדר המסמך; לכן גרירה טבעית ממנו שמאלה **מתהפכת סביב העוגן** במקום להמשיך
 * ממנו — הבחירה נשארת רצף אחד (`contiguous: true`) שראשו עבר למקום מוקדם
 * מהעוגן, ולא „נמחקת”. זה הפנים שהמשתמש פוגש, וזה מה שנמדד כאן.
 *
 * ## מה נמדד
 *
 *   1. „עמודות ← שתיים” מהתפריט האמיתי מגיעה לשורת המצב עם ההודעה
 *      (`rtlColumnNote` ב-engine/page-setup.ts) — התיקון היחיד שכן בידינו.
 *   2. הייצוא: `w:bidi` ושני טורים ב-`sectPr`.
 *   3. באיזה צד נוחתת הפסקה הראשונה — כלומר הפער עצמו.
 *   4. גרירה בסדר המסמך (שמאל→ימין): בקרה, וצריכה לצאת רציפה.
 *   5. גרירה בסדר הקריאה העברי (ימין→שמאל): המחווה שהמשתמש עושה בפועל.
 *   6. גרירה **בתוך הטור הימני** אל מתחת לשורה האחרונה שבו — האם הראש מהודק
 *      לסוף הטור או קופץ לטור השכן.
 *   7. Shift+חץ מטה בגבול שבין הטורים — האם המקלדת היא מעקף. מיקום הסמן
 *      מאומת בהקשה בודדת **לפני** רצף ההקשות (ראו `placeCaret`), והשורה
 *      מבחינה בין „לא חצה” לבין „גלש לתחילת המסמך”: השני חמור יותר, וכותרת
 *      אחת לשניהם הייתה מוכרת אותו בפחות ממה שנמדד.
 *
 * ## שלושה כללי מדידה שנלמדו כאן בדם, ואסור לוותר עליהם
 *
 * 1. **לחיצה שממקמת סמן חייבת השהיה בין `mousePressed` ל-`mouseReleased`.**
 *    בלעדיה המנוע אינו מאפס את העוגן, הבחירה הקודמת פשוט מורחבת, והשורה
 *    מודדת את הצעד הקודם ולא את עצמה. זה קרה כאן בפועל: שורת המקלדת „הוכיחה”
 *    פער שהיא כלל לא מדדה. לכן כל מיקום סמן עובר ב-`placeCaret`, שגם **מאמת**
 *    שהבחירה התאפסה לפני שממשיכים.
 * 2. **מרכז הפרגמנט הוא אמצע הטקסט, לא תחילתו.** לחיצה על `at(n)` מציבה את
 *    העוגן בתוך שורה n, ולכן המספר הראשון שנספר הוא n+1. כל קריטריון כאן
 *    לוקח את זה בחשבון במפורש.
 * 3. **ספירת מלבנים לבדה אינה מבדילה בין „הראש זז לאן שלא צריך” לבין „הראש
 *    לא זז בכלל”.** לכן שורה שמכריעה על סמך צדדים מדווחת גם את הדגימה
 *    שלפניה, ומכריעה על המצב שאחרי השחרור ולא על דגימה חיה.
 *
 * ## למה השתלטות על גודל החלון
 *
 * חלון headless הוא 800x600, ושטח הכתיבה של A4 מתחיל מתחת לקו הזה. בלי
 * `Emulation.setDeviceMetricsOverride` אירועי העכבר נוחתים מחוץ לדף, הבחירה
 * יוצאת ריקה, והמדידה נראית כאילו „אין בחירה בכלל”. זה נמדד: אותו סקריפט
 * בדיוק החזיר `empty: true` בכל התרחישים עד שהחלון הוגדל.
 *
 * הרצה:  CHROME=<נתיב> node scripts/qa/column-selection-probe.mjs
 */
import { openApp, createReport, sleep } from './harness.mjs';

const PORT = Number(process.env.QA_PORT ?? 9385);
const report = createReport('בחירה בגרירה על פני שני טורים');

/** כמה פסקאות. די כדי לגלוש לטור שני ולהשאיר בכל טור שורות לזהות. */
const LINES = 40;

/**
 * שוליים עליונים ותחתונים באינץ'. גדולים בכוונה: שטח כתיבה נמוך ממלא שני
 * טורים ב-40 שורות, ובלעדיו היה צריך מאות — והמדידה הייתה לוקחת דקות.
 */
const TALL_MARGIN = 3.3;

/** שם הפקד ברצועה. `openMenu` מחפש לפי התווית, לא לפי ה-tooltip. */
const COLUMNS_BUTTON = 'עמודות';

const app = await openApp({ name: 'column-selection', port: PORT });
await app.cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 1400,
  height: 1500,
  deviceScaleFactor: 1,
  mobile: false,
});
await sleep(1_500);

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

/**
 * כמה מלבני בחירה מצוירים, ובאיזה צד של הדף.
 *
 * `ui.selection.getRects()` הוא ה-API הציבורי שמחזיר בדיוק את מה שמודגש על
 * המסך — ולכן זו המדידה שמייצגת „מה המשתמש רואה”, ולא ספירה של תווים. הוא
 * מחזיר קואורדינטות **חלון** כשלא מועבר `relativeTo`, ולכן ההשוואה ל-
 * `pageMiddle` שנמדד ב-`getBoundingClientRect` היא באותו מרחב.
 */
const rectsBySide = (middle) =>
  app.js(`(() => {
    const ui = window.__otzariaEditor.ui;
    let rects = [], error = null;
    try { rects = ui.selection.getRects() || []; } catch (e) { error = e.message; }
    let left = 0, right = 0;
    rects.forEach((r) => { if (r.left < ${middle}) left++; else right++; });
    // המספרים תמיד קיימים, גם בחריגה. אחרת Math.max על undefined יוצא NaN,
    // ההשוואה יוצאת false, וכשל של ה-API הסגור נרשם כאותה שורת דוח בדיוק כמו
    // הפער שהגשש כולו קיים בשבילו.
    return JSON.stringify({ n: rects.length, left, right, error });
  })()`).then(JSON.parse);

/**
 * מה נבחר, לפי מספרי השורות שבטקסט.
 *
 * `contiguous` נמדד ולא מונח: „25 שורות” אינו „25 שורות **רצופות**”, ובלי
 * הבדיקה הזאת הכותרת בדוח הייתה אומרת יותר ממה שהקוד יודע.
 */
const selectedLines = () =>
  app.js(`(async () => {
    const doc = window.__otzariaEditor.superdoc.activeEditor.doc;
    const current = await doc.selection.current({ includeText: true });
    const text = (current && current.text) || '';
    const nums = [...text.matchAll(/שורה (\\d\\d)/g)].map((m) => Number(m[1]));
    if (!nums.length) return JSON.stringify({ label: '(ריק)', count: 0, contiguous: true });
    const contiguous = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
    return JSON.stringify({
      label: nums[0] + '..' + nums[nums.length - 1] + ' (' + nums.length + (contiguous ? '' : ', לא רצוף') + ')',
      first: nums[0], last: nums[nums.length - 1], count: nums.length, contiguous,
    });
  })()`).then(JSON.parse);

/**
 * מיקום סמן, **עם אימות**.
 *
 * `app.clickAt` של המסגרת ולא `mouse()` המקומי: הוא מכניס 40ms בין ה-press
 * ל-release, ובלעדיהם המנוע אינו מאפס את העוגן. מוחזר `true` רק כשהבחירה
 * באמת התאפסה — סמן אינו בוחר טקסט, ולכן `count === 0` הוא התנאי.
 *
 * מה שהוא **אינו** מאמת: **איפה** נחת הסמן. `count === 0` נכון לכל מיקום,
 * ולכן שורה שמסקנתה תלויה במיקום — כמו שורה 7, שכל מובנה הוא היחס לעוגן —
 * חייבת לאמת את המיקום בעצמה בהקשה בודדת לפני שהיא מודדת רצף הקשות.
 */
async function placeCaret(point) {
  await app.clickAt(point.x, point.y);
  await sleep(400);
  const after = await selectedLines();
  return after.count === 0;
}

/**
 * גרירה לאורך מסלול, עם דגימה אחרי כל צעד ודגימה נוספת **אחרי השחרור**.
 *
 * המסלול ולא קו ישר: „הכול של הטור הראשון התבטל” הוא אירוע **באמצע**
 * הגרירה, ומדידה של מצב הסיום בלבד מפספסת אותו. והדגימה שאחרי השחרור נפרדת,
 * מפני שהכרעה על סמך הדגימה שלפניו הייתה משווה מצב חי למצב שהתייצב.
 */
async function dragAlong(path, sample) {
  const [first] = path;
  await mouse('mouseMoved', first.x, first.y, { button: 'none', buttons: 0 });
  await mouse('mousePressed', first.x, first.y);
  await sleep(100);
  const trail = [];
  for (const point of path.slice(1)) {
    await mouse('mouseMoved', point.x, point.y, { buttons: 1 });
    await sleep(90);
    trail.push({ ...point, ...(await sample()) });
  }
  const last = path[path.length - 1];
  await mouse('mouseReleased', last.x, last.y);
  await sleep(600);
  return { trail, final: await sample(), threw: trail.find((p) => p.error)?.error ?? null };
}

try {
  /* -------------------- בניית המסמך -------------------- */

  // שוליים והטקסט דרך ה-API: זה תנאי המדידה, לא מה שנמדד.
  await app.js(`(async () => {
    const doc = window.__otzariaEditor.superdoc.activeEditor.doc;
    const first = (await doc.sections.list()).items[0];
    await doc.sections.setPageMargins({ target: first.address, top: ${TALL_MARGIN}, bottom: ${TALL_MARGIN}, left: 1, right: 1 });
    const paras = [];
    for (let i = 1; i <= ${LINES}; i++) paras.push('שורה ' + String(i).padStart(2, '0') + ' פסקה עברית');
    await doc.insert({ value: paras.join('\\n\\n'), type: 'markdown' });
  })()`);
  await sleep(2_000);

  /* -------------------- 1: ההודעה בשורת המצב -------------------- */

  // העמודות **מהתפריט האמיתי**, ולא מה-API: מה שנמדד כאן הוא המסלול שהמשתמש
  // עובר, כולל המדווח ושורת המצב. `reset` קודם, כדי ששורת מצב ישנה לא תיזקף
  // לזכות הפקודה הזאת.
  await app.reset();
  await app.tab('פריסה');
  const menu = await app.openMenu(COLUMNS_BUTTON);
  if (!menu) {
    report.stuck('„עמודות” לא נפתח', 'הפקד לא נמצא ברצועה');
  } else if (!(await app.clickMenu('שתיים', { after: 2_500 }))) {
    report.stuck('„שתיים” לא נלחץ', JSON.stringify(menu));
  } else {
    const status = await app.status();
    if (status?.text?.includes('בצד שמאל') && status?.error === false) {
      report.pass('„עמודות ← שתיים” מודיעה למשתמש על סדר הטורים', status.text);
    } else {
      report.fail('ההודעה על סדר הטורים אינה מגיעה לשורת המצב', JSON.stringify(status));
    }
  }
  await sleep(2_500);

  /* -------------------- 2: מה יצא ל-OOXML -------------------- */

  // ההוכחה שהמקטע באמת RTL אינה `sectionDirection` לבדו אלא ה-XML שיוצא.
  const files = await app.docx();
  const sectPr = (files['word/document.xml'] || '').match(/<w:sectPr[\s\S]*?<\/w:sectPr>/g)?.pop() ?? '';
  const hasBidi = /<w:bidi\b/.test(sectPr);
  const hasTwoCols = /<w:cols[^>]*w:num="2"/.test(sectPr);
  if (hasBidi && hasTwoCols) {
    report.pass('הייצוא נכון — `w:bidi` ושני טורים ב-sectPr', sectPr.match(/<w:cols[^>]*>/)?.[0] ?? '');
  } else {
    report.fail('sectPr אינו מה שהמדידה מניחה', `bidi=${hasBidi} cols2=${hasTwoCols} | ${sectPr}`);
  }

  /* -------------------- 3: איפה נחת כל טור -------------------- */

  const geometry = await app.js(`(() => {
    const page = document.querySelector('.superdoc-page').getBoundingClientRect();
    const rows = [];
    document.querySelectorAll('.superdoc-fragment').forEach((el) => {
      const match = /^שורה (\\d\\d)/.exec((el.textContent || '').trim());
      if (!match) return;
      const r = el.getBoundingClientRect();
      rows.push({ line: Number(match[1]), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
    });
    return JSON.stringify({ pageMiddle: Math.round(page.x + page.width / 2), rows });
  })()`).then(JSON.parse);

  const { pageMiddle, rows } = geometry;
  const at = (line) => rows.find((r) => r.line === line);
  const side = (line) => (at(line).x < pageMiddle ? 'שמאלי' : 'ימני');
  const sample = () => rectsBySide(pageMiddle);

  /**
   * בלי **שני** טורים משני צדי אמצע הדף אין מה למדוד, וכל שורה שתירשם אחרי
   * זה תהיה שקר. הבדיקה היא על נוכחות בשני הצדדים ולא רק על „שני ערכי x
   * שונים”: פריסה שנשברה אחרת יכולה לתת שני ערכים באותו צד.
   */
  const leftRows = rows.filter((r) => r.x < pageMiddle);
  const rightRows = rows.filter((r) => r.x >= pageMiddle);
  if (rows.length < LINES || leftRows.length === 0 || rightRows.length === 0) {
    report.stuck(
      'המסמך לא הגיע לשני טורים — אין מה למדוד',
      `${rows.length}/${LINES} שורות, ${leftRows.length} משמאל ו-${rightRows.length} מימין`,
    );
    report.print();
    app.close();
    process.exit(0);
  }

  if (side(1) === 'ימני') {
    report.pass('הטור הראשון נוחת מימין, כמו בוורד', `שורה 01 ב-x=${at(1).x}, אמצע הדף ${pageMiddle}`);
  } else {
    report.fail(
      'סדר מילוי הטורים מתעלם מ-`w:bidi`',
      `שורה 01 נוחתת בטור ה${side(1)} (x=${at(1).x}, אמצע הדף ${pageMiddle}) — בוורד היא מתחילה מימין`,
    );
  }

  // הגבול בין הטורים בסדר המסמך: השורה האחרונה שעדיין בטור הראשון.
  const firstColumnSide = side(1);
  const lastOfFirst = rows.filter((r) => side(r.line) === firstColumnSide).pop().line;
  const firstOfSecond = lastOfFirst + 1;

  /* -------------------- 4: גרירה בסדר המסמך -------------------- */

  {
    const from = at(5);
    const to = at(Math.min(firstOfSecond + 4, LINES));
    const path = [from];
    for (let y = from.y; y <= at(lastOfFirst).y; y += 40) path.push({ x: from.x, y });
    for (let x = from.x; x <= to.x; x += 60) path.push({ x, y: at(lastOfFirst).y });
    path.push(to);

    const { threw } = await dragAlong(path, sample);
    const got = await selectedLines();
    if (threw) {
      report.stuck('גרירה בסדר המסמך — `getRects` זרק', threw);
    } else if (got.first === 6 && got.last >= firstOfSecond && got.contiguous) {
      // 6 ולא 5: הלחיצה נופלת באמצע הטקסט של שורה 05 (ראו כלל המדידה 2).
      report.pass('גרירה בסדר המסמך — רציפה וחוצה את הגבול', got.label);
    } else {
      report.fail('גרירה בסדר המסמך נשברה', `${got.label} (רצוף: ${got.contiguous})`);
    }
  }

  /* -------------------- 5: גרירה בסדר הקריאה העברי -------------------- */

  {
    // המחווה של המשתמש: התחלה בטור שנקרא ראשון (הימני), ירידה בתוכו, ואז מעבר לשני.
    const from = rightRows[Math.floor(rightRows.length * 0.3)];
    const down = rightRows[Math.floor(rightRows.length * 0.8)];
    const to = leftRows[Math.floor(leftRows.length * 0.75)];

    const path = [from];
    for (let y = from.y; y <= down.y; y += 30) path.push({ x: from.x, y });
    for (let x = down.x; x >= to.x; x -= 60) path.push({ x, y: down.y });
    path.push(to);

    const { trail, final, threw } = await dragAlong(path, sample);
    const peak = Math.max(...trail.map((p) => p.right));
    const got = await selectedLines();

    // ההבחנה שהמדידה מספקת, ושהקריטריון הקודם לא נגע בה: `contiguous`. ירידה
    // במספר המלבנים בטור הימני אינה „הבחירה נמחקה” — כאן נמדד
    // `contiguous: true`, כלומר **רצף אחד** שראשו עבר למקום מוקדם יותר בסדר
    // המסמך. זה היפוך של הבחירה סביב העוגן, לא מחיקה. לכן הכשל נשמר למצב שבו
    // הבחירה באמת התפרקה, וההיפוך נרשם כמה שהוא.
    if (threw) {
      report.stuck('גרירה בסדר הקריאה — `getRects` זרק', threw);
    } else if (!got.contiguous) {
      report.fail(
        'גרירה בסדר הקריאה מפרקת את הבחירה',
        `הנבחר בסוף אינו רצף אחד: ${got.label} (שיא ${peak} מלבנים בטור הימני, בסיום ${final.right})`,
      );
    } else if (final.right >= peak) {
      report.pass('גרירה בסדר הקריאה — מה שסומן בטור הימני נשמר', `שיא ${peak}, בסיום ${final.right}`);
    } else {
      report.partial(
        'גרירה בסדר הקריאה — הבחירה מתהפכת סביב העוגן',
        `הטור הימני הגיע ל-${peak} מלבנים וירד ל-${final.right} אחרי המעבר לטור השמאלי, ` +
          `אך הנבחר נשאר רצף אחד: ${got.label} — כלומר הראש עבר למקום מוקדם מהעוגן ` +
          `(שורה ${from.line}) במקום להמשיך ממנו, והבחירה לא נמחקה אלא התהפכה`,
      );
    }
  }

  /* -------------------- 6: גרירה בתוך הטור הימני, אל מתחת לתחתיתו ------- */

  {
    const bottomRight = rightRows[rightRows.length - 1];
    const bottomLeft = leftRows[leftRows.length - 1];
    // נקודה ברוחב הטור הימני, מתחת לשורה האחרונה שלו אך מעל תחתית השמאלי.
    const belowY = Math.round((bottomRight.y + bottomLeft.y) / 2);
    if (belowY <= bottomRight.y + 10) {
      report.skip('גרירה אל מתחת לתחתית הטור הימני', 'הטורים מסתיימים קרוב מדי זה לזה — אין רצועה למדוד');
    } else {
      // **העוגן בטור הימני עצמו** — אחרת השורה מודדת משהו אחר לגמרי.
      const anchor = rightRows[Math.floor(rightRows.length * 0.3)];
      if (!(await placeCaret(anchor))) {
        report.stuck('גרירה אל מתחת לתחתית הטור הימני', 'הלחיצה לא מיקמה סמן נקי');
      } else {
        const path = [anchor];
        for (let y = anchor.y + 40; y <= belowY; y += 40) path.push({ x: anchor.x, y });
        path.push({ x: anchor.x, y: belowY });

        const { trail, final, threw } = await dragAlong(path, sample);
        const before = trail[trail.length - 2] ?? trail[0];
        const got = await selectedLines();
        if (threw) {
          report.stuck('גרירה אל מתחת לתחתית הטור הימני — `getRects` זרק', threw);
        } else if (final.left === 0 && final.right > 0) {
          report.pass(
            'הראש מהודק לסוף הטור הימני כשהסמן יורד מתחתיו',
            `${final.n} מלבנים, כולם מימין; ${got.label}`,
          );
        } else {
          report.fail(
            'סמן ברוחב הטור הימני מתחת לשורה האחרונה שבו — הראש אינו מהודק לסוף הטור',
            `בגובה ${belowY}: ${final.left} מלבנים משמאל ו-${final.right} מימין ` +
              `(בצעד שלפניו ${before.left}/${before.right}) — הנבחר: ${got.label}`,
          );
        }
      }
    }
  }

  /* -------------------- 7: המקלדת בגבול שבין הטורים -------------------- */

  {
    // אם Shift+חץ מטה היה חוצה את הגבול כראוי, הייתה למשתמש דרך לעקוף את
    // הגרירה. `placeCaret` ולא לחיצה גולמית: בלי אימות שהעוגן התאפס, השורה
    // הזאת מודדת את הבחירה של הצעד הקודם ומדווחת עליה כפער של המקלדת.
    const anchorLine = lastOfFirst - 2;
    if (!(await placeCaret(at(anchorLine)))) {
      report.stuck('Shift+חץ מטה בגבול הטורים', 'הלחיצה לא מיקמה סמן נקי — אין ממה למדוד');
    } else {
      // אימות **מיקום** ולא רק „אין בחירה”: `placeCaret` מאמת שהבחירה
      // התאפסה, ולא באיזו שורה נחת הסמן. הקשה בודדת אומרת את מספר השורה
      // בפועל, ובלעדיה כל מה שיימדד ב-6 ההקשות תלוי בהנחה על המיקום — כולל
      // המסקנה על הגלישה, שכל מובנה הוא היחס לעוגן.
      await app.press('ArrowDown', 'ArrowDown', 40, 8);
      await sleep(200);
      const step = await selectedLines();
      if (!(step.count === 1 && step.first === anchorLine + 1)) {
        report.stuck(
          'Shift+חץ מטה בגבול הטורים',
          `הקשה בודדת מסמן שהוצב בשורה ${anchorLine} בחרה ${step.label} ולא את שורה ` +
            `${anchorLine + 1} לבדה — מיקום הסמן אינו מה שהמדידה מניחה, ואין ממה להסיק`,
        );
      } else {
        for (let i = 0; i < 5; i++) {
          await app.press('ArrowDown', 'ArrowDown', 40, 8);
          await sleep(200);
        }
        const got = await selectedLines();
        // תקין = מתחיל מיד אחרי העוגן (ראו כלל המדידה 2) **וגם** חוצה את הגבול.
        const startsRight = got.first === anchorLine + 1;
        const crossed = got.last >= firstOfSecond;
        // הראש מוקדם מהעוגן ⟹ הבחירה נמשכה **אחורה** בסדר המסמך: מתחתית
        // הטור הראשון היא גלשה לתחילת המסמך ולא לראש הטור השני.
        const wrapped = got.first < anchorLine;
        if (startsRight && crossed) {
          report.pass('Shift+חץ מטה חוצה את הגבול בין הטורים', got.label);
        } else if (wrapped) {
          report.fail(
            'Shift+חץ מטה בתחתית הטור הראשון גולש לתחילת המסמך',
            `העוגן בשורה ${anchorLine}, ואומת בהקשה בודדת (${step.label}); 6 הקשות: ${got.label} — ` +
              `אחרי השורה האחרונה בטור הראשון (${lastOfFirst}) הראש נמצא בשורה ${got.first}, ` +
              `מוקדם מהעוגן, במקום בשורה ${firstOfSecond} שהיא ראש הטור השני`,
          );
        } else {
          report.fail(
            'Shift+חץ מטה אינו חוצה את הגבול בין הטורים',
            `העוגן בשורה ${anchorLine}, ואומת בהקשה בודדת (${step.label}); 6 הקשות: ${got.label} — ` +
              `${startsRight ? 'מתחיל נכון' : `מתחיל ב-${got.first} ולא ב-${anchorLine + 1}`}, ` +
              `${crossed ? 'חצה' : `לא הגיע לשורה ${firstOfSecond}`}`,
          );
        }
      }
    }
  }

  report.print();
} catch (error) {
  console.error('הגשש נפל:', error?.stack ?? error);
  process.exitCode = 1;
} finally {
  app.close();
}
