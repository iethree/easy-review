import { expect, test } from "bun:test";
import { ignoredTokenVars } from "./localToken.ts";

test("token variables that are set are named, so startup can say they're ignored", () => {
  expect(ignoredTokenVars({ GITHUB_TOKEN: "ghp_x", GH_TOKEN: "ghp_y", PATH: "/usr/bin" })).toEqual([
    "GH_TOKEN",
    "GITHUB_TOKEN",
  ]);
});

test("unset or blank ones aren't mentioned", () => {
  expect(ignoredTokenVars({ GITHUB_TOKEN: "", GH_TOKEN: "   ", GH_ENTERPRISE_TOKEN: undefined })).toEqual([]);
});
