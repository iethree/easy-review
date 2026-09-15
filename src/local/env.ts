/**
 * The environment for processes we spawn (gh, git, claude).
 *
 * If the dev server itself was started from inside a Claude Code session, it
 * inherits that session's identity: CLAUDECODE, its session id, a messaging
 * socket and token, and the host's ANTHROPIC_BASE_URL. A review launched with
 * those would believe it was a child of that other session. So we drop the
 * variables that describe a *parent session*, and keep the ones that are the
 * user's own configuration (Bedrock/Vertex, long-lived tokens and the like).
 *
 * GitHub token variables go too. easy-review signs in only with the GitHub
 * CLI, but gh — and the `gh auth git-credential` helper that git uses for
 * clones — returns GH_TOKEN or GITHUB_TOKEN in preference to your login
 * whenever one is set, and Bun loads a `.env` file into the environment by
 * itself. Left in, any of them would quietly swap a personal access token in
 * for the CLI login.
 */

export const GITHUB_TOKEN_VARS = [
  "GH_TOKEN",
  "GITHUB_TOKEN",
  "GH_ENTERPRISE_TOKEN",
  "GITHUB_ENTERPRISE_TOKEN",
] as const;

const TOKEN_VAR = new Set<string>(GITHUB_TOKEN_VARS);

const SESSION_VAR = /^(CLAUDECODE|CLAUDE_PID|CLAUDE_EFFORT)$|^CLAUDE_(CODE|AGENT_SDK|PREVIEW)_/;

/** User configuration that happens to share the CLAUDE_CODE_ prefix. */
const USER_CONFIG = new Set([
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
  "CLAUDE_CODE_SKIP_BEDROCK_AUTH",
  "CLAUDE_CODE_SKIP_VERTEX_AUTH",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "CLAUDE_CODE_API_KEY_HELPER_TTL_MS",
  "CLAUDE_CODE_MAX_OUTPUT_TOKENS",
  "CLAUDE_CODE_CLIENT_CERT",
  "CLAUDE_CODE_CLIENT_KEY",
]);

export function childEnv(base: Record<string, string | undefined> = process.env): Record<string, string> {
  // Only when we were launched from inside a session is the base URL the
  // host's; otherwise it's a proxy or gateway the user set up on purpose.
  const insideSession = base.CLAUDECODE !== undefined;
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(base)) {
    if (value === undefined) continue;
    if (TOKEN_VAR.has(key)) continue;
    if (SESSION_VAR.test(key) && !USER_CONFIG.has(key)) continue;
    if (insideSession && key === "ANTHROPIC_BASE_URL") continue;
    env[key] = value;
  }

  // Never let git sit waiting for a password nobody can type.
  env.GIT_TERMINAL_PROMPT = "0";
  return env;
}
