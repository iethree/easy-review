import { Group, SegmentedControl, Slider, Text } from "@mantine/core";
import { useRef, useState } from "react";

type Mode = "wipe" | "fade" | "side";

/**
 * A before and an after of the same screen. Wipe: the before covers the
 * after up to a line you drag across. Fade: the after fades in over the
 * before. Side by side: both, next to each other.
 */
export function Compare({ before, after }: { before: string; after: string }) {
  const [mode, setMode] = useState<Mode>("wipe");
  // Wipe: where the line is. Fade: how much of the after shows. Both 0–100.
  const [at, setAt] = useState(50);
  const frame = useRef<HTMLDivElement>(null);

  // Drag anywhere on the picture to move the line, not just the slider.
  const follow = (e: React.PointerEvent<HTMLDivElement>) => {
    if (mode !== "wipe" || (e.type === "pointermove" && e.buttons !== 1)) return;
    const box = frame.current?.getBoundingClientRect();
    if (box) setAt(Math.min(100, Math.max(0, ((e.clientX - box.left) / box.width) * 100)));
  };

  return (
    <div className="er-compare">
      <Group justify="space-between" mb={6} wrap="nowrap">
        <SegmentedControl
          size="xs"
          value={mode}
          onChange={(v) => setMode(v as Mode)}
          data={[
            { value: "wipe", label: "Wipe" },
            { value: "fade", label: "Fade" },
            { value: "side", label: "Side by side" },
          ]}
        />
        {mode !== "side" && (
          <Slider
            size="sm"
            w={200}
            value={at}
            onChange={setAt}
            label={null}
            aria-label={mode === "wipe" ? "Wipe position" : "How much of the after shows"}
          />
        )}
      </Group>

      {mode === "side" ? (
        <div className="er-compare-side">
          <figure>
            <img src={before} alt="Before" />
            <Text component="figcaption" size="xs" c="dimmed">
              Before
            </Text>
          </figure>
          <figure>
            <img src={after} alt="After" />
            <Text component="figcaption" size="xs" c="dimmed">
              After
            </Text>
          </figure>
        </div>
      ) : (
        // Dragging on the picture is a shortcut for the slider above.
        <div
          ref={frame}
          className="er-compare-frame"
          data-mode={mode}
          onPointerDown={(e) => {
            if (mode === "wipe") e.currentTarget.setPointerCapture(e.pointerId);
            follow(e);
          }}
          onPointerMove={follow}
        >
          <img src={before} alt="Before" draggable={false} />
          <img
            className="er-compare-after"
            src={after}
            alt="After"
            draggable={false}
            style={
              mode === "wipe" ? { clipPath: `inset(0 0 0 ${at}%)` } : { opacity: at / 100 }
            }
          />
          {mode === "wipe" && <div className="er-compare-line" style={{ left: `${at}%` }} />}
          <span className="er-compare-tag" data-side="before">
            Before
          </span>
          <span className="er-compare-tag" data-side="after">
            After
          </span>
        </div>
      )}
    </div>
  );
}
