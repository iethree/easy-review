import { expect, test } from "bun:test";
import { appendLine, findingKey, parseAssemblies, withAssembly } from "./assembly.ts";

test("stored reviews-in-progress are read back, and junk is dropped", () => {
  expect(parseAssemblies(JSON.stringify({ a: { summary: "Hi", added: ["r:0", 3] }, b: "x" }))).toEqual({
    a: { summary: "Hi", added: ["r:0"] },
  });
  expect(parseAssemblies("not json")).toEqual({});
  expect(parseAssemblies(null)).toEqual({});
});

test("summary lines go under what's there", () => {
  expect(appendLine("", "- one")).toBe("- one");
  expect(appendLine("Intro\n\n", "- one")).toBe("Intro\n- one");
});

test("an empty review drops out of storage", () => {
  const map = withAssembly({}, "pr", { summary: "x", added: [] });
  expect(map).toEqual({ pr: { summary: "x", added: [] } });
  expect(withAssembly(map, "pr", { summary: "  ", added: [] })).toEqual({});
});

test("a finding is known by its review and position", () => {
  expect(findingKey("job-1", 2)).toBe("job-1:2");
});
