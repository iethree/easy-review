/**
 * Signs Claude Code in again, for you, when a review stopped because its
 * sign-in expired: runs `claude auth login`, which opens the sign-in page in
 * your browser and waits for it. Without a terminal it prints the page's
 * address, and reads a pasted code from stdin for when the browser can't
 * hand the code back on its own.
 */

import type { ClaudeLoginState } from "../shared/aiReview.ts";
import { childEnv } from "./env.ts";

/** Long enough to find a password; a forgotten attempt doesn't linger. */
const LOGIN_TIMEOUT_MS = 10 * 60_000;

interface Running {
  kill: () => void;
  send: (text: string) => void;
}

/** What `claude auth login` has said so far, read for the parts that matter. */
export function readLoginOutput(out: string): { url: string | null; browserOpened: boolean; success: boolean } {
  const url = out.match(/https:\/\/\S+/)?.[0] ?? null;
  return {
    url,
    // "If the browser didn't open, visit:" when it tried; "Open this link:" when it couldn't.
    browserOpened: /browser didn't open/i.test(out),
    success: /Login successful/i.test(out),
  };
}

export class ClaudeLogin {
  private current: ClaudeLoginState = { state: "idle" };
  private running: Running | null = null;

  constructor(private readonly claudePath: () => string | null = () => Bun.which("claude")) {}

  status(): ClaudeLoginState {
    return this.current;
  }

  /** Starts signing in, or returns the attempt that's already under way. */
  start(): ClaudeLoginState {
    if (this.running) return this.current;
    const path = this.claudePath();
    if (!path) {
      this.current = { state: "failed", error: "The claude CLI isn't on the server's PATH." };
      return this.current;
    }

    let proc: Bun.Subprocess<"pipe", "pipe", "pipe">;
    try {
      proc = Bun.spawn([path, "auth", "login", "--claudeai"], {
        env: childEnv(),
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      });
    } catch (err) {
      this.current = { state: "failed", error: `Couldn't run claude: ${err instanceof Error ? err.message : String(err)}` };
      return this.current;
    }
    const running: Running = {
      kill: () => proc.kill(),
      send: (text) => {
        proc.stdin.write(`${text}\n`);
        proc.stdin.flush();
      },
    };
    this.running = running;
    this.current = { state: "waiting", url: null, browserOpened: false };

    const timer = setTimeout(() => proc.kill(), LOGIN_TIMEOUT_MS);
    let out = "";
    const stderr = new Response(proc.stderr).text();

    void (async () => {
      const decoder = new TextDecoder();
      for await (const chunk of proc.stdout) {
        out += decoder.decode(chunk, { stream: true });
        const read = readLoginOutput(out);
        if (this.running === running && this.current.state === "waiting") {
          this.current = { state: "waiting", url: read.url, browserOpened: read.browserOpened };
        }
      }
      const code = await proc.exited;
      clearTimeout(timer);
      if (this.running !== running) return;
      this.running = null;
      if (code === 0) {
        this.current = { state: "done", at: new Date().toISOString() };
      } else if (this.current.state === "waiting") {
        const why = (await stderr).trim().split("\n").pop() || out.trim().split("\n").pop();
        this.current = {
          state: "failed",
          error: why ? `Signing in didn't finish: ${why.slice(0, 300)}` : "Signing in didn't finish.",
        };
      }
    })();

    return this.current;
  }

  /** The code the sign-in page shows, for when the browser couldn't send it back itself. */
  sendCode(code: string): ClaudeLoginState {
    // Nothing waiting for one (it finished, or was cancelled): the state says which.
    this.running?.send(code.trim());
    return this.current;
  }

  cancel(): ClaudeLoginState {
    const running = this.running;
    this.running = null;
    running?.kill();
    this.current = { state: "idle" };
    return this.current;
  }
}
