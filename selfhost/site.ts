// Fork-owned helpers for running on one self-chosen origin.

/** Public origin of this deployment, without a trailing slash. */
export const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
).replace(/\/+$/, "");

/**
 * Upstream addresses its tools as subdomains (https://tx.eth.sh/x). On a single
 * origin the same page lives under a path (/tx/x). Other URLs pass unchanged.
 */
export function localPath(upstreamUrl: string): string {
  let url: URL;
  try {
    url = new URL(upstreamUrl);
  } catch {
    return upstreamUrl;
  }
  const match = /^(?:(.+)\.)?eth\.sh$/.exec(url.hostname);
  if (!match) return upstreamUrl;
  const tool = match[1] && match[1] !== "www" ? `/${match[1]}` : "";
  const path = `${tool}${url.pathname}`.replace(/\/+$/, "");
  return `${path || "/"}${url.search}${url.hash}`;
}
