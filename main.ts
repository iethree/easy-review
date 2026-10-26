/**
 * easy-review as people run it: the entry point of the compiled binary
 * (`bun run build`), and of `bun run start` from source. The same server as
 * `dev.ts`, without hot reloading.
 */

import { startServer } from "./src/app.ts";

await startServer({ development: false });

// Run by the desktop app (desktop/server.ts), which holds our stdin open for
// as long as it lives. If it quits or crashes, the pipe closes: go with it,
// rather than linger as a server nobody can see.
if (process.env.EASY_REVIEW_DESKTOP === "1") {
  process.stdin.on("end", () => process.exit(0));
  process.stdin.on("close", () => process.exit(0));
  process.stdin.resume();
}
