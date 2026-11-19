// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for the render helpers: the CSS cut, the embedded source, the
 * HTML reader, the time limit, drawing the overlays a page opens, and the
 * names a render does not carry.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {performance} from 'node:perf_hooks';
import {describe, expect, it} from 'vitest';
import {classesIn, cutCss, cutFontFaces, layerOrderOf, requiredClasses} from './css-cut.mjs';
import {RENDER_FORMAT, readSourceBlock, renderedHeadOf, renderedMarkupOf, sourceBlock} from './source-block.mjs';
import {isAstryxMarkup, parseHtml} from './html-reader.mjs';
import {renderPage, withCarriedPaths, withUncarriedImages} from './render-page.mjs';
import {carriedNameFor, embeddedPathProblem} from './embedded-files.mjs';
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

describe('cutFontFaces', () => {
  const face = (family, range) =>
    `@font-face { font-family: ${family}; src: url(x.woff2); unicode-range: ${range}; }`;
  const css = [
    face("'Inter'", 'U+0000-00FF'),
    face("'Inter'", 'U+0400-045F'),
    face("'Inter'", 'U+1F00-1FFF'),
    face('Mono', 'U+0000-00FF'),
    '@font-face { font-family: Plain; src: url(p.woff2); }',
    '.t { font-family: Inter, sans-serif; } .p { font-family: Plain; }',
  ].join('\n');

  it('keeps the faces whose range covers the text and whose family is named', () => {
    const out = cutFontFaces(css, '<p class="t">Hello</p>');
    expect(out).toContain('U+0000-00FF');
    expect(out).toContain('font-family: Plain');
    expect(out).not.toContain('U+0400-045F');
    expect(out).not.toContain('U+1F00-1FFF');
    expect(out).not.toContain('font-family: Mono');
  });

  it('keeps a range for a character the script holds', () => {
    const out = cutFontFaces(css, '<p class="t">Hello</p><script>t("Привет")</script>');
    expect(out).toContain('U+0400-045F');
    expect(out).not.toContain('U+1F00-1FFF');
  });

  it('counts a character the script holds as an escape, as the bundled script writes it', () => {
    const route = cutFontFaces(css, '<p class="t">Home</p><script>v="\\u1f00\\u03b1"</script>');
    expect(route).toContain('U+1F00-1FFF');
    expect(route).not.toContain('U+0400-045F');
    expect(cutFontFaces(css, '<p class="t">x</p><script>t("\\u{41f}")</script>')).toContain('U+0400-045F');
    expect(cutFontFaces(css, '<p class="t">&#x41F;</p>')).toContain('U+0400-045F');
    expect(cutFontFaces(face('Emoji', 'U+1F600-1F64F'), 'Emoji "\\ud83d\\ude00"')).toContain('@font-face');
  });

  it('keeps a family the markup or the script names, and reads wildcard ranges', () => {
    const out = cutFontFaces(
      `${face('Mono', 'U+00??')}\n${face('Mono', 'U+04??')}`,
      'el.style.fontFamily = "Mono"; "ok"',
    );
    expect(out).toContain('U+00??');
    expect(out).not.toContain('U+04??');
  });

  it('counts a family named through a token chain or a font shorthand', () => {
    const chain = cutFontFaces(
      `${face("'Inter'", 'U+0000-00FF')}\n:root { --font-brand: 'Inter', sans-serif; --font-body: var(--font-brand); }\n.t { font-family: var(--font-body); }`,
      '<p class="t">Hello</p>',
    );
    expect(chain).toContain('@font-face');
    const shorthand = cutFontFaces(
      `${face('Mono', 'U+0000-00FF')}\n.t { font: 600 14px/1.4 Mono, monospace; }`,
      '<p class="t">Hello</p>',
    );
    expect(shorthand).toContain('@font-face');
  });

  it('counts text the stylesheet draws: content strings, CSS escapes and other list markers', () => {
    expect(cutFontFaces(css, '<p class="t">x</p>', `${css}\n.t::before { content: "\\41f"; }`)).toContain('U+0400-045F');
    expect(cutFontFaces(css, '<p class="t">x</p>', `${css}\n.t::before { content: "Ἀ"; }`)).toContain('U+1F00-1FFF');
    const greekList = cutFontFaces(css, '<ol class="t"><li>x</li></ol>', `${css}\n.t { list-style: lower-greek inside; }`);
    expect(greekList).toContain('U+1F00-1FFF');
    expect(greekList).toContain('U+0400-045F');
    const counter = cutFontFaces(css, '<p class="t">x</p>', `${css}\n.t::before { content: counter(step, hiragana); }`);
    expect(counter).toContain('U+0400-045F');
    const plainList = cutFontFaces(css, '<ol class="t"><li>x</li></ol>', `${css}\n.t { list-style: decimal; } .u::before { content: counter(step) ". "; }`);
    expect(plainList).not.toContain('U+0400-045F');
  });

  it('reads a family name as CSS reads it, and as the script escapes it', () => {
    const escapedFace = '@font-face { font-family: Gill\\ Sans; src: url(g.woff2); unicode-range: U+0000-00FF; }';
    expect(cutFontFaces(escapedFace, 'x', `${escapedFace}\n.t { font-family: 'Gill Sans'; }`)).toContain('@font-face');
    const accented = "@font-face { font-family: 'Üní Sans'; src: url(u.woff2); unicode-range: U+0000-00FF; }";
    expect(cutFontFaces(accented, '<script>el.style.fontFamily="\\xDCn\\xED Sans"</script>')).toContain('@font-face');
    expect(cutFontFaces(accented, '<script>el.style.fontFamily="Other"</script>')).not.toContain('@font-face');
  });

  it('keeps every face of a named family under a text-transform that changes the characters', () => {
    const wide = cutFontFaces(css, '<p class="t">abc</p>', `${css}\n.t { text-transform: full-width; }`);
    expect(wide).toContain('U+0400-045F');
    expect(cutFontFaces(css, '<p class="t">abc</p>', `${css}\n.t { text-transform: uppercase; }`)).not.toContain('U+0400-045F');
  });

  it('counts a list style or a text-transform the markup or the script sets', () => {
    const inline = cutFontFaces(css, '<ol class="t" style="list-style-type:upper-armenian"><li>x</li></ol>');
    expect(inline).toContain('U+1F00-1FFF');
    const script = cutFontFaces(css, '<p class="t">x</p><script>e.style.textTransform="full-width"</script>');
    expect(script).toContain('U+0400-045F');
    const react = cutFontFaces(css, '<p class="t">x</p><script>jsx("ol",{style:{listStyleType:"lower-greek"}})</script>');
    expect(react).toContain('U+1F00-1FFF');
    expect(cutFontFaces(css, '<ol class="t" style="list-style-type:decimal"><li>x</li></ol>')).not.toContain('U+0400-045F');
  });

  it('reads a style by its value, never an object key, and finds setProperty values', () => {
    const minified = cutFontFaces(css, '<ul class="t"><li>x</li></ul><script>s={listStyle:a="none",margin:0}</script>');
    expect(minified).not.toContain('U+0400-045F');
    expect(minified).not.toContain('U+1F00-1FFF');
    const set = cutFontFaces(css, '<p class="t">x</p><script>el.style.setProperty("list-style-type", "georgian")</script>');
    expect(set).toContain('U+0400-045F');
    expect(cutFontFaces(css, '<ol class="t" style="list-style: inside georgian"><li>x</li></ol>')).toContain('U+0400-045F');
  });

  it('reads a style a custom property holds for a var()', () => {
    expect(cutFontFaces(`${css}:root{--marker:georgian}ol.t{list-style-type:var(--marker)}`, '<ol class="t"><li>x</li></ol>')).toContain('U+0400-045F');
    expect(cutFontFaces(`${css}@property --tt{syntax:'*';inherits:true;initial-value:full-width}.t{text-transform:var(--tt)}`, '<p class="t">x</p>')).toContain('U+0400-045F');
    expect(cutFontFaces(`${css}:root{--weight:bold}`, '<p class="t">x</p>')).not.toContain('U+0400-045F');
  });

  it('reads a style through a chain of custom properties and in a var() fallback', () => {
    expect(cutFontFaces(`${css}:root{--base:georgian;--marker:var(--base)}ol.t{list-style-type:var(--marker)}`, '<ol class="t"><li>x</li></ol>')).toContain('U+0400-045F');
    expect(cutFontFaces(`${css}ol.t{list-style-type:var(--marker, georgian)}`, '<ol class="t"><li>x</li></ol>')).toContain('U+0400-045F');
    expect(cutFontFaces(`${css}ol.t{list-style-type:var(--marker, decimal)}`, '<ol class="t"><li>x</li></ol>')).not.toContain('U+0400-045F');
  });

  it('reads no style from prose or a font-stack token, and every word of a quoted shorthand', () => {
    expect(cutFontFaces(css, '<p class="t">x</p><script>s="Full-width alert bar for info, success, warning, and error messages."</script>')).not.toContain('U+0400-045F');
    expect(cutFontFaces(css, '<p class="t">Cuisine: Thai food</p><script>v="Persian"</script>')).not.toContain('U+0400-045F');
    expect(cutFontFaces(`${css}:root{--font-georgian:'Noto Sans Georgian', sans-serif}`, '<p class="t">x</p>')).not.toContain('U+0400-045F');
    expect(cutFontFaces(css, '<ol class="t"><li>x</li></ol><script>jsx("ol",{style:{listStyle:"inside georgian"}})</script>')).toContain('U+0400-045F');
    expect(cutFontFaces(css, '<ol class="t"><li>x</li></ol><script>el.style.setProperty("list-style","inside georgian")</script>')).toContain('U+0400-045F');
  });

  it('counts the other case of each character, for text-transform', () => {
    expect(cutFontFaces(face('Inter', 'U+0370-03FF'), '<p style="font-family:Inter">µ</p>')).toContain('@font-face');
    expect(cutFontFaces(face('Inter', 'U+0130-0130'), '<p style="font-family:Inter">i</p>')).toContain('@font-face');
  });

  it('names the families of the whole stylesheet when it cuts one part of it', () => {
    const part = face('Mono', 'U+0000-00FF');
    expect(cutFontFaces(part, 'x', `${part}\n.c { font-family: Mono; }`)).toContain('@font-face');
    expect(cutFontFaces(part, 'x', `${part}\n.c { font-family: Other; }`)).not.toContain('@font-face');
  });

  it('does not take a longer name for the family', () => {
    const out = cutFontFaces(face('Inter', 'U+0000-00FF'), '.x { pointer-events: none; } interactive');
    expect(out).not.toContain('@font-face');
  });

  it('keeps a face whose range it cannot read', () => {
    expect(cutFontFaces(face('Inter', 'bogus'), 'Inter x')).toContain('bogus');
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

describe('the record of files a render could not carry', () => {
  it('round-trips through the embedded source, and is left out when empty', () => {
    const files = [{path: 'page.tsx', bytes: Buffer.from('export default () => null;\n')}];
    const read = readSourceBlock(`<body>${sourceBlock('page.tsx', files, {notCarried: ['../shared/rows.ts', 'site.scss']})}</body>`);
    expect(read).toMatchObject({found: true, source: {notCarried: ['../shared/rows.ts', 'site.scss']}});
    const none = readSourceBlock(`<body>${sourceBlock('page.tsx', files, {notCarried: []})}</body>`);
    expect(/** @type {any} */ (none).source).not.toHaveProperty('notCarried');
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

describe('drawing the overlays a page opens', () => {
  it('draws each part alone: a part on the document hears no press on another part', async () => {
    const dir = makeLinkedFixture('astryx-render-alone-', [
      'react',
      'react-dom',
    ]);
    try {
      const heard = path.join(dir, 'heard.txt');
      fs.writeFileSync(heard, '');
      const file = path.join(dir, 'page.mjs');
      fs.writeFileSync(
        file,
        `import * as React from 'react';
import * as fs from 'node:fs';
const h = React.createElement;
// A part that listens on the document, as an outside press does.
function Listener() {
  React.useEffect(() => {
    const on = () => fs.appendFileSync(${JSON.stringify(heard)}, 'x');
    document.addEventListener('pointerdown', on);
    return () => document.removeEventListener('pointerdown', on);
  }, []);
  return h('div', null, 'listens');
}
// A part with controls the drawing presses.
const Opener = () => h('div', null, ...[1, 2, 3].map(i => h('button', {key: i, 'aria-haspopup': 'menu', 'aria-expanded': 'false'}, 'open ' + i)));
export function openLayerElements() {
  return [h(Listener), h(Opener)];
}
export default function Page() {
  return h('div', null, h(Listener), h(Opener));
}
`,
      );
      // The page reads Node's fs, which no script in a browser can, so only
      // its markup is drawn.
      await renderPage(file, {openLayers: true, markupOnly: true, timeoutMs: 60_000});
      expect(fs.readFileSync(heard, 'utf8')).toBe('');
    } finally {
      removeLinkedFixture(dir);
    }
  }, 120_000);
});

describe('withCarriedPaths', () => {
  it('rewrites an image path the script names, and leaves text the page shows as written', () => {
    const rewrites = new Map([['./photo.png', 'data:image/png;base64,AAAA']]);
    expect(
      withCarriedPaths(`a({src:"./photo.png",children:"./photo.png"});b('./photo.png');c({children: \`./photo.png\`})`, rewrites),
    ).toBe(
      `a({src:"data:image/png;base64,AAAA",children:"./photo.png"});b('data:image/png;base64,AAAA');c({children: \`./photo.png\`})`,
    );
  });
});

describe('withUncarriedImages', () => {
  it('writes in the data: URI of an image the embedded source does not carry', () => {
    const kept = 'a'.repeat(64);
    const left = 'b'.repeat(64);
    const script = `x=c("${kept}","data:image/png;base64");y=c('${left}','data:image/png;base64')`;
    expect(
      withUncarriedImages(script, new Set([kept]), (sha, prefix) => (sha === left ? `${prefix},QUJD` : null)),
    ).toBe(`x=c("${kept}","data:image/png;base64");y="data:image/png;base64,QUJD"`);
  });

  it('reads a script with a long run of name characters in one pass', () => {
    const left = 'b'.repeat(64);
    // A large string in the page (a minified data blob) is one long run of
    // name characters; a reader that starts a match at each of them takes
    // minutes on this.
    const script = `s="${'a1'.repeat(200_000)}";y=c("${left}","data:image/png;base64")`;
    const started = performance.now();
    const out = withUncarriedImages(script, new Set(), () => 'data:image/png;base64,QUJD');
    expect(performance.now() - started).toBeLessThan(2000);
    expect(out.endsWith('y="data:image/png;base64,QUJD"')).toBe(true);
  });
});

describe('a name that reads as configuration', () => {
  it('is left out, and the name its warning offers is carried', () => {
    for (const name of [
      'chart.config.json',
      'test.config.json',
      'package.json',
      'tsconfig.app.json',
      'yarn-lock.json',
      'vite.config.ts',
      'test.config.ts',
    ]) {
      expect(embeddedPathProblem(`data/${name}`)?.toolConfig, name).toBe(true);
      expect(embeddedPathProblem(`data/${carriedNameFor(`data/${name}`).name}`), name).toBeNull();
    }
  });

  it('offers a rename for a *.config.json, and a file of its own for a tool\'s file', () => {
    expect(carriedNameFor('chart.config.json')).toEqual({action: 'rename', name: 'chart-data.json'});
    expect(carriedNameFor('data/a.b.config.json')).toEqual({action: 'rename', name: 'a-b-data.json'});
    for (const name of ['package.json', 'tsconfig.json', 'package-lock.json', 'vite.config.ts']) {
      expect(carriedNameFor(name).action, name).toBe('move');
    }
    expect(carriedNameFor('package.json').name).toBe('page-data.json');
    expect(carriedNameFor('vite.config.ts').name).toBe('page-data.ts');
  });

  it('never offers a name a runner picks up: test.config.ts gets page-data.ts, not test-data.ts', () => {
    expect(embeddedPathProblem('test-data.ts')).not.toBeNull();
    expect(carriedNameFor('test.config.ts')).toEqual({action: 'move', name: 'page-data.ts'});
  });

  it('is not the reason a runner file or a dotfile is left out', () => {
    expect(embeddedPathProblem('a.config.test.ts')?.toolConfig).toBeUndefined();
    expect(embeddedPathProblem('.tool/x.config.json')?.toolConfig).toBeUndefined();
  });
});
