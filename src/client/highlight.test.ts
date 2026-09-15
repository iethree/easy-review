import { expect, test } from "bun:test";
import type { DiffFile } from "../shared/types.ts";
import { highlightLines, languageForPath, tokenizeFile } from "./highlight.ts";

test("a file's language comes from its extension", () => {
  expect(languageForPath("src/components/App.tsx")).toBe("typescript");
  expect(languageForPath("src/app.mjs")).toBe("javascript");
  expect(languageForPath("deps.edn")).toBe("clojure");
  expect(languageForPath("a/b/Styles.SCSS")).toBe("scss");
});

test("some files are known by name rather than extension", () => {
  expect(languageForPath("Dockerfile")).toBe("dockerfile");
  expect(languageForPath("docker/Dockerfile.dev")).toBe("dockerfile");
  expect(languageForPath("Makefile")).toBe("bash");
  expect(languageForPath(".gitconfig")).toBe("ini");
});

test("anything we don't recognise renders as plain text", () => {
  expect(languageForPath("LICENSE")).toBeNull();
  expect(languageForPath("bin/run")).toBeNull();
  expect(languageForPath("data.qqq")).toBeNull();
});

/**
 * The invariant everything else rests on: highlighting must never lose,
 * reorder or invent a character. If this breaks, the diff pane would be
 * quietly showing code that isn't what was written.
 */
test("the tokens of a line put it back together exactly", () => {
  const source = [
    "export function greet(name: string): string {",
    "  // say hello",
    "  return `hi ${name}`;",
    "}",
  ];

  const lines = highlightLines("typescript", source);
  expect(lines).not.toBeNull();
  expect(lines).toHaveLength(source.length);
  lines?.forEach((tokens, i) => {
    expect(tokens.map((t) => t.text).join("")).toBe(source[i] ?? "");
  });
});

test("blank lines stay blank and still line up", () => {
  const source = ["const a = 1;", "", "const b = 2;"];
  const lines = highlightLines("typescript", source);
  expect(lines).toHaveLength(3);
  expect(lines?.[1]).toEqual([]);
});

/** The whole reason we tokenise a file at a time instead of line by line. */
test("a comment spanning several lines is coloured on every one of them", () => {
  const source = ["/*", " * still a comment", " */", "const x = 1;"];
  const lines = highlightLines("typescript", source);

  for (const i of [0, 1, 2]) {
    const tokens = lines?.[i] ?? [];
    expect(tokens.length).toBeGreaterThan(0);
    for (const token of tokens) expect(token.className).toContain("hljs-comment");
  }
  // ...and the code after it is back to normal.
  expect(lines?.[3]?.some((t) => t.className.includes("hljs-keyword"))).toBe(true);
});

test("an unknown or unregistered language is left as plain text", () => {
  expect(highlightLines(null, ["anything at all"])).toBeNull();
  expect(highlightLines("brainfuck", ["+++++"])).toBeNull();
});

test("a file too big to be worth highlighting is left alone", () => {
  const huge = Array.from({ length: 40_000 }, () => "const x = 1;");
  expect(highlightLines("typescript", huge)).toBeNull();
});

const file = (lines: DiffFile["hunks"][number]["lines"], path = "src/app.ts"): DiffFile => ({
  path,
  oldPath: null,
  kind: "modified",
  additions: 0,
  deletions: 0,
  isBinary: false,
  hunks: [{ header: "", lines }],
});

/**
 * Each side is highlighted separately, so a deletion must read its tokens from
 * the old file and an addition from the new one. Zipping them back in the
 * wrong order would put one line's colours on another.
 */
test("each line takes its tokens from the side it belongs to", () => {
  const tokens = tokenizeFile(
    file([
      { kind: "context", content: "const a = 1;", oldNumber: 1, newNumber: 1 },
      { kind: "del", content: "let gone = 2;", oldNumber: 2, newNumber: null },
      { kind: "add", content: "const added = 3;", oldNumber: null, newNumber: 2 },
      { kind: "meta", content: "No newline at end of file", oldNumber: null, newNumber: null },
    ]),
  );

  const hunk = tokens?.[0];
  expect(hunk).toHaveLength(4);
  expect(hunk?.[0]?.map((t) => t.text).join("")).toBe("const a = 1;");
  expect(hunk?.[1]?.map((t) => t.text).join("")).toBe("let gone = 2;");
  expect(hunk?.[2]?.map((t) => t.text).join("")).toBe("const added = 3;");
  // The "\ No newline" marker is not code and gets no tokens.
  expect(hunk?.[3]).toBeNull();
});

test("a file in a language we don't know gets no tokens at all", () => {
  expect(
    tokenizeFile(file([{ kind: "add", content: "whatever", oldNumber: null, newNumber: 1 }], "a.qqq")),
  ).toBeNull();
});
