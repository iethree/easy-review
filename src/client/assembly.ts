/**
 * The review you're putting together for a pull request, beside the line
 * comments in drafts.ts: its summary, and which of Claude's findings you have
 * already added (so each card can say so). Kept in this browser per pull
 * request, like the drafts, until the review is submitted.
 */

import { useMemo, useSyncExternalStore } from "react";
import { addDraft, useDrafts, type DraftComment } from "./drafts.ts";
import { commentBody, placeFinding, summaryItem, type Finding } from "../shared/findings.ts";
import { findCodeRefs, withoutMarker } from "./proseBlocks.ts";
import type { ParsedDiff, PullRequest } from "../shared/types.ts";

/** Where an added piece went: a draft comment, or this text in the summary. */
export type Placed = { draft: string } | { text: string };

export interface Assembly {
  /** The review's own text: what goes in the box when you submit. */
  summary: string;
  /**
   * Each piece of Claude's review added, by `${reviewId}:${index}`, and where
   * it went — so that removing it from your review makes it addable again.
   */
  added: Record<string, Placed>;
}

export type AssemblyMap = Record<string, Assembly>;

const STORAGE_KEY = "easy-review.assembly.v1";
const EMPTY: Assembly = { summary: "", added: {} };

function isPlaced(value: unknown): value is Placed {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return typeof p.draft === "string" || typeof p.text === "string";
}

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
        // Before pieces said where they went they were a list of keys; with
        // nothing to check them against, they count as not added.
        added:
          added && typeof added === "object" && !Array.isArray(added)
            ? Object.fromEntries(Object.entries(added).filter(([, p]) => isPlaced(p)))
            : {},
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
  if (next.summary.trim() === "" && Object.keys(next.added).length === 0) delete out[prId];
  else out[prId] = next;
  return out;
}

export function findingKey(reviewId: string, index: number): string {
  return `${reviewId}:${index}`;
}

/**
 * The pieces still in your review: their draft comment not deleted, or their
 * text still in the summary. One you removed, or edited, can be added again.
 */
export function stillAdded(assembly: Assembly, drafts: readonly Pick<DraftComment, "id">[]): Set<string> {
  const ids = new Set(drafts.map((d) => d.id));
  const keys = new Set<string>();
  for (const [key, placed] of Object.entries(assembly.added)) {
    if ("draft" in placed ? ids.has(placed.draft) : assembly.summary.includes(placed.text)) keys.add(key);
  }
  return keys;
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

/** The keys of the pieces still in a pull request's review (see stillAdded). */
export function useAdded(prId: string | null | undefined): Set<string> {
  const assembly = useAssembly(prId);
  const drafts = useDrafts(prId);
  return useMemo(() => stillAdded(assembly, drafts), [assembly, drafts]);
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
    const draft = addDraft(pr.id, {
      path: place.path,
      line: place.line,
      ...(place.startLine !== undefined ? { startLine: place.startLine } : {}),
      side: place.side,
      body: commentBody(finding, place),
      commitId: pr.headSha,
    });
    commit(withAssembly(current(), pr.id, { ...a, added: { ...a.added, [key]: { draft } } }));
  } else {
    const text = summaryItem(finding);
    commit(
      withAssembly(current(), pr.id, {
        summary: appendLine(a.summary, text),
        added: { ...a.added, [key]: { text } },
      }),
    );
  }
  return place.kind;
}

/** Paragraphs go in the summary as paragraphs: a blank line between. */
export function appendBlock(summary: string, block: string): string {
  const trimmed = summary.replace(/\s+$/, "");
  return trimmed ? `${trimmed}\n\n${block.trim()}` : block.trim();
}

/**
 * Where a piece of Claude's prose would go: a comment on the lines it points
 * at, when it points at exactly one place in the diff, otherwise the summary.
 */
export function placeProse(
  pr: Pick<PullRequest, "headSha">,
  review: { headSha: string },
  text: string,
  diff: ParsedDiff | null,
): ReturnType<typeof placeFinding> {
  const refs = findCodeRefs(text);
  const [ref] = refs;
  if (refs.length !== 1 || !ref) return { kind: "summary" };
  return placeFinding(
    { severity: "nit", title: "", body: "", path: ref.path, line: ref.line, startLine: ref.startLine, side: "RIGHT" },
    diff,
    review.headSha,
    pr.headSha,
  );
}

export function proseKey(reviewId: string, index: number): string {
  return `${reviewId}:p${index}`;
}

/** A piece of one of Claude's answers in the chat about a review. */
export function answerKey(reviewId: string, message: number, index: number): string {
  return `${reviewId}:c${message}:${index}`;
}

/**
 * Puts one piece of Claude's prose into your review, where placeProse says.
 * `key` is the piece's (see proseKey), for telling it's been added.
 */
export function addProse(
  pr: PullRequest,
  review: { id: string; headSha: string },
  text: string,
  key: string,
  diff: ParsedDiff | null,
): "line" | "summary" {
  const place = placeProse(pr, review, text, diff);
  const a = current()[pr.id] ?? EMPTY;
  if (place.kind === "line") {
    const draft = addDraft(pr.id, {
      path: place.path,
      line: place.line,
      ...(place.startLine !== undefined ? { startLine: place.startLine } : {}),
      side: place.side,
      body: withoutMarker(text),
      commitId: pr.headSha,
    });
    commit(withAssembly(current(), pr.id, { ...a, added: { ...a.added, [key]: { draft } } }));
  } else {
    commit(
      withAssembly(current(), pr.id, {
        summary: appendBlock(a.summary, text),
        added: { ...a.added, [key]: { text: text.trim() } },
      }),
    );
  }
  return place.kind;
}
