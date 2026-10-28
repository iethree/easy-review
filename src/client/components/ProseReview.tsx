import { ActionIcon, Tooltip } from "@mantine/core";
import { IconCheck, IconPlus } from "@tabler/icons-react";
import { useMemo } from "react";
import type { PullRequest } from "../../shared/types.ts";
import { addProse, placeProse, proseKey, useAdded } from "../assembly.ts";
import { peek } from "../hooks/diffStore.ts";
import { splitProse } from "../proseBlocks.ts";
import { Markdown } from "./Markdown.tsx";

interface Props {
  pr: PullRequest;
  review: { id: string; headSha: string };
  markdown: string;
  onAdded: () => void;
}

/**
 * Claude's review as written, a block at a time — and any paragraph or point
 * of it can go into your review: hover it (or Tab to it) and press its +. One
 * that points at a single place in the diff becomes a comment there; the rest
 * goes in your summary. The +'s tooltip says which.
 */
export function ProseReview({ pr, review, markdown, onAdded }: Props) {
  const blocks = useMemo(() => splitProse(markdown), [markdown]);
  const added = useAdded(pr.id);
  const entry = peek(pr);
  const diff = entry?.status === "ready" ? entry.data.diff : null;

  return (
    <div className="er-prose">
      {blocks.map((block, i) => {
        // biome-ignore lint/suspicious/noArrayIndexKey: blocks never reorder; their position is their identity
        if (!block.addable) return <Markdown key={i}>{block.text}</Markdown>;
        const done = added.has(proseKey(review.id, i));
        const place = placeProse(pr, review, block.text, diff);
        const where =
          place.kind === "line"
            ? `Comment on ${place.path.split("/").pop()}:${place.startLine ? `${place.startLine}–` : ""}${place.line}`
            : "Add to summary";
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: as above
          <section key={i} className="er-addable" data-added={done}>
            <Markdown>{block.text}</Markdown>
            <div className="er-add-action">
              <AddButton
                done={done}
                label={where}
                onAdd={() => {
                  addProse(pr, review, block.text, i, diff);
                  onAdded();
                }}
              />
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** The + that adds a piece to your review — a ✓ once it's in. */
export function AddButton({ done, label, onAdd }: { done: boolean; label: string; onAdd: () => void }) {
  if (done) {
    return (
      <Tooltip label="In your review">
        <ActionIcon size="sm" variant="light" color="teal" aria-label="In your review" style={{ cursor: "default" }}>
          <IconCheck size={14} />
        </ActionIcon>
      </Tooltip>
    );
  }
  return (
    <Tooltip label={label}>
      <ActionIcon size="sm" variant="filled" onClick={onAdd} aria-label={label}>
        <IconPlus size={14} />
      </ActionIcon>
    </Tooltip>
  );
}
