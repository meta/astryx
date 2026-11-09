// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Item.source-build.test.mjs
 * @input Uses Babel, the core build config, and the Item and ItemSwipeLayer
 *   sources
 * @output Verifies the shipped Item module reaches the swipe gesture only
 *   through a dynamic import, so a row without swipe actions bundles none of it
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
  const file = path.join(__dirname, fileName);
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

describe('the shipped Item module and the swipe gesture', () => {
  it('reaches the swipe layer only through a dynamic import, and the gesture not at all', async () => {
    const {statics, dynamics} = await compiledImportsOf('Item.tsx');
    // The gesture and its panels are the layer's: a row without swipe actions
    // never loads them, so this module must not import them statically.
    expect(statics).not.toContainEqual(expect.stringMatching(/useSwipeAction/));
    expect(statics).not.toContainEqual(expect.stringMatching(/ItemSwipeLayer/));
    expect(dynamics).toEqual(['./ItemSwipeLayer.js']);
  });

  it('keeps the gesture inside the swipe layer', async () => {
    const {statics} = await compiledImportsOf('ItemSwipeLayer.tsx');
    expect(statics).toContain('./useSwipeAction.js');
  });
});
