// Stand-in for the wallet SDKs this build does not ship (see REMOVED_WALLET_SDKS
// in next.config.js). RainbowKit and wagmi still reference them from connectors
// that are never instantiated here, so the bundler needs something to resolve.
module.exports = {};
