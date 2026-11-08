// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Verifies the package boundary check.
 * @input Temporary repository trees with core and native source files.
 * @output Confirms core never imports native, and that no file anywhere under
 *   packages/native/ imports or reads core outside the listed build-time
 *   exceptions (AST-082 FR16).
 * @position Regression coverage for scripts/check-package-boundaries.js,
 *   which `pnpm check:repo` runs.
 */

import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const {
  findViolations,
  NATIVE_CORE_EXCEPTIONS,
} = require('./check-package-boundaries.js');

const roots = [];

function tree(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'astryx-boundaries-'));
  roots.push(root);
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
    writeFileSync(path.join(root, file), content);
  }
  return root;
}

const files = violations => violations.map(violation => violation.file);

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, {recursive: true, force: true});
  }
});

describe('package boundaries', () => {
  it('pass on this repository', () => {
    expect(findViolations(path.resolve(import.meta.dirname, '..'))).toEqual([]);
  });

  it('fail when core imports native', () => {
    const root = tree({
      'packages/core/src/Button/Button.tsx':
        "import {Button} from '@astryxdesign/native';\n",
    });
    expect(files(findViolations(root))).toEqual([
      'packages/core/src/Button/Button.tsx',
    ]);
  });

  it('fail on a core import in any native folder, including a new one', () => {
    const root = tree({
      'packages/native/src/index.ts': "import '@astryxdesign/core';\n",
      'packages/native/scripts/generate.mjs':
        "import {Button} from '@astryxdesign/core/Button';\n",
      'packages/native/kotlin-android-1/scripts/theme.mjs':
        "const core = await import('@astryxdesign/core/theme');\n",
      'packages/native/swift-ios-1/tools/relative.cjs':
        "require('../../../core/src/index.ts');\n",
    });
    expect(files(findViolations(root)).sort()).toEqual([
      'packages/native/kotlin-android-1/scripts/theme.mjs',
      'packages/native/scripts/generate.mjs',
      'packages/native/src/index.ts',
      'packages/native/swift-ios-1/tools/relative.cjs',
    ]);
  });

  it("allow the theme generator's two core theme entries only in scripts/", () => {
    const root = tree({
      'packages/native/scripts/swift-ios-theme.mjs': [
        "const {defineTheme} = await import('@astryxdesign/core/theme');",
        "const {resolveThemeTokens} = await import('@astryxdesign/core/theme/tokens');",
      ].join('\n'),
      'packages/native/src/theme/theme.ts':
        "import {defineTheme} from '@astryxdesign/core/theme';\n",
    });
    expect(files(findViolations(root))).toEqual([
      'packages/native/src/theme/theme.ts',
    ]);
    expect(NATIVE_CORE_EXCEPTIONS.imports.map(listed => listed.name)).toEqual([
      'theme entries',
      "core's locale catalogs",
    ]);
  });

  it("allow core's locale catalogs only in the Swift strings generator", () => {
    const read =
      "const dir = path.dirname(require.resolve('@astryxdesign/core/locales/en.json'));\n";
    const root = tree({
      'packages/native/scripts/swift-ios-strings.mjs': read,
      'packages/native/scripts/swift-ios-theme.mjs': read,
      'packages/native/swift-ios-1/scripts/strings.mjs': read,
    });
    expect(files(findViolations(root)).sort()).toEqual([
      'packages/native/scripts/swift-ios-theme.mjs',
      'packages/native/swift-ios-1/scripts/strings.mjs',
    ]);
    const other = tree({
      'packages/native/scripts/swift-ios-strings.mjs':
        "import messages from '@astryxdesign/core/locales/en.generated.js';\n",
    });
    expect(files(findViolations(other))).toEqual([
      'packages/native/scripts/swift-ios-strings.mjs',
    ]);
  });

  it("allow reading core's package as data only through the listed loader", () => {
    const loader = [
      'export const CORE_ROOT = path.join(',
      '  PACKAGE_ROOT,',
      "  'node_modules',",
      "  '@astryxdesign',",
      "  'core',",
      ');',
    ].join('\n');
    const root = tree({
      'packages/native/scripts/core-docs.mjs': loader,
      'packages/native/scripts/core-docs.d.mts':
        'export declare const CORE_ROOT: string;\n',
      'packages/native/swift-ios-1/scripts/tokens.mjs': loader,
      'packages/native/src/read.ts':
        "readFileSync('node_modules/@astryxdesign/core/src/Button/Button.doc.mjs');\n",
      'packages/native/scripts/icons.mjs':
        "import {CORE_ROOT} from './core-docs.mjs';\n",
    });
    expect(files(findViolations(root)).sort()).toEqual([
      'packages/native/scripts/icons.mjs',
      'packages/native/src/read.ts',
      'packages/native/swift-ios-1/scripts/tokens.mjs',
    ]);
    expect(NATIVE_CORE_EXCEPTIONS.data.reader).toBe(
      'packages/native/scripts/core-docs.mjs',
    );
  });

  it('allow the loader only its listed reads: component docs and icon names', () => {
    const loader = reads =>
      [
        "export const CORE_ROOT = path.join(PACKAGE_ROOT, 'node_modules', '@astryxdesign', 'core');",
        ...reads,
      ].join('\n');
    const listed = [
      "const file = path.join(CORE_ROOT, 'src', `${relative}.doc.mjs`);",
      'const source = fs.readFileSync(',
      "  path.join(CORE_ROOT, 'src', 'Icon', 'globalIconRegistry.tsx'),",
      "  'utf8',",
      ');',
    ];
    expect(
      findViolations(
        tree({'packages/native/scripts/core-docs.mjs': loader(listed)}),
      ),
    ).toEqual([]);
    expect(NATIVE_CORE_EXCEPTIONS.data.reads.map(read => read.name)).toEqual([
      'component documentation',
      'built-in icon names',
    ]);

    for (const unlisted of [
      "path.join(CORE_ROOT, 'src', 'Button', 'Button.tsx');",
      "path.join(CORE_ROOT, 'dist', 'index.js');",
      'fs.readdirSync(CORE_ROOT);',
    ]) {
      const violations = findViolations(
        tree({
          'packages/native/scripts/core-docs.mjs': loader([
            ...listed,
            unlisted,
          ]),
        }),
      );
      expect(files(violations), unlisted).toEqual([
        'packages/native/scripts/core-docs.mjs',
      ]);
    }
  });

  it('catch a second data reader that joins node_modules and @astryxdesign/core', () => {
    const root = tree({
      'packages/native/scripts/icons.mjs':
        "const core = path.join(PACKAGE_ROOT, 'node_modules', '@astryxdesign/core');\n",
    });
    expect(files(findViolations(root))).toEqual([
      'packages/native/scripts/icons.mjs',
    ]);
  });

  it('allow the data reader exactly one path to core, its CORE_ROOT', () => {
    const coreRoot =
      "export const CORE_ROOT = path.join(PACKAGE_ROOT, 'node_modules', '@astryxdesign', 'core');";
    for (const secondRoot of [
      "const other = path.join(PACKAGE_ROOT, 'node_modules', '@astryxdesign', 'core');",
      "fs.readFileSync('node_modules/@astryxdesign/core/dist/index.js');",
      "const other = path.join(PACKAGE_ROOT, 'node_modules', '@astryxdesign/core');",
    ]) {
      const root = tree({
        'packages/native/scripts/core-docs.mjs': [coreRoot, secondRoot].join(
          '\n',
        ),
      });
      expect(files(findViolations(root)), secondRoot).toEqual([
        'packages/native/scripts/core-docs.mjs',
      ]);
    }
  });

  it('catch resolve calls and paths to the core workspace', () => {
    const root = tree({
      'packages/native/scripts/a.mjs':
        "const entry = require.resolve('@astryxdesign/core/Button');\n",
      'packages/native/scripts/b.mjs':
        "const url = import.meta.resolve('@astryxdesign/core');\n",
      'packages/native/scripts/c.mjs':
        "const src = path.join(REPO, 'packages', 'core', 'src');\n",
      'packages/native/scripts/d.mjs':
        "const src = path.join(REPO, 'packages/core/src');\n",
    });
    expect(files(findViolations(root)).sort()).toEqual([
      'packages/native/scripts/a.mjs',
      'packages/native/scripts/b.mjs',
      'packages/native/scripts/c.mjs',
      'packages/native/scripts/d.mjs',
    ]);
  });

  it('skip installed dependencies, build output, and Swift build state', () => {
    const root = tree({
      'packages/native/node_modules/@astryxdesign/core/index.js':
        "import './src/index.js';\nimport '@astryxdesign/core/theme';\n",
      'packages/native/dist/index.js': "import '@astryxdesign/core';\n",
      'packages/native/swift-ios-1/.build/plugin.mjs':
        "import '@astryxdesign/core';\n",
    });
    expect(findViolations(root)).toEqual([]);
  });
});
