/**
 * Regression gate for issue #14 (c): the numbering-actions menu says
 * „יש למקם את הסמן בתוך רשימה” although the caret IS in a list item.
 *
 * Root cause (measured on the built dist, superdoc 2.11.0): `resolveListItem` in
 * src/engine/lists.ts trusts `blocks.list()` — which lists TOP-LEVEL body blocks
 * only and resolves numbered headings as `heading` — while the engine's own list
 * authority (`lists.getState` / `lists.list` / `lists.get`) says the block is a
 * list item, and `lists.setLevelNumberStyle` with a `listItem` target succeeds on it.
 *
 * Two Word-shaped documents reproduce it:
 *   1. a numbered paragraph inside a table cell   (block absent from blocks.list)
 *   2. a numbered heading (Heading1 + w:numPr)     (blocks.list nodeType = 'heading')
 *
 * The gate opens each docx through the host stub (`fs.pickUserFile` → data: URL),
 * puts the caret on the item with a real click, opens „פעולות מספור” with a real
 * mouse, picks „A, B, C” and requires: no error message, and an upperLetter marker
 * drawn on screen. strict: a broken row fails the run.
 *
 * Usage:  CHROME=<path> node scripts/qa/list-resolver-qa.mjs   (QA_PORT overrides 9363)
 */
import { openApp, createReport } from './harness.mjs';
import { scenarios } from './docx-fixtures.mjs';

const MSG = 'יש למקם את הסמן בתוך רשימה';
const CASES = ['inTable', 'numberedHeading'];
const report = createReport('issue #14 (c) — list item resolver (table cell, numbered heading)', { strict: true });
const app = await openApp({ name: 'issue14c-gate', port: Number(process.env.QA_PORT ?? 9363) });

async function openDocx(buffer, name) {
  const dataUrl =
    'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,' + Buffer.from(buffer).toString('base64');
  await app.js(
    `window.__qaHost.replies['fs.pickUserFile']=function(){return Promise.resolve({success:true,error:null,` +
      `data:{token:'tok-${name}',url:${JSON.stringify(dataUrl)},name:${JSON.stringify(name + '.docx')},size:${buffer.length},access:'readwrite'}})}`,
  );
  await app.tab('קובץ');
  const clicked = await app.click('פתח קובץ', { after: 7000 });
  const title = await app.js("document.querySelector('.doc-title-input')?.value");
  await app.tab('בית');
  await app.sleep(500);
  return clicked && title === name;
}

/** Index of the first visible layout line containing `text` (hidden tabs have zero-width lines). */
const lineIndexByText = (text) =>
  app.js(`(function(){
    var lines = document.querySelectorAll('.superdoc-line, .superdoc-fragment');
    for (var i = 0; i < lines.length; i++) { var r = lines[i].getBoundingClientRect(); if (r.width > 0 && (lines[i].textContent||'').indexOf(${JSON.stringify(text)}) >= 0) return i; }
    return -1;
  })()`);

/** What the engine says about the caret block — the precondition of the gate. */
const engineView = () =>
  app.js(`(async function(){
    var doc = window.__otzariaEditor.superdoc.activeEditor.doc;
    var info = await doc.selection.current();
    var segs = (info && info.target && info.target.segments) || [];
    var blockId = null;
    for (var i = 0; i < segs.length; i++) { if (typeof segs[i].blockId === 'string') { blockId = segs[i].blockId; break; } }
    var listed = await doc.blocks.list();
    var b = (listed.blocks || []).find(function(x){ return x.nodeId === blockId; });
    var state = blockId ? await doc.lists.getState({ target: { kind: 'block', nodeType: 'paragraph', nodeId: blockId } }) : null;
    return JSON.stringify({ blockId: blockId, blocksListNodeType: b ? b.nodeType : null, isListItem: state && state.isListItem, numFmt: state && state.numFmt });
  })()`).then(JSON.parse);

/** Markers drawn in the visible document only. */
const visibleMarkers = () =>
  app.js(`JSON.stringify(Array.from(document.querySelectorAll('[class*="list-marker"]')).filter(function(n){ return n.getBoundingClientRect().width > 0; }).map(function(n){ return n.textContent.replace(/\\u200f/g,''); }))`).then(JSON.parse);

try {
  await app.cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await app.sleep(500);
  await app.tab('בית');
  const all = scenarios();

  for (const name of CASES) {
    const sc = all[name];
    console.log(`\n== ${name}: ${sc.desc}`);
    if (!(await openDocx(sc.docx, name))) {
      report.fail(`${name}: open`, 'the docx did not open through the host stub');
      continue;
    }
    const idx = await lineIndexByText(sc.target);
    if (idx < 0) {
      report.fail(`${name}: caret`, 'target line not on screen');
      continue;
    }
    await app.caret(idx);
    const view = await engineView();
    console.log(`[${name}] engine:`, JSON.stringify(view), 'markers before:', JSON.stringify(await visibleMarkers()));
    if (view.isListItem !== true) {
      report.fail(`${name}: precondition`, `engine does not consider the caret block a list item: ${JSON.stringify(view)}`);
      continue;
    }
    report.pass(`${name}: precondition`, `lists.getState.isListItem=true, blocks.list nodeType=${view.blocksListNodeType}`);

    await app.reset();
    const opened = await app.click('פעולות מספור', { after: 600 });
    const picked = opened && (await app.clickMenu('A, B, C', { after: 1600 }));
    const status = await app.status();
    const msgs = await app.messages();
    const shown = [status.text || '', ...msgs.map((m) => m.text || '')].join(' | ');
    const markers = await visibleMarkers();
    console.log(`[${name}] opened=${opened} picked=${picked} status=${JSON.stringify(status)} msgs=${JSON.stringify(msgs)} markers after=${JSON.stringify(markers)}`);
    if (await app.menuOpen()) await app.escape();

    if (!picked) report.fail(`${name}: menu`, `opened=${opened} picked=${picked}`);
    else if (shown.includes(MSG)) report.fail(`${name}: „${MSG}” although the caret is in a list item`, shown);
    else if (status.error) report.fail(`${name}: style change`, shown);
    else if (!markers.some((m) => /^A\./.test(m))) report.fail(`${name}: marker`, `no A. marker on screen: ${markers.join(' ')}`);
    else report.pass(`${name}: numbering menu → A, B, C`, `markers ${markers.join(' ')}`);
  }
} catch (e) {
  report.fail('gate completed', String((e && e.stack) || e));
  try { console.log('page log:', JSON.stringify(await app.log())); } catch {}
} finally {
  app.close();
}
process.exit(report.print() > 0 ? 1 : 0);
