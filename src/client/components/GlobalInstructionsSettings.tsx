import {
  ActionIcon,
  Anchor,
  Button,
  Center,
  Code,
  Collapse,
  Group,
  Loader,
  Paper,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
  Title,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { IconChevronDown, IconChevronRight, IconPlus, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { GROUND_RULES, type InstructionSet } from "../../shared/aiReview.ts";
import { useFixedInstructions, useLocalConfig } from "../hooks/useLocalReviews.ts";

const SAVE_LABEL = { idle: "", saving: "Saving…", saved: "Saved", error: "Couldn't save" } as const;

/**
 * Global instructions: sets of instructions added to every review, after its
 * reviewer's own, each with a switch. Saved as you type, like the rest of
 * the Claude settings; and under them, what every review is told regardless.
 */
export function GlobalInstructionsSettings() {
  const { config, update, saving } = useLocalConfig(true);
  const fixed = useFixedInstructions(config?.readOnly);
  const [showFixed, setShowFixed] = useState(false);

  if (!config) {
    return (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    );
  }

  const sets = config.globalInstructions;
  const setSets = (next: InstructionSet[]) => update({ ...config, globalInstructions: next });
  const change = (id: string, patch: Partial<InstructionSet>) =>
    setSets(sets.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const remove = (set: InstructionSet) => {
    if (set.instructions.trim() && !window.confirm(`Delete “${set.name.trim() || "Untitled"}”?`)) return;
    setSets(sets.filter((s) => s.id !== set.id));
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <div>
          <Title order={3}>Global instructions</Title>
          <Text size="xs" c="dimmed" mt={4}>
            Added to every review, after its reviewer's own instructions. Switch a set off to leave it
            out of reviews started from now on.
          </Text>
        </div>
        <Group gap="xs" wrap="nowrap">
          <Text size="xs" c={saving === "error" ? "red" : "dimmed"}>
            {SAVE_LABEL[saving]}
          </Text>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconPlus size={14} />}
            onClick={() => setSets([...sets, { id: crypto.randomUUID(), name: "", instructions: "", enabled: true }])}
          >
            Add a set
          </Button>
        </Group>
      </Group>

      {sets.length === 0 && (
        <Text size="sm" c="dimmed">
          No global instructions: each review gets only its reviewer's.
        </Text>
      )}

      {sets.map((set) => (
        <Paper key={set.id} withBorder radius="md" p="sm">
          <Stack gap="xs">
            <Group gap="sm" wrap="nowrap">
              <Tooltip label={set.enabled ? "On: reviews get these" : "Off: reviews don't get these"}>
                <Switch
                  size="sm"
                  checked={set.enabled}
                  onChange={(e) => change(set.id, { enabled: e.currentTarget.checked })}
                  aria-label={`Use “${set.name.trim() || "Untitled"}” in reviews`}
                />
              </Tooltip>
              <TextInput
                style={{ flex: 1 }}
                size="xs"
                variant="unstyled"
                fw={600}
                placeholder="Name: Our conventions"
                aria-label="Name"
                value={set.name}
                onChange={(e) => change(set.id, { name: e.currentTarget.value })}
              />
              {set.id === GROUND_RULES.id && set.instructions !== GROUND_RULES.instructions && (
                <Anchor
                  component="button"
                  type="button"
                  size="xs"
                  c="dimmed"
                  onClick={() => change(set.id, { instructions: GROUND_RULES.instructions })}
                >
                  Restore the original
                </Anchor>
              )}
              <Tooltip label="Delete this set">
                <ActionIcon variant="subtle" color="red" onClick={() => remove(set)} aria-label="Delete set">
                  <IconTrash size={15} />
                </ActionIcon>
              </Tooltip>
            </Group>
            <Textarea
              size="xs"
              placeholder="We're on Java 21. Flag any new dependency, and say what it's for."
              aria-label="Instructions"
              value={set.instructions}
              onChange={(e) => change(set.id, { instructions: e.currentTarget.value })}
              autosize
              minRows={3}
              style={{ opacity: set.enabled ? 1 : 0.55 }}
              styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)", fontSize: 12 } }}
            />
          </Stack>
        </Paper>
      ))}

      <div>
        <UnstyledButton onClick={() => setShowFixed((v) => !v)} aria-expanded={showFixed}>
          <Group gap={4} wrap="nowrap">
            {showFixed ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
            <Text size="sm" fw={600}>
              Always included
            </Text>
          </Group>
        </UnstyledButton>
        <Text size="xs" c="dimmed" mt={2}>
          What easy-review tells every review itself: its tools, not to take orders from the code it
          reviews, and how to give its verdict and findings — which the Claude pane reads, so these
          can't be switched off.
        </Text>
        <Collapse expanded={showFixed}>
          {fixed === null ? (
            <Loader size="xs" mt="xs" />
          ) : (
            <Code block mt="xs" style={{ whiteSpace: "pre-wrap", fontSize: 11 }}>
              {fixed}
            </Code>
          )}
        </Collapse>
      </div>
    </Stack>
  );
}
