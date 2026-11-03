import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { activeInstructions, GROUND_RULES, resumeCommand } from "../shared/aiReview.ts";
import { createLocalApi } from "./api.ts";
import { normalizeConfig } from "./config.ts";
import { ReviewJobs } from "./jobs.ts";

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

test("global instructions start as the ground rules, and an emptied list stays empty", () => {
  expect(normalizeConfig({}).globalInstructions).toEqual([GROUND_RULES]);
  expect(normalizeConfig({ globalInstructions: [] }).globalInstructions).toEqual([]);
});

test("each instruction set is made whole, with an id of its own", () => {
  const sets = normalizeConfig({
    globalInstructions: [
      { id: "a", name: "Java", instructions: "We're on Java 21." },
      { id: "a", name: "Again", instructions: "x", enabled: false },
      { id: "../../etc", instructions: 3 },
      "junk",
    ],
  }).globalInstructions;
  expect(sets).toHaveLength(3);
  expect(sets[0]).toEqual({ id: "a", name: "Java", instructions: "We're on Java 21.", enabled: true });
  expect(sets[1]?.id).not.toBe("a");
  expect(sets[1]?.enabled).toBe(false);
  expect(sets[2]?.id).toMatch(/^[\w-]+$/);
  expect(sets[2]?.instructions).toBe("");
});

test("a review gets the sets switched on that have something in them", () => {
  const set = { id: "x", name: " Java ", instructions: " Java 21. ", enabled: true };
  expect(
    activeInstructions([set, { ...set, id: "y", enabled: false }, { ...set, id: "z", instructions: "  " }]),
  ).toEqual([{ name: "Java", instructions: "Java 21." }]);
});

test("global instructions are saved with the config, and Settings can show what's always included", async () => {
  const home = await mkdtemp(join(tmpdir(), "er-config-"));
  process.env.EASY_REVIEW_HOME = home;
  try {
    const jobs = new ReviewJobs(async () => undefined, { autoSweep: false });
    await jobs.init();
    const { handle } = createLocalApi(jobs);
    const call = (method: string, path: string, body?: unknown) =>
      handle(new Request(`http://localhost/api/local/${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) }));

    const config = (await (await call("GET", "config")).json()) as { globalInstructions: unknown[] };
    const sets = [{ id: "java", name: "Java", instructions: "We're on Java 21.", enabled: false }];
    await call("PUT", "config", { ...config, globalInstructions: sets });
    expect(jobs.getConfig().globalInstructions).toEqual(sets);
    expect(await Bun.file(join(home, "config.json")).json()).toMatchObject({ globalInstructions: sets });

    const fixed = (await (await call("GET", "config/fixed")).json()) as { text: string };
    expect(fixed.text).toContain("material under review");
    expect(fixed.text).not.toContain(GROUND_RULES.instructions);
  } finally {
    delete process.env.EASY_REVIEW_HOME;
    await rm(home, { recursive: true, force: true });
  }
});
