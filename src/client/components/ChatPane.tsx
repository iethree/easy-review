import { ActionIcon, Alert, Button, Group, Loader, ScrollArea, Stack, Text, Textarea, Tooltip } from "@mantine/core";
import { IconAlertTriangle, IconPlayerStop, IconSend, IconX } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import type { AiReviewSummary } from "../../shared/aiReview.ts";
import type { PullRequest } from "../../shared/types.ts";
import { answerKey } from "../assembly.ts";
import { useReviewDetail } from "../hooks/useLocalReviews.ts";
import { Markdown, ReviewScreenshots } from "./Markdown.tsx";
import { ProseReview } from "./ProseReview.tsx";

/** What opened the chat: a part of the review to ask about, if any. `n` tells two asks apart. */
export interface ChatRequest {
  jobId: string;
  quote: string | null;
  n: number;
}

interface Props {
  pr: PullRequest;
  job: AiReviewSummary;
  request: ChatRequest;
  onAsk: (id: string, question: string, quote?: string) => Promise<void>;
  onStop: (id: string) => void;
  onClose: () => void;
}

/**
 * Follow-up questions about one of Claude's reviews, in the side pane where
 * your review goes (one or the other). Each question continues the session
 * that wrote the review, in its checkout, with the tools it had; any part of
 * an answer can go into your review, like the review's own.
 */
export function ChatPane({ pr, job, request, onAsk, onStop, onClose }: Props) {
  const detail = useReviewDetail(job);
  const chat = detail?.chat ?? [];
  const [quote, setQuote] = useState<string | null>(request.quote);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Asked about another part of the review while open: that's the one now.
  // biome-ignore lint/correctness/useExhaustiveDependencies: n is the trigger; the quote comes with it
  useEffect(() => {
    setQuote(request.quote);
    inputRef.current?.focus();
  }, [request.n]);

  // Newest at the bottom, in view.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when the conversation grows or Claude starts answering
  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [chat.length, Boolean(job.chatPhase)]);

  const answering = Boolean(job.chatPhase);
  // Unknown until the detail loads; the server says why if it can't be asked.
  const gone = detail !== null && (!detail.worktreePath || !detail.sessionId);
  const canSend = question.trim() !== "" && !answering && !sending && !gone;

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      await onAsk(job.id, question, quote ?? undefined);
      setQuestion("");
      setQuote(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <aside className="er-pane er-review-pane" aria-label="Ask Claude">
      <div className="er-pane-head">
        <Group justify="space-between" wrap="nowrap">
          <Text size="sm" fw={700} truncate>
            Ask {job.reviewerName} about #{pr.number}
          </Text>
          <Tooltip label="Close the chat">
            <ActionIcon variant="subtle" color="gray" size="sm" onClick={onClose} aria-label="Close the chat">
              <IconX size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </div>

      <ScrollArea style={{ flex: 1 }} type="auto" viewportRef={viewportRef}>
        <ReviewScreenshots.Provider value={job.id}>
          <Stack gap="md" p="sm">
            {chat.length === 0 && !answering && (
              <Text size="xs" c="dimmed">
                Questions go to the Claude session that wrote this review, in its checkout, with the tools it
                had. Hover a part of the review and press its speech bubble to ask about just that. Anything in an
                answer can go into your review with its +.
              </Text>
            )}
            {chat.map((message, i) =>
              message.role === "user" ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: messages are only ever appended
                <div key={i} className="er-chat-question">
                  {message.quote && <div className="er-chat-quote">{message.quote}</div>}
                  <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                    {message.text}
                  </Text>
                </div>
              ) : message.error ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: as above
                <Text key={i} size="xs" c="red">
                  {message.text}
                </Text>
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: as above
                <div key={i}>
                  <ProseReview
                    pr={pr}
                    review={{ id: job.id, headSha: job.headSha }}
                    markdown={message.text}
                    // Added from here, it stays here: the review pane can wait.
                    onAdded={() => {}}
                    pieceKey={(block) => answerKey(job.id, i, block)}
                  />
                </div>
              ),
            )}
            {answering && (
              <Group gap={8} wrap="nowrap">
                <Loader size={12} />
                <Text size="xs" c="dimmed" truncate style={{ flex: 1 }}>
                  {job.chatPhase}
                </Text>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="red"
                  leftSection={<IconPlayerStop size={12} />}
                  onClick={() => onStop(job.id)}
                >
                  Stop
                </Button>
              </Group>
            )}
          </Stack>
        </ReviewScreenshots.Provider>
      </ScrollArea>

      <div className="er-chat-composer">
        {gone ? (
          <Alert color="gray" variant="light" icon={<IconAlertTriangle size={14} />} p="xs">
            <Text size="xs">
              This review's checkout has been removed, so its session can't be continued. Re-run the review to
              ask about it.
            </Text>
          </Alert>
        ) : (
          <Stack gap={6}>
            {quote && (
              <Group gap={4} wrap="nowrap" align="flex-start" className="er-chat-quote">
                <div className="er-chat-quote-text">
                  <Markdown>{quote}</Markdown>
                </div>
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  color="gray"
                  onClick={() => setQuote(null)}
                  aria-label="Ask about the whole review instead"
                >
                  <IconX size={12} />
                </ActionIcon>
              </Group>
            )}
            {error && (
              <Text size="xs" c="red">
                {error}
              </Text>
            )}
            <Group gap={6} wrap="nowrap" align="flex-end">
              <Textarea
                ref={inputRef}
                style={{ flex: 1 }}
                size="xs"
                autosize
                minRows={2}
                maxRows={8}
                placeholder={quote ? "Ask about this part" : "Ask a follow-up question"}
                aria-label="Your question"
                value={question}
                onChange={(e) => setQuestion(e.currentTarget.value)}
                onKeyDown={(e) => {
                  // Enter sends; Shift+Enter is a new line.
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <Tooltip label="Send (Enter)">
                <ActionIcon size="lg" onClick={() => void send()} disabled={!canSend} loading={sending} aria-label="Send">
                  <IconSend size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Stack>
        )}
      </div>
    </aside>
  );
}
