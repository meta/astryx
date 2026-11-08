// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import jscodeshift from 'jscodeshift';
import {replaceDemoMedia, stripTemplateAssetRefs} from './template-adapter.mjs';

const PLACEHOLDER = stripTemplateAssetRefs("'/template-assets/x.png'").slice(
  1,
  -1,
);

describe('stripTemplateAssetRefs fixture references', () => {
  it('replaces an image with a self-contained placeholder', () => {
    expect(PLACEHOLDER).toMatch(/^data:image\/svg\+xml,[^\s'"`()]+$/u);
  });

  it.each([
    'https://cdn.example.com/template-assets/logo.png',
    '//cdn.example.com/template-assets/logo.png',
    '/my-app/template-assets/hero.jpg',
    './template-assets/hero.jpg',
    'template-assets/hero.jpg',
    '/template-assets-archive/hero.jpg',
    '@/template-assets/hero.jpg',
  ])('leaves %s untouched', value => {
    const source = `const src = '${value}';`;
    expect(stripTemplateAssetRefs(source)).toBe(source);
  });

  it.each([
    'import StarIcon from "./icons/star.svg";',
    '<Icon icon="/icons/star.svg" />',
    '<Button icon={StarIcon} />',
    "const icons = {star: 'heroicons:star'};",
  ])('leaves an icon outside the fixture namespace untouched: %s', source => {
    expect(stripTemplateAssetRefs(source)).toBe(source);
  });

  it.each([
    ['a subdirectory', '/template-assets/avatars/ada.png'],
    ['an @ in its name', '/template-assets/hero@2x.png'],
    ['a plus in its name', '/template-assets/cover+1.jpg'],
    ['an encoded space in its name', '/template-assets/hero%20wide.png'],
  ])('replaces a fixture with %s', (_, value) => {
    expect(stripTemplateAssetRefs(`<img src="${value}" />`)).toBe(
      `<img src="${PLACEHOLDER}" />`,
    );
  });

  it('replaces the whole reference, query and fragment included', () => {
    expect(
      stripTemplateAssetRefs("const hero = '/template-assets/hero.jpg?w=200';"),
    ).toBe(`const hero = '${PLACEHOLDER}';`);
    expect(
      stripTemplateAssetRefs("const clip = '/template-assets/clip.mp4#t=5';"),
    ).toBe("const clip = '';");
    expect(
      stripTemplateAssetRefs(
        "const hero = '/template-assets/a.png?f=/template-assets/b.png';",
      ),
    ).toBe(`const hero = '${PLACEHOLDER}';`);
  });

  it('classifies by the complete final suffix, ignoring case', () => {
    expect(
      stripTemplateAssetRefs("src: '/template-assets/Clip.Min.MP4',"),
    ).toBe("src: '',");
  });

  it.each([
    [
      'a CSS url()',
      "backgroundImage: 'url(/template-assets/hero.png)'",
      `backgroundImage: 'url(${PLACEHOLDER})'`,
    ],
    [
      'a srcset list',
      'srcSet="/template-assets/a.png 1x, /template-assets/a@2x.png 2x"',
      `srcSet="${PLACEHOLDER} 1x, ${PLACEHOLDER} 2x"`,
    ],
    [
      'an HTML string with escaped quotes',
      'const html = "<img src=\\"/template-assets/a.png\\">";',
      `const html = "<img src=\\"${PLACEHOLDER}\\">";`,
    ],
    [
      'JSX text',
      '<code>/template-assets/hero.png</code>',
      `<code>${PLACEHOLDER}</code>`,
    ],
    [
      'a sentence that quotes it',
      'const tip = "Replace \'/template-assets/hero.png\'.";',
      `const tip = "Replace '${PLACEHOLDER}'.";`,
    ],
    [
      'a url() inside a longer string',
      "const bg = 'url(/template-assets/a.png) + x';",
      `const bg = 'url(${PLACEHOLDER}) + x';`,
    ],
    [
      'a comment',
      '// hero: /template-assets/hero.png\n',
      `// hero: ${PLACEHOLDER}\n`,
    ],
    [
      'a sentence, keeping its punctuation',
      '// Uses /template-assets/a.png, then /template-assets/b.png.\n',
      `// Uses ${PLACEHOLDER}, then ${PLACEHOLDER}.\n`,
    ],
  ])('replaces a fixture inside %s', (_, source, expected) => {
    expect(stripTemplateAssetRefs(source)).toBe(expected);
  });

  it.each([
    '<Text>Put your images in /template-assets/ first.</Text>',
    "const note = 'Media: /template-assets/hero';",
    '// Demo images live under /template-assets and are replaced.\n',
    "const html = '<img src=/template-assets-archive/a.png>';",
  ])('leaves a mention in text that names no media file: %s', source => {
    expect(stripTemplateAssetRefs(source)).toBe(source);
  });

  it.each([
    "// Images come from `/template-assets/*` and '/template-assets/'.\nexport default function Page() {\n  return null;\n}\n",
    "/* Was '/template-assets/clip.bin'. */\nexport const x = 1;\n",
  ])('leaves a comment it would otherwise reject: %s', source => {
    expect(stripTemplateAssetRefs(source)).toBe(source);
  });

  it.each([
    [
      'no file suffix',
      "src: '/template-assets/hero',",
      '/template-assets/hero',
    ],
    ['no file name', "src: '/template-assets/',", '/template-assets/'],
    [
      'no path below it',
      "export const base = '/template-assets'; // base\n",
      '/template-assets',
    ],
  ])(
    'fails with the fixture path when a value has %s',
    (_, source, reference) => {
      expect(() => stripTemplateAssetRefs(source)).toThrow(
        `Unrecognized template asset format (none) for ${reference}`,
      );
    },
  );

  it.each([
    [
      'const src = `/template-assets/${name}.png`;',
      '/template-assets/${name}.png',
    ],
    ['const src = `/template-assets${path}`;', '/template-assets${path}'],
  ])(
    'fails when a fixture path is built by interpolation: %s',
    (source, reference) => {
      expect(() => stripTemplateAssetRefs(source)).toThrow(
        `Template asset reference ${reference} cannot be replaced safely: it is built by a template-literal interpolation`,
      );
    },
  );

  it.each([
    [
      'follows an interpolation',
      'const src = `${base}/template-assets/a.png`;',
    ],
    ['is cut short by a parenthesis', "src: '/template-assets/a(1).mp4',"],
    ['ends a word in text', 'const s = "clip: /template-assets/a.png(1).mp4";'],
    [
      'has mismatched escaped quotes',
      'const html = "<img src=\\"/template-assets/a.png\\\'>";',
    ],
    [
      'sits between a quote and a parenthesis',
      "const s = '\"/template-assets/a.png)';",
    ],
  ])('fails when a fixture path %s', (_, source) => {
    expect(() => stripTemplateAssetRefs(source)).toThrow(
      /\/template-assets\/a.* cannot be replaced safely: it is not a whole/u,
    );
  });

  it.each([
    'srcSet="/template-assets/a.png 1x,/template-assets/b.png 2x"',
    "const html = '<img src=/template-assets/b.png>';",
    "const s = 'hero\\n/template-assets/b.png';",
  ])('fails when a fixture path is joined to other text: %s', source => {
    expect(() => stripTemplateAssetRefs(source)).toThrow(
      /\/template-assets\/b\.png cannot be replaced safely: it is joined/u,
    );
  });

  it.each([
    ['concatenated', "const src = base + '/template-assets/hero.png';"],
    ['concatenated', "const src = '/template-assets/hero.png' + query;"],
    ['concatenated', "src += '/template-assets/hero.png';"],
    ['a method', "const src = '/template-assets/hero.png'.concat('?w=1');"],
    ['imported', "import hero from '/template-assets/hero.png';"],
    ['imported', "const hero = require('/template-assets/hero.png');"],
  ])('fails when a fixture string is %s: %s', (use, source) => {
    expect(() => stripTemplateAssetRefs(source)).toThrow(
      new RegExp(`/template-assets/hero\\.png .*${use}`, 'u'),
    );
  });
});

describe('replaceDemoMedia', () => {
  it('counts a reference once, however many fixture paths its URL carries', () => {
    const source =
      "const hero = '/template-assets/a.png?f=/template-assets/b.png';";
    expect(replaceDemoMedia(source)).toEqual({
      source: stripTemplateAssetRefs(source),
      demoMediaReplaced: 1,
    });
  });

  it('counts a poster and a video as two references', () => {
    const source =
      '<video poster="/template-assets/poster.jpg" src="/template-assets/clip.mp4" />';
    const result = replaceDemoMedia(source);
    expect(result).toEqual({
      source: stripTemplateAssetRefs(source),
      demoMediaReplaced: 2,
    });
    expect(result.source).not.toContain('/template-assets/');
  });

  it.each([
    [
      'a prose mention',
      '<p>Demo media lives under /template-assets/ in the docsite.</p>',
    ],
    [
      'a third-party URL',
      "const u = 'https://example.com/template-assets/a.png';",
    ],
    ['source with no fixture', 'const x = 1;'],
  ])('counts nothing for %s it leaves as written', (_label, source) => {
    expect(replaceDemoMedia(source)).toEqual({source, demoMediaReplaced: 0});
  });
});

describe('shipped templates', () => {
  it('copy with every fixture replaced and still parse', () => {
    const root = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../assets/templates',
    );
    const parse = jscodeshift.withParser('tsx');
    const files = fs
      .readdirSync(root, {recursive: true, encoding: 'utf-8'})
      .filter(file => file.endsWith('.tsx'))
      .filter(file =>
        fs
          .readFileSync(path.join(root, file), 'utf-8')
          .includes('/template-assets'),
      );
    expect(files.length).toBeGreaterThan(10);

    const problems = [];
    for (const file of files) {
      try {
        const output = stripTemplateAssetRefs(
          fs.readFileSync(path.join(root, file), 'utf-8'),
        );
        if (output.includes('/template-assets')) {
          problems.push(`${file}: fixture reference left behind`);
        }
        parse(output);
      } catch (err) {
        problems.push(`${file}: ${/** @type {Error} */ (err).message}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
