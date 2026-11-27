/**
 * Self-hosted build: one origin, three tools (/tx, /explorer, /calldata/decoder).
 * This file is owned by the fork (see selfhost/README.md); it does not carry
 * upstream's subdomain rewrites or redirects.
 *
 * The Content-Security-Policy for pages is set per request in proxy.ts, because
 * it carries a nonce. Everything static lives here.
 *
 * @type {import('next').NextConfig}
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  // Ignored by browsers over plain HTTP, so harmless on localhost.
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  // allow-popups: wallet connectors (e.g. Coinbase) talk to a popup they open.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), browsing-topics=()",
  },
  // A mirror should not compete with (or be mistaken for) the upstream site.
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  poweredByHeader: false,
  // No server-side image optimizer: it would fetch and resize on demand.
  // proxy.ts additionally refuses /_next/image.
  images: { unoptimized: true },
  turbopack: {},
  headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // JSON only: nothing here may load or be framed by anything.
        source: "/api/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "default-src 'none'; frame-ancestors 'none'",
          },
        ],
      },
    ];
  },
  webpack: (config) => {
    config.resolve.fallback = { fs: false, net: false, tls: false };
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    return config;
  },
};

module.exports = nextConfig;
