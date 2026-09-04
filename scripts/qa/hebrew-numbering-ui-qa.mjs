/**
 * שער: מספור עברי דרך הממשק — בתפריט הרשימות ובדיאלוג מספור העמודים.
 *
 * שתי היכולות נפתחו במעבר ל-superdoc@2.10.0. עד אז `hebrew1` נכתב ל-XML
 * אבל הסמן צויר ריק, ו-`hebrew2` לא הוצע כלל; מספור עמודים עברי נזרק
 * בזמן ריצה. השער מודד את שתיהן במקום שבו המשתמש נוגע בהן.
 */
import { openApp, createReport } from './harness.mjs';

const report = createReport('מספור עברי — דרך הממשק', { strict: true });
const app = await openApp({ name: 'hebui', port: Number(process.env.QA_PORT ?? 9520) });

try {
  await app.cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false,
  });
  await app.sleep(400);

  /* ---------- רשימות ---------- */
  await app.caret(0);
  for (let i = 1; i <= 16; i += 1) {
    await app.type('p' + i);
    if (i < 16) await app.press('Enter', 'Enter', 13);
  }
  await app.sleep(1500);
  await app.tab('בית');
  await app.click('בחר הכל');
  await app.sleep(900);
  await app.click('מספור');
  await app.sleep(1400);

  // „רשימה" היה פקד שלישי לצד „תבליטים" ו„מספור", והוא אוחד לתוכם: הפעולות
  // יושבות עכשיו מאחורי החץ של הכפתור המפוצל שיצר את הרשימה.
  const menu = await app.click('פעולות מספור');
  await app.sleep(800);
  const labels = JSON.parse(await app.js(
    `JSON.stringify(Array.from(document.querySelectorAll('.ribbon-menu__item-label')).map(n=>n.textContent.trim()))`,
  ));
  console.log('תפריט „פעולות מספור":', JSON.stringify(labels));

  const gematria = labels.find((l) => l.includes('גימטריה'));
  const alefbet = labels.find((l) => l.includes('אלף־בית'));
  gematria && alefbet
    ? report.pass('שני סגנונות המספור העברי בתפריט', `${gematria} | ${alefbet}`)
    : report.fail('סגנונות המספור העברי בתפריט', `נמצא: ${JSON.stringify(labels)} (menu=${menu})`);

  const markersOf = () => app.js(
    `JSON.stringify(Array.from(document.querySelectorAll('[class*="list-marker"]')).map(n=>n.textContent))`,
  );

  for (const [label, expected] of [
    ['גימטריה', ['א.', 'י.', 'יא.', 'טו.', 'טז.']],
    ['אלף־בית', ['א.', 'י.', 'כ.', 'ס.', 'ע.']],
  ]) {
    // התפריט כבר פתוח מקריאת התוויות, ו-Escape אינו סוגר אותו — לכן פותחים
    // רק כשהוא באמת סגור. לחיצה על החץ כשהוא פתוח מקפלת אותו.
    if (!(await app.menuOpen())) {
      await app.click('פעולות מספור');
      await app.sleep(700);
    }
    const wanted = labels.find((l) => l.includes(label));
    const picked = await app.clickMenu(wanted);
    await app.sleep(1600);
    const markers = JSON.parse(await markersOf()).map((m) => m.replace(/‏/g, ''));
    console.log(`${label} →`, JSON.stringify(markers));
    const missing = expected.filter((e) => !markers.includes(e));
    missing.length === 0
      ? report.pass(`סמני „${label}" מצוירים`, markers.slice(0, 16).join(' '))
      : report.fail(`סמני „${label}"`, `חסרים ${missing.join(',')} | נמצא ${markers.join(' ')} (picked=${picked})`);
  }

  /* ---------- מספור עמודים ---------- */
  await app.tab('פריסה');
  await app.click('מספור עמודים');
  await app.sleep(900);
  const opts = JSON.parse(await app.js(
    `JSON.stringify(Array.from(document.querySelectorAll('#pn-format option')).map(o=>({v:o.value,t:o.textContent.trim()})))`,
  ));
  console.log('אפשרויות הדיאלוג:', JSON.stringify(opts));
  const ids = opts.map((o) => o.v);
  ids.includes('hebrew1') && ids.includes('hebrew2')
    ? report.pass('שני הפורמטים העבריים בדיאלוג', opts.filter((o) => o.v.startsWith('hebrew')).map((o) => `${o.v}=${o.t}`).join(' | '))
    : report.fail('הפורמטים העבריים בדיאלוג', JSON.stringify(ids));

  for (const fmt of ['hebrew1', 'hebrew2']) {
    await app.js(`(function(){
      var s = document.querySelector('#pn-format');
      var setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(s, '${fmt}');
      s.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await app.sleep(300);
    const ok = JSON.parse(await app.js(`(function(){
      var b = Array.from(document.querySelectorAll('button')).find(function(x){return x.textContent.trim()==='אישור';});
      if(!b) return 'null'; var r=b.getBoundingClientRect();
      return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2});
    })()`));
    await app.clickAt(ok.x, ok.y);
    await app.sleep(1600);

    const doc = (await app.docx())['word/document.xml'] || '';
    const m = doc.match(/<w:pgNumType[^>]*\/>/);
    console.log(`${fmt} →`, m ? m[0] : '(אין)');
    m && m[0].includes(fmt)
      ? report.pass(`מספור עמודים ← ${fmt}`, m[0])
      : report.fail(`מספור עמודים ← ${fmt}`, m ? m[0] : 'לא נכתב pgNumType');

    if (fmt === 'hebrew1') {
      await app.click('מספור עמודים');
      await app.sleep(900);
      const reread = await app.js(`(function(){var s=document.querySelector('#pn-format');return s?s.value:null;})()`);
      console.log('קריאה חוזרת של הדיאלוג:', reread);
      reread === 'hebrew1'
        ? report.pass('הדיאלוג קורא בחזרה מספור עברי מהמסמך', reread)
        : report.fail('קריאה חוזרת', `הוצג „${reread}" במקום hebrew1`);
    }
  }

  console.log('לוג הדף:', JSON.stringify(await app.log()));
} finally {
  app.close();
}

process.exit(report.print() > 0 ? 1 : 0);
