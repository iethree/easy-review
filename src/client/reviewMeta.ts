import {
  IconCheck,
  IconGitMerge,
  IconGitPullRequest,
  IconGitPullRequestClosed,
  IconMessageCircle,
  IconPencilMinus,
} from "@tabler/icons-react";
import type {
  PullRequest,
  PullRequestState,
  ReviewedPullRequest,
  ReviewVerdict,
} from "../shared/types.ts";

/** How each verdict you can leave is labelled and coloured, everywhere. */
export const VERDICT = {
  APPROVED: { label: "Approved", color: "teal", Icon: IconCheck, full: "You approved this" },
  CHANGES_REQUESTED: {
    label: "Changes",
    color: "orange",
    Icon: IconPencilMinus,
    full: "You requested changes",
  },
  COMMENTED: {
    label: "Comment",
    color: "blue",
    Icon: IconMessageCircle,
    full: "You left a comment",
  },
  DISMISSED: {
    label: "Dismissed",
    color: "gray",
    Icon: IconMessageCircle,
    full: "Your review was dismissed",
  },
  PENDING: {
    label: "Pending",
    color: "yellow",
    Icon: IconPencilMinus,
    full: "You have an unsubmitted draft review",
  },
} as const satisfies Record<ReviewVerdict, unknown>;

export const PR_STATE = {
  OPEN: { label: "Open", color: "teal", Icon: IconGitPullRequest },
  MERGED: { label: "Merged", color: "violet", Icon: IconGitMerge },
  CLOSED: { label: "Closed", color: "red", Icon: IconGitPullRequestClosed },
} as const satisfies Record<PullRequestState, unknown>;

/** History rows carry your verdict; queue rows don't. */
export function isReviewed(pr: PullRequest): pr is ReviewedPullRequest {
  return "verdict" in pr;
}
