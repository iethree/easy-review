/**
 * Findings: the points a Claude review makes, in a form the UI can act on.
 *
 * Every reviewer is asked (REVIEW_SYSTEM_PROMPT in src/local/claude.ts) to end
 * its review with a fenced block tagged `easy-review-findings` holding a JSON
 * array. The Claude pane shows the prose without it, and each finding as a
 * card you can add to the review you're putting together.
 */

import type { DiffSide, ParsedDiff } from "./types.ts";

export const FINDINGS_FENCE = "easy-review-findings";

export type FindingSeverity = "blocking" | "suggestion" | "nit" | "question";

export const SEVERITIES: readonly FindingSeverity[] = ["blocking", "suggestion", "nit", "question"];

export interface Finding {
  severity: FindingSeverity;
  /** One line: what the point is. */
  title: string;
  /** The comment as it would be posted to the author, in Markdown. */
  body: string;
  /** Repository-relative; absent for points about the change as a whole. */
  path?: string;
  line?: number;
  /** RIGHT: a line of the new version. LEFT: a deleted line of the old one. */
  side?: DiffSide;
}

/** What the model is told to produce. Kept here, beside the parser that reads it. */
export const FINDINGS_INSTRUCTIONS = `After the review, end your final message with every point you raised, as a fenced code block tagged ${FINDINGS_FENCE} holding a JSON array — the reviewer's tool turns each one into a comment they can post. Each item:
{"severity": "blocking" | "suggestion" | "nit" | "question", "title": "one line", "body": "the comment to the author, in Markdown", "path": "repo-relative/file.ts", "line": 42, "side": "RIGHT"}
"line" is the line number in the file itself — in the new version (side "RIGHT"), or in the old version for a deleted line (side "LEFT") — not the line's position in pr.diff: count from the @@ -old,n +new,n @@ header of its hunk, or read the file. Use a line that appears in the diff; a comment can't go anywhere else. Leave out path, line and side for points about the change as a whole. Use [] if there is nothing to raise.`;

function isFinding(value: unknown): value is Finding {
  if (!value || typeof value !== "object") return false;
  const f = value as Record<string, unknown>;
  return (
    SEVERITIES.includes(f.severity as FindingSeverity) &&
    typeof f.title === "string" &&
    f.title.trim() !== "" &&
    typeof f.body === "string"
  );
}

/** Keeps a location only when it is a whole one: a path, and a positive line. */
function clean(f: Finding): Finding {
  const finding: Finding = { severity: f.severity, title: f.title.trim(), body: f.body.trim() };
  if (typeof f.path === "string" && f.path.trim()) {
    finding.path = f.path.trim().replace(/^\.?\//, "");
    if (Number.isInteger(f.line) && (f.line as number) > 0) {
      finding.line = f.line;
      finding.side = f.side === "LEFT" ? "LEFT" : "RIGHT";
    }
  }
  return finding;
}

const FENCE = new RegExp(`\`\`\`${FINDINGS_FENCE}[^\\n]*\\n([\\s\\S]*?)\\n?\`\`\``, "g");

/**
 * The review's prose, without the findings block, and the findings in it. A
 * review with no block (or one that isn't valid JSON) is all prose.
 */
export function splitReview(text: string): { prose: string; findings: Finding[] } {
  const blocks = [...text.matchAll(FENCE)];
  const last = blocks.at(-1);
  if (!last || last.index === undefined) return { prose: text, findings: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(last[1] ?? "");
  } catch {
    return { prose: text, findings: [] };
  }
  const findings = Array.isArray(parsed) ? parsed.filter(isFinding).map(clean) : [];
  const prose = (text.slice(0, last.index) + text.slice(last.index + last[0].length)).trim();
  return { prose, findings };
}

/**
 * Where a finding can go in a review. GitHub takes a line comment only on a
 * line in the diff, of the commit the review is on — so a finding about any
 * other line, or from a review of an older commit, goes in the summary.
 */
export function placeFinding(
  finding: Finding,
  diff: ParsedDiff | null,
  reviewedSha: string,
  headSha: string,
): { kind: "line"; path: string; line: number; side: DiffSide } | { kind: "summary" } {
  const { path, line, side } = finding;
  if (!path || !line || !side || !diff || reviewedSha !== headSha) return { kind: "summary" };
  const file = diff.files.find((f) => f.path === path || f.oldPath === path);
  const inDiff = file?.hunks.some((hunk) =>
    hunk.lines.some((l) => (side === "RIGHT" ? l.newNumber === line : l.kind === "del" && l.oldNumber === line)),
  );
  return inDiff && file ? { kind: "line", path: file.path, line, side } : { kind: "summary" };
}

/** A finding as a line comment: its title, then its body. */
export function commentBody(finding: Finding): string {
  return finding.body ? `**${finding.title}**\n\n${finding.body}` : `**${finding.title}**`;
}

/** A finding as a bullet in the review's summary, with where it is. */
export function summaryItem(finding: Finding): string {
  const where = finding.path ? ` (\`${finding.path}${finding.line ? `:${finding.line}` : ""}\`)` : "";
  const body = finding.body ? ` — ${finding.body.replace(/\s*\n\s*/g, " ")}` : "";
  return `- **${finding.title}**${where}${body}`;
}
