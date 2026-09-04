/**
 * שער ה-QA של לשונית „הפניות”.
 *
 * עשרים פקדים, כל אחד בלחיצת עכבר אמיתית ואחריה קריאת ה-docx המיוצא. הכלל
 * היחיד: `success: true` אינו הוכחה — מה שנכתב ל-OOXML הוא ההוכחה.
 *
 * לפני שקובעים „שבור”: לקרוא את ReferencesTab.vue (הערת הפתיחה שם מתעדת
 * שורה-שורה מה נמדד ב-engine/toc.ts, footnotes.ts, cross-refs.ts,
 * index-field.ts, citations.ts, captions.ts) ואת docs/engine-gaps.md. הרבה
 * פקדים כאן **מוגבלים מדעת** בגלל פערים שנמדדו במנוע עצמו, ולא באגים
 * שהמודולים האלה הכניסו.
 *
 * הרצה:  node scripts/qa/references-qa.mjs
 * היציאה 9365 שמורה לשער הזה בלבד.
 */
import { openApp, createReport } from './harness.mjs';

const PORT = Number(process.env.QA_PORT ?? 9365);
const report = createReport('לשונית „הפניות”');

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

/** תמונת מצב של המסמך: `document.xml` + כל שאר הקבצים. */
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
 * ממקמת סמן בפסקה לפי אינדקס `.superdoc-line`.
 *
 * גוללת את הפסקה לתצוגה **לפני** חישוב המלבן: נמדד שהכנסת הערת שוליים
 * גוללת את הדף כך שהגוף כולו יוצא ל-y שלילי (כדי לחשוף את פאנל ההערה
 * שנוסף בתחתית) — קליק על מלבן שכזה נשלח מחוץ לחלון, ונוחת בפועל בפאנל
 * ההערה הממוקד. אותה מלכודת בדיוק כמו ה-x השלילי ברצועה, רק בציר Y ואחרי
 * פעולה במסמך ולא בפתיחה.
 */
async function caretLine(app, index) {
  const raw = await app.js(
    `(function(){var n=document.querySelectorAll('.superdoc-line')[${index}];if(!n)return 'null';` +
      `n.scrollIntoView({block:'center', inline:'center'});` +
      `var b=n.getBoundingClientRect();return JSON.stringify({x:Math.round(b.x+10),y:Math.round(b.y+b.height/2),` +
      `right:Math.round(b.x+b.width-6)})})()`,
  );
  if (raw === 'null') throw new Error(`אין שורה ${index} במסמך`);
  await app.sleep(200); // מרווח קטן לגלילה לפני חישוב המלבן הסופי
  const raw2 = await app.js(
    `(function(){var n=document.querySelectorAll('.superdoc-line')[${index}];if(!n)return 'null';` +
      `var b=n.getBoundingClientRect();return JSON.stringify({x:Math.round(b.x+10),y:Math.round(b.y+b.height/2),` +
      `right:Math.round(b.x+b.width-6)})})()`,
  );
  const r = JSON.parse(raw2 === 'null' ? raw : raw2);
  await app.clickAt(r.x, r.y);
  await app.sleep(500);
  return r;
}

/**
 * בוחרת שורה שלמה: לחיצה בתחילתה, Home, ואז `Shift+ArrowLeft` חוזר.
 *
 * **לא** Home+Shift+End, וגם **לא** `app.extendSelection` (Shift+ArrowRight)
 * של harness.mjs. שניהם נמדדו שבורים על פסקה בעברית (RTL) בעורך הזה —
 * לא בקוד המקור, בדיבוג של השער הזה בלבד:
 *
 * - Shift+End אינו מרחיב כלום (הטווח נשאר 0..0), בעקביות.
 * - Shift+ArrowRight — שאמור להרחיב "קדימה" — מרחיב **אחורה**, אל תוך
 *   הפסקה **הקודמת** (נמדד: התחלה בהיסט 0 של „תוכן פסקה כלשהי" + הרחבה
 *   ב-15 עצרה ב-"פרק ראשון", הפסקה שלפניה).
 *
 * ההסבר: מקשי החצים כאן קשורים לכיוון **חזותי**, לא לוגי. בפסקת RTL
 * חזותית-שמאלה (ArrowLeft) הוא שמתקדם בסדר ההקלדה, ו-ArrowRight נסוג.
 * נמדד ומאומת: Home ואז Shift+ArrowLeft פעם 15 על „תוכן פסקה כלשהי" (15
 * תווים) נתן טווח מדויק 0..15 עם הטקסט הנכון. `length` הוא מספר התווים
 * החזוי של השורה — קצר מדי משאיר חלק מהטקסט לא נבחר, ארוך מדי חוצה לשורה
 * הקודמת (לא הבאה!, ראו למעלה).
 */
async function selectWholeLine(app, index, length) {
  const r = await caretLine(app, index);
  await app.press('Home', 'Home', 36);
  await app.sleep(200);
  for (let i = 0; i < length; i++) {
    await app.press('ArrowLeft', 'ArrowLeft', 37, 8); // Shift+ArrowLeft
    await app.sleep(60);
  }
  await app.sleep(300);
  return r;
}

/**
 * מוצאת את אינדקס `.superdoc-line` שהטקסט שלו תואם בדיוק, ולא מנחשת מספר.
 *
 * חובה בכל שלב שרץ **אחרי** הכנסת תוכן עניינים/מפתח: אלה מוסיפים שורות
 * לתצוגה (שדה ה-TOC/INDEX מרונדר כפסקאות), והאינדקס המספרי של הפסקאות
 * שהמבחן זרע כבר אינו מה שהיה. נמדד: `caretLine(app,1)` אחרי הכנסת תוכן
 * עניינים בחר בפסקה 0 ולא בפסקה 1.
 */
async function findLineIndex(app, text) {
  const idx = await app.js(
    `(function(){var t=${JSON.stringify(text)};var nodes=document.querySelectorAll('.superdoc-line');` +
      // התאמה מדויקת קודם, ורק אם לא נמצאה — הכלה: הכנסת הערת שוליים/סיום
      // מוסיפה את סימן הייחוס **בתוך** הפסקה (בהיסט 0, קדימה), כך שהטקסט
      // המדויק שנזרע לא נשאר קיים לאחר מכן.
      `for(var i=0;i<nodes.length;i++){if((nodes[i].textContent||'').trim()===t)return i;}` +
      `for(var j=0;j<nodes.length;j++){if((nodes[j].textContent||'').indexOf(t)>=0)return j;}return -1;})()`,
  );
  return Number(idx);
}

/** ממקמת סמן בפסקה לפי הטקסט שלה, לא לפי אינדקס. ראו `findLineIndex`. */
async function caretText(app, text) {
  const idx = await findLineIndex(app, text);
  if (idx < 0) throw new Error(`לא נמצאה שורה עם הטקסט "${text}" למיקום סמן`);
  return caretLine(app, idx);
}

/**
 * ממקמת סמן בפסקת גוף (לא בהערת שוליים/סיום), עם ניסיון חוזר.
 *
 * חובה אחרי הכנסת הערה: `footnotes.insert` מעביר את הבחירה **לתוך** ההערה
 * שהרגע נוצרה (בדיוק כמו ב-Word — כדי שאפשר יהיה להקליד את תוכנה), והפריסה
 * של פאנל ההערה מתייצבת אחרי הקליק הראשון על הגוף. נמדד: קליק יחיד על שורת
 * הגוף מיד אחרי הכנסת הערה נחת בתוך `story.storyType === 'footnote'`.
 */
async function caretBody(app, text, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    await caretText(app, text);
    const sel = await docApi(app, `return JSON.stringify(await d.selection.current())`).then(JSON.parse);
    last = sel;
    if (sel?.target?.story?.storyType === 'body' || sel?.selectionTarget?.story?.storyType === 'body') return sel;
    await app.sleep(400);
  }
  throw new Error(`הסמן לא נשאר בגוף המסמך אחרי ${tries} ניסיונות (story=${JSON.stringify(last)})`);
}

/** בוחרת פסקה שלמה לפי הטקסט שלה, לא לפי אינדקס. ראו `findLineIndex`. */
async function selectText(app, text) {
  const idx = await findLineIndex(app, text);
  if (idx < 0) throw new Error(`לא נמצאה שורה עם הטקסט "${text}" לבחירה`);
  return selectWholeLine(app, idx, text.length);
}

/** בונה מסמך של כמה פסקאות עם טקסט. */
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
 * מרחיבה את חלון הבדיקה ל-1600×1000.
 *
 * חובה: ב-headless ברירת המחדל היא ~756px, ו-`.word-ribbon-body` גולש —
 * „הפניות” היא הלשונית הצפופה ביותר (עשרים פקדים), ופקדים בקצה יושבים ב-x
 * שלילי. לחיצה עליהם נשלחת מחוץ לחלון: שום מטפל אינו רץ, ואין שגיאה — פקד
 * תקין נמדד כ„שבור”.
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

/** בודקת שהפקד באמת בתוך החלון ובעל מלבן חיובי לפני שלוחצים עליו. */
async function onScreen(app, name) {
  const st = await app.state(name);
  if (!st.found) return { ok: false, why: 'לא נמצא', state: st };
  if (!st.rect) return { ok: false, why: 'אינו מוצג', state: st };
  const inside = st.rect.x > 0 && st.rect.y > 0;
  return { ok: inside, why: inside ? '' : `מחוץ לחלון (x=${st.rect.x}, y=${st.rect.y})`, rect: st.rect, state: st };
}

/** לוחצת על פקד רק אחרי שאומתה שהוא בתוך המלבן — ראו מלכודת ה-x השלילי. */
async function clickChecked(app, name, opts = {}) {
  const on = await onScreen(app, name);
  log(`מיקום „${name}”:`, JSON.stringify(on));
  if (!on.ok) return { clicked: false, on };
  const clicked = await app.click(name, opts);
  return { clicked, on };
}

/** קריאה גולמית מתוך doc.* — לאימות מצב שאין לו חשיפה ב-`app.state`. */
const docApi = (app, expr) =>
  app.js(`(async()=>{try{const d=window.__otzariaEditor.superdoc.activeEditor.doc;${expr}}catch(e){return JSON.stringify({error:String(e&&e.message)})}})()`);

const tocList = (app) =>
  docApi(app, `const l=await d.toc.list({limit:50,offset:0});return JSON.stringify({total:l&&l.total,items:(l&&l.items||[]).map(i=>({nodeId:i.address&&i.address.nodeId,levels:i.sourceConfig&&i.sourceConfig.outlineLevels,hyperlinks:i.displayConfig&&i.displayConfig.hyperlinks,entryCount:i.entryCount}))})`).then(JSON.parse);

const indexList = (app) =>
  docApi(app, `const l=await d.index.list({limit:50,offset:0});return JSON.stringify({total:l&&l.total,items:(l&&l.items||[]).map(i=>({nodeId:i.address&&i.address.nodeId,config:i.config,entryCount:i.entryCount}))})`).then(JSON.parse);

const tocEntriesList = (app) =>
  docApi(app, `const l=await d.toc.listEntries({limit:50,offset:0});return JSON.stringify({total:l&&l.total,items:(l&&l.items||[]).map(i=>({nodeId:i.address&&i.address.nodeId,text:i.text,level:i.level}))})`).then(JSON.parse);

/* ================================================================== */
/* מקטע א' — תוכן עניינים                                              */
/* ================================================================== */

async function sectionToc() {
  const app = await openApp({ name: 'ref-toc', port: PORT });
  try {
    await widen(app);
    await seed(app, ['פרק ראשון', 'תוכן פסקה כלשהי', 'פרק שני']);

    // כותרת על הפסקה הראשונה, כדי שתוכן העניינים לא יהיה ריק.
    await app.tab('בית');
    await caretText(app, 'פרק ראשון');
    await app.clickGallery('כותרת 1', { after: 900 });
    await app.tab('הפניות');

    // „סמן ערך” נבדק **לפני** יצירת תוכן העניינים בכוונה: אחרי ההכנסה
    // התצוגה משתנה (שורות התוכן עניינים מתווספות), ומיקום הפסקאות לפי טקסט
    // כבר אינו יציב לאותה מידה. סדר ההרצה כאן שונה מסדר ההצגה בדוח.
    await step('סמן ערך', async () => {
      await selectText(app, 'תוכן פסקה כלשהי');
      await app.reset();
      const { clicked, on } = await clickChecked(app, 'סמן ערך', { after: 800 });
      const dlg = await app.dialog();
      log('נלחץ:', clicked, '| דיאלוג:', JSON.stringify(dlg && dlg.controls.map((c) => ({ id: c.id, value: c.value }))));
      if (!clicked || !dlg) {
        report.fail('סמן ערך', `הדיאלוג לא נפתח (${on.why})`);
        return;
      }
      const textField = dlg.controls.find((c) => c.id === 'te-text');
      log('טקסט שהוצע מהבחירה:', JSON.stringify(textField?.value));
      await app.dialogFill('te-level', '2');
      await app.sleep(200);
      await app.reset();
      const marked = await app.clickDialog('סמן', { after: 2000 });
      const bad = await noise(app);
      const after = await snap(app);
      const tc = after.doc.match(/TC\s+(?:"|&quot;)([^"&]*)(?:"|&quot;)\s*\\l\s*(\d)/);
      log('נלחץ „סמן”:', marked, '| שדה TC:', JSON.stringify(tc), '| רעש:', bad || '(אין)');
      const suggestionOk = typeof textField?.value === 'string' && textField.value.includes('תוכן פסקה');
      if (marked && tc && tc[2] === '2' && !bad) {
        report.pass(
          'סמן ערך',
          `שדה TC "${tc[1]}" \\l 2 נכתב; ההצעה בדיאלוג ${suggestionOk ? 'הייתה טקסט הבחירה' : 'לא תאמה את הבחירה'}`,
        );
      } else if (tc) report.partial('סמן ערך', `TC נכתב אך: ${bad || 'רמה לא נכונה'}`);
      else report.fail('סמן ערך', `לא נכתב שדה TC. רעש: ${bad || 'אין'}`);

      // בטל סימון, כשהדיאלוג עדיין פתוח — רק אם באמת נכתב TC לבטל. חובה
      // לנקות כאן: TC שיישאר יזהם את ספירת entryCount של תוכן העניינים
      // שעוד לא נוצר.
      if (!tc) {
        report.skip('סמן ערך — בטל סימון', 'אין ערך שסומן להסיר');
      } else {
        await app.clickSel('.te-list-item', 0, { after: 400 });
        await app.reset();
        const unmarked = await app.clickDialog('בטל סימון', { after: 2000 });
        const afterUnmark = await snap(app);
        const gone = !/TC\s+(?:"|&quot;)תוכן פסקה/.test(afterUnmark.doc);
        log('בוטל סימון:', unmarked, '| נעלם מה-OOXML:', gone, '| רעש:', (await noise(app)) || '(אין)');
        gone ? report.pass('סמן ערך — בטל סימון', 'שדה TC הוסר') : report.fail('סמן ערך — בטל סימון', 'שדה TC נשאר ב-OOXML');
      }
      await app.clickDialog('סגור', { after: 500 });
    });

    await step('תוכן עניינים', async () => {
      await caretText(app, 'פרק שני');
      await app.press('End', 'End', 35);
      await app.sleep(300);
      const cmd = await app.cmd('table-of-contents-insert');
      log('מצב הפקודה:', JSON.stringify(cmd));
      const before = await snap(app);
      await app.reset();
      const { clicked, on } = await clickChecked(app, 'תוכן עניינים', { after: 3000 });
      const bad = await noise(app);
      const after = await snap(app);
      const toc = /TOC\s+\\/.test(after.doc) || /TOC\s/.test(after.doc);
      const sdt = (after.doc.match(/<w:sdt>/g) ?? []).length;
      log('נלחץ:', clicked, '| TOC:', toc, '| sdt:', sdt, '| רעש:', bad || '(אין)');
      const had = /TOC\s/.test(before.doc);
      if (!clicked) report.fail('תוכן עניינים', `הכפתור לא נמצא (${on.why})`);
      else if (toc && !had && !bad) report.pass('תוכן עניינים', 'שדה TOC נכתב ל-OOXML, כולל כותרת שנתפסה');
      else if (toc && !had) report.partial('תוכן עניינים', `נכתב אך יש רעש: ${bad}`);
      else report.fail('תוכן עניינים', `לא נכתב שדה TOC. רעש: ${bad || 'אין'}`);
    });

    await step('עדכן טבלה', async () => {
      // כותרת שנייה, לפני „תוכן פסקה כלשהי” (לא לפני „פרק שני" — אחריה כבר
      // יושב שדה ה-TOC מהשלב הקודם, וזה אנקור לא-נגוע). העדכון אמור לאסוף
      // אותה מכל מקום שהיא נמצאת בו.
      //
      // מקליקים בתחילת הפסקה ומקלידים לפניה + Enter — לא End+Enter+type:
      // נמדד (לא בקוד המקור) ש-CDP `Input.dispatchKeyEvent` עם `End` על
      // פסקה בעברית (RTL) אינו מזיז את הסמן לסוף הפסקה בעורך הזה; קליק לבדו
      // כבר ממקם בהיסט 0, וזה שנוצל כאן.
      await caretText(app, 'תוכן פסקה כלשהי');
      await app.press('Home', 'Home', 36);
      await app.sleep(200);
      await app.type('פרק שלישי');
      await app.press('Enter', 'Enter', 13);
      await app.sleep(500);
      await app.tab('בית');
      await caretText(app, 'פרק שלישי');
      await app.clickGallery('כותרת 1', { after: 900 });
      await app.tab('הפניות');

      const beforeText = await app.screenText();
      const beforeCount = (beforeText.match(/פרק שלישי/g) ?? []).length;
      log('מופעי „פרק שלישי” לפני העדכון:', beforeCount);

      await app.reset();
      const { clicked, on } = await clickChecked(app, 'עדכן טבלה', { after: 3000 });
      const bad = await noise(app);
      const afterText = await app.screenText();
      const afterCount = (afterText.match(/פרק שלישי/g) ?? []).length;
      log('נלחץ:', clicked, '| מופעים אחרי:', afterCount, '| רעש:', bad || '(אין)');
      if (!clicked) report.fail('עדכן טבלה', `הכפתור לא נמצא (${on.why})`);
      else if (afterCount > beforeCount && !bad)
        report.pass('עדכן טבלה', `„פרק שלישי” הופיע ${beforeCount}→${afterCount} פעמים על המסך — הטבלה נבנתה מחדש`);
      else if (afterCount > beforeCount) report.partial('עדכן טבלה', `נבנתה מחדש אך יש רעש: ${bad}`);
      else report.fail('עדכן טבלה', `הטבלה לא אספה את הכותרת החדשה. רעש: ${bad || 'אין'}`);
    });

    await step('התאמה אישית', async () => {
      const before = await tocList(app);
      log('הגדרות תוכן העניינים לפני:', JSON.stringify(before));
      await app.reset();
      const { clicked, on } = await clickChecked(app, 'התאמה אישית', { after: 800 });
      const dlg = await app.dialog();
      log('נלחץ:', clicked, '| דיאלוג:', JSON.stringify(dlg && dlg.label));
      if (!clicked || !dlg) {
        report.fail('התאמה אישית', `הדיאלוג לא נפתח (${on.why})`);
        return;
      }
      await app.dialogFill('td-from', '1');
      await app.dialogFill('td-to', '1');
      await app.clickSel('.toc-dialog input[type="checkbox"]', 0, { after: 200 }); // הפוך את הקישורים
      await app.sleep(200);
      await app.reset();
      const applied = await app.clickDialog('אישור', { after: 3000 });
      const bad = await noise(app);
      const after = await tocList(app);
      const afterDoc = await snap(app);
      const outline = /TOC\s+\\o\s+(?:"|&quot;)1-1(?:"|&quot;)/.test(afterDoc.doc);
      log('אושר:', applied, '| הגדרות אחרי:', JSON.stringify(after), '| \\o "1-1" ב-instr:', outline, '| רעש:', bad || '(אין)');
      const levelsChanged = after.items?.[0]?.levels?.from === 1 && after.items?.[0]?.levels?.to === 1;
      if (applied && levelsChanged && !bad)
        report.pass('התאמה אישית', `טווח הרמות הפך ל-1..1 (${JSON.stringify(after.items?.[0]?.levels)}), וההיפוך הריץ עדכון`);
      else if (levelsChanged) report.partial('התאמה אישית', `הוחל אך יש רעש: ${bad}`);
      else report.fail('התאמה אישית', `הטווח לא השתנה. לפני=${JSON.stringify(before.items?.[0]?.levels)} אחרי=${JSON.stringify(after.items?.[0]?.levels)}. רעש: ${bad || 'אין'}`);
    });

    await step('הסר', async () => {
      const before = await snap(app);
      const beforeStyles = (before.doc.match(/w:val="TOC[1-9]"/g) ?? []).length;
      await app.reset();
      const { clicked, on } = await clickChecked(app, 'הסר', { after: 3000 });
      const bad = await noise(app);
      const after = await snap(app);
      const stillToc = /TOC\s/.test(after.doc);
      const afterStyles = (after.doc.match(/w:val="TOC[1-9]"/g) ?? []).length;
      log('נלחץ:', clicked, '| נותר TOC:', stillToc, '| שורות TOC1..9 לפני/אחרי:', beforeStyles, afterStyles, '| רעש:', bad || '(אין)');
      if (!clicked) report.fail('הסר', `הכפתור לא נמצא (${on.why})`);
      else if (!stillToc && afterStyles === 0 && !bad) report.pass('הסר', 'שדה TOC וכל שורות TOC1..9 הוסרו');
      else if (!stillToc && afterStyles > 0)
        report.partial('הסר', `השדה הוסר אך ${afterStyles} שורות TOC* נשארו כפסקאות יתומות — ראו engine/toc.ts`);
      else report.fail('הסר', `TOC נשאר. רעש: ${bad || 'אין'}`);
    });
  } finally {
    app.close();
  }
}

/* ================================================================== */
/* מקטע ב' — הערות שוליים והערות סיום                                   */
/* ================================================================== */

async function sectionNotes() {
  const app = await openApp({ name: 'ref-notes', port: PORT });
  try {
    await widen(app);
    await seed(app, ['שורה ראשונה', 'שורה שנייה']);
    await app.tab('הפניות');

    await step('הערת שוליים', async () => {
      await caretLine(app, 0);
      await app.press('End', 'End', 35);
      await app.sleep(200);
      const before = await snap(app);
      await app.reset();
      const { clicked, on } = await clickChecked(app, 'הערת שוליים', { after: 2500 });
      const bad = await noise(app);
      const after = await snap(app);
      const ref = /<w:footnoteReference\b/.test(after.doc);
      const inFile = /<w:footnote\s+w:id="1"/.test(after.files['word/footnotes.xml'] ?? '');
      log('נלחץ:', clicked, '| footnoteReference:', ref, '| footnotes.xml:', inFile, '| רעש:', bad || '(אין)');
      if (!clicked) report.fail('הערת שוליים', `הכפתור לא נמצא (${on.why})`);
      else if (ref && inFile && !bad) report.pass('הערת שוליים', 'footnoteReference + footnotes.xml נכתבו');
      else report.fail('הערת שוליים', `ref=${ref} inFile=${inFile}; רעש: ${bad || 'אין'}`);
    });

    await step('הערת סיום', async () => {
      await caretBody(app, 'שורה שנייה');
      await app.sleep(200);
      await app.reset();
      const { clicked, on } = await clickChecked(app, 'הערת סיום', { after: 2500 });
      const bad = await noise(app);
      const after = await snap(app);
      const ref = /<w:endnoteReference\b/.test(after.doc);
      const inFile = /<w:endnote\s+w:id="1"/.test(after.files['word/endnotes.xml'] ?? '');
      log('נלחץ:', clicked, '| endnoteReference:', ref, '| endnotes.xml:', inFile, '| רעש:', bad || '(אין)');
      if (!clicked) report.fail('הערת סיום', `הכפתור לא נמצא (${on.why})`);
      else if (ref && inFile && !bad) report.pass('הערת סיום', 'endnoteReference + endnotes.xml נכתבו');
      else report.fail('הערת סיום', `ref=${ref} inFile=${inFile}; רעש: ${bad || 'אין'}`);
    });

    /** מוצאת אינדקס פריט ברשימת ההערות לפי טקסט מוצג (לא לפי סדר סדנטי). */
    const noteItemIndex = (app, textPrefix) =>
      app
        .js(
          `(function(){var items=Array.from(document.querySelectorAll('.np-list-item'));` +
            `return items.findIndex(function(b){return (b.textContent||'').indexOf(${JSON.stringify(textPrefix)})===0});})()`,
        )
        .then(Number);

    await step('נהל הערות', async () => {
      // בשלב הזה יש הערת שוליים 1 והערת סיום 1 — אותו מספר בדיוק. זו בדיוק
      // המלכודת שהמודול נבנה נגדה: FootnoteAddress אינו נושא סוג, ושתי ההערות
      // חולקות כתובת. ראו engine/footnotes.ts.
      await app.reset();
      const { clicked, on } = await clickChecked(app, 'נהל הערות', { after: 800 });
      const dlg = await app.dialog();
      log('נלחץ:', clicked, '| רשימת הערות בדיאלוג:', JSON.stringify(dlg?.controls.filter((c) => c.tag === 'button').map((c) => c.text)));
      if (!clicked || !dlg) {
        report.fail('נהל הערות', `הדיאלוג לא נפתח (${on.why})`);
        return;
      }

      // עריכת ההערה הראשונה ברשימה (footnote 1).
      await app.clickSel('.np-list-item', await noteItemIndex(app, 'הערת שוליים'), { after: 400 });
      await app.dialogFill('np-content', 'תוכן הערת השוליים');
      await app.sleep(200);
      await app.reset();
      const savedFoot = await app.clickDialog('שמור שינויים', { after: 2500 });
      const bad1 = await noise(app);
      const afterFoot = await snap(app);
      const footOk = /תוכן הערת השוליים/.test(afterFoot.files['word/footnotes.xml'] ?? '');
      const endUntouched = /<w:endnote\s+w:id="1"/.test(afterFoot.files['word/endnotes.xml'] ?? '');
      log('נשמר (שוליים):', savedFoot, '| הטקסט בקובץ הנכון:', footOk, '| endnote 1 עדיין קיים:', endUntouched, '| רעש:', bad1 || '(אין)');
      if (footOk && endUntouched && !bad1)
        report.pass('נהל הערות — עריכה', 'עריכת „הערת שוליים 1” כתבה ל-footnotes.xml ולא נגעה ב-endnote 1 — הכתובת המשותפת לא בלבלה בין הסוגים');
      else report.fail('נהל הערות — עריכה', `footOk=${footOk} endUntouched=${endUntouched}; רעש: ${bad1 || 'אין'}`);

      // „הערת סיום 1” נושאת אותו מספר כמו „הערת שוליים 1” — הדיאלוג אמור
      // לזהות את זה מדעת ולנטרל שמירה/הסרה עליה, לא לאפשר אותן בשקט.
      // ראו NoteDialog.vue (`ambiguous`) ו-ReferencesTab.vue.
      await app.clickSel('.np-list-item', await noteItemIndex(app, 'הערת סיום'), { after: 400 });
      const dlgAmb = await app.dialog();
      const submitBtn = dlgAmb.controls.find((c) => c.text === 'שמור שינויים');
      const removeBtn = dlgAmb.controls.find((c) => c.text === 'הסר הערה');
      const warned = await app.js(`!!document.querySelector('.np-dialog .np-warn, [role="dialog"] .np-warn')`);
      log('הערת סיום 1 (דו-משמעית): warn=', warned, '| שמור מנוטרל=', submitBtn?.disabled, '| הסר מנוטרל=', removeBtn?.disabled);
      if (warned && submitBtn?.disabled && removeBtn?.disabled) {
        report.pass(
          'נהל הערות — הגנת דו-משמעיות',
          '„הערת סיום 1” נושאת מספר משותף עם „הערת שוליים 1”; הדיאלוג מציג אזהרה ומנטרל שמירה/הסרה — כמתועד ב-engine/footnotes.ts',
        );
      } else {
        report.fail(
          'נהל הערות — הגנת דו-משמעיות',
          `הציפייה: אזהרה + נטרול. בפועל warn=${warned} שמור.disabled=${submitBtn?.disabled} הסר.disabled=${removeBtn?.disabled}`,
        );
      }

      // כדי לבדוק עריכה/הסרה על הערת סיום שאינה דו-משמעית, מוסיפים הערת
      // סיום שנייה (מספרה 2 — אינו מתנגש עם footnote 1). סוגרים את הדיאלוג
      // כדי להחזיר את הבחירה למסמך, כמו „הוסף מפתח” וכדומה.
      await app.clickDialog('סגור', { after: 400 });
      await caretBody(app, 'שורה שנייה');
      await app.press('Home', 'Home', 36);
      await app.sleep(200);
      await app.click('הערת סיום', { after: 2500 });

      await clickChecked(app, 'נהל הערות', { after: 800 });
      const idx2 = await noteItemIndex(app, 'הערת סיום 2');
      if (idx2 < 0) {
        report.fail('נהל הערות — עריכת הערת סיום', 'הערת סיום 2 לא נוצרה — אין על מה לבדוק עריכה שאינה דו-משמעית');
      } else {
        await app.clickSel('.np-list-item', idx2, { after: 400 });
        await app.dialogFill('np-content', 'תוכן הערת הסיום השנייה');
        await app.sleep(200);
        await app.reset();
        const savedEnd = await app.clickDialog('שמור שינויים', { after: 2500 });
        const bad2 = await noise(app);
        const afterEnd = await snap(app);
        const endnotesXml = afterEnd.files['word/endnotes.xml'] ?? '';
        const endOk = /תוכן הערת הסיום השנייה/.test(endnotesXml);
        const firstUntouched = !/תוכן הערת הסיום השנייה[\s\S]*w:id="1"/.test(endnotesXml);
        log('נשמר (סיום 2):', savedEnd, '| הטקסט בקובץ הנכון:', endOk, '| רעש:', bad2 || '(אין)');
        if (endOk && !bad2)
          report.pass('נהל הערות — עריכת הערת סיום', 'עריכת „הערת סיום 2” (לא דו-משמעית) כתבה ל-endnotes.xml כהלכה');
        else report.fail('נהל הערות — עריכת הערת סיום', `endOk=${endOk}; רעש: ${bad2 || 'אין'}`);

        // הסרה של הערת הסיום השנייה, ואימות שהערת השוליים לא נפגעה.
        const idxRemove = await noteItemIndex(app, 'הערת סיום 2');
        await app.clickSel('.np-list-item', idxRemove, { after: 400 });
        await app.reset();
        const removed = await app.clickDialog('הסר הערה', { after: 2500 });
        const bad3 = await noise(app);
        const afterRemove = await snap(app);
        const endGone = !/תוכן הערת הסיום השנייה/.test(afterRemove.files['word/endnotes.xml'] ?? '');
        const footStillOk = /תוכן הערת השוליים/.test(afterRemove.files['word/footnotes.xml'] ?? '');
        log('הוסר:', removed, '| endnote 2 נעלם:', endGone, '| footnote 1 עדיין קיים:', footStillOk, '| רעש:', bad3 || '(אין)');
        if (endGone && footStillOk && !bad3)
          report.pass('נהל הערות — הסרה', '„הערת סיום 2” הוסרה, ו„הערת שוליים 1” לא נפגעה');
        else report.fail('נהל הערות — הסרה', `endGone=${endGone} footStillOk=${footStillOk}; רעש: ${bad3 || 'אין'}`);
      }

      await app.clickDialog('סגור', { after: 500 }).catch(() => {});
    });
  } finally {
    app.close();
  }
}

/* ================================================================== */
/* מקטע ג' — הפניות מקושרות                                            */
/* ================================================================== */

async function sectionCrossRefs() {
  const app = await openApp({ name: 'ref-crossrefs', port: PORT });
  try {
    await widen(app);
    await seed(app, ['פסקה בלי שום הפניה']);
    await app.tab('הפניות');

    await step('עדכן הפניות', async () => {
      // אין ברצועה שום פקד שמכניס „הפניה מקושרת” (`crossRefs.insert` כותב
      // REF SDXREF שאינו קוד Word — ראו engine/cross-refs.ts), ולכן אין
      // דרך ליצור כאן הפניה אמיתית לבדיקה. מה שכן אפשר לבדוק: שהפקד קיים,
      // מוצג, ושלחיצה עליו על מסמך בלי הפניות היא הצלחה שקטה — לא שגיאה,
      // ולא שינוי במסמך.
      const cnt = await docApi(app, `const l=await d.crossRefs.list({limit:10,offset:0});return JSON.stringify({total:l&&l.total})`);
      log('מונה הפניות במסמך:', cnt);
      const st = await app.state('עדכן הפניות');
      log('מצב הכפתור:', JSON.stringify(st));
      if (!st.found) {
        report.fail('עדכן הפניות', 'הכפתור לא נמצא');
        return;
      }
      const before = await snap(app);
      await app.reset();
      const { clicked, on } = await clickChecked(app, 'עדכן הפניות', { after: 2000 });
      const bad = await noise(app);
      const after = await snap(app);
      const unchanged = after.doc === before.doc;
      log('נלחץ:', clicked, '| מסמך ללא שינוי:', unchanged, '| רעש:', bad || '(אין)');
      if (!clicked) {
        report.partial('עדכן הפניות', `מנוטרל/לא נלחץ (${on.why}) — ${st.disabled ? 'המנוע מדווח שאין יכולת' : 'לא ידוע'}`);
      } else if (unchanged && !bad) {
        report.pass(
          'עדכן הפניות',
          'הצלחה שקטה על מסמך בלי הפניות (0 פריטים) — כצפוי מ-rebuildAllCrossRefs. ' +
            'אין ברצועה פקד שמכניס הפניה מקושרת עובדת (מוגבל מדעת — crossRefs.insert כותב REF SDXREF שאינו קוד Word, ראו engine/cross-refs.ts), ולכן המסלול של הפניה קיימת שמתעדכנת בפועל לא נבדק כאן.',
        );
      } else report.fail('עדכן הפניות', `המסמך השתנה או יש רעש בלי הפניות במסמך. רעש: ${bad || 'אין'}`);
    });
  } finally {
    app.close();
  }
}

/* ================================================================== */
/* מקטע ד' — מפתח                                                      */
/* ================================================================== */

async function sectionIndex() {
  const app = await openApp({ name: 'ref-index', port: PORT });
  try {
    await widen(app);
    await seed(app, ['משנה ראשונה', 'גמרא שנייה', 'רש״י שלישי']);
    await app.tab('הפניות');

    await step('הוסף מפתח', async () => {
      const before = await snap(app);
      await app.reset();
      const { clicked, on } = await clickChecked(app, 'הוסף מפתח', { after: 2500 });
      const bad = await noise(app);
      const after = await snap(app);
      const idx = /INDEX\s+\\h/.test(after.doc) || /\bINDEX\b/.test(after.doc);
      log('נלחץ:', clicked, '| INDEX:', idx, '| רעש:', bad || '(אין)');
      const had = /\bINDEX\b/.test(before.doc);
      if (!clicked) report.fail('הוסף מפתח', `הכפתור לא נמצא (${on.why})`);
      else if (idx && !had && !bad) report.pass('הוסף מפתח', 'שדה INDEX נכתב ל-OOXML, בלי דיאלוג — כמתועד');
      else if (idx && !had) report.partial('הוסף מפתח', `נכתב אך יש רעש: ${bad}`);
      else report.fail('הוסף מפתח', `לא נכתב INDEX. רעש: ${bad || 'אין'}`);
    });

    await step('סמן ערך למפתח', async () => {
      await selectText(app, 'גמרא שנייה'); // „גמרא שנייה”
      await app.reset();
      const { clicked, on } = await clickChecked(app, 'סמן ערך למפתח', { after: 800 });
      const dlg = await app.dialog();
      log('נלחץ:', clicked, '| דיאלוג:', JSON.stringify(dlg && dlg.controls.map((c) => ({ id: c.id, value: c.value }))));
      if (!clicked || !dlg) {
        report.fail('סמן ערך למפתח', `הדיאלוג לא נפתח (${on.why})`);
        return;
      }
      const textField = dlg.controls.find((c) => c.id === 'ie-text');
      log('טקסט שהוצע מהבחירה:', JSON.stringify(textField?.value));
      await app.dialogFill('ie-sub', 'תת');
      await app.sleep(200);
      await app.reset();
      const marked = await app.clickDialog('סמן', { after: 2000 });
      const bad = await noise(app);
      const after = await snap(app);
      const xe = after.doc.match(/XE\s+(?:"|&quot;)([^"&]*)(?:"|&quot;)/);
      log('נלחץ „סמן”:', marked, '| שדה XE:', JSON.stringify(xe), '| רעש:', bad || '(אין)');
      const suggestionOk = typeof textField?.value === 'string' && textField.value.includes('גמרא');
      if (marked && xe && /:תת$|:תת\b/.test(xe[1]) && !bad)
        report.pass('סמן ערך למפתח', `שדה XE "${xe[1]}" נכתב — הקידוד "ראשי:תת" (מוגבל מדעת: subEntry הישיר אינו נשלח, ראו engine/index-field.ts); הצעה=${suggestionOk}`);
      else if (xe) report.partial('סמן ערך למפתח', `XE נכתב (${xe[1]}) אך תת-הערך לא הוצפן כצפוי; רעש: ${bad || 'אין'}`);
      else report.fail('סמן ערך למפתח', `לא נכתב שדה XE. רעש: ${bad || 'אין'}`);

      // בטל סימון, כשהדיאלוג עדיין פתוח — רק אם באמת נכתב XE לבטל.
      if (!xe) {
        report.skip('סמן ערך למפתח — בטל סימון', 'אין ערך שסומן להסיר');
      } else {
        await app.clickSel('.ie-list-item', 0, { after: 400 });
        await app.reset();
        const unmarked = await app.clickDialog('בטל סימון', { after: 2000 });
        const afterUnmark = await snap(app);
        const gone = !/XE\s+(?:"|&quot;)גמרא/.test(afterUnmark.doc);
        log('בוטל סימון:', unmarked, '| נעלם מה-OOXML:', gone, '| רעש:', (await noise(app)) || '(אין)');
        gone ? report.pass('סמן ערך למפתח — בטל סימון', 'שדה XE הוסר') : report.fail('סמן ערך למפתח — בטל סימון', 'שדה XE נשאר ב-OOXML');
      }
      await app.clickDialog('סגור', { after: 500 });
    });

    await step('עדכן מפתח (עם ערך שסומן מחדש)', async () => {
      // מסמנים ערך אחרי שהמפתח כבר קיים, כדי ש„עדכן מפתח” יהיה לו מה לאסוף.
      await selectText(app, 'רש״י שלישי'); // „רש״י שלישי”
      await app.reset();
      await clickChecked(app, 'סמן ערך למפתח', { after: 800 });
      await app.dialogFill('ie-text', 'רש״י');
      await app.sleep(200);
      await app.clickDialog('סמן', { after: 2000 });
      await app.clickDialog('סגור', { after: 500 });

      const beforeText = await app.screenText();
      const beforeCount = (beforeText.match(/רש״י/g) ?? []).length;
      log('מופעי „רש\"י” לפני עדכון המפתח:', beforeCount);

      log('DEBUG XE אחרי הסימון:', (await snap(app)).doc.match(/XE\s+(?:"|&quot;)[^"&]*(?:"|&quot;)/g));
      log('DEBUG index לפני העדכון:', JSON.stringify(await indexList(app)));
      await app.reset();
      const { clicked, on } = await clickChecked(app, 'עדכן מפתח', { after: 2500 });
      const bad = await noise(app);
      log('DEBUG index אחרי העדכון:', JSON.stringify(await indexList(app)));
      const afterDoc = await snap(app);
      log('DEBUG INDEX block אחרי:', afterDoc.doc.match(/<w:sdt>[\s\S]*?<\/w:sdt>|<w:fldSimple[^>]*INDEX[^>]*>[\s\S]*?<\/w:fldSimple>/)?.[0]?.slice(0, 2000));
      const afterText = await app.screenText();
      const afterCount = (afterText.match(/רש״י/g) ?? []).length;
      log('נלחץ:', clicked, '| מופעים אחרי:', afterCount, '| רעש:', bad || '(אין)');
      if (!clicked) report.fail('עדכן מפתח', `הכפתור לא נמצא (${on.why})`);
      else if (afterCount > beforeCount && !bad)
        report.pass('עדכן מפתח', `„רש\"י” הופיע ${beforeCount}→${afterCount} פעמים על המסך — המפתח נבנה מחדש ואסף את הערך`);
      else if (afterCount > beforeCount) report.partial('עדכן מפתח', `נבנה מחדש אך יש רעש: ${bad}`);
      else report.fail('עדכן מפתח', `המפתח לא אסף את הערך החדש. רעש: ${bad || 'אין'}`);
    });

    await step('הגדרות מפתח', async () => {
      const before = await indexList(app);
      log('הגדרות המפתח לפני:', JSON.stringify(before));
      await app.reset();
      const { clicked, on } = await clickChecked(app, 'הגדרות מפתח', { after: 800 });
      const dlg = await app.dialog();
      log('נלחץ:', clicked, '| דיאלוג:', JSON.stringify(dlg && dlg.label));
      if (!clicked || !dlg) {
        report.fail('הגדרות מפתח', `הדיאלוג לא נפתח (${on.why})`);
        return;
      }
      await app.dialogFill('id-columns', '3');
      await app.clickSel('.index-dialog input[type="checkbox"]', 0, { after: 200 }); // הדלק runIn
      await app.sleep(200);
      await app.reset();
      const applied = await app.clickDialog('אישור', { after: 3000 });
      const bad = await noise(app);
      const after = await indexList(app);
      const afterDoc = await snap(app);
      const runIn = /INDEX[^\n]*\\r\b/.test(afterDoc.doc);
      log('אושר:', applied, '| הגדרות אחרי:', JSON.stringify(after), '| \\r ב-instr:', runIn, '| רעש:', bad || '(אין)');
      const colsChanged = after.items?.[0]?.config?.columns === 3;
      if (applied && colsChanged && !bad)
        report.pass('הגדרות מפתח', `מספר הטורים הפך ל-3 (\\c 3), \\r=${runIn}`);
      else if (colsChanged) report.partial('הגדרות מפתח', `הוחל אך יש רעש: ${bad}`);
      else report.fail('הגדרות מפתח', `הטורים לא השתנו. לפני=${JSON.stringify(before.items?.[0]?.config)} אחרי=${JSON.stringify(after.items?.[0]?.config)}. רעש: ${bad || 'אין'}`);
    });

    await step('הסר מפתח', async () => {
      const before = await snap(app);
      await app.reset();
      const { clicked, on } = await clickChecked(app, 'הסר מפתח', { after: 2500 });
      const bad = await noise(app);
      const after = await snap(app);
      const stillIdx = /\bINDEX\b/.test(after.doc);
      log('נלחץ:', clicked, '| נותר INDEX:', stillIdx, '| רעש:', bad || '(אין)');
      const xeStillThere = /XE\s+(?:"|&quot;)רש/.test(after.doc);
      log('שדה XE (רש״י) עדיין קיים אחרי ההסרה (כמתועד):', xeStillThere);
      if (!clicked) report.fail('הסר מפתח', `הכפתור לא נמצא (${on.why})`);
      else if (!stillIdx && !bad) report.pass('הסר מפתח', `בלוק ה-INDEX הוסר; שדות ה-XE נשארו (${xeStillThere}) — כמתועד ב-engine/index-field.ts`);
      else report.fail('הסר מפתח', `INDEX נשאר. רעש: ${bad || 'אין'}`);
    });
  } finally {
    app.close();
  }
}

/* ================================================================== */
/* מקטע ה' — ציטוטים וביבליוגרפיה                                       */
/* ================================================================== */

async function sectionCitations() {
  const app = await openApp({ name: 'ref-citations', port: PORT });
  try {
    await widen(app);
    await seed(app, ['פסקת פתיחה של המסמך']);
    await app.tab('הפניות');

    await step('נהל מקורות', async () => {
      await app.reset();
      const { clicked, on } = await clickChecked(app, 'נהל מקורות', { after: 800 });
      const dlg = await app.dialog();
      log('נלחץ:', clicked, '| דיאלוג:', JSON.stringify(dlg && dlg.label));
      if (!clicked || !dlg) {
        report.fail('נהל מקורות', `הדיאלוג לא נפתח (${on.why})`);
        return;
      }

      await app.dialogFill('cs-title', 'שו״ת הרמב״ם');
      await app.dialogFill('cs-authors', 'בן מימון, משה');
      await app.dialogFill('cs-year', 'תתקצ״ה');
      await app.dialogFill('cs-city', 'ירושלים');
      await app.dialogFill('cs-publisher', 'מוסד הרב קוק');
      await app.sleep(300);
      await app.reset();
      const added = await app.clickDialog('הוסף מקור', { after: 2500 });
      const bad1 = await noise(app);
      const afterAdd = await snap(app);
      const xml = Object.entries(afterAdd.files)
        .filter(([n]) => /customXml\/item\d+\.xml$/.test(n))
        .map(([, v]) => v)
        .join('\n');
      const titleOk = /שו״ת הרמב״ם/.test(xml);
      const cityOk = /ירושלים/.test(xml);
      log('נוסף:', added, '| כותרת ב-customXml:', titleOk, '| עיר:', cityOk, '| רעש:', bad1 || '(אין)');
      if (added && titleOk && cityOk && !bad1)
        report.pass('נהל מקורות — הוספה', 'המקור נכתב ל-customXml (חלק b:Sources), עם העברית שלמה');
      else report.fail('נהל מקורות — הוספה', `titleOk=${titleOk} cityOk=${cityOk}; רעש: ${bad1 || 'אין'}`);

      // עריכה של המקור שנוסף עכשיו.
      await app.clickSel('.cs-list-item', 0, { after: 400 });
      await app.dialogFill('cs-year', 'תש״ף');
      await app.sleep(200);
      await app.reset();
      const saved = await app.clickDialog('שמור שינויים', { after: 2500 });
      const bad2 = await noise(app);
      const afterEdit = await snap(app);
      const xml2 = Object.entries(afterEdit.files)
        .filter(([n]) => /customXml\/item\d+\.xml$/.test(n))
        .map(([, v]) => v)
        .join('\n');
      const yearChanged = /תש״ף/.test(xml2) && !/תתקצ״ה/.test(xml2);
      log('נשמר:', saved, '| השנה עודכנה:', yearChanged, '| רעש:', bad2 || '(אין)');
      if (saved && yearChanged && !bad2) report.pass('נהל מקורות — עריכה', 'השנה עודכנה ל-תש״ף בקובץ');
      else report.fail('נהל מקורות — עריכה', `yearChanged=${yearChanged}; רעש: ${bad2 || 'אין'}`);

      await app.clickDialog('סגור', { after: 500 });
    });

    await step('הוסף ציטוט', async () => {
      await caretLine(app, 0);
      await app.press('End', 'End', 35);
      await app.sleep(200);
      const before = await snap(app);
      await app.reset();
      const { clicked, on } = await clickChecked(app, 'הוסף ציטוט', { after: 800 });
      const dlg = await app.dialog();
      log('נלחץ:', clicked, '| דיאלוג:', JSON.stringify(dlg && dlg.controls.filter((c) => c.tag === 'button').map((c) => c.text)));
      if (!clicked || !dlg) {
        report.fail('הוסף ציטוט', `הדיאלוג לא נפתח (${on.why})`);
        return;
      }
      const opened = await app.clickSel('.ic-list-item', 0, { after: 300 });
      await app.reset();
      const inserted = await app.clickDialog('הוסף', { after: 2500 });
      const bad = await noise(app);
      const after = await snap(app);
      const citation = after.doc.match(/CITATION\s+([\w-]+)/);
      const xml = Object.entries(after.files)
        .filter(([n]) => /customXml\/item\d+\.xml$/.test(n))
        .map(([, v]) => v)
        .join('\n');
      const tagMatches = citation && new RegExp(`<b:Tag>${citation[1]}</b:Tag>`).test(xml);
      log('נבחר מקור:', opened, '| הוכנס:', inserted, '| CITATION:', JSON.stringify(citation), '| התג תואם ב-b:Tag:', tagMatches, '| רעש:', bad || '(אין)');
      if (citation && tagMatches && !bad)
        report.pass('הוסף ציטוט', `<w:fldSimple w:instr="CITATION ${citation[1]}"> תואם ל-<b:Tag> בחלק המקורות`);
      else if (citation) report.partial('הוסף ציטוט', `CITATION נכתב אך התג לא תואם; רעש: ${bad || 'אין'}`);
      else report.fail('הוסף ציטוט', `לא נכתב שדה CITATION. רעש: ${bad || 'אין'}`);

      // סגירה חובה: הדיאלוג הזה נשאר פתוח (כמו דיאלוג הסימנייה), ובלי סגירה
      // כאן הוא ממשיך לשבת מעל המסך ומיירט קליקים של הדיאלוג הבא —
      // נמדד: `.ic-list-item` נחת בדיוק על אותו מלבן מסך של `.cs-list-item`.
      await app.clickDialog('סגור', { after: 500 }).catch(() => {});
    });

    await step('ביבליוגרפיה', async () => {
      const before = await snap(app);
      await app.reset();
      const { clicked, on } = await clickChecked(app, 'ביבליוגרפיה', { after: 2500 });
      const bad = await noise(app);
      const after = await snap(app);
      const bib = /\bBIBLIOGRAPHY\b/.test(after.doc);
      const containsSource = /שו״ת הרמב״ם/.test(after.doc) || (await app.screenText()).includes('שו״ת הרמב״ם');
      log('נלחץ:', clicked, '| BIBLIOGRAPHY:', bib, '| מכיל את המקור:', containsSource, '| רעש:', bad || '(אין)');
      const had = /\bBIBLIOGRAPHY\b/.test(before.doc);
      if (!clicked) report.fail('ביבליוגרפיה', `הכפתור לא נמצא (${on.why})`);
      else if (bib && !had && containsSource && !bad) report.pass('ביבליוגרפיה', 'שדה BIBLIOGRAPHY נכתב, ומכיל את המקור שנוסף');
      else if (bib && !had) report.partial('ביבליוגרפיה', `נכתב אך: ${bad || 'המקור לא מופיע'}`);
      else report.fail('ביבליוגרפיה', `לא נכתב BIBLIOGRAPHY. רעש: ${bad || 'אין'}`);
    });

    await step('עדכן ביבליוגרפיה', async () => {
      // עריכת המקור, כדי שיהיה למה לעדכן.
      await clickChecked(app, 'נהל מקורות', { after: 800 });
      await app.clickSel('.cs-list-item', 0, { after: 400 });
      await app.dialogFill('cs-title', 'שו״ת הרמב״ם — מהדורה שנייה');
      await app.sleep(200);
      const savedSource = await app.clickDialog('שמור שינויים', { after: 2000 });
      const sourcesXml = Object.entries((await snap(app)).files)
        .filter(([n]) => /customXml\/item\d+\.xml$/.test(n))
        .map(([, v]) => v)
        .join('\n');
      log('המקור נשמר:', savedSource, '| מהדורה שנייה ב-customXml:', /מהדורה שנייה/.test(sourcesXml));
      // סגירה חובה לפני שממשיכים — אותה מלכודת בדיוק כמו ב„הוסף ציטוט".
      await app.clickDialog('סגור', { after: 500 });

      const beforeHas = /מהדורה שנייה/.test((await snap(app)).doc);
      log('הכותרת החדשה כבר ב-document.xml לפני העדכון:', beforeHas);

      await app.reset();
      const { clicked, on } = await clickChecked(app, 'עדכן ביבליוגרפיה', { after: 2500 });
      const bad = await noise(app);
      const afterSnap = await snap(app);
      const afterHas = /מהדורה שנייה/.test(afterSnap.doc);
      log('נלחץ:', clicked, '| הכותרת המעודכנת מופיעה ב-document.xml:', afterHas, '| רעש:', bad || '(אין)');
      if (!clicked) report.fail('עדכן ביבליוגרפיה', `הכפתור לא נמצא (${on.why})`);
      else if (afterHas && !bad) report.pass('עדכן ביבליוגרפיה', 'הביבליוגרפיה נבנתה מחדש עם הכותרת המעודכנת');
      else if (afterHas) report.partial('עדכן ביבליוגרפיה', `עודכן אך יש רעש: ${bad}`);
      else report.fail('עדכן ביבליוגרפיה', `הכותרת המעודכנת לא הופיעה. רעש: ${bad || 'אין'}`);
    });

    await step('הסר ביבליוגרפיה', async () => {
      const before = await snap(app);
      await app.reset();
      const { clicked, on } = await clickChecked(app, 'הסר ביבליוגרפיה', { after: 2500 });
      const bad = await noise(app);
      const after = await snap(app);
      const stillBib = /\bBIBLIOGRAPHY\b/.test(after.doc);
      log('נלחץ:', clicked, '| נותר BIBLIOGRAPHY:', stillBib, '| רעש:', bad || '(אין)');
      if (!clicked) report.fail('הסר ביבליוגרפיה', `הכפתור לא נמצא (${on.why})`);
      else if (!stillBib && !bad) report.pass('הסר ביבליוגרפיה', 'בלוק ה-BIBLIOGRAPHY הוסר, בלי שיירים');
      else report.fail('הסר ביבליוגרפיה', `BIBLIOGRAPHY נשאר. רעש: ${bad || 'אין'}`);
    });
  } finally {
    app.close();
  }
}

/* ================================================================== */
/* מקטע ו' — כיתובים                                                    */
/* ================================================================== */

async function sectionCaptions() {
  const app = await openApp({ name: 'ref-captions', port: PORT });
  try {
    await widen(app);
    await seed(app, ['פסקה שהכיתוב ייצמד אליה']);
    await app.tab('הפניות');

    await step('הוסף כיתוב', async () => {
      await caretLine(app, 0);
      const before = await snap(app);
      await app.reset();
      const { clicked, on } = await clickChecked(app, 'הוסף כיתוב', { after: 800 });
      const dlg = await app.dialog();
      log('נלחץ:', clicked, '| דיאלוג:', JSON.stringify(dlg && dlg.label));
      if (!clicked || !dlg) {
        report.fail('הוסף כיתוב', `הדיאלוג לא נפתח (${on.why})`);
        return;
      }
      await app.dialogFill('cp-text', 'שרטוט המשכן');
      await app.sleep(200);
      await app.reset();
      const inserted = await app.clickDialog('הוסף כיתוב', { after: 2500 });
      const bad = await noise(app);
      const after = await snap(app);
      const seq = after.doc.match(/SEQ\s+איור[^"]*\\\*\s*ARABIC/) || after.doc.match(/SEQ\s+איור/);
      const capPara = after.doc.match(/<w:p [^>]*>(?:(?!<\/w:p>)[\s\S])*?w:pStyle w:val="Caption"[\s\S]*?<\/w:p>/);
      const hasBidi = capPara && /<w:bidi\/>/.test(capPara[0]);
      log('הוכנס:', inserted, '| SEQ:', JSON.stringify(seq), '| פסקת Caption:', !!capPara, '| bidi:', hasBidi, '| רעש:', bad || '(אין)');
      if (inserted && seq && capPara && hasBidi && !bad)
        report.pass('הוסף כיתוב', 'שדה SEQ איור \\* ARABIC נכתב בפסקת Caption עם <w:bidi/> (כיוון ימין-לשמאל)');
      else if (inserted && seq && capPara)
        report.partial('הוסף כיתוב', `נכתב אך bidi=${hasBidi}; רעש: ${bad || 'אין'}`);
      else report.fail('הוסף כיתוב', `לא נכתב כיתוב תקין. רעש: ${bad || 'אין'}`);
    });

    await step('הוסף כיתוב — עריכה (לא הכפלה)', async () => {
      // הממצא המרכזי של captions.ts: `update` גולמי היה מכפיל את הטקסט
      // ("אלף: בית: גימל"). המודול עוקף אותו בהסרה-והוספה. בודקים שהעריכה
      // שדרך הדיאלוג באמת מחליפה ולא מכפילה.
      await app.reset();
      const { clicked, on } = await clickChecked(app, 'הוסף כיתוב', { after: 800 });
      if (!clicked) {
        report.fail('הוסף כיתוב — עריכה', `הכפתור לא נמצא (${on.why})`);
        return;
      }
      await app.clickSel('.cp-list-item', 0, { after: 400 });
      await app.dialogFill('cp-text', 'תיאור חדש לגמרי');
      await app.sleep(200);
      await app.reset();
      const saved = await app.clickDialog('שמור שינויים', { after: 2500 });
      const bad = await noise(app);
      const after = await snap(app);
      const hasOld = /שרטוט המשכן/.test(after.doc);
      const hasNew = /תיאור חדש לגמרי/.test(after.doc);
      log('נשמר:', saved, '| הטקסט הישן עדיין קיים:', hasOld, '| הטקסט החדש קיים:', hasNew, '| רעש:', bad || '(אין)');
      if (saved && hasNew && !hasOld && !bad)
        report.pass('הוסף כיתוב — עריכה', 'הטקסט הוחלף, לא הוכפל — captions.update הגולמי לא נשלח (ראו engine/captions.ts)');
      else if (hasNew && hasOld) report.fail('הוסף כיתוב — עריכה', 'הטקסט הישן והחדש שניהם נמצאים — כיתוב שנכתב פעמיים');
      else report.fail('הוסף כיתוב — עריכה', `hasOld=${hasOld} hasNew=${hasNew}; רעש: ${bad || 'אין'}`);
      await app.clickDialog('סגור', { after: 500 });
    });

    await step('הוסף כיתוב — הסרה', async () => {
      await app.reset();
      await clickChecked(app, 'הוסף כיתוב', { after: 800 });
      await app.clickSel('.cp-list-item', 0, { after: 400 });
      await app.reset();
      const removed = await app.clickDialog('הסר כיתוב', { after: 2500 });
      const bad = await noise(app);
      const after = await snap(app);
      const gone = !/SEQ\s+איור/.test(after.doc);
      log('הוסר:', removed, '| נעלם:', gone, '| רעש:', bad || '(אין)');
      gone && !bad ? report.pass('הוסף כיתוב — הסרה', 'פסקת הכיתוב הוסרה כליל') : report.fail('הוסף כיתוב — הסרה', `gone=${gone}; רעש: ${bad || 'אין'}`);
      await app.clickDialog('סגור', { after: 500 }).catch(() => {});
    });
  } finally {
    app.close();
  }
}

/* ================================================================== */

const only = process.argv[2];
const sections = {
  toc: sectionToc,
  notes: sectionNotes,
  crossrefs: sectionCrossRefs,
  index: sectionIndex,
  citations: sectionCitations,
  captions: sectionCaptions,
};

for (const [key, fn] of Object.entries(sections)) {
  if (only && only !== key) continue;
  await fn();
}

report.print();
process.exit(0);
