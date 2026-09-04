/**
 * אחרי "החלף"/"החלף הכל" מוצלח אחד, הכפתורים חוזרים להיות פעילים **מיד**
 * — לא רק אחרי פעולה לא-קשורה שמזכה ב-emit() טרי.
 *
 * הרגרסייה שנמדדה: `mutateOne`/`mutateAll` (engine/search.ts) חישבו את
 * ה-snapshot המוחזר *בתוך* ה-try, לפני שה-`finally` הפך את `isReplacing`
 * ל-`false` — כלומר ה-outcome המוחזר קפא עם `isReplacing:true`, אף
 * שה-state הפנימי (וה-emit() הפנימי) כבר תוקנו. `reportReplace` ב-App.vue
 * דורס את `searchState.value` בערך המקורי (`outcome.snapshot`) בהצלחה —
 * ולכן `searchState.value.isReplacing` נשאר `true` לצמיתות, וכפתורי
 * "החלף"/"החלף הכל" נשארים מנוטרלים (`:disabled="!searchQuery ||
 * isReplacing"` ב-FindReplaceDialog.vue) עד שפעולה אחרת (הקלדה, "מצא
 * הבא") מפעילה emit() נוסף שמתקן את זה בטעות.
 *
 * השער הזה בודק בדיוק את זה: לחיצה בודדת על "החלף" ועל "החלף הכל",
 * בלי אף פעולה נוספת אחריה, ואימות שהכפתורים לא disabled.
 */
import { openApp, createReport } from './harness.mjs';

const report = createReport('כפתורי החלפה חוזרים לפעילים מיד', { strict: true });
const app = await openApp({ name: 'replreenable', port: Number(process.env.QA_PORT ?? 9505) });

/** הטקסט של כל פסקה ב-document.xml — ההוכחה לאן נכתבה הזריעה. */
const paraTexts = (files) =>
  ((files?.['word/document.xml'] ?? '').match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g) ?? []).map((p) =>
    (p.match(/<w:t[^>]*>[\s\S]*?<\/w:t>/g) ?? [])
      .map((t) => t.replace(/<[^>]+>/g, '').replace(/[\u200e\u200f\ufeff]/g, ''))
      .join(''),
  );

/**
 * `disabled` של כפתור **הפעולה** בכותרת התחתונה (`.fr-footer .fr-btn`),
 * לפי הטקסט שלו — לא `app.dialog()`'s controls הגנרי: "החלף" הוא גם שם
 * לשונית ה-mode בכותרת (`.fr-tabs .fr-tab`, תמיד פעילה) וגם שם כפתור
 * הפעולה בתחתית (`.fr-footer .fr-btn`, זה שתלוי ב-`isReplacing`) — לשניהם
 * אותו textContent, ו-`find` לפי טקסט בלבד תופס את הראשון (הלשונית),
 * לא את הרלוונטי. שאילתה ישירה על `.fr-footer .fr-btn` חדה בין השניים.
 */
async function footerButtonDisabled(label) {
  return app.js(`(function(){
    var btns = Array.prototype.slice.call(document.querySelectorAll('.find-replace-dialog .fr-footer .fr-btn'));
    var el = btns.find(function(b){ return b.textContent.trim() === ${JSON.stringify(label)}; });
    return el ? !!el.disabled : null;
  })()`);
}

try {
  await app.cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1600,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await app.sleep(400);

  const fill = async (sel, value) => app.js(`(function(){
    var el = document.querySelector('${sel}');
    if (!el) return 'no-el';
    var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return 'ok';
  })()`);

  const clickDialogButton = async (label) => {
    const btns = JSON.parse(
      await app.js(
        `JSON.stringify(Array.from(document.querySelectorAll('.find-replace-dialog .fr-btn')).map(x=>x.textContent.trim()))`,
      ),
    );
    const idx = btns.indexOf(label);
    if (idx < 0) throw new Error(`כפתור "${label}" לא נמצא. כפתורים: ${JSON.stringify(btns)}`);
    const rect = JSON.parse(
      await app.js(
        `(function(){var el=document.querySelectorAll('.find-replace-dialog .fr-btn')[${idx}];var r=el.getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2});})()`,
      ),
    );
    await app.clickAt(rect.x, rect.y);
  };

  // --- תרחיש א: "החלף" בודד ---
  await app.caret(0);
  await app.type('zzq one zzq two');
  await app.sleep(600);

  await app.tab('בית');
  const openedReplace = await app.click('החלפה');
  if (!openedReplace) throw new Error('כפתור "החלפה" לא נמצא ברצועה');
  await app.sleep(600);

  console.log('שדה חיפוש:', await fill('#fr-search-input', 'zzq'));
  console.log('שדה החלפה:', await fill('#fr-replace-input', 'YYY'));
  await app.sleep(900); // השקטת חיפוש-בזמן-הקלדה

  console.log(
    'מצב לפני "החלף":',
    'החלף=', await footerButtonDisabled('החלף'),
    '| החלף הכל=', await footerButtonDisabled('החלף הכל'),
  );

  await clickDialogButton('החלף');
  // בכוונה בלי פעולה נוספת אחרי — זו בדיוק הנקודה שנבדקת. המתנה קצרה
  // בלבד לכך שה-Promise של ההחלפה יתיישב (blocks.list + doc.replace).
  await app.sleep(500);

  const singleDisabled = await footerButtonDisabled('החלף');
  const singleAllDisabled = await footerButtonDisabled('החלף הכל');
  console.log('מצב אחרי "החלף" (בלי פעולה נוספת): החלף=', singleDisabled, '| החלף הכל=', singleAllDisabled);

  if (singleDisabled === false && singleAllDisabled === false) {
    report.pass('אחרי "החלף" בודד — הכפתורים פעילים מיד', 'לא נדרשה פעולה נוספת');
  } else {
    report.fail(
      'אחרי "החלף" בודד — כפתור נשאר מנוטרל',
      `"החלף".disabled=${singleDisabled}, "החלף הכל".disabled=${singleAllDisabled}`,
    );
  }

  // --- תרחיש ב: "החלף הכל" ---
  await app.escape();
  await app.sleep(300);
  /*
    הפסקה היחידה שבמסמך — זו של תרחיש א. השורה הזאת הייתה `caret(1)` עם ההערה
    „השורה השנייה”, ושתי הטענות שגויות: אין פסקה שנייה בשלב הזה, ואינדקס 1 הוא
    ה-`.superdoc-line` שמקונן בפסקה הראשונה. הטקסט של תרחיש ב חייב להיכנס
    לפסקה **חדשה** אחריה, ולא לפצל אותה באמצע.
  */
  const beforeSplit = paraTexts(await app.docx());
  await app.caretPara(0);
  await app.press('End', 'End', 35);
  await app.press('Enter', 'Enter', 13);
  await app.sleep(200);
  await app.type('zzq2 three zzq2 four');
  await app.sleep(600);

  const afterSplit = paraTexts(await app.docx());
  console.log('פסקאות לפני הפיצול:', JSON.stringify(beforeSplit), '| אחרי:', JSON.stringify(afterSplit));
  if (afterSplit.length === beforeSplit.length + 1 && afterSplit[0] === beforeSplit[0] && afterSplit[1] === 'zzq2 three zzq2 four') {
    report.pass('הזריעה של תרחיש ב נכתבה לפסקה חדשה', JSON.stringify(afterSplit));
  } else {
    report.fail(
      'הזריעה של תרחיש ב לא נכתבה לפסקה חדשה — הסמן לא היה בסוף הפסקה שנבחרה',
      `לפני ${JSON.stringify(beforeSplit)} אחרי ${JSON.stringify(afterSplit)}`,
    );
  }

  await app.click('החלפה');
  await app.sleep(600);
  console.log('שדה חיפוש (ב):', await fill('#fr-search-input', 'zzq2'));
  console.log('שדה החלפה (ב):', await fill('#fr-replace-input', 'ZZZ'));
  await app.sleep(900);

  await clickDialogButton('החלף הכל');
  await app.sleep(500);

  const allDisabled = await footerButtonDisabled('החלף הכל');
  const allSingleDisabled = await footerButtonDisabled('החלף');
  console.log('מצב אחרי "החלף הכל" (בלי פעולה נוספת): החלף הכל=', allDisabled, '| החלף=', allSingleDisabled);

  if (allDisabled === false && allSingleDisabled === false) {
    report.pass('אחרי "החלף הכל" — הכפתורים פעילים מיד', 'לא נדרשה פעולה נוספת');
  } else {
    report.fail(
      'אחרי "החלף הכל" — כפתור נשאר מנוטרל',
      `"החלף הכל".disabled=${allDisabled}, "החלף".disabled=${allSingleDisabled}`,
    );
  }

  console.log('שורת מצב:', JSON.stringify(await app.status()));
  console.log('לוג הדף:', JSON.stringify(await app.log()).slice(0, 500));
} finally {
  app.close();
}

process.exit(report.print() > 0 ? 1 : 0);
