# מסך „פתח מסמך” — מפרט עיצוב

שלב 1 של `docs/open-document-dialog-plan.md`. המפרט הזה הוא הקלט של שלב 4
(`src/ui/panels/OpenDocumentDialog.vue` + `tests/component/open-document-dialog.test.ts`),
והוא מחייב: כל מספר כאן נועד להיכתב לקוד כמו שהוא.

הוא אינו משנה אף חוזה מהתוכנית. ה-props, ה-emits, `TemplatePreview`,
`RecentDocument` ו-`MAX_RECENT_DOCUMENTS` הם כפי שהם שם, ו-`recent-documents.ts`
כבר קיים במאגר — קראתי אותו ולא את התוכנית בלבד, וההתנהגויות שלו (`openedAt: 0`,
`size: 0`, `filterRecents` שמחזירה הכול על שאילתה ריקה) מטופלות כאן כמצבי קצה.

---

## 0. חמש עובדות שנמדדו לפני שצוירה שורה אחת

כל אחת מהן פסלה או שינתה החלטה, ולכן הן פותחות ולא נקברות בהערת שוליים.

**1. `--font-size-ui` חסום בין 12px ל-16px, ולא בין 14 ל-28.**
`tokens.css` מגדיר `clamp(12px, calc(var(--font-size-base) * 0.78), 16px)`.
עם `--font-size-base: 14px` הביטוי האמצעי הוא 10.92px והתוצאה 12px; עם 28px הוא
21.84px והתוצאה 16px. כלומר הדרישה „לשרוד 14 ו-28” היא בפועל **לשרוד גדילה של
33% בגופן הממשק**, וזה טווח שאפשר לתכנן מולו במדויק. כל סולם הטיפוגרפיה כאן
נכתב כ-`em` יחסית לשורש הדיאלוג, וכל מידה מובאת בשני הקצוות.

**2. `--line-height` כן נדרס בזמן ריצה, ובלי clamp.**
`host/theme.ts` כותב `root.style.setProperty('--line-height', String(typography.lineHeight))`
על כל ערך חיובי. לכן **אין** בעיצוב הזה שום גובה קבוע שמכיל טקסט: לא
`aspect-ratio` על הכרטיס, לא גובה שורה קבוע ברשימה. גובה נקבע בכל מקום מהתוכן.

**3. `--color-outline-variant` אינו חלק מהערכה.**
`COLOR_VARS` ב-`host/theme.ts` מונה ארבעה-עשר תפקידים, ו-`outline-variant` אינו
בהם. כלומר הוא נשאר `#e1dfdd` מ-`tokens.css` **בכל ערכה, כולל מצב כהה** — קו
בהיר וקבוע על משטח כהה. ארבעת הדיאלוגים הקיימים משתמשים בו לקווי ההפרדה שלהם,
וזה חוב קיים שאינני נוגע בו כאן; אבל הדיאלוג **החדש** לא מוסיף אליו. כל גבול וכל
קו הפרדה כאן הם `var(--color-outline)`, שהוא כן נגזר מהערכה. המחיר: קו הכותרת
כאן ייראה מעט כהה יותר מזה של `AboutDialog` במצב בהיר (`#cbd5e1` מול `#e1dfdd`).
זה מחיר קטן מול קו בהיר שנשאר בהיר במצב כהה.

**4. `title` אסור בכל המאגר.**
`tooltip-content.ts` מתעד ש-`title` הוסר מכל אלמנט, ו-`tests/unit/native-title.test.ts`
אוכף זאת. לכן השם המלא של קובץ ארוך מגיע ב-`data-tip-title` ולא ב-`title`.
`TooltipLayer` יושב ב-`z-index: 4000` והמודאל ב-3000 — כלומר הטולטיפ אכן מצויר
מעל הדיאלוג, וזו הסיבה שאפשר להישען עליו כאן.

**5. במאגר כן יש אנימציות — אבל לא בדיאלוגים.**
נמדד בסריקה: `ContextMenu.vue` (כניסה 90ms), `TooltipLayer.vue` (120ms),
`StatusBar.vue` (סוויפ 1.4s), וכל שלושתן עם `prefers-reduced-motion`. ארבעת
המודאלים — `AboutDialog`, `ShortcutsDialog`, `MacrosDialog`, `FindReplaceDialog` —
אינם מנפישים דבר. הדיאלוג הזה הולך אחרי הדיאלוגים. ראו §8.

**אין צורך בטוקן חדש.** בדקתי כל צבע, גופן, רדיוס ומידה שהמפרט דורש מול
`tokens.css` — כולם קיימים. וזה לא ניסוח מנומס: `tests/unit/css-hygiene.test.ts`
נופל על טוקן שהוגדר ואין לו צרכן („לכל טוקן שהמצאנו יש צרכן”), ולכן טוקן נוסף
רק יחד עם הצרכן שלו. המידה הבספוקית היחידה כאן — גובה גיליון התצוגה המקדימה —
היא custom property **מקומית ב-`<style scoped>`** של הקומפוננטה
(`--tpl-sheet-h: 6.5em`), ואינה נוגעת ב-`tokens.css`.

---

## 1. מידות ופריסה

### 1.1 המעטפת

```css
.modal-backdrop {                 /* זהה מילה במילה ל-AboutDialog/ShortcutsDialog */
  position: fixed;
  inset: 0;
  background: var(--color-scrim);
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.open-dialog {
  width: min(960px, 94vw);
  max-height: min(760px, 88vh);
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border: 1px solid var(--color-outline);
  border-radius: var(--radius-md);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.24);
  font-family: var(--font-main);
  font-size: var(--font-size-ui);
  overflow: hidden;
}
```

**למה 960 ולא 720 כמו `ShortcutsDialog`.** חמישה כרטיסים בשורה אחת דורשים
`5×148 + 4×12 = 788px` בתיבת התוכן, כלומר `788 + 32 (ריפוד) + 2 (גבולות) = 822px`
רוחב דיאלוג. 960 נותן לכל כרטיס `(960 − 34 − 48) / 5 = 175.6px`, וזה הרוחב שבו
הגיליון (73.9px בקצה העליון של הסולם) יושב עם אוויר משני צדדיו ולא נדבק לשוליים.

`94vw` ולא `92vw`: ההפרש שווה כרטיס אחד בשורה בחלונות שסביב 880px.

**`box-shadow` בשחור ניטרלי** — זו אחת משתי ההחרגות המפורשות של
`css-hygiene.test.ts` (`NEUTRAL_SHADOW`), וזה בדיוק אותו ערך שכבר יושב בשני
הדיאלוגים האחרים. צל בכל צבע אחר ייפול בשער.

### 1.2 חלוקת הגובה

```
┌ .open-header      flex: 0 0 auto      ריפוד 12px 16px
├ .open-body        flex: 1 1 auto      min-height: 0; overflow-y: auto; ריפוד 16px
│   ├ section „מסמך חדש”        flex: 0 0 auto     ← לעולם אינו מתכווץ
│   ├ .open-browse              flex: 0 0 auto
│   └ section „מסמכים אחרונים”  flex: 1 1 auto; min-height: 0
│         └ .rec-list           flex: 1 1 auto; min-height: 96px; overflow-y: auto
└ .open-footer      flex: 0 0 auto      ריפוד 10px 16px
```

מרווח בין שלושת האזורים בגוף: `16px` (`gap` על `.open-body`).

**הכלל:** רשת הכרטיסים אינה נגללת ואינה מתכווצת; הרשימה בולעת את כל מה שנשאר
וגוללת. הנימוק — מלאי הכרטיסים קבוע בחמישה, וכרטיס שנחתך מתחת לקו הגלילה הוא
תבנית שהמשתמש לא יודע שקיימת. רשימת אחרונים, לעומת זאת, **נועדה** להיגלל: היא
מכילה `MAX_RECENT_DOCUMENTS = 20` לא-מוצמדים **ועוד** את כל המוצמדים, ואין לה
תקרה עליונה.

**חשבון הגובה (מחושב מהמידות שכאן, לא נמדד בדפדפן), חלון 1280×800:**

| | שורש 12px | שורש 16px |
|---|---|---|
| `max-height` בפועל | 704 (0.88×800) | 704 |
| כותרת | 40 | 46 |
| כותרת תחתונה | 43 | 50 |
| רשת הכרטיסים (כותרת + שורה) | 181 | 225 |
| „עיון בקבצים…” | 38 | 41 |
| ראש אזור האחרונים | 26 | 26 |
| ריפוד + שלושה מרווחים | 64 | 64 |
| **נשאר לרשימה** | **304 ≈ 9.5 שורות** | **245 ≈ 7.6 שורות** |

**מתי הגולל החיצוני נכנס לפעולה.** בחלון 540×640 רוחב הדיאלוג הוא 507.6px, הרשת
יורדת לשלוש עמודות ולכן לשתי שורות (3+2), וגובה הכרטיסים לבדם 330px. הסכום עובר
את `min(760, 563)`, `.open-body` מקבל פס גלילה, ו-`.rec-list` עם
`min-height: 96px` לא נמחק מהמסך. זה התרחיש היחיד שבו שני גוללים קיימים יחד,
ובו זה הפתרון הנכון — גוף שנגלל עדיף על רשימה בגובה אפס.

### 1.3 רשת הכרטיסים ומה קורה בחלון צר

```css
.tpl-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
  gap: 12px;
}
```

**היא גולשת לשורות, לא נגללת אופקית.** רצועה שנגללת אופקית מסתירה תבניות מאחורי
קצה, וב-RTL היא גם נחה בקצה הלא-נכון; שורה שנייה מציגה את כולן תמיד.

נקודות המעבר מחושבות מהנוסחה `W = min(960px, 0.94·vw)` ותיבת תוכן `W − 34`:

| עמודות | תוכן דרוש | רוחב דיאלוג | רוחב חלון מ־ |
|---|---|---|---|
| 5 | 788 | 822 | 875px |
| 4 | 628 | 662 | 705px |
| 3 | 468 | 502 | 534px |
| 2 | 308 | 342 | 364px |
| 1 | — | — | מתחת לזה |

**למה 148px מינימום.** התווית הארוכה („ספר קודש — שני טורים”, 21 תווים) צריכה
להיכנס בשתי שורות לכל היותר בקצה העליון של הסולם (16px). בתיבת תוכן של
`148 − 2 − 20 = 126px` היא נשברת לשתיים. **זה אומדן ולא מדידה** — אם מדידה על
Assistant תראה שלוש שורות, 148 הוא הידית שמזיזים, ולא גודל הגופן.

`auto-fit` ולא `auto-fill`: `auto-fill` היה משאיר עמודות ריקות בחלון רחב, וחמישה
כרטיסים היו נדחסים לצד אחד.

---

## 2. אנטומיית הכרטיס

> ### עדכון אחרי בנייה — הכרטיס ירד למסגרת אפס
>
> אחרי שהמסך נבנה ונראה בדפדפן, המשתמש ביקש **אייקון, כיתוב מתחתיו, בלי
> מסגרת, והתיאור בטולטיפ בריחוף**. זה מה שמומש, וזה גובר על §2.1–§2.3 ועל
> §2.5 בכל מקום שהם נבדלים:
>
> * `.tpl-card` הוא `background: none` ו-`border: 1px solid transparent` —
>   הגבול נשאר בהגדרה כדי שהגיאומטריה לא תזוז ב-hover, ואינו נצבע לעולם.
>   הריפוד ירד ל-`10px 6px 12px`.
> * בתוכו נשארו **שניים** בלבד: ה-SVG ו-`.tpl-label`. `.tpl-hint`
>   ו-`.tpl-note` אינם מרונדרים.
> * הרמז וההערה עוברים כמחרוזת אחת — `הרמז. ההערה` — לשני צרכנים:
>   `data-tip-desc` (הטולטיפ, שנפתח גם ב-`focusin` ולא רק בעכבר) ו-
>   `aria-describedby`. מקור אחד, כדי שהם לא יתפצלו.
> * התיאורים הנגישים יושבים ב-`.tpl-descriptions` **מחוץ** לכפתורים: טקסט
>   בתוך כפתור נספר לשם הנגיש שלו גם כשהוא מוסתר ויזואלית, וזה בדיוק מה
>   ש-§2.1 ביקש למנוע. הסתרה ב-`clip-path` ולא ב-`display:none`, שמוציא
>   מעץ הנגישות.
> * **אין `aria-labelledby` ואין `aria-label`.** השם מגיע מהתווית הגלויה —
>   הכלל שמתועד ב-`RibbonButton.vue`.
> * **סולם ה-hover חוזר לזה של הרצועה** — 8% ל-hover, 12% ללחיצה. ההזזה
>   דרגה מעלה ב-§2.3 הוצדקה בכך ש„8% היו *מחליפים* מילוי אטום”; מרגע שמצב
>   המנוחה שקוף, הם שוב **תוספת** על המשטח.
>
> מה ש**לא** השתנה: הגיאומטריה של חמש התצוגות המקדימות (§5) על כל מספר בה,
> הרשת (§1.3), הרשימה (§4), והנגישות של הניווט (§7.3–§7.6).
>
> **רוחב הדיאלוג ירד ל-`min(840px, 94vw)`** בעקבות ההסרה. 960 היה מכויל
> לכרטיס עם שלוש שורות טקסט; 840 הוא הרוחב הקטן ביותר שעדיין מחזיק חמישה
> כרטיסים בשורה (‏`5×148 + 4×12 = 788` תוכן, ו-`W − 34` הוא התוכן, מכאן
> `W ≥ 822`). נקודות המעבר של §1.3 לא זזו, והשער מודד אותן.
>
> ### עדכון שני — שני ציורים תוקנו אחרי ביקורת QA
>
> ביקורת שמדדה את המסמך שנוצר בפועל מצאה שני מקומות שבהם הציור הבטיח מה
> שהתבנית לא נותנת. שניהם תוקנו **בציור**, כי שם היה השקר:
>
> * **`title-page`** — §5.4 נתן לו גוש כותרת, קו אופקי, ותשע שורות גוף באותו
>   עמוד. התבנית מחילה `pageBreakBefore`, כלומר הגוף נמצא בעמוד **הבא**, אין
>   שום קו, ובעמוד הראשון שלוש פסקאות בלבד. הציור הוא עכשיו עמוד שער: שלוש
>   מסות ממורכזות בגודל יורד (‏110×12, ‏66×7, ‏24×6 ב-y ‏90/116/136), בלי גוף
>   ובלי קו. הספירה ב-§5.5 יורדת ל-**4 מלבנים, 0 קווים**.
> * **`annotated`** — רצועת הערות השוליים צוירה ב-`height: 5` מול 7 בגוף,
>   כלומר הצהירה „הביאור קטן מהפנים”. `applyDocStyleDefaults` חל על
>   `docDefaults` ולכן שני הזרמים יוצאים באותו גודל. העובי הושווה ל-
>   `ROW_THICKNESS`, והקצב נשאר 14 (מול 19) — הצפיפות והמפריד הם ההבדל
>   האמיתי, והם נשארים. ה-y-ים הם 235/249/263.
>
> **מה שנשאר כפי שהוא, ובמכוון:** השוליים של `kuntres-a5`. §5.4 מצהיר מראש
> שקנה המידה אומר „גיליון קטן יותר” ואינו טוען דבר על מספרי שוליים — ולכן
> `narrow` בתבנית מול 25.4 מוקטן בציור **אינו** סתירה. ההבחנה מול שני
> המקרים למעלה: שם הציור הצהיר על מספר או על יחס, כאן על פרופורציה בלבד.
>
> נוסף בנפרד: `.open-discarded` בפינה השמאלית התחתונה — כיתוב שמוביל
> למסמכים שנסגרו בלי לשמור, מרונדר רק כש-`discardedCount > 0`.


### 2.1 המבנה

```html
<button type="button" class="tpl-card"
        :disabled="busy"
        :tabindex="index === activeCard ? 0 : -1"
        :aria-labelledby="`${idBase}-label`"
        :aria-describedby="describedBy"
        @click="$emit('create-from-template', template.id)">
  <svg class="tpl-sheet" viewBox="-2 -2 214 301" aria-hidden="true" focusable="false"> … </svg>
  <span class="tpl-label" :id="`${idBase}-label`">{{ template.label }}</span>
  <span class="tpl-hint"  :id="`${idBase}-hint`">{{ template.hint }}</span>
  <span v-if="template.note" class="tpl-note" :id="`${idBase}-note`">{{ template.note }}</span>
</button>
```

`describedBy` = `hint` ועוד `note` כשהיא קיימת. **למה `aria-labelledby` על התווית
בלבד ולא השארת השם הנגיש הטבעי:** בלי זה קורא מסך מקריא את הכרטיס השני כ„ספר
קודש — שני טורים, גוף בשני טורים שווים עם כותרת רצה, הטורים מצוירים הפוך בעורך
הקובץ נשמר נכון” — שם של עשרים מילה. עם הפיצול השם הוא „ספר קודש — שני טורים”,
וההערה מגיעה כתיאור, כלומר **לפני ההפעלה ואחרי השם**. זה בדיוק מה שההערה נועדה
לעשות.

### 2.2 המידות

```css
.tpl-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 10px 14px;
  background: var(--color-surface-container-high);
  border: 1px solid var(--color-outline);
  border-radius: var(--radius-md);
  color: var(--color-on-surface);
  font-family: var(--font-main);
  font-size: inherit;
  text-align: center;
  cursor: pointer;
  transition: background-color 0.08s ease, border-color 0.08s ease;
}

.tpl-sheet { --tpl-sheet-h: 6.5em; height: var(--tpl-sheet-h); width: auto;
             aspect-ratio: 214 / 301; display: block; flex-shrink: 0; }
.tpl-label { margin-block-start: 8px; font-weight: 600; line-height: 1.25; }
.tpl-hint  { margin-block-start: 4px; font-size: 0.88em; line-height: 1.3;
             color: var(--color-on-surface-variant); }
.tpl-note  { margin-block-start: 8px; align-self: stretch; text-align: start;
             font-size: 0.88em; line-height: 1.35;
             color: var(--color-on-surface-variant);
             padding-inline-start: 6px;
             border-inline-start: 2px solid var(--color-outline); }
```

`.tpl-card` חייב לדרוס שלושה מאפיינים שהכלל הגלובלי `button` ב-`shell.css` נותן
לו — `padding: 6px 14px`, `border-radius: var(--radius-sm)` ו-`background`.
זה לא ניקיון: בלי הדריסה הכרטיס יוצא בריפוד של כפתור.

**גובה הכרטיס נגזר מהתוכן ואינו נכפה.** מחושב:

| | רוחב | גובה | יחס |
|---|---|---|---|
| שורש 12px | 175.6 | ‎12+78+8+15+4+28+14 = 159‎ | 0.91 |
| שורש 16px | 175.6 | ‎12+104+8+20+4+37+14 = 199‎ | 1.13 |

כמעט ריבוע בקצה אחד, פורטרט מתון בשני. **לא נכפה `aspect-ratio: 1` על הכרטיס**
מהסיבה שבעובדה 2: `--line-height` נדרס בזמן ריצה בלי חסם, וריבוע קשיח היה חותך
תווית בערכה עם line-height 1.8.

כל הכרטיסים בשורה יוצאים באותו גובה מעצמם — `align-items: stretch` הוא ברירת
המחדל של grid. לכן ההערה בכרטיס 2 מרימה את כל השורה בכ-30px. זה עדיף על השתיים
האחרות: הערה שנחתכת, וגובה קבוע שנשבר בשורש 16px.

### 2.3 המצבים

| מצב | רקע | גבול | הערה |
|---|---|---|---|
| רגיל | `--color-surface-container-high` | `--color-outline` | |
| `:hover:not(:disabled)` | `--word-btn-active` | `--color-primary` | 12% |
| `:active:not(:disabled)` | `--word-btn-active-hover` | `--color-primary` | 20% |
| `:focus-visible` | — | — | הטבעת מגיעה מ-`shell.css` |
| `:disabled` (בזמן `busy`) | — | — | `opacity: .5` מ-`shell.css` |

**למה ההיררכיה מוזזת דרגה אחת מעלה מול הרצועה.** `tokens.css` מתעד שלוש דרגות —
8% ל-hover, 12% לדלוק, 20% לדלוק+עכבר — ו-`css-hygiene.test.ts` אוכף שהן נבדלות
זו מזו בערך שנפתר. ברצועה מצב המנוחה הוא `transparent`, ולכן 8% הם **תוספת** על
הרקע. כאן מצב המנוחה הוא מילוי אטום (`container-high`), ו-8% היו **מחליפים** אותו
בשכבה שקופה מעל `--color-surface` — כלומר צעד שקרוב לאפס בבהירות. לכן ה-hover
לוקח את דרגת 12% והלחיצה את 20%. כל שלוש הדרגות עדיין בשימוש במאגר, ואף אחת לא
נעשתה מיותמת.

**אין מצב „נבחר”.** לחיצה על כרטיס יוצרת מסמך מיד, ולכן אין בחירה שנשמרת ואין
`aria-pressed`. זו הסיבה שאין כאן דרגה רביעית.

**מנוטרל:** `:disabled` בלבד, והמראה מגיע מהכלל הגלובלי. לא נכתב כאן כלל אטימות
מקומי — שני כללי `opacity` על אותו אלמנט הם שני מקורות אמת. כל כללי ה-hover/active
נושאים `:not(:disabled)`, אחרת כרטיס מנוטרל היה נצבע תחת העכבר.

**טבעת המיקוד לא נדרסת.** `shell.css` נותן `outline: 2px solid var(--color-primary);
outline-offset: 2px`. במרווח רשת של 12px שתי טבעות שכנות תופסות 4px כל אחת ואינן
נוגעות (8 < 12). מדוד את זה מחדש רק אם ה-gap יורד מתחת ל-8px.

### 2.4 חמש התבניות — התוויות והדגלים

| id | תווית | רמז | note | columns | title | runningHead | footnote | ratio |
|---|---|---|---|---|---|---|---|---|
| `blank` | מסמך ריק | עמוד A4 ריק בעברית | — | 1 | ✗ | ✗ | ✗ | a4 |
| `two-column` | ספר קודש — שני טורים | גוף בשני טורים שווים, עם כותרת רצה | ✓ | 2 | ✗ | ✓ | ✗ | a4 |
| `annotated` | מהדורה מבוארת | פנים הספר, והביאור בהערות שוליים | — | 1 | ✗ | ✓ | ✓ | a4 |
| `title-page` | מסמך עם דף שער | שער נפרד, ואחריו גוף המסמך | — | 1 | ✓ | ✗ | ✗ | a4 |
| `kuntres-a5` | קונטרס A5 | חוברת בגודל A5, עם כותרת רצה | — | 1 | ✗ | ✓ | ✗ | a5 |

`note` של `two-column` הוא בדיוק המחרוזת שהתוכנית קובעת:
**„הטורים מצוירים הפוך בעורך; הקובץ נשמר נכון”**.
(היא קצרה מהמחרוזת של `rtlColumnNote` ב-`page-setup.ts`, ובכוונה: זו הודעה
שמופיעה **אחרי** פעולה, וזו אזהרה שנקראת **לפני**.)

> **חוזה בין שלב 3 לשלב 4.** התצוגה המקדימה מבטיחה מה שהמשתמש יקבל. תבנית שדגל
> `hasRunningHead` שלה `true` **חייבת** לקרוא ל-`ensureHeaderFooter`
> ול-`applyPageNumbering` ב-`applyTemplate`; תבנית עם `hasFootnoteBand` חייבת
> להשאיר את הפנים והביאור באמת בשני זרמים. דגל שאין לו כיסוי בהחלה הוא ציור
> שמשקר, וזה גרוע מציור גנרי.

### 2.5 עיצוב ההערה — למה היא לא אדומה

יש לזה תקדים מדויק במאגר, על מקרה זהה: `.md-note--warn` ב-`MacrosDialog.vue`,
עם ההנמקה הכתובה שם — „צבע הטקסט הרגיל ופס בקצה ההתחלה — לא אדום: אין כאן כשל
ואין מה לתקן, יש עובדה על הקובץ. אדום היה קורא למשתמש לחפש בעיה שאינה קיימת.”

זה בדיוק המצב כאן. הקובץ נשמר נכון; מה שלא נכון הוא **הציור בעורך**, וזה מצב
העולם ולא כשל של המשתמש. לכן: אין `--color-error`, אין `--color-error-subtle`,
אין סמל אזהרה, אין רקע צהוב. יש פס `2px` ב-`--color-outline` בקצה ההתחלה
(בעברית — ימין), ריפוד `6px`, וטקסט ב-`--color-on-surface-variant`.

`text-align: start` על ההערה בתוך כרטיס ממורכז הוא מכוון: הבלוק המיושר לימין
נקרא כהערה ולא כחלק מהכותרת, וזה מה שמפריד אותה מהרמז שמעליה בלי צבע ובלי סמל.

---

## 3. „עיון בקבצים…”

**שורה מלאה בין הרשת לרשימה, ולא כרטיס שישי ולא כפתור בכותרת התחתונה.**

```css
.open-browse {
  display: flex; align-items: center; gap: 10px; width: 100%;
  padding: 10px 12px;
  background: var(--color-surface-container-high);
  border: 1px solid var(--color-outline);
  border-radius: var(--radius-md);
  color: var(--color-on-surface);
  font-family: var(--font-main);
  font-size: inherit;
  text-align: start;
  cursor: pointer;
  transition: background-color 0.08s ease, border-color 0.08s ease;
}
```

תוכן, בסדר ה-DOM: `SvgIcon name="folder" :size="18"` בצבע `--word-blue`; תווית
„עיון בקבצים…” במשקל 600; `.open-browse__hint` („בחר קובץ Word מהמחשב”) ב-`0.88em`
וב-`--color-on-surface-variant` עם `flex: 1 1 auto`; ובקצה
`SvgIcon name="chevronLeft" :size="16"` ב-`--color-on-surface-variant`.

`chevronLeft` ולא `chevronRight` — בממשק RTL הכיוון „קדימה” הוא שמאלה. זה לא
טעם: `nextTabIndex` ב-`ui/ribbon/aria.ts` קובע את אותו דבר בדיוק ל-`ArrowLeft`,
וכל הרצועה כבר בנויה עליו. שני האייקונים כבר בסט.

מצבים: hover `--word-btn-active` + גבול `--color-primary`; לחיצה
`--word-btn-active-hover`; מיקוד — הטבעת הגלובלית; `busy` — `disabled`.

**המשקל החזותי, ולמה כאן.** השורה כבדה יותר משורת „אחרון” (גבול מלא, רקע
container-high, אייקון בצבע הנושא) וקלה יותר מכפתור ממולא. היא גם מפרידה חזותית
בין שני חצאי המסך, ולכן היא במקום הזה ולא במקום אחר:

* **כרטיס שישי** היה מכניס „פתיחת קובץ קיים” לתוך „יצירת מסמך חדש”, ומעמיד את
  הכרטיס היחיד בלי תצוגת דף בשורה של חמישה עם תצוגה. הוא היה נראה שבור.
* **כפתור בכותרת התחתונה, ליד „סגור”** היה מדרג אותו מתחת לרשימת האחרונים —
  בדיוק הפוך למי שהגיע לכאן כי הקובץ שלו **אינו** ברשימה.

---

## 4. אנטומיית שורת „אחרון”

### 4.1 האזור

```html
<section class="rec-section" :aria-labelledby="REC_TITLE_ID">
  <div class="rec-head">
    <h3 class="rec-title" :id="REC_TITLE_ID">מסמכים אחרונים</h3>
    <p class="rec-count" role="status" aria-live="polite">{{ countText }}</p>
    <div class="rec-search"> … </div>
  </div>
  <ul class="rec-list" :aria-labelledby="REC_TITLE_ID"> … </ul>
</section>
```

```css
.rec-section { display: flex; flex-direction: column; gap: 8px;
               flex: 1 1 auto; min-height: 0; }
.rec-head    { display: flex; align-items: center; gap: 10px; }
.rec-title   { margin: 0; font-size: 0.92em; font-weight: 700;
               color: var(--color-primary); }         /* כמו .shortcuts-group-title */
.rec-count   { margin: 0; font-size: 0.88em; color: var(--color-on-surface-variant); }
.rec-search  { margin-inline-start: auto; position: relative;
               display: flex; align-items: center; width: min(260px, 45%); }
```

`countText`: `„12 מסמכים”` ללא סינון, `„3 מתוך 12”` עם סינון, ריק כשהרשימה ריקה.

### 4.2 תיבת החיפוש

```css
.rec-search__input {
  width: 100%;
  padding-block: 4px;
  padding-inline: 26px 24px;          /* אייקון בהתחלה, כפתור ניקוי בסוף */
  border: 1px solid var(--color-outline);
  border-radius: var(--radius-xs);
  background: var(--color-surface);
  color: var(--color-on-surface);
  font-family: var(--font-main);
  font-size: inherit;
  outline: none;
}
.rec-search__input:focus { border-color: var(--word-blue);
                           box-shadow: 0 0 0 1px var(--word-blue); }
.rec-search__icon  { position: absolute; inset-inline-start: 6px; pointer-events: none;
                     color: var(--color-on-surface-variant); }   /* SvgIcon name="search" :size="14" */
.rec-search__clear { position: absolute; inset-inline-end: 2px;  /* 20×20, ✕ */ }
```

זה בדיוק תבנית ה-input של `.fr-input` ו-`.md-input`, עם `--color-outline` במקום
`outline-variant` (עובדה 3).

**`type="text"` ולא `type="search"`.** שתי סיבות, והראשונה מספיקה: אנחנו מציירים
את אייקון החיפוש ואת כפתור הניקוי בעצמנו, ולפקד המובנה אין דרך להתאים אותם
לשפה. השנייה — לכרום התנהגות Escape משלו ב-`input[type=search]` (ניקוי השדה),
ו-Escape כאן חייב להגיע למודאל. **לא מדדתי את התנהגות כרום כאן**, וזו בדיוק
הסיבה לא להישען עליה.

**Escape תמיד סוגר.** לא „מנקה קודם ואז סוגר”. ארבעת הדיאלוגים במאגר סוגרים
ב-Escape, וגם המטפל הגלובלי ב-`App.vue`; מודאל שבו Escape עושה שני דברים שונים
לפי מיקום המיקוד הוא מה שמדווח אחר כך כ„Escape הפסיק לעבוד”. הניקוי הוא כפתור
ה-✕ שבתוך השדה, והוא מופיע רק כש-`searchQuery !== ''`.

תיבת החיפוש **אינה מוצגת כלל** כש-`recents.length === 0` — פקד סינון על רשימה
ריקה אינו יכול לעשות דבר.

### 4.3 הרשימה והשורה

```css
.rec-list {
  list-style: none; margin: 0; padding: 0;
  flex: 1 1 auto; min-height: 96px; overflow-y: auto;
  border: 1px solid var(--color-outline);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  direction: ltr;                     /* ראו למטה — פס הגלילה בלבד */
}

.rec-row {
  direction: rtl;
  display: flex; align-items: center; gap: 8px;
  padding-block: 4px;
  padding-inline: 10px 4px;
  transition: background-color 0.08s ease;
}
.rec-row:hover,
.rec-row:focus-within        { background: var(--word-btn-hover); }
.rec-row--last-pinned        { border-block-end: 1px solid var(--color-outline); }
```

**`direction: ltr` על הרשימה ו-`rtl` על השורה — וזה רק על פס הגלילה.** הצד שבו
הדפדפן מצייר פס גלילה אנכי נגזר מכיווניות מיכל הגלילה ואין לו מאפיין נפרד. בעברית
ב-Word פס הגלילה של רשימה יושב מימין, ומיכל שיורש `rtl` מ-`<html dir="rtl">` מקבל
אותו משמאל. זה בדיוק הטריק ש-`shell.css` מתעד על `.editor-stack__host`, כאן על
רשימה במקום על מסמך. **תנאי:** לכל ילד ישיר של `.rec-list` חייב להיות
`direction: rtl` (כלומר כל `<li>` הוא `.rec-row`), ו-`.rec-list` עצמו נושא רק
ריפוד, גבול ורדיוס אחידים — כל `padding-inline` או `border-inline` אסימטרי עליו
יתפרש הפוך. אם הטריק אי-פעם מסתבך, מחיקת שתי הצהרות ה-`direction` מחזירה את
התנהגות ברירת המחדל ולא שוברת דבר אחר.

**אין קו בין שורה לשורה.** הקו היחיד ברשימה הוא זה שמתחת לשורה המוצמדת האחרונה,
וגם הוא רק כששתי הקבוצות אינן ריקות. עשרים קווים הופכים רשימה למחברת משבצות; קו
אחד אומר משהו. (התקדים: `.md-list` ב-`MacrosDialog` מפריד ב-`gap: 1px` בלבד.)

**תוכן השורה, בסדר ה-DOM:**

```html
<li class="rec-row" :class="{ 'rec-row--last-pinned': isLastPinned }">
  <button class="rec-open" :aria-label="openLabel" :data-tip-title="item.name"
          :tabindex="rowTabIndex" :disabled="busy"
          @click="$emit('open-recent', item.token)">
    <span class="rec-name">{{ item.name }}</span>
    <span v-if="metaText" class="rec-meta">{{ metaText }}</span>
  </button>
  <span class="rec-actions">
    <button class="rec-iconbtn rec-pin" :aria-pressed="item.pinned" … >
      <SvgIcon name="bookmark" :size="15" />
    </button>
    <button class="rec-iconbtn rec-forget" … >
      <SvgIcon name="reject" :size="15" />
    </button>
  </span>
</li>
```

```css
.rec-open  { flex: 1 1 auto; min-width: 0;
             display: flex; align-items: baseline; gap: 8px;
             background: none; border: 0; padding: 0;
             font: inherit; text-align: start; color: var(--color-on-surface);
             border-radius: var(--radius-xs); cursor: pointer; }
.rec-open:active:not(:disabled) { background: var(--word-btn-active); }
.rec-name  { flex: 1 1 auto; min-width: 0; font-weight: 500;
             overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rec-meta  { flex: 0 0 auto; font-size: 0.88em; white-space: nowrap;
             color: var(--color-on-surface-variant); }
.rec-actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
```

**גובה השורה 32px בשני קצות הסולם**, כי הוא נקבע מכפתורי הפעולה (24px) ולא
מהטקסט: `4 + 24 + 4`. בשורש 16px שורת השם היא `1.3 × 16 = 20.8px` ועדיין נכנסת
ב-24. לכן עשרים שורות = 640px, וזו הסיבה שהרשימה גוללת.

### 4.4 כפתורי ההצמדה וההסרה

```css
.rec-iconbtn {
  width: 24px; height: 24px; padding: 0;
  display: flex; align-items: center; justify-content: center;
  background: none; border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--color-on-surface-variant);
  cursor: pointer;
}
.rec-iconbtn:hover:not(:disabled) { background: var(--word-btn-hover);
                                    color: var(--color-on-surface); }
.rec-pin[aria-pressed='true']     { color: var(--word-blue); }
.rec-forget:hover:not(:disabled)  { color: var(--color-error); }
```

**הם לעולם אינם מוסתרים.** אין `opacity: 0` ואין `visibility: hidden` שנפתחים
ב-hover — לא רק מפני שזה הופך אותם לעכבר-בלבד, אלא מפני שהחלופה הנפוצה השנייה
(אטימות נמוכה במנוחה) שוברת את יחס הניגוד של WCAG לפקדים לא-טקסטואליים.
במנוחה הם ב-`--color-on-surface-variant` במלוא העוצמה; ה-hover של השורה מוסיף
להם רקע, וה-hover של הכפתור עצמו מוסיף לו רקע משלו.

**24×24 ולא 14×14.** 24×24 הוא המינימום של WCAG 2.2 („Target Size (Minimum)”).
`.word-doctab-close` ב-`DocumentTabsBar.vue` הוא 14×14 — זה חוב קיים, ואין להעתיק
אותו לקוד חדש.

**מצב מוצמד:** `aria-pressed="true"` + צבע `--word-blue` + המיקום בראש הרשימה.
זהו. אין גליף שני, מפני שאין גליף שני בסט. `bookmark` הוא מה שכבר קיים
ב-`icons.ts`; `pin` של Fluent היה דורש רישום ב-`THIRD_PARTY_NOTICES.md` תחת
`npm run check:icons`, וציור נעץ משלנו ב-15px היה מעמיד גליף שאינו בגריד 20 של
Fluent ליד `reject` שכן. המשמעות של `bookmark` — „שמור את זה בהישג יד” — היא
המשמעות הנדרשת.

**להסרה `reject`** (`dismiss_circle` אצל Microsoft), ולא הגליף `✕` שבו משתמשות
כותרות הדיאלוגים: גליף טקסט וגליף Fluent באותם 15px אינם באותו משקל קו, ובשורה
אחת ההבדל נראה.

טולטיפים (`data-tip-title`): „הצמד לראש הרשימה” / „בטל הצמדה”, ו„הסר מהרשימה”.
שמות נגישים — ראו §7.

### 4.5 השורה השנייה של המידע

`metaText` נבנה בקומפוננטה משני חלקים, ושניהם עשויים להיעדר:

* **גיל** — `draftAgeLabel(item.openedAt, Date.now())` מ-`sessions/session-state.ts`,
  בדיוק אותה פונקציה ואותן מחרוזות („לפני שעתיים”). היא מחזירה `null` על
  `openedAt <= 0`, וב-`recent-documents.ts` מתועד ש-`0 = לא ידוע`. אז אין גיל.
* **גודל** — פונקציה טהורה מקומית בקומפוננטה:
  `0` (או פחות) → אין מחרוזת; `< 1024` → „‎N בייט”; `< 1048576` → „‎N ק״ב”
  (`toFixed(0)`); אחרת „‎N.N מ״ב” (`toFixed(1)`). `size: 0 = לא דווח` הוא חוזה
  מפורש ב-`RecentDocument`, וכתיבת „0 בייט” הייתה הופכת „לא ידוע” ל„ריק”.

שני החלקים מחוברים ב-`<span aria-hidden="true"> · </span>`; הנקודה מוסתרת מקורא
מסך מפני שהשם הנגיש (§7) כבר מפריד בפסיקים. אם שניהם חסרים — `.rec-meta` אינו
מרונדר כלל, והשם תופס את כל השורה.

---

## 5. הגיאומטריה המדויקת של חמש התצוגות המקדימות

זהו הלב החזותי של המסך, ולכן הוא מפורט עד המילימטר.

### 5.1 מרחב הקואורדינטות

```
viewBox="-2 -2 214 301"
```

**היחידה היא מילימטר של A4 אמיתי.** הגיליון הוא `rect(0, 0, 210, 297)`, וכל מספר
בהמשך הוא מידה אמיתית של דף — לא „יחידות ציור”. שני מ״מ אוויר סביב ה-viewBox כדי
שקו מסגרת בעובי פיקסל לא ייחתך בקצה.

המקורות של המספרים, כולם מהמאגר:

| מידה | ערך | מקור |
|---|---|---|
| A4 | 11906 × 16838 twips = 210 × 297 מ״מ | `PAPER_SIZES` ב-`page-setup.ts` |
| שוליים „רגיל” | 1440 twips = 25.4 מ״מ | `MARGIN_PRESETS` שם |
| רווח בין טורים | 720 twips = 12.7 מ״מ | `COLUMN_GAP_TWIPS` שם |
| מרחק כותרת עליונה | `w:header="720"` = 12.7 מ״מ | הערת ראש `page-setup.ts` |
| A5 | 148 × 210 מ״מ | תקן ISO |

נגזרות: תיבת הטקסט `x: 25.4 → 184.6` (רוחב **159.2**), `y: 25.4 → 271.6` (גובה
**246.2**). רוחב טור בשני טורים `(159.2 − 12.7) / 2 = ` **73.25**.

### 5.2 גודל הרינדור, ולמה הוא קובע כל עובי כאן

ה-`<svg>` מקבל `height: 6.5em` ו-`aspect-ratio: 214 / 301`:

| שורש | גובה svg | רוחב svg | פיקסל/מ״מ |
|---|---|---|---|
| 12px | 78px | 55.4px | 0.263 |
| 16px | 104px | 73.9px | 0.350 |

זה מה שקובע את שלושת הכללים הבאים, ואי-אפשר לשנות אחד בלי לחשב מחדש:

**1. כל קו הוא `stroke` עם `vector-effect="non-scaling-stroke"`, לעולם לא `rect`
דק.** ב-0.263 פיקסל/מ״מ, קו של חצי מילימטר הוא 0.13px — הדפדפן צובע אותו אפור
בהיר או לא צובע כלל. `non-scaling-stroke` מקבע את העובי בפיקסלים של המכשיר
ומנתק אותו מה-viewBox, ולכן מסגרת הגיליון היא בדיוק 1px בשני קצות הסולם — וגם
בתוך ה-`scale()` של A5.

**2. כל מסה היא `rect` מלא בעובי של 5 מ״מ לפחות.** 5 מ״מ = 1.31px בקצה הקטן.
מתחת לזה השילוב עם `opacity` נעלם.

**3. אין `border-radius` בציור.** `rx="2"` היה 0.53px — פחות מפיקסל. דף נייר
פינותיו ישרות ממילא, ולכן טוקני `--radius-*` אינם משמשים בתוך ה-SVG.

### 5.3 הצביעה

```css
.pv-sheet       { fill: var(--color-surface); stroke: var(--color-outline);
                  stroke-width: 1; vector-effect: non-scaling-stroke; }
.pv-rule        { stroke: var(--color-outline); stroke-width: 1;
                  vector-effect: non-scaling-stroke; fill: none; }
.pv-ink         { fill: var(--color-on-surface-variant); opacity: 0.42; }
.pv-ink--strong { opacity: 0.75; }
```

**הגיליון הוא `--color-surface` על כרטיס שהוא `--color-surface-container-high`.**
זו החלטה מול תפקידים ולא מול גוונים: במצב בהיר `surface` בהיר יותר מ-`container-high`
(הדף בהיר מהשולחן), ובמצב כהה של M3 היחס מתהפך (`surface` הוא הכהה מכולם). **בשני
המצבים הקצה נשמר על ידי ה-`stroke`, וזו כל הסיבה שלגיליון יש מסגרת.** עיצוב
שהיה מבטיח „דף לבן” היה נשבר בדיוק כאן.

שתי דרגות דיו ולא שלוש: 0.42 לכל מה שהוא טקסט גוף, כותרת רצה, מספר עמוד והערות
שוליים, ו-0.75 לגושי הכותרת בלבד. דרגה שלישית „חיוורת” נוסתה על החשבון ונפלה —
4 מ״מ ב-0.30 הם 1.05px בשקיפות 30%, כלומר כלום. **מה שמבדיל את הכותרת הרצה
מהגוף אינו הבהירות אלא המיקום (מעל קו השוליים) והאורך (45%).**

`opacity` אינו צבע, ולכן הוא עובר את סורק הצבע הקשיח; כל `fill` ו-`stroke` כאן
הם `var(--color-*)`.

### 5.4 הצורות

**מסגרת (בכל חמש):** `<rect class="pv-sheet" x="0" y="0" width="210" height="297"/>`

**קצב שורות הגוף** — `pitch = 19`, `thickness = 7`. השורה ה-`i` יושבת ב-
`y = bodyTop + 19i`, ומופקת כל עוד `y + 7 <= bodyBottom`.

| | `bodyTop` | `bodyBottom` | שורות | y אחרונה |
|---|---|---|---|---|
| בלי כותרת ובלי הערות | 25.4 | 271.6 | **13** | 253.4 |
| עם רצועת הערות שוליים | 25.4 | 219 | **10** | 196.4 |
| עם גוש כותרת | 100 | 271.6 | **9** | 252 |

**טור אחד:** `x = 25.4`, `width = 159.2`.
**השורה האחרונה קצרה** — `width = 95.5` (60%), `x = 89.1`. היא **נצמדת לקצה
הימני**, כלומר הקצה המשונן נופל בשמאל. זה מה שהופך את הציור לדף **עברי**: בשני
טורים שווי-רוחב אין שום דבר אחר שמבדיל RTL מ-LTR.

**שני טורים:** אותן 13 שורות בשני הטורים.
טור ראשון (התחלה = ימין): `x = 111.35`, `width = 73.25`.
טור שני (סוף = שמאל): `x = 25.4`, `width = 73.25`.
השורה האחרונה **של הטור השני בלבד** קצרה: `width = 44`, `x = 54.65`.
הטור הראשון מלא עד הסוף, כי הטקסט ממשיך ממנו לשני. **אין קו מפריד בין הטורים** —
`applyColumns` כותב `w:cols` בלי `w:sep`, וקו שאינו בקובץ אין לצייר.

**כותרת רצה** (`hasRunningHead`):
```
<rect class="pv-ink" x="113.0" y="12.7" width="71.6" height="5"/>   ← הכותרת, נצמדת לימין
<rect class="pv-ink" x="25.4"  y="12.7" width="8"    height="5"/>   ← מספר העמוד, בשמאל
```
`y = 12.7` הוא `w:header="720"` בדיוק. הרוחב 71.6 הוא 45% מ-159.2. מספר העמוד
בקצה השמאלי מפני שבכותרת RTL עם עצירת טאב ימנית הוא נוחת בסוף השורה — והוא גם מה
שמונע מהפס לבדו להיקרא ככותרת ראשית.

**גוש כותרת** (`hasTitleBlock`):
```
<rect class="pv-ink pv-ink--strong" x="50" y="55" width="110" height="11"/>
<rect class="pv-ink pv-ink--strong" x="74" y="72" width="62"  height="6"/>
<line class="pv-rule" x1="68" y1="88" x2="142" y2="88"/>
```
ממורכזים (`(210−110)/2 = 50`, `(210−62)/2 = 74`), ועבים מהגוף (11 ו-6 מול 7) —
כותרת היא טקסט **גדול** יותר, ולכן היא כתם עבה ולא כתם כהה בלבד. הגוף מתחיל
ב-`y = 100`, 12 מ״מ מתחת לקו.

**רצועת הערות שוליים** (`hasFootnoteBand`):
```
<line class="pv-rule" x1="184.6" y1="228" x2="131.5" y2="228"/>
<rect class="pv-ink" x="25.4" y="235" width="159.2" height="5"/>
<rect class="pv-ink" x="25.4" y="247" width="159.2" height="5"/>
<rect class="pv-ink" x="97.0" y="259" width="87.6"  height="5"/>
```
הקו באורך `159.2 / 3 = 53.1` **מקצה ההתחלה** (ימין) — כך Word מצייר את מפריד
הערות השוליים, וב-RTL הוא בימין. שלוש שורות בעובי 5 (מול 7 בגוף) ובקצב 12 (מול
19): הערות שוליים הן טקסט קטן וצפוף, ולכן צפוף ודק, לא בהיר. השורה האחרונה קצרה
(55%) ונצמדת לימין. השורה התחתונה מסתיימת ב-264, כלומר 7.6 מ״מ מעל קו השוליים.

**A5** — כל הקבוצה נעטפת:
```html
<g transform="translate(31 43.8) scale(0.704762)"> … </g>
```
`0.704762 = 148 / 210`. `31 = (210 − 148) / 2`; `43.8 = (297 − 297×0.704762) / 2`.

**ההודאה בשגיאה, מחושבת:** A4 ו-A5 אינם דומים לחלוטין (יחסים 0.70707 ו-0.70476),
ולכן קנה מידה אחיד נותן גיליון של 148 × **209.31** במקום 148 × 210. השגיאה 0.69
מ״מ, ובקצה העליון של הסולם (0.350 פיקסל/מ״מ) היא **0.24 פיקסל** — מתחת לפיקסל
אחד. לכן טרנספורם אחד ולא ציור שני, וכל מספר בסעיף הזה נכתב פעם אחת.

הטרנספורם אינו נוגע בעובי הקווים: `non-scaling-stroke` מגדיר את העובי בפיקסלים
של הפלט, ולכן מסגרת ה-A5 יוצאת 1px בדיוק כמו של ה-A4.

**מה הקנה מידה כן אומר ומה לא:** הוא אומר „גיליון קטן יותר”. הוא **אינו** טוען
שהשוליים בקונטרס הם 25.4 מ״מ מוקטנים — אם `applyTemplate` יבחר שוליים צרים
ל-A5, הציור לא ישקר מפני שהוא אינו מצהיר על מספרים, אלא על פרופורציה.

### 5.5 ספירה, לשימוש הבדיקה

| תבנית | `<rect>` | `<line>` | `<g transform>` |
|---|---|---|---|
| `blank` | 1 + 13 = **14** | 0 | 0 |
| `two-column` | 1 + 2 + 26 = **29** | 0 | 0 |
| `annotated` | 1 + 2 + 10 + 3 = **16** | 1 | 0 |
| `title-page` | 1 + 2 + 9 = **12** | 1 | 0 |
| `kuntres-a5` | 1 + 2 + 13 = **16** | 0 | 1 |

### 5.6 „ריק” גם הוא מצויר עם שורות

חמש התבניות מייצרות **מסמך ריק** — גם „מהדורה מבוארת” נפתחת בלי מילה. הציור אינו
מראה את מצב הקובץ בשנייה הראשונה אלא **את הפריסה שהמשתמש יקבל כשיכתוב**, וזו
הסיבה היחידה שיש בו שורות בכלל. לכן „מסמך ריק” מקבל את אותן 13 שורות בטור אחד:
הוא נבדל מהאחרים בכך שאין בו **שום דבר נוסף**, וזה קריא. חריגה עבורו (גיליון
לבן לגמרי) הייתה דורשת מהמצייר predicate שנגזר מארבעה שדות במקום לקרוא אותם —
ומחיר שקוף כזה עדיף על „חוץ מהראשון”.

### 5.7 שני איסורים על ה-SVG

`aria-hidden="true"` ו-`focusable="false"`, ובלי `<title>` בפנים. הכרטיס כבר נושא
שם נגיש; `<title>` בתוך SVG יוצר שם שני **וגם** טולטיפ מובנה של הדפדפן — בדיוק
המלבן האפור ש-`tooltip-content.ts` מתעד שסולק מהתוכנה.

---

## 6. טיפוגרפיה ומרווחים

### 6.1 סולם הגופן

הכול `em` יחסית לשורש הדיאלוג (`font-size: var(--font-size-ui)`), ולא px. הסיבה
בעובדה 1: השורש נע בין 12 ל-16, ומידה קבועה הייתה קטנה מהגוף בקצה העליון.

| תפקיד | גודל | 12px | 16px | משקל | צבע |
|---|---|---|---|---|---|
| כותרת הדיאלוג | 1.08em | 12.96 | 17.28 | 600 | `--color-on-surface` |
| כותרת אזור (`h3`) | 0.92em | 11.04 | 14.72 | 700 | `--color-primary` |
| תווית כרטיס | 1em | 12 | 16 | 600 | `--color-on-surface` |
| רמז כרטיס | 0.88em | 10.56 | 14.08 | 400 | `--color-on-surface-variant` |
| הערת אזהרה | 0.88em | 10.56 | 14.08 | 400 | `--color-on-surface-variant` |
| „עיון בקבצים…” | 1em | 12 | 16 | 600 | `--color-on-surface` |
| רמז „עיון” | 0.88em | 10.56 | 14.08 | 400 | `--color-on-surface-variant` |
| שם קובץ | 1em | 12 | 16 | 500 | `--color-on-surface` |
| גיל + גודל | 0.88em | 10.56 | 14.08 | 400 | `--color-on-surface-variant` |
| מונה / מצב | 0.88em | 10.56 | 14.08 | 400 | `--color-on-surface-variant` |
| כפתור הכותרת התחתונה | 1em | 12 | 16 | 400 | `--color-on-surface` |

`font-family: var(--font-main)` על שורש הדיאלוג ועל כל `button`, `input` — הכלל
הגלובלי `button` ב-`shell.css` כבר עושה זאת ומסביר למה `inherit` אינו מספיק
(ולידציית העיצוב דורשת `var(--font-*)` ואין לה חריג למילות מפתח).

**כותרת האזור ב-`--color-primary`** ולא ב-`on-surface-variant`: זה בדיוק מה
ש-`.shortcuts-group-title` עושה, וכאן זו גם ההפרדה היחידה בין שני חצאי המסך.

`line-height` מפורש היכן שהוא נדרש — 1.25 לתוויות, 1.3 לרמזים, 1.35 להערה. ערכים
קטנים מ-`--line-height` המורש בכוונה: אלה שורות קצרות בכרטיס צר, והריווח של גוף
טקסט הופך אותן לרופפות.

### 6.2 סולם המרווחים

מבוסס-4, בדיוק כמו כל שאר המאגר (2/4/6/8/12/16):

| ערך | היכן |
|---|---|
| 2 | בין שני כפתורי האייקון בשורה |
| 4 | תווית ← רמז בכרטיס; ריפוד אנכי בשורה; ריפוד אנכי בתיבת החיפוש |
| 6 | ריפוד ההערה מהפס שלה |
| 8 | גיליון ← תווית; רמז ← הערה; שם ← מטא בשורה; כותרת אזור ← רשימה |
| 10 | ריפוד אופקי של הכרטיס; ריפוד ההתחלה של השורה; gap ב„עיון בקבצים…” |
| 12 | מרווח רשת הכרטיסים; ריפוד אנכי של הכותרת והכותרת התחתונה |
| 16 | ריפוד אופקי של הכותרות; ריפוד `.open-body`; מרווח בין שלושת אזורי הגוף |

הריפוד התחתון של הכרטיס הוא 14 ולא 12 — התווית והרמז ממורכזים, והמרווח האופטי
מתחת לטקסט צריך להיות גדול במעט מזה שמעל הגיליון.

---

## 7. נגישות

### 7.1 המבנה

```html
<div class="modal-backdrop" @click.self="$emit('close')">
  <div ref="dialogRef" class="open-dialog"
       role="dialog" aria-modal="true"
       :aria-labelledby="TITLE_ID" :aria-busy="busy"
       tabindex="-1"
       @keydown.esc.stop="$emit('close')"
       @keydown.tab="onTab">
```

זו מילה במילה המעטפת של `AboutDialog` — כולל `tabindex="-1"`, `@keydown.esc.stop`
ו-`onTab`. הנימוק כתוב שם ותקף כאן: `aria-modal="true"` הוא הצהרה שכל מה שמאחור
אינו קיים, ובלי מלכודת מיקוד ההצהרה שקרית.

* כותרת: `<span :id="TITLE_ID">פתח מסמך</span>` + `SvgIcon name="folder" :size="20"`
  ב-`--word-blue`, וכפתור `✕` עם `aria-label="סגור את חלון פתיחת המסמך"`
  ו-`data-tip-shortcut="Esc"`.
* אזור עליון: `<section :aria-labelledby="TPL_TITLE_ID">` ← `<h3 :id="TPL_TITLE_ID">מסמך חדש</h3>`
  ← `<div role="toolbar" aria-orientation="horizontal" :aria-labelledby="TPL_TITLE_ID">`
  עם חמשת הכרטיסים. ה-`h3` **מחוץ** ל-toolbar.
* אזור תחתון: `<section :aria-labelledby="REC_TITLE_ID">` כמו ב-§4.1.
* כותרת תחתונה: `<p class="open-status" role="status" aria-live="polite">` בקצה
  ההתחלה, וכפתור „סגור” בקצה הסיום.

### 7.2 שמות נגישים בעברית

| פקד | שם |
|---|---|
| הדיאלוג | „פתח מסמך” (מ-`aria-labelledby`) |
| ✕ בכותרת | „סגור את חלון פתיחת המסמך” |
| כרטיס תבנית | התווית בלבד; הרמז וההערה כ-`aria-describedby` |
| רצועת הכרטיסים | „מסמך חדש” (מכותרת האזור) |
| „עיון בקבצים…” | הטקסט הנראה, בלי `aria-label` — הוא כבר שם טוב |
| תיבת החיפוש | „סינון מסמכים אחרונים לפי שם” |
| ניקוי החיפוש | „נקה את הסינון” |
| הרשימה | „מסמכים אחרונים” (מכותרת האזור) |
| פתיחת שורה | `` `${name}, ${age}, ${size}, מוצמד` `` — הרכיבים החסרים נשמטים עם הפסיק שלהם |
| הצמדה | „הצמד את {name} לראש הרשימה” / „בטל הצמדה של {name}” + `aria-pressed` |
| הסרה | „הסר את {name} מרשימת האחרונים” |
| „סגור” בתחתית | הטקסט הנראה |

השם של שורת הפתיחה **מתחיל בשם הקובץ הנראה** — זו דרישת WCAG 2.5.3 („Label in
Name”), והיא גם מה שמאפשר פקודת קול. „מוצמד” בסוף השם הוא מה שמחליף את כותרת
הקבוצה החזותית שוויתרתי עליה (§9).

### 7.3 סדר Tab

לפי סדר ה-DOM, עם מלכודת שסוגרת מ„סגור” חזרה ל-`✕`:

1. `✕` בכותרת
2. **הכרטיס הפעיל** ברצועה (roving tabindex — עצירה אחת, לא חמש)
3. „עיון בקבצים…”
4. תיבת החיפוש (רק כשיש אחרונים)
5. כפתור ניקוי החיפוש (רק כש-`searchQuery !== ''`)
6. **השורה הפעילה** ברשימה: פתיחה ← הצמדה ← הסרה (שלוש עצירות, לא 60)
7. „סגור” בכותרת התחתונה

`focusables()` של `AboutDialog` — הסלקטור
`'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'` —
מדלג מעצמו על כל מה שנושא `tabindex="-1"`, ולכן מלכודת המיקוד עובדת עם ה-roving
בלי שינוי.

### 7.4 חיצים ברצועת הכרטיסים

`ArrowLeft` מתקדם, `ArrowRight` חוזר, `Home`/`End` לקצוות, עטיפה מסוף לתחילה —
כלומר **בדיוק `nextTabIndex(key, current, count, 'rtl')`** מ-`ui/ribbon/aria.ts`,
בלי לכתוב לוגיקה חדשה. אותה פונקציה כבר נבדקת ב-`tests/unit/ribbon-aria.test.ts`,
ואותו קוד כבר מניע את `DocumentTabsBar`.

**`ArrowUp`/`ArrowDown` אינם מקושרים, בכוונה.** מספר השורות החזותיות משתנה עם
רוחב החלון (5 / 4 / 3 / 2 / 1 — §1.3), ולכן „למטה” היה מזיז שני כרטיסים בחלון
אחד וארבעה באחר; חמישה פריטים נגישים ממילא בלחיצת חץ אחת או שתיים. ראו §9 על
החלופה שנפסלה.

### 7.5 חיצים ברשימה

roving tabindex על השורות: בכל רגע לשורה אחת בלבד יש `tabindex="0"` על שלושת
כפתוריה, ולשאר `-1`. `ArrowDown`/`ArrowUp` מזיזים שורה וממקדים **את אותו כפתור**
בשורה החדשה; `Home`/`End` לשורה הראשונה/האחרונה. Tab עובר בתוך השורה הפעילה
ואז יוצא מהרשימה.

בלי זה, רשימה של עשרים שורות היא 60 עצירות Tab בין תיבת החיפוש לכפתור „סגור”.
לא נבחר `role="grid"` — ראו §9.

### 7.6 מיקוד בפתיחה ובסגירה

**בפתיחה: הכרטיס הראשון („מסמך ריק”).** אותו `watch(() => props.isOpen)` של
`AboutDialog`, עם `nextTick` ועם נפילה ל-`dialogRef` אם ה-ref עדיין ריק.
הנימוק: החוזה ב-props אינו כולל „מאיזו כוונה נפתחתי” (Ctrl+N מול Ctrl+O), ולכן
יש כלל אחד לשני המסלולים. כרטיס ממוקד נותן Enter מיידי לפעולה הנפוצה, והחיצים
מזיזים ממנו לכל השאר. מיקוד בתיבת החיפוש היה מכשיל את Enter וכולא את החיצים בשדה
טקסט.

**בסגירה: חזרה למי שפתח.** אותה שמירה של `document.activeElement` ואותה בדיקת
`document.contains(target)` לפני ההחזרה — ההערה ב-`AboutDialog` מסבירה למה
(„הרצועה היא mount on active, ולשונית שהתחלפה לקחה איתה את הכפתור שנלחץ”), וזה
תקף כאן במלואו.

**Escape, ✕ ולחיצה על הרקע עובדים גם ב-`busy`.** כל שאר הפקדים מנוטרלים, אבל
מודאל שאי-אפשר לצאת ממנו גרוע מפתיחה שמסתיימת ברקע. הדיאלוג הוא תצוגה בלבד; מה
לעשות עם פעולה שבדרך הוא עניינו של `App.vue`.

---

## 8. תנועה

**אין אנימציית כניסה ואין אנימציית יציאה.** כפי שנמדד בעובדה 5, במאגר יש שלוש
אנימציות — ואף אחת מהן אינה בדיאלוג. ארבעת המודאלים מופיעים מיד, ודיאלוג חמישי
שנכנס בהנפשה היה הדבר היחיד בתוכנה שמתנהג אחרת.

**מה כן זז:** מעברי רקע וגבול על פקדים, בערך של הרצועה:

```css
transition: background-color 0.08s ease, border-color 0.08s ease;
```

על `.tpl-card`, `.open-browse`, `.rec-row`, `.rec-iconbtn`, ועל תיבת החיפוש
`transition: border-color 0.1s, box-shadow 0.1s` (הערך של `.search-box` ב-`TitleBar`).

`background-color` ולא `background`: הקיצור כולל גם `background-image`, ואין כאן
כזה.

**אין פס התקדמות ואין ספינר ב-`busy`.** האפרוריות של כל הרשת בבת אחת היא סימן
חזק דיו, והשורה „פותח מסמך…” ב-`role="status"` מכריזה אותו לקורא מסך. אלמנט
מסתובב היה הפיקסל הזז היחיד במסך.

```css
@media (prefers-reduced-motion: reduce) {
  .tpl-card, .open-browse, .rec-row, .rec-iconbtn, .rec-search__input {
    transition: none;
  }
}
```

הבלוק הזה נדרש גם כשהתנועה קצרה: זו התבנית של `ContextMenu.vue` ו-`StatusBar.vue`,
ומשתמש שביקש „בלי תנועה” ביקש בלי תנועה.

**גלילה מיידית.** `scroll-behavior` אינו מוגדר בשום מקום במאגר, ואינו מוגדר כאן.
כשניווט המקלדת מזיז שורה מחוץ לתחום הנראה — `element.scrollIntoView({ block: 'nearest' })`,
בלי `behavior: 'smooth'`.

---

## 9. מה נדחה, ולמה

**1. שני גיליונות חופפים ל„מסמך עם דף שער”.**
זה היה מצייר בדיוק את מה שהתבנית עושה — שער נפרד ואחריו גוף. חושב ונפל על גודל:
כדי ששני גיליונות ייקראו כשניים ולא כקו כפול, ההיסט צריך להיות כ-6px, שהם 17
מ״מ במרחב הציור; ברוחב גיליון של 55.4px (§5.2) זה 31% מהרוחב, כלומר הגיליון
הקדמי היה חייב להצטמק וכל שאר הגיאומטריה איתו. גוש כותרת + קו + גוף אומר את אותו
דבר בגיליון אחד, והמילים „מסמך עם דף שער” כבר כתובות מתחת.

**2. גיליון לבן קבוע.**
נראה נכון („דף נייר לבן”) ונפסל: `applyTheme` דורס את הטוקנים ממצב כהה, וכל צבע
שאינו זז איתם נשאר על הרקע הלא נכון — זה מתועד ב-`host/theme.ts` ונאכף
ב-`css-hygiene.test.ts` (שם `#ffffff` היה אחד משלושת הצבעים הקשיחים שנמדדו
בפועל). הציור הוא **דיאגרמת פריסה**, לא רינדור WYSIWYG של הדף, ולכן הוא לוקח את
המשטח של הערכה ונשען על ה-`stroke` כדי שהקצה ייראה בשני המצבים.

**3. `--color-primary` בתוך התצוגה המקדימה, לסימון „מה התבנית מוסיפה”.**
זה היה הופך כל כרטיס לקריא בהצצה. שני כשלים: הוא היה צובע חצי מהטקסט בכחול
בכרטיס שני הטורים (הטור **הוא** התוספת), וחמישה מלבנים עם מבטא צבעוני באותה שורה
הם רעש שמתחרה בגבול המיקוד ובגבול ה-hover — שניהם `--color-primary` גם הם.
הצבע נשמר לאינטראקציה, והדף נשאר אפור.

**4. ניווט דו-ממדי בחיצים ברשת הכרטיסים.**
היה דורש למדוד `offsetTop` בזמן ריצה כדי לדעת מהי „השורה הבאה”, כי מספר העמודות
נגזר מ-`auto-fit` ולא ידוע מראש. זו לוגיקת פריסה בקומפוננטה שאין לה בדיקה זולה,
בשביל חמישה פריטים שנגישים בשתי לחיצות חץ. `nextTabIndex` הקיים נבדק כבר, וזה
מה שנבחר.

**5. `role="grid"` לרשימת האחרונים.**
זו הסמנטיקה ה„נכונה” לרשימת פריטים עם פעולות בשורה, והיא נפסלה על מה שהמשתמש
שומע: קורא מסך מכריז „טבלה, שורה 3 מתוך 12, עמודה 2” על רשימת קבצים. עדיף
„כפתור: פרק א.docx, לפני שעתיים, 1.4 מ״ב, מוצמד”. ה-roving tabindex (§7.5) נותן
את יעילות המקלדת בלי לשנות את הסמנטיקה, וכל כפתור נשאר כפתור.

**6. „עיון בקבצים…” ככרטיס שישי או ככפתור בכותרת התחתונה.**
מנומק במלואו ב-§3.

**7. כותרות קבוצה „מוצמדים” / „אחרונים”.**
עולות שתי שורות טקסט באזור שקיבל 245–304px בסך הכול (§1.2), כלומר שתי שורות
קובץ. אייקון ההצמדה בצבע הנושא כבר אומר לכל שורה אם היא מוצמדת, השם הנגיש אומר
„מוצמד” במפורש, וקו יחיד מתחת למוצמדת האחרונה אומר איפה עובר הגבול.

**8. מיקוד אוטומטי בתיבת החיפוש בפתיחה.**
מפתה כשיש הרבה אחרונים, ונפסל: `props` אינם כוללים את הכוונה שפתחה את הדיאלוג
(§7.6), ומיקוד שקופץ לשדה טקסט מבטל את Enter ואת החיצים. מיקוד שמשתנה לפי מצב
הנתונים („אם יש אחרונים — לחיפוש, אחרת — לכרטיס”) גרוע עוד יותר: מיקוד שאי-אפשר
לחזות עליו לא נלמד לעולם.

**9. `input[type="search"]`.**
מנומק ב-§4.2.

---

## 10. מצבי קצה — סיכום

| מצב | התנהגות |
|---|---|
| `recents.length === 0` | תיבת החיפוש והמונה אינם מרונדרים כלל. במקום הרשימה: `SvgIcon name="folder" :size="28"` ב-`--color-on-surface-variant`, „עדיין אין מסמכים אחרונים” (1em/600), „מסמך שתפתח מכאן או מ„עיון בקבצים…” יופיע כאן.” (0.88em/variant). האזור מקבל את גובהו מהתוכן — הדיאלוג מתקצר במקום לשמור מקום למה שאין. |
| סינון בלי תוצאות | תיבת החיפוש והמונה נשארים. במקום הרשימה: „אין מסמך שתואם ל„{query}”” + כפתור טקסט „נקה סינון” שפולט `update:searchQuery` עם `''`. הבלוק הוא `role="status" aria-live="polite"` כדי שהתוצאה תוכרז בזמן ההקלדה. |
| רשימה ארוכה | `.rec-list` עם `overflow-y: auto` ו-`min-height: 96px`. עשרים לא-מוצמדים ועוד כל המוצמדים = 640px+ בשורות של 32px, מול 245–304px זמינים. פס הגלילה בימין (§4.3). |
| שם קובץ ארוך מאוד | `text-overflow: ellipsis` על `.rec-name`. **הקיצוץ נופל בקצה ה-inline-end, כלומר בשמאל** — ההתחלה נשמרת, כמו שקוראים. השם המלא ב-`data-tip-title` (ולא ב-`title`, שאסור — עובדה 4). קיצוץ CSS אינו נוגע בשם הנגיש, ולכן קורא מסך מקבל את השם המלא בלי קשר. `min-width: 0` על `.rec-name` הוא מה שמאפשר לזה לקרות מול `flex`. |
| `openedAt === 0` | `draftAgeLabel` מחזירה `null` → הגיל נשמט מהמטא ומהשם הנגיש. |
| `size === 0` | הגודל נשמט. אם גם הגיל חסר, `.rec-meta` אינו מרונדר כלל. |
| `busy` | `aria-busy="true"` על הדיאלוג; כל הכרטיסים, „עיון בקבצים…”, תיבת החיפוש, וכל כפתורי השורות מקבלים `disabled` (ומראה `opacity: .5` מ-`shell.css`); „פותח מסמך…” בשורת המצב `role="status"`. ✕, „סגור”, Escape ולחיצה על הרקע ממשיכים לעבוד. |
| token מת | לא עניינו של הדיאלוג. `recent-documents.ts` מתעד במפורש שהרשימה אינה מבטיחה שה-token נפתר, ושמי שפותח שורה מתה מקבל הודעה. אין כאן סימון „לא זמין”, כי אין דרך לדעת בלי קריאת גשר לכל שורה בכל פתיחה. |

---

## 11. מיפוי אל החוזה של התוכנית

| prop / emit | היכן |
|---|---|
| `isOpen` | `v-if` על ה-backdrop; מפעיל את `watch` המיקוד |
| `templates` | `v-for` על `.tpl-grid` |
| `recents` | `v-for` על `.rec-list`; החלוקה למוצמדים ולשאר לצורך `--last-pinned` נעשית בקומפוננטה מהשדה `pinned` |
| `busy` | `aria-busy` + `disabled` על כל הפקדים חוץ מהסגירה |
| `searchQuery` | `:value` על `.rec-search__input` (לא `v-model` על prop) |
| `close` | ✕, „סגור”, Escape, לחיצה על הרקע |
| `browse` | `.open-browse` |
| `create-from-template(id)` | `.tpl-card` |
| `open-recent(token)` | `.rec-open` |
| `toggle-pin(token, pinned)` | `.rec-pin`, עם ה-`pinned` **החדש** |
| `forget-recent(token)` | `.rec-forget` |
| `update:searchQuery` | `@input` על השדה, וכפתורי „נקה” |

הקומפוננטה אינה קוראת ל-`storage`, אינה מכירה את הגשר, ואינה מחזיקה מצב מלבד
מיקום ה-roving tabindex. הסינון עצמו (`filterRecents`) והמיון (`sortedRecents`)
הם באחריות `App.vue` — הם כבר קיימים, נבדקים, ומקבלים את הכללים שלהם ב-
`src/sessions/recent-documents.ts`.

## 12. רשימת בדיקה לשערים

* **`tests/unit/css-hygiene.test.ts`** — אין hex, `rgb()` או שם צבע באנגלית בשום
  הצהרה, למעט `box-shadow: … rgba(0,0,0,0.24)` שמוחרג במפורש. אין טוקן חדש
  ב-`tokens.css`, ולכן אין טוקן מיותם. שלוש דרגות ה-`--word-btn-*` בשימוש (§2.3).
* **`npm run check:icons`** — אין תוספת ל-`icons.ts`. הנצרכים: `folder`, `search`,
  `bookmark`, `reject`, `chevronLeft`. חמש התצוגות המקדימות הן SVG בתוך
  הקומפוננטה ואינן נכנסות לסט.
* **`tests/unit/native-title.test.ts`** — אין תכונת `title` על שום אלמנט,
  ובפרט לא בתוך ה-SVG.
* **`npm run check:rtl`** — אין `left`/`right`/`margin-left` וכו'. כל המאפיינים
  הכיווניים כאן הם `padding-inline`, `margin-inline-start`, `inset-inline-*`,
  `border-inline-start`, `border-block-*`, `text-align: start`. שני חריגי
  ה-`direction` ב-`.rec-list`/`.rec-row` הם מכוונים ומנומקים ב-§4.3.
* **`tests/component/no-unresolved-components.test.ts`** — `OpenDocumentDialog`
  מיובא ומורכב ב-`App.vue` (שלב 5).
