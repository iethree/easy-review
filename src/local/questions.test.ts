import { afterAll, beforeAll, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ClaudeProcess, runClaude } from "./claude.ts";

let dir: string;
const savedPath = process.env.PATH;

/**
 * A stand-in for the claude CLI reading messages on stdin, as the real one
 * does: each is echoed back as it reaches the session — mid-turn, between
 * steps — and a turn ends in a result listing every message it has had. One
 * marked LATE reaches it only after the turn's result, so gets a turn of its
 * own. It exits when stdin closes and nothing is left to do.
 */
const FAKE_CLAUDE = `#!/usr/bin/env bun
const print = (event) => console.log(JSON.stringify(event));
const queue = [];
const late = [];
let ended = false;
let wake = () => {};
(async () => {
  const decoder = new TextDecoder();
  let buffered = "";
  for await (const chunk of Bun.stdin.stream()) {
    buffered += decoder.decode(chunk, { stream: true });
    let i;
    while ((i = buffered.indexOf("\\n")) >= 0) {
      const line = buffered.slice(0, i);
      buffered = buffered.slice(i + 1);
      if (line.trim()) (line.includes("LATE") ? late : queue).push(JSON.parse(line).message.content);
      wake();
    }
  }
  ended = true;
  wake();
})();
const next = () => new Promise((resolve) => { wake = resolve; });
const seen = [];
const take = (list) => { while (list.length) { const m = list.shift(); seen.push(m); print({ type: "user", isReplay: true, message: { role: "user", content: m } }); } };
print({ type: "system", subtype: "init", session_id: "s", model: "fake" });
for (;;) {
  while (!queue.length && !late.length && !ended) await next();
  if (!queue.length && !late.length) break;
  take(queue);
  take(late);
  for (let step = 0; step < 3; step++) {
    await Bun.sleep(80);
    print({ type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "a" + step } }] } });
    take(queue);
  }
  print({ type: "result", subtype: "success", result: JSON.stringify(seen), session_id: "s", num_turns: 1 });
}
`;

beforeAll(async () => {
  dir = await realpath(await mkdtemp(join(tmpdir(), "er-questions-")));
  process.env.EASY_REVIEW_HOME = join(dir, "home");
  const bin = join(dir, "bin");
  await mkdir(bin);
  await Bun.write(join(bin, "claude"), FAKE_CLAUDE);
  await chmod(join(bin, "claude"), 0o755);
  process.env.PATH = `${bin}:${savedPath}`;
});

afterAll(async () => {
  delete process.env.EASY_REVIEW_HOME;
  process.env.PATH = savedPath;
  await rm(dir, { recursive: true, force: true });
});

function run(onSpawn: (proc: ClaudeProcess) => void) {
  return runClaude({ cwd: dir, args: ["-p"], prompt: "Review it.", timeoutMs: 10_000, onState: () => {}, onSpawn });
}

test("a question sent while it works reaches the session, and the review that follows has it", async () => {
  let proc: ClaudeProcess | undefined;
  const result = await run((p) => {
    proc = p;
    setTimeout(() => p.send("Does this break embedding?"), 100);
  });
  expect(result.exitCode).toBe(0);
  expect(result.state.delivered).toBe(2);
  expect(JSON.parse(result.state.result?.text ?? "[]")).toEqual(["Review it.", "Does this break embedding?"]);
  // It has finished taking messages.
  expect(proc?.send("Too late?")).toBe(false);
});

test("a question still on its way at a result gets a turn of its own, and that turn's review is the review", async () => {
  const result = await run((p) => {
    setTimeout(() => p.send("LATE: will this slow down CI?"), 100);
  });
  expect(result.state.delivered).toBe(2);
  expect(JSON.parse(result.state.result?.text ?? "[]")).toEqual(["Review it.", "LATE: will this slow down CI?"]);
});

test("with no questions, it ends at its first result", async () => {
  const result = await run(() => {});
  expect(result.exitCode).toBe(0);
  expect(result.timedOut).toBe(false);
  expect(JSON.parse(result.state.result?.text ?? "[]")).toEqual(["Review it."]);
});
