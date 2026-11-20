// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file localeBundle.test.ts
 * @input Uses vitest, node:child_process and esbuild over the i18n sources
 * @output A production bundle that reads only the locale, direction or
 *   calendar ships no message resolver and no intl-messageformat; a bundle
 *   that translates ships both
 * @position Unit test of packages/core/src/i18n's bundled modules
 *
 * Read from esbuild's metafile: the modules with bytes in the minified,
 * tree-shaken output, and the packages it imports. esbuild cannot run in this
 * suite's jsdom environment (it asserts on a native `TextEncoder`), so it runs
 * in a child process.
 */

import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

const I18N = path.resolve(__dirname, '..');

const BUNDLE_SCRIPT = `
import {build} from 'esbuild';
import path from 'node:path';
const [contents, resolveDir] = process.argv.slice(1);
const result = await build({
  stdin: {contents, resolveDir, loader: 'ts'},
  bundle: true,
  write: false,
  minify: true,
  treeShaking: true,
  format: 'esm',
  platform: 'browser',
  packages: 'external',
  metafile: true,
  logLevel: 'silent',
  define: {'process.env.NODE_ENV': '"production"'},
});
const [output] = Object.values(result.metafile.outputs);
const modules = Object.entries(output.inputs)
  .filter(([, input]) => input.bytesInOutput > 0)
  .map(([file]) => path.basename(file));
const packages = output.imports.filter(i => i.external).map(i => i.path);
process.stdout.write(JSON.stringify({modules, packages}));
`;

/** The i18n modules and external packages in a production bundle of `entry`. */
function bundle(entry: string): {modules: string[]; packages: string[]} {
  const stdout = execFileSync(
    process.execPath,
    ['--input-type=module', '-e', BUNDLE_SCRIPT, entry, I18N],
    {cwd: I18N, encoding: 'utf8', timeout: 120_000},
  );
  return JSON.parse(stdout) as {modules: string[]; packages: string[]};
}

describe('an i18n bundle', () => {
  it('reads the locale, direction and calendar without the message resolver', () => {
    const {modules, packages} = bundle(`
      export {useLocale} from './useLocale';
      export {useDirection} from './useDirection';
      export {useCollator} from './useCollator';
      export {useListFormatter} from './useListFormatter';
      export {useCalendarSystem} from './useCalendarSystem';
    `);
    expect(modules).toContain('InternationalizationContext.ts');
    expect(modules).not.toContain('resolve.ts');
    expect(modules).not.toContain('translatingContext.ts');
    expect(packages).not.toContain('intl-messageformat');
  });

  it('ships the resolver and its English default with a component translator', () => {
    const {modules, packages} = bundle(`
      export {useComponentTranslator} from './useComponentTranslator';
    `);
    expect(modules).toContain('resolve.ts');
    expect(modules).toContain('translatingContext.ts');
    expect(packages).toContain('intl-messageformat');
  });

  it('ships the resolver and its English default with the public context and translator', () => {
    for (const entry of [
      `export {InternationalizationContext} from './publicContext';`,
      `export {useTranslator} from './useTranslator';`,
    ]) {
      const {modules, packages} = bundle(entry);
      expect(modules).toContain('resolve.ts');
      expect(modules).toContain('translatingContext.ts');
      expect(packages).toContain('intl-messageformat');
    }
  });
});
