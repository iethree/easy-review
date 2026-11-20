import { afterAll, expect, test } from "bun:test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { needsClaudeSignIn } from "../shared/aiReview.ts";
import { ClaudeLogin, readLoginOutput } from "./claudeLogin.ts";

const dirs: string[] = [];
afterAll(async () => {
  for (const dir of dirs) await rm(dir, { recursive: true, force: true });
});

/** A stand-in for `claude auth login` that waits for a pasted code. */
async function fakeClaude(script: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "er-login-"));
  dirs.push(dir);
  const path = join(dir, "claude");
  await writeFile(path, `#!/bin/sh\n${script}\n`);
  await chmod(path, 0o755);
  return path;
}

async function until(login: ClaudeLogin, state: string) {
  for (let i = 0; i < 100 && login.status().state !== state; i++) await Bun.sleep(20);
  return login.status();
}

test("knows a sign-in failure when it sees one", () => {
  // Verbatim from a review that stopped.
  expect(
    needsClaudeSignIn(
      "Claude stopped with an error: Failed to authenticate: this login reached its time limit and cannot be renewed. Run `claude auth login` to sign in again, or use `claude setup-token` and set CLAUDE_CODE_OAUTH_TOKEN for unattended jobs",
    ),
  ).toBe(true);
  expect(needsClaudeSignIn("Claude stopped with an error: Not logged in · Please run /login")).toBe(true);
  expect(needsClaudeSignIn("Claude stopped with an error: the worktree is gone.")).toBe(false);
  expect(needsClaudeSignIn(null)).toBe(false);
});

test("reads the sign-in page out of what claude prints", () => {
  expect(
    readLoginOutput("Opening browser to sign in…\nIf the browser didn't open, visit: https://claude.ai/oauth/authorize?x=1\n"),
  ).toEqual({ url: "https://claude.ai/oauth/authorize?x=1", browserOpened: true, success: false });
  expect(readLoginOutput("Open this link:\nhttps://claude.ai/a\n").browserOpened).toBe(false);
  expect(readLoginOutput("Login successful.\n").success).toBe(true);
});

test("follows a sign-in through a pasted code", async () => {
  const path = await fakeClaude(
    `echo "If the browser didn't open, visit: https://claude.ai/oauth/authorize?code=true"
read code
[ "$code" = "abc#123" ] && echo "Login successful." && exit 0
exit 1`,
  );
  const login = new ClaudeLogin(() => path);
  expect(login.start().state).toBe("waiting");
  expect(await until(login, "waiting")).toMatchObject({ state: "waiting" });
  for (let i = 0; i < 100 && !(login.status() as { url?: string | null }).url; i++) await Bun.sleep(20);
  expect(login.status()).toEqual({
    state: "waiting",
    url: "https://claude.ai/oauth/authorize?code=true",
    browserOpened: true,
  });
  // A second press doesn't start a second sign-in.
  expect(login.start().state).toBe("waiting");
  login.sendCode(" abc#123 ");
  expect((await until(login, "done")).state).toBe("done");
});

test("says why a sign-in didn't finish", async () => {
  const path = await fakeClaude(`echo "OAuth error: access denied" >&2; exit 1`);
  const login = new ClaudeLogin(() => path);
  login.start();
  expect(await until(login, "failed")).toEqual({
    state: "failed",
    error: "Signing in didn't finish: OAuth error: access denied",
  });
  expect(new ClaudeLogin(() => null).start()).toEqual({
    state: "failed",
    error: "The claude CLI isn't on the server's PATH.",
  });
  expect(new ClaudeLogin(() => `${path}-missing`).start().state).toBe("failed");
});

test("a cancelled sign-in stops claude and goes back to the start", async () => {
  const path = await fakeClaude(`echo "Open this link: https://claude.ai/a"; sleep 30`);
  const login = new ClaudeLogin(() => path);
  login.start();
  expect(login.cancel()).toEqual({ state: "idle" });
  await Bun.sleep(100);
  // The killed process's exit doesn't turn into a failure.
  expect(login.status()).toEqual({ state: "idle" });
});
