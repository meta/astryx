// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file setup-comments.test.mjs
 *
 * The contract these cases hold to: a comment stops being code, and NOTHING
 * else does. Both halves matter — the first is why the escape hatches stopped
 * failing runs for prose, and the second is why blanking them cannot be used to
 * hide a real hatch behind something comment-shaped.
 */

import {describe, expect, it} from 'vitest';
import {commentSpans} from './setup-comments.mjs';

/** The text with its comments blanked, exactly as the hatch scan sees it. */
function masked(relativePath, text) {
  let out = text;
  for (const span of commentSpans(relativePath, text)) {
    // Line boundaries survive blanking — the scan works line by line.
    out =
      out.slice(0, span.start) +
      out.slice(span.start, span.end).replace(/[^\n]/g, ' ') +
      out.slice(span.end);
  }
  return out;
}

describe('commentSpans — stylesheets', () => {
  it('blanks a comment and keeps the declaration beside it', () => {
    const css =
      '.a {\n  /* all: unset would be a blanket reset */\n  all: unset;\n}\n';

    const result = masked('src/index.css', css);

    expect(result).not.toMatch(/all: unset would/);
    expect(result).toContain('all: unset;');
  });

  it('blanks a comment that trails real code on one line', () => {
    const css = '.a { all: unset; } /* deliberate */\n';

    const result = masked('src/index.css', css);

    expect(result).toContain('all: unset;');
    expect(result).not.toContain('deliberate');
  });

  it('does not treat a comment opener inside a quoted value as a comment', () => {
    // A lexical scan would blank from `/*` to end of file and swallow the real
    // reset two lines down.
    const css = '.a {\n  content: "/*";\n}\n.b {\n  all: unset;\n}\n';

    expect(masked('src/index.css', css)).toContain('all: unset;');
  });

  it('reads .scss, .less, and .pcss the same way', () => {
    for (const file of ['src/a.scss', 'src/a.less', 'src/a.pcss']) {
      expect(
        masked(file, '/* color-scheme: light */\n.a { color: red; }\n'),
      ).not.toContain('color-scheme');
    }
  });

  it('reports nothing for a stylesheet postcss cannot parse', () => {
    // Fail closed: an unreadable file keeps every character subject to the scan.
    expect(
      commentSpans('src/broken.css', '@media (min-width: 10px {\n'),
    ).toEqual([]);
  });
});

describe('commentSpans — scripts', () => {
  it('blanks line, block, and JSDoc comments', () => {
    const source = [
      '// darkMode: false is what the guidance tells you not to write',
      '/* nor color-scheme: light only */',
      '/**',
      ' * And not `all: unset` either.',
      ' */',
      'export const config = {};',
      '',
    ].join('\n');

    const result = masked('src/config.ts', source);

    expect(result).not.toMatch(/darkMode: false/);
    expect(result).not.toMatch(/color-scheme: light only/);
    expect(result).not.toMatch(/all: unset/);
    expect(result).toContain('export const config = {};');
  });

  it('keeps a real declaration written on the same line as its comment', () => {
    const source = 'export const config = {darkMode: false}; // host default\n';

    const result = masked('src/config.ts', source);

    expect(result).toContain('darkMode: false');
    expect(result).not.toContain('host default');
  });

  it('does not read `//` inside a string as a comment', () => {
    // The URL is not a comment, so the code after it stays code.
    const source =
      "const docs = 'https://example.com';\nexport const config = {darkMode: false};\n";

    expect(masked('src/config.ts', source)).toContain('darkMode: false');
  });

  it('blanks a JSX comment but not JSX text', () => {
    const source = [
      'export function Note() {',
      '  return (',
      '    <p>',
      '      {/* darkMode: false belongs to the host */}',
      '      See https://example.com for darkMode: false guidance',
      '    </p>',
      '  );',
      '}',
      '',
    ].join('\n');

    const result = masked('src/Note.tsx', source);

    expect(result).not.toContain('belongs to the host');
    // JSX text is content, not a comment: the `//` in the URL must not blank
    // the rest of the line.
    expect(result).toContain('for darkMode: false guidance');
  });

  it('blanks a comment that trails the last statement', () => {
    const source = 'export const config = {};\n// color-scheme: light only\n';

    expect(masked('src/config.ts', source)).not.toContain('color-scheme');
  });

  it('reads .js, .jsx, .mjs, and .cjs too', () => {
    for (const file of ['a.js', 'a.jsx', 'a.mjs', 'a.cjs']) {
      expect(
        masked(`src/${file}`, '// all: unset\nmodule.exports = {};\n'),
      ).not.toContain('all: unset');
    }
  });
});

describe('commentSpans — markup', () => {
  it('blanks HTML comments and the comments inside style and script blocks', () => {
    const html = [
      '<!doctype html>',
      '<!-- all: unset is not allowed here -->',
      '<style>',
      '  /* nor color-scheme: light only */',
      '  .host { color: CanvasText; }',
      '</style>',
      '<script>',
      '  // and not darkMode: false',
      '  window.host = true;',
      '</script>',
      '',
    ].join('\n');

    const result = masked('index.html', html);

    expect(result).not.toContain('not allowed here');
    expect(result).not.toContain('color-scheme: light only');
    expect(result).not.toContain('darkMode: false');
    expect(result).toContain('.host { color: CanvasText; }');
    expect(result).toContain('window.host = true;');
  });

  it('leaves a real declaration in a style block alone', () => {
    const html = '<style>\n  /* a note */\n  .host { all: unset; }\n</style>\n';

    expect(masked('index.html', html)).toContain('all: unset;');
  });

  it('reads .vue and .svelte the same way', () => {
    for (const file of ['App.vue', 'App.svelte']) {
      expect(masked(file, '<!-- all: unset -->\n<div />\n')).not.toContain(
        'all: unset',
      );
    }
  });
});

/**
 * `<!--` opens a comment only where markup TEXT can appear. A flat scan for the
 * delimiters blanks the same characters wherever they occur, which is not a
 * false positive — it is a way to get a hatch past the check and then apply it.
 */
describe('commentSpans — markup delimiters that are not comments', () => {
  it('does not exempt a comment-shaped string a script reconstructs and applies', () => {
    const html = [
      '<div id="root"></div>',
      '<script>',
      "  const cloak = '<!-- all: unset -->';",
      '  document.body.style.cssText = cloak.slice(4, -3).trim();',
      '</script>',
      '',
    ].join('\n');

    const result = masked('index.html', html);

    expect(result).toContain('all: unset');
    expect(result).toContain('style.cssText');
  });

  it('does not exempt the delimiters inside a template literal either', () => {
    const html = [
      '<script>',
      '  const parts = [`<!-- darkMode: false -->`];',
      '  applyConfig(parts[0].slice(4, -3));',
      '</script>',
      '',
    ].join('\n');

    expect(masked('index.html', html)).toContain('darkMode: false');
  });

  it('does not exempt the delimiters inside an attribute value', () => {
    const html =
      '<div data-note="<!-- all: unset -->" style="all: unset"></div>\n';

    // A tag is skipped, never blanked, so the whole line survives.
    expect(masked('index.html', html)).toBe(html);
  });

  it('does not exempt the delimiters inside a style block', () => {
    // CSS has no `<!-- -->` comment; postcss owns this body and reports none.
    const html = '<style>\n  <!-- .host { all: unset; } -->\n</style>\n';

    expect(masked('index.html', html)).toContain('all: unset');
  });

  it('still exempts a real markup comment that wraps a script', () => {
    const html = [
      '<!--',
      '<script>',
      "  document.body.style.cssText = 'all: unset';",
      '</script>',
      '-->',
      '',
    ].join('\n');

    expect(masked('index.html', html)).not.toContain('all: unset');
  });

  it('still exempts a real markup comment beside a real script', () => {
    const html = [
      '<!-- all: unset is not allowed -->',
      '<script>',
      '  const config = {darkMode: false};',
      '</script>',
      '',
    ].join('\n');

    const result = masked('index.html', html);

    expect(result).not.toContain('is not allowed');
    expect(result).toContain('darkMode: false');
  });

  it('reads an unterminated <script> body as script', () => {
    // No closing tag: the rest of the file is script, and only its own
    // comments are exempt.
    const html = '<script>\n  // a note\n  const config = {darkMode: false};\n';

    const result = masked('index.html', html);

    expect(result).not.toContain('a note');
    expect(result).toContain('darkMode: false');
  });
});

describe('commentSpans — nothing is exempted on a guess', () => {
  it('reports nothing for an extension with no analyzer', () => {
    expect(commentSpans('notes.txt', '// all: unset\n')).toEqual([]);
    expect(commentSpans('README.md', '<!-- all: unset -->\n')).toEqual([]);
  });

  it('reports nothing for empty or non-string input', () => {
    expect(commentSpans('src/a.ts', '')).toEqual([]);
    expect(commentSpans('src/a.ts', undefined)).toEqual([]);
    expect(commentSpans('src/a.ts', null)).toEqual([]);
  });

  it('preserves offsets and line boundaries, so line numbers still line up', () => {
    const source =
      '/* one */\nconst a = 1; // two\n/* three\n   four */\nconst b = 2;\n';

    const result = masked('src/a.ts', source);

    expect(result).toHaveLength(source.length);
    expect(result.split('\n')).toHaveLength(source.split('\n').length);
    expect(result.split('\n')[1]).toContain('const a = 1;');
  });
});

/**
 * Tag boundaries, which the shared walk owns. A tag is skipped, never blanked,
 * so nothing written inside one is exempted — and the walk must find its end
 * correctly for the regions after it to line up.
 */
describe('commentSpans — tag boundaries', () => {
  it.each([
    {
      name: 'an unquoted attribute value',
      source: '<div style=color:red></div>\n',
    },
    {
      name: 'a bare attribute',
      source: '<div hidden style="all: unset"></div>\n',
    },
    {name: 'a self-closing tag', source: '<img style="all: unset" />\n'},
    {
      name: 'a > inside a quoted value',
      source: '<div title="a > b" data-x="<!-- all: unset -->"></div>\n',
    },
    {
      name: 'an attribute value holding comment delimiters',
      source: "<div title='<!-- all: unset -->'>text</div>\n",
    },
  ])('leaves $name fully visible', ({source}) => {
    expect(masked('index.html', source)).toBe(source);
  });

  it('still finds a real comment after a tag with tricky attributes', () => {
    const source =
      '<div title="a > b" style=color:red></div>\n<!-- all: unset -->\n';

    const result = masked('index.html', source);

    expect(result).not.toContain('all: unset');
    expect(result).toContain('title="a > b"');
  });
});
