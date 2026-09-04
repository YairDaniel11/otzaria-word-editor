/**
 * שער סנכרון הטיפוסים: `src/types/otzaria_plugin.d.ts` הוא **עותק מדויק** של
 * ה-d.ts שאוצריא מפרסמת ב-`docs/plugin-sdk`, ואין לו מקור אחר.
 *
 * למה שער: הקובץ הזה הוא כל בסיס בטיחות הטיפוסים של התוסף — כל `Otzaria.call`,
 * כל שם מתודה, כל צורת payload נבדקים מולו — ואף דבר לא בדק שהוא עדיין תואם.
 * הוא נסחף בשקט: אוצריא צמצמה את `runMode` מ-`'foreground' | 'background'`
 * ל-`'background'`, והעותק כאן המשיך להצהיר על ערך שאינו קיים יותר. הפעם זה
 * היה שדה שהתוסף אינו קורא; באותה שקט יכולה להיסחף חתימה של מתודה שהוא כן
 * קורא, וזה כשל שמתגלה בזמן ריצה מול המארח האמיתי בלבד.
 *
 * **מדלג ואינו נכשל כשהמקור אינו נמצא.** זה מכוון: המקור נמצא במאגר אחר, ואינו
 * זמין בכל מכונה שבונה את התוסף. שער שנכשל על היעדר שכן היה שער שמכבים אותו.
 * כשהמקור כן נמצא — והוא נמצא במכונת הפיתוח — הוא מדויק לחלוטין.
 *
 *   OTZARIA_SDK=<נתיב ל-otzaria_plugin.d.ts> npm run check:sdk
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LOCAL = join(HERE, '..', 'src', 'types', 'otzaria_plugin.d.ts');
/** מבנה התיקיות המקובל: `otzaria-others/` ו-`otzaria-software/` זה לצד זה. */
const DEFAULT_SOURCE = resolve(
  HERE,
  // שלוש רמות: scripts → שורש התוסף → `otzaria-others` → ההורה המשותף.
  // רביעית הייתה מחטיאה, והשער היה מדלג בשקט על המכונה שהוא נכתב בשבילה.
  '../../../otzaria-software/otzaria/docs/plugin-sdk/otzaria_plugin.d.ts',
);
const source = process.env.OTZARIA_SDK ?? DEFAULT_SOURCE;

if (!existsSync(LOCAL)) {
  console.error(`src/types/otzaria_plugin.d.ts אינו קיים`);
  process.exit(1);
}
if (!existsSync(source)) {
  console.log(`דילוג: ה-SDK של אוצריא אינו נמצא ב-${source}`);
  console.log('להריץ עם OTZARIA_SDK=<נתיב> כדי לאמת סנכרון.');
  process.exit(0);
}

const local = readFileSync(LOCAL, 'utf8');
const upstream = readFileSync(source, 'utf8');

if (local === upstream) {
  console.log(`שער ה-SDK עבר: הטיפוסים המקומיים זהים למקור (${upstream.length} תווים).`);
  process.exit(0);
}

// דיווח שאפשר לעשות איתו משהו: אילו שורות נבדלות, ולא „הקבצים שונים”.
const localLines = local.split('\n');
const upstreamLines = upstream.split('\n');
const diffs = [];
for (let i = 0; i < Math.max(localLines.length, upstreamLines.length); i += 1) {
  if (localLines[i] !== upstreamLines[i]) {
    diffs.push({ line: i + 1, local: localLines[i], upstream: upstreamLines[i] });
  }
}

console.error(`שגיאה: הטיפוסים המקומיים אינם זהים ל-SDK של אוצריא (${diffs.length} שורות).`);
for (const diff of diffs.slice(0, 12)) {
  console.error(`  שורה ${diff.line}`);
  console.error(`    כאן:    ${(diff.local ?? '(אין שורה)').trim().slice(0, 110)}`);
  console.error(`    באוצריא: ${(diff.upstream ?? '(אין שורה)').trim().slice(0, 110)}`);
}
if (diffs.length > 12) console.error(`  ...ועוד ${diffs.length - 12} שורות.`);
console.error(`\nלסנכרון: cp "${source}" src/types/otzaria_plugin.d.ts`);
process.exit(1);
