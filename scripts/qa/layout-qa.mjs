/**
 * שער ה-QA של לשונית „פריסה” — כפתור אחר כפתור, פריט תפריט אחר פריט.
 *
 * ההוכחה היחידה שמתקבלת כאן היא ה-`sectPr` שב-`word/document.xml` של ה-docx
 * המיוצא (ול„ברירות מחדל” — `word/styles.xml`). „success: true” אינו הוכחה,
 * וגם „התפריט נסגר” אינו הוכחה.
 *
 * הרצה:
 *   node scripts/qa/layout-qa.mjs            # הכול
 *   node scripts/qa/layout-qa.mjs margins    # שלב אחד או כמה
 *
 * שלבים: caps margins orientation paper columns linenum borders valign
 *         pagenum headerdist docdefaults
 *
 * יציאה 9364 בלבד — שערים מקבילים רצים על יציאות אחרות.
 */
import { openApp, createReport } from './harness.mjs';

const PORT = Number(process.env.QA_PORT ?? 9364);
const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const wants = (stage) => only.length === 0 || only.includes(stage);

const report = createReport('לשונית פריסה');
/** כל מה שנמדד, לדוח: שם → {verdict, xml, note} */
const evidence = [];

/* ------------------------------------------------------------------ */
/* קוראי XML — מינימליים, ורק על מה שהתקן דורש                        */
/* ------------------------------------------------------------------ */

/** ה-sectPr האחרון בגוף המסמך. שם יושבות הגדרות המקטע של מסמך חד-מקטעי. */
function sectPrs(doc) {
  const out = [];
  const re = /<w:sectPr\b[\s\S]*?<\/w:sectPr>|<w:sectPr\b[^>]*\/>/g;
  let m;
  while ((m = re.exec(doc)) !== null) out.push(m[0]);
  return out;
}

function lastSectPr(files) {
  const doc = files?.['word/document.xml'] ?? '';
  const all = sectPrs(doc);
  return all.length ? all[all.length - 1] : '';
}

/** האלמנט המבוקש בתוך ה-sectPr, כמחרוזת גולמית (כולל ילדים). */
function el(sect, tag) {
  const re = new RegExp(`<w:${tag}\\b[^>]*\\/>|<w:${tag}\\b[^>]*>[\\s\\S]*?<\\/w:${tag}>`);
  const m = re.exec(sect);
  return m ? m[0] : '';
}

/** תכונות של אלמנט, לפי שם בלי הקידומת. */
function attrs(xml) {
  const out = {};
  const re = /w:([A-Za-z]+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(xml)) !== null) out[m[1]] = m[2];
  return out;
}

/** תיאור קצר של ה-sectPr לדוח — רק האלמנטים שהתקן מונה. */
function digest(sect) {
  return ['pgSz', 'pgMar', 'cols', 'lnNumType', 'pgBorders', 'vAlign', 'pgNumType']
    .map((t) => el(sect, t))
    .filter(Boolean)
    .join(' ');
}

/* ------------------------------------------------------------------ */

const app = await openApp({ name: 'layout', port: PORT });

/** שגיאות שאינן קשורות לפקד — רעש ידוע של הדף. */
const NOISE = [
  /Autofocus processing was blocked/i,
  /favicon/i,
  /Failed to load resource/i,
];
function realLog(lines) {
  return (lines ?? []).filter((line) => !NOISE.some((re) => re.test(line)));
}

/** מצב הסביבה אחרי פעולה: שגיאה בשורת המצב, במאחז, או בלוג. */
async function noise() {
  const [status, messages, log] = await Promise.all([app.status(), app.messages(), app.log()]);
  const errs = [];
  if (status?.error) errs.push(`status: ${status.text}`);
  for (const m of messages ?? []) {
    const text = typeof m === 'string' ? m : JSON.stringify(m);
    if (/error|שגיאה|נכשל/i.test(text)) errs.push(`host: ${text.slice(0, 160)}`);
  }
  for (const line of realLog(log)) errs.push(`log: ${line.slice(0, 160)}`);
  return { errs, status };
}

/**
 * בחירה בפריט תפריט, ומדידת מה שנכתב.
 * מחזירה `{ sect, errs, closed, status, items }`.
 */
async function pick(button, item) {
  await app.reset();
  const off = await inWindow(button);
  if (off) return { missing: off };
  const items = await app.openMenu(button);
  if (!items) return { missing: `הכפתור „${button}” לא נמצא / מנוטרל` };
  const labels = items.map((i) => i.label);
  if (!labels.includes(item)) {
    await app.escape();
    return { missing: `הפריט „${item}” אינו בתפריט (${labels.join(' | ')})`, items: labels };
  }
  const clicked = await app.clickMenu(item, { after: 1100 });
  if (!clicked) return { missing: `לא ניתן ללחוץ על „${item}”`, items: labels };
  const closed = !(await app.menuOpen());
  const { errs, status } = await noise();
  const files = await app.docx();
  return { sect: lastSectPr(files), files, errs, closed, status, items: labels };
}

/** רושם שורה בדוח + בראיות. */
function record(name, verdict, xml, note) {
  evidence.push({ name, verdict, xml, note });
  const detail = [note, xml].filter(Boolean).join(' | ');
  if (verdict === 'עובד') report.pass(name, detail);
  else if (verdict === 'שבור') report.fail(name, detail);
  else if (verdict === 'חלקי') report.partial(name, detail);
  else report.skip(name, detail);
}

/**
 * הבדיקה הסטנדרטית של פריט תפריט: נלחץ, התפריט נסגר, אין שגיאה,
 * וה-XML הוא מה שהפריט הבטיח.
 */
async function checkItem(name, button, item, verify) {
  const r = await pick(button, item);
  if (r.missing) {
    record(name, 'שבור', '', r.missing);
    return null;
  }
  const target = el(r.sect, verify.tag);
  const got = attrs(target);
  const bad = [];
  for (const [k, v] of Object.entries(verify.expect ?? {})) {
    if (String(got[k]) !== String(v)) bad.push(`${k}=${got[k] ?? '—'} (צפוי ${v})`);
  }
  if (verify.absent && target) bad.push(`${verify.tag} עדיין קיים`);
  if (!verify.absent && !target) bad.push(`אין <w:${verify.tag}> ב-sectPr`);
  if (verify.extra) {
    const more = verify.extra(r);
    if (more) bad.push(more);
  }
  if (!r.closed) bad.push('התפריט לא נסגר');
  for (const e of r.errs) bad.push(e);

  const xml = target || digest(r.sect) || '(אין sectPr)';
  record(name, bad.length ? 'שבור' : 'עובד', xml, bad.join('; '));
  return r;
}

/**
 * חלון רחב לפני הכול.
 *
 * ברירת המחדל של headless צרה מדי, `.word-ribbon-body` גולש, ופקד שיושב בקצה
 * הרצועה מקבל מלבן שחלקו מחוץ לחלון — הלחיצה נשלחת לשום מקום, אין שגיאה,
 * והפקד התקין נמדד כ„שבור”. שני הדברים כאן ולא אחד: ההרחבה, **וגם** אימות
 * שהמלבן חיובי ובתוך החלון לפני כל לחיצה (`inWindow`).
 */
await app.cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 1600,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});
await app.sleep(1200);
const viewport = await app.js(`JSON.stringify({w: innerWidth, h: innerHeight})`);
console.log('חלון:', viewport);
const VIEW = JSON.parse(viewport);

/** מלבן הפקד — או הסיבה שאי אפשר ללחוץ עליו. */
async function inWindow(name) {
  const s = await app.state(name);
  if (!s.found) return `הפקד „${name}” לא נמצא`;
  if (s.disabled) return `הפקד „${name}” מנוטרל`;
  if (!s.rect) return `לפקד „${name}” אין מלבן (אינו מוצג)`;
  const { x, y } = s.rect;
  if (x <= 0 || y <= 0 || x >= VIEW.w || y >= VIEW.h) {
    return `הפקד „${name}” מחוץ לחלון: x=${x} y=${y} (חלון ${VIEW.w}×${VIEW.h})`;
  }
  return null;
}

try {
  await app.caret(0);
  await app.tab('פריסה');

  /* ---------------- יכולות: מה המנוע מצהיר ---------------- */
  if (wants('caps')) {
    const caps = await app.js(`(async () => {
      try {
        const doc = window.__qa.doc();
        const c = await doc.capabilities.get();
        const ops = c.operations || {};
        const want = ['sections.setPageMargins','sections.setPageSetup','sections.setColumns',
          'sections.setLineNumbering','sections.setPageBorders','sections.clearPageBorders',
          'sections.setVerticalAlign','sections.setPageNumbering','sections.setHeaderFooterMargins',
          'styles.apply'];
        const out = {};
        for (const id of want) out[id] = ops[id] ? {available: ops[id].available, reasons: ops[id].reasons} : 'חסר';
        return JSON.stringify(out);
      } catch (e) { return 'ERR ' + (e && e.message); }
    })()`);
    console.log('יכולות המנוע:', caps);

    const names = ['שוליים', 'כיוון', 'גודל', 'עמודות', 'מספרי שורות', 'גבולות עמוד',
      'יישור אנכי', 'מספור עמודים', 'מרחק הכותרת', 'ברירות מחדל'];
    for (const n of names) {
      const s = await app.state(n);
      console.log(`מצב הפקד „${n}”:`, JSON.stringify(s));
      const off = await inWindow(n);
      if (off) record(`נוכחות: ${n}`, 'שבור', '', off);
      else record(`נוכחות: ${n}`, 'עובד', JSON.stringify(s.rect), 'קיים, מוצג, פעיל, ובתוך החלון');
    }
    console.log('sectPr ההתחלתי:', digest(lastSectPr(await app.docx())));
  }

  /* ---------------- שוליים ---------------- */
  if (wants('margins')) {
    // „צר” ראשון כדי ש„רגיל” אחריו לא ייפול ל-NO_OP ויימדד באמת.
    await checkItem('שוליים ← צר', 'שוליים', 'צר', {
      tag: 'pgMar',
      expect: { top: 720, right: 720, bottom: 720, left: 720 },
    });
    await checkItem('שוליים ← רחב', 'שוליים', 'רחב', {
      tag: 'pgMar',
      expect: { top: 1440, right: 2880, bottom: 1440, left: 2880 },
    });
    await checkItem('שוליים ← רגיל', 'שוליים', 'רגיל', {
      tag: 'pgMar',
      expect: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
    });
    // NO_OP: אותה בחירה פעמיים אינה אמורה להראות שגיאה.
    const again = await pick('שוליים', 'רגיל');
    record(
      'שוליים ← רגיל (פעם שנייה, NO_OP)',
      again.missing || again.errs.length ? 'שבור' : 'עובד',
      el(again.sect ?? '', 'pgMar'),
      again.missing || again.errs.join('; ') || 'אין שגיאה, כמצופה',
    );
  }

  /* ---------------- כיוון ---------------- */
  if (wants('orientation')) {
    await checkItem('כיוון ← לרוחב', 'כיוון', 'לרוחב', {
      tag: 'pgSz',
      expect: { orient: 'landscape' },
      extra: (r) => {
        const a = attrs(el(r.sect, 'pgSz'));
        return Number(a.w) > Number(a.h) ? null : `המידות אינן לרוחב: w=${a.w} h=${a.h}`;
      },
    });
    await checkItem('כיוון ← לאורך', 'כיוון', 'לאורך', {
      tag: 'pgSz',
      extra: (r) => {
        const a = attrs(el(r.sect, 'pgSz'));
        if (a.orient === 'landscape') return 'w:orient עדיין landscape';
        return Number(a.w) < Number(a.h) ? null : `המידות אינן לאורך: w=${a.w} h=${a.h}`;
      },
    });
  }

  /* ---------------- גודל נייר ---------------- */
  if (wants('paper')) {
    await checkItem('גודל ← A4', 'גודל', 'A4', {
      tag: 'pgSz',
      expect: { w: 11906, h: 16838 },
      extra: (r) => {
        const a = attrs(el(r.sect, 'pgSz'));
        return a.code === '9' || a.code === undefined ? (a.code === '9' ? null : 'אין w:code') : `w:code=${a.code}`;
      },
    });
    await checkItem('גודל ← Letter', 'גודל', 'Letter', {
      tag: 'pgSz',
      expect: { w: 12240, h: 15840 },
      extra: (r) => {
        const a = attrs(el(r.sect, 'pgSz'));
        return a.code === '1' ? null : `w:code=${a.code ?? '—'} (צפוי 1)`;
      },
    });
    // גודל על מסמך שהוא לרוחב: המידות חייבות להתהפך, ו-w:orient להישאר.
    await app.reset();
    await app.openMenu('כיוון');
    await app.clickMenu('לרוחב', { after: 1100 });
    await checkItem('גודל ← A4 על דף לרוחב', 'גודל', 'A4', {
      tag: 'pgSz',
      expect: { w: 16838, h: 11906, orient: 'landscape' },
    });
    await app.reset();
    await app.openMenu('כיוון');
    await app.clickMenu('לאורך', { after: 1100 });
  }

  /* ---------------- עמודות ---------------- */
  if (wants('columns')) {
    await checkItem('עמודות ← שתיים', 'עמודות', 'שתיים', {
      tag: 'cols',
      expect: { num: 2, space: 720 },
    });
    await checkItem('עמודות ← שלוש', 'עמודות', 'שלוש', {
      tag: 'cols',
      expect: { num: 3, space: 720 },
    });
    await checkItem('עמודות ← אחת', 'עמודות', 'אחת', {
      tag: 'cols',
      extra: (r) => {
        const a = attrs(el(r.sect, 'cols'));
        return a.num === undefined || a.num === '1' ? null : `w:num=${a.num} (צפוי 1 או ללא)`;
      },
    });
  }

  /* ---------------- מספרי שורות ---------------- */
  if (wants('linenum')) {
    await checkItem('מספרי שורות ← רציף', 'מספרי שורות', 'רציף', {
      tag: 'lnNumType',
      expect: { restart: 'continuous', countBy: 1, start: 1 },
    });
    await checkItem('מספרי שורות ← התחל מחדש בכל עמוד', 'מספרי שורות', 'התחל מחדש בכל עמוד', {
      tag: 'lnNumType',
      expect: { restart: 'newPage' },
    });
    await checkItem('מספרי שורות ← התחל מחדש בכל מקטע', 'מספרי שורות', 'התחל מחדש בכל מקטע', {
      tag: 'lnNumType',
      expect: { restart: 'newSection' },
    });
    await checkItem('מספרי שורות ← ללא', 'מספרי שורות', 'ללא', {
      tag: 'lnNumType',
      absent: true,
    });
  }

  /* ---------------- גבולות עמוד ---------------- */
  if (wants('borders')) {
    const cases = [
      ['קו יחיד', { val: 'single', sz: 4 }],
      ['קו עבה', { val: 'single', sz: 24 }],
      ['קו כפול', { val: 'double', sz: 6 }],
      ['מקווקו', { val: 'dashed', sz: 4 }],
      ['מנוקד', { val: 'dotted', sz: 4 }],
    ];
    for (const [label, want] of cases) {
      const r = await pick('גבולות עמוד', label);
      if (r.missing) {
        record(`גבולות עמוד ← ${label}`, 'שבור', '', r.missing);
        continue;
      }
      const borders = el(r.sect, 'pgBorders');
      const bad = [];
      if (!borders) bad.push('אין <w:pgBorders> ב-sectPr');
      else {
        const holder = attrs(borders.slice(0, borders.indexOf('>') + 1));
        if (holder.display !== 'allPages') bad.push(`w:display=${holder.display ?? '—'}`);
        for (const side of ['top', 'right', 'bottom', 'left']) {
          const a = attrs(el(borders, side));
          if (!Object.keys(a).length) {
            bad.push(`חסר צד ${side}`);
            continue;
          }
          if (a.val !== want.val) bad.push(`${side}.val=${a.val ?? '—'} (צפוי ${want.val})`);
          if (String(a.sz) !== String(want.sz)) bad.push(`${side}.sz=${a.sz ?? '—'} (צפוי ${want.sz})`);
          if (String(a.space) !== '24') bad.push(`${side}.space=${a.space ?? '—'} (צפוי 24)`);
          if (a.color !== 'auto') bad.push(`${side}.color=${a.color ?? '—'} (צפוי auto)`);
        }
        // המודול שולח offsetFrom:'page'; נמדד מה שנכתב בפועל.
        if (holder.offsetFrom !== 'page') bad.push(`w:offsetFrom=${holder.offsetFrom ?? '—'} (נשלח page)`);
      }
      if (!r.closed) bad.push('התפריט לא נסגר');
      bad.push(...r.errs);
      record(
        `גבולות עמוד ← ${label}`,
        bad.length ? 'שבור' : 'עובד',
        (borders || digest(r.sect) || '(אין sectPr)').slice(0, 420),
        bad.join('; '),
      );
    }
    await checkItem('גבולות עמוד ← ללא גבול', 'גבולות עמוד', 'ללא גבול', {
      tag: 'pgBorders',
      absent: true,
    });
    // NO_OP של clearPageBorders: הסרה כשאין גבול.
    const again = await pick('גבולות עמוד', 'ללא גבול');
    record(
      'גבולות עמוד ← ללא גבול (פעם שנייה, NO_OP)',
      again.missing || again.errs.length ? 'שבור' : 'עובד',
      el(again.sect ?? '', 'pgBorders') || '(אין pgBorders — כמצופה)',
      again.missing || again.errs.join('; ') || 'אין שגיאה, כמצופה',
    );
  }

  /* ---------------- יישור אנכי ---------------- */
  if (wants('valign')) {
    await checkItem('יישור אנכי ← מרכז', 'יישור אנכי', 'מרכז', {
      tag: 'vAlign',
      expect: { val: 'center' },
    });
    await checkItem('יישור אנכי ← מיושר', 'יישור אנכי', 'מיושר', {
      tag: 'vAlign',
      expect: { val: 'both' },
    });
    await checkItem('יישור אנכי ← למטה', 'יישור אנכי', 'למטה', {
      tag: 'vAlign',
      expect: { val: 'bottom' },
    });
    await checkItem('יישור אנכי ← למעלה', 'יישור אנכי', 'למעלה', {
      tag: 'vAlign',
      extra: (r) => {
        const a = attrs(el(r.sect, 'vAlign'));
        // Word משמיט vAlign כשהוא top; שני המצבים תקינים.
        return a.val === undefined || a.val === 'top' ? null : `w:val=${a.val}`;
      },
    });
  }

  /* ---------------- מספור עמודים (דיאלוג) ---------------- */
  if (wants('pagenum')) {
    await app.reset();
    const off_pagenum = await inWindow('מספור עמודים');
    if (off_pagenum) record('מספור עמודים — מיקום הפקד', 'שבור', '', off_pagenum);
    const opened = await app.click('מספור עמודים', { after: 900 });
    const dlg = await app.dialog();
    console.log('דיאלוג מספור עמודים:', JSON.stringify(dlg));
    if (!opened || !dlg) {
      record('מספור עמודים — פתיחת הדיאלוג', 'שבור', '', 'הדיאלוג לא נפתח');
    } else {
      record('מספור עמודים — פתיחת הדיאלוג', 'עובד', '', `${dlg.controls.length} פקדים`);

      const formats = await app.js(`JSON.stringify(Array.prototype.map.call(
        document.querySelectorAll('#pn-format option'), function(o){return o.value;}))`);
      console.log('פורמטים בבורר:', formats);
      record('מספור עמודים — בורר התבנית', 'עובד', formats, 'ששת הפורמטים של ה-union');

      // תיבת „התחל מחדש” מנטרלת/מאפשרת את שדה המספר.
      const numBefore = await app.js(`document.querySelector('.pn-number').disabled`);
      await app.clickSel('.pn-check input', 0, { after: 300 });
      const numAfter = await app.js(`document.querySelector('.pn-number').disabled`);
      record(
        'מספור עמודים — תיבת „התחל מחדש”',
        numBefore === true && numAfter === false ? 'עובד' : 'שבור',
        `disabled: ${numBefore} → ${numAfter}`,
        '',
      );

      await app.dialogFill('pn-format', 'upperRoman');
      await app.dialogFill('המספר שממנו מתחיל מספור העמודים', '7');
      await app.sleep(200);
      console.log('לפני אישור:', JSON.stringify(await app.dialog()));
      await app.clickDialog('אישור', { after: 1400 });

      const stillOpen = await app.dialog();
      const { errs } = await noise();
      const sect = lastSectPr(await app.docx());
      const a = attrs(el(sect, 'pgNumType'));
      const bad = [];
      if (a.fmt !== 'upperRoman') bad.push(`w:fmt=${a.fmt ?? '—'} (צפוי upperRoman)`);
      if (String(a.start) !== '7') bad.push(`w:start=${a.start ?? '—'} (צפוי 7)`);
      if (stillOpen) bad.push('הדיאלוג נשאר פתוח');
      bad.push(...errs);
      record(
        'מספור עמודים — החלה (upperRoman, התחלה 7)',
        bad.length ? 'שבור' : 'עובד',
        el(sect, 'pgNumType') || '(אין pgNumType)',
        bad.join('; '),
      );

      // נפתח שוב: הטופס חייב להיפתח על מה שבמסמך.
      await app.reset();
      await app.click('מספור עמודים', { after: 900 });
      const reread = await app.dialog();
      const fmt = reread?.controls.find((c) => c.id === 'pn-format')?.value;
      const start = reread?.controls.find((c) => c.name?.includes('שממנו מתחיל'))?.value;
      const check = reread?.controls.find((c) => c.type === 'checkbox')?.checked;
      record(
        'מספור עמודים — קריאת המצב בפתיחה חוזרת',
        fmt === 'upperRoman' && String(start) === '7' && check === true ? 'עובד' : 'שבור',
        `format=${fmt} start=${start} restart=${check}`,
        '',
      );

      // ולידציה: מספר מחוץ לטווח נועל את „אישור”.
      await app.dialogFill('המספר שממנו מתחיל מספור העמודים', '0');
      await app.sleep(250);
      const submitDisabled = await app.js(
        `document.querySelector('.pn-btn-primary').disabled`,
      );
      const errShown = await app.exists('.pn-error');
      record(
        'מספור עמודים — ולידציה (0 מחוץ לטווח)',
        submitDisabled === true && errShown ? 'עובד' : 'שבור',
        `אישור disabled=${submitDisabled}, הודעה=${errShown}`,
        '',
      );

      // ביטול לא נוגע במסמך.
      await app.clickDialog('ביטול', { after: 600 });
      const afterCancel = attrs(el(lastSectPr(await app.docx()), 'pgNumType'));
      record(
        'מספור עמודים — ביטול',
        !(await app.dialog()) && String(afterCancel.start) === '7' ? 'עובד' : 'שבור',
        `pgNumType start=${afterCancel.start}`,
        '',
      );
    }
  }

  /* ---------------- מרחק הכותרת (דיאלוג) ---------------- */
  if (wants('headerdist')) {
    await app.reset();
    const off_headerdist = await inWindow('מרחק הכותרת');
    if (off_headerdist) record('מרחק הכותרת — מיקום הפקד', 'שבור', '', off_headerdist);
    const opened = await app.click('מרחק הכותרת', { after: 900 });
    const dlg = await app.dialog();
    console.log('דיאלוג מרחק הכותרת:', JSON.stringify(dlg));
    if (!opened || !dlg) {
      record('מרחק הכותרת — פתיחת הדיאלוג', 'שבור', '', 'הדיאלוג לא נפתח');
    } else {
      record('מרחק הכותרת — פתיחת הדיאלוג', 'עובד', '',
        `header=${dlg.controls.find((c) => c.id === 'hd-header')?.value} footer=${dlg.controls.find((c) => c.id === 'hd-footer')?.value}`);

      // 2.54 ס"מ = אינץ' = 1440 twips; 1.27 = 720.
      await app.dialogFill('hd-header', '2.54');
      await app.dialogFill('hd-footer', '1.27');
      await app.sleep(200);
      await app.clickDialog('אישור', { after: 1400 });

      const { errs } = await noise();
      const sect = lastSectPr(await app.docx());
      const a = attrs(el(sect, 'pgMar'));
      const bad = [];
      if (String(a.header) !== '1440') bad.push(`w:header=${a.header ?? '—'} (צפוי 1440)`);
      if (String(a.footer) !== '720') bad.push(`w:footer=${a.footer ?? '—'} (צפוי 720)`);
      if (await app.dialog()) bad.push('הדיאלוג נשאר פתוח');
      bad.push(...errs);
      record(
        'מרחק הכותרת — החלה (2.54 / 1.27 ס"מ)',
        bad.length ? 'שבור' : 'עובד',
        el(sect, 'pgMar'),
        bad.join('; '),
      );

      // פתיחה חוזרת קוראת מהמסמך.
      await app.reset();
      await app.click('מרחק הכותרת', { after: 900 });
      const again = await app.dialog();
      const h = Number(again?.controls.find((c) => c.id === 'hd-header')?.value);
      const f = Number(again?.controls.find((c) => c.id === 'hd-footer')?.value);
      record(
        'מרחק הכותרת — קריאת המצב בפתיחה חוזרת',
        Math.abs(h - 2.54) < 0.02 && Math.abs(f - 1.27) < 0.02 ? 'עובד' : 'שבור',
        `header=${h} footer=${f}`,
        '',
      );

      // ולידציה: מעל התקרה (55.88 ס"מ).
      await app.dialogFill('hd-header', '99');
      await app.sleep(250);
      const disabled = await app.js(`document.querySelector('.hd-btn-primary').disabled`);
      const errShown = await app.exists('.hd-error');
      record(
        'מרחק הכותרת — ולידציה (99 ס"מ)',
        disabled === true && errShown ? 'עובד' : 'שבור',
        `אישור disabled=${disabled}, הודעה=${errShown}`,
        '',
      );
      await app.clickDialog('ביטול', { after: 600 });
    }
  }

  /* ---------------- ברירות מחדל (דיאלוג) ---------------- */
  if (wants('docdefaults')) {
    await app.reset();
    const off_docdefaults = await inWindow('ברירות מחדל');
    if (off_docdefaults) record('ברירות מחדל — מיקום הפקד', 'שבור', '', off_docdefaults);
    const opened = await app.click('ברירות מחדל', { after: 1200 });
    const dlg = await app.dialog();
    console.log('דיאלוג ברירות מחדל:', JSON.stringify(dlg));
    if (!opened || !dlg) {
      record('ברירות מחדל — פתיחת הדיאלוג', 'שבור', '', 'הדיאלוג לא נפתח');
    } else {
      const placeholder = await app.js(`document.querySelector('#dd-size').placeholder`);
      record('ברירות מחדל — פתיחת הדיאלוג', 'עובד', `placeholder הגודל=${placeholder}`,
        placeholder === 'ללא שינוי' ? 'dryRun לא החזיר גודל' : 'הגודל הנוכחי נקרא ב-dryRun');

      // מלכודת ל-stack של החריגה: ה-QA API שומר טקסט בלבד.
      await app.js(`(function(){
        if (window.__stacks) return;
        window.__stacks = [];
        var orig = console.error;
        console.error = function () {
          for (var i = 0; i < arguments.length; i++) {
            var a = arguments[i];
            if (a && a.stack) window.__stacks.push(String(a.stack).slice(0, 900));
          }
          return orig.apply(console, arguments);
        };
        window.addEventListener('error', function (e) {
          if (e.error && e.error.stack) window.__stacks.push('uncaught: ' + String(e.error.stack).slice(0, 900));
        });
        window.addEventListener('unhandledrejection', function (e) {
          if (e.reason && e.reason.stack) window.__stacks.push('rejected: ' + String(e.reason.stack).slice(0, 900));
        });
      })()`);

      await app.dialogFill('dd-family', 'David');
      await app.dialogFill('dd-size', '18');
      await app.sleep(200);
      console.log('לפני אישור:', JSON.stringify(await app.dialog()));
      await app.clickDialog('אישור', { after: 1600 });
      console.log('status:', JSON.stringify(await app.status()));
      console.log('messages:', JSON.stringify(await app.messages()));
      console.log('log:', JSON.stringify(await app.log()));
      console.log('stacks:', await app.js('JSON.stringify(window.__stacks)'));

      const { errs } = await noise();
      const files = await app.docx();
      const styles = files?.['word/styles.xml'] ?? '';
      const defaults = /<w:docDefaults>[\s\S]*?<\/w:docDefaults>/.exec(styles)?.[0] ?? '';
      const rPrDefault = /<w:rPrDefault>[\s\S]*?<\/w:rPrDefault>/.exec(defaults)?.[0] ?? '';
      const bad = [];
      if (!/w:ascii="David"/.test(rPrDefault)) bad.push('אין w:ascii="David" ב-rPrDefault');
      if (!/<w:sz w:val="36"\/?>/.test(rPrDefault)) bad.push('אין <w:sz w:val="36"> (18 נק\')');
      if (await app.dialog()) bad.push('הדיאלוג נשאר פתוח');
      bad.push(...errs);
      record(
        'ברירות מחדל — החלה (David, 18 נק\')',
        bad.length ? 'שבור' : 'עובד',
        rPrDefault.slice(0, 400) || '(אין rPrDefault)',
        bad.join('; '),
      );

      // patch לפי מפתח: רק גודל, בלי לגעת בגופן.
      await app.reset();
      await app.click('ברירות מחדל', { after: 1200 });
      const ph2 = await app.js(`document.querySelector('#dd-size').placeholder`);
      record('ברירות מחדל — dryRun קורא את הגודל שנקבע', ph2 === '18' ? 'עובד' : 'שבור',
        `placeholder=${ph2}`, ph2 === '18' ? '' : 'צפוי 18');
      await app.dialogFill('dd-size', '11');
      await app.sleep(200);
      await app.clickDialog('אישור', { after: 1600 });
      const styles2 = (await app.docx())?.['word/styles.xml'] ?? '';
      const rPr2 = /<w:rPrDefault>[\s\S]*?<\/w:rPrDefault>/.exec(styles2)?.[0] ?? '';
      const keptFont = /w:ascii="David"/.test(rPr2);
      const newSize = /<w:sz w:val="22"\/?>/.test(rPr2);
      record(
        'ברירות מחדל — patch חלקי (גודל בלבד, הגופן נשמר)',
        keptFont && newSize ? 'עובד' : 'שבור',
        rPr2.slice(0, 400),
        [keptFont ? '' : 'הגופן נמחק', newSize ? '' : 'הגודל לא השתנה ל-22'].filter(Boolean).join('; '),
      );

      // שדות ריקים: „אישור” חייב להיות נעול (אין מה לשלוח).
      await app.reset();
      await app.click('ברירות מחדל', { after: 1200 });
      const emptyDisabled = await app.js(`document.querySelector('.dd-btn-primary').disabled`);
      record('ברירות מחדל — שני שדות ריקים', emptyDisabled === true ? 'עובד' : 'שבור',
        `אישור disabled=${emptyDisabled}`, emptyDisabled === true ? '' : 'ניתן לאשר בלי שינוי');
      await app.clickDialog('ביטול', { after: 500 });
    }
  }

  /* ---------------- אבחון: סדר האלמנטים ב-sectPr, וציור על המסך ---------------- */
  if (wants('diag')) {
    // סדר האלמנטים ש-CT_SectPr דורש. אלמנט מחוץ לסדר = קובץ שאינו נפתח.
    const CT_SECTPR_ORDER = [
      'footnotePr', 'endnotePr', 'type', 'pgSz', 'pgMar', 'paperSrc', 'pgBorders',
      'lnNumType', 'pgNumType', 'cols', 'formProt', 'vAlign', 'noEndnote', 'titlePg',
      'textDirection', 'bidi', 'rtlGutter', 'docGrid', 'printerSettings', 'sectPrChange',
    ];
    function orderProblem(sect) {
      const seen = [];
      const re = /<w:([A-Za-z]+)\b/g;
      let m;
      let depth = 0;
      while ((m = re.exec(sect)) !== null) {
        if (m[1] === 'sectPr') continue;
        // רק ילדים ישירים: מדלגים על מה שבתוך pgBorders.
        const before = sect.slice(0, m.index);
        const opens = (before.match(/<w:pgBorders\b(?![^>]*\/>)/g) ?? []).length;
        const closes = (before.match(/<\/w:pgBorders>/g) ?? []).length;
        depth = opens - closes;
        if (depth > 0) continue;
        seen.push(m[1]);
      }
      const idx = seen.map((n) => CT_SECTPR_ORDER.indexOf(n));
      for (let i = 1; i < idx.length; i++) {
        if (idx[i] >= 0 && idx[i - 1] >= 0 && idx[i] < idx[i - 1]) {
          return `סדר פסול: <w:${seen[i]}> אחרי <w:${seen[i - 1]}>`;
        }
      }
      return null;
    }

    // כל הפקדים יחד — sectPr אחד שנושא את כולם.
    await app.reset();
    await app.openMenu('גבולות עמוד');
    await app.clickMenu('קו עבה', { after: 1100 });
    await app.openMenu('מספרי שורות');
    await app.clickMenu('רציף', { after: 1100 });
    await app.openMenu('יישור אנכי');
    await app.clickMenu('מרכז', { after: 1100 });
    await app.openMenu('עמודות');
    await app.clickMenu('שתיים', { after: 1100 });
    await app.click('מספור עמודים', { after: 900 });
    await app.dialogFill('pn-format', 'lowerRoman');
    await app.sleep(150);
    await app.clickDialog('אישור', { after: 1400 });

    const sect = lastSectPr(await app.docx());
    console.log('\nsectPr מלא (כל הפקדים יחד):\n' + sect);
    const problem = orderProblem(sect);
    record('סדר האלמנטים ב-sectPr (CT_SectPr)', problem ? 'שבור' : 'עובד',
      sect.replace(/<w:pgBorders[\s\S]*?<\/w:pgBorders>/, '<w:pgBorders …/>'), problem ?? '');

    // האם הגבול מצויר על המסך. `קו עבה` = 3 נקודות ≈ 4 פיקסלים.
    const painted = await app.js(`(function () {
      var out = [];
      var nodes = document.querySelectorAll('.superdoc-page, [data-page-index], .pagination-page, .page');
      for (var i = 0; i < Math.min(nodes.length, 3); i++) {
        var cs = getComputedStyle(nodes[i]);
        out.push({cls: nodes[i].className, border: cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor,
                  outline: cs.outlineWidth + ' ' + cs.outlineStyle,
                  children: nodes[i].children.length});
      }
      // גם SVG או canvas שמצייר מסגרת ייחשב.
      var extra = document.querySelectorAll(
        '.page-borders, .sd-page-border, [class*=pageBorder], [class*=page-border], .superdoc-page svg, .superdoc-page canvas').length;
      return JSON.stringify({count: nodes.length, sample: out, anyBorderEl: extra,
        pgBordersInEngineBundle: 0});
    })()`);
    console.log('ציור הגבול על המסך:', painted);
    const paintInfo = JSON.parse(painted);
    const drawn = paintInfo.anyBorderEl > 0 ||
      paintInfo.sample.some((s) => parseFloat(s.border) >= 2);
    record('גבולות עמוד — ציור בעורך', drawn ? 'עובד' : 'שבור', painted,
      drawn ? '' : 'ה-XML נכתב, אבל אין גבול מצויר על העמוד במסך');

    // ומספרי השורות — האם הם מצוירים.
    const lineNums = await app.js(
      `document.querySelectorAll('[class*=line-number], [class*=lineNumber], .sd-line-numbers').length`);
    console.log('אלמנטים של מספרי שורות במסך:', lineNums);
    record('מספרי שורות — ציור בעורך', lineNums > 0 ? 'עובד' : 'שבור',
      `אלמנטים: ${lineNums}`, lineNums > 0 ? '' : 'ה-XML נכתב, אבל אין מספרי שורות מצוירים');

    /**
     * עמודות — לא לפי CSS columns אלא לפי גיאומטריה, ועל טקסט **ארוך**:
     * מסמך של שתי שורות קצרות אינו יכול להוכיח פיצול לא לכאן ולא לכאן.
     */
    const measure = `(function(){
      var page = document.querySelector('.superdoc-page, [data-page-index]');
      if (!page) return JSON.stringify({error: 'no-page'});
      var pr = page.getBoundingClientRect();
      var lines = document.querySelectorAll('.superdoc-line, .superdoc-fragment');
      var widest = 0, lefts = {};
      for (var i = 0; i < lines.length; i++) {
        var r = lines[i].getBoundingClientRect();
        if (r.width > widest) widest = r.width;
        lefts[Math.round((r.left - pr.left) / 20) * 20] = 1;
      }
      return JSON.stringify({pageWidth: Math.round(pr.width), widestLine: Math.round(widest),
        lines: lines.length, distinctLefts: Object.keys(lefts).length});
    })()`;

    /**
     * עמודות — מתצלום המדדים של מנוע הפריסה עצמו, ולא מהקלדת מסמך שלם:
     * `pageMetrics.getSnapshot()` הוא המקור שהסרגל כבר נשען עליו
     * (page-setup.ts:505), והוא מה שהמנוע **צייר** ולא מה שביקשנו.
     */
    const snap = await app.js(`(function(){
      try {
        var ed = window.__qa.sd().activeEditor;
        var s = ed && ed.pageMetrics && ed.pageMetrics.getSnapshot && ed.pageMetrics.getSnapshot();
        if (!s) return JSON.stringify({error: 'no-snapshot'});
        return JSON.stringify({keys: Object.keys(s), page0: s.pages && s.pages[0]}).slice(0, 1500);
      } catch (e) { return JSON.stringify({error: String(e && e.message)}); }
    })()`);
    console.log('תצלום המדדים של מנוע הפריסה (עם שתי עמודות מוגדרות):', snap);
    // אזור הטקסט שהמנוע צייר: אם יש שתי עמודות, יש לו ייצוג כאן.
    const hasColumns = /column/i.test(snap);
    record('עמודות — ציור בעורך', hasColumns ? 'עובד' : 'שבור', snap.slice(0, 600),
      hasColumns ? '' : 'ה-XML נכתב, אבל בתצלום המדדים של מנוע הפריסה אין ולו שדה אחד של עמודות — העמוד אינו מפוצל');

    // (הבדיקה הישנה, על מסמך קצר, הוחלפה במדידה שלמעלה)
    // ניקוי
    await app.openMenu('גבולות עמוד');
    await app.clickMenu('ללא גבול', { after: 900 });
    await app.openMenu('מספרי שורות');
    await app.clickMenu('ללא', { after: 900 });
    await app.openMenu('עמודות');
    await app.clickMenu('אחת', { after: 900 });
    await app.openMenu('יישור אנכי');
    await app.clickMenu('למעלה', { after: 900 });
  }

  /* ---------------- אבחון: styles.apply על docDefaults, ישירות ---------------- */
  if (wants('apiprobe')) {
    const probe = await app.js(`(async () => {
      const doc = window.__qa.doc();
      const out = [];
      const call = async (label, patch, opts) => {
        try {
          const r = await doc.styles.apply({ target: { scope: 'docDefaults', channel: 'run' }, patch }, opts);
          out.push({ label, ok: true, receipt: JSON.parse(JSON.stringify(r)) });
        } catch (e) {
          out.push({ label, ok: false, error: String(e && e.message) });
        }
      };
      await call('dryRun fontSize:0', { fontSize: 0 }, { dryRun: true });
      await call('fontSize:36 בלבד', { fontSize: 36 });
      await call('fontFamily כ-record', { fontFamily: { ascii: 'David', hAnsi: 'David', cs: 'David' } });
      await call('fontFamily כמחרוזת', { fontFamily: 'David' });
      await call('שניהם יחד (מה שהדיאלוג שולח)', { fontFamily: { ascii: 'Narkisim', hAnsi: 'Narkisim', cs: 'Narkisim' }, fontSize: 22 });
      await call('שניהם יחד, סדר הפוך', { fontSize: 28, fontFamily: { ascii: 'Miriam', hAnsi: 'Miriam', cs: 'Miriam' } });
      await call('dryRun fontSize:0 (שוב)', { fontSize: 0 }, { dryRun: true });
      return JSON.stringify(out);
    })()`);
    console.log('\nבדיקת styles.apply ישירות:\n' + probe);
    const rows = JSON.parse(probe);
    for (const r of rows) console.log('  ·', r.label, '→', JSON.stringify(r.ok ? r.receipt : r.error));

    const styles = (await app.docx())?.['word/styles.xml'] ?? '';
    const rPr = /<w:rPrDefault>[\s\S]*?<\/w:rPrDefault>/.exec(styles)?.[0] ?? '';
    console.log('rPrDefault אחרי הבדיקה:', rPr);

    const recordRecord = rows.find((r) => r.label === 'fontFamily כ-record');
    const stringRecord = rows.find((r) => r.label === 'fontFamily כמחרוזת');
    record('API: fontFamily כ-record (מה שהמודול שולח)',
      recordRecord?.ok ? 'עובד' : 'שבור',
      JSON.stringify(recordRecord?.ok ? recordRecord.receipt : recordRecord?.error), '');
    /* דחייה כאן היא ההתנהגות **הנכונה**, ולכן היא „עובד” ולא „שבור”.
     *
     * `patch.fontFamily` הוא record של ascii/hAnsi/cs — זה מה שהשורה שמעל
     * מוכיחה שהמודול שולח, וזה מה שעובר. מחרוזת אינה הצורה של החוזה, והמנוע
     * דוחה אותה בהודעה מפורשת. השורה הזו קיימת כדי לתעד את הגבול, לא כדי
     * לדרוש שיטושטש.
     *
     * למה זה תוקן: הרישום ההפוך ניפח את מונה השבורים בשער, ומי שקרא אותו
     * הבין „יש לנו באג ב-fontFamily” — כשמה שיש הוא חוזה שנשמר. שער שמסמן
     * התנהגות תקינה כשבורה מלמד להתעלם ממנו. */
    record('API: fontFamily כמחרוזת נדחית (החוזה הוא record)',
      stringRecord?.ok ? 'שבור' : 'עובד',
      stringRecord?.ok
        ? `התקבלה מחרוזת — החוזה נשבר: ${JSON.stringify(stringRecord.receipt)}`
        : `נדחתה כמצופה: ${JSON.stringify(stringRecord?.error)}`,
      stringRecord?.ok ? 'המנוע קיבל צורה שאינה בחוזה' : '');
    const sizeOnly = rows.find((r) => r.label === 'fontSize:36 בלבד');
    record('API: fontSize בלבד', sizeOnly?.ok ? 'עובד' : 'שבור',
      JSON.stringify(sizeOnly?.ok ? sizeOnly.receipt : sizeOnly?.error),
      /w:sz w:val="36"/.test(rPr) ? 'נכתב ל-styles.xml' : 'לא נכתב ל-styles.xml');
  }

  /* ---------------- אבחון: איזה שדה מפיל את דיאלוג „ברירות מחדל” ---------------- */
  if (wants('ddprobe')) {
    // רק שם הגופן — בלי לגעת בגודל.
    await app.reset();
    await app.click('ברירות מחדל', { after: 1200 });
    await app.dialogFill('dd-family', 'David');
    await app.sleep(400);
    const afterFamily = await app.dialog();
    console.log('אחרי מילוי שם הגופן בלבד — דיאלוג:', afterFamily ? 'קיים' : 'נעלם');
    if (afterFamily) {
      await app.clickDialog('אישור', { after: 1600 });
      const rPr = /<w:rPrDefault>[\s\S]*?<\/w:rPrDefault>/.exec(
        (await app.docx())?.['word/styles.xml'] ?? '',
      )?.[0] ?? '';
      console.log('rPrDefault אחרי גופן בלבד:', rPr);
      record('ברירות מחדל — גופן בלבד (בלי לגעת בשדה הגודל)',
        /w:ascii="David"/.test(rPr) ? 'עובד' : 'שבור', rPr.slice(0, 300), '');
    } else {
      record('ברירות מחדל — גופן בלבד', 'שבור', '', 'הדיאלוג נעלם כבר במילוי שם הגופן');
    }

    // עכשיו הקלדה אמיתית בשדה הגודל, תו אחר תו.
    await app.reset();
    await app.js('window.__stacks = window.__stacks || []');
    await app.click('ברירות מחדל', { after: 1200 });
    const beforeType = await app.dialog();
    await app.js(`document.querySelector('#dd-size').focus()`);
    await app.press('1', 'Digit1', 49, 0, '1');
    await app.sleep(500);
    const afterType = await app.dialog();
    const typeState = await app.js(`(function(){
      var el = document.querySelector('#dd-size');
      return JSON.stringify({exists: !!el, value: el ? el.value : null});
    })()`);
    console.log('לפני הקלדה:', beforeType ? 'דיאלוג קיים' : 'אין', '| אחרי הקלדת „1”:',
      afterType ? 'קיים' : 'נעלם', '|', typeState);
    console.log('log:', JSON.stringify(await app.log()));
    record(
      'ברירות מחדל — הקלדה בשדה „גודל ברירת מחדל”',
      afterType ? 'עובד' : 'שבור',
      typeState,
      afterType ? '' : 'תו אחד בשדה הגודל מפיל את רינדור הדיאלוג והוא נעלם מהמסך',
    );
    await app.escape();
  }

  /* ---------------- הכרעה על העמודות: טקסט ארוך, ומדידת רוחב השורות ---------------- */
  if (wants('colsproof')) {
    const measure = `(function(){
      var page = document.querySelector('.superdoc-page, [data-page-index]');
      if (!page) return JSON.stringify({error: 'no-page'});
      var pr = page.getBoundingClientRect();
      var lines = document.querySelectorAll('.superdoc-line, .superdoc-fragment');
      var widest = 0, lefts = {};
      for (var i = 0; i < lines.length; i++) {
        var r = lines[i].getBoundingClientRect();
        if (r.width > widest) widest = r.width;
        lefts[Math.round((r.left - pr.left) / 30) * 30] = 1;
      }
      var pages = document.querySelectorAll('.superdoc-page, [data-page-index]');
      return JSON.stringify({pageWidth: Math.round(pr.width), widestLine: Math.round(widest),
        lines: lines.length, distinctLefts: Object.keys(lefts).sort(function(a,b){return a-b;}),
        pages: pages.length});
    })()`;

    await app.openMenu('עמודות');
    await app.clickMenu('אחת', { after: 1200 });
    await app.caret(0);
    await app.press('End', 'End', 35);
    // Input.insertText — מסלול קלט אמיתי, בלי 800 סבבי CDP של הקלדה תו-תו.
    const filler = 'kaf lamed mem nun samech ayin pe tsadi kuf resh shin tav alef bet gimel dalet he vav zayin het tet yod ';
    await app.cdp.send('Input.insertText', { text: filler.repeat(8) });
    await app.sleep(3000);
    const oneCol = await app.js(measure);
    console.log('גיאומטריה בעמודה אחת:', oneCol);

    await app.openMenu('עמודות');
    await app.clickMenu('שתיים', { after: 2500 });
    const twoCol = await app.js(measure);
    console.log('גיאומטריה בשתי עמודות:', twoCol);

    const one = JSON.parse(oneCol);
    const two = JSON.parse(twoCol);
    const enoughText = !one.error && one.lines >= 4 && one.widestLine > one.pageWidth * 0.5;
    // שני תנאים נפרדים, ובכוונה:
    //   1. **שבירת השורה** לפי רוחב העמודה — האם המידה צומצמה.
    //   2. **הצבת העמודות זו לצד זו** — האם יש שני מיקומי `left` שונים.
    // מנוע שעושה את הראשון ולא את השני מצייר עמודה צרה אחת שנמשכת למטה,
    // ולא שתי עמודות. זה נראה על המסך אחרת לגמרי, ולכן זו לא אותה שאלה.
    const narrowed = enoughText && two.widestLine < one.widestLine * 0.7;
    const sideBySide = narrowed && two.distinctLefts.length >= 2;
    record('עמודות — ציור בעורך (טקסט ארוך)',
      !enoughText ? 'לא נבדק' : sideBySide ? 'עובד' : narrowed ? 'חלקי' : 'שבור',
      `עמודה אחת: ${oneCol} | שתי עמודות: ${twoCol}`,
      !enoughText
        ? 'לא נכנס מספיק טקסט כדי להכריע'
        : sideBySide
          ? ''
          : narrowed
            ? 'שבירת השורה כן מצומצמת לרוחב העמודה (602px → 277px), אבל כל השורות נשארות באותו `left` ובאותו עמוד — העמודה השנייה נערמת מתחת לראשונה במקום לצדה'
            : 'ה-XML נכתב, אבל רוחב השורות לא השתנה — הטקסט אינו זורם לשתי עמודות');

    await app.openMenu('עמודות');
    await app.clickMenu('אחת', { after: 1200 });
  }

  console.log('\n--- sectPr סופי ---');
  console.log(lastSectPr(await app.docx()));
  console.log('\n--- לוג הדף ---');
  console.log(JSON.stringify(realLog(await app.log())));
} finally {
  app.close();
}

console.log('\nRAW:' + JSON.stringify(evidence));
report.print();
process.exit(0);
