/**
 * קובץ זהב לשערי ה-QA: מריץ שערים, שומר את השורות שלהם, ובריצה הבאה משווה.
 *
 * למה: רפקטור שמעביר קוד בלי לשנות התנהגות צריך ראיה שההתנהגות לא השתנתה —
 * ולא רק „הבדיקות ירוקות”, כי בדיקה שלא נכתבה לא תתפוס. כל שער שנבנה על
 * `createReport` כבר מדפיס בסופו שורה `JSON:{title,strict,rows}` (harness.mjs),
 * ואף אחד לא קרא אותה עד עכשיו. כאן היא הופכת לתמונת-מצב: פעם אחת על קומיט
 * הבסיס, ואחר כך אחרי כל צעד.
 *
 *   node scripts/qa/golden.mjs capture [--out=.qa-golden] <gate.mjs> ...
 *   node scripts/qa/golden.mjs compare [--out=.qa-golden] <gate.mjs> ...
 *
 * מה מושווה: הוורדיקט של כל שורה לפי שמה. לא ה-`detail` — הוא נושא מספרים
 * שנמדדים (זמנים, מלבנים) ומשתנה בין ריצות בלי שדבר נשבר. שורה שהוורדיקט שלה
 * השתנה או שנעלמה — כשל. שורה חדשה — מידע בלבד. שורה שהפכה ל-„תקוע” — אזהרה,
 * לא כשל: הדף קפא ולא נמדד (ראו `stuck` ב-harness.mjs). שער שלא הדפיס `JSON:`
 * (קרס, או אינו בנוי על `createReport`) מושווה לפי קוד היציאה.
 *
 * ולמה זה השער ולא קוד היציאה של כל גשש: שורה **שבורה מלכתחילה** — כמו מספור
 * שורות שסופר תוכן בתוך תאי טבלה (line-number-overlay-qa, נמדד על הבסיס) —
 * היתה מפילה שער אוכף בכל ריצה, ומלמדת להתעלם ממנו. כאן היא נשארת אדומה
 * בתמונת-המצב, ומה שמפיל הוא רק **שינוי**.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const [mode, ...rest] = process.argv.slice(2);
const outFlag = rest.find((arg) => arg.startsWith('--out='));
const out = outFlag ? outFlag.slice('--out='.length) : '.qa-golden';
const gates = rest.filter((arg) => !arg.startsWith('--'));

if (!['capture', 'compare'].includes(mode) || gates.length === 0) {
  console.error('שימוש: node scripts/qa/golden.mjs capture|compare [--out=<תיקייה>] <gate.mjs> ...');
  process.exit(2);
}

/** מריץ שער אחד, מדפיס את הפלט שלו כפי שהוא, ומחזיר את שורת ה-JSON האחרונה וקוד היציאה. */
function run(gate) {
  console.log(`\n▶ ${gate}`);
  const result = spawnSync(process.execPath, [gate], { encoding: 'utf8', env: process.env });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  const lines = (result.stdout ?? '').split(/\r?\n/);
  const jsonLine = lines.reverse().find((line) => line.startsWith('JSON:'));
  const report = jsonLine ? JSON.parse(jsonLine.slice('JSON:'.length)) : null;
  return { exitCode: result.status ?? -1, report };
}

const snapshotPath = (gate) => join(out, `${basename(gate, '.mjs')}.json`);
const verdicts = (report) => new Map((report?.rows ?? []).map((row) => [row.name, row.verdict]));

mkdirSync(out, { recursive: true });
let failures = 0;

for (const gate of gates) {
  const fresh = run(gate);
  const path = snapshotPath(gate);

  if (mode === 'capture') {
    writeFileSync(path, JSON.stringify(fresh, null, 2) + '\n');
    console.log(`  נשמר: ${path} (${fresh.report ? fresh.report.rows.length + ' שורות' : 'בלי JSON, קוד יציאה ' + fresh.exitCode})`);
    continue;
  }

  if (!existsSync(path)) {
    console.log(`  ✗ אין תמונת-מצב ב-${path} — הריצו capture תחילה`);
    failures++;
    continue;
  }
  const stored = JSON.parse(readFileSync(path, 'utf8'));

  if (!stored.report || !fresh.report) {
    const same = stored.exitCode === fresh.exitCode;
    console.log(`  ${same ? '✓' : '✗'} קוד יציאה: היה ${stored.exitCode}, עכשיו ${fresh.exitCode}`);
    if (!same) failures++;
    continue;
  }

  const before = verdicts(stored.report);
  const after = verdicts(fresh.report);
  let changed = 0;
  let unmeasured = 0;
  for (const [name, verdict] of before) {
    if (!after.has(name)) {
      console.log(`  ✗ נעלמה: „${name}” (היתה ${verdict})`);
      changed++;
    } else if (after.get(name) === 'תקוע' && verdict !== 'תקוע') {
      // קפיאת מדידה, לא כשל פקד (harness.mjs, `stuck`): השורה לא נמדדה — לא „נשברה”.
      console.log(`  ⧗ לא נמדדה: „${name}” — הדף קפא (היתה ${verdict})`);
      unmeasured++;
    } else if (after.get(name) !== verdict) {
      console.log(`  ✗ השתנתה: „${name}” — ${verdict} → ${after.get(name)}`);
      changed++;
    }
  }
  if (unmeasured) console.log(`  ⚠ ${unmeasured} שורות לא נמדדו בריצה הזאת — להריץ שוב לפני שמסיקים`);
  for (const [name, verdict] of after) {
    if (!before.has(name)) console.log(`  · חדשה: „${name}” (${verdict})`);
  }
  if (changed === 0) console.log(`  ✓ ${before.size} שורות — זהות לתמונת-המצב`);
  failures += changed;
}

if (mode === 'compare') {
  console.log(failures ? `\nסה"כ ${failures} סטיות מקובץ הזהב` : '\nזהה לקובץ הזהב');
  process.exit(failures ? 1 : 0);
}
