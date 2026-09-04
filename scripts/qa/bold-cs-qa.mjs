/**
 * שער: הדגשה של **כתב מורכב** מגיעה למסך.
 *
 * מה שדווח: מסמך עברי שכותרותיו מודגשות ב-Word נראה אצלנו דק. מה שנמצא בקובץ:
 * הסגנונות נושאים `<w:bCs/>` בלבד, בלי `<w:b/>` — וזה מה ש-Word העברי כותב
 * כשמדגישים בחירה שכולה עברית. Word מרנדר ריצה עברית לפי `bCs`; המנוע מרנדר
 * לפי `w:b` בלבד. ההשלמה נעשית ב-src/engine/docx-preflight.ts, לפני שהמנוע
 * רואה את הבייטים, והשער הזה הוא מה שמוכיח שהיא מגיעה עד הפיקסלים.
 *
 * ## למה המסמך נבנה מהייצוא של המנוע עצמו
 *
 * DOCX שנכתב ביד בשער הוא בדיקה של מה שכתבנו ולא של מה שקורה: חלק חסר או
 * `rels` לא מדויק נופלים כ„המסמך לא נפתח”, וזה נראה בדיוק כמו באג. לכן השער
 * מקליד טקסט, מבקש מהמנוע את ה-DOCX שלו (`__qa.exportBase64`), **מחדיר** לתוכו
 * `bCs` בשתי הצורות שקיימות במסמכים אמיתיים, ופותח אותו בחזרה.
 *
 * שני מסלולים, מפני שאלה שני מקומות שונים ב-XML:
 *
 * 1. **על הריצה** — `w:rPr` של הריצה עצמה, עיצוב ישיר.
 * 2. **על ברירות המחדל** — `w:docDefaults/w:rPrDefault` ב-`styles.xml`, שזה
 *    המסלול שהמסמך שדווח עובר בו (סגנון, ולא עיצוב ישיר).
 *
 * ובקרה שלישית שאינה פחות חשובה: המסמך **לפני** ההחדרה חייב להישאר דק. שער
 * שמדגיש הכול היה עובר את שני הראשונים ומשקר.
 *
 * ## שני מקרים שאינם על המסך
 *
 * **מעקב שינויים.** `w:bCs` מופיע גם בתוך `w:rPrChange`, שהוא העיצוב שהיה
 * *לפני* שינוי מסומן. המסך אינו יכול להוכיח שלא נגענו שם — היסטוריה אינה
 * מרונדרת בין כה וכה — ולכן המקרה הזה נמדד ב**ייצוא**: אחרי סבב שלם, ה-
 * `rPrChange` חייב לצאת בדיוק כפי שנכנס, בלי `w:b` שהוזרק לתוכו.
 *
 * הספירה היא **גם בכניסה וגם ביציאה**, ולא ביציאה בלבד. „אפס בייצוא” נראה
 * בדיוק כמו „המנוע מחק את ההיסטוריה” וגם כמו „ההזרקה לא קרתה”, ומדידה שאינה
 * מבדילה ביניהם דיווחה כאן פעם אחת על פער במנוע שלא היה קיים.
 *
 * **ההודעה למשתמש.** התיקון נכתב לתוך המסמך וייצא איתו בשמירה, ולכן שורת המצב
 * אומרת זאת (COMPLEX_SCRIPT_BOLD_NOTICE). שער שמודד רק פיקסלים היה מרשה
 * להודעה הזאת להיעלם בשקט.
 *
 *   npm run build && node scripts/qa/bold-cs-qa.mjs [נתיב.docx]
 */
import { readFileSync } from 'node:fs';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { openApp, createReport, sleep } from './harness.mjs';

const PORT = Number(process.env.QA_PORT ?? 9378);
const report = createReport('הדגשת כתב מורכב (w:bCs) על המסך', { strict: true });
const log = (...a) => console.log('   ', ...a);

/** המסמך שדווח, כשנמסר נתיב. מקרה נוסף, לא במקום השערים שנבנים כאן. */
const REPORTED = process.argv[2] ?? null;

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/* ------------------------------------------------------------------ */
/* ZIP: קריאה מלאה וכתיבה                                              */
/* ------------------------------------------------------------------ */

/**
 * כל הרשומות כבייטים. `harness.unzip` מחזיר מחרוזות בלבד, וכאן צריך גם את
 * הבייטים כמות שהם — חלק שאינו נערך נכתב בחזרה בדיוק כפי שנקרא.
 */
function readZip(buffer) {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0 && i > buffer.length - 22 - 65_536; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('אינו ZIP — לא נמצא EOCD');

  const count = buffer.readUInt16LE(eocd + 10);
  const entries = [];
  let ptr = buffer.readUInt32LE(eocd + 16);

  for (let i = 0; i < count; i++) {
    const method = buffer.readUInt16LE(ptr + 10);
    const compressedSize = buffer.readUInt32LE(ptr + 20);
    const nameLen = buffer.readUInt16LE(ptr + 28);
    const extraLen = buffer.readUInt16LE(ptr + 30);
    const commentLen = buffer.readUInt16LE(ptr + 32);
    const localOffset = buffer.readUInt32LE(ptr + 42);
    const name = buffer.toString('utf8', ptr + 46, ptr + 46 + nameLen);

    const localNameLen = buffer.readUInt16LE(localOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLen + localExtraLen;
    const raw = buffer.subarray(start, start + compressedSize);

    entries.push({ name, bytes: method === 0 ? raw : inflateRawSync(raw) });
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let value = i;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[i] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** כותבת ZIP שכולו `deflate` — כדי שהשער יעבור גם במסלול הפריסה שבמוצר. */
function writeZip(entries) {
  const records = entries.map((entry) => ({
    nameBytes: Buffer.from(entry.name, 'utf8'),
    stored: deflateRawSync(entry.bytes),
    raw: entry.bytes,
    crc: crc32(entry.bytes),
  }));

  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const record of records) {
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(8, 8);
    header.writeUInt32LE(record.crc, 14);
    header.writeUInt32LE(record.stored.length, 18);
    header.writeUInt32LE(record.raw.length, 22);
    header.writeUInt16LE(record.nameBytes.length, 26);
    locals.push(header, record.nameBytes, record.stored);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(record.crc, 16);
    central.writeUInt32LE(record.stored.length, 20);
    central.writeUInt32LE(record.raw.length, 24);
    central.writeUInt16LE(record.nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, record.nameBytes);

    offset += 30 + record.nameBytes.length + record.stored.length;
  }

  const centralBytes = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(records.length, 8);
  eocd.writeUInt16LE(records.length, 10);
  eocd.writeUInt32LE(centralBytes.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, centralBytes, eocd]);
}

/** חלקי ה-DOCX של המסמך שעל המסך, כמחרוזות. */
async function exportedParts(app) {
  const base64 = await app.js('window.__qa.exportBase64()');
  const parts = {};
  for (const entry of readZip(Buffer.from(base64, 'base64'))) {
    parts[entry.name] = entry.bytes.toString('utf8');
  }
  return parts;
}

/** ה-DOCX של המסמך שעל המסך, כבייטים. */
async function exportBuffer(app) {
  return Buffer.from(await app.js('window.__qa.exportBase64()'), 'base64');
}

/**
 * עותק של `buffer` שהחלקים שבו עברו את `edit`.
 *
 * **גוזר מ-buffer שנמסר ולא מהמסמך שעל המסך, וזה תוקן אחרי שנמדד:** כל מקרה
 * כאן פותח מסמך, ולכן מקרה שגוזר „מה שפתוח כרגע” גוזר את התוצר של קודמו. כך
 * שלב מעקב השינויים נבנה על מסמך שכבר נשא `bCs` בברירות המחדל מהשלב שלפניו,
 * נצבע מודגש בצדק, והשער דיווח על „הדגשה שחלחלה מההיסטוריה” שלא הייתה.
 */
function injectInto(buffer, edit) {
  const entries = readZip(buffer);
  let touched = 0;
  for (const entry of entries) {
    const before = entry.bytes.toString('utf8');
    const after = edit(entry.name, before);
    if (after !== undefined && after !== before) {
      entry.bytes = Buffer.from(after, 'utf8');
      touched += 1;
    }
  }
  if (touched === 0) throw new Error('ההחדרה לא נגעה באף חלק — הייצוא אינו במבנה שהשער מניח');
  return writeZip(entries);
}

/* ------------------------------------------------------------------ */
/* ההחדרות                                                            */
/* ------------------------------------------------------------------ */

/** `<w:bCs/>` על כל ריצה — עיצוב ישיר, בלי `w:b` לצדה. */
function injectRunLevel(name, xml) {
  if (name !== 'word/document.xml') return undefined;
  return xml
    .replace(/<w:r>(?!<w:rPr)/g, '<w:r><w:rPr><w:bCs/></w:rPr>')
    .replace(/<w:rPr>(?!<w:bCs\/>)/g, '<w:rPr><w:bCs/>');
}

/** `<w:bCs/>` על ברירת המחדל של הריצות — המסלול של הסגנונות. */
function injectDefaults(name, xml) {
  if (name !== 'word/styles.xml') return undefined;
  if (/<w:rPrDefault>\s*<w:rPr>/.test(xml)) {
    return xml.replace(/(<w:rPrDefault>\s*<w:rPr>)/, '$1<w:bCs/>');
  }
  if (xml.includes('<w:rPrDefault/>')) {
    return xml.replace('<w:rPrDefault/>', '<w:rPrDefault><w:rPr><w:bCs/></w:rPr></w:rPrDefault>');
  }
  return xml.replace(
    '<w:docDefaults>',
    '<w:docDefaults><w:rPrDefault><w:rPr><w:bCs/></w:rPr></w:rPrDefault>',
  );
}

/**
 * `<w:bCs/>` **רק** בתוך `w:rPrChange` — כלומר בהיסטוריה של שינוי מסומן, ולא
 * בעיצוב החי. `rPrChange` הוא האיבר האחרון ב-`CT_RPr`, ולכן הוא נדחף לסוף.
 */
const RPR_CHANGE =
  '<w:rPrChange w:id="991" w:author="qa" w:date="2024-01-01T00:00:00Z">' +
  '<w:rPr><w:bCs/></w:rPr></w:rPrChange>';

function injectTrackedHistory(name, xml) {
  if (name !== 'word/document.xml') return undefined;
  return xml
    .replace(/<\/w:rPr>/g, `${RPR_CHANGE}</w:rPr>`)
    .replace(/<w:r>(?!<w:rPr)/g, `<w:r><w:rPr>${RPR_CHANGE}</w:rPr>`);
}

/* ------------------------------------------------------------------ */
/* מדידה                                                              */
/* ------------------------------------------------------------------ */

/**
 * המשקל שנצבע בפועל, לפי `getComputedStyle` על ההורה של צומת הטקסט.
 *
 * לא על ה-`.superdoc-line`: ההדגשה יושבת על הריצה שבתוכה, ושורה מודגשת ושורה
 * שאינה מודגשת נראות שם זהות.
 *
 * ו-`offsetParent` אינו הידור: „פתח קובץ” פותח את המסמך ב**טאב** חדש, והטאב
 * הקודם נשאר ב-DOM עם `display:none` — כלומר `.superdoc-line` מחזיר גם את
 * שורותיו. שער שאינו מסנן אותן מודד את המסמך הקודם ומדווח „חצי מודגש”. נמדד:
 * ארבע שורות במקום שתיים, ואחר כך שש.
 */
const LINES = `
(function () {
  var out = [];
  var lines = document.querySelectorAll('.superdoc-line');
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].offsetParent === null) continue;
    var text = (lines[i].textContent || '').trim();
    if (!text) continue;
    var walker = document.createTreeWalker(lines[i], NodeFilter.SHOW_TEXT);
    var node = walker.nextNode();
    var host = node && node.parentElement ? node.parentElement : lines[i];
    var style = getComputedStyle(host);
    out.push({ i: i, text: text.slice(0, 40), weight: style.fontWeight, size: style.fontSize });
  }
  return JSON.stringify(out);
})()
`;

const lines = (app) => app.js(LINES).then(JSON.parse);
const isBold = (row) => Number(row.weight) >= 600 || row.weight === 'bold';

async function widen(app) {
  await app.cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1600,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await sleep(2_000);
}

/** פותחת docx דרך בורר הקבצים של הדמה — התבנית של load-progress-qa.mjs. */
async function open(app, buffer, name) {
  const dataUrl = `data:${DOCX_MIME};base64,` + buffer.toString('base64');
  await app.js(
    `window.__qaHost.replies['fs.pickUserFile']=function(){return Promise.resolve({success:true,error:null,` +
      `data:{token:'qa-bcs',url:${JSON.stringify(dataUrl)},name:${JSON.stringify(name)},size:${buffer.length},access:'readwrite'}})}`,
  );
  await app.tab('קובץ');
  if (!(await app.click('פתח קובץ', { after: 8_000 }))) throw new Error('„פתח קובץ” לא נמצא ברצועה');
  for (let waited = 0; waited < 40_000; waited += 250) {
    await sleep(250);
    if (!(await app.exists('.status-load'))) break;
  }
  await sleep(2_500);
}

const SEED = ['שבועת הדיינין', 'מודה במקצת'];

async function main() {
  const app = await openApp({ name: 'bold-cs', port: PORT });
  try {
    await widen(app);

    /* -------- בקרה: המסמך שהוקלד, בלי `bCs`, נשאר דק -------- */
    await app.caret(0);
    for (let i = 0; i < SEED.length; i++) {
      await app.type(SEED[i]);
      if (i < SEED.length - 1) {
        await app.press('Enter', 'Enter', 13);
        await sleep(350);
      }
    }
    await sleep(1_200);

    const seeded = await exportBuffer(app);
    const plain = await lines(app);
    log('הוקלד:', JSON.stringify(plain.map((row) => `${row.text}=${row.weight}`)));
    if (plain.length === 0) {
      report.stuck('בקרה — בלי bCs', 'לא נמצא טקסט על המסך');
    } else if (plain.some(isBold)) {
      report.fail('בקרה — בלי bCs', `טקסט שאין בו הדגשה נצבע מודגש: ${JSON.stringify(plain)}`);
    } else {
      report.pass('בקרה — בלי bCs', `${plain.length} שורות ב-weight ${plain[0].weight}`);
    }

    /* -------- שני המסלולים שבהם `bCs` מגיע במסמכים אמיתיים -------- */
    let statusAfterRepair = null;
    for (const [name, inject] of [
      ['bCs על הריצה', injectRunLevel],
      ['bCs על ברירות המחדל', injectDefaults],
    ]) {
      const docx = injectInto(seeded, inject);
      await open(app, docx, 'bcs.docx');
      const rows = await lines(app);
      if (statusAfterRepair === null) statusAfterRepair = await app.status();
      log(`${name}:`, JSON.stringify(rows.map((row) => `${row.text}=${row.weight}`)));

      if (rows.length === 0) report.stuck(name, 'המסמך נפתח בלי טקסט');
      else if (rows.every(isBold)) report.pass(name, `${rows.length} שורות ב-weight ${rows[0].weight}`);
      else
        report.fail(
          name,
          `${rows.filter(isBold).length} מתוך ${rows.length} מודגשות — ` +
            `w:bCs אינו מגיע למסך: ${JSON.stringify(rows)}`,
        );
    }

    /* -------- ההודעה למשתמש: המסמך שלו שונה -------- */
    log('שורת המצב אחרי התיקון:', JSON.stringify(statusAfterRepair));
    if (!statusAfterRepair) {
      report.stuck('הודעה למשתמש', 'שורת המצב לא נקראה');
    } else if (statusAfterRepair.error) {
      report.fail('הודעה למשתמש', `ההודעה הוצגה כשגיאה: „${statusAfterRepair.text}”`);
    } else if ((statusAfterRepair.text ?? '').includes('הושלמה במסמך')) {
      report.pass('הודעה למשתמש', `„${statusAfterRepair.text}”`);
    } else {
      report.fail(
        'הודעה למשתמש',
        `המסמך שונה ושורת המצב אינה אומרת זאת: „${statusAfterRepair.text ?? '—'}”`,
      );
    }

    /* -------- מעקב שינויים: מה שבתוך `w:rPrChange` אינו נגוע -------- */
    {
      const docx = injectInto(seeded, injectTrackedHistory);
      // נספר גם בכניסה: „אפס בייצוא” אומר משהו רק לצד מה שנכנס.
      const injected = (
        readZip(docx)
          .find((entry) => entry.name === 'word/document.xml')
          .bytes.toString('utf8')
          .match(/<w:rPrChange/g) ?? []
      ).length;
      await open(app, docx, 'tracked.docx');
      const rows = await lines(app);
      log('מעקב שינויים על המסך:', JSON.stringify(rows.map((row) => `${row.text}=${row.weight}`)));

      // ההיסטוריה אינה מרונדרת, ולכן המסך יכול להוכיח רק את חצי השאלה: שהדגשה
      // שיושבת *רק* בהיסטוריה אינה מחלחלת לעיצוב החי.
      if (rows.length === 0) {
        report.stuck('מעקב שינויים — המסך', 'המסמך נפתח בלי טקסט');
      } else if (rows.some(isBold)) {
        report.fail(
          'מעקב שינויים — המסך',
          `הדגשה שיושבת רק ב-w:rPrChange חלחלה לעיצוב החי: ${JSON.stringify(rows)}`,
        );
      } else {
        report.pass('מעקב שינויים — המסך', `${rows.length} שורות נשארו ב-weight ${rows[0].weight}`);
      }

      // וחצייה השני נמדד בייצוא: ה-`rPrChange` חייב לצאת כפי שנכנס.
      const parts = await exportedParts(app);
      const body = parts['word/document.xml'] ?? '';
      const changes = body.match(/<w:rPrChange[^>]*>.*?<\/w:rPrChange>/gs) ?? [];
      const poisoned = changes.filter((change) => /<w:b(?:\s[^>]*)?\/?>/.test(change));
      log(`rPrChange: נכנסו ${injected}, יצאו ${changes.length}, מזוהמים ${poisoned.length}`);
      if (changes.length === 0) {
        report.skip(
          'מעקב שינויים — הייצוא',
          `${injected} רשומות w:rPrChange נכנסו ו-0 יצאו — המנוע לא שמר אותן בסבב, ` +
            'ולכן אין כאן מה למדוד. נמדד 2→2, כלומר שינוי התנהגות במנוע',
        );
      } else if (poisoned.length > 0) {
        report.fail(
          'מעקב שינויים — הייצוא',
          `w:b הוזרק לתוך ${poisoned.length} מתוך ${changes.length} רשומות היסטוריה: ${poisoned[0]}`,
        );
      } else {
        report.pass(
          'מעקב שינויים — הייצוא',
          `${changes.length} רשומות w:rPrChange יצאו בלי w:b שהוזרק`,
        );
      }
    }

    /* -------- המסמך שדווח, כשנמסר -------- */
    if (!REPORTED) {
      report.skip('המסמך שדווח', 'לא נמסר נתיב ל-docx');
    } else {
      await open(app, readFileSync(REPORTED), 'reported.docx');
      const rows = await lines(app);
      // הכותרות בקובץ ההוא גדולות מהגוף (szCs 28 מול 24), וכך מזהים אותן בלי
      // להיתלות בטקסט מסוים.
      const sizes = rows.map((row) => parseFloat(row.size)).sort((a, b) => a - b);
      const body = sizes[Math.floor(sizes.length / 2)];
      const heads = rows.filter((row) => parseFloat(row.size) > body);
      log(`גוף ${body}px, כותרות: ${heads.length}, מודגשות: ${heads.filter(isBold).length}`);
      if (heads.length === 0) report.skip('המסמך שדווח', 'לא זוהו כותרות לפי גודל הגופן');
      else if (heads.every(isBold)) report.pass('המסמך שדווח', `${heads.length} כותרות מודגשות`);
      else
        report.fail(
          'המסמך שדווח',
          `${heads.filter(isBold).length} מתוך ${heads.length} כותרות מודגשות`,
        );
    }
  } finally {
    app.close();
  }
}

main()
  .catch((error) => {
    // חריגה היא **כשל** של השער, לא „תקוע”: `stuck` אינו נספר כשבור גם
    // ב-strict (קפיאת מדידה אינה כשל פקד), ולכן הרצה שנפלה על הרצפה — הרצועה
    // השתנתה, ההחדרה לא מצאה חלק, הקובץ שדווח אינו נקרא — הייתה יוצאת עם 0
    // ונראית ב-`verify:qa` כירוקה. השורות שלא נמדדו נשארות חסרות, וזה נראה.
    report.fail('השער', String(error && (error.stack || error.message)));
  })
  .finally(() => report.print());
