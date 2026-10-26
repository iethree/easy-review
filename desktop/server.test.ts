import { expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "./server.ts";

const env = { PATH: process.env.PATH ?? "" };

async function script(source: string) {
  const dir = await mkdtemp(join(tmpdir(), "er-desktop-"));
  await writeFile(join(dir, "server.ts"), source);
  return { command: process.execPath, args: ["server.ts"], cwd: dir };
}

const exited = (child: { exitCode: number | null; signalCode: string | null; once: (event: "exit", listener: () => void) => unknown }) =>
  child.exitCode !== null || child.signalCode !== null
    ? Promise.resolve()
    : new Promise<void>((resolve) => child.once("exit", () => resolve()));

test("starts the server on the port it is given, and stops it", async () => {
  const cmd = await script(`
    Bun.serve({ hostname: "127.0.0.1", port: Number(process.env.PORT), fetch: () => new Response(process.env.EASY_REVIEW_DESKTOP) });
  `);
  const server = await startServer(cmd, env);
  expect(await (await fetch(server.origin)).text()).toBe("1");
  server.stop();
  await exited(server.child);
});

test("a server that dies on the way up is reported, with what it printed", async () => {
  const cmd = await script(`console.error("gh is missing"); process.exit(3);`);
  await expect(startServer(cmd, env)).rejects.toThrow(/exited while starting[\s\S]*gh is missing/);
});
