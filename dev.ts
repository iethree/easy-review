/** Development: `bun run dev` — the server, with hot reloading. */

import { startServer } from "./src/app.ts";

await startServer({ development: true });
