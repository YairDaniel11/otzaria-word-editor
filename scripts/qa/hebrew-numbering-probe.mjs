/**
 * האם המנוע תומך במספור עברי — במספרי עמודים וברשימות.
 * נמדד גם ב-OOXML המיוצא וגם במה שמצויר על המסך.
 */
import { openApp, createReport } from './harness.mjs';

const report = createReport('מספור עברי', { strict: true });
const app = await openApp({ name: 'hebnum', port: Number(process.env.QA_PORT ?? 9490) });

try {
  await app.caret(0);
  await app.type('bereshit');
  await app.sleep(900);

  // --- מספרי עמודים ---
  for (const fmt of ['hebrew1', 'hebrew2']) {
    const res = await app.js(`(async function(){
      var doc = window.__otzariaEditor.superdoc.activeEditor.doc;
      try {
        var listing = await doc.sections.list();
        var items = (listing && listing.items) || [];
        var target = items[0] && items[0].address;
        if (!target) return JSON.stringify({ ok: false, error: 'no section address', listing: listing });
        var r = await doc.sections.setPageNumbering({ target: target, format: '${fmt}', start: 1 });
        return JSON.stringify({ ok: true, receipt: r });
      } catch (e) { return JSON.stringify({ ok: false, error: String(e && e.message || e) }); }
    })()`);
    console.log(`sections.setPageNumbering(${fmt}):`, res);
    const files = await app.docx();
    const doc = files['word/document.xml'] || '';
    const m = doc.match(/<w:pgNumType[^>]*\/>/);
    console.log(`  pgNumType ב-docx:`, m ? m[0] : '(אין)');
    if (m && m[0].includes(fmt)) report.pass(`מספרי עמודים — ${fmt}`, m[0]);
    else report.fail(`מספרי עמודים — ${fmt}`, `${res} | ${m ? m[0] : 'אין pgNumType'}`);
  }

  // --- רשימות ---
  //
  // דרך היצירה היא הפקודה `numbered-list`, לא `doc.lists.apply`: זה מה
  // שהאפליקציה עושה (HomeTab.vue → useCommand), ו-`lists.apply` דורש
  // `target` שאין לו מקבילה בקוד שלנו. הגרסה הקודמת של השער קראה לו בלי
  // `target`, קיבלה „lists.apply target must be an object", ומכאן ואילך
  // מדדה מסמך שאין בו רשימה בכלל — כלומר דיווחה „שבור" על יכולת שלא נוסתה.
  await app.caret(0);
  await app.press('Enter', 'Enter', 13);
  await app.type('alef');
  await app.press('Enter', 'Enter', 13);
  await app.type('bet');
  await app.sleep(900);

  const applied = await app.js(`(async function(){
    var ui = window.__otzariaEditor.ui;
    try { return JSON.stringify(await ui.commands.executeAsync('numbered-list')); }
    catch (e) { return JSON.stringify({ err: String(e && e.message || e) }); }
  })()`);
  console.log('הפעלת „מספור":', String(applied).slice(0, 300));
  await app.sleep(1400);

  // אותו פתרון יעד בדיוק כמו src/engine/lists.ts: `blockId` מהבחירה,
  // ו-`nodeType: 'listItem'` מ-`blocks.list`. יעד בצורה אחרת נדחה.
  const styleRes = await app.js(`(async function(){
    var doc = window.__otzariaEditor.superdoc.activeEditor.doc;
    var out = {};
    try {
      var info = await doc.selection.current();
      var segs = (info && info.target && info.target.segments) || [];
      var blockId = null;
      for (var i = 0; i < segs.length; i++) {
        if (typeof segs[i].blockId === 'string') { blockId = segs[i].blockId; break; }
      }
      out.blockId = blockId;
      var listed = await doc.blocks.list();
      var block = ((listed && listed.blocks) || []).filter(function(b){ return b.nodeId === blockId; })[0];
      out.nodeType = block && block.nodeType;
      if (!block || block.nodeType !== 'listItem') { out.err = 'הסמן אינו בפריט רשימה'; return JSON.stringify(out); }
      out.set = await doc.lists.setLevelNumberStyle({
        target: { kind: 'block', nodeType: 'listItem', nodeId: block.nodeId },
        level: 0,
        numberStyle: 'hebrew1',
      });
    } catch (e) { out.err = String(e && e.message || e); }
    return JSON.stringify(out);
  })()`);
  console.log('setLevelNumberStyle(hebrew1):', String(styleRes).slice(0, 900));

  await app.sleep(1200);
  const files2 = await app.docx();
  const numbering = files2['word/numbering.xml'] || '';
  const fmts = [...numbering.matchAll(/<w:numFmt w:val="([^"]+)"/g)].map((x) => x[1]);
  console.log('numFmt ב-numbering.xml:', JSON.stringify(fmts));
  console.log('טקסט על המסך:', JSON.stringify((await app.screenText() || '').slice(0, 200)));

  if (fmts.includes('hebrew1')) report.pass('מספור רשימה — hebrew1 נכתב ל-numbering.xml', fmts.join(','));
  else report.fail('מספור רשימה — hebrew1', `${styleRes} | numFmt שנמצאו: ${fmts.join(',') || 'אין'}`);

  console.log('לוג הדף:', JSON.stringify(await app.log()));
} finally {
  app.close();
}

process.exit(report.print() > 0 ? 1 : 0);
