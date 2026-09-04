import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

/**
 * הבדיקות אינן מרימות את מנוע ה-DOCX: הוא דורש workers ו-canvas אמיתיים,
 * ולכן ריצה חיה נבדקת בשערי Windows (docs/spike-windows.md) ולא ב-jsdom.
 * מה שכן נבדק כאן: חוזה ה-API של superdoc/ui, ה-registry של הפקודות,
 * האדפטרים שלנו מול כפילים — ומאז שיש @vue/test-utils גם הקומפוננטות עצמן
 * (tests/component), שמורכבות ב-jsdom ונלחצות באמת.
 *
 * ה-plugin של Vue נדרש בשביל אותן בדיקות: בלעדיו `import` של קובץ `.vue`
 * מגיע ל-esbuild כ-JavaScript ונופל על התבנית.
 */
export default defineConfig({
  plugins: [vue()],
  resolve: {
    // המודול הוירטואלי של התבנית נוצר רק ב-vite.config.ts; כאן תחליף ריק.
    alias: {
      'virtual:otzaria-blank-docx': fileURLToPath(new URL('./tests/support/blank-docx-stub.ts', import.meta.url)),
    },
  },
  test: {
    // jsdom, עם תיקון ל-webstorage של Node 22+. ראו את הקובץ.
    environment: './tests/support/jsdom-webstorage.ts',
    include: ['tests/**/*.test.ts'],
  },
});
