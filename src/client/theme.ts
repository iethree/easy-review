import { createTheme, Loader, rem } from "@mantine/core";
import { CommitsLoader } from "./components/Loading.tsx";

/**
 * A dense, console-like theme: tighter radii and smaller default text than
 * Mantine's defaults, because this screen is meant to be scanned, not read.
 */
export const theme = createTheme({
  primaryColor: "indigo",
  defaultRadius: "md",
  fontFamily:
    'InterVariable, Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  fontFamilyMonospace:
    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  headings: {
    fontWeight: "650",
    sizes: {
      h1: { fontSize: rem(22), lineHeight: "1.3" },
      h2: { fontSize: rem(18), lineHeight: "1.3" },
      h3: { fontSize: rem(15), lineHeight: "1.35" },
    },
  },
  components: {
    // Every <Loader> is the app's own: commits taking turns to hop.
    Loader: Loader.extend({
      defaultProps: { loaders: { ...Loader.defaultLoaders, commits: CommitsLoader }, type: "commits" },
    }),
    Badge: { defaultProps: { radius: "sm" } },
    Button: { defaultProps: { radius: "md" } },
    Tooltip: {
      defaultProps: { openDelay: 350, withArrow: true, transitionProps: { duration: 120 } },
    },
  },
});

/** Difficulty → Mantine colour key, used for badges and the row accent. */
export const DIFFICULTY_COLOR = {
  easy: "teal",
  medium: "yellow",
  hard: "red",
} as const;
