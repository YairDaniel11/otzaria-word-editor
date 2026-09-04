/**
 * רישום כלי „שולחן העורך” על ערכת המאקרו: כל הכלים נרשמים, ריצה מוצלחת
 * מדווחת סיכום לשורת המצב, וכשל חוזר כ-outcome כושל.
 */
import { describe, expect, it } from 'vitest';
import type { BuiltinTool, MacroKit } from 'superdoc-macros';
import { registerShulchanTools } from '../../src/engine/shulchan/tools-registration';
import { fakeShulchanHost } from './shulchan-fake';

/** כפיל מינימלי של MacroKit — רק `registerTool`, שהוא כל מה שהרישום צורך. */
function fakeKit(): { kit: MacroKit; tools: BuiltinTool[] } {
  const tools: BuiltinTool[] = [];
  const kit = { registerTool: (tool: BuiltinTool) => tools.push(tool) } as unknown as MacroKit;
  return { kit, tools };
}

describe('shulchan/tools-registration', () => {
  it('רושם את כל הכלים עם מזהים יציבים', () => {
    const { kit, tools } = fakeKit();
    registerShulchanTools(kit, () => null, () => undefined);

    expect(tools.map((tool) => tool.id)).toEqual([
      'shulchan.typos',
      'shulchan.copy-fix',
      'shulchan.text-alternating',
      'shulchan.brackets-to-notes',
      'shulchan.notes-to-brackets',
      'shulchan.first-word',
      'shulchan.first-word-remove',
      'shulchan.line-spacing',
      'shulchan.line-spacing-remove',
    ]);
    expect(tools.every((tool) => tool.name.startsWith('שולחן העורך: '))).toBe(true);
  });

  it('ריצה מוצלחת מחזירה ok ומדווחת סיכום; כשל חוזר עם הודעה', async () => {
    const { kit, tools } = fakeKit();
    const summaries: string[] = [];
    const { host } = fakeShulchanHost({ blocks: [{ blockId: 'p1', text: 'פתיחה. ואמרו: המשך.' }] });
    registerShulchanTools(kit, () => host, (text) => summaries.push(text));

    const alternating = tools.find((tool) => tool.id === 'shulchan.text-alternating')!;
    const ok = await alternating.run();
    expect(ok).toEqual({ ok: true });
    expect(summaries).toEqual(['הודגשו 2 קטעים']);

    // בלי מסמך — outcome כושל עם הודעה, לא זריקה.
    const { kit: kit2, tools: tools2 } = fakeKit();
    registerShulchanTools(kit2, () => null, () => undefined);
    const failed = await tools2.find((tool) => tool.id === 'shulchan.typos')!.run();
    expect(failed.ok).toBe(false);
  });

  /* `registerTool` זורק על id כפול או שם פסול, והרישום יושב על מסלול פתיחת
     המסמך: חריגה שם הייתה מפילה פתיחה של מסמך בגלל לשונית כלים. */
  it('kit שדוחה רישום אינו מפיל את הקריאה', () => {
    const kit = {
      registerTool: () => {
        throw new Error('tool already registered');
      },
    } as unknown as MacroKit;

    expect(() => registerShulchanTools(kit, () => null, () => undefined)).not.toThrow();
  });
});
