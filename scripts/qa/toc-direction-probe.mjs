/**
 * סקר: מה קובע את **הצד** שבו יושבות נקודות המוביל ומספר העמוד בתוכן עניינים.
 *
 * השאלה: בעברית שורת תוכן עניינים צריכה להיקרא „כותרת......5” כשהכותרת בימין
 * ומספר העמוד בשמאל. פסקה שכיוונה LTR תיקרא הפוך — הכותרת בשמאל. איזו שכבה
 * נותנת לפסקה את כיוונה, ומה יוצא מזה על המסך, זה מה שנמדד כאן.
 *
 * זה **סקר ולא שער**: הוא מודד ומדפיס OOXML גולמי, ואינו קובע מה נכון. מה
 * שהוא צריך לענות עליו, לפי הסדר:
 *
 * 1. מה המנוע כותב מעצמו — יש `<w:bidi/>` בפסקאות ה-TOC? יש `w:tabs` עם
 *    `w:leader="dot"`, ובאיזה `w:val` (`right`/`left`/`end`)?
 * 2. מה יש בסגנונות `TOC1`…`TOC9` ב-`styles.xml`, שזו השכבה שהפסקאות יורשות
 *    ממנה.
 * 3. **הבדיקה המכריעה:** `paragraphs.setDirection({direction:'rtl'})` על פסקת
 *    TOC — האם הוא כותב `<w:bidi/>`, והאם עצירת הטאב מתהפכת איתו. זו התבנית
 *    שכבר נמדדה כעובדת על `Caption` (ראו src/engine/captions.ts), והשאלה היא
 *    אם היא עובדת גם כאן.
 *
 * מה שכבר נמדד ולכן **אינו** נבדק שוב: `tabLeader` ו-`rightAlignPageNumbers`
 * ב-`TocConfigurePatch` מתקבלים עם `success: true` ואינם עושים דבר — ראו
 * src/engine/toc.ts. לכן הכיוון, ולא ה-patch, הוא המסלול שנבדק כאן.
 *
 *   npm run build && node scripts/qa/toc-direction-probe.mjs
 */
import { openApp, createReport } from './harness.mjs';

const PORT = Number(process.env.QA_PORT ?? 9371);
const report = createReport('כיוון תוכן העניינים');

const log = (...a) => console.log('   ', ...a);

/** קריאה גולמית מתוך doc.* — כמו ב-references-qa.mjs. */
const docApi = (app, expr) =>
  app.js(
    `(async()=>{try{const d=window.__otzariaEditor.superdoc.activeEditor.doc;${expr}}catch(e){return JSON.stringify({error:String(e&&e.message)})}})()`
  );

/** מרחיבה את החלון — „הפניות” היא הלשונית הצפופה ביותר. ראו references-qa.mjs. */
async function widen(app) {
  await app.cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1600,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await app.sleep(2000);
}

async function seed(app, words) {
  await app.caret(0);
  for (let i = 0; i < words.length; i++) {
    await app.type(words[i]);
    if (i < words.length - 1) {
      await app.press('Enter', 'Enter', 13);
      await app.sleep(350);
    }
  }
  await app.sleep(900);
}

/**
 * הפריסה **על המסך** של שורת תוכן העניינים: באיזה x יושבת הכותרת ובאיזה x
 * מספר העמוד, יחסית לתחילת השורה.
 *
 * זו המדידה שמכריעה, ולא ה-OOXML: `<w:bidi/>` ב-XML הוא הצהרה, והשאלה של
 * המשתמש היא מה נראה. בעברית מספר העמוד צריך לשבת **שמאלה** מהכותרת.
 */
async function tocLayout(app) {
  const raw = await app.js(
    `(function(){var L=document.querySelectorAll('.superdoc-line');` +
      `for(var i=0;i<L.length;i++){var t=(L[i].textContent||'');` +
      `if(t.indexOf('פרק ראשון')<0||!/\\d/.test(t))continue;` +
      `var base=L[i].getBoundingClientRect();var title=null,num=null;` +
      `var w=document.createTreeWalker(L[i],NodeFilter.SHOW_TEXT);var n;` +
      `while((n=w.nextNode())){var s=(n.textContent||'').trim();if(!s)continue;` +
      `var rg=document.createRange();rg.selectNodeContents(n);var r=rg.getBoundingClientRect();` +
      `if(!r.width)continue;var x=Math.round(r.left-base.left);` +
      `if(s.indexOf('פרק ראשון')>=0&&title===null)title=x;` +
      `if(/^\\d+$/.test(s))num=x;}` +
      `return JSON.stringify({width:Math.round(base.width),title:title,number:num});}` +
      `return 'null';})()`
  );
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** כל הפסקאות ב-document.xml, כמחרוזות — כדי לחפש בתוך ה-pPr של כל אחת. */
function paragraphs(xml) {
  return xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [];
}

/** מה שמעניין ב-pPr של פסקה אחת: הסגנון, bidi, jc ועצירות הטאב. */
function describe(p) {
  const style = p.match(/<w:pStyle w:val="([^"]+)"/)?.[1] ?? '(אין)';
  const bidi = /<w:bidi\b(?![^>]*w:val="(?:0|false)")/.test(p);
  const jc = p.match(/<w:jc w:val="([^"]+)"/)?.[1] ?? '(אין)';
  const tabs = [...p.matchAll(/<w:tab\b([^>]*)\/>/g)]
    .map((m) => m[1])
    .filter((a) => /w:pos=/.test(a))
    .map((a) => {
      const val = a.match(/w:val="([^"]+)"/)?.[1] ?? '?';
      const pos = a.match(/w:pos="([^"]+)"/)?.[1] ?? '?';
      const leader = a.match(/w:leader="([^"]+)"/)?.[1] ?? '(אין)';
      return `${val}@${pos} leader=${leader}`;
    });
  return { style, bidi, jc, tabs };
}

/**
 * כמה תווי טאב יש בגוף הריצות — `<w:tab/>` בלי מאפיינים, בדיוק כמו שהמנוע
 * כותב אותו. נספר בנפרד מעצירות הטאב של `w:tabs`, ובכוונה: התו הוא הדחיפה,
 * והעצירה היא מה שקובע לאן הוא נדחף ואם מציירים נקודות בדרך. תו שאין לו
 * עצירה מוגדרת נופל על `w:defaultTabStop` — קפיצה אחת, ובלי נקודות.
 */
function bodyTabs(p) {
  return p.split('<w:tab/>').length - 1;
}

const app = await openApp({ name: 'toc-direction', port: PORT });
try {
  await widen(app);
  await seed(app, ['פרק ראשון', 'גוף הפרק', 'פרק שני']);

  await app.tab('בית');
  await app.caretPara('פרק ראשון');
  await app.clickGallery('כותרת 1', { after: 900 });
  await app.caretPara('פרק שני');
  await app.clickGallery('כותרת 1', { after: 900 });

  /*
    בלי השורה הזאת כל הסקר מודד תוכן עניינים שנבנה מפסקאות אחרות מאלה שהתכוון
    אליהן, ועובר: היעדים הוזנו ל-`caret(n)` כאינדקס פסקה, ולכן „פרק שני” נחת
    על „פרק ראשון” — כותרת אחת קיבלה `Heading1` פעמיים, והשנייה נשארה גוף.
  */
  const headed = paragraphs((await app.docx())['word/document.xml'] ?? '')
    .filter((p) => /<w:pStyle w:val="Heading1"/.test(p))
    .map((p) => (p.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, '')).join(''));
  log('פסקאות עם Heading1:', JSON.stringify(headed));
  const bothHeaded = headed.length === 2 && headed.includes('פרק ראשון') && headed.includes('פרק שני');
  if (bothHeaded) report.pass('הכותרות הוחלו על שתי הפסקאות שנבחרו', JSON.stringify(headed));
  else report.fail('הכותרות לא הוחלו על הפסקאות שנבחרו', `Heading1 על ${JSON.stringify(headed)} במקום על „פרק ראשון” ו„פרק שני”`);

  // 1 — מה המנוע כותב מעצמו
  await app.tab('הפניות');
  await app.caretPara('גוף הפרק');
  await app.press('End', 'End', 35);
  await app.sleep(300);
  await app.reset();
  const clicked = await app.click('תוכן עניינים', { after: 3500 });
  const files = await app.docx();
  const doc = files['word/document.xml'] ?? '';
  const styles = files['word/styles.xml'] ?? '';

  log('נלחץ „תוכן עניינים”:', clicked);
  if (!/TOC\s/.test(doc)) {
    report.fail('הכנסה', 'שדה TOC לא נכתב — אין מה למדוד');
  } else {
    report.pass('הכנסה', 'שדה TOC נכתב');

    const tocParas = paragraphs(doc).filter((p) => /w:val="TOC\d"/.test(p));
    log(`פסקאות TOC* ב-document.xml: ${tocParas.length}`);
    for (const p of tocParas) {
      const d = describe(p);
      log(`  ${d.style}: bidi=${d.bidi} jc=${d.jc} tabs=[${d.tabs.join(' | ') || 'אין'}]`);
    }
    // ה-XML הגולמי של שורה אחת: בלי זה אי אפשר לדעת מאיפה הנקודות מגיעות
    // כשאין ב-pPr שום `w:tabs` — האם יש `<w:tab/>` בגוף, ומה עוטף את המספר.
    if (tocParas[0]) log('גולמי TOC1:', tocParas[0].replace(/\s+/g, ' ').slice(0, 900));
    const pgMar = doc.match(/<w:pgMar[^>]*\/>/)?.[0] ?? '(אין)';
    const sectBidi = /<w:sectPr[\s\S]*?<w:bidi\b/.test(doc);
    log('sectPr bidi:', sectBidi, '| pgMar:', pgMar);

    // כיוון של פסקה **נורש מהמקטע**, ולכן היעדר `<w:bidi/>` ב-pPr אינו LTR.
    // באותה הרצה עצמה נמדד `sectPr bidi: true` לצד פסקאות TOC עם `bidi=false`,
    // והכותרת בכל זאת יושבת מימין — כלומר ההיסק „אין bidi פסקתי ⟹ הכותרת
    // בשמאל” הוכחש בפלט של המדידה. מה שנרשם כאן הוא **איזו שכבה** נושאת את
    // הכיוון, והכשל נשמר למצב שבו אין אף אחת.
    const anyBidi = tocParas.some((p) => describe(p).bidi);
    if (anyBidi) {
      report.pass('כיוון שהמנוע כתב', 'פסקאות ה-TOC נושאות <w:bidi/> מעצמן');
    } else if (sectBidi) {
      report.pass(
        'כיוון שהמנוע כתב',
        'אין <w:bidi/> ב-pPr של פסקאות ה-TOC, אבל ה-sectPr הוא bidi — הכיוון נורש ממנו'
      );
    } else {
      report.fail(
        'כיוון שהמנוע כתב',
        'אין <w:bidi/> לא בפסקאות ה-TOC ולא ב-sectPr — אין שכבה שממנה יורש כיוון RTL'
      );
    }

    // 2 — שכבת הסגנון
    const styleTabStops = []; // עצירות טאב שנמצאו בסגנונות — הצורה, לא המילה
    const styleLayers = []; // מה נמצא בכל רמה, בשביל שורת הדוח
    for (const lvl of [1, 2]) {
      const st = styles.match(new RegExp(`<w:style[^>]*w:styleId="TOC${lvl}"[\\s\\S]*?</w:style>`))?.[0];
      if (!st) {
        log(`סגנון TOC${lvl}: אינו מוגדר ב-styles.xml`);
        styleLayers.push(`TOC${lvl} אינו מוגדר`);
        continue;
      }
      const d = describe(st);
      log(`סגנון TOC${lvl}: bidi=${d.bidi} jc=${d.jc} tabs=[${d.tabs.join(' | ') || 'אין'}]`);
      styleTabStops.push(...d.tabs);
      styleLayers.push(`TOC${lvl}: ${d.tabs.join(' | ') || 'בלי w:tabs'}`);
    }

    const layoutBefore = await tocLayout(app);
    log('פריסה לפני:', JSON.stringify(layoutBefore));

    // 2ב — נקודות המוביל ועצירת הטאב: מה שסעיף 1 בכותרת מבטיח לענות עליו,
    // והשורה שלא נרשמה כאן קודם למרות שהמדידה כן הדפיסה אותה.
    //
    // שלוש שכבות אפשריות, ואחת מהן צריכה לשאת עצירת טאב עם `w:leader="dot"`
    // כדי שיהיו נקודות וכדי שמספר העמוד יידחף לשולי השורה: `w:tabs` ב-pPr של
    // הפסקה, אותו `w:tabs` בסגנון `TOC1…TOC9`, או `w:defaultTabStop` — שאין בו
    // leader כלל. לכן נמדד גם x של מספר העמוד: „עצירה בשולי השורה” ו„תו טאב
    // בלי עצירה” נראים שונה על המסך, ולא רק ב-XML.
    const paraTabStops = tocParas.flatMap((p) => describe(p).tabs);
    const bodyTabCount = tocParas.reduce((sum, p) => sum + bodyTabs(p), 0);
    const dotted = [...paraTabStops, ...styleTabStops].filter((t) => t.includes('leader=dot'));
    const placed =
      layoutBefore && layoutBefore.number !== null && layoutBefore.title !== null
        ? `מספר העמוד ב-x=${layoutBefore.number} בשורה ברוחב ${layoutBefore.width} — ` +
          `${layoutBefore.number}px מהשולי השמאלי של השורה, שאליו עצירה בשולי השורה הייתה דוחפת אותו, ` +
          `ו-${layoutBefore.title - layoutBefore.number}px מתחילת הכותרת (x=${layoutBefore.title})`
        : 'הפריסה על המסך לא נמדדה';
    if (dotted.length) {
      report.pass('עצירת טאב עם leader="dot"', `${dotted.join(' | ')} | ${placed}`);
    } else {
      report.fail(
        'אין עצירת טאב עם leader="dot" בשום שכבה',
        `ב-pPr: ${paraTabStops.join(' | ') || 'אין w:tabs'}; ב-styles.xml: ${styleLayers.join('; ') || 'לא נבדק'}; ` +
          `בגוף הריצות ${bodyTabCount}×<w:tab/> בלי w:leader ובלי w:pos — ${placed}`
      );
    }

    // 3 — הבדיקה המכריעה: האם setDirection עובד על פסקת TOC
    const before = paragraphs(doc).filter((p) => /w:val="TOC1"/.test(p)).map(describe);
    // `blocks` ולא `items` — זו הצורה שהמנוע מחזיר; ראו BlockEntry ב-engine/toc.ts.
    const blocks = await docApi(
      app,
      `const l=await d.blocks.list({limit:80,offset:0});return JSON.stringify((l&&l.blocks||[]).map(i=>({id:i.nodeId,type:i.nodeType,style:i.styleId})))`
    ).then(JSON.parse);
    log('בלוקים:', JSON.stringify(blocks).slice(0, 800));

    const targets = (Array.isArray(blocks) ? blocks : []).filter((b) => /^TOC\d$/i.test(String(b.style ?? '')));
    if (targets.length === 0) {
      report.skip('setDirection על פסקת TOC', 'blocks.list אינו חושף styleId לפסקאות TOC — אין כתובת לפנות אליה');
    } else {
      const res = await docApi(
        app,
        `const out=[];for(const id of ${JSON.stringify(targets.map((t) => t.id))}){` +
          `try{const r=await d.paragraphs.setDirection({target:{kind:'block',nodeType:'paragraph',nodeId:id},direction:'rtl'});` +
          `out.push({id,success:r&&r.success,failure:r&&r.failure&&(r.failure.code||r.failure.message)})}` +
          `catch(e){out.push({id,threw:String(e&&e.message)})}}return JSON.stringify(out)`
      ).then(JSON.parse);
      log('setDirection:', JSON.stringify(res));

      await app.sleep(1200);
      const after = paragraphs((await app.docx())['word/document.xml'] ?? '')
        .filter((p) => /w:val="TOC1"/.test(p))
        .map(describe);
      log('TOC1 לפני:', JSON.stringify(before));
      log('TOC1 אחרי:', JSON.stringify(after));

      const layoutAfter = await tocLayout(app);
      log('פריסה אחרי:', JSON.stringify(layoutAfter));
      /**
       * מה שנמדד: הכותרת ב-x=535 ומספר העמוד ב-x=497, בשורה ברוחב 602 — כלומר
       * הכותרת **מימין** למספר, שזה סדר הקריאה העברי. לכן הטענה היא ש-
       * `title > number` **נשמר**, ולא שהצדדים יתחלפו: היפוך היה מציב את
       * מספר העמוד מימין ואת הכותרת בשמאל, ושובר שורה שהייתה תקינה. כלומר
       * `setDirection` שאינו מזיז כאן דבר הוא התוצאה הנכונה.
       */
      const hebrewOrder = (l) =>
        Boolean(l) && l.title !== null && l.number !== null && l.title > l.number;
      if (!hebrewOrder(layoutBefore)) {
        report.fail(
          'הפריסה על המסך — `title > number`',
          `הכותרת אינה מימין למספר עוד לפני setDirection: ${JSON.stringify(layoutBefore)}`
        );
      } else if (hebrewOrder(layoutAfter)) {
        report.pass(
          'הפריסה על המסך — `title > number` נשמר',
          `הכותרת נשארה מימין למספר: לפני ${JSON.stringify(layoutBefore)} אחרי ${JSON.stringify(layoutAfter)}`
        );
      } else {
        report.fail(
          'הפריסה על המסך — `title > number` נשבר',
          `setDirection הפך את הסדר: לפני ${JSON.stringify(layoutBefore)} אחרי ${JSON.stringify(layoutAfter)}`
        );
      }

      const gained = after.some((d) => d.bidi) && !before.some((d) => d.bidi);
      const tabsChanged = JSON.stringify(before.map((d) => d.tabs)) !== JSON.stringify(after.map((d) => d.tabs));
      if (gained)
        report.pass(
          'setDirection על פסקת TOC',
          `נכתב <w:bidi/>; עצירות הטאב ${tabsChanged ? 'השתנו איתו' : 'לא השתנו'}`
        );
      else report.fail('setDirection על פסקת TOC', 'לא נכתב <w:bidi/> — המסלול הזה אינו פתוח');
    }
  }
} finally {
  app.close();
}
report.print();
console.log('\nזהו סקר: קוד היציאה אינו נגזר מהשורות.');
process.exit(0);
