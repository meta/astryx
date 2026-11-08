// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {
  cssPropertyVocabulary,
  importantDeclarationLines,
  isCssPropertyName,
} from './setup-important.mjs';

const lines = (file, source) =>
  [...importantDeclarationLines(file, source)].sort(
    (left, right) => left - right,
  );

/**
 * The comment that made a real operator run fail three of its cells.
 *
 * This is the shape a `guest-contained` executor produces when it follows the
 * guidance: it documents the portal tradeoff it accepted and lists the things
 * it deliberately did *not* do, one of which is reaching for `!important`. The
 * lexical check read the word and failed the run for saying it.
 */
const GUEST_CONTAINED_COMMENT = `import {useEffect} from 'react';
import {Theme, neutralTheme} from '@astryxdesign/core';

/**
 * Keep the design system inside this region.
 *
 * A root provider syncs \`data-astryx-theme\` onto the document element, and the
 * theme's \`@scope\` rules key off that attribute, so leaving it in place themes
 * the whole document. There is no supported prop that opts out; removing the
 * attribute and observing for its return is a workaround, not a configuration.
 *
 * TRADEOFF: with the attribute gone, content portaled to \`document.body\` falls
 * outside every scope root and loses its theme tokens. This region renders a
 * button and its tooltip, both of which stay in-subtree, so containment wins
 * here. If it ever needs toasts, wrap it in a layer provider that keeps the
 * viewport in the subtree, or accept an unthemed toast — do not re-add a global
 * attribute under another name, copy theme variables onto \`body\`, or paper over
 * it with \`!important\` overrides.
 */
export function AstryxRegion({mode, children}) {
  useEffect(() => {
    const root = document.documentElement;
    const strip = () => root.removeAttribute('data-astryx-theme');
    strip();
    const observer = new MutationObserver(strip);
    observer.observe(root, {attributes: true, attributeFilter: ['data-astryx-theme']});
    return () => observer.disconnect();
  }, []);
  return (
    <Theme theme={neutralTheme} mode={mode}>
      {children}
    </Theme>
  );
}
`;
describe('CSS property vocabulary', () => {
  it('reads the browser property list rather than a hand-written one', () => {
    const vocabulary = cssPropertyVocabulary();
    expect(vocabulary).not.toBeNull();
    // Large enough to be the real list, and carrying both spellings.
    expect(vocabulary.size).toBeGreaterThan(400);
    expect(vocabulary.has('backgroundColor')).toBe(true);
    expect(vocabulary.has('background-color')).toBe(true);
    // Including the ones a hand-written list would have missed.
    expect(isCssPropertyName('scrollbarGutter')).toBe(true);
    expect(isCssPropertyName('--brand-accent')).toBe(true);
    expect(isCssPropertyName('label')).toBe(false);
  });
});

describe('!important in stylesheets', () => {
  it.each([
    {name: 'a declaration', css: '.host { color: red !important; }', at: [1]},
    {
      name: 'a declaration nested in an at-rule',
      css: '@media (min-width: 40rem) {\n  .host {\n    gap: 0 !important;\n  }\n}',
      at: [3],
    },
  ])('finds $name', ({css, at}) => {
    expect(lines('host.css', css)).toEqual(at);
  });

  it.each([
    {
      name: 'a comment warning against it',
      css: '/* Never use !important in this file. */\n.host { color: red; }',
    },
    {
      name: 'a value string that merely spells it',
      css: '.host::after { content: "!important"; }',
    },
  ])('ignores $name', ({css}) => {
    expect(lines('host.css', css)).toEqual([]);
  });

  it('falls back to a conservative scan when the parser cannot read the file', () => {
    // SCSS line comments defeat the CSS parser; the fallback must still find
    // the declaration and must still skip the comment.
    const scss =
      '// !important is banned\n.host {\n  color: red !important;\n}';
    expect(lines('host.scss', scss)).toEqual([3]);
  });

  it('does not exempt a stylesheet because a comment mentions the flag', () => {
    const css = [
      '/* The design system forbids !important; this file predates that. */',
      '.host {',
      '  color: red !important;',
      '}',
    ].join('\n');
    expect(lines('host.css', css)).toEqual([3]);
  });
});

describe('!important in scripts', () => {
  it('does not fire on the comment that failed real runs', () => {
    expect(lines('AstryxRegion.tsx', GUEST_CONTAINED_COMMENT)).toEqual([]);
  });

  it.each([
    {
      name: 'a JSDoc block',
      source:
        '/**\n * Do not paper over it with\n * !important.\n */\nexport const a = 1;',
    },
    {
      name: 'a prose string',
      source: 'export const RULE = "reviewers reject !important overrides";',
    },
  ])('ignores $name', ({source}) => {
    expect(lines('App.tsx', source)).toEqual([]);
  });

  it('finds a declaration assembled across a template interpolation', () => {
    // The parser sees two literal fragments, neither of which carries a whole
    // declaration; the flag is only visible once they are read as one value.
    expect(
      lines(
        'App.tsx',
        'const sheet = `.host { color: ${token} !important; }`;',
      ),
    ).toEqual([1]);
  });
});

describe('!important in markup', () => {
  it('finds a style attribute and ignores an HTML comment', () => {
    const html = [
      '<!-- !important is banned in this template -->',
      '<div style="color: red !important">host</div>',
    ].join('\n');
    expect(lines('index.html', html)).toEqual([2]);
  });

  it.each([
    {
      name: 'a style element',
      html: '<style>\n  .host { color: red !important; }\n</style>',
    },
    {
      name: 'a script element',
      html: '<script>\n  el.style.setProperty("color", "red", "important");\n</script>',
    },
  ])('routes $name to the analyzer that owns it', ({html}) => {
    expect(lines('index.html', html)).toEqual([2]);
  });
});

/**
 * Every extension the detector claims to route, in one table.
 *
 * `.tsx`, `.css` and `.html` above are the shapes the real runs produced; the
 * routing table also claims plain and module JavaScript, JSX, and the two
 * single-file component formats, and an extension that falls through it is
 * scanned lexically instead — which is the false positive this whole file
 * exists to prevent. Each row is the pair that matters: the comment alone says
 * nothing, and the same comment above a real override still reports the
 * override.
 */
describe('the extensions the routing table claims', () => {
  it.each([
    {
      file: 'setup.js',
      comment: '// Do not paper over it with !important.',
      applied: 'const patch = {color: "red !important"};',
    },
    {
      file: 'Region.jsx',
      comment: '// The guidance says never to reach for !important.',
      applied:
        'export const Badge = () => <b style={{color: "red !important"}} />;',
    },
    {
      file: 'theme.mjs',
      comment: '// !important is banned in this file.',
      applied: 'root.style.setProperty("color", "red", "important");',
    },
    {
      file: 'theme.cjs',
      comment: '/* Reviewers reject !important overrides. */',
      applied: 'module.exports = `.host { color: red !important; }`;',
    },
    {
      file: 'App.vue',
      comment: '<!-- !important is banned in this template -->',
      applied: '<div style="color: red !important">host</div>',
    },
    {
      file: 'App.svelte',
      comment: '<!-- reviewers reject !important -->',
      applied: '<style>.host { color: red !important; }</style>',
    },
  ])(
    'reads a comment and an override apart in $file',
    ({file, comment, applied}) => {
      expect(lines(file, comment)).toEqual([]);
      expect(lines(file, `${comment}\n${applied}`)).toEqual([2]);
    },
  );
});

/**
 * Mutations of the real false-positive fixture.
 *
 * Ignoring comments and prose is only safe if a real override cannot hide in
 * one. Each mutation keeps the comment exactly as the executor wrote it and
 * adds a genuine override through one of the three ways a literal counts as
 * applied CSS — a style-object value, a stylesheet string, and the
 * `setProperty` priority argument the old lexical scan could not see at all.
 */
describe('mutations of the real false-positive fixture', () => {
  it.each([
    {
      name: 'a style object below the comment',
      extra: 'const patch = {color: "red !important"};\n',
    },
    {
      name: 'an injected stylesheet',
      extra: 'const sheet = `.host { color: red !important; }`;\n',
    },
    {
      name: 'a runtime setProperty',
      extra: 'root.style.setProperty("color", "red", "important");\n',
    },
  ])('still catches $name', ({extra}) => {
    const found = lines(
      'AstryxRegion.tsx',
      `${GUEST_CONTAINED_COMMENT}${extra}`,
    );
    expect(found).toHaveLength(1);
    // The finding is on the added code, never on the comment above it.
    expect(found[0]).toBeGreaterThan(
      GUEST_CONTAINED_COMMENT.split('\n').length - 2,
    );
  });

  it.each([
    {
      name: 'directly below a comment that disclaims it',
      source:
        '/** Do not paper over it with !important. */\nconst patch = {color: "red !important"};',
      at: [2],
    },
    {
      name: 'on the same line as a comment that excuses it',
      source:
        'const patch = {color: "red !important"}; // sanctioned !important',
      at: [1],
    },
  ])('catches an override written $name', ({source, at}) => {
    expect(lines('AstryxRegion.tsx', source)).toEqual(at);
  });
});

/**
 * Comment delimiters that are not a comment.
 *
 * `<!--` opens a comment only where markup TEXT can appear. Inside `<script>`
 * and `<style>`, and inside a tag's attribute values, those four characters are
 * ordinary content. Blanking them wherever they occurred was not a false
 * positive but a way past this check: a script could carry an override inside a
 * comment-shaped string, have the scan agree not to look at it, and then apply
 * it. Two things made that work, and both are closed here — the markup walk
 * (`setup-markup.mjs`) and the declaration match, which no longer requires the
 * property to sit at the start of the text.
 */
describe('!important hidden behind comment delimiters', () => {
  const CLOAK = [
    '<div id="root"></div>',
    '<script>',
    "  const cloak = '<!-- color: red !important -->';",
    '  document.body.style.cssText = cloak.slice(4, -3).trim();',
    '</script>',
    '',
  ].join('\n');

  it('catches a comment-shaped string a script reconstructs and applies', () => {
    expect(lines('index.html', CLOAK)).toEqual([3]);
  });

  it.each([
    {
      name: 'a template literal',
      source: [
        '<script>',
        '  const parts = [`<!-- color: red !important -->`];',
        '  el.style.cssText = parts[0].slice(4, -3);',
        '</script>',
        '',
      ].join('\n'),
    },
    {
      name: 'a style attribute on the same tag',
      source:
        '<div data-note="<!-- color: red !important -->" style="color: red !important"></div>\n',
    },
    {
      name: 'a style block',
      source:
        '<style>\n  <!-- .host { color: red !important; } -->\n</style>\n',
    },
  ])('catches it in $name', ({source}) => {
    expect(lines('index.html', source).length).toBeGreaterThan(0);
  });

  it('catches the same cloak in a plain script file', () => {
    // The declaration anchor, not the markup walk, is what covers this one.
    expect(
      lines(
        'boot.ts',
        "const cloak = '<!-- color: red !important -->';\nel.style.cssText = cloak.slice(4, -3);\n",
      ),
    ).toEqual([1]);
  });

  // Controls: a REAL markup comment is still prose, and still exempt.
  it.each([
    {
      name: 'a comment that names the flag',
      source:
        '<!-- color: red !important is banned here -->\n<div id="root"></div>\n',
    },
    {
      name: 'a comment that wraps a script applying it',
      source: [
        '<!--',
        '<script>',
        "  el.style.cssText = 'color: red !important';",
        '</script>',
        '-->',
        '',
      ].join('\n'),
    },
    {
      name: 'a comment that wraps a style block',
      source: '<!--\n<style>.host { color: red !important; }</style>\n-->\n',
    },
  ])('stays silent for $name', ({source}) => {
    expect(lines('index.html', source)).toEqual([]);
  });

  it('reads a real comment and a cloaked override apart', () => {
    const source = [
      '<!-- color: red !important is banned here -->',
      '<script>',
      "  el.style.cssText = '<!-- color: red !important -->'.slice(4, -3);",
      '</script>',
      '',
    ].join('\n');

    expect(lines('index.html', source)).toEqual([3]);
  });
});

/**
 * Which `style=` is a style attribute.
 *
 * The tag is tokenized rather than pattern-matched, because a pattern gets both
 * halves wrong: it misses an UNQUOTED value (valid HTML, and a real override
 * going unseen), and it matches any attribute whose name merely ends in
 * `style`, reporting findings against markup the browser never applies as CSS.
 */
describe('!important in a style attribute', () => {
  it.each([
    {
      name: 'an unquoted value',
      source: '<div style=color:red!important></div>\n',
    },
    {
      name: 'an unquoted value followed by another attribute',
      source: '<div style=color:red!important id=host></div>\n',
    },
    {
      name: 'a single-quoted value',
      source: "<div style='color: red !important'></div>\n",
    },
    {
      name: 'a value with spaces around the equals sign',
      source: '<div style = "color: red !important"></div>\n',
    },
    {
      name: 'an attribute after a bare (valueless) one',
      source: '<div hidden style="color: red !important"></div>\n',
    },
    {
      name: 'a value on a self-closing tag',
      source: '<img style="color: red !important" />\n',
    },
    {
      name: 'an uppercase attribute name',
      source: '<div STYLE="color: red !important"></div>\n',
    },
  ])('catches $name', ({source}) => {
    expect(lines('index.html', source)).toEqual([1]);
  });

  it.each([
    {
      name: 'data-style',
      source: '<div data-style="color: red !important"></div>\n',
    },
    {
      name: 'my-style',
      source: '<div my-style="color: red !important"></div>\n',
    },
    {
      name: 'stylesheet',
      source: '<div stylesheet="color: red !important"></div>\n',
    },
    {
      name: 'a style= written in text content',
      source: '<p>write style="color: red !important" to override</p>\n',
    },
    {
      name: 'a style= inside another attribute value',
      source: '<div title=\'style="color: red !important"\'></div>\n',
    },
  ])('does not treat $name as a style attribute', ({source}) => {
    expect(lines('index.html', source)).toEqual([]);
  });

  it('reads a quoted value whole, so a > inside it does not end the tag', () => {
    const source = '<div title="a > b" style="color: red !important"></div>\n';

    expect(lines('index.html', source)).toEqual([1]);
  });

  it('finds the override on its own line in a multi-line tag', () => {
    const source = [
      '<div',
      '  id="host"',
      '  style="color: red !important"',
      '></div>',
      '',
    ].join('\n');

    expect(lines('index.html', source)).toEqual([3]);
  });
});

/**
 * Prose that spells a declaration, against code that applies one.
 *
 * Characters spelling `color: red !important` are not an override — guidance
 * telling an executor not to write one spells it too, and failing a run for
 * that is the exact fault #5856 fixed. A bare declaration therefore counts only
 * where something APPLIES it; a whole braced rule is a stylesheet on its face
 * and counts wherever it is written.
 */
describe('a declaration in prose vs a declaration that is applied', () => {
  it.each([
    {
      name: 'a guidance constant naming the flag',
      source:
        "export const RULE = 'Never write color: red !important in host code';\n",
    },
    {
      name: 'the same guidance in double quotes',
      source:
        'export const RULE = "reviewers reject color: red !important overrides";\n',
    },
    {
      name: 'a JSDoc block naming the flag',
      source:
        '/** Never write color: red !important. */\nexport const a = 1;\n',
    },
    {
      name: 'a message bound to a name no style code reads',
      source:
        "const RULE = 'color: red !important is banned';\nel.style.cssText = approvedStyles;\n",
    },
    {
      name: 'a declaration in a thrown error message',
      source:
        "throw new Error('do not set color: red !important on the host');\n",
    },
  ])('stays silent for $name', ({source}) => {
    expect(lines('guidance.ts', source)).toEqual([]);
  });

  it.each([
    {
      name: 'assigned straight to cssText',
      source: "el.style.cssText = 'color: red !important';\n",
      at: [1],
    },
    {
      name: 'reassembled out of a cloaked string',
      source:
        "const cloak = '<!-- color: red !important -->';\nel.style.cssText = cloak.slice(4, -3);\n",
      at: [1],
    },
    {
      name: 'reassembled through setAttribute',
      source:
        "const cloak = 'xx color: red !important';\nel.setAttribute('style', cloak.slice(3));\n",
      at: [1],
    },
    {
      name: 'reassembled through insertRule',
      source:
        "const cloak = 'xx .host { color: red !important; }';\nsheet.insertRule(cloak.slice(3));\n",
      at: [1],
    },
    {
      name: 'a template applied to cssText',
      source: 'const t = `color: ${v} !important`;\nel.style.cssText = t;\n',
      at: [1],
    },
    {
      name: 'a whole rule, which is a stylesheet on its face',
      source: 'const sheet = `.host { color: red !important; }`;\n',
      at: [1],
    },
    {
      name: 'a declaration handed to setProperty',
      source: "el.style.setProperty('color', 'red !important');\n",
      at: [1],
    },
  ])('catches an override $name', ({source, at}) => {
    expect(lines('boot.ts', source)).toEqual(at);
  });

  it('catches the applied override and not the prose beside it', () => {
    const source = [
      "export const RULE = 'Never write color: red !important in host code';",
      "const cloak = '<!-- color: red !important -->';",
      'el.style.cssText = cloak.slice(4, -3);',
      '',
    ].join('\n');

    expect(lines('boot.ts', source)).toEqual([2]);
  });
});

/**
 * The same rule for template literals.
 *
 * A template is a string like any other: backticks around guidance do not make
 * it CSS. The sink/binding evidence a plain literal needs applies here too, and
 * a template carrying a whole braced rule is still a stylesheet on its face.
 */
describe('a declaration-shaped template in prose vs applied', () => {
  it.each([
    {
      name: 'a guidance constant in backticks',
      source:
        'export const RULE = `Never write color: red !important in host code`;\n',
    },
    {
      name: 'guidance bound to a name no style code reads',
      source:
        'const RULE = `color: red !important is banned`;\nel.style.cssText = approvedStyles;\n',
    },
    {
      name: 'guidance in a thrown error',
      source: 'throw new Error(`do not set color: red !important`);\n',
    },
  ])('stays silent for $name', ({source}) => {
    expect(lines('guidance.ts', source)).toEqual([]);
  });

  it.each([
    {
      name: 'assigned to cssText through a binding',
      source: 'const t = `color: red !important`;\nel.style.cssText = t;\n',
      at: [1],
    },
    {
      name: 'written inline at cssText, across an interpolation',
      source: 'el.style.cssText = `color: ${value} !important`;\n',
      at: [1],
    },
    {
      name: 'a cloaked template reassembled into cssText',
      source:
        'const cloak = `<!-- color: red !important -->`;\nel.style.cssText = cloak.slice(4, -3);\n',
      at: [1],
    },
    {
      name: 'a cloaked template handed to insertRule',
      source:
        'const cloak = `xx .host { color: red !important; }`;\nsheet.insertRule(cloak.slice(3));\n',
      at: [1],
    },
    {
      name: 'a cloaked template handed to setAttribute',
      source:
        "const cloak = `xx color: red !important`;\nel.setAttribute('style', cloak.slice(3));\n",
      at: [1],
    },
    {
      name: 'a whole rule, which is a stylesheet on its face',
      source: 'const sheet = `.host { color: red !important; }`;\n',
      at: [1],
    },
    {
      name: 'a value in a style object',
      source: 'const patch = {color: `red !important`};\n',
      at: [1],
    },
  ])('catches a template $name', ({source, at}) => {
    expect(lines('boot.ts', source)).toEqual(at);
  });

  it('catches the applied template and not the guidance beside it', () => {
    const source = [
      'export const RULE = `Never write color: red !important in host code`;',
      'const applied = `color: red !important`;',
      'el.style.cssText = applied;',
      '',
    ].join('\n');

    expect(lines('boot.ts', source)).toEqual([2]);
  });
});

/**
 * Reachability is keyed on the BINDING, not the name.
 *
 * Two functions may each declare `value`. Only the one whose `value` a CSS sink
 * reads applies anything; reporting the other is the prose false positive all
 * over again, and a name-keyed check cannot tell them apart.
 */
describe('sink reachability resolves bindings, not names', () => {
  it.each([
    {
      name: 'sibling functions that each declare the name',
      source: [
        'function docs() {',
        '  const value = `Never write color: red !important`;',
        '  return value;',
        '}',
        'function apply() {',
        '  const value = approvedStyles;',
        '  el.style.cssText = value;',
        '}',
        '',
      ].join('\n'),
    },
    {
      name: 'sibling blocks that each declare the name',
      source: [
        '{',
        '  const v = `color: red !important is banned`;',
        '}',
        '{',
        '  const v = approvedStyles;',
        '  el.style.cssText = v;',
        '}',
        '',
      ].join('\n'),
    },
    {
      name: 'module-scope prose shadowed by a function-scope sink',
      source: [
        'const v = `never write color: red !important`;',
        'function apply() {',
        '  const v = approvedStyles;',
        '  el.style.cssText = v;',
        '}',
        '',
      ].join('\n'),
    },
    {
      name: 'a parameter shadowing the prose binding',
      source: [
        'const v = `never write color: red !important`;',
        'function apply(v) {',
        '  el.style.cssText = v;',
        '}',
        '',
      ].join('\n'),
    },
  ])(
    'stays silent when the sink reads a different binding: $name',
    ({source}) => {
      expect(lines('guidance.ts', source)).toEqual([]);
    },
  );

  it.each([
    {
      name: 'declared and applied in the same function',
      source: [
        'function apply() {',
        '  const value = `color: red !important`;',
        '  el.style.cssText = value;',
        '}',
        '',
      ].join('\n'),
      at: [2],
    },
    {
      name: 'declared in a function and applied from a nested block',
      source: [
        'function apply() {',
        '  const value = `color: red !important`;',
        '  if (enabled) {',
        '    el.style.cssText = value;',
        '  }',
        '}',
        '',
      ].join('\n'),
      at: [2],
    },
    {
      name: 'a var hoisted out of the block it was written in',
      source: [
        'function apply() {',
        '  if (enabled) {',
        '    var value = `color: red !important`;',
        '  }',
        '  el.style.cssText = value;',
        '}',
        '',
      ].join('\n'),
      at: [3],
    },
    {
      name: 'assigned to an already-declared binding',
      source: [
        'let value;',
        'value = `color: red !important`;',
        'el.style.cssText = value;',
        '',
      ].join('\n'),
      at: [2],
    },
    {
      name: 'an inner shadow that does not hide the applied outer binding',
      source: [
        'const v = `color: red !important`;',
        'el.style.cssText = v;',
        'function unrelated() {',
        '  const v = somethingElse;',
        '  return v;',
        '}',
        '',
      ].join('\n'),
      at: [1],
    },
  ])('still catches an override $name', ({source, at}) => {
    expect(lines('boot.ts', source)).toEqual(at);
  });

  it('reports only the applied binding when both names are the same', () => {
    const source = [
      'const v = `never write color: red !important`;',
      'function apply() {',
      '  const v = `color: red !important`;',
      '  el.style.cssText = v;',
      '}',
      '',
    ].join('\n');

    expect(lines('boot.ts', source)).toEqual([3]);
  });
});

/**
 * Parser precision in the sink analysis: which member accesses are sinks, which
 * references are uses of the value, and what one redeclared binding means.
 */
describe('sink analysis reads member access precisely', () => {
  it.each([
    {
      name: 'a computed sink property',
      source:
        "const cloak = 'xx color: red !important';\nel.style['cssText'] = cloak.slice(3);\n",
    },
    {
      name: 'a computed sink written directly',
      source: "el.style['cssText'] = 'color: red !important';\n",
    },
    {
      name: 'a value kept in play by trim()',
      source:
        "const cloak = ' color: red !important ';\nel.style.cssText = cloak.trim();\n",
    },
    {
      name: 'a value kept in play by replace()',
      source:
        "const cloak = 'XXcolor: red !important';\nel.style.cssText = cloak.replace('XX', '');\n",
    },
  ])('catches $name', ({source}) => {
    expect(lines('boot.ts', source)).toEqual([1]);
  });

  it.each([
    {
      name: 'a length read that only decides a branch',
      source:
        "const guidance = 'never write color: red !important';\nel.style.cssText = guidance.length > 0 ? approved : fallback;\n",
    },
    {
      name: 'a property read stored before an unrelated sink',
      source:
        "const guidance = 'never write color: red !important';\nconst size = guidance.length;\nel.style.cssText = approved;\n",
    },
    {
      name: 'a same-named member of an unrelated object',
      source:
        "const guidance = 'never write color: red !important';\nel.style.cssText = config.guidance;\n",
    },
  ])('stays silent for $name', ({source}) => {
    expect(lines('guidance.ts', source)).toEqual([]);
  });

  it('treats a redeclared var as one binding, reporting each CSS write', () => {
    // Which write reaches the sink is a question of flow, so the binding is
    // reported rather than a guessed order — see the file header.
    const source = [
      'function apply() {',
      "  var value = 'color: red !important';",
      "  var value = 'color: blue !important';",
      '  el.style.cssText = value;',
      '}',
      '',
    ].join('\n');

    expect(lines('boot.ts', source)).toEqual([2, 3]);
  });

  it('still separates a redeclared var from an unrelated same name', () => {
    const source = [
      'function docs() {',
      "  var value = 'never write color: red !important';",
      "  var value = 'nor color: blue !important';",
      '  return value;',
      '}',
      'function apply() {',
      '  el.style.cssText = approved;',
      '}',
      '',
    ].join('\n');

    expect(lines('guidance.ts', source)).toEqual([]);
  });
});

/**
 * Raw-text elements are `script` and `style` EXACTLY.
 *
 * `<style-note>` is an ordinary custom element whose content is markup. A
 * prefix test reads it as a raw-text opener and then hunts for a `</style>`
 * that never arrives, so the rest of the document is swallowed as one element
 * body — every attribute, comment and override after it goes unexamined.
 */
describe('custom elements whose names begin with a raw-text tag', () => {
  it.each([
    {name: 'style-note', markup: '<style-note>see the docs</style-note>'},
    {name: 'script-note', markup: '<script-note>see the docs</script-note>'},
    {name: 'styled-box', markup: '<styled-box>content</styled-box>'},
  ])('does not let <$name> swallow the rest of the document', ({markup}) => {
    const source = `${markup}\n<div style="color: red !important"></div>\n`;

    expect(lines('index.html', source)).toEqual([2]);
  });

  it('keeps finding real comments after a custom element', () => {
    const source = [
      '<style-note>see the docs</style-note>',
      '<!-- color: red !important is banned -->',
      '<div style="color: red !important"></div>',
      '',
    ].join('\n');

    // The comment is prose; only the real attribute is an override.
    expect(lines('index.html', source)).toEqual([3]);
  });

  it('still reads a real style or script element', () => {
    expect(
      lines(
        'index.html',
        '<style>\n.host { color: red !important; }\n</style>\n',
      ),
    ).toEqual([2]);
    expect(
      lines(
        'index.html',
        '<style type="text/css">.host { color: red !important; }</style>\n',
      ),
    ).toEqual([1]);
  });
});
