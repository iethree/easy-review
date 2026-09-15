/**
 * Signing in to GitHub — which easy-review does only through the GitHub CLI.
 *
 * It supplies the API router's `TokenSource`.
 *
 * The token is the one `gh auth token` holds for your login. gh would hand
 * back GH_TOKEN or GITHUB_TOKEN instead if either were set, so it runs with
 * those removed: a token in the environment or in a `.env` file is ignored,
 * never used.
 *
 * There is deliberately no SSH option: SSH keys authenticate git's transport,
 * not api.github.com, so they cannot be used here.
 */

import { childEnv, GITHUB_TOKEN_VARS } from "../local/env.ts";

/** `gh auth token` spawns a process, so don't do it on every request. */
const TTL_MS = 5 * 60 * 1000;

export type SignInState = "signed-in" | "signed-out" | "no-cli";

let cached: { token: string | undefined; state: SignInState; expires: number } | null = null;

async function readGhToken(): Promise<{ token: string | undefined; state: SignInState }> {
  if (!Bun.which("gh")) return { token: undefined, state: "no-cli" };
  try {
    const proc = Bun.spawn(["gh", "auth", "token"], {
      stdout: "pipe",
      stderr: "pipe",
      env: childEnv(),
    });
    const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    const token = code === 0 ? out.trim() || undefined : undefined;
    return { token, state: token ? "signed-in" : "signed-out" };
  } catch {
    return { token: undefined, state: "no-cli" };
  }
}

export async function resolveLocalToken(): Promise<{ token: string | undefined; state: SignInState }> {
  if (cached && cached.expires > Date.now()) return cached;

  const result = await readGhToken();
  cached = {
    ...result,
    // Don't cache a miss for long — you may be running `gh auth login` now.
    expires: Date.now() + (result.token ? TTL_MS : 5_000),
  };
  return cached;
}

export function describeSignIn(state: SignInState): string {
  switch (state) {
    case "signed-in":
      return "signed in with the GitHub CLI";
    case "signed-out":
      return "not signed in — run `gh auth login`";
    case "no-cli":
      return "the GitHub CLI isn't installed — get it from https://cli.github.com, then run `gh auth login`";
  }
}

/** Token variables set in this environment, which easy-review ignores. */
export function ignoredTokenVars(env: Record<string, string | undefined> = process.env): string[] {
  return GITHUB_TOKEN_VARS.filter((name) => env[name]?.trim());
}
