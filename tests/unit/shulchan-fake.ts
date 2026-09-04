/**
 * כפיל משותף לבדיקות כלי „שולחן העורך”: מסמך בזיכרון — בלוקים עם טקסט,
 * בחירה, מודל runs, הערות שוליים ומקטעים — שמקליט כל קריאה של המנוע
 * ומחיל `replace`/`blocks.delete` על הטקסט המקומי, כדי שבדיקה תוכל לטעון
 * גם על מה נשלח וגם על הטקסט הסופי.
 */

export interface FakeBlock {
  blockId: string;
  text: string;
  nodeType?: string;
  /** `w:styleId` שהבלוק מדווח, כמו `blocks.list`. */
  styleId?: string;
}

export interface FakeRun {
  text: string;
  resolved?: Record<string, unknown>;
}

export interface FakeShulchanOptions {
  blocks?: FakeBlock[];
  /** מזהי הבלוקים שבבחירה. ברירת מחדל: כולם. `[]` = אין בחירה. */
  selected?: string[];
  /**
   * הטווח המסומן בכל בלוק שבבחירה. ברירת מחדל: הבלוק כולו. `{start,end}`
   * שווים = סמן בלבד (הכלים מרחיבים לפסקה השלמה).
   */
  selectionRanges?: Record<string, { start: number; end: number }>;
  /** runs למודל `doc.get()` — ברירת מחדל: run יחיד לכל בלוק בגופן 12pt. */
  runs?: Record<string, FakeRun[]>;
  /** ריווח פסקה למודל (בנקודות, כמו המנוע). */
  spacing?: Record<string, { before?: number; after?: number; line?: number; lineRule?: string }>;
  /** יישור פסקה במודל — ב-`resolved` כשמסומן כך, אחרת ב-`props`. */
  alignment?: Record<string, { value: string; resolved?: boolean }>;
  /** הערות שוליים לפי noteId. */
  notes?: Record<string, { type?: string; content: string }>;
  /** מיקומי הפניות הערות בגוף — מזין את `doc.find`. `undefined` = אין find. */
  refs?: { noteId: string; blockId: string; offset: number }[];
  sections?: {
    address?: unknown;
    pageSetup?: { width?: number; height?: number };
    margins?: { top?: number; right?: number; bottom?: number; left?: number };
    columns?: { count?: number; gap?: number; equalWidth?: boolean };
  }[];
}

export interface FakeCalls {
  replace: { blockId: string; start: number; end: number; text: string }[];
  inline: { blockId: string; start: number; end: number; inline: Record<string, unknown> }[];
  deletedBlocks: string[];
  insertedNotes: { type: string; content: string }[];
  removedNotes: string[];
  selectionApplied: unknown[];
  setSpacing: Record<string, unknown>[];
  setPageSetup: Record<string, unknown>[];
  setPageMargins: Record<string, unknown>[];
  setColumns: Record<string, unknown>[];
}

interface TargetLike {
  start: { blockId: string; offset: number };
  end: { blockId: string; offset: number };
}

export function fakeShulchanHost(options: FakeShulchanOptions = {}) {
  const blocks: FakeBlock[] = (options.blocks ?? []).map((block) => ({ ...block }));
  const selected = options.selected ?? blocks.map((block) => block.blockId);
  const notes = new Map(Object.entries(options.notes ?? {}));

  const calls: FakeCalls = {
    replace: [],
    inline: [],
    deletedBlocks: [],
    insertedNotes: [],
    removedNotes: [],
    selectionApplied: [],
    setSpacing: [],
    setPageSetup: [],
    setPageMargins: [],
    setColumns: [],
  };

  const textOf = (blockId: string): string => blocks.find((block) => block.blockId === blockId)?.text ?? '';

  const runsFor = (block: FakeBlock): unknown[] => {
    const runs = options.runs?.[block.blockId] ?? [
      { text: block.text, resolved: { fontSize: 12, fontSizeCs: 12, fontFamily: 'David' } },
    ];
    return runs.map((run) => ({ kind: 'run', run: { text: run.text, resolved: run.resolved } }));
  };

  const paragraphProps = (block: FakeBlock): { props: Record<string, unknown>; resolved?: Record<string, unknown> } => {
    const props: Record<string, unknown> = {};
    const spacing = options.spacing?.[block.blockId];
    if (spacing) props.spacing = spacing;
    const alignment = options.alignment?.[block.blockId];
    if (!alignment) return { props };
    if (alignment.resolved) return { props, resolved: { alignment: alignment.value } };
    props.alignment = alignment.value;
    return { props };
  };

  const rangeFor = (blockId: string): { start: number; end: number } =>
    options.selectionRanges?.[blockId] ?? { start: 0, end: textOf(blockId).length };

  const doc = {
    selection: {
      current: () => ({
        target: { segments: selected.map((blockId) => ({ blockId, range: rangeFor(blockId) })) },
      }),
    },
    blocks: {
      list: (input: { offset?: number; limit?: number }) => {
        const offset = input.offset ?? 0;
        const limit = input.limit ?? blocks.length;
        return {
          blocks: blocks.slice(offset, offset + limit).map((block) => ({
            nodeId: block.blockId,
            text: block.text,
            nodeType: block.nodeType ?? 'paragraph',
            ...(block.styleId ? { styleId: block.styleId } : {}),
          })),
        };
      },
      delete: (input: { target: { nodeId: string } }) => {
        calls.deletedBlocks.push(input.target.nodeId);
        const index = blocks.findIndex((block) => block.blockId === input.target.nodeId);
        if (index >= 0) blocks.splice(index, 1);
        return { success: true };
      },
    },
    get: () => ({
      body: blocks.map((block) => ({
        paragraphIds: { paraId: block.blockId },
        paragraph: {
          content: runsFor(block),
          ...paragraphProps(block),
        },
      })),
    }),
    replace: (input: { target: TargetLike; text: string }) => {
      const { blockId, offset: start } = input.target.start;
      const end = input.target.end.offset;
      calls.replace.push({ blockId, start, end, text: input.text });
      const block = blocks.find((entry) => entry.blockId === blockId);
      if (block) block.text = block.text.slice(0, start) + input.text + block.text.slice(end);
      return { success: true };
    },
    format: {
      apply: (input: { target: TargetLike; inline: Record<string, unknown> }) => {
        calls.inline.push({
          blockId: input.target.start.blockId,
          start: input.target.start.offset,
          end: input.target.end.offset,
          inline: input.inline,
        });
        return { success: true };
      },
      paragraph: {
        setSpacing: (input: Record<string, unknown>) => {
          calls.setSpacing.push(input);
          return { success: true };
        },
      },
    },
    footnotes: {
      insert: (input: { type: string; content: string }) => {
        calls.insertedNotes.push(input);
        return { success: true };
      },
      get: (input: { target: { noteId: string } }) => notes.get(input.target.noteId),
      remove: (input: { target: { noteId: string } }) => {
        calls.removedNotes.push(input.target.noteId);
        notes.delete(input.target.noteId);
        return { success: true };
      },
    },
    find:
      options.refs === undefined
        ? undefined
        : (input: { limit?: number; offset?: number }) => {
            const offset = input.offset ?? 0;
            const limit = input.limit ?? options.refs!.length;
            return {
              items: options.refs!.slice(offset, offset + limit).map((ref) => ({
                node: { footnoteRef: { noteId: ref.noteId } },
                address: { anchor: { start: { blockId: ref.blockId, offset: ref.offset } } },
              })),
            };
          },
    sections:
      options.sections === undefined
        ? undefined
        : {
            list: () => ({ items: options.sections }),
            setPageSetup: (input: Record<string, unknown>) => {
              calls.setPageSetup.push(input);
              return { success: true };
            },
            setPageMargins: (input: Record<string, unknown>) => {
              calls.setPageMargins.push(input);
              return { success: true };
            },
            setColumns: (input: Record<string, unknown>) => {
              calls.setColumns.push(input);
              return { success: true };
            },
          },
  };

  const host = {
    activeEditor: { doc },
    ui: {
      selection: { apply: (target: unknown) => calls.selectionApplied.push(target) },
      viewport: { scrollIntoView: () => undefined },
    },
  };

  return { host, calls, textOf, blocks };
}
