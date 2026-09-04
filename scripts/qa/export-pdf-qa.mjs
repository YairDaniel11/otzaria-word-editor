/**
 * שער: „ייצוא ל-PDF" (`ui.exportPdf`, אוצריא 0.9.97).
 *
 * מודד את שלושת הדברים שאי אפשר לראות בבדיקת יחידה: שהפקד קיים ופעיל
 * ברצועה, שההכנה להדפסה רצה לפני הקריאה (זה מה שקובע מה ייכנס ל-PDF),
 * ושכל אחת מתשובות ה-Host מגיעה לשורת המצב בנוסח שלה.
 */
import { openApp, createReport } from './harness.mjs';

const report = createReport('ייצוא ל-PDF', { strict: true });
const app = await openApp({ name: 'exportpdf', port: Number(process.env.QA_PORT ?? 9530) });

const host = (expr) => app.js(`(function(){ var H = window.__qaHost; return ${expr}; })()`);

try {
  await app.cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false,
  });
  await app.sleep(400);
  await app.caret(0);
  await app.type('shalom');
  await app.sleep(900);

  await app.tab('קובץ');
  const state = await app.state('ייצוא ל-PDF');
  console.log('מצב הפקד:', JSON.stringify(state));
  state.found && !state.disabled
    ? report.pass('הפקד קיים ופעיל', JSON.stringify(state.rect))
    : report.fail('הפקד', JSON.stringify(state));

  /* ---------- שמירה ---------- */
  await app.js(`window.__qaHost.exportPdfReply = { saved: true, name: 'shalom.pdf' }`);
  await app.click('ייצוא ל-PDF');
  await app.sleep(1800);

  const calls = JSON.parse(await host('JSON.stringify(H.exportPdfCalls)'));
  console.log('מה נשלח ל-ui.exportPdf:', JSON.stringify(calls));
  calls.length === 1
    ? report.pass('נשלחה קריאה אחת', JSON.stringify(calls[0]))
    : report.fail('קריאות', JSON.stringify(calls));

  /* ---------- העימוד שנמסר לאוצריא ----------
   *
   * מול מה שאוצריא מקבלת ב-`_parsePdfLayout` (‏plugin_bridge_adapter.dart):
   * `pageSize` כמפה `{widthMm, heightMm}`, ‏10–5080 מ"מ לצד. שם קבוע גם הוא
   * מתקבל שם, אבל אנחנו מוסרים מידות — הן של המסמך, והן אלה שהוזרקו ל-`@page`
   * (ראו ExportPdfLayoutInput). השער דורש את מה שאנחנו באמת שולחים, ובתחום
   * שהגשר באמת מקבל.
   */
  const layout = calls[0] ?? {};
  const size = layout.pageSize;
  const sideOk = (mm) => typeof mm === 'number' && mm >= 10 && mm <= 5080;
  sideOk(size?.widthMm) && sideOk(size?.heightMm) &&
  layout.marginMm === 0 && layout.printBackgrounds === true
    ? report.pass('מידות הדף במ"מ, שוליים 0 ורקעים — בתחום שהגשר מקבל', JSON.stringify(size))
    : report.fail('עימוד', JSON.stringify(layout));

  const pageStyle = await app.js(
    `(function(){ var e = document.getElementById('otzaria-print-page'); return e ? e.textContent : null; })()`,
  );
  const sizeAttr = await app.js(`document.documentElement.dataset.printPageSize || null`);
  console.log('@page:', pageStyle, '| data-print-page-size:', sizeAttr);
  pageStyle && pageStyle.includes('@page') && sizeAttr
    ? report.pass('ההכנה להדפסה רצה לפני הקריאה', `${pageStyle} | ${sizeAttr}`)
    : report.fail('ההכנה להדפסה', `style=${pageStyle} attr=${sizeAttr}`);

  let status = await app.status();
  console.log('שורת מצב אחרי שמירה:', JSON.stringify(status));
  status && !status.error && String(status.text).includes('shalom.pdf')
    ? report.pass('הודעת ההצלחה נושאת את שם הקובץ', status.text)
    : report.fail('הודעת הצלחה', JSON.stringify(status));

  /* ---------- ביטול ---------- */
  await app.js(`window.__qaHost.exportPdfReply = { saved: false, name: null }`);
  await app.click('ייצוא ל-PDF');
  await app.sleep(1800);
  status = await app.status();
  console.log('שורת מצב אחרי ביטול:', JSON.stringify(status));
  status && !status.error && String(status.text).includes('בוטל')
    ? report.pass('ביטול אינו שגיאה אדומה', status.text)
    : report.fail('ביטול', JSON.stringify(status));

  /* ---------- כשל ---------- */
  await app.js(
    `window.__qaHost.exportPdfReply = { __throw: true, message: 'אין הרשאה', code: 'forbidden' }`,
  );
  await app.click('ייצוא ל-PDF');
  await app.sleep(1800);
  status = await app.status();
  console.log('שורת מצב אחרי forbidden:', JSON.stringify(status));
  status && status.error && String(status.text).includes('לחיצה ישירה')
    ? report.pass('`forbidden` מוסבר למשתמש', status.text)
    : report.fail('forbidden', JSON.stringify(status));

  console.log('לוג הדף:', JSON.stringify(await app.log()));
} finally {
  app.close();
}

process.exit(report.print() > 0 ? 1 : 0);
