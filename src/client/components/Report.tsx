import { ActionIcon, Group, Text, Tooltip } from "@mantine/core";
import { IconMaximize } from "@tabler/icons-react";
import { useRef } from "react";

export function reportUrl(reviewId: string): string {
  return `/api/local/reviews/${encodeURIComponent(reviewId)}/report/index.html`;
}

/**
 * A review's HTML report — Tulip's page, say — where its Markdown has a
 * fenced report block. The server sends it with a sandbox policy, and the
 * frame adds its own: its scripts run, with no origin, so it can't reach this
 * app or anything else.
 */
export function Report({ reviewId, title }: { reviewId: string; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  return (
    <div className="er-report">
      <Group justify="space-between" wrap="nowrap" mb={6}>
        <Text size="xs" fw={600} truncate>
          {title || "Report"}
        </Text>
        <Tooltip label="Full screen (Esc to leave)">
          <ActionIcon
            size="sm"
            variant="subtle"
            color="gray"
            onClick={() => void frame.current?.requestFullscreen().catch(() => {})}
            aria-label="Show the report full screen"
          >
            <IconMaximize size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <iframe
        ref={frame}
        className="er-report-frame"
        src={reportUrl(reviewId)}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        title={title || "Report"}
      />
    </div>
  );
}
