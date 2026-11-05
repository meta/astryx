#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Generates apps/sandbox/public/xle-tokenizer.mjs
 *
 * The Layout DSL page counts tokens CLIENT-SIDE. gpt-tokenizer is optional, so
 * a self-contained ESM module is generated under public/ rather than making the
 * Vite bundle depend on it. The browser imports that module by URL. If esbuild
 * or gpt-tokenizer is unavailable, a heuristic module with the same export
 * shape is written instead, so the page always has a counter.
 *
 * Runs in the sandbox `generate` chain.
 */

import {writeFileSync, mkdirSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const REPO = resolve(ROOT, '../..');
const OUT = resolve(ROOT, 'public/xle-tokenizer.mjs');

const HEURISTIC =
  '// @generated fallback — gpt-tokenizer not bundled; using a heuristic.\n' +
  "export const ENCODER = 'est.';\n" +
  'export const countTokens = s => (String(s).match(/\\w+|[^\\s\\w]/g) || []).length;\n';

let out = HEURISTIC;
try {
  const esbuild = await import('esbuild');
  const built = await esbuild.build({
    stdin: {
      contents:
        "import {countTokens as c} from 'gpt-tokenizer/encoding/o200k_base';\n" +
        "export const ENCODER = 'o200k_base';\n" +
        'export const countTokens = s => c(String(s));\n',
      resolveDir: REPO,
      loader: 'js',
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    legalComments: 'none',
    logLevel: 'silent',
  });
  out = built.outputFiles[0].text;
  console.log(
    `✓ xle-tokenizer.mjs: gpt-tokenizer o200k_base (${(out.length / 1024 / 1024).toFixed(1)} MB bundled)`,
  );
} catch {
  console.warn(
    'xle-tokenizer.mjs: gpt-tokenizer/esbuild unavailable — wrote heuristic fallback',
  );
}

mkdirSync(dirname(OUT), {recursive: true});
writeFileSync(OUT, out);
