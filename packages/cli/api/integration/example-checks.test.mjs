// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {validateIntegration} from './validate-integration.mjs';
import {integrationCheck} from './check/check.mjs';
import {outsideFiles} from '../../foundation/integrations/validate-contributions.mjs';
import {spawnSync} from 'node:child_process';
import {npmCommand} from '../../foundation/release/cache.mjs';

/**
 * Whether the npm the CLI starts packs `rel` from the test package. npm
 * versions read `files` differently (npm 8 and npm 10 disagree on bare names
 * and letter case), so the check is held to the npm that runs the suite; the
 * cases' own flags are what npm 10 does.
 * @param {string} rel
 */
function npmPacks(rel) {
  const npm = npmCommand();
  const result = spawnSync(
    npm.command,
    [
      ...npm.prefix,
      'pack',
      '--dry-run',
      '--json',
      '--ignore-scripts',
      '--silent',
    ],
    {cwd: dir, encoding: 'utf-8'},
  );
  return JSON.parse(result.stdout)[0].files.some(
    (/** @type {{path: string}} */ file) => file.path === rel,
  );
}

/** @type {string} */
let dir;

/** @param {Record<string, string>} files */
function write(files) {
  for (const [rel, text] of Object.entries(files)) {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, text);
  }
}

/** @param {string} name @param {string} [extra] */
const componentDoc = (name, extra = '') =>
  `export default {type: 'component', name: '${name}', displayName: '${name}', description: 'A part.', props: []${extra}};\n`;

/** @param {string} name */
const componentSource = name => `export function ${name}() { return null; }\n`;

/** @param {string} name @param {string} fields */
const blockDoc = (name, fields) =>
  `export default {type: 'block', name: '${name}', displayName: '${name}', description: 'A block.'${fields}};\n`;

/**
 * The example notes validate lists, by code.
 * @param {string[]} [codes]
 */
async function notesOf(codes) {
  const {data} = await validateIntegration(undefined, {cwd: dir});
  return (data.notes ?? []).filter(note => !codes || codes.includes(note.code));
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-examples-'));
  write({
    'package.json': JSON.stringify({name: '@acme/kit', version: '1.0.0'}),
    'astryx.integration.mjs':
      "export default {components: './components', templates: './templates'};\n",
    'components/AcmeCard.doc.mjs': componentDoc('AcmeCard'),
    'components/AcmeCard.tsx': componentSource('AcmeCard'),
  });
});

afterEach(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

describe('component_without_example', () => {
  it('lists a component no showcase shows, with a template to paste, for the next minor', async () => {
    write({
      // Named like a showcase, but sets no exampleFor: a standalone block.
      'templates/AcmeCardShowcase.doc.mjs': blockDoc('AcmeCardShowcase', ''),
      'templates/AcmeCardShowcase.tsx': 'export default () => null;\n',
    });

    const notes = await notesOf(['component_without_example']);
    expect(notes).toHaveLength(1);
    expect(notes[0].next).toBe(true);
    expect(notes[0].message).toContain('components/AcmeCard.doc.mjs');
    expect(notes[0].message).toContain('templates/acme-card-showcase.doc.mjs');
    expect(notes[0].message).toContain(
      "exampleFor: 'AcmeCard', isShowcase: true, aspectRatio: 16 / 10",
    );
  });

  it('points at alsoShowcaseFor when the composing block already shows another component', async () => {
    write({
      'components/AcmeBadge.doc.mjs': componentDoc('AcmeBadge'),
      'components/AcmeBadge.tsx': componentSource('AcmeBadge'),
      'templates/badge-demo.doc.mjs': blockDoc(
        'badge-demo',
        ", exampleFor: 'AcmeBadge', isShowcase: true, componentsUsed: ['AcmeBadge', 'AcmeCard']",
      ),
      'templates/badge-demo.tsx': 'export default () => null;\n',
    });
    const [note] = await notesOf(['component_without_example']);
    expect(note.message).toContain(
      "add 'AcmeCard' to `alsoShowcaseFor` in templates/badge-demo.doc.mjs",
    );
    expect(note.message).not.toContain("add `exampleFor: 'AcmeCard'`");
  });

  it('offers a block only to the component it names, whatever the order', async () => {
    write({
      'components/AcmeAvatar.doc.mjs': componentDoc('AcmeAvatar'),
      'components/AcmeAvatar.tsx': componentSource('AcmeAvatar'),
      'components/AcmeBadge.doc.mjs': componentDoc('AcmeBadge'),
      'components/AcmeBadge.tsx': componentSource('AcmeBadge'),
      'templates/acme-badge-showcase.doc.mjs': blockDoc(
        'acme-badge-showcase',
        ", componentsUsed: ['AcmeAvatar', 'AcmeBadge']",
      ),
      'templates/acme-badge-showcase.tsx': 'export default () => null;\n',
    });
    const notes = await notesOf(['component_without_example']);
    const asks = notes.filter(note =>
      note.message.includes('templates/acme-badge-showcase.doc.mjs'),
    );
    expect(asks).toHaveLength(1);
    expect(asks[0].message).toContain("add `exampleFor: 'AcmeBadge'`");
    const avatar = notes.find(note =>
      note.message.includes('AcmeAvatar.doc.mjs'),
    );
    expect(avatar?.message).not.toContain('acme-badge-showcase');
  });

  it('suggests a free file name when the showcase path already shows another component', async () => {
    write({
      'templates/acme-card-showcase.doc.mjs': blockDoc(
        'acme-card-showcase',
        ", exampleFor: 'AcmeOther', isShowcase: true",
      ),
      'templates/acme-card-showcase.tsx': 'export default () => null;\n',
    });
    const [note] = await notesOf(['component_without_example']);
    expect(note.message).toContain('add templates/acme-card-showcase-2.tsx');
    expect(note.message).not.toContain(
      'to templates/acme-card-showcase.doc.mjs',
    );
  });

  it('asks for isShowcase when a block already names the component in exampleFor', async () => {
    write({
      'templates/card-demo.doc.mjs': blockDoc(
        'card-demo',
        ", exampleFor: 'AcmeCard'",
      ),
      'templates/card-demo.tsx': 'export default () => null;\n',
    });
    const [note] = await notesOf(['component_without_example']);
    expect(note.message).toContain(
      'add `isShowcase: true` to templates/card-demo.doc.mjs',
    );
  });

  it('never asks one block to show two components, and prefers the block that names one', async () => {
    write({
      'components/AcmeText.doc.mjs': componentDoc('AcmeText'),
      'components/AcmeText.tsx': componentSource('AcmeText'),
      'templates/both.doc.mjs': blockDoc(
        'both',
        ", componentsUsed: ['AcmeCard', 'AcmeText']",
      ),
      'templates/both.tsx': 'export default () => null;\n',
      'templates/text-sample.doc.mjs': blockDoc(
        'text-sample',
        ", category: 'Text - Sample', componentsUsed: ['AcmeText']",
      ),
      'templates/text-sample.tsx': 'export default () => null;\n',
    });
    const notes = await notesOf(['component_without_example']);
    const card = notes.find(note => note.message.includes('AcmeCard.doc.mjs'));
    const text = notes.find(note => note.message.includes('AcmeText.doc.mjs'));
    expect(card?.message).toContain(
      "add `exampleFor: 'AcmeCard'` and `isShowcase: true` to templates/both.doc.mjs",
    );
    expect(text?.message).toContain(
      "add `exampleFor: 'AcmeText'` and `isShowcase: true` to templates/text-sample.doc.mjs",
    );
  });

  it('names the block that already composes the component instead of new files', async () => {
    write({
      'templates/card-demo.doc.mjs': blockDoc(
        'card-demo',
        ", componentsUsed: ['AcmeCard']",
      ),
      'templates/card-demo.tsx': 'export default () => null;\n',
    });
    const [note] = await notesOf(['component_without_example']);
    expect(note.message).toContain(
      "add `exampleFor: 'AcmeCard'` and `isShowcase: true` to templates/card-demo.doc.mjs, the block that already composes AcmeCard",
    );
    expect(note.message).not.toContain('acme-card-showcase.tsx');
  });

  it.each([
    ['an exampleFor without isShowcase', ", exampleFor: 'AcmeCard'", 1],
    [
      'an exampleFor with isShowcase',
      ", exampleFor: 'AcmeCard', isShowcase: true",
      0,
    ],
    ['an alsoShowcaseFor', ", alsoShowcaseFor: ['AcmeCard']", 0],
  ])(
    'counts a block with %s as the example: %i note(s)',
    async (_, fields, count) => {
      // Each case its own file: a doc module is read once per path.
      const name = `card-${count}-${fields.length}`;
      write({
        [`templates/${name}.doc.mjs`]: blockDoc(name, fields),
        [`templates/${name}.tsx`]: 'export default () => null;\n',
      });
      expect(await notesOf(['component_without_example'])).toHaveLength(count);
    },
  );

  it('exempts hidden docs, parts kept off the overview and Utility components', async () => {
    write({
      'templates/.keep': '',
      'components/AcmeCard.doc.mjs': componentDoc(
        'AcmeCard',
        ', isHiddenFromOverview: true',
      ),
      'components/AcmeProvider.doc.mjs': componentDoc(
        'AcmeProvider',
        ", category: 'Utility'",
      ),
      'components/AcmeProvider.tsx': componentSource('AcmeProvider'),
      'components/AcmeSecret.doc.mjs': componentDoc(
        'AcmeSecret',
        ', hidden: true',
      ),
      'components/AcmeSecret.tsx': componentSource('AcmeSecret'),
    });

    expect(await notesOf(['component_without_example'])).toEqual([]);
  });

  it('names the templates root to add when the manifest has none', async () => {
    write({
      'astryx.integration.mjs':
        "export default {components: './components'};\n",
    });

    const [note] = await notesOf(['component_without_example']);
    expect(note.message).toContain("add `templates: './templates'`");
  });
});

describe('template_category', () => {
  it('lists a category written as a path, with a "<Group> - <Variant>" one', async () => {
    write({
      'templates/card.doc.mjs': blockDoc(
        'card',
        ", category: 'components/AcmeCard', exampleFor: 'AcmeCard', isShowcase: true",
      ),
      'templates/card.tsx': 'export default () => null;\n',
      'templates/fine.doc.mjs': blockDoc('fine', ", category: 'Acme - Cards'"),
      'templates/fine.tsx': 'export default () => null;\n',
      'templates/none.doc.mjs': blockDoc('none', ''),
      'templates/none.tsx': 'export default () => null;\n',
      // Core's own forms: one word, and a variant with a slash.
      'templates/word.doc.mjs': blockDoc('word', ", category: 'Settings'"),
      'templates/uiux.doc.mjs': blockDoc('uiux', ", category: 'UI/UX'"),
      'templates/ab.doc.mjs': blockDoc('ab', ", category: 'A/B Testing'"),
      'templates/word.tsx': 'export default () => null;\n',
      'templates/slash.doc.mjs': blockDoc(
        'slash',
        ", category: 'Table - Index/Detail'",
      ),
      'templates/slash.tsx': 'export default () => null;\n',
    });

    const notes = await notesOf(['template_category']);
    expect(notes).toHaveLength(1);
    expect(notes[0].message).toContain("category 'components/AcmeCard'");
    expect(notes[0].message).toContain(
      "Fix: category: 'Components - AcmeCard'",
    );
  });
});

describe('showcase_not_standalone', () => {
  it('lists a showcase that imports server-only code or reads process.env, and allows live data', async () => {
    write({
      'package.json': JSON.stringify({
        name: '@acme/kit',
        version: '1.0.0',
        dependencies: {buffer: '^6.0.0'},
      }),
      'templates/card.doc.mjs': blockDoc(
        'card',
        ", exampleFor: 'AcmeCard', isShowcase: true",
      ),
      'templates/card.tsx': [
        "import {headers} from 'next/headers';",
        "import fs from 'node:fs';",
        'export default async function Card() {',
        "  const res = await fetch('/api/graphql');",
        '  return process.env.SECRET;',
        '}',
        '',
      ].join('\n'),
      'templates/live.doc.mjs': blockDoc(
        'live',
        ", exampleFor: 'AcmeCard', isShowcase: true",
      ),
      'templates/text.doc.mjs': blockDoc(
        'text',
        ", exampleFor: 'AcmeCard', isShowcase: true",
      ),
      // Sample code in strings and JSX text, and the npm buffer package.
      'templates/text.tsx': [
        "import {Buffer} from 'buffer';",
        "const sample = `import fs from 'node:fs'; process.env.SECRET`;",
        'const quoted = \'require("next/headers")\';',
        'export default function Text() {',
        '  return <p>Set process.env.API_KEY on the server.</p>;',
        '}',
        '',
      ].join('\n'),
      'templates/live.tsx': [
        "import type {Headers} from 'next/headers';",
        "export {type IncomingMessage} from 'node:http';",
        "// import fs from 'node:fs';",
        '/* const key = process.env.SECRET; */',
        'export default function Live() {',
        "  if (process.env.NODE_ENV !== 'production') fetch('/api/graphql');",
        '  return null;',
        '}',
        '',
      ].join('\n'),
    });

    const notes = await notesOf(['showcase_not_standalone']);
    expect(notes).toHaveLength(1);
    expect(notes[0].message).toContain('templates/card.tsx');
    expect(notes[0].message).toContain("imports 'next/headers'");
    expect(notes[0].message).toContain("imports 'node:fs'");
    expect(notes[0].message).toContain('reads process.env');
    expect(notes[0].message).toContain(
      'Fetching live data through the app is fine',
    );
  });

  it('lists a block that shows components only through alsoShowcaseFor', async () => {
    write({
      'package.json': JSON.stringify({name: '@acme/kit', version: '1.0.0'}),
      'templates/panel.doc.mjs': blockDoc(
        'panel',
        ", alsoShowcaseFor: ['AcmeCard']",
      ),
      'templates/panel.tsx': [
        "import {headers} from 'next/headers';",
        'export default function Panel() {',
        '  return null;',
        '}',
        '',
      ].join('\n'),
    });

    const notes = await notesOf(['showcase_not_standalone']);
    expect(notes).toHaveLength(1);
    expect(notes[0].message).toContain('templates/panel.tsx');
    expect(notes[0].message).toContain("imports 'next/headers'");
  });
});

describe('template_asset_not_packed', () => {
  it('lists an asset the files field leaves out, and one that does not exist', async () => {
    write({
      'package.json': JSON.stringify({
        name: '@acme/kit',
        version: '1.0.0',
        files: ['components', 'templates', 'astryx.integration.mjs'],
      }),
      'assets/cat.png': 'png',
      'templates/cat.png': 'png',
      'templates/card.doc.mjs': blockDoc(
        'card',
        ", exampleFor: 'AcmeCard', isShowcase: true",
      ),
      'templates/card.tsx': [
        "const outside = new URL('../assets/cat.png', import.meta.url);",
        "const inside = new URL('./cat.png', import.meta.url);",
        "const missing = new URL('./dog.png', import.meta.url);",
        "// const old = new URL('./old.png', import.meta.url);",
        "const sample = `new URL('./sample.png', import.meta.url)`;",
        'export default () => (',
        "  <p>Load it with new URL('./text.png', import.meta.url).</p>",
        ');',
        '',
      ].join('\n'),
    });

    const notes = await notesOf(['template_asset_not_packed']);
    expect(notes.map(note => note.message)).toEqual([
      expect.stringContaining(
        'loads assets/cat.png, which npm leaves out of the package by its `files` field, so the template breaks once installed. Fix: add "assets" to `files`',
      ),
      expect.stringContaining('loads templates/dog.png, which does not exist.'),
    ]);
  });

  it('reports an asset a ! entry leaves out, and reads a template-literal path', async () => {
    write({
      'package.json': JSON.stringify({
        name: '@acme/kit',
        version: '1.0.0',
        files: ['components', 'templates', '!templates/*.png'],
      }),
      'templates/cat.png': 'png',
      'templates/card.doc.mjs': blockDoc(
        'card',
        ", exampleFor: 'AcmeCard', isShowcase: true",
      ),
      'templates/card.tsx': [
        'const cat = new URL(`./cat.png`, import.meta.url);',
        'export default () => null;',
        '',
      ].join('\n'),
    });

    const notes = await notesOf(['template_asset_not_packed']);
    expect(notes).toHaveLength(1);
    expect(notes[0].message).toContain(
      'the `files` entry "!templates/*.png" leaves out of the package',
    );
    expect(notes[0].message).toContain('drop or narrow "!templates/*.png"');
  });

  it.each([
    [['templates/**/*', 'astryx.integration.mjs']],
    [['./assets/', 'templates/']],
    [['/assets', '/templates']],
    [['assets', 'templates/*.{tsx,mjs,png}']],
    [['assets', 'templates/*.[pt][ns][gx]', 'templates/*.mjs']],
  ])('counts what npm packs under %j', async files => {
    write({
      'package.json': JSON.stringify({
        name: '@acme/kit',
        version: '1.0.0',
        files,
      }),
      'assets/cat.png': 'png',
      'templates/cat.png': 'png',
      'templates/card.doc.mjs': blockDoc(
        'card',
        ", exampleFor: 'AcmeCard', isShowcase: true",
      ),
      'templates/card.tsx': [
        "const inside = new URL('./cat.png', import.meta.url);",
        files.includes('templates/**/*')
          ? ''
          : "const outside = new URL('../assets/cat.png', import.meta.url);",
        'export default () => null;',
        '',
      ].join('\n'),
    });
    expect(await notesOf(['template_asset_not_packed'])).toEqual([]);
  });

  it.each([
    [
      [
        'components',
        'astryx.integration.mjs',
        'templates/*.tsx',
        'templates/*.mjs',
        '*.png',
      ],
      true,
    ],
    [['templates/**/*.tsx', 'templates/**/*.mjs', '*.png'], true],
    [['templates/*.tsx', 'templates/*.mjs', 'templates/*.PNG'], true],
    [['templates/*.tsx', 'templates/*.mjs', 'assets*'], false],
  ])('under %j, templates/hero.png packed: %s', async (files, packed) => {
    write({
      'package.json': JSON.stringify({
        name: '@acme/kit',
        version: '1.0.0',
        files,
      }),
      'templates/hero.png': 'png',
      'templates/card.doc.mjs': blockDoc(
        'card',
        ", exampleFor: 'AcmeCard', isShowcase: true",
      ),
      'templates/card.tsx': [
        "const hero = new URL('./hero.png', import.meta.url);",
        'export default () => null;',
        '',
      ].join('\n'),
    });
    void packed;
    expect(await notesOf(['template_asset_not_packed'])).toHaveLength(
      npmPacks('templates/hero.png') ? 0 : 1,
    );
  });

  it('brings a folder in only for an entry with no glob', async () => {
    write({
      'package.json': JSON.stringify({
        name: '@acme/kit',
        version: '1.0.0',
        files: ['templates', 'assets*'],
      }),
      'assets/cat.png': 'png',
      'templates/card.doc.mjs': blockDoc(
        'card',
        ", exampleFor: 'AcmeCard', isShowcase: true",
      ),
      'templates/card.tsx': [
        "const cat = new URL('../assets/cat.png', import.meta.url);",
        'export default () => null;',
        '',
      ].join('\n'),
    });
    const notes = await notesOf(['template_asset_not_packed']);
    expect(notes).toHaveLength(npmPacks('assets/cat.png') ? 0 : 1);
  });

  it('matches without regard to case, and applies a bare *.png only inside folders another entry packs', async () => {
    write({
      'package.json': JSON.stringify({
        name: '@acme/kit',
        version: '1.0.0',
        files: ['templates', '*.png', 'logos/*.png'],
      }),
      'assets/cat.png': 'png',
      'logos/Hero.PNG': 'png',
      'templates/card.doc.mjs': blockDoc(
        'card',
        ", exampleFor: 'AcmeCard', isShowcase: true",
      ),
      'templates/card.tsx': [
        "const hero = new URL('../logos/Hero.PNG', import.meta.url);",
        "const cat = new URL('../assets/cat.png', import.meta.url);",
        'export default () => null;',
        '',
      ].join('\n'),
    });
    const notes = await notesOf(['template_asset_not_packed']);
    expect(notes).toHaveLength(1);
    expect(notes[0].message).toContain('loads assets/cat.png');
  });
});

describe('what npm packs decides', () => {
  it('reports an asset outside the package root, which npm never packs', async () => {
    write({
      'package.json': JSON.stringify({name: '@acme/kit', version: '1.0.0'}),
      'templates/card.doc.mjs': blockDoc(
        'card',
        ", exampleFor: 'AcmeCard', isShowcase: true",
      ),
      'templates/card.tsx': [
        "const logo = new URL('../../shared/logo.png', import.meta.url);",
        'export default () => null;',
        '',
      ].join('\n'),
    });
    // Reported before the file is looked for, so none is written outside
    // the temp folder.
    const [note] = await notesOf(['template_asset_not_packed']);
    expect(note.message).toContain('which is outside the package');
    expect(note.message).not.toContain('to `files`');
  });

  it('accepts a folder URL when npm packs the files inside it', async () => {
    write({
      'package.json': JSON.stringify({
        name: '@acme/kit',
        version: '1.0.0',
        files: ['templates', 'components'],
      }),
      'templates/img/hero.png': 'png',
      'templates/card.doc.mjs': blockDoc(
        'card',
        ", exampleFor: 'AcmeCard', isShowcase: true",
      ),
      'templates/card.tsx': [
        "const images = new URL('./img/', import.meta.url);",
        'export default () => null;',
        '',
      ].join('\n'),
    });
    expect(await notesOf(['template_asset_not_packed'])).toEqual([]);
  });

  it('names a nested ignore file, not files, when files reaches the asset', async () => {
    write({
      'package.json': JSON.stringify({
        name: '@acme/kit',
        version: '1.0.0',
        files: ['components', 'templates'],
      }),
      'templates/img/.npmignore': '*.png\n',
      'templates/img/hero.png': 'png',
      'templates/card.doc.mjs': blockDoc(
        'card',
        ", exampleFor: 'AcmeCard', isShowcase: true",
      ),
      'templates/card.tsx': [
        "const hero = new URL('./img/hero.png', import.meta.url);",
        'export default () => null;',
        '',
      ].join('\n'),
    });
    const notes = await notesOf(['template_asset_not_packed']);
    expect(notes).toHaveLength(npmPacks('templates/img/hero.png') ? 0 : 1);
    if (notes.length > 0) {
      expect(notes[0].message).toContain(
        'remove or narrow the line `*.png` in templates/img/.npmignore',
      );
      expect(notes[0].message).not.toContain('to `files`');
    }
  });

  it('names the ! entry of files that leaves an asset out, not an unrelated ignore file', async () => {
    write({
      'package.json': JSON.stringify({
        name: '@acme/kit',
        version: '1.0.0',
        files: ['components', 'templates', '!templates/img'],
      }),
      'templates/.npmignore': '*.log\n',
      'templates/img/hero.png': 'png',
      'templates/card.doc.mjs': blockDoc(
        'card',
        ", exampleFor: 'AcmeCard', isShowcase: true",
      ),
      'templates/card.tsx': [
        "const hero = new URL('./img/hero.png', import.meta.url);",
        'export default () => null;',
        '',
      ].join('\n'),
    });
    const notes = await notesOf(['template_asset_not_packed']);
    expect(notes).toHaveLength(npmPacks('templates/img/hero.png') ? 0 : 1);
    if (notes.length > 0) {
      expect(notes[0].message).toContain(
        'the `files` entry "!templates/img" leaves out of the package',
      );
      expect(notes[0].message).not.toContain('.npmignore');
    }
  });

  it('names a nested ignore file that drops an asset', async () => {
    write({
      'package.json': JSON.stringify({name: '@acme/kit', version: '1.0.0'}),
      'templates/img/.npmignore': 'hero.png\n',
      'templates/img/hero.png': 'png',
      'templates/card.doc.mjs': blockDoc(
        'card',
        ", exampleFor: 'AcmeCard', isShowcase: true",
      ),
      'templates/card.tsx': [
        "const hero = new URL('./img/hero.png', import.meta.url);",
        'export default () => null;',
        '',
      ].join('\n'),
    });
    const notes = await notesOf(['template_asset_not_packed']);
    expect(notes).toHaveLength(npmPacks('templates/img/hero.png') ? 0 : 1);
    if (notes.length > 0) {
      expect(notes[0].message).toContain(
        'remove or narrow the line `hero.png` in templates/img/.npmignore',
      );
    }
  });

  it('names the ignore-file line, not files, when a package has no files field', async () => {
    write({
      'package.json': JSON.stringify({name: '@acme/kit', version: '1.0.0'}),
      '.npmignore': '# local only\ntemplates/img\n',
      'templates/img/hero.png': 'png',
      'templates/card.doc.mjs': blockDoc(
        'card',
        ", exampleFor: 'AcmeCard', isShowcase: true",
      ),
      'templates/card.tsx': [
        "const hero = new URL('./img/hero.png', import.meta.url);",
        'export default () => null;',
        '',
      ].join('\n'),
    });
    const notes = await notesOf(['template_asset_not_packed']);
    expect(notes).toHaveLength(npmPacks('templates/img/hero.png') ? 0 : 1);
    if (notes.length > 0) {
      expect(notes[0].message).toContain(
        'remove or narrow the line `templates/img` in .npmignore',
      );
      expect(notes[0].message).not.toContain('to `files`');
    }
  });

  it.each([
    [['templates/*'], 'templates/img/hero.png', true],
    [['templates', '!templates/img'], 'templates/img/hero.png', false],
    [
      ['templates/card.tsx', 'templates/card.doc.mjs', 'img'],
      'img/a.png',
      true,
    ],
    [['Templates'], 'templates/img/hero.png', false],
  ])('under %j, %s packed: %s', async (files, asset, packed) => {
    write({
      'package.json': JSON.stringify({
        name: '@acme/kit',
        version: '1.0.0',
        files,
      }),
      'templates/img/hero.png': 'png',
      'img/a.png': 'png',
      'templates/card.doc.mjs': blockDoc(
        'card',
        ", exampleFor: 'AcmeCard', isShowcase: true",
      ),
      'templates/card.tsx': [
        `const asset = new URL('${path.posix.relative('templates', asset).startsWith('..') ? '' : './'}${path.posix.relative('templates', asset)}', import.meta.url);`,
        'export default () => null;',
        '',
      ].join('\n'),
    });
    void packed;
    expect(await notesOf(['template_asset_not_packed'])).toHaveLength(
      npmPacks(asset) ? 0 : 1,
    );
  });

  it('without npm, reports only an asset no files entry can reach', () => {
    expect(outsideFiles('assets/cat.png', ['templates', '*.svg'])).toBe(true);
    expect(outsideFiles('assets/cat.png', ['templates', '*.PNG'])).toBe(false);
    expect(outsideFiles('assets/cat.png', ['Assets'])).toBe(false);
    expect(outsideFiles('templates/img/a.png', ['templates/*'])).toBe(false);
    expect(outsideFiles('assets/cat.png', ['{assets,logos}'])).toBe(false);
  });
});

describe('integration check', () => {
  it('fails --strict --next on the example notes, never plain --strict', async () => {
    // This folder has no TypeScript, so --strict fails on that skip; the
    // example notes are not among its failures.
    const strict = await integrationCheck({cwd: dir, strict: true});
    expect(strict.data.upcoming).toBeGreaterThan(0);
    expect(strict.data.failures.map(failure => failure.code)).not.toContain(
      'component_without_example',
    );

    const next = await integrationCheck({cwd: dir, strict: true, next: true});
    expect(next.data.failed).toBe(true);
    expect(next.data.failures.map(failure => failure.code)).toContain(
      'component_without_example',
    );
  });
});
