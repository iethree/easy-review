import { Group, Text, Tooltip } from "@mantine/core";

interface Props {
  additions: number;
  deletions: number;
  files: number;
  /** One line of text, no bar — for the two-line list rows. */
  compact?: boolean;
}

/** "+42 −7" with a proportional bar, the way GitHub shows it but denser. */
export function DiffStat({ additions, deletions, files, compact: inline }: Props) {
  const total = additions + deletions;
  const addPct = total === 0 ? 0 : (additions / total) * 100;
  const label = `${files} file${files === 1 ? "" : "s"} · +${additions} −${deletions}`;

  if (inline) {
    // Fixed columns, right-aligned, so the numbers line up from row to row.
    return (
      <Tooltip label={label}>
        <span className="er-diffstat">
          <Text span c="teal.6" fw={600} fz="inherit" ff="inherit">
            +{compact(additions)}
          </Text>
          <Text span c="red.6" fw={600} fz="inherit" ff="inherit">
            −{compact(deletions)}
          </Text>
          <Text span c="dimmed" fz="inherit" ff="inherit">
            {files}f
          </Text>
        </span>
      </Tooltip>
    );
  }

  return (
    <Tooltip label={label}>
      <div style={{ cursor: "default" }}>
        <Group gap={6} wrap="nowrap" ff="monospace" fz={11.5} lh={1.2}>
          <Text span c="teal.6" fw={600} fz="inherit" ff="inherit">
            +{compact(additions)}
          </Text>
          <Text span c="red.6" fw={600} fz="inherit" ff="inherit">
            −{compact(deletions)}
          </Text>
          <Text span c="dimmed" fz="inherit" ff="inherit">
            {files}f
          </Text>
        </Group>
        <div className="er-statbar" style={{ marginTop: 4 }}>
          {total === 0 ? (
            <span style={{ flex: 1, background: "var(--mantine-color-gray-4)" }} />
          ) : (
            <>
              <span style={{ flex: addPct, background: "var(--mantine-color-teal-5)" }} />
              <span style={{ flex: 100 - addPct, background: "var(--mantine-color-red-5)" }} />
            </>
          )}
        </div>
      </div>
    </Tooltip>
  );
}

function compact(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
}
