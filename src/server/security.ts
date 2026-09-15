/**
 * Request checks that keep other websites from driving this API.
 *
 * A page on any site can make your browser send a request to localhost, and a
 * "simple" POST (text/plain body, no custom headers) is sent without a CORS
 * preflight — so without these checks, visiting the wrong page could approve
 * pull requests with your GitHub token or start Claude sessions on your
 * machine. Browsers always label cross-site requests, so refusing anything
 * labelled cross-site closes that. Tools like curl send neither header and
 * are unaffected.
 */

export function isCrossSite(request: Request): boolean {
  // Sent by every modern browser; "none" means the user typed the URL.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return true;

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return true;

  return false;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * DNS rebinding: evil.example can be made to resolve to 127.0.0.1, after
 * which its pages are "same-origin" with themselves while talking to this
 * server. The Host header still says evil.example, so a local-only server
 * should refuse any Host that isn't a loopback name.
 */
export function isLoopbackHost(request: Request): boolean {
  const host = request.headers.get("host");
  if (!host) return false;
  // Strip the port, keeping bracketed IPv6 literals intact.
  const name = host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
  return name !== undefined && LOCAL_HOSTS.has(name.toLowerCase());
}

export function forbidden(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 403,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
