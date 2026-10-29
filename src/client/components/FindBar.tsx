import { ActionIcon, Group, Paper, Text, TextInput } from "@mantine/core";
import { IconChevronDown, IconChevronUp, IconSearch, IconX } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { clearPaint, findRanges, paint } from "../find.ts";

/**
 * Cmd/Ctrl+F: a little box over the preview that finds text in its current
 * tab. Enter and Shift+Enter step through the matches; Esc closes it. It
 * keeps up as the tab changes underneath — another pull request, another
 * tab, a diff that's still loading.
 */
export function FindBar({ scrollRef }: { scrollRef: RefObject<HTMLDivElement | null> }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [count, setCount] = useState(0);
  const [current, setCurrent] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const ranges = useRef<Range[]>([]);
  const searched = useRef<HTMLElement | null>(null);
  // The current match, kept outside state too so a search can read it.
  const at = useRef(0);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== "f") return;
      e.preventDefault();
      setOpen(true);
      // Already open: back to the box, with its text selected to type over.
      requestAnimationFrame(() => inputRef.current?.select());
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const show = useCallback(
    (index: number) => {
      const range = ranges.current[index];
      paint(ranges.current, index);
      const root = scrollRef.current;
      if (!range || !root) return;
      const rect = range.getBoundingClientRect();
      const box = root.getBoundingClientRect();
      const inView = rect.top >= box.top && rect.bottom <= box.bottom && rect.left >= box.left && rect.right <= box.right;
      if (!inView) range.startContainer.parentElement?.scrollIntoView({ block: "center", inline: "nearest" });
    },
    [scrollRef],
  );

  /** Search again. `jump` moves to the first match; otherwise the current one stays. */
  const search = useCallback(
    (jump: boolean) => {
      const root = scrollRef.current;
      // A new pull request or tab is a new page to search, so start at its top.
      const fresh = jump || root !== searched.current;
      searched.current = root;
      ranges.current = root && query ? findRanges(root, query) : [];
      const n = ranges.current.length;
      at.current = fresh ? 0 : Math.min(at.current, Math.max(n - 1, 0));
      setCount(n);
      setCurrent(at.current);
      if (fresh) show(at.current);
      else paint(ranges.current, at.current);
    },
    [query, scrollRef, show],
  );

  useEffect(() => {
    if (!open) return;
    search(true);
    // The tab's text changes under us: re-search once it settles.
    const pane = boxRef.current?.parentElement;
    if (!pane) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new MutationObserver((records) => {
      // Not this box's own count changing.
      if (records.every((r) => boxRef.current?.contains(r.target))) return;
      clearTimeout(timer);
      timer = setTimeout(() => search(false), 150);
    });
    observer.observe(pane, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [open, search]);

  useEffect(() => clearPaint, []);

  function step(direction: 1 | -1) {
    const n = ranges.current.length;
    if (n === 0) return;
    at.current = (at.current + direction + n) % n;
    setCurrent(at.current);
    show(at.current);
  }

  function close() {
    setOpen(false);
    clearPaint();
    ranges.current = [];
    scrollRef.current?.focus({ preventScroll: true });
  }

  if (!open) return null;

  return (
    <Paper ref={boxRef} className="er-find" shadow="md" radius="md" withBorder p={4}>
      <Group gap={2} wrap="nowrap">
        <TextInput
          ref={inputRef}
          size="xs"
          variant="unstyled"
          autoFocus
          placeholder="Find in this tab"
          leftSection={<IconSearch size={14} />}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              step(e.shiftKey ? -1 : 1);
            } else if (e.key === "Escape") {
              e.stopPropagation();
              close();
            }
          }}
          aria-label="Find in this tab"
          style={{ width: 180 }}
        />
        <Text size="xs" c="dimmed" miw={52} ta="right" pr={4} style={{ fontVariantNumeric: "tabular-nums" }}>
          {query ? (count ? `${current + 1} of ${count}` : "No matches") : ""}
        </Text>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => step(-1)} disabled={!count} aria-label="Previous match">
          <IconChevronUp size={14} />
        </ActionIcon>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => step(1)} disabled={!count} aria-label="Next match">
          <IconChevronDown size={14} />
        </ActionIcon>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={close} aria-label="Close find">
          <IconX size={14} />
        </ActionIcon>
      </Group>
    </Paper>
  );
}
