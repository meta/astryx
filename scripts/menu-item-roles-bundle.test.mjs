// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file menu-item-roles-bundle.test.mjs
 * @input Core's menuItemRoles module, bundled with the PR size report's
 *   esbuild options
 * @output Proves that an import of one function from the module carries no
 *   role set and no selector, and that an import of a selector carries them
 * @position Node test over source, so it needs no build
 */

import {createRequire} from 'node:module';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

const REPO = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.join(REPO, 'package.json'));
const esbuild = require('esbuild');
const {sizeBuildOptions} = require('./.github/scripts/lib/component-size.js');

const MENU_DIR = path.join(REPO, 'packages/core/src/DropdownMenu');

/** The code that one import of the module puts in a bundle. */
function bundle(names) {
  const result = esbuild.buildSync({
    ...sizeBuildOptions(REPO),
    stdin: {
      contents: `export {${names}} from './menuItemRoles.ts';`,
      resolveDir: MENU_DIR,
      sourcefile: 'entry.mjs',
      loader: 'js',
    },
  });
  return result.outputFiles.map(file => file.text).join('');
}

describe('menuItemRoles bundle', () => {
  it('an import of isModifiedClick carries no role set and no selector', () => {
    const text = bundle('isModifiedClick');
    expect(text).toContain('metaKey');
    expect(text).not.toMatch(/menuitem|new Set|role=/);
  });

  it('an import of a selector carries the role set', () => {
    const text = bundle('MENU_ITEM_SELECTOR');
    expect(text).toContain('menuitemcheckbox');
    expect(text).toContain('aria-disabled');
  });
});
