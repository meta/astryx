// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file i18n-english-fallback.test.mjs
 * @input scripts/i18n-english-fallback.mjs, temporary source fixtures, and
 *   the built @astryxdesign/core (built once by the node project's globalSetup)
 * @output Unit tests for key collection and wiring, and the import-cost check
 *   that a component's bundle carries its own English, not the whole catalog
 * @position Verifies architecture:internationalization's per-module English
 *   fallback. Resolution parity lives in
 *   packages/core/src/i18n/__tests__/englishFallback.test.ts.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {afterEach, describe, expect, it} from 'vitest';
import {
  collectCatalogKeys,
  collectEnglishFallbackSlices,
  findWiringProblems,
  getSliceImportSpecifier,
  getSliceModuleName,
  isShippedSourceModule,
  renderEnglishFallbackModule,
} from './i18n-english-fallback.mjs';

const require = createRequire(import.meta.url);
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const CORE_DIST = path.join(REPO_ROOT, 'packages', 'core', 'dist');

const CATALOG = {
  '@astryx.button.loading': 'Loading',
  '@astryx.kbd.key.control': 'Control',
  '@astryx.pagination.next': 'Go to next page',
};

const temps = [];
function fixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-en-fallback-'));
  temps.push(dir);
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), {recursive: true});
    fs.writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}
afterEach(() => {
  for (const dir of temps.splice(0)) {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

const FULL_FALLBACK_FILES = {
  'i18n/useTranslator.ts': 'registerFullEnglishFallback();\n',
  'i18n/publicContext.ts': 'registerFullEnglishFallback();\n',
  'PowerSearch/resolveOperatorLabel.ts': 'registerFullEnglishFallback();\n',
};

describe('collectCatalogKeys', () => {
  it('collects every string literal that is a catalog key, including keys kept in local maps', () => {
    const source = [
      `const LABEL = new Map([['ctrl', '@astryx.kbd.key.control']]);`,
      'const t = (key: string) => key;',
      't(`@astryx.button.loading`);',
      `t('@astryx.button.loading');`,
    ].join('\n');
    expect(collectCatalogKeys(source, 'A.ts', CATALOG)).toEqual([
      '@astryx.button.loading',
      '@astryx.kbd.key.control',
    ]);
  });

  it('ignores comments and strings that are not catalog keys', () => {
    const source = [
      `// t('@astryx.pagination.next')`,
      `/** t('@astryx.pagination.next') */`,
      `const other = '@astryx.not.inCatalog';`,
    ].join('\n');
    expect(collectCatalogKeys(source, 'A.tsx', CATALOG)).toEqual([]);
  });
});

describe('module paths', () => {
  it('mirrors the source path under i18n/generated-english', () => {
    expect(getSliceModuleName('Button/Button.tsx')).toBe(
      'Button/Button.generated.ts',
    );
    expect(getSliceImportSpecifier('Button/Button.tsx')).toBe(
      '../i18n/generated-english/Button/Button.generated',
    );
    expect(getSliceImportSpecifier('Table/plugins/tree/useTree.tsx')).toBe(
      '../../../i18n/generated-english/Table/plugins/tree/useTree.generated',
    );
  });

  it('derives maps only for shipped modules', () => {
    expect(isShippedSourceModule('Button/Button.tsx')).toBe(true);
    expect(isShippedSourceModule('Button/Button.test.tsx')).toBe(false);
    expect(isShippedSourceModule('Button/Button.stories.tsx')).toBe(false);
    expect(isShippedSourceModule('i18n/__tests__/resolve.test.ts')).toBe(false);
    expect(
      isShippedSourceModule('i18n/generated-locales/en.generated.ts'),
    ).toBe(false);
    expect(
      isShippedSourceModule(
        'i18n/generated-english/Button/Button.generated.ts',
      ),
    ).toBe(false);
  });

  it('renders the English for exactly the named keys', () => {
    const output = renderEnglishFallbackModule(
      CATALOG,
      ['@astryx.button.loading'],
      'Button/Button.tsx',
    );
    expect(output).toContain('"@astryx.button.loading": "Loading"');
    expect(output).not.toContain('@astryx.pagination.next');
    expect(output).toContain('@generated');
  });
});

describe('findWiringProblems', () => {
  const WIRED = [
    `import english from '../i18n/generated-english/Button/Button.generated';`,
    '',
    'registerEnglishFallback(english);',
    `t('@astryx.button.loading');`,
    '',
  ].join('\n');

  it('accepts a module that imports and registers its own map', () => {
    const dir = fixture({...FULL_FALLBACK_FILES, 'Button/Button.tsx': WIRED});
    const slices = collectEnglishFallbackSlices(CATALOG, dir);
    expect([...slices.keys()]).toEqual(['Button/Button.tsx']);
    expect(findWiringProblems(slices, dir)).toEqual([]);
  });

  it('rejects a module that names keys without its map, or never registers it', () => {
    const dir = fixture({
      ...FULL_FALLBACK_FILES,
      'Button/Button.tsx': `t('@astryx.button.loading');\n`,
      'Kbd/Kbd.tsx': [
        `import english from '../i18n/generated-english/Kbd/Kbd.generated';`,
        `t('@astryx.kbd.key.control');`,
        '',
      ].join('\n'),
    });
    const problems = findWiringProblems(
      collectEnglishFallbackSlices(CATALOG, dir),
      dir,
    );
    expect(problems).toEqual([
      expect.stringMatching(/^Button\/Button\.tsx: .*does not import/),
      expect.stringMatching(/^Kbd\/Kbd\.tsx: .*does not register/),
    ]);
  });

  it("rejects another module's map, the whole catalog, and unlisted full-catalog registration", () => {
    const dir = fixture({
      ...FULL_FALLBACK_FILES,
      'Button/Button.tsx': WIRED,
      'Link/Link.tsx': [
        `import english from '../i18n/generated-english/Button/Button.generated';`,
        `import enCatalog from '../i18n/generated-locales/en.generated';`,
        'registerFullEnglishFallback();',
        '',
      ].join('\n'),
    });
    const problems = findWiringProblems(
      collectEnglishFallbackSlices(CATALOG, dir),
      dir,
    );
    expect(problems).toEqual([
      expect.stringMatching(/^Link\/Link\.tsx: .*not its own/),
      expect.stringMatching(/^Link\/Link\.tsx: imports the whole English/),
      expect.stringMatching(/^Link\/Link\.tsx: registers the whole English/),
    ]);
  });

  it('rejects a Core module that imports the public useTranslator or context export', () => {
    const dir = fixture({
      ...FULL_FALLBACK_FILES,
      'Table/Table.tsx': [
        `import {useLocale, useTranslator} from '../i18n';`,
        `t('@astryx.pagination.next');`,
        '',
      ].join('\n'),
      'Button/Button.tsx': `import {useTranslator} from '../i18n/useTranslator';\n${WIRED}`,
      'Link/Link.tsx': `import {InternationalizationContext} from '../i18n';\n`,
    });
    expect(
      findWiringProblems(collectEnglishFallbackSlices(CATALOG, dir), dir),
    ).toEqual([
      expect.stringMatching(
        /^Button\/Button\.tsx: imports the public useTranslator/,
      ),
      expect.stringMatching(
        /^Link\/Link\.tsx: imports the public InternationalizationContext/,
      ),
      expect.stringMatching(
        /^Table\/Table\.tsx: imports the public useTranslator/,
      ),
      expect.stringMatching(
        /^Table\/Table\.tsx: .*does not import its English/,
      ),
    ]);
  });

  it('requires every public path that resolves arbitrary keys to register the whole catalog', () => {
    const dir = fixture({
      ...FULL_FALLBACK_FILES,
      'i18n/useTranslator.ts': 'export {};\n',
    });
    expect(findWiringProblems(new Map(), dir)).toEqual([
      expect.stringMatching(/^i18n\/useTranslator\.ts: must register/),
    ]);
  });
});

describe('import cost', () => {
  // Same per-component import measurement as the pull-request size report.
  const {bundleImport} = require('../.github/scripts/lib/component-size.js');
  const enCatalogFile = path.join(
    CORE_DIST,
    'i18n',
    'generated-locales',
    'en.generated.js',
  );

  function catalogKeysIn(text, keys) {
    return keys.filter(key => text.includes(JSON.stringify(key)));
  }

  function loadCatalogKeys() {
    const source = fs.readFileSync(enCatalogFile, 'utf8');
    return [...source.matchAll(/["'](@astryx\.[^"']+)["']\s*:/g)].map(
      match => match[1],
    );
  }

  it('bundles only the English a component names, not the whole catalog', () => {
    const keys = loadCatalogKeys();
    expect(keys.length).toBeGreaterThan(100);
    for (const name of [
      'Button',
      'TreeList',
      'SideNav',
      'Selector',
      'Table',
      'DateInput',
    ]) {
      const text = bundleImport(path.join(CORE_DIST, name, `${name}.js`));
      expect(text, name).not.toBeNull();
      const bundled = catalogKeysIn(text, keys);
      expect(bundled.length, name).toBeGreaterThan(0);
      expect(bundled.length, name).toBeLessThan(keys.length / 4);
    }
  });

  // Application code imports the package entry; bundlers drop the modules
  // whose exports it does not use, so check what each public export keeps.
  function bundlePackageExport(exportName) {
    const esbuild = require('esbuild');
    const entry = JSON.stringify(path.join(CORE_DIST, 'index.js'));
    const result = esbuild.buildSync({
      stdin: {
        contents: `import {${exportName}} from ${entry}; export const value = ${exportName};`,
        resolveDir: REPO_ROOT,
        loader: 'js',
      },
      bundle: true,
      minify: true,
      format: 'esm',
      platform: 'browser',
      write: false,
      external: ['react', 'react-dom', '@stylexjs/stylex'],
      define: {'process.env.NODE_ENV': '"production"'},
      loader: {'.css': 'empty'},
      logLevel: 'silent',
    });
    return result.outputFiles[0].text;
  }

  it('keeps the whole catalog on the public paths that resolve any Astryx key', () => {
    const keys = loadCatalogKeys();
    for (const exportName of ['useTranslator', 'InternationalizationContext']) {
      expect(
        catalogKeysIn(bundlePackageExport(exportName), keys),
        exportName,
      ).toHaveLength(keys.length);
    }
    // A public export that resolves no keys carries none.
    expect(catalogKeysIn(bundlePackageExport('useLocale'), keys)).toEqual([]);
  });
});
