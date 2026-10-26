import { expect, test } from "bun:test";
import { fallbackDirs, mergePaths, parseShellOutput } from "./shellPath.ts";

const M = "__EASY_REVIEW_PATH__";

test("the PATH is read from between the markers, whatever else the shell prints", () => {
  expect(parseShellOutput(`Welcome back!\nnvm: using node 22\n${M}/opt/homebrew/bin:/usr/bin${M}`)).toBe(
    "/opt/homebrew/bin:/usr/bin",
  );
});

test("output without both markers yields nothing", () => {
  expect(parseShellOutput("")).toBeUndefined();
  expect(parseShellOutput(`${M}/usr/bin`)).toBeUndefined();
  expect(parseShellOutput(`${M}${M}`)).toBeUndefined();
});

test("paths merge in order of preference, without repeats or empty entries", () => {
  expect(mergePaths("/opt/homebrew/bin:/usr/bin", undefined, "/usr/bin::/bin", "/opt/homebrew/bin")).toBe(
    "/opt/homebrew/bin:/usr/bin:/bin",
  );
});

test("the fallbacks cover Homebrew and the user's own bin directories", () => {
  expect(fallbackDirs("/Users/me")).toEqual([
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/Users/me/.local/bin",
    "/Users/me/.claude/local",
  ]);
});
