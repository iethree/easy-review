/**
 * Images that GitHub hosts for pull requests and comments. Those on a private
 * repository only load for someone signed in to github.com, which this app's
 * page isn't: the browser gets a 404. So they go through the server, which
 * asks with your token (see /api/image).
 */

/** Where an attachment lives: the server sends your token only to these. */
export const TOKEN_HOSTS = new Set(["github.com", "raw.githubusercontent.com"]);

const REPO_FILE = /^\/[\w.-]+\/[\w.-]+\/(?:assets|raw|blob|files)\//;

/** Whether a URL is an image GitHub keeps for you: an attachment, or a file in a repository. */
export function isGitHubImage(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  if (host === "github.com") return url.pathname.startsWith("/user-attachments/assets/") || REPO_FILE.test(url.pathname);
  return (
    host === "raw.githubusercontent.com" ||
    host === "user-images.githubusercontent.com" ||
    host === "private-user-images.githubusercontent.com"
  );
}

/** The address to show an image at: through the server when GitHub keeps it, else as it is. */
export function imageSource(src: string): string {
  return isGitHubImage(src) ? `/api/image?${new URLSearchParams({ url: src })}` : src;
}
