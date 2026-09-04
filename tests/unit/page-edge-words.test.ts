/**
 * `countPaintedPages` / `settledPageCount` / `measurePageEdgeWords` — הקריאה
 * מה-DOM המצויר שכלי „עמודים ודפוס” של שולחן העורך נשענים עליה.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { countPaintedPages, measurePageEdgeWords, settledPageCount } from '../../src/engine/page-ruler';

function paintedHost(pages: string[]): HTMLElement {
  const host = document.createElement('div');
  pages.forEach((text, index) => {
    const page = document.createElement('div');
    page.setAttribute('data-page-index', String(index));
    const para = document.createElement('p');
    para.textContent = text;
    page.appendChild(para);
    host.appendChild(page);
  });
  document.body.appendChild(host);
  return host;
}

let restore: (() => void) | null = null;

beforeEach(() => {
  const original = Range.prototype.getClientRects;
  Range.prototype.getClientRects = function fake(this: Range) {
    const rect = { left: 1, top: 2, width: 10 * this.toString().length, height: 20 } as DOMRect;
    return Object.assign([rect], { item: () => rect }) as unknown as DOMRectList;
  };
  restore = () => {
    Range.prototype.getClientRects = original;
  };
});

afterEach(() => {
  restore?.();
  document.body.innerHTML = '';
});

describe('ספירת עמודים מצוירים', () => {
  it('max(data-page-index)+1, ו-null בלי עמודים', () => {
    expect(countPaintedPages(paintedHost(['א', 'ב', 'ג']))).toBe(3);
    expect(countPaintedPages(paintedHost([]))).toBeNull();
    expect(countPaintedPages(null)).toBeNull();
  });

  it('ההתיישבות נעצרת כששתי קריאות מסכימות', async () => {
    const host = paintedHost(['א', 'ב']);
    const wait = vi.fn(async () => undefined);
    expect(await settledPageCount(host, [1, 2, 3], wait)).toBe(2);
    expect(wait).toHaveBeenCalledTimes(1);
  });
});

describe('מילות הקצה של כל עמוד', () => {
  it('המילה הראשונה והאחרונה, עם מלבנים, והטקסט הפותח', () => {
    const host = paintedHost(['  בראשית ברא אלהים ', 'והארץ היתה תהו']);
    const edges = measurePageEdgeWords(host, host);
    expect(edges).toHaveLength(2);
    expect(edges[0]?.first?.text).toBe('בראשית');
    expect(edges[0]?.last?.text).toBe('אלהים');
    expect(edges[0]?.head).toContain('בראשית ברא');
    expect(edges[0]?.first?.rects[0]?.widthPx).toBe(60);
    expect(edges[1]?.pageIndex).toBe(1);
    expect(edges[1]?.last?.text).toBe('תהו');
  });

  it('עמוד ריק — בלי מילים, ובלי נפילה', () => {
    const edges = measurePageEdgeWords(paintedHost(['   ']), document.body);
    expect(edges[0]?.first).toBeNull();
    expect(edges[0]?.last).toBeNull();
  });
});
