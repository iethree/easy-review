/**
 * The window loads easy-review://app/, and the main process forwards each
 * request to the server running on a loopback port.
 *
 * Why not load http://127.0.0.1:<port> directly? Settings, drafts and hidden
 * pull requests live in localStorage, which belongs to an origin — and the
 * port, part of that origin, is picked fresh at every launch. A scheme of our
 * own keeps one origin forever.
 *
 * The server refuses requests labelled cross-site (see src/server/security.ts),
 * and to it a page on easy-review://app is a different site. Only this app's
 * window can reach the scheme, so the proxy checks the origin itself and then
 * drops those labels before forwarding.
 */

export const SCHEME = "easy-review";
export const APP_ORIGIN = `${SCHEME}://app`;

/** Request headers that describe the page's origin, or the hop, not the request. */
const DROP_REQUEST = new Set(["host", "origin", "referer", "connection", "content-length"]);

/**
 * Node's fetch has already decoded the body, so its encoding and length no
 * longer describe what we hand Chromium.
 */
const DROP_RESPONSE = new Set(["content-encoding", "content-length", "transfer-encoding", "connection"]);

export function isOwnOrigin(headers: Headers): boolean {
  const origin = headers.get("origin");
  return origin === null || origin === APP_ORIGIN;
}

export function forwardRequestHeaders(headers: Headers): Headers {
  const out = new Headers();
  headers.forEach((value, key) => {
    if (DROP_REQUEST.has(key) || key.startsWith("sec-fetch-")) return;
    out.set(key, value);
  });
  return out;
}

export function forwardResponseHeaders(headers: Headers): Headers {
  const out = new Headers();
  headers.forEach((value, key) => {
    if (!DROP_RESPONSE.has(key)) out.append(key, value);
  });
  return out;
}

/** easy-review://app/api/x?y=1 → http://127.0.0.1:<port>/api/x?y=1 */
export function targetUrl(requestUrl: string, serverOrigin: string): string {
  const url = new URL(requestUrl);
  return `${serverOrigin}${url.pathname}${url.search}`;
}

export async function forward(request: Request, serverOrigin: string): Promise<Response> {
  if (!isOwnOrigin(request.headers)) {
    return new Response(JSON.stringify({ error: "Cross-site requests are not allowed" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const response = await fetch(targetUrl(request.url, serverOrigin), {
    method: request.method,
    headers: forwardRequestHeaders(request.headers),
    body: hasBody ? await request.arrayBuffer() : undefined,
    redirect: "manual",
  });
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: forwardResponseHeaders(response.headers),
  });
}
