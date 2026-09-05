/**
 * ביטויים תלמודיים מורחבים (engine/community-wiki-phrases.ts): טעינה עצלה
 * עצמאית — אותה תבנית כמו static-completion.test.ts — והתאמה על אותו מנוע.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { buildSectionCache } from '../../src/engine/book-completion';
import {
  loadCommunityWikiPhrases,
  matchCommunityWikiPhrases,
  resetCommunityWikiPhrases,
} from '../../src/engine/community-wiki-phrases';

const PACKED = ['מצוה הבאה בעבירה', 'אסמכתא לא קניא'];

describe('loadCommunityWikiPhrases', () => {
  beforeEach(() => resetCommunityWikiPhrases());

  it('נטען פעם אחת בלבד, גם בקריאות מקבילות', async () => {
    let calls = 0;
    const loader = async () => {
      calls += 1;
      return PACKED;
    };

    const [first, second] = await Promise.all([
      loadCommunityWikiPhrases(loader),
      loadCommunityWikiPhrases(loader),
    ]);
    expect(calls).toBe(1);
    expect(first).toBe(second);
  });

  it('נכס חסר (null) הוא כשל שקט — לא זרוק ולא נזכר', async () => {
    let calls = 0;
    const missingThenPresent = async () => {
      calls += 1;
      return calls === 1 ? null : PACKED;
    };

    expect(await loadCommunityWikiPhrases(missingThenPresent)).toBeNull();
    expect(await loadCommunityWikiPhrases(missingThenPresent)).not.toBeNull();
    expect(calls).toBe(2);
  });
});

describe('matchCommunityWikiPhrases', () => {
  const cache = buildSectionCache(PACKED.join('\n'));

  it('מתאימה ביטוי מהמקור המורחב', () => {
    const match = matchCommunityWikiPhrases({ precedingWords: ['אסמכתא'], partialWord: 'לא' }, cache);
    expect(match?.source).toBe('community-wiki-phrases');
    expect(match?.text.startsWith('לא קניא')).toBe(true);
  });

  it('null כשאין התאמה', () => {
    expect(matchCommunityWikiPhrases({ precedingWords: [], partialWord: 'זזזזז' }, cache)).toBeNull();
  });
});
