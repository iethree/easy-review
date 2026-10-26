/**
 * Query parsing for the filter box.
 *
 * Free text matches the title, repo, author or number. Structured tokens narrow
 * further: `author:kim`, `repo:api`, `is:easy`, `is:draft`, `is:failing`.
 * Every term must match, and unknown `is:` values fall back to free text so a
 * stray colon never silently hides the whole queue.
 */

import type { Difficulty } from "./difficulty.ts";

export interface ParsedQuery {
  words: string[];
  authors: string[];
  repos: string[];
  levels: Difficulty[];
  draft: boolean | null;
  failing: boolean;
  approvedByMe: boolean;
}

const LEVELS: Difficulty[] = ["easy", "medium", "hard"];

export const EMPTY_QUERY: ParsedQuery = {
  words: [],
  authors: [],
  repos: [],
  levels: [],
  draft: null,
  failing: false,
  approvedByMe: false,
};

/** Splits on whitespace but keeps "quoted phrases" together. */
export function splitTerms(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote = false;

  for (const char of input) {
    if (char === '"') {
      quote = !quote;
      continue;
    }
    if (!quote && /\s/.test(char)) {
      if (current) tokens.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  return tokens;
}

export function parseQuery(input: string): ParsedQuery {
  const result: ParsedQuery = { ...EMPTY_QUERY, words: [], authors: [], repos: [], levels: [] };

  for (const token of splitTerms(input)) {
    const lower = token.toLowerCase();
    const colon = lower.indexOf(":");

    if (colon > 0 && colon < lower.length - 1) {
      const key = lower.slice(0, colon);
      const value = lower.slice(colon + 1);

      if (key === "author" || key === "by") {
        result.authors.push(value);
        continue;
      }
      if (key === "repo" || key === "in") {
        result.repos.push(value);
        continue;
      }
      if (key === "is") {
        if ((LEVELS as string[]).includes(value)) {
          result.levels.push(value as Difficulty);
          continue;
        }
        if (value === "draft") {
          result.draft = true;
          continue;
        }
        if (value === "ready") {
          result.draft = false;
          continue;
        }
        if (value === "failing" || value === "red") {
          result.failing = true;
          continue;
        }
        if (value === "approved") {
          result.approvedByMe = true;
          continue;
        }
      }
    }

    result.words.push(lower);
  }

  return result;
}

export interface MatchInput {
  title: string;
  repo: string;
  author: string;
  number: number;
  isDraft: boolean;
  ciFailed: number;
  level: Difficulty;
  reviewedByMe: boolean;
}

export function matchesQuery(pr: MatchInput, q: ParsedQuery): boolean {
  if (q.levels.length > 0 && !q.levels.includes(pr.level)) return false;
  if (q.draft !== null && pr.isDraft !== q.draft) return false;
  if (q.failing && pr.ciFailed === 0) return false;
  if (q.approvedByMe && !pr.reviewedByMe) return false;

  const author = pr.author.toLowerCase();
  if (q.authors.length > 0 && !q.authors.some((a) => author.includes(a))) return false;

  const repo = pr.repo.toLowerCase();
  if (q.repos.length > 0 && !q.repos.some((r) => repoMatches(repo, r))) return false;

  if (q.words.length > 0) {
    const haystack = `${pr.title} ${pr.repo} ${pr.author} #${pr.number}`.toLowerCase();
    for (const word of q.words) {
      if (!haystack.includes(word)) return false;
    }
  }

  return true;
}

/**
 * `repo:owner/name` is exact, like GitHub's own qualifier — otherwise picking
 * metabase/metabase would also match metabase/metabase-docs. A bare word
 * (`repo:infra`) stays a loose match on the full name, for typing.
 */
function repoMatches(repo: string, wanted: string): boolean {
  return wanted.includes("/") ? repo === wanted : repo.includes(wanted);
}

export function isEmptyQuery(q: ParsedQuery): boolean {
  return (
    q.words.length === 0 &&
    q.authors.length === 0 &&
    q.repos.length === 0 &&
    q.levels.length === 0 &&
    q.draft === null &&
    !q.failing &&
    !q.approvedByMe
  );
}

/* -------------------------------------------------------------------------- */
/* Query editing                                                              */
/*                                                                            */
/* The filter box is the single source of truth: the difficulty control, the   */
/* author picker and the removable chips all rewrite this one string, so the   */
/* UI can never disagree with what is actually being filtered.                 */
/* -------------------------------------------------------------------------- */

/** Re-quotes any term containing whitespace so a round-trip is lossless. */
export function joinTerms(terms: string[]): string {
  return terms.map((t) => (/\s/.test(t) ? `"${t}"` : t)).join(" ");
}

/** Drops one exact term — what the X on a filter chip does. */
export function removeTerm(input: string, term: string): string {
  const lower = term.toLowerCase();
  return joinTerms(splitTerms(input).filter((t) => t.toLowerCase() !== lower));
}

function keyOf(term: string): string | null {
  const colon = term.indexOf(":");
  if (colon <= 0 || colon === term.length - 1) return null;
  return term.slice(0, colon).toLowerCase();
}

function termValue(term: string): string {
  return term.slice(term.indexOf(":") + 1).toLowerCase();
}

/** First value for `key:`, or null. */
export function readToken(input: string, key: string): string | null {
  for (const term of splitTerms(input)) {
    if (keyOf(term) === key) return termValue(term);
  }
  return null;
}

/**
 * Replaces every `key:` term with a single `key:value`, or removes them all
 * when `value` is null. `only` restricts which values count as this token —
 * needed for `is:`, which carries both difficulty and draft/failing states.
 */
export function upsertToken(
  input: string,
  key: string,
  value: string | null,
  only?: readonly string[],
): string {
  const kept = splitTerms(input).filter((term) => {
    if (keyOf(term) !== key) return true;
    return only ? !only.includes(termValue(term)) : false;
  });
  if (value) kept.push(`${key}:${value}`);
  return joinTerms(kept);
}

export function readLevel(input: string): Difficulty | null {
  for (const term of splitTerms(input)) {
    if (keyOf(term) !== "is") continue;
    const value = termValue(term);
    if ((LEVELS as string[]).includes(value)) return value as Difficulty;
  }
  return null;
}

export function setLevel(input: string, level: Difficulty | null): string {
  return upsertToken(input, "is", level, LEVELS);
}

/** Human-readable chips for everything currently narrowing the queue. */
export interface FilterChip {
  term: string;
  label: string;
  color: string;
}

export function describeFilters(input: string): FilterChip[] {
  const chips: FilterChip[] = [];
  for (const term of splitTerms(input)) {
    const key = keyOf(term);
    const value = termValue(term);
    if (key === "author" || key === "by") {
      chips.push({ term, label: `by ${value}`, color: "grape" });
    } else if (key === "repo" || key === "in") {
      chips.push({ term, label: `in ${value}`, color: "blue" });
    } else if (key === "is" && (LEVELS as string[]).includes(value)) {
      chips.push({ term, label: value, color: DIFFICULTY_CHIP[value] ?? "gray" });
    } else if (key === "is") {
      chips.push({ term, label: value, color: "gray" });
    } else {
      chips.push({ term, label: `"${term}"`, color: "gray" });
    }
  }
  return chips;
}

const DIFFICULTY_CHIP: Record<string, string> = {
  easy: "teal",
  medium: "yellow",
  hard: "red",
};
