import { expect, test } from "bun:test";
import { applyEvent, buildArgs, buildPrompt, describeToolUse, EMPTY_STREAM } from "./claude.ts";
import { childEnv } from "./env.ts";

const CWD = "/wt";

test("every run is sandboxed, whatever the settings say", () => {
  const args = buildArgs("review it", { model: "", effort: "" });
  expect(args).toContain("--restricted");
  expect(args).toContain("--strict-mcp-config");
  expect(args[args.indexOf("--tools") + 1]).toBe("Read,Grep,Glob");
  expect(args[args.indexOf("--permission-mode") + 1]).toBe("dontAsk");
  expect(args[args.indexOf("--output-format") + 1]).toBe("stream-json");
  expect(args).not.toContain("--model");
  expect(args).not.toContain("--effort");
});

test("model and effort are passed only when set", () => {
  const args = buildArgs("x", { model: "sonnet", effort: "high" });
  expect(args[args.indexOf("--model") + 1]).toBe("sonnet");
  expect(args[args.indexOf("--effort") + 1]).toBe("high");
});

test("the prompt carries the PR and the reviewer's own instructions", () => {
  const prompt = buildPrompt(
    { owner: "metabase", name: "metabase", number: 42, title: "Fix it" },
    "  Only look at SQL.  ",
  );
  expect(prompt).toContain("#42 in metabase/metabase");
  expect(prompt).toContain('"Fix it"');
  expect(prompt).toContain("Only look at SQL.");
});

test("tool calls read like a log", () => {
  expect(describeToolUse("Read", { file_path: "/wt/src/app.ts" }, CWD)).toBe("Read src/app.ts");
  expect(describeToolUse("Read", { file_path: "/wt/.easy-review/pr.diff" }, CWD)).toBe("Read the diff");
  expect(describeToolUse("Grep", { pattern: "useEffect", path: "/wt/src" }, CWD)).toBe(
    "Searched for “useEffect” in src",
  );
  expect(describeToolUse("Glob", { pattern: "**/*.test.ts" }, CWD)).toBe("Listed **/*.test.ts");
});

// Shapes captured from a real `claude -p --output-format stream-json --verbose` run.
const EVENTS = [
  { type: "system", subtype: "init", session_id: "sess-1", model: "claude-opus-5", tools: ["Read"] },
  { type: "rate_limit_event" },
  {
    type: "assistant",
    message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "/wt/.easy-review/pr.diff" } }] },
  },
  { type: "user", message: { content: [{ type: "tool_result", content: "diff --git …" }] } },
  { type: "assistant", message: { content: [{ type: "text", text: "## Summary" }] } },
  {
    type: "result",
    subtype: "success",
    is_error: false,
    result: "## Summary\nLooks good.",
    num_turns: 2,
    duration_ms: 4439,
    total_cost_usd: 0.0245,
    session_id: "sess-1",
  },
];

test("a run folds into session, activity and result", () => {
  const state = EVENTS.reduce((s, e) => applyEvent(s, e, CWD), EMPTY_STREAM);
  expect(state.sessionId).toBe("sess-1");
  expect(state.model).toBe("claude-opus-5");
  expect(state.activity).toEqual(["Read the diff"]);
  expect(state.result).toEqual({
    ok: true,
    text: "## Summary\nLooks good.",
    costUsd: 0.0245,
    turns: 2,
    durationMs: 4439,
  });
});

test("an error result is not mistaken for a review", () => {
  const state = applyEvent(
    EMPTY_STREAM,
    { type: "result", subtype: "error_during_execution", is_error: true, result: "" },
    CWD,
  );
  expect(state.result?.ok).toBe(false);
});

test("junk events are ignored", () => {
  expect(applyEvent(EMPTY_STREAM, null, CWD)).toBe(EMPTY_STREAM);
  expect(applyEvent(EMPTY_STREAM, { type: "mystery" }, CWD)).toBe(EMPTY_STREAM);
});

test("a spawned review forgets which Claude session launched the server", () => {
  const env = childEnv({
    PATH: "/usr/bin",
    HOME: "/Users/me",
    SSH_AUTH_SOCK: "/tmp/agent",
    CLAUDECODE: "1",
    CLAUDE_CODE_SESSION_ID: "parent",
    CLAUDE_CODE_MESSAGING_SOCKET: "/tmp/sock",
    CLAUDE_CODE_MESSAGING_TOKEN: "secret",
    CLAUDE_CODE_ENTRYPOINT: "sdk",
    CLAUDE_AGENT_SDK_VERSION: "1",
    ANTHROPIC_BASE_URL: "http://127.0.0.1:9999",
    CLAUDE_CODE_USE_BEDROCK: "1",
    ANTHROPIC_API_KEY: "sk-mine",
  });
  expect(env.PATH).toBe("/usr/bin");
  expect(env.SSH_AUTH_SOCK).toBe("/tmp/agent");
  expect(env.CLAUDECODE).toBeUndefined();
  expect(env.CLAUDE_CODE_SESSION_ID).toBeUndefined();
  expect(env.CLAUDE_CODE_MESSAGING_TOKEN).toBeUndefined();
  expect(env.CLAUDE_AGENT_SDK_VERSION).toBeUndefined();
  expect(env.ANTHROPIC_BASE_URL).toBeUndefined();
  // Your own configuration survives.
  expect(env.CLAUDE_CODE_USE_BEDROCK).toBe("1");
  expect(env.ANTHROPIC_API_KEY).toBe("sk-mine");
  expect(env.GIT_TERMINAL_PROMPT).toBe("0");
});

/**
 * gh — and git, through `gh auth git-credential` — uses these in place of your
 * login whenever they're set. Stripping them is what makes the CLI login the
 * only way in.
 */
test("no spawned process sees a GitHub token variable, so gh can only use your login", () => {
  const env = childEnv({
    PATH: "/usr/bin",
    GH_HOST: "github.com",
    GH_TOKEN: "ghp_from_env",
    GITHUB_TOKEN: "ghp_from_dotenv",
    GH_ENTERPRISE_TOKEN: "ghe_one",
    GITHUB_ENTERPRISE_TOKEN: "ghe_two",
  });
  for (const name of ["GH_TOKEN", "GITHUB_TOKEN", "GH_ENTERPRISE_TOKEN", "GITHUB_ENTERPRISE_TOKEN"]) {
    expect(env[name]).toBeUndefined();
  }
  // Everything else about how gh is set up is left alone.
  expect(env.GH_HOST).toBe("github.com");
  expect(env.PATH).toBe("/usr/bin");
});

test("outside a Claude session, a base URL you set is yours and is kept", () => {
  expect(childEnv({ ANTHROPIC_BASE_URL: "https://gateway.example" }).ANTHROPIC_BASE_URL).toBe(
    "https://gateway.example",
  );
});

test("several events for one turn don't inflate anything", () => {
  // Parallel tool calls in a single turn arrive as separate events.
  const oneTurn = [
    { type: "assistant", message: { id: "m1", content: [{ type: "tool_use", name: "Read", input: { file_path: "/wt/a.ts" } }] } },
    { type: "assistant", message: { id: "m1", content: [{ type: "tool_use", name: "Read", input: { file_path: "/wt/b.ts" } }] } },
    { type: "assistant", message: { id: "m1", content: [{ type: "text", text: "thinking" }] } },
  ];
  const state = oneTurn.reduce((s, e) => applyEvent(s, e, CWD), EMPTY_STREAM);
  expect(state.activity).toEqual(["Read a.ts", "Read b.ts"]);
  expect("turns" in state).toBe(false);
});

test("every reviewer, whatever its instructions, is asked for findings the UI can use", () => {
  const args = buildArgs("x", { model: "", effort: "" });
  const system = args[args.indexOf("--append-system-prompt") + 1] ?? "";
  expect(system).toContain("easy-review-findings");
  expect(system).toContain('"severity"');
});
