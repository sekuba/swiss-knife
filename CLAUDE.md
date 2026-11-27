# Guidance for this repo

This is a reduced, self-hosted fork of ETH.sh (swiss-knife-xyz/swiss-knife).
Read [README.md](README.md) first; it explains the fork's structure.

## Rules

- Keep the diff against upstream small. Upstream moves fast and every changed
  upstream file is a future merge conflict. Prefer, in this order: deleting
  (via `selfhost/keep.json`), a new fork-owned file, a few-line patch.
- Do not add tools, pages or API routes back without being asked. The kept
  surface is `/tx`, `/explorer`, `/calldata/decoder` and three API routes.
- Removing a package that is installed but never loaded: add
  `"<parent>><package>": "-"` to `packages.overrides`. If a bundled file still
  references it, the build fails loudly; alias it to
  `selfhost/removed-wallet-sdk.js` in `next.config.js` or put it back. Always
  re-test wallet connection in a browser after touching the WalletConnect tree.
- Never edit `package.json` or `pnpm-lock.yaml` by hand. Change
  `selfhost/keep.json` (`packages.*`, `scripts`), then run
  `node selfhost/prune.mjs` and
  `corepack pnpm install --lockfile-only --no-frozen-lockfile --ignore-scripts`.
- A new fork-owned file that replaces an upstream file must be listed under
  `owned` in `selfhost/keep.json`.
- Anything that loads in the browser from another origin, or any new
  server-side fetch, needs a matching change in `proxy.ts` (CSP) and a line in
  the README's "What is different" section. Default answer: do not add it.
- `NEXT_PUBLIC_*` values are public. Secrets are server-only and must be listed
  explicitly in `selfhost/compose.yaml` to reach the container.

## Checks

```sh
node selfhost/prune.mjs --check
corepack pnpm typecheck && corepack pnpm test
```

Upstream sync and deployment go through `selfhost/update.sh`; do not push or
deploy by other means unless asked.

## UI changes

Upstream's design rules still apply to the kept components: Chakra UI, solid
colors from the theme tokens (no gradients), existing components (`InputField`,
`DarkButton`, `DarkSelect`, `TabsSelector`) before new ones.
