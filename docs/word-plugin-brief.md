# מסמך עבודה — תוסף Word לאוצריא

ההחלטות והעובדות שרלוונטיות בפועל לבניית התוסף.

---

## 1. ההחלטה

**SuperDoc v2 כמנוע DOCX בלבד, עם `ui: false`, וממשק בסגנון Word שאנחנו בונים מעליו.**

```text
Ribbon / תפריטים / חלוניות (הקוד שלנו, עברית + RTL)
                 ↓  superdoc.ui.commands + state
        SuperDoc v2  →  @superdoc/docx-engine
                 ↓
   פתיחה, עימוד, עריכה וייצוא DOCX אמיתי
```

למה SuperDoc: TypeScript, רץ כולו בצד הלקוח ללא שרת, עובד ישירות על OOXML (לא ממיר ל־HTML), תומך בעימוד, sections, headers/footers, טבלאות, הערות ו־Track Changes, מקבל URL/File/Blob ומייצא DOCX. RTL נתמך נייטיב כולל round-trip של `<w:bidi>`.

## 2. מה נפסל ולמה

| חלופה | סיבת הפסילה |
|---|---|
| ZetaJS / LibreOffice WASM | דורש COOP/COEP ו־threads — לא מעשי ב־WebView מקומי מ־`file://` |
| ONLYOFFICE | מחייב Document Server — לא אופליין |
| Apryse WebViewer | טכנית מתאים מאוד, אבל SDK מסחרי |
| docx.js ודומיו | לא עורך Word, רק יצירה/שינוי |
| Canvas Editor כמנוע | UI מעולה, אבל תאימות DOCX חלשה (אובדן עיצוב ב־import/export) |

## 3. רישוי — נסגר

`superdoc` הוא AGPL-3.0, אבל תלוי ישירות ב־`@superdoc/docx-engine` שהוא **קנייני**. סעיף 3.1(d) ברישיון המנוע אוסר redistribution — מה שהיה חסם אמיתי לתוסף אופליין.

SuperDoc ענו במפורש ([issue #3927](https://github.com/superdoc/docx-editor/issues/3927#issuecomment-5383145303)) שמותר לתוסף קוד פתוח תחת AGPLv3 לארוז ולהפיץ את המנוע, ה־Workers ונכסי ה־runtime שלו בתוך חבילה אופליין, ללא רישיון מסחרי. האיסור על redistribution מתייחס להפצת המנוע כמוצר עצמאי.

**התנאים המעשיים:**

- התוסף עצמו AGPLv3, כל קוד המקור וקבצי הבנייה מפורסמים, והקוד המפורסם זהה למופץ.
- לייבא `superdoc` בלבד — לא `@superdoc/docx-engine` ישירות (הרישיון מתיר אותו "solely as a dependency of SuperDoc").
- לשמר את כל הודעות הרישוי וה־copyright, ולציין את SuperDoc.
- לא לשנות, לפרק או לעשות reverse engineering למנוע.
- אוצריא עצמה אינה נדרשת להפוך ל־AGPL — התוסף הוא חבילה נפרדת עם רישיון משלה.

## 4. אילוצי סביבה של אוצריא

- **אין `<script type="module">`** — WebView2 ב־Windows לא תומך בזה מ־`file://`. הבנייה חייבת להיות bundle קלאסי (IIFE/UMD) דרך Vite/esbuild/Rollup.
- **הכול מקומי** — אין CDN ואין רשת. גם קבצי ה־Workers של המנוע מועתקים לתוך התוסף (בדיוק כמו `superdoc-timeline` שמעתיק אותם ל־`public/`).
- **טלמטריה כבויה** (`telemetry.enabled: false`).
- פתיחת קובץ: `Otzaria.call('fs.pickUserFile', { extensions: ['docx', 'docm'] })` → `{ token, url, name, size }`; ה־`url` נמסר ישירות ל־SuperDoc בלי להעביר בייטים בגשר ה־JS. ה־`token` נשמר, ובהפעלה הבאה `fs.resolveFileUrl`.
- **שמירה**: *(נסגר מאז. ה־SDK מספק כתיבה בינארית בשלושה שלבים —`fs.beginBinaryWrite`, `fs.commitUserFileWrite`, `fs.abortBinaryWrite` — ולא ב־`fs.saveUserFile` כפי שנוסח כאן. בשימוש ב־`src/host/files.ts`, תחת ההרשאה `fs.user_files.write` שבמניפסט.)*
- React אינו חובה; הוא רק מקל על תחזוקת Ribbon מורכב.

## 5. מה עושים עם התוסף הקיים (v1.3.5)

הוא **אינו** מבוסס על מנוע עריכה: `contentEditable` + `document.execCommand()`, parser ו־exporter ידניים ל־OOXML עם JSZip, ו־Mammoth כ־fallback. ה־Ribbon כולו נכתב ידנית.

- **לקחת ממנו:** מבנה הממשק בעברית ו־RTL, שמות הלשוניות והפקדים, לשונית אוצריא, ערכת הנושא, בחירת גופנים, חלונית ניווט ושורת מצב, והרעיונות התורניים.
- **לזרוק:** `contentEditable`, `execCommand`, חלוקת עמודים ידנית, ה־parser/exporter של OOXML, ו־Mammoth. SuperDoc הוא מקור האמת היחיד למסמך.

## 6. מקורות UI

| מקור | רישיון | שימוש |
|---|---|---|
| [LocalOffice](https://github.com/Anon5T4R/LocalOffice) | AGPL-3.0 | **בסיס הקוד ל־Ribbon** — React+TS, לשוניות מפורקות לקומפוננטות. להחליף פעולות TipTap בפקודות SuperDoc |
| [דוגמאות custom-ui הרשמיות](https://github.com/superdoc/docx-editor/tree/main/examples/custom-ui) | AGPL-3.0 | הדפוס הנכון לחיבור `ui: false` ל־`superdoc.ui` |
| [Herramienta_Optimizacion_PBM](https://github.com/T0m4s1n/Herramienta_Optimizacion_PBM) | לא ברור | רפרנס עיצובי בלבד — הוא v1, ואין רישיון מזוהה |
| [canvas-editor](https://github.com/Hufe921/canvas-editor) | MIT | רעיונות UX: עמודים, סרגלים, בורר טבלה, חלוניות |
| [ONLYOFFICE/web-apps](https://github.com/ONLYOFFICE/web-apps) | AGPL-3.0 | רפרנס עיצובי בלבד — לא לחלץ ממנו קוד |

לא קיים כיום "Word clone UI ל־SuperDoc v2" מוכן להתקנה.

## 7. כללי תכנון

- SuperDoc הוא מקור האמת לתוכן ולעיצוב; ה־UI רק מציג state ושולח commands.
- מצבי active/disabled מגיעים מה־controller של SuperDoc, לא מה־DOM.
- הערות, Track Changes, טבלאות ועימוד — באחריות SuperDoc, לא לממש מחדש.
- RTL נבנה מההתחלה, לא כתיקון מאוחר.

## 8. בדיקות תאימות חובה

10–15 מסמכי Word עבריים מורכבים, שיכסו: RTL מלא ועברית+אנגלית באותה פסקה, ניקוד וטעמים, הערות שוליים, headers/footers ומספרי עמודים, טבלאות מורכבות, תמונות, סגנונות Word, רשימות רב־רמתיות, מעברי עמוד ומקטע, תוכן עניינים ושדות Word, הערות ומעקב שינויים — ובכולם round-trip מלא של ייבוא→עריכה→ייצוא.
