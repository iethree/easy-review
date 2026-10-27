import { Tooltip, UnstyledButton } from "@mantine/core";
import { POSITIVE_EMOJIS } from "../../shared/approval.ts";

interface Props {
  value: string;
  onChange: (emoji: string) => void;
}

/** A grid of the approval emojis. Toggle buttons, so Tab walks through them. */
export function EmojiPicker({ value, onChange }: Props) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a <fieldset> brings a border and legend this grid doesn't want
    <div className="er-emoji-grid" role="group" aria-label="Approval emoji">
      {POSITIVE_EMOJIS.map(({ emoji, name }) => (
        <Tooltip key={emoji} label={name} openDelay={400}>
          <UnstyledButton
            className="er-emoji"
            data-selected={value === emoji}
            aria-pressed={value === emoji}
            aria-label={name}
            onClick={() => onChange(emoji)}
          >
            {emoji}
          </UnstyledButton>
        </Tooltip>
      ))}
    </div>
  );
}
