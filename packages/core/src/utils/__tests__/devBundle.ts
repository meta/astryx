// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file devBundle.ts
 * @input A Core module path, one of its named exports, and a NODE_ENV value
 * @output The module bundled and minified by esbuild for that NODE_ENV, with
 *   packages left external
 * @position Test support; proves that a development-only check leaves a
 *   production bundle
 */

import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '../..');
const repoRoot = path.resolve(src, '../../..');

const SCRIPT = [
  "import {build} from 'esbuild';",
  'const [dir, module, name, mode] = process.argv.slice(2);',
  'const out = await build({',
  "  stdin: {contents: `import {${name}} from './${module}'; console.log(${name});`, resolveDir: dir, loader: 'ts'},",
  "  bundle: true, minify: true, format: 'esm', write: false, logLevel: 'silent',",
  "  packages: 'external', define: {'process.env.NODE_ENV': JSON.stringify(mode)},",
  '});',
  'console.log(JSON.stringify(out.outputFiles[0].text));',
].join('\n');

/**
 * The minified bundle of `name` from `module` (relative to packages/core/src)
 * with `process.env.NODE_ENV` set to `mode`.
 */
export function bundleCoreExport(
  module: string,
  name: string,
  mode: 'development' | 'production',
): string {
  // Inside the repo so the script resolves `esbuild` by bare specifier, and
  // under node_modules so it is ignored and swept with the install.
  const workspace = mkdtempSync(
    path.join(repoRoot, 'node_modules', '.astryx-dev-bundle-'),
  );
  try {
    const script = path.join(workspace, 'bundle.mjs');
    writeFileSync(script, SCRIPT);
    const output = execFileSync(
      process.execPath,
      [script, src, module, name, mode],
      // A bundle of a large component is over the 1 MiB default buffer.
      {encoding: 'utf8', timeout: 120_000, maxBuffer: 64 * 1024 * 1024},
    );
    return JSON.parse(output.trim().split('\n').pop() ?? '""') as string;
  } finally {
    rmSync(workspace, {recursive: true, force: true});
  }
}
