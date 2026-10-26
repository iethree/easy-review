import {
  Alert,
  Button,
  Center,
  Code,
  Group,
  Loader,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { IconAlertTriangle, IconShieldLock, IconUsers } from "@tabler/icons-react";
import { EFFORTS, type AiReviewEffort, type LocalStatus } from "../../shared/aiReview.ts";
import { useLocalConfig } from "../hooks/useLocalReviews.ts";

const SAVE_LABEL = { idle: "", saving: "Saving…", saved: "Saved", error: "Couldn't save" } as const;

export function ClaudeSettings({
  status,
  opened,
  onOpenReviewers,
}: {
  status: LocalStatus | null;
  opened: boolean;
  onOpenReviewers: () => void;
}) {
  const { config, update, saving } = useLocalConfig(opened);

  if (status && !status.claude.available) {
    return (
      <Alert color="orange" variant="light" icon={<IconAlertTriangle size={16} />} title="Claude Code not found">
        <Text size="sm">
          {status.claude.error} Install it, make sure <Code>claude</Code> is on the PATH of the
          terminal that runs <Code>bun run dev</Code>, and restart the server.
        </Text>
      </Alert>
    );
  }

  if (!config) {
    return (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    );
  }

  const set = (patch: Partial<typeof config>) => update({ ...config, ...patch });

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="nowrap">
        <div>
          <Text size="sm" fw={600}>
            Review instructions
          </Text>
          <Text size="xs" c="dimmed">
            Each reviewer has its own. Pick one or more when you start a review.
          </Text>
        </div>
        <Group gap="xs" wrap="nowrap">
          <Text size="xs" c={saving === "error" ? "red" : "dimmed"}>
            {SAVE_LABEL[saving]}
          </Text>
          <Button size="xs" variant="light" leftSection={<IconUsers size={14} />} onClick={onOpenReviewers}>
            Edit reviewers
          </Button>
        </Group>
      </Group>

      <Group grow align="flex-start">
        <TextInput
          size="xs"
          label="Model"
          placeholder="CLI default"
          description="An alias like opus or sonnet, or a full model id."
          value={config.model}
          onChange={(e) => set({ model: e.currentTarget.value })}
        />
        <Select
          size="xs"
          label="Effort"
          description="How hard Claude thinks before answering."
          data={EFFORTS.map((e) => ({ value: e, label: e || "CLI default" }))}
          value={config.effort}
          onChange={(v) => set({ effort: (v ?? "") as AiReviewEffort })}
          allowDeselect={false}
        />
      </Group>

      <Group grow align="flex-start">
        <NumberInput
          size="xs"
          label="Give up after (minutes)"
          min={1}
          max={120}
          value={config.timeoutMinutes}
          onChange={(v) => typeof v === "number" && set({ timeoutMinutes: v })}
        />
        <NumberInput
          size="xs"
          label="Reviews at once"
          description="The rest wait in line."
          min={1}
          max={6}
          value={config.maxConcurrent}
          onChange={(v) => typeof v === "number" && set({ maxConcurrent: v })}
        />
      </Group>

      <Textarea
        size="xs"
        label="Local clones (optional)"
        description="Clones in ~/projects/<name>, ~/code/<name> and similar are found automatically, as long as a remote points at the repo. Anything else is cloned into the folder below the first time."
        placeholder={"# owner/name = path\nmetabase/metabase = ~/projects/metabase"}
        value={config.clones}
        onChange={(e) => set({ clones: e.currentTarget.value })}
        autosize
        minRows={2}
        styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)", fontSize: 12 } }}
      />

      <Alert color="gray" variant="light" icon={<IconShieldLock size={16} />} p="xs">
        <Text size="xs">
          The code under review was written by someone else, so each review runs{" "}
          <Code>--restricted</Code> with only Read, Grep and Glob: no shell, no web, no MCP
          servers, no settings or hooks from the pull request, and no files outside its own
          worktree. Git runs with hooks switched off.
        </Text>
        {status && (
          <Text size="10px" c="dimmed" mt={6}>
            claude {status.claude.version} · worktrees, clones and saved reviews live in {status.root}
          </Text>
        )}
      </Alert>
    </Stack>
  );
}
