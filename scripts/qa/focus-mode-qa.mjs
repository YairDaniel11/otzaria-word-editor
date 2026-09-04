/**
 * שער QA למצב מיקוד: **האם המסמך באמת מקבל את החלון**.
 *
 * מה שהשער הזה מקבע נמדד קודם כבאג: ההסתרה הייתה `opacity: 0`, הפסים שמרו על
 * מקומם בפריסה, ואזור המסמך נשאר בדיוק באותו גובה — מעליו נמתחה רצועה לבנה
 * בגובה 194 פיקסלים בחלון של 429. מבחוץ זה נראה כמו תצוגה תקועה שהלבינה.
 *
 * שלוש המדידות שאין להן תחליף ב-jsdom, ולכן השער הזה קיים:
 *   1. אחרי הכניסה — אזור המסמך מתחיל ב-0 ומגיע עד תחתית החלון.
 *   2. חשיפה בקצה מחזירה את הפסים **בלי להזיז את המסמך** (לוח צף, לא פס
 *      שדוחף) — כלומר בלי לפרוס מחדש את המסמך בכל ריחוף.
 *   3. יציאה מחזירה בדיוק את הגאומטריה שהייתה.
 *
 *   node scripts/qa/focus-mode-qa.mjs
 */
import { openApp, sleep } from './harness.mjs';

const PORT = Number(process.env.QA_PORT ?? 9411);
let failed = false;

function check(label, ok, detail) {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed = true;
}

/** מלבנים ומצב תצוגה של שלושת המשתתפים, בקריאה אחת. */
const SNAPSHOT = `JSON.stringify((() => {
  const box = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      height: Math.round(r.height),
      visibility: cs.visibility,
      position: cs.position,
    };
  };
  return {
    shell: document.querySelector('.word-app-shell')?.className ?? null,
    top: box('.shell-top'),
    area: box('.editor-area'),
    status: box('.word-statusbar'),
    exit: box('.focus-exit'),
    innerHeight: window.innerHeight,
  };
})())`;

async function main() {
  const page = await openApp({ name: 'focus-mode', port: PORT });
  /** תנועת עכבר בלבד — לא לחיצה: החשיפה תלויה ב-`pointermove`. */
  const moveTo = async (y) => {
    await page.cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: 400,
      y,
      button: 'none',
      buttons: 0,
    });
    await sleep(450);
  };

  try {
    const snap = async () => JSON.parse(await page.js(SNAPSHOT));

    const before = await snap();
    check(
      'לפני: הפסים בזרימה ואזור המסמך מתחיל מתחתיהם',
      before.top?.position === 'static' && before.area.top === before.top.bottom,
      `top=${before.top?.bottom} area=${before.area.top}`,
    );

    await page.press('F11', 'F11', 122);
    await sleep(800);
    const entered = await snap();

    check(
      'F11 מדליק את מצב המיקוד',
      entered.shell.includes('focus-mode'),
      entered.shell,
    );
    check(
      'אזור המסמך תופס את כל החלון',
      entered.area.top === 0 && entered.area.height === entered.innerHeight,
      `top=${entered.area.top} height=${entered.area.height} innerHeight=${entered.innerHeight}`,
    );
    check(
      'המסמך גדל בפועל — ולא נשאר באותו גובה עם רצועה לבנה מעליו',
      entered.area.height > before.area.height,
      `${before.area.height} → ${entered.area.height}`,
    );
    // ברירת המחדל פתוחה: כניסה שמעלימה הכול בבת אחת נראית כמו תקלה.
    check(
      'הכניסה מתחילה עם הלוח העליון פתוח',
      entered.shell.includes('reveal-top')
        && entered.top.top === 0
        && entered.top.visibility === 'visible',
      `top=${entered.top.top} visibility=${entered.top.visibility}`,
    );
    check(
      'כפתור היציאה על המסך',
      entered.exit !== null && entered.exit.visibility === 'visible',
      JSON.stringify(entered.exit),
    );

    // תנועה אל גוף המסמך — ורק אז ההסתרה.
    await moveTo(Math.round(entered.innerHeight / 2));
    const hidden = await snap();
    check(
      'תנועה אל גוף המסמך מסתירה את הלוח',
      !hidden.shell.includes('reveal-top')
        && hidden.top.bottom <= 0
        && hidden.top.visibility === 'hidden',
      `bottom=${hidden.top.bottom} visibility=${hidden.top.visibility}`,
    );
    check(
      'שורת המצב מחוץ למסך',
      hidden.status.top >= hidden.innerHeight && hidden.status.visibility === 'hidden',
      `top=${hidden.status.top} visibility=${hidden.status.visibility}`,
    );
    check(
      'ההסתרה לא הזיזה את המסמך',
      hidden.area.top === 0 && hidden.area.height === entered.area.height,
      `area.top=${hidden.area.top} height=${hidden.area.height}`,
    );

    await moveTo(4);
    const revealed = await snap();
    check(
      'ריחוף על הקצה העליון חושף שוב',
      revealed.shell.includes('reveal-top')
        && revealed.top.top === 0
        && revealed.top.visibility === 'visible',
      `top=${revealed.top.top} visibility=${revealed.top.visibility}`,
    );
    check(
      'החשיפה אינה מזיזה את המסמך — הלוח צף מעליו',
      revealed.area.top === 0 && revealed.area.height === entered.area.height,
      `area.top=${revealed.area.top} height=${revealed.area.height}`,
    );

    // מתחת לפסים שנחשפו, ולא רק מחוץ לרצועת ה-24 פיקסלים: זה מה שמפריד בין
    // „ההיסטרזיס עובד” לבין „הפסים נעלמו ברגע שהושטתי אליהם יד”.
    await moveTo(revealed.top.bottom + 60);
    const hiddenAgain = await snap();
    check(
      'הרחקה מהקצה מסתירה שוב',
      !hiddenAgain.shell.includes('reveal-top') && hiddenAgain.top.bottom <= 0,
      `bottom=${hiddenAgain.top.bottom}`,
    );

    await moveTo(Math.round(hiddenAgain.innerHeight - 4));
    const bottom = await snap();
    check(
      'ריחוף על הקצה התחתון חושף את שורת המצב',
      bottom.shell.includes('reveal-bottom')
        && bottom.status.bottom === bottom.innerHeight
        && bottom.status.visibility === 'visible',
      `bottom=${bottom.status.bottom} visibility=${bottom.status.visibility}`,
    );

    // היציאה נבדקת דרך הכפתור ולא דרך F11: הוא הדרך היחידה שאינה דורשת לדעת
    // קיצור, וזו בדיוק הסיבה שהוא קיים.
    await page.js('document.querySelector(".focus-exit").click()');
    await sleep(800);
    const after = await snap();
    check(
      'כפתור היציאה מחזיר את הגאומטריה שהייתה',
      !after.shell.includes('focus-mode')
        && after.exit === null
        && after.area.top === before.area.top
        && after.area.height === before.area.height,
      `top=${after.area.top} height=${after.area.height}`,
    );
  } finally {
    page.close();
  }

  if (failed) {
    console.error('\nהשער נכשל — ראו ✗ למעלה.');
    process.exit(1);
  }
  console.log('\nהשער עבר: מצב מיקוד מוסר את הפסים, המסמך מקבל את החלון, והחשיפה צפה מעליו.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
