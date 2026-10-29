import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm, symlink, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { keepReport, placesReport, reportFile } from "./reports.ts";

let dir: string;
let worktree: string;
const id = "0d9df378-d21a-4a83-8d72-ca2c79bea36a";

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "er-reports-"));
  process.env.EASY_REVIEW_HOME = join(dir, "home");
  worktree = join(dir, "worktree");
  const report = join(worktree, ".easy-review", "report");
  await mkdir(join(report, "assets", "vendor"), { recursive: true });
  await Bun.write(join(report, "index.html"), "<h1>Tulip</h1>");
  await Bun.write(join(report, "assets", "app.js"), "1");
  await Bun.write(join(report, "assets", "vendor", "mermaid.min.js"), "2");
  await Bun.write(join(report, ".hidden"), "x");
  await Bun.write(join(dir, "secret.txt"), "secret");
  await symlink(join(dir, "secret.txt"), join(report, "assets", "leak.js"));
});

afterAll(async () => {
  delete process.env.EASY_REVIEW_HOME;
  await rm(dir, { recursive: true, force: true });
});

test("a report is kept with its assets, and nothing that could point elsewhere", async () => {
  expect(await keepReport(worktree, id, new Date(Date.now() - 60_000))).toBe(true);
  const kept = join(dir, "home", "reviews", id, "report");
  expect((await readdir(kept)).sort()).toEqual(["assets", "index.html"]);
  expect((await readdir(join(kept, "assets"))).sort()).toEqual(["app.js", "vendor"]);
  expect(await (await reportFile(id, ""))?.text()).toBe("<h1>Tulip</h1>");
  expect(await (await reportFile(id, "assets/vendor/mermaid.min.js"))?.text()).toBe("2");
});

test("only a report written since the review started counts", async () => {
  const old = new Date(Date.now() - 3_600_000);
  await utimes(join(worktree, ".easy-review", "report", "index.html"), old, old);
  expect(await keepReport(worktree, id, new Date(Date.now() - 60_000))).toBe(false);
});

test("nothing outside a report is served from it", async () => {
  for (const path of ["../report/index.html", "assets/../index.html", ".hidden", "assets/leak.js", "/etc/passwd", "x//y"]) {
    expect(await reportFile(id, path)).toBeNull();
  }
  expect(await reportFile("not-an-id", "index.html")).toBeNull();
});

test("a review shows its report where its Markdown has a report block", () => {
  expect(placesReport("Intro\n\n```report\nTulip's explanation\n```\n")).toBe(true);
  expect(placesReport("Intro\n\n```ts\nconst report = 1;\n```\n")).toBe(false);
  expect(placesReport("We have no report.")).toBe(false);
});
