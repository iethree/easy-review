import { Typography } from "@mantine/core";
import { createContext, memo, useContext } from "react";
import ReactMarkdown, { type Options } from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { parseCompare, screenshotName, screenshotUrl } from "../screenshots.ts";
import { Compare } from "./Compare.tsx";
import { Diagram } from "./Diagram.tsx";
import { Report } from "./Report.tsx";

/**
 * Inside a Claude review: its id, so its screenshots can be shown. There, an
 * image is one of the review's own screenshots or nothing — a review can be
 * steered by the code it reads, and a remote image would call out with it.
 */
export const ReviewScreenshots = createContext<string | null>(null);

/**
 * Parse the HTML embedded in the Markdown, then sanitise it with the same
 * rules GitHub uses: <details>, <img>, <sub> and friends survive; <script>,
 * <style>, event handlers and javascript: links don't, and comments vanish.
 */
const GITHUB_HTML: NonNullable<Options["rehypePlugins"]> = [rehypeRaw, [rehypeSanitize, defaultSchema]];

interface Props {
  children: string;
  /**
   * Off for Claude's reviews, which have no business emitting HTML (anything
   * HTML-shaped shows as text). On for PR descriptions, whose templates are
   * full of it — rendered, but sanitised.
   */
  allowHtml?: boolean;
}

export const Markdown = memo(function Markdown({ children, allowHtml = false }: Props) {
  const reviewId = useContext(ReviewScreenshots);
  return (
    <Typography className="er-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={allowHtml ? GITHUB_HTML : undefined}
        components={{
          a: ({ href, children: text }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {text}
            </a>
          ),
          // A ```reladraw block is a diagram, drawn rather than shown as code;
          // in a review, a ```compare block is a before and an after, and a
          // ```report block its HTML report.
          pre: ({ node, children: inner, ...rest }) => {
            const block = fencedBlock(node);
            if (block?.lang === "reladraw") return <Diagram source={block.text} />;
            if (reviewId && block?.lang === "report") return <Report reviewId={reviewId} title={block.text.trim()} />;
            const pair = reviewId && block?.lang === "compare" ? parseCompare(block.text) : null;
            if (reviewId && pair) {
              return <Compare before={screenshotUrl(reviewId, pair.before)} after={screenshotUrl(reviewId, pair.after)} />;
            }
            return <pre {...rest}>{inner}</pre>;
          },
          img: ({ src, alt, node: _node, ...rest }) => {
            if (reviewId === null) return <img src={src} alt={alt} {...rest} />;
            const name = typeof src === "string" ? screenshotName(src) : null;
            return name ? (
              <img className="er-screenshot" src={screenshotUrl(reviewId, name)} alt={alt ?? ""} />
            ) : (
              <span className="er-image-missing">[{alt || "image"}]</span>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </Typography>
  );
});

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: { className?: unknown };
  children?: HastNode[];
}

/** A fenced block's language and text, from its <pre>; null for a block with no language. */
function fencedBlock(pre: HastNode | undefined): { lang: string; text: string } | null {
  const code = pre?.children?.find((c) => c.type === "element" && c.tagName === "code");
  const classes = code?.properties?.className;
  const lang = Array.isArray(classes)
    ? classes.find((c): c is string => typeof c === "string" && c.startsWith("language-"))
    : undefined;
  if (!code || !lang) return null;
  const text = (n: HastNode): string => n.value ?? (n.children ?? []).map(text).join("");
  return { lang: lang.slice("language-".length), text: text(code) };
}
