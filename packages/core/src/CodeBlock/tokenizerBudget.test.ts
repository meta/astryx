// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tokenizerBudget.test.ts
 * @input tokenizer.ts and each module under languages/, bundled and minified
 *   by esbuild
 * @output The CodeBlock language budget (PR4): the built-in tokenizer within
 *   4,608 bytes and each language module within 512 bytes, minified and gzipped
 * @position CodeBlock PR4 evidence
 */

import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, describe, expect, it} from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
// Inside the repo so the script resolves `esbuild` by bare specifier, and
// under node_modules so it is ignored and swept with the install.
const workspace = mkdtempSync(
  path.join(repoRoot, 'node_modules', '.astryx-tokenizer-budget-'),
);
afterAll(() => {
  rmSync(workspace, {recursive: true, force: true});
});

/** Each module's export name and subpath under ./languages. */
const MODULES = [
  'graphql:graphql',
  'java:java',
  'thrift:thrift',
  'objectiveC:objective-c',
  'toml:toml',
  'powershell:powershell',
  'ruby:ruby',
  'lua:lua',
  'dockerfile:dockerfile',
];

/**
 * Gzipped, minified size of each entry. A module is measured as its marginal
 * cost: the built-in tokenizer plus that module, less the tokenizer alone.
 */
const script = path.join(workspace, 'measure.mjs');
writeFileSync(
  script,
  [
    "import {build} from 'esbuild';",
    "import {gzipSync} from 'node:zlib';",
    'const [dir, ...modules] = process.argv.slice(2);',
    'async function bundle(contents) {',
    '  const out = await build({',
    "    stdin: {contents, resolveDir: dir, loader: 'ts'},",
    "    bundle: true, minify: true, format: 'esm', write: false, logLevel: 'silent',",
    '  });',
    '  return out.outputFiles[0].text;',
    '}',
    'async function size(contents) {',
    '  const out = await build({',
    "    stdin: {contents, resolveDir: dir, loader: 'ts'},",
    "    bundle: true, minify: true, format: 'esm', write: false, logLevel: 'silent',",
    '  });',
    '  return gzipSync(out.outputFiles[0].contents, {level: 9}).length;',
    '}',
    'const base = await size("import {tokenize} from \'./tokenizer\'; console.log(tokenize);");',
    'const core = await bundle("import {CodeBlock, createCodeLanguage, tokenize} from \'./index\'; console.log(CodeBlock, createCodeLanguage, tokenize);");',
    "const result = {tokenizer: base, modules: {}, leaked: ['cpp_include', 'dynamicparam', 'HEALTHCHECK', 'instancetype', 'subscription'].filter(word => core.includes(word))};",
    'for (const entry of modules) {',
    "  const [name, path] = entry.split(':');",
    "  const both = await size(`import {tokenize} from './tokenizer'; import {${name}} from './languages/${path}'; console.log(tokenize, ${name});`);",
    '  result.modules[name] = both - base;',
    '}',
    'console.log(JSON.stringify(result));',
  ].join('\n'),
);

describe('CodeBlock language budget (PR4)', () => {
  const result = JSON.parse(
    execFileSync(process.execPath, [script, here, ...MODULES], {
      encoding: 'utf8',
      timeout: 120_000,
    })
      .trim()
      .split('\n')
      .pop() ?? '{}',
  ) as {
    tokenizer: number;
    modules: Record<string, number>;
    leaked: string[];
  };

  it('keeps the built-in tokenizer within 4,608 bytes minified and gzipped', () => {
    expect(result.tokenizer).toBeGreaterThan(0);
    expect(result.tokenizer).toBeLessThanOrEqual(4608);
  });

  it('adds no module a bundle does not import', () => {
    // Words only the Thrift, PowerShell, Dockerfile, Objective-C, and GraphQL
    // grammars contain never reach a bundle of the CodeBlock entry.
    expect(result.leaked).toEqual([]);
  });

  it.each(MODULES.map(entry => entry.split(':')[0]))(
    'keeps the %s module within 512 bytes',
    name => {
      expect(result.modules[name]).toBeGreaterThan(0);
      expect(result.modules[name]).toBeLessThanOrEqual(512);
    },
  );
});
