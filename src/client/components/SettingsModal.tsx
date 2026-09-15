import {
  Alert,
  Box,
  Button,
  Divider,
  Group,
  Modal,
  NumberInput,
  Progress,
  Stack,
  Switch,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { IconAlertCircle, IconFolder, IconListCheck, IconRobot } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import type { LocalStatus } from "../../shared/aiReview.ts";
import { rateDifficulty, type Difficulty } from "../../shared/difficulty.ts";
import type { PullRequest, Settings } from "../../shared/types.ts";
import { DIFFICULTY_COLOR } from "../theme.ts";
import { CheckoutSettings } from "./CheckoutSettings.tsx";
import { ClaudeSettings } from "./ClaudeSettings.tsx";

interface Props {
  opened: boolean;
  onClose: () => void;
  settings: Settings;
  onChange: (next: Settings) => void;
  onReset: () => void;
  prs: PullRequest[];
  /** Local Claude reviews: only offered when the server supports them. */
  local: { supported: boolean; status: LocalStatus | null };
}

type SettingsTab = "queue" | "claude" | "checkouts";

export function SettingsModal({ opened, onClose, settings, onChange, onReset, prs, local }: Props) {
  const [tab, setTab] = useState<SettingsTab>("queue");
  // Live preview: how the queue on screen classifies under these thresholds.
  const counts = useMemo(() => {
    const tally: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 };
    for (const pr of prs) tally[rateDifficulty(pr, settings).level]++;
    return tally;
  }, [prs, settings]);

  const total = prs.length || 1;

  // Medium must be at least as permissive as easy or the tier is unreachable.
  const inverted =
    settings.medium.maxFiles < settings.easy.maxFiles ||
    settings.medium.maxLines < settings.easy.maxLines;

  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });
  const num = (v: string | number, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v)) : fallback;

  return (
    <Modal opened={opened} onClose={onClose} title="Settings" size="lg" radius="md">
      <Tabs value={tab} onChange={(v) => setTab((v as SettingsTab) ?? "queue")} mb="md">
        <Tabs.List>
          <Tabs.Tab value="queue" leftSection={<IconListCheck size={14} />}>
            Queue
          </Tabs.Tab>
          {local.supported && (
            <>
              <Tabs.Tab value="claude" leftSection={<IconRobot size={14} />}>
                Claude review
              </Tabs.Tab>
              <Tabs.Tab value="checkouts" leftSection={<IconFolder size={14} />}>
                Checkouts
              </Tabs.Tab>
            </>
          )}
        </Tabs.List>
      </Tabs>

      {tab === "checkouts" && local.supported ? (
        <Stack gap="lg">
          {/* Mounted only while this tab is showing, so opening Settings doesn't run `du`. */}
          <CheckoutSettings active={opened} />
          <Group justify="flex-end">
            <Button size="xs" onClick={onClose}>
              Done
            </Button>
          </Group>
        </Stack>
      ) : tab === "claude" && local.supported ? (
        <Stack gap="lg">
          <ClaudeSettings status={local.status} opened={opened} />
          <Group justify="flex-end">
            <Button size="xs" onClick={onClose}>
              Done
            </Button>
          </Group>
        </Stack>
      ) : (
      <Stack gap="lg">
        <Box>
          <Title order={3} mb={4}>
            Difficulty thresholds
          </Title>
          <Text size="xs" c="dimmed" mb="sm">
            A pull request is <b>easy</b> when it is within both easy limits, <b>medium</b> when it
            is within both medium limits, and <b>hard</b> otherwise.
          </Text>

          <Group grow align="flex-start">
            <Stack gap={6}>
              <Text size="xs" fw={600} c={`${DIFFICULTY_COLOR.easy}.6`}>
                EASY — up to
              </Text>
              <NumberInput
                size="xs"
                label="Files changed"
                min={0}
                value={settings.easy.maxFiles}
                onChange={(v) =>
                  set({ easy: { ...settings.easy, maxFiles: num(v, settings.easy.maxFiles) } })
                }
              />
              <NumberInput
                size="xs"
                label="Lines changed (+/−)"
                min={0}
                step={10}
                value={settings.easy.maxLines}
                onChange={(v) =>
                  set({ easy: { ...settings.easy, maxLines: num(v, settings.easy.maxLines) } })
                }
              />
            </Stack>

            <Stack gap={6}>
              <Text size="xs" fw={600} c={`${DIFFICULTY_COLOR.medium}.7`}>
                MEDIUM — up to
              </Text>
              <NumberInput
                size="xs"
                label="Files changed"
                min={0}
                value={settings.medium.maxFiles}
                onChange={(v) =>
                  set({
                    medium: { ...settings.medium, maxFiles: num(v, settings.medium.maxFiles) },
                  })
                }
              />
              <NumberInput
                size="xs"
                label="Lines changed (+/−)"
                min={0}
                step={25}
                value={settings.medium.maxLines}
                onChange={(v) =>
                  set({
                    medium: { ...settings.medium, maxLines: num(v, settings.medium.maxLines) },
                  })
                }
              />
            </Stack>
          </Group>

          {inverted && (
            <Alert
              icon={<IconAlertCircle size={14} />}
              color="orange"
              mt="sm"
              p="xs"
              variant="light"
            >
              <Text size="xs">
                Medium limits are lower than easy limits, so nothing will ever be rated medium.
              </Text>
            </Alert>
          )}
        </Box>

        <Box>
          <Group justify="space-between" mb={6}>
            <Text size="xs" fw={600}>
              Your queue under these thresholds
            </Text>
            <Text size="xs" c="dimmed">
              {prs.length} open request{prs.length === 1 ? "" : "s"}
            </Text>
          </Group>
          <Progress.Root size={18} radius="sm">
            {(["easy", "medium", "hard"] as const).map((level) =>
              counts[level] > 0 ? (
                <Progress.Section
                  key={level}
                  value={(counts[level] / total) * 100}
                  color={DIFFICULTY_COLOR[level]}
                >
                  <Progress.Label>
                    {counts[level]} {level}
                  </Progress.Label>
                </Progress.Section>
              ) : null,
            )}
          </Progress.Root>
        </Box>

        <Divider />

        <Box>
          <Title order={3} mb="sm">
            Queue
          </Title>
          <Stack gap="sm">
            <Switch
              size="sm"
              label="Include reviews requested from my teams"
              description="Off means only requests addressed to you personally."
              checked={settings.includeTeamRequests}
              onChange={(e) => set({ includeTeamRequests: e.currentTarget.checked })}
            />
            <Switch
              size="sm"
              label="Hide draft pull requests"
              checked={settings.hideDrafts}
              onChange={(e) => set({ hideDrafts: e.currentTarget.checked })}
            />
          </Stack>
        </Box>

        <Group justify="space-between">
          <Button variant="subtle" color="gray" size="xs" onClick={onReset}>
            Reset to defaults
          </Button>
          <Button size="xs" onClick={onClose}>
            Done
          </Button>
        </Group>
      </Stack>
      )}
    </Modal>
  );
}
