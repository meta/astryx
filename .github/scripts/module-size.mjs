#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Module size budgets: measure named source modules against a budget.
 * @input `[--config <file>] [--root <dir>] [--summary <file>] [--output <file>]`;
 *   the config lists modules (entries, scope, budgetBytes, enforce)
 * @output A size table; a `::warning` per module over budget, or an `::error`
 *   when its `enforce` is set. Exit 0, or 1 for an enforced budget exceeded,
 *   or 2 for a missing module, config, or build error
 * @position Sibling of package-size.mjs: that one measures published packages,
 *   this one measures modules inside a package
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
const DEFAULT_CONFIG = path.join(REPO_ROOT, '.github/module-size-budgets.json');

/** Keep each relative import that leaves the module's scope out of its size. */
function scopePlugin(scopeDir) {
  return {
    name: 'module-scope',
    setup(b) {
      b.onResolve({filter: /^\./}, args => {
        if (args.kind === 'entry-point') return null;
        const target = path.resolve(
          fs.realpathSync(args.resolveDir),
          args.path,
        );
        const inside =
          target === scopeDir || target.startsWith(scopeDir + path.sep);
        return inside ? null : {path: args.path, external: true};
      });
    },
  };
}

/** Generated i18n catalogs are not committed; they count the same everywhere. */
const stubGenerated = {
  name: 'stub-generated',
  setup(b) {
    b.onResolve({filter: /\.generated(\.[a-z]+)?$/}, args => ({
      path: args.path,
      namespace: 'stub',
    }));
    b.onLoad({filter: /.*/, namespace: 'stub'}, () => ({
      contents: 'export default {};',
      loader: 'js',
    }));
  },
};

function gzipSize(code) {
  const out = spawnSync('gzip', ['-9', '-n', '-c'], {
    input: code,
    maxBuffer: 1 << 30,
  });
  if (out.status !== 0) throw new Error('gzip -9 failed');
  return out.stdout.length;
}

/**
 * Bundle one module and measure it.
 * @param {{root: string, entries: string[], scope: string}} module
 * @returns {Promise<{code: string, minBytes: number, gzipBytes: number}>}
 */
export async function bundleModule({root, entries, scope}) {
  const scopePath = path.resolve(root, scope);
  if (!fs.existsSync(scopePath))
    throw new Error(`module scope not found: ${scope}`);
  // Compare real paths: a symlinked root must not move code out of scope.
  const scopeDir = fs.realpathSync(scopePath);
  for (const entry of entries)
    if (!fs.existsSync(path.resolve(root, entry)))
      throw new Error(`module entry not found: ${entry}`);
  const contents = entries
    .map(entry => `export * from ${JSON.stringify(path.resolve(root, entry))};`)
    .join('\n');
  const result = await build({
    stdin: {contents, resolveDir: scopeDir, loader: 'ts'},
    bundle: true,
    format: 'esm',
    minify: true,
    write: false,
    packages: 'external',
    loader: {'.css': 'empty'},
    define: {'process.env.NODE_ENV': '"production"'},
    plugins: [scopePlugin(scopeDir), stubGenerated],
    logLevel: 'silent',
  });
  const code = result.outputFiles[0].text;
  return {
    code,
    minBytes: Buffer.byteLength(code),
    gzipBytes: gzipSize(code),
  };
}

const overText = m =>
  `${m.name} is ${m.gzipBytes} B min+gz; its budget is ${m.budgetBytes} B.`;

/**
 * Measure every configured module against its budget.
 * @param {{root: string, config: {modules: Array<object>}}} input
 */
export async function checkBudgets({root, config}) {
  const modules = [];
  const warnings = [];
  const failures = [];
  for (const entry of config.modules ?? []) {
    const {minBytes, gzipBytes} = await bundleModule({root, ...entry});
    const measured = {
      name: entry.name,
      role: entry.role ?? null,
      minBytes,
      gzipBytes,
      budgetBytes: entry.budgetBytes,
      enforce: entry.enforce === true,
      over: gzipBytes > entry.budgetBytes,
    };
    modules.push(measured);
    if (measured.over)
      (measured.enforce ? failures : warnings).push(overText(measured));
  }
  return {modules, warnings, failures};
}

function renderTable(modules) {
  const rows = modules.map(
    m =>
      `| ${m.name} | ${m.minBytes} B | ${m.gzipBytes} B | ${m.budgetBytes} B | ${m.over ? (m.enforce ? 'over (enforced)' : 'over (advisory)') : 'within'} |`,
  );
  return [
    '### Module size budgets',
    '',
    '| Module | Min | Min + gzip | Budget | State |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const arg = name => {
    const i = args.indexOf(`--${name}`);
    return i === -1 ? null : args[i + 1];
  };
  let result;
  try {
    const config = JSON.parse(
      fs.readFileSync(arg('config') ?? DEFAULT_CONFIG, 'utf8'),
    );
    result = await checkBudgets({root: arg('root') ?? REPO_ROOT, config});
  } catch (error) {
    // An unmeasured module is never a pass.
    console.error(`module-size: ${error.message}`);
    process.exit(2);
  }
  const table = renderTable(result.modules);
  console.log(table);
  if (arg('summary')) fs.appendFileSync(arg('summary'), `${table}\n`);
  if (arg('output'))
    fs.writeFileSync(arg('output'), `${JSON.stringify(result, null, 2)}\n`);
  for (const text of result.warnings)
    console.log(`::warning title=Module size over budget::${text}`);
  for (const text of result.failures)
    console.log(`::error title=Module size over budget::${text}`);
  process.exit(result.failures.length ? 1 : 0);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
