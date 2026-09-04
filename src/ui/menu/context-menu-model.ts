/**
 * מה מופיע בתפריט הלחצן הימני, בהינתן מה שנמצא תחת הסמן.
 *
 * ## למה פונקציה טהורה ולא לוגיקה בקומפוננטה
 *
 * הכלל שהתפריט הזה חי לפיו (docs/context-menu-plan.md §3) הוא שתי הכרעות
 * שונות לכל פריט: **להציג או להסתיר**, ו**להפעיל או לנטרל**. בקומפוננטה הן
 * היו נפרשות על פני `v-if` ו-`:disabled` בעשרים מקומות, ובדיקה עליהן הייתה
 * דורשת להרכיב DOM ולשאול אותו. כאן הן טבלה: תצלום נכנס, מקטעים יוצאים,
 * ו-tests/unit/context-menu-model.test.ts עובר על ההקשרים אחד-אחד.
 *
 * ## שני מקורות לניטרול, ולא אחד
 *
 * זו הטעות שהתגלתה בביקורת על הגרסה הראשונה של התוכנית, והיא שווה הסבר:
 *
 * 1. **„האם המנוע תומך”** — `doc-capabilities`. שאלה על הבנייה של המסמך, לא
 *    על הרגע. `DOC_CAPABILITY_REASONS` אינו יודע לבטא „אין בחירה” בכלל.
 * 2. **„האם יש בחירה”** — תצלום הבחירה שנלקח בפתיחת התפריט.
 *
 * הרצועה שואלת רק את הראשונה (`HomeTab.vue`: `canCopy` מיכולות בלבד), ולכן
 * „העתק” פעיל שם גם כשאין מה להעתיק. ברצועה זה כמעט לא נראה; בתפריט הקשר
 * שנפתח על סמן מכווץ זה הפריט הראשון שהעין נופלת עליו.
 *
 * ## מה **אינו** נקבע כאן
 *
 * פקודות מנוע (`kind: 'command'`) אינן מקבלות `disabled` מהמודל: המצב שלהן הוא
 * `CommandState` חי, והקומפוננטה קוראת אותו ב-`useCommand` בדיוק כמו כפתור
 * ברצועה. מודל שהיה מנחש אותו היה מייצר את הבאג שהרצועה כבר סובלת ממנו —
 * שני מקורות אמת לאותו כפתור.
 */
import type { CommandId } from '../../engine/capabilities';
import type { DocCapabilityQuestion } from '../../engine/doc-capabilities';
import type { ShellAction, ShortcutId } from '../shortcuts/registry';

/** פעולת לוח. אינה `CommandId` — הלוח עובר ב-Document API, ראו engine/clipboard.ts. */
export type ClipboardOp = 'cut' | 'copy' | 'paste';

/**
 * איך הפריט רץ. שלושת הראשונים הם המסלולים שכבר קיימים בתוסף: פקודה של
 * המנוע, פעולת מעטפת (אותה שקיצור מקלדת מריץ), ופעולת לוח.
 *
 * `dictionary` הוא הרביעי, והוא נוסף כי שלושת האחרים אינם יכולים לשאת אותו:
 * הוא פועל על **מילה מסוימת שנלחצה**, ולא על הבחירה. `ShellAction` הוא
 * מילון של קיצורי מקלדת ואין לו מקום לפרמטר, ופקודת מנוע לא קיימת כאן כלל.
 */
export type ContextMenuRun =
  | { readonly kind: 'command'; readonly command: CommandId }
  | { readonly kind: 'action'; readonly action: ShellAction }
  | { readonly kind: 'clipboard'; readonly op: ClipboardOp }
  | { readonly kind: 'dictionary'; readonly word: string };

export interface ContextMenuEntry {
  /** מזהה יציב — לבדיקות ולמפתח ב-`v-for`. */
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly run: ContextMenuRun;
  /** מזהה מהרג'יסטרי. תווית הקיצור נגזרת ממנו, ולכן אי אפשר להבטיח צירוף מדומה. */
  readonly shortcutId?: ShortcutId;
  /** ניטרול שהמודל יודע לקבוע בעצמו. פקודות מנוע — ראו הערת הראש. */
  readonly disabled?: boolean;
  /** מתג: `menuitemcheckbox` ולא `menuitem`, והמצב הדלוק מגיע מ-`CommandState`. */
  readonly toggle?: boolean;
}

/**
 * פקד רציף בכרטיס — לא כפתור, ולכן לא `ContextMenuEntry`.
 *
 * שני אלה הם בוררים במלוא מובן המילה: יש להם ערך מוצג, רשימה, והקלדה. הם
 * **אינם** מקבלים `disabled` מהמודל ואינם מקבלים `run`, מאותו טעם שפקודת
 * מנוע אינה מקבלת: המצב שלהם חי, ומגיע מ-`useFontControls` — אותו מצב בדיוק
 * שהרצועה מציגה. הרשימה סגורה, כמו `ContextMenuRun`.
 */
export type ContextMenuControl = 'font-family' | 'font-size';

export interface ContextMenuSection {
  readonly id: string;
  /** שורת אייקונים דחוסה, שורות כתיבה, או שורת בוררים. */
  readonly layout: 'icons' | 'items' | 'fonts';
  /** שם נגיש למקטע. אינו מוצג — הכרטיס נקי מכותרות. */
  readonly label: string;
  readonly entries: readonly ContextMenuEntry[];
  /** רק ב-`layout: 'fonts'`. מקטע לעולם אינו מערבב כפתורים ובוררים. */
  readonly controls?: readonly ContextMenuControl[];
}

/** מה שנקרא ברגע הפתיחה. שלוש שאלות, ולא ה-slice של המנוע. */
export interface ContextMenuSnapshot {
  readonly hasDocument: boolean;
  /** `true` = בחירת טווח. סמן מכווץ הוא `false`. */
  readonly hasRange: boolean;
  /**
   * `storyType` של הבחירה — נמדד כ-`{"kind":"story","storyType":"body"}`.
   * `null` = הקריאה לא הצליחה, ואז מתייחסים לגוף המסמך: המנוע נכשל סגור עם
   * הודעה בעברית, וזה עדיף על תפריט שמסתיר פריטים בגלל קריאה שלא חזרה.
   */
  readonly storyType: string | null;
  /**
   * המילה שבדיקת האיות סימנה מתחת לנקודה שנלחצה, או `null` — גם כשהבדיקה
   * כבויה. זה המקור היחיד ל„הוסף למילון”: תפריט שמציע להוסיף את מה שאינו
   * מסומן היה מציע לתקן משהו שאינו שבור.
   */
  readonly misspelledWord: string | null;
  readonly can: (question: DocCapabilityQuestion) => boolean;
}

/** הבחירה בגוף המסמך, ולא בכותרת עליונה או תחתונה. */
function inBody(snapshot: ContextMenuSnapshot): boolean {
  return snapshot.storyType === null || snapshot.storyType === 'body';
}

/**
 * שורת הלוח. „גזור” הוא סדרוּר **ומחיקה** — מנוע שיודע רק להעתיק משאיר את
 * „העתק” פעיל ואת „גזור” מנוטרל, בדיוק כמו ברצועה.
 */
function clipboardSection(snapshot: ContextMenuSnapshot): ContextMenuSection {
  const canCopy = snapshot.hasRange && snapshot.can('canCopySelection');
  const canCut = canCopy && snapshot.can('canDeleteSelection');

  return {
    id: 'clipboard',
    layout: 'icons',
    label: 'לוח',
    entries: [
      { id: 'cut', label: 'גזירה', icon: 'cut', shortcutId: 'cut', run: { kind: 'clipboard', op: 'cut' }, disabled: !canCut },
      { id: 'copy', label: 'העתקה', icon: 'copy', shortcutId: 'copy', run: { kind: 'clipboard', op: 'copy' }, disabled: !canCopy },
      { id: 'paste', label: 'הדבקה', icon: 'paste', shortcutId: 'paste', run: { kind: 'clipboard', op: 'paste' }, disabled: !snapshot.can('canPasteContent') },
      { id: 'format-painter', label: 'מברשת עיצוב', icon: 'formatPainter', shortcutId: 'format-painter', run: { kind: 'command', command: 'copy-format' }, toggle: true },
    ],
  };
}

/**
 * גופן וגודל.
 *
 * למה כאן ולא רק ברצועה: זה הפקד שהמשתמש מבקש הכי הרבה בלחיצה ימנית על מילה,
 * והדרך אליו ברצועה עוברת בלשונית שאולי אינה הפעילה. ומה שחשוב לא פחות —
 * המצב שהוא מציג **אינו** משלו: `FONT_MEMORY` מסופק מהמעטפת, ולכן מה שהרצועה
 * מציגה הוא מה שהתפריט מציג, וגופן שהוחל מכאן מופיע שם מיד. ראו
 * composables/use-font-controls.ts.
 *
 * המקטע אינו מותנה בבחירה ואינו מותנה ב-`storyType`: גופן חל גם על סמן מכווץ
 * (הוא קובע את מה שיוקלד) וגם בכותרת עליונה. מה שכן מנטרל אותו הוא המנוע
 * עצמו, דרך `CommandState` של הפקד — כמו ברצועה.
 */
function fontsSection(): ContextMenuSection {
  return {
    id: 'fonts',
    layout: 'fonts',
    label: 'גופן',
    entries: [],
    controls: ['font-family', 'font-size'],
  };
}

/**
 * שורת העיצוב. שבעה אייקונים — כולם פקודות מנוע, כלומר המצב שלהם חי ואינו
 * מנוחש כאן. צבע גופן וצבע הדגשה אינם כאן בכוונה: ברצועה הם פופאובר, ופופאובר
 * בתוך תפריט הקשר הוא החלטה נפרדת (גל 3).
 */
function formatSection(): ContextMenuSection {
  return {
    id: 'format',
    layout: 'icons',
    label: 'עיצוב',
    entries: [
      { id: 'bold', label: 'מודגש', icon: 'bold', shortcutId: 'bold', run: { kind: 'command', command: 'bold' }, toggle: true },
      { id: 'italic', label: 'נטוי', icon: 'italic', shortcutId: 'italic', run: { kind: 'command', command: 'italic' }, toggle: true },
      { id: 'underline', label: 'קו תחתון', icon: 'underline', shortcutId: 'underline', run: { kind: 'command', command: 'underline' }, toggle: true },
      { id: 'strikethrough', label: 'קו חוצה', icon: 'strikethrough', shortcutId: 'strikethrough', run: { kind: 'command', command: 'strikethrough' }, toggle: true },
      { id: 'clear-formatting', label: 'ניקוי עיצוב', icon: 'clearFormatting', shortcutId: 'clear-formatting', run: { kind: 'command', command: 'clear-formatting' } },
      { id: 'bullet-list', label: 'רשימת תבליטים', icon: 'bulletList', run: { kind: 'command', command: 'bullet-list' }, toggle: true },
      { id: 'numbered-list', label: 'רשימה ממוספרת', icon: 'numberList', run: { kind: 'command', command: 'numbered-list' }, toggle: true },
      // כיווניות הפסקה **אינה** כאן, אף שהייתה: היא נשארת ברצועה (Ctrl+Shift+X
      // / Ctrl+Shift+Y ברג'יסטרי הקיצורים), ובכרטיס הזה היא תפסה שני אייקונים
      // בשורה שאמורה להיות שורת העיצוב של הטקסט המסומן — בזמן שהיא מדברת על
      // הפסקה כולה. הוסרה לבקשת המשתמש.
    ],
  };
}

/**
 * פריטי ההוספה. „הערת שוליים” ו„ציטוט מהקורא” **מוסתרים** בכותרת עליונה או
 * תחתונה ולא מנוטרלים: הם אינם „לא זמינים כרגע”, הם פשוט אינם שייכים לשם.
 */
function insertSection(snapshot: ContextMenuSnapshot): ContextMenuSection {
  const entries: ContextMenuEntry[] = [
    {
      id: 'link',
      label: 'קישור…',
      icon: 'link',
      shortcutId: 'link',
      run: { kind: 'action', action: 'link' },
      disabled: !snapshot.can('canInsertLink'),
    },
  ];

  if (inBody(snapshot)) {
    entries.push({
      id: 'footnote',
      label: 'הערת שוליים',
      icon: 'footnote',
      shortcutId: 'footnote',
      run: { kind: 'action', action: 'footnote' },
      disabled: !snapshot.can('canInsertFootnote'),
    });
  }

  return { id: 'insert', layout: 'items', label: 'הוספה', entries };
}

/**
 * אוצריא. „ציטוט מהקורא” הוא הפעולה שהתוסף כולו נבנה סביבה, ולכן היא בתפריט
 * ולא רק ברצועה — לחיצה ימנית במקום שאליו הציטוט אמור להיכנס היא הדרך הקצרה
 * ביותר אליה.
 */
function otzariaSection(snapshot: ContextMenuSnapshot): ContextMenuSection {
  const entries: ContextMenuEntry[] = [];

  if (inBody(snapshot)) {
    entries.push({
      id: 'insert-citation',
      label: 'ציטוט מהקורא',
      icon: 'otzaria',
      shortcutId: 'insert-citation',
      run: { kind: 'action', action: 'insert-citation' },
    });
  }
  entries.push({
    id: 'search-otzaria',
    label: 'חיפוש בספרייה…',
    icon: 'book',
    shortcutId: 'search-otzaria',
    run: { kind: 'action', action: 'search-otzaria' },
  });

  return { id: 'otzaria', layout: 'items', label: 'אוצריא', entries };
}

/**
 * „הוסף למילון”. מקטע משלו ובראש התפריט, כמו ב-Word: כשהלחיצה נחתה על מילה
 * מסומנת, זו הסיבה שהמשתמש לחץ שם.
 */
function dictionarySection(word: string): ContextMenuSection {
  return {
    id: 'dictionary',
    layout: 'items',
    label: 'איות',
    entries: [
      {
        id: 'add-to-dictionary',
        label: `הוסף את „${word}” למילון`,
        icon: 'proofing',
        run: { kind: 'dictionary', word },
      },
    ],
  };
}

/** עריכה כללית. „בחירת הכול” עוברת ב-`ranges.resolve`, ולכן זו היכולת שנשאלת. */
function editSection(snapshot: ContextMenuSnapshot): ContextMenuSection {
  return {
    id: 'edit',
    layout: 'items',
    label: 'עריכה',
    entries: [
      {
        id: 'find',
        label: 'חיפוש והחלפה…',
        icon: 'search',
        shortcutId: 'find',
        run: { kind: 'action', action: 'find' },
      },
      {
        id: 'select-all',
        label: 'בחירת הכול',
        icon: 'select',
        shortcutId: 'select-all',
        run: { kind: 'action', action: 'select-all' },
        disabled: !snapshot.can('canResolveRange'),
      },
    ],
  };
}

/**
 * המקטעים, לפי הסדר שבו הם מצוירים. רשימה ריקה = אין תפריט כלל, וזה המצב
 * כשאין מסמך: כרטיס עם שבעה פקדים מנוטרלים אינו מידע, הוא רעש.
 */
export function contextMenuModel(snapshot: ContextMenuSnapshot): readonly ContextMenuSection[] {
  if (!snapshot.hasDocument) return [];

  const sections = [
    ...(snapshot.misspelledWord ? [dictionarySection(snapshot.misspelledWord)] : []),
    clipboardSection(snapshot),
    fontsSection(),
    formatSection(),
    insertSection(snapshot),
    otzariaSection(snapshot),
    editSection(snapshot),
  ];

  // מקטע ריק אינו מצויר, וזה נמדד לפי **מה שיש בו**: שורת הגופן אינה מחזיקה
  // פריטים כלל, ומקטע פריטים אינו מחזיק בוררים.
  return sections.filter(
    (section) => section.entries.length > 0 || (section.controls?.length ?? 0) > 0,
  );
}

/** כל הפריטים ברצף. */
export function contextMenuEntries(
  sections: readonly ContextMenuSection[],
): readonly ContextMenuEntry[] {
  return sections.flatMap((section) => section.entries);
}

/**
 * מזהי כל מה שמקבל מיקוד, בסדר שבו החצים עוברים עליו — פריטים **ובוררים**.
 *
 * למה הבוררים בפנים: בכרטיס הזה Tab סוגר (ContextMenu.vue), כלומר החצים הם
 * הדרך היחידה להגיע לפקד. בורר שאינו ברשימה הזאת הוא בורר שקיים לעכבר בלבד.
 */
export function contextMenuFocusOrder(
  sections: readonly ContextMenuSection[],
): readonly string[] {
  return sections.flatMap((section) => [
    ...section.entries.map((entry) => entry.id),
    ...(section.controls ?? []),
  ]);
}
