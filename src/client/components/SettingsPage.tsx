import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Divider,
  Group,
  NavLink,
  NumberInput,
  Progress,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  Title,
  Tooltip,
  type MantineColorScheme,
  useMantineColorScheme,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconArrowLeft,
  IconFolder,
  IconListCheck,
  IconPalette,
  IconRobot,
  IconUsers,
} from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { LocalStatus } from "../../shared/aiReview.ts";
import { rateDifficulty, type Difficulty } from "../../shared/difficulty.ts";
import type { PullRequest, Settings } from "../../shared/types.ts";
import { DIFFICULTY_COLOR } from "../theme.ts";
import { CheckoutSettings } from "./CheckoutSettings.tsx";
import { ClaudeSettings } from "./ClaudeSettings.tsx";
import { DISCARD, ReviewersSettings } from "./ReviewersSettings.tsx";
import type { useReviewers } from "../hooks/useReviewers.ts";

interface Props {
  onClose: () => void;
  settings: Settings;
  onChange: (next: Settings) => void;
  onReset: () => void;
  prs: PullRequest[];
  /** Local Claude reviews: only offered when the server supports them. */
  local: { supported: boolean; status: LocalStatus | null };
  reviewers: ReturnType<typeof useReviewers>;
  /** The section showing: App's, so "Edit reviewers…" can open straight to it. */
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
}

export type SettingsSection = "queue" | "appearance" | "claude" | "reviewers" | "checkouts";

/**
 * Settings: a page of its own, in place of the pull requests. Changes apply
 * as you make them — but for a reviewer, which is saved — and the arrow (or
 * Escape) goes back.
 */
export function SettingsPage({
  onClose,
  settings,
  onChange,
  onReset,
  prs,
  local,
  reviewers,
  section: wanted,
  onSectionChange,
}: Props) {
  // The Claude sections exist only where reviews can run.
  const section = local.supported || wanted === "queue" || wanted === "appearance" ? wanted : "queue";

  // A reviewer being edited isn't left behind unsaved without asking.
  const dirty = useRef(false);
  const onDirtyChange = useCallback((d: boolean) => {
    dirty.current = d;
  }, []);
  const leave = (next: () => void) => {
    if (dirty.current && !window.confirm(DISCARD)) return;
    dirty.current = false;
    next();
  };

  // Escape goes back to the pull requests — once out of any text box.
  const closeRef = useRef(() => leave(onClose));
  closeRef.current = () => leave(onClose);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) target.blur();
      else closeRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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

  const sections: { value: SettingsSection; label: string; icon: React.ReactNode }[] = [
    { value: "queue", label: "Queue", icon: <IconListCheck size={16} /> },
    { value: "appearance", label: "Appearance", icon: <IconPalette size={16} /> },
    ...(local.supported
      ? [
          { value: "claude" as const, label: "Claude review", icon: <IconRobot size={16} /> },
          { value: "reviewers" as const, label: "Reviewers", icon: <IconUsers size={16} /> },
          { value: "checkouts" as const, label: "Checkouts", icon: <IconFolder size={16} /> },
        ]
      : []),
  ];

  return (
    <div className="er-page">
      <div className="er-page-head">
        <Group gap="xs">
          <Tooltip label="Back to pull requests (Esc)">
            <ActionIcon variant="subtle" color="gray" onClick={() => leave(onClose)} aria-label="Back">
              <IconArrowLeft size={17} />
            </ActionIcon>
          </Tooltip>
          <Title order={2}>Settings</Title>
        </Group>
      </div>

      <div className="er-page-body">
        <nav className="er-pane er-page-nav" aria-label="Settings sections">
          {sections.map((s) => (
            <NavLink
              key={s.value}
              active={section === s.value}
              label={s.label}
              leftSection={s.icon}
              onClick={() => s.value !== section && leave(() => onSectionChange(s.value))}
            />
          ))}
        </nav>
        <div className="er-pane er-page-content">
          {section === "reviewers" ? (
            <ReviewersSettings store={reviewers} onDirtyChange={onDirtyChange} />
          ) : (
            <div className="er-settings">
              {section === "appearance" ? (
                <AppearanceSettings />
              ) : section === "checkouts" && local.supported ? (
                // Mounted only while it's showing, so opening Settings doesn't run `du`.
                <CheckoutSettings active />
              ) : section === "claude" && local.supported ? (
                <ClaudeSettings status={local.status} opened onOpenReviewers={() => onSectionChange("reviewers")} />
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

                  <Group>
                    <Button variant="subtle" color="gray" size="xs" onClick={onReset}>
                      Reset to defaults
                    </Button>
                  </Group>
                </Stack>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Light, dark, or whichever the system is in — also `t`, from anywhere. */
function AppearanceSettings() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  return (
    <Box>
      <Title order={3} mb={4}>
        Colour scheme
      </Title>
      <Text size="xs" c="dimmed" mb="sm">
        System follows your computer's light or dark mode. Press <b>t</b> anywhere to switch between light and
        dark.
      </Text>
      <SegmentedControl
        value={colorScheme}
        onChange={(v) => setColorScheme(v as MantineColorScheme)}
        data={[
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
          { value: "auto", label: "System" },
        ]}
      />
    </Box>
  );
}
