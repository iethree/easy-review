import { expect, test } from "bun:test";
import {
  composeApprovalBody,
  DEFAULT_APPROVAL_EMOJI,
  isPositiveEmoji,
  leadingEmoji,
  POSITIVE_EMOJIS,
  startsWithPositiveEmoji,
} from "./approval.ts";

test("the default is 🎉, and it is one of the choices", () => {
  expect(DEFAULT_APPROVAL_EMOJI).toBe("🎉");
  expect(isPositiveEmoji(DEFAULT_APPROVAL_EMOJI)).toBe(true);
  expect(POSITIVE_EMOJIS[0].emoji).toBe("🎉");
});

test("the choices are distinct and each is a single character", () => {
  const all = POSITIVE_EMOJIS.map((e) => e.emoji);
  expect(new Set(all).size).toBe(all.length);
  // No skin tones or variation selectors, which would make "the first
  // character is the emoji" ambiguous.
  for (const emoji of all) expect(Array.from(emoji)).toHaveLength(1);
});

test("an approval is the emoji, then the comment if there is one", () => {
  expect(composeApprovalBody("🎉")).toBe("🎉");
  expect(composeApprovalBody("🎉", "   ")).toBe("🎉");
  expect(composeApprovalBody("🚀", "  Ship it  ")).toBe("🚀 Ship it");
  expect(composeApprovalBody("✅", "Line one\n\nLine two")).toBe("✅ Line one\n\nLine two");
});

test("composing refuses anything that isn't a positive emoji", () => {
  expect(() => composeApprovalBody("👎")).toThrow();
  expect(() => composeApprovalBody("LGTM")).toThrow();
  expect(() => composeApprovalBody("")).toThrow();
});

test("the rule looks at the first character", () => {
  expect(startsWithPositiveEmoji("🎉")).toBe(true);
  expect(startsWithPositiveEmoji("🏆 Great work")).toBe(true);
  expect(startsWithPositiveEmoji("  🎉 leading space is fine")).toBe(true);
  expect(startsWithPositiveEmoji("LGTM 🎉")).toBe(false);
  expect(startsWithPositiveEmoji("👎 no")).toBe(false);
  expect(startsWithPositiveEmoji("")).toBe(false);
  expect(startsWithPositiveEmoji(undefined)).toBe(false);
});

test("an emoji counts as one character, not two UTF-16 halves", () => {
  expect(leadingEmoji("🎉 hi")).toBe("🎉");
  expect("🎉".length).toBe(2); // why Array.from is needed
});
