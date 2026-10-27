import { afterAll, beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalApi } from "./api.ts";
import { ReviewJobs } from "./jobs.ts";
import {
  createReviewer,
  deleteReviewer,
  formatReviewerFile,
  listReviewers,
  parseReviewerFile,
  seedReviewers,
  slugify,
  updateReviewer,
} from "./reviewers.ts";

const root = await mkdtemp(join(tmpdir(), "er-reviewers-"));
let home = "";
let n = 0;

beforeEach(() => {
  // A fresh ~/.easy-review for every test.
  home = join(root, `home-${n++}`);
  process.env.EASY_REVIEW_HOME = home;
});

afterAll(async () => {
  delete process.env.EASY_REVIEW_HOME;
  await rm(root, { recursive: true, force: true });
});

/* -------------------------------------------------------------------------- */
/* The file format                                                             */
/* -------------------------------------------------------------------------- */

test("a reviewer file is a name in a header, then the instructions", () => {
  const text = formatReviewerFile({ name: "Security", instructions: "\nLook for injection.\n\n" });
  expect(text).toBe("---\nname: Security\n---\n\nLook for injection.\n");
  expect(parseReviewerFile("security", text)).toEqual({
    id: "security",
    name: "Security",
    instructions: "Look for injection.",
  });
});

test("a file without the header is named after the file", () => {
  expect(parseReviewerFile("data-model", "Check the migrations.\n")).toEqual({
    id: "data-model",
    name: "Data model",
    instructions: "Check the migrations.",
  });
});

test("quoted names and Windows line endings are fine", () => {
  expect(parseReviewerFile("x", '---\r\nname: "API: v2"\r\n---\r\nBody').name).toBe("API: v2");
});

test("names become safe file names", () => {
  expect(slugify("Security & Perf!")).toBe("security-perf");
  expect(slugify("  Ünïcode  café ")).toBe("unicode-cafe");
  expect(slugify("../../etc/passwd")).toBe("etc-passwd");
  expect(slugify("!!!")).toBe("reviewer");
});

/* -------------------------------------------------------------------------- */
/* On disk                                                                     */
/* -------------------------------------------------------------------------- */

test("the first run turns the old standing instructions into a reviewer called General", async () => {
  await seedReviewers("My old instructions.");
  expect((await listReviewers()).find((r) => r.id === "general")).toEqual({
    id: "general",
    name: "General",
    instructions: "My old instructions.",
  });
  // Only the first run: deleting General later doesn't bring it back.
  await createReviewer({ name: "Security", instructions: "Injection." });
  await deleteReviewer("general");
  await seedReviewers("My old instructions.");
  expect((await listReviewers()).map((r) => r.id)).toEqual(["layers", "security"]);
});

test("built-in reviewers are offered once, to new and existing setups alike", async () => {
  // An existing setup, from before there were built-ins.
  await mkdir(join(home, "reviewers"), { recursive: true });
  await Bun.write(join(home, "reviewers", "general.md"), "---\nname: General\n---\n\nMine.\n");
  await seedReviewers("unused");
  const layers = (await listReviewers()).find((r) => r.id === "layers");
  expect(layers?.name).toBe("Layers");
  expect(layers?.instructions).toContain("layers");

  // Deleted, it stays deleted.
  await deleteReviewer("layers");
  await seedReviewers("unused");
  expect((await listReviewers()).map((r) => r.id)).toEqual(["general"]);
});

test("a built-in never overwrites a file of the same name", async () => {
  await mkdir(join(home, "reviewers"), { recursive: true });
  await Bun.write(join(home, "reviewers", "layers.md"), "---\nname: My layers\n---\n\nMy own.\n");
  await seedReviewers("unused");
  expect((await listReviewers()).find((r) => r.id === "layers")).toEqual({
    id: "layers",
    name: "My layers",
    instructions: "My own.",
  });
});

test("reviewers are created, listed by name, renamed in place and deleted", async () => {
  const b = await createReviewer({ name: "Performance", instructions: "N+1 queries." });
  const a = await createReviewer({ name: "Accessibility", instructions: "Labels." });
  expect((await listReviewers()).map((r) => r.name)).toEqual(["Accessibility", "Performance"]);

  // Renaming keeps the file, so the id doesn't change under saved reviews.
  await updateReviewer(b.id, { name: "Speed", instructions: "Hot loops." });
  expect(await readdir(join(home, "reviewers"))).toEqual(expect.arrayContaining(["performance.md"]));
  expect((await listReviewers()).find((r) => r.id === "performance")).toEqual({
    id: "performance",
    name: "Speed",
    instructions: "Hot loops.",
  });

  await deleteReviewer(a.id);
  expect((await listReviewers()).map((r) => r.id)).toEqual(["performance"]);
});

test("two reviewers with the same name get different files", async () => {
  const one = await createReviewer({ name: "Nits", instructions: "a" });
  const two = await createReviewer({ name: "Nits", instructions: "b" });
  expect([one.id, two.id]).toEqual(["nits", "nits-2"]);
});

test("a reviewer needs a name and instructions, and the last one can't be deleted", async () => {
  await expect(createReviewer({ name: " ", instructions: "x" })).rejects.toThrow(/name/);
  await expect(createReviewer({ name: "X", instructions: "  " })).rejects.toThrow(/instructions/);
  const only = await createReviewer({ name: "Only", instructions: "x" });
  await expect(deleteReviewer(only.id)).rejects.toThrow(/at least one/);
  await expect(updateReviewer("missing", { name: "X", instructions: "x" })).rejects.toThrow(/No such/);
});

/* -------------------------------------------------------------------------- */
/* Over HTTP                                                                   */
/* -------------------------------------------------------------------------- */

async function api() {
  const jobs = new ReviewJobs(async () => undefined, { autoSweep: false });
  await jobs.init(); // seeds General, and the built-ins
  const { handle } = createLocalApi(jobs);
  return (method: string, path: string, body?: unknown) =>
    handle(
      new Request(`http://localhost/api/local/${path}`, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
}

test("the reviewer routes list, create, update and delete", async () => {
  const call = await api();
  const listed = (await (await call("GET", "reviewers")).json()) as { reviewers: { id: string }[]; dir: string };
  expect(listed.reviewers.map((r) => r.id)).toEqual(["general", "layers"]);
  expect(listed.dir).toBe(join(home, "reviewers"));

  const created = await call("POST", "reviewers", { name: "Security", instructions: "Injection." });
  expect(created.status).toBe(201);
  expect(((await created.json()) as { id: string }).id).toBe("security");

  const updated = await call("PUT", "reviewers/security", { name: "Sec", instructions: "Auth." });
  expect(await updated.json()).toEqual({ id: "security", name: "Sec", instructions: "Auth." });

  expect((await call("DELETE", "reviewers/security")).status).toBe(200);
  expect((await call("DELETE", "reviewers/layers")).status).toBe(200);
  expect((await call("DELETE", "reviewers/general")).status).toBe(400);
  expect((await call("PUT", "reviewers/..%2Fconfig", { name: "x", instructions: "x" })).status).toBe(404);
});

test("a review must name reviewers that exist", async () => {
  const call = await api();
  const res = await call("POST", "reviews", { owner: "acme", name: "app", number: 7, reviewers: ["nobody"] });
  expect(res.status).toBe(400);
  expect(((await res.json()) as { error: string }).error).toMatch(/reviewers/);
  const none = await call("POST", "reviews", { owner: "acme", name: "app", number: 7, reviewers: [] });
  expect(none.status).toBe(400);
});
