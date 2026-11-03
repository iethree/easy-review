import { expect, test } from "bun:test";
import { findHits, type Piece } from "./find.ts";

const line = (block: string, ...texts: string[]): Piece[] => texts.map((text) => ({ text, block }));

test("finds every match, ignoring case", () => {
  expect(findHits(line("a", "Foo foo FOO"), "foo")).toEqual([
    { from: { piece: 0, offset: 0 }, to: { piece: 0, offset: 3 } },
    { from: { piece: 0, offset: 4 }, to: { piece: 0, offset: 7 } },
    { from: { piece: 0, offset: 8 }, to: { piece: 0, offset: 11 } },
  ]);
});

test("a match can span the pieces of one line", () => {
  // <span>const</span> <span>value</span>
  expect(findHits(line("a", "const", " ", "value"), "t val")).toEqual([
    { from: { piece: 0, offset: 4 }, to: { piece: 2, offset: 3 } },
  ]);
});

test("a match ending at a piece's end stays in that piece", () => {
  expect(findHits(line("a", "ab", "cd"), "ab")).toEqual([{ from: { piece: 0, offset: 0 }, to: { piece: 0, offset: 2 } }]);
  expect(findHits(line("a", "ab", "cd"), "cd")).toEqual([{ from: { piece: 1, offset: 0 }, to: { piece: 1, offset: 2 } }]);
});

test("but never runs from one line to the next", () => {
  const pieces = [...line("a", "foo"), ...line("b", "bar")];
  expect(findHits(pieces, "foobar")).toEqual([]);
  expect(findHits(pieces, "bar")).toEqual([{ from: { piece: 1, offset: 0 }, to: { piece: 1, offset: 3 } }]);
});

test("matches don't overlap, and an empty query finds nothing", () => {
  expect(findHits(line("a", "aaaa"), "aa")).toHaveLength(2);
  expect(findHits(line("a", "anything"), "")).toEqual([]);
});

test("text whose length changes when lower-cased still lines up", () => {
  expect(findHits(line("a", "İx", "ab"), "ab")).toEqual([{ from: { piece: 1, offset: 0 }, to: { piece: 1, offset: 2 } }]);
});
