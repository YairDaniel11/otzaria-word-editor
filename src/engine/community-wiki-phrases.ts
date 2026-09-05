/**
 * ביטויים תלמודיים מורחבים — ויקישיבה (CC BY-NC 3.0) וויקיסוגיה (רישיון לא
 * ידוע), רק כותרות ערכים. ר' סעיף הרישוי ב-THIRD_PARTY_NOTICES.md.
 *
 * מופעל כשכבת fallback נוספת ואחרונה, אחרי `static-completion.ts` (ביטויים
 * בטוחים + מחברים) — לא לפני, ולא מוזג לתוכה: הפרופיל הרישויי שונה, ולכן
 * המנגנון עצמאי משלו.
 */
import { buildSectionCache, matchAtCursor, type SectionWordCache, type TypedContext } from './book-completion';
import type { StaticCompletionMatch } from './static-completion';
import {
  COMMUNITY_WIKI_PHRASES_FILE,
  COMMUNITY_WIKI_PHRASES_GLOBAL,
} from './community-wiki-phrases-constants';

const SOURCE_NAME = 'community-wiki-phrases';
const DICTIONARY_SRC = `./${COMMUNITY_WIKI_PHRASES_FILE}`;
const LOAD_TIMEOUT_MS = 20_000;

type PackedLoader = () => Promise<string[] | null>;

function packedFromWindow(): string[] | null {
  const value = (globalThis as Record<string, unknown>)[COMMUNITY_WIKI_PHRASES_GLOBAL];
  return Array.isArray(value) ? (value as string[]) : null;
}

function injectCommunityWikiPhrasesScript(): Promise<string[] | null> {
  const ready = packedFromWindow();
  if (ready !== null) return Promise.resolve(ready);

  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: string[] | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    const timer = setTimeout(() => finish(null), LOAD_TIMEOUT_MS);

    const script = document.createElement('script');
    script.async = false;
    script.src = DICTIONARY_SRC;
    script.addEventListener('load', () => finish(packedFromWindow()));
    // נכס חסר הוא כשל שקט, לא תקלה — שאר ההשלמה החכמה ממשיכה לעבוד בלעדיו.
    script.addEventListener('error', () => finish(null));
    document.head.appendChild(script);
  });
}

let pending: Promise<SectionWordCache | null> | null = null;
let loaded: SectionWordCache | null = null;

/** המקור, בטעינה עצלה וחד-פעמית. `null` (כשל, או שהנכס פשוט לא קיים) הוא תקין. */
export function loadCommunityWikiPhrases(
  loader: PackedLoader = injectCommunityWikiPhrasesScript,
): Promise<SectionWordCache | null> {
  if (loaded) return Promise.resolve(loaded);
  if (pending) return pending;

  pending = (async () => {
    const phrases = await loader();
    if (phrases === null) return null;
    loaded = buildSectionCache(phrases.join('\n'));
    return loaded;
  })()
    .catch(() => null)
    .finally(() => {
      pending = null;
    });

  return pending;
}

/** לבדיקות בלבד. */
export function resetCommunityWikiPhrases(): void {
  loaded = null;
  pending = null;
}

export function matchCommunityWikiPhrases(
  context: TypedContext,
  cache: SectionWordCache,
): StaticCompletionMatch | null {
  const match = matchAtCursor(cache, context, { minStandalonePartial: 2 });
  return match ? { ...match, source: SOURCE_NAME } : null;
}
