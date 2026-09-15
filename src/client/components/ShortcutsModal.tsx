import { Divider, Group, Kbd, Modal, Stack, Text, Title } from "@mantine/core";
import { KEYMAP } from "../keymap.ts";

/** Keys that live inside a box rather than in the keymap. */
const IN_BOXES: { display: string[]; description: string }[] = [
  { display: ["Enter"], description: "In the approve box: confirm the approval" },
  { display: ["⇧Enter"], description: "In the approve box: new line in the comment" },
  { display: ["⌘Enter"], description: "In the request-changes box: submit" },
  { display: ["Esc"], description: "Back out of whatever is open" },
];

function Rows({ rows }: { rows: { display: string[]; description: string }[] }) {
  return (
    <Stack gap={0}>
      {rows.map((row, i) => (
        <div key={row.description}>
          {i > 0 && <Divider opacity={0.4} />}
          <div className="er-kbd-row">
            <Text size="sm">{row.description}</Text>
            <Group gap={4} wrap="nowrap">
              {row.display.map((k) => (
                <Kbd key={k} size="xs">
                  {k}
                </Kbd>
              ))}
            </Group>
          </div>
        </div>
      ))}
    </Stack>
  );
}

/** Drawn from the same table the key handler uses, so it can't go stale. */
export function ShortcutsModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  return (
    <Modal opened={opened} onClose={onClose} title="Keyboard shortcuts" size="md" radius="md">
      <Rows rows={KEYMAP} />
      <Title order={3} mt="md" mb={4}>
        Inside the boxes
      </Title>
      <Rows rows={IN_BOXES} />
    </Modal>
  );
}
