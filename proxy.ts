// Request guard for the self-hosted build. Owned by the fork (selfhost/README.md).
//
// Runs in front of every page and API request and does four things:
//   1. only GET/HEAD get through (the kept tools never POST to this server);
//   2. /api/* is same-origin only, so other sites cannot spend our API quota;
//   3. a per-client rate limit, held in memory (single instance by design);
//   4. a nonce-based Content-Security-Policy on every page.
import { NextResponse, type NextRequest } from "next/server";

// ---- rate limiting ---------------------------------------------------------
// Token buckets: `burst` requests at once, refilled at `perSecond`.
const LIMITS = {
  // Each call fans out to Etherscan / Sourcify / an RPC with our credentials.
  // A decoded batch can legitimately ask for a few dozen address labels at once.
  api: { burst: 120, perSecond: 2 },
  page: { burst: 120, perSecond: 4 },
} as const;
const MAX_CLIENTS = 20_000;

type Bucket = { tokens: number; at: number };
const buckets = new Map<string, Bucket>();

function take(key: string, limit: { burst: number; perSecond: number }) {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    // Bounded memory: drop the oldest entries rather than grow without limit.
    if (buckets.size >= MAX_CLIENTS) {
      let drop = MAX_CLIENTS / 10;
      for (const stale of buckets.keys()) {
        buckets.delete(stale);
        if (--drop <= 0) break;
      }
    }
    bucket = { tokens: limit.burst, at: now };
  } else {
    bucket.tokens = Math.min(
      limit.burst,
      bucket.tokens + ((now - bucket.at) / 1000) * limit.perSecond
    );
    bucket.at = now;
    buckets.delete(key); // re-insert: Map order doubles as recency order
  }
  buckets.set(key, bucket);
  if (bucket.tokens < 1)
    return Math.ceil((1 - bucket.tokens) / limit.perSecond); // retry-after, s
  bucket.tokens -= 1;
  return 0;
}

// The app must sit behind a reverse proxy that sets X-Forwarded-For itself
// (Caddy does by default) and must not be reachable directly. The last entry
// is the one that proxy appended, so a client cannot forge it.
function clientKey(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",").pop()?.trim() || "direct";
  // One IPv6 customer usually holds a whole /64.
  return ip.includes(":") ? ip.split(":").slice(0, 4).join(":") : ip;
}

// ---- content security policy -----------------------------------------------
function contentSecurityPolicy(nonce: string) {
  return [
    "default-src 'self'",
    // No third-party script hosts, no inline script without the nonce.
    // wasm-unsafe-eval: the explorer's bytecode analysis (evmole) is WebAssembly.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'`,
    // Chakra UI / Emotion inject <style> tags at runtime.
    "style-src 'self' 'unsafe-inline'",
    // Token icons, ENS avatars and NFT images come from arbitrary hosts.
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    // Browsers talk to RPC endpoints, wallets and public registries directly;
    // user-added RPCs and local forks make this list open-ended by nature.
    "connect-src 'self' https: wss: http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*",
    "worker-src 'self' blob:",
    // WalletConnect's domain-verification iframe.
    "frame-src https://verify.walletconnect.org https://verify.walletconnect.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

const text = (body: string, status: number, headers?: Record<string, string>) =>
  new NextResponse(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });

export function proxy(request: NextRequest) {
  if (request.method !== "GET" && request.method !== "HEAD")
    return text("Method not allowed", 405, { Allow: "GET, HEAD" });

  const { pathname } = request.nextUrl;
  if (pathname === "/_next/image") return text("Not found", 404);

  const isApi = pathname.startsWith("/api/");
  if (isApi) {
    // Sent by every current browser; absent for curl and server-side callers,
    // which the rate limit below still covers.
    const site = request.headers.get("sec-fetch-site");
    if (site && site !== "same-origin" && site !== "none")
      return text("Cross-origin API access is not allowed", 403);
  }

  const retryAfter = take(
    `${isApi ? "api" : "page"}:${clientKey(request)}`,
    isApi ? LIMITS.api : LIMITS.page
  );
  if (retryAfter)
    return text("Too many requests", 429, { "Retry-After": String(retryAfter) });

  if (isApi) return NextResponse.next();

  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
  const csp = contentSecurityPolicy(nonce);
  // Next.js reads the nonce from the request's CSP header and stamps it on
  // every script it emits. Pages are rendered per request for this reason
  // (`dynamic = "force-dynamic"` in app/layout.tsx).
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Everything except immutable build assets and files served from public/.
  matcher: [
    "/((?!_next/static/|monaco/|chainIcons/|tokenIcons/|explorerIcons/|external/|decoder-examples/|favicon\\.|logo\\.|apple-touch-icon\\.png$|icon\\.png$|robots\\.txt$).*)",
  ],
};
