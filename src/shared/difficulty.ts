/** Easy/medium/hard scoring — shared so the server and the settings preview agree. */

import type { DifficultyTier, PullRequest, Settings } from "./types.ts";

export type Difficulty = "easy" | "medium" | "hard";

export interface DifficultyResult {
  level: Difficulty;
  files: number;
  lines: number;
  /** Which input pushed it out of the tier below — used to explain the rating. */
  reason: string;
}

export const DIFFICULTY_ORDER: Difficulty[] = ["easy", "medium", "hard"];

function fitsIn(tier: DifficultyTier, files: number, lines: number): boolean {
  return files <= tier.maxFiles && lines <= tier.maxLines;
}

export function rateDifficulty(
  input: { changedFiles: number; additions: number; deletions: number },
  settings: Settings,
): DifficultyResult {
  const files = input.changedFiles;
  const lines = input.additions + input.deletions;

  if (fitsIn(settings.easy, files, lines)) {
    return { level: "easy", files, lines, reason: "Small and self-contained" };
  }

  if (fitsIn(settings.medium, files, lines)) {
    return {
      level: "medium",
      files,
      lines,
      reason: explain(settings.easy, files, lines, "easy"),
    };
  }

  return {
    level: "hard",
    files,
    lines,
    reason: explain(settings.medium, files, lines, "medium"),
  };
}

/** "142 lines > 50" — names whichever threshold was actually exceeded. */
function explain(tier: DifficultyTier, files: number, lines: number, below: string): string {
  const over: string[] = [];
  if (files > tier.maxFiles) over.push(`${files} files > ${tier.maxFiles}`);
  if (lines > tier.maxLines) over.push(`${lines} lines > ${tier.maxLines}`);
  return over.length > 0 ? `Over ${below}: ${over.join(", ")}` : `Over ${below}`;
}

export function ratePullRequest(pr: PullRequest, settings: Settings): DifficultyResult {
  return rateDifficulty(pr, settings);
}

/** Sort key that puts the quickest wins first. */
export function reviewCost(pr: PullRequest): number {
  return pr.additions + pr.deletions + pr.changedFiles * 12;
}
