// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file stylex-style-source.test.mjs
 * @description Tests for the cross-file stylex style reader.
 */

import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll, beforeAll, describe, expect, it, beforeEach} from 'vitest';
import {
  clearStyleModuleCache,
  extractStylexStyleProperties,
  resolveImportedStyleProperties,
} from './stylex-style-source.js';

/**
 * Every module tree these tests build lives here, removed once they finish.
 * It is made in beforeAll, not when the module loads: Vitest skips both hooks
 * when a run filters out every test here.
 */
let TEMP_ROOT = '';
beforeAll(() => {
  TEMP_ROOT = mkdtempSync(join(tmpdir(), 'astryx-style-source-test-'));
});
afterAll(() => {
  rmSync(TEMP_ROOT, {recursive: true, force: true});
});

beforeEach(() => {
  clearStyleModuleCache();
});

describe('extractStylexStyleProperties', () => {
  it('reads the property names of each style key', () => {
    const bindings = extractStylexStyleProperties(`
      const styles = stylex.create({
        root: {display: 'flex', gap: 4},
        offset: {marginTop: 8},
      });
    `);
    expect([...bindings.keys()]).toEqual(['styles']);
    expect(bindings.get('styles').get('root')).toEqual(['display', 'gap']);
    expect(bindings.get('styles').get('offset')).toEqual(['marginTop']);
  });

  it('keeps the outer property of a conditional value', () => {
    const bindings = extractStylexStyleProperties(`
      export const rtlStyles = stylex.create({
        mirror: {
          transform: {default: null, ':is([dir="rtl"] *)': 'scaleX(-1)'},
        },
      });
    `);
    expect(bindings.get('rtlStyles').get('mirror')).toEqual(['transform']);
  });

  it('descends into pseudo-selector and at-rule groups', () => {
    const bindings = extractStylexStyleProperties(`
      const styles = stylex.create({
        button: {
          color: 'red',
          ':hover': {display: 'none'},
          '@media (hover: hover)': {opacity: 1},
        },
      });
    `);
    expect(bindings.get('styles').get('button')).toEqual([
      'color',
      'display',
      'opacity',
    ]);
  });

  it('unwraps dynamic styles', () => {
    const bindings = extractStylexStyleProperties(`
      const styles = stylex.create({
        span: (start, end) => ({
          gridColumnStart: start,
          gridColumnEnd: end,
        }),
      });
    `);
    expect(bindings.get('styles').get('span')).toEqual([
      'gridColumnStart',
      'gridColumnEnd',
    ]);
  });

  it('is not confused by braces inside strings and comments', () => {
    const bindings = extractStylexStyleProperties(`
      const styles = stylex.create({
        // a comment with a { brace
        quirk: {
          content: '"{"',
          /* block comment } */
          width: 10,
        },
      });
    `);
    expect(bindings.get('styles').get('quirk')).toEqual(['content', 'width']);
  });

  it('records every stylex.create binding in the module', () => {
    const bindings = extractStylexStyleProperties(`
      const a = stylex.create({x: {color: 'red'}});
      export const b = stylex.create({y: {margin: 0}});
    `);
    expect([...bindings.keys()]).toEqual(['a', 'b']);
  });

  it('returns nothing for a module with no styles', () => {
    expect(extractStylexStyleProperties('export const x = 1;').size).toBe(0);
  });
});

describe('resolveImportedStyleProperties', () => {
  /** Builds a throwaway module tree and returns its root directory. */
  function fixture(files) {
    const root = mkdtempSync(join(TEMP_ROOT, 'astryx-style-source-'));
    for (const [name, content] of Object.entries(files)) {
      const path = join(root, name);
      mkdirSync(join(path, '..'), {recursive: true});
      writeFileSync(path, content, 'utf-8');
    }
    return root;
  }

  it('reads a style object out of a sibling module', () => {
    const root = fixture({
      'Component.tsx': '',
      'styles.ts': `export const shared = stylex.create({
        pill: {borderRadius: 8, padding: 4},
      });`,
    });
    expect(
      resolveImportedStyleProperties(
        join(root, 'Component.tsx'),
        './styles',
        'shared',
        'pill',
      ),
    ).toEqual(['borderRadius', 'padding']);
  });

  it('follows a barrel re-export, including a rename', () => {
    const root = fixture({
      'Component.tsx': '',
      'utils/index.ts': `export {rtlStyles} from './rtlStyles';
export {other as helpers} from './helpers';`,
      'utils/rtlStyles.ts': `export const rtlStyles = stylex.create({
        mirror: {transform: 'scaleX(-1)'},
      });`,
      'utils/helpers.ts': `export const other = stylex.create({
        pad: {padding: 2},
      });`,
    });
    expect(
      resolveImportedStyleProperties(
        join(root, 'Component.tsx'),
        './utils',
        'rtlStyles',
        'mirror',
      ),
    ).toEqual(['transform']);
    expect(
      resolveImportedStyleProperties(
        join(root, 'Component.tsx'),
        './utils',
        'helpers',
        'pad',
      ),
    ).toEqual(['padding']);
  });

  it('returns null for an unknown key, module, or bare specifier', () => {
    const root = fixture({
      'Component.tsx': '',
      'styles.ts': `export const shared = stylex.create({pill: {padding: 4}});`,
    });
    const from = join(root, 'Component.tsx');
    expect(
      resolveImportedStyleProperties(from, './styles', 'shared', 'missing'),
    ).toBeNull();
    expect(
      resolveImportedStyleProperties(from, './nope', 'shared', 'pill'),
    ).toBeNull();
    expect(
      resolveImportedStyleProperties(from, 'some-package', 'shared', 'pill'),
    ).toBeNull();
  });
});
