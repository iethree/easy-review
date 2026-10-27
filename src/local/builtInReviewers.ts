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

/** The version DIAGRAMS teaches, and the app draws with (package.json pins it). */
export const RELADRAW_VERSION = "0.19.1";

/**
 * The pull request in two pictures — what changes for people who use it, and
 * what changes in the code — drawn in reladraw, which the app renders in the
 * review. reladraw is new, so the instructions carry a primer.
 */
const DIAGRAMS = `Explain this pull request in two diagrams, drawn in reladraw, and review it. Start from .easy-review/pr.md and .easy-review/pr.diff, and read the surrounding code wherever you need it.

## What changes for people who use it

One diagram of the practical change: what someone using the product sees or does differently — a screen, a flow, a setting, an API response, an error message — before and after. Draw the path they take, with the steps that changed marked. If nothing changes for them (a refactor, a test, a build change), say so in one sentence and draw nothing here.

## What changes in the code

One diagram of the engineering change: the modules, functions, services or data it touches, and how they connect now — the call path, the data flow, the new boundary. Mark what is new, what changed and what was removed. Draw only what the reader needs: about ten boxes at most.

Under each diagram, two or three sentences on what it shows and what to notice. Then review the change as usual: every problem is a finding.

Mark the parts of a diagram with these styles, declared at its top:

style new      border: #1a7f37  line: #1a7f37  text: (color: #1a7f37)
style changed  border: #bf8700  line: #bf8700  text: (color: #bf8700)
style removed  border: #8c959f  line: #8c959f  text: (color: #8c959f)
style problem  border: #d1242f  line: #d1242f  text: (color: #d1242f)

Use problem only on a box or line where one of your findings sits.

## Writing reladraw

Each diagram is a fenced code block tagged reladraw. In reladraw you say where each box goes relative to another, and it works out the distances. The essentials:

- \`node <name> "<text>"\` makes a box. A name is one word (use underscores); the text is what it shows, and \` / \` (a slash with a space either side) breaks it onto a new line.
- Exactly one node says nothing about where it goes. Every other node is placed against one written before it: \`right of a\`, \`left of a\`, \`below a\`, \`above a\`, or a diagonal such as \`below-right of a\`. A gap goes in a bracket after the placement, \`right of a (gap: wide)\`: none, tight, normal (the default) or wide.
- Two nodes placed the same way against the same node land on the same spot. Chain them instead (\`b right of a\`, \`c right of b\`), or put them in a container with a layout.
- A container is a node whose children are named with a dot: \`node api "API"\`, then \`node api.auth "auth"\`. With \`layout: column\` or \`layout: row\` on the container, its children line up in the order written, and must not place themselves.
- \`edge a -> b "calls"\` draws an arrow from a to b; \`a -- b\` is a plain line and \`a <-> b\` has an arrow at each end. A line's label sits on the line, between the boxes: keep it to a word or two over a wide gap, or widen the gap to fit it (\`right of a (gap: 12)\`), or it covers the boxes.
- \`style: new\` on a node or an edge wears a style declared with \`style\`.
- \`//\` starts a comment. \`#\` doesn't: it starts a colour.
- There are no coordinates and no negative distances, and \`box\`, \`link\` and \`arrow\` are not keywords.

For example:

\`\`\`reladraw
style new      border: #1a7f37  line: #1a7f37  text: (color: #1a7f37)
style changed  border: #bf8700  line: #bf8700  text: (color: #bf8700)

node page   "Settings page"
node api    "PUT /api/setting"  right of page (gap: wide)
node cache  "settings cache"  right of api (gap: wide)  style: new
node db     "app DB"  below api (gap: wide)  style: changed

edge page -> api   "saves"
edge api -> cache  "clears"  style: new
edge api -> db     "writes"
\`\`\`

If you can run commands, check each diagram before you finish: write it to a file outside .easy-review, run \`npx --yes reladraw@${RELADRAW_VERSION} check <file>\`, and fix every error and every warning that something covers something else. Delete the file afterwards.`;

export const BUILT_IN_REVIEWERS: readonly Reviewer[] = [
  { id: "layers", name: "Layers", instructions: LAYERS },
  { id: "diagrams", name: "Diagrams", instructions: DIAGRAMS },
];
