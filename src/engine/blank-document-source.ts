/**
 * המקור של „מסמך חדש”. מופרד מ-blank-document.ts כדי שהפונקציות הטהורות שם
 * ייובאו גם מ-vite.config.ts, שאינו יכול לטעון מודול וירטואלי.
 */
import blankDocxBase64 from 'virtual:otzaria-blank-docx';
import { blankDocumentBlob } from './blank-document';

let cached: Blob | undefined | null = null;

/** Blob חדש לכל פתיחה אינו נדרש — המנוע קורא ואינו משנה את המקור. */
export function blankDocumentSource(): Blob | undefined {
  if (cached === null) cached = blankDocumentBlob(blankDocxBase64);
  return cached;
}
