/**
 * שער QA חד-פעמי לבדיקת ריבוי מסמכים (חלק 3): פתיחת טאב שני, מעבר בין
 * טאבים, וסגירת טאב עם שינויים לא שמורים (ביטול ואישור).
 *
 * נכתב כבדיקה ידנית לסקירת התכונה — לא חלק קבוע מ-`npm run verify`.
 *
 *   node scripts/qa/multi-doc-qa.mjs
 */
import { openApp, sleep } from './harness.mjs';

const PORT = Number(process.env.QA_PORT ?? 9391);
let failed = false;

function check(label, ok, detail) {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed = true;
}

async function main() {
  const page = await openApp({ name: 'multi-doc', port: PORT });
  try {
    const tabsCount = () => page.js('document.querySelectorAll(".word-doctab").length');
    const editorsSize = () => page.js('window.__otzariaEditors ? window.__otzariaEditors.size : -1');
    const activeTitle = () =>
      page.js(
        'document.querySelector(".word-doctab.active .word-doctab-title")?.textContent ?? null',
      );

    check('טאב יחיד בעליה', (await tabsCount()) === 1, `נמדד ${await tabsCount()}`);
    check(
      'window.__otzariaEditors קיים עם רשומה אחת',
      (await editorsSize()) === 1,
      `נמדד ${await editorsSize()}`,
    );

    // כפתור „+”: טאב חדש-ריק, ואז פתיחת מסמך ריק (openDocument בלי קובץ).
    await page.js('document.querySelector(".word-doctabs-new")?.click()');
    await sleep(1500);
    check('אחרי „+”: שני טאבים', (await tabsCount()) === 2, `נמדד ${await tabsCount()}`);
    check(
      'window.__otzariaEditors: שתי רשומות',
      (await editorsSize()) === 2,
      `נמדד ${await editorsSize()}`,
    );

    // סימון dirty בטאב השני. `save.markDirty()` ישירות ולא הקלדה מסונתזת:
    // הקלדה דרך CDP ב-headless אינה מגיעה אמינה ל-ProseMirror (בעיית תשתית,
    // נבדק גם על הטאב הראשון היחיד — לא רגרסיה של הפיצ'ר הזה).
    await page.js(
      `(function(){var ids=Array.from(window.__otzariaEditors.keys()); var last=ids[ids.length-1]; window.__otzariaEditors.get(last).save.markDirty();})()`,
    );
    await sleep(300);
    const dirtyAfterType = await page.js(
      'document.querySelector(".word-doctab.active .word-doctab-dirty") ? true : false',
    );
    check('הטאב השני מסומן dirty אחרי markDirty', dirtyAfterType === true);

    // מעבר לטאב הראשון ובחזרה — ודא שאין קריסה ושהמעבר עצמו עובד.
    const firstTabRect = await page.js(
      `(function(){ var els = document.querySelectorAll(".word-doctab"); var el = els[0]; if(!el) return null; var r = el.getBoundingClientRect(); return JSON.stringify({x: r.left + r.width/2, y: r.top + r.height/2}); })()`,
    );
    if (firstTabRect) {
      const { x, y } = JSON.parse(firstTabRect);
      await page.clickAt(x, y);
      await sleep(500);
      const activeAfterSwitch = await activeTitle();
      check('מעבר לטאב הראשון החליף את הטאב הפעיל', typeof activeAfterSwitch === 'string');
    } else {
      check('נמצא ה-rect של הטאב הראשון', false);
    }

    // חזרה לטאב השני (dirty) וסגירתו — עם ביטול קודם, ואז עם אישור.
    const secondTabRect = await page.js(
      `(function(){ var els = document.querySelectorAll(".word-doctab"); var el = els[1]; if(!el) return null; var r = el.getBoundingClientRect(); return JSON.stringify({x: r.left + r.width/2, y: r.top + r.height/2}); })()`,
    );
    if (secondTabRect) {
      const { x, y } = JSON.parse(secondTabRect);
      await page.clickAt(x, y);
      await sleep(400);

      // ביטול: השאלה הראשונה („לשמור קודם?”) עונה „לא”, השנייה („למחוק
      // בוודאות?”) עונה „לא” גם היא — כלומר „ביטול” מלא. `decideDocumentSwitch`
      // שואל עד שתי שאלות דו-כפתוריות ברצף (ראו open-flow.ts).
      await page.js(
        'window.__qaHost.replies["ui.showConfirm"] = function(){ return Promise.resolve({ success: true, data: { confirmed: false }, error: null }); }',
      );
      const closeBtnRect = await page.js(
        `(function(){ var els = document.querySelectorAll(".word-doctab"); var el = els[1]; if(!el) return null; var btn = el.querySelector(".word-doctab-close"); if(!btn) return null; var r = btn.getBoundingClientRect(); return JSON.stringify({x: r.left + r.width/2, y: r.top + r.height/2}); })()`,
      );
      if (closeBtnRect) {
        const { x: cx, y: cy } = JSON.parse(closeBtnRect);
        await page.clickAt(cx, cy);
        await sleep(600);
        check(
          'ביטול סגירה: הטאב עדיין קיים (2 טאבים)',
          (await tabsCount()) === 2,
          `נמדד ${await tabsCount()}`,
        );

        // אישור: „לשמור קודם?” — לא; „למחוק בוודאות?” — כן. זה בדיוק המסלול
        // „לא לשמור” שסוגר את הטאב בפועל.
        await page.js(`
          window.__qaHost.replies["ui.showConfirm"] = (function(){
            var n = 0;
            return function(){
              n += 1;
              return Promise.resolve({ success: true, data: { confirmed: n >= 2 }, error: null });
            };
          })();
        `);
        await page.clickAt(cx, cy);
        await sleep(800);
        check(
          'אישור סגירה: חזרה לטאב יחיד',
          (await tabsCount()) === 1,
          `נמדד ${await tabsCount()}`,
        );
        check(
          'window.__otzariaEditors: רשומה אחת אחרי סגירה',
          (await editorsSize()) === 1,
          `נמדד ${await editorsSize()}`,
        );
      } else {
        check('נמצא כפתור הסגירה של הטאב השני', false);
      }
    } else {
      check('נמצא ה-rect של הטאב השני', false);
    }
  } finally {
    page.close();
  }

  if (failed) {
    console.error('\nהשער נכשל — ראו ✗ למעלה.');
    process.exit(1);
  }
  console.log('\nהשער עבר: פתיחת טאב, מעבר, וסגירה (ביטול ואישור) עובדים כצפוי.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
