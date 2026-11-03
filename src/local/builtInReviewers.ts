/**
 * Reviewers that come with easy-review. Each is a reviewer file in the
 * top-level reviewers/ folder, in the format of the user's own, and is
 * compiled into the app. Each is offered once — copied into
 * ~/.easy-review/reviewers the first time the app sees it — and is then the
 * user's own file, to edit or delete (see seedReviewers).
 *
 * A new one needs a file there and a line here.
 */

import changedScreens from "../../reviewers/changed-screens.md" with { type: "text" };
import diagrams from "../../reviewers/diagrams.md" with { type: "text" };
import layers from "../../reviewers/layers.md" with { type: "text" };
import screenComparison from "../../reviewers/screen-comparison.md" with { type: "text" };
import tulip from "../../reviewers/tulip.md" with { type: "text" };

/** Each built-in reviewer's id, and its file as it's written for the user. */
export const BUILT_IN_REVIEWERS: readonly { id: string; file: string }[] = [
  { id: "changed-screens", file: changedScreens },
  { id: "screen-comparison", file: screenComparison },
  { id: "layers", file: layers },
  { id: "diagrams", file: diagrams },
  { id: "tulip", file: tulip },
];
