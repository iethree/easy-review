import {
  ActionIcon,
  Box,
  Button,
  Group,
  NavLink,
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
  IconArrowLeft,
  IconFolder,
  IconKeyboard,
  IconListCheck,
  IconPalette,
  IconRobot,
  IconUsers,
} from "@tabler/icons-react";
import { useCallback, useEffect, useRef } from "react";
import type { LocalStatus } from "../../shared/aiReview.ts";
import { withLook } from "../../shared/reviewerLook.ts";
import type { Settings } from "../../shared/types.ts";
import { CheckoutSettings } from "./CheckoutSettings.tsx";
import { ClaudeSettings } from "./ClaudeSettings.tsx";
import { DISCARD, ReviewersSettings } from "./ReviewersSettings.tsx";
import { ShortcutsSettings } from "./ShortcutsSettings.tsx";
import type { useReviewers } from "../hooks/useReviewers.ts";

interface Props {
  onClose: () => void;
  settings: Settings;
  onChange: (next: Settings) => void;
  onReset: () => void;
  /** Local Claude reviews: only offered when the server supports them. */
  local: { supported: boolean; status: LocalStatus | null };
  reviewers: ReturnType<typeof useReviewers>;
  /** The section showing: App's, so "Edit reviewers…" can open straight to it. */
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
}

export type SettingsSection = "queue" | "appearance" | "shortcuts" | "claude" | "reviewers" | "checkouts";

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
  local,
  reviewers,
  section: wanted,
  onSectionChange,
}: Props) {
  // The Claude sections exist only where reviews can run.
  const section =
    local.supported || wanted === "queue" || wanted === "appearance" || wanted === "shortcuts" ? wanted : "queue";

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

  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });

  const sections: { value: SettingsSection; label: string; icon: React.ReactNode }[] = [
    { value: "queue", label: "Queue", icon: <IconListCheck size={16} /> },
    { value: "appearance", label: "Appearance", icon: <IconPalette size={16} /> },
    { value: "shortcuts", label: "Keyboard shortcuts", icon: <IconKeyboard size={16} /> },
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
            <ReviewersSettings
              store={reviewers}
              onDirtyChange={onDirtyChange}
              looks={settings.reviewerLooks}
              onLookChange={(id, look) => set({ reviewerLooks: withLook(settings.reviewerLooks, id, look) })}
            />
          ) : (
            <div className="er-settings">
              {section === "appearance" ? (
                <AppearanceSettings />
              ) : section === "shortcuts" ? (
                <ShortcutsSettings />
              ) : section === "checkouts" && local.supported ? (
                // Mounted only while it's showing, so opening Settings doesn't run `du`.
                <CheckoutSettings active />
              ) : section === "claude" && local.supported ? (
                <ClaudeSettings status={local.status} opened onOpenReviewers={() => onSectionChange("reviewers")} />
              ) : (
                <Stack gap="lg">
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
