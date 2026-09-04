/**
 * גשש: פעולות הרשימה כשהסמן **מכווץ** — issue #14 ג׳.
 *
 * הדיווח: „במספור פסקאות – רשימה מופיע ‚יש למקם את הסמן בתוך הרשימה׳ … כאשר
 * העכבר על אחד התפריטים הוא כאילו יוצא מהמסמך”. שער `hebrew-numbering-ui-qa`
 * עובר, אבל הוא בוחר **טווח** („בחר הכל”) לפני שפותח את התפריט. כאן נמדדים
 * שלושה מסלולים של משתמש שמקליד:
 *   1. סמן מכווץ בתוך פריט רשימה עם טקסט.
 *   2. סמן על פריט רשימה **ריק** (Enter אחרי הפריט האחרון) — הרגע שבו בוחרים
 *      סגנון מספור לפריט הבא.
 *   3. סמן בפסקה **רגילה** (לא רשימה) ובחירת סגנון מספור מהתפריט — האם התפריט
 *      יוצר רשימה, או מסרב.
 *   4. „הפוך רשימה ממוספרת לתבליטים” על רשימה קיימת — הסמן שמצטייר, ובנפרד
 *      `numFmt` **וגם** `lvlText`: `numFmt="bullet"` עם `lvlText="%1."` הוא
 *      מסמך שנראה תקין בבדיקה חלקית ומצייר „%1.” על המסך.
 *   5. אותה המרה כשלרשימה **שכנה** יש `numId` נפרד אך אותו `abstractNumId`
 *      (כך נראית רשימה שהתחילה מחדש מ-1) — האם השכנה נגררת יחד.
 *   6. אותה המרה על רשימה **מקוננת** — מה קורה לרמה 1 כשמהפכים ברמה 0.
 *   7. המסלול ההפוך, הלוך **וחזור**: מספור → תבליטים → מספור. שם היה הכשל
 *      השקט — `numFmt="decimal"` עם `lvlText="•"` שנשאר, וכל תשע הרמות
 *      נמדדות ולא רק רמה 0.
 * ובכל אחד: `doc.selection.current()` (אסינכרוני!) לפני התפריט ובזמן שהוא פתוח.
 *
 * כל שורת פעולה דורשת שני דברים: שלא הופיעה ההודעה „יש למקם את הסמן” (שומר
 * הרגרסיה על הדיווח המקורי), ושהתוצאה **נמדדה** — הסמנים שמצוירים על המסך
 * וה-OOXML של הפסקה עצמה. „שקט” אינו הצלחה.
 *
 *   node scripts/qa/list-caret-qa.mjs
 */
import { openApp, createReport } from './harness.mjs';

const report = createReport('רשימה — סמן מכווץ ותפריט', { strict: true });
const app = await openApp({ name: 'list-caret', port: Number(process.env.QA_PORT ?? 9601) });

const readSelection = () =>
  app.js(`(async function(){
    try {
      var ed = window.__otzariaEditor && window.__otzariaEditor.superdoc && window.__otzariaEditor.superdoc.activeEditor;
      if (!ed || !ed.doc || !ed.doc.selection) return JSON.stringify({error:'no editor'});
      var info = await ed.doc.selection.current();
      var listed = await ed.doc.blocks.list();
      var seg = info && info.target && info.target.segments && info.target.segments[0];
      var block = seg ? (listed.blocks || []).find(function(b){ return b.nodeId === seg.blockId; }) : null;
      return JSON.stringify({
        empty: info ? info.empty : undefined,
        target: info ? info.target : undefined,
        selectionTarget: info ? info.selectionTarget : undefined,
        blockNodeType: block ? block.nodeType : null,
        activeElement: document.activeElement ? document.activeElement.tagName : null,
      });
    } catch (e) { return JSON.stringify({error: String(e)}); }
  })()`);

/** הסמנים שמצוירים בפועל — מה שהמשתמש רואה, ועל מה הוא דיווח. */
const markersOf = () =>
  app.js(
    `JSON.stringify(Array.from(document.querySelectorAll('[class*="list-marker"]'))` +
      `.filter(function(n){ return n.getBoundingClientRect().width > 0; })` +
      `.map(function(n){ return n.textContent.replace(/\\u200f/g,''); }))`,
  ).then(JSON.parse);

const parse = (json) => { try { return JSON.parse(json); } catch { return { error: json }; } };
const blockIdOf = (info) => (info?.target?.segments?.[0]?.blockId) ?? null;

const paragraphsOf = (files) => (files['word/document.xml'] || '').match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g) || [];
const numberingOf = (files) => files['word/numbering.xml'] || '';
const textOf = (p) =>
  (p.match(/<w:t[^>]*>[\s\S]*?<\/w:t>/g) || [])
    .map((t) => t.replace(/<[^>]+>/g, '').replace(/[\u200e\u200f\ufeff]/g, ''))
    .join('');

/**
 * ה-`numId` של הפסקה → ה-`<w:num>` שלה → ה-`abstractNum` → ה-`<w:lvl>` המבוקש.
 * בלי השרשור הזה „יש hebrew1 ב-numbering.xml” עובר גם על תבנית של פריט או רמה אחרים.
 *
 * `ilvl` הוא הרמה שנקראת מההגדרה, ו-`paraIlvl` הרמה שהפסקה **עצמה** יושבת בה:
 * בפריט מקונן השתיים נפרדות, וקריאת רמה 0 בשבילו הייתה מודדת את ההורה.
 */
function lvlOf(paragraph, numbering, ilvl = 0) {
  const numId = paragraph.match(/<w:numId w:val="(\d+)"\s*\/>/)?.[1] ?? null;
  const num = numId ? numbering.match(new RegExp(`<w:num w:numId="${numId}"[^>]*>[\\s\\S]*?</w:num>`))?.[0] ?? '' : '';
  const abstractNumId = num.match(/<w:abstractNumId w:val="(\d+)"\s*\/>/)?.[1] ?? null;
  const abstract = abstractNumId
    ? numbering.match(new RegExp(`<w:abstractNum w:abstractNumId="${abstractNumId}"[^>]*>[\\s\\S]*?</w:abstractNum>`))?.[0] ?? ''
    : '';
  const lvl = abstract.match(new RegExp(`<w:lvl w:ilvl="${ilvl}"[^>]*>[\\s\\S]*?</w:lvl>`))?.[0] ?? '';
  const override = num.match(new RegExp(`<w:lvlOverride w:ilvl="${ilvl}"[^>]*>[\\s\\S]*?</w:lvlOverride>`))?.[0] ?? '';
  return {
    numId,
    abstractNumId,
    paraIlvl: paragraph.match(/<w:ilvl w:val="(\d+)"\s*\/>/)?.[1] ?? null,
    numFmt: lvl.match(/<w:numFmt w:val="([^"]+)"/)?.[1] ?? null,
    lvlText: lvl.match(/<w:lvlText w:val="([^"]*)"/)?.[1] ?? null,
    markerFont: lvl.match(/<w:rFonts[^>]*w:ascii="([^"]+)"/)?.[1] ?? null,
    start: lvl.match(/<w:start w:val="(\d+)"\s*\/>/)?.[1] ?? null,
    startOverride: override.match(/<w:startOverride w:val="(\d+)"\s*\/>/)?.[1] ?? null,
  };
}

const paraOf = (files, text) => paragraphsOf(files).find((p) => textOf(p) === text) || '';

/** רמת הקינון שהסמן יושב בה, מ-`lists.getState` — סמכות הרשימות של המנוע. */
const caretState = () =>
  app.js(`(async function(){
    try {
      var ed = window.__otzariaEditor.superdoc.activeEditor;
      var info = await ed.doc.selection.current();
      var seg = info && info.target && info.target.segments && info.target.segments[0];
      if (!seg) return JSON.stringify({error:'אין blockId'});
      return JSON.stringify(await ed.doc.lists.getState({ target: {kind:'block', nodeType:'paragraph', nodeId: seg.blockId} }));
    } catch (e) { return JSON.stringify({error: String(e)}); }
  })()`).then(parse);

/** כל תשע הרמות: המרה שנעצרה ברמה 0 משאירה תבליטים שאין פקד שיגיע אליהם. */
const allLevelsOf = (paragraph, numbering) =>
  Array.from({ length: 9 }, (_, ilvl) => lvlOf(paragraph, numbering, ilvl));

/** תמצית לקריאה בלוג ולהשוואה בין השלבים. */
const brief = (levels) => levels.map((l, i) => `${i}:${l.numFmt}|${l.lvlText}|${l.markerFont ?? '-'}`).join(' ');

/**
 * ממקמת סמן בשורה לפי הטקסט שבה. `app.caret(index)` נשבר כאן: כל פסקה מציירת
 * שני אלמנטים, והמסמך גדל בין השלבים.
 */
async function caretOn(text) {
  const rect = JSON.parse(
    await app.js(`(function(){
      var lines = Array.prototype.slice.call(document.querySelectorAll('.superdoc-line, .superdoc-fragment'));
      var el = lines.filter(function(n){ return (n.textContent || '').indexOf(${JSON.stringify(text)}) >= 0; }).pop();
      if (!el) return 'null';
      var r = el.getBoundingClientRect();
      return JSON.stringify({ x: Math.round(r.x + Math.min(20, r.width / 2)), y: Math.round(r.y + r.height / 2) });
    })()`),
  );
  if (!rect) throw new Error(`השורה „${text}” לא נמצאה על המסך — הבדיקה לא מדדה כלום`);
  await app.clickAt(rect.x, rect.y);
  await app.sleep(600);
  await app.press('End', 'End', 35);
  await app.sleep(300);
}

/** פסקה חדשה **מחוץ** לרשימה: Enter פותח פריט ריק, ו-Enter נוסף מסיים אותה. */
async function newParagraphAfterList() {
  await app.press('Enter', 'Enter', 13);
  await app.sleep(400);
  await app.press('Enter', 'Enter', 13);
  await app.sleep(500);
}

/** שני פריטים ממוספרים ברצף אחד: הכפתור „מספור” על הראשון, Enter לשני. */
async function typeNumberedPair(firstText, secondText) {
  await app.type(firstText);
  await app.sleep(400);
  await app.click('מספור');
  await app.sleep(1100);
  await app.press('End', 'End', 35);
  await app.press('Enter', 'Enter', 13);
  await app.sleep(400);
  await app.type(secondText);
  await app.sleep(600);
}

async function menuAction(label, button = 'פעולות מספור') {
  await app.reset();
  await app.click(button);
  await app.sleep(600);
  const during = parse(await readSelection());
  const picked = await app.clickMenu(label);
  // פריט שלא נמצא = מדידה שלא קרתה, לא „התקבל”. נכשל בקול, לא בשקט.
  if (!picked) throw new Error(`פריט התפריט „${label}” לא נמצא — הבדיקה לא מדדה כלום`);
  await app.sleep(1100);
  const status = await app.status();
  return { during, picked, status, markers: await markersOf(), files: await app.docx() };
}

try {
  await app.cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await app.sleep(400);

  // רשימה של שני פריטים, כמו שהשער הירוק בונה אותה, ואחריה פסקה רגילה.
  await app.caret(0);
  await app.type('ראשון');
  await app.press('Enter', 'Enter', 13);
  await app.type('שני');
  await app.sleep(500);
  await app.tab('בית');
  await app.click('בחר הכל');
  await app.sleep(500);
  await app.click('מספור');
  await app.sleep(1200);

  /* ---- 1. סמן מכווץ בפריט עם טקסט ---- */
  // כל פסקה מציירת גם `.superdoc-fragment` וגם `.superdoc-line`, ולכן אינדקס 1
  // הוא עוד הפריט הראשון; הפריט השני הוא 2.
  await app.caret(2);
  await app.press('End', 'End', 35);
  await app.sleep(400);
  const s1 = parse(await readSelection());
  console.log('1 לפני התפריט:', JSON.stringify(s1));
  blockIdOf(s1)
    ? report.pass('1. סמן מכווץ בפריט עם טקסט — יש blockId', `${blockIdOf(s1)} (${s1.blockNodeType})`)
    : report.fail('1. סמן מכווץ בפריט עם טקסט — אין blockId', JSON.stringify(s1));
  const r1 = await menuAction('התחל מחדש מ-1');
  const numbering1 = numberingOf(r1.files);
  const first1 = lvlOf(paragraphsOf(r1.files).find((p) => textOf(p) === 'ראשון') || '', numbering1);
  const second1 = lvlOf(paragraphsOf(r1.files).find((p) => textOf(p) === 'שני') || '', numbering1);
  // הראיה היא ה**ניתוק**: פריט שממשיך לספור חולק את ה-`numId` של קודמו. את
  // ההתחלה מ-1 בודקים בשתי הצורות — נמדד ש-`startOverride=1` יושב על כל
  // `<w:num>` שהמנוע יוצר, ולכן לבדו הוא אינו מבחין בין אתחול להמשך.
  const startsAtOne = second1.startOverride === '1' || second1.start === '1';
  const restarted = !!first1.numId && !!second1.numId && second1.numId !== first1.numId && startsAtOne;
  console.log('1 בזמן התפריט:', JSON.stringify(r1.during), '| אחרי:', JSON.stringify(r1.status),
    '| סמנים:', JSON.stringify(r1.markers), '| ראשון:', JSON.stringify(first1), '| שני:', JSON.stringify(second1));
  if (/יש למקם את הסמן/.test(r1.status.text || '')) {
    report.fail('1. „התחל מחדש מ-1” על הפריט השני — סורב (הדיווח ב-#14)', r1.status.text);
  } else if (r1.markers.join(' ') === '1. 1.' && restarted) {
    report.pass('1. „התחל מחדש מ-1” על הפריט השני — לא סורב, והמספור אותחל',
      `סמנים ${r1.markers.join(' ')} | numId ${first1.numId}→${second1.numId} עם startOverride=1`);
  } else {
    report.fail('1. „התחל מחדש מ-1” על הפריט השני — לא סורב, אך המספור לא אותחל',
      `סמנים ${JSON.stringify(r1.markers)} (הצפי „1. 1.”) | ראשון=${JSON.stringify(first1)} שני=${JSON.stringify(second1)} status=${r1.status.text}`);
  }

  /* ---- 2. פריט רשימה ריק (Enter אחרי האחרון) ---- */
  await app.caret(2);
  await app.press('End', 'End', 35);
  await app.press('Enter', 'Enter', 13);
  await app.sleep(600);
  const s2 = parse(await readSelection());
  console.log('2 פריט ריק:', JSON.stringify(s2));
  blockIdOf(s2)
    ? report.pass('2. סמן על פריט ריק — יש blockId', `${blockIdOf(s2)} (${s2.blockNodeType})`)
    : report.fail('2. סמן על פריט ריק — אין blockId (target=null?)', JSON.stringify(s2));
  const r2 = await menuAction('א, ב, ג … יא, יב (גימטריה)');
  // הפריט הריק אינו מזוהה לפי טקסט — הוא הפסקה הממוספרת היחידה שאין בה טקסט.
  const empties = paragraphsOf(r2.files).filter((p) => /<w:numPr>/.test(p) && textOf(p) === '');
  const lvl2 = empties.length === 1 ? lvlOf(empties[0], numberingOf(r2.files)) : null;
  const lastMarker2 = r2.markers[r2.markers.length - 1] || '';
  console.log('2 בזמן התפריט:', JSON.stringify(r2.during), '| picked=', r2.picked, '| אחרי:', JSON.stringify(r2.status),
    '| סמנים:', JSON.stringify(r2.markers), '| ריקות ממוספרות:', empties.length, '| הפריט הריק:', JSON.stringify(lvl2));
  if (/יש למקם את הסמן/.test(r2.status.text || '')) {
    report.fail('2. סגנון עברי על פריט ריק — סורב (הדיווח ב-#14)', r2.status.text);
  } else if (empties.length !== 1) {
    report.fail('2. סגנון עברי על פריט ריק — הפריט לא זוהה ב-OOXML, המדידה לא קרתה',
      `פסקאות ממוספרות בלי טקסט: ${empties.length}`);
  } else if (lvl2.numFmt === 'hebrew1' && /^[א-ת]+\.$/.test(lastMarker2)) {
    report.pass('2. סגנון עברי על פריט ריק — לא סורב, והפריט הזה עצמו קיבל hebrew1',
      `numId=${lvl2.numId}→abstractNum=${lvl2.abstractNumId}, lvl0 numFmt=hebrew1 | הסמן שלו „${lastMarker2}” | סמנים ${r2.markers.join(' ')}`);
  } else {
    report.fail('2. סגנון עברי על פריט ריק — לא סורב, אך הפריט לא קיבל מספור עברי',
      `lvl0 של הפריט=${JSON.stringify(lvl2)} | סמן אחרון „${lastMarker2}” | סמנים ${JSON.stringify(r2.markers)} status=${r2.status.text}`);
  }

  /* ---- 3. פסקה רגילה, לא רשימה ---- */
  // יוצאים מהרשימה: Enter נוסף על פריט ריק מסיים אותה (כמו ב-Word), ואז מקלידים.
  await app.press('Enter', 'Enter', 13);
  await app.sleep(400);
  await app.type('פסקה חופשית');
  await app.sleep(500);
  const s3 = parse(await readSelection());
  console.log('3 פסקה רגילה:', JSON.stringify(s3));
  // `fail` ולא `partial`: `partial` אינו מפיל גם ב-strict, ובלוק שאינו פסקה
  // פירושו שהמסלול מודד „סגנון על פריט רשימה” — כלומר לא את מה שנכתב.
  report[s3.blockNodeType === 'paragraph' ? 'pass' : 'fail']('3. הסמן בפסקה רגילה', `nodeType=${s3.blockNodeType}`);
  const r3 = await menuAction('א, ב, ג … יא, יב (גימטריה)');
  // הפסקה **עצמה** — `<w:p>` שמחזיק את הטקסט — ולא הסביבה: הפריטים שלפניה
  // ממוספרים ממילא, וחיפוש numPr „בקרבת מקום” היה עובר בירוק בלי שנוצר דבר.
  const free = paragraphsOf(r3.files).find((p) => p.includes('פסקה חופשית')) || '';
  const numbered = /<w:numPr>/.test(free);
  const lvl3 = lvlOf(free, numberingOf(r3.files));
  const hebrew = lvl3.numFmt === 'hebrew1';
  console.log('3 בזמן התפריט:', JSON.stringify(r3.during), '| אחרי:', JSON.stringify(r3.status),
    '| סמנים:', JSON.stringify(r3.markers), '| lvl0 של הפסקה:', JSON.stringify(lvl3));
  if (/יש למקם את הסמן/.test(r3.status.text || '')) {
    report.fail('3. סגנון מספור על פסקה רגילה — „יש למקם את הסמן בתוך רשימה” (הדיווח ב-#14)', r3.status.text);
  } else if (numbered && hebrew) {
    report.pass('3. סגנון מספור על פסקה רגילה — הפסקה מוספרה, ובעברית',
      `numPr בפסקה + numId=${lvl3.numId}→abstractNum=${lvl3.abstractNumId}, lvl0 numFmt=hebrew1`);
  } else {
    report.fail('3. סגנון מספור על פסקה רגילה — לא סורב, אך לא מוספר כמבוקש',
      `numPr=${numbered} lvl0=${JSON.stringify(lvl3)} status=${r3.status.text}`);
  }

  /* ---- 4. „הפוך רשימה ממוספרת לתבליטים” על רשימה קיימת ---- */
  await app.caret(2);
  await app.press('End', 'End', 35);
  await app.sleep(400);
  const before4 = await markersOf();
  const r4 = await menuAction('הפוך רשימה ממוספרת לתבליטים', 'פעולות תבליטים');
  const second4 = lvlOf(paragraphsOf(r4.files).find((p) => textOf(p) === 'שני') || '', numberingOf(r4.files));
  // `numFmt` לבדו אינו הוכחה: הסמן נגזר מ-`lvlText`, ו-„%1.” שנשאר שם הוא
  // בדיוק הבאג. ולכן שתי הבדיקות, ובנוסף הסמן שמצטייר בפועל.
  const bulletXml = second4.numFmt === 'bullet' && second4.lvlText === '•';
  const bulletDrawn = r4.markers.includes('•') && !r4.markers.some((m) => m.includes('%'));
  console.log('4 סמנים לפני:', JSON.stringify(before4), '| אחרי:', JSON.stringify(r4.markers),
    '| status:', JSON.stringify(r4.status), '| lvl0 של „שני”:', JSON.stringify(second4));
  if (/יש למקם את הסמן/.test(r4.status.text || '')) {
    report.fail('4. המרה לתבליטים על רשימה קיימת — סורב', r4.status.text);
  } else if (bulletXml && bulletDrawn) {
    report.pass('4. המרה לתבליטים — גם ה-OOXML וגם הסמן',
      `numFmt=bullet lvlText=„•” גופן=${second4.markerFont} | סמנים ${r4.markers.join(' ')}`);
  } else {
    report.fail('4. המרה לתבליטים — הסמן אינו תבליט',
      `numFmt=${second4.numFmt} lvlText=„${second4.lvlText}” | סמנים ${JSON.stringify(r4.markers)} status=${r4.status.text}`);
  }

  /* ---- 5. שכנה שחולקת את אותו `abstractNumId` ---- */
  // „התחל מחדש מ-1” יוצר `numId` שני שמצביע לאותו `abstractNum` (נמדד), וזו
  // התצורה היחידה שבה כתיבה להגדרה נראית בשתי הרשימות. „ראשון” ו„שני”
  // שלמעלה אינן כאלה יותר — סגנון המספור בשלב 2 שיבט להן הגדרות נפרדות —
  // ולכן נבנה כאן זוג חדש בסוף המסמך.
  await caretOn('פסקה חופשית');
  await newParagraphAfterList();
  await typeNumberedPair('תאומא', 'תאומב');
  await caretOn('תאומב');
  const rSplit = await menuAction('התחל מחדש מ-1');
  const numberingSplit = numberingOf(rSplit.files);
  const twinABefore = lvlOf(paraOf(rSplit.files, 'תאומא'), numberingSplit);
  const twinBBefore = lvlOf(paraOf(rSplit.files, 'תאומב'), numberingSplit);
  console.log('5 לפני ההמרה — תאומא:', JSON.stringify(twinABefore), '| תאומב:', JSON.stringify(twinBBefore),
    '| סמנים:', JSON.stringify(rSplit.markers));
  const shared =
    !!twinABefore.abstractNumId &&
    twinABefore.abstractNumId === twinBBefore.abstractNumId &&
    !!twinABefore.numId &&
    twinABefore.numId !== twinBBefore.numId &&
    twinABefore.numFmt !== 'bullet';
  await caretOn('תאומא');
  const r5 = await menuAction('הפוך רשימה ממוספרת לתבליטים', 'פעולות תבליטים');
  const numbering5 = numberingOf(r5.files);
  const twinA = lvlOf(paraOf(r5.files, 'תאומא'), numbering5);
  const twinB = lvlOf(paraOf(r5.files, 'תאומב'), numbering5);
  console.log('5 אחרי — תאומא:', JSON.stringify(twinA), '| תאומב:', JSON.stringify(twinB),
    '| סמנים:', JSON.stringify(r5.markers), '| status:', JSON.stringify(r5.status));
  const converted = twinA.numFmt === 'bullet' && twinA.lvlText === '•';
  // „לא נגררה” פירושו שכל מה שהיה לה נשאר: גם ה-`numId`, גם ההגדרה שהוא
  // מצביע אליה, וגם הסמן שנגזר ממנה.
  const untouched =
    twinB.numId === twinBBefore.numId &&
    twinB.abstractNumId === twinBBefore.abstractNumId &&
    twinB.numFmt === twinBBefore.numFmt &&
    twinB.lvlText === twinBBefore.lvlText;
  // הסמנים של הזוג הם שני האחרונים במסמך, בסדר הפסקאות.
  const pairMarkers = r5.markers.slice(-2);
  const drawn = pairMarkers[0] === '•' && pairMarkers[1] !== '•';
  if (!shared) {
    report.fail('5. ההמרה נגעה רק ברשימה שהסמן בה, ולא בשכנה שחולקת את ההגדרה',
      `התרחיש לא נבנה: תאומא=${JSON.stringify(twinABefore)} תאומב=${JSON.stringify(twinBBefore)} — צריך numId נפרד ואותו abstractNumId`);
  } else if (/יש למקם את הסמן/.test(r5.status.text || '')) {
    report.fail('5. ההמרה נגעה רק ברשימה שהסמן בה, ולא בשכנה שחולקת את ההגדרה', r5.status.text);
  } else if (converted && untouched && drawn) {
    report.pass('5. ההמרה נגעה רק ברשימה שהסמן בה, ולא בשכנה שחולקת את ההגדרה',
      `תאומא ${twinABefore.numFmt}→bullet ב-abstractNum ${twinABefore.abstractNumId}→${twinA.abstractNumId}; ` +
        `תאומב נשארה numId=${twinB.numId}/abstractNum=${twinB.abstractNumId}/${twinB.numFmt} | סמני הזוג ${JSON.stringify(pairMarkers)}`);
  } else {
    report.fail('5. ההמרה נגררה גם לשכנה שחולקת את ההגדרה',
      `תאומא ${JSON.stringify(twinABefore)}→${JSON.stringify(twinA)} | תאומב ${JSON.stringify(twinBBefore)}→${JSON.stringify(twinB)} | ` +
        `סמני הזוג ${JSON.stringify(pairMarkers)} status=${r5.status.text}`);
  }

  /* ---- 6. רשימה מקוננת: מה קורה לרמה 1 ---- */
  // ההמרה מוחלת על הרשימה כולה, ולכן פריט ברמה 1 מפסיק להיות „a.” והופך
  // לתבליט. זה מה שהמנוע עושה, וזה מה שלא נמדד בשום שער.
  await caretOn('תאומב');
  await newParagraphAfterList();
  await typeNumberedPair('הורה', 'בן');
  await app.press('Tab', 'Tab', 9);
  await app.sleep(700);
  const nestedBeforeFiles = await app.docx();
  const numberingNested = numberingOf(nestedBeforeFiles);
  const parentBefore = lvlOf(paraOf(nestedBeforeFiles, 'הורה'), numberingNested, 0);
  const childBefore = lvlOf(paraOf(nestedBeforeFiles, 'בן'), numberingNested, 1);
  console.log('6 לפני — הורה:', JSON.stringify(parentBefore), '| בן:', JSON.stringify(childBefore),
    '| סמנים:', JSON.stringify(await markersOf()));
  const nested = childBefore.paraIlvl === '1' && childBefore.numFmt !== 'bullet' && parentBefore.numFmt !== 'bullet';
  await caretOn('הורה');
  const caret6 = await caretState();
  console.log('6 מצב הסמן:', JSON.stringify(caret6));
  // הכותרת מצהירה „ברמה 0”, ולכן הרמה שהסמן בה נמדדת ואינה מונחת: גם על רמה 1
  // ההמרה מהפכת את הרשימה כולה, והשורה הייתה עוברת בירוק על תרחיש אחר.
  const caretAtRoot = caret6?.success === true && caret6.ilvl === 0;
  const r6 = await menuAction('הפוך רשימה ממוספרת לתבליטים', 'פעולות תבליטים');
  const numbering6 = numberingOf(r6.files);
  const parent6 = lvlOf(paraOf(r6.files, 'הורה'), numbering6, 0);
  const child6 = lvlOf(paraOf(r6.files, 'בן'), numbering6, 1);
  const nestedMarkers = r6.markers.slice(-2);
  console.log('6 אחרי — הורה:', JSON.stringify(parent6), '| בן:', JSON.stringify(child6),
    '| סמנים:', JSON.stringify(r6.markers), '| status:', JSON.stringify(r6.status));
  if (!nested || !caretAtRoot) {
    report.fail('6. המרה ברמה 0 הופכת גם את רמה 1 לתבליט',
      `התרחיש לא נבנה: הורה=${JSON.stringify(parentBefore)} בן=${JSON.stringify(childBefore)} — צריך פריט ברמה 1 ` +
        `שאינו תבליט, והסמן ברמה 0 (נמדד ${JSON.stringify(caret6)})`);
  } else if (
    parent6.numFmt === 'bullet' &&
    parent6.lvlText === '•' &&
    child6.numFmt === 'bullet' &&
    child6.lvlText === '•' &&
    nestedMarkers[0] === '•' &&
    nestedMarkers[1] === '•'
  ) {
    report.pass('6. המרה ברמה 0 הופכת גם את רמה 1 לתבליט',
      `הסמן ב-ilvl=${caret6.ilvl} | רמה 0 ${parentBefore.numFmt}→bullet, רמה 1 ${childBefore.numFmt}→bullet | ` +
        `סמני הרשימה ${JSON.stringify(nestedMarkers)}`);
  } else {
    report.fail('6. המרה ברמה 0 לא הפכה את רמה 1 לתבליט',
      `רמה 0 ${JSON.stringify(parentBefore)}→${JSON.stringify(parent6)} | רמה 1 ${JSON.stringify(childBefore)}→${JSON.stringify(child6)} | ` +
        `סמני הרשימה ${JSON.stringify(nestedMarkers)} status=${r6.status.text}`);
  }

  /* ---- 7. הלוך וחזור: מספור → תבליטים → מספור ---- */
  /*
   * סדר הבנייה אינו מתחלף: ההמרה לתבליטים **משבטת** את ההגדרה, ולכן זוג
   * שהופרד לפניה כבר אינו חולק אותה כשבוחרים סגנון מספור — ושורה שנבנתה כך
   * הייתה עוברת בירוק גם על פעולה abstract-scoped שדולפת (נמדד: `applyTemplate`
   * עבר). ההפרדה נעשית **אחרי** ההמרה, ואז שני ה-`numId` חולקים את הגדרת
   * התבליט — התצורה היחידה שבה כתיבת המספור יכולה לדלוף לשכנה.
   */
  await caretOn('בן');
  await newParagraphAfterList();
  await typeNumberedPair('חזורא', 'חזורב');
  const filesUp = await app.docx();
  const upA = allLevelsOf(paraOf(filesUp, 'חזורא'), numberingOf(filesUp));
  console.log('7 ממוספר — חזורא:', brief(upA), '| סמנים:', JSON.stringify(await markersOf()));
  const startedNumbered = upA.every((l, i) => l.numFmt !== 'bullet' && l.lvlText === `%${i + 1}.`);

  await caretOn('חזורא');
  const r7bullets = await menuAction('הפוך רשימה ממוספרת לתבליטים', 'פעולות תבליטים');
  await caretOn('חזורב');
  await menuAction('התחל מחדש מ-1');
  const filesMid = await app.docx();
  const numberingMid = numberingOf(filesMid);
  const midA = allLevelsOf(paraOf(filesMid, 'חזורא'), numberingMid);
  const midB = allLevelsOf(paraOf(filesMid, 'חזורב'), numberingMid);
  const midMarkers = (await markersOf()).slice(-2);
  console.log('7 בתבליטים — חזורא:', brief(midA), '| חזורב:', brief(midB),
    '| סמני הזוג:', JSON.stringify(midMarkers), '| status ההמרה:', JSON.stringify(r7bullets.status));
  const sharedBullets =
    midA.every((l) => l.numFmt === 'bullet' && l.lvlText === '•') &&
    midB.every((l) => l.numFmt === 'bullet' && l.lvlText === '•') &&
    !!midA[0].abstractNumId &&
    midA[0].abstractNumId === midB[0].abstractNumId &&
    !!midA[0].numId &&
    midA[0].numId !== midB[0].numId &&
    midMarkers[0] === '•' &&
    midMarkers[1] === '•';

  await caretOn('חזורא');
  const r7 = await menuAction('1, 2, 3');
  const numbering7 = numberingOf(r7.files);
  const backA = allLevelsOf(paraOf(r7.files, 'חזורא'), numbering7);
  const backB = allLevelsOf(paraOf(r7.files, 'חזורב'), numbering7);
  const backMarkers = r7.markers.slice(-2);
  console.log('7 אחרי — חזורא:', brief(backA), '| חזורב:', brief(backB),
    '| סמני הזוג:', JSON.stringify(backMarkers), '| status:', JSON.stringify(r7.status));
  // `numFmt` לבדו הוא בדיוק מה שהיה כאן ירוק כשהמסך צייר „•”: הסמן נגזר
  // מ-`lvlText`, ולכן שלושת הדברים — שני השדות בכל תשע הרמות, גופן הסמן
  // שאינו Symbol, והסמן שמצטייר.
  const numFmtBack = backA.every((l) => l.numFmt === 'decimal');
  const lvlTextBack = backA.every((l, i) => l.lvlText === `%${i + 1}.`);
  const fontCleared = backA.every((l) => l.markerFont !== 'Symbol');
  const drawnBack = backMarkers[0] === '1.' && !backMarkers[0].includes('%');
  // „לא נגררה”: אותו `numId`, אותה הגדרה, כל תשע הרמות, והסמן שנגזר מהן.
  const neighbourKept =
    backB[0].numId === midB[0].numId && brief(backB) === brief(midB) && backMarkers[1] === '•';
  if (!startedNumbered || !sharedBullets) {
    report.fail('7. מספור → תבליטים → מספור: הרשימה חוזרת למספור, והשכנה שחולקת את הגדרת התבליט אינה נגררת',
      `התרחיש לא נבנה: מספור=${startedNumbered} תבליט-משותף=${sharedBullets} | ` +
        `חזורא=${brief(midA)} (numId=${midA[0].numId}/abs=${midA[0].abstractNumId}) | ` +
        `חזורב=${brief(midB)} (numId=${midB[0].numId}/abs=${midB[0].abstractNumId}) | סמני הזוג ${JSON.stringify(midMarkers)}`);
  } else if (/יש למקם את הסמן/.test(r7.status.text || '')) {
    report.fail('7. מספור → תבליטים → מספור: הרשימה חוזרת למספור, והשכנה שחולקת את הגדרת התבליט אינה נגררת', r7.status.text);
  } else if (numFmtBack && lvlTextBack && fontCleared && drawnBack && neighbourKept) {
    report.pass('7. מספור → תבליטים → מספור: הרשימה חוזרת למספור, והשכנה שחולקת את הגדרת התבליט אינה נגררת',
      `כל תשע הרמות decimal עם %N. וללא Symbol (${brief(backA)}) ב-abstractNum ${midA[0].abstractNumId}→${backA[0].abstractNumId} | ` +
        `חזורב נשארה numId=${backB[0].numId}/abstractNum=${backB[0].abstractNumId} ותבליט | סמני הזוג ${JSON.stringify(backMarkers)}`);
  } else {
    report.fail('7. מספור → תבליטים → מספור: הרשימה לא חזרה למספור, או שהשכנה נגררה',
      `numFmt=${numFmtBack} lvlText=${lvlTextBack} גופן=${fontCleared} סמן=${drawnBack} שכנה=${neighbourKept} | ` +
        `חזורא ${brief(midA)} → ${brief(backA)} | חזורב ${brief(midB)} → ${brief(backB)} | ` +
        `סמני הזוג ${JSON.stringify(backMarkers)} status=${r7.status.text}`);
  }

  console.log('לוג הדף:', JSON.stringify(await app.log()));
} finally {
  app.close();
}
process.exit(report.print() > 0 ? 1 : 0);
