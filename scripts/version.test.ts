import { expect, test } from "bun:test";
import { nextVersion, parseVersion, tagsFromLsRemote } from "./version.ts";

test("the first release of a series is package.json's version", () => {
  expect(nextVersion("0.1.0", [])).toBe("0.1.0");
});

test("each release after that is the next patch", () => {
  expect(nextVersion("0.1.0", ["v0.1.0"])).toBe("0.1.1");
  expect(nextVersion("0.1.0", ["v0.1.0", "v0.1.2", "v0.1.1"])).toBe("0.1.3");
});

test("tags from other series, and other tags, don't count", () => {
  expect(nextVersion("0.2.0", ["v0.1.9", "v1.2.5", "nightly", "v0.2.x"])).toBe("0.2.0");
});

test("a higher patch in package.json is a floor", () => {
  expect(nextVersion("0.1.5", ["v0.1.0", "v0.1.1"])).toBe("0.1.5");
});

test("versions parse with or without the v", () => {
  expect(parseVersion("v1.2.3")).toEqual([1, 2, 3]);
  expect(parseVersion("1.2.3")).toEqual([1, 2, 3]);
  expect(parseVersion("1.2")).toBeNull();
});

test("tag names come out of git ls-remote, peeled refs included once", () => {
  const output = [
    "a1b2c3\trefs/tags/v0.1.0",
    "d4e5f6\trefs/tags/v0.1.1",
    "d4e5f7\trefs/tags/v0.1.1^{}",
    "",
  ].join("\n");
  expect(tagsFromLsRemote(output)).toEqual(["v0.1.0", "v0.1.1"]);
});
