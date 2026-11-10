import { expect, test } from "bun:test";
import { readableOn } from "./labelColor.ts";

test("label text is dark on light colours and white on dark ones", () => {
  expect(readableOn("ffffff")).toBe("#1f2328");
  expect(readableOn("fbca04")).toBe("#1f2328"); // GitHub's yellow
  expect(readableOn("000000")).toBe("#ffffff");
  expect(readableOn("0075ca")).toBe("#ffffff"); // GitHub's "documentation" blue
  expect(readableOn("B60205")).toBe("#ffffff"); // case-insensitive
  expect(readableOn("nonsense")).toBe("#1f2328");
});
