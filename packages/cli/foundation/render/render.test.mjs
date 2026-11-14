// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for the render helpers: the CSS cut, the embedded source, the
 * HTML reader, and the time limit.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {describe, expect, it} from 'vitest';
import {classesIn, cutCss, layerOrderOf, requiredClasses} from './css-cut.mjs';
import {RENDER_FORMAT, readSourceBlock, renderedHeadOf, renderedMarkupOf, sourceBlock} from './source-block.mjs';
import {isAstryxMarkup, parseHtml} from './html-reader.mjs';
import {renderPage} from './render-page.mjs';
import {makeLinkedFixture, removeLinkedFixture} from '../../test-utils/linked-fixture.mjs';

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
    expect(readSourceBlock(block.replace('"version":1', `"version":${RENDER_FORMAT + 1}`))).toEqual({found: true, newer: {format: RENDER_FORMAT + 1, cli: null}});
    expect('damaged' in readSourceBlock(block.replace('"version":1', '"version":"one"'))).toBe(true);
    expect('damaged' in readSourceBlock(block.replace('"version":1', '"version":0'))).toBe(true);
    expect(readSourceBlock('<p>none</p>')).toEqual({found: false});
  });

  it('finds the block as a browser reads its tag: any attribute order, quoting or letter case', () => {
    const bytes = Buffer.from('export default () => null;\n');
    const block = sourceBlock('page.tsx', [{path: 'page.tsx', bytes}]);
    const json = block.slice(block.indexOf('>') + 1, block.lastIndexOf('</script>'));
    for (const tag of [
      '<script type=application/x-astryx-source>',
      "<script type='application/x-astryx-source'>",
      '<script id="source" type="application/x-astryx-source">',
      '<SCRIPT TYPE="Application/X-Astryx-Source">',
      '<script\n  type="application/x-astryx-source"\n>',
    ]) {
      const html = `<html><head></head><body><p>x</p>${tag}${json}</SCRIPT></body></html>`;
      const read = readSourceBlock(html);
      expect(read.found && 'source' in read && Buffer.from(read.source.files[0].base64, 'base64')).toEqual(bytes);
      expect(renderedMarkupOf(html)).toBe('<p>x</p>');
    }
    // A hand edit that leaves a comment or a textarea open before the block
    // does not hide it.
    for (const edit of ['<!-- note', '<textarea>draft']) {
      const read = readSourceBlock(`<html><head></head><body><p>x</p>${edit}${block}</body></html>`);
      expect(read.found && 'source' in read && Buffer.from(read.source.files[0].base64, 'base64')).toEqual(bytes);
    }
    expect(readSourceBlock(`<body><p>x</p>${block.slice(0, -20)}`)).toEqual({
      found: true,
      damaged: 'its embedded source is cut short: the file ends inside it',
    });
  });
});

describe('the parts of a rendered file a reverse compares', () => {
  it('finds the title, the style and the body as a browser does: outside comments and style text', () => {
    const style = '<style>.t::before{content:"</head><body><!-- x -->"}</style>';
    const html =
      '<!doctype html><html><head><meta charset="utf-8">\n<!-- Page: src/<body>/page.tsx -->\n' +
      `<title>Report</title>${style}</head><body class="x">Markup<script type="application/x-astryx-source">{}</script></body></html>`;
    expect(renderedHeadOf(html)).toEqual({title: 'Report', style});
    expect(renderedMarkupOf(html)).toBe('Markup');
  });

  it('reads <!--> and <!---> as whole comments, in the page and in its head alike', () => {
    const p = /** @type {any} */ (parseHtml('<p>a<!-->b<!--->c<!---->d</p>').children[0]);
    expect(p.children.map((/** @type {{text: string}} */ c) => c.text).join('')).toBe('abcd');
    expect(renderedHeadOf('<html><head><!--><title>T</title><!---><style>s</style></head><body>M')).toEqual({
      title: 'T',
      style: '<style>s</style>',
    });
  });

  it('reads crafted markup in time that grows with its length', () => {
    const started = Date.now();
    for (const html of ['<html><head>' + '<a '.repeat(32000), '<html><head>' + '<style>a</style>'.repeat(20000) + '<body>x']) {
      parseHtml(html);
      renderedHeadOf(html);
      renderedMarkupOf(html);
      readSourceBlock(html);
    }
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it('reads a file a released CLI wrote, with no note', () => {
    const html = '<!doctype html><html><head><title>A &amp; B</title><style>a{}</style></head><body><p>M</p><script type="application/x-astryx-source">{}</script></body></html>';
    expect(renderedHeadOf(html)).toEqual({title: 'A &amp; B', style: '<style>a{}</style>'});
    expect(renderedMarkupOf(html)).toBe('<p>M</p>');
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

  it('reads a self-closing SVG title as empty, and keeps the text after it', () => {
    const doc = parseHtml('<div><svg><title/><path d="M0 0"/></svg><p>after</p></div>');
    const div = /** @type {any} */ (doc.children[0]);
    const [svg, p] = div.children;
    expect(svg.children[0]).toEqual({tag: 'title', attrs: {}, children: []});
    expect(p.children[0].text).toBe('after');
  });

  it('tells Astryx markup from other HTML', () => {
    expect(isAstryxMarkup('<div class="x astryx-button"></div>')).toBe(true);
    expect(isAstryxMarkup('<div class="button"></div>')).toBe(false);
  });
});

describe('renderPage time limit', () => {
  it('stops a page that never finishes rendering', async () => {
    const dir = makeLinkedFixture('astryx-render-loop-', ['react', 'react-dom']);
    try {
      const file = path.join(dir, 'loop.jsx');
      fs.writeFileSync(file, 'export default function Page() { for (;;) {} }\n');
      await expect(renderPage(file, {timeoutMs: 1500})).rejects.toMatchObject({code: 'ERR_RENDER_TIMEOUT'});
    } finally {
      removeLinkedFixture(dir);
    }
  }, 30_000);
});
