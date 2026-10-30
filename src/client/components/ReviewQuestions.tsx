import { ActionIcon, Group, Loader, Stack, Text, Textarea, ThemeIcon, Tooltip } from "@mantine/core";
import { IconCheck, IconSend } from "@tabler/icons-react";
import { useState } from "react";
import type { AiQuestion } from "../../shared/aiReview.ts";

/**
 * Questions and instructions for a review while it runs — "make sure this
 * doesn't break embedding" — which it looks into and answers in the review.
 */
export function ReviewQuestions({
  questions,
  onSend,
}: {
  questions: readonly AiQuestion[];
  onSend: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSend = text.trim() !== "" && !sending;

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      await onSend(text);
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <Stack gap={6} className="er-review-questions">
      {questions.map((q, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: questions are only ever added, at the end
        <Group key={i} gap={8} wrap="nowrap" align="flex-start">
          <Tooltip
            label={q.delivered ? "Claude has it, and will answer it in the review" : "On its way: Claude reads it between steps"}
          >
            <ThemeIcon size={18} radius="xl" variant="light" color={q.delivered ? "teal" : "gray"} mt={1}>
              {q.delivered ? <IconCheck size={12} /> : <Loader size={10} color="gray" />}
            </ThemeIcon>
          </Tooltip>
          <Text size="sm" style={{ whiteSpace: "pre-wrap", minWidth: 0 }}>
            {q.text}
          </Text>
        </Group>
      ))}
      <Group gap={6} wrap="nowrap" align="flex-end">
        <Textarea
          style={{ flex: 1 }}
          size="xs"
          autosize
          minRows={1}
          maxRows={6}
          placeholder="Ask it to look into something before it finishes: will this slow down CI?"
          aria-label="A question for this review"
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter is a new line.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <Tooltip label="Send (Enter)">
          <ActionIcon size="md" onClick={() => void send()} disabled={!canSend} loading={sending} aria-label="Send question">
            <IconSend size={15} />
          </ActionIcon>
        </Tooltip>
      </Group>
      {error && (
        <Text size="xs" c="red">
          {error}
        </Text>
      )}
    </Stack>
  );
}
