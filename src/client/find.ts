/**
 * Find in the page: Cmd/Ctrl+F searches the text that's showing in the
 * preview's current tab. Matches are painted with the CSS Custom Highlight
 * API, so the DOM — which React owns — is never touched.
 */

/** A text node's text, and the block it sits in: a match never crosses blocks. */
export interface Piece {
  text: string;
  block: unknown;
}

export interface Point {
  piece: number;
  offset: number;
}

export interface Hit {
  from: Point;
  to: Point;
}

/**
 * Every match of `query` in the pieces, ignoring case. Neighbouring pieces in
 * one block are searched as one string, so "const x" matches across the spans
 * that syntax highlighting splits a line into, but not from one line to the next.
 */
export function findHits(pieces: Piece[], query: string): Hit[] {
  const needle = query.toLowerCase();
  if (!needle) return [];
  const hits: Hit[] = [];
  let start = 0;
  while (start < pieces.length) {
    let end = start + 1;
    while (end < pieces.length && pieces[end]?.block === pieces[start]?.block) end++;
    searchRun(pieces, start, end, needle, hits);
    start = end;
  }
  return hits;
}

function searchRun(pieces: Piece[], from: number, to: number, needle: string, hits: Hit[]) {
  const starts: number[] = [];
  let hay = "";
  for (let i = from; i < to; i++) {
    starts.push(hay.length);
    const text = pieces[i]?.text ?? "";
    // Lower-casing can change a string's length (İ → i̇), which would throw the
    // offsets off; such a piece is matched as written instead.
    const lower = text.toLowerCase();
    hay += lower.length === text.length ? lower : text;
  }
  // Which piece holds character `at`, and where in it. Matches come in order,
  // so the search for each carries on from the last.
  let cursor = 0;
  const locate = (at: number, inclusiveEnd: boolean): Point => {
    while (cursor + 1 < starts.length && (starts[cursor + 1] ?? 0) < at + (inclusiveEnd ? 0 : 1)) cursor++;
    return { piece: from + cursor, offset: at - (starts[cursor] ?? 0) };
  };
  for (let at = hay.indexOf(needle); at !== -1; at = hay.indexOf(needle, at + needle.length)) {
    const start = locate(at, false);
    hits.push({ from: start, to: locate(at + needle.length, true) });
  }
}

/** The text nodes under `root` that are showing, each with the block it's in. */
export function textPieces(root: HTMLElement): { nodes: Text[]; pieces: Piece[] } {
  const blocks = new Map<Element, Element>();
  const shown = new Map<Element, boolean>();
  const blockOf = (el: Element): Element => {
    const known = blocks.get(el);
    if (known) return known;
    const display = getComputedStyle(el).display;
    const parent = el.parentElement;
    const block =
      el !== root && parent && (display === "inline" || display === "contents") ? blockOf(parent) : el;
    blocks.set(el, block);
    return block;
  };
  const isShown = (el: Element): boolean => {
    let value = shown.get(el);
    if (value === undefined) {
      value = el.checkVisibility({ visibilityProperty: true });
      shown.set(el, value);
    }
    return value;
  };

  const nodes: Text[] = [];
  const pieces: Piece[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    const text = node.nodeValue ?? "";
    // A space between two highlighted words is a node of its own, so keep it.
    if (!parent || !text || !isShown(parent)) continue;
    nodes.push(node as Text);
    pieces.push({ text, block: blockOf(parent) });
  }
  return { nodes, pieces };
}

/** The matches under `root`, as ranges. */
export function findRanges(root: HTMLElement, query: string): Range[] {
  const { nodes, pieces } = textPieces(root);
  return findHits(pieces, query).flatMap(({ from, to }) => {
    const start = nodes[from.piece];
    const end = nodes[to.piece];
    if (!start || !end) return [];
    const range = document.createRange();
    range.setStart(start, from.offset);
    range.setEnd(end, to.offset);
    return [range];
  });
}

const ALL = "er-find";
const CURRENT = "er-find-current";

/** Paint the matches, with the current one stronger. Nothing in, nothing painted. */
export function paint(ranges: Range[], current: number) {
  if (typeof CSS === "undefined" || !("highlights" in CSS)) return;
  const now = ranges[current];
  CSS.highlights.set(ALL, new Highlight(...ranges.filter((r) => r !== now)));
  if (now) CSS.highlights.set(CURRENT, new Highlight(now));
  else CSS.highlights.delete(CURRENT);
}

export function clearPaint() {
  if (typeof CSS === "undefined" || !("highlights" in CSS)) return;
  CSS.highlights.delete(ALL);
  CSS.highlights.delete(CURRENT);
}
