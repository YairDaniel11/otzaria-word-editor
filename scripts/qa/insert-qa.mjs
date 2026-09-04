/**
 * שער ה-QA של לשונית „הוספה”.
 *
 * כל פקד בלשונית נבדק בלחיצת עכבר אמיתית, ואחריה נקרא ה-docx המיוצא. הכלל
 * היחיד: `success: true` אינו הוכחה — מה שנכתב ל-OOXML הוא ההוכחה.
 *
 * הרצה:  node scripts/qa/insert-qa.mjs
 * היציאה 9363 שמורה לשער הזה בלבד (שערים מקבילים רצים על יציאות אחרות).
 */
import { openApp, createReport } from './harness.mjs';

const PORT = Number(process.env.QA_PORT ?? 9363);
const report = createReport('לשונית „הוספה”');

/** PNG של 1×1 — הקטן ביותר שאפשר להטמיע, ומספיק כדי לראות אם המנוע הטמיע. */
const PNG_1x1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

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

/** ממקמת סמן בפסקה לפי אינדקס `.superdoc-line` (ולא בערבוב fragment/line). */
async function caretLine(app, index) {
  const raw = await app.js(
    `(function(){var n=document.querySelectorAll('.superdoc-line')[${index}];if(!n)return 'null';` +
      `var b=n.getBoundingClientRect();return JSON.stringify({x:Math.round(b.x+10),y:Math.round(b.y+b.height/2),` +
      `right:Math.round(b.x+b.width-6)})})()`,
  );
  if (raw === 'null') throw new Error(`אין שורה ${index} במסמך`);
  const r = JSON.parse(raw);
  await app.clickAt(r.x, r.y);
  await app.sleep(500);
  return r;
}

/** בוחרת שורה שלמה בגרירה, לפי אינדקס `.superdoc-line`. */
async function selectWholeLine(app, index) {
  const r = await caretLine(app, index);
  await app.press('Home', 'Home', 36);
  await app.sleep(150);
  await app.press('End', 'End', 35, 8); // Shift+End
  await app.sleep(400);
  return r;
}

/** בונה מסמך של שלוש פסקאות עם טקסט. מחזירה את השורות שנוצרו. */
async function seed(app, words = ['alef', 'bet', 'gimel']) {
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

/** רשימת השדות שהמנוע מדווח, עם הטקסט שנפתר לכל אחד. */
const fieldsList = (app) =>
  app
    .js(
      `(async()=>{const d=window.__otzariaEditor.superdoc.activeEditor.doc;` +
        `const l=await d.fields.list({limit:200,offset:0});` +
        `return JSON.stringify((l.items||[]).map(i=>({type:i.fieldType,text:i.resolvedText,block:i.address&&i.address.blockId})))})()`,
    )
    .then(JSON.parse);

/** מספר העמודים שהמנוע צייר. */
const pageCount = (app) => app.js(`document.querySelectorAll('.superdoc-page').length`);

/** קריאת הבחירה כפי שה-Document API מדווח אותה. */
const docSelection = (app) =>
  app
    .js(
      `(async()=>{try{const d=window.__otzariaEditor.superdoc.activeEditor.doc;` +
        `return JSON.stringify(await d.selection.current({includeText:true}))}catch(e){return JSON.stringify({error:String(e&&e.message)})}})()`,
    )
    .then(JSON.parse);


/**
 * מרחיבה את חלון הבדיקה ל-1600×1000.
 *
 * חובה, ואינה נוחות: ב-headless ברירת המחדל היא ~756px, ובה `.word-ribbon-body`
 * (שהוא `overflow-x: auto`) גולש — שישה פקדים בלשונית „הוספה” יושבים ב-x שלילי.
 * לחיצה עליהם נשלחת מחוץ לחלון, שום מטפל אינו רץ, ואין שגיאה — כלומר פקד תקין
 * נמדד כ„שבור”. נמדד: „שונה בעמודים זוגיים” ב-x=-76 לפני ההרחבה, ב-x=768 אחריה.
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

/* ================================================================== */
/* מקטע א' — עמודים                                                    */
/* ================================================================== */

async function sectionPages() {
  const app = await openApp({ name: 'insert-a', port: PORT });
  try {
    await widen(app);
    await app.tab('הוספה');

    /*
     * השורה הזאת בדקה „לחיצה בלי סמן מדווחת למשתמש”, ומצב „בלי סמן” אינו
     * בר-השגה יותר: `applyDocumentStartCaret` (engine/caret-anchor.ts) מציב
     * סמן בתחילת המסמך בפתיחה, ו-`app.reset()` מנקה רק את הודעות הדמה ולא
     * את הבחירה. לכן היא מודדת עכשיו את מצב הפתיחה עצמו — שהפקד זמין מיד —
     * ואינה לוחצת: לחיצה כאן הייתה כותבת `w:pageBreakBefore` למסמך הריק,
     * והשלב הבא (שמודד את הכתיבה על הפסקה הנכונה) היה מדלג על עצמו
     * ב-`wasBefore`.
     */
    await step('פתיחה עם סמן — הפקד זמין מיד', async () => {
      await app.reset();
      const st = await app.state('התחל בעמוד חדש');
      log('מצב הכפתור בפתיחה:', JSON.stringify(st));
      st.found && !st.disabled
        ? report.pass('פתיחה עם סמן — הפקד זמין מיד', JSON.stringify(st))
        : report.fail('פתיחה עם סמן — הפקד זמין מיד', `לא נמצא או מושבת: ${JSON.stringify(st)}`);
    });

    await seed(app);
    log('טקסט במסמך:', JSON.stringify(await app.screenText()));

    await step('התחל בעמוד חדש', async () => {
      await caretLine(app, 1); // הפסקה השנייה
      const sel = await docSelection(app);
      log('בחירה:', JSON.stringify(sel.target));
      const before = await snap(app);
      const pagesBefore = await pageCount(app);
      await app.reset();
      const clicked = await app.click('התחל בעמוד חדש', { after: 2500 });
      const bad = await noise(app);
      const after = await snap(app);
      const pagesAfter = await pageCount(app);
      const paras = after.doc.match(/<w:p [^>]*>[\s\S]*?<\/w:p>/g) ?? [];
      const marked = paras
        .map((p, i) => ({ i, pbb: /<w:pageBreakBefore\/>/.test(p), text: (p.match(/<w:t[^>]*>([^<]*)</) ?? [])[1] }))
        .filter((p) => p.pbb);
      log('נלחץ:', clicked, '| עמודים:', pagesBefore, '→', pagesAfter);
      log('פסקאות עם pageBreakBefore:', JSON.stringify(marked));
      log('רעש:', bad || '(אין)');
      const wasBefore = /<w:pageBreakBefore\/>/.test(before.doc);
      const st = await app.state('התחל בעמוד חדש');
      log('מצב הכפתור אחרי ההפעלה:', JSON.stringify(st));
      const shownActive = st.active === true || st.pressed === 'true';
      if (!clicked) report.fail('התחל בעמוד חדש', 'הכפתור לא נמצא');
      else if (wasBefore) report.skip('התחל בעמוד חדש', 'המסמך כבר הכיל pageBreakBefore');
      else if (marked.length === 1 && marked[0].text === 'bet' && !bad && shownActive)
        report.pass(
          'התחל בעמוד חדש',
          `w:pageBreakBefore על הפסקה הנכונה; עמודים ${pagesBefore}→${pagesAfter}; הכפתור מציג „פעיל”`,
        );
      else if (marked.length === 1 && marked[0].text === 'bet' && !bad)
        report.partial('התחל בעמוד חדש', `w:pageBreakBefore נכתב, אך הכפתור אינו מציג „פעיל” (${JSON.stringify(st)})`);
      else if (marked.length)
        report.partial('התחל בעמוד חדש', `נכתב על ${JSON.stringify(marked)}; רעש: ${bad || 'אין'}`);
      else report.fail('התחל בעמוד חדש', `לא נכתב pageBreakBefore. רעש: ${bad || 'אין'}`);
    });

    /*
     * מכאן ואילך המתג הוא אמיתי (תוקן: docs/button-audit.md, שורה ד'). הפסקה
     * „bet” כבר מסומנת מהצעד שמעל — הצעד הזה בודק שלחיצה שנייה **מכבה**
     * בפועל (מסירה את w:pageBreakBefore מה-DOCX המיוצא, לא רק state פנימי),
     * ושהכפתור חוזר להציג „לא פעיל”. זה בדיוק ההפך מ-NO_OP: לפני התיקון
     * לחיצה שנייה הייתה שולחת שוב `pageBreakBefore:true` (NO_OP שקט), ולא
     * הייתה שום דרך לכבות מהרצועה.
     */
    await step('התחל בעמוד חדש — לחיצה שנייה מכבה (הביטול)', async () => {
      await caretLine(app, 1); // אותה פסקה, „bet" — הסמן עשוי לזוז בין צעדים
      const before = await snap(app);
      const wasMarked = /<w:pageBreakBefore\/>/.test(
        (before.doc.match(/<w:p [^>]*>[\s\S]*?<\/w:p>/g) ?? []).find((p) => /<w:t[^>]*>bet</.test(p)) ?? '',
      );
      await app.reset();
      const clicked = await app.click('התחל בעמוד חדש', { after: 2000 });
      const bad = await noise(app);
      const after = await snap(app);
      const st = await app.state('התחל בעמוד חדש');
      const betPara = (after.doc.match(/<w:p [^>]*>[\s\S]*?<\/w:p>/g) ?? []).find((p) => /<w:t[^>]*>bet</.test(p)) ?? '';
      const stillMarked = /<w:pageBreakBefore\/>/.test(betPara);
      const shownActive = st.active === true || st.pressed === 'true';
      log('היה מסומן:', wasMarked, '| נשאר מסומן אחרי הלחיצה:', stillMarked, '| מצב הכפתור:', JSON.stringify(st));
      log('רעש:', bad || '(אין)');
      if (!clicked) report.fail('התחל בעמוד חדש — ביטול', 'הכפתור לא נמצא');
      else if (!wasMarked) report.skip('התחל בעמוד חדש — ביטול', 'הפסקה לא הייתה מסומנת מלכתחילה');
      else if (!stillMarked && !shownActive && !bad)
        report.pass('התחל בעמוד חדש — ביטול', 'w:pageBreakBefore הוסר מה-DOCX, והכפתור חזר ל„לא פעיל”');
      else if (!stillMarked)
        report.partial('התחל בעמוד חדש — ביטול', `הוסר מה-DOCX, אך מצב הכפתור: ${JSON.stringify(st)}; רעש: ${bad || 'אין'}`);
      else report.fail('התחל בעמוד חדש — ביטול', `w:pageBreakBefore עדיין ב-DOCX. רעש: ${bad || 'אין'}`);
    });

    await step('התחל בעמוד חדש — פסקה ראשונה (מה שנראה כ„לא עובד”)', async () => {
      // המשתמש דיווח שהפקד אינו עובד. זה המסלול שנראה כך: הפסקה הראשונה כבר
      // בראש עמוד, ולכן ה-XML משתנה ועל המסך לא קורה **כלום**.
      await caretLine(app, 0);
      const pagesBefore = await pageCount(app);
      const before = await snap(app);
      await app.reset();
      await app.click('התחל בעמוד חדש', { after: 2500 });
      const bad = await noise(app);
      const after = await snap(app);
      const pagesAfter = await pageCount(app);
      const first = (after.doc.match(/<w:p [^>]*>[\s\S]*?<\/w:p>/g) ?? [])[0] ?? '';
      const marked = /<w:pageBreakBefore\/>/.test(first);
      log('עמודים:', pagesBefore, '→', pagesAfter, '| pageBreakBefore על הפסקה הראשונה:', marked);
      log('רעש:', bad || '(אין)');
      if (marked && pagesAfter === pagesBefore && !bad)
        report.partial(
          'התחל בעמוד חדש — פסקה ראשונה',
          'ה-XML נכתב אך על המסך לא משתנה דבר (הפסקה כבר בראש עמוד) — נראה למשתמש כ„לא עובד”',
        );
      else if (marked) report.pass('התחל בעמוד חדש — פסקה ראשונה', `עמודים ${pagesBefore}→${pagesAfter}`);
      else report.fail('התחל בעמוד חדש — פסקה ראשונה', `לא נכתב. רעש: ${bad || 'אין'}`);
    });

    await step('התחל בעמוד חדש — פסקה ראשונה, גם היא ניתנת לכיבוי', async () => {
      // אותו round-trip כמו „bet" למעלה, על פסקה שנייה ובלתי-תלויה — מוודא
      // שהמעקב הוא לפי nodeId ולא דגל בודד שהיה מתבלבל בין שתי הפסקאות.
      await caretLine(app, 0);
      await app.reset();
      const clicked = await app.click('התחל בעמוד חדש', { after: 2000 });
      const bad = await noise(app);
      const after = await snap(app);
      const st = await app.state('התחל בעמוד חדש');
      const first = (after.doc.match(/<w:p [^>]*>[\s\S]*?<\/w:p>/g) ?? [])[0] ?? '';
      const stillMarked = /<w:pageBreakBefore\/>/.test(first);
      const shownActive = st.active === true || st.pressed === 'true';
      log('נלחץ:', clicked, '| נשאר מסומן:', stillMarked, '| מצב הכפתור:', JSON.stringify(st));
      log('רעש:', bad || '(אין)');
      if (!clicked) report.fail('התחל בעמוד חדש — כיבוי פסקה ראשונה', 'הכפתור לא נמצא');
      else if (!stillMarked && !shownActive && !bad)
        report.pass('התחל בעמוד חדש — כיבוי פסקה ראשונה', 'w:pageBreakBefore הוסר, והכפתור חזר ל„לא פעיל”');
      else if (!stillMarked)
        report.partial('התחל בעמוד חדש — כיבוי פסקה ראשונה', `הוסר, אך מצב הכפתור: ${JSON.stringify(st)}`);
      else report.fail('התחל בעמוד חדש — כיבוי פסקה ראשונה', `w:pageBreakBefore עדיין קיים. רעש: ${bad || 'אין'}`);
    });

    /*
     * ממצא QA שני, כמעט אחרון בסדר בכוונה: forgetAll (הפתרון) מוחקת את **כל**
     * המעקב, לא רק את הפסקה שה-Undo נגע בה — ולכן הצעד הזה חייב לרוץ אחרי
     * כל שאר הבדיקות בסעיף, לא ביניהן (הן נשענות על מעקב שנשאר תקף על
     * "alef"/"bet" בין צעד לצעד). Ctrl+Z יכול לשנות pageBreakBefore בלי
     * לעבור דרך הכפתור בכלל, ו-createShortcutDispatcher מדלג על אירוע
     * defaultPrevented — כלומר runCommand('undo') שלנו לא רץ כש-ProseMirror
     * כבר טיפל ב-Ctrl+Z בעצמו (נמדד). watchUndoRedoKeys (capture, לפני
     * המנוע) הוא הפתרון. הצעד הזה בודק את זה בדפדפן אמיתי, לא רק ביחידה —
     * וממשיך ישר ל-Redo (ממצא QA שלישי, פער 1): forgetAllKeepingSnapshot/
     * restoreSnapshot אמורים להחזיר בדיוק את מה ש-Undo הסיר.
     */
    await step('התחל בעמוד חדש — Ctrl+Z מנקה, Ctrl+Shift+Z מחזיר', async () => {
      await caretLine(app, 1); // "bet"
      await app.reset();
      await app.click('התחל בעמוד חדש', { after: 2000 });
      const afterMark = await snap(app);
      const betBefore = (afterMark.doc.match(/<w:p [^>]*>[\s\S]*?<\/w:p>/g) ?? []).find((p) => /<w:t[^>]*>bet</.test(p)) ?? '';
      const markedBefore = /<w:pageBreakBefore\/>/.test(betBefore);
      const stBefore = await app.state('התחל בעמוד חדש');

      await app.press('z', 'KeyZ', 90, 2); // Ctrl+Z. modifiers=2 הוא הביט של Ctrl ב-CDP.
      await app.sleep(1000);

      const afterUndo = await snap(app);
      const badUndo = await noise(app);
      const betAfterUndo = (afterUndo.doc.match(/<w:p [^>]*>[\s\S]*?<\/w:p>/g) ?? []).find((p) => /<w:t[^>]*>bet</.test(p)) ?? '';
      const stillMarked = /<w:pageBreakBefore\/>/.test(betAfterUndo);
      const stAfterUndo = await app.state('התחל בעמוד חדש');
      const shownActiveAfterUndo = stAfterUndo.active === true || stAfterUndo.pressed === 'true';
      log('מסומן לפני Undo:', markedBefore, '| מצב לפני:', JSON.stringify(stBefore));
      log('נשאר מסומן אחרי Undo:', stillMarked, '| מצב אחרי Undo:', JSON.stringify(stAfterUndo));
      log('רעש (Undo):', badUndo || '(אין)');
      if (!markedBefore) {
        report.skip('Ctrl+Z מנקה חיווי', 'הפסקה לא הייתה מסומנת מלכתחילה');
        report.skip('Ctrl+Shift+Z מחזיר חיווי', 'Undo לא רץ — אין מה לבדוק ב-Redo');
        return;
      }
      if (stillMarked) {
        report.skip('Ctrl+Z מנקה חיווי', 'Undo לא הסיר את w:pageBreakBefore — לא ניתן למדוד');
        report.skip('Ctrl+Shift+Z מחזיר חיווי', 'Undo לא רץ — אין מה לבדוק ב-Redo');
        return;
      }
      if (!shownActiveAfterUndo && !badUndo)
        report.pass('Ctrl+Z מנקה חיווי', 'w:pageBreakBefore הוסר ב-Undo, והכפתור אינו נשאר תקוע על „פעיל”');
      else
        report.fail(
          'Ctrl+Z מנקה חיווי',
          `w:pageBreakBefore הוסר ב-Undo, אך הכפתור עדיין מציג „פעיל”: ${JSON.stringify(stAfterUndo)}; רעש: ${badUndo || 'אין'}`,
        );

      await app.press('z', 'KeyZ', 90, 10); // Ctrl+Shift+Z. modifiers=2(Ctrl)+8(Shift)=10.
      await app.sleep(1000);

      const afterRedo = await snap(app);
      const badRedo = await noise(app);
      const betAfterRedo = (afterRedo.doc.match(/<w:p [^>]*>[\s\S]*?<\/w:p>/g) ?? []).find((p) => /<w:t[^>]*>bet</.test(p)) ?? '';
      const markedAgain = /<w:pageBreakBefore\/>/.test(betAfterRedo);
      const stAfterRedo = await app.state('התחל בעמוד חדש');
      const shownActiveAfterRedo = stAfterRedo.active === true || stAfterRedo.pressed === 'true';
      log('מסומן מחדש אחרי Redo:', markedAgain, '| מצב אחרי Redo:', JSON.stringify(stAfterRedo));
      log('רעש (Redo):', badRedo || '(אין)');
      if (!markedAgain)
        report.fail('Ctrl+Shift+Z מחזיר חיווי', `Redo לא החזיר את w:pageBreakBefore. רעש: ${badRedo || 'אין'}`);
      else if (shownActiveAfterRedo && !badRedo)
        report.pass('Ctrl+Shift+Z מחזיר חיווי', 'w:pageBreakBefore חזר ב-Redo, והכפתור מציג „פעיל” — לא נשאר תקוע על „לא פעיל”');
      else
        report.fail(
          'Ctrl+Shift+Z מחזיר חיווי',
          `w:pageBreakBefore חזר ב-Redo, אך הכפתור לא מציג „פעיל”: ${JSON.stringify(stAfterRedo)}; רעש: ${badRedo || 'אין'}`,
        );
    });

    /*
     * ממצא QA שלישי, פער 2, ואחרון בסדר מאותה סיבה כמו הצעד שמעל (forgetAll
     * הוא ניקוי גורף). watchUndoRedoKeys תפס בעבר כל keydown תואם ב-window
     * בלי לבדוק event.target — כלומר Ctrl+Z בתוך שדה טקסט לא-קשור (כאן:
     * #fr-search-input בדיאלוג חיפוש-והחלפה) ניקה את המעקב בטעות. isBlocked
     * הוא הפתרון. הפסקה "bet" עדיין מסומנת מהצעד שמעל (הסתיים ב-Redo).
     */
    await step('התחל בעמוד חדש — Ctrl+Z בשדה חיפוש אינו נוגע בחיווי', async () => {
      const stBefore = await app.state('התחל בעמוד חדש');
      const wasActive = stBefore.active === true || stBefore.pressed === 'true';

      await app.tab('בית');
      const openedFind = await app.click('חפש', { after: 600 });
      if (!openedFind) {
        report.fail('Ctrl+Z בשדה חיפוש', 'כפתור "חפש" לא נמצא — לא ניתן למדוד');
        return;
      }
      await app.js(
        `(function(){var el=document.querySelector('#fr-search-input');if(el)el.focus();})()`,
      );
      await app.sleep(300);
      const focused = await app.js(
        `document.activeElement && document.activeElement.id === 'fr-search-input'`,
      );

      await app.press('z', 'KeyZ', 90, 2); // Ctrl+Z, בפוקוס על שדה החיפוש.
      await app.sleep(800);

      const bad = await noise(app);
      // סוגרים את הדיאלוג וחוזרים ל"הוספה" **לפני** קריאת מצב הכפתור: הוא
      // בכלל לא ב-DOM כשלשונית "בית" פעילה (רק הלשונית הפעילה מורכבת) —
      // קריאה לפני החזרה הייתה תמיד מודדת {found:false}, לא את המעקב עצמו.
      await app.escape();
      await app.tab('הוספה');
      await app.sleep(300);
      const stAfter = await app.state('התחל בעמוד חדש');
      const stillActive = stAfter.active === true || stAfter.pressed === 'true';

      log('פוקוס בשדה החיפוש:', focused, '| היה פעיל:', wasActive, '| נשאר פעיל:', stillActive);
      log('רעש:', bad || '(אין)');
      if (!focused) report.skip('Ctrl+Z בשדה חיפוש', 'הפוקוס לא הגיע לשדה החיפוש — לא ניתן למדוד');
      else if (!wasActive) report.skip('Ctrl+Z בשדה חיפוש', 'הפסקה לא הייתה מסומנת לפני הבדיקה');
      else if (stillActive && !bad)
        report.pass('Ctrl+Z בשדה חיפוש', 'הכפתור נשאר "פעיל" — Ctrl+Z בשדה לא-קשור לא ניקה את המעקב');
      else
        report.fail('Ctrl+Z בשדה חיפוש', `הכפתור הפסיק להציג "פעיל" (${JSON.stringify(stAfter)}); רעש: ${bad || 'אין'}`);
    });
  } finally {
    app.close();
  }
}

/* ================================================================== */
/* מקטע ב' — טבלה, תמונה, קישור, סימנייה                                */
/* ================================================================== */

async function sectionInserts() {
  const app = await openApp({ name: 'insert-b', port: PORT });
  try {
    await widen(app);
    await app.tab('הוספה');
    await seed(app);

    await step('טבלה', async () => {
      await caretLine(app, 2);
      const before = await snap(app);
      await app.reset();
      const opened = await app.click('טבלה', { after: 600 });
      const popover = await app.exists('.table-picker-popover');
      log('נפתח הבורר:', opened, popover);
      const cells = await app.js(`document.querySelectorAll('.table-picker-popover .grid-cell').length`);
      log('תאים בגריד:', cells);
      const picked = await app.clickTableCell(2, 3, { after: 2500 });
      log('נבחר 2×3:', picked);
      const bad = await noise(app);
      const after = await snap(app);
      const tables = (after.doc.match(/<w:tbl>/g) ?? []).length;
      const gridCols = (after.doc.match(/<w:gridCol\b/g) ?? []).length;
      const rows = (after.doc.match(/<w:tr\b/g) ?? []).length;
      log('טבלאות:', tables, '| gridCol:', gridCols, '| tr:', rows, '| רעש:', bad || '(אין)');
      const had = (before.doc.match(/<w:tbl>/g) ?? []).length;
      if (!opened || !popover) report.fail('טבלה', 'בורר הגריד לא נפתח');
      else if (tables > had && gridCols === 3 && rows === 2 && !bad)
        report.pass('טבלה', 'w:tbl עם 3 עמודות ו-2 שורות');
      else if (tables > had) report.partial('טבלה', `נוספה טבלה אך המידות ${rows}×${gridCols}; רעש: ${bad || 'אין'}`);
      else report.fail('טבלה', `לא נוספה טבלה. רעש: ${bad || 'אין'}`);
    });

    await step('תמונות', async () => {
      await caretLine(app, 0);
      await app.js(
        `window.__qaHost.replies['fs.pickUserFile'] = function(){return Promise.resolve({success:true,error:null,data:{` +
          `token:'qa-token',url:'data:image/png;base64,${PNG_1x1}',name:'qa.png',size:70,access:'read'}})}`,
      );
      const before = await snap(app);
      await app.reset();
      const clicked = await app.click('תמונות', { after: 3500 });
      const calls = await app.hostCalls();
      log('נלחץ:', clicked, '| קריאות למאחז:', JSON.stringify(calls.map((c) => c.method)));
      const bad = await noise(app);
      log('רעש:', bad || '(אין)');
      log('messages:', JSON.stringify(await app.messages()));
      const after = await snap(app);
      const drawings = (after.doc.match(/<w:drawing>/g) ?? []).length;
      const media = after.names.filter((n) => n.startsWith('word/media/'));
      log('drawing:', drawings, '| media:', JSON.stringify(media));
      const picked = calls.some((c) => c.method === 'fs.pickUserFile');
      const hadDrawing = (before.doc.match(/<w:drawing>/g) ?? []).length;
      if (!clicked) report.fail('תמונות', 'הכפתור לא נמצא');
      else if (drawings > hadDrawing && !bad) report.pass('תמונות', `w:drawing נוסף; media=${media.join(',')}`);
      else if (picked)
        report.fail('תמונות', `בורר הקבצים נקרא אך לא נוספה תמונה (drawing=${drawings}); ${bad || 'בלי שגיאה'}`);
      else report.fail('תמונות', `הכפתור לא קרא ל-fs.pickUserFile. קריאות: ${calls.map((c) => c.method).join(',')}`);
    });

    await step('קישור — מנוטרל בלי בחירה', async () => {
      await caretLine(app, 0);
      const st = await app.state('קישור');
      const cmd = await app.cmd('link');
      log('מצב „קישור” עם סמן בלבד:', JSON.stringify(st), JSON.stringify(cmd));
      st.disabled
        ? report.partial('קישור — סמן בלבד', `מנוטרל (${cmd.reason}); ב-Word הוא פעיל ומכניס טקסט חדש`)
        : report.pass('קישור — סמן בלבד', 'פעיל');
    });

    await step('קישור', async () => {
      await selectWholeLine(app, 0);
      const sel = await docSelection(app);
      log('בחירה:', JSON.stringify(sel.target), 'טקסט:', JSON.stringify(sel.text));
      const st = await app.state('קישור');
      log('מצב הכפתור:', JSON.stringify(st));
      const before = await snap(app);
      await app.reset();
      const clicked = await app.click('קישור', { after: 800 });
      const dlg = await app.dialog();
      log('נלחץ:', clicked, '| דיאלוג:', JSON.stringify(dlg));
      if (!dlg) {
        report.fail('קישור', `הדיאלוג לא נפתח (הכפתור מנוטרל=${st.disabled})`);
        return;
      }
      log('מילוי כתובת:', await app.dialogFill('ld-href-input', 'https://example.org/qa'));
      await app.sleep(300);
      const dlg2 = await app.dialog();
      log('אחרי המילוי:', JSON.stringify(dlg2.controls.map((c) => ({ id: c.id, value: c.value, disabled: c.disabled }))));
      const ok = await app.clickDialog('הוסף קישור', { after: 2500 });
      log('אושר:', ok);
      const bad = await noise(app);
      const after = await snap(app);
      const links = (after.doc.match(/<w:hyperlink\b/g) ?? []).length;
      const rels = after.files['word/_rels/document.xml.rels'] ?? '';
      log('w:hyperlink:', links, '| יעד ב-rels:', /example\.org/.test(rels));
      log('רעש:', bad || '(אין)');
      const had = (before.doc.match(/<w:hyperlink\b/g) ?? []).length;
      if (links > had && /example\.org/.test(rels) && !bad)
        report.pass('קישור', 'w:hyperlink + יעד ב-document.xml.rels');
      else if (links > had) report.partial('קישור', `נוסף w:hyperlink אך: ${bad || 'אין יעד ב-rels'}`);
      else report.fail('קישור', `לא נכתב w:hyperlink. רעש: ${bad || 'אין'}`);
    });

    await step('הסר קישור', async () => {
      await selectWholeLine(app, 0);
      const before = await snap(app);
      const had = (before.doc.match(/<w:hyperlink\b/g) ?? []).length;
      await app.reset();
      const clicked = await app.click('הסר קישור', { after: 2500 });
      const bad = await noise(app);
      const after = await snap(app);
      const links = (after.doc.match(/<w:hyperlink\b/g) ?? []).length;
      log('נלחץ:', clicked, '| w:hyperlink לפני/אחרי:', had, links, '| רעש:', bad || '(אין)');
      log('messages:', JSON.stringify(await app.messages()));
      if (had === 0) report.skip('הסר קישור', 'לא היה קישור להסיר');
      else if (links < had && !bad) report.pass('הסר קישור', `${had}→${links}`);
      else report.fail('הסר קישור', `w:hyperlink נשאר ${links}. רעש: ${bad || 'אין'}`);
    });

    await step('הסר קישור — הצורה שבחוזה', async () => {
      // אבחון בלבד: מוכיח שהמנוע **כן** מסיר, וששורש הכשל הוא צורת הקלט.
      const probe = await app.js(
        `(async()=>{const d=window.__otzariaEditor.superdoc.activeEditor.doc;` +
          `const l=await d.hyperlinks.list();const it=(l.items||[])[0];` +
          `if(!it)return JSON.stringify({noLink:true});` +
          `let asIs,proper;` +
          `const s=await d.selection.current();const g=s.target&&s.target.segments&&s.target.segments[0];` +
          `try{asIs=await d.hyperlinks.remove({within:{kind:'text',blockId:g.blockId,range:g.range}})}catch(e){asIs='threw:'+e.message}` +
          `try{proper=await d.hyperlinks.remove({target:it.address})}catch(e){proper='threw:'+e.message}` +
          `return JSON.stringify({address:it.address,asIs,proper})})()`,
      );
      log('בדיקת צורות הקלט:', probe);
      const after = await snap(app);
      const left = (after.doc.match(/<w:hyperlink\b/g) ?? []).length;
      log('w:hyperlink אחרי הקריאה בצורת החוזה:', left);
      const parsed = JSON.parse(probe);
      if (parsed.noLink) report.skip('הסר קישור — שורש', 'לא נותר קישור לבדוק עליו');
      else if (String(parsed.asIs).includes('threw') && parsed.proper?.success === true)
        report.pass(
          'הסר קישור — שורש הכשל אותר',
          `remove({within}) זורק; remove({target}) מצליח ומסיר (נשארו ${left})`,
        );
      else report.skip('הסר קישור — שורש', probe.slice(0, 200));
    });

    await step('סימנייה', async () => {
      await caretLine(app, 1);
      await app.reset();
      const clicked = await app.click('סימנייה', { after: 1200 });
      const dlg = await app.dialog();
      log('נלחץ:', clicked, '| דיאלוג:', JSON.stringify(dlg && { label: dlg.label, controls: dlg.controls.map((c) => c.id || c.text) }));
      if (!dlg) {
        report.fail('סימנייה', 'הדיאלוג לא נפתח');
        return;
      }
      log('מילוי שם:', await app.dialogFill('bd-name-input', 'סימן_בדיקה'));
      await app.sleep(300);
      const okAdd = await app.clickDialog('הוסף', { after: 2500 });
      log('נלחץ „הוסף”:', okAdd);
      const bad = await noise(app);
      const after = await snap(app);
      const marks = after.doc.match(/<w:bookmarkStart[^>]*w:name="([^"]*)"/g) ?? [];
      log('bookmarkStart:', JSON.stringify(marks), '| רעש:', bad || '(אין)');
      const inDialog = await app.dialog();
      log('הרשימה בדיאלוג אחרי ההוספה:', JSON.stringify(inDialog?.controls.filter((c) => c.tag === 'button').map((c) => c.text)));
      if (marks.some((m) => /סימן_בדיקה/.test(m)) && !bad) report.pass('סימנייה', 'w:bookmarkStart בשם שנבחר');
      else report.fail('סימנייה', `לא נכתבה סימנייה (${JSON.stringify(marks)}). רעש: ${bad || 'אין'}`);

      // שינוי שם ומחיקה, כשהדיאלוג עדיין פתוח
      await app.clickSel('.bd-list-item', 0, { after: 400 });
      await app.dialogFill('bd-name-input', 'סימן_חדש');
      await app.sleep(200);
      await app.reset();
      const renamed = await app.clickDialog('שנה שם', { after: 2000 });
      const afterRename = await snap(app);
      const renamedOk = /w:name="סימן_חדש"/.test(afterRename.doc);
      log('שונה שם:', renamed, '| נמצא סימן_חדש:', renamedOk, '| רעש:', (await noise(app)) || '(אין)');
      renamedOk ? report.pass('סימנייה — שינוי שם') : report.fail('סימנייה — שינוי שם', 'השם לא השתנה ב-OOXML');

      await app.clickSel('.bd-list-item', 0, { after: 400 });
      await app.reset();
      await app.clickDialog('מחק', { after: 2000 });
      const afterRemove = await snap(app);
      const gone = !/w:name="סימן_חדש"/.test(afterRemove.doc);
      log('נמחק:', gone, '| רעש:', (await noise(app)) || '(אין)');
      gone ? report.pass('סימנייה — מחיקה') : report.fail('סימנייה — מחיקה', 'הסימנייה נשארה ב-OOXML');
      await app.clickDialog('סגור', { after: 500 });
    });
  } finally {
    app.close();
  }
}

/* ================================================================== */
/* מקטע ג' — כותרות עליונות ותחתונות                                    */
/* ================================================================== */

async function sectionHeaderFooter() {
  const app = await openApp({ name: 'insert-c', port: PORT });
  try {
    await widen(app);
    await app.tab('הוספה');
    await seed(app);
    await caretLine(app, 0);

    await step('כותרת עליונה — תפריט', async () => {
      const items = await app.openMenu('כותרת עליונה');
      log('פריטים:', JSON.stringify(items));
      if (!items?.length) {
        report.fail('כותרת עליונה — תפריט', 'התפריט לא נפתח');
        return;
      }
      await app.reset();
      const ok = await app.clickMenu('עריכת כותרת עליונה', { after: 2500 });
      const bad = await noise(app);
      const after = await snap(app);
      const hasFile = after.names.some((n) => /^word\/header\d+\.xml$/.test(n));
      const ref = /<w:headerReference/.test(after.doc);
      log('נלחץ:', ok, '| קובץ כותרת:', hasFile, '| headerReference:', ref);
      log('קבצים:', after.names.filter((n) => /header|footer/.test(n)).join(', '));
      log('רעש:', bad || '(אין)');
      if (hasFile && ref && !bad) report.pass('כותרת עליונה — עריכה', 'header?.xml + headerReference ב-sectPr');
      else report.fail('כותרת עליונה — עריכה', `header=${hasFile} ref=${ref}; רעש: ${bad || 'אין'}`);
    });

    await step('כותרת תחתונה — תפריט', async () => {
      const items = await app.openMenu('כותרת תחתונה');
      log('פריטים:', JSON.stringify(items));
      await app.reset();
      const ok = await app.clickMenu('עריכת כותרת תחתונה', { after: 2500 });
      const bad = await noise(app);
      const after = await snap(app);
      const hasFile = after.names.some((n) => /^word\/footer\d+\.xml$/.test(n));
      const ref = /<w:footerReference/.test(after.doc);
      log('נלחץ:', ok, '| קובץ:', hasFile, '| footerReference:', ref, '| רעש:', bad || '(אין)');
      if (hasFile && ref && !bad) report.pass('כותרת תחתונה — עריכה', 'footer?.xml + footerReference');
      else report.fail('כותרת תחתונה — עריכה', `footer=${hasFile} ref=${ref}; רעש: ${bad || 'אין'}`);
    });

    await step('שונה בעמוד ראשון', async () => {
      const st0 = await app.state('שונה בעמוד ראשון');
      await app.reset();
      const clicked = await app.click('שונה בעמוד ראשון', { after: 2500 });
      const bad = await noise(app);
      const after = await snap(app);
      const st1 = await app.state('שונה בעמוד ראשון');
      const titlePg = /<w:titlePg\/>/.test(after.doc);
      log('נלחץ:', clicked, '| titlePg:', titlePg, '| active לפני/אחרי:', st0.active, st1.active, '| רעש:', bad || '(אין)');
      if (titlePg && st1.active && !bad) report.pass('שונה בעמוד ראשון', 'w:titlePg + המתג נדלק');
      else if (titlePg) report.partial('שונה בעמוד ראשון', `w:titlePg נכתב אך active=${st1.active}; ${bad || ''}`);
      else report.fail('שונה בעמוד ראשון', `אין w:titlePg. רעש: ${bad || 'אין'}`);

      // כיבוי
      await app.reset();
      await app.click('שונה בעמוד ראשון', { after: 2500 });
      const off = await snap(app);
      const st2 = await app.state('שונה בעמוד ראשון');
      const gone = !/<w:titlePg\/>/.test(off.doc);
      log('כיבוי — titlePg הוסר:', gone, '| active:', st2.active);
      gone && !st2.active
        ? report.pass('שונה בעמוד ראשון — כיבוי')
        : report.fail('שונה בעמוד ראשון — כיבוי', `titlePg נשאר=${!gone} active=${st2.active}`);
    });

    await step('שונה בעמודים זוגיים ואי-זוגיים', async () => {
      log('מיקום הפקד:', JSON.stringify(await onScreen(app, 'שונה בעמודים זוגיים ואי-זוגיים')));
      await app.reset();
      const clicked = await app.click('שונה בעמודים זוגיים ואי-זוגיים', { after: 2500 });
      const bad = await noise(app);
      const after = await snap(app);
      const settings = after.files['word/settings.xml'] ?? '';
      const on = /<w:evenAndOddHeaders/.test(settings);
      const st = await app.state('שונה בעמודים זוגיים ואי-זוגיים');
      log('נלחץ:', clicked, '| evenAndOddHeaders:', on, '| active:', st.active, '| רעש:', bad || '(אין)');
      if (on && st.active && !bad) report.pass('שונה בעמודים זוגיים ואי-זוגיים', 'w:evenAndOddHeaders ב-settings.xml');
      else if (on) report.partial('שונה בעמודים זוגיים ואי-זוגיים', `נכתב אך active=${st.active}; ${bad || ''}`);
      else report.fail('שונה בעמודים זוגיים ואי-זוגיים', `אין evenAndOddHeaders. רעש: ${bad || 'אין'}`);

      await app.reset();
      await app.click('שונה בעמודים זוגיים ואי-זוגיים', { after: 2500 });
      const off = await snap(app);
      const gone = !/<w:evenAndOddHeaders/.test(off.files['word/settings.xml'] ?? '');
      log('כיבוי — הוסר:', gone);
      gone ? report.pass('שונה בעמודים זוגיים — כיבוי') : report.fail('שונה בעמודים זוגיים — כיבוי', 'נשאר ב-settings.xml');
    });

    await step('קשר לקודם', async () => {
      const st = await app.state('קשר לקודם');
      const sections = await app.js(
        `(async()=>{const d=window.__otzariaEditor.superdoc.activeEditor.doc;const l=await d.sections.list();return JSON.stringify({total:l.total,returned:(l.items||[]).length})})()`,
      );
      log('מצב:', JSON.stringify(st), '| מקטעים:', sections);
      if (st.disabled)
        report.partial('קשר לקודם', `מנוטרל במסמך בעל מקטע יחיד (${sections}) — מוגבל מדעת, כמו ב-Word`);
      else report.skip('קשר לקודם', 'פעיל — יש לבדוק על מסמך רב-מקטעים');
    });

    await step('כותרת עליונה — הסרה', async () => {
      const before = await snap(app);
      await app.openMenu('כותרת עליונה');
      await app.reset();
      const ok = await app.clickMenu('הסרת כותרת עליונה', { after: 2500 });
      const bad = await noise(app);
      const after = await snap(app);
      const ref = /<w:headerReference/.test(after.doc);
      log('נלחץ:', ok, '| headerReference לפני/אחרי:', /<w:headerReference/.test(before.doc), ref, '| רעש:', bad || '(אין)');
      if (!ref && !bad) report.pass('כותרת עליונה — הסרה', 'ה-headerReference הוסר מה-sectPr');
      else report.fail('כותרת עליונה — הסרה', `ref=${ref}; רעש: ${bad || 'אין'}`);
    });

    await step('כותרת תחתונה — הסרה', async () => {
      await app.openMenu('כותרת תחתונה');
      await app.reset();
      const ok = await app.clickMenu('הסרת כותרת תחתונה', { after: 2500 });
      const bad = await noise(app);
      const after = await snap(app);
      const ref = /<w:footerReference/.test(after.doc);
      log('נלחץ:', ok, '| footerReference:', ref, '| רעש:', bad || '(אין)');
      if (!ref && !bad) report.pass('כותרת תחתונה — הסרה');
      else report.fail('כותרת תחתונה — הסרה', `ref=${ref}; רעש: ${bad || 'אין'}`);
    });
  } finally {
    app.close();
  }
}

/* ================================================================== */
/* מקטע ד' — שדות ותוכן עניינים                                         */
/* ================================================================== */

async function sectionFields() {
  const app = await openApp({ name: 'insert-d', port: PORT });
  try {
    await widen(app);
    await app.tab('הוספה');
    await seed(app);

    /** כל שדה בפסקה משלו: הכנסה על סמן שיושב על שדה קיים היא מקרה נפרד (למטה). */
    const fieldStep = async (label, menuItem, instr, line) => {
      await step(label, async () => {
        await caretLine(app, line);
        const before = await snap(app);
        log('מיקום הפקד:', JSON.stringify(await onScreen(app, menuItem ? 'מספר עמוד' : label)));
        await app.reset();
        if (menuItem) {
          const items = await app.openMenu('מספר עמוד');
          log('פריטים:', JSON.stringify(items));
          await app.clickMenu(menuItem, { after: 2500 });
        } else {
          await app.click(label, { after: 2500 });
        }
        const bad = await noise(app);
        const after = await snap(app);
        const instrs = after.doc.match(/<w:instrText[^>]*>[^<]*</g) ?? [];
        log('קודי שדה במסמך:', JSON.stringify(instrs));
        log('רעש:', bad || '(אין)');
        const hadCount = (before.doc.match(new RegExp(instr, 'g')) ?? []).length;
        const nowCount = (after.doc.match(new RegExp(instr, 'g')) ?? []).length;
        log(`${instr}: ${hadCount} → ${nowCount}`);
        if (nowCount > hadCount && !bad) report.pass(label, `שדה ${instr} נכתב ל-OOXML`);
        else if (nowCount > hadCount) report.partial(label, `נכתב אך יש רעש: ${bad}`);
        else report.fail(label, `לא נכתב ${instr}. רעש: ${bad || 'אין'}`);
      });
    };

    await fieldStep('מספר עמוד', 'מספר עמוד', 'PAGE', 0);
    await fieldStep('מספר העמודים במסמך', 'מספר העמודים במסמך', 'NUMPAGES', 1);
    await fieldStep('תאריך ושעה', null, 'DATE', 2);

    await step('עדכן שדות — מסמך תקין', async () => {
      const before = await fieldsList(app);
      log('שדות לפני:', JSON.stringify(before));
      log('מיקום הפקד:', JSON.stringify(await onScreen(app, 'עדכן שדות')));
      await app.reset();
      const clicked = await app.click('עדכן שדות', { after: 3000 });
      const bad = await noise(app);
      const after = await fieldsList(app);
      log('נלחץ:', clicked, '| שדות אחרי:', JSON.stringify(after));
      log('טקסט על המסך:', JSON.stringify(await app.screenText()));
      log('רעש:', bad || '(אין)');
      const resolved = after.filter((f) => f.text !== '' && f.text !== null && f.text !== undefined);
      if (!clicked) report.fail('עדכן שדות — מסמך תקין', 'הכפתור לא נמצא');
      else if (bad) report.fail('עדכן שדות — מסמך תקין', bad);
      else if (after.length === before.length && resolved.length === after.length)
        report.pass('עדכן שדות — מסמך תקין', `${after.length} שדות נפתרו: ${JSON.stringify(after)}`);
      else report.partial('עדכן שדות — מסמך תקין', `${JSON.stringify(after)}`);
    });

    await step('שדה על גבי שדה — קינון ואיבוד', async () => {
      // הכנסה שנייה ושלישית **על אותו סמן**, שם כבר יושב שדה. זה מה שקורה
      // למשתמש שמכניס „עמוד” ואחריו „מתוך” באותו מקום.
      await caretLine(app, 0);
      await app.openMenu('מספר עמוד');
      await app.clickMenu('מספר העמודים במסמך', { after: 2500 });
      await caretLine(app, 0);
      await app.reset();
      await app.click('תאריך ושעה', { after: 2500 });
      const badInsert = await noise(app);
      const nested = await fieldsList(app);
      log('שדות אחרי שלוש הכנסות באותו מקום:', JSON.stringify(nested));
      log('רעש בהכנסה:', badInsert || '(אין)');
      // PAGE ו-NUMPAGES חייבים להיפתר למספר. כל דבר אחר פירושו ששדה אחר
      // נבלע לתוך התוצאה שלהם.
      const swallowed = nested.filter(
        (f) => (f.type === 'PAGE' || f.type === 'NUMPAGES') && !/^\d*$/.test(f.text ?? ''),
      );
      if (swallowed.length)
        report.fail(
          'הכנסת שדה על סמן שיושב על שדה',
          `שדה נבלע בתוך שדה אחר בשקט: ${JSON.stringify(swallowed)}`,
        );
      else report.pass('הכנסת שדה על סמן שיושב על שדה', JSON.stringify(nested));

      const before = await fieldsList(app);
      await app.reset();
      await app.click('עדכן שדות', { after: 3500 });
      const bad = await noise(app);
      const after = await fieldsList(app);
      const files = await snap(app);
      log('שדות לפני/אחרי העדכון:', before.length, after.length);
      log('אחרי:', JSON.stringify(after));
      log('instr ב-docx:', JSON.stringify(files.doc.match(/<w:instrText[^>]*>[^<]*</g) ?? []));
      log('רעש:', bad || '(אין)');
      if (!bad && after.length === before.length) report.pass('עדכן שדות — שדות מקוננים');
      else
        report.fail(
          'עדכן שדות — שדות מקוננים',
          `${before.length}→${after.length} שדות; ${bad || 'בלי הודעה'}`,
        );
    });

    await step('תוכן עניינים', async () => {
      await caretLine(app, 2);
      await app.press('End', 'End', 35);
      await app.sleep(300);
      const cmd = await app.cmd('table-of-contents-insert');
      log('מצב הפקודה:', JSON.stringify(cmd));
      log('מיקום הפקד:', JSON.stringify(await onScreen(app, 'תוכן עניינים')));
      const before = await snap(app);
      await app.reset();
      const clicked = await app.click('תוכן עניינים', { after: 3500 });
      const bad = await noise(app);
      const after = await snap(app);
      const toc = /TOC \\/.test(after.doc) || /TOC\s/.test(after.doc);
      const sdt = (after.doc.match(/<w:sdt>/g) ?? []).length;
      const instrs = after.doc.match(/w:instr="[^"]*"|<w:instrText[^>]*>[^<]*</g) ?? [];
      log('נלחץ:', clicked, '| TOC:', toc, '| sdt:', sdt);
      log('קודי שדה:', JSON.stringify(instrs));
      log('רעש:', bad || '(אין)');
      const had = /TOC/.test(before.doc);
      if (toc && !had && !bad) report.pass('תוכן עניינים', 'שדה TOC נכתב ל-OOXML');
      else if (toc && !had) report.partial('תוכן עניינים', `נכתב אך יש רעש: ${bad}`);
      else report.fail('תוכן עניינים', `לא נכתב שדה TOC. רעש: ${bad || 'אין'}`);
    });
  } finally {
    app.close();
  }
}

/* ================================================================== */

const only = process.argv[2];
const sections = {
  a: sectionPages,
  b: sectionInserts,
  c: sectionHeaderFooter,
  d: sectionFields,
};

for (const [key, fn] of Object.entries(sections)) {
  if (only && only !== key) continue;
  await fn();
}

report.print();
process.exit(0);
