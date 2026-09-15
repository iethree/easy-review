/**
 * /api/local/* — the routes that run Claude Code reviews on this machine.
 * The client asks /api/local/status first; if the claude CLI isn't there,
 * every robot stays hidden.
 */

import {
  CHECKOUT_MAX_AGE_DAYS,
  resumeCommand,
  type CheckoutsResponse,
  type LocalStatus,
} from "../shared/aiReview.ts";
import { detectClaude, type ClaudeStatus } from "./claude.ts";
import type { ReviewJobs } from "./jobs.ts";
import { localPaths } from "./paths.ts";

const NAME = /^[\w.-]+$/;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

const fail = (error: string, status: number) => json({ error }, status);

export function createLocalApi(jobs: ReviewJobs) {
  // `claude --version` costs a process spawn; re-check at most once a minute.
  let claude: { value: ClaudeStatus; at: number } | null = null;
  async function claudeStatus(): Promise<ClaudeStatus> {
    if (!claude || Date.now() - claude.at > 60_000) {
      claude = { value: await detectClaude(), at: Date.now() };
    }
    return claude.value;
  }

  async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.replace(/^\/api\/local\/?/, "").split("/").filter(Boolean);
    const method = request.method;

    try {
      if (parts[0] === "status" && method === "GET") {
        const body: LocalStatus = {
          claude: await claudeStatus(),
          root: localPaths().root,
          ...jobs.counts(),
        };
        return json(body);
      }

      if (parts[0] === "config") {
        if (method === "GET") return json(jobs.getConfig());
        if (method === "PUT") {
          const body = await request.json().catch(() => null);
          if (!body || typeof body !== "object") return fail("Expected a JSON body", 400);
          return json(await jobs.setConfig(body));
        }
      }

      if (parts[0] === "checkouts") {
        if (!parts[1] && method === "GET") {
          const body: CheckoutsResponse = {
            checkouts: await jobs.listCheckouts({ sizes: url.searchParams.get("sizes") === "1" }),
            maxAgeDays: CHECKOUT_MAX_AGE_DAYS,
          };
          return json(body);
        }
        if (parts[1] === "remove" && method === "POST") {
          const body = (await request.json().catch(() => null)) as { paths?: unknown } | null;
          const paths = body?.paths;
          if (
            !Array.isArray(paths) ||
            paths.length === 0 ||
            !paths.every((path): path is string => typeof path === "string")
          ) {
            return fail("paths must be a non-empty list of checkout paths", 400);
          }
          // Each path is checked against what's really on disk before anything is removed.
          return json(await jobs.removeCheckouts(paths));
        }
      }

      if (parts[0] === "reviews") {
        const id = parts[1];

        if (!id && method === "GET") return json({ jobs: jobs.list() });

        if (!id && method === "POST") {
          const body = (await request.json().catch(() => null)) as {
            owner?: unknown;
            name?: unknown;
            number?: unknown;
          } | null;
          const owner = String(body?.owner ?? "");
          const name = String(body?.name ?? "");
          const number = Number(body?.number);
          if (!NAME.test(owner) || !NAME.test(name) || !Number.isInteger(number) || number <= 0) {
            return fail("owner, name and a positive number are required", 400);
          }
          if (!(await claudeStatus()).available) {
            return fail("The claude CLI isn't available to the server.", 503);
          }
          const job = await jobs.start(owner, name, number);
          return json({ ...job, resumeCommand: resumeCommand(job) }, 202);
        }

        if (id) {
          const job = jobs.get(id);
          if (!job) return fail("No such review", 404);

          if (!parts[2] && method === "GET") return json({ ...job, resumeCommand: resumeCommand(job) });
          if (parts[2] === "cancel" && method === "POST") return json(jobs.cancel(id));
          if (!parts[2] && method === "DELETE") {
            await jobs.remove(id);
            return json({ ok: true });
          }
        }
      }
    } catch (err) {
      return fail(err instanceof Error ? err.message : "Unexpected error", 500);
    }

    return fail(`No route for ${method} ${url.pathname}`, 404);
  }

  return { handle };
}
