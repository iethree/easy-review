import { Popover, Text, Textarea, UnstyledButton } from "@mantine/core";
import { useId, useMergedRef } from "@mantine/hooks";
import { type ComponentProps, type Ref, useLayoutEffect, useMemo, useRef, useState } from "react";
import { emojiQuery, insertEmoji, searchEmoji } from "../emoji.ts";

type Props = Omit<ComponentProps<typeof Textarea>, "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
  ref?: Ref<HTMLTextAreaElement>;
};

/**
 * A comment box that knows GitHub's emoji: type `:` and two letters of a name
 * (`:tad`) and it offers 🎉 and friends. ↑/↓ choose, Enter or Tab puts one in,
 * Esc closes the list and leaves the box open. Anything else, the box's own
 * keys handle as before.
 */
export function EmojiTextarea({ value, onValueChange, onKeyDown, onBlur, ref, ...rest }: Props) {
  const inner = useRef<HTMLTextAreaElement>(null);
  const merged = useMergedRef(inner, ref);
  const listId = useId();
  const [query, setQuery] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);
  /** Where the caret goes once the emoji is in. */
  const caretAfter = useRef<number | null>(null);

  const matches = useMemo(() => (query ? searchEmoji(query.query) : []), [query]);
  const open = matches.length > 0;

  useLayoutEffect(() => {
    const caret = caretAfter.current;
    if (caret === null || !inner.current) return;
    caretAfter.current = null;
    inner.current.setSelectionRange(caret, caret);
  });

  const look = (el: HTMLTextAreaElement) => {
    const next = el.selectionStart === el.selectionEnd ? emojiQuery(el.value, el.selectionStart) : null;
    setQuery((was) => (was?.start === next?.start && was?.query === next?.query ? was : next));
    if (next?.query !== query?.query) setActive(0);
  };

  const pick = (index: number) => {
    const el = inner.current;
    const choice = matches[index];
    if (!el || !query || !choice) return;
    const done = insertEmoji(value, query.start, el.selectionStart, choice.emoji);
    caretAfter.current = done.caret;
    setQuery(null);
    onValueChange(done.text);
  };

  return (
    <Popover
      opened={open}
      onDismiss={() => setQuery(null)}
      position="bottom-start"
      offset={4}
      width={260}
      shadow="md"
      // Inside the box's own popover or pane, so a click on the list is a click inside them.
      withinPortal={false}
      floatingStrategy="fixed"
      trapFocus={false}
      returnFocus={false}
    >
      <Popover.Target>
        <Textarea
          {...rest}
          ref={merged}
          value={value}
          aria-autocomplete="list"
          aria-controls={open ? listId : undefined}
          aria-expanded={open}
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          onChange={(e) => {
            onValueChange(e.currentTarget.value);
            look(e.currentTarget);
          }}
          onSelect={(e) => look(e.currentTarget)}
          onBlur={(e) => {
            setQuery(null);
            onBlur?.(e);
          }}
          onKeyDown={(e) => {
            if (open && !e.nativeEvent.isComposing) {
              const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];
              if (step) {
                e.preventDefault();
                e.stopPropagation();
                setActive((i) => (i + step + matches.length) % matches.length);
                return;
              }
              if ((e.key === "Enter" || e.key === "Tab") && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                e.stopPropagation();
                pick(active);
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setQuery(null);
                return;
              }
            }
            onKeyDown?.(e);
          }}
        />
      </Popover.Target>
      <Popover.Dropdown p={4} className="er-emoji-suggest">
        <div id={listId} role="listbox" aria-label="Emoji">
          {matches.map((m, i) => (
            <UnstyledButton
              key={m.emoji}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              data-active={i === active}
              className="er-emoji-option"
              tabIndex={-1}
              // Keep the caret in the box: the click mustn't blur it.
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(i)}
            >
              <span className="er-emoji-option-glyph">{m.emoji}</span>
              <Text size="xs" ff="monospace" className="er-truncate">
                :{m.name}:
              </Text>
            </UnstyledButton>
          ))}
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}
