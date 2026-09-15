import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Center,
  Checkbox,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import type { Checkout } from "../../shared/aiReview.ts";
import { useCheckouts } from "../hooks/useLocalReviews.ts";
import { absoluteTime, relativeTime } from "../time.ts";

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Settings → Checkouts: every pull request checked out for Claude to review,
 * what each costs on disk, and removing them one at a time or together.
 */
export function CheckoutSettings({ active }: { active: boolean }) {
  const { data, error, removing, remove } = useCheckouts(active);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());

  if (error && !data) {
    return (
      <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />} title="Couldn't list checkouts">
        <Text size="sm">{error}</Text>
      </Alert>
    );
  }
  if (!data) {
    return (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    );
  }

  const { checkouts, maxAgeDays } = data;
  const removable = checkouts.filter((c) => !c.inUse && !removing.has(c.path));
  // Anything picked that has since gone, or started a review, simply drops out.
  const selected = removable.filter((c) => picked.has(c.path));
  const allPicked = removable.length > 0 && selected.length === removable.length;
  const measured = checkouts.every((c) => c.sizeBytes !== null);
  const bytes = (list: Checkout[]) => list.reduce((sum, c) => sum + (c.sizeBytes ?? 0), 0);

  const run = async (paths: string[]) => {
    setPicked((prev) => {
      const next = new Set(prev);
      for (const path of paths) next.delete(path);
      return next;
    });
    try {
      const { failed } = await remove(paths);
      if (failed.length > 0) {
        notifications.show({
          color: "red",
          title: `Couldn't remove ${plural(failed.length, "checkout")}`,
          message: [...new Set(failed.map((f) => f.error))].join("; "),
          autoClose: 7000,
        });
      }
    } catch (err) {
      notifications.show({
        color: "red",
        title: "Couldn't remove checkouts",
        message: err instanceof Error ? err.message : String(err),
        autoClose: 7000,
      });
    }
  };

  const toggle = (path: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  return (
    <Stack gap="md">
      <Text size="xs" c="dimmed">
        Each Claude review runs in its own checkout of the pull request. A checkout is removed when
        you submit your review of that pull request, or once no review has run in it for{" "}
        {maxAgeDays} days. Removing one keeps its Claude review, but that session can no longer be
        continued in a terminal.
      </Text>

      {checkouts.length === 0 ? (
        <Text size="sm" c="dimmed" ta="center" py="lg">
          Nothing is checked out.
        </Text>
      ) : (
        <>
          <Group justify="space-between" wrap="nowrap">
            <Text size="sm">
              {plural(checkouts.length, "checkout")} ·{" "}
              {measured ? (
                formatBytes(bytes(checkouts))
              ) : (
                <Text span size="sm" c="dimmed">
                  measuring…
                </Text>
              )}
            </Text>
            <Button
              size="xs"
              color="red"
              variant="light"
              leftSection={<IconTrash size={14} />}
              disabled={selected.length === 0}
              onClick={() => run(selected.map((c) => c.path))}
            >
              {selected.length === 0
                ? "Remove selected"
                : `Remove ${selected.length}${measured ? ` (${formatBytes(bytes(selected))})` : ""}`}
            </Button>
          </Group>

          <Table.ScrollContainer minWidth={540}>
            <Table verticalSpacing={6} highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={32}>
                    <Checkbox
                      size="xs"
                      aria-label="Select every checkout that can be removed"
                      checked={allPicked}
                      indeterminate={selected.length > 0 && !allPicked}
                      disabled={removable.length === 0}
                      onChange={() =>
                        setPicked(allPicked ? new Set() : new Set(removable.map((c) => c.path)))
                      }
                    />
                  </Table.Th>
                  <Table.Th>Pull request</Table.Th>
                  <Table.Th w={96}>Last used</Table.Th>
                  <Table.Th w={72} style={{ textAlign: "right" }}>
                    Size
                  </Table.Th>
                  <Table.Th w={40} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {checkouts.map((checkout) => (
                  <CheckoutRow
                    key={checkout.path}
                    checkout={checkout}
                    picked={picked.has(checkout.path)}
                    busy={removing.has(checkout.path)}
                    onToggle={() => toggle(checkout.path)}
                    onRemove={() => run([checkout.path])}
                  />
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </>
      )}
    </Stack>
  );
}

function CheckoutRow({
  checkout: c,
  picked,
  busy,
  onToggle,
  onRemove,
}: {
  checkout: Checkout;
  picked: boolean;
  busy: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const label = `${c.owner}/${c.name}#${c.number}`;

  return (
    <Table.Tr style={{ opacity: busy ? 0.5 : 1 }}>
      <Table.Td>
        <Checkbox
          size="xs"
          aria-label={`Select ${label}`}
          checked={picked && !c.inUse}
          disabled={c.inUse || busy}
          onChange={onToggle}
        />
      </Table.Td>
      {/* A zero max-width lets the title truncate instead of widening the table. */}
      <Table.Td style={{ maxWidth: 0 }}>
        <Group gap={6} wrap="nowrap">
          <Text size="sm" fw={550} style={{ flex: "none" }}>
            {c.name}#{c.number}
          </Text>
          <Text size="xs" c="dimmed" ff="monospace" style={{ flex: "none" }}>
            {c.sha.slice(0, 7)}
          </Text>
          {c.inUse && (
            <Badge size="xs" variant="light" color="indigo" style={{ flex: "none" }}>
              reviewing
            </Badge>
          )}
          {c.reviews === 0 && (
            <Tooltip label="No saved review points at this checkout any more">
              <Badge size="xs" variant="light" color="gray" style={{ flex: "none" }}>
                no review
              </Badge>
            </Tooltip>
          )}
        </Group>
        <Tooltip label={c.path} openDelay={400}>
          <Text size="xs" c="dimmed" truncate>
            {c.title ?? c.path}
          </Text>
        </Tooltip>
      </Table.Td>
      <Table.Td>
        <Tooltip label={absoluteTime(c.lastUsedAt)}>
          <Text size="xs">{relativeTime(c.lastUsedAt)}</Text>
        </Tooltip>
      </Table.Td>
      <Table.Td style={{ textAlign: "right" }}>
        <Text size="xs" ff="monospace">
          {c.sizeBytes === null ? "…" : formatBytes(c.sizeBytes)}
        </Text>
      </Table.Td>
      <Table.Td>
        {busy ? (
          <Loader size={14} />
        ) : (
          !c.inUse && (
            <Tooltip label="Remove this checkout">
              <ActionIcon
                variant="subtle"
                color="red"
                size="sm"
                onClick={onRemove}
                aria-label={`Remove the checkout of ${label}`}
              >
                <IconTrash size={14} />
              </ActionIcon>
            </Tooltip>
          )
        )}
      </Table.Td>
    </Table.Tr>
  );
}
