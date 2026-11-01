// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for the render helpers: the CSS cut, the embedded source, the
 * HTML reader, and the time limit.
 */

import * as fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import * as path from 'node:path';
import {describe, expect, it} from 'vitest';
import {classesIn, cutCss, layerOrderOf, requiredClasses} from './css-cut.mjs';
import {readSourceBlock, sourceBlock} from './source-block.mjs';
import {isAstryxMarkup, parseHtml} from './html-reader.mjs';
import {renderPage} from './render-page.mjs';

describe('requiredClasses with grouped selectors', () => {
  it('keeps a rule whose :is() or :where() alternatives are not all used', async () => {
    const {cutCss} = await import('./css-cut.mjs');
    const css = '.a:is(.b, .c) { color: red; } :where(.x, .y) .z { color: blue; } .gone { color: green; }';
    const out = cutCss(css, new Set(['a', 'b', 'z']));
    expect(out).toContain('color: red');
    expect(out).toContain('color: blue');
    expect(out).not.toContain('color: green');
  });
});

describe('cutCss', () => {
  const css = `/* @layer comment, not, order; */
@layer reset, base;
:root { --c: light-dark(#000, #fff); }
@property --x { syntax: '<length>'; inherits: false; initial-value: 0px; }
@keyframes spin { to { transform: rotate(1turn); } }
@keyframes unused { to { opacity: 0; } }
@layer base {
  .a { color: red; }
  .b .c { color: blue; }
  .a:not(.zzz) { margin: 0; }
  .gone, .a.d { padding: 0; }
  @media (min-width: 1px) { .gone { color: red; } }
  .spin { animation-name: spin; }
}`;

  it('keeps used rules, tokens, properties and named keyframes', () => {
    const out = cutCss(css, new Set(['a', 'spin']));
    expect(out).toContain('.a { color: red; }');
    expect(out).toContain('.a:not(.zzz)');
    expect(out).toContain('--c: light-dark(#000, #fff)');
    expect(out).toContain('@property --x');
    expect(out).toContain('@keyframes spin');
    expect(out).not.toContain('unused');
    expect(out).not.toContain('.b .c');
    expect(out).not.toContain('.gone');
    expect(out).not.toContain('@media');
    expect(out).not.toMatch(/@layer reset, base;/);
  });

  it('reads the layer order, ignoring comments', () => {
    expect(layerOrderOf(css)).toBe('@layer reset, base;');
  });

  it('needs every class in a selector, except inside :not()', () => {
    expect(requiredClasses('.a .b:hover:not(.c)')).toEqual(['a', 'b']);
    expect(requiredClasses('.x\\:y')).toEqual(['x:y']);
  });

  it('reads class names from markup', () => {
    expect([...classesIn('<div class="a  b"><p class="c"></p></div>')]).toEqual(['a', 'b', 'c']);
  });
});

describe('the embedded source', () => {
  it('round-trips any bytes, even text that would end a script', () => {
    const bytes = Buffer.from('const s = "</script><!--";\r\n// ünïcode ✓\u2028', 'utf8');
    const block = sourceBlock('page.tsx', [{path: 'page.tsx', bytes}]);
    expect(block.match(/<\/script>/g)).toHaveLength(1);
    const read = readSourceBlock(`<body><p>x</p>${block}</body>`);
    expect(read.found && 'source' in read && Buffer.from(read.source.files[0].base64, 'base64')).toEqual(bytes);
  });

  it('reports a damaged block', () => {
    const block = sourceBlock('p.tsx', [{path: 'p.tsx', bytes: Buffer.from('a')}]);
    expect(readSourceBlock(block.replace(/"sha256":"[0-9a-f]/, '"sha256":"Z'))).toMatchObject({found: true});
    expect('damaged' in readSourceBlock(block.replace('"version":1', '"version":2'))).toBe(true);
    expect(readSourceBlock('<p>none</p>')).toEqual({found: false});
  });
});

describe('the HTML reader', () => {
  it('parses rendered markup', () => {
    const doc = parseHtml('<!doctype html><body><div class="astryx-card" data-x="1">a &amp; b<br><img src="x"></div></body>');
    const body = /** @type {any} */ (doc.children[0]);
    expect(body.tag).toBe('body');
    expect(body.children[0].attrs).toEqual({class: 'astryx-card', 'data-x': '1'});
    expect(body.children[0].children[0].text).toBe('a & b');
  });

  it('tells Astryx markup from other HTML', () => {
    expect(isAstryxMarkup('<div class="x astryx-button"></div>')).toBe(true);
    expect(isAstryxMarkup('<div class="button"></div>')).toBe(false);
  });
});

describe('renderPage time limit', () => {
  it('stops a page that never finishes rendering', async () => {
    const dir = fs.mkdtempSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), '../../.astryx-render-loop-'),
    );
    try {
      const file = path.join(dir, 'loop.jsx');
      fs.writeFileSync(file, 'export default function Page() { for (;;) {} }\n');
      await expect(renderPage(file, {timeoutMs: 1500})).rejects.toMatchObject({code: 'ERR_RENDER_TIMEOUT'});
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  }, 30_000);
});
