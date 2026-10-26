/**
 * The easy-review server, run as a child of the app.
 *
 * The server is written for Bun (Bun.serve, Bun.spawn, HTML imports), and
 * Electron's main process is Node, so the app doesn't host it: it runs it.
 * Packaged, that's the compiled binary in Resources/server (built by
 * `bun run build`); from source, it's `bun main.ts`.
 */

import { type ChildProcess, spawn } from "node:child_process";
import { createServer } from "node:net";

export interface ServerCommand {
  command: string;
  args: string[];
  cwd: string;
}

export interface RunningServer {
  origin: string;
  child: ChildProcess;
  /** The last of the server's output, for an error message if it dies. */
  output: () => string;
  stop: () => void;
}

/** A port nothing is listening on right now. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

async function waitUntilUp(origin: string, child: ChildProcess, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("The server exited while starting.");
    }
    try {
      const res = await fetch(origin, { signal: AbortSignal.timeout(1_000) });
      if (res.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`The server didn't start within ${Math.round(timeoutMs / 1000)}s.`);
}

export async function startServer(
  cmd: ServerCommand,
  env: Record<string, string>,
  timeoutMs = 20_000,
): Promise<RunningServer> {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;

  const child = spawn(cmd.command, cmd.args, {
    cwd: cmd.cwd,
    env: { ...env, PORT: String(port), EASY_REVIEW_DESKTOP: "1" },
    // stdin stays open as a lifeline: when the app goes, however it goes,
    // the pipe closes and the server exits (see main.ts at the project root).
    stdio: ["pipe", "pipe", "pipe"],
    // Its own process group, so stopping it stops the git and claude
    // processes it started too — as Ctrl-C does in a terminal.
    detached: true,
  });

  let log = "";
  const keep = (chunk: Buffer) => {
    log = (log + chunk.toString()).slice(-4_000);
  };
  child.stdout?.on("data", keep);
  child.stderr?.on("data", keep);

  const stop = () => {
    if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) return;
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  };

  try {
    await waitUntilUp(origin, child, timeoutMs);
  } catch (err) {
    stop();
    const detail = log.trim();
    throw new Error(`${err instanceof Error ? err.message : String(err)}${detail ? `\n\n${detail}` : ""}`);
  }

  return { origin, child, output: () => log, stop };
}
