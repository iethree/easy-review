import { Alert, Button, Code, Text } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { Component, type ReactNode } from "react";

interface State {
  error: Error | null;
}

/**
 * A pane that fails to draw says so, in place, instead of taking the whole
 * page down with it — React unmounts everything above an error it can't
 * catch. Keyed by what it shows, so moving on starts afresh.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error) {
    console.error(error);
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />} title="This couldn't be shown">
        <Code block fz={11} mb="sm">
          {error.message}
        </Code>
        <Text size="xs" c="dimmed" mb="sm">
          The rest of the app is fine.
        </Text>
        <Button size="xs" variant="light" color="red" onClick={() => this.setState({ error: null })}>
          Try again
        </Button>
      </Alert>
    );
  }
}
