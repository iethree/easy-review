import { expect, test } from "bun:test";
import { parseNotice } from "./notice.ts";

test("a notice needs an id and a title; the body is optional", () => {
  expect(parseNotice({ id: "job-1", title: " Security finished reviewing #7 ", body: "Fix it" })).toEqual({
    id: "job-1",
    title: "Security finished reviewing #7",
    body: "Fix it",
  });
  expect(parseNotice({ id: "job-1", title: "Done" })).toEqual({ id: "job-1", title: "Done", body: "" });
});

test("anything else from the page is ignored", () => {
  expect(parseNotice(null)).toBeNull();
  expect(parseNotice("hi")).toBeNull();
  expect(parseNotice({ id: "", title: "x" })).toBeNull();
  expect(parseNotice({ id: "x", title: "  " })).toBeNull();
  expect(parseNotice({ id: 7, title: "x" })).toBeNull();
  expect(parseNotice({ id: "x".repeat(201), title: "x" })).toBeNull();
});

test("long text is clipped to what a notification can show", () => {
  const notice = parseNotice({ id: "x", title: "t".repeat(500), body: "b".repeat(1000) });
  expect(notice?.title).toHaveLength(120);
  expect(notice?.body).toHaveLength(300);
  expect(notice?.title.endsWith("…")).toBe(true);
});
