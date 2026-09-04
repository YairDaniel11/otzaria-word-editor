<template>
  <div class="ribbon-tab-pane references-tab">
    <!--
      „תוכן עניינים”. הכפתור הראשון הוא הפקד שכבר היה כאן, ללא שינוי; ארבעת
      הנוספים הם מה שהופך אותו לקבוצה כמו ב-Word. ראו הערת הפתיחה.
    -->
    <RibbonGroup title="תוכן עניינים">
      <RibbonButton
        icon="toc"
        label="תוכן עניינים"
        variant="large"
        tooltip="הוספת תוכן עניינים למסמך"
        :disabled="!tocCmd.enabled.value"
        @click="tocCmd.run()"
      />
      <!--
        „סמן ערך” הוא האייקון של הסימנייה: שני הפקדים מסמנים מקום במסמך בשדה
        בלתי נראה, ולסט אין גליף ייעודי לשדה `TC`. אייקון מושאל עדיף על
        אייקון חדש שמצויר מהזיכרון — ראו הבאנר ב-icons.ts.

        הוא השני מבין הגדולים מפני שהוא הפעולה שחוזרת: בונים תוכן עניינים
        פעם אחת, ומסמנים ערכים לאורך כל הספר.
      -->
      <RibbonButton
        icon="bookmark"
        label="סמן ערך"
        variant="large"
        :tooltip="tip('canMarkTocEntry', 'סימון טקסט שייכנס לתוכן העניינים')"
        :disabled="!can('canMarkTocEntry')"
        @click="onOpenEntryDialog"
      />
      <!--
        שלושת המתחזקים במחסנית. אייקון ה„דחייה” של הסקירה הוא ה-X של הסט,
        וזו המשמעות ב„הסר”: הסרה.
      -->
      <RibbonStack>
        <RibbonButton
          icon="updateFields"
          label="עדכן טבלה"
          variant="small"
          :tooltip="updateTooltip"
          :disabled="!can('canUpdateTableOfContents')"
          @click="onUpdateToc"
        />
        <RibbonButton
          icon="toc"
          label="התאמה אישית"
          variant="small"
          :tooltip="configureTooltip"
          :disabled="!can('canConfigureTableOfContents')"
          @click="onOpenTocDialog"
        />
        <RibbonButton
          icon="reject"
          label="הסר"
          variant="small"
          :tooltip="removeTooltip"
          :disabled="!can('canRemoveTableOfContents')"
          @click="onRemoveToc"
        />
      </RibbonStack>
    </RibbonGroup>

    <RibbonGroup title="הערות שוליים">
      <RibbonButton
        icon="footnote"
        label="הערת שוליים"
        shortcut-id="footnote"
        variant="large"
        :tooltip="noteTooltip('הוספת הערת שוליים בתחתית העמוד')"
        :disabled="!canInsertNote || noteBusy"
        @click="onInsert('footnote')"
      />
      <RibbonButton
        icon="footnote"
        label="הערת סיום"
        shortcut-id="endnote"
        variant="large"
        :tooltip="noteTooltip('הוספת הערת סיום בסוף המסמך')"
        :disabled="!canInsertNote || noteBusy"
        @click="onInsert('endnote')"
      />
      <!--
        „נהל הערות” הוא הפקד השלישי, והוא עורך ומסיר בלבד: ההוספה נשארת
        בשני הכפתורים שלצידו, מפני שהיא נכנסת במקום הסמן — והסמן אינו בעורך
        מרגע שדיאלוג נפתח. ראו engine/footnotes.ts.

        ולכן דווקא הוא זה שיורד למחסנית ושני האחרים נשארים גדולים: ההבחנה
        בין „מוסיף” ל„מנהל” היא בדיוק מה שההערה הזאת אומרת, והגודל אומר אותה
        עכשיו גם בלי לקרוא אותה.
      -->
      <RibbonStack>
        <RibbonButton
          icon="book"
          label="נהל הערות"
          variant="small"
          :tooltip="notesTooltip"
          :disabled="!can('canManageNotes')"
          @click="onOpenNoteDialog"
        />
      </RibbonStack>
    </RibbonGroup>

    <!--
      „מפתח” — הקבוצה שהקהל של התוסף בא בשבילה: ספר תורני עם מפתח ערכים.
      „סמן ערך למפתח” ולא „סמן ערך”, כדי שלא יהיו בלשונית אחת שני כפתורים
      באותו שם — ב-Word הקבוצה השכנה קוראת לפקד שלה „הוסף טקסט”.
    -->
    <RibbonGroup title="מפתח">
      <RibbonButton
        icon="bookmark"
        label="סמן ערך למפתח"
        variant="large"
        :tooltip="tip('canMarkIndexEntry', 'סימון הטקסט שנבחר כערך במפתח')"
        :disabled="!can('canMarkIndexEntry')"
        @click="onOpenIndexEntryDialog"
      />
      <RibbonButton
        icon="book"
        label="הוסף מפתח"
        variant="large"
        :tooltip="tip('canInsertIndex', 'הוספת מפתח הערכים בסוף המסמך')"
        :disabled="!can('canInsertIndex')"
        @click="onInsertIndex"
      />
      <RibbonStack>
        <RibbonButton
          icon="updateFields"
          label="עדכן מפתח"
          variant="small"
          :tooltip="indexRebuildTooltip"
          :disabled="!can('canRebuildIndex')"
          @click="onRebuildIndex"
        />
        <RibbonButton
          icon="toc"
          label="הגדרות מפתח"
          variant="small"
          :tooltip="indexConfigureTooltip"
          :disabled="!can('canConfigureIndex')"
          @click="onOpenIndexDialog"
        />
        <RibbonButton
          icon="reject"
          label="הסר מפתח"
          variant="small"
          :tooltip="indexRemoveTooltip"
          :disabled="!can('canRemoveIndex')"
          @click="onRemoveIndex"
        />
      </RibbonStack>
    </RibbonGroup>

    <!--
      „ציטוטים וביבליוגרפיה”. חמישה פקדים מתוך ארבעה של Word: „הוסף ציטוט”,
      „נהל מקורות” ו„ביבליוגרפיה” הם שלושת הראשונים שם, „עדכן” ו„הסר” הם
      פיצול של אותו „ביבליוגרפיה”, ו„סגנון” אינו כאן — ראו הערת הפתיחה.
    -->
    <RibbonGroup title="ציטוטים וביבליוגרפיה">
      <RibbonButton
        icon="comment"
        label="הוסף ציטוט"
        variant="large"
        :tooltip="tip('canInsertCitation', 'הוספת ציטוט למקור במקום הסמן')"
        :disabled="!can('canInsertCitation')"
        @click="onOpenInsertCitationDialog"
      />
      <RibbonButton
        icon="toc"
        label="ביבליוגרפיה"
        variant="large"
        :tooltip="tip('canInsertBibliography', 'הוספת רשימת המקורות בסוף המסמך')"
        :disabled="!can('canInsertBibliography')"
        @click="onInsertBibliography"
      />
      <RibbonStack>
        <RibbonButton
          icon="book"
          label="נהל מקורות"
          variant="small"
          :tooltip="tip('canManageCitationSources', 'הוספה, עריכה ומחיקה של המקורות שבמסמך')"
          :disabled="!can('canManageCitationSources')"
          @click="onOpenSourceDialog"
        />
        <RibbonButton
          icon="updateFields"
          label="עדכן ביבליוגרפיה"
          variant="small"
          :tooltip="bibRebuildTooltip"
          :disabled="!can('canRebuildBibliography')"
          @click="onRebuildBibliography"
        />
        <RibbonButton
          icon="reject"
          label="הסר ביבליוגרפיה"
          variant="small"
          :tooltip="bibRemoveTooltip"
          :disabled="!can('canRemoveBibliography')"
          @click="onRemoveBibliography"
        />
      </RibbonStack>
    </RibbonGroup>

    <!--
      „כיתובים”, ובה גם „עדכן הפניות”. ההנמקה לשני הפקדים שאינם כאן בהערת
      הפתיחה.

      המיזוג אינו סידור אלא מקום: ב-Word העברי „הפניה מקושרת” יושבת **בתוך**
      קבוצת „כיתובים” של לשונית „הפניות”, ולא בקבוצה משלה. „עדכן הפניות” הוא
      הצד היחיד של אותו API שעובד כאן (ראו הערת הפתיחה), ולכן זה מקומו.

      מה שהיה קודם — שתי קבוצות סמוכות, כל אחת עם כפתור בודד וכותרת משלה —
      נראה כמו שני פקדים שאיש לא מצא להם בית, וזה גם מה שהוא היה.
    -->
    <RibbonGroup title="כיתובים">
      <RibbonButton
        icon="image"
        label="הוסף כיתוב"
        variant="large"
        :tooltip="tip('canManageCaptions', 'הוספת כיתוב ממוספר לתמונה, לטבלה או לתרשים')"
        :disabled="!can('canManageCaptions')"
        @click="onOpenCaptionDialog"
      />
      <RibbonStack>
        <RibbonButton
          icon="updateFields"
          label="עדכן הפניות"
          variant="small"
          :tooltip="rebuildTooltip"
          :disabled="!canRebuildCrossRefs"
          @click="onRebuildCrossRefs"
        />
      </RibbonStack>
    </RibbonGroup>

    <TocDialog
      :is-open="tocDialogOpen"
      :levels="toc.levels"
      :hyperlinks="toc.hyperlinks"
      @close="tocDialogOpen = false"
      @submit="onConfigureToc"
    />

    <TocEntryDialog
      :is-open="entryDialogOpen"
      :entries="toc.entries"
      :selected-text="entrySuggestion"
      @close="entryDialogOpen = false"
      @mark="onMarkEntry"
      @unmark="onUnmarkEntry"
    />

    <IndexDialog
      :is-open="indexDialogOpen"
      :columns="indexState.columns"
      :run-in="indexState.runIn"
      @close="indexDialogOpen = false"
      @submit="onConfigureIndex"
    />

    <IndexEntryDialog
      :is-open="indexEntryDialogOpen"
      :entries="indexState.entries"
      :selected-text="indexEntrySuggestion"
      @close="indexEntryDialogOpen = false"
      @mark="onMarkIndexEntry"
      @unmark="onUnmarkIndexEntry"
    />

    <CitationSourceDialog
      :is-open="sourceDialogOpen"
      :sources="citations.sources"
      @close="sourceDialogOpen = false"
      @add="onAddSource"
      @update="onUpdateSource"
      @remove="onRemoveSource"
    />

    <InsertCitationDialog
      :is-open="insertCitationDialogOpen"
      :sources="citations.sources"
      @close="insertCitationDialogOpen = false"
      @insert="onInsertCitation"
    />

    <NoteDialog
      :is-open="noteDialogOpen"
      :notes="notes.notes"
      :busy="noteBusy"
      @close="noteDialogOpen = false"
      @update="onUpdateNote"
      @remove="onRemoveNote"
    />

    <CaptionDialog
      :is-open="captionDialogOpen"
      :captions="captions.captions"
      :labels="captions.labels"
      @close="captionDialogOpen = false"
      @insert="onInsertCaption"
      @update="onUpdateCaption"
      @remove="onRemoveCaption"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * „הפניות”.
 *
 * שני כפתורי ההערות היו בלי `@click`, והציגו קיצורים — `Alt+Ctrl+F`
 * ו-`Alt+Ctrl+D` — שלא נרשמו בשום מקום. קיצור שמוצג ואינו קיים הוא שקר קטן
 * שמצטבר, ולכן הוא הוסר ולא „תוקן”: רישום קיצור גלובלי הוא שינוי במעטפת, לא
 * בלשונית.
 *
 * ## „עדכן הפניות”, ולמה אין „הפניה מקושרת” לצידו, ולמה הוא בקבוצת „כיתובים”
 *
 * ב-Word העברי „הפניה מקושרת” יושבת בשתי לשוניות — „הוספה” ו„הפניות” — והיא
 * אינה כאן באף אחת מהן. `crossRefs.insert` מוצהר זמין ומחזיר `success: true`,
 * אבל קוד השדה שהוא כותב אינו קוד Word (`REF SDXREF kind=…`), ו-`resolvedText`
 * נשאר ריק גם אחרי `crossRefs.rebuild` על סימנייה קיימת. הכול נמדד בדפדפן,
 * וההנמקה המלאה ב-engine/cross-refs.ts.
 *
 * מה שכן כאן הוא הצד השני של אותו API: `crossRefs.list` מחזיר גם את ההפניות
 * שנוצרו **ב-Word** במסמך שנפתח כאן, ו-`rebuild` עליהן עובד. זה המסלול
 * שהפקד משרת — מסמך שהגיע מ-Word וההפניות בו התיישנו אחרי עריכה.
 *
 * הוא ישב בקבוצה משלו, „הפניות מקושרות”, ובה פקד בודד. זה לא היה מקומו: ב-Word
 * העברי „הפניה מקושרת” יושבת בקבוצת **„כיתובים”** של הלשונית הזאת, ולא בקבוצה
 * נפרדת. שתי הקבוצות אוחדו, ומה שהיה שתי כותרות מעל שני כפתורים בודדים סמוכים
 * הוא עכשיו קבוצה אחת עם ראשי ומשני.
 *
 * זמינות ההערות נקבעת מ-`doc.capabilities` ולא מהנחה: `footnotes` הוא adapter
 * אופציונלי בחוזה של המנוע, וכשהוא חסר הפקד מנוטרל עם ההסבר „אינו זמין בגרסה
 * זו” — בדיוק כפי ש-§12 דורש.
 *
 * ## קבוצת „הערות שוליים”, ולמה ההוספה אינה בדיאלוג
 *
 * שלושה פקדים: שני כפתורי ההוספה שהיו כאן, ו„נהל הערות” שעורך ומסיר. הפיצול
 * הזה אינו סגנון — `footnotes.insert` מכניס את ההערה **במקום הסמן**, ובלי
 * בחירה חיה הוא מוחזר `PRECONDITION_FAILED / live-selection-unavailable`
 * (נמדד). מרגע שדיאלוג נפתח הסמן אינו בעורך, ולכן „הוסף” בתוך דיאלוג היה
 * כפתור שנכשל תמיד.
 *
 * הדיאלוג עצמו חוסם דבר אחד שנמדד: כתובת ההערה היא
 * `{ entityType: 'footnote', noteId }` **גם עבור הערת סיום**, ושני הרצפים
 * מתחילים מ-1 — כלומר הערת שוליים 1 והערת סיום 1 חולקות כתובת אחת, והמנוע
 * פותר אותה תמיד לטובת הערת השוליים. לחיצה על „הסר” בשורה של הערת סיום
 * הייתה מוחקת הערת שוליים אחרת. ההנמקה המלאה, כולל האימות שמונע את זה,
 * ב-engine/footnotes.ts.
 *
 * מה שאין כאן הוא „מספור ההערות”, והוא פקד אמיתי ב-Word.
 * `footnotes.configure` דווקא כותב `w:footnotePr` קנוני — אבל אין בכל ה-API
 * דרך לקרוא את ההגדרות שבמסמך, וכל קריאה מחליפה את האלמנט כולו; כלומר טופס
 * היה מציג ערכים שאינם של המסמך, ובאישור אחד מוחק בשקט את מה שהוגדר ב-Word.
 * זו אותה שורה שנמתחה בדיאלוג של תוכן העניינים.
 *
 * „תוכן עניינים” ממשיך לרוץ דרך פקודת ה-registry;
 * מה שנוסף לו הוא `:disabled` מהמצב שהמנוע מדווח.
 *
 * ## קבוצת „תוכן עניינים”, ומה שאין בה
 *
 * הכפתור „תוכן עניינים” הוא הפקד שהיה כאן מהיום הראשון, והוא לא שונה: אותה
 * פקודת registry, אותו tooltip, אותה התנהגות. לצידו ארבעה פקדים חדשים שכולם
 * רצים על `doc.toc` דרך engine/toc.ts — „עדכן טבלה”, „סמן ערך”, „התאמה
 * אישית” ו„הסר”.
 *
 * „עדכן טבלה” הוא החשוב שבהם, והוא נמדד בדפדפן לפני שנכתב: כותרת שנוספה
 * למסמך אחרי יצירת הטבלה נכנסה אליה אחרי `toc.update` — הטקסט של הטבלה
 * השתנה. (`entryCount` **אינו** העדות: הוא נספר מהמקורות ועולה כבר עם הוספת
 * הכותרת, לפני העדכון. ראו engine/toc.ts.) במסמך שיש בו כמה טבלאות שאינן
 * ניתנות להבחנה הפקד מדווח שהעדכון לא הושלם, ולא „בוצע”.
 *
 * „התאמה אישית” מריץ אחרי `configure` גם `update`, ולא רק מפני שזה נעים:
 * שינוי טווח הרמות משנה איזה כותרות **צריכות** להיות בטבלה, ובלי בנייה
 * מחדש היה נשאר על המסך מצב ביניים שאינו תואם את ההגדרות שהמשתמש הרגע
 * אישר. שני הכשלים מדווחים בנפרד, כי הם שני דברים שונים שיכולים להיכשל.
 *
 * מה שאין בקבוצה — „מנהיג נקודות” ו„הצג מספרי עמודים”, ששניהם פקדים אמיתיים
 * בדיאלוג של Word — אינו השמטה: המנוע מקבל את שניהם עם `success: true`
 * ואינו מיישם אותם, ומספרי העמודים הם בנוסף מתג חד-כיווני. ההנמקה המלאה,
 * כולל המדידה, ב-engine/toc.ts.
 *
 * ## קבוצת „מפתח”, ומה שהיא מבטיחה ומה לא
 *
 * זו הקבוצה שהקהל של התוסף בא בשבילה: ספר תורני עם מפתח ערכים. חמישה פקדים,
 * כולם מעל `doc.index` דרך engine/index-field.ts, ו„סמן ערך למפתח” הוא
 * העיקר — זו הפעולה שתבוצע מאות פעמים בספר אחד.
 *
 * הנוסח של ה-tooltips וההערות בדיאלוגים מדויק בכוונה, ובגלל ממצא: המנוע
 * מרנדר את בלוק ה-`INDEX` כרשימת הערכים **בסדר הופעתם במסמך**, בלי מיון,
 * בלי מספרי עמודים ובלי כותרות אותיות (נמדד — שמונה ערכים חזרו בדיוק בסדר
 * שנשלחו). השדות שנכתבים למסמך הם `XE` ו-`INDEX` תקניים לחלוטין, ו-Word הוא
 * זה שימיין וימספר. לכן שום פקד כאן אינו מבטיח מיון, וההערה בדיאלוג אומרת
 * במפורש שהמיון ומספרי העמודים נבנים ב-Word.
 *
 * „הוסף מפתח” אינו פותח דיאלוג, שלא כמו ב-Word: שתי ההגדרות היחידות שהמנוע
 * באמת כותב ניתנות לשינוי אחר כך ב„הגדרות מפתח”, ודיאלוג שחוסם את הפעולה
 * בשביל שתי ברירות מחדל הוא מס. ההנמקה המלאה, כולל מה שנשאר בחוץ ולמה,
 * ב-engine/index-field.ts.
 *
 * ## קבוצת „ציטוטים וביבליוגרפיה”, ולמה אין בה „סגנון”
 *
 * זו הקבוצה הראשונה מאז גל 3 שנשלחת בלי הסתייגות על קוד השדה: שני השדות
 * שהיא כותבת למסמך, `CITATION <tag>` ו-`BIBLIOGRAPHY` חשוף, אומתו בתוך
 * ה-docx המיוצא מול חלק הביבליוגרפיה שנכתב לצידם — `<b:Tag>` שתואם את
 * ארגומנט השדה, בסכימת OOXML, עם הרלציה וה-Content-Type שלה. זה ההפך
 * מ-`REF SDXREF` של גל 5 ומ-`TA` בלי `\l` של גל 6.
 *
 * מה שאין כאן הוא „סגנון”, והוא הפקד הרביעי בקבוצה של Word.
 * `bibliography.configure` אכן כותב את הסגנון למקום הנכון
 * (`SelectedStyle="/CHICAGO.XSL"`), אבל באותה קריאה הוא כותב גם
 * `BIBLIOGRAPHY \sdStyle "Chicago"` — ו-`\sdStyle` אינו מתג של Word. אין
 * דרך לבקש את הראשון בלי השני, ולכן הסגנון נשאר ברירת המחדל שגם Word
 * מתחיל בה. ההנמקה המלאה, כולל המדידה, ב-engine/citations.ts.
 *
 * „הוסף ציטוט” ו„נהל מקורות” הם שני דיאלוגים ולא אחד: הראשון הוא הפעולה
 * שחוזרת עשרות פעמים בספר, והוא רשימה ולחיצה; השני הוא טופס בן שבעה שדות
 * שנפתח לעיתים רחוקות. איחוד שלהם היה מטיל את מחיר השני על הראשון.
 *
 * „עדכן ביבליוגרפיה” ו„הסר ביבליוגרפיה” עובדים גם על מסמך שהגיע **מ-Word**:
 * הכתובת נמצאת דרך `fields.list`, שמחזיר `fieldType: 'BIBLIOGRAPHY'` בלי
 * קשר למי יצר את השדה. `blocks.list` דווקא **אינו** מסמן אותה, וגם
 * ל-`citations.bibliography` אין `list` משלה.
 *
 * ## קבוצת „כיתובים”, ומה יש בה
 *
 * ב-Word העברי הקבוצה נושאת ארבעה פקדים, וכאן יש שניים: „הוסף כיתוב”
 * ו„עדכן הפניות” (ראו למעלה — זה מקומו ב-Word). השניים שאינם כאן אינם
 * השמטה, וכל אחד מהם נפל על סיבה אחרת:
 *
 * - **„הוסף טבלת איורים”** ו„עדכן טבלה” שלה עוברים דרך `create.tableOfContents`
 *   עם `TOC \c "איור"`. המסלול נמדד ועובד — השדה נכתב קנונית, ו-`toc.list`
 *   מחזיר אותו עם `preserved.seqFieldIdentifier: 'איור'` — אבל הפקד שייך
 *   ל-engine/toc.ts, שאינו בהיקף הגל הזה. מה שכן ראוי לדעת לפני שייכתב:
 *   המנוע אינו אוסף את הכיתובים לתוכה, ו-`entryCount` נשאר 0 גם אחרי
 *   `toc.update`. Word ימלא אותה בפתיחה, בדיוק כמו את המפתח.
 * - **„הפניה מקושרת”** — ההוספה, להבדיל מהעדכון שכן כאן — אינה כאן מפני
 *   ש-`crossRefs.insert` כותב `REF SDXREF`. ראו למעלה.
 *
 * מה שכן כאן — „הוסף כיתוב” — נשלח אחרי אימות ב-docx: פסקה בסגנון `Caption`
 * עם `<w:fldSimple w:instr="SEQ איור \* ARABIC">`, כלומר **התווית העברית
 * נכנסת אל תוך קוד השדה כמו שהיא**. זו הנקודה שהפילה את טבלת המקורות בגל 6,
 * וכאן היא עוברת. הדיאלוג מוסיף, עורך ומסיר — ו„עורך” הוא הסרה והוספה
 * מחדש, מפני ש-`captions.update` מוסיף את הטקסט החדש על הישן במקום להחליף
 * אותו. ההנמקה המלאה, כולל המדידה, ב-engine/captions.ts.
 */
import { computed, inject, ref, shallowRef, watch } from 'vue';
import type { SuperDoc } from 'superdoc';
import RibbonGroup from '../common/RibbonGroup.vue';
import RibbonStack from '../common/RibbonStack.vue';
import RibbonButton from '../common/RibbonButton.vue';
import { useCommand } from '../../../composables/useCommand';
import { COMMAND_REPORTER, type CommandReporter } from '../../../composables/keys';
import { ACTIVE_SUPERDOC } from '../../../engine/document-api';
import {
  readDocCapabilities,
  type DocCapabilityQuestion,
  type DocCapabilityReport,
} from '../../../engine/doc-capabilities';
import {
  emptyNotesState,
  insertNote,
  readNotesState,
  removeNote,
  updateNote,
  type NoteRef,
  type NoteType,
  type NotesState,
} from '../../../engine/footnotes';
import {
  emptyCrossRefsState,
  readCrossRefsState,
  rebuildAllCrossRefs,
  type CrossRefsState,
} from '../../../engine/cross-refs';
import {
  configureTableOfContents,
  emptyTocState,
  markTocEntry,
  readTocState,
  removeTableOfContents,
  unmarkTocEntry,
  updateTableOfContents,
  type TocSettings,
  type TocState,
} from '../../../engine/toc';
import { readDocSelection } from '../../../engine/doc-selection';
import {
  DEFAULT_INDEX_COLUMNS,
  configureIndex,
  emptyIndexState,
  insertIndex,
  markIndexEntry,
  readIndexState,
  rebuildIndex,
  removeIndex,
  removeIndexEntry,
  type IndexEntryDraft,
  type IndexSettings,
  type IndexState,
} from '../../../engine/index-field';
import {
  addCitationSource,
  emptyCitationsState,
  insertBibliography,
  insertCitation,
  readCitationsState,
  rebuildBibliography,
  removeBibliography,
  removeCitationSource,
  updateCitationSource,
  type CitationSourceDraft,
  type CitationsState,
} from '../../../engine/citations';
import {
  emptyCaptionsState,
  insertCaption,
  readCaptionsState,
  removeCaption,
  updateCaption,
  type CaptionDraft,
  type CaptionsState,
} from '../../../engine/captions';
import TocDialog from '../../panels/TocDialog.vue';
import TocEntryDialog from '../../panels/TocEntryDialog.vue';
import IndexDialog from '../../panels/IndexDialog.vue';
import IndexEntryDialog from '../../panels/IndexEntryDialog.vue';
import CitationSourceDialog from '../../panels/CitationSourceDialog.vue';
import InsertCitationDialog from '../../panels/InsertCitationDialog.vue';
import CaptionDialog from '../../panels/CaptionDialog.vue';
import NoteDialog from '../../panels/NoteDialog.vue';

const tocCmd = useCommand('table-of-contents-insert');

/** ברירת המחדל כשאין מדווח — הרכבה חלקית בבדיקות. זהה להתנהגות של `useCommand`. */
const fallbackReporter: CommandReporter = (outcome, id) => {
  if (!outcome.ok) console.warn(`[otzaria-word] ${id}: ${outcome.message}`);
};

const superdoc = inject(ACTIVE_SUPERDOC, shallowRef<SuperDoc | null>(null));
const report = inject(COMMAND_REPORTER, fallbackReporter);

const capabilities = shallowRef<DocCapabilityReport | null>(null);
/**
 * מספר ההפניות במסמך. נקרא מהמסמך ולא מוחזק כדגל מקומי, כדי שמסמך שנפתח וכבר
 * יש בו הפניות לא יציג „אין מה לעדכן”. אותה החלטה כמו `fieldsState` ב-InsertTab.
 */
const crossRefs = shallowRef<CrossRefsState>(emptyCrossRefsState());
/** מצב תוכן העניינים: כמה טבלאות, מה ההגדרות שלהן, ואילו ערכים ידניים סומנו. */
const toc = shallowRef<TocState>(emptyTocState());

/** מצב המפתח: כמה מפתחות, מה ההגדרות שלהם, ואילו ערכים סומנו. */
const indexState = shallowRef<IndexState>(emptyIndexState());

/** מצב הציטוטים: המקורות שבמסמך, כמה ציטוטים ישנם, וכמה ביבליוגרפיות. */
const citations = shallowRef<CitationsState>(emptyCitationsState());

/** מצב ההערות: הערות השוליים והערות הסיום שבמסמך, בסדר שהמנוע מחזיר. */
const notes = shallowRef<NotesState>(emptyNotesState());

/** מצב הכיתובים: מה יש במסמך, ואילו תוויות כבר בשימוש בו. */
const captions = shallowRef<CaptionsState>(emptyCaptionsState());

const tocDialogOpen = ref(false);
const entryDialogOpen = ref(false);
/** הטקסט שהמשתמש סימן בעורך ברגע פתיחת הדיאלוג, כהצעה לטקסט הערך. */
const entrySuggestion = ref('');
const indexDialogOpen = ref(false);
const indexEntryDialogOpen = ref(false);
const indexEntrySuggestion = ref('');
const sourceDialogOpen = ref(false);
const insertCitationDialogOpen = ref(false);
const noteDialogOpen = ref(false);
/**
 * פעולה על הערה שיצאה לדרך וטרם חזרה — הנעילה של קבוצת ההערות.
 *
 * **זו הגנה על מרוץ שנמדד, ולא זהירות כללית.** כתובת ההערה אינה נושאת את
 * הסוג, ולכן `updateNote`/`removeNote` קוראות `footnotes.get` לפני שהן
 * נוגעות במסמך ומוודאות שהכתובת נפתרת לסוג שהמשתמש בחר (ראו
 * engine/footnotes.ts). ה-`get` הזה חוצה גבול macrotask — נמדד ~10ms במסמך
 * ריק וקר, וגדל עם גודל המסמך — ובחלון הזה לחיצה על „הערת שוליים” ברצועה
 * נקלטת ומוסיפה הערה. אז מה שהאימות ראה כבר אינו מה שההסרה תפגע בו: „הסר”
 * על הערת סיום 1, שאושר מפני שלא הייתה הערת שוליים 1, מוחק את הערת השוליים
 * שהרגע נוצרה — ומדווח „בוצע”.
 *
 * `get` נוסף אינו פותר את זה: זו TOCTOU בהגדרתה, וכל בדיקה נוספת רק מקצרת
 * את החלון. מה שסוגר אותו הוא שההוספה לא תיקלט כל עוד הפעולה באוויר, ולכן
 * הנעילה יושבת כאן — בצד שמחזיק את שני המסלולים — ולא במודול.
 *
 * הקריאה מחדש נכללת בנעילה בכוונה: רשימה שהתיישנה היא בדיוק המצב שבו
 * הכתובת שעל המסך מצביעה על הערה אחרת.
 */
const noteBusy = ref(false);
const captionDialogOpen = ref(false);

/** ראו LayoutTab: קריאת היכולות א-סינכרונית, ותשובה של מסמך קודם לא תדרוס. */
let generation = 0;

watch(
  superdoc,
  async (host) => {
    const mine = ++generation;
    capabilities.value = null;
    crossRefs.value = emptyCrossRefsState();
    toc.value = emptyTocState();
    indexState.value = emptyIndexState();
    citations.value = emptyCitationsState();
    captions.value = emptyCaptionsState();
    notes.value = emptyNotesState();
    const [
      result,
      refs,
      tocState,
      indexSnapshot,
      citationsSnapshot,
      captionsSnapshot,
      notesSnapshot,
    ] = await Promise.all([
      readDocCapabilities(host),
      readCrossRefsState(host),
      readTocState(host),
      readIndexState(host),
      readCitationsState(host),
      readCaptionsState(host),
      readNotesState(host),
    ]);
    if (mine !== generation) return;
    capabilities.value = result;
    crossRefs.value = refs;
    toc.value = tocState;
    indexState.value = indexSnapshot;
    citations.value = citationsSnapshot;
    captions.value = captionsSnapshot;
    notes.value = notesSnapshot;
  },
  { immediate: true }
);

const can = (question: DocCapabilityQuestion): boolean =>
  capabilities.value?.can(question) ?? false;

/** ה-tooltip של פקד זמין, או ההסבר של היכולת כשאינו. כמו ב-InsertTab. */
function tip(question: DocCapabilityQuestion, enabledText: string): string {
  if (can(question)) return enabledText;
  return capabilities.value?.explain(question) || 'המסמך עדיין נטען';
}

const canInsertNote = computed(() => capabilities.value?.can('canInsertFootnote') ?? false);

/** מה שהפקד הנעול אומר. אינו נראה במצב מנוחה — `noteBusy` כבוי. */
const NOTE_BUSY_TOOLTIP = 'פעולה על הערה עדיין בעבודה — ההוספה תיפתח כשהיא תסתיים';

function noteTooltip(enabledText: string): string {
  // הנעילה קודמת להסבר היכולת: היא הסיבה שהפקד מנוטרל **עכשיו**, והמשתמש
  // שמרחף מעליו שואל למה דווקא ברגע הזה אי אפשר.
  if (noteBusy.value) return NOTE_BUSY_TOOLTIP;
  if (canInsertNote.value) return enabledText;
  return capabilities.value?.explain('canInsertFootnote') || 'המסמך עדיין נטען';
}

/**
 * הוספה, ואז קריאה מחדש: הדיאלוג עשוי להיות פתוח (אין בו הוספה, אבל אין מה
 * שסוגר אותו), ורשימה שלא התרעננה הייתה מסתירה את ההערה שהרגע נוספה.
 * **קורא** את המונה ואינו מקדם אותו — ראו ההסבר ב-InsertTab.
 */
async function onInsert(type: NoteType): Promise<void> {
  // הכפתור כבר מנוטרל בזמן פעולה; הבדיקה כאן היא מה שבאמת נועל, מפני
  // ש-`:disabled` הוא תצוגה ולחיצה יכולה להגיע גם ממקלדת או מקוד.
  if (noteBusy.value) return;
  report(await insertNote(superdoc.value, type), `footnotes-insert-${type}`);
  await refreshNotes();
}

const notesTooltip = computed(() =>
  tip(
    'canManageNotes',
    notes.value.notes.length > 0
      ? 'עריכה והסרה של הערות השוליים והערות הסיום שבמסמך'
      : 'אין במסמך הערות לנהל'
  )
);

/**
 * קוראת מחדש את ההערות. נדרשת גם אחרי כשל, מאותו טעם כמו `refreshToc`,
 * ובנוסף מטעם ייחודי כאן: הסרה **אינה** ממספרת מחדש את השאר (נמדד), אבל
 * היא כן משנה לאיזו הערה כתובת נפתרת — מרגע שהערת שוליים 1 הוסרה, אותה
 * כתובת מצביעה על הערת הסיום שמספרה 1. רשימה שהתיישנה היא בדיוק המצב שבו
 * לחיצה מכוונת להערה אחרת מזו שעל המסך.
 */
async function refreshNotes(): Promise<void> {
  const mine = generation;
  const next = await readNotesState(superdoc.value);
  if (mine === generation) notes.value = next;
}

/** קוראת את ההערות מהמסמך ברגע הפתיחה. אותו טעם כמו ב-`onOpenTocDialog`. */
async function onOpenNoteDialog(): Promise<void> {
  await refreshNotes();
  noteDialogOpen.value = true;
}

/** נעולה מהרגע שהפעולה יוצאת ועד שהרשימה רועננה. ראו `noteBusy`. */
async function runNoteAction(action: () => Promise<void>): Promise<void> {
  if (noteBusy.value) return;
  noteBusy.value = true;
  try {
    await action();
  } finally {
    // `finally` ולא שחרור בסוף הגוף: `updateNote` ו-`removeNote` אינן
    // זורקות, אבל `refreshNotes` וה-`report` שלפניה כן יכולות — ונעילה
    // שנשארה דלוקה היא בדיוק „כפתור מת” שאין לו הסבר.
    noteBusy.value = false;
  }
}

async function onUpdateNote(payload: { ref: NoteRef; content: string }): Promise<void> {
  await runNoteAction(async () => {
    report(await updateNote(superdoc.value, payload.ref, payload.content), 'footnotes-update');
    await refreshNotes();
  });
}

async function onRemoveNote(ref: NoteRef): Promise<void> {
  await runNoteAction(async () => {
    report(await removeNote(superdoc.value, ref), 'footnotes-remove');
    await refreshNotes();
  });
}

const canRebuildCrossRefs = computed(
  () => capabilities.value?.can('canRebuildCrossRefs') ?? false
);

const rebuildTooltip = computed(() => {
  if (!canRebuildCrossRefs.value) {
    return capabilities.value?.explain('canRebuildCrossRefs') || 'המסמך עדיין נטען';
  }
  return crossRefs.value.count > 0
    ? 'חישוב מחדש של ההפניות המקושרות במסמך'
    : 'אין במסמך הפניות מקושרות לעדכן';
});

/**
 * מריצה את העדכון, מדווחת עליו, וקוראת מחדש את המונה. הקריאה מחדש נדרשת גם
 * בכשל: עדכון שנעצר באמצע משאיר מסמך שאינו במצב שה-tooltip מתאר.
 */
async function onRebuildCrossRefs(): Promise<void> {
  report(await rebuildAllCrossRefs(superdoc.value), 'cross-refs-rebuild');
  // **קורא** את המונה ואינו מקדם אותו — ראו ההסבר ב-InsertTab.
  const mine = generation;
  const refs = await readCrossRefsState(superdoc.value);
  if (mine === generation) crossRefs.value = refs;
}

/* ------------------------------------------------------------------ */
/* תוכן עניינים                                                        */
/* ------------------------------------------------------------------ */

const updateTooltip = computed(() =>
  tip(
    'canUpdateTableOfContents',
    toc.value.count > 0
      ? 'בניית תוכן העניינים מחדש מהכותרות שבמסמך'
      : 'אין במסמך תוכן עניינים לעדכן'
  )
);

const removeTooltip = computed(() =>
  tip(
    'canRemoveTableOfContents',
    toc.value.count > 0 ? 'מחיקת תוכן העניינים מהמסמך' : 'אין במסמך תוכן עניינים להסיר'
  )
);

const configureTooltip = computed(() =>
  tip(
    'canConfigureTableOfContents',
    toc.value.count > 0
      ? 'רמות הכותרות שייכללו, והאם הערכים יהיו קישורים'
      : 'אין במסמך תוכן עניינים להתאים'
  )
);

/**
 * קוראת מחדש את מצב הטבלה. נדרשת גם אחרי כשל: פעולה שנעצרה באמצע משאירה
 * מסמך שאינו במצב שה-tooltip והדיאלוגים מתארים. **קוראת** את המונה ואינה
 * מקדמת אותו — ראו ההסבר ב-InsertTab.
 */
async function refreshToc(): Promise<void> {
  const mine = generation;
  const next = await readTocState(superdoc.value);
  if (mine === generation) toc.value = next;
}

async function onUpdateToc(): Promise<void> {
  report(await updateTableOfContents(superdoc.value), 'toc-update');
  await refreshToc();
}

async function onRemoveToc(): Promise<void> {
  report(await removeTableOfContents(superdoc.value), 'toc-remove');
  await refreshToc();
}

/**
 * קוראת את ההגדרות מהמסמך **ברגע הפתיחה** ורק אז פותחת.
 *
 * המצב שבזיכרון נקרא בהחלפת מסמך ואחרי כל פעולה, אבל לא אחרי עריכה שהמשתמש
 * עשה בעורך עצמו — ודיאלוג שנפתח על טווח רמות ישן היה מציג הגדרות שאינן של
 * הטבלה שעל המסך, ומחזיר אותן לתוכה באישור. אותה החלטה כמו בדיאלוג הערכים,
 * שקורא את הבחירה ברגע הלחיצה.
 */
async function onOpenTocDialog(): Promise<void> {
  await refreshToc();
  tocDialogOpen.value = true;
}

/**
 * מחילה את ההגדרות ומיד בונה את הטבלה מחדש: שינוי טווח הרמות משנה איזה
 * כותרות צריכות להיות בה, ובלי העדכון היה נשאר על המסך מצב שאינו תואם את
 * ההגדרות שהמשתמש הרגע אישר. שני הכשלים מדווחים בנפרד — הם שני דברים.
 */
async function onConfigureToc(settings: TocSettings): Promise<void> {
  tocDialogOpen.value = false;
  const configured = await configureTableOfContents(superdoc.value, settings);
  report(configured, 'toc-configure');
  if (configured.ok) report(await updateTableOfContents(superdoc.value), 'toc-update');
  await refreshToc();
}

/**
 * פותחת את דיאלוג הערכים עם הטקסט שסומן בעורך כהצעה.
 *
 * הבחירה נקראת **ברגע הלחיצה** ולא כשהדיאלוג מאשר: מרגע שהמשתמש מקליד בשדה
 * המיקוד אינו בעורך, והבחירה החיה כבר אינה מה שהייתה. ראו doc-selection.ts.
 */
async function onOpenEntryDialog(): Promise<void> {
  const selection = await readDocSelection(superdoc.value, { includeText: true });
  entrySuggestion.value = selection.text;
  entryDialogOpen.value = true;
}

async function onMarkEntry(entry: { text: string; level: number }): Promise<void> {
  report(await markTocEntry(superdoc.value, entry.text, entry.level), 'toc-mark-entry');
  await refreshToc();
}

async function onUnmarkEntry(nodeId: string): Promise<void> {
  report(await unmarkTocEntry(superdoc.value, nodeId), 'toc-unmark-entry');
  await refreshToc();
}

/* ------------------------------------------------------------------ */
/* מפתח                                                                */
/* ------------------------------------------------------------------ */

const indexRebuildTooltip = computed(() =>
  tip(
    'canRebuildIndex',
    indexState.value.count > 0
      ? 'בניית המפתח מחדש מהערכים שסומנו במסמך'
      : 'אין במסמך מפתח לעדכן'
  )
);

const indexRemoveTooltip = computed(() =>
  tip(
    'canRemoveIndex',
    indexState.value.count > 0
      ? 'מחיקת המפתח מהמסמך. הערכים שסומנו נשארים'
      : 'אין במסמך מפתח להסיר'
  )
);

const indexConfigureTooltip = computed(() =>
  tip(
    'canConfigureIndex',
    indexState.value.count > 0
      ? 'מספר הטורים של המפתח, והאם תת-הערכים רצופים'
      : 'אין במסמך מפתח להתאים'
  )
);

/**
 * קוראת מחדש את מצב המפתח. נדרשת גם אחרי כשל, מאותו טעם כמו `refreshToc`,
 * ובנוסף מטעם ייחודי למפתח: הכתובת של שדה `XE` היא **מיקומית**, ולכן רשימת
 * הערכים שהדיאלוג מחזיק מתיישנת אחרי כל סימון וכל ביטול. **קוראת** את המונה
 * ואינה מקדמת אותו — ראו ההסבר ב-InsertTab.
 */
async function refreshIndex(): Promise<void> {
  const mine = generation;
  const next = await readIndexState(superdoc.value);
  if (mine === generation) indexState.value = next;
}

/**
 * „הוסף מפתח” — ישירות, בלי דיאלוג. שתי ההגדרות היחידות שנחשפות הן טורים
 * ורצף, ושתיהן ניתנות לשינוי אחר כך ב„הגדרות מפתח”; דיאלוג שחוסם את הפעולה
 * הנפוצה בשביל שתי ברירות מחדל היה מס ולא עזרה.
 */
async function onInsertIndex(): Promise<void> {
  report(
    await insertIndex(superdoc.value, { columns: DEFAULT_INDEX_COLUMNS, runIn: false }),
    'index-insert'
  );
  await refreshIndex();
}

async function onRebuildIndex(): Promise<void> {
  report(await rebuildIndex(superdoc.value), 'index-rebuild');
  await refreshIndex();
}

async function onRemoveIndex(): Promise<void> {
  report(await removeIndex(superdoc.value), 'index-remove');
  await refreshIndex();
}

/** קוראת את ההגדרות מהמסמך ברגע הפתיחה. אותו טעם כמו ב-`onOpenTocDialog`. */
async function onOpenIndexDialog(): Promise<void> {
  await refreshIndex();
  indexDialogOpen.value = true;
}

/**
 * מחילה את ההגדרות ומיד בונה את המפתח מחדש: `configure` כותב את המתגים
 * בלבד ואינו אוסף את הערכים מחדש (נמדד), ובלי העדכון היה נשאר על המסך מצב
 * שאינו תואם את מה שהמשתמש הרגע אישר. שני הכשלים מדווחים בנפרד.
 */
async function onConfigureIndex(settings: IndexSettings): Promise<void> {
  indexDialogOpen.value = false;
  const configured = await configureIndex(superdoc.value, settings);
  report(configured, 'index-configure');
  if (configured.ok) report(await rebuildIndex(superdoc.value), 'index-rebuild');
  await refreshIndex();
}

/**
 * פותחת את דיאלוג ערכי המפתח עם הטקסט שסומן בעורך כהצעה.
 *
 * הבחירה נקראת **ברגע הלחיצה** ולא כשהדיאלוג מאשר, בדיוק כמו בדיאלוג ערכי
 * תוכן העניינים. הרשימה נקראת מחדש גם היא: הכתובות מיקומיות, וכל עריכה
 * בעורך מאז הקריאה הקודמת הזיזה אותן.
 */
async function onOpenIndexEntryDialog(): Promise<void> {
  const selection = await readDocSelection(superdoc.value, { includeText: true });
  indexEntrySuggestion.value = selection.text;
  await refreshIndex();
  indexEntryDialogOpen.value = true;
}

async function onMarkIndexEntry(entry: IndexEntryDraft): Promise<void> {
  report(await markIndexEntry(superdoc.value, entry), 'index-mark-entry');
  await refreshIndex();
}

async function onUnmarkIndexEntry(address: unknown): Promise<void> {
  report(await removeIndexEntry(superdoc.value, address), 'index-unmark-entry');
  await refreshIndex();
}
/* ------------------------------------------------------------------ */
/* ציטוטים וביבליוגרפיה                                                */
/* ------------------------------------------------------------------ */

const bibRebuildTooltip = computed(() =>
  tip(
    'canRebuildBibliography',
    citations.value.bibliographyCount > 0
      ? 'בניית הביבליוגרפיה מחדש מהמקורות שבמסמך'
      : 'אין במסמך ביבליוגרפיה לעדכן'
  )
);

const bibRemoveTooltip = computed(() =>
  tip(
    'canRemoveBibliography',
    citations.value.bibliographyCount > 0
      ? 'מחיקת הביבליוגרפיה מהמסמך. המקורות עצמם נשארים'
      : 'אין במסמך ביבליוגרפיה להסיר'
  )
);

/**
 * קוראת מחדש את מצב הציטוטים. נדרשת גם אחרי כשל, מאותו טעם כמו `refreshToc`,
 * ובנוסף מטעם ייחודי כאן: „מחק מקור” מסרב לפי מספר הציטוטים שמפנים אליו,
 * ורשימה שהתיישנה הייתה מציגה כפתור מחיקה פעיל על מקור שכבר מצוטט.
 * **קוראת** את המונה ואינה מקדמת אותו — ראו ההסבר ב-InsertTab.
 */
async function refreshCitations(): Promise<void> {
  const mine = generation;
  const next = await readCitationsState(superdoc.value);
  if (mine === generation) citations.value = next;
}

/** קוראת את המקורות מהמסמך ברגע הפתיחה. אותו טעם כמו ב-`onOpenTocDialog`. */
async function onOpenSourceDialog(): Promise<void> {
  await refreshCitations();
  sourceDialogOpen.value = true;
}

/**
 * פותחת את דיאלוג הציטוט. אינה קוראת את הבחירה מראש, שלא כמו דיאלוגי
 * הערכים: `insertCitation` מכווץ את הבחירה בעצמו ברגע השליחה, ותצלום
 * שנלקח בפתיחה היה מתיישן ברגע שהמשתמש בוחר מקור ברשימה.
 */
async function onOpenInsertCitationDialog(): Promise<void> {
  await refreshCitations();
  insertCitationDialogOpen.value = true;
}

/**
 * הדיאלוג נשאר פתוח אחרי הוספה, כמו דיאלוג הסימניות: אותו מקור מצוטט
 * במקומות רבים בספר אחד.
 */
async function onInsertCitation(sourceId: string): Promise<void> {
  report(await insertCitation(superdoc.value, sourceId), 'citations-insert');
  await refreshCitations();
}

async function onAddSource(draft: CitationSourceDraft): Promise<void> {
  report(await addCitationSource(superdoc.value, draft), 'citations-source-add');
  await refreshCitations();
}

async function onUpdateSource(payload: { id: string; draft: CitationSourceDraft }): Promise<void> {
  report(
    await updateCitationSource(superdoc.value, payload.id, payload.draft),
    'citations-source-update'
  );
  await refreshCitations();
}

async function onRemoveSource(id: string): Promise<void> {
  report(await removeCitationSource(superdoc.value, id), 'citations-source-remove');
  await refreshCitations();
}

async function onInsertBibliography(): Promise<void> {
  report(await insertBibliography(superdoc.value), 'bibliography-insert');
  await refreshCitations();
}

async function onRebuildBibliography(): Promise<void> {
  report(await rebuildBibliography(superdoc.value), 'bibliography-rebuild');
  await refreshCitations();
}

async function onRemoveBibliography(): Promise<void> {
  report(await removeBibliography(superdoc.value), 'bibliography-remove');
  await refreshCitations();
}

/* ------------------------------------------------------------------ */
/* כיתובים                                                             */
/* ------------------------------------------------------------------ */

/**
 * קוראת מחדש את מצב הכיתובים. נדרשת גם אחרי כשל, מאותו טעם כמו `refreshToc`,
 * ובנוסף מטעם ייחודי כאן: המספור נגזר מסדר הכיתובים במסמך, וכיתוב שנוסף
 * באמצע מזיז את כל המספרים שאחריו. רשימה שהתיישנה הייתה מציגה „איור 3” על
 * מה שכבר הפך ל„איור 4”. **קוראת** את המונה ואינה מקדמת אותו — ראו ההסבר
 * ב-InsertTab.
 */
async function refreshCaptions(): Promise<void> {
  const mine = generation;
  const next = await readCaptionsState(superdoc.value);
  if (mine === generation) captions.value = next;
}

/** קוראת את הכיתובים מהמסמך ברגע הפתיחה. אותו טעם כמו ב-`onOpenTocDialog`. */
async function onOpenCaptionDialog(): Promise<void> {
  await refreshCaptions();
  captionDialogOpen.value = true;
}

async function onInsertCaption(draft: CaptionDraft): Promise<void> {
  report(await insertCaption(superdoc.value, draft), 'captions-insert');
  await refreshCaptions();
}

async function onUpdateCaption(payload: { id: string; draft: CaptionDraft }): Promise<void> {
  report(await updateCaption(superdoc.value, payload.id, payload.draft), 'captions-update');
  await refreshCaptions();
}

async function onRemoveCaption(id: string): Promise<void> {
  report(await removeCaption(superdoc.value, id), 'captions-remove');
  await refreshCaptions();
}
</script>

<style scoped>
.ribbon-tab-pane {
  display: flex;
  align-items: stretch;
  gap: 0;
  height: 100%;
}
</style>
