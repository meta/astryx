// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file component-size.test.mjs
 * Pins how the PR size report measures one component import: the JavaScript
 * it loads eagerly and the stylesheet rules referenced by the modules it can
 * load.
 */

import fs from 'node:fs';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const {
  bundleImport,
  classNamesIn,
  measureComponentImport,
  packageStylesheetPath,
  rulesForClasses,
} = require('./component-size.js');

const roots = [];
function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-size-'));
  roots.push(root);
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
    fs.writeFileSync(path.join(root, file), content);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, {recursive: true, force: true});
});

describe('component import size', () => {
  it('bundles every module the import reaches, package imports included', () => {
    const root = tree({
      'dist/Card/index.js': "export {Card} from './Card.js';\n",
      'dist/Card/Card.js':
        "import {sheet} from 'fake-sheet';\nimport {helper} from '../shared/helper.js';\nexport function Card() { return sheet('xcard1 ' + helper()); }\n",
      'dist/shared/helper.js':
        "export function helper() { return 'xhelp22'; }\n",
      'dist/Other/index.js': "export const unrelated = 'xother9';\n",
      'node_modules/fake-sheet/package.json': JSON.stringify({
        name: 'fake-sheet',
        main: 'index.js',
      }),
      'node_modules/fake-sheet/index.js':
        "export function sheet(name) { return 'xsheet7 ' + name + ' PACKAGE_CODE_MARKER'; }\n",
    });
    const js = bundleImport(path.join(root, 'dist/Card/index.js'));
    expect(js).toContain('xhelp22');
    expect(js).toContain('PACKAGE_CODE_MARKER');
    expect(js).not.toContain('xother9');
    expect([...classNamesIn(js)].sort()).toEqual([
      'xcard1',
      'xhelp22',
      'xsheet7',
    ]);
  });

  it('keeps only the rules whose selectors name a referenced class, with their at-rules', () => {
    const css = [
      '@layer reset, astryx-base, astryx-theme;',
      '@layer astryx-base{',
      '.xcard1{color:red}',
      '.xother9{color:blue}',
      '@media (pointer: coarse){.xcard1:active{opacity:.5}.xother9{opacity:1}}',
      '@keyframes xspin1{to{transform:rotate(1turn)}}',
      '}',
    ].join('');
    const kept = rulesForClasses(css, new Set(['xcard1']));
    expect(kept).toBe(
      '@layer astryx-base{.xcard1{color:red}@media (pointer: coarse){.xcard1:active{opacity:.5}}}',
    );
    expect(rulesForClasses(css, new Set())).toBe('');
  });

  it('counts CSS only for classes the component package modules reference', () => {
    const root = tree({
      'packages/lab/dist/Tip/index.js':
        "export {Button} from '../../../core/dist/Button.js';\nexport const Tip = () => 'xtip1';\n",
      'packages/core/dist/Button.js': "export const Button = () => 'xbtn9';\n",
      'packages/lab/dist/lab.css':
        '.xtip1{color:red}.xbtn9{color:blue;padding:4px;margin:2px}',
    });
    const css = fs.readFileSync(
      path.join(root, 'packages/lab/dist/lab.css'),
      'utf8',
    );
    const own = measureComponentImport(
      path.join(root, 'packages/lab/dist/Tip/index.js'),
      css,
      path.join(root, 'packages/lab/dist'),
    );
    const onlyTip = measureComponentImport(
      path.join(root, 'packages/lab/dist/Tip/index.js'),
      '.xtip1{color:red}',
      path.join(root, 'packages/lab/dist'),
    );
    expect(own.cssGzipBytes).toBe(onlyTip.cssGzipBytes);
    expect(
      bundleImport(path.join(root, 'packages/lab/dist/Tip/index.js')),
    ).toContain('xbtn9');
  });

  it('counts only what the import loads eagerly, not import() targets', () => {
    const root = tree({
      'dist/Menu/index.js':
        "export function Menu() { return import('./Touch.js').then(m => m.touch()); }\n",
      'dist/Menu/Touch.js':
        "export function touch() { return 'LAZY_TOUCH_CODE'; }\n",
    });
    const js = bundleImport(path.join(root, 'dist/Menu/index.js'));
    expect(js).not.toContain('LAZY_TOUCH_CODE');
    expect(js).toContain('import(');
  });

  it('counts CSS a lazily loaded module references, since it ships in the stylesheet', () => {
    const root = tree({
      'dist/Menu/index.js':
        "export function Menu() { return 'xmenu1 ' + import('./Touch.js'); }\n",
      'dist/Menu/Touch.js': "export const touch = 'xtouch1';\n",
    });
    const sheet = '.xmenu1{color:red}.xtouch1{padding:44px}.xother1{margin:0}';
    const withLazy = measureComponentImport(
      path.join(root, 'dist/Menu/index.js'),
      sheet,
      path.join(root, 'dist'),
    );
    const eagerOnly = measureComponentImport(
      path.join(root, 'dist/Menu/index.js'),
      '.xmenu1{color:red}.xother1{margin:0}',
      path.join(root, 'dist'),
    );
    expect(withLazy.cssGzipBytes).toBeGreaterThan(eagerOnly.cssGzipBytes);
  });

  it('ignores CSS behind an import() in an export the import does not use', () => {
    const root = tree({
      'dist/Menu/index.js':
        "export function Menu() { return 'xmenu1'; }\nexport function Unused() { return import('./Touch.js'); }\n",
      'dist/Menu/Touch.js': "export const touch = 'xtouch1';\n",
    });
    const sheet = '.xmenu1{color:red}.xtouch1{padding:44px}';
    const used = measureComponentImport(
      path.join(root, 'dist/Menu/index.js'),
      sheet,
      path.join(root, 'dist'),
      'Menu',
    );
    const menuOnly = measureComponentImport(
      path.join(root, 'dist/Menu/index.js'),
      '.xmenu1{color:red}',
      path.join(root, 'dist'),
      'Menu',
    );
    expect(used.cssGzipBytes).toBe(menuOnly.cssGzipBytes);
  });

  it('keeps the @keyframes a kept rule names', () => {
    const css =
      '@layer astryx-base{.xspin2{animation-name:xrot1}.xother9{animation-name:xrot9}@keyframes xrot1{from{opacity:0}to{opacity:1}}@keyframes xrot9{to{opacity:1}}}';
    expect(rulesForClasses(css, new Set(['xspin2']))).toBe(
      '@layer astryx-base{.xspin2{animation-name:xrot1}@keyframes xrot1{from{opacity:0}to{opacity:1}}}',
    );
  });

  it('measures gzip JavaScript and CSS, and null for a missing entry', () => {
    const root = tree({
      'package.json': JSON.stringify({
        exports: {
          './reset.css': './dist/reset.css',
          './astryx.css': {default: './dist/astryx.css'},
        },
      }),
      'dist/reset.css': '*{margin:0}',
      'dist/astryx.css': '.xcard1{color:red}.xother9{color:blue}',
      'dist/Card/index.js': "export const Card = () => 'xcard1';\n",
    });
    const sheet = packageStylesheetPath(root);
    expect(sheet).toBe(path.join(root, 'dist/astryx.css'));
    const size = measureComponentImport(
      path.join(root, 'dist/Card/index.js'),
      fs.readFileSync(sheet, 'utf8'),
    );
    expect(size.importGzipBytes).toBeGreaterThan(0);
    expect(size.cssGzipBytes).toBeGreaterThan(0);
    expect(
      measureComponentImport(path.join(root, 'dist/Nope/index.js'), ''),
    ).toEqual({
      importGzipBytes: null,
      cssGzipBytes: null,
    });
  });
});
