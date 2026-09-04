# `fonts.listInstalled` — החוזה מול אוצריא

מסמך זה היה המפרט להגשה, והוא **מומש**. מה שנשאר כאן הוא החוזה שהתוסף מסתמך
עליו, ותיעוד של מה שנבנה בפועל ובמה הוא נבדל מהמפרט המקורי.

## מצב: מומש

| | |
|---|---|
| ענף באוצריא | `feat/plugin-fonts-resolve-families` — **מוזג** ל-`upstream/dev` ול-`upstream/pre-0.9.97` (קומיט `55efb4534`) |
| גרסה | **0.9.97** — `_methodMinVersion` ב-`plugin_extended_validator.dart` |
| מימוש | `installed_fonts.dart`, על תקדים `windows_arch_info.dart` |
| **הרשאה** | **`app.info.read`** — כמו `fonts.resolveFamilies` שלידה |
| נמדד על Windows | 294 משפחות · 57 עם `hebrew` · 25 `monospace` · 0 עם `@` · 0 כפולים |
| נמדד שוב, מכונה אחרת | 1031 שורות callback → 287 משפחות · 57 `hebrew` · 22 `monospace` · 134 `@` ו-7 raster נופלו |

**ההרשאה אינה דורשת דבר מהתוסף**, וזה ההבדל מהמפרט המקורי — לא לטובת ההצהרה
אלא לרעתה: `app.info.read` היא **הרשאת בסיס** באוצריא, מוענקת לכל תוסף
אוטומטית ובלי הצגה למשתמש, וההצהרה עליה במניפסט מיותרת (הוולידטור סובל אותה
לתאימות לאחור וממליץ להסירה). לכן `public/manifest.json` אינו משתנה כאן.

**בבנייה מלפני 0.9.97** `tryCall` מחזיר `null` לכל קריאה, והמנייה נופלת לשכבת
המדידה — כלומר הרשימה היא כמה עשרות שמות ולא 287. זה אינו תקלה, אבל זה **כן**
מה שהמשתמש רואה: נמדד על הפורטבל 0.9.96, שה-snapshot שלו (`data/app.so`) אינו
מכיל את המחרוזת `fonts.listInstalled` כלל — וגם לא את `fonts.resolveFamilies`.

וזה ההפרש בפועל, על מכונה עם 287 משפחות: הבורר עובר מ-67 שורות ל-251, וקבוצת
„עברית” מ-14 ל-48. 33 גופנים עבריים מותקנים — כל משפחת Guttman, Hadassah
Friedlaender, כל משפחת AlefAlefAlef, Parshendata/Shesek/Spectrum/Varela/
Yiddishkeit FM — נעדרים מהבורר לחלוטין בשכבה 2, מפני שאיש לא כתב אותם ברשימת
המועמדים. עם המארח כולם נכנסים, וכולם עם הדגימה העברית.

שתי התאמות נוספות שנעשו בצד אוצריא: הרישום דרש שורה בחמישה מקומות (adapter,
handler, permissions, ו-validator ×3), ו-`spec.json` מחולל — יש לסנכרן
`API_REFERENCE.md` ולהריץ `generate_plugin_spec.dart`, אחרת שלוש בדיקות נופלות.

וב-`win32 6.3.0` שלושה הבדלים מהקוד שלמטה: `GetDC`/`ReleaseDC` מקבלים `HWND?`
(כלומר `null`, לא `nullptr`), `lParam` הוא `LPARAM` ולא `int`, ו-`HDC` הוא
extension type על `Pointer` — הבדיקה היא `hdc.address != 0`.

---

## למה זה נדרש

בורר הגופן של עורך התמלילים יכול להציג רק שמות שהוא **יודע עליהם מראש**.
לדף אין דרך פשוטה למנות גופנים מותקנים:

- **`fs.listDir` — חסום.** לא הנחה: ה-d.ts מצהיר במפורש שכל נתיב יחסי לשורש
  התוסף ושנתיב מוחלט נדחה ב-`error.forbidden`.
- **`queryLocalFonts()` — לא נמדד ב-WebView2 של אוצריא.** מה שכן נמדד, ב-Chrome
  headless על ה-dist הארוז מ-`file://`: הפונקציה קיימת ו-`isSecureContext` הוא
  `true`, כלומר שער ה-origin אינו חוסם. מה שנשאר פתוח הוא ההרשאה: `local-fonts`
  מגיעה ב-WebView2 דרך `PermissionRequested`, ואוצריא ב-Windows רצה ב-visual
  hosting — שם אין חלון להציג בו prompt. **Chrome headless אינו WebView2, ולכן
  המדידה הזאת אינה עונה על השאלה.**

**וזו הנקודה שמייתרת את ההכרעה:** גם אילו `queryLocalFonts` היה עובד, הוא אינו
מחזיר את מה ש-GDI כן מחזיר — **אילו ערכות תווים כל גופן מכסה**. בעורך עברי זה
ההבדל בין רשימה שטוחה של 300 שמות לבין בורר עם קבוצת „עברית” בראשו. המסלול
הנייטיב עדיף לגופו, לא רק כברירת מחסור.

זה משרת כל תוסף של אוצריא, לא רק את עורך התמלילים.

---

## החוזה

**מתודה:** `fonts.listInstalled`
**ארגומנטים:** אין.
**הרשאה:** אין — בדיוק כמו `fonts.resolveFamilies` שכבר קיימת ב-namespace הזה.

**מחזירה:**

```jsonc
{
  "families": [
    { "name": "David",     "scripts": ["hebrew"],           "monospace": false },
    { "name": "Segoe UI",  "scripts": ["latin", "hebrew"],  "monospace": false },
    { "name": "Consolas",  "scripts": ["latin"],            "monospace": true  }
  ],
  "platform": "windows"
}
```

| שדה | חובה | משמעות |
|---|---|---|
| `name` | ✅ | שם המשפחה **בדיוק כפי ש-CSS `font-family` מקבל אותו**. לא שם קובץ, לא שם פנים („David Bold”) — שם משפחה. |
| `scripts` | ✅ | מזהים קבועים: `latin` `hebrew` `arabic` `cyrillic` `greek` `cjk` `thai` `symbol`. רשימה ריקה מותרת. |
| `monospace` | ✅ | רוחב קבוע. |
| `platform` | ✅ | `windows` \| `android` \| `linux` \| `macos` |

**פלטפורמה שטרם מומשה מחזירה `{ "families": [], "platform": "..." }`** — לא
שגיאה. התוסף מזהה רשימה ריקה ונופל לבד לקירוב שלו.

---

## מימוש Windows — `EnumFontFamiliesExW`

זו הדרך הנכונה: GDI כבר עשה את כל העבודה, כולל שמות מקומיים. **אין לפרסר
טבלאות `name` של TTF** — זה מיותר ומועד לשגיאות.

`package:win32` + `dart:ffi`.

```dart
final lf = calloc<LOGFONT>();
lf.ref.lfCharSet = DEFAULT_CHARSET;   // 1 — מונה את כל הערכות
lf.ref.lfFaceName = '';               // כל המשפחות
lf.ref.lfPitchAndFamily = 0;

final hdc = GetDC(NULL);
EnumFontFamiliesEx(hdc, lf, callback, 0, 0);
ReleaseDC(NULL, hdc);
```

בתוך ה-callback, שלושה שדות מתוך `ENUMLOGFONTEX`:

| שדה | לשם מה |
|---|---|
| `elfLogFont.lfFaceName` | שם המשפחה |
| `elfLogFont.lfCharSet` | ערכת התווים → `scripts` |
| `elfLogFont.lfPitchAndFamily & 0x03` | `== FIXED_PITCH (1)` → `monospace` |

מיפוי `lfCharSet` → `scripts`:

```
0   ANSI          -> latin        177 HEBREW    -> hebrew
238 EASTEUROPE    -> latin        178 ARABIC    -> arabic
186 BALTIC        -> latin        204 RUSSIAN   -> cyrillic
162 TURKISH       -> latin        161 GREEK     -> greek
163 VIETNAMESE    -> latin        222 THAI      -> thai
77  MAC           -> latin        2   SYMBOL    -> symbol
128 SHIFTJIS / 129 HANGEUL / 134 GB2312 / 136 CHINESEBIG5 / 130 JOHAB -> cjk
```

### שלוש מלכודות — לקרוא לפני שכותבים

1. **ה-callback יורה פעם לכל צירוף (משפחה, charset).** משפחה עם עברית ולטינית
   תופיע **פעמיים**. לצבור ל-`Map<String, Set<String>>` לפי שם, לא לרשימה
   שטוחה — אחרת תקבל כפילויות ותאבד את המידע על הערכה השנייה.

2. **שמות שמתחילים ב-`@` הם הווריאנטים האנכיים של CJK.** לדלג עליהם
   (`if (face.startsWith('@')) return 1;`). בלי זה הרשימה מתנפחת בעשרות שמות
   שאינם רלוונטיים לאף אחד.

3. **החזרת `0` מה-callback עוצרת את המנייה.** תמיד להחזיר `1`, גם בשורה
   שדילגת עליה.

### עוד שלושה דברים שמשנים את האיכות

- **למטמן בזיכרון.** למנות פעם אחת לריצת האפליקציה. גופנים אינם מותקנים תוך
  כדי עבודה, ומנייה חוזרת בכל קריאה היא בזבוז.
- **`Pointer.fromFunction` דורש פונקציה ברמה העליונה** שמחזירה `int`. הצבירה
  תהיה למשתנה סטטי — לעטוף במנעול פשוט כדי שקריאות מקבילות לא ידרסו זו את זו.
- **`LF_FACESIZE` הוא 32 תווים.** GDI קוטם שמות ארוכים מ-31 תווים. זה נדיר,
  וזו מגבלת ה-API — לא צריך לעקוף אותה.

### פלטפורמות אחרות (אופציונלי, בהמשך)

| | דרך |
|---|---|
| Linux | `fc-list --format='%{family[0]}\n'` |
| macOS | `CTFontManagerCopyAvailableFontFamilyNames` |
| Android | `/system/fonts` + `/system/etc/fonts.xml` |

---

## איפה לשים את זה

**העוגן:** מצא איך `fonts.resolveFamilies` רשומה ומטופלת, ושים את
`fonts.listInstalled` **בדיוק לידה** — אותו namespace, אותו dispatcher, אותה
מדיניות הרשאות (ללא), אותו סגנון סריאליזציה. אל תמציא מקום חדש.

עדכן גם את הצהרות הטיפוסים שהתוסף צורך (`otzaria_plugin.d.ts`), אם הן מתוחזקות
בצד אוצריא: `OtzariaMethod` צריך לכלול `'fonts.listInstalled'`.

---

## בדיקות

1. **הרצה אמיתית על Windows:** לוודא שחוזרות מאות משפחות, שאין כפילות שם,
   שאין שם שמתחיל ב-`@`, ושגופן עברי מוכר (`David`, `FrankRuehl`, `Narkisim`)
   מקבל `scripts` שמכיל `hebrew`.
2. **`monospace`:** `Consolas` ו-`Courier New` → `true`. `Arial` → `false`.
3. **מטמון:** קריאה שנייה אינה מריצה מנייה נוספת.
4. **פלטפורמה לא נתמכת:** מחזירה `families: []` ולא זורקת.

---

## מה שלא צריך לעשות

- לא לסנן את הרשימה בצד אוצריא. התוסף מקבץ וממיין בעצמו לפי ההקשר שלו.
- לא להחזיר שמות פנים („Arial Bold”) — משפחות בלבד.
- לא לנסות למיין. סדר ההחזרה אינו משנה.
