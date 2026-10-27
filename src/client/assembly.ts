/**
 * The review you're putting together for a pull request, beside the line
 * comments in drafts.ts: its summary, and which of Claude's findings you have
 * already added (so each card can say so). Kept in this browser per pull
 * request, like the drafts, until the review is submitted.
 */

import { useSyncExternalStore } from "react";
import { addDraft } from "./drafts.ts";
import { commentBody, placeFinding, summaryItem, type Finding } from "../shared/findings.ts";
import type { ParsedDiff, PullRequest } from "../shared/types.ts";

export interface Assembly {
  /** The review's own text: what goes in the box when you submit. */
  summary: string;
  /** `${reviewId}:${index}` of each finding added. */
  added: string[];
}

export type AssemblyMap = Record<string, Assembly>;

const STORAGE_KEY = "easy-review.assembly.v1";
const EMPTY: Assembly = { summary: "", added: [] };

export function parseAssemblies(raw: string | null): AssemblyMap {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out: AssemblyMap = {};
    for (const [prId, a] of Object.entries(value as Record<string, unknown>)) {
      if (!a || typeof a !== "object") continue;
      const { summary, added } = a as Record<string, unknown>;
      out[prId] = {
        summary: typeof summary === "string" ? summary : "",
        added: Array.isArray(added) ? added.filter((k): k is string => typeof k === "string") : [],
      };
    }
    return out;
  } catch {
    return {};
  }
}

/** Adds a line to the summary, under what is there. */
export function appendLine(summary: string, line: string): string {
  const trimmed = summary.replace(/\s+$/, "");
  return trimmed ? `${trimmed}\n${line}` : line;
}

/** A pull request with nothing in it drops out, so storage doesn't collect empties. */
export function withAssembly(map: AssemblyMap, prId: string, next: Assembly): AssemblyMap {
  const out = { ...map };
  if (next.summary.trim() === "" && next.added.length === 0) delete out[prId];
  else out[prId] = next;
  return out;
}

export function findingKey(reviewId: string, index: number): string {
  return `${reviewId}:${index}`;
}

/* -------------------------------------------------------------------------- */
/* The store                                                                   */
/* -------------------------------------------------------------------------- */

let cache: AssemblyMap | null = null;
const listeners = new Set<() => void>();

function current(): AssemblyMap {
  if (cache === null) {
    try {
      cache = parseAssemblies(localStorage.getItem(STORAGE_KEY));
    } catch {
      cache = {};
    }
  }
  return cache;
}

function commit(next: AssemblyMap): void {
  cache = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage disabled — it lasts until the page reloads */
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAssembly(prId: string | null | undefined): Assembly {
  return useSyncExternalStore(
    subscribe,
    () => (prId ? (current()[prId] ?? EMPTY) : EMPTY),
    () => EMPTY,
  );
}

export function setSummary(prId: string, summary: string): void {
  const a = current()[prId] ?? EMPTY;
  commit(withAssembly(current(), prId, { ...a, summary }));
}

/** Submitted: start the next review of it from nothing. */
export function clearAssembly(prId: string): void {
  commit(withAssembly(current(), prId, EMPTY));
}

/**
 * Puts one of Claude's findings into your review: a comment on its line when
 * GitHub will take one there, otherwise a bullet in the summary.
 */
export function addFinding(
  pr: PullRequest,
  review: { id: string; headSha: string },
  finding: Finding,
  index: number,
  diff: ParsedDiff | null,
): "line" | "summary" {
  const place = placeFinding(finding, diff, review.headSha, pr.headSha);
  const a = current()[pr.id] ?? EMPTY;
  const key = findingKey(review.id, index);
  if (place.kind === "line") {
    addDraft(pr.id, {
      path: place.path,
      line: place.line,
      ...(place.startLine !== undefined ? { startLine: place.startLine } : {}),
      side: place.side,
      body: commentBody(finding, place),
      commitId: pr.headSha,
    });
  }
  commit(
    withAssembly(current(), pr.id, {
      summary: place.kind === "summary" ? appendLine(a.summary, summaryItem(finding)) : a.summary,
      added: a.added.includes(key) ? a.added : [...a.added, key],
    }),
  );
  return place.kind;
}
