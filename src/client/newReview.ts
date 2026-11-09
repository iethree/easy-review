/**
 * Reading what you type or paste into New review's repository box:
 * `owner/name`, `owner/name#123`, or a GitHub link — to a repository, a pull
 * request, a comparison or a branch — which fills in the rest as well.
 */

export type ParsedTarget = { owner: string; name: string } & (
  | { kind?: undefined }
  | { kind: "pr"; number: number }
  | { kind: "diff"; base: string; head: string }
  | { kind: "repo"; head: string }
);

const PART = /^[\w.-]+$/;

export function parseTarget(input: string): ParsedTarget | null {
  const text = input.trim();
  if (!text) return null;

  const short = /^([\w.-]+)\/([\w.-]+?)(?:#(\d+))?$/.exec(text);
  if (short?.[1] && short[2]) {
    const repo = { owner: short[1], name: short[2] };
    return short[3] ? { ...repo, kind: "pr", number: Number(short[3]) } : repo;
  }

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.hostname.toLowerCase() !== "github.com" && url.hostname.toLowerCase() !== "www.github.com") return null;

  const [owner, rawName, section, ...rest] = url.pathname.split("/").filter(Boolean);
  const name = rawName?.replace(/\.git$/, "");
  if (!owner || !name || !PART.test(owner) || !PART.test(name)) return null;
  const repo = { owner, name };
  const tail = decodeURIComponent(rest.join("/"));

  if (section === "pull" && /^\d+$/.test(rest[0] ?? "")) return { ...repo, kind: "pr", number: Number(rest[0]) };
  if (section === "compare" && tail) {
    // GitHub's three dots, or two; with no base, the default branch is implied, which we can't know here.
    const [base, head] = tail.includes("...") ? tail.split("...") : tail.split("..");
    if (base && head) return { ...repo, kind: "diff", base, head };
    return repo;
  }
  if (section === "tree" && tail) return { ...repo, kind: "repo", head: tail };
  return repo;
}
