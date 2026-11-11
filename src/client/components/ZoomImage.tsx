import { Anchor, Group, Modal, Text } from "@mantine/core";
import { IconExternalLink } from "@tabler/icons-react";
import { type ComponentProps, useState } from "react";

type Props = Omit<ComponentProps<"img">, "src"> & {
  /** What the page loads: GitHub's own images come through the server. */
  src: string;
  /** Where the image really is, to open on GitHub. */
  original: string;
};

/**
 * An image in Markdown at its own proportions, no wider than the text, that
 * opens larger when clicked. One inside a link that goes somewhere else (a
 * badge to its CI page, say) stays a link.
 */
export function ZoomImage({ src, original, alt, className, style, width, height, ...rest }: Props) {
  const [open, setOpen] = useState(false);
  // Only a height given: keep it, and let the width follow.
  const onlyHeight = height !== undefined && width === undefined;

  return (
    <>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: the lightbox is a bigger view of what's already here; Markdown images aren't focus stops */}
      <img
        {...rest}
        src={src}
        alt={alt ?? ""}
        width={width}
        height={height}
        className={["er-zoomable", className].filter(Boolean).join(" ")}
        style={onlyHeight ? { ...style, height: Number(height) || height } : style}
        loading="lazy"
        onClick={(e) => {
          const link = e.currentTarget.closest("a");
          const href = link?.getAttribute("href");
          if (href && href !== original && href !== src) return;
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      />
      {open && (
        <Modal
          opened
          onClose={() => setOpen(false)}
          size="auto"
          centered
          padding="xs"
          title={
            <Group gap={8} wrap="nowrap">
              {alt && (
                <Text size="sm" className="er-truncate" maw={480}>
                  {alt}
                </Text>
              )}
              <Anchor href={original} target="_blank" rel="noreferrer noopener" size="xs">
                <Group gap={4} wrap="nowrap">
                  Open original <IconExternalLink size={12} />
                </Group>
              </Anchor>
            </Group>
          }
          classNames={{ body: "er-lightbox-body" }}
        >
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: Escape and the close button close it too */}
          <img src={src} alt={alt ?? ""} className="er-lightbox-image" onClick={() => setOpen(false)} />
        </Modal>
      )}
    </>
  );
}
