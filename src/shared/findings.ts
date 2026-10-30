/**
 * Findings: the points a Claude review makes, in a form the UI can act on.
 *
 * Every reviewer is asked (reviewSystemPrompt in src/local/claude.ts) to end
 * its review with a fenced block tagged `easy-review-findings` holding a JSON
 * object: its verdict, a sentence on why, and its findings. The Claude pane
 * shows the verdict above the prose, the prose without the block, and each
 * finding as a card you can add to the review you're putting together.
 * Reviews from before the verdict end with the findings alone, as an array.
 */

import type { DiffLine, DiffSide, ParsedDiff } from "./types.ts";

export const FINDINGS_FENCE = "easy-review-findings";

export type FindingSeverity = "blocking" | "suggestion" | "nit" | "question";

export const SEVERITIES: readonly FindingSeverity[] = ["blocking", "suggestion", "nit", "question"];

/** What the reviewer would do with the pull request, as on GitHub. */
export type AiVerdict = "approve" | "comment" | "request-changes";

export const AI_VERDICTS: readonly AiVerdict[] = ["approve", "comment", "request-changes"];

export interface ReviewVerdict {
  verdict: AiVerdict;
  /** A sentence or two: why. May be empty. */
  summary: string;
}

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
  /** When the point covers several lines: the first (`line` is the last). */
  startLine?: number;
  /**
   * The code to put in place of lines startLine–line (or just `line`) of the
   * new version — posted as a GitHub suggested change the author can apply.
   */
  suggestion?: string;
}

/** What the model is told to produce. Kept here, beside the parser that reads it. */
export const FINDINGS_INSTRUCTIONS = `Make your points distinct and concrete: one issue, at one place in the code, per point — never two problems folded into one, and never the same problem twice. Keep the prose of your review to a short summary; the verdict and the points themselves go in the block below, not in the prose.

End your final message with a fenced code block tagged ${FINDINGS_FENCE} holding one JSON object:
{"verdict": "approve" | "comment" | "request-changes", "summary": "one or two sentences: why that verdict", "findings": [...]}
- "verdict" is what you would do with this pull request on GitHub: "approve" when it can merge as it is (nits at most), "request-changes" when anything is blocking, and "comment" otherwise — questions or suggestions to settle first. It is shown, coloured, at the top of your review and beside the pull request in the list.
- "findings" holds every point — the reviewer picks from these, one by one, and each becomes a comment on the pull request. Each item:
{"severity": "blocking" | "suggestion" | "nit" | "question", "title": "one line", "body": "the comment to the author, in Markdown", "path": "repo-relative/file.ts", "startLine": 40, "line": 42, "side": "RIGHT", "suggestion": "the replacement code"}
- "line" is a line number in the file itself — in the new version (side "RIGHT"), or in the old version for a deleted line (side "LEFT") — not the line's position in pr.diff: count from the @@ -old,n +new,n @@ header of its hunk, or read the file. It must be a line that appears in the diff.
- For a point about several lines, "startLine" is the first and "line" the last, both in the same hunk. Leave startLine out for a single line.
- Whenever the fix is a change to those lines, give it as "suggestion": the exact code to replace lines startLine–line (or just line) of the new version, whole lines with their indentation, nothing else. The author can apply it with one click, so it must be correct and complete. Only for side "RIGHT".
- Leave out path, line, startLine, side and suggestion for points about the change as a whole.
- Use "findings": [] if there is nothing to raise.`;

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
      const line = f.line as number;
      finding.line = line;
      finding.side = f.side === "LEFT" ? "LEFT" : "RIGHT";
      if (Number.isInteger(f.startLine) && (f.startLine as number) > 0 && (f.startLine as number) < line) {
        finding.startLine = f.startLine;
      }
      // A suggestion replaces lines of the new version; on a deleted line it means nothing.
      if (typeof f.suggestion === "string" && finding.side === "RIGHT") {
        finding.suggestion = f.suggestion.replace(/\n$/, "");
      }
    }
  }
  return finding;
}

const OPENING = new RegExp(`\`\`\`${FINDINGS_FENCE}[^\\n]*\\n`, "g");
const CLOSING = "```";

function readVerdict(value: Record<string, unknown>): ReviewVerdict | null {
  const verdict = typeof value.verdict === "string" ? value.verdict.trim().toLowerCase().replace(/[\s_]+/g, "-") : "";
  if (!AI_VERDICTS.includes(verdict as AiVerdict)) return null;
  return { verdict: verdict as AiVerdict, summary: typeof value.summary === "string" ? value.summary.trim() : "" };
}

/**
 * The findings block the review ends with: where it starts and ends, and its
 * JSON. A finding's body is Markdown and may hold a code block of its own, so
 * the block ends not at the first ``` after it opens but at the first one that
 * closes valid JSON.
 */
function findingsBlock(text: string): { start: number; end: number; parsed: unknown } | null {
  const opening = [...text.matchAll(OPENING)].at(-1);
  if (!opening || opening.index === undefined) return null;
  const from = opening.index + opening[0].length;
  for (let close = text.indexOf(CLOSING, from); close >= 0; close = text.indexOf(CLOSING, close + 1)) {
    try {
      return { start: opening.index, end: close + CLOSING.length, parsed: JSON.parse(text.slice(from, close)) };
    } catch {
      // Not the end yet: this ``` is inside a string.
    }
  }
  return null;
}

/**
 * The review's prose, without the findings block, and the findings in it. A
 * review with no block (or one that isn't valid JSON) is all prose.
 */
export function splitReview(text: string): { prose: string; findings: Finding[]; verdict: ReviewVerdict | null } {
  const block = findingsBlock(text);
  if (!block) return { prose: text, findings: [], verdict: null };
  const { parsed } = block;
  const object = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  // An array is the findings alone, from before the verdict.
  const items = Array.isArray(parsed) ? parsed : Array.isArray(object?.findings) ? object.findings : [];
  const prose = (text.slice(0, block.start) + text.slice(block.end)).trim();
  return { prose, findings: items.filter(isFinding).map(clean), verdict: object ? readVerdict(object) : null };
}

/** Just the verdict a review ends with, for the list: null if it gives none. */
export function verdictOf(text: string | null): AiVerdict | null {
  return text ? splitReview(text).verdict?.verdict ?? null : null;
}

const SEVERITY_OF_VERDICT: Record<AiVerdict, number> = { approve: 0, comment: 1, "request-changes": 2 };

/** Several reviewers' verdicts as one: the most severe, so a request for changes is never hidden. */
export function overallVerdict(verdicts: readonly (AiVerdict | null | undefined)[]): AiVerdict | null {
  let worst: AiVerdict | null = null;
  for (const v of verdicts) {
    if (v && (worst === null || SEVERITY_OF_VERDICT[v] > SEVERITY_OF_VERDICT[worst])) worst = v;
  }
  return worst;
}

/**
 * The diff's file for a path as written in a review: the whole path, or —
 * since reviews often shorten them — the end of exactly one file's path.
 */
function fileFor(diff: ParsedDiff, path: string) {
  const exact = diff.files.find((f) => f.path === path || f.oldPath === path);
  if (exact) return exact;
  const tail = diff.files.filter((f) => f.path.endsWith(`/${path}`));
  return tail.length === 1 ? tail[0] : undefined;
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
): { kind: "line"; path: string; line: number; startLine?: number; side: DiffSide } | { kind: "summary" } {
  const { path, line, side, startLine } = finding;
  if (!path || !line || !side || !diff || reviewedSha !== headSha) return { kind: "summary" };
  const file = fileFor(diff, path);
  const has = (lines: DiffLine[], n: number) =>
    lines.some((l) => (side === "RIGHT" ? l.newNumber === n : l.kind === "del" && l.oldNumber === n));
  // A range must sit within one hunk: GitHub won't take one across a gap.
  const hunk = file?.hunks.find((h) => has(h.lines, line));
  if (!file || !hunk) return { kind: "summary" };
  const range = startLine !== undefined && has(hunk.lines, startLine) ? { startLine } : {};
  return { kind: "line", path: file.path, line, side, ...range };
}

/**
 * A finding as a line comment: its title, its body, and its suggestion as a
 * GitHub suggested change — but only when the comment covers exactly the
 * lines the suggestion replaces, or applying it would replace the wrong ones.
 */
export function commentBody(finding: Finding, placed?: { line: number; startLine?: number }): string {
  const parts = [`**${finding.title}**`];
  if (finding.body) parts.push(finding.body);
  const covers =
    placed !== undefined && placed.line === finding.line && placed.startLine === finding.startLine;
  if (finding.suggestion !== undefined && covers) parts.push(`\`\`\`suggestion\n${finding.suggestion}\n\`\`\``);
  return parts.join("\n\n");
}

/** A finding as a bullet in the review's summary, with where it is. */
export function summaryItem(finding: Finding): string {
  const lines = finding.line ? `:${finding.startLine ? `${finding.startLine}–` : ""}${finding.line}` : "";
  const where = finding.path ? ` (\`${finding.path}${lines}\`)` : "";
  const body = finding.body ? ` — ${finding.body.replace(/\s*\n\s*/g, " ")}` : "";
  return `- **${finding.title}**${where}${body}`;
}
