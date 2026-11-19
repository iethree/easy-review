import { Anchor, Button, Group, Loader, Stack, Text, TextInput } from "@mantine/core";
import { IconCheck, IconLogin2, IconRefresh } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import type { ClaudeLoginState } from "../../shared/aiReview.ts";
import { call } from "../hooks/useLocalReviews.ts";

const LOGIN = "/api/local/claude/login";

interface Props {
  /** Shown once signed in: run the review (or ask the question) again. */
  onSignedIn?: () => void;
  retryLabel?: string;
}

/**
 * For when Claude stopped because its sign-in expired. The server runs
 * `claude auth login`, which opens the sign-in page in your browser; this
 * follows it, with the page's link in case the browser didn't open, and a box
 * for the code the page shows when it can't hand it back on its own.
 */
export function ClaudeSignIn({ onSignedIn, retryLabel = "Re-run" }: Props) {
  // Null until you press the button: an attempt from earlier doesn't show here.
  const [login, setLogin] = useState<ClaudeLoginState | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const waiting = login?.state === "waiting";

  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => {
      call<ClaudeLoginState>(LOGIN)
        .then(setLogin)
        .catch(() => {});
    }, 1_500);
    return () => clearInterval(timer);
  }, [waiting]);

  const send = (path: string, body?: unknown) => {
    setError(null);
    call<ClaudeLoginState>(path, {
      method: "POST",
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
      .then(setLogin)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  };

  if (login?.state === "done") {
    return (
      <Group gap="xs">
        <IconCheck size={16} color="var(--mantine-color-teal-6)" />
        <Text size="sm">Signed in to Claude.</Text>
        {onSignedIn && (
          <Button size="compact-sm" variant="light" leftSection={<IconRefresh size={14} />} onClick={onSignedIn}>
            {retryLabel}
          </Button>
        )}
      </Group>
    );
  }

  if (waiting) {
    return (
      <Stack gap={6}>
        <Group gap="xs" wrap="nowrap">
          <Loader size={14} />
          <Text size="sm">
            {login.url === null
              ? "Starting to sign in…"
              : login.browserOpened
                ? "Finish signing in on the page that opened in your browser."
                : "Open the sign-in page and finish signing in there."}
          </Text>
        </Group>
        {login.url && (
          <Text size="xs">
            <Anchor href={login.url} target="_blank" rel="noreferrer">
              {login.browserOpened ? "Open the sign-in page again" : "Open the sign-in page"}
            </Anchor>
          </Text>
        )}
        {login.url && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (code.trim()) send(`${LOGIN}/code`, { code: code.trim() });
              setCode("");
            }}
          >
            <Group gap="xs" align="flex-end" wrap="nowrap">
              <TextInput
                size="xs"
                style={{ flex: 1 }}
                label="If the page shows a code, paste it here"
                value={code}
                onChange={(event) => setCode(event.currentTarget.value)}
              />
              <Button size="xs" variant="light" type="submit" disabled={!code.trim()}>
                Send
              </Button>
              <Button size="xs" variant="subtle" color="gray" onClick={() => send(`${LOGIN}/cancel`)}>
                Cancel
              </Button>
            </Group>
          </form>
        )}
        {error && (
          <Text size="xs" c="red">
            {error}
          </Text>
        )}
      </Stack>
    );
  }

  return (
    <Stack gap={4} align="flex-start">
      <Button size="compact-sm" variant="light" leftSection={<IconLogin2 size={14} />} onClick={() => send(LOGIN)}>
        Sign in to Claude
      </Button>
      {(error ?? (login?.state === "failed" ? login.error : null)) && (
        <Text size="xs" c="red">
          {error ?? (login?.state === "failed" ? login.error : null)}
        </Text>
      )}
    </Stack>
  );
}
