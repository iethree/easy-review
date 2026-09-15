import { Anchor, Group, HoverCard, Loader, Stack, Text, ThemeIcon } from "@mantine/core";
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconCircleX,
  IconClock,
  IconPointFilled,
} from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CheckContext, CheckState, PullRequest } from "../../shared/types.ts";

const VISUALS: Record<CheckState, { color: string; Icon: typeof IconCircleCheck; label: string }> = {
  SUCCESS: { color: "teal", Icon: IconCircleCheck, label: "All checks passed" },
  FAILURE: { color: "red", Icon: IconCircleX, label: "Checks failed" },
  ERROR: { color: "orange", Icon: IconAlertTriangle, label: "Checks errored" },
  PENDING: { color: "yellow", Icon: IconClock, label: "Checks running" },
  EXPECTED: { color: "yellow", Icon: IconClock, label: "Checks expected" },
  NONE: { color: "gray", Icon: IconPointFilled, label: "No checks" },
};

/**
 * Check names are not in the queue payload — fetching them for every pull
 * request costs seconds. They load the first time someone opens this card.
 */
function useCheckNames(pr: PullRequest) {
  const [state, setState] = useState<{
    loading: boolean;
    contexts: CheckContext[] | null;
    complete: boolean;
  }>({ loading: false, contexts: null, complete: true });
  const started = useRef(false);

  // A new head commit invalidates whatever we fetched.
  useEffect(() => {
    started.current = false;
    setState({ loading: false, contexts: null, complete: true });
  }, [pr.headSha]);

  const load = useCallback(() => {
    if (started.current || pr.ci.namesComplete) return;
    started.current = true;
    setState((s) => ({ ...s, loading: true }));

    const params = new URLSearchParams({
      owner: pr.owner,
      name: pr.name,
      number: String(pr.number),
      sha: pr.headSha,
    });

    void fetch(`/api/checks?${params}`)
      .then((res) => res.json())
      .then((json: { contexts?: CheckContext[]; complete?: boolean; error?: string }) => {
        if (json.error) throw new Error(json.error);
        setState({
          loading: false,
          contexts: json.contexts ?? [],
          complete: json.complete ?? true,
        });
      })
      .catch(() => {
        started.current = false;
        setState({ loading: false, contexts: null, complete: true });
      });
  }, [pr.owner, pr.name, pr.number, pr.headSha, pr.ci.namesComplete]);

  return { ...state, load };
}

export function CiBadge({ pr }: { pr: PullRequest }) {
  const ci = pr.ci;
  const names = useCheckNames(pr);
  const visual = VISUALS[ci.state] ?? VISUALS.NONE;
  const { Icon } = visual;

  // Lead with whatever needs attention; a green run just shows its size.
  const summary =
    ci.total === 0
      ? "—"
      : ci.failed > 0
        ? `${ci.failed} failing`
        : ci.pending > 0
          ? `${ci.pending} running`
          : `${ci.passed} ok`;

  return (
    <HoverCard
      width={330}
      shadow="md"
      openDelay={180}
      closeDelay={80}
      position="bottom-start"
      onOpen={names.load}
      withinPortal
    >
      <HoverCard.Target>
        <Group gap={5} wrap="nowrap" style={{ cursor: "default" }}>
          <ThemeIcon size={17} radius="xl" variant="light" color={visual.color}>
            <Icon size={12} stroke={2.4} />
          </ThemeIcon>
          <Text size="xs" c={ci.failed > 0 ? "red.6" : "dimmed"} fw={ci.failed > 0 ? 600 : 400}>
            {summary}
          </Text>
        </Group>
      </HoverCard.Target>

      <HoverCard.Dropdown>
        <Stack gap={6}>
          <Group justify="space-between" wrap="nowrap">
            <Text size="sm" fw={600}>
              {visual.label}
            </Text>
            <Text size="xs" c="dimmed">
              {ci.total} check{ci.total === 1 ? "" : "s"}
            </Text>
          </Group>

          <Group gap={10} wrap="wrap">
            <Count value={ci.passed} label="passed" color="teal" />
            <Count value={ci.failed} label="failed" color="red" />
            <Count value={ci.pending} label="running" color="yellow" />
            <Count value={ci.skipped} label="skipped" color="gray" />
          </Group>

          {ci.total === 0 ? (
            <Text size="xs" c="dimmed">
              This pull request has no status checks.
            </Text>
          ) : ci.failed === 0 && ci.pending === 0 ? (
            <Text size="xs" c="dimmed">
              Nothing needs your attention.
            </Text>
          ) : names.loading ? (
            <Group gap={6}>
              <Loader size={12} />
              <Text size="xs" c="dimmed">
                Loading check names…
              </Text>
            </Group>
          ) : names.contexts && names.contexts.length > 0 ? (
            names.contexts.map((ctx, i) => {
              const v = VISUALS[ctx.state] ?? VISUALS.NONE;
              const CtxIcon = v.Icon;
              return (
                <Group key={`${ctx.name}:${i}`} gap={6} wrap="nowrap">
                  <CtxIcon size={13} color={`var(--mantine-color-${v.color}-6)`} stroke={2.2} />
                  {ctx.url ? (
                    <Anchor href={ctx.url} target="_blank" size="xs" lineClamp={1}>
                      {ctx.name}
                    </Anchor>
                  ) : (
                    <Text size="xs" lineClamp={1}>
                      {ctx.name}
                    </Text>
                  )}
                </Group>
              );
            })
          ) : (
            <Text size="xs" c="dimmed">
              {ci.failed > 0
                ? `${ci.failed} check${ci.failed === 1 ? "" : "s"} failing.`
                : `${ci.pending} check${ci.pending === 1 ? "" : "s"} still running.`}
            </Text>
          )}

          {names.contexts && !names.complete && (
            <Text size="10px" c="dimmed" fs="italic">
              Showing the first {names.contexts.length}.
            </Text>
          )}
        </Stack>
      </HoverCard.Dropdown>
    </HoverCard>
  );
}

function Count({ value, label, color }: { value: number; label: string; color: string }) {
  if (value === 0) return null;
  return (
    <Text size="xs" c={color === "gray" ? "dimmed" : `${color}.6`}>
      <Text span fw={700} fz="inherit" c="inherit">
        {value}
      </Text>{" "}
      {label}
    </Text>
  );
}
