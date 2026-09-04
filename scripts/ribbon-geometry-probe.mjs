/**
 * שער הגאומטריה של הרצועה — בדפדפן אמיתי, על מה שנמדד ולא על מה שנכתב.
 *
 * ## למה זה לא יכול להיות בדיקת יחידה
 *
 * `tests/unit/ribbon-geometry.test.ts` בודק את **המקור**: שהטוקן נגזר, שאין
 * מספר קשיח, שאין `min-height`. זה שומר על הכתיבה, ולא על התוצאה. הטענה עצמה
 * — „הרצועה באותו גובה בכל הלשוניות, ולכן המסמך אינו קופץ” — היא פריסה:
 * `calc`, `flex`, גלישה ופס גלילה. jsdom אינו מחשב אף אחד מהם, ולכן שם אפשר
 * לכתוב CSS תקין-למראה שהתוצאה שלו קופצת.
 *
 * התקלה שנתפסה כאן פעם אחת בעין (30px של קפיצה במעבר ל„סקירה”) יכולה לחזור
 * מכל כלל חדש בקובץ אחר לגמרי — קבוצה שנוספה, אייקון שגדל, מחסנית רביעית.
 * מה שנמדד: הגובה בפועל, בכל שמונה הלשוניות, אחרי החלפה אמיתית.
 *
 *   npm run build && node scripts/ribbon-geometry-probe.mjs
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage, requireChrome, sleep } from './cdp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const TMP = join(ROOT, 'tmp');

const VIEWPORT = { width: 1440, height: 900 };
const READY_MS = 40_000;

/** החלפת לשונית היא רינדור אחד. ההמתנה נדיבה ואינה מודדת תזמון. */
const SWITCH_MS = 350;

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('dist/index.html אינו קיים — הריצו npm run build תחילה');
  process.exit(1);
}
requireChrome();
mkdirSync(TMP, { recursive: true });

const STUB = `<script>
  window.Otzaria = {
    call: function (method) {
      if (method === 'app.getInfo') return Promise.resolve({ success: true, data: { version: '9', platform: 'p' }, error: null });
      if (method === 'app.getTheme') return Promise.resolve({ success: true, data: { mode: 'light', colorScheme: {}, typography: {} }, error: null });
      return Promise.resolve({ success: false, data: null, error: { message: 'no' } });
    },
    on: function () {},
    off: function () {}
  };
</script>`;

const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const latchEnd = html.indexOf('</script>') + '</script>'.length;
const path = join(DIST, 'ribbon-geometry-tmp.html');
writeFileSync(path, html.slice(0, latchEnd) + STUB + html.slice(latchEnd));

const READY = `(async () => {
  const settle = (ms) => new Promise((r) => setTimeout(r, ms));
  const deadline = Date.now() + ${READY_MS};
  while (Date.now() < deadline) {
    if (document.querySelector('.word-tab-strip') && window.__otzariaEditor) break;
    await settle(250);
  }
  await settle(2000);
  return document.querySelectorAll('.word-tab-btn').length;
})()`;

const TAB_LABELS = `(() => Array.from(document.querySelectorAll('.word-tab-btn')).map(
  (button) => button.textContent.trim(),
))()`;

const clickTab = (label) => `(() => {
  const found = Array.from(document.querySelectorAll('.word-tab-btn')).find(
    (button) => button.textContent.trim() === ${JSON.stringify(label)},
  );
  if (!found) return false;
  found.click();
  return true;
})()`;

/**
 * מה שנמדד בכל לשונית.
 *
 * `documentTop` הוא הטענה עצמה: הקפיצה שדווחה היא של **המסמך**, ולא של
 * הרצועה. גובה הרצועה הוא הסיבה, ומקום המסמך הוא מה שהעין רואה — ולכן שניהם
 * נמדדים, ולא רק זה שקל למדוד.
 *
 * `overflow` הוא הגלישה בפועל: מחסנית רביעית אינה מרחיבה את הגובה הקבוע, היא
 * גולשת ממנו. בלי המדידה הזאת התיקון היה מחליף קפיצה נראית בחיתוך שקט.
 */
const MEASURE = `(() => {
  const round = (value) => Math.round(value * 100) / 100;
  const body = document.querySelector('.word-ribbon-body');
  const stack = document.querySelector('.editor-stack');
  if (!body || !stack) return null;

  const pane = body.querySelector('.ribbon-tab-pane');
  const groups = Array.from(body.querySelectorAll('.word-ribbon-group'));

  const overflow = [];
  for (const group of groups) {
    const content = group.querySelector('.word-group-content');
    if (!content) continue;
    const box = content.getBoundingClientRect();
    for (const child of content.children) {
      const childBox = child.getBoundingClientRect();
      // 0.5px של עיגול תת-פיקסלי אינו גלישה.
      if (childBox.bottom - box.bottom > 0.5 || box.top - childBox.top > 0.5) {
        overflow.push(
          (group.querySelector('.word-group-title')?.textContent.trim() ?? '?') +
            ': ' +
            round(childBox.height) +
            'px בתוך ' +
            round(box.height) +
            'px',
        );
      }
    }
  }

  return {
    ribbonHeight: round(body.getBoundingClientRect().height),
    documentTop: round(stack.getBoundingClientRect().top),
    scrolls: body.scrollWidth > body.clientWidth + 1,
    paneWidth: pane ? round(pane.getBoundingClientRect().width) : null,
    groups: groups.length,
    contentHeights: Array.from(new Set(
      groups
        .map((group) => group.querySelector('.word-group-content'))
        .filter(Boolean)
        .map((content) => round(content.getBoundingClientRect().height)),
    )),
    overflow,
    tabStripWidth: round(
      document.querySelector('.word-tab-strip').getBoundingClientRect().width,
    ),
    tabRights: Array.from(document.querySelectorAll('.word-tab-btn')).map((button) =>
      round(button.getBoundingClientRect().right),
    ),
  };
})()`;

let failures = 0;

function check(ok, message) {
  console.log(`${ok ? '✓' : '✗'} ${message}`);
  if (!ok) failures += 1;
}

let page;
try {
  page = await openPage(`file://${path}`, { label: 'ribbon-geometry' });
  await page.cdp.send('Emulation.setDeviceMetricsOverride', {
    ...VIEWPORT,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const tabCount = await page.cdp.evaluate(READY);
  check(tabCount >= 8, `נטענו ${tabCount} לשוניות`);

  const labels = await page.cdp.evaluate(TAB_LABELS);
  console.log(`   הלשוניות: ${labels.join(' · ')}`);

  const measured = [];
  for (const label of labels) {
    check(await page.cdp.evaluate(clickTab(label)), `נבחרה הלשונית „${label}”`);
    await sleep(SWITCH_MS);
    const state = await page.cdp.evaluate(MEASURE);
    if (!state) {
      check(false, `„${label}”: לא נמצאו הרצועה והמסמך`);
      continue;
    }
    measured.push({ label, ...state });
    console.log(
      `   „${label}”: רצועה ${state.ribbonHeight}px, מסמך ב-${state.documentTop}px, ` +
        `${state.groups} קבוצות${state.scrolls ? ', גולשת אופקית' : ''}`,
    );
  }

  check(measured.length === labels.length, 'כל הלשוניות נמדדו');

  /* 1. הטענה עצמה: אותו גובה, ואותו מקום למסמך. */
  const heights = [...new Set(measured.map((tab) => tab.ribbonHeight))];
  check(
    heights.length === 1,
    `גובה הרצועה זהה בכל הלשוניות: ${measured
      .map((tab) => `${tab.label}=${tab.ribbonHeight}`)
      .join(' ')}`,
  );

  const tops = [...new Set(measured.map((tab) => tab.documentTop))];
  check(
    tops.length === 1,
    `המסמך אינו זז בהחלפת לשונית: ${measured
      .map((tab) => `${tab.label}=${tab.documentTop}`)
      .join(' ')}`,
  );

  /* 2. תוכן הקבוצה בגובה אחיד — זה מה שמשווה בין הלשוניות מלמעלה. */
  const contentHeights = [...new Set(measured.flatMap((tab) => tab.contentHeights))];
  check(
    contentHeights.length === 1,
    `תוכן כל הקבוצות באותו גובה: ${contentHeights.join(' / ')}px`,
  );

  /* 3. גלישה שקטה: מחסנית שאינה נכנסת לגובה הקבוע נחתכת, ואינה מרחיבה. */
  const overflowing = measured.filter((tab) => tab.overflow.length > 0);
  check(
    overflowing.length === 0,
    `אין פקד שגולש מגובה הקבוצה${
      overflowing.length ? ' — ' + overflowing.map((t) => `${t.label}: ${t.overflow.join(', ')}`).join(' | ') : ''
    }`,
  );

  /* 4. רצועת הלשוניות אינה זזה. `font-weight` על הפעילה הרחיב אותה, וכל
     שאר הלשוניות זזו הצידה — החצי השני של „הקפיצות”. */
  const rights = measured.map((tab) => tab.tabRights.join(','));
  check(
    new Set(rights).size === 1,
    `הלשוניות אינן זזות כשהפעילה מתחלפת: ${new Set(rights).size} פריסות שונות`,
  );

  /* 5. שני דפוסי הרצועה מתיישרים: אין לשונית שגולשת אופקית ברוחב 1440,
     ולא בגלל שהיא ריקה — הבדיקה למעלה כבר מדדה שיש בה קבוצות. */
  const scrolling = measured.filter((tab) => tab.scrolls).map((tab) => tab.label);
  check(scrolling.length === 0, `אין לשונית שגולשת אופקית ב-1440: ${scrolling.join(', ') || 'אין'}`);

  const response = await page.cdp.send('Page.captureScreenshot', { format: 'png' });
  if (response?.result?.data) {
    const file = join(TMP, 'ribbon-geometry.png');
    writeFileSync(file, Buffer.from(response.result.data, 'base64'));
    console.log(`\u{1F4F7} ${file}`);
  }
} catch (error) {
  console.error(`✗ ${error.message}`);
  failures += 1;
} finally {
  page?.close();
  // כמו שאר השערים: דף הבדיקה אינו נשאר ב-dist. `check:dist` נופל עליו, ובצדק.
  rmSync(path, { force: true });
}

console.log(failures ? `\n${failures} כשלים` : '\nהכול עבר');
process.exit(failures ? 1 : 0);
