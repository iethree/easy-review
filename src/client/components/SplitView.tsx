import { useCallback, useEffect, useRef, type ReactNode } from "react";

const STORAGE_KEY = "easy-review.split.v1";
const MIN_LEFT = 320;
/** Keep at least this much for the code — diffs are the point of the page. */
const MIN_RIGHT = 420;

export type SplitMode = "split" | "list" | "preview";

interface Props {
  left: ReactNode;
  right: ReactNode;
  /**
   * `split` shows both. `preview` is focus mode (and the narrow-screen detail
   * view); `list` is the narrow-screen master view.
   */
  mode: SplitMode;
}

function readStoredWidth(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * Two panes with a draggable divider. The width lives in a CSS variable that
 * is written straight to the element while dragging, so resizing never
 * re-renders React — the diff on the right can be thousands of lines.
 */
export function SplitView({ left, right, mode }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);

  const clamp = useCallback((px: number) => {
    const root = rootRef.current;
    if (!root) return px;
    // clientWidth includes the container's padding and the handle's own
    // column, neither of which is space the code pane gets to use.
    const style = getComputedStyle(root);
    const inner =
      root.clientWidth -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight) -
      (handleRef.current?.offsetWidth ?? 0);
    const max = Math.max(MIN_LEFT, inner - MIN_RIGHT);
    return Math.round(Math.min(Math.max(px, MIN_LEFT), max));
  }, []);

  const apply = useCallback((px: number | null) => {
    const root = rootRef.current;
    if (!root) return;
    if (px === null) root.style.removeProperty("--er-left-w");
    else root.style.setProperty("--er-left-w", `${px}px`);
  }, []);

  useEffect(() => {
    const stored = readStoredWidth();
    if (stored !== null) apply(clamp(stored));
  }, [apply, clamp]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const handle = handleRef.current;
    const leftPane = leftRef.current;
    if (!handle || !leftPane) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    handle.dataset.dragging = "true";
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const origin = leftPane.getBoundingClientRect().left;
    let latest = leftPane.getBoundingClientRect().width;

    const move = (ev: PointerEvent) => {
      latest = clamp(ev.clientX - origin);
      apply(latest);
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      delete handle.dataset.dragging;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      try {
        localStorage.setItem(STORAGE_KEY, String(latest));
      } catch {
        /* storage disabled — the width just won't persist */
      }
    };

    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  };

  const onDoubleClick = () => {
    apply(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="er-split" data-mode={mode} ref={rootRef}>
      <div className="er-split-left" ref={leftRef}>
        {left}
      </div>
      <div
        className="er-split-handle"
        ref={handleRef}
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panes (double-click to reset)"
        title="Drag to resize · double-click to reset"
      />
      <div className="er-split-right">{right}</div>
    </div>
  );
}
