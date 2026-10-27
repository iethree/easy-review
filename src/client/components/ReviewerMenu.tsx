import { ActionIcon, Menu, Text, Tooltip } from "@mantine/core";
import { IconPencil, IconPlus, IconRobot } from "@tabler/icons-react";
import type { AiReviewSummary, Reviewer } from "../../shared/aiReview.ts";
import { StatusIcon } from "./AiReviewPanel.tsx";

interface Props {
  reviewers: Reviewer[];
  /** This pull request's reviews: a reviewer with one already goes to its tab. */
  reviews: AiReviewSummary[];
  opened: boolean;
  onOpenChange: (opened: boolean) => void;
  onStart: (reviewerId: string) => void;
  onShow: (reviewerId: string) => void;
  onManage: () => void;
}

/** The + at the end of the tabs: a reviewer to set on this pull request. */
export function ReviewerMenu({ reviewers, reviews, opened, onOpenChange, onStart, onShow, onManage }: Props) {
  return (
    <Menu opened={opened} onChange={onOpenChange} position="bottom-start" width={260} shadow="md" radius="md">
      <Menu.Target>
        <Tooltip label="Review with… (c)" disabled={opened}>
          <ActionIcon variant="subtle" color="gray" size="sm" ml={4} aria-label="Review with Claude">
            <IconPlus size={15} />
          </ActionIcon>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Review with</Menu.Label>
        {reviewers.length === 0 && (
          <Text size="xs" c="dimmed" px="sm" py={6}>
            No reviewers yet.
          </Text>
        )}
        {reviewers.map((r) => {
          const review = reviews.find((j) => j.reviewerId === r.id);
          return (
            <Menu.Item
              key={r.id}
              leftSection={review ? <StatusIcon job={review} /> : <IconRobot size={14} />}
              rightSection={
                review && (
                  <Text size="10px" c="dimmed">
                    open
                  </Text>
                )
              }
              onClick={() => (review ? onShow(r.id) : onStart(r.id))}
            >
              {r.name}
            </Menu.Item>
          );
        })}
        <Menu.Divider />
        <Menu.Item leftSection={<IconPencil size={14} />} onClick={onManage}>
          Edit reviewers…
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
