import { expect, test } from "bun:test";
import { draw } from "reladraw";
import pkg from "../../package.json";
import { BUILT_IN_REVIEWERS, RELADRAW_VERSION } from "./builtInReviewers.ts";

const diagrams = BUILT_IN_REVIEWERS.find((r) => r.id === "diagrams")?.instructions ?? "";

test("the Diagrams reviewer teaches the reladraw the app draws with", () => {
  expect(pkg.dependencies.reladraw).toBe(RELADRAW_VERSION);
  expect(diagrams).toContain(`reladraw@${RELADRAW_VERSION}`);
});

test("its example diagram draws, and nothing in it overlaps", () => {
  const examples = [...diagrams.matchAll(/```reladraw\n([\s\S]*?)```/g)].map((m) => m[1] ?? "");
  expect(examples.length).toBeGreaterThan(0);
  for (const source of examples) {
    const { svg, findings } = draw(source);
    expect(svg).toStartWith("<svg");
    expect(findings).toEqual([]);
  }
});

test("the screen reviewers save screenshots where the review keeps them, and show them the way the page draws them", async () => {
  const { parseCompare, screenshotName } = await import("../client/screenshots.ts");
  for (const id of ["changed-screens", "screen-comparison"]) {
    const instructions = BUILT_IN_REVIEWERS.find((r) => r.id === id)?.instructions ?? "";
    expect(instructions).toContain(".easy-review/screenshots/");
    for (const [, src] of instructions.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
      expect(screenshotName((src ?? "").replace("<screen>", "x"))).not.toBeNull();
    }
  }
  const comparison = BUILT_IN_REVIEWERS.find((r) => r.id === "screen-comparison")?.instructions ?? "";
  const block = /```compare\n([\s\S]*?)```/.exec(comparison)?.[1] ?? "";
  expect(parseCompare(block)).toEqual({ before: "settings-general-before.png", after: "settings-general-after.png" });
  expect(comparison).toContain("$(cat .easy-review/base-commit)");
});
