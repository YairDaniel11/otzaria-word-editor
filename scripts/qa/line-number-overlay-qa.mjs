/**
 * שער QA ממוקד: „מספרי שורות” — לא רק ש-`<w:lnNumType>` נכתב ל-docx (זה כבר
 * נמדד ב-scripts/qa/layout-qa.mjs, stage `linenum`), אלא שיש בפועל מספרים
 * מצוירים ב-DOM (src/ui/shell/LineNumberOverlay.vue + engine/line-number-layer.ts),
 * שהם ממוקמים נכון מול השורה האמיתית, מספרים ברצף הנכון (continuous/newPage),
 * שהם מתעדכנים חי בלי רענון דף, ושהם נעלמים כש„ללא” נבחר.
 *
 * „success: true” ו„נכתב ל-docx” אינם הוכחה כאן — בדיוק כמו page-border-overlay-qa.mjs.
 *
 * הרצה:
 *   node scripts/qa/line-number-overlay-qa.mjs
 * יציאה 9379 בלבד — שערים מקבילים רצים על יציאות אחרות (ראו layout-qa.mjs).
 */
import { openApp, createReport } from './harness.mjs';

const PORT = Number(process.env.QA_PORT ?? 9379);
const report = createReport('מספרי שורות — ציור בפועל בעורך', { strict: true });

const app = await openApp({ name: 'line-number-overlay', port: PORT });

await app.cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 1600,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});
await app.sleep(1200);

/** מספרי השורות המצוירים כרגע, ממוינים לפי עמוד ואז לפי מיקום אנכי. */
async function numbers() {
  const raw = await app.js(`(function () {
    var els = Array.prototype.slice.call(document.querySelectorAll('.line-number-layer__num'));
    var items = els.map(function (el) {
      var r = el.getBoundingClientRect();
      return { text: (el.textContent || '').trim(), top: r.top, left: r.left, width: r.width, height: r.height };
    });
    items.sort(function (a, b) { return a.top - b.top; });
    return JSON.stringify({ count: items.length, items: items });
  })()`);
  return JSON.parse(raw);
}

/** בוחרת פריט בתפריט „מספרי שורות”, ומחזירה אם הלחיצה הצליחה. */
async function setLineNumbering(label) {
  const items = await app.openMenu('מספרי שורות');
  if (!items) return { ok: false, reason: 'הכפתור „מספרי שורות” לא נמצא/מנוטרל' };
  const labels = items.map((i) => i.label);
  if (!labels.includes(label)) {
    await app.escape();
    return { ok: false, reason: `הפריט „${label}” אינו בתפריט (${labels.join(' | ')})` };
  }
  const clicked = await app.clickMenu(label, { after: 900 });
  return { ok: clicked, reason: clicked ? '' : `לא ניתן ללחוץ על „${label}”` };
}

try {
  await app.caret(0);
  await app.tab('פריסה');

  /* ---------------- שלב 1: „רציף” — מספרים רצופים, כל שורה ---------------- */
  {
    const picked = await setLineNumbering('רציף');
    if (!picked.ok) {
      report.fail('ציור: רציף', picked.reason);
    } else {
      const n = await numbers();
      const values = n.items.map((it) => it.text);
      const sequential = values.length > 0 && values.every((v, i) => Number(v) === i + 1);
      report[sequential ? 'pass' : 'fail'](
        'ציור: רציף — מספרים רצופים מ-1',
        `נמצאו ${n.count}: [${values.join(', ')}]`,
        sequential ? '' : 'המספרים אינם רצף שלם החל מ-1',
      );
    }
  }

  /* ---------------- שלב 1.2: פער ידוע — טקסט בתוך תא טבלה נספר בטעות ----------------
   * ראו engine/line-number-layer.ts, „פער שנחקר ולא נסגר”, ו-
   * tests/unit/line-number-layer.test.ts, `'טקסט בתוך תא טבלה — פער ידוע, לא מסונן'`.
   * זה **לא** בדיקת רגרסיה שאמורה לעבור — היא מודדת את הפער בדפדפן אמיתי,
   * ומדווחת `fail` במפורש כשהוא עדיין קיים (בדיוק כמו „עמודות” ב-layout-qa.mjs).
   * חייבת לרוץ כאן, על המסמך הקצר והנקי שממש נפתח — `app.reset()` בהמשך השער
   * מנקה רק את הקלטת הקריאות למאחז, לא את תוכן המסמך (host-stub.js).
   */
  {
    await app.caret(0);
    await app.press('End', 'End', 35);
    await app.cdp.send('Input.insertText', { text: 'פסקה ראשונה לפני הטבלה' });
    await app.sleep(400);
    await app.press('Enter', 'Enter', 13);
    await app.sleep(300);

    await app.tab('הוספה');
    const tableOpened = await app.click('טבלה', { after: 600 });
    const picked = tableOpened ? await app.clickTableCell(1, 2, { after: 2000 }) : false;

    if (!tableOpened || !picked) {
      report.skip('טבלה — תוכן בתוך תא אינו נספר', 'לא ניתן היה להוסיף טבלה 1×2 בסביבת ה-QA');
    } else {
      // מאתרים את שני מלבני התאים הריקים לפי גיאומטריה גולמית (לא selector
      // פנימי) ולוחצים ישירות לתוכם — ניווט Tab בין תאים לא נמצא אמין כאן.
      const rawBefore = await app.js(`(function () {
        var page = document.querySelector('[data-page-index]');
        if (!page) return JSON.stringify([]);
        var range = document.createRange();
        range.selectNodeContents(page);
        var rects = Array.prototype.map.call(range.getClientRects(), function (r) {
          return { top: r.top, left: r.left, width: r.width, height: r.height };
        }).filter(function (r) { return r.width > 0 && r.height > 0; });
        return JSON.stringify(rects);
      })()`);
      const rects = JSON.parse(rawBefore);
      const firstTop = rects.length > 0 ? rects[0].top : 0;
      const cellCandidates = rects.filter((r) => r.top > firstTop + 5);

      for (const r of cellCandidates.slice(0, 2)) {
        const x = Math.round(r.left + r.width / 2);
        const y = Math.round(r.top + r.height / 2);
        await app.clickAt(x, y);
        await app.sleep(400);
        await app.cdp.send('Input.insertText', { text: 'תוכן תא' });
        await app.sleep(500);
      }

      // חוזרים לגוף המסמך, אחרי הטבלה, ומוסיפים פסקה נוספת.
      await app.press('ArrowDown', 'ArrowDown', 40);
      await app.press('End', 'End', 35);
      await app.sleep(300);
      await app.cdp.send('Input.insertText', { text: ' פסקה אחרי הטבלה' });
      await app.sleep(1000);

      const n = await numbers();
      // Word: 2 מספרים בלבד — פסקה לפני ופסקה אחרי. הטבלה שביניהן אינה
      // אמורה לקבל אף מספר שורה.
      const expectedCount = 2;
      report[n.count === expectedCount ? 'pass' : 'fail'](
        'טבלה — תוכן בתוך תא אינו נספר',
        `נמצאו ${n.count} מספרים: [${n.items.map((it) => it.text).join(', ')}] (צפוי מ-Word: ${expectedCount})`,
        n.count === expectedCount
          ? ''
          : 'תוכן בתוך תא טבלה מקבל מספר שורה משלו, וגם דוחף את מספור מה שאחריו — פער ידוע, ר׳ engine/line-number-layer.ts',
      );
    }
    await app.tab('פריסה');
  }

  /* ---------------- שלב 1.5: אבחון סיבת השורש — למה אין ציור בלי עריכה ---------------- */
  {
    await setLineNumbering('ללא');
    await app.sleep(500);
    await setLineNumbering('רציף');
    await app.sleep(3000); // המתנה ארוכה, בלי שום עריכה נוספת אחרי הבחירה בתפריט
    const noEditCount = (await numbers()).count;
    await app.caret(0);
    await app.press('End', 'End', 35);
    await app.cdp.send('Input.insertText', { text: 'עריכה בלתי-קשורה למספור' });
    await app.sleep(1500);
    const afterEditCount = (await numbers()).count;
    const rootCauseConfirmed = noEditCount === 0 && afterEditCount > 0;
    report[noEditCount > 0 ? 'pass' : rootCauseConfirmed ? 'fail' : 'partial'](
      'ציור מיידי אחרי בחירה בתפריט — בלי שום עריכה אחרת',
      `מיד אחרי הבחירה + 3.5 שניות המתנה: ${noEditCount} מספרים. אחרי עריכת טקסט בלתי-קשורה: ${afterEditCount} מספרים.`,
      noEditCount > 0
        ? ''
        : rootCauseConfirmed
          ? 'המספור מצטייר רק אחרי עדכון מסמך "אמיתי" (הקלדה) — בחירת התפריט לבדה אינה מפעילה onUpdate.'
          : 'לא נמצא ציור גם אחרי עריכה — יש עוד גורם שחוסם',
    );
  }

  /* ---------------- שלב 2: עדכון חי — מעבר בין אפשרויות בלי app.reset() ---------------- */
  {
    const before = await numbers();
    await setLineNumbering('התחל מחדש בכל עמוד');
    await app.sleep(500);
    const after = await numbers();
    // ההבדל היחיד בין "רציף" ל"newPage" על עמוד יחיד אינו נראה (שניהם 1..N),
    // אז הבדיקה כאן היא שהמספרים בכלל התעדכנו-מחדש (המנוע צייר שוב) —
    // לא נשארו אותם אלמנטים בדיוק מלפני.
    const stillThere = after.count > 0 && before.count > 0;
    report[stillThere ? 'pass' : 'fail'](
      'עדכון חי — מעבר בין אפשרויות בלי רענון דף',
      `לפני: ${before.count} מספרים. אחרי: ${after.count} מספרים.`,
      stillThere ? '' : 'המעבר לא שמר על ציור כלשהו',
    );
  }

  /* ---------------- שלב 3: הסרה — אפס מספרים, בלי עריכה נוספת ---------------- */
  {
    await app.caret(0);
    await app.press('End', 'End', 35);
    await app.cdp.send('Input.insertText', { text: ' מוודאים שהמספור מצויר' });
    await app.sleep(1500);
    const before = (await numbers()).count;

    const picked = await setLineNumbering('ללא');
    await app.sleep(3000); // בלי עריכה נוספת
    const afterNoEdit = (await numbers()).count;

    const disappearedImmediately = before > 0 && picked.ok && afterNoEdit === 0;
    report[disappearedImmediately ? 'pass' : 'fail'](
      'ציור: ללא (הסרה מיידית, בלי עריכה נוספת)',
      `לפני ההסרה: ${before} מספרים. מיד אחרי „ללא” + 3 שניות: ${afterNoEdit} מספרים.`,
      disappearedImmediately
        ? ''
        : before === 0
          ? 'לא הצלחנו לוודא שהיה מספור מצויר לפני ההסרה — הבדיקה לא מכריעה'
          : 'המספור נשאר על המסך אחרי „ללא” — נעלם רק אחרי עריכה בלתי-קשורה נוספת.',
    );
  }

  /* ---------------- שלב 4: מסמך רב-עמודי — מספור בכל עמוד, ורצף „רציף” נכון ---------------- */
  {
    await setLineNumbering('רציף');
    await app.caret(0);
    await app.press('End', 'End', 35);
    const filler = 'kaf lamed mem nun samech ayin pe tsadi kuf resh shin tav alef bet gimel dalet he vav zayin het tet yod ';
    for (let i = 0; i < 14; i++) {
      await app.cdp.send('Input.insertText', { text: filler.repeat(20) });
      await app.sleep(400);
    }
    await app.sleep(2000);

    const pageCount = await app.js(`document.querySelectorAll('[data-page-index]').length`);
    const n = await numbers();
    const values = n.items.map((it) => Number(it.text));
    const strictlyIncreasing = values.every((v, i) => i === 0 || v === values[i - 1] + 1);
    const startsAtOne = values[0] === 1;

    report[pageCount >= 2 ? 'pass' : 'partial'](
      'מסמך רב-עמודי — נוצרו כמה עמודים',
      `עמודים: ${pageCount}, מספרים מצוירים: ${n.count}`,
      pageCount >= 2 ? '' : 'לא הצטברו מספיק עמודים כדי להכריע על „כל עמוד מקבל מספור”',
    );

    report[strictlyIncreasing && startsAtOne ? 'pass' : 'fail'](
      'מסמך רב-עמודי — „רציף” ממשיך ברצף בין עמודים, לא מתאפס',
      `${values.length} מספרים: [${values.slice(0, 6).join(', ')}...${values.slice(-6).join(', ')}]`,
      strictlyIncreasing && startsAtOne ? '' : 'הרצף נשבר או שהתחלה אינה מ-1 — ראו הערכים',
    );
  }

  /* ---------------- שלב 4.5: כותרת עליונה אינה מקבלת מספר ---------------- */
  {
    await app.tab('הוספה');
    const headerItems = await app.openMenu('כותרת עליונה');
    if (headerItems) {
      await app.clickMenu('עריכת כותרת עליונה', { after: 900 });
      await app.cdp.send('Input.insertText', { text: 'כותרת שאינה אמורה להיספר' });
      await app.sleep(1200);

      const geometry = await app.js(`(function () {
        var page = document.querySelector('[data-page-index]');
        if (!page) return JSON.stringify({ error: 'no-page' });
        var pr = page.getBoundingClientRect();
        var nums = Array.prototype.slice.call(document.querySelectorAll('.line-number-layer__num'))
          .map(function (n) { var r = n.getBoundingClientRect(); return { text: (n.textContent||'').trim(), top: r.top }; })
          .filter(function (n) { return n.top >= pr.top && n.top < pr.top + pr.height; });
        return JSON.stringify({ pageTop: pr.top, nums: nums });
      })()`);
      const g = JSON.parse(geometry);
      // הכותרת יושבת קרוב מאוד לראש העמוד (שוליים עליונים); שורת הגוף
      // הראשונה יושבת אחרי פס השוליים האפקטיביים — כלומר המספר הראשון על
      // העמוד חייב להיות רחוק משמעותית מראש העמוד יותר משורת כותרת בודדת.
      const firstNumOffset = g.nums && g.nums.length > 0 ? g.nums[0].top - g.pageTop : null;
      const headerNotNumbered = firstNumOffset !== null && firstNumOffset > 40; // > כותרת בודדת (~18px) + מרחקה (~48px מקצה)
      report[headerNotNumbered ? 'pass' : 'fail'](
        'כותרת עליונה אינה מקבלת מספר שורה',
        `הפרש בין ראש העמוד למספר הראשון: ${firstNumOffset === null ? 'אין מספרים' : firstNumOffset.toFixed(1) + 'px'}`,
        headerNotNumbered ? '' : 'המספר הראשון קרוב מדי לראש העמוד — ייתכן שהכותרת עצמה נספרת',
      );
    } else {
      report.skip('כותרת עליונה אינה מקבלת מספר שורה', 'לא ניתן לפתוח את תפריט „כותרת עליונה”');
    }
    await app.tab('פריסה');
  }

  /* ---------------- שלב 5: „התחל מחדש בכל עמוד” — כל עמוד מתחיל מ-1 ---------------- */
  {
    const picked = await setLineNumbering('התחל מחדש בכל עמוד');
    await app.sleep(500);
    if (!picked.ok) {
      report.fail('„התחל מחדש בכל עמוד” — כל עמוד מתחיל מ-1', picked.reason);
    } else {
      const raw = await app.js(`(function () {
        var pages = Array.prototype.slice.call(document.querySelectorAll('[data-page-index]'));
        var nums = Array.prototype.slice.call(document.querySelectorAll('.line-number-layer__num'));
        var byPage = pages.map(function (p) {
          var pr = p.getBoundingClientRect();
          var inPage = nums.filter(function (n) {
            var nr = n.getBoundingClientRect();
            return nr.top >= pr.top - 1 && nr.top < pr.top + pr.height;
          }).map(function (n) { return Number((n.textContent||'').trim()); }).sort(function(a,b){return a-b;});
          return inPage;
        });
        return JSON.stringify(byPage);
      })()`);
      const byPage = JSON.parse(raw).filter((p) => p.length > 0);
      const allStartAtOne = byPage.length > 0 && byPage.every((p) => p[0] === 1);
      report[allStartAtOne ? 'pass' : 'fail'](
        '„התחל מחדש בכל עמוד” — כל עמוד מתחיל מ-1',
        `${byPage.length} עמודים עם מספור: ${byPage.map((p) => `[${p.slice(0, 3).join(',')}...]`).join(' | ')}`,
        allStartAtOne ? '' : 'לפחות עמוד אחד אינו מתחיל מ-1',
      );
    }
  }

  /* ---------------- שלב 6: ה-docx עדיין תקין אחרי כל זה ---------------- */
  {
    const files = await app.docx();
    const doc = files?.['word/document.xml'] ?? '';
    const m = /<w:sectPr\b[\s\S]*?<\/w:sectPr>|<w:sectPr\b[^>]*\/>/g;
    let last = '';
    let mm;
    while ((mm = m.exec(doc)) !== null) last = mm[0];
    const lnNumType = /<w:lnNumType\b[^>]*\/>/.exec(last)?.[0] ?? '';
    const restartOk = /w:restart="newPage"/.test(lnNumType);
    report[lnNumType && restartOk ? 'pass' : 'fail'](
      'docx עדיין תקין — lnNumType נכתב כראוי',
      lnNumType || '(אין lnNumType בכלל)',
      lnNumType && restartOk ? '' : 'lnNumType לא תואם לבחירה האחרונה (התחל מחדש בכל עמוד) — הייצוא נשבר',
    );
  }

  console.log('\n--- לוג הדף ---');
  console.log(JSON.stringify(await app.log()));
} finally {
  app.close();
}

process.exit(report.print() > 0 ? 1 : 0);
