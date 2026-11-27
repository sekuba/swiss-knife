# eth.sh, self-hosted and reduced

A fork of [ETH.sh / Swiss-Knife](https://github.com/swiss-knife-xyz/swiss-knife)
that keeps three tools and removes everything else:

| Tool | Path | Upstream |
| --- | --- | --- |
| Contract explorer | `/explorer` | explorer.eth.sh |
| Calldata decoder | `/calldata/decoder` | calldata.eth.sh/decoder |
| Transact (send calldata / deploy) | `/tx` | tx.eth.sh |

It runs on a single origin of your choice, as one hardened container behind a
reverse proxy. All chains upstream supports still work; chain support lives in
the kept code and costs nothing extra.

Wallets: browser extensions (anything announced through EIP-6963 or
`window.ethereum`, e.g. Ambire), WalletConnect, and the read-only impersonator.

For agents: `/tx/skill.md` is the Transact skill with every URL pointing at
your deployment, so an agent can hand you prefilled `/tx?to=…&calldata=…` links.

Not affiliated with eth.sh. All credit for the tools goes to the Swiss-Knife
contributors (MIT, see [LICENSE.md](LICENSE.md)).

## What is different from upstream

**Removed.** Every other tool, page and API route (60 of 63 routes), the
homepage, analytics, sitemap and Open Graph image generation, and every
dependency the three tools do not import. The MetaMask, Coinbase, Base, Gemini,
Safe and Porto wallet SDKs are dropped from the install as well (wagmi hard-
depends on them; `packages.overrides` removes them and `next.config.js` stubs
the imports). Together that is well over half of upstream's lockfile. What is
left is computed, not hand-picked: `selfhost/prune.mjs` follows imports from the
entry points listed in `selfhost/keep.json` and deletes the rest.

**Hardened.**

- No third-party scripts. Google Analytics is gone, and the Monaco editor is
  served from this origin instead of a CDN.
- A nonce-based Content-Security-Policy on every page (`proxy.ts`): scripts run
  only if this server issued them. Plus the usual headers, `frame-ancestors
  'none'`, and `noindex` so a mirror is never mistaken for the original.
- The server only answers `GET` and `HEAD`.
- The three remaining API routes are same-origin only and rate limited per
  client, so nobody else can spend the Etherscan quota.
- Pages do no server-side work on behalf of a URL (upstream fetches ABIs and
  transactions on the server to build page titles).
- No image optimizer endpoint.
- Next.js and a few server-side dependencies are pinned to patched releases
  ahead of upstream (`packages.pin` / `packages.overrides` in `keep.json`).
- The container is distroless, non-root, read-only, has no capabilities, and
  receives exactly one secret (`ETHERSCAN_API_KEY`). Dependencies are installed
  with `--ignore-scripts`.

**What the server still does.** Three routes call out, with fixed hosts and
validated `chainId` / `address` input:

- `/api/source-code`: verified source and ABI from Etherscan and Sourcify.
- `/api/labels/<address>`: address labels (eth-labels, Sourcify, Etherscan, and
  one RPC read to resolve a proxy).
- `/api/clearsigning/descriptor`: ERC-7730 descriptors from the
  `ethereum/clear-signing-erc7730-registry` repository on GitHub.

**What the browser still contacts.** RPC endpoints for the selected chain,
WalletConnect / Reown (relay, plus a telemetry ping from their SDK on load),
Sourcify and 4byte signature lookups, and ENS avatar hosts. Everything else is
same-origin.

**Links stay on your origin.** Navigation, share links, the agent skill and
canonical URLs all use `NEXT_PUBLIC_SITE_URL` and paths (`/tx`, not
`tx.eth.sh`). Link-preview images are the one exception: the meta tags still
name upstream's generated images, since this build has no image generator.

## Deploy

Requirements: Docker with Compose, git, Node >= 20 with corepack, and a reverse
proxy that terminates TLS.

```sh
cp selfhost/env.example .env      # then edit; .env is git-ignored
selfhost/update.sh --rebuild      # build, start, smoke-test
```

The container listens on `127.0.0.1:3947` only. Point your reverse proxy at it;
`selfhost/Caddyfile.example` is a complete Caddy site block. The proxy must set
`X-Forwarded-For` itself (Caddy does), and the port must not be reachable from
outside: the rate limiter trusts that header.

`NEXT_PUBLIC_*` values are compiled into the browser bundle and are public. Do
not put an RPC URL with a key in them. Rerun `selfhost/update.sh --rebuild`
after changing `.env`.

## Stay up to date

```sh
selfhost/update.sh
```

This fetches upstream, shows what changed in the files this build keeps, merges,
re-prunes and re-resolves the lockfile. It then builds the image (the fast unit
tests and the typecheck run inside the build), starts the new image on a spare
port and smoke-tests it, commits the merge, and only then replaces the running
container. It never pushes. If nothing changed upstream it only rebuilds and
redeploys.

The fork is built so that merges stay cheap:

- **Removed files** stay removed automatically, whatever upstream does to them.
- **Derived files** (`package.json`, `pnpm-lock.yaml`) are regenerated from
  upstream's copy on every update.
- **Owned files** (listed under `owned` in `keep.json`) always keep this fork's
  version; the script tells you when upstream touched one. The same goes for
  `watch` entries: upstream files the fork removed but re-implements (the
  agent skill text).
- **Patched files** are ordinary upstream files with a small local change.
  These are the only ones that can conflict. See them with
  `git diff upstream/master --stat --diff-filter=M`.

When a merge does conflict, resolve it, `git add`, and run
`selfhost/update.sh --continue`.

Run `selfhost/update.sh --rebuild` now and then even without upstream changes:
it pulls patched base images. `pnpm audit --prod` output is printed on every
update; what remains is almost entirely inside WalletConnect's dependency
tree. To force a fixed version, add it to `packages.pin` (direct
dependency) or `packages.overrides` (transitive) in `selfhost/keep.json` and
run the update again.

## Layout

```
selfhost/keep.json        entry points, kept assets, owned files, dependency pins
selfhost/prune.mjs        deletes what the entry points do not import
selfhost/update.sh        merge upstream, verify, deploy
selfhost/Dockerfile       verify / build / distroless runtime stages
selfhost/compose.yaml     the hardened container
selfhost/site.ts          this deployment's origin; upstream URL -> local path
app/tx/skill.md/route.ts  the Transact agent skill, served for this origin
proxy.ts                  CSP, method allowlist, same-origin API, rate limits
next.config.js            static security headers, standalone output
instrumentation-client.ts points Monaco at the self-hosted copy
```

## Local development

```sh
corepack pnpm install --ignore-scripts
NEXT_PUBLIC_DEVELOPMENT=true corepack pnpm dev    # http://localhost:3000
corepack pnpm typecheck
corepack pnpm test:unit    # logic tests, seconds; these gate every image build
corepack pnpm test:ui      # upstream's jsdom specs for the kept tools, ~10 min
```

`test:ui` is upstream's suite and is not fully green upstream either (a group
of decoder network-panel specs fails on an untouched checkout), so it informs
but does not gate. Tests that assert behavior this fork removed are listed in
`selfhost/vitest.config.ts`.
