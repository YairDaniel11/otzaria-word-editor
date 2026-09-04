# הגלים שנותרו — מדריך יישום

**למי המסמך.** למי שממשיך את הרחבת „וורד לאוצריא” אל ה-Document API של
SuperDoc, גם בלי הקשר מהגלים הקודמים. אין צורך לקרוא את היסטוריית השיחה —
כל מה שנדרש כאן.

**מה כבר נעשה.** עשרה גלים נסגרו (`6a45973` … `fb87a0a`): כותרת עליונה
ותחתונה, שדות ומספרי עמודים, סימניות, תוכן עניינים, מפתח, ציטוטים
וביבליוגרפיה, כיתובים, ניהול הערות שוליים, ופריסת עמוד מתקדמת. טבלת מקורות
נבדקה ו**נדחתה** במודע. לשוניות „הוספה” ו„הפניות” הושלמו.

**ומאז נסגרו עוד, ופרק ה׳ למטה עדיין מציג אותם כעתידיים.** לפי המודולים
שבעץ: גל 11 (`paragraph-format.ts`), 12 (`font-advanced.ts`),
14 (`lists.ts`), 19 (`protection.ts`), 22 (`hyperlinks-manage.ts`).
גל 24 נסגר חלקית — ראו ההערה שם. לפני שמתחילים גל מפרק ה׳, כדאי לבדוק אם
המודול שלו כבר קיים ב-`src/engine/`.

**מסמך שחייבים לקרוא לפני שכותבים שורה:**
**[`engine-gaps.md`](engine-gaps.md)** — כל מה שנמדד במנוע בעשרה גלים. **אל
תמדוד מחדש מה שכתוב שם.** זהו המסמך החשוב ביותר במאגר לעבודה הזאת. הגל
האחרון והתבנית הבשלה ביותר: `src/engine/page-setup.ts`.

### ארכיטקטורה מחייבת

```text
Vue UI בעברית
  AppShell / Ribbon / Panels / StatusBar / Dialogs
                │
                ├── CommandAdapter ── superdoc.ui (מושאל מהמופע)
                │                      commands, state, search, zoom,
                │                      styles, comments, trackChanges
                │
                ├── DocumentAdapter ─ activeEditor.doc (API ציבורי)
                │                      sections, tables, footnotes,
                │                      headers/footers, TOC, images
                │
                ├── SessionStore ──── metadata + dirty revision + file tokens
                │
                └── OtzariaClient ─── theme, fs, storage, reader,
                                       library, search, notifications
```

כללי מימוש:

1. פעולת Ribbon קיימת כפקודה? משתמשים ב־`superdoc.ui.commands`.
2. יכולת מבנית שאינה פקודת Ribbon? משתמשים רק ב־`activeEditor.doc` הציבורי.
3. אין selector אל DOM פנימי של SuperDoc ואין import מנתיב שאינו export ציבורי בחבילה.
4. כל mutation דרך Document API בודק receipt ומתרגם כשל להודעה בעברית.
5. כל subscription מחזיר disposer ונרשם ב־`DisposableBag` של session.
6. כפתור Ribbon מבטל `pointerdown/mousedown` כדי לא לאבד selection לפני הפקודה.

### להוסיף feature חדש דרך Document API

אין לבנות לשונית שלמה מראש. לכל feature מוסיפים adapter קטן, test fixture
ו־round-trip test:

- לבדוק capability בעת boot.
- להשתמש ב־target/selection ציבורי.
- לבדוק `receipt.success` ולתעד failure code.
- לייצא, לפתוח מחדש ולהשוות את החלק הרלוונטי במסמך.

פקד שאין לו API ציבורי אמין מסומן „לא זמין בגרסה זו”; לא מממשים אותו דרך XML
ידני או DOM פנימי.

---

## חלק א׳ — הכללים שאין לעבור עליהם

### איסורים שנבדקים אוטומטית

`tests/unit/engine-boundaries.test.ts` נכשל על כל אחד מאלה:

1. `import ... from '@superdoc/docx-engine...'` — רישיון המנוע מתיר אותו
   „solely as a dependency of SuperDoc”.
2. import מנתיב פנימי של החבילה. רק `superdoc`, `superdoc/ui`,
   `superdoc/style.css`.
3. `createSuperDocUI`.
4. `execCommand` / `contentEditable`.
5. `querySelector`/`closest` אל DOM פנימי של SuperDoc (`.sd-*`).

**ומעליהם כלל שאינו נבדק אוטומטית ולכן חשוב יותר:** אין להישען על שדה או ערך
שאינו ב-`.d.ts` הציבורי. אם פיצ'ר דורש אותו — הוא אינו מיושם, והממצא מדווח.
(דוגמה: `format: 'hebrew1'` בהערות שוליים **עובד** ומייצר OOXML תקני, ובכל
זאת לא נשלח, מפני שאינו ב-union.)

### חמישה לקחים שכל גל שילם עליהם

1. **החוזה מנצח את ההנחיה.** בגל 2 ההנחיה הבטיחה שדה `fieldType` שאינו
   קיים. אם משהו לא תואם את ה-`.d.ts` — לך לפי החוזה ודווח.
2. **`available: true` ו-`success: true` אינם הוכחה שהפעולה עובדת.** חמש
   פעולות מוצהרות-זמינות מייצרות מסמך שבור בשקט. **מדוד לפני שאתה שולח
   פקד.**
3. **`configure` בולע ערכים בשקט** — ארבעה `configure` שונים קיבלו
   `'zigzag'` ב-`success: true`. `doc.sections` הוא היחיד שמאמת. כל
   ולידציה יושבת אצלנו, לפני הקריאה.
4. **הכפילים מסתירים מסלולים.** בגל 8 חוסם חמק מ-20 מוטציות שנתפסו, כי
   הכפיל הכיל פסקאות בלבד ולא טבלה. בגל 9 חוסם חמק מ-26, כי הכפיל פתר
   הכול באותו tick. **שאל תמיד: מה הכפיל שלי לא יודע לייצר?**
5. **פעולה שקוראת מצב ואז משנה אותו היא TOCTOU.** אם יש חלון — צריך
   נעילה, לא קריאה נוספת. ראו `ReferencesTab.vue` (`noteBusy`).

### תבנית מודול מנוע

קרא `src/engine/footnotes.ts` (הפשוט) ו-`src/engine/page-setup.ts` (העשיר).

```ts
// 1. הצורה מוגדרת מקומית, לא מיובאת מנתיב פנימי. `?` על כל שדה.
export interface XDocumentApi {
  x?: { doSomething?: (input: { … }) => MaybePromise<DocReceipt> };
}
export interface XHost { activeEditor?: { doc?: XDocumentApi | null } | null }
// 2. union שמאפשר גם מופע אמיתי וגם כפיל
export type XTarget = SuperDoc | XHost | null | undefined;

// 3. לעולם לא זורק. תמיד CommandOutcome.
export async function doX(host: XTarget): Promise<CommandOutcome> {
  const fn = docOf(host)?.x?.doSomething;
  // 4. פעולה חסרה = הנוסח של §12, לא הודעה מומצאת
  if (typeof fn !== 'function') {
    return { ok: false, message: `${FAILED}: אינו זמין בגרסה זו`, reason: 'command-unsupported' };
  }
  let receipt: DocReceipt;
  try { receipt = await fn({ … }); }
  catch (error) { return { ok: false, message: thrownText(FAILED, error), reason: 'threw' }; }
  if (receipt?.success === false) {
    return { ok: false, message: receiptFailureText(FAILED, receipt), reason: receipt.failure?.code };
  }
  return { ok: true };
}
```

כללים נוספים:

- **`failedAction` הוא ביטוי שלם עם הטיית הכשל** („הוספת הכותרת העליונה
  נכשלה”), לא שם עצם — מין דקדוקי אינו נגזר ממזהה.
- **`NO_OP` הוא הצלחה.** קבלה בלי שינוי אינה כשל.
- **שאיבת עמודים.** כל `list` הוא `DiscoveryOutput` עם `items` (עמוד) ו-
  `total`. מימוש שקורא עמוד אחד יטעה בכל מסמך אמיתי. ראו `rebuildAllFields`
  ב-`fields.ts`, וכשל קריאה **חלקי** מחזיר מצב ריק ולא ספירה חלקית
  (`index-field.ts`).
- **הערות בקוד מסבירות למה, לא מה.** הערה שמתארת מה השורה עושה היא רעש.

### יכולות (capabilities)

כל פקד חדש חייב שאלה ב-`CAPABILITY_SPECS` שב-`src/engine/doc-capabilities.ts`
(**הוספה בלבד**, לא שכתוב), ופקד שיכולתו `false` מוצג **disabled עם tooltip
מ-`explain()`** — לא נעלם.

`CapabilitySpec.operation` מקבל גם **רשימה** שכל איבריה נדרשים. השתמש בזה
כשפקד תלוי בשתי פעולות: `canInsertField` דורש גם `fields.insert` וגם
`fields.rebuild`, מפני ששדה שהמשתמש אינו יכול לראות אינו פיצ'ר.

### צ'קליסט לדיאלוג חדש

שלושת אלה נשכחו בכמעט כל דיאלוג חדש עד כה:

1. `tabindex="-1"` על השורש + `focus()` ב-`nextTick` בפתיחה. בלעדיהם קליק על
   גוף הדיאלוג מוציא את המיקוד ו-**Escape מפסיק לעבוד**.
2. `@keydown.enter` על שדות הקלט (לא על textarea רב-שורתי).
3. prop בשם `busy` שמנטרל את פקדי הפעולה בזמן שפעולה באוויר, ומשאיר
   „ביטול”/„סגור” פעילים.

ועוד: RTL לוגי בלבד (`inset-inline-start`, `border-block-end`,
`text-align: start`) — אין `left`/`right` פיזיים. `@pointerdown.prevent` על כל
כפתור. תבניות: `NoteDialog.vue`, `CaptionDialog.vue`, `IndexEntryDialog.vue`.

### אסור

- **אין `git commit` / `git add`.** המפקח מקמט.
- **אין `git checkout` / `git restore` / `git stash` על קובץ עם עבודה
  לא-מקומטת.** זה קרה בגל 10 ומחק 611 שורות שלא היו בשום קומיט. להרצת
  מוטציה: `cp x.ts /tmp/x.bak`, שנה, הרץ, שחזר מהגיבוי.
- אין תלות חדשה ב-`package.json`.
- **אין לרכך בדיקה קיימת** כדי שתעבור. בדיקה שנשברה מסיבה אמיתית = ממצא.
- אין לגעת במודולים של גלים אחרים.

---

## חלק ב׳ — מתכון המדידה בדפדפן

זה הכלי שהכריע ביותר משליש מההחלטות. `scripts/cdp.mjs` נותן
`openPage`/`requireChrome`/`sleep`; `scripts/boot-check.mjs` הוא דוגמה מלאה.

```js
// 1. npm run build  (חובה — המדידה על ה-dist הארוז, לא על dev)
// 2. dist/qa-tmp.html = dist/index.html עם ה-stub מוזרק אחרי הסקריפט הראשון:
const stub = `<script>window.Otzaria={call:m=>
  m==='app.getInfo'?Promise.resolve({success:true,data:{version:'9',platform:'p'},error:null}):
  m==='app.getTheme'?Promise.resolve({success:true,data:{mode:'light',colorScheme:{},typography:{}},error:null}):
  Promise.resolve({success:false,data:null,error:{message:'no'}}),on(){},off(){}};</script>`;
// 3. openPage(`file://${path}`) והמתן לפתיחת המסמך הריק (לולאה עד ~120 שניות)
// 4. המופע — `__vue_app__._instance` הוא undefined ב-build של ייצור:
const FIND = `(function(){
  var el = document.querySelector('#app');
  var inst = (el.__vue_app__ && el.__vue_app__._instance) || (el._vnode && el._vnode.component);
  var p = inst.provides;
  var syms = Object.getOwnPropertySymbols(p);
  for (var i=0;i<syms.length;i++)
    if (String(syms[i])==='Symbol(activeSuperdoc)') return p[syms[i]].value;
  return null;})()`;
// ואז: sd.activeEditor.doc
```

**מלכודות שכבר עלו:**

- במסמך ריק `doc.selection.current()` מחזיר `target: null`. זרע בלוק עם
  `doc.insert({ value: 'בדיקה' })` ובנה `TextTarget` מ-`doc.blocks.list()`.
  הצורה: `{ total, blocks: [{ nodeId, … }] }`, והסגמנט
  `{ blockId, range: { start, end } }`.
- `create.paragraph` דורש `at.target` ולא `at.nodeId`.
- **`activeEditor.view` הוא `null` ב-headless** — אי אפשר למדוד דבר שדורש
  מיקוד בעורך.
- **הרוג את Chrome בסוף.** `scripts/cdp.mjs` משתמש באותו פורט (9333) גם
  ב-`check:boot`, ותהליך תלוי יפיל את השער בשלושת המצבים — כשל מבלבל שאין
  לו קשר לקוד. `pkill -f "remote-debugging-port=9333"`.
- **מחק את `dist/qa-tmp.html`.**

### שכבת ה-docx — השכבה שהכריעה בחמישה גלים

כשפעולה כותבת קוד שדה או OOXML, **אל תסתפק בקבלה.** הרץ
`doc.export.toDocx()`, פרק את ה-zip, וקרא את ה-XML עצמו.

זה מה שהפיל את טבלת המקורות (`TA` בלי `\l`), ואישר את הציטוטים
(`CITATION <tag>` שתואם ל-`<b:Tag>` באותו קובץ). בדוק גם את **סדר**
האלמנטים: `CT_SectPr` הוא sequence, וסדר שגוי הוא מסמך פסול.

### שער XML בבדיקות

כפיל בולע בדיוק את מה שהמנוע בולע, ולכן כפיל לבדו אינו יכול לתפוס XML פסול.
`tests/unit/page-setup.test.ts` מדגים `assertWordLegal` — שער נפרד שמאמת את
ה-XML מול התקן. **הקבועים בשער חייבים להיות המספרים של ECMA-376 קשיחים**, לא
מיובאים מהמודול הנבדק: שער שהקבועים שלו זזים עם הקוד הוא שיקוף ולא שער.

---

## חלק ג׳ — מחזור העבודה של גל

### 1. מדידה (לפני כל שורת קוד)

קרא את ה-`.d.ts` של המרחב, ואז מדוד בדפדפן. **ארבע השאלות שחוזרות בכל גל:**

- מה נכתב **בפועל** ל-docx? האם זה קוד Word תקני?
- האם ערך בעברית עובד — כולל מנוקד וגרשיים („רש״י”, „שו״ת”)?
- האם הפעולה בולעת ערך שטותי ב-`success: true`?
- האם הכתובות ייחודיות? (שתי טבלאות תוכן עניינים קיבלו את **אותו** `nodeId`.)

### 2. סמכות לעצור

**אם המדידה מראה שהפעולה מייצרת מסמך שבור — אל תשלח ממשק. דווח.** דוח מנומק
עם ראיות שווה יותר מפקד שמדווח הצלחה ולא עובד. גל 6 עצר לפני שכתב שורה,
ובצדק. מותר גם לשלוח חלק מקבוצה ולדחות חלק (גלים 7, 9, 10).

### 3. מימוש

מודול מנוע → שאלות capability → פקדים בלשונית → דיאלוג אם צריך.

### 4. בדיקות שמודדות באמת

- מסלולי חובה לכל פעולה: הצלחה, קבלה שנכשלה, פעולה חסרה, חריגה שנזרקה,
  `doc` שהוא null, ואין בחירה.
- שאיבת עמודים — עם **יותר מעמוד אחד** באמת. (בגל 7 נמצאה בדיקה שכותרתה
  „שואבת עמודים עד `total`” ולא בדקה שאיבה כלל, כי השדה בכפיל לא נקבע אף
  פעם.)
- **הרץ מוטציות בעצמך.** לכל שורת הגנה: הסר אותה, הרץ, ראה בדיקה נופלת,
  שחזר מהגיבוי. בדיקה שלא ראית אותה נכשלת היא בדיקה שאינך יודע אם היא מודדת
  משהו. **דווח כמה מוטציות הרצת וכמה נתפסו.**
- **הסורק הגנרי ב-`tests/component/ribbon-tabs.test.ts` לא לוחץ על פריטי
  תפריט נפתח** — הוא סורק לפני הפתיחה. כל בחירה מתפריט חייבת בדיקה ייעודית;
  תבנית: `tests/component/fields-menu.test.ts`. (החלפה בין `PAGE` ל-
  `NUMPAGES` עברה פעם את כל 1010 הבדיקות בירוק.)
- `harness.ts` — **תוספתית בלבד.** כפיל שנעשה סלחני יותר מסתיר באגים בגלים
  הבאים.
- **כותרת בדיקה שאינה מתארת את מה שהיא בודקת היא באג.** נמצאו שלוש כאלה.

### 5. שערים

`npm run verify` = typecheck + vitest + build + `check:dist` + `check:boot` +
`check:fonts` + `check:icons` + `check:rtl` + `check:sdk`. **חייב לעבור.**

שתי אזהרות ידועות שאינן שלך ואין לתקן: `check:dist` על
`cdnjs.cloudflare.com`, ו-`check:sdk` שמדלג כי ה-SDK אינו במכונה.

`check:icons` מוריד את `@fluentui/svg-icons@1.1.338` מ-npm בכל הרצה (כ-35 שניות)
ומדלג כשאין רשת. הוא נכשל כשאייקון חדש אינו נרשם ב-THIRD_PARTY_NOTICES.md — לא
בטבלה ולא ברשימת החריגים — ולכן **אייקון חדש הוא גם שורה במסמך הרישוי**.

שים לב: `tests/component/ribbon-tabs.test.ts` מחזיק `EXPECTED_DISABLED` —
„רק הפקדים שאין להם API נשארים מנוטרלים”. פקד שמנוטרל מסיבת **מצב** דורש
רישום שם עם נימוק, **והמפתח שם הוא טקסט ה-tooltip ולא ה-label**.

### 6. עדכון `engine-gaps.md`

**חלק מהמשימה, לא תוספת.** כל פער חדש שמדדת נכנס לשם.

---

## חלק ד׳ — סבב ה-QA

אחרי כל גל רץ **סוכן QA נפרד**, ואחריו **סוכן תיקונים** אם יש ממצאים. זה לא
טקס: ב-**כל** אחד מעשרת הגלים ה-QA מצא ממצא שהמפתח פספס, ובחמישה מהם ממצא
שהיה מגיע למשתמש כפעולה שמדווחת הצלחה ולא עושה כלום. שלושה חוסמים נמצאו כך.

### תבנית לפרומפט של סוכן QA

```
אתה סוכן QA ביקורתי בפרויקט „וורד לאוצריא”, מאגר <נתיב>.
תפקידך למצוא באגים, לא לאשר עבודה. עברית בלבד.

קרא קודם את docs/engine-gaps.md ואת docs/remaining-waves.md.

## מה לבדוק
השינוי הלא-מקומט בעץ העבודה — גל N, „<שם>”. חדשים: <קבצים>. שונו: <קבצים>.
הקומיטים הקודמים אינם בהיקף שלך.

## המשימה המרכזית
<הטענה הגדולה ביותר של המפתח, שאם היא שגויה הגל כולו שגוי>
אמת אותה במדידה עצמאית לפי המתכון. אם היא שגויה — זה ממצא חוסם.

## הטענות לאימות
<3–6 טענות מדידה מהדיווח, כל אחת עם מה שנטען שנמדד>

## שאר הבדיקות
1. הבדיקות מודדות? הרץ לפחות <N> מוטציות ודווח כמה נתפסו. שים לב במיוחד
   למה שהכפיל אינו יודע לייצר — שם הסתתרו שני חוסמים.
2. הדיאלוגים — מיקוד, Escape, RTL, Enter, busy. השווה ל-NoteDialog.vue.
3. מסלולי כשל — קבלה שנכשלה, פעולה חסרה, חריגה, doc null, אין בחירה.
   הודעות בעברית תקנית עם הטיית כשל נכונה?
4. גבולות — npx vitest run tests/unit/engine-boundaries.test.ts + grep ידני.
5. רגרסיה — harness.ts תוספתי בלבד? משהו מהגלים הקודמים נשבר?
6. npm run verify במלואו, אחרי שווידאת שפורט 9333 פנוי.

נקה dist/qa-tmp.html והרוג את Chrome בסוף.

## מה אסור לך
אין git commit/git add. תיקונים קטנים וברורים בלבד, וציין מה תיקנת.
ממצא גדול — דווח בלבד, אל תשכתב.

## הדיווח
סעיף ראשון: אימות המשימה המרכזית, עם הפלט שמדדת. אחר כך שאר הטענות, ואז
ממצאים מדורגים חוסם / חמור / קל / הערה, כל אחד עם קובץ:שורה ותרחיש כשל
קונקרטי. קטגוריה ריקה — אמור זאת מפורשות. אל תמציא ממצאים כדי להיראות
יסודי, ואל תרכך ממצא אמיתי.
```

### מה עושה QA טוב — מהניסיון בפועל

- **מודד מחדש, לא מאמין לדיווח.** בגל 5 המפתח חשד ש„עדכן מפתח” מת; QA מדד
  את התרחיש שנשמט והוכיח שהוא חי.
- **מרחיב את היריעה.** בגל 3 המפתח מדד 5 סוגי תצוגה; QA מדד 9 ו-6 סוגי יעד.
- **מריץ מוטציות על הבדיקות ועל השערים.** בגל 10 הוא ניטרל את
  `assertWordLegal` והוכיח שארבע מוטציות שורדות בלעדיו — כלומר השער נושא
  משקל.
- **שואל מה הכפיל לא יודע לייצר.** שם היו שני החוסמים.
- **בודק אם „תיקון” בכפיל הוא תיקון או ריכוך** — במדידה מול המנוע.

---

## חלק ה׳ — הגלים 11–25

**מה כבר בשימוש ואין לשכפל.** 70 פעולות. במיוחד: `format.vertAlign`,
`format.paragraph.setFlowOptions`, `format.paragraph.setDirection`,
`ranges.resolve`, `selection.current`, `blocks.list`, `blocks.deleteRange`,
`clipboard.insert`, `clipboard.serializeSelection`, `hyperlinks.insert`,
`create.table`, `create.tableOfContents`, `create.sectionBreak`,
וכל `sections.*` פרט ל-`setLinkToPrevious`.

**ופקודות ה-controller.** ל-47 פעולות יש **פקודה** ב-`superdoc.ui.commands`
(`src/engine/capabilities.ts`), והן מיושמות דרך `useCommand` ולא דרך
ה-Document API: `bold`, `italic`, `underline`, `strikethrough`, `font-family`,
`font-size`, `text-color`, `highlight-color`, `text-align`, `line-height`,
`bullet-list`, `numbered-list`, `indent-increase`, `indent-decrease`, עשר
פקודות טבלה, ועוד. **פקד חדש שיש לו פקודה בקטלוג — עובר דרך הפקודה, לא דרך
`doc`.** שכפול דרך שני מסלולים הוא באג.

---

### גל 11 — פסקה מתקדמת · לשונית „בית”/„פריסה” · גדול

**מה מתווסף.** דיאלוג „פיסקה” של Word: כניסות (ימין/שמאל/שורה ראשונה/תלויה),
ריווח לפני/אחרי, „אל תוסיף רווח בין פסקאות מאותו סגנון”, שליטת שורות
בודדות, „השאר עם הבא”, „השאר שורות יחד”, טאבים.

**הפעולות** (21, כולן זמינות):
`format.paragraph.setIndentation`, `clearIndentation`, `setSpacing`,
`clearSpacing`, `setKeepOptions`, `setOutlineLevel`, `setTabStop`,
`clearTabStop`, `clearAllTabStops`, `setBorder`, `clearBorder`, `setShading`,
`clearShading`, `setMarkRunProps`, `resetDirectFormatting`, `setNumbering`,
`setAlignment`, `clearAlignment`, `clearDirection`.

**סיכונים.**
- **שכפול.** `setAlignment` ו-`setSpacing` מתנגשים עם הפקודות הקיימות
  `text-align` ו-`line-height`. `setFlowOptions` ו-`setDirection` **כבר
  בשימוש**. הכרע מסלול אחד לכל פקד ותעד.
- טאבים הם רשימה, לא ערך — `setTabStop`/`clearTabStop` דורשים מודל מצב.
  זה החלק היקר בגל.
- יחידות: כניסות וריווח ב-twips או בנקודות? קרא את החוזה ואמת ב-docx.
  בלבול יחידות הוא הסיכון הגדול כאן.
- `setBorder`/`setShading` — צפה לבליעת ערכים כמו בגבולות העמוד. שער XML.

**כנראה לא ייכנס.** `setMarkRunProps` (עיצוב סימן הפסקה — אין לו פקד ברצועה
של Word), `setNumbering` (שייך לגל הרשימות).

---

### גל 12 — גופן מתקדם · לשונית „בית” · בינוני

**מה מתווסף.** דיאלוג „גופן”: ריווח תווים, מיקום (מוגבה/מונמך), קו תחתון
כפול, קו חוצה כפול, מסגרת וצל לתו, טקסט מוסתר, שפת הגהה, וגופן מורכב (CS)
לעברית.

**הפעולות שנשלחות:** `format.letterSpacing`, `format.position`,
`format.dstrike`, `format.shading`, `format.border`, `format.outline`,
`format.shadow`, `format.emboss`, `format.imprint`, `format.charScale`,
`format.kerning`, `format.vanish`, `format.webHidden`, `format.rStyle`,
`format.rFonts`, `format.lang`, `format.fontSizeCs`, `format.cs`,
`format.bCs`, `format.iCs`, `format.rtl`.

**אסור להכניס — אין להן משמעות בעברית:** `format.smallCaps`, `format.caps`
(רישיות), `format.em` (סימן הדגשה CJK), `format.eastAsianLayout`,
`format.snapToGrid`, `format.ligatures`, `format.numForm`,
`format.numSpacing`, `format.stylisticSets`, `format.contextualAlternates`,
`format.oMath`, `format.fitText`.

**אסור לשכפל:** `bold`, `italic`, `underline`, `strike`, `highlight`,
`color`, `fontSize`, `fontFamily` — יש להן פקודות. `format.vertAlign` כבר
בשימוש.

**סיכונים.**
- **`format.cs`/`bCs`/`iCs`/`fontSizeCs`/`rFonts` הם הליבה העברית.** ב-OOXML
  לטקסט עברי חלים `w:rtl` + `w:bCs`/`w:iCs` + `w:szCs`, ולא המקבילות
  הלטיניות. **מדוד בדיוק מה נכתב** על טקסט עברי, וּודא שהדגשה על עברית
  אינה נכתבת רק כ-`w:b` — אחרת היא לא תיראה ב-Word.
- `format.vanish` (טקסט מוסתר) מסתיר תוכן — פקד הרסני למראית עין. שקול
  אזהרה.
- `format.rStyle` נוגע בסגנונות; תאם עם גל 13.

---

### גל 13 — סגנונות · לשונית „בית” · בינוני

**מה מתווסף.** גלריית סגנונות אמיתית במקום ה-`styleGallery` הקיים: קטלוג
מהמסמך, החלה, וניקוי.

**הפעולות** (5): `styles.getCatalog`, `styles.apply`,
`styles.paragraph.setStyle`, `styles.paragraph.setStyleRef`,
`styles.paragraph.clearStyle`.

**סיכונים.**
- **קיים `linked-style` כפקודה** ו-`src/engine/style-gallery.ts`. הכרע מה
  מחליף מה, ואל תשאיר שני מסלולים.
- `STYLES_PART_MISSING` הוא קוד סיבה קיים ב-`doc-capabilities.ts` — מסמך בלי
  חלק סגנונות הוא מצב אמיתי שצריך לטפל בו.
- שמות סגנונות במסמך עברי — בדוק שהקטלוג מחזיר אותם שלמים, ומה קורה עם
  סגנון בשם עברי.

---

### גל 14 — רשימות רב-רמתיות · לשונית „בית” · הגדול ביותר

**מה מתווסף.** ב-Word: „רשימה רב-רמתית”, „הגדר רשימה חדשה”, „המשך מספור
קודם”, „התחל מחדש מ-1”, שינוי רמה.

**הפעולות** (44, כולן זמינות): `lists.list/get/insert/create/attach/detach/
delete/indent/outdent/join/canJoin/separate/merge/split/setLevel/setValue/
continuePrevious/canContinuePrevious/setLevelRestart/convertToText/
applyTemplate/applyPreset/setType/captureTemplate/setLevelNumbering/
setLevelBullet/setLevelPictureBullet/setLevelAlignment/setLevelIndents/
setLevelTrailingCharacter/setLevelMarkerFont/clearLevelOverrides/getStyle/
applyStyle/restartAt/setLevelNumberStyle/setLevelText/setLevelStart/
setLevelLayout/getState/apply/continue/restart/remove`.

**המלצה: פצל לשני גלים.** 14א — המשך/התחל מחדש/רמה/המרה לטקסט (`getState`,
`continuePrevious`, `canContinuePrevious`, `restartAt`, `setLevel`,
`convertToText`, `indent`, `outdent`). 14ב — הגדרת רשימה רב-רמתית
(`create`, `applyTemplate`, `setLevel*`).

**סיכונים.**
- **שכפול:** `bullet-list`, `numbered-list`, `indent-increase`,
  `indent-decrease` הן פקודות קיימות. `lists.indent`/`outdent` מתנגשות.
- **מספור עברי (א׳, ב׳, ג׳) הוא הפיצ'ר המבוקש ביותר כאן.** בדוק
  `setLevelNumberStyle`/`setLevelNumbering` — האם `hebrew1` ב-union? בהערות
  שוליים הוא עבד אך לא היה בטיפוסים, וב-`sections` הוא נזרק. **זו שאלת
  המדידה המרכזית של הגל.**
- `setLevelText` הוא תבנית עם placeholders (`%1.`) — מקום קלאסי להזרקה
  ולערכים פסולים. שער XML.
- `canJoin`/`canContinuePrevious` מחזירות בוליאן: **TOCTOU** אם קוראים
  ומיד מפעילים. נעילה.
- 44 פעולות = פיצוי גדול לכפיל חסר. חשוב מה הוא לא יודע לייצר.

---

### גלים 15–16 — טבלאות · לשונית „עיצוב טבלה” / „פריסת טבלה” · גדול

**15 — עיצוב.** `tables.setStyle/clearStyle/setStyleOption/applyStyle/
setDefaultStyle/clearDefaultStyle/setBorder/clearBorder/applyBorderPreset/
setBorders/setShading/clearShading/setTablePadding/setCellPadding/
setCellSpacing/clearCellSpacing/setLayout/setTableOptions/applyPreset/
getStyles/getProperties`.

**16 — פריסה ותוכן.** `tables.insertRow/deleteRow/moveRow/setRowHeight/
distributeRows/setRowOptions/insertColumn/deleteColumn/setColumnWidth/
distributeColumns/insertCell/deleteCell/mergeCells/unmergeCells/splitCell/
setCellProperties/setCellText/sort/setAltText/convertFromText/convertToText/
split/move/delete/clearContents/get/getCells`.

**סיכונים.**
- **שכפול כבד.** עשר פקודות טבלה קיימות כבר
  (`table-add-row-before/after`, `table-delete-row`, שלוש עמודות,
  `table-delete`, `table-merge-cells`, `table-split-cell`,
  `table-remove-borders`). כל אלה **עוברות דרך הפקודה** ואין לשכפל אותן.
  `table-fix` מסומן `KNOWN_UNSUPPORTED_COMMANDS`.
- **פעולות הרסניות:** `delete`, `clearContents`, `deleteRow`,
  `deleteColumn`, `convertToText`. `convertToText` בלתי-הפיכה למעשה — דרוש
  אישור, ובדוק אם Ctrl+Z מחזיר.
- **`sort` על עברית** — האם המיון אלפביתי עברי או ASCII? במפתח לא היה מיון
  כלל. שאלת מדידה מרכזית.
- **RTL בטבלה** — סדר העמודות במסמך עברי. בדוק ש„הוסף עמודה מימין” מוסיף
  במקום הנכון, וש-`w:bidiVisual` נכתב.
- כתובת תא — צפה לכתובות לא-ייחודיות כמו בתוכן העניינים.

---

### גל 17 — תמונות · לשונית „עיצוב תמונה” · בינוני

**הפעולות** (25 זמינות): `images.list/get/move/convertToInline/
convertToFloating/setSize/setWrapType/setWrapSide/setWrapDistances/
setPosition/setAnchorOptions/setZOrder/scale/setLockAspectRatio/rotate/flip/
crop/resetCrop/setAltText/setDecorative/setName/setHyperlink/insertCaption/
updateCaption/removeCaption`.

**לא זמינות:** `create.image`, `images.delete`, `images.replaceSource`.

**סיכון חוסם שכבר נמדד.** **אין דרך להכניס תמונה למסמך:** `create.image`
מסומנת לא-זמינה, ו-HTML עם `<img src="data:…">` נדחה ב-`INVALID_PAYLOAD`.
כלומר כל הגל חל **רק על תמונות שהגיעו מ-docx מיובא**, ואין דרך לבדוק אותו
בדפדפן על תמונה שאתה יוצר. `images.insertCaption` כותב תווית אנגלית קשיחה
ואין בו `label` — **אל תשלח אותו**, `captions.insert` של גל 8 עדיף.

**המלצה: מדוד קודם אם יש בכלל דרך לקבל תמונה במסמך.** אם אין — הגל הוא
תיעוד ולא קוד, כמו גל 6. אל תבנה ממשק שאי אפשר לבדוק.

---

### גל 18 — מאפייני מסמך · לשונית „קובץ” · קטן

**הפעולות** (6): `metadata.attach/list/get/update/remove/resolve`.

**מה מתווסף.** „מאפיינים”: כותרת, מחבר, נושא, מילות מפתח, הערות.

**סיכונים.** קל ובטוח — מועמד טוב לגל ראשון של מי שמתחיל. שים לב:
`metadata.attach` מול `update` — מה ההבדל? ומה קורה לשדות שלא נשלחו (זכור
את סמנטיקת ה-`Partial` של `citations.sources.update`: השמטה משמרת, מחרוזת
ריקה מוחקת). ובדוק עברית בכל השדות.

---

### גל 19 — הגנת מסמך ואזורי עריכה · לשונית „סקירה” · בינוני

**הפעולות** (8): `protection.get/setEditingRestriction/
clearEditingRestriction`, `permissionRanges.list/get/create/remove/
updatePrincipal`.

**סיכונים.**
- **פקד שנועל את המסמך הוא הפקד המסוכן ביותר בכל 25 הגלים.** אם ההגנה
  מופעלת ואי אפשר לבטלה — המשתמש נעול מהמסמך שלו. **מדוד את מסלול
  הביטול לפני מסלול ההפעלה**, ואל תשלח הפעלה בלי ביטול מוכח.
- האם ההגנה משפיעה על התוסף עצמו — כלומר האם פקדים אחרים מפסיקים לעבוד?
  בדוק את `capabilities.get()` **אחרי** ההפעלה. ייתכן שכל היכולות ייפלו
  ל-`false`.
- `permissionRanges.updatePrincipal` — זהות משתמש. לתוסף אוצריא אין מודל
  זהות; כנראה לא ייכנס.
- **אישור מפורש** לפני נעילה, וניסוח שאומר במדויק מה יקרה.

---

### גל 20 — השוואת מסמכים · לשונית „סקירה” · בינוני

**הפעולות** (3): `diff.capture`, `diff.compare`, `diff.apply`.

**מה מתווסף.** „השווה” של Word: תצלום, השוואה מול מסמך אחר, והחלה.

**סיכונים.**
- **מאיפה מגיע המסמך השני?** דרוש `fs.pickUserFile` של אוצריא. קרא
  `src/host/files.ts`. זו החלק היקר בגל, לא ה-diff.
- `diff.apply` **משנה את המסמך לפי תוצאת השוואה** — פעולה הרסנית. אישור,
  ובדיקה ש-Ctrl+Z מחזיר.
- `diff.capture` על מסמך גדול — גודל וזמן. מדוד.
- האם התוצאה נראית כ-Track Changes או כשינוי ישיר? זה משנה את כל הממשק.

---

### גל 21 — תגובות ומעקב שינויים מלא · לשונית „סקירה” · בינוני

**הפעולות** (11): `comments.create/patch/delete/get/list`,
`trackChanges.list/get/decide`, `history.get/undo/redo`.

**מה מתווסף.** „תגובה חדשה” **קיימת כפקד מנוטרל** עם ההסבר „תתווסף בשלב
הבא, יחד עם זהות המחבר ופאנל התגובות” — הגל הזה מסיר את הניטרול. וכן פאנל
תגובות, וניווט בין שינויים.

**סיכונים.**
- **זהות המחבר.** תגובה דורשת שם. מאיפה? `Otzaria.call('app.getInfo')`
  אינו מחזיר משתמש. קרא `src/host/otzaria-client.ts` והכרע — ייתכן שדרוש
  הגדרה בתוסף.
- **שכפול:** שש פקודות Track Changes קיימות (`acceptChange`,
  `rejectChange`, `acceptAllChanges`, `rejectAllChanges`, ושתי
  `track-changes-*-selection`). `trackChanges.decide` מתנגשת — הכרע.
- `history.undo`/`redo` מתנגשות עם הפקודות `undo`/`redo` הקיימות. **כמעט
  בטוח שאין להשתמש בהן.**
- `global.comments.enabled` נבדק כבר ב-`doc-capabilities.ts`
  (`canAddComment`) — השתמש בו.
- **הסר את הרשומה מ-`EXPECTED_DISABLED`** ב-`ribbon-tabs.test.ts` כשהפקד
  מתחיל לעבוד.

---

### גל 22 — קישורים · לשונית „הוספה” · קטן

**הפעולות:** `hyperlinks.list/get/wrap/remove`. **`hyperlinks.patch` אינה
זמינה.**

**מה מתווסף.** „הסר היפר-קישור”, „ערוך היפר-קישור”, רשימת קישורים.

**סיכונים.** `hyperlinks.insert` **כבר בשימוש** (`LinkDialog.vue`) — אל
תשכפל. עריכה בלי `patch` = `remove` + `wrap`, כלומר **בדיוק התבנית של
`captions.update` בגל 8**: פעולה הרסנית מעל שתי פעולות לא-אטומיות. קרא את
`captions.ts` והעתק את שתי ההגנות — אימות לפני מגע, ורשת שחזור עם הודעה
שאומרת שהתוכן אבד.

---

### גל 23 — בלוקים ויצירה · לשונית „הוספה” · קטן

**הפעולות:** `blocks.delete/deleteRange/split/merge/move`,
`create.paragraph`, `create.heading`. `blocks.list` ו-`deleteRange` **כבר
בשימוש**.

**סיכונים.** נמדד ש-`blocks.delete` על פסקה עטופה זורק
`paragraph-tracked-wrapper-unsupported` (בסבב אחד; בסבב אחר החזיר הצלחה — לא
עקבי, **מדוד שוב**). כל הפעולות כאן הרסניות. `create.paragraph` דורש
`at.target` ולא `at.nodeId`. שאלה אמיתית: **האם יש לזה פקד ברצועה של Word
בכלל?** אם לא — דלג.

---

### גל 24 — מאקרו · לשונית „אוצריא” · גדול, ומעניין

**הפעולות:** `plan.execute`, `mutations.preview`, `mutations.apply`.

**מה מתווסף.** *(עודכן: החלק הראשון כאן כבר אינו נכון. `.docm` נפתח,
נערך ונשמר עם `vbaProject` שלם, וקוד ה-VBA שבמסמך מוצג לקריאה —
`src/engine/vba-import.ts`, `src/engine/export.ts`, ולשונית „VBA במסמך”
בדיאלוג המאקרו. מה שנכון: **המאקרו אינם מורצים** — אין מנוע VBA בדפדפן.)*

`doc.plan.execute({entries, captureReturns})` הוא מנוע מאקרו הצהרתי אמיתי:

```js
doc.plan.execute({
  entries: [
    { operationId: 'bookmarks.insert', input: {…}, captureAs: 'mark' },
    { operationId: 'crossRefs.insert',
      input: { ref: { kind: 'capture-ref', captureKey: 'mark', path: 'id' } } },
  ],
  captureReturns: '*',
})
```

`captureAs` שומר תוצאה של שלב ו-`capture-ref` מזריק אותה לשלב הבא — כלומר יש
משתנים. כל ערך חוזר עם קבלה, והמצב נשמר בין קריאות באותו מסמך. הטיפוסים:
`document-api/src/plan/plan.d.ts`.

**מה זה מאפשר:** מאקרו מוקלט (רשימת פעולות שנשמרת כ-JSON ומושחזרת), או
תבניות מורכבות — „חידוש עם מקור, סימנייה והפניה” בלחיצה אחת. לשונית
„אוצריא” כבר נושאת „חידוש”/„קושיא”/„תירוץ” והיא הבית הטבעי.

**סיכונים.**
- **מאקרו שנשמר הוא קוד שהמשתמש מריץ.** ולידציה על `operationId` מול רשימה
  מותרת; אל תריץ מזהה שרירותי מ-JSON.
- **מה קורה כשערך באמצע נכשל?** האם הקודמים מתגלגלים אחורה? **מדוד.** אם
  לא — מאקרו חלקי משאיר מסמך במצב ביניים, וזה הסיכון המרכזי בגל.
- `mutations.preview` לפני `apply` — נצל אותו כ„הרצה יבשה”.
- `global.dryRun.enabled` הוא `true` — יש כבר קוד סיבה
  `DRY_RUN_UNAVAILABLE`.
- **הגל היחיד שבו אנחנו מייצרים ממשק שאינו ב-Word.** אין תקדים עיצובי
  להעתיק — התייעץ לפני שאתה בונה.

---

### גל 25 — פקדי תוכן · לשונית „מפתח” · גדול, ובעדיפות נמוכה

**הפעולות** (54): `contentControls.*` — כולל `text.*`, `date.*`,
`checkbox.*`, `choiceList.*`, `repeatingSection.*`, `group.*`.

**סיכונים והמלצה.** ב-Word זו לשונית „מפתח” שאינה מוצגת כברירת מחדל, וזהו
פיצ'ר למפתחי תבניות ולא לכותבי ספרים. **ההמלצה: לדלג, או לממש תת-קבוצה
מינימלית בלבד** (תיבת סימון, תיבת טקסט, בורר תאריך) ורק אם יש דרישה אמיתית.
54 פעולות בשביל קהל שאינו קהל התוסף הן השקעה גרועה. `contentControls.date.*`
כולל `setCalendar` — אם יש שם לוח שנה עברי, זה הפריט היחיד שמצדיק בדיקה.

**`customXml.*` (5) — אין לממש.** אינסטלציה בלי פקד ברצועה.

---

## חלק ו׳ — סיכונים חוצי-גלים

טבלה מרוכזת. כל שורה נמדדה בפועל ולא נוחשה.

| סיכון | איפה נצפה | מה עושים |
|---|---|---|
| פעולה מדווחת הצלחה וכותבת שדה שאינו קוד Word | `crossRefs.insert`, `authorities.entries.insert`, `subEntry` של המפתח | פרק את ה-zip. אל תשלח. |
| `configure` בולע ערכים בשקט | `toc`, `index`, `authorities`, `captions`, `footnotes` | ולידציה אצלנו + שער XML |
| ערך **שבחוזה** נכתב כאסימון שאינו של Word | `symbol`/`chicago`, `eachSection`/`eachSect`, `sectionEnd`/`sectEnd` | בדוק כל ערך ב-union מול ECMA-376 |
| `update` מוסיף במקום להחליף | `captions.update` | עקיפה ב-`remove`+`insert` **עם** אימות עוגן ורשת שחזור |
| כתובות לא-ייחודיות | שתי טבלאות תוכן עניינים = אותו `nodeId` | דה-דופליקציה, ודיווח חלקיות במקום „בוצע” |
| ישות אחת מסתירה אחרת באותה כתובת | הערת שוליים מול הערת סיום | `get` לאימות + **נעילה** (TOCTOU) |
| `list` מחזיר עמוד ומטופל כמסמך | `fields`, `toc`, `sections` | שאיבה עד `total`; כשל חלקי = מצב ריק |
| הסרה משאירה שיירים | `toc.remove` | ניקוי מפורש + הודעה כשהזיהוי לא תפס |
| עוגן שאינו פסקה נדחה | `captions.insert` על `tbl:*` | אימות סוג לפני מגע + נפילה-לאחור |
| הכפיל אינו יודע לייצר את המסלול | גל 8 (רק פסקאות), גל 9 (אותו tick) | הרחב את הכפיל, לא רק את הבדיקות |
| אין דרך להזיז את הסמן בין stories | כותרות, מספרי עמודים | אמור זאת ב-tooltip; אל תבטיח |
| `selection.current` אינו מדווח מקטע | כל `sections.*` | הפעולה חלה על כל המקטעים, ומתועדת ככזאת |

---

## חלק ז׳ — צ'קליסט לפני מסירה

- [ ] קראתי את ה-`.d.ts` של כל פעולה שאני שולח, ולא ניחשתי חתימה
- [ ] מדדתי בדפדפן, ופירקתי את ה-zip לכל פעולה שכותבת שדה או XML
- [ ] אימתתי כל אסימון ב-union מול תיעוד Word
- [ ] בדקתי ערך שטותי בכל פעולה — ומה שנבלע, מנוטרל אצלנו
- [ ] בדקתי עברית: מנוקדת, גרשיים, גרש
- [ ] בדקתי כפילות כתובות
- [ ] כל פעולה מחזירה `CommandOutcome` ולעולם לא זורקת
- [ ] `NO_OP` = הצלחה
- [ ] שאיבת עמודים עד `total`, וכשל חלקי מחזיר מצב ריק
- [ ] שאלת capability לכל פקד; פקד עם `false` disabled עם `explain()`
- [ ] פעולה הרסנית: אישור, אימות לפני מגע, רשת שחזור, והודעה שאומרת אמת
- [ ] פעולה שקוראת-ואז-משנה: נעילה, לא קריאה נוספת
- [ ] הכפיל יודע לייצר את המסלולים שההגנות שלי נבנו בשבילם
- [ ] הרצתי מוטציות ודיווחתי כמה נתפסו
- [ ] כותרת כל בדיקה מתארת את מה שהיא באמת בודקת
- [ ] בחירה מתפריט נפתח — בדיקה ייעודית
- [ ] `harness.ts` תוספתי בלבד
- [ ] `docs/engine-gaps.md` עודכן
- [ ] אייקונים: ספרתי בפועל ועדכנתי `icons.ts` + `README.md` +
      `THIRD_PARTY_NOTICES.md`
- [ ] `npm run verify` עובר, עם שתי האזהרות הידועות בלבד
- [ ] `dist/qa-tmp.html` נמחק, Chrome על 9333 הרוג
- [ ] לא עשיתי `git add`/`commit`, ולא `git checkout` על עבודה לא-מקומטת
