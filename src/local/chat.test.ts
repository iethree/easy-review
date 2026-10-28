import { afterAll, beforeAll, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AiReviewJob } from "../shared/aiReview.ts";
import { ReviewJobs } from "./jobs.ts";

let dir: string;
let jobs: ReviewJobs;
const savedPath = process.env.PATH;

/** A stand-in for the claude CLI: it answers with the arguments it was given. */
const FAKE_CLAUDE = `#!/usr/bin/env bun
const args = process.argv.slice(2);
const print = (event) => console.log(JSON.stringify(event));
print({ type: "system", subtype: "init", session_id: "session-1", model: "fake" });
print({ type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "app.ts" } }] } });
print({ type: "result", subtype: "success", result: JSON.stringify(args), session_id: "session-1", total_cost_usd: 0.01, num_turns: 1 });
`;

function review(over: Partial<AiReviewJob>): AiReviewJob {
  const at = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    reviewerId: "general",
    reviewerName: "General",
    instructions: "Review it.",
    owner: "acme",
    name: "app",
    number: 7,
    title: "Make the answer right",
    headSha: "abc",
    baseRef: "main",
    status: "done",
    phase: "Review ready",
    createdAt: at,
    startedAt: at,
    finishedAt: at,
    updatedAt: at,
    error: null,
    costUsd: null,
    turns: null,
    chatPhase: null,
    review: "Looks good.",
    activity: [],
    clonePath: null,
    cloneSource: "detected",
    worktreePath: null,
    sessionId: "session-1",
    model: null,
    readOnly: true,
    stderrTail: null,
    ...over,
  };
}

const ids = { ready: "", noCheckout: "", interrupted: "" };

beforeAll(async () => {
  dir = await realpath(await mkdtemp(join(tmpdir(), "er-chat-")));
  const home = join(dir, "home");
  process.env.EASY_REVIEW_HOME = home;
  const bin = join(dir, "bin");
  await mkdir(bin);
  await Bun.write(join(bin, "claude"), FAKE_CLAUDE);
  await chmod(join(bin, "claude"), 0o755);
  process.env.PATH = `${bin}:${savedPath}`;

  const worktree = join(dir, "worktree");
  await mkdir(worktree);
  const saved = [
    review({ worktreePath: worktree }),
    review({ worktreePath: join(dir, "gone") }),
    review({ worktreePath: worktree, chatPhase: "Read app.ts", chat: [{ role: "user", text: "Why?", at: "x" }] }),
  ];
  ids.ready = saved[0]?.id ?? "";
  ids.noCheckout = saved[1]?.id ?? "";
  ids.interrupted = saved[2]?.id ?? "";
  await mkdir(join(home, "reviews"), { recursive: true });
  for (const job of saved) await Bun.write(join(home, "reviews", `${job.id}.json`), JSON.stringify(job));

  jobs = new ReviewJobs(async () => undefined, { autoSweep: false });
  await jobs.init();
});

afterAll(async () => {
  delete process.env.EASY_REVIEW_HOME;
  process.env.PATH = savedPath;
  await rm(dir, { recursive: true, force: true });
});

async function answered(id: string): Promise<AiReviewJob> {
  for (let i = 0; i < 100; i++) {
    const job = jobs.get(id);
    if (job && !job.chatPhase) return job;
    await Bun.sleep(50);
  }
  throw new Error("No answer");
}

test("a question is answered in the review's own session, with the part of the review it's about", async () => {
  const asked = await jobs.ask(ids.ready, "Is this real?", "- **Race** in the loader");
  expect(asked.chatPhase).not.toBeNull();
  await expect(jobs.ask(ids.ready, "And this?")).rejects.toThrow("still answering");

  const job = await answered(ids.ready);
  const [question, reply] = job.chat ?? [];
  expect(question).toMatchObject({ role: "user", text: "Is this real?", quote: "- **Race** in the loader" });
  expect(reply?.role).toBe("assistant");
  expect(reply?.error).toBeUndefined();
  expect(reply?.costUsd).toBe(0.01);
  const args = JSON.parse(reply?.text ?? "[]") as string[];
  expect(args[args.indexOf("--resume") + 1]).toBe("session-1");
  expect(args[args.indexOf("-p") + 1]).toContain("> - **Race** in the loader");
  // Read-only, as it reviewed.
  expect(args[args.indexOf("--tools") + 1]).toBe("Read,Grep,Glob");
});

test("with its checkout gone, a review's session can't be continued", async () => {
  await expect(jobs.ask(ids.noCheckout, "Why?")).rejects.toThrow("checkout has been removed");
});

test("an answer cut off by a restart says so, and the next question can be asked", async () => {
  const job = jobs.get(ids.interrupted);
  expect(job?.chatPhase).toBeNull();
  expect(job?.chat?.at(-1)).toMatchObject({ role: "assistant", error: true });
  expect(jobs.list().find((j) => j.id === ids.interrupted)?.chatPhase).toBeNull();
});
