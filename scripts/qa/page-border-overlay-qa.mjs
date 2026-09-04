/**
 * שער QA ממוקד: „גבולות עמוד” — לא רק ש-<w:pgBorders> נכתב ל-docx (זה כבר
 * נמדד ב-scripts/qa/layout-qa.mjs, stage `borders`), אלא שיש בפועל קופסת גבול
 * מצוירת ב-DOM (src/ui/shell/PageBorderOverlay.vue + src/engine/page-border-layer.ts),
 * שהיא ממוקמת נכון מול מלבן העמוד (`[data-page-index]`, engine/page-ruler.ts),
 * שהיא מתעדכנת חי בלי רענון דף, ששורדת גלילה ושינוי גודל חלון, ושמכסה כל עמוד
 * במסמך רב-עמודי.
 *
 * „success: true” ו„נראה שזה עובד” אינם הוכחה כאן. ההוכחה היא מדידת
 * getBoundingClientRect + getComputedStyle בפועל, מול הנוסחה שהמודול עצמו
 * מתעד (page-border-layer.ts): `px = eighths/8 * 96/72` לעובי הקו,
 * `px = points * 96/72` למרחק מקצה הדף (`w:space`, offsetFrom:'page').
 *
 * הרצה:
 *   node scripts/qa/page-border-overlay-qa.mjs
 * יציאה 9368 בלבד — שערים מקבילים רצים על יציאות אחרות (ראו layout-qa.mjs).
 */
import { openApp, createReport, sleep } from './harness.mjs';

const PORT = Number(process.env.QA_PORT ?? 9368);
const report = createReport('גבולות עמוד — ציור בפועל בעורך', { strict: true });

const PX_PER_POINT = 96 / 72; // נקודה = 96/72 פיקסל CSS (96dpi)
const eighthsToPx = (e) => Math.max(0.5, (e / 8) * PX_PER_POINT);
const pointsToPx = (p) => p * PX_PER_POINT;
const TOL = 2.5; // סבילות פיקסלים: עיגול תת-פיקסל של הדפדפן, לא סטייה אמיתית

function near(a, b, tol = TOL) {
  return typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tol;
}

const CSS_STYLE_OF = { single: 'solid', double: 'double', dashed: 'dashed', dotted: 'dotted' };

const app = await openApp({ name: 'border-overlay', port: PORT });

await app.cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 1600,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});
await app.sleep(1200);

/** מלבני כל העמודים המצוירים ומלבני קופסאות ה-overlay, באותו סדר DOM. */
async function geometry() {
  const raw = await app.js(`(function () {
    function rectsOf(sel) {
      return Array.prototype.map.call(document.querySelectorAll(sel), function (el) {
        var r = el.getBoundingClientRect();
        var cs = getComputedStyle(el);
        return {
          left: r.left, top: r.top, width: r.width, height: r.height,
          borderTopWidth: parseFloat(cs.borderTopWidth), borderTopStyle: cs.borderTopStyle,
          borderTopColor: cs.borderTopColor,
        };
      });
    }
    var overlayRoot = document.querySelector('.page-border-layer');
    return JSON.stringify({
      pages: rectsOf('[data-page-index]'),
      boxes: rectsOf('.page-border-layer__page'),
      overlayExists: !!overlayRoot,
      overlayChildren: overlayRoot ? overlayRoot.children.length : -1,
    });
  })()`);
  return JSON.parse(raw);
}

/** בוחרת פריט בתפריט „גבולות עמוד”, ומחזירה אם הלחיצה הצליחה. */
async function setBorder(label) {
  const items = await app.openMenu('גבולות עמוד');
  if (!items) return { ok: false, reason: 'הכפתור „גבולות עמוד” לא נמצא/מנוטרל' };
  const labels = items.map((i) => i.label);
  if (!labels.includes(label)) {
    await app.escape();
    return { ok: false, reason: `הפריט „${label}” אינו בתפריט (${labels.join(' | ')})` };
  }
  const clicked = await app.clickMenu(label, { after: 900 });
  return { ok: clicked, reason: clicked ? '' : `לא ניתן ללחוץ על „${label}”` };
}

/** בדיקת גיאומטריה+סגנון של קופסה אחת מול מלבן העמוד שלה. */
function checkBoxAgainstPage(page, box, expect) {
  const bad = [];
  const insetTop = pointsToPx(24);
  const insetSide = pointsToPx(24);
  if (!near(box.left, page.left + insetSide)) bad.push(`left=${box.left.toFixed(1)} (צפוי ${(page.left + insetSide).toFixed(1)})`);
  if (!near(box.top, page.top + insetTop)) bad.push(`top=${box.top.toFixed(1)} (צפוי ${(page.top + insetTop).toFixed(1)})`);
  if (!near(box.width, page.width - 2 * insetSide)) bad.push(`width=${box.width.toFixed(1)} (צפוי ${(page.width - 2 * insetSide).toFixed(1)})`);
  if (!near(box.height, page.height - 2 * insetTop)) bad.push(`height=${box.height.toFixed(1)} (צפוי ${(page.height - 2 * insetTop).toFixed(1)})`);
  if (box.borderTopStyle !== expect.style) bad.push(`borderTopStyle=${box.borderTopStyle} (צפוי ${expect.style})`);
  // סבילות 0.45px: Chrome (DPR=1) מעגל עובי גבול תת-פיקסלי (0.667px, sz=4)
  // ל-1px **בעת ציור**, אבל ה-inline style שהרכיב כותב מדויק (נמדד: 0.666667px) —
  // זו התנהגות רינדור של הדפדפן, לא סטייה בחשבון של page-border-layer.ts.
  if (!near(box.borderTopWidth, expect.widthPx, 0.45)) bad.push(`borderTopWidth=${box.borderTopWidth} (צפוי ${expect.widthPx.toFixed(2)})`);
  if (box.borderTopColor === 'rgba(0, 0, 0, 0)' || box.borderTopColor === '') bad.push('borderTopColor שקוף — אין קו נראה בפועל');
  return bad;
}

try {
  await app.caret(0);
  await app.tab('פריסה');

  /* ---------------- שלב 1: גיאומטריה+סגנון לכל סוג קו, על מסמך קצר ---------------- */
  const cases = [
    ['קו יחיד', { sz: 4, style: 'single' }],
    ['קו עבה', { sz: 24, style: 'single' }],
    ['קו כפול', { sz: 6, style: 'double' }],
    ['מקווקו', { sz: 4, style: 'dashed' }],
    ['מנוקד', { sz: 4, style: 'dotted' }],
  ];

  // כל הלולאה הזאת רצה **בלי** app.reset() ובלי רענון דף בין הבחירות — כלומר
  // כל מדידה כאן היא כשלעצמה עדות לעדכון חי: אם הקופסה הבאה תואמת את הסגנון
  // החדש (ולא את הקודם), השכבה הגיבה לשינוי התפריט בלי לטעון מסמך מחדש.
  let prevWidthPx = null;
  let liveUpdateBroken = false;
  let liveUpdateCompared = false;
  for (const [label, want] of cases) {
    const picked = await setBorder(label);
    if (!picked.ok) {
      report.fail(`ציור: ${label}`, picked.reason);
      continue;
    }
    const g = await geometry();
    if (!g.overlayExists) {
      report.fail(`ציור: ${label}`, 'האלמנט .page-border-layer אינו קיים ב-DOM בכלל');
      continue;
    }
    if (g.pages.length === 0) {
      report.fail(`ציור: ${label}`, 'אין אף עמוד עם data-page-index — לא ניתן למדוד');
      continue;
    }
    if (g.boxes.length !== g.pages.length) {
      report.fail(`ציור: ${label}`, `מספר קופסאות (${g.boxes.length}) שונה ממספר עמודים (${g.pages.length})`);
      continue;
    }
    const expectedWidthPx = eighthsToPx(want.sz);
    const expect = { widthPx: expectedWidthPx, style: CSS_STYLE_OF[want.style] };
    const bad = checkBoxAgainstPage(g.pages[0], g.boxes[0], expect);
    report[bad.length ? 'fail' : 'pass'](
      `ציור: ${label}`,
      bad.length
        ? bad.join('; ')
        : `box=${JSON.stringify(g.boxes[0])} page=${JSON.stringify(g.pages[0])}`,
    );
    // עדכון חי אמיתי-לרוע: אם עובי הקו הקודם נשאר במקום הנוכחי (בלי app.reset()),
    // השכבה לא הגיבה לבחירה החדשה — זה בדיוק הבאג שהיה קודם ("success: true"
    // בלי ציור). נבדק רק כשהעובי הצפוי אכן שונה מהקודם.
    if (prevWidthPx !== null && !near(prevWidthPx, expectedWidthPx, 0.05)) {
      liveUpdateCompared = true;
      const stale = near(g.boxes[0].borderTopWidth, prevWidthPx, 0.1) && !near(g.boxes[0].borderTopWidth, expectedWidthPx, 0.45);
      if (stale) liveUpdateBroken = true;
    }
    prevWidthPx = expectedWidthPx;
  }
  // אם אף מקרה לא הגיע להשוואה בפועל (למשל כי כל הבחירות ציירו 0 קופסאות —
  // ראו „ציור: <שם>” למעלה), אין כאן שום עדות ל„חי” ואסור לדווח „עובד” כברירת
  // מחדל: זה בדיוק הבאג שהיה קודם (success:true בלי ציור).
  if (!liveUpdateCompared) {
    report.skip(
      'עדכון חי — כל הבחירות רצו בלי app.reset()/רענון דף',
      'אף מקרה לא הגיע להשוואה בפועל — ראו „ציור: …” למעלה',
    );
  } else {
    report[liveUpdateBroken ? 'fail' : 'pass'](
      'עדכון חי — כל הבחירות רצו בלי app.reset()/רענון דף',
      liveUpdateBroken
        ? 'לפחות בחירה אחת הראתה את עובי הקו הקודם ולא את החדש'
        : `${cases.length} סגנונות שונים נבדקו ברצף אחד, בלי רענון — כל אחד עודכן בדיוק לפי הבחירה שלו`,
    );
  }

  /* ---------------- שלב 1.5: אבחון סיבת השורש — למה אין ציור בלי עריכה ---------------- */
  {
    await setBorder('ללא גבול');
    await app.sleep(500);
    await setBorder('קו עבה');
    await app.sleep(3000); // המתנה ארוכה, בלי שום עריכה נוספת אחרי הבחירה בתפריט
    const noEditCount = await app.js(`document.querySelectorAll('.page-border-layer__page').length`);
    await app.caret(0);
    await app.press('End', 'End', 35);
    await app.cdp.send('Input.insertText', { text: 'עריכה בלתי-קשורה לגבול' });
    await app.sleep(1500);
    const afterEditCount = await app.js(`document.querySelectorAll('.page-border-layer__page').length`);
    const rootCauseConfirmed = noEditCount === 0 && afterEditCount > 0;
    report[noEditCount > 0 ? 'pass' : rootCauseConfirmed ? 'fail' : 'partial'](
      'ציור מיידי אחרי בחירה בתפריט — בלי שום עריכה אחרת',
      `מיד אחרי הבחירה + 3.5 שניות המתנה: ${noEditCount} קופסאות. אחרי עריכת טקסט בלתי-קשורה: ${afterEditCount} קופסאות.`,
      noEditCount > 0
        ? ''
        : rootCauseConfirmed
          ? 'הגבול מצטייר רק אחרי שנוצר עדכון מסמך "אמיתי" (הקלדה) שמפעיל onUpdate ← pageBorderModel.noteDocumentChanged(). בחירת תפריט "גבולות עמוד" בלבד אינה מפעילה onUpdate בעצמה (App.vue:1809), ולכן pageBorders.value נשאר null/מיושן עד לעריכה הבאה — המשתמש שבוחר גבול ואינו נוגע בטקסט לא רואה שום דבר.'
          : 'לא נמצא ציור גם אחרי עריכה — יש עוד גורם שחוסם',
    );
  }

  /* ---------------- שלב 2: הסרה — אפס קופסאות, אבל השורש עדיין קיים ---------------- */
  {
    // תנאי מוקדם: שיהיה גבול **מצויר בפועל** לפני שבודקים הסרה (לא סתם "0 מהתחלה").
    await app.caret(0);
    await app.press('End', 'End', 35);
    await app.cdp.send('Input.insertText', { text: 'מוודאים שהגבול מצויר' });
    await app.sleep(1500);
    const before = await app.js(`document.querySelectorAll('.page-border-layer__page').length`);

    const picked = await setBorder('ללא גבול');
    await app.sleep(3000); // בלי עריכה נוספת — בדיוק כמו משתמש שבחר "ללא גבול" ועצר
    const afterNoEdit = await app.js(`document.querySelectorAll('.page-border-layer__page').length`);
    await app.cdp.send('Input.insertText', { text: ' עוד עריכה' });
    await app.sleep(1500);
    const afterEdit = await app.js(`document.querySelectorAll('.page-border-layer__page').length`);

    const disappearedImmediately = before > 0 && picked.ok && afterNoEdit === 0;
    report[disappearedImmediately ? 'pass' : 'fail'](
      'ציור: ללא גבול (הסרה מיידית, בלי עריכה נוספת)',
      `לפני ההסרה: ${before} קופסאות. מיד אחרי "ללא גבול" + 3 שניות: ${afterNoEdit} קופסאות. אחרי עריכה נוספת: ${afterEdit} קופסאות.`,
      disappearedImmediately
        ? ''
        : before === 0
          ? 'לא הצלחנו לוודא שהיה גבול מצויר לפני ההסרה — הבדיקה לא מכריעה'
          : 'הגבול היה מצויר, ואחרי בחירת "ללא גבול" הוא נשאר על המסך — נעלם רק אחרי עריכה בלתי-קשורה נוספת. משתמש שמסיר גבול ואינו עורך טקסט רואה גבול "רפאים" שכבר לא קיים ב-docx.',
    );
  }

  /* ---------------- שלב 3: מסמך רב-עמודי — גבול על כל עמוד ---------------- */
  {
    await setBorder('קו יחיד');
    await app.caret(0);
    await app.press('End', 'End', 35);
    // טקסט ארוך מספיק לכמה עמודים. Input.insertText — מסלול קלט אמיתי.
    const filler = 'kaf lamed mem nun samech ayin pe tsadi kuf resh shin tav alef bet gimel dalet he vav zayin het tet yod ';
    for (let i = 0; i < 12; i++) {
      await app.cdp.send('Input.insertText', { text: filler.repeat(20) });
      await app.sleep(400);
    }
    await app.sleep(2000);

    const g = await geometry();
    const multi = g.pages.length >= 2;
    report[multi ? 'pass' : 'partial'](
      'מסמך רב-עמודי — נוצרו כמה עמודים',
      `עמודים: ${g.pages.length}`,
      multi ? '' : 'לא הצטברו מספיק עמודים כדי להכריע על „כל העמוד” — נדרש טקסט ארוך יותר',
    );

    if (multi) {
      const countOk = g.boxes.length === g.pages.length;
      report[countOk ? 'pass' : 'fail'](
        'מסמך רב-עמודי — קופסת גבול לכל עמוד',
        `עמודים=${g.pages.length} קופסאות=${g.boxes.length}`,
        countOk ? '' : 'מספר הקופסאות אינו תואם למספר העמודים — לא כל עמוד מקבל גבול',
      );
      const want = { widthPx: eighthsToPx(4), style: 'solid' };
      let worst = [];
      for (let i = 0; i < Math.min(g.pages.length, g.boxes.length); i++) {
        const bad = checkBoxAgainstPage(g.pages[i], g.boxes[i], want);
        if (bad.length) worst = worst.concat(`עמוד ${i}: ${bad.join('; ')}`);
      }
      report[worst.length ? 'fail' : 'pass'](
        'מסמך רב-עמודי — כל קופסה מיושרת מול העמוד שלה',
        worst.length ? worst.join(' | ') : `${g.pages.length} עמודים, כולם מיושרים בתוך ${TOL}px`,
      );
    }
  }

  /* ---------------- שלב 4: גלילה — האם ה-overlay נשאר ממוקם ---------------- */
  {
    const before = await geometry();
    if (before.pages.length < 2) {
      report.skip('גלילה — מיקום נשמר', 'פחות משני עמודים במסמך — אין מה לגלול ביניהם');
    } else {
      const hostInfo = await app.js(`(function () {
        var ui = window.__otzariaEditor && window.__otzariaEditor.ui;
        var host = ui && ui.viewport && ui.viewport.getHost && ui.viewport.getHost();
        if (!host) return JSON.stringify({ ok: false });
        var before = host.scrollTop;
        host.scrollTop = before + 900;
        host.dispatchEvent(new Event('scroll'));
        return JSON.stringify({ ok: true, before: before, after: host.scrollTop, scrollHeight: host.scrollHeight, clientHeight: host.clientHeight });
      })()`);
      const hi = JSON.parse(hostInfo);
      if (!hi.ok) {
        report.fail('גלילה — מיקום נשמר', 'לא נמצא host דרך ui.viewport.getHost() — אין איך לגלול');
      } else if (hi.after === hi.before) {
        report.skip('גלילה — מיקום נשמר', `המסמך אינו גולל (scrollHeight=${hi.scrollHeight}, clientHeight=${hi.clientHeight}) — אין מה לבדוק`);
      } else {
        // מדידה ומחדש, אחרי שה-rAF וה-SETTLE_DELAYS_MS (עד 600ms) התיישבו.
        await app.sleep(900);
        const after = await geometry();
        const n = Math.min(before.pages.length, after.pages.length, before.boxes.length, after.boxes.length);
        let bad = [];
        for (let i = 0; i < n; i++) {
          const pageDelta = after.pages[i].top - before.pages[i].top;
          const boxDelta = after.boxes[i].top - before.boxes[i].top;
          if (!near(pageDelta, boxDelta, 1.5)) {
            bad.push(`עמוד ${i}: הדף זז ${pageDelta.toFixed(1)}px, הקופסה זזה ${boxDelta.toFixed(1)}px`);
          }
        }
        report[bad.length ? 'fail' : 'pass'](
          'גלילה — מיקום נשמר',
          bad.length ? bad.join(' | ') : `גללנו ${hi.after - hi.before}px; כל הקופסאות זזו יחד עם העמודים שלהן (±1.5px)`,
        );
      }
    }
  }

  /* ---------------- שלב 5: שינוי גודל חלון — האם ה-overlay מתעדכן ---------------- */
  {
    const before = await geometry();
    await app.cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1300,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await app.sleep(1200);
    const after = await geometry();
    const n = Math.min(before.pages.length, after.pages.length, before.boxes.length, after.boxes.length);
    if (n === 0) {
      report.skip('שינוי גודל חלון — מיקום נשמר', 'אין עמודים/קופסאות למדידה');
    } else {
      let bad = [];
      let moved = false;
      for (let i = 0; i < n; i++) {
        const pageDelta = after.pages[i].left - before.pages[i].left;
        const boxDelta = after.boxes[i].left - before.boxes[i].left;
        if (Math.abs(pageDelta) > 1) moved = true;
        if (!near(pageDelta, boxDelta, 1.5)) {
          bad.push(`עמוד ${i}: הדף זז ${pageDelta.toFixed(1)}px, הקופסה זזה ${boxDelta.toFixed(1)}px`);
        }
      }
      report[bad.length ? 'fail' : moved ? 'pass' : 'partial'](
        'שינוי גודל חלון — מיקום נשמר',
        bad.length
          ? bad.join(' | ')
          : moved
            ? `הדף זז אחרי שינוי הגודל, והקופסאות זזו יחד איתו (±1.5px)`
            : 'שינוי הגודל לא הזיז את העמוד בפועל — לא הוכח דבר',
      );
    }
    // מחזירים לגודל המקורי, שלא ישפיע על שלב 6.
    await app.cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1600,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await app.sleep(1200);
  }

  /* ---------------- שלב 6: ה-docx עדיין תקין אחרי כל זה ---------------- */
  {
    const files = await app.docx();
    const doc = files?.['word/document.xml'] ?? '';
    const m = /<w:sectPr\b[\s\S]*?<\/w:sectPr>|<w:sectPr\b[^>]*\/>/g;
    let last = '';
    let mm;
    while ((mm = m.exec(doc)) !== null) last = mm[0];
    const borders = /<w:pgBorders\b[\s\S]*?<\/w:pgBorders>/.exec(last)?.[0] ?? '';
    const hasAll4 = ['top', 'right', 'bottom', 'left'].every((side) =>
      new RegExp(`<w:${side}\\b[^>]*w:val="single"[^>]*w:sz="4"[^>]*w:space="24"[^>]*w:color="auto"`).test(borders),
    );
    const displayOk = /w:display="allPages"/.test(borders);
    report[hasAll4 && displayOk ? 'pass' : 'fail'](
      'docx עדיין תקין — pgBorders נכתב כראוי',
      borders ? borders.slice(0, 300) : '(אין pgBorders בכלל)',
      hasAll4 && displayOk ? '' : 'pgBorders לא תואם למה שנבחר לאחרונה (קו יחיד) — הייצוא נשבר',
    );
  }

  console.log('\n--- לוג הדף ---');
  console.log(JSON.stringify(await app.log()));
} finally {
  app.close();
}

process.exit(report.print() > 0 ? 1 : 0);
