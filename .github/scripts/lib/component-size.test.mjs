// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file component-size.test.mjs
 * Pins how the PR size report measures one component import: the JavaScript
 * it loads eagerly and the stylesheet rules referenced by the modules it can
 * load.
 */

import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterEach, describe, expect, it, vi} from 'vitest';

const require = createRequire(import.meta.url);
const {
  bundleImport,
  bundleImportsByEntry,
  classNamesIn,
  measureComponentImport,
  packageStylesheetPath,
  rulesForClasses,
} = require('./component-size.js');

// Fixture trees live under the repository's `node_modules/.cache`, not the
// system temp directory. esbuild reads the listing of every directory above
// each file it bundles. On a shared machine the temp directory can hold
// hundreds of thousands of entries, which cost more than the builds.
const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../node_modules/.cache/astryx-component-size',
);
const roots = [];
function tree(files) {
  fs.mkdirSync(FIXTURES, {recursive: true});
  const root = fs.mkdtempSync(path.join(FIXTURES, 'tree-'));
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

  it('bundles several imports in one build, each with at least what its own build loads eagerly', () => {
    const root = tree({
      'dist/Card/index.js':
        "import {forCard} from '../shared/helper.js';\nexport const Card = () => 'xcard1 ' + forCard();\n",
      'dist/Menu/index.js':
        "import {forMenu} from '../shared/helper.js';\nexport const Menu = () => 'xmenu1 ' + forMenu() + import('./Touch.js');\n",
      'dist/Menu/Touch.js': "export const touch = 'LAZY_TOUCH_CODE';\n",
      'dist/shared/helper.js':
        "export const forCard = () => 'xhelp22';\nexport const forMenu = () => 'xhelp33';\n",
    });
    const card = path.join(root, 'dist/Card/index.js');
    const menu = path.join(root, 'dist/Menu/index.js');
    const texts = bundleImportsByEntry([card, menu]);
    for (const entry of [card, menu]) {
      const shared = classNamesIn(texts.get(entry));
      for (const name of classNamesIn(bundleImport(entry))) {
        expect(shared.has(name), name).toBe(true);
      }
    }
    expect(texts.get(card)).not.toContain('xmenu1');
    expect(texts.get(menu)).not.toContain('LAZY_TOUCH_CODE');
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

  it("measures the import's own chunk when an import() target's chunk comes first", () => {
    // Each import() target is an entry point too. With eight of them, one
    // target's chunk comes before the import's own in esbuild's outputs.
    const files = {
      'dist/Menu/index.js': [
        "export function Menu() { return 'MENU_OWN_CODE'; }",
        ...Array.from(
          {length: 8},
          (_, i) => `export const load${i} = () => import('./Lazy${i}.js');`,
        ),
      ].join('\n'),
    };
    for (let i = 0; i < 8; i += 1) {
      files[`dist/Menu/Lazy${i}.js`] =
        `export const lazy = 'LAZY_${i}_CODE';\n`;
    }
    const root = tree(files);
    const js = bundleImport(path.join(root, 'dist/Menu/index.js'));
    expect(js).toContain('MENU_OWN_CODE');
    expect(js).not.toMatch(/LAZY_\d_CODE/);
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

  it('writes no file to measure an import', () => {
    const root = tree({
      'dist/Card/index.js': "export const Card = () => 'xcard1';\n",
    });
    const temps = vi.spyOn(fs, 'mkdtempSync');
    const writes = vi.spyOn(fs, 'writeFileSync');
    try {
      const size = measureComponentImport(
        path.join(root, 'dist/Card/index.js'),
        '.xcard1{color:red}',
      );
      expect(size.importGzipBytes).toBeGreaterThan(0);
      expect(temps).not.toHaveBeenCalled();
      expect(writes).not.toHaveBeenCalled();
    } finally {
      temps.mockRestore();
      writes.mockRestore();
    }
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
