// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file lazy-dependencies.test.mjs
 * @input The heavy dependencies foundation/runtime/lazy-dependencies.mjs
 *   loads on first use, and the public API entry point
 * @output Each resolves to the same file for `require` as for `import`, the
 *   API's exports keep their names and shapes, and importing the API loads
 *   none of those dependencies
 */

import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {describe, expect, it} from 'vitest';
import {LAZY_PACKAGES} from '../foundation/runtime/lazy-dependencies.mjs';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = path.join(CLI, 'api', 'index.mjs');

/** The API's exports as they were before any dependency was made lazy. */
const API_EXPORTS = {
  AstryxError: 'function/3',
  blog: 'function/1/async',
  build: 'function/1/async',
  component: 'function/1/async',
  discover: 'function/1/async',
  docs: 'function/2/async',
  doctor: 'function/0/async',
  exportSearchIndex: 'function/0/async',
  gapReport: 'function/1/async',
  generateTonalPalette: 'function/1',
  hook: 'function/1/async',
  icon: 'function/1/async',
  iconAdd: 'function/2/async',
  iconMap: 'function/2/async',
  iconNewDefinition: 'function/1/async',
  iconNewSet: 'function/1/async',
  iconUse: 'function/1/async',
  init: 'function/0/async',
  integrationAdd: 'function/2/async',
  integrationAddAgentDoc: 'function/1',
  integrationAddCodemod: 'function/2',
  integrationAddComponent: 'function/1',
  integrationAddDoc: 'function/1',
  integrationAddTemplate: 'function/1',
  integrationAddTheme: 'function/1/async',
  integrationCheck: 'function/0/async',
  integrationComponentConflicts: 'function/1/async',
  integrationDocConflicts: 'function/1/async',
  integrationExampleScope: 'function/1/async',
  integrationPackCheck: 'function/0/async',
  integrationTemplateConflicts: 'function/1/async',
  listThemes: 'function/0',
  logger: 'object',
  rankSearchIndex: 'function/2/async',
  search: 'function/1/async',
  summarizeIssues: 'function/1',
  swizzle: 'function/1/async',
  template: 'function/1/async',
  themeAdd: 'function/1/async',
  themeBuild: 'function/1/async',
  themeEject: 'function/1/async',
  themeList: 'function/0',
  themeListAvailable: 'function/0/async',
  themeListCopySources: 'function/0/async',
  themePaletteGenerate: 'function/1',
  themeRemove: 'function/1',
  themeTargets: 'function/1/async',
  themeTemplate: 'function/0',
  themeUse: 'function/1',
  upgrade: 'function/0/async',
  validateIntegration: 'function/1/async',
};

describe('lazy dependencies', () => {
  it('resolve to the same file for require as for import', () => {
    const require = createRequire(
      pathToFileURL(
        path.join(CLI, 'foundation', 'runtime', 'lazy-dependencies.mjs'),
      ),
    );
    for (const pkg of LAZY_PACKAGES) {
      expect(require.resolve(pkg), pkg).toBe(
        fileURLToPath(import.meta.resolve(pkg)),
      );
    }
  });

  it('leave the API with the same exports, of the same shapes', async () => {
    const api = await import(pathToFileURL(API).href);
    /** @type {Record<string, string>} */
    const shapes = {};
    for (const name of Object.keys(api).sort()) {
      const value = api[name];
      shapes[name] =
        typeof value === 'function'
          ? `function/${value.length}${value.constructor.name === 'AsyncFunction' ? '/async' : ''}`
          : typeof value;
    }
    expect(shapes).toEqual(API_EXPORTS);
  });

  it('keep a broken install failing at import', () => {
    // A package that cannot be resolved, as on an install missing it.
    const script = `
      import {createRequire} from 'node:module';
      const Module = createRequire(import.meta.url)('node:module');
      const resolve = Module._resolveFilename;
      Module._resolveFilename = function (request, ...rest) {
        if (request === '@babel/parser') {
          const error = new Error("Cannot find module '@babel/parser'");
          error.code = 'MODULE_NOT_FOUND';
          throw error;
        }
        return resolve.call(this, request, ...rest);
      };
      try {
        await import(${JSON.stringify(
          pathToFileURL(
            path.join(CLI, 'foundation', 'runtime', 'lazy-dependencies.mjs'),
          ).href,
        )});
        process.stdout.write('loaded');
      } catch (error) {
        process.stdout.write(String(error.code));
      }
    `;
    const result = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', script],
      {encoding: 'utf8'},
    );
    expect(result.stdout, result.stderr).toBe('MODULE_NOT_FOUND');
  }, 60_000);

  it('are not loaded by importing the API', () => {
    // Every package here is CommonJS, so a load shows in the require cache
    // (on every supported Node, unlike module hooks).
    const script = `
      import {createRequire} from 'node:module';
      await import(${JSON.stringify(pathToFileURL(API).href)});
      const loaded = new Set();
      for (const file of Object.keys(createRequire(import.meta.url).cache)) {
        const m = file.match(/node_modules[\\\\/]((?:@[^\\\\/]+[\\\\/])?[^\\\\/]+)[\\\\/]/g);
        if (m) loaded.add(m[m.length - 1].slice(13, -1).replace(/\\\\/g, '/'));
      }
      process.stdout.write(JSON.stringify([...loaded]));
    `;
    const result = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', script],
      {encoding: 'utf8'},
    );
    expect(result.status, result.stderr).toBe(0);
    const loaded = JSON.parse(result.stdout);
    expect(loaded.length).toBeGreaterThan(0);
    for (const pkg of LAZY_PACKAGES) expect(loaded).not.toContain(pkg);
  }, 60_000);
});
