/**
 * שער הגופנים המותקנים: האם הבורר באמת מציג את מה שיש **במכונה הזאת**.
 *
 * למה שער ולא בדיקת יחידה: הבדיקות מזריקות את `available` ואת `canMeasure`,
 * ולכן הן בודקות את ההכרעות — לא את המדידה. המדידה עצמה תלויה ב-canvas אמיתי,
 * בגופנים אמיתיים ובגופנים שהמארח מזריק, ואת שלושתם אפשר לראות רק בדפדפן על
 * ה-dist הארוז מ-`file://` — ה-origin שממנו אוצריא טוענת תוסף.
 *
 * ארבע שאלות, ולכל אחת ערך גם כשהתשובה שלילית:
 *
 * 1. **המנייה מצאה משהו?** אם לא — הבורר נשאר על הרשימה הקבועה בלבד (שלנו,
 *    ברירות המחדל של המנוע, וזנב הלטינית), וזה בדיוק הבאג שהשער קיים בשבילו.
 * 2. **הקיבוץ קרה?** רשימה של מאות שמות בלי כותרות קבוצה אינה שמישה.
 * 3. **הסדר נשמר?** Frank Ruhl חייב להישאר בשורה הראשונה. מנייה שדוחפת 300
 *    שמות לראש הרשימה גרועה מאין־מנייה.
 * 4. **בחירה מהזנב באמת מוחלת?** שם שמופיע בבורר ואינו נכנס ל-OOXML הוא
 *    הבטחה שקרית — והנזק אמיתי: `lineRule="auto"` גוזר את גובה השורה מהגופן
 *    שנבחר בפועל (ראו src/engine/docx-fonts.ts).
 *
 * וגם רישום אחד שאינו נבדק אלא **נמדד ומדווח**: האם `queryLocalFonts` קיים
 * ועובד כאן. זו השאלה שהכריעה את התכנון (ראו docs/otzaria-fonts-list-request.md),
 * והתשובה שייכת ללוג ולא לזיכרון של מישהו.
 *
 *   npm run build && node scripts/qa/installed-fonts-qa.mjs
 */
import { openApp, createReport } from './harness.mjs';

const report = createReport('גופנים מותקנים', { strict: true });
const app = await openApp({ name: 'installed-fonts', port: Number(process.env.QA_PORT ?? 9366) });

/** שמות הקבוצות, כפי ש-src/engine/font-options.ts קובע אותן. */
const GROUP_HEBREW = 'עברית';
const GROUP_ALL = 'כל הגופנים';

/** ששת הגופנים של התוסף. הם ורק הם חייבים לפתוח את הרשימה. */
const OURS = ['Assistant', 'FrankRuhlCLM', 'TaameyDavidCLM', 'Rubik', 'Shofar', 'NotoRashiHebrew'];

/** זנב הלטינית. אחרי גופני המסמך שהמנוע מדווח, ולכן במקום שאינו קבוע מראש. */
const LATIN_TAIL = ['Aptos', 'Segoe UI', 'Times New Roman', 'Arial'];

/** הרשימה הקבועה — מה שהבורר הציג לפני שהייתה מנייה בכלל. */
const FIXED = [...OURS, ...LATIN_TAIL];

try {
  /* -------------------------------------------------------------- */
  /* רישום: מה הדפדפן הזה בכלל מציע                                  */
  /* -------------------------------------------------------------- */
  const api = await app.js(`JSON.stringify({
    hasQueryLocalFonts: typeof window.queryLocalFonts === 'function',
    secureContext: window.isSecureContext === true,
    origin: location.protocol
  })`);
  console.log('סביבת המדידה:', api);

  /* -------------------------------------------------------------- */
  /* 1 — המנייה מצאה משהו                                            */
  /* -------------------------------------------------------------- */
  await app.tab('בית');
  // המנייה נורית ב-onMounted ומוותרת על החוט כל 40 שמות; היא נוחתת אחרי
  // שהמסמך הראשון כבר פתוח, ולכן ההמתנה כאן ולא בהרכבה.
  await app.sleep(2500);

  const options = await app.options('גופן');
  if (!Array.isArray(options)) {
    report.fail('בורר הגופן נמצא', 'ה-select לא אותר בכלל');
    throw new Error('אין בורר — אין מה למדוד');
  }

  const names = options.map((o) => o.value);
  const inGroup = (label) => options.filter((o) => o.group === label).map((o) => o.value);

  /*
    תוצרי המנייה נמדדים לפי **הקבוצות** ולא לפי „מה שאינו ברשימה הקבועה”.
    ההפרש מול רשימה קשיחה היה עובר תמיד: המנוע מוסיף מעצמו את Calibri,
    Georgia, Verdana ו-Courier New, ולכן הוא חיובי גם כשהמנייה החזירה אפס.
    שתי הקבוצות המסומנות מיוצרות **רק** על ידי המנייה, ולכן הן המדד המדויק.
  */
  const enumerated = inGroup(GROUP_HEBREW).concat(inGroup(GROUP_ALL));
  console.log(`אפשרויות בבורר: ${names.length} (${enumerated.length} מהמנייה)`);
  console.log('20 הראשונות:', names.slice(0, 20).join(', '));

  const extra = enumerated;
  enumerated.length > 0
    ? report.pass('המנייה הוסיפה גופנים של המכונה', `${enumerated.length} משפחות`)
    : report.fail(
        'המנייה הוסיפה גופנים של המכונה',
        'שתי הקבוצות ריקות — אין מנייה, לא מהמארח ולא מהמדידה',
      );

  /* -------------------------------------------------------------- */
  /* 2 — הקיבוץ                                                      */
  /* -------------------------------------------------------------- */
  const groups = [...new Set(options.map((o) => o.group))];
  console.log('קבוצות:', JSON.stringify(groups));
  console.log(`בקבוצת „${GROUP_HEBREW}”: ${inGroup(GROUP_HEBREW).length}`);
  console.log(`בקבוצת „${GROUP_ALL}”: ${inGroup(GROUP_ALL).length}`);

  if (extra.length === 0) {
    report.skip('הקיבוץ לקבוצות', 'אין מה לקבץ בלי מנייה');
  } else if (groups.includes(GROUP_HEBREW) || groups.includes(GROUP_ALL)) {
    report.pass('הקיבוץ לקבוצות', groups.filter(Boolean).join(' / '));
  } else {
    report.fail('הקיבוץ לקבוצות', `הרשימה שטוחה — ${names.length} שמות ברצף אחד`);
  }

  /* -------------------------------------------------------------- */
  /* 3 — הסדר: הרשימה הקבועה נשארת בראש                              */
  /* -------------------------------------------------------------- */
  // ששת שלנו **בדיוק** בראש. זה מה שאסור שהמנייה תזיז: מי שפותח מסמך עברי
  // צריך את Frank Ruhl בשורה הראשונה, לא אחרי 57 שמות ממוינים.
  const opening = names.slice(0, OURS.length);
  opening.join('|') === OURS.join('|')
    ? report.pass('ששת גופני התוסף פותחים את הרשימה', opening.join(', '))
    : report.fail('ששת גופני התוסף פותחים את הרשימה', opening.join(', '));

  // ושאר הרשימה הקבועה בקבוצה העליונה — במקום שאינו קבוע מראש, כי גופני
  // המסמך שהמנוע מדווח נכנסים בין שלנו לזנב הלטינית. נמדד: המנוע דיווח
  // Arial, Courier New ו-Times New Roman על מסמך ריק, והם ישבו שם.
  const top = new Set(inGroup(''));
  const strays = FIXED.filter((name) => !top.has(name));
  strays.length === 0
    ? report.pass('הרשימה הקבועה כולה בקבוצה העליונה', `${top.size} שמות בקבוצה`)
    : report.fail('הרשימה הקבועה כולה בקבוצה העליונה', `נדדו החוצה: ${strays.join(', ')}`);

  // ואין כפילות: גופן שכבר בראש אינו אמור לחזור תחת „כל הגופנים”.
  const duplicated = names.filter((name, i) => names.indexOf(name) !== i);
  duplicated.length === 0
    ? report.pass('אין שם כפול בבורר')
    : report.fail('אין שם כפול בבורר', duplicated.slice(0, 5).join(', '));

  /* -------------------------------------------------------------- */
  /* 4 — בחירה מהזנב באמת מוחלת                                      */
  /* -------------------------------------------------------------- */
  const tail = inGroup(GROUP_ALL).concat(inGroup(GROUP_HEBREW));
  if (tail.length === 0) {
    report.skip('בחירה מהזנב מוחלת על המסמך', 'אין זנב בלי מנייה');
  } else {
    const target = tail[0];
    await app.caret(0);
    await app.type('bdika');
    await app.sleep(400);
    await app.press('Home', 'Home', 36);
    await app.extendSelection(5);
    await app.sleep(200);

    const picked = await app.selectValue('גופן', target);
    await app.sleep(700);
    console.log(`נבחר „${target}”:`, picked);

    const files = await app.docx();
    // `unzip` של המסגרת מחזיר מחרוזות UTF-8, לא בייטים.
    const xml = files ? files['word/document.xml'] ?? '' : '';
    const applied = new RegExp(`w:ascii="${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(xml);
    const rFonts = xml.match(/<w:rFonts[^>]*\/>/g) || [];
    console.log('rFonts במסמך:', rFonts.slice(0, 4).join(' '));

    applied
      ? report.pass('בחירה מהזנב מוחלת על המסמך', target)
      : report.fail('בחירה מהזנב מוחלת על המסמך', `„${target}” נבחר אך אינו ב-OOXML`);
  }

  /* -------------------------------------------------------------- */
  /* 5 — רגרסיה: הרשימה נחתכה בגובה הרצועה                           */
  /* -------------------------------------------------------------- */
  // דווח מהשטח: הרשימה נראתה כשלוש שורות עם פס גלילה. השורש זהה לזה של שאר
  // הפופאוברים של הרצועה — `.word-ribbon-body` הוא `overflow-y: hidden` —
  // והתיקון הוא אותו מודול (composables/popover-position.ts). כאן, בניגוד
  // ל-jsdom, יש פריסה אמיתית, ולכן אפשר למדוד שהרשימה באמת גבוהה מהרצועה.
  // ה-`await` אינו נימוס: Vue מרנדר במיקרו-משימה, ולכן מיד אחרי `focus`
  // הרשימה עוד אינה ב-DOM. אותה מלכודת בדיוק כמו ב-scripts/qa/qa-api.js.
  const geometry = await app.js(`(async function () {
    /* דרך הרצועה, ולא „הראשון במסמך”: תיבת ה-Tell Me בפס הכותרת היא גם
       input[role="combobox"] והיא קודמת בסדר ה-DOM. */
    var input = window.__qa.el('גופן', { scope: '.word-ribbon-body', selector: 'input[role="combobox"]' });
    if (!input) return JSON.stringify({ found: false, why: 'אין פקד' });
    /* פתיחה כמו ב-qa-api.js, ולא focus() לבד: ב-headless החלון אינו ממוקד
       ואירוע ה-focus אינו בהכרח נורה. אירוע input פותח בכל מקרה, והוא גם
       מה שמנקה שאילתה שנשארה מקריאה קודמת. (בלי גרשי-הפוך — הבלוק הזה
       יושב בתוך template literal, וכל אחד מהם היה סוגר אותו.) */
    input.focus();
    var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await null;
    await null;
    await null;
    var list = document.getElementById(input.getAttribute('aria-controls'));
    if (!list) return JSON.stringify({ found: false, why: 'הרשימה לא נפתחה' });
    var r = list.getBoundingClientRect();
    var body = document.querySelector('.word-ribbon-body');
    var br = body ? body.getBoundingClientRect() : null;
    var out = {
      found: true,
      position: getComputedStyle(list).position,
      height: Math.round(r.height),
      bottom: Math.round(r.bottom),
      ribbonBottom: br ? Math.round(br.bottom) : null,
      viewport: window.innerHeight,
      options: list.querySelectorAll('[role="option"]').length
    };
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    input.blur();
    return JSON.stringify(out);
  })()`);
  const geo = JSON.parse(geometry);
  console.log('גיאומטריית הרשימה:', geometry);

  if (!geo.found) {
    report.fail('הרשימה אינה נחתכת בגובה הרצועה', 'הרשימה לא נפתחה למדידה');
  } else if (geo.position !== 'fixed') {
    report.fail('הרשימה אינה נחתכת בגובה הרצועה', `position=${geo.position} — נחתך על ידי הרצועה`);
  } else if (geo.bottom > geo.viewport) {
    report.fail('הרשימה אינה נחתכת בגובה הרצועה', `תחתית ${geo.bottom} מעבר לחלון ${geo.viewport}`);
  } else {
    // ההוכחה שזה לא במקרה: הרשימה **גבוהה** מהמרווח שנשאר מתחת לרצועה, כלומר
    // ב-`absolute` היא הייתה נחתכת בפועל ולא רק תיאורטית.
    const taller = geo.ribbonBottom !== null && geo.height > geo.viewport - geo.ribbonBottom;
    report.pass(
      'הרשימה אינה נחתכת בגובה הרצועה',
      `fixed · גובה ${geo.height} · ${geo.options} שורות${taller ? ' · גבוהה מהמרווח שמתחת לרצועה' : ''}`,
    );
  }

  /* -------------------------------------------------------------- */
  /* רישום: queryLocalFonts                                          */
  /* -------------------------------------------------------------- */
  // אינו נבדק אלא נמדד: אם יתברר שהוא כן עובד ב-WebView2 של אוצריא, זו
  // שכבה רביעית שאפשר להוסיף. עד אז — הרישום הזה הוא העדות.
  report.skip('queryLocalFonts', api);
} catch (error) {
  report.fail('השער הושלם', String(error && error.message ? error.message : error));
} finally {
  app.close();
}

process.exit(report.print() > 0 ? 1 : 0);
