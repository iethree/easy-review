import { Alert, Code, Text, useComputedColorScheme } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useMemo } from "react";
import { compile, THEMES } from "reladraw";

/**
 * A ```reladraw block in a review, drawn in the app's light or dark theme.
 * Shown as an image, so nothing in the SVG can run; a diagram that doesn't
 * compile shows why, and its source.
 */
export function Diagram({ source }: { source: string }) {
  const scheme = useComputedColorScheme("light");
  const drawn = useMemo(() => {
    try {
      return { svg: compile(source, { theme: scheme === "dark" ? THEMES.dark : THEMES.light }) };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }, [source, scheme]);

  if ("error" in drawn) {
    return (
      <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />} p="xs" my="sm">
        <Text size="xs" mb={6}>
          This diagram didn't draw: {drawn.error}
        </Text>
        <Code block fz={11}>
          {source}
        </Code>
      </Alert>
    );
  }
  return (
    <div className="er-diagram">
      <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(drawn.svg)}`} alt="Diagram" />
    </div>
  );
}
