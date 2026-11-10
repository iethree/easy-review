import { Anchor, Group, HoverCard, Loader, Stack, Text } from "@mantine/core";
import {
  type Icon,
  IconCircleDashed,
  IconProgress,
  IconProgressAlert,
  IconProgressCheck,
  IconProgressX,
} from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CheckContext, CheckState, PullRequest } from "../../shared/types.ts";

// The "progress" icons, bare: so checks never look like a review's verdict,
// which is a filled circle with a check, a cross or a speech bubble.
const VISUALS: Record<CheckState, { color: string; Icon: Icon; label: string }> = {
  SUCCESS: { color: "teal", Icon: IconProgressCheck, label: "All checks passed" },
  FAILURE: { color: "red", Icon: IconProgressX, label: "Checks failed" },
  ERROR: { color: "orange", Icon: IconProgressAlert, label: "Checks errored" },
  PENDING: { color: "yellow", Icon: IconProgress, label: "Checks running" },
  EXPECTED: { color: "yellow", Icon: IconProgress, label: "Checks expected" },
  NONE: { color: "gray", Icon: IconCircleDashed, label: "No checks" },
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: headSha is the trigger, not an input
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

  // Just a number by the icon, which says what it counts: whatever needs
  // attention first, and a green run its size. In words for screen readers.
  const [count, words] =
    ci.total === 0
      ? [null, "No checks"]
      : ci.failed > 0
        ? [ci.failed, `${ci.failed} failing`]
        : ci.pending > 0
          ? [ci.pending, `${ci.pending} running`]
          : [ci.passed, `${ci.passed} passed`];

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
        <Group gap={3} wrap="nowrap" style={{ cursor: "default" }} aria-label={`Checks: ${words}`} role="img">
          <Icon size={16} stroke={2} color={`var(--mantine-color-${visual.color}-6)`} />
          {count !== null && (
            <Text size="xs" c={ci.failed > 0 ? "red.6" : "dimmed"} fw={ci.failed > 0 ? 600 : 400}>
              {count}
            </Text>
          )}
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
                // biome-ignore lint/suspicious/noArrayIndexKey: check names can repeat; the index tells them apart
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
