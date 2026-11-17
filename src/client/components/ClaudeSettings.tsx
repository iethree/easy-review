import {
  Alert,
  Button,
  Center,
  Code,
  Group,
  Loader,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { IconAlertTriangle, IconFlame, IconShieldLock, IconUsers } from "@tabler/icons-react";
import { EFFORTS, MAX_CONCURRENT, type AiReviewEffort, type LocalStatus } from "../../shared/aiReview.ts";
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
            Each reviewer has its own, and every review gets the global ones too. Pick one or more
            reviewers when you start a review.
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
          label="Reviews at once, in total"
          description="The rest wait in line. A reviewer can have a lower limit of its own, in Reviewers."
          min={1}
          max={MAX_CONCURRENT}
          value={config.maxConcurrent}
          onChange={(v) => typeof v === "number" && set({ maxConcurrent: v })}
        />
      </Group>

      <Stack gap={6}>
        <div>
          <Text size="sm" fw={500}>
            Mode
          </Text>
          <Text size="xs" c="dimmed">
            Applies to reviews started from now on, and to the questions you ask them.
          </Text>
        </div>
        <SegmentedControl
          size="xs"
          maw={320}
          value={config.yolo ? "yolo" : "safe"}
          onChange={(v) => set({ yolo: v === "yolo" })}
          color={config.yolo ? "orange" : undefined}
          data={[
            { value: "safe", label: "Safe mode" },
            { value: "yolo", label: "YOLO mode" },
          ]}
        />
        <Text size="xs" c="dimmed">
          {config.yolo
            ? "Only for code you trust. Claude gets every tool and no permission checks: it runs the pull request's code, tests and scripts on this computer as you, can edit files, use the web and your MCP servers, and takes the repository's own Claude settings, hooks and MCP servers, as if you had run Claude in it yourself. Reviewers that drive a browser or Claude itself (Tulip, the screen reviewers) need it."
            : "For any pull request, including from people you don't know. Claude only reads the code (Read, Grep and Glob): it runs none of it, edits nothing, has no web or MCP tools, and ignores the repository's Claude settings and hooks."}
        </Text>
      </Stack>

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

      <Alert
        color={config.yolo ? "orange" : "gray"}
        variant="light"
        icon={config.yolo ? <IconFlame size={16} /> : <IconShieldLock size={16} />}
        p="xs"
      >
        {config.yolo ? (
          <Text size="xs">
            YOLO mode: each review runs in its own worktree with{" "}
            <Code>--permission-mode bypassPermissions</Code> and nothing fenced off. Whatever the
            pull request's code, its <Code>.claude/settings.json</Code> hooks or its{" "}
            <Code>.mcp.json</Code> servers do runs as you, with your files, credentials and network.
            Switch back to safe mode before reviewing code you don't trust.
          </Text>
        ) : (
          <Text size="xs">
            Safe mode: the code under review may be written by anyone, so each review runs in its
            own worktree with only Read, Grep and Glob (<Code>--tools</Code>), none of the pull
            request's settings or hooks (<Code>--setting-sources user</Code>), no MCP servers (
            <Code>--strict-mcp-config</Code>), and anything else refused (
            <Code>--permission-mode dontAsk</Code>). Git runs with hooks switched off. Reading isn't
            confined to the worktree, though: it can read any file you can.
          </Text>
        )}
        {status && (
          <Text size="10px" c="dimmed" mt={6}>
            claude {status.claude.version} · worktrees, clones and saved reviews live in {status.root}
          </Text>
        )}
      </Alert>
    </Stack>
  );
}
