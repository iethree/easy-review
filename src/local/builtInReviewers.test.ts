import { expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { draw } from "reladraw";
import pkg from "../../package.json";
import { BUILT_IN_REVIEWERS } from "./builtInReviewers.ts";
import { parseReviewerFile, REVIEWER_ID } from "./reviewers.ts";
import { placesReport } from "./reports.ts";

const instructionsOf = (id: string) => {
  const reviewer = BUILT_IN_REVIEWERS.find((r) => r.id === id);
  return reviewer ? parseReviewerFile(id, reviewer.file).instructions : "";
};
const diagrams = instructionsOf("diagrams");

test("every file in reviewers/ is built in, named and with instructions", async () => {
  const files = (await readdir(new URL("../../reviewers", import.meta.url))).filter((f) => f.endsWith(".md"));
  expect(BUILT_IN_REVIEWERS.map((r) => `${r.id}.md`).sort()).toEqual(files.sort());
  for (const { id, file } of BUILT_IN_REVIEWERS) {
    expect(id).toMatch(REVIEWER_ID);
    expect(file).toStartWith("---\nname: ");
    expect(parseReviewerFile(id, file).instructions.length).toBeGreaterThan(100);
  }
});

test("the Diagrams reviewer teaches the reladraw the app draws with", () => {
  // Pinned exactly, so the reviewer checks diagrams with the reladraw that draws them.
  expect(pkg.dependencies.reladraw).toMatch(/^\d+\.\d+\.\d+$/);
  expect(diagrams).toContain(`reladraw@${pkg.dependencies.reladraw} `);
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
    const instructions = instructionsOf(id);
    expect(instructions).toContain(".easy-review/screenshots/");
    for (const [, src] of instructions.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
      expect(screenshotName((src ?? "").replace("<screen>", "x"))).not.toBeNull();
    }
  }
  const comparison = instructionsOf("screen-comparison");
  const block = /```compare\n([\s\S]*?)```/.exec(comparison)?.[1] ?? "";
  expect(parseCompare(block)).toEqual({ before: "settings-general-before.png", after: "settings-general-after.png" });
  expect(comparison).toContain("$(cat .easy-review/base-commit)");
});

test("the Tulip reviewer runs a pinned Tulip, and shows its page where the review keeps it", () => {
  const tulip = instructionsOf("tulip");
  // npx fetches it from npm on the reviewer's machine, so it's pinned.
  expect(tulip).toMatch(/@virtuslab\/tulip@\d+\.\d+\.\d+ /);
  expect(tulip).toContain(".easy-review/report/");
  expect(placesReport(tulip)).toBe(true);
});
