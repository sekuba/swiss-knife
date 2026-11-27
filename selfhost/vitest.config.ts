// One config for every upstream spec that survives pruning (upstream keeps a
// separate config per suite under vitest/, all with these same settings).
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

// Upstream tests that assert behavior this fork removed on purpose.
const invalidatedByFork = [
  // components/ContractStart.tsx no longer links to the removed tools.
  "shows directory and verification links only on the standalone explorer start screen",
];
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export default defineConfig({
  root,
  resolve: { alias: { "@": root } },
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    include: ["**/*.spec.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**"],
    testNamePattern: new RegExp(
      `^(?!.*(?:${invalidatedByFork.map(escape).join("|")})).*$`
    ),
    maxWorkers: 1,
    testTimeout: 15000,
  },
});
