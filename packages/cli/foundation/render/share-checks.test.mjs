// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {describe, expect, it} from 'vitest';
import {outsideRequests, roundTrip} from './share-checks.mjs';
import {sourceBlock} from './source-block.mjs';
import {embeddedLoads} from './render-page.mjs';
import {parseSrcset} from './srcset.mjs';

/** A written file: head styles, body markup, then its embedded source. @param {string} body @param {string} [style] */
const file = (body, style = '') =>
  `<!doctype html><html><head><title>t</title>${style ? `<style>${style}</style>` : ''}</head><body>${body}${sourceBlock('p.tsx', [{path: 'p.tsx', bytes: Buffer.from('x')}])}</body></html>`;

describe('outsideRequests', () => {
  it('names what the markup and the stylesheet load, once each, and nothing a reader clicks or the script holds', () => {
    const html = file(
      [
        '<link rel="stylesheet" href="https://cdn.example/c.css">',
        '<img src="https://img.example/d.png" srcset="https://img.example/d2.png 2x, local.png 1x">',
        '<img src="data:image/png;base64,AA"><a href="https://example.com/read-more">more</a>',
        '<img src="https://img.example/d.png">',
      ].join(''),
      '@import "https://fonts.example/a.css"; .x{background:url(//cdn.example/b.png)} .y{background:url(data:image/png;base64,AA)}',
    ).replace('</body>', '<script>fetch("https://api.example/e")</script></body>');
    expect(outsideRequests(html)).toEqual([
      'https://fonts.example/a.css',
      '//cdn.example/b.png',
      'https://cdn.example/c.css',
      'https://img.example/d.png',
      'https://img.example/d2.png',
      'local.png',
    ]);
  });

  it('reads a > inside a quoted value and a double-quoted url() in a style attribute', () => {
    const html = file(
      '<img alt="a > b" src="https://img.example/q.png"><div style="background:url(&quot;https://img.example/s.png&quot;)">x</div>',
    );
    expect(outsideRequests(html)).toEqual(['https://img.example/q.png', 'https://img.example/s.png']);
  });

  it('reads an SVG image href and xlink:href, and a style element in the markup: its url() and its CSS import rule', () => {
    const html = file(
      [
        '<svg><image href="https://img.example/i.png"></image><image xlink:href="https://img.example/x.png"></image></svg>',
        '<style>@import url("https://fonts.example/m.css"); .k{background:url(https://img.example/k.png)}</style>',
      ].join(''),
    );
    expect(outsideRequests(html)).toEqual([
      'https://img.example/i.png',
      'https://img.example/x.png',
      'https://fonts.example/m.css',
      'https://img.example/k.png',
    ]);
  });

  it('reads image-set() and -webkit-image-set() strings in a style element and a style attribute', () => {
    const html = file(
      '<style>.h{background-image:image-set("https://img.example/a.png" 1x, url(https://img.example/b.png) 2x)}</style><div style="background-image:-webkit-image-set(&#x27;https://img.example/c.png&#x27; 1x)">x</div>',
    );
    expect(outsideRequests(html)).toEqual([
      'https://img.example/b.png',
      'https://img.example/a.png',
      'https://img.example/c.png',
    ]);
  });

  it('lists a relative reference the render leaves for the browser, so the file does not stand alone', () => {
    const html = file('<link rel="icon" href="./bg.png"><svg><image href="./bg.png"></image></svg><style>.b{background:url(./bg.png)}</style>');
    expect(outsideRequests(html)).toEqual(['./bg.png']);
  });

  it('counts no reference that loads nothing: about:blank, mailto: and tel:', () => {
    const html = file('<iframe src="about:blank"></iframe><link rel="author" href="mailto:a@example.com"><object data="tel:+1"></object>');
    expect(outsideRequests(html)).toEqual([]);
  });

  it('counts a link only for a rel the browser fetches: canonical and author load nothing', () => {
    const html = file(
      '<link rel="canonical" href="https://example.com/page"><link rel="author" href="https://example.com/me"><link rel="preload stylesheet" href="https://cdn.example/p.css"><link href="https://fonts.example/f.css" rel="stylesheet" />',
    );
    expect(outsideRequests(html)).toEqual(['https://cdn.example/p.css', 'https://fonts.example/f.css']);
  });

  it('counts media sources and SVG use and feImage references the render left in the file', () => {
    const html = file(
      [
        '<video src="./clip.mov"><track src="./captions.vtt"></video>',
        '<audio><source src="./clip.ogg"></audio>',
        '<svg><use href="./icons.svg#check"></use><filter><feImage href="https://img.example/f.png"></feImage></filter></svg>',
      ].join(''),
    );
    expect(outsideRequests(html)).toEqual([
      './icons.svg#check',
      'https://img.example/f.png',
      './clip.mov',
      './captions.vtt',
      './clip.ogg',
    ]);
  });

  it('lists an address with a query once, as written', () => {
    expect(outsideRequests(file('<iframe src="https://x.example/embed?a=1&amp;b=2"></iframe>'))).toEqual([
      'https://x.example/embed?a=1&b=2',
    ]);
  });

  it('is empty for a file that loads nothing from the network', () => {
    expect(
      outsideRequests(file('<img src="data:image/png;base64,AA"><a href="https://x.example">x</a>')),
    ).toEqual([]);
  });
});

describe('parseSrcset', () => {
  it('keeps a comma inside a URL, as in a data: URI, and splits candidates on the comma after a descriptor', () => {
    expect(parseSrcset('data:image/png;base64,AAA= 1x, b.png 2x,c.png')).toEqual([
      {url: 'data:image/png;base64,AAA=', descriptor: '1x'},
      {url: 'b.png', descriptor: '2x'},
      {url: 'c.png', descriptor: ''},
    ]);
  });
});

describe('embeddedLoads', () => {
  it('names a style element\'s @import url() once, so the render warns once', () => {
    expect(embeddedLoads('<style>@import url("https://fonts.example/m.css");</style>')).toEqual([
      {tag: 'style', ref: 'https://fonts.example/m.css'},
    ]);
  });
});

describe('roundTrip', () => {
  const page = (/** @type {Record<string, string>} */ files) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'share-checks-'));
    for (const [rel, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), {recursive: true});
      fs.writeFileSync(path.join(dir, rel), text);
    }
    const carried = Object.keys(files);
    const block = sourceBlock(
      carried[0],
      carried.map(rel => ({path: rel, bytes: fs.readFileSync(path.join(dir, rel))})),
    );
    return {dir, carried, html: `<html><body><p>x</p>${block}</body></html>`};
  };

  it('is exact when every carried file comes back byte for byte, a page below the carry root included', () => {
    const {dir, carried, html} = page({'pages/page.tsx': 'export default () => null;\n', 'data.json': '{"a":1}\n'});
    expect(roundTrip(html, path.join(dir, 'pages/page.tsx'), carried)).toEqual({exact: true, files: 2, differs: []});
  });

  it('is not exact when a carried file changed after the render', () => {
    const {dir, carried, html} = page({'page.tsx': 'export default () => null;\n'});
    fs.writeFileSync(path.join(dir, 'page.tsx'), 'export default () => 1;\n');
    expect(roundTrip(html, path.join(dir, 'page.tsx'), carried)).toEqual({exact: false, files: 1, differs: ['page.tsx']});
  });

  it('is not exact, naming every carried file, when the file has no embedded source', () => {
    expect(roundTrip('<html><body><p>x</p></body></html>', path.join(os.tmpdir(), 'page.tsx'), ['page.tsx', 'data.json'])).toEqual({
      exact: false,
      files: 0,
      differs: ['page.tsx', 'data.json'],
    });
  });

  it('names a carried file missing on either side', () => {
    const {dir, carried, html} = page({'page.tsx': 'export default () => null;\n', 'data.json': '{}\n'});
    fs.rmSync(path.join(dir, 'data.json'));
    expect(roundTrip(html, path.join(dir, 'page.tsx'), [...carried, 'extra.json'])).toEqual({
      exact: false,
      files: 2,
      differs: ['data.json', 'extra.json'],
    });
  });
});
