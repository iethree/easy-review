import { expect, test } from "bun:test";
import { actionForKey, KEYMAP } from "./keymap.ts";

test("w and s move up and down the list", () => {
  expect(actionForKey("w")).toEqual({ type: "move", delta: -1 });
  expect(actionForKey("s")).toEqual({ type: "move", delta: 1 });
});

test("a and d choose the pane", () => {
  expect(actionForKey("a")).toEqual({ type: "focusPane", pane: "list" });
  expect(actionForKey("d")).toEqual({ type: "focusPane", pane: "preview" });
});

test("up and down scroll the code; left and right switch its tabs", () => {
  expect(actionForKey("ArrowUp")).toEqual({ type: "scrollPreview", direction: -1 });
  expect(actionForKey("ArrowDown")).toEqual({ type: "scrollPreview", direction: 1 });
  expect(actionForKey("ArrowLeft")).toEqual({ type: "cycleTab", direction: -1 });
  expect(actionForKey("ArrowRight")).toEqual({ type: "cycleTab", direction: 1 });
});

test("Enter starts an approval, and holding it down does not repeat", () => {
  expect(actionForKey("Enter")).toEqual({ type: "approve" });
  expect(actionForKey("Enter", true)).toBeNull();
});

test("keys that should repeat still do", () => {
  expect(actionForKey("s", true)).toEqual({ type: "move", delta: 1 });
  expect(actionForKey("ArrowDown", true)).toEqual({ type: "scrollPreview", direction: 1 });
});

test("nothing approves in a single key any more", () => {
  const approvers = KEYMAP.filter((b) => b.action.type === "approve");
  expect(approvers).toHaveLength(1);
  expect(approvers[0]?.keys).toEqual(["Enter"]);
  // `a` used to approve and Shift+A opened the picker; neither does now.
  expect(actionForKey("a")?.type).not.toBe("approve");
  expect(actionForKey("A")).toBeNull();
});

test("s moved from settings to navigation; settings is on the comma", () => {
  expect(actionForKey("s")?.type).toBe("move");
  expect(actionForKey(",")).toEqual({ type: "settings" });
});

test("no key is bound twice", () => {
  const all = KEYMAP.flatMap((b) => b.keys);
  expect(new Set(all).size).toBe(all.length);
});

test("every binding can be shown in the shortcuts dialog", () => {
  for (const binding of KEYMAP) {
    expect(binding.display.length).toBeGreaterThan(0);
    expect(binding.description.length).toBeGreaterThan(0);
  }
});

test("unbound keys mean nothing", () => {
  expect(actionForKey("x")).toBeNull();
  expect(actionForKey(" ")).toBeNull();
});

test("Shift+H hides; plain h is left free; holding it hides only one", () => {
  expect(actionForKey("H")).toEqual({ type: "toggleHidden" });
  expect(actionForKey("h")).toBeNull();
  expect(actionForKey("H", true)).toBeNull();
});

test("3 opens the Hidden tab", () => {
  expect(actionForKey("3")).toEqual({ type: "switchList", tab: "hidden" });
});
