import { Typography } from "@mantine/core";
import { memo } from "react";
import ReactMarkdown, { type Options } from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { Diagram } from "./Diagram.tsx";

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
          // A ```reladraw block is a diagram, drawn rather than shown as code.
          pre: ({ node, children: inner, ...rest }) => {
            const source = reladrawSource(node);
            return source !== null ? <Diagram source={source} /> : <pre {...rest}>{inner}</pre>;
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

/** The source of a ```reladraw block, from its <pre>; null for any other. */
function reladrawSource(pre: HastNode | undefined): string | null {
  const code = pre?.children?.find((c) => c.type === "element" && c.tagName === "code");
  const classes = code?.properties?.className;
  if (!code || !Array.isArray(classes) || !classes.includes("language-reladraw")) return null;
  const text = (n: HastNode): string => n.value ?? (n.children ?? []).map(text).join("");
  return text(code);
}
