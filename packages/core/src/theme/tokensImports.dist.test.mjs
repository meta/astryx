// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tokensImports.dist.test.mjs
 * @input Core's source, compiled file by file with Core's own Babel config
 *   as `build:esm` compiles dist, from the Button, Icon, Link and IconButton
 *   package entries
 * @output No built module those entries reach imports the theme-rule
 *   generator
 * @position Built-output boundary test of packages/core/src/theme/tokens.ts
 *
 * A host can keep every export of every module it loads, with no unused
 * re-export dropped. So the walk follows every static import and every
 * re-export in each compiled module it reaches. Type-only imports are gone
 * from the compiled code, and a dynamic import loads later.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {transformAsync} from '@babel/core';
import ts from 'typescript';
import {describe, expect, it} from 'vitest';

const CORE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const SRC = path.join(CORE_ROOT, 'src');
const GENERATOR = 'theme/generateThemeRules.ts';
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs'];

/** @type {Record<string, {source: string}>} */
const PACKAGE_EXPORTS = JSON.parse(
  fs.readFileSync(path.join(CORE_ROOT, 'package.json'), 'utf8'),
).exports;

/**
 * The source module a compiled relative specifier names, or null for a file
 * that is not a module (JSON, CSS).
 * @param {string} from
 * @param {string} specifier
 * @returns {string | null}
 */
function resolveSource(from, specifier) {
  const base = path.resolve(path.dirname(from), specifier);
  const stem = base.replace(/\.(js|mjs)$/, '');
  const candidates = [
    ...SOURCE_EXTENSIONS.map(extension => `${stem}${extension}`),
    ...SOURCE_EXTENSIONS.map(extension => path.join(base, `index${extension}`)),
  ];
  const found = candidates.find(candidate => fs.existsSync(candidate));
  if (found != null) {
    return found;
  }
  if (/\.(json|css)$/.test(base)) {
    return null;
  }
  throw new Error(`${from}: cannot resolve ${specifier}`);
}

/** @type {Map<string, Promise<string[]>>} */
const linksByFile = new Map();

/**
 * The source modules that `file`'s compiled code imports or re-exports
 * statically.
 * @param {string} file
 * @returns {Promise<string[]>}
 */
function compiledLinks(file) {
  let links = linksByFile.get(file);
  if (links == null) {
    links = (async () => {
      const result = await transformAsync(fs.readFileSync(file, 'utf8'), {
        babelrc: false,
        configFile: path.join(CORE_ROOT, 'babel.config.json'),
        cwd: CORE_ROOT,
        filename: file,
      });
      const compiled = ts.createSourceFile(
        file,
        result?.code ?? '',
        ts.ScriptTarget.Latest,
        false,
        ts.ScriptKind.JS,
      );
      const found = [];
      for (const statement of compiled.statements) {
        const specifier =
          ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)
            ? statement.moduleSpecifier
            : undefined;
        if (
          specifier != null &&
          ts.isStringLiteral(specifier) &&
          specifier.text.startsWith('.')
        ) {
          const target = resolveSource(file, specifier.text);
          if (target != null) {
            found.push(target);
          }
        }
      }
      return found;
    })();
    linksByFile.set(file, links);
  }
  return links;
}

/**
 * Every module that the `entry` package export reaches when every import and
 * re-export is followed, as paths relative to src/.
 * @param {string} entry such as `./Button`
 * @returns {Promise<Set<string>>}
 */
async function reachedModules(entry) {
  const start = path.resolve(CORE_ROOT, PACKAGE_EXPORTS[entry].source);
  const reached = new Set([start]);
  const queue = [start];
  while (queue.length > 0) {
    const file = /** @type {string} */ (queue.pop());
    for (const link of await compiledLinks(file)) {
      if (!reached.has(link)) {
        reached.add(link);
        queue.push(link);
      }
    }
  }
  return new Set([...reached].map(file => path.relative(SRC, file)));
}

describe('the compiled component entries', () => {
  it.each(['./Button', './Icon', './Link', './IconButton'])(
    'the %s entry reaches no theme-rule generator, with every import and re-export followed',
    async entry => {
      expect(await reachedModules(entry)).not.toContain(GENERATOR);
    },
    120_000,
  );

  it('finds the generator from the theme entry, which exports it', async () => {
    expect(await reachedModules('./theme')).toContain(GENERATOR);
  }, 120_000);
});
