/**
 * QA חי לתרחיש ההטענה המוקדמת: משתמש שפותח את לשונית „תצוגה” **בזמן** שהמנוע
 * עוד נטען. נמדדת צירת זמן של מצב הכפתור ב-DOM מול מצב הפקודה במנוע —
 * אם המנוע כבר מדווח `enabled` והכפתור נשאר מנוטרל, זו תקיעה של מצב.
 *
 *   npm run build && node scripts/zoom-stale-qa.mjs
 */
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage, requireChrome } from './cdp.mjs';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const OBSERVE_MS = 45_000;

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('dist/index.html אינו קיים — הריצו npm run build תחילה');
  process.exit(1);
}
requireChrome();

const STUB = `<script>
  window.Otzaria = {
    call: function (method) {
      if (method === 'app.getInfo') return Promise.resolve({ success: true, data: { version: '9.9.9', platform: 'zoom-qa' }, error: null });
      if (method === 'app.getTheme') return Promise.resolve({ success: true, data: { mode: 'light', colorScheme: {}, typography: {} }, error: null });
      return Promise.resolve({ success: false, data: null, error: { message: 'no' } });
    },
    on: function () {},
    off: function () {}
  };
</script>`;

const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const latchEnd = html.indexOf('</script>') + '</script>'.length;
const path = join(DIST, 'zoom-stale-tmp.html');
writeFileSync(path, html.slice(0, latchEnd) + STUB + html.slice(latchEnd));

const expr = `(async () => {
  const q = (sel) => document.querySelector(sel);
  const qa = (sel) => [...document.querySelectorAll(sel)];
  const settle = (ms) => new Promise((r) => setTimeout(r, ms));
  const deadline = Date.now() + ${OBSERVE_MS};

  // ממתין רק לממשק — לא למנוע. זה התרחיש: לוחצים על הלשונית מוקדם.
  while (Date.now() < deadline) {
    if (q('.word-tab-strip')) break;
    await settle(100);
  }
  const tab = qa('.word-tab-btn').find((b) => b.textContent.trim() === 'תצוגה');
  if (!tab) return { fatal: 'אין לשונית תצוגה' };
  tab.click();

  const FIT_TITLE = 'התאם את תצוגת העמוד לרוחב החלון';
  const timeline = [];
  let staleMs = null;
  let engineEnabledAt = null;

  while (Date.now() < deadline) {
    const btn = q('button[data-tip-title="' + FIT_TITLE + '"],button[data-tip-desc="' + FIT_TITLE + '"]');
    const sd = window.__otzariaEditor?.superdoc;
    const engineEnabled = Boolean(sd?.ui?.commands?.get('zoom-fit-width')?.getState?.().enabled);
    if (engineEnabled && engineEnabledAt === null) engineEnabledAt = Date.now();
    // הכפתור עלול להתפרק בהחלפת מצב; נמדוד רק כשהוא קיים ב-DOM.
    if (btn && engineEnabled && btn.disabled && staleMs === null) staleMs = 0;
    if (btn && engineEnabled && !btn.disabled) {
      timeline.push({ at: Date.now(), dom: !btn.disabled, engine: engineEnabled });
      break;
    }
    if (timeline.length === 0 || Date.now() - timeline[timeline.length - 1].at > 1000) {
      timeline.push({ at: Date.now(), dom: btn ? !btn.disabled : null, engine: engineEnabled });
    }
    await settle(200);
  }

  return {
    samples: timeline.length,
    engineEnabledAt,
    finalDomEnabled: timeline[timeline.length - 1]?.dom ?? null,
    timeline,
  };
})()`;

let page;
try {
  page = await openPage(`file://${path}`, { label: 'stale-qa' });
  const result = (await page.cdp.evaluate(expr)) ?? { fatal: 'אין תוצאה' };
  console.log(JSON.stringify(result, null, 2));
  if (result.finalDomEnabled !== true) {
    console.error('✗ הכפתור נשאר מנוטרל ב-DOM גם אחרי שהמנוע מדווח זמין — מצב תקוע');
    process.exitCode = 1;
  } else {
    console.log('✓ הכפתור מתעדכן כשהמנוע נהיה זמין');
  }
} catch (error) {
  console.error(`stale-qa נכשל: ${error.message}`);
  process.exitCode = 1;
} finally {
  page?.close();
  rmSync(path, { force: true });
}
