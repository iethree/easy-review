import { test, expect } from "bun:test";
import { parseDiff, diffLineCount } from "./diff.ts";

const SAMPLE = `diff --git a/src/app.ts b/src/app.ts
index 83db48f..bf269f4 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,5 +1,6 @@ export function app()
 const a = 1;
-const b = 2;
+const b = 3;
+const c = 4;
 const d = 5;
diff --git a/README.md b/docs/README.md
similarity index 90%
rename from README.md
rename to docs/README.md
--- a/README.md
+++ b/docs/README.md
@@ -1 +1 @@
-old title
+new title
diff --git a/logo.png b/logo.png
new file mode 100644
index 0000000..1234567
Binary files /dev/null and b/logo.png differ
diff --git a/gone.txt b/gone.txt
deleted file mode 100644
--- a/gone.txt
+++ /dev/null
@@ -1,2 +0,0 @@
-line one
-line two
`;

test("parses files, kinds and counts", () => {
  const d = parseDiff(SAMPLE);
  expect(d.files.length).toBe(4);

  const [app, readme, logo, gone] = d.files;
  expect(app!.path).toBe("src/app.ts");
  expect(app!.kind).toBe("modified");
  expect(app!.additions).toBe(2);
  expect(app!.deletions).toBe(1);

  expect(readme!.kind).toBe("renamed");
  expect(readme!.path).toBe("docs/README.md");
  expect(readme!.oldPath).toBe("README.md");

  expect(logo!.isBinary).toBe(true);
  expect(logo!.kind).toBe("added");
  expect(logo!.hunks.length).toBe(0);

  expect(gone!.kind).toBe("deleted");
  expect(gone!.deletions).toBe(2);

  expect(d.additions).toBe(3);
  expect(d.deletions).toBe(4);
});

test("tracks line numbers on both sides", () => {
  const d = parseDiff(SAMPLE);
  const lines = d.files[0]!.hunks[0]!.lines;
  expect(lines.map((l) => [l.kind, l.oldNumber, l.newNumber])).toEqual([
    ["context", 1, 1],
    ["del", 2, null],
    ["add", null, 2],
    ["add", null, 3],
    ["context", 3, 4],
  ]);
});

test("keeps the hunk header context", () => {
  const d = parseDiff(SAMPLE);
  expect(d.files[0]!.hunks[0]!.header).toBe("export function app()");
});

test("handles paths containing spaces", () => {
  const d = parseDiff(
    `diff --git a/my folder/a b.ts b/my folder/a b.ts\n--- a/my folder/a b.ts\n+++ b/my folder/a b.ts\n@@ -1 +1 @@\n-x\n+y\n`,
  );
  expect(d.files[0]!.path).toBe("my folder/a b.ts");
});

test("handles no-newline markers and empty context lines", () => {
  const d = parseDiff(
    `diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1,3 +1,3 @@\n a\n\n-b\n+c\n\\ No newline at end of file\n`,
  );
  const kinds = d.files[0]!.hunks[0]!.lines.map((l) => l.kind);
  expect(kinds).toEqual(["context", "context", "del", "add", "meta"]);
  expect(d.files[0]!.additions).toBe(1);
});

test("truncates enormous diffs", () => {
  const huge = `diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1,1 +1,1 @@\n` + "+x\n".repeat(900_000);
  const d = parseDiff(huge);
  expect(d.truncated).toBe(true);
});

test("counts rendered lines", () => {
  expect(diffLineCount(parseDiff(SAMPLE))).toBe(5 + 2 + 2);
});

test("empty input is not an error", () => {
  const d = parseDiff("");
  expect(d.files).toEqual([]);
  expect(d.additions).toBe(0);
});
