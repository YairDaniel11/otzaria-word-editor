/**
 * „פירוק מסמך — הערות שוליים” — מוציא את כל הערות השוליים למסמך נפרד,
 * ומשאיר בגוף את מספר ההערה כטקסט סטטי בכתב עילי. נויד מ-SplitDocument.bas
 * של שולחן העורך (המסלול של הערות השוליים).
 *
 * ## הסדר, ולמה דווקא הוא
 *
 * 1. קריאה: כל ההערות (`footnotes.list`) ומיקומי ההפניות בגוף (`doc.find`
 *    על `footnoteRef`, כמו ב-brackets-notes.ts). בלי אחד מהם — כשל סגור,
 *    לפני שנגעו במסמך.
 * 2. המסמך השני נפתח **לפני** המחיקה (engine/shulchan/docx-builder.ts +
 *    `openDraft` של App.vue): אם פתיחת הטאב נכשלת, המסמך המקורי לא השתנה.
 * 3. רק אז, מהאחרונה לראשונה (כדי שההיסטים יישארו תקפים): מחיקת ההערה,
 *    וכתיבת המספר במקום ההפניה + כתב עילי.
 *
 * ## מה זה קירוב
 *
 * המקור מעתיק את „סיפור ההערות” כמות שהוא — עם כל עיצוב הריצות. `footnotes.list`
 * מחזיר את תוכן ההערה כטקסט שטוח (engine/footnotes.ts), ולכן במסמך ההערות
 * מגיע הטקסט בלי הדגשות/נטיות שהיו בהערה. וגם: N הערות = N+N צעדי ביטול,
 * לא צעד אחד (ראו „מגבלה ידועה” ב-docs/shulchan-haorech.md). הערות סיום
 * אינן מטופלות: כתובת ההערה במנוע עיוורת לסוג (engine/footnotes.ts).
 */
import { listNotes, type FootnotesTarget } from '../footnotes';
import { buildDocx, type DocxParagraph } from './docx-builder';
import { listFootnoteRefs } from './brackets-notes';
import {
  applyInline,
  replaceRange,
  shulchanDoc,
  textTarget,
  unavailableOutcome,
  type ShulchanTarget,
} from './shulchan-doc';
import { receiptFailureText, thrownText, type DocReceipt, type MaybePromise } from '../document-api';

const FAILED = 'פירוק המסמך נכשל';
export const NO_FOOTNOTES_TEXT = 'אין במסמך הערות שוליים לפירוק';

export interface SplitNotesResult {
  ok: boolean;
  message?: string;
  /** כמה הערות הועברו למסמך השני. */
  moved: number;
}

/** פותח את מסמך ההערות בטאב חדש; `false` = לא נפתח (ואז המקור לא נוגע). */
export type DraftOpener = (blob: Blob) => Promise<boolean>;

export function splitNotesSummaryText(result: SplitNotesResult): string {
  if (result.moved === 0) return NO_FOOTNOTES_TEXT;
  return result.moved === 1
    ? 'הערת שוליים אחת הועברה למסמך חדש; בגוף נשאר מספרה'
    : `${result.moved} הערות שוליים הועברו למסמך חדש; בגוף נשארו מספריהן`;
}

interface NoteForSplit {
  id: string;
  number: string;
  content: string;
  blockId: string;
  offset: number;
}

/** הפסקאות של מסמך ההערות: „¹ תוכן” לכל הערה, בסדר ההפניות בגוף. */
export function notesDocumentParagraphs(notes: readonly { number: string; content: string }[]): DocxParagraph[] {
  return notes.map((note) => ({
    runs: [
      { text: note.number, superscript: true },
      { text: ` ${note.content}` },
    ],
  }));
}

interface NotesApi {
  remove?: (input: { target: { kind: 'entity'; entityType: 'footnote'; noteId: string } }) => MaybePromise<DocReceipt>;
}

export async function splitFootnotesToDocument(host: ShulchanTarget, open: DraftOpener): Promise<SplitNotesResult> {
  const remove = (shulchanDoc(host) as { footnotes?: NotesApi } | undefined)?.footnotes?.remove;
  if (typeof remove !== 'function') {
    const outcome = unavailableOutcome(FAILED);
    return { ok: false, message: outcome.ok ? undefined : outcome.message, moved: 0 };
  }

  // אותה הצרה של הפאסדה כמו בכל כלי Shulchan — ראו ההסבר על ה-union ב-page-setup.ts.
  const all = await listNotes(host as FootnotesTarget);
  const footnotes = all.filter((note) => note.type === 'footnote');
  if (footnotes.length === 0) return { ok: true, moved: 0 };

  const sites = await listFootnoteRefs(host);
  if (sites === null) {
    return { ok: false, message: `${FAILED}: המנוע אינו חושף את מיקומי ההערות במסמך הזה`, moved: 0 };
  }
  const byId = new Map(footnotes.map((note) => [note.id, note]));
  const ordered: NoteForSplit[] = [];
  for (const site of sites) {
    const note = byId.get(site.noteId);
    if (!note) continue;
    byId.delete(site.noteId);
    ordered.push({
      id: note.id,
      number: note.number !== '' ? note.number : String(ordered.length + 1),
      content: note.content.trim(),
      blockId: site.blockId,
      offset: site.offset,
    });
  }
  if (byId.size > 0) {
    return {
      ok: false,
      message: `${FAILED}: ל-${byId.size} הערות לא נמצאה הפניה בגוף — המסמך לא שונה`,
      moved: 0,
    };
  }

  const blob = buildDocx(notesDocumentParagraphs(ordered));
  let opened = false;
  try {
    opened = await open(blob);
  } catch (error) {
    return { ok: false, message: thrownText(FAILED, error), moved: 0 };
  }
  if (!opened) return { ok: false, message: `${FAILED}: מסמך ההערות לא נפתח — המסמך לא שונה`, moved: 0 };

  let moved = 0;
  for (const note of [...ordered].reverse()) {
    try {
      const receipt = await remove({ target: { kind: 'entity', entityType: 'footnote', noteId: note.id } });
      if (receipt?.success === false) return { ok: false, message: receiptFailureText(FAILED, receipt), moved };
    } catch (error) {
      return { ok: false, message: thrownText(FAILED, error), moved };
    }
    const inserted = await replaceRange(host, textTarget(note.blockId, note.offset, note.offset), note.number, FAILED);
    if (!inserted.ok) return { ok: false, message: inserted.message, moved };
    const raised = await applyInline(
      host,
      textTarget(note.blockId, note.offset, note.offset + note.number.length),
      { vertAlign: 'superscript' },
      FAILED,
    );
    if (!raised.ok) return { ok: false, message: raised.message, moved };
    moved += 1;
  }
  return { ok: true, moved };
}
