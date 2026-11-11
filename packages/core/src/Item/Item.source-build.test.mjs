// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Item.source-build.test.mjs
 * @input Uses Babel, the core build config, and the Item and Swipe
 *   sources
 * @output Verifies the shipped Item module imports no swipe code except the
 *   deprecated path: the released row style, and the loader for the deprecated
 *   props. createSwipe brings the layer statically
 * @position Regression test for the import graph of the shipped Item module
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseAsync, transformAsync} from '@babel/core';
import {describe, expect, it} from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = path.resolve(__dirname, '../..');

/**
 * The relative specifiers a compiled module imports, split into the static
 * ones (loaded with the module) and the dynamic ones (loaded on demand). Type
 * imports are gone by now: this is the graph a consumer's bundler sees.
 */
async function compiledImportsOf(fileName) {
  const file = path.resolve(__dirname, fileName);
  const source = await fs.readFile(file, 'utf8');
  const result = await transformAsync(source, {
    babelrc: false,
    configFile: path.join(CORE_ROOT, 'babel.config.json'),
    filename: file,
  });
  const ast = await parseAsync(result.code, {
    babelrc: false,
    configFile: false,
    filename: `${file}.js`,
    sourceType: 'module',
  });
  const statics = [];
  const dynamics = [];
  const visit = node => {
    if (node == null || typeof node !== 'object') {
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node.type === 'ImportDeclaration') {
      statics.push(node.source.value);
    } else if (
      node.type === 'ImportExpression' ||
      (node.type === 'CallExpression' && node.callee.type === 'Import')
    ) {
      const argument =
        node.type === 'ImportExpression' ? node.source : node.arguments[0];
      dynamics.push(argument.value);
    }
    for (const key of Object.keys(node)) {
      if (
        key !== 'loc' &&
        key !== 'leadingComments' &&
        key !== 'trailingComments'
      ) {
        visit(node[key]);
      }
    }
  };
  visit(ast.program.body);
  return {statics, dynamics};
}

/** The swipe's runtime: a static import of any of it is swipe code. */
const SWIPE_CODE =
  /SwipeActionsLayer|DeprecatedSwipeLayer|useSwipeAction|createSwipe|\/gestures\/|\/motion\/|dragToSnapPoints/;

describe('the shipped Item module and the swipe gesture', () => {
  it('imports no swipe code: the reader of a swipe value, and DEP-0017\u2019s released row style', async () => {
    const {statics} = await compiledImportsOf('Item.tsx');
    expect(statics).not.toContainEqual(expect.stringMatching(SWIPE_CODE));
    expect(
      statics.filter(specifier => specifier.startsWith('../Swipe/')),
    ).toEqual(['../Swipe/swipeHost.js', '../Swipe/swipeHost.stylex.js']);
  });

  it('reaches swipe code only through DEP-0017\u2019s loader for the deprecated props', async () => {
    const {dynamics} = await compiledImportsOf('Item.tsx');
    expect(dynamics).toEqual(['../Swipe/DeprecatedSwipeLayer.js']);
  });

  it('keeps the reader of a swipe value free of swipe code: it imports only the realm registry its host map is shared through', async () => {
    const {statics, dynamics} = await compiledImportsOf(
      '../Swipe/swipeHost.ts',
    );
    expect(statics).toEqual(['../utils/sharedRealm.js']);
    expect(dynamics).toEqual([]);
  });

  it('has createSwipe bring the layer, and the layer the gesture, statically', async () => {
    const factory = await compiledImportsOf('../Swipe/createSwipe.ts');
    expect(factory.statics).toContain('./SwipeActionsLayer.js');
    expect(factory.dynamics).toEqual([]);
    const layer = await compiledImportsOf('../Swipe/SwipeActionsLayer.tsx');
    expect(layer.statics).toContain('./useSwipeAction.js');
    expect(layer.dynamics).toEqual([]);
  });
});
