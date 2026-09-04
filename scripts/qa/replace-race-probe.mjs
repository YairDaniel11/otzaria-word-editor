/**
 * מבודד את המרוץ ב-`ui.search` של המנוע: מה צריך להתייצב לפני ההחלפה —
 * מניין ההתאמות, או הפרויקציה של המסמך אחרי ההקלדה.
 *
 * ## מה זה מודד, ומה זה **אינו** מודד
 *
 * המשטח כאן הוא `ui.search` של SuperDoc. **האפליקציה אינה משתמשת בו.**
 * `engine/search.ts` ו-`engine/text-search.ts` מממשים חיפוש-והחלפה עצמאיים
 * מעל `doc.blocks.list` ו-`doc.replace`, בדיוק מפני שהמשטח הזה אינו אמין
 * (`docs/button-audit.md`, „תוקן — חיפוש-והחלפה עצמאי"). „החלף הכל" של
 * המשתמש נמדד ב-replace-ui-probe ובחבריו, לא כאן.
 *
 * השער הזה נשאר כדי לשמור על **הנימוק** לנטישה. אם המרוץ ייעלם יום אחד,
 * זה הסימן שאפשר לשקול מחדש — ולכן הוא נופל גם על שיפור, ולא רק על רגרסיה.
 *
 * ## למה זה לא „שער אדום"
 *
 * הגרסה הקודמת דרשה 8/8 בכל ארבעת המקרים, כולל בשניים שכל תכליתם להדגים
 * שבלי פולינג ההחלפה **לא** מלאה. כלומר היא נכשלה על התוצאה שהיא נועדה
 * למדוד, והפילה את `verify:qa` לצמיתות — שער שנופל תמיד אינו מאותת דבר.
 * עכשיו כל מקרה מצהיר על התוצאה הצפויה שלו, וכשל פירושו שהמנוע השתנה.
 */
import { openApp, createReport } from './harness.mjs';

const report = createReport('מרוץ „החלף הכל"', { strict: true });
const count = (s, n) => s.split(n).length - 1;
const NEEDLE = 'zzq';

async function run(label, { sleepAfterTyping, settlePoll, expectFull }) {
  const app = await openApp({ name: 'race' + label, port: Number(process.env.QA_PORT ?? 9494) });
  try {
    await app.caret(0);
    await app.type((NEEDLE + ' ').repeat(8).trim());
    await app.sleep(sleepAfterTyping);

    const res = await app.js(`(async function(){
      var E = window.__otzariaEditor, sd = E.superdoc;
      var s = (E.ui && E.ui.search) || (sd.ui && sd.ui.search);
      var sleep = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
      s.open && s.open();
      var first = (typeof s.find === 'function') ? s.find('${NEEDLE}') : s.search('${NEEDLE}');
      var trail = [first && first.total];
      if (${settlePoll}) {
        for (var i = 0; i < 40; i++) {
          await sleep(100);
          var t = s.getSnapshot().total;
          trail.push(t);
          if (t > 0 && trail[trail.length-1] === trail[trail.length-2]) break;
        }
      }
      var atReplace = s.getSnapshot().total;
      var r = await s.replaceAll('YYY');
      await sleep(800);
      return JSON.stringify({ trail: trail, atReplace: atReplace, r: r });
    })()`);
    await app.sleep(1200);
    const files = await app.docx();
    const doc = files['word/document.xml'] || '';
    const left = count(doc, NEEDLE), put = count(doc, 'YYY');
    const log = await app.log();
    console.log(`[${label}] sleepAfterTyping=${sleepAfterTyping} settlePoll=${settlePoll}`);
    console.log(`   ${res}`);
    console.log(`   → נשארו ${left}, הוחלפו ${put} מתוך 8`);
    if (log && log.length) console.log(`   לוג: ${JSON.stringify(log).slice(0, 300)}`);
    const full = left === 0 && put === 8;
    if (full === expectFull) {
      report.pass(label, expectFull ? '8/8, כצפוי' : `חלקי כצפוי — נשארו ${left}, הוחלפו ${put}`);
    } else if (full) {
      // שיפור במנוע, לא כשל אצלנו — אבל הוא מבטל את הנימוק לעקיפה, ולכן
      // הוא חייב להישמע.
      report.fail(label, 'הוחלפו 8/8 בלי פולינג — המרוץ ב-ui.search נעלם; לשקול מחדש את העקיפה ב-engine/search.ts');
    } else {
      report.fail(label, `צפוי 8/8 ולא התקבל — נשארו ${left}, הוחלפו ${put}`);
    }
  } finally { app.close(); }
}

// `expectFull` הוא הממצא: מה שקובע הוא הפולינג על מניין ההתאמות, ולא המתנה
// אחרי ההקלדה. המתנה של 1200ms אינה עוזרת בלעדיו (ג), ובלי המתנה כלל הוא
// מספיק (ב) — כלומר מה שאינו מתייצב הוא המניין, לא הפרויקציה.
await run('א־בלי־המתנה־בלי־פולינג', { sleepAfterTyping: 0, settlePoll: false, expectFull: false });
await run('ב־בלי־המתנה־עם־פולינג', { sleepAfterTyping: 0, settlePoll: true, expectFull: true });
await run('ג־עם־המתנה־בלי־פולינג', { sleepAfterTyping: 1200, settlePoll: false, expectFull: false });
await run('ד־עם־המתנה־עם־פולינג', { sleepAfterTyping: 1200, settlePoll: true, expectFull: true });

process.exit(report.print() > 0 ? 1 : 0);
