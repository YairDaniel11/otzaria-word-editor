/**
 * שער על הטולטיפ המעוצב — ui/tooltip/TooltipLayer.vue.
 *
 * למה דפדפן אמיתי ולא jsdom: כל מה שנמדד כאן אינו קיים ב-jsdom.
 *
 *   1. **`elementFromPoint`.** זה המסלול שמאתר כפתור **מנוטרל**, שאירועי עכבר
 *      אינם נשלחים אליו כלל אלא להורה שלו — ובדיוק שם הטולטיפ נושא את הסיבה
 *      („אין בחירה”). jsdom מחזיר null מכל `elementFromPoint`, ולכן בדיקה שם
 *      הייתה מאשרת בירוק בדיוק את המסלול שאינו עובד.
 *   2. **פריסה.** המיקום נמדד מ-`getBoundingClientRect`, ו-jsdom מחזיר אפסים
 *      מכולם — כלומר „הכרטיס בתוך החלון” אינו ניתן לבדיקה שם.
 *   3. **הטולטיפ המולד.** התקלה שדווחה הייתה כרטיס ומלבן אפור זה מעל זה. מה
 *      שמונע אותה הוא ש-`title` אינו קיים באף אלמנט, ולכן נמדד כאן **מפקד** על
 *      הדף הארוז ולא רק על הכפתור שנבדק — כולל `<title>` בתוך SVG, שגם הוא
 *      מצייר מלבן מולד. השם הנגיש, שהיה תלוי ב-`title`, נמדד גם הוא: הסילוק
 *      אסור שישתיק כפתור אייקון בפני קורא מסך.
 *
 * הזזת העכבר היא `Input.dispatchMouseEvent` ולא `dispatchEvent` מתוך הדף:
 * אירוע מסונתז ב-JS אינו מזיז את סמן העכבר האמיתי, ולכן `elementFromPoint` היה
 * נמדד על נקודה שאין בה עכבר — כלומר שוב בדיקה שאינה מודדת את המסלול.
 *
 *   npm run build && node scripts/tooltip-probe.mjs
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

/** SHOW_DELAY_MS בקומפוננטה הוא 400. ההמתנה כאן נדיבה ואינה מודדת תזמון. */
const SETTLE_MS = 900;

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
const path = join(DIST, 'tooltip-tmp.html');
writeFileSync(path, html.slice(0, latchEnd) + STUB + html.slice(latchEnd));

const READY = `(async () => {
  const settle = (ms) => new Promise((r) => setTimeout(r, ms));
  const deadline = Date.now() + ${READY_MS};
  while (Date.now() < deadline) {
    if (document.querySelector('.word-tab-strip') && window.__otzariaEditor) break;
    await settle(250);
  }
  await settle(2000);
  return Boolean(document.querySelector('[data-tip-title]'));
})()`;

/** מרכז הפקד שהסלקטור מוצא, בקואורדינטות חלון. */
const centerOf = (selector) => `(() => {
  const element = document.querySelector(${JSON.stringify(selector)});
  if (!element) return null;
  const box = element.getBoundingClientRect();
  return {
    x: box.left + box.width / 2,
    y: box.top + box.height / 2,
    title: element.getAttribute('title'),
    disabled: element.disabled === true,
  };
})()`;

/** מה שהכרטיס מציג בפועל, ואיפה הוא. */
const TIP_STATE = `(() => {
  const tip = document.querySelector('.word-tip');
  if (!tip) return null;
  const box = tip.getBoundingClientRect();
  const text = (selector) => {
    const node = tip.querySelector(selector);
    return node ? node.textContent.trim() : null;
  };
  return {
    title: text('.word-tip__title'),
    shortcut: text('.word-tip__key'),
    description: text('.word-tip__desc'),
    rect: { top: box.top, left: box.left, width: box.width, height: box.height },
    inViewport:
      box.top >= 0 && box.left >= 0 && box.right <= window.innerWidth && box.bottom <= window.innerHeight,
  };
})()`;

/**
 * מפקד `title` על כל הדף.
 *
 * הבדיקה על כפתור בודד אינה מספיקה: התקלה שדווחה הייתה על „כיוון פסקה משמאל
 * לימין”, ומה שמגן עליה הוא שהתכונה אינה קיימת **בשום מקום**. מה שבתוך
 * `.editor-stack` הוא DOM של המנוע ואינו שלנו.
 *
 * „כל הדף” הוא הלשונית הפעילה בלבד: הלשוניות הן `v-if` (ui/ribbon/Ribbon.vue),
 * ולכן שבע מתוך שמונה אינן ב-DOM בכלל. לכן המפקד רץ בלולאה על כולן — בלי זה
 * הפרה בלשונית שאינה „בית” עוברת את השער, נמדד.
 */
const TITLE_CENSUS = `(() => {
  const all = Array.from(document.querySelectorAll('[title]'));
  const ours = all.filter((element) => !element.closest('.editor-stack'));
  return {
    total: all.length,
    ours: ours.length,
    sample: ours.slice(0, 5).map((element) => element.tagName.toLowerCase() + ': ' + element.getAttribute('title')),
    svgTitles: document.querySelectorAll('svg title').length,
    anchors: document.querySelectorAll('[data-tip-title]').length,
  };
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

/** מה שקורא מסך יכריז על הכפתור. `title` היה זה עד עכשיו, ועכשיו `aria-label`. */
const ACCESSIBLE_NAME = `(() => {
  const element = document.querySelector('button[data-tip-title="מודגש"]');
  return element ? element.getAttribute('aria-label') : null;
})()`;

const nativeTitleOf = (selector) => `(() => {
  const element = document.querySelector(${JSON.stringify(selector)});
  return element ? element.getAttribute('title') : null;
})()`;

/**
 * הכפתור המנוטרל הראשון שיש לו גם *הסבר* — לא סתם שם.
 *
 * „בטל”/„חזור” בפס העליון הם `disabled` בלי סיבה מוסברת (אין עדיין מה לבטל).
 * הכפתורים ש-vertAlignTooltip / tooltipFor מזינים (כתב עליון, הדבק, גזור) הם
 * המקרה שהמסלול הזה נבנה בשבילו: `disabled` **עם** `data-tip-desc` שנושא את
 * הסיבה. אינו קשיח: איזה מהם מנוטרל תלוי בזמינות המנוע ובבחירה במסמך.
 */
const DISABLED_BUTTON = `(() => {
  const buttons = Array.from(document.querySelectorAll('button[disabled][data-tip-desc]'));
  const found = buttons[0];
  if (!found) return null;
  const box = found.getBoundingClientRect();
  return {
    x: box.left + box.width / 2,
    y: box.top + box.height / 2,
    tipTitle: found.getAttribute('data-tip-title'),
    description: found.getAttribute('data-tip-desc'),
  };
})()`;

let failures = 0;

function check(ok, message) {
  console.log(`${ok ? '✓' : '✗'} ${message}`);
  if (!ok) failures += 1;
}

async function screenshot(cdp, file) {
  const response = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const data = response?.result?.data;
  if (!data) {
    console.error(`לא ניתן לצלם (${file})`);
    return;
  }
  writeFileSync(file, Buffer.from(data, 'base64'));
  console.log(`\u{1F4F7} ${file}`);
}

/** הזזת סמן אמיתית, ואז המתנה שההשהיה תחלוף. */
async function hover(cdp, x, y) {
  // שתי הזזות: הראשונה מוציאה את הסמן ממה שהיה תחתיו, והשנייה נחה על היעד.
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 500, buttons: 0 });
  await sleep(60);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0 });
  await sleep(SETTLE_MS);
}

let page;
try {
  page = await openPage(`file://${path}`, { label: 'tooltip' });
  await page.cdp.send('Emulation.setDeviceMetricsOverride', {
    ...VIEWPORT,
    deviceScaleFactor: 1,
    mobile: false,
  });
  if (!(await page.cdp.evaluate(READY))) throw new Error('הרצועה לא נטענה עם תכונות טולטיפ');

  /* 0. המפקד, בכל שמונה הלשוניות. לפני ההמרה נמדדו 61 תכונות `title`. */
  const tabs = await page.cdp.evaluate(TAB_LABELS);
  check(tabs.length >= 8, `נמצאו ${tabs.length} לשוניות לסרוק`);

  let ours = 0;
  let svgTitles = 0;
  const samples = [];
  for (const label of tabs) {
    check(await page.cdp.evaluate(clickTab(label)), `נבחרה הלשונית „${label}”`);
    await sleep(250);
    const census = await page.cdp.evaluate(TITLE_CENSUS);
    ours += census.ours;
    svgTitles += census.svgTitles;
    if (census.sample.length) samples.push(`${label}: ${census.sample.join(' | ')}`);
    console.log(
      `   „${label}”: ${census.total} title בדף, ${census.ours} מחוץ למנוע, ` +
        `${census.svgTitles} בתוך svg, ${census.anchors} עוגנים`,
    );
    // עוגן אחד לפחות בכל לשונית: „אין title” הוא חצי חוזה, ומה שהופך אותו
    // למשמעותי הוא שיש טולטיפ במקומו.
    check(census.anchors > 0, `„${label}”: יש פקדים שמצהירים על טולטיפ`);
  }

  check(ours === 0, `אין title על אף אלמנט של המעטפת${samples.length ? ' — ' + samples.join(' ; ') : ''}`);
  check(svgTitles === 0, 'אין <title> בתוך אייקוני SVG — גם הוא מצייר מלבן מולד');

  // חוזרים ל„בית”: שאר השער נשען על „מודגש” ועל „מברשת עיצוב” שיושבים שם.
  await page.cdp.evaluate(clickTab(tabs[1] ?? 'בית'));
  await sleep(250);

  /* 1. כפתור אייקון עם שלושת השדות — „מודגש”, Ctrl+B, וההסבר. */
  const bold = await page.cdp.evaluate(centerOf('button[data-tip-title="מודגש"]'));
  check(Boolean(bold), 'נמצא כפתור „מודגש” ברצועה');
  if (bold) {
    check(bold.title === null, `אין title מולד על הכפתור: ${JSON.stringify(bold.title)}`);

    await hover(page.cdp, bold.x, bold.y);
    const tip = await page.cdp.evaluate(TIP_STATE);
    check(Boolean(tip), 'הכרטיס נפתח בריחוף');
    if (tip) {
      console.log(`   ${JSON.stringify(tip)}`);
      check(tip.title === 'מודגש', `הכותרת היא שם הפקד: ${tip.title}`);
      check(tip.shortcut === 'Ctrl+B', `הצירוף מוצג בשבשבת: ${tip.shortcut}`);
      check(tip.description === 'מעבה את הטקסט המסומן', `ההסבר מוצג מתחת: ${tip.description}`);
      check(tip.inViewport, 'הכרטיס כולו בתוך החלון');
      check(tip.rect.width > 0 && tip.rect.height > 0, 'לכרטיס יש מידות');
    }

    check(
      (await page.cdp.evaluate(nativeTitleOf('button[data-tip-title="מודגש"]'))) === null,
      'גם בזמן שהכרטיס מוצג אין title — אין מה שיצייר מלבן שני מעליו',
    );
    check(
      (await page.cdp.evaluate(ACCESSIBLE_NAME)) === 'מודגש (Ctrl+B)',
      'השם הנגיש של כפתור האייקון נשמר ב-aria-label',
    );

    await screenshot(page.cdp, join(TMP, 'tooltip-bold.png'));

    /* 2. יציאה — הכרטיס נסגר, והשכבה לא השאירה דבר על הכפתור. */
    await page.cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: 720,
      y: 700,
      buttons: 0,
    });
    await sleep(600);
    check((await page.cdp.evaluate(TIP_STATE)) === null, 'הכרטיס נסגר ביציאת העכבר');
    check(
      (await page.cdp.evaluate(nativeTitleOf('button[data-tip-title="מודגש"]'))) === null,
      'גם אחרי היציאה אין title — השכבה אינה משאילה ואינה מחזירה כלום',
    );
  }

  /* 3. כפתור גדול עם תווית והסבר נגזר — „מברשת עיצוב”. */
  const painter = await page.cdp.evaluate(centerOf('button[data-tip-title="מברשת עיצוב"]'));
  if (painter) {
    await hover(page.cdp, painter.x, painter.y);
    const tip = await page.cdp.evaluate(TIP_STATE);
    check(tip?.title === 'מברשת עיצוב', `כותרת מהתווית: ${tip?.title}`);
    check(
      tip?.description === 'העתק עיצוב ממקום אחד והחל במקום אחר',
      `ה-tooltip הקיים ירד להסבר: ${tip?.description}`,
    );
    await screenshot(page.cdp, join(TMP, 'tooltip-painter.png'));
  } else {
    console.log('… „מברשת עיצוב” לא נמצאה — הדילוג אינו כשל');
  }

  /* 4. כפתור מנוטרל — המסלול של elementFromPoint. */
  const off = await page.cdp.evaluate(DISABLED_BUTTON);
  if (off) {
    console.log(`   כפתור מנוטרל: ${off.tipTitle} / ${off.description}`);
    await hover(page.cdp, off.x, off.y);
    const tip = await page.cdp.evaluate(TIP_STATE);
    check(Boolean(tip), 'כפתור מנוטרל מקבל טולטיפ — זה המסלול של elementFromPoint');
    if (tip) {
      console.log(`   ${JSON.stringify(tip)}`);
      check(tip.title === off.tipTitle, `הכותרת נשארת שם הפקד גם כשהוא מנוטרל: ${tip.title}`);
      check(Boolean(tip.description), `הסיבה יורדת לשורת ההסבר: ${tip.description}`);
    }
    await screenshot(page.cdp, join(TMP, 'tooltip-disabled.png'));
  } else {
    console.log('… אין כפתור מנוטרל במסמך שנטען — הדילוג אינו כשל');
  }

  /* 5. פקד מחוץ לרצועה — הפס העליון ושורת המצב, ותזוזה שנייה עליו.

     שני דברים נמדדים כאן. הראשון הוא כיסוי: הפס העליון ושורת המצב אינם
     בנויים מ-`RibbonButton`, וקל לשכוח אותם בהמרה — עד ההמרה הם קיבלו את
     הכרטיס דרך נפילה ל-`title`, ומאז הם חייבים להצהיר בעצמם.

     השני הוא ההבהוב שנמדד פעם על `.word-app-badge`: תזוזה של פיקסל אחד על
     אותו פקד סגרה את הכרטיס, כי הכיבוי הסיר את התכונה שהפכה אותו לעוגן.
     המנגנון ההוא נמחק, ושתי התזוזות כאן הן מה שמקבע שהוא לא יחזור. */
  const shell = await page.cdp.evaluate(`(() => {
    const found = Array.from(document.querySelectorAll('[data-tip-title]')).find(
      (element) =>
        !element.closest('.word-ribbon') &&
        !element.closest('.editor-stack') &&
        element.getBoundingClientRect().width > 4,
    );
    if (!found) return null;
    const box = found.getBoundingClientRect();
    return {
      tipTitle: found.getAttribute('data-tip-title'),
      x: Math.round(box.left + box.width / 2),
      y: Math.round(box.top + box.height / 2),
    };
  })()`);
  check(Boolean(shell), 'נמצא פקד מחוץ לרצועה שמצהיר על טולטיפ');
  if (shell) {
    console.log(`   פקד מחוץ לרצועה: ${shell.tipTitle}`);
    await hover(page.cdp, shell.x, shell.y);
    const opened = await page.cdp.evaluate(TIP_STATE);
    check(opened?.title === shell.tipTitle, `הפס העליון/שורת המצב מקבלים כרטיס: ${opened?.title}`);

    await page.cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: shell.x + 1,
      y: shell.y + 1,
      buttons: 0,
    });
    await sleep(400);
    check(
      Boolean(await page.cdp.evaluate(TIP_STATE)),
      'הכרטיס שורד תזוזה נוספת על אותו פקד — בלי זה הוא מהבהב',
    );
  }

  /* 6. Escape מסלק את הכרטיס. */
  const escape = await page.cdp.evaluate(centerOf('button[data-tip-title="נטוי"]'));
  if (escape) {
    await hover(page.cdp, escape.x, escape.y);
    check(Boolean(await page.cdp.evaluate(TIP_STATE)), 'הכרטיס פתוח לפני Escape');
    await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape' });
    await sleep(200);
    check((await page.cdp.evaluate(TIP_STATE)) === null, 'Escape סוגר את הכרטיס');
  }

  /* 7. אזור המסמך אינו מקבל טולטיפ של המעטפת. */
  await page.cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: VIEWPORT.width / 2,
    y: 600,
    buttons: 0,
  });
  await sleep(SETTLE_MS);
  check((await page.cdp.evaluate(TIP_STATE)) === null, 'ריחוף מעל המסמך אינו פותח כרטיס');
} catch (error) {
  console.error(`✗ ${error.message}`);
  failures += 1;
} finally {
  page?.close();
  // כמו שאר השערים: דף הבדיקה אינו נשאר ב-dist. `check:dist` נופל עליו,
  // ובצדק — הוא אינו חלק מהתוסף.
  rmSync(path, { force: true });
}

console.log(failures ? `\n${failures} כשלים` : '\nהכול עבר');
process.exit(failures ? 1 : 0);
