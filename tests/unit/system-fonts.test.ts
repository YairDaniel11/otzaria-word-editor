/**
 * מניית הגופנים של המכונה.
 *
 * מה שנבדק כאן הוא **סדר השכבות** וההכרעות שביניהן, לא המכונה: מארח שיודע
 * לענות מנצח, מדידה היא רשת הביטחון, והיעדר canvas אינו מייצר רשימה מנוחשת.
 * שלוש התלויות מוזרקות בדיוק מהטעם שבו `planFontAliases` מזריקה את `available`
 * — בדיקה שנשענת על canvas אמיתי בודקת את המכונה שהיא רצה עליה.
 */
import { describe, it, expect, vi } from 'vitest';
import type { tryCall } from '../../src/host/otzaria-client';
import {
  FONTS_PERMISSION,
  MEASURED_CANDIDATES,
  emptyInstalledFonts,
  loadInstalledFonts,
  type InstalledFont,
} from '../../src/engine/system-fonts';

const values = (options: readonly { value: string }[]) => options.map((option) => option.value);

/** מארח שמחזיר את מה שנתון לו. `null` = מארח שאינו מכיר את המתודה. */
function hostReturning(result: unknown): typeof tryCall {
  return (async () => result) as typeof tryCall;
}

/** מארח שנופל. `tryCall` אינו אמור לזרוק, אבל הקוד אינו נשען על זה. */
const hostThatThrows = (async () => {
  throw new Error('הגשר מת');
}) as typeof tryCall;

/** מכונה שיש בה בדיוק את השמות האלה. */
function machineWith(names: readonly string[]): (name: string) => boolean {
  const installed = new Set(names.map((name) => name.toLowerCase()));
  return (name) => installed.has(name.toLowerCase());
}

const nothingInstalled = () => false;
const everythingInstalled = () => true;

describe('loadInstalledFonts — מסלול המארח', () => {
  it('רשימת המארח מנצחת את המדידה, ומסומנת כמקורה', async () => {
    const snapshot = await loadInstalledFonts({
      call: hostReturning({
        platform: 'windows',
        families: [
          { name: 'Narkisim', scripts: ['hebrew'], monospace: false },
          { name: 'Bahnschrift', scripts: ['latin'], monospace: false },
        ],
      }),
      available: everythingInstalled,
      canMeasure: () => true,
    });

    expect(snapshot.source).toBe('host');
    expect(values(snapshot.families)).toEqual(['Bahnschrift', 'Narkisim']);
    expect(snapshot.hebrew.has('narkisim')).toBe(true);
    expect(snapshot.hebrew.has('bahnschrift')).toBe(false);
  });

  it('שם שהמארח מכיר והדפדפן אינו פותר נופל', async () => {
    // GDI מונה, DirectWrite מרנדר, והשניים אינם זהים לגמרי. שם שאינו נפתר
    // היה נבחר על ידי המשתמש ומותח כל שורה במסמך — ראו docx-fonts.ts.
    const snapshot = await loadInstalledFonts({
      call: hostReturning({
        platform: 'windows',
        families: [
          { name: 'David', scripts: ['hebrew'], monospace: false },
          { name: 'גופן שאינו קיים', scripts: ['hebrew'], monospace: false },
        ],
      }),
      available: machineWith(['David']),
      canMeasure: () => true,
    });

    expect(values(snapshot.families)).toEqual(['David']);
  });

  it('בלי canvas סומכים על המארח כמות שהוא', async () => {
    // הוא ספר את המכונה ואנחנו לא. ידיעה חלקית עדיפה על היעדר ידיעה.
    const snapshot = await loadInstalledFonts({
      call: hostReturning({
        platform: 'windows',
        families: [{ name: 'Narkisim', scripts: ['hebrew'], monospace: false }],
      }),
      available: nothingInstalled,
      canMeasure: () => false,
    });

    expect(snapshot.source).toBe('host');
    expect(values(snapshot.families)).toEqual(['Narkisim']);
  });

  it('שם ריק, שם כפול ווריאנט אנכי של CJK נופלים', async () => {
    // המפרט מבקש מהמארח לדלג על `@`, אבל רשימה שמגיעה מבחוץ אינה מקום לסמוך
    // על מפרט.
    const snapshot = await loadInstalledFonts({
      call: hostReturning({
        platform: 'windows',
        families: [
          { name: 'Arial', scripts: ['latin'], monospace: false },
          { name: '  arial  ', scripts: ['latin'], monospace: false },
          { name: '@MS Gothic', scripts: ['cjk'], monospace: true },
          { name: '   ', scripts: [], monospace: false },
        ],
      }),
      available: everythingInstalled,
      canMeasure: () => true,
    });

    expect(values(snapshot.families)).toEqual(['Arial']);
  });

  it('גופן ברוחב קבוע מקבל ערימת גיבוי של רוחב קבוע', async () => {
    const snapshot = await loadInstalledFonts({
      call: hostReturning({
        platform: 'windows',
        families: [{ name: 'Consolas', scripts: ['latin'], monospace: true }],
      }),
      available: everythingInstalled,
      canMeasure: () => true,
    });

    expect(snapshot.families[0]?.previewFamily).toBe('"Consolas", monospace');
  });

  it('הרשימה ממוינת, ועברית ממוינת בעברית', async () => {
    const snapshot = await loadInstalledFonts({
      call: hostReturning({
        platform: 'windows',
        families: [
          { name: 'Verdana', scripts: ['latin'], monospace: false },
          { name: 'Arial', scripts: ['latin'], monospace: false },
          { name: 'גופן ב', scripts: ['hebrew'], monospace: false },
          { name: 'גופן א', scripts: ['hebrew'], monospace: false },
        ],
      }),
      available: everythingInstalled,
      canMeasure: () => true,
    });

    const names = values(snapshot.families);
    expect(names.indexOf('Arial')).toBeLessThan(names.indexOf('Verdana'));
    expect(names.indexOf('גופן א')).toBeLessThan(names.indexOf('גופן ב'));
  });
});

describe('loadInstalledFonts — רשת הביטחון', () => {
  it('מארח שאינו מכיר את המתודה נופל למדידה', async () => {
    const snapshot = await loadInstalledFonts({
      call: hostReturning(null),
      available: machineWith(['David', 'Consolas']),
      canMeasure: () => true,
    });

    expect(snapshot.source).toBe('measured');
    expect(values(snapshot.families)).toEqual(['Consolas', 'David']);
    expect(snapshot.hebrew.has('david')).toBe(true);
  });

  it('מארח שמחזיר רשימה ריקה נחשב כמי שאינו יודע', async () => {
    // פלטפורמה שטרם מומשה מחזירה `families: []` ולא שגיאה. אין סיבה שהתוסף
    // יוותר על הקירוב רק מפני שהמארח ענה בנימוס.
    const snapshot = await loadInstalledFonts({
      call: hostReturning({ platform: 'linux', families: [] }),
      available: machineWith(['Georgia']),
      canMeasure: () => true,
    });

    expect(snapshot.source).toBe('measured');
    expect(values(snapshot.families)).toEqual(['Georgia']);
  });

  it('גשר שנופל אינו מפיל את הבורר', async () => {
    const snapshot = await loadInstalledFonts({
      call: hostThatThrows,
      available: machineWith(['Tahoma']),
      canMeasure: () => true,
    });

    expect(snapshot.source).toBe('measured');
    expect(values(snapshot.families)).toEqual(['Tahoma']);
  });

  it('בלי canvas ובלי מארח אין ניחוש — הבורר נשאר על הרשימה הקבועה', async () => {
    // זו ההכרעה ההפוכה מזו של `isFamilyAvailable`, ובכוונה: להציג עשרות שמות
    // שאיש אינו יודע אם קיימים גרוע מבורר קצר ואמיתי.
    const snapshot = await loadInstalledFonts({
      call: hostReturning(null),
      available: everythingInstalled,
      canMeasure: () => false,
    });

    expect(snapshot).toEqual(emptyInstalledFonts());
    expect(snapshot.source).toBe('none');
  });

  it('מכונה שאין בה אף מועמד מחזירה רשימה ריקה ולא נופלת', async () => {
    const snapshot = await loadInstalledFonts({
      call: hostReturning(null),
      available: nothingInstalled,
      canMeasure: () => true,
    });

    expect(snapshot.families).toEqual([]);
    expect(snapshot.source).toBe('measured');
  });
});

describe('MEASURED_CANDIDATES', () => {
  it('אין כפילות שם', () => {
    const keys = MEASURED_CANDIDATES.map((font: InstalledFont) => font.name.toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('הרשימה גדולה מספיק כדי להיות רשת ביטחון אמיתית', () => {
    expect(MEASURED_CANDIDATES.length).toBeGreaterThan(50);
  });

  it('גופני העברית של Windows ושל אוצריא מסומנים כעברית', () => {
    const hebrew = new Set(
      MEASURED_CANDIDATES.filter((font) => font.scripts?.includes('hebrew')).map(
        (font) => font.name,
      ),
    );
    for (const name of ['David', 'FrankRuehl', 'Narkisim', 'Assistant', 'NotoRashiHebrew']) {
      expect(hebrew.has(name)).toBe(true);
    }
  });

  it('כל מועמד נמדד — הוויתור על החוט אינו מדלג על אף שם', async () => {
    // מה שנבדק הוא שכל שם עבר בדיקה: `available` נספר, ולא רק שהתוצאה שלמה.
    const asked: string[] = [];
    const snapshot = await loadInstalledFonts({
      call: hostReturning(null),
      available: (name) => {
        asked.push(name);
        return true;
      },
      canMeasure: () => true,
    });
    expect(asked).toEqual(MEASURED_CANDIDATES.map((font) => font.name));
    expect(snapshot.families.length).toBe(MEASURED_CANDIDATES.length);
  });
});

describe('keepAvailable — הוויתור על החוט', () => {
  /**
   * הוויתור הוא על **תקציב זמן**, ולא על מספר שמות (`YIELD_BUDGET_MS`).
   *
   * זה מה שההבדל שווה: מדידה של משפחה מותקנת עולה ~15ms ושל שם שאינו קיים
   * כמעט כלום, ולכן מספר שמות קבוע אינו מייצג זמן קבוע. נמדד על 287 משפחות
   * מהמארח: ויתור כל 40 שמות נתן מקטע ארוך של 1357ms, וויתור כל 8ms נתן 68ms.
   *
   * העבודה האיטית נשרפת בזמן **אמיתי** ולא בשעון מוזרק: ריגול גלובלי על
   * `performance.now` הוא בדיוק השעון שבו vitest מודד את עצמו, ומדידת המשך של
   * הבדיקה יצאה ממנו מנופחת פי עשר. מה שנצפה הוא **חזרה לתור המאקרו**: משימה
   * שמתזמנת את עצמה מחדש יכולה לרוץ רק אם הלולאה ויתרה, ולכן המונה שלה הוא
   * עדות ישירה לוויתור — ולא לזמן שעבר.
   */
  it('הוויתור קורה כשהעבודה איטית, ואינו קורה כשהיא מהירה', async () => {
    const burn = (ms: number) => {
      const until = performance.now() + ms;
      while (performance.now() < until) {
        /* עבודה סינכרונית, כמו מדידת גופן */
      }
    };

    // רשימה מהמארח ולא `MEASURED_CANDIDATES`: 24 שמות מספיקים כדי להראות את
    // ההכרעה, ו-79 היו משלמים על כך 200ms של שרפה לחינם בכל ריצת בדיקות.
    const families = Array.from({ length: 24 }, (_, i) => ({ name: `Font ${i}` }));

    const run = async (msPerName: number) => {
      let interleaved = 0;
      let done = false;
      const pump = () => {
        if (done) return;
        interleaved += 1;
        setTimeout(pump, 0);
      };
      setTimeout(pump, 0);

      try {
        await loadInstalledFonts({
          call: hostReturning({ families, platform: 'windows' }),
          available: () => {
            if (msPerName > 0) burn(msPerName);
            return true;
          },
          canMeasure: () => true,
          // `document.fonts.ready` האמיתי היה מוסיף מאקרו-טיק שאינו שלנו.
          fontsReady: () => Promise.resolve(),
        });
      } finally {
        done = true;
      }
      return interleaved;
    };

    // 3ms לשם, תקציב 8 → ויתור כל שלושה שמות בערך, כלומר ~7 על 24.
    expect(await run(3)).toBeGreaterThan(3);
    // מדידה מיידית — אין שום סיבה לוותר, ולכן הלולאה רצה במקטע אחד.
    expect(await run(0)).toBe(0);
  });
});

describe('loadInstalledFonts — תשובות פגומות מהמארח', () => {
  it('`families` שאינו מערך נחשב כאין תשובה', async () => {
    const snapshot = await loadInstalledFonts({
      call: hostReturning({ platform: 'windows', families: 'הרבה' }),
      available: machineWith(['Georgia']),
      canMeasure: () => true,
    });
    expect(snapshot.source).toBe('measured');
    expect(values(snapshot.families)).toEqual(['Georgia']);
  });

  it('תשובה בלי `families` כלל אינה מפילה', async () => {
    const snapshot = await loadInstalledFonts({
      call: hostReturning({ platform: 'windows' }),
      available: machineWith(['Georgia']),
      canMeasure: () => true,
    });
    expect(snapshot.source).toBe('measured');
  });

  it('שורה בלי שם נדחית ואינה מפילה את השאר', async () => {
    const snapshot = await loadInstalledFonts({
      call: hostReturning({
        platform: 'windows',
        families: [{ scripts: ['latin'] }, { name: 'Arial', scripts: ['latin'] }],
      }),
      available: everythingInstalled,
      canMeasure: () => true,
    });
    expect(values(snapshot.families)).toEqual(['Arial']);
  });
});

describe('loadInstalledFonts — ההמתנה לגופנים המוזרקים', () => {
  it('לא מודדים לפני ש-`document.fonts.ready` נפתר', async () => {
    // גופן `@font-face` שטרם נטען מודד בדיוק כמו גופן הבסיס — כלומר „אינו
    // קיים”. מדידה מוקדמת מדי הייתה מוחקת בדיוק את גופני העברית של אוצריא.
    const order: string[] = [];
    // מחזיק ולא `let`: TS מצמצם משתנה שמשויך רק בתוך callback ל-`never`.
    const gateKeeper: { release: (() => void) | null } = { release: null };
    const gate = new Promise<void>((resolve) => {
      gateKeeper.release = () => {
        order.push('fonts-ready');
        resolve();
      };
    });

    const pending = loadInstalledFonts({
      call: hostReturning(null),
      canMeasure: () => true,
      fontsReady: () => gate,
      available: (name) => {
        order.push(`measured:${name}`);
        return false;
      },
    });

    // סבב מיקרו-משימות אחד: אילו המדידה לא הייתה ממתינה, היא כבר הייתה רצה.
    await Promise.resolve();
    expect(order).toEqual([]);

    gateKeeper.release?.();
    await pending;
    expect(order[0]).toBe('fonts-ready');
    expect(order.length).toBeGreaterThan(1);
  });

  it('המתנה שנכשלת אינה מונעת מדידה', async () => {
    const snapshot = await loadInstalledFonts({
      call: hostReturning(null),
      canMeasure: () => true,
      fontsReady: () => Promise.reject(new Error('אין document.fonts')),
      available: machineWith(['Tahoma']),
    });
    expect(values(snapshot.families)).toEqual(['Tahoma']);
  });

  it('בלי canvas אין המתנה בכלל — אין מה לחכות לו', async () => {
    let waited = false;
    await loadInstalledFonts({
      call: hostReturning({
        platform: 'windows',
        families: [{ name: 'Narkisim', scripts: ['hebrew'], monospace: false }],
      }),
      canMeasure: () => false,
      fontsReady: async () => {
        waited = true;
      },
      available: nothingInstalled,
    });
    expect(waited).toBe(false);
  });
});

describe('אבחון: למה המארח לא ענה', () => {
  /** מארח שמכיר את ההרשאות אך לא את מניית הגופנים. */
  function hostWithPermissions(permissions: string[] | null): typeof tryCall {
    return (async (method: string) => {
      if (method === 'app.getGrantedPermissions') {
        return permissions === null ? null : { permissions };
      }
      return null;
    }) as typeof tryCall;
  }

  it('הרשאה חסרה נאמרת בשם, עם מה שכן אושר', async () => {
    // הכשל הזה שקט לגמרי מבחינת המשתמש: הרשימה פשוט מתכווצת.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await loadInstalledFonts({
      call: hostWithPermissions(['fs.user_files.read']),
      available: nothingInstalled,
      canMeasure: () => true,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const said = warn.mock.calls.map((call) => String(call[0])).join(' ');
    expect(said).toContain(FONTS_PERMISSION);
    expect(said).toContain('אינה מאושרת');
    expect(said).toContain('fs.user_files.read');
    warn.mockRestore();
  });

  it('הרשאה מאושרת מפנה לגרסת המארח ולא להרשאות — ובנימה של דיווח, לא אזהרה', async () => {
    // `info` ולא `warn`: כל עוד המתודה אינה קיימת באוצריא זה המצב של כל
    // הפעלה, ואזהרה על מה שתמיד קורה היא מה שמאמן להתעלם מהקונסולה.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    await loadInstalledFonts({
      call: hostWithPermissions([FONTS_PERMISSION]),
      available: nothingInstalled,
      canMeasure: () => true,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const said = info.mock.calls.map((call) => String(call[0])).join(' ');
    expect(said).toContain('אינה מכירה את המתודה');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    info.mockRestore();
  });

  it('מארח שענה — אין אבחון ואין רעש', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await loadInstalledFonts({
      call: hostReturning({
        platform: 'windows',
        families: [{ name: 'Narkisim', scripts: ['hebrew'], monospace: false }],
      }),
      available: everythingInstalled,
      canMeasure: () => true,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('אבחון שנכשל אינו מפיל את המנייה', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const snapshot = await loadInstalledFonts({
      call: hostThatThrows,
      available: machineWith(['Tahoma']),
      canMeasure: () => true,
    });
    expect(values(snapshot.families)).toEqual(['Tahoma']);
    warn.mockRestore();
  });
});
