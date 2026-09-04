/**
 * גשש: החלפת גופן עם **סמן מכווץ** ואז הקלדה — issue #14 א׳.
 *
 * הדיווח: „כאשר אני משנה כתב הסמן לא כותב, ולאחר שתי לחיצות על העכבר הוא חוזר
 * לכתב הקודם ומאפשר לכתוב”. שער `home-font-qa` מסמן **טווח** לפני הבחירה בבורר,
 * ולכן אינו מודד את זה. כאן: סמן בסוף שורה, בחירה בבורר הגופן **בלחיצת עכבר
 * אמיתית על פריט ברשימה** (לא `selectValue`, שמסנתז את האירוע), ואז הקלדה —
 * ונבדק (1) איפה המיקוד מיד אחרי הבחירה, (2) באיזה גופן נכתב הטקסט שהוקלד,
 * (3) מה הבורר מציג אחרי שני קליקים על הטקסט החדש — הנקודה נגזרת מהמלבן
 * שהטקסט **צויר** בו, לא מ-`window.getSelection()`, שאינו הסמן של העורך —
 * ו-(4) באיזה גופן ממשיכים אחריהם.
 *
 *   node scripts/qa/font-caret-qa.mjs
 */
import { openApp, createReport } from './harness.mjs';

const report = createReport('גופן — סמן מכווץ ואז הקלדה', { strict: true });
const app = await openApp({ name: 'font-caret', port: Number(process.env.QA_PORT ?? 9602) });

/** התווית של כל שורה, כדי שמסלול ה„לא נמדד” ידווח על אותן שורות בדיוק. */
const ROW = {
  focus: 'המיקוד חזר למסמך מיד אחרי הבחירה בעכבר',
  typed: 'הטקסט שהוקלד נכתב בגופן שנבחר',
  combo: 'הבורר מציג את הגופן החדש אחרי שני קליקים על הטקסט החדש',
  again: 'ההקלדה אחרי הקליקים ממשיכה בגופן החדש',
};

const FIRST = 'fntx';
const SECOND = 'agn';

const focusInfo = () =>
  app.js(`(function(){
    var a = document.activeElement;
    return JSON.stringify({
      tag: a ? a.tagName : null,
      inEditor: !!(a && a.closest && a.closest('.ProseMirror, .superdoc, .editor-stack__host')),
    });
  })()`);

/**
 * ה-rPr של הריצה שהטקסט שלה **מכיל** את המחרוזת.
 *
 * „מתחיל ב-” היה מחמיץ בשני מצבים שקורים בפועל: ריצה שהתמזגה (`fntx agn`
 * בריצה אחת), ורווח מוביל שנכתב `<w:t xml:space="preserve"> agn`. בשניהם
 * „לא נמצאה ריצה” חזר, והשורה קראה במקומה ריצה אחרת.
 */
const rPrOf = (doc, text) => {
  const body = doc.slice(doc.indexOf('<w:body'));
  const runs = body.match(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g) || [];
  const textOf = (run) => [...run.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join('');
  const hit = runs.find((r) => textOf(r).includes(text));
  if (!hit) return null;
  const m = hit.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
  return m ? m[0] : '';
};

/**
 * המלבן של הטקסט **כפי שצויר על המסך**.
 *
 * `window.getSelection()` של הדף אינו הסמן של העורך — הוא מצייר ריצות ל-DOM
 * וקולט הקלדה בשדה נסתר, ולכן ה-`getBoundingClientRect` שלו יצא כאן מלבן אפס
 * והקליקים נחתו על (0,0), מחוץ למסמך.
 */
const screenSpotOf = async (text) =>
  JSON.parse(
    (await app.js(`(function(){
    var root = document.querySelector('.editor-stack');
    if (!root) return 'null';
    var needle = ${JSON.stringify(text)};
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    while (walker.nextNode()) {
      var node = walker.currentNode;
      var at = (node.data || '').indexOf(needle);
      if (at < 0) continue;
      var range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + needle.length);
      var r = range.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
    }
    return 'null';
  })()`)) || 'null',
  );

const OPTION_SEL = '.ribbon-combo-list [role="option"]';

/** בוחר גופן בבורר הרצועה בעכבר אמיתי: קליק על התיבה, ואז קליק על הפריט. */
async function pickFontByMouse(value) {
  await app.click('גופן');
  await app.sleep(500);
  // רשימת הבורר ולא כל [role="option"] בדף: רשימת ה-Tell Me מוסתרת אך קיימת
  // ב-DOM, וכל אינדקס שנמדד מולה מצביע על השורה הלא-נכונה.
  const options = await app.js(`JSON.stringify(Array.from(document.querySelectorAll('${OPTION_SEL}')).map(function(o){return o.getAttribute('data-value');}))`);
  const list = JSON.parse(options || '[]');
  const index = list.indexOf(value);
  // סוגרים את הרשימה גם בכשל: פופ-אובר פתוח היה מסתיר פקדים מכל מדידה שתבוא.
  if (index < 0) {
    await app.press('Escape', 'Escape', 27);
    return { ok: false, list };
  }
  await app.clickSel(OPTION_SEL, index);
  return { ok: true, index };
}

/** ארבע השורות — כולן תלויות בכך שהבחירה בבורר אכן קרתה. */
async function measureAfterPick(target) {
  const focusAfter = JSON.parse(await focusInfo());
  console.log('focus אחרי הבחירה:', JSON.stringify(focusAfter), 'תיבה=', (await app.state('גופן')).value);
  focusAfter.inEditor
    ? report.pass(ROW.focus, JSON.stringify(focusAfter))
    : report.fail('המיקוד לא חזר למסמך אחרי הבחירה — „הסמן לא כותב”', JSON.stringify(focusAfter));

  // הקלדה בלי שום קליק — בדיוק מה שהמשתמש עשה.
  await app.type(FIRST);
  await app.sleep(900);
  const rpr = rPrOf((await app.docx())['word/document.xml'], FIRST);
  console.log(`rPr(${FIRST})=`, JSON.stringify(rpr));
  rpr === null
    ? report.fail('ההקלדה אחרי הבחירה לא נכתבה כלל', `אין ריצה ${FIRST}`)
    : new RegExp(`<w:rFonts[^>]*"${target}"`).test(rpr)
      ? report.pass(ROW.typed, `rFonts=${target}`)
      : report.fail('הטקסט שהוקלד נכתב בגופן הישן', rpr || '(בלי rPr)');

  // שני קליקים באותו מקום — על הטקסט החדש עצמו, כפי שצויר על המסך.
  const spot = await screenSpotOf(FIRST);
  console.log('נקודת הקליקים:', JSON.stringify(spot));
  if (!spot) {
    report.stuck(ROW.combo, `„${FIRST}” לא נמצא על המסך — אין לאן ללחוץ`);
    report.skip(ROW.again, 'הקליקים לא בוצעו');
    return;
  }
  await app.clickAt(spot.x, spot.y);
  await app.sleep(300);
  await app.clickAt(spot.x, spot.y);
  await app.sleep(700);
  const shown = (await app.state('גופן')).value;
  console.log('הבורר אחרי שני קליקים על הטקסט החדש:', shown);
  shown === target
    ? report.pass(ROW.combo, shown)
    : report.fail('הבורר „חזר לכתב הקודם” אחרי שני קליקים', `${shown} במקום ${target}`);

  // ההמשך נמדד על הטקסט **החדש**, לא על זה שנמדד כבר למעלה.
  await app.press('End', 'End', 35);
  await app.type(` ${SECOND}`);
  await app.sleep(1200);
  const rpr2 = rPrOf((await app.docx())['word/document.xml'], SECOND);
  console.log(`rPr(${SECOND})=`, JSON.stringify(rpr2));
  rpr2 === null
    ? report.fail('ההקלדה אחרי הקליקים לא נכתבה כלל', `אין ריצה שמכילה ${SECOND}`)
    : new RegExp(`<w:rFonts[^>]*"${target}"`).test(rpr2)
      ? report.pass(ROW.again, `rFonts=${target}`)
      : report.fail('ההקלדה אחרי הקליקים חזרה לגופן הישן', rpr2 || '(בלי rPr)');
}

try {
  await app.cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await app.sleep(400);

  await app.caret(0);
  await app.type('abc ');
  await app.sleep(500);
  await app.tab('בית');

  const options = (await app.options('גופן')) || [];
  const current = (await app.state('גופן')).value;
  const target = options.map((o) => o.value).find((v) => v && v !== current && /David|Times|Calibri|Frank/i.test(v))
    || options.map((o) => o.value).find((v) => v && v !== current);
  console.log('גופן נוכחי:', current, '→ יעד:', target);

  const picked = target ? await pickFontByMouse(target) : { ok: false, list: [] };
  await app.sleep(600);
  console.log('אחרי הבחירה בעכבר:', JSON.stringify(picked));

  // בחירה שלא קרתה אינה כשל של הפקד: אין מה למדוד, ואדום כאן היה מלמד
  // להתעלם מהשער. `stuck` אינו מפיל את הריצה גם ב-strict — בכוונה.
  if (!picked.ok) {
    report.stuck(
      'בחירת גופן בלחיצת עכבר',
      target
        ? `„${target}” לא נמצא ברשימת הבורר — נמצאו ${JSON.stringify(picked.list)}`
        : `אין גופן מועמד ששונה מ„${current}” — המנייה החזירה ${options.length} פריטים: ${JSON.stringify(options.map((o) => o.value))}`,
    );
    for (const name of [ROW.focus, ROW.typed, ROW.combo, ROW.again]) {
      report.skip(name, 'הבחירה בבורר לא קרתה — אין ממה למדוד');
    }
  } else {
    await measureAfterPick(target);
  }

  console.log('לוג הדף:', JSON.stringify(await app.log()));
} finally {
  app.close();
}
process.exit(report.print() > 0 ? 1 : 0);
