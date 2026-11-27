#!/usr/bin/env node
// Reduces the upstream tree to what the kept tools actually import.
//
//   node selfhost/prune.mjs            delete unreachable files, trim package.json
//   node selfhost/prune.mjs --check    exit 1 if anything would change (CI)
//   node selfhost/prune.mjs --why <f>  print the import chain that keeps <f>
//   node selfhost/prune.mjs --tests    list upstream tests and whether they survive
//
// Everything is driven by selfhost/keep.json. The script is idempotent and has
// no dependencies, so it can run before `pnpm install`. It is deliberately
// conservative: a file survives if any kept file mentions it in an import,
// export-from, require(), dynamic import() or new URL(..., import.meta.url).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(fs.readFileSync(path.join(root, "selfhost/keep.json"), "utf8"));
const args = process.argv.slice(2);
const check = args.includes("--check");
const why = args.includes("--why") ? args[args.indexOf("--why") + 1] : null;

const git = (...a) =>
  execFileSync("git", a, { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 });
const exists = (rel) => {
  try {
    return fs.statSync(path.join(root, rel)).isFile();
  } catch {
    return false;
  }
};
// Tracked files plus new, not-ignored ones; minus files already deleted.
const allFiles = git("ls-files", "-co", "--exclude-standard", "-z")
  .split("\0")
  .filter((f) => f && exists(f));
const fileSet = new Set(allFiles);

const isCode = (f) => /\.(tsx?|jsx?|mjs|cjs)$/.test(f);
const isTest = (f) =>
  /\.(spec|test)\.[cm]?[jt]sx?$/.test(f) || f.includes("__fixtures__/");
// Patterns: "dir/" is a prefix, "*" matches within one path segment.
const globs = new Map();
const glob = (p) => {
  if (!globs.has(p)) {
    const body = p
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, "[^/]*");
    globs.set(p, new RegExp("^" + body + (p.endsWith("/") ? "" : "$")));
  }
  return globs.get(p);
};
const matches = (f, patterns) => patterns.some((p) => glob(p).test(f));

const EXTS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".d.ts",
  "/index.ts", "/index.tsx", "/index.js"];
function resolveLocal(from, spec) {
  let base;
  if (spec.startsWith("@/")) base = spec.slice(2);
  else if (spec.startsWith(".")) base = path.posix.join(path.posix.dirname(from), spec);
  else return undefined; // package import
  for (const ext of EXTS) if (fileSet.has(base + ext)) return base + ext;
  return null; // local import that does not exist (already pruned)
}
const IMPORT_RE = new RegExp(
  [
    // import x from "y" / export * from "y" / import "y" / import type ...
    String.raw`(?:^|[\s;])(?:import|export)\s+(?:type\s+)?(?:[^'"\`;]*?\sfrom\s+)?["']([^"'\n]+)["']`,
    String.raw`\bimport\(\s*["']([^"'\n]+)["']\s*\)`,
    String.raw`\brequire\(\s*["']([^"'\n]+)["']\s*\)`,
    String.raw`\bnew URL\(\s*["']([^"'\n]+)["']\s*,\s*import\.meta\.url`,
    // modules a test mocks must stay resolvable too
    String.raw`\bvi\.(?:mock|doMock|importActual)\(\s*["']([^"'\n]+)["']`,
  ].join("|"),
  "g"
);
const pkgName = (spec) =>
  spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];

const importsCache = new Map();
function importsOf(file) {
  if (importsCache.has(file)) return importsCache.get(file);
  const out = { local: [], missing: [], pkgs: [] };
  if (isCode(file)) {
    const src = fs.readFileSync(path.join(root, file), "utf8");
    for (const m of src.matchAll(IMPORT_RE)) {
      const spec = m.slice(1).find(Boolean);
      const hit = resolveLocal(file, spec);
      if (hit === undefined) {
        if (!spec.startsWith("node:")) out.pkgs.push(pkgName(spec));
      } else if (hit === null) {
        // new URL("..", import.meta.url) names a directory, not a module.
        if (m[4] === undefined) out.missing.push(spec);
      }
      else out.local.push(hit);
    }
  }
  importsCache.set(file, out);
  return out;
}
function closure(seeds, into = new Map()) {
  const stack = seeds.map((f) => [f, null]);
  while (stack.length) {
    const [file, parent] = stack.pop();
    if (into.has(file)) continue;
    into.set(file, parent);
    for (const next of importsOf(file).local) stack.push([next, file]);
  }
  return into;
}
const expand = (entry) => {
  if (fileSet.has(entry)) return [entry];
  const dir = entry.endsWith("/") ? entry : entry + "/";
  return allFiles.filter((f) => f.startsWith(dir));
};

// 1. Production closure.
const entries = cfg.entries.flatMap((entry) => {
  const files = expand(entry).filter((f) => !isTest(f));
  if (!files.length) throw new Error(`keep.json entry matches nothing: ${entry}`);
  return files;
});
const prod = closure(entries);

// 2. Upstream tests are kept only when the code they exercise survived: every
//    local import must resolve, and anything a test adds on top of the
//    production closure must itself be test-only material.
const keptTests = new Map();
const droppedTests = [];
for (const test of allFiles.filter((f) => isTest(f) && isCode(f))) {
  if (matches(test, cfg.dropTests ?? [])) {
    droppedTests.push(test);
    continue;
  }
  const reach = closure([test], new Map());
  const extra = [...reach.keys()].filter((f) => f !== test && !prod.has(f));
  const broken = [...reach.keys()].some((f) => importsOf(f).missing.length);
  const foreign = extra.filter(
    (f) => !isTest(f) && !matches(f, cfg.testSupport ?? []) && !matches(f, cfg.keep)
  );
  if (broken || foreign.length) {
    droppedTests.push(test);
    if (args.includes("--tests"))
      console.log(`drop ${test}${broken ? " (imports removed code)" : ""} ${foreign.slice(0, 4).join(" ")}`);
    continue;
  }
  if (args.includes("--tests")) console.log(`keep ${test}`);
  for (const [f, parent] of reach) if (!keptTests.has(f)) keptTests.set(f, parent);
}
if (args.includes("--tests")) process.exit(0);

const keep = new Set([...prod.keys(), ...keptTests.keys()]);
for (const f of allFiles) if (matches(f, cfg.keep)) keep.add(f);

if (why) {
  let f = why;
  const chain = [];
  const parents = prod.has(f) ? prod : keptTests;
  if (!keep.has(f)) console.log(`${f} is not kept`);
  else if (!parents.has(f)) console.log(`${f} is kept by a keep.json "keep" pattern`);
  else {
    while (f) {
      chain.push(f);
      f = parents.get(f);
    }
    console.log(chain.join("\n  <- "));
  }
  process.exit(0);
}

// 3. package.json: keep only packages that kept code imports, plus the
//    explicitly listed tooling / peer dependencies.
const pkgPath = path.join(root, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const usedProd = new Set();
const usedTest = new Set();
for (const f of keep) {
  const target = prod.has(f) ? usedProd : usedTest;
  for (const p of importsOf(f).pkgs) target.add(p);
}
const declared = { ...pkg.devDependencies, ...pkg.dependencies, ...cfg.packages.add };
const nextPkg = { ...pkg, dependencies: {}, devDependencies: {} };
for (const name of Object.keys(declared).sort()) {
  const version = cfg.packages.pin?.[name] ?? declared[name];
  if (usedProd.has(name) || cfg.packages.runtime.includes(name))
    nextPkg.dependencies[name] = version;
  else if (usedTest.has(name) || cfg.packages.dev.includes(name))
    nextPkg.devDependencies[name] = version;
}
// Type packages follow the package they describe.
const kept = { ...nextPkg.dependencies, ...nextPkg.devDependencies };
for (const name of Object.keys(declared).sort()) {
  const base = name.startsWith("@types/") && name.slice(7);
  if (base && kept[base] && !kept[name]) nextPkg.devDependencies[name] = declared[name];
}
nextPkg.devDependencies = Object.fromEntries(
  Object.entries(nextPkg.devDependencies).sort(([a], [b]) => a.localeCompare(b))
);
for (const name of [...cfg.packages.runtime, ...cfg.packages.dev])
  if (!declared[name]) throw new Error(`keep.json lists ${name}, which upstream no longer declares`);
const undeclared = [...usedProd].filter((p) => !declared[p]);
if (undeclared.length)
  throw new Error(`kept code imports undeclared packages: ${undeclared.join(", ")}`);
nextPkg.scripts = cfg.scripts;
if (Object.keys(cfg.packages.overrides ?? {}).length) nextPkg.pnpm = { ...pkg.pnpm, overrides: cfg.packages.overrides };
const nextPkgText = JSON.stringify(nextPkg, null, 2) + "\n";
const pkgChanged = nextPkgText !== fs.readFileSync(pkgPath, "utf8");

// 4. Apply.
// Only tracked files are ever deleted; untracked local files are left alone.
const tracked = new Set(git("ls-files", "-z").split("\0"));
const doomed = allFiles.filter((f) => tracked.has(f) && !keep.has(f));
const stale = [...keep].flatMap((f) => importsOf(f).missing.map((m) => `${f} -> ${m}`));
if (stale.length) {
  console.error("Kept files import files that do not exist:\n  " + stale.join("\n  "));
  process.exit(1);
}
if (check) {
  if (doomed.length || pkgChanged) {
    console.error(
      `prune --check: ${doomed.length} unreachable file(s)` +
        (pkgChanged ? ", package.json out of date" : "") +
        "\n  " + doomed.slice(0, 40).join("\n  ")
    );
    process.exit(1);
  }
  console.log(`prune --check: clean (${keep.size} files kept)`);
  process.exit(0);
}
for (const f of doomed) fs.rmSync(path.join(root, f));
const dirs = new Set(doomed.map((f) => path.posix.dirname(f)));
for (const dir of [...dirs].sort((a, b) => b.length - a.length)) {
  let d = dir;
  while (d && d !== ".") {
    try {
      fs.rmdirSync(path.join(root, d)); // only succeeds when empty
    } catch {
      break;
    }
    d = path.posix.dirname(d);
  }
}
if (pkgChanged) fs.writeFileSync(pkgPath, nextPkgText);
console.log(
  `kept ${keep.size} files (${prod.size} reachable from the tools, ` +
    `${[...keptTests.keys()].filter((f) => isTest(f)).length} test files), ` +
    `removed ${doomed.length}` + (pkgChanged ? ", rewrote package.json" : "")
);
if (pkgChanged) console.log("package.json changed: run `pnpm install --no-frozen-lockfile`");
