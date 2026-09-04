/**
 * שער ה-QA של לשוניות „סקירה” ו„תצוגה”, ושורת המצב.
 *
 * כל פקד נבדק בלחיצת עכבר אמיתית, ואחריו הוכחה שאפשר לקרוא: מה שנכתב ל-OOXML
 * (`docx()`), מצב המנוע עצמו (`cmd()`, `getZoomState()`), או ה-DOM (סרגל,
 * סימני עיצוב, מחלקת מצב מיקוד). `success: true` אינו הוכחה.
 *
 * הרצה:  node scripts/qa/review-view-qa.mjs
 * היציאה 9366 שמורה לשער הזה בלבד.
 */
import { openApp, createReport } from './harness.mjs';

const PORT = Number(process.env.QA_PORT ?? 9366);
const report = createReport('סקירה + תצוגה + שורת המצב');

const log = (...a) => console.log(...a);

/** מריצה צעד ולא נותנת לכשל שלו להפיל את שאר השער. */
async function step(name, fn) {
  log(`\n──────── ${name} ────────`);
  try {
    await fn();
  } catch (error) {
    log('!! זרק:', error?.message);
    report.fail(name, `הצעד זרק: ${error?.message}`);
  }
}

/** תמונת מצב של המסמך: `document.xml` + הקבצים שנוצרו. */
async function snap(app) {
  const files = (await app.docx()) ?? {};
  return { files, doc: files['word/document.xml'] ?? '', names: Object.keys(files) };
}

/** האם משהו רע קרה — status/messages/log. מחזירה מחרוזת פירוט או ''. */
async function noise(app) {
  const [status, messages, pageLog] = await Promise.all([app.status(), app.messages(), app.log()]);
  const bad = [];
  if (status?.error) bad.push(`status=${status.text}`);
  const errs = (messages ?? []).filter((m) => m.method === 'ui.showError');
  if (errs.length) bad.push(`showError=${errs.map((m) => m.text).join(' | ')}`);
  const noisy = (pageLog ?? []).filter((l) => !/DevTools|Download the Vue/i.test(l));
  if (noisy.length) bad.push(`log=${noisy.join(' | ')}`);
  return bad.join('; ');
}

/**
 * מרחיבה את חלון הבדיקה ל-1600×1000.
 *
 * חובה: ב-headless ברירת המחדל ~756px, ו-`.word-ribbon-body` (overflow-x:
 * auto) גולש — פקדים בקצה יושבים ב-x שלילי ולחיצה עליהם נשלחת מחוץ לחלון בלי
 * שום שגיאה, כלומר פקד תקין נמדד כ„שבור” (נמדד ותועד ב-insert-qa.mjs). כל
 * לחיצה כאן מאומתת קודם דרך `onScreen`.
 */
async function widen(app) {
  await app.cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1600,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await app.sleep(2000);
}

/** בודקת שהפקד באמת בתוך החלון לפני שלוחצים עליו. */
async function onScreen(app, name) {
  const st = await app.state(name);
  if (!st.found) return { ok: false, why: 'לא נמצא' };
  if (!st.rect) return { ok: false, why: 'אינו מוצג' };
  const inside = st.rect.x > 0 && st.rect.y > 0;
  return { ok: inside, why: inside ? '' : `מחוץ לחלון (x=${st.rect.x})`, rect: st.rect, state: st };
}

/** ממקמת סמן בפסקה לפי אינדקס `.superdoc-line`. */
async function caretLine(app, index) {
  const raw = await app.js(
    `(function(){var n=document.querySelectorAll('.superdoc-line, .superdoc-fragment')[${index}];if(!n)return 'null';` +
      `var b=n.getBoundingClientRect();return JSON.stringify({x:Math.round(b.x+10),y:Math.round(b.y+b.height/2),` +
      `right:Math.round(b.x+b.width-6)})})()`,
  );
  if (raw === 'null') throw new Error(`אין שורה ${index} במסמך`);
  const r = JSON.parse(raw);
  await app.clickAt(r.x, r.y);
  await app.sleep(400);
  return r;
}

/** בונה מסמך של שלוש פסקאות. */
async function seed(app, words = ['aleph', 'bet', 'gimel']) {
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

/** attrs גולמיים של פקד — title/tooltip, כדי לבדוק ניסוח בלי לגעת ב-src. */
async function controlAttrs(app, name) {
  const raw = await app.js(
    `(function(){var Q=window.__qa;var el=Q.el(${JSON.stringify(name)});if(!el)return 'null';` +
      `return JSON.stringify({title:el.getAttribute('title'),tipTitle:el.getAttribute('data-tip-title'),` +
      `tipDesc:el.getAttribute('data-tip-desc')})})()`,
  );
  return raw === 'null' ? null : JSON.parse(raw);
}

/** מחלקות ה-CSS על מעטפת האפליקציה. */
const shellClasses = (app) => app.js(`document.querySelector('.word-app-shell').className`);

/** display מחושב על סלקטור. `null` כשלא נמצא. */
async function computedDisplay(app, selector) {
  const raw = await app.js(
    `(function(){var el=document.querySelector(${JSON.stringify(selector)});if(!el)return 'null';` +
      `return getComputedStyle(el).display+'|'+getComputedStyle(el).opacity+'|'+getComputedStyle(el).pointerEvents})()`,
  );
  return raw === 'null' ? null : raw;
}

/* ================================================================== */
/* מקטע א' — פקדים מנוטרלים בכוונה, והגנת מסמך                          */
/* ================================================================== */

async function sectionDisabledAndProtection() {
  const app = await openApp({ name: 'review-a', port: PORT });
  try {
    await widen(app);
    await app.tab('סקירה');
    await seed(app);

    await step('בדיקת איות — מנוטרל בכוונה', async () => {
      const st = await app.state('בדיקת איות');
      const attrs = await controlAttrs(app, 'בדיקת איות');
      log('מצב:', JSON.stringify(st), '| attrs:', JSON.stringify(attrs));
      const explained = /תורני|שלב נפרד/.test(attrs?.tipDesc ?? attrs?.title ?? '');
      if (st.found && st.disabled && explained)
        report.pass('בדיקת איות', 'מנוטרל בכוונה ומוסבר (ReviewTab.vue:9) — מוגבל מדעת, לא שבור');
      else if (st.found && st.disabled)
        report.partial('בדיקת איות', `מנוטרל אך הטולטיפ אינו מסביר: ${JSON.stringify(attrs)}`);
      else report.fail('בדיקת איות', `לא נמצא/אינו מנוטרל: ${JSON.stringify(st)}`);
    });

    await step('תגובה חדשה — מנוטרל בכוונה', async () => {
      const st = await app.state('תגובה חדשה');
      const attrs = await controlAttrs(app, 'תגובה חדשה');
      log('מצב:', JSON.stringify(st), '| attrs:', JSON.stringify(attrs));
      const explained = /זהות|מחבר/.test(attrs?.tipDesc ?? attrs?.title ?? '');
      if (st.found && st.disabled && explained)
        report.pass('תגובה חדשה', 'מנוטרל בכוונה — חסרה זהות מחבר קבועה (ReviewTab.vue:115-118)');
      else if (st.found && st.disabled)
        report.partial('תגובה חדשה', `מנוטרל אך הטולטיפ אינו מסביר: ${JSON.stringify(attrs)}`);
      else report.fail('תגובה חדשה', `לא נמצא/אינו מנוטרל: ${JSON.stringify(st)}`);
    });

    await step('הגבל עריכה — לחיצה ראשונה היא אישור בלבד', async () => {
      const before = await snap(app);
      await app.reset();
      const attrsBefore = await controlAttrs(app, 'הגבל עריכה');
      const clicked = await app.click('הגבל עריכה', { after: 400 });
      const attrsAfter = await controlAttrs(app, 'הגבל עריכה');
      log('נלחץ:', clicked, '| tooltip לפני/אחרי:', JSON.stringify(attrsBefore), '→', JSON.stringify(attrsAfter));
      // מוודאים שהמנוע עדיין לא ננעל: הקלדה עדיין נכנסת למסמך.
      await app.caret(0);
      await app.type('X');
      await app.sleep(500);
      const mid = await snap(app);
      const stillEditable = mid.doc !== before.doc;
      log('עדיין ניתן להקליד אחרי לחיצה ראשונה:', stillEditable);
      const confirmShown = /לחץ שוב לאישור/.test(attrsAfter?.tipDesc ?? attrsAfter?.title ?? '');
      if (confirmShown && stillEditable)
        report.pass('הגבל עריכה — לחיצה ראשונה', 'רק אישור מוצג; המסמך עדיין לקריאה-וכתיבה (protection.ts, ReviewTab.vue:184-188)');
      else
        report.partial('הגבל עריכה — לחיצה ראשונה', `confirmShown=${confirmShown} stillEditable=${stillEditable}`);
    });

    await step('הגבל עריכה — הפעלה בפועל', async () => {
      const beforeType = await snap(app);
      await app.reset();
      // הלחיצה השנייה: protectionConfirm כבר true מהצעד הקודם.
      const clicked = await app.click('הגבל עריכה', { after: 1200 });
      const bad = await noise(app);
      const attrs = await controlAttrs(app, 'הגבל עריכה');
      log('נלחץ:', clicked, '| tooltip:', JSON.stringify(attrs), '| רעש:', bad || '(אין)');
      const enforced = /ביטול ההגבלה/.test(attrs?.tipDesc ?? attrs?.title ?? '');
      if (!enforced) {
        report.fail('הגבל עריכה — הפעלה', `הטולטיפ לא עבר למצב „מופעל”: ${JSON.stringify(attrs)}; רעש: ${bad || 'אין'}`);
        return;
      }
      // ניסיון הקלדה בזמן שהמסמך נעול.
      await app.caret(0);
      await app.type('BLOCKED');
      await app.sleep(600);
      const afterType = await snap(app);
      const blocked = afterType.doc === beforeType.doc;
      const bold = await app.cmd('bold');
      log('הקלדה נחסמה:', blocked, '(', beforeType.doc.length, '→', afterType.doc.length, ')');
      log('מצב פקודה אחרת תחת הגנה (bold):', JSON.stringify(bold));
      const reasonReadonly = bold?.reason === 'document-readonly' || bold?.enabled === false;
      if (blocked && !bad)
        report.pass(
          'הגבל עריכה — הפעלה',
          `tooltip="ביטול ההגבלה..."; הקלדה לא נכנסה למסמך; פקודות אחרות ${reasonReadonly ? `מדווחות reason=${bold?.reason}` : `נשארו enabled=${bold?.enabled}`} (command-adapter.ts:25 'document-readonly')`,
        );
      else if (blocked)
        report.partial('הגבל עריכה — הפעלה', `נחסם, אך יש רעש: ${bad}`);
      else
        report.fail(
          'הגבל עריכה — הפעלה',
          `ההקלדה כן נכנסה למסמך תחת „הגנה”! ${bad || ''} — bold.reason=${bold?.reason ?? 'none'} enabled=${bold?.enabled}. ` +
            `protection.get().runtimeEnforced הוא true (protection.ts:52-55 קורא רק mode/enforced ומשליך אותו), ` +
            `אך אין שום מקום שמסנכרן אותו למצב עריכה בפועל: isDocumentEditable (App.vue:391,653-656) מוזן אך ורק מ-document-mode!=='viewing', ` +
            `ו-SuperDoc עצמו שוער רק document-mode==='viewing' לשם 'document-readonly' (לא protection.enforced).`,
        );
    });

    await step('הגבל עריכה — ביטול', async () => {
      const beforeType = await snap(app);
      await app.reset();
      const clicked = await app.click('הגבל עריכה', { after: 1200 });
      const bad = await noise(app);
      const attrs = await controlAttrs(app, 'הגבל עריכה');
      log('נלחץ:', clicked, '| tooltip:', JSON.stringify(attrs), '| רעש:', bad || '(אין)');
      const disabledBack = /ניתן לבטל מכאן|קריאה בלבד/.test(attrs?.tipDesc ?? attrs?.title ?? '');
      await app.caret(0);
      await app.type('UNLOCKED');
      await app.sleep(600);
      const afterType = await snap(app);
      const editableAgain = afterType.doc !== beforeType.doc && /UNLOCKED/.test(afterType.doc);
      log('שוב ניתן להקליד:', editableAgain, '| tooltip מרמז ביטול:', disabledBack);
      if (editableAgain && !bad)
        report.pass('הגבל עריכה — ביטול', 'ההגנה בוטלה בלי סיסמה, וההקלדה חזרה להיכנס למסמך');
      else report.fail('הגבל עריכה — ביטול', `editableAgain=${editableAgain}; רעש: ${bad || 'אין'}`);
    });
  } finally {
    app.close();
  }
}

/* ================================================================== */
/* מקטע ב' — מעקב אחר שינויים: הדלקה, קבל/דחה יחיד, קבל/דחה הכל          */
/* ================================================================== */

async function sectionTrackChanges() {
  const app = await openApp({ name: 'review-b', port: PORT });
  try {
    await widen(app);
    await app.tab('סקירה');
    await seed(app);

    let baseline;

    await step('עקוב אחר שינויים — מצב בסיס (עריכה רגילה)', async () => {
      const cmd0 = await app.cmd('document-mode');
      const st0 = await app.state('עקוב אחר שינויים');
      log('מצב בסיס:', JSON.stringify(cmd0), '| כפתור:', JSON.stringify(st0));
      if (cmd0.value !== 'suggesting' && !st0.active)
        report.pass('עקוב אחר שינויים — מצב בסיס', `document-mode=${cmd0.value}, active=${st0.active}`);
      else report.partial('עקוב אחר שינויים — מצב בסיס', `המסמך כבר במצב הצעה: ${JSON.stringify(cmd0)}`);
    });

    await step('עקוב אחר שינויים — הדלקה', async () => {
      await app.reset();
      const clicked = await app.click('עקוב אחר שינויים', { after: 800 });
      const bad = await noise(app);
      const cmd1 = await app.cmd('document-mode');
      const st1 = await app.state('עקוב אחר שינויים');
      log('נלחץ:', clicked, '| document-mode:', JSON.stringify(cmd1), '| כפתור:', JSON.stringify(st1), '| רעש:', bad || '(אין)');
      if (cmd1.value === 'suggesting' && st1.active && !bad)
        report.pass('עקוב אחר שינויים — הדלקה', 'document-mode=suggesting, active=true (chromeActiveState של המנוע מדווח false תמיד — הפקד קורא מ-value, ReviewTab.vue:99-105)');
      else report.fail('עקוב אחר שינויים — הדלקה', `mode=${JSON.stringify(cmd1)} active=${st1.active}; רעש: ${bad || 'אין'}`);
    });

    await step('הקלדה תחת מעקב נכתבת כ-<w:ins>', async () => {
      await caretLine(app, 1); // bet
      await app.press('End', 'End', 35);
      await app.sleep(200);
      await app.reset();
      await app.type('trkOne');
      await app.sleep(700);
      const bad = await noise(app);
      const after = await snap(app);
      const insMatches = after.doc.match(/<w:ins\b[^>]*>[\s\S]*?<\/w:ins>/g) ?? [];
      const hasMarker = insMatches.some((m) => m.includes('trkOne'));
      log('w:ins:', insMatches.length, '| מכיל trkOne:', hasMarker, '| רעש:', bad || '(אין)');
      baseline = { insCount: insMatches.length };
      if (hasMarker && !bad) report.pass('הקלדה תחת מעקב', `<w:ins> נכתב עם הטקסט (${insMatches.length} סה"כ במסמך)`);
      else if (hasMarker) report.partial('הקלדה תחת מעקב', `נכתב אך יש רעש: ${bad}`);
      else report.fail('הקלדה תחת מעקב', `אין <w:ins> עם trkOne. w:ins בכלל: ${insMatches.length}; רעש: ${bad || 'אין'}`);
    });

    await step('קבל שינוי — על השינוי שהוקלד', async () => {
      const before = await snap(app);
      const beforeIns = (before.doc.match(/<w:ins\b/g) ?? []).length;
      let cmdSt = await app.cmd('acceptChange');
      log('מצב הפקודה מיד אחרי ההקלדה:', JSON.stringify(cmdSt));
      // המנוע פותר את activeChangeIds באסינכרון ב-worker אחרי שהבחירה מתייצבת
      // (נמדד: reason=selection-required מיד, enabled=true אחרי ~1.5-2.5s
      // בלי אף אינטראקציה נוספת) — לא בעיית מוקד/headless (docs/engine-gaps.md
      // מדבר על activeEditor.view, לא רלוונטי כאן).
      if (cmdSt.reason === 'selection-required') {
        await app.sleep(2500);
        cmdSt = await app.cmd('acceptChange');
        log('מצב הפקודה אחרי המתנה של 2.5s:', JSON.stringify(cmdSt));
      }
      const st = await app.state('קבל שינוי');
      if (!cmdSt.enabled || st.disabled) {
        report.fail('קבל שינוי', `הפקד נשאר מנוטרל גם אחרי המתנה: cmd=${JSON.stringify(cmdSt)} ui=${JSON.stringify(st)}`);
        return;
      }
      await app.reset();
      const clicked = await app.click('קבל שינוי', { after: 1200 });
      const bad = await noise(app);
      const after = await snap(app);
      const afterIns = (after.doc.match(/<w:ins\b/g) ?? []).length;
      const stillMarked = new RegExp(`<w:ins\\b[^>]*>[\\s\\S]*?trkOne[\\s\\S]*?</w:ins>`).test(after.doc);
      const stillThere = /trkOne/.test(after.doc);
      log('נלחץ:', clicked, '| w:ins לפני/אחרי:', beforeIns, afterIns, '| trkOne עדיין מסומן:', stillMarked, '| trkOne בטקסט:', stillThere);
      log('רעש:', bad || '(אין)');
      if (afterIns < beforeIns && stillThere && !stillMarked && !bad)
        report.pass('קבל שינוי', `<w:ins> ${beforeIns}→${afterIns}; trkOne נשאר כטקסט רגיל (התקבל)`);
      else if (afterIns < beforeIns && stillThere)
        report.partial('קבל שינוי', `התקבל אך יש רעש: ${bad}`);
      else report.fail('קבל שינוי', `לא התקבל: w:ins ${beforeIns}→${afterIns}, trkOne בטקסט=${stillThere}; רעש: ${bad || 'אין'}`);
    });

    await step('דחה שינוי — על שינוי חדש', async () => {
      // ודאות שעדיין במצב מעקב (הקבלה לא אמורה לכבות אותו).
      const mode = await app.cmd('document-mode');
      log('document-mode לפני יצירת השינוי הבא:', JSON.stringify(mode));
      if (mode.value !== 'suggesting') {
        await app.click('עקוב אחר שינויים', { after: 800 });
      }
      await caretLine(app, 2); // gimel
      await app.press('End', 'End', 35);
      await app.sleep(200);
      await app.type('trkTwo');
      await app.sleep(700);
      const withChange = await snap(app);
      const hadIns = new RegExp(`<w:ins\\b[^>]*>[\\s\\S]*?trkTwo`).test(withChange.doc);
      log('trkTwo נכתב כשינוי:', hadIns);
      if (!hadIns) {
        report.fail('דחה שינוי', 'ההקלדה של trkTwo לא נכתבה כ-<w:ins> — אין מה לדחות');
        return;
      }
      let cmdSt = await app.cmd('rejectChange');
      log('מצב הפקודה מיד אחרי ההקלדה:', JSON.stringify(cmdSt));
      // אותה השהיה אסינכרונית שנמדדה ב„קבל שינוי" — הרשימה הפנימית
      // (activeChangeIds) נפתרת ב-worker כ-1.5-2.5s אחרי שהבחירה מתייצבת.
      if (cmdSt.reason === 'selection-required') {
        await app.sleep(2500);
        cmdSt = await app.cmd('rejectChange');
        log('מצב הפקודה אחרי המתנה של 2.5s:', JSON.stringify(cmdSt));
      }
      const st = await app.state('דחה שינוי');
      if (!cmdSt.enabled || st.disabled) {
        report.fail('דחה שינוי', `נשאר מנוטרל גם אחרי המתנה: cmd=${JSON.stringify(cmdSt)} ui=${JSON.stringify(st)}`);
        return;
      }
      await app.reset();
      const clicked = await app.click('דחה שינוי', { after: 1200 });
      const bad = await noise(app);
      const after = await snap(app);
      const gone = !/trkTwo/.test(after.doc);
      log('נלחץ:', clicked, '| trkTwo נעלם:', gone, '| רעש:', bad || '(אין)');
      if (gone && !bad) report.pass('דחה שינוי', 'trkTwo נעלם מה-docx לחלוטין — השינוי נדחה');
      else if (gone) report.partial('דחה שינוי', `נדחה אך יש רעש: ${bad}`);
      else report.fail('דחה שינוי', `trkTwo נשאר במסמך. רעש: ${bad || 'אין'}`);
    });

    await step('קבל את כל השינויים', async () => {
      const mode = await app.cmd('document-mode');
      if (mode.value !== 'suggesting') await app.click('עקוב אחר שינויים', { after: 800 });
      await caretLine(app, 0);
      await app.press('End', 'End', 35);
      await app.type('trkAllA');
      await app.sleep(500);
      await caretLine(app, 1);
      await app.press('End', 'End', 35);
      await app.type('trkAllB');
      await app.sleep(700);
      const before = await snap(app);
      const beforeIns = (before.doc.match(/<w:ins\b/g) ?? []).length;
      log('לפני „קבל הכל”: w:ins =', beforeIns, '| מכיל trkAllA/B:', /trkAllA/.test(before.doc), /trkAllB/.test(before.doc));
      const st = await app.state('קבל את כל השינויים');
      log('מצב הפקד:', JSON.stringify(st));
      if (st.disabled) {
        report.fail('קבל את כל השינויים', `מנוטרל: ${JSON.stringify(st)}`);
        return;
      }
      await app.reset();
      const clicked = await app.click('קבל את כל השינויים', { after: 1500 });
      const bad = await noise(app);
      const after = await snap(app);
      const afterIns = (after.doc.match(/<w:ins\b/g) ?? []).length;
      const textsRemain = /trkAllA/.test(after.doc) && /trkAllB/.test(after.doc);
      log('נלחץ:', clicked, '| w:ins אחרי:', afterIns, '| הטקסטים נשארו (כרגיל):', textsRemain, '| רעש:', bad || '(אין)');
      if (afterIns === 0 && textsRemain && !bad)
        report.pass('קבל את כל השינויים', `כל ה-<w:ins> נעלמו (${beforeIns}→0), הטקסט נשאר כרגיל`);
      else if (afterIns < beforeIns) report.partial('קבל את כל השינויים', `ירידה חלקית: ${beforeIns}→${afterIns}; רעש: ${bad || 'אין'}`);
      else report.fail('קבל את כל השינויים', `w:ins לא ירד: ${beforeIns}→${afterIns}; רעש: ${bad || 'אין'}`);
    });

    await step('דחה את כל השינויים', async () => {
      const mode = await app.cmd('document-mode');
      if (mode.value !== 'suggesting') await app.click('עקוב אחר שינויים', { after: 800 });
      await caretLine(app, 0);
      await app.press('End', 'End', 35);
      await app.type('trkRejA');
      await app.sleep(500);
      await caretLine(app, 2);
      await app.press('End', 'End', 35);
      await app.type('trkRejB');
      await app.sleep(700);
      const before = await snap(app);
      const beforeIns = (before.doc.match(/<w:ins\b/g) ?? []).length;
      log('לפני „דחה הכל”: w:ins =', beforeIns);
      const st = await app.state('דחה את כל השינויים');
      log('מצב הפקד:', JSON.stringify(st));
      if (st.disabled) {
        report.fail('דחה את כל השינויים', `מנוטרל: ${JSON.stringify(st)}`);
        return;
      }
      await app.reset();
      const clicked = await app.click('דחה את כל השינויים', { after: 1500 });
      const bad = await noise(app);
      const after = await snap(app);
      const afterIns = (after.doc.match(/<w:ins\b/g) ?? []).length;
      const gone = !/trkRejA/.test(after.doc) && !/trkRejB/.test(after.doc);
      log('נלחץ:', clicked, '| w:ins אחרי:', afterIns, '| trkRejA/B נעלמו:', gone, '| רעש:', bad || '(אין)');
      if (afterIns === 0 && gone && !bad) report.pass('דחה את כל השינויים', `כל ה-<w:ins> נעלמו וגם הטקסט (${beforeIns}→0)`);
      else if (gone) report.partial('דחה את כל השינויים', `הטקסט נעלם אך w:ins=${afterIns}; רעש: ${bad || 'אין'}`);
      else report.fail('דחה את כל השינויים', `לא נדחה. w:ins=${afterIns} textsGone=${gone}; רעש: ${bad || 'אין'}`);
    });

    await step('עקוב אחר שינויים — כיבוי', async () => {
      const mode = await app.cmd('document-mode');
      if (mode.value === 'suggesting') await app.click('עקוב אחר שינויים', { after: 800 });
      const cmd = await app.cmd('document-mode');
      const st = await app.state('עקוב אחר שינויים');
      log('אחרי כיבוי:', JSON.stringify(cmd), JSON.stringify(st));
      cmd.value !== 'suggesting' && !st.active
        ? report.pass('עקוב אחר שינויים — כיבוי', `document-mode=${cmd.value}`)
        : report.fail('עקוב אחר שינויים — כיבוי', JSON.stringify({ cmd, st }));
    });
  } finally {
    app.close();
  }
}

/* ================================================================== */
/* מקטע ג' — לשונית „תצוגה”                                             */
/* ================================================================== */

async function sectionViewTab() {
  const app = await openApp({ name: 'review-c', port: PORT });
  try {
    await widen(app);
    await seed(app);
    await app.tab('תצוגה');

    await step('סרגל', async () => {
      const before = await onScreen(app, 'סרגל');
      const domBefore = await computedDisplay(app, '.doc-ruler');
      log('מצב לפני:', JSON.stringify(before.state), '| DOM:', domBefore);
      if (!before.ok) {
        report.fail('סרגל', `לא בשימוש/מחוץ למסך: ${before.why}`);
        return;
      }
      await app.reset();
      const clicked = await app.click('סרגל', { after: 800 });
      const bad = await noise(app);
      const st1 = await app.state('סרגל');
      const domAfter = await computedDisplay(app, '.doc-ruler');
      log('נלחץ:', clicked, '| active לפני/אחרי:', before.state.active, st1.active, '| DOM לפני/אחרי:', domBefore, '→', domAfter, '| רעש:', bad || '(אין)');
      const toggled = before.state.active !== st1.active;
      const domToggled = domBefore !== domAfter && /(^|\|)none(\||$)/.test(domBefore ?? '') !== /(^|\|)none(\||$)/.test(domAfter ?? '');
      if (toggled && domToggled && !bad)
        report.pass('סרגל', `active ${before.state.active}→${st1.active}; DOM ${domBefore} → ${domAfter}`);
      else if (toggled) report.partial('סרגל', `active התהפך אך ה-DOM: ${domBefore}→${domAfter}; רעש: ${bad || 'אין'}`);
      else report.fail('סרגל', `active לא התהפך: ${before.state.active}→${st1.active}; רעש: ${bad || 'אין'}`);
      // מחזירים למצב ההתחלתי כדי לא להשפיע על שאר הבדיקות.
      if (toggled) {
        await app.reset();
        await app.click('סרגל', { after: 500 });
      }
    });

    await step('סימני עיצוב', async () => {
      const MARKS = () =>
        app
          .js(
            `JSON.stringify({dom: document.querySelectorAll('.superdoc-formatting-paragraph-mark').length,` +
              `pilcrow: (document.querySelector('.editor-stack')||document.body).textContent.split('\\u00B6').length-1})`,
          )
          .then(JSON.parse);
      const before = await onScreen(app, 'סימני עיצוב');
      if (!before.ok) {
        report.fail('סימני עיצוב', `לא בשימוש/מחוץ למסך: ${before.why}`);
        return;
      }
      const s0 = await MARKS();
      const c0 = await app.cmd('formatting-marks');
      await app.reset();
      const clicked = await app.click('סימני עיצוב', { after: 1200 });
      const bad = await noise(app);
      const s1 = await MARKS();
      const c1 = await app.cmd('formatting-marks');
      const st1 = await app.state('סימני עיצוב');
      // reflow כפוי — למקרה שהסימנים מצוירים רק בעימוד הבא (נמדד ב-home-paragraph-qa.mjs).
      await app.caret(0);
      await app.type('x');
      await app.sleep(400);
      await app.press('Backspace', 'Backspace', 8);
      await app.sleep(900);
      const sReflow = await MARKS();
      log('נלחץ:', clicked, '| DOM/pilcrow לפני/אחרי/reflow:', JSON.stringify({ s0, s1, sReflow }));
      log('cmd לפני/אחרי:', JSON.stringify(c0), JSON.stringify(c1), '| active הפקד:', st1.active, '| רעש:', bad || '(אין)');
      const engineToggled = c0.active === false && c1.active === true;
      const drawn = s1.dom > s0.dom || s1.pilcrow > s0.pilcrow || sReflow.dom > s0.dom || sReflow.pilcrow > s0.pilcrow;
      if (engineToggled && drawn && !bad)
        report.pass('סימני עיצוב', `document-mode formatting-marks: false→true, וסימנים נוספו ל-DOM/טקסט`);
      else if (engineToggled)
        report.partial(
          'סימני עיצוב',
          `הפקודה במנוע התהפכה (active ${c0.active}→${c1.active}) אך שום סימן ¶ לא צויר על המסך — תואם ממצא קודם (home-paragraph-qa.mjs, „הצג/הסתר סימני עיצוב")`,
        );
      else report.fail('סימני עיצוב', `הפקודה לא התהפכה: ${JSON.stringify({ c0, c1 })}; רעש: ${bad || 'אין'}`);
      // כיבוי בחזרה
      await app.reset();
      await app.click('סימני עיצוב', { after: 800 });
    });

    let containerPx = 0;
    let pageInches = 0;

    await step('מדידת רקע לזום (רוחב מאגס ומידות עמוד)', async () => {
      containerPx = Number(
        await app.js(`(function(){var el=document.querySelector('.editor-stack__host')||document.querySelector('.editor-stack');return el?el.clientWidth:0})()`),
      );
      const raw = await app.js(
        `(async()=>{try{const d=window.__otzariaEditor.superdoc.activeEditor.doc;const l=await d.sections.list();` +
          `const it=(l.items||[]).find(i=>i.pageSetup&&i.pageSetup.width>0);return JSON.stringify(it?it.pageSetup:null)}catch(e){return JSON.stringify({error:String(e&&e.message)})}})()`,
      );
      const pageSetup = JSON.parse(raw);
      pageInches = pageSetup?.width ?? 0;
      log('רוחב מאגס (px):', containerPx, '| רוחב עמוד (in):', pageInches, '| pageSetup:', JSON.stringify(pageSetup));
      containerPx > 0 && pageInches > 0
        ? report.pass('מדידת רקע לזום', `מאגס=${containerPx}px, עמוד=${pageInches}in`)
        : report.fail('מדידת רקע לזום', 'לא ניתן היה למדוד — הבדיקות הבאות ישתמשו בהשוואה יחסית בלבד');
    });

    await step('רוחב עמוד', async () => {
      const before = await onScreen(app, 'רוחב עמוד');
      if (!before.ok) {
        report.fail('רוחב עמוד', `לא בשימוש/מחוץ למסך: ${before.why}`);
        return;
      }
      const zoomBefore = await app.cmd('zoom');
      const pageBefore = await app.js(`(function(){var p=document.querySelector('.superdoc-page');return p?Math.round(p.getBoundingClientRect().width):0})()`);
      await app.reset();
      const clicked = await app.click('רוחב עמוד', { after: 1500 });
      const bad = await noise(app);
      const zoomAfter = await app.cmd('zoom');
      const engineZoom = await app.js(`(function(){var sd=window.__otzariaEditor.superdoc;return typeof sd.getZoomState==='function'?JSON.stringify(sd.getZoomState()):'null'})()`);
      const pageAfter = await app.js(`(function(){var p=document.querySelector('.superdoc-page');return p?Math.round(p.getBoundingClientRect().width):0})()`);
      log('נלחץ:', clicked, '| zoom לפני/אחרי:', JSON.stringify(zoomBefore), JSON.stringify(zoomAfter));
      log('getZoomState:', engineZoom, '| רוחב עמוד על המסך לפני/אחרי:', pageBefore, pageAfter, '| רעש:', bad || '(אין)');
      let expected = null;
      if (containerPx > 0 && pageInches > 0) {
        expected = Math.floor((containerPx / (pageInches * 96)) * 100);
      }
      const changed = zoomAfter.value !== 100 && zoomAfter.value !== zoomBefore.value;
      const pageChanged = pageAfter !== pageBefore;
      const closeToExpected = expected !== null ? Math.abs(zoomAfter.value - expected) <= 2 : true;
      log('אחוז צפוי מהנוסחה (fit-width.ts):', expected);
      if (changed && pageChanged && closeToExpected && !bad)
        report.pass('רוחב עמוד', `zoom → ${zoomAfter.value}% (צפוי ~${expected}%), רוחב העמוד על המסך ${pageBefore}→${pageAfter}px, שונה מ-100%`);
      else if (changed && pageChanged)
        report.partial('רוחב עמוד', `zoom=${zoomAfter.value}% (צפוי ${expected}%); רעש: ${bad || 'אין'}`);
      else report.fail('רוחב עמוד', `לא השתנה כמצופה: zoom ${JSON.stringify(zoomBefore)}→${JSON.stringify(zoomAfter)}, עמוד ${pageBefore}→${pageAfter}px; רעש: ${bad || 'אין'}`);
    });

    await step('גודל אמיתי (100%)', async () => {
      const before = await onScreen(app, 'גודל אמיתי');
      if (!before.ok) {
        report.fail('גודל אמיתי', `לא בשימוש/מחוץ למסך: ${before.why}`);
        return;
      }
      const zoomBefore = await app.cmd('zoom');
      const pageBefore = await app.js(`(function(){var p=document.querySelector('.superdoc-page');return p?Math.round(p.getBoundingClientRect().width):0})()`);
      log('zoom לפני (אמור להיות שונה מ-100 מהצעד הקודם):', JSON.stringify(zoomBefore));
      await app.reset();
      const clicked = await app.click('גודל אמיתי', { after: 1500 });
      const bad = await noise(app);
      const zoomAfter = await app.cmd('zoom');
      const engineZoom = await app.js(`(function(){var sd=window.__otzariaEditor.superdoc;return typeof sd.getZoomState==='function'?JSON.stringify(sd.getZoomState()):'null'})()`);
      const pageAfter = await app.js(`(function(){var p=document.querySelector('.superdoc-page');return p?Math.round(p.getBoundingClientRect().width):0})()`);
      log('נלחץ:', clicked, '| zoom אחרי:', JSON.stringify(zoomAfter), '| getZoomState:', engineZoom);
      log('רוחב עמוד לפני/אחרי:', pageBefore, pageAfter, '| רעש:', bad || '(אין)');
      const expectedPagePx = pageInches > 0 ? Math.round(pageInches * 96) : null;
      const pxOk = expectedPagePx === null || Math.abs(pageAfter - expectedPagePx) <= 3;
      if (zoomAfter.value === 100 && pxOk && !bad)
        report.pass('גודל אמיתי', `zoom=100%, רוחב העמוד ${pageAfter}px (צפוי ${expectedPagePx}px @96dpi)`);
      else if (zoomAfter.value === 100) report.partial('גודל אמיתי', `zoom=100% אך רוחב עמוד ${pageAfter}px≠${expectedPagePx}px; רעש: ${bad || 'אין'}`);
      else report.fail('גודל אמיתי', `zoom נשאר ${zoomAfter.value}%; רעש: ${bad || 'אין'}`);
    });

    await step('מצב מיקוד (מלשונית תצוגה)', async () => {
      const classesBefore = await shellClasses(app);
      const ribbonBefore = await computedDisplay(app, '.word-ribbon-container');
      log('מחלקות לפני:', classesBefore, '| ribbon:', ribbonBefore);
      await app.reset();
      const clicked = await app.click('מצב מיקוד', { after: 900 });
      const classesAfter = await shellClasses(app);
      const ribbonAfter = await computedDisplay(app, '.word-ribbon-container');
      const bad = await noise(app);
      log('נלחץ:', clicked, '| מחלקות אחרי:', classesAfter, '| ribbon:', ribbonAfter, '| רעש:', bad || '(אין)');
      const entered = /(^|\s)focus-mode(\s|$)/.test(classesAfter) && !/(^|\s)focus-mode(\s|$)/.test(classesBefore);
      const [, opacityAfter, pointerAfter] = (ribbonAfter ?? '').split('|');
      const hidden = opacityAfter === '0' && pointerAfter === 'none';
      if (!entered) {
        report.fail('מצב מיקוד', `המחלקה לא נכנסה: ${classesBefore} → ${classesAfter}`);
        return;
      }
      if (!hidden) {
        report.partial('מצב מיקוד', `המחלקה נכנסה אך הרצועה לא הוסתרה: ${ribbonAfter}`);
      }
      // יציאה: Escape הוא המסלול המתועד (App.vue:1207-1211).
      await app.escape();
      const classesExit = await shellClasses(app);
      const ribbonExit = await computedDisplay(app, '.word-ribbon-container');
      const exited = !/(^|\s)focus-mode(\s|$)/.test(classesExit);
      log('אחרי Escape:', classesExit, '| ribbon:', ribbonExit);
      if (entered && hidden && exited && !bad)
        report.pass('מצב מיקוד', 'focus-mode נכנס, הרצועה הוסתרה (opacity:0;pointer-events:none), Escape יצא (App.vue:1207-1211)');
      else if (entered && exited) report.partial('מצב מיקוד', `נכנס ויצא, אך הסתרת הרצועה: ${ribbonAfter}; רעש: ${bad || 'אין'}`);
      else report.fail('מצב מיקוד — יציאה', `Escape לא יצא: ${classesExit}`);
    });
  } finally {
    app.close();
  }
}

/* ================================================================== */
/* מקטע ד' — שורת המצב                                                  */
/* ================================================================== */

async function sectionStatusBar() {
  const app = await openApp({ name: 'review-d', port: PORT });
  try {
    await widen(app);
    await seed(app); // נשארים בלשונית ברירת המחדל (בית) — בלי דו-משמעות עם „מצב מיקוד” של תצוגה.

    await step('מונה עמודים ומונה מילים', async () => {
      const texts = await app.js(
        `JSON.stringify(Array.prototype.map.call(document.querySelectorAll('.status-item span'), function(s){return s.textContent}))`,
      );
      const parsed = JSON.parse(texts);
      log('פריטי שורת המצב:', JSON.stringify(parsed));
      const hasWords = parsed.some((t) => /מיל/.test(t));
      const hasPages = parsed.some((t) => /עמוד/.test(t));
      if (hasWords && hasPages) report.pass('מונה עמודים ומונה מילים', `הוצג: ${JSON.stringify(parsed)}`);
      else report.fail('מונה עמודים ומונה מילים', `חסר: ${JSON.stringify(parsed)}`);
    });

    await step('כפתור מצב מיקוד (שורת המצב)', async () => {
      const classesBefore = await shellClasses(app);
      const st0 = await app.state('מצב מיקוד');
      log('מצב בסיס:', classesBefore, '| כפתור:', JSON.stringify(st0));
      await app.reset();
      const clicked = await app.click('מצב מיקוד', { after: 900 });
      const classesAfter = await shellClasses(app);
      const bad = await noise(app);
      log('נלחץ:', clicked, '| מחלקות אחרי:', classesAfter, '| רעש:', bad || '(אין)');
      const entered = /(^|\s)focus-mode(\s|$)/.test(classesAfter);
      await app.escape();
      const classesExit = await shellClasses(app);
      const exited = !/(^|\s)focus-mode(\s|$)/.test(classesExit);
      log('אחרי Escape:', classesExit);
      if (entered && exited && !bad) report.pass('כפתור מצב מיקוד (שורת המצב)', 'נכנס ויצא כראוי');
      else report.fail('כפתור מצב מיקוד (שורת המצב)', `entered=${entered} exited=${exited}; רעש: ${bad || 'אין'}`);
    });

    await step('הקטן תצוגה (−)', async () => {
      const zoomBefore = await app.cmd('zoom');
      const sliderBefore = await app.js(`(function(){var el=document.querySelector('.zoom-slider');return el?el.value:null})()`);
      log('zoom/slider לפני:', JSON.stringify(zoomBefore), sliderBefore);
      await app.reset();
      const clicked = await app.click('הקטן תצוגה', { after: 700 });
      const bad = await noise(app);
      const zoomAfter = await app.cmd('zoom');
      const sliderAfter = await app.js(`(function(){var el=document.querySelector('.zoom-slider');return el?el.value:null})()`);
      log('נלחץ:', clicked, '| zoom/slider אחרי:', JSON.stringify(zoomAfter), sliderAfter, '| רעש:', bad || '(אין)');
      const decreased = Number(sliderAfter) === Number(sliderBefore) - 10 && zoomAfter.value === Number(sliderAfter);
      if (decreased && !bad) report.pass('הקטן תצוגה', `${sliderBefore}% → ${sliderAfter}%, מסונכרן עם המנוע`);
      else report.fail('הקטן תצוגה', `slider ${sliderBefore}→${sliderAfter}, engine zoom=${JSON.stringify(zoomAfter)}; רעש: ${bad || 'אין'}`);
    });

    await step('הגדל תצוגה (+)', async () => {
      const zoomBefore = await app.cmd('zoom');
      const sliderBefore = await app.js(`(function(){var el=document.querySelector('.zoom-slider');return el?el.value:null})()`);
      await app.reset();
      const clicked = await app.click('הגדל תצוגה', { after: 700 });
      const bad = await noise(app);
      const zoomAfter = await app.cmd('zoom');
      const sliderAfter = await app.js(`(function(){var el=document.querySelector('.zoom-slider');return el?el.value:null})()`);
      log('נלחץ:', clicked, '| slider לפני/אחרי:', sliderBefore, sliderAfter, '| zoom:', JSON.stringify(zoomAfter), '| רעש:', bad || '(אין)');
      const increased = Number(sliderAfter) === Number(sliderBefore) + 10 && zoomAfter.value === Number(sliderAfter);
      if (increased && !bad) report.pass('הגדל תצוגה', `${sliderBefore}% → ${sliderAfter}%, מסונכרן עם המנוע`);
      else report.fail('הגדל תצוגה', `slider ${sliderBefore}→${sliderAfter}, engine zoom=${JSON.stringify(zoomAfter)}; רעש: ${bad || 'אין'}`);
    });

    await step('סליידר הזום — גרירה/לחיצה על המסלול', async () => {
      const rect = (await app.state('שינוי גודל תצוגה')).rect;
      log('מלבן הסליידר:', JSON.stringify(rect));
      if (!rect) {
        report.fail('סליידר הזום', 'לא נמצא מלבן ללחיצה');
        return;
      }
      const zoomBefore = await app.cmd('zoom');
      const pageBefore = await app.js(`(function(){var p=document.querySelector('.superdoc-page');return p?Math.round(p.getBoundingClientRect().width):0})()`);
      await app.reset();
      // לחיצה קרוב לקצה ההתחלה של המסלול (בפועל תלוי בכיווניות הרינדור של ה-range).
      await app.clickAt(rect.x - Math.round(rect.w / 2) + 6, rect.y);
      await app.sleep(700);
      const bad = await noise(app);
      const zoomAfter = await app.cmd('zoom');
      const sliderAfter = await app.js(`(function(){var el=document.querySelector('.zoom-slider');return el?el.value:null})()`);
      const pageAfter = await app.js(`(function(){var p=document.querySelector('.superdoc-page');return p?Math.round(p.getBoundingClientRect().width):0})()`);
      log('zoom לפני/אחרי:', JSON.stringify(zoomBefore), JSON.stringify(zoomAfter), '| slider:', sliderAfter);
      log('רוחב עמוד לפני/אחרי:', pageBefore, pageAfter, '| רעש:', bad || '(אין)');
      const changed = zoomAfter.value !== zoomBefore.value && zoomAfter.value === Number(sliderAfter);
      const pageMoved = pageAfter !== pageBefore;
      if (changed && pageMoved && !bad)
        report.pass('סליידר הזום', `לחיצה על המסלול שינתה זום ${zoomBefore.value}%→${zoomAfter.value}%, ורוחב העמוד על המסך ${pageBefore}→${pageAfter}px`);
      else if (changed) report.partial('סליידר הזום', `הערך השתנה (${zoomBefore.value}→${zoomAfter.value}) אך רוחב העמוד לא: ${pageBefore}→${pageAfter}; רעש: ${bad || 'אין'}`);
      else report.fail('סליידר הזום', `לא השתנה: ${JSON.stringify(zoomBefore)}→${JSON.stringify(zoomAfter)}; רעש: ${bad || 'אין'}`);
    });

    await step('אפס ל-100%', async () => {
      const zoomBefore = await app.cmd('zoom');
      log('zoom לפני (אמור להיות שונה מ-100 מהצעדים הקודמים):', JSON.stringify(zoomBefore));
      await app.reset();
      const clicked = await app.click('אפס ל-100%', { after: 800 });
      const bad = await noise(app);
      const zoomAfter = await app.cmd('zoom');
      const sliderAfter = await app.js(`(function(){var el=document.querySelector('.zoom-slider');return el?el.value:null})()`);
      log('נלחץ:', clicked, '| zoom אחרי:', JSON.stringify(zoomAfter), '| slider:', sliderAfter, '| רעש:', bad || '(אין)');
      if (zoomAfter.value === 100 && Number(sliderAfter) === 100 && !bad)
        report.pass('אפס ל-100%', `zoom ${zoomBefore.value}% → 100%`);
      else report.fail('אפס ל-100%', `zoom=${JSON.stringify(zoomAfter)} slider=${sliderAfter}; רעש: ${bad || 'אין'}`);
    });
  } finally {
    app.close();
  }
}

/* ================================================================== */

const only = process.argv[2];
const sections = {
  a: sectionDisabledAndProtection,
  b: sectionTrackChanges,
  c: sectionViewTab,
  d: sectionStatusBar,
};

for (const [key, fn] of Object.entries(sections)) {
  if (only && only !== key) continue;
  await fn();
}

report.print();
process.exit(0);
