import { Avatar, Badge, Group, Paper, Stack, Text, Tooltip } from "@mantine/core";
import { IconCheck, IconClockHour4, IconMessageCircle, IconPencilMinus, IconUsers, IconX } from "@tabler/icons-react";
import type { PrDetails, PrLabel, ReviewerState } from "../../shared/types.ts";
import { readableOn } from "../labelColor.ts";

const STATE: Record<ReviewerState, { label: string; color: string; Icon: typeof IconCheck }> = {
  REQUESTED: { label: "Awaiting review", color: "yellow", Icon: IconClockHour4 },
  APPROVED: { label: "Approved", color: "teal", Icon: IconCheck },
  CHANGES_REQUESTED: { label: "Requested changes", color: "orange", Icon: IconPencilMinus },
  COMMENTED: { label: "Commented", color: "blue", Icon: IconMessageCircle },
  DISMISSED: { label: "Review dismissed", color: "gray", Icon: IconX },
};

/**
 * What GitHub's sidebar says about a pull request: its reviewers and where
 * each stands, who it's assigned to, and its labels.
 */
export function PrDetailsCard({ details }: { details: PrDetails }) {
  return (
    <Paper withBorder radius="md" p="sm" className="er-details">
      <Section title="Reviewers">
        {details.reviewers.length === 0 ? (
          <None>No reviewers</None>
        ) : (
          details.reviewers.map((r) => {
            const { label, color, Icon } = STATE[r.state];
            return (
              <Group key={`${r.isTeam ? "team:" : ""}${r.name}`} gap={8} wrap="nowrap">
                <Avatar src={r.avatarUrl} size={20} radius={r.isTeam ? "sm" : "xl"}>
                  {r.isTeam ? <IconUsers size={12} /> : r.name.slice(0, 1).toUpperCase()}
                </Avatar>
                <Text size="sm" className="er-truncate" style={{ flex: 1, minWidth: 0 }}>
                  {r.name}
                </Text>
                <Tooltip label={label} withArrow>
                  <Icon size={16} color={`var(--mantine-color-${color}-6)`} aria-label={label} />
                </Tooltip>
              </Group>
            );
          })
        )}
      </Section>

      <Section title="Assignees">
        {details.assignees.length === 0 ? (
          <None>No one</None>
        ) : (
          details.assignees.map((a) => (
            <Group key={a.login} gap={8} wrap="nowrap">
              <Avatar src={a.avatarUrl} size={20} radius="xl">
                {a.login.slice(0, 1).toUpperCase()}
              </Avatar>
              <Text size="sm" className="er-truncate">
                {a.login}
              </Text>
            </Group>
          ))
        )}
      </Section>

      <Section title="Labels">
        {details.labels.length === 0 ? (
          <None>None yet</None>
        ) : (
          <Group gap={4}>
            {details.labels.map((label) => (
              <Label key={label.name} label={label} />
            ))}
          </Group>
        )}
      </Section>
    </Paper>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Stack gap={6} className="er-details-section">
      <Text size="xs" fw={600} c="dimmed">
        {title}
      </Text>
      {children}
    </Stack>
  );
}

function None({ children }: { children: React.ReactNode }) {
  return (
    <Text size="sm" c="dimmed">
      {children}
    </Text>
  );
}

function Label({ label }: { label: PrLabel }) {
  const badge = (
    <Badge
      size="sm"
      radius="xl"
      variant="filled"
      tt="none"
      fw={500}
      style={{ background: `#${label.color}`, color: readableOn(label.color) }}
    >
      {label.name}
    </Badge>
  );
  return label.description ? (
    <Tooltip label={label.description} withArrow multiline maw={260}>
      {badge}
    </Tooltip>
  ) : (
    badge
  );
}
