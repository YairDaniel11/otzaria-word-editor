/**
 * שער העשן של המסגרת עצמה: מוכיח שהיא באמת פותחת מסמך, ממקמת סמן, לוחצת
 * לחיצה אמיתית על פקד ברצועה, ורואה את התוצאה ב-docx המיוצא.
 *
 * אם זה נכשל — כל שער אחר שמסתמך על המסגרת מודד רעש.
 */
import { openApp, createReport } from './harness.mjs';

const report = createReport('שער עשן — המסגרת', { strict: true });
const app = await openApp({ name: 'smoke', port: Number(process.env.QA_PORT ?? 9351) });

try {
  console.log('לשוניות:', await app.js('JSON.stringify(window.__qa.tabs())'));
  console.log('שורות במסמך:', await app.lineCount());

  await app.caret(0);
  await app.type('shalom');
  await app.sleep(800);
  const text = await app.screenText();
  console.log('טקסט על המסך:', JSON.stringify(text?.slice(0, 120)));
  text && text.includes('shalom') ? report.pass('הקלדה נכנסת למסמך') : report.fail('הקלדה', String(text).slice(0, 80));

  // סימון הטקסט שהוקלד, ואז מודגש
  await app.press('Home', 'Home', 36);
  await app.sleep(200);
  await app.extendSelection(6);
  console.log('בחירה:', JSON.stringify(await app.selection()));

  await app.tab('בית');
  const boldBefore = await app.state('מודגש');
  console.log('מצב „מודגש” לפני:', JSON.stringify(boldBefore));
  const clicked = await app.click('מודגש');
  await app.sleep(700);
  const boldAfter = await app.state('מודגש');
  console.log('מצב „מודגש” אחרי:', JSON.stringify(boldAfter));
  console.log('שורת מצב:', JSON.stringify(await app.status()));

  clicked ? report.pass('נמצא הכפתור „מודגש” ונלחץ') : report.fail('הכפתור „מודגש” לא נמצא');

  /*
    שם פקד נפתר בהתאמת קידומת על כל הדף, ולכן שער שקורא בשם עלול למדוד אלמנט
    אחר לגמרי — כך „הכפתור לא נמצא” נדווח על מוצר תקין. לשונית לשונית, כי
    גוף לשונית שאינה פעילה אינו ב-DOM כלל (`v-if`, Ribbon.vue:62,78) —
    „מצב מיקוד” שבלשונית „תצוגה” נפל באותה מלכודת בדיוק.
  */
  const tabLabels = (await app.tabs()).map((t) => t.label);
  const findings = [];
  const notes = [];
  const duplicates = [];
  let scanned = 0;
  for (const label of tabLabels) {
    await app.tab(label);
    const scan = await app.shadowed();
    scanned += scan.scanned;
    findings.push(...scan.findings);
    notes.push(...scan.notes);
    duplicates.push(...scan.duplicates);
  }
  await app.tab('בית');

  console.log('עמימות לגיטימית (מדידה):', JSON.stringify(notes));
  console.log('שמות שיש להם יותר מפקד נראה אחד:', JSON.stringify(duplicates));
  console.log('אלמנטים זרים שנושאים שם של פקד:', JSON.stringify(findings));
  findings.length === 0
    ? report.pass('שם הפקד נפתר לפקד עצמו', `${scanned} שמות ב-${tabLabels.length} לשוניות`)
    : report.fail(
        'אלמנט שאינו הפקד נושא את שמו',
        findings
          .map((f) => `${f.tab}/${f.name}: ${f.kind} ${f.el} ב-${f.at}${f.picked ? ' — וזה מה שהעזר מחזיר' : ''}`)
          .join(' | ')
          .slice(0, 400),
      );

  /*
    `opts.index` הוא סדר DOM, ומי שסומך עליו סומך על משהו שאינו רשום בשום מקום.
    scripts/qa/home-font-qa.mjs:363,396 לוחץ על „בחירת צבע” ב-0 ו-1 ומתכוון
    לסימון ולגופן — כאן זה נכתב, ונמדד מול הפקד שלפני כל חץ.
  */
  const INDEXED = [{ name: 'בחירת צבע', holders: ['צבע סימון טקסט', 'צבע גופן'] }];
  for (const want of INDEXED) {
    const got = duplicates.find((d) => d.name === want.name);
    got && got.holders.join('|') === want.holders.join('|')
      ? report.pass(`האינדקס של „${want.name}”`, want.holders.map((h, i) => `${i}=${h}`).join(', '))
      : report.fail(`האינדקס של „${want.name}”`, `נמצא ${JSON.stringify(got ? got.holders : null)} ולא ${JSON.stringify(want.holders)}`);
  }

  const files = await app.docx();
  if (!files) {
    report.fail('ייצוא docx', 'לא הוחזר קובץ');
  } else {
    const names = Object.keys(files);
    console.log('קבצים ב-docx:', names.join(', '));
    const doc = files['word/document.xml'] || '';
    console.log('document.xml (600 תווים):', doc.slice(0, 600));
    names.includes('word/document.xml') ? report.pass('ייצוא docx נקרא', `${names.length} קבצים`) : report.fail('ייצוא docx', names.join(','));
    /<w:b\b/.test(doc) ? report.pass('„מודגש” נכתב ל-OOXML') : report.fail('„מודגש” לא הופיע ב-document.xml');
    doc.includes('shalom') ? report.pass('הטקסט שהוקלד נמצא ב-docx') : report.fail('הטקסט שהוקלד אינו ב-docx');
  }

  console.log('לוג הדף:', JSON.stringify(await app.log()));
} finally {
  app.close();
}

process.exit(report.print() > 0 ? 1 : 0);
