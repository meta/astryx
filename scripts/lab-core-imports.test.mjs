// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file lab-core-imports.test.mjs
 *
 * Lab may import a core module that core's `exports` do not list only as an
 * internal workspace import, and every such import needs three things or a
 * build fails late: its path in `CORE_INTERNAL_SPECIFIER` (Sandbox's and the
 * docsite's bundles resolve it there), and a `paths` entry in Lab's
 * `tsconfig.json` (its typecheck) and `tsconfig.build.json` (its declaration
 * build). This fails at once, naming the file and the import.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import coreInternalModules from './core-internal-modules.cjs';

const {CORE_INTERNAL_SPECIFIER} = coreInternalModules;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CORE_IMPORT =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"](@astryxdesign\/core(?:\/[^'"]*)?)['"]/g;

/** Whether a pattern with at most one `*` (an exports key or a paths key) matches. */
function matchesPattern(pattern, value) {
  const star = pattern.indexOf('*');
  if (star === -1) {
    return pattern === value;
  }
  const head = pattern.slice(0, star);
  const tail = pattern.slice(star + 1);
  return (
    value.length >= head.length + tail.length &&
    value.startsWith(head) &&
    value.endsWith(tail)
  );
}

/**
 * Every problem with Lab's imports of core modules that core does not export.
 * Pure, so the rule can be checked on a made-up package too.
 *
 * @param {{
 *   files: ReadonlyMap<string, string>,
 *   coreExports: readonly string[],
 *   tsconfigPaths: Readonly<Record<string, readonly string[]>>,
 * }} input `files` by path, `coreExports` as core's `exports` keys
 *   (`./Button`), `tsconfigPaths` as each Lab tsconfig's `paths` keys
 * @returns {string[]}
 */
function findLabCoreImportProblems({files, coreExports, tsconfigPaths}) {
  const problems = [];
  for (const [file, source] of files) {
    const text = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const match of text.matchAll(CORE_IMPORT)) {
      const specifier = match[1];
      const subpath = `.${specifier.slice('@astryxdesign/core'.length)}`;
      if (coreExports.some(key => matchesPattern(key, subpath))) {
        continue;
      }
      if (!CORE_INTERNAL_SPECIFIER.test(specifier)) {
        problems.push(
          `${file}: ${specifier} is neither exported by core nor a listed internal module path; add it to CORE_INTERNAL_SPECIFIER in scripts/core-internal-modules.cjs, with test cases`,
        );
      }
      for (const [config, keys] of Object.entries(tsconfigPaths)) {
        if (!keys.some(key => matchesPattern(key, specifier))) {
          problems.push(
            `${file}: ${specifier} has no paths entry in packages/lab/${config}`,
          );
        }
      }
    }
  }
  return [...new Set(problems)];
}

function readLabSources(dir) {
  const files = new Map();
  const walk = current => {
    for (const entry of fs.readdirSync(current, {withFileTypes: true})) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
          walk(full);
        }
      } else if (/\.(ts|tsx|mts|cts)$/.test(entry.name)) {
        files.set(
          path.relative(root, full).replace(/\\/g, '/'),
          fs.readFileSync(full, 'utf8'),
        );
      }
    }
  };
  walk(dir);
  return files;
}

function pathsOf(config) {
  const json = JSON.parse(
    fs.readFileSync(path.join(root, 'packages/lab', config), 'utf8'),
  );
  return Object.keys(json.compilerOptions?.paths ?? {});
}

describe('Lab imports of core modules core does not export', () => {
  it('are listed internal module paths with both Lab tsconfig paths entries', () => {
    const coreExports = Object.keys(
      JSON.parse(
        fs.readFileSync(path.join(root, 'packages/core/package.json'), 'utf8'),
      ).exports,
    );
    expect(
      findLabCoreImportProblems({
        files: readLabSources(path.join(root, 'packages/lab/src')),
        coreExports,
        tsconfigPaths: {
          'tsconfig.json': pathsOf('tsconfig.json'),
          'tsconfig.build.json': pathsOf('tsconfig.build.json'),
        },
      }),
    ).toEqual([]);
  });

  it('names the file of an import that is unlisted or missing a paths entry', () => {
    const files = new Map([
      [
        'packages/lab/src/Pager/Pager.tsx',
        [
          "import {Button} from '@astryxdesign/core/Button';",
          "import {createAnimator} from '@astryxdesign/core/motion/animator';",
          "import type {ReorderState} from '@astryxdesign/core/List/useListReorder';",
          "const strings = import('@astryxdesign/core/locales/en.json');",
          "// import {gone} from '@astryxdesign/core/List/ListReorderHandle';",
        ].join('\n'),
      ],
      [
        'packages/lab/src/Sheet/Sheet.tsx',
        "import {PanGestureRecognizer} from '@astryxdesign/core/gestures';",
      ],
    ]);
    const problems = findLabCoreImportProblems({
      files,
      coreExports: ['./Button', './locales/*.json'],
      tsconfigPaths: {
        'tsconfig.json': [
          '@astryxdesign/core/motion/*',
          '@astryxdesign/core/List/useListReorder',
        ],
        'tsconfig.build.json': ['@astryxdesign/core/motion/*'],
      },
    });
    expect(problems).toEqual([
      'packages/lab/src/Pager/Pager.tsx: @astryxdesign/core/List/useListReorder is neither exported by core nor a listed internal module path; add it to CORE_INTERNAL_SPECIFIER in scripts/core-internal-modules.cjs, with test cases',
      'packages/lab/src/Pager/Pager.tsx: @astryxdesign/core/List/useListReorder has no paths entry in packages/lab/tsconfig.build.json',
      'packages/lab/src/Sheet/Sheet.tsx: @astryxdesign/core/gestures has no paths entry in packages/lab/tsconfig.json',
      'packages/lab/src/Sheet/Sheet.tsx: @astryxdesign/core/gestures has no paths entry in packages/lab/tsconfig.build.json',
    ]);
  });
});
