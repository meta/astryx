// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file lab-core-imports.test.mjs
 *
 * Lab imports core only through what core's `exports` list. Core's internal
 * modules reach Lab through its `./internal/*` subpath exports
 * (`architecture:react-component-runtime` INV13), never through a Lab
 * tsconfig path alias or a bundler resolver around them. This fails at once,
 * naming the file and the import.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CORE_IMPORT =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"](@astryxdesign\/core(?:\/[^'"]*)?)['"]/g;

/** Whether a pattern with at most one `*` (an exports key) matches. */
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
 * Every Lab import of core that core's `exports` does not list. Core's
 * internal modules reach Lab only through its `./internal/*` subpath exports
 * (`architecture:react-component-runtime` INV13), so an unexported path is a
 * problem, with no second route around them.
 */
function findLabCoreImportProblems({files, coreExports}) {
  const problems = [];
  for (const [file, source] of files) {
    const text = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const match of text.matchAll(CORE_IMPORT)) {
      const specifier = match[1];
      const subpath = `.${specifier.slice('@astryxdesign/core'.length)}`;
      if (!coreExports.some(key => matchesPattern(key, subpath))) {
        problems.push(
          `${file}: ${specifier} is not exported by core; import core's internal modules through its ./internal/* subpaths`,
        );
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

describe('Lab imports of core', () => {
  it('reach only what core exports', () => {
    const coreExports = Object.keys(
      JSON.parse(
        fs.readFileSync(path.join(root, 'packages/core/package.json'), 'utf8'),
      ).exports,
    );
    expect(
      findLabCoreImportProblems({
        files: readLabSources(path.join(root, 'packages/lab/src')),
        coreExports,
      }),
    ).toEqual([]);
  });

  it("have no tsconfig path alias around core's exports", () => {
    for (const config of ['tsconfig.json', 'tsconfig.build.json']) {
      expect(
        pathsOf(config).filter(key => key.startsWith('@astryxdesign/core')),
        config,
      ).toEqual([]);
    }
  });

  it('names the file of an import core does not export', () => {
    const files = new Map([
      [
        'packages/lab/src/Pager/Pager.tsx',
        [
          "import {Button} from '@astryxdesign/core/Button';",
          "import {createAnimator} from '@astryxdesign/core/motion/animator';",
          "import {usePan} from '@astryxdesign/core/internal/touch';",
          "const strings = import('@astryxdesign/core/locales/en.json');",
          "// import {gone} from '@astryxdesign/core/List/ListReorderHandle';",
        ].join('\n'),
      ],
    ]);
    expect(
      findLabCoreImportProblems({
        files,
        coreExports: ['./Button', './locales/*.json', './internal/*'],
      }),
    ).toEqual([
      "packages/lab/src/Pager/Pager.tsx: @astryxdesign/core/motion/animator is not exported by core; import core's internal modules through its ./internal/* subpaths",
    ]);
  });
});
