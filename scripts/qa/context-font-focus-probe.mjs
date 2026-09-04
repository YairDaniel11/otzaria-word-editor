/**
 * „כאשר אני משנה כתב הסמן לא כותב” (Y-PLONI#14 סעיף א), דרך שורת הגופן שבתפריט
 * הלחצן הימני — ודרך הרצועה, שסדר הפליטה בה הפוך.
 *
 * למה זה שער נפרד ולא עוד שלב שם: המסלול שונה. ברצועה הפקד יושב בתוך „בית”,
 * והמאזין ל„סיימתי” הוא `returnFocusToDocument` שלה. בכרטיס
 * (`ContextMenuFontPicker.vue`) הפקד פולט `done`, הכרטיס נסגר, ומי שמחזיר את
 * המיקוד הוא המעטפת (`App.vue`, `closeContextMenu`) — שרשרת בת שלוש חוליות
 * שאף אחת מהן אינה נמדדת ברצועה. חוליה אחת שנשמטת פירושה שההקלדה הבאה נכנסת
 * לתיבה ולא לטקסט.
 *
 * ## שני מסלולים, ולא אחד
 *
 * תיבת הגודל ותיבת הגופן **אינן** אותו פקד: על הגופן מחוברים גם `@preview`
 * ו-`@preview-end`, כלומר ריחוף על שורה ברשימה מריץ `format.apply` אמיתי
 * במסמך ו„החזרה” אחריו מריצה עוד אחד (composables/font-preview.ts,
 * engine/font-preview.ts). זה מסלול שלם שאין לו מקבילה בתיבת הגודל, והבאג
 * שדווח הוא דווקא עליו — „כאשר אני משנה כתב הסמן לא כותב”. לכן שני השלבים.
 *
 * ההקשר: Y-PLONI#14 סעיף א. \`context-menu-model.ts\` מצהיר במפורש שהמקטע
 * הזה חל גם על סמן מכווץ („הוא קובע את מה שיוקלד”), ולכן זו ההבטחה שנבדקת.
 *
 * אבחון בלבד. יציאה 9542.
 */
import { openApp, createReport } from './harness.mjs';

const report = createReport('מיקוד אחרי שורת הגופן בתפריט ההקשר', { strict: true });
const app = await openApp({ name: 'ctx-font-focus', port: Number(process.env.QA_PORT ?? 9542) });

const note = (...p) =>
  console.log(p.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));

const focused = () =>
  app.js(`(function () {
    var a = document.activeElement;
    if (!a) return 'null';
    var name = a.getAttribute('data-tip-title') || a.getAttribute('aria-label') || a.className || '';
    return a.tagName + (name ? '|' + name : '');
  })()`);

const xml = async () => (await app.docx())['word/document.xml'] || '';

/** הריצה שהתו הוקלד לתוכה. `null` = אין ריצה כזאת בכלל. */
function runOf(doc, text) {
  const body = doc.slice(doc.indexOf('<w:body'));
  const runs = body.match(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g) || [];
  return runs.find((r) => new RegExp(`<w:t[^>]*>[^<]*${text}[^<]*</w:t>`).test(r)) ?? null;
}

function szOf(doc, text) {
  const hit = runOf(doc, text);
  if (!hit) return null;
  const sz = hit.match(/<w:sz w:val="(\d+)"/);
  return sz ? Number(sz[1]) : 0;
}

/**
 * תג `<w:rFonts>` של הריצה, כפי שהוא. המחרוזת ולא שדה מפורק: המנוע כותב את
 * הגופן ל-`w:ascii`, ל-`w:hAnsi` ול-`w:cs` בהרכבים שונים לפי הכתב, ומה שנשאל
 * כאן הוא אם השם נכתב **בכלל** — ולא לאיזה מהם.
 */
function rFontsOf(doc, text) {
  const hit = runOf(doc, text);
  if (!hit) return null;
  const fonts = hit.match(/<w:rFonts[^>]*\/?>/);
  return fonts ? fonts[0] : '«אין rFonts בריצה»';
}

/** לחיצה ימנית אמיתית. `contextmenu` מסונתז ב-Chromium מהודעת הכפתור. */
async function rightClick(x, y) {
  await app.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
  await app.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'right', buttons: 2, clickCount: 1 });
  await app.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'right', buttons: 0, clickCount: 1 });
  await app.sleep(600);
}

const menuOpen = () => app.exists('.ctx-menu');
/** המלבן של תיבה בכרטיס. `גופן` אינו מתנגש ב„גודל גופן” — ההתאמה היא בתחילית. */
const boxInMenu = (title) =>
  app
    .js(`JSON.stringify(window.__qa.rect(${JSON.stringify(title)}, { scope: '.ctx-menu' }))`)
    .then(JSON.parse);
const boxValueInMenu = (title) =>
  app.js(`(function () {
    var m = document.querySelector('.ctx-menu');
    var el = m && m.querySelector('input[role="combobox"][data-tip-title="${title}"]');
    return el ? el.value : null;
  })()`);

/** האפשרות המסומנת ברשימה שנפתחה מתוך הכרטיס — מה ש-Enter יחיל. */
const highlightedInMenu = () =>
  app.js(`(function () {
    var el = document.querySelector('.ctx-menu [role="listbox"] .ribbon-combo-option.active');
    return el ? el.getAttribute('data-value') : null;
  })()`);

async function waitForLines(min = 2, ms = 30_000) {
  const until = Date.now() + ms;
  for (;;) {
    const lines = Number(await app.lineCount());
    if (lines >= min) return lines;
    if (Date.now() > until) throw new Error(`המסמך לא הציג ${min} שורות בזמן (${lines})`);
    await app.sleep(500);
  }
}

try {
  await app.cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false,
  });
  await app.sleep(600);
  await app.tab('בית');

  /* ===== פיקסטורה ===== */
  await app.caret(0);
  await app.type('alfa beta gama', 28);
  await app.press('Enter', 'Enter', 13);
  await app.sleep(300);
  await app.type('cola diva mila', 28);
  await app.sleep(1500);
  note('פיקסטורה:', await app.screenText(), '| שורות:', await waitForLines());

  /* ===== שלב א: תיבת הגודל ===== */
  const spot = await app.caret(1);
  await app.sleep(300);
  await rightClick(spot.x, spot.y);
  const opened = await menuOpen();
  note('התפריט נפתח:', opened, '| הגודל שהתיבה בכרטיס מציגה:', await boxValueInMenu('גודל גופן'));

  if (!opened) {
    report.fail('התפריט נפתח בלחיצה ימנית', 'אין `.ctx-menu` — אי אפשר למדוד את התיבות שבו');
  } else {
    const rect = await boxInMenu('גודל גופן');
    if (!rect) {
      report.fail('תיבת הגודל קיימת בכרטיס', 'לא נמצאה תיבה עם הטולטיפ „גודל גופן” בתוך `.ctx-menu`');
    } else {
      await app.clickAt(rect.x, rect.y);
      await app.sleep(350);
      await app.type('14');
      await app.sleep(200);
      await app.press('Enter', 'Enter', 13);
      await app.sleep(1000);

      const afterEnter = { focus: await focused(), menu: await menuOpen() };
      note('אחרי Enter בתיבת הגודל — מיקוד:', afterEnter.focus, '| התפריט עדיין פתוח:', afterEnter.menu);

      const screenBefore = (await app.screenText()) || '';
      await app.type('q');
      await app.sleep(800);
      const screenAfter = (await app.screenText()) || '';
      const typedIntoDoc = screenAfter.includes('q') && screenAfter.length > screenBefore.length;
      note('אחרי הקלדת „q” — נכנס למסמך:', typedIntoDoc);
      note('  מסך:', JSON.stringify(screenBefore.slice(0, 50)), '→', JSON.stringify(screenAfter.slice(0, 50)));

      typedIntoDoc
        ? report.pass('ההקלדה אחרי בחירת הגודל בכרטיס נכנסת למסמך', `מיקוד: ${afterEnter.focus}`)
        : report.fail('ההקלדה אחרי בחירת הגודל בכרטיס נכנסת למסמך', `המיקוד ב-${afterEnter.focus}`);

      const szq = szOf(await xml(), 'q');
      note('sz של „q”:', szq);
      szq === 28
        ? report.pass('הגודל שהוחל מהכרטיס על סמן מכווץ שרד', 'התו שהוקלד נכתב ב-w:sz=28')
        : report.fail(
            'הגודל שהוחל מהכרטיס על סמן מכווץ שרד',
            `התו נכתב ב-${szq === null ? 'אין ריצה כזאת' : 'w:sz=' + szq}`,
          );
    }
  }

  /* ===== שלב ב: תיבת הגופן — המסלול שהבאג דווח עליו ===== */
  const spotB = await app.caret(1);
  await app.sleep(300);
  await rightClick(spotB.x, spotB.y);
  const openedB = await menuOpen();
  note('התפריט נפתח שוב:', openedB, '| הגופן שהתיבה בכרטיס מציגה:', await boxValueInMenu('גופן'));

  if (!openedB) {
    report.fail('התפריט נפתח בלחיצה ימנית שנייה', 'אין `.ctx-menu` — מסלול הגופן אינו נגיש');
  } else {
    const rectB = await boxInMenu('גופן');
    if (!rectB) {
      report.fail('תיבת הגופן קיימת בכרטיס', 'לא נמצאה תיבה עם הטולטיפ „גופן” בתוך `.ctx-menu`');
    } else {
      await app.clickAt(rectB.x, rectB.y);
      await app.sleep(350);
      // „frank” ולא שם מלא: ההתאמה המדורגת הראשונה היא Frank Ruhl הארוז, כלומר
      // גופן שקיים בכל מכונה. מה שיוחל נקרא מהרשימה עצמה ולא מונח.
      await app.type('frank');
      await app.sleep(500);
      const target = await highlightedInMenu();
      note('האפשרות המסומנת ברשימה:', target);

      if (!target) {
        report.fail(
          'רשימת הגופנים בכרטיס מסמנת התאמה',
          'הוקלד „frank” ואין שורה מסומנת — Enter לא יחיל דבר',
        );
      } else {
        await app.press('Enter', 'Enter', 13);
        await app.sleep(1200);

        const afterB = { focus: await focused(), menu: await menuOpen() };
        note('אחרי Enter בתיבת הגופן — מיקוד:', afterB.focus, '| התפריט עדיין פתוח:', afterB.menu);

        const beforeB = (await app.screenText()) || '';
        await app.type('z');
        await app.sleep(900);
        const afterScreenB = (await app.screenText()) || '';
        const typedB = afterScreenB.includes('z') && afterScreenB.length > beforeB.length;
        note('אחרי הקלדת „z” — נכנס למסמך:', typedB);

        typedB
          ? report.pass('ההקלדה אחרי בחירת הגופן בכרטיס נכנסת למסמך', `מיקוד: ${afterB.focus}`)
          : report.fail('ההקלדה אחרי בחירת הגופן בכרטיס נכנסת למסמך', `המיקוד ב-${afterB.focus}`);

        const fonts = rFontsOf(await xml(), 'z');
        note('rFonts של „z”:', fonts);
        fonts && fonts.includes(target)
          ? report.pass('הגופן שהוחל מהכרטיס על סמן מכווץ שרד', `התו שהוקלד נכתב ב-${target}`)
          : report.fail(
              'הגופן שהוחל מהכרטיס על סמן מכווץ שרד',
              `התו נכתב ב-${fonts === null ? 'אין ריצה כזאת' : fonts} ולא ב-${target}`,
            );
      }
    }
  }

  note('שורת מצב:', await app.status());
} finally {
  app.close();
}
process.exit(report.print() > 0 ? 1 : 0);
