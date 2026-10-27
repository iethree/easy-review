import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dropScreenshots, keepScreenshots, screenshotFile } from "./screenshots.ts";

const ID = "3c477b93-ef5f-46e1-b265-e2cedc69add7";
let root: string;
let worktree: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "er-shots-"));
  process.env.EASY_REVIEW_HOME = join(root, "home");
  worktree = join(root, "wt");
  const shots = join(worktree, ".easy-review", "screenshots");
  await mkdir(shots, { recursive: true });
  await writeFile(join(shots, "settings-after.png"), "png");
  await writeFile(join(shots, "settings-before.webp"), "webp");
  await writeFile(join(shots, "notes.txt"), "not an image");
  await writeFile(join(shots, ".hidden.png"), "hidden");
  await writeFile(join(root, "secret"), "private");
  // The worktree is someone else's code: a link out of it must not be followed.
  await symlink(join(root, "secret"), join(shots, "leak.png"));
});

afterAll(async () => {
  delete process.env.EASY_REVIEW_HOME;
  await rm(root, { recursive: true, force: true });
});

test("the images a review saved are kept with it — real files only", async () => {
  expect(await keepScreenshots(worktree, ID)).toEqual(["settings-after.png", "settings-before.webp"]);
  expect((await readdir(join(root, "home", "reviews", ID))).sort()).toEqual([
    "settings-after.png",
    "settings-before.webp",
  ]);
});

test("only a kept image's own name is served", async () => {
  expect(await (await screenshotFile(ID, "settings-after.png"))?.text()).toBe("png");
  expect(await screenshotFile(ID, "leak.png")).toBeNull();
  expect(await screenshotFile(ID, "../../secret")).toBeNull();
  expect(await screenshotFile("../reviews", "settings-after.png")).toBeNull();
  expect(await keepScreenshots(worktree, "../escape")).toEqual([]);
});

test("a review with no screenshots keeps none, and deleting one takes its screenshots too", async () => {
  expect(await keepScreenshots(join(root, "nowhere"), ID)).toEqual([]);
  await dropScreenshots(ID);
  expect(await screenshotFile(ID, "settings-after.png")).toBeNull();
});
