/**
 * Local review jobs: queue → prepare a worktree → run Claude → keep the result.
 *
 * Jobs are saved to ~/.easy-review/reviews as they progress, so a finished
 * review survives a restart; one that was mid-flight when the server stopped
 * comes back as failed rather than pretending to still be running.
 *
 * The checkouts they run in are large, so they don't outlive their use: they
 * go when you submit your review of the pull request, when nothing has used
 * them for CHECKOUT_MAX_AGE_DAYS, or when you remove them in Settings. The
 * review itself is always kept.
 */

import { access, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  CHECKOUT_MAX_AGE_DAYS,
  DEFAULT_AI_CONFIG,
  isActive,
  isBusy,
  prKey,
  type AiChatMessage,
  type AiReviewConfig,
  type AiReviewJob,
  type AiReviewSummary,
  type Checkout,
  type RemoveCheckoutsResult,
  type Reviewer,
} from "../shared/aiReview.ts";
import { GitHubClient } from "../server/github.ts";
import { diskUsage, isStale, scanCheckouts } from "./checkouts.ts";
import { buildArgs, buildPrompt, buildQuestion, runClaude, type StreamState } from "./claude.ts";
import { loadConfig, parseCloneMap, saveConfig } from "./config.ts";
import { prepareWorktree, removeWorktree, resolveClone } from "./git.ts";
import { localPaths } from "./paths.ts";
import { seedReviewers } from "./reviewers.ts";
import { keepReport, placesReport } from "./reports.ts";
import { dropScreenshots, keepScreenshots } from "./screenshots.ts";

type Killable = { kill: () => void };

/** A question that can't be asked now; the message says why. */
export class ChatError extends Error {}

export function summarize(job: AiReviewJob): AiReviewSummary {
  const {
    id, reviewerId, reviewerName, owner, name, number, title, headSha, status, phase,
    createdAt, startedAt, finishedAt, updatedAt, error, costUsd, turns, chatPhase,
  } = job;
  return {
    id, reviewerId, reviewerName, owner, name, number, title, headSha, status, phase,
    createdAt, startedAt, finishedAt, updatedAt, error, costUsd, turns, chatPhase: chatPhase ?? null,
  };
}

function describePr(
  owner: string,
  name: string,
  number: number,
  pr: { title: string; body: string; author: string; url: string; baseRef: string; headSha: string },
): string {
  return `# ${pr.title}

- Repository: ${owner}/${name}
- Pull request: #${number} (${pr.url})
- Author: ${pr.author}
- Base branch: ${pr.baseRef}
- Head commit: ${pr.headSha}

## Description, as written by the author

${pr.body.trim() || "_No description._"}
`;
}

function answer(text: string, error = false): AiChatMessage {
  return { role: "assistant", text, ...(error ? { error: true } : {}), at: new Date().toISOString() };
}

export class ReviewJobs {
  private jobs = new Map<string, AiReviewJob>();
  /** The git or claude process each running job is waiting on. */
  private procs = new Map<string, Killable>();
  private running = new Set<string>();
  private cancelled = new Set<string>();
  /** The claude process answering each job's question, and those stopped. */
  private chats = new Map<string, Killable>();
  private chatsStopped = new Set<string>();
  /** Serialises clone/fetch/worktree work per repository. */
  private locks = new Map<string, Promise<unknown>>();
  private saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private config: AiReviewConfig = DEFAULT_AI_CONFIG;

  constructor(
    private readonly getToken: () => Promise<string | undefined>,
    /** `autoSweep: false` skips the startup and hourly clean-up — for tests. */
    private readonly options: { autoSweep?: boolean } = {},
  ) {}

  async init(): Promise<void> {
    this.config = await loadConfig();
    await seedReviewers(this.config.instructions);
    const dir = localPaths().reviews;
    await mkdir(dir, { recursive: true });

    for (const file of await readdir(dir)) {
      if (!file.endsWith(".json")) continue;
      try {
        const job = (await Bun.file(join(dir, file)).json()) as AiReviewJob;
        // Saved before there were reviewers.
        job.reviewerId ??= "";
        job.reviewerName ??= "Claude";
        job.instructions ??= "";
        job.chatPhase ??= null;
        if (job.chatPhase) {
          job.chat = [...(job.chat ?? []), answer("The server stopped while Claude was answering.", true)];
          job.chatPhase = null;
          await this.save(job);
        }
        if (isActive(job.status)) {
          Object.assign(job, {
            status: "failed",
            phase: "Interrupted",
            error: "The server stopped while this review was running.",
            finishedAt: job.finishedAt ?? new Date().toISOString(),
          });
          await this.save(job);
        }
        this.jobs.set(job.id, job);
      } catch {
        // One unreadable file shouldn't hide the rest.
      }
    }

    if (this.options.autoSweep !== false) {
      const sweep = () =>
        void this.sweepStaleCheckouts()
          .then(({ removed }) => {
            if (removed.length === 0) return;
            const s = removed.length === 1 ? "" : "s";
            console.log(`  removed ${removed.length} checkout${s} unused for ${CHECKOUT_MAX_AGE_DAYS} days`);
          })
          .catch(() => {});
      // Not awaited: removing a few big checkouts shouldn't hold up startup.
      sweep();
      setInterval(sweep, 60 * 60 * 1000).unref();
    }
  }

  getConfig(): AiReviewConfig {
    return this.config;
  }

  async setConfig(input: unknown): Promise<AiReviewConfig> {
    this.config = await saveConfig(input);
    this.pump(); // A higher concurrency limit may free queued jobs.
    return this.config;
  }

  counts() {
    let running = 0;
    let queued = 0;
    for (const job of this.jobs.values()) {
      if (job.status === "queued") queued++;
      else if (isActive(job.status)) running++;
    }
    return { running, queued };
  }

  list(): AiReviewSummary[] {
    return [...this.jobs.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(summarize);
  }

  get(id: string): AiReviewJob | undefined {
    return this.jobs.get(id);
  }

  /**
   * Starts a review by each reviewer — or, for a reviewer already reviewing
   * that pull request, returns the review under way.
   */
  async start(owner: string, name: string, number: number, reviewers: Reviewer[]): Promise<AiReviewJob[]> {
    const key = prKey({ owner, name, number });
    const running = new Map<string, AiReviewJob>();
    for (const job of this.jobs.values()) {
      if (prKey(job) === key && isActive(job.status)) running.set(job.reviewerId, job);
    }
    if (reviewers.every((r) => running.has(r.id))) return reviewers.map((r) => running.get(r.id) as AiReviewJob);

    const token = await this.getToken();
    if (!token) throw new Error("Not signed in to GitHub — run `gh auth login`.");
    const pr = await new GitHubClient(token).fetchPullRequest(owner, name, number);
    const description = describePr(owner, name, number, pr);

    const started: AiReviewJob[] = [];
    for (const reviewer of reviewers) {
      const existing = running.get(reviewer.id);
      if (existing) {
        started.push(existing);
        continue;
      }
      const job = this.newJob(owner, name, number, pr, reviewer);
      this.jobs.set(job.id, job);
      await this.save(job);
      this.descriptions.set(job.id, description);
      started.push(job);
    }
    this.pump();
    return started;
  }

  private newJob(
    owner: string,
    name: string,
    number: number,
    pr: { title: string; headSha: string; baseRef: string },
    reviewer: Reviewer,
  ): AiReviewJob {
    const now = new Date().toISOString();
    return {
      id: crypto.randomUUID(),
      reviewerId: reviewer.id,
      reviewerName: reviewer.name,
      instructions: reviewer.instructions,
      owner,
      name,
      number,
      title: pr.title,
      headSha: pr.headSha,
      baseRef: pr.baseRef,
      status: "queued",
      phase: "Waiting for a free slot",
      createdAt: now,
      startedAt: null,
      finishedAt: null,
      updatedAt: now,
      error: null,
      costUsd: null,
      turns: null,
      chatPhase: null,
      review: null,
      activity: [],
      clonePath: null,
      cloneSource: null,
      worktreePath: null,
      sessionId: null,
      model: null,
      stderrTail: null,
    };
  }

  cancel(id: string): AiReviewJob | undefined {
    const job = this.jobs.get(id);
    if (!job || !isActive(job.status)) return job;
    this.cancelled.add(id);
    this.procs.get(id)?.kill();
    // A queued job has no process yet; it's finished here and now.
    if (job.status === "queued") this.finish(job, { status: "cancelled", phase: "Cancelled" });
    return job;
  }

  async remove(id: string): Promise<boolean> {
    const job = this.jobs.get(id);
    if (!job) return false;
    if (isActive(job.status)) throw new Error("Cancel the review before deleting it.");
    this.stopChat(id);

    const others = [...this.jobs.values()].filter((j) => j.id !== id);
    if (job.clonePath && job.worktreePath) {
      // A re-review of the same commit shares the checkout; leave it for them.
      const shared = others.some((j) => j.worktreePath === job.worktreePath);
      const samePr = others.some((j) => prKey(j) === prKey(job));
      if (!shared) await removeWorktree(job.clonePath, job.worktreePath, job.number, !samePr);
    }

    this.jobs.delete(id);
    clearTimeout(this.saveTimers.get(id));
    await rm(join(localPaths().reviews, `${id}.json`), { force: true });
    await dropScreenshots(id);
    return true;
  }

  /* ---------------------------------------------------------------------- */
  /* Follow-up questions                                                     */
  /* ---------------------------------------------------------------------- */

  /**
   * Asks a question about a finished review, in the Claude session that
   * wrote it, in its checkout and with the tools it had. Returns at once; the
   * answer arrives on the job, with chatPhase saying what Claude is doing.
   */
  async ask(id: string, question: string, quote?: string): Promise<AiReviewJob> {
    const job = this.jobs.get(id);
    if (!job) throw new ChatError("No such review");
    if (isActive(job.status)) throw new ChatError("Wait for the review to finish.");
    if (job.chatPhase) throw new ChatError("Claude is still answering the last question.");
    if (!job.sessionId) throw new ChatError("This review has no Claude session to continue.");
    const cwd = job.worktreePath;
    if (!cwd || !(await access(cwd).then(() => true, () => false))) {
      throw new ChatError("Its checkout has been removed, so its session can't be continued. Re-run the review to ask about it.");
    }

    const asked: AiChatMessage = {
      role: "user",
      text: question.trim(),
      ...(quote?.trim() ? { quote: quote.trim() } : {}),
      at: new Date().toISOString(),
    };
    this.update(job, { chat: [...(job.chat ?? []), asked], chatPhase: "Thinking" });
    void this.answer(job, cwd, job.sessionId, buildQuestion(question, quote)).finally(() => {
      this.chats.delete(id);
      this.chatsStopped.delete(id);
    });
    return job;
  }

  stopChat(id: string): AiReviewJob | undefined {
    const job = this.jobs.get(id);
    if (!job?.chatPhase) return job;
    this.chatsStopped.add(id);
    this.chats.get(id)?.kill();
    return job;
  }

  private async answer(job: AiReviewJob, cwd: string, sessionId: string, prompt: string): Promise<void> {
    const config = this.config;
    let reply: AiChatMessage;
    let session = sessionId;
    try {
      let seen = 0;
      const result = await runClaude({
        cwd,
        // The tools it reviewed with; reviews from before the setting were read-only.
        args: buildArgs(prompt, { ...config, readOnly: job.readOnly ?? true }, sessionId),
        timeoutMs: config.timeoutMinutes * 60_000,
        onSpawn: (proc) => {
          this.chats.set(job.id, proc);
          if (this.chatsStopped.has(job.id)) proc.kill();
        },
        onState: (state: StreamState) => {
          if (state.activity.length === seen) return;
          seen = state.activity.length;
          this.update(job, { chatPhase: state.activity.at(-1) ?? job.chatPhase }, { quiet: true });
        },
      });
      session = result.state.sessionId ?? sessionId;
      await keepScreenshots(cwd, job.id).catch(() => []);
      const r = result.state.result;
      reply = this.chatsStopped.has(job.id)
        ? answer("Stopped.", true)
        : r?.ok && r.text.trim()
          ? { ...answer(r.text), costUsd: r.costUsd }
          : answer(
              result.timedOut
                ? `Timed out after ${config.timeoutMinutes} minutes.`
                : r && !r.ok
                  ? `Claude stopped with an error${r.text ? `: ${r.text.slice(0, 300)}` : "."}`
                  : `claude exited with code ${result.exitCode} without an answer.${
                      result.stderr.trim() ? ` ${result.stderr.trim().split("\n").slice(-3).join(" ")}` : ""
                    }`,
              true,
            );
    } catch (err) {
      reply = answer(err instanceof Error ? err.message : String(err), true);
    }
    this.update(job, { chat: [...(job.chat ?? []), reply], chatPhase: null, sessionId: session });
  }

  /* ---------------------------------------------------------------------- */
  /* Checkouts                                                               */
  /* ---------------------------------------------------------------------- */

  /** Measured sizes, remembered until a review runs in that checkout again. */
  private sizes = new Map<string, { usedAt: string; bytes: number | null }>();

  /** Everything checked out, most recently used first. Sizes cost a `du` each. */
  async listCheckouts({ sizes = false }: { sizes?: boolean } = {}): Promise<Checkout[]> {
    const checkouts = await scanCheckouts(this.jobs.values());
    if (!sizes) return checkouts;
    return Promise.all(
      checkouts.map(async (checkout) => {
        let known = this.sizes.get(checkout.path);
        if (!known || known.usedAt !== checkout.lastUsedAt) {
          known = { usedAt: checkout.lastUsedAt, bytes: await diskUsage(checkout.path) };
          this.sizes.set(checkout.path, known);
        }
        return { ...checkout, sizeBytes: known.bytes };
      }),
    );
  }

  /**
   * Removes checkouts. Only paths that really are checkouts are touched —
   * anything else is refused, whatever the request says — and never one a
   * review is running in. The reviews themselves are kept.
   */
  async removeCheckouts(paths: readonly string[]): Promise<RemoveCheckoutsResult> {
    const result: RemoveCheckoutsResult = { removed: [], failed: [] };
    const all = await scanCheckouts(this.jobs.values());
    const wanted = new Set(paths);
    const known = new Set(all.map((checkout) => checkout.path));
    for (const path of wanted) {
      if (!known.has(path)) result.failed.push({ path, error: "Not a checkout" });
    }

    const gone = new Set<string>();
    for (const checkout of all) {
      if (!wanted.has(checkout.path)) continue;
      try {
        await this.removeCheckout(checkout, all, gone);
        gone.add(checkout.path);
        result.removed.push(checkout.path);
      } catch (err) {
        result.failed.push({
          path: checkout.path,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return result;
  }

  /** Once you've submitted your review of a pull request, its checkouts are done with. */
  async removeCheckoutsForPr(owner: string, name: string, number: number): Promise<RemoveCheckoutsResult> {
    const key = prKey({ owner, name, number });
    const all = await scanCheckouts(this.jobs.values());
    const paths = all.filter((c) => prKey(c) === key && !c.inUse).map((c) => c.path);
    return paths.length > 0 ? this.removeCheckouts(paths) : { removed: [], failed: [] };
  }

  /** Removes checkouts that nothing has used for CHECKOUT_MAX_AGE_DAYS. */
  async sweepStaleCheckouts(now = Date.now()): Promise<RemoveCheckoutsResult> {
    const all = await scanCheckouts(this.jobs.values());
    // A checkout deleted by hand would leave its review offering a command
    // that `cd`s into nothing, so forget it.
    const onDisk = new Set(all.map((checkout) => checkout.path));
    for (const job of this.jobs.values()) {
      if (job.worktreePath && !onDisk.has(job.worktreePath) && !isBusy(job)) {
        this.update(job, { worktreePath: null });
      }
    }
    const stale = all.filter((checkout) => isStale(checkout, now)).map((checkout) => checkout.path);
    return stale.length > 0 ? this.removeCheckouts(stale) : { removed: [], failed: [] };
  }

  private async removeCheckout(checkout: Checkout, all: Checkout[], gone: Set<string>): Promise<void> {
    // The same lock that preparing a checkout takes, so the two never overlap.
    await this.withLock(`${checkout.owner}/${checkout.name}`.toLowerCase(), async () => {
      // Asked again inside the lock: a review may have started here meanwhile.
      const busy = [...this.jobs.values()].some((job) => job.worktreePath === checkout.path && isBusy(job));
      if (busy) throw new Error("A review is running in this checkout");

      if (checkout.clonePath) {
        // The PR's refs are shared by every checkout of it in that clone.
        const lastOfPr = !all.some(
          (other) =>
            other.path !== checkout.path &&
            !gone.has(other.path) &&
            other.clonePath === checkout.clonePath &&
            other.number === checkout.number,
        );
        await removeWorktree(checkout.clonePath, checkout.path, checkout.number, lastOfPr);
      } else {
        await rm(checkout.path, { recursive: true, force: true });
      }

      this.sizes.delete(checkout.path);
      for (const job of this.jobs.values()) {
        if (job.worktreePath === checkout.path) this.update(job, { worktreePath: null });
      }
    });
  }

  /* ---------------------------------------------------------------------- */

  /** PR descriptions are fetched once, at start; held here until the job runs. */
  private descriptions = new Map<string, string>();

  private pump(): void {
    const queued = [...this.jobs.values()]
      .filter((j) => j.status === "queued")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    for (const job of queued) {
      if (this.running.size >= this.config.maxConcurrent) break;
      this.running.add(job.id);
      void this.run(job).finally(() => {
        this.running.delete(job.id);
        this.procs.delete(job.id);
        this.cancelled.delete(job.id);
        this.descriptions.delete(job.id);
        this.pump();
      });
    }
  }

  private async run(job: AiReviewJob): Promise<void> {
    const config = this.config;
    const phase = (text: string) => this.update(job, { phase: text });
    const onSpawn = (proc: Killable) => this.procs.set(job.id, proc);

    try {
      this.update(job, {
        status: "preparing",
        phase: "Finding a local clone",
        startedAt: new Date().toISOString(),
      });

      const repo = `${job.owner}/${job.name}`.toLowerCase();
      const { clone, worktree } = await this.withLock(repo, async () => {
        const clone = await resolveClone(job.owner, job.name, parseCloneMap(config.clones), phase);
        this.update(job, { clonePath: clone.path, cloneSource: clone.source });
        if (this.cancelled.has(job.id)) return { clone, worktree: null };
        const worktree = await prepareWorktree(
          clone,
          {
            owner: job.owner,
            name: job.name,
            number: job.number,
            baseRef: job.baseRef,
            description: this.descriptions.get(job.id) ?? `# ${job.title}\n`,
          },
          phase,
          onSpawn,
        );
        return { clone, worktree };
      });

      if (this.cancelled.has(job.id) || !worktree) {
        this.finish(job, { status: "cancelled", phase: "Cancelled" });
        return;
      }

      this.update(job, {
        status: "reviewing",
        phase: "Claude is reading the diff",
        worktreePath: worktree.path,
        headSha: worktree.headSha,
        clonePath: clone.path,
        // How it ran, for continuing it in a terminal with the same tools.
        readOnly: config.readOnly,
      });

      let seen = 0;
      const result = await runClaude({
        cwd: worktree.path,
        // Legacy jobs, from before reviewers, re-run with the old setting.
        args: buildArgs(buildPrompt(job, job.instructions || config.instructions), config),
        timeoutMs: config.timeoutMinutes * 60_000,
        onSpawn,
        onState: (state: StreamState) => {
          const fresh = state.activity.slice(seen).map((text) => ({
            at: new Date().toISOString(),
            text,
          }));
          seen = state.activity.length;
          this.update(
            job,
            {
              sessionId: state.sessionId,
              model: state.model,
              activity: fresh.length ? [...job.activity, ...fresh].slice(-200) : job.activity,
              phase: fresh.at(-1)?.text ?? job.phase,
            },
            { quiet: true },
          );
        },
      });

      const tail = result.stderr.trim().split("\n").slice(-15).join("\n") || null;
      const r = result.state.result;
      // Before the worktree can be cleaned up: they're part of the review.
      await keepScreenshots(worktree.path, job.id).catch(() => []);
      // Only for a review that shows one: reviewers started together share the checkout.
      if (r?.ok && placesReport(r.text)) {
        await keepReport(worktree.path, job.id, new Date(job.startedAt ?? job.createdAt)).catch(() => false);
      }

      if (this.cancelled.has(job.id)) {
        this.finish(job, { status: "cancelled", phase: "Cancelled", stderrTail: tail });
      } else if (r?.ok && r.text.trim()) {
        this.finish(job, {
          status: "done",
          phase: "Review ready",
          review: r.text,
          costUsd: r.costUsd,
          turns: r.turns ?? job.turns,
          sessionId: result.state.sessionId ?? job.sessionId,
          stderrTail: tail,
        });
      } else {
        const why = result.timedOut
          ? `Timed out after ${config.timeoutMinutes} minutes.`
          : r && !r.ok
            ? `Claude stopped with an error${r.text ? `: ${r.text.slice(0, 300)}` : "."}`
            : `claude exited with code ${result.exitCode} without a review.`;
        this.finish(job, { status: "failed", phase: "Failed", error: why, stderrTail: tail });
      }
    } catch (err) {
      const cancelled = this.cancelled.has(job.id);
      this.finish(job, {
        status: cancelled ? "cancelled" : "failed",
        phase: cancelled ? "Cancelled" : "Failed",
        error: cancelled ? null : err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(fn);
    this.locks.set(key, next);
    try {
      return await next;
    } finally {
      if (this.locks.get(key) === next) this.locks.delete(key);
    }
  }

  private finish(job: AiReviewJob, patch: Partial<AiReviewJob>): void {
    this.update(job, { ...patch, finishedAt: new Date().toISOString() });
  }

  /** Status changes are saved at once; streaming progress at most every 2s. */
  private update(job: AiReviewJob, patch: Partial<AiReviewJob>, opts: { quiet?: boolean } = {}): void {
    Object.assign(job, patch, { updatedAt: new Date().toISOString() });
    if (!opts.quiet) {
      clearTimeout(this.saveTimers.get(job.id));
      this.saveTimers.delete(job.id);
      void this.save(job);
    } else if (!this.saveTimers.has(job.id)) {
      this.saveTimers.set(
        job.id,
        setTimeout(() => {
          this.saveTimers.delete(job.id);
          void this.save(job);
        }, 2_000),
      );
    }
  }

  private async save(job: AiReviewJob): Promise<void> {
    if (!this.jobs.has(job.id)) return; // deleted meanwhile
    await Bun.write(join(localPaths().reviews, `${job.id}.json`), JSON.stringify(job, null, 2));
  }
}
