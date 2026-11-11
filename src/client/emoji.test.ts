import { expect, test } from "bun:test";
import remarkGemoji from "remark-gemoji";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { emojiQuery, insertEmoji, searchEmoji } from "./emoji.ts";

test("a :name being typed is found just before the caret", () => {
  expect(emojiQuery("nice :tad", 9)).toEqual({ start: 5, query: "tad" });
  expect(emojiQuery(":+1", 3)).toEqual({ start: 0, query: "+1" });
  expect(emojiQuery("ok (:Smi", 8)).toEqual({ start: 4, query: "smi" });
  // Mid-text: only what's before the caret counts.
  expect(emojiQuery("a :tada b", 7)).toEqual({ start: 2, query: "tada" });
});

test("nothing is suggested for one letter, a closed code, a time or a URL", () => {
  expect(emojiQuery(":t", 2)).toBeNull();
  expect(emojiQuery(":tada:", 6)).toBeNull();
  expect(emojiQuery("at 10:30", 8)).toBeNull();
  expect(emojiQuery("see https://x", 9)).toBeNull();
  expect(emojiQuery("a :tada b", 9)).toBeNull();
});

test("names that start with the query come first, the exact one before the rest", () => {
  const smile = searchEmoji("smile").map((m) => m.name);
  expect(smile[0]).toBe("smile");
  expect(smile.slice(0, 3)).toContain("smiley");
  expect(searchEmoji("tada")[0]).toEqual({ emoji: "🎉", name: "tada" });
  expect(searchEmoji("+1")[0]?.emoji).toBe("👍");
});

test("a name that holds the query, or a tag, still finds the emoji, once", () => {
  const found = searchEmoji("party", 50);
  expect(found.map((m) => m.emoji)).toContain("🎉"); // tagged "party"
  expect(new Set(found.map((m) => m.emoji)).size).toBe(found.length);
  expect(searchEmoji("rocket", 3)).toHaveLength(1);
  expect(searchEmoji("e", 8)).toHaveLength(8);
  expect(searchEmoji("zzzzqx")).toEqual([]);
});

test("putting the emoji in replaces the :name and leaves the caret after a space", () => {
  expect(insertEmoji("nice :tad", 5, 9, "🎉")).toEqual({ text: "nice 🎉 ", caret: 8 });
  // A space already there isn't doubled.
  expect(insertEmoji(":tad and more", 0, 4, "🎉")).toEqual({ text: "🎉 and more", caret: 2 });
});

test("shortcodes become emoji in Markdown, but not inside code", () => {
  const parse = unified().use(remarkParse);
  const tree = unified().use(remarkGemoji).runSync(parse.parse("Ship it :rocket: `:rocket:` :not_an_emoji:"));
  type Node = { type: string; value?: string; children?: Node[] };
  const leaves = (n: Node): Node[] => (n.children ? n.children.flatMap(leaves) : [n]);
  const all = leaves(tree as Node);
  expect(all.map((n) => n.value).join("")).toBe("Ship it 🚀 :rocket: :not_an_emoji:");
  expect(all.find((n) => n.type === "inlineCode")?.value).toBe(":rocket:");
});
