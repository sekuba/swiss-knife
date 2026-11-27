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
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), browsing-topics=()",
  },
  // A mirror should not compete with (or be mistaken for) the upstream site.
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

// Wallet SDKs dropped from the install (packages.overrides in
// selfhost/keep.json). Only browser-extension wallets, WalletConnect and the
// impersonator are offered; see the wallet list in app/providers.tsx.
const REMOVED_WALLET_SDKS = [
  "porto",
  "porto/internal",
  "@metamask/sdk",
  "@coinbase/wallet-sdk",
  "cbw-sdk",
  "@base-org/account",
  "@gemini-wallet/core",
  "@safe-global/safe-apps-sdk",
  "@safe-global/safe-apps-provider",
];
const walletSdkStub = "./selfhost/removed-wallet-sdk.js";

const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  poweredByHeader: false,
  // No server-side image optimizer: it would fetch and resize on demand.
  // proxy.ts additionally refuses /_next/image.
  images: { unoptimized: true },
  turbopack: {
    resolveAlias: Object.fromEntries(
      REMOVED_WALLET_SDKS.map((name) => [name, walletSdkStub])
    ),
  },
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
    for (const name of REMOVED_WALLET_SDKS)
      config.resolve.alias[`${name}$`] = require.resolve(walletSdkStub);
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    return config;
  },
};

module.exports = nextConfig;
