// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The DOCSITE_ICON_SET library-import rewrite: imports from a chosen
 * set's library go straight to the icon files its barrel maps, a name the
 * barrel does not map keeps the original import, and an unset setting adds
 * nothing to the build.
 *
 * @input A temporary barrel module and its icon files, and the Next.js config
 * @output Regression coverage for the per-icon import rewrite
 * @position Build-time docsite tooling verification
 * Run: pnpm -F @astryxdesign/docsite test
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  chosenSets,
  readBarrel,
  rewriteLibraryImports,
} from '../../scripts/icon-library-import-loader.mjs';

let tmp: string;
let barrel: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docsite-icon-barrel-'));
  barrel = path.join(tmp, 'lib', 'index.js');
  fs.mkdirSync(path.join(tmp, 'lib', 'icons'), {recursive: true});
  fs.writeFileSync(
    barrel,
    [
      "export {renderIcon} from './types.js';",
      "export {default as XIcon} from './icons/XIcon.js';",
      "export {default as SearchIcon} from './icons/SearchIcon.js';",
      "export {HomeIcon} from './icons/home.js';",
      "export {default as Remote} from 'other-package';",
      '',
    ].join('\n'),
  );
});
afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
  vi.unstubAllEnvs();
});

const LIBRARY = '@acme/huge-icons';
const libraries = new Set([LIBRARY]);
const resolveBarrel = async (library: string) =>
  library === LIBRARY ? barrel : null;
const icon = (name: string) =>
  JSON.stringify(path.join(tmp, 'lib', 'icons', name));

describe('readBarrel', () => {
  it("maps each name to its relative file and that file's export", () => {
    const map = readBarrel(barrel);
    expect(map.get('XIcon')).toEqual({
      file: path.join(tmp, 'lib', 'icons', 'XIcon.js'),
      imported: 'default',
    });
    expect(map.get('HomeIcon')?.imported).toBe('HomeIcon');
    expect(map.has('Remote')).toBe(false);
  });
});

describe('rewriteLibraryImports', () => {
  it('imports each mapped name from its own icon file', async () => {
    const source = [
      `import {XIcon as CloseIcon, HomeIcon} from '${LIBRARY}';`,
      `export {SearchIcon as FindIcon} from '${LIBRARY}';`,
      'export {CloseIcon, HomeIcon};',
      '',
    ].join('\n');
    const out = await rewriteLibraryImports(source, libraries, resolveBarrel);
    expect(out).toContain(`import CloseIcon from ${icon('XIcon.js')};`);
    expect(out).toContain(`import {HomeIcon} from ${icon('home.js')};`);
    expect(out).toContain(
      `export {default as FindIcon} from ${icon('SearchIcon.js')};`,
    );
    expect(out).not.toContain(`'${LIBRARY}'`);
    expect(out).toContain('export {CloseIcon, HomeIcon};');
  });

  it('keeps the original import for a name the barrel does not map', async () => {
    const source = `import {XIcon, NopeIcon} from '${LIBRARY}';\n`;
    const out = await rewriteLibraryImports(source, libraries, resolveBarrel);
    expect(out).toContain(`import XIcon from ${icon('XIcon.js')};`);
    expect(out).toContain(`import {NopeIcon} from "${LIBRARY}";`);
  });

  it('leaves default, namespace and star statements as they are', async () => {
    const source = [
      `import Icons from '${LIBRARY}';`,
      `import * as All from '${LIBRARY}';`,
      `export * from '${LIBRARY}';`,
      `export * as Ns from '${LIBRARY}';`,
      '',
    ].join('\n');
    expect(await rewriteLibraryImports(source, libraries, resolveBarrel)).toBe(
      source,
    );
  });

  it('leaves the source as it is when the library does not resolve', async () => {
    const source = `import {XIcon} from '${LIBRARY}';\n`;
    expect(
      await rewriteLibraryImports(source, libraries, async () => null),
    ).toBe(source);
  });

  it('leaves imports from other packages as they are', async () => {
    const source = "import {XIcon} from '@acme/other';\n";
    expect(await rewriteLibraryImports(source, libraries, resolveBarrel)).toBe(
      source,
    );
  });
});

describe('next.config', () => {
  type Rule = {test?: RegExp; include?: RegExp; use?: {loader: string}[]};
  /** The module rules the config's webpack hook leaves. */
  async function rulesWith(value: string | undefined) {
    vi.resetModules();
    vi.stubEnv('DOCSITE_ICON_SET', value ?? '');
    const {default: nextConfig} = await import('../../next.config.mjs');
    const config = {
      module: {rules: [] as Rule[]},
      resolve: {alias: {}, modules: ['node_modules']},
      plugins: [],
      cache: {type: 'filesystem', version: 'next'},
    };
    (
      nextConfig as unknown as {
        webpack: (config: unknown, options: unknown) => unknown;
      }
    ).webpack(config, {isServer: true, webpack: {BannerPlugin: class {}}});
    return config.module.rules;
  }
  const libraryRule = (rules: Rule[]) =>
    rules.find(rule =>
      rule.use?.some(use =>
        use.loader.endsWith('icon-library-import-loader.mjs'),
      ),
    );

  it('adds no library rewrite when the setting is unset', async () => {
    expect(libraryRule(await rulesWith(undefined))).toBeUndefined();
  });

  it('rewrites installed package modules when the setting names a set', async () => {
    const rule = libraryRule(await rulesWith('glyphs'));
    expect(rule).toBeDefined();
    const file = '/repo/node_modules/@acme/glyphs/icon-sets/glyphs/g.js';
    expect(rule?.test?.test(file) && rule.include?.test(file)).toBe(true);
    expect(rule?.include?.test('/repo/apps/docsite/src/app/page.js')).toBe(
      false,
    );
  });
});

describe('chosenSets', () => {
  it('takes only the sets the setting names, not every installed set', () => {
    const main = {name: 'main'};
    const backup = {name: 'backup'};
    expect(chosenSets({order: [main, backup], set: main})).toEqual([
      main,
      backup,
    ]);
    expect(chosenSets({set: main})).toEqual([main]);
    expect(chosenSets({set: null})).toEqual([]);
  });
});
