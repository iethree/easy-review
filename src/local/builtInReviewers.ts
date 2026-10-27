/**
 * Reviewers that come with easy-review. Each is offered once — written into
 * ~/.easy-review/reviewers the first time the app sees it — and is then the
 * user's own file, to edit or delete (see seedReviewers).
 */

import type { Reviewer } from "../shared/aiReview.ts";

/**
 * The pull request as a guided tour: its diff cut into layers, in the order a
 * reader should take them. The layering rules follow the Reviewer app's
 * present-review skill (github.com/alxnddr/reviewer), adapted to a review in
 * Markdown with its findings in the usual block.
 */
const LAYERS = `Review this pull request as a guided tour: cut its diff into layers — chapters a reader can take one after another — and judge each one. Start from .easy-review/pr.diff, and read the surrounding code wherever you need it.

Begin with an overview of 100–250 words:
- What the change does and why it exists: the bug, limit or pressure that forced the work.
- Two to four points the reader needs before the first line of the diff: the approach, the decision that mattered and what it displaced, the invariant now enforced, the consequence for callers, and any tradeoff accepted or seam where this should have been two changes.
- What you checked and found sound — each item one thing you actually did, including which tests you ran and which you didn't.
- The verdict, in one sentence: whether it lands as is, and if not, the one thing that stops it.

Then the layers. Give each a \`###\` heading that makes a claim ("Retries now back off per host", not "Updates to client.ts"), then:
- What to know before reading its code: why the slice exists, what to notice, where it gets subtle. Up to 60 words, or nothing when the heading says enough.
- Its code, as a list of ranges such as \`src/client.ts:12–30\` (new-side line numbers; old-side for removed lines), each with a short note on what that file contributes to the layer when its name doesn't make it obvious.
- What you found in it, if anything, in a sentence — the details go in the findings.

How to cut the layers:
- Group by what changed and why — a capability added, a bug fixed, a migration, a constraint now enforced. Never by folder, file type or file name, and never one layer per file. A layer can span many files, and a file can appear in several layers when it plays several parts.
- Order them so each makes sense from the ones before it: the contract (a type, schema or config) before its consumers, the behaviour change before the call sites it forced, the fix before the tests that pin it.
- Cover every changed line once, in the layer whose reasoning it belongs to — removed lines as well as added ones.
- Put the mechanical remainder — lockfiles, generated output, a rename sweep, a formatting pass — in one last layer headed "Skim", noting what is there: "bun.lock — axios 1.6 → 1.7, one transitive bump". It means nothing to read there, never a lot to read.
- Keep the list flat. Nest (\`####\`) only when a layer makes a point of its own and each child is a step in it.
- A fix and its test are two short layers. Only a single-hunk change or a config bump needs none.
- Where control flow is hard to follow in the diff, a few lines of pseudocode, or a trace of one input through the old path and the new, can go in the layer that owns it. Most reviews need neither.

Write plainly, like a colleague explaining the change at a desk: no recap of the diff, no praise or filler, real names rather than "the refactored logic", numbers rather than adjectives. Say each thing once, in the part that owns it: the overview doesn't restate the layers, and a layer doesn't restate its heading.

Every problem you find is a finding, as usual, anchored to the smallest span that carries it.`;

export const BUILT_IN_REVIEWERS: readonly Reviewer[] = [{ id: "layers", name: "Layers", instructions: LAYERS }];
