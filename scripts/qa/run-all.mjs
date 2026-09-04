/**
 * מריץ רשימת שערים **עד הסוף** ומסכם. קוד היציאה נשאר 1 אם מישהו נכשל.
 *
 * למה זה החליף את שרשרת ה-`&&` ב-`verify:qa`: השרשרת עוצרת בכשל הראשון, ולכן
 * כל מה שאחריו אינו רץ בכלל — אבל הפלט נראה בדיוק כמו ריצה מלאה עם שער אחד
 * אדום. נמדד: `installed-fonts-qa` היה אדום ב-main, ותשעת השערים שאחריו —
 * `list-caret-qa` ו-`font-caret-qa` בכללם — לא רצו אף פעם, ואיש לא ידע.
 *
 * הסמנטיקה של הכשל אינה משתנה: כשל הוא כשל, וקוד היציאה אינו אפס.
 *
 *   node scripts/qa/run-all.mjs scripts/qa/smoke.mjs scripts/qa/...
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const gates = process.argv.slice(2);
if (gates.length === 0) {
  console.error('לא נמסרו שערים להרצה');
  process.exit(2);
}

const missing = gates.filter((gate) => !existsSync(gate));
if (missing.length > 0) {
  console.error(`שערים שאינם קיימים: ${missing.join(', ')}`);
  process.exit(2);
}

const results = [];
for (const [index, gate] of gates.entries()) {
  console.log(`\n──────── [${index + 1}/${gates.length}] ${gate} ────────`);
  const run = spawnSync(process.execPath, [gate], { stdio: 'inherit' });
  // `signal` ולא רק `status`: שער שנהרג (OOM, timeout חיצוני) מחזיר status null,
  // ו-`null !== 0` היה נכון במקרה אבל בלי שם לכשל.
  const code = run.signal ? `אות ${run.signal}` : run.status;
  results.push({ gate, ok: run.status === 0, code });
  console.log(`──────── ${gate}: ${run.status === 0 ? 'עבר' : `נכשל (${code})`} ────────`);
}

const failed = results.filter((r) => !r.ok);
console.log('\n════════ סיכום שערי ה-QA ════════');
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.gate}${r.ok ? '' : ` — ${r.code}`}`);
console.log(`\nסה"כ ${results.length} שערים: ${results.length - failed.length} עברו, ${failed.length} נכשלו`);

process.exit(failed.length > 0 ? 1 : 0);
