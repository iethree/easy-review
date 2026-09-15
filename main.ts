/**
 * easy-review as people run it: the entry point of the compiled binary
 * (`bun run build`), and of `bun run start` from source. The same server as
 * `dev.ts`, without hot reloading.
 */

import { startServer } from "./src/app.ts";

await startServer({ development: false });
