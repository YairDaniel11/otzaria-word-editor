/**
 * מה כתוב בטולטיפ.
 *
 * הטולטיפ החדש מציג שלושה שדות (כותרת, צירוף, הסבר), אבל 126 אתרי הקריאה
 * ברצועה מעבירים שניים — `label` ו-`tooltip`. הכלל שממפה ביניהם הוא ההחלטה
 * שאפשר לשבור בשקט: ב-„מברשת עיצוב” ה-`tooltip` הוא *הסבר*, וב-„מודגש” הוא
 * *שם*. אם הכלל יתהפך, כפתור „מודגש” יקבל טולטיפ ריק-כותרת — וזה נראה רק
 * בעין, ורק אם מרחפים דווקא עליו.
 *
 * `readTip` קוראת תכונות `data-tip-*` בלבד. שהיא **אינה** נופלת ל-`title` הוא
 * חלק מהחוזה ולא השמטה — ההסבר למטה, ליד הבדיקה עצמה.
 */
import { describe, expect, it } from 'vitest';
import {
  TIP_DESCRIPTION_ATTR,
  TIP_SHORTCUT_ATTR,
  TIP_TITLE_ATTR,
  readTip,
  tipParts,
} from '../../src/ui/tooltip/tooltip-content';

/** אלמנט עם תכונות, בלי להרכיב קומפוננטה. */
function elementWith(attributes: Record<string, string>): HTMLElement {
  const button = document.createElement('button');
  for (const [name, value] of Object.entries(attributes)) button.setAttribute(name, value);
  return button;
}

describe('tipParts', () => {
  it('תווית והסבר נפרדים — התווית היא הכותרת וה-tooltip יורד להסבר', () => {
    expect(
      tipParts({
        label: 'מברשת עיצוב',
        tooltip: 'העתק עיצוב ממקום אחד והחל במקום אחר',
        shortcut: 'Ctrl+Shift+C',
      }),
    ).toEqual({
      title: 'מברשת עיצוב',
      shortcut: 'Ctrl+Shift+C',
      description: 'העתק עיצוב ממקום אחד והחל במקום אחר',
    });
  });

  it('כפתור בלי תווית — ה-tooltip הוא הכותרת, ואין הסבר', () => {
    // אלה כפתורי האייקון שברצועה: `variant: 'icon-only'`, ו-tooltip שהוא שם.
    expect(tipParts({ tooltip: 'מודגש', shortcut: 'Ctrl+B' })).toEqual({
      title: 'מודגש',
      shortcut: 'Ctrl+B',
      description: '',
    });
  });

  it('tooltip זהה לתווית אינו הופך להסבר שמשכפל את הכותרת', () => {
    expect(tipParts({ label: 'הדבק', tooltip: 'הדבק' })).toEqual({
      title: 'הדבק',
      shortcut: '',
      description: '',
    });
  });

  it('description מפורש גובר על הגזירה', () => {
    expect(
      tipParts({ label: 'מודגש', tooltip: 'מודגש', description: 'מעבה את הטקסט הנבחר' }),
    ).toEqual({
      title: 'מודגש',
      shortcut: '',
      description: 'מעבה את הטקסט הנבחר',
    });
  });

  it('סיבת הנטרול יורדת להסבר, והכותרת נשארת שם הפקד', () => {
    // זה מה שקורה לכפתור מנוטרל: אתר הקריאה מחליף את ה-tooltip בסיבה. קודם
    // הסיבה *החליפה* את השם על הכפתור, ועכשיו היא מתווספת מתחתיו.
    expect(tipParts({ label: 'הדבק', tooltip: 'אין תוכן בלוח' })).toEqual({
      title: 'הדבק',
      shortcut: '',
      description: 'אין תוכן בלוח',
    });
  });

  it('רווחים מסביב נחתכים, ושדה שכולו רווחים נחשב חסר', () => {
    expect(tipParts({ label: '  שמור  ', tooltip: '   ' })).toEqual({
      title: 'שמור',
      shortcut: '',
      description: '',
    });
  });

  it('בלי שום מקור — אין תוכן', () => {
    expect(tipParts({})).toEqual({ title: '', shortcut: '', description: '' });
  });
});

describe('readTip', () => {
  it('קוראת את שלושת השדות מהתכונות שהרצועה מצהירה', () => {
    const element = elementWith({
      [TIP_TITLE_ATTR]: 'מברשת עיצוב',
      [TIP_SHORTCUT_ATTR]: 'Ctrl+Shift+C',
      [TIP_DESCRIPTION_ATTR]: 'העתק עיצוב ממקום אחד והחל במקום אחר',
    });

    expect(readTip(element)).toEqual({
      title: 'מברשת עיצוב',
      shortcut: 'Ctrl+Shift+C',
      description: 'העתק עיצוב ממקום אחד והחל במקום אחר',
    });
  });

  /**
   * זו הצהרה, לא השמטה. `title` הוא מה שמצייר את המלבן האפור של מערכת ההפעלה
   * מעל הכרטיס, ולכן הוא אינו קיים באף אלמנט בתוכנה — ואינו מקור לטולטיפ.
   * לו `readTip` הייתה נופלת אליו, פקד ששכחו להמיר היה מקבל *שני* טולטיפים
   * במקום להישאר בלי אחד, וזה בדיוק מה שהופך את השכחה לבלתי נראית.
   */
  it('פקד שכל תוכנו `title` אינו עוגן', () => {
    expect(readTip(elementWith({ title: 'מספר מילים במסמך' }))).toBeNull();
  });

  it('אלמנט בלי שום מקור אינו עוגן', () => {
    expect(readTip(elementWith({}))).toBeNull();
    expect(readTip(elementWith({ [TIP_TITLE_ATTR]: '   ' }))).toBeNull();
  });

  it('הסבר בלבד, בלי כותרת, עדיין עוגן', () => {
    expect(readTip(elementWith({ [TIP_DESCRIPTION_ATTR]: 'המסמך עדיין נטען' }))).toEqual({
      title: '',
      shortcut: '',
      description: 'המסמך עדיין נטען',
    });
  });
});
