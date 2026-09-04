/**
 * ההמרות שסביב חוזה ה-payload.
 *
 * החוזה עצמו נבדק מול הוולידטורים של החבילה
 * (tests/contract/command-payloads.test.ts). כאן נבדק מה ששייך לנו: קריאת
 * הערכים שהמנוע מדווח אל הצורה שהבורר מציג, וסולם הגדלים של Word.
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FONT_SIZE_PT,
  EMBEDDABLE_IMAGE_EXTENSIONS,
  WORD_FONT_SIZES,
  grownFontSize,
  imageMimeForFileName,
  imagePayload,
  isEmbeddableImageSrc,
  linkPayload,
  normalizeLinkHref,
  parseColor,
  parseFontFamily,
  parseFontSizeInput,
  parseFontSizePt,
  parseLineHeight,
  shrunkFontSize,
  LINK_SCHEMES,
} from '../../src/engine/payloads';

describe('parseFontSizePt', () => {
  it('קורא את שתי הצורות שהמנוע מדווח בהן', () => {
    // `fontSizePt` מדווח מחרוזת של מספר; `fontSize` במסמך עשוי לשאת `pt`.
    expect(parseFontSizePt('12')).toBe(12);
    expect(parseFontSizePt(12)).toBe(12);
    expect(parseFontSizePt('12pt')).toBe(12);
    expect(parseFontSizePt('12 PT')).toBe(12);
    expect(parseFontSizePt('20.5')).toBe(20.5);
  });

  it('בחירה מעורבת מדווחת undefined ואין ממה לקרוא', () => {
    expect(parseFontSizePt(undefined)).toBeNull();
    expect(parseFontSizePt(null)).toBeNull();
    expect(parseFontSizePt('')).toBeNull();
    expect(parseFontSizePt('pt')).toBeNull();
    expect(parseFontSizePt(0)).toBeNull();
    expect(parseFontSizePt(-12)).toBeNull();
  });
});

describe('parseFontFamily', () => {
  it('שם גופן, בלי רווחים מסביב', () => {
    expect(parseFontFamily('  FrankRuhlCLM ')).toBe('FrankRuhlCLM');
    expect(parseFontFamily('Times New Roman')).toBe('Times New Roman');
  });

  it('אין ערך = null, ולא מחרוזת ריקה שהמנוע ידחה', () => {
    expect(parseFontFamily(undefined)).toBeNull();
    expect(parseFontFamily('   ')).toBeNull();
    expect(parseFontFamily(12)).toBeNull();
  });
});

describe('parseColor', () => {
  it('קורא #RRGGBB וגם RRGGBB — המסמך לא בהכרח כותב את ה-#', () => {
    expect(parseColor('#0055ff')).toBe('#0055FF');
    expect(parseColor('0055FF')).toBe('#0055FF');
    expect(parseColor(' #abcdef ')).toBe('#ABCDEF');
  });

  it('מה שאינו צבע מוחזר כ-null', () => {
    expect(parseColor(undefined)).toBeNull();
    expect(parseColor('')).toBeNull();
    expect(parseColor('#fff')).toBeNull();
    expect(parseColor('red')).toBeNull();
  });
});

describe('parseLineHeight', () => {
  it('240ths של שורה חוזרים למכפיל', () => {
    // אותו גבול שהמנוע משתמש בו: מעל 10 זה 240ths, מתחת לזה כבר מכפיל.
    expect(parseLineHeight(240)).toBe(1);
    expect(parseLineHeight(360)).toBe(1.5);
    expect(parseLineHeight(480)).toBe(2);
    expect(parseLineHeight(276)).toBe(1.15);
  });

  it('מכפיל נשאר מכפיל', () => {
    expect(parseLineHeight(1.5)).toBe(1.5);
    expect(parseLineHeight('2.0')).toBe(2);
  });

  it('מה שאינו מרווח מוחזר כ-null', () => {
    expect(parseLineHeight(undefined)).toBeNull();
    expect(parseLineHeight(0)).toBeNull();
    expect(parseLineHeight('אוטומטי')).toBeNull();
  });
});

describe('סולם הגדלים של Word', () => {
  it('הגדלה נעה על הסולם ולא ב-+2 עיוור', () => {
    expect(grownFontSize(12)).toBe(14);
    expect(grownFontSize(20)).toBe(24);
    expect(grownFontSize(28)).toBe(36);
    expect(grownFontSize(48)).toBe(72);
  });

  it('הקטנה נעה על הסולם', () => {
    expect(shrunkFontSize(14)).toBe(12);
    expect(shrunkFontSize(24)).toBe(20);
    expect(shrunkFontSize(36)).toBe(28);
  });

  it('גודל שאינו בסולם עולה ויורד לשכן הקרוב אליו בכיוון הנכון', () => {
    // 20.5 הוא מה שהמנוע מדווח על טקסט כזה, ו-13 מגיע ממסמכים אמיתיים.
    expect(grownFontSize(20.5)).toBe(24);
    expect(shrunkFontSize(20.5)).toBe(20);
    expect(grownFontSize(13)).toBe(14);
    expect(shrunkFontSize(13)).toBe(12);
  });

  it('הקצוות אינם נחרגים — 72 ו-8 הם מה שהבורר מציג', () => {
    expect(grownFontSize(72)).toBe(72);
    expect(grownFontSize(200)).toBe(72);
    expect(shrunkFontSize(8)).toBe(8);
    expect(shrunkFontSize(4)).toBe(8);
  });

  it('הסולם הוא של Word, וברירת המחדל עליו', () => {
    expect(WORD_FONT_SIZES).toEqual([8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72]);
    expect(WORD_FONT_SIZES).toContain(DEFAULT_FONT_SIZE_PT);
  });
});

describe('parseFontSizeInput — גודל שהוקלד בתיבה', () => {
  it('גודל שאינו בסולם מתקבל כמות שהוא — זה כל מה שההקלדה נועדה לה', () => {
    expect(parseFontSizeInput('13')).toBe(13);
    expect(parseFontSizeInput('15')).toBe(15);
    expect(parseFontSizeInput('10.5')).toBe(10.5);
    expect(parseFontSizeInput('13pt')).toBe(13);
  });

  it('מעוגל לחצי נקודה — `w:sz` הוא חצאי נקודות, ותיבה לא תציג מה שלא נכתב', () => {
    expect(parseFontSizeInput('12.3')).toBe(12.5);
    expect(parseFontSizeInput('12.1')).toBe(12);
    expect(parseFontSizeInput('0.2')).toBe(1);
  });

  it('מהודק לטווח של המסמך במקום דיאלוג שגיאה', () => {
    expect(parseFontSizeInput('5000')).toBe(1638);
    expect(parseFontSizeInput('1638')).toBe(1638);
    expect(parseFontSizeInput('1')).toBe(1);
  });

  it('מה שאינו גודל אינו מוחל — התיבה חוזרת למסמך', () => {
    expect(parseFontSizeInput('')).toBeNull();
    expect(parseFontSizeInput('גדול')).toBeNull();
    expect(parseFontSizeInput('0')).toBeNull();
    expect(parseFontSizeInput('-12')).toBeNull();
    expect(parseFontSizeInput('NaN')).toBeNull();
    expect(parseFontSizeInput('Infinity')).toBeNull();
    // `\d` הוא ASCII בלבד, ולכן ספרות ערביות-הודיות אינן גודל.
    expect(parseFontSizeInput('١٢')).toBeNull();
  });

  it('פסיק עשרוני הוא עשרוני — „12,5” אינו 12', () => {
    // הפסיק הוא סימן העשרוני של המקלדת העברית, ו-`parseFloat` בלע אותו
    // בשקט: „12,5” יצא 12 בלי שום סימן שהחצי נעלם.
    expect(parseFontSizeInput('12,5')).toBe(12.5);
    expect(parseFontSizeInput('12,25')).toBe(12.5);
    expect(parseFontSizeInput('12,5pt')).toBe(12.5);
    expect(parseFontSizeInput(',5')).toBe(1);
  });

  it('זנב שאינו pt נדחה, ולא נבלע — פענוח חלקי הוא מה שהסתיר את הפסיק', () => {
    expect(parseFontSizeInput('12px')).toBeNull();
    expect(parseFontSizeInput('12abc')).toBeNull();
    expect(parseFontSizeInput('1 2')).toBeNull();
    expect(parseFontSizeInput('12.5.5')).toBeNull();
  });

  it('ומה שהיה תקין נשאר תקין: `pt`, רווחים מסביב, ונקודה בלי שלם', () => {
    expect(parseFontSizeInput('12pt')).toBe(12);
    expect(parseFontSizeInput('  12  ')).toBe(12);
    expect(parseFontSizeInput(' 12 pt ')).toBe(12);
    expect(parseFontSizeInput('12PT')).toBe(12);
    expect(parseFontSizeInput('.5')).toBe(1);
    expect(parseFontSizeInput('0.4')).toBe(1);
    expect(parseFontSizeInput('12.25')).toBe(12.5);
    expect(parseFontSizeInput('1638.4')).toBe(1638);
  });
});

describe('imageMimeForFileName', () => {
  it('שתי הסיומות שהמנוע מטמיע, ללא תלות ברישיות', () => {
    expect(imageMimeForFileName('ציון.png')).toBe('image/png');
    expect(imageMimeForFileName('a.PNG')).toBe('image/png');
    expect(imageMimeForFileName('a.jpg')).toBe('image/jpeg');
    expect(imageMimeForFileName('a.JPEG')).toBe('image/jpeg');
  });

  it('כל השאר null — כולל webp, שהמנוע פורס ואז דוחה במפורש', () => {
    expect(imageMimeForFileName('a.webp')).toBeNull();
    expect(imageMimeForFileName('a.gif')).toBeNull();
    expect(imageMimeForFileName('a.bmp')).toBeNull();
    expect(imageMimeForFileName('a.svg')).toBeNull();
    expect(imageMimeForFileName('a.tiff')).toBeNull();
    expect(imageMimeForFileName('בלי-סיומת')).toBeNull();
    expect(imageMimeForFileName('')).toBeNull();
  });

  it('רשימת הסיומות של הבורר וההמרה מסכימות', () => {
    // בורר שמציע סיומת שההמרה תדחה = דיאלוג שנפתח כדי להיכשל.
    for (const extension of EMBEDDABLE_IMAGE_EXTENSIONS) {
      expect(imageMimeForFileName(`a.${extension}`), extension).not.toBeNull();
    }
  });
});

describe('isEmbeddableImageSrc', () => {
  it('data URI של PNG או JPEG בבסיס 64', () => {
    expect(isEmbeddableImageSrc('data:image/png;base64,iVBORw==')).toBe(true);
    expect(isEmbeddableImageSrc('data:image/jpeg;base64,/9j/4AA=')).toBe(true);
  });

  it('URL נדחה — זו בדיוק נקודת אובדן הנתונים', () => {
    // `create.image` היה מחזיר INVALID_INPUT עם הודעה באנגלית; וגם אילו קיבל,
    // הפורט של ה-loopback משתנה בכל הפעלה והתמונה נשברת.
    expect(isEmbeddableImageSrc('http://127.0.0.1:51763/file/abc')).toBe(false);
    expect(isEmbeddableImageSrc('file:///C:/Users/a/b.png')).toBe(false);
    expect(isEmbeddableImageSrc('https://example.com/a.png')).toBe(false);
  });

  it('פורמט שהמנוע אינו מטמיע נדחה כאן ולא שם', () => {
    expect(isEmbeddableImageSrc('data:image/webp;base64,UklGRg==')).toBe(false);
    expect(isEmbeddableImageSrc('data:image/gif;base64,R0lGOD==')).toBe(false);
    expect(isEmbeddableImageSrc('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false);
  });

  it('data URI שאינו base64 או ריק נדחה', () => {
    expect(isEmbeddableImageSrc('data:image/png,abc')).toBe(false);
    expect(isEmbeddableImageSrc('data:image/png;base64,')).toBe(false);
    expect(isEmbeddableImageSrc('data:image/png;base64,לא-base64')).toBe(false);
    expect(isEmbeddableImageSrc('')).toBe(false);
    expect(isEmbeddableImageSrc(undefined)).toBe(false);
  });
});

describe('imagePayload', () => {
  it('המפתח הוא src — זה מה ש-executeCreateCommand מחלץ', () => {
    expect(imagePayload({ src: 'data:image/png;base64,iVBORw==' })).toEqual({
      src: 'data:image/png;base64,iVBORw==',
    });
  });

  it('alt נשלח בלי title: ערך אחד ממלא את שני שדות ה-OOXML', () => {
    expect(imagePayload({ src: 'data:image/png;base64,iVBORw==', alt: '  ציון  ' })).toEqual({
      src: 'data:image/png;base64,iVBORw==',
      alt: 'ציון',
    });
  });

  it('alt ריק אינו נשלח בכלל', () => {
    expect(imagePayload({ src: 'data:image/png;base64,iVBORw==', alt: '   ' })).toEqual({
      src: 'data:image/png;base64,iVBORw==',
    });
  });

  it('src שהמנוע ידחה מחזיר null ולא payload שייכשל סגור', () => {
    // הבדיקה שנכשלת על הצורה השגויה: `run('image')` בלי src, ו-src שהוא URL.
    expect(imagePayload({ src: '' })).toBeNull();
    expect(imagePayload({ src: 'http://127.0.0.1:1/i' })).toBeNull();
    expect(imagePayload({ src: 'data:image/webp;base64,UklGRg==' })).toBeNull();
  });
});

describe('normalizeLinkHref', () => {
  it('http, https ו-mailto מותרים', () => {
    expect(normalizeLinkHref('https://otzaria.org/a')).toBe('https://otzaria.org/a');
    expect(normalizeLinkHref('http://127.0.0.1:8080/a')).toBe('http://127.0.0.1:8080/a');
    expect(normalizeLinkHref('mailto:info@otzaria.org')).toBe('mailto:info@otzaria.org');
  });

  it('otzaria:// מותר — קישור פנימי לספרייה', () => {
    expect(normalizeLinkHref('otzaria://open/book/12?index=57')).toBe(
      'otzaria://open/book/12?index=57',
    );
    expect(normalizeLinkHref('  otzaria://open/pdf/8?page=3  ')).toBe(
      'otzaria://open/pdf/8?page=3',
    );
  });

  it('javascript: נדחה — זו בעיית אבטחה ולא כתובת חסרת טעם', () => {
    // הקישור נשמר במסמך, והמסמך נפתח אצל מישהו אחר. `javascript:` שם הוא
    // הרצת קוד בהקשר שלו.
    expect(normalizeLinkHref('javascript:alert(1)')).toBeNull();
    expect(normalizeLinkHref('JavaScript:alert(1)')).toBeNull();
    // `new URL` משמיט תווי בקרה בפרסור, ולכן הצורה הזאת מתפרשת כ-javascript:
    // ובדיקת תחילית על המחרוזת הגולמית הייתה מאשרת אותה.
    expect(normalizeLinkHref('java\nscript:alert(1)')).toBeNull();
    expect(normalizeLinkHref('java\tscript:alert(1)')).toBeNull();
    expect(normalizeLinkHref('  javascript:alert(1)')).toBeNull();
  });

  it('סכימות נוספות שאינן ברשימת ההיתר נדחות', () => {
    expect(normalizeLinkHref('data:text/html,<script>x</script>')).toBeNull();
    expect(normalizeLinkHref('vbscript:msgbox(1)')).toBeNull();
    expect(normalizeLinkHref('file:///C:/Users/a/b.txt')).toBeNull();
    expect(normalizeLinkHref('tel:+972500000000')).toBeNull();
  });

  it('כתובת ריקה או חסרת סכימה אינה נשלחת למנוע', () => {
    expect(normalizeLinkHref('')).toBeNull();
    expect(normalizeLinkHref('   ')).toBeNull();
    expect(normalizeLinkHref('www.otzaria.org')).toBeNull();
    expect(normalizeLinkHref('otzaria.org/a')).toBeNull();
    expect(normalizeLinkHref('/a/b')).toBeNull();
  });

  it('הצורה המוחזרת קנונית — זו שנבדקה, ולא מה שהוקלד', () => {
    expect(normalizeLinkHref('  https://otzaria.org  ')).toBe('https://otzaria.org/');
    expect(normalizeLinkHref('HTTPS://Otzaria.ORG')).toBe('https://otzaria.org/');
  });

  it('רשימת ההיתר היא רשימת היתר, ולא רשימת שלילה', () => {
    // אם מישהו יוסיף סכימה, הבדיקה הזאת היא זו שתדרוש ממנו להסביר למה.
    expect([...LINK_SCHEMES]).toEqual(['http:', 'https:', 'mailto:', 'otzaria:']);
  });
});

describe('linkPayload', () => {
  it('המפתח הוא href — `url` נבלע בשקט במנוע', () => {
    expect(linkPayload({ href: 'https://otzaria.org/a' })).toEqual({
      href: 'https://otzaria.org/a',
    });
  });

  it('טקסט להצגה נשלח כשיש, ומנוקה מרווחים', () => {
    expect(linkPayload({ href: 'https://otzaria.org/a', text: '  אוצריא  ' })).toEqual({
      href: 'https://otzaria.org/a',
      text: 'אוצריא',
    });
  });

  it('טקסט ריק אינו נשלח — המנוע נופל לכתובת עצמה', () => {
    expect(linkPayload({ href: 'https://otzaria.org/a', text: '   ' })).toEqual({
      href: 'https://otzaria.org/a',
    });
  });

  it('היעד שנתפס מהבחירה נשלח כמו שהוא', () => {
    // לא נבנה מחדש: המנוע מכיר שלוש צורות של target, ובנייה מחדש הייתה
    // מקבעת אצלנו אחת מהן.
    const target = { kind: 'text', segments: [{ blockId: 'p1', range: { start: 0, end: 4 } }] };

    expect(linkPayload({ href: 'https://otzaria.org', target })).toEqual({
      href: 'https://otzaria.org/',
      target,
    });
  });

  it('כתובת פסולה מחזירה null ולא payload שייכשל סגור', () => {
    expect(linkPayload({ href: '' })).toBeNull();
    expect(linkPayload({ href: 'javascript:alert(1)' })).toBeNull();
    expect(linkPayload({ href: 'www.otzaria.org' })).toBeNull();
    // גם עם טקסט ויעד תקינים: הכתובת היא מה שקובע.
    expect(
      linkPayload({ href: 'not a url', text: 'אוצריא', target: { kind: 'text', segments: [] } }),
    ).toBeNull();
  });
});
