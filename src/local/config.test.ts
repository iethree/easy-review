import { expect, test } from "bun:test";
import { resumeCommand } from "../shared/aiReview.ts";
import { normalizeConfig } from "./config.ts";

test("reviews can run code unless read-only is set", () => {
  expect(normalizeConfig({}).readOnly).toBe(false);
  expect(normalizeConfig({ readOnly: true }).readOnly).toBe(true);
  // Anything but a boolean is the default, not a guess.
  expect(normalizeConfig({ readOnly: "yes" }).readOnly).toBe(false);
});

test("continuing a review in a terminal keeps the tools it ran with", () => {
  const job = { worktreePath: "/wt/pr-1", sessionId: "abc" };
  expect(resumeCommand({ ...job, readOnly: false })).toEndWith("--tools Read,Grep,Glob,Bash,Edit,Write");
  expect(resumeCommand({ ...job, readOnly: true })).toEndWith("--tools Read,Grep,Glob");
  // Reviews from before the setting were all read-only.
  expect(resumeCommand(job)).toEndWith("--tools Read,Grep,Glob");
  expect(resumeCommand({ ...job, readOnly: false })).toContain("--setting-sources user --strict-mcp-config");
});
