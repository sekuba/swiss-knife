#!/usr/bin/env node
// Copies the Monaco editor build into public/monaco so it is served from our
// own origin (see instrumentation-client.ts). Runs before every `next build`.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const monacoDir = path.dirname(require.resolve("monaco-editor/package.json"));
const { version } = require("monaco-editor/package.json");

// The React wrapper is written against one specific Monaco release; it is the
// one its loader would otherwise fetch from the CDN. Fail loudly on drift.
const reactDir = path.dirname(require.resolve("@monaco-editor/react/package.json"));
const loaderRequire = createRequire(path.join(reactDir, "package.json"));
const loaderDir = path.dirname(loaderRequire.resolve("@monaco-editor/loader/package.json"));
const loaderConfig = fs.readFileSync(path.join(loaderDir, "lib/es/config/index.js"), "utf8");
const expected = loaderConfig.match(/monaco-editor@([0-9.]+)\/min\/vs/)?.[1];
if (!expected) throw new Error("Could not read the Monaco version @monaco-editor/loader expects");
if (expected !== version)
  throw new Error(
    `@monaco-editor/loader expects monaco-editor ${expected} but ${version} is installed. ` +
      `Update packages.add in selfhost/keep.json, then run pnpm prune and pnpm install.`
  );

const target = path.join(root, "public/monaco/vs");
fs.rmSync(path.join(root, "public/monaco"), { recursive: true, force: true });
fs.cpSync(path.join(monacoDir, "min/vs"), target, { recursive: true });
console.log(`monaco-editor ${version} -> public/monaco/vs`);
