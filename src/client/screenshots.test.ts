import { expect, test } from "bun:test";
import { parseCompare, screenshotName, screenshotUrl } from "./screenshots.ts";

test("a review's screenshots are named by file, however the path is written", () => {
  expect(screenshotName("screenshots/settings.png")).toBe("settings.png");
  expect(screenshotName("./screenshots/a-b_c.webp")).toBe("a-b_c.webp");
  expect(screenshotName(".easy-review/screenshots/x.JPG")).toBe("x.JPG");
  // Anything else isn't one: not another folder, not a way out, not the web.
  expect(screenshotName("screenshots/../secret.png")).toBeNull();
  expect(screenshotName("screenshots/sub/x.png")).toBeNull();
  expect(screenshotName("https://example.com/x.png")).toBeNull();
  expect(screenshotName("screenshots/x.svg")).toBeNull();
});

test("a compare block names its before and after", () => {
  expect(parseCompare("before: screenshots/a.png\nafter: screenshots/b.png\n")).toEqual({ before: "a.png", after: "b.png" });
  expect(parseCompare("After: screenshots/b.png\nBefore:screenshots/a.png")).toEqual({ before: "a.png", after: "b.png" });
  expect(parseCompare("before: screenshots/a.png")).toBeNull();
  expect(parseCompare("before: /etc/passwd\nafter: screenshots/b.png")).toBeNull();
});

test("they're fetched from the review's own route", () => {
  expect(screenshotUrl("abc", "a b.png")).toBe("/api/local/reviews/abc/screenshots/a%20b.png");
});
