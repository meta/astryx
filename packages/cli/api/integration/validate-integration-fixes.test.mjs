// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Every `Fix:` that `astryx doctor integration validate` prints must hold
 * when followed literally: each test builds a package with one problem, reads
 * the fix, carries it out on a copy of the package, and validates again.
 *
 * The copy lives at a new path so the edited manifest is imported fresh rather
 * than served from the module cache. Temp dirs live under the repo root, as in
 * validate-integration.test.mjs.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {validateLocalIntegration} from './validate-integration.mjs';

let tmpDir;
let copies = 0;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.astryx-validate-fix-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

const MANIFEST = 'astryx.integration.mjs';
const THEME_TYPE =
  "/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\n";

/** @param {Record<string, string>} roots */
const manifest = roots => `export default ${JSON.stringify(roots)};\n`;
/** @param {string} name */
const componentDoc = name =>
  `export default {type: 'component', name: '${name}', displayName: '${name}', usage: {description: '${name}.'}, props: []};\n`;
/** @param {string} name */
const componentSource = name => `export function ${name}() { return null; }\n`;
/** @param {string} name */
const templateSource = name =>
  `export default function ${name}() { return null; }\n`;
/** @param {string} name */
const topic = name =>
  `export default ${JSON.stringify({
    type: 'generic',
    name,
    title: name,
    description: `The ${name} topic.`,
    sections: [{title: 'Overview', content: [{type: 'prose', text: name}]}],
  })};\n`;
/** @param {string} name */
const themeDoc = name =>
  `${THEME_TYPE}export default {type: 'theme', name: '${name}', displayName: '${name}', description: 'A theme.', maintained: true};\n`;
/** @param {string} exportName */
const themeSource = exportName => `export const ${exportName} = {};\n`;
const codemod = `export default {type: 'code', title: 'Rename', transform: file => file.source};\n`;

/**
 * @param {Record<string, string>} files package-relative path -> contents
 * @returns {string} the package directory
 */
function writePackage(files) {
  const dir = path.join(tmpDir, 'pkg');
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({name: '@acme/kit', version: '1.0.0'}),
  );
  for (const [file, contents] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), {recursive: true});
    fs.writeFileSync(path.join(dir, file), contents);
  }
  return dir;
}

/**
 * Carry out a fix on a fresh copy of the package.
 * @param {string} dir
 * @param {{move?: Array<[string, string]>, write?: Record<string, string>, mkdir?: string[]}} steps
 * @returns {string} the copy's directory
 */
function follow(dir, {move = [], write = {}, mkdir = []}) {
  copies += 1;
  const copy = path.join(tmpDir, `followed-${copies}`);
  fs.cpSync(dir, copy, {recursive: true});
  for (const folder of mkdir) {
    fs.mkdirSync(path.join(copy, folder), {recursive: true});
  }
  for (const [from, to] of move) {
    fs.mkdirSync(path.dirname(path.join(copy, to)), {recursive: true});
    fs.renameSync(path.join(copy, from), path.join(copy, to));
  }
  for (const [file, contents] of Object.entries(write)) {
    fs.writeFileSync(path.join(copy, file), contents);
  }
  return copy;
}

/** @param {string} dir */
async function issuesOf(dir) {
  return (await validateLocalIntegration(dir)).issues;
}

/**
 * The one issue with this code, which the test is about.
 * @param {Array<{code: string, message: string}>} issues
 * @param {string} code
 */
function only(issues, code) {
  const found = issues.filter(issue => issue.code === code);
  expect(found).toHaveLength(1);
  return found[0].message;
}

const unreachable = file =>
  `Found contribution metadata "${file}" outside every declared integration root, so it contributes nothing.`;
const good = {
  'components/Good/Good.doc.mjs': componentDoc('Good'),
  'components/Good/Good.tsx': componentSource('Good'),
};

describe('unreachable_contribution fixes hold when followed', () => {
  it('moves a theme at the package root into themes/<slug>/, never to a folder outside the package', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({components: './components'}),
      ...good,
      'oceanTheme.doc.mjs': themeDoc('ocean'),
      'oceanTheme.ts': `import {tokens} from './oceanTokens';\nexport const oceanTheme = {tokens};\n`,
      'oceanTokens.ts': 'export const tokens = {};\n',
    });

    const message = only(await issuesOf(dir), 'unreachable_contribution');
    expect(message).toBe(
      `${unreachable('oceanTheme.doc.mjs')} Fix: move oceanTheme.doc.mjs and oceanTheme.ts (with any local files it imports) into themes/ocean/ and set \`themes: './themes'\` in astryx.integration.mjs.`,
    );

    const fixed = follow(dir, {
      move: [
        ['oceanTheme.doc.mjs', 'themes/ocean/oceanTheme.doc.mjs'],
        ['oceanTheme.ts', 'themes/ocean/oceanTheme.ts'],
        ['oceanTokens.ts', 'themes/ocean/oceanTokens.ts'],
      ],
      write: {
        [MANIFEST]: manifest({components: './components', themes: './themes'}),
      },
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('moves a theme folder at the top level under themes/, never making the package root the themes root', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({components: './components'}),
      ...good,
      'sand/sandTheme.doc.mjs': themeDoc('sand'),
      'sand/sandTheme.ts': themeSource('sandTheme'),
    });

    const message = only(await issuesOf(dir), 'unreachable_contribution');
    expect(message).toBe(
      `${unreachable('sand/sandTheme.doc.mjs')} Fix: move sand/ to themes/sand/ and set \`themes: './themes'\` in astryx.integration.mjs.`,
    );

    const fixed = follow(dir, {
      move: [['sand', 'themes/sand']],
      write: {
        [MANIFEST]: manifest({components: './components', themes: './themes'}),
      },
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('moves a stray theme folder into the declared themes root under its slug', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({themes: './themes'}),
      'themes/ocean/oceanTheme.doc.mjs': themeDoc('ocean'),
      'themes/ocean/oceanTheme.ts': themeSource('oceanTheme'),
      'extra/seaTheme.doc.mjs': themeDoc('sea'),
      'extra/seaTheme.ts': themeSource('seaTheme'),
    });

    const message = only(await issuesOf(dir), 'unreachable_contribution');
    expect(message).toBe(
      `${unreachable('extra/seaTheme.doc.mjs')} Fix: move extra/ to themes/sea/.`,
    );

    const fixed = follow(dir, {move: [['extra', 'themes/sea']]});
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('keeps declaring a folder that holds only themes as the themes root', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({components: './components'}),
      ...good,
      'palettes/sand/sandTheme.doc.mjs': themeDoc('sand'),
      'palettes/sand/sandTheme.ts': themeSource('sandTheme'),
    });

    const message = only(await issuesOf(dir), 'unreachable_contribution');
    expect(message).toBe(
      `${unreachable('palettes/sand/sandTheme.doc.mjs')} Fix: set \`themes: './palettes'\` in astryx.integration.mjs.`,
    );

    const fixed = follow(dir, {
      write: {
        [MANIFEST]: manifest({
          components: './components',
          themes: './palettes',
        }),
      },
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('offers either root for a theme when the declared themes root is empty', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({themes: './themes'}),
      'themes/.keep': '',
      'palettes/sand/sandTheme.doc.mjs': themeDoc('sand'),
      'palettes/sand/sandTheme.ts': themeSource('sandTheme'),
    });

    const message = only(await issuesOf(dir), 'unreachable_contribution');
    expect(message).toBe(
      `${unreachable('palettes/sand/sandTheme.doc.mjs')} Fix: move palettes/sand/ to themes/sand/, or set \`themes: './palettes'\` in astryx.integration.mjs.`,
    );

    const moved = follow(dir, {move: [['palettes/sand', 'themes/sand']]});
    expect(await issuesOf(moved)).toEqual([]);
    const declared = follow(dir, {
      write: {[MANIFEST]: manifest({themes: './palettes'})},
    });
    expect(await issuesOf(declared)).toEqual([]);
  });

  it('declares themes/ as the root when its other folders are not themes', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({components: './components'}),
      ...good,
      'themes/ocean/oceanTheme.doc.mjs': themeDoc('ocean'),
      'themes/ocean/oceanTheme.ts': themeSource('oceanTheme'),
      'themes/shared/colors.ts': 'export const colors = {};\n',
    });

    const message = only(await issuesOf(dir), 'unreachable_contribution');
    expect(message).toBe(
      `${unreachable('themes/ocean/oceanTheme.doc.mjs')} Fix: set \`themes: './themes'\` in astryx.integration.mjs.`,
    );

    const fixed = follow(dir, {
      write: {
        [MANIFEST]: manifest({components: './components', themes: './themes'}),
      },
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('puts a theme in a folder of its own when themes/ holds a broken theme', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({components: './components'}),
      ...good,
      'themes/ocean/oceanTheme.doc.mjs': themeDoc('ocean'),
      'themes/ocean/oceanTheme.ts': themeSource('oceanTheme'),
      'themes/draft/draftTheme.ts': themeSource('draftTheme'),
    });

    const message = only(await issuesOf(dir), 'unreachable_contribution');
    expect(message).toBe(
      `${unreachable('themes/ocean/oceanTheme.doc.mjs')} Fix: move themes/ocean/ into a folder that holds only themes, as ocean/, and set \`themes\` to that folder in astryx.integration.mjs.`,
    );

    const fixed = follow(dir, {
      move: [['themes/ocean', 'palettes/ocean']],
      write: {
        [MANIFEST]: manifest({
          components: './components',
          themes: './palettes',
        }),
      },
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('moves a component doc at the package root with its source, never making the package root the components root', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({components: './components'}),
      ...good,
      'Stray.doc.mjs': componentDoc('Stray'),
      'Stray.tsx': componentSource('Stray'),
    });

    const message = only(await issuesOf(dir), 'unreachable_contribution');
    expect(message).toBe(
      `${unreachable('Stray.doc.mjs')} Fix: move it and Stray.tsx under components/ (the components root).`,
    );

    const fixed = follow(dir, {
      move: [
        ['Stray.doc.mjs', 'components/Stray/Stray.doc.mjs'],
        ['Stray.tsx', 'components/Stray/Stray.tsx'],
      ],
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('moves a topic at the package root into docs/, never making the package root the docs root', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({components: './components'}),
      ...good,
      'guide.doc.mjs': topic('guide'),
    });

    const message = only(await issuesOf(dir), 'unreachable_contribution');
    expect(message).toBe(
      `${unreachable('guide.doc.mjs')} Fix: move it into docs/ and set \`docs: './docs'\` in astryx.integration.mjs.`,
    );

    const fixed = follow(dir, {
      move: [['guide.doc.mjs', 'docs/guide.doc.mjs']],
      write: {
        [MANIFEST]: manifest({components: './components', docs: './docs'}),
      },
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('declares a folder that holds only topics as the docs root', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({}),
      'src/guide.doc.mjs': topic('guide'),
      'src/faq.doc.mjs': topic('faq'),
    });

    const issues = await issuesOf(dir);
    expect(issues.map(issue => issue.message)).toEqual([
      `${unreachable('src/faq.doc.mjs')} Fix: set \`docs: './src'\` in astryx.integration.mjs.`,
      `${unreachable('src/guide.doc.mjs')} Fix: set \`docs: './src'\` in astryx.integration.mjs.`,
    ]);

    const fixed = follow(dir, {write: {[MANIFEST]: manifest({docs: './src'})}});
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('never declares a folder that also holds another kind of doc as a root', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({}),
      'src/Button.doc.mjs': componentDoc('Button'),
      'src/Button.tsx': componentSource('Button'),
      'src/guide.doc.mjs': topic('guide'),
    });

    const issues = await issuesOf(dir);
    expect(issues.map(issue => issue.message)).toEqual([
      `${unreachable('src/Button.doc.mjs')} Fix: move it and Button.tsx into components/ and set \`components: './components'\` in astryx.integration.mjs.`,
      `${unreachable('src/guide.doc.mjs')} Fix: move it into docs/ and set \`docs: './docs'\` in astryx.integration.mjs.`,
    ]);

    const fixed = follow(dir, {
      move: [
        ['src/Button.doc.mjs', 'components/Button.doc.mjs'],
        ['src/Button.tsx', 'components/Button.tsx'],
        ['src/guide.doc.mjs', 'docs/guide.doc.mjs'],
      ],
      write: {
        [MANIFEST]: manifest({components: './components', docs: './docs'}),
      },
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('names a fresh folder when docs/ already holds another kind of doc', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({}),
      'docs/Button.doc.mjs': componentDoc('Button'),
      'docs/Button.tsx': componentSource('Button'),
      'docs/guide.doc.mjs': topic('guide'),
    });

    const issues = await issuesOf(dir);
    expect(issues.map(issue => issue.message)).toEqual([
      `${unreachable('docs/Button.doc.mjs')} Fix: move it and Button.tsx into components/ and set \`components: './components'\` in astryx.integration.mjs.`,
      `${unreachable('docs/guide.doc.mjs')} Fix: move it into a folder that holds only topics, and set \`docs\` to that folder in astryx.integration.mjs.`,
    ]);

    const fixed = follow(dir, {
      move: [
        ['docs/Button.doc.mjs', 'components/Button.doc.mjs'],
        ['docs/Button.tsx', 'components/Button.tsx'],
        ['docs/guide.doc.mjs', 'guides/guide.doc.mjs'],
      ],
      write: {
        [MANIFEST]: manifest({components: './components', docs: './guides'}),
      },
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('only moves metadata into a declared root that already holds contributions', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({templates: './templates'}),
      'templates/hero.doc.mjs': `export default {type: 'page', name: 'hero', displayName: 'Hero'};\n`,
      'templates/hero.tsx': templateSource('Hero'),
      'src/blocks/Carousel.doc.mjs': `export default {type: 'block', name: 'Carousel', displayName: 'Carousel', aspectRatio: 1};\n`,
      'src/blocks/Carousel.tsx': templateSource('Carousel'),
    });

    const message = only(await issuesOf(dir), 'unreachable_contribution');
    // Pointing `templates` at src/blocks would orphan templates/hero.
    expect(message).toBe(
      `${unreachable('src/blocks/Carousel.doc.mjs')} Fix: move it and Carousel.tsx under templates/ (the templates root).`,
    );

    const fixed = follow(dir, {
      move: [
        ['src/blocks/Carousel.doc.mjs', 'templates/Carousel.doc.mjs'],
        ['src/blocks/Carousel.tsx', 'templates/Carousel.tsx'],
      ],
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('offers either root when the declared root is empty, and both hold', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({templates: './templates'}),
      'templates/.keep': '',
      'src/blocks/Carousel.doc.mjs': `export default {type: 'block', name: 'Carousel', displayName: 'Carousel', aspectRatio: 1};\n`,
      'src/blocks/Carousel.tsx': templateSource('Carousel'),
    });

    const message = only(await issuesOf(dir), 'unreachable_contribution');
    expect(message).toBe(
      `${unreachable('src/blocks/Carousel.doc.mjs')} Fix: move it and Carousel.tsx under templates/ (the templates root), or set \`templates: './src/blocks'\` in astryx.integration.mjs.`,
    );

    const moved = follow(dir, {
      move: [
        ['src/blocks/Carousel.doc.mjs', 'templates/Carousel.doc.mjs'],
        ['src/blocks/Carousel.tsx', 'templates/Carousel.tsx'],
      ],
    });
    expect(await issuesOf(moved)).toEqual([]);
    const declared = follow(dir, {
      write: {[MANIFEST]: manifest({templates: './src/blocks'})},
    });
    expect(await issuesOf(declared)).toEqual([]);
  });
});

describe('unreachable_contribution fixes cover what the move leaves behind', () => {
  it('asks for the missing source a component doc needs once a root reads it', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({components: './components'}),
      ...good,
      'Stray.doc.mjs': componentDoc('Stray'),
    });

    const message = only(await issuesOf(dir), 'unreachable_contribution');
    expect(message).toBe(
      `${unreachable('Stray.doc.mjs')} Fix: move it under components/ (the components root). Also add Stray.tsx beside it.`,
    );

    const fixed = follow(dir, {
      move: [['Stray.doc.mjs', 'components/Stray.doc.mjs']],
      write: {'components/Stray.tsx': componentSource('Stray')},
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('asks for the missing source a theme needs', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({components: './components'}),
      ...good,
      'sand/sandTheme.doc.mjs': themeDoc('sand'),
    });

    const message = only(await issuesOf(dir), 'unreachable_contribution');
    expect(message).toBe(
      `${unreachable('sand/sandTheme.doc.mjs')} Fix: move sand/ to themes/sand/ and set \`themes: './themes'\` in astryx.integration.mjs. Also add its same-stem theme source, such as sandTheme.ts, beside it.`,
    );

    const fixed = follow(dir, {
      move: [['sand', 'themes/sand']],
      write: {
        [MANIFEST]: manifest({components: './components', themes: './themes'}),
        'themes/sand/sandTheme.ts': themeSource('sandTheme'),
      },
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('asks to rename a theme descriptor that is not a .doc.mjs file', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({components: './components'}),
      ...good,
      'sand/sandTheme.doc.ts': themeDoc('sand'),
      'sand/sandTheme.ts': themeSource('sandTheme'),
    });

    const message = only(await issuesOf(dir), 'unreachable_contribution');
    expect(message).toBe(
      `${unreachable('sand/sandTheme.doc.ts')} Fix: move sand/ to themes/sand/ and set \`themes: './themes'\` in astryx.integration.mjs. Also rename sandTheme.doc.ts to sandTheme.doc.mjs: a theme descriptor is a .doc.mjs file.`,
    );

    const fixed = follow(dir, {
      move: [
        ['sand', 'themes/sand'],
        ['themes/sand/sandTheme.doc.ts', 'themes/sand/sandTheme.doc.mjs'],
      ],
      write: {
        [MANIFEST]: manifest({components: './components', themes: './themes'}),
      },
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('never declares a folder as a root when another doc in it would lose its source', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({}),
      'src/Card.doc.mjs': componentDoc('Card'),
      'src/Card.tsx': componentSource('Card'),
      'src/Badge.doc.mjs': componentDoc('Badge'),
    });

    const issues = await issuesOf(dir);
    const card = issues.find(issue =>
      issue.message.includes('src/Card.doc.mjs'),
    );
    // A components root at src/ would read Badge, which has no source.
    expect(card?.message).toBe(
      `${unreachable('src/Card.doc.mjs')} Fix: move it and Card.tsx into components/ and set \`components: './components'\` in astryx.integration.mjs.`,
    );
    const badge = issues.find(issue =>
      issue.message.includes('src/Badge.doc.mjs'),
    );
    expect(badge?.message).toBe(
      `${unreachable('src/Badge.doc.mjs')} Fix: set \`components: './src'\` in astryx.integration.mjs. Also add Badge.tsx beside it.`,
    );

    const cardMoved = follow(dir, {
      move: [
        ['src/Card.doc.mjs', 'components/Card.doc.mjs'],
        ['src/Card.tsx', 'components/Card.tsx'],
      ],
      write: {[MANIFEST]: manifest({components: './components'})},
    });
    const left = await issuesOf(cardMoved);
    expect(left.map(issue => issue.code)).toEqual(['unreachable_contribution']);
    expect(left[0].message).toContain('src/Badge.doc.mjs');

    const badgeDeclared = follow(dir, {
      write: {
        [MANIFEST]: manifest({components: './src'}),
        'src/Badge.tsx': componentSource('Badge'),
      },
    });
    expect(await issuesOf(badgeDeclared)).toEqual([]);
  });

  it('moves the target root out of another root that also reads it', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({components: './src/components', docs: './src'}),
      'src/overview.doc.mjs': topic('overview'),
      'src/components/Good.doc.mjs': componentDoc('Good'),
      'src/components/Good.tsx': componentSource('Good'),
      'lib/Card.doc.mjs': componentDoc('Card'),
      'lib/Card.tsx': componentSource('Card'),
    });

    const message = only(await issuesOf(dir), 'unreachable_contribution');
    expect(message).toBe(
      `${unreachable('lib/Card.doc.mjs')} Fix: move it and Card.tsx under src/components/ (the components root). The docs root src/ also reads src/components/; move src/components/ to components/ and set \`components: './components'\` in astryx.integration.mjs.`,
    );

    const fixed = follow(dir, {
      move: [
        ['lib/Card.doc.mjs', 'src/components/Card.doc.mjs'],
        ['lib/Card.tsx', 'src/components/Card.tsx'],
        ['src/components', 'components'],
      ],
      write: {
        [MANIFEST]: manifest({components: './components', docs: './src'}),
      },
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });
});

describe('fixes never move a contribution onto a name its root already has', () => {
  it('asks for a new slug when the themes root already has that theme', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({themes: './themes'}),
      'themes/ocean/oceanTheme.doc.mjs': themeDoc('ocean'),
      'themes/ocean/oceanTheme.ts': themeSource('oceanTheme'),
      'extra/ocean/oceanTheme.doc.mjs': themeDoc('ocean'),
      'extra/ocean/oceanTheme.ts': themeSource('oceanTheme'),
    });

    const message = only(await issuesOf(dir), 'unreachable_contribution');
    expect(message).toBe(
      `${unreachable('extra/ocean/oceanTheme.doc.mjs')} Fix: themes/ocean/ is taken, so give this theme a new lower-kebab slug: move extra/ocean/ to themes/<slug>/ and set \`name\` in oceanTheme.doc.mjs to <slug>.`,
    );

    const fixed = follow(dir, {
      move: [['extra/ocean', 'themes/deep-ocean']],
      write: {'themes/deep-ocean/oceanTheme.doc.mjs': themeDoc('deep-ocean')},
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('asks for a new slug for a theme at the top of the codemods root', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({codemods: './codemods', themes: './themes'}),
      'themes/ocean/oceanTheme.doc.mjs': themeDoc('ocean'),
      'themes/ocean/oceanTheme.ts': themeSource('oceanTheme'),
      'codemods/1.2.0/rename.mjs': codemod,
      'codemods/oceanTheme.doc.mjs': themeDoc('ocean'),
      'codemods/oceanTheme.ts': themeSource('oceanTheme'),
    });

    const move =
      'themes/ocean/ is taken, so give this theme a new lower-kebab slug: move oceanTheme.doc.mjs and oceanTheme.ts (with any local files it imports) into themes/<slug>/ and set `name` in oceanTheme.doc.mjs to <slug>.';
    expect(
      (await issuesOf(dir))
        .filter(issue => issue.code === 'codemod_outside_version')
        .map(issue => issue.message),
    ).toEqual([
      `Codemod file "codemods/oceanTheme.doc.mjs" is outside a version folder, so upgrade will never load it. Fix: oceanTheme.doc.mjs has type: 'theme', so it is not a codemod; ${move}`,
      `Codemod file "codemods/oceanTheme.ts" is outside a version folder, so upgrade will never load it. Fix: oceanTheme.ts is the source of oceanTheme.doc.mjs, which has type: 'theme', so neither is a codemod; ${move}`,
    ]);

    const fixed = follow(dir, {
      move: [
        ['codemods/oceanTheme.doc.mjs', 'themes/deep-ocean/oceanTheme.doc.mjs'],
        ['codemods/oceanTheme.ts', 'themes/deep-ocean/oceanTheme.ts'],
      ],
      write: {'themes/deep-ocean/oceanTheme.doc.mjs': themeDoc('deep-ocean')},
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('asks for a new name when the docs root already has that topic', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({docs: './docs'}),
      'docs/guide.doc.mjs': topic('guide'),
      'extra/guide.doc.mjs': topic('guide'),
    });

    const message = only(await issuesOf(dir), 'unreachable_contribution');
    expect(message).toBe(
      `${unreachable('extra/guide.doc.mjs')} Fix: docs/ already has a topic named "guide" (docs/guide.doc.mjs), so give this one a new name: rename it to <name>.doc.mjs, set its \`name\` to <name>, and move it under docs/ (the docs root).`,
    );

    const fixed = follow(dir, {
      move: [['extra/guide.doc.mjs', 'docs/more-guide.doc.mjs']],
      write: {'docs/more-guide.doc.mjs': topic('more-guide')},
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('asks for a new name when the components root already has that component', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({components: './components'}),
      'components/Foo/Foo.doc.mjs': componentDoc('Foo'),
      'components/Foo/Foo.tsx': componentSource('Foo'),
      'Foo.doc.mjs': componentDoc('Foo'),
      'Foo.tsx': componentSource('Foo'),
    });

    const message = only(await issuesOf(dir), 'unreachable_contribution');
    expect(message).toBe(
      `${unreachable('Foo.doc.mjs')} Fix: components/ already has a component named Foo (components/Foo/Foo.doc.mjs), so give this one a new name: rename it and Foo.tsx to <Name>.doc.mjs and <Name>.tsx, set its \`name\` to <Name>, and move them under components/ (the components root).`,
    );

    const fixed = follow(dir, {
      move: [
        ['Foo.doc.mjs', 'components/FooPanel.doc.mjs'],
        ['Foo.tsx', 'components/FooPanel.tsx'],
      ],
      write: {'components/FooPanel.doc.mjs': componentDoc('FooPanel')},
    });
    expect(await issuesOf(fixed)).toEqual([]);
    expect(
      fs.readFileSync(path.join(fixed, 'components/Foo/Foo.doc.mjs'), 'utf-8'),
    ).toBe(componentDoc('Foo'));
  });

  it('asks for a new name when the templates root already has that template', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({templates: './templates'}),
      'templates/hero.doc.mjs': `export default {type: 'page', name: 'hero', displayName: 'Hero'};\n`,
      'templates/hero.tsx': templateSource('Hero'),
      'extra/hero.doc.mjs': `export default {type: 'page', name: 'hero', displayName: 'Hero'};\n`,
      'extra/hero.tsx': templateSource('Hero'),
    });

    const message = only(await issuesOf(dir), 'unreachable_contribution');
    expect(message).toBe(
      `${unreachable('extra/hero.doc.mjs')} Fix: templates/ already has a template named hero (templates/hero.doc.mjs), so give this one a new name: rename it and hero.tsx to <name>.doc.mjs and <name>.tsx, set its \`name\` to <name>, and move them under templates/ (the templates root).`,
    );

    const fixed = follow(dir, {
      move: [
        ['extra/hero.doc.mjs', 'templates/hero-wide.doc.mjs'],
        ['extra/hero.tsx', 'templates/hero-wide.tsx'],
      ],
      write: {
        'templates/hero-wide.doc.mjs': `export default {type: 'page', name: 'hero-wide', displayName: 'Hero'};\n`,
      },
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('asks for a new name when the root a fix moves out already has that topic', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({components: './src', docs: './src/zdocs'}),
      'src/zdocs/guide.doc.mjs': topic('guide'),
      'src/faq.doc.mjs': topic('guide'),
    });

    const [faq] = (await issuesOf(dir)).filter(issue =>
      issue.message.includes('Component "faq"'),
    );
    expect(faq.message).toBe(
      `Component "faq" is missing its same-stem source file faq.tsx. Fix: faq.doc.mjs has type: 'generic', so it is not a component, and the components root src/ also reads the docs root src/zdocs/ inside it; move src/zdocs/ to docs/ and set \`docs: './docs'\` in astryx.integration.mjs, then give it a new name: rename it to <name>.doc.mjs, set its \`name\` to <name>, and move it into docs/.`,
    );

    const fixed = follow(dir, {
      move: [
        ['src/zdocs', 'docs'],
        ['src/faq.doc.mjs', 'docs/more-guide.doc.mjs'],
      ],
      write: {
        [MANIFEST]: manifest({components: './src', docs: './docs'}),
        'docs/more-guide.doc.mjs': topic('more-guide'),
      },
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('never declares a folder that holds one topic name twice', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({}),
      'src/guide.doc.mjs': topic('guide'),
      'src/more/guide.doc.mjs': topic('guide'),
    });

    const [first] = (await issuesOf(dir)).filter(issue =>
      issue.message.includes('"src/guide.doc.mjs"'),
    );
    expect(first.message).toBe(
      `${unreachable('src/guide.doc.mjs')} Fix: move it into docs/ and set \`docs: './docs'\` in astryx.integration.mjs.`,
    );

    const fixed = follow(dir, {
      move: [['src/guide.doc.mjs', 'docs/guide.doc.mjs']],
      write: {[MANIFEST]: manifest({docs: './docs'})},
    });
    const left = await issuesOf(fixed);
    expect(left.map(issue => issue.code)).toEqual(['unreachable_contribution']);
    expect(left[0].message).toContain('"src/more/guide.doc.mjs"');
  });
});

describe('theme fixes bring along what the theme imports', () => {
  it('copies a file a moved theme folder imports from outside it', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({components: './components'}),
      ...good,
      'lib/oceanTheme.doc.mjs': themeDoc('ocean'),
      'lib/oceanTheme.ts': `import {tokens} from '../shared/tokens';\nexport const oceanTheme = {tokens};\n`,
      'shared/tokens.ts': 'export const tokens = {};\n',
    });

    const message = only(await issuesOf(dir), 'unreachable_contribution');
    expect(message).toBe(
      `${unreachable('lib/oceanTheme.doc.mjs')} Fix: move lib/ to themes/ocean/ and set \`themes: './themes'\` in astryx.integration.mjs. Also copy shared/tokens.ts into themes/ocean/ and change the import of ../shared/tokens in oceanTheme.ts to ./tokens: a theme can import only files inside its own folder.`,
    );

    const fixed = follow(dir, {
      move: [['lib', 'themes/ocean']],
      write: {
        [MANIFEST]: manifest({components: './components', themes: './themes'}),
        'themes/ocean/tokens.ts': 'export const tokens = {};\n',
        'themes/ocean/oceanTheme.ts': `import {tokens} from './tokens';\nexport const oceanTheme = {tokens};\n`,
      },
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('copies what a theme imports from outside the folder a fix declares', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({components: './components'}),
      ...good,
      'palettes/sand/sandTheme.doc.mjs': themeDoc('sand'),
      'palettes/sand/sandTheme.ts': `import {tokens} from '../../shared/tokens.ts';\nexport const sandTheme = {tokens};\n`,
      'shared/tokens.ts': 'export const tokens = {};\n',
    });

    const message = only(await issuesOf(dir), 'unreachable_contribution');
    expect(message).toBe(
      `${unreachable('palettes/sand/sandTheme.doc.mjs')} Fix: set \`themes: './palettes'\` in astryx.integration.mjs. Also copy shared/tokens.ts into palettes/sand/ and change the import of ../../shared/tokens.ts in sandTheme.ts to ./tokens.ts: a theme can import only files inside its own folder.`,
    );

    const fixed = follow(dir, {
      write: {
        [MANIFEST]: manifest({
          components: './components',
          themes: './palettes',
        }),
        'palettes/sand/tokens.ts': 'export const tokens = {};\n',
        'palettes/sand/sandTheme.ts': `import {tokens} from './tokens.ts';\nexport const sandTheme = {tokens};\n`,
      },
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });
});

describe('a components root is offered only where every source has a doc', () => {
  it('moves the component instead of declaring a folder with a source no doc covers', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({docs: './docs'}),
      'docs/guide.doc.mjs': topic('guide'),
      'ui/Button.doc.mjs': componentDoc('Button'),
      'ui/Button.tsx': componentSource('Button'),
      'ui/Icon.tsx': componentSource('Icon'),
    });

    const message = only(await issuesOf(dir), 'unreachable_contribution');
    expect(message).toBe(
      `${unreachable('ui/Button.doc.mjs')} Fix: move it and Button.tsx into components/ and set \`components: './components'\` in astryx.integration.mjs.`,
    );

    const fixed = follow(dir, {
      move: [
        ['ui/Button.doc.mjs', 'components/Button.doc.mjs'],
        ['ui/Button.tsx', 'components/Button.tsx'],
      ],
      write: {
        [MANIFEST]: manifest({docs: './docs', components: './components'}),
      },
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });
});

describe('invalid_component fixes hold when followed', () => {
  it('names the real doc file for a .doc.ts component, and never says to delete it', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({components: './components'}),
      'components/Foo/Foo.doc.ts': componentDoc('Foo'),
    });

    const message = only(await issuesOf(dir), 'invalid_component');
    expect(message).toBe(
      'Component "Foo" is missing its same-stem source file Foo.tsx. Fix: add Foo.tsx beside Foo.doc.ts.',
    );

    const fixed = follow(dir, {
      write: {'components/Foo/Foo.tsx': componentSource('Foo')},
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('says to add the source beside a .doc.mjs component, and never to delete the doc', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({components: './components'}),
      'components/Widget.doc.mjs': componentDoc('Widget'),
    });

    const message = only(await issuesOf(dir), 'invalid_component');
    expect(message).toBe(
      'Component "Widget" is missing its same-stem source file Widget.tsx. Fix: add Widget.tsx beside Widget.doc.mjs.',
    );

    const fixed = follow(dir, {
      write: {'components/Widget.tsx': componentSource('Widget')},
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('moves a docs root out of the components root that also reads it', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({components: './src', docs: './src/docs'}),
      'src/Good/Good.doc.mjs': componentDoc('Good'),
      'src/Good/Good.tsx': componentSource('Good'),
      'src/docs/intro.doc.mjs': topic('intro'),
    });

    const message = only(await issuesOf(dir), 'invalid_component');
    expect(message).toBe(
      `Component "intro" is missing its same-stem source file intro.tsx. Fix: intro.doc.mjs has type: 'generic', so it is not a component, and the components root src/ also reads the docs root src/docs/ inside it; move src/docs/ to docs/ and set \`docs: './docs'\` in astryx.integration.mjs.`,
    );

    const fixed = follow(dir, {
      move: [['src/docs', 'docs']],
      write: {[MANIFEST]: manifest({components: './src', docs: './docs'})},
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('also moves a topic that sits beside the overlapping docs root', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({components: './src', docs: './src/docs'}),
      'src/Good/Good.doc.mjs': componentDoc('Good'),
      'src/Good/Good.tsx': componentSource('Good'),
      'src/docs/intro.doc.mjs': topic('intro'),
      'src/guide.doc.mjs': topic('guide'),
    });

    const issues = (await issuesOf(dir)).filter(
      issue => issue.code === 'invalid_component',
    );
    expect(issues.map(issue => issue.message)).toContain(
      `Component "guide" is missing its same-stem source file guide.tsx. Fix: guide.doc.mjs has type: 'generic', so it is not a component, and the components root src/ also reads the docs root src/docs/ inside it; move src/docs/ to docs/ and set \`docs: './docs'\` in astryx.integration.mjs, then move it into docs/.`,
    );

    const fixed = follow(dir, {
      move: [
        ['src/docs', 'docs'],
        ['src/guide.doc.mjs', 'docs/guide.doc.mjs'],
      ],
      write: {[MANIFEST]: manifest({components: './src', docs: './docs'})},
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('gives topics their own folder when the docs root and the components root are one folder', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({components: './src', docs: './src'}),
      'src/Good.doc.mjs': componentDoc('Good'),
      'src/Good.tsx': componentSource('Good'),
      'src/guide.doc.mjs': topic('guide'),
    });

    const message = only(await issuesOf(dir), 'invalid_component');
    expect(message).toBe(
      `Component "guide" is missing its same-stem source file guide.tsx. Fix: guide.doc.mjs has type: 'generic', so it is not a component, and the docs root and the components root are both src/; move the topics into docs/ and set \`docs: './docs'\` in astryx.integration.mjs.`,
    );

    const fixed = follow(dir, {
      move: [['src/guide.doc.mjs', 'docs/guide.doc.mjs']],
      write: {[MANIFEST]: manifest({components: './src', docs: './docs'})},
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('moves a topic out of a components root that sits inside the docs root', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({components: './src/components', docs: './src'}),
      'src/overview.doc.mjs': topic('overview'),
      'src/components/guide.doc.mjs': topic('guide'),
    });

    const before = await issuesOf(dir);
    const message = only(before, 'invalid_component');
    expect(message).toBe(
      `Component "guide" is missing its same-stem source file guide.tsx. Fix: guide.doc.mjs has type: 'generic', so it is not a component; move it out of src/components/ (the components root) to another folder under src/ (the docs root).`,
    );

    const fixed = follow(dir, {
      move: [['src/components/guide.doc.mjs', 'src/guides/guide.doc.mjs']],
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('moves a topic in the components root under the declared docs root', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({components: './components', docs: './docs'}),
      ...good,
      'components/guide.doc.mjs': topic('guide'),
      'docs/faq.doc.mjs': topic('faq'),
    });

    const message = only(await issuesOf(dir), 'invalid_component');
    expect(message).toBe(
      `Component "guide" is missing its same-stem source file guide.tsx. Fix: guide.doc.mjs has type: 'generic', so it is not a component; move it under docs/ (the docs root).`,
    );

    const fixed = follow(dir, {
      move: [['components/guide.doc.mjs', 'docs/guide.doc.mjs']],
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('moves a topic in the components root into a new docs root', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({components: './components'}),
      ...good,
      'components/guide.doc.mjs': topic('guide'),
    });

    const message = only(await issuesOf(dir), 'invalid_component');
    expect(message).toBe(
      `Component "guide" is missing its same-stem source file guide.tsx. Fix: guide.doc.mjs has type: 'generic', so it is not a component; move it into docs/ and set \`docs: './docs'\` in astryx.integration.mjs.`,
    );

    const fixed = follow(dir, {
      move: [['components/guide.doc.mjs', 'docs/guide.doc.mjs']],
      write: {
        [MANIFEST]: manifest({components: './components', docs: './docs'}),
      },
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('moves a theme in the components root into themes/<slug>/', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({components: './components'}),
      ...good,
      'components/ocean/oceanTheme.doc.mjs': themeDoc('ocean'),
      'components/ocean/oceanTheme.ts': themeSource('oceanTheme'),
    });

    const message = only(await issuesOf(dir), 'invalid_component');
    expect(message).toBe(
      `Component "oceanTheme" is missing its same-stem source file oceanTheme.tsx. Fix: oceanTheme.doc.mjs has type: 'theme', so it is not a component; move components/ocean/ to themes/ocean/ and set \`themes: './themes'\` in astryx.integration.mjs.`,
    );

    const fixed = follow(dir, {
      move: [['components/ocean', 'themes/ocean']],
      write: {
        [MANIFEST]: manifest({components: './components', themes: './themes'}),
      },
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('moves the components out of a components root that is the package root', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({components: './', docs: './docs'}),
      'Button.doc.mjs': componentDoc('Button'),
      'Button.tsx': componentSource('Button'),
      'docs/guide.doc.mjs': topic('guide'),
    });

    const message = only(await issuesOf(dir), 'invalid_component');
    expect(message).toBe(
      `Component "guide" is missing its same-stem source file guide.tsx. Fix: guide.doc.mjs has type: 'generic', so it is not a component, and the components root is the package root, which reads every doc in the package; create components/, move the components into it, and set \`components: './components'\` in astryx.integration.mjs.`,
    );

    const fixed = follow(dir, {
      move: [
        ['Button.doc.mjs', 'components/Button.doc.mjs'],
        ['Button.tsx', 'components/Button.tsx'],
      ],
      write: {
        [MANIFEST]: manifest({components: './components', docs: './docs'}),
      },
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });
});

describe('component fixes never leave another root reading the new files', () => {
  it('moves the components out of a folder another root also reads before a doc is added', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({components: './src', docs: './src'}),
      'src/Good.doc.mjs': componentDoc('Good'),
      'src/Good.tsx': componentSource('Good'),
      'src/Helper.tsx': componentSource('Helper'),
    });

    const message = only(await issuesOf(dir), 'source_without_component_doc');
    expect(message).toBe(
      `Component source "Helper.tsx" has no same-stem metadata file Helper.doc.mjs, so Astryx ignores it. Fix: add Helper.doc.mjs beside it with type: 'component'; \`astryx docs authoring component-doc\` lists its fields. The docs root is also src/; move the components there into components/ and set \`components: './components'\` in astryx.integration.mjs.`,
    );

    const fixed = follow(dir, {
      move: [
        ['src/Good.doc.mjs', 'components/Good.doc.mjs'],
        ['src/Good.tsx', 'components/Good.tsx'],
        ['src/Helper.tsx', 'components/Helper.tsx'],
      ],
      write: {
        [MANIFEST]: manifest({components: './components', docs: './src'}),
        'components/Helper.doc.mjs': componentDoc('Helper'),
      },
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('never moves the components into a components/ that holds a source without a doc', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({components: './', docs: './docs'}),
      'Button.doc.mjs': componentDoc('Button'),
      'Button.tsx': componentSource('Button'),
      'docs/guide.doc.mjs': topic('guide'),
      'components/Helper.tsx': componentSource('Helper'),
    });

    const message = only(await issuesOf(dir), 'invalid_component');
    expect(message).toBe(
      `Component "guide" is missing its same-stem source file guide.tsx. Fix: guide.doc.mjs has type: 'generic', so it is not a component, and the components root is the package root, which reads every doc in the package; move the components into a folder that holds only components, and set \`components\` to that folder in astryx.integration.mjs.`,
    );

    const fixed = follow(dir, {
      move: [
        ['Button.doc.mjs', 'ui/Button.doc.mjs'],
        ['Button.tsx', 'ui/Button.tsx'],
      ],
      write: {[MANIFEST]: manifest({components: './ui', docs: './docs'})},
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });
});

describe('source_without_component_doc fixes hold when followed', () => {
  it('adds the named doc, which resolves the warning', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({components: './components'}),
      'components/Widget.tsx': componentSource('Widget'),
    });

    const message = only(await issuesOf(dir), 'source_without_component_doc');
    expect(message).toBe(
      'Component source "Widget.tsx" has no same-stem metadata file Widget.doc.mjs, so Astryx ignores it. Fix: add Widget.doc.mjs beside it with type: \'component\'; `astryx docs authoring component-doc` lists its fields.',
    );

    const fixed = follow(dir, {
      write: {'components/Widget.doc.mjs': componentDoc('Widget')},
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('never asks for a doc that is already there but hidden', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({components: './components'}),
      'components/Secret.doc.mjs':
        "export default {\n  type: 'component',\n  name: 'Secret',\n  hidden: true,\n};\n",
      'components/Secret.tsx': componentSource('Secret'),
    });

    expect(await issuesOf(dir)).toEqual([]);
  });
});

describe('source_without_template_doc fixes hold when followed', () => {
  it('adds the named doc, which resolves the warning', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({templates: './templates'}),
      'templates/hero.tsx': templateSource('Hero'),
      'templates/hero.test.tsx': templateSource('HeroTest'),
    });

    const message = only(await issuesOf(dir), 'source_without_template_doc');
    expect(message).toBe(
      "Template source \"hero.tsx\" has no same-stem metadata file hero.doc.mjs, so `astryx template` never lists it. Fix: add hero.doc.mjs beside it with type: 'page' or 'block'; `astryx docs authoring integration-template-doc` lists its fields. If it is not a template, move it out of the templates root.",
    );

    const fixed = follow(dir, {
      write: {
        'templates/hero.doc.mjs': `export default {type: 'page', name: 'hero', displayName: 'Hero'};\n`,
      },
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('checks a dotted template id, but no test, spec or story file', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({templates: './templates'}),
      'templates/landing.page.tsx': templateSource('LandingPage'),
      'templates/hero.test.tsx': templateSource('HeroTest'),
      'templates/hero.spec.tsx': templateSource('HeroSpec'),
      'templates/hero.stories.tsx': templateSource('HeroStories'),
    });

    const message = only(await issuesOf(dir), 'source_without_template_doc');
    expect(message).toContain(
      'Template source "landing.page.tsx" has no same-stem metadata file landing.page.doc.mjs',
    );

    const fixed = follow(dir, {
      write: {
        'templates/landing.page.doc.mjs': `export default {type: 'page', name: 'landing.page', displayName: 'Landing'};\n`,
      },
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('never flags a helper in a subfolder of the templates root', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({templates: './templates'}),
      'templates/hero.doc.mjs': `export default {type: 'page', name: 'hero', displayName: 'Hero'};\n`,
      'templates/hero.tsx': templateSource('Hero'),
      'templates/hero/HeroCard.tsx': templateSource('HeroCard'),
    });

    expect(await issuesOf(dir)).toEqual([]);
  });

  it('accepts a released .template.mjs spec as the metadata', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({templates: './templates'}),
      'templates/hero.tsx': templateSource('Hero'),
      'templates/hero.template.mjs': `export default {type: 'page', name: 'hero', displayName: 'Hero'};\n`,
    });

    expect(await issuesOf(dir)).toEqual([]);
  });
});

describe('codemod fixes hold when followed', () => {
  it('moves a stray codemod into a version folder, and renames a mis-named one', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({codemods: './codemods'}),
      'codemods/forgotten.mjs': codemod,
      'codemods/v1/rename.mjs': codemod,
    });

    const issues = await issuesOf(dir);
    expect(only(issues, 'codemod_outside_version')).toBe(
      'Codemod file "codemods/forgotten.mjs" is outside a version folder, so upgrade will never load it. Fix: move it into the folder named for the version it migrates to, for example codemods/1.2.0/forgotten.mjs.',
    );
    expect(only(issues, 'invalid_codemod_version')).toBe(
      'Codemod folder "v1" is not an exact semver version such as 1.2.0. Fix: rename it to the exact version its codemods migrate to.',
    );

    const fixed = follow(dir, {
      move: [
        ['codemods/forgotten.mjs', 'codemods/1.2.0/forgotten.mjs'],
        ['codemods/v1', 'codemods/1.0.0'],
      ],
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('never offers the manifest as a codemod when the codemods root is the package root', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({codemods: './', components: './components'}),
      ...good,
      '1.2.0/rename.mjs': codemod,
      'index.mjs': 'export const version = 1;\n',
    });

    const issues = await issuesOf(dir);
    expect(issues.map(issue => issue.message).join('\n')).not.toContain(
      `Codemod file "${MANIFEST}"`,
    );
    const rootFix =
      "Fix: the codemods root is the package root, so everything in the package is read as a codemod or a version folder. Create codemods/, move each version folder into it, and set `codemods: './codemods'` in astryx.integration.mjs.";
    expect(only(issues, 'codemod_outside_version')).toBe(
      `Codemod file "index.mjs" is outside a version folder, so upgrade will never load it. ${rootFix} If it is a codemod, move it into the folder named for the version it migrates to, for example codemods/1.2.0/index.mjs.`,
    );
    expect(only(issues, 'invalid_codemod_version')).toBe(
      `Codemod folder "components" is not an exact semver version such as 1.2.0. ${rootFix}`,
    );

    // index.mjs is the package entry, not a codemod, so it stays.
    const fixed = follow(dir, {
      mkdir: ['codemods'],
      move: [['1.2.0', 'codemods/1.2.0']],
      write: {
        [MANIFEST]: manifest({
          codemods: './codemods',
          components: './components',
        }),
      },
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('gives codemods their own folder when the codemods root holds another root', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({
        codemods: './src',
        components: './src/components',
      }),
      'src/components/Good.doc.mjs': componentDoc('Good'),
      'src/components/Good.tsx': componentSource('Good'),
      'src/1.2.0/rename.mjs': codemod,
    });

    const message = only(await issuesOf(dir), 'invalid_codemod_version');
    expect(message).toBe(
      'Codemod folder "components" is not an exact semver version such as 1.2.0. Fix: the codemods root src/ also holds the components root src/components/. Create codemods/, move each version folder into it, and set `codemods: \'./codemods\'` in astryx.integration.mjs.',
    );

    const fixed = follow(dir, {
      mkdir: ['codemods'],
      move: [['src/1.2.0', 'codemods/1.2.0']],
      write: {
        [MANIFEST]: manifest({
          codemods: './codemods',
          components: './src/components',
        }),
      },
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('moves a root out of codemods/ instead of renaming it as a version', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({
        codemods: './codemods',
        components: './codemods/components',
      }),
      'codemods/components/Good.doc.mjs': componentDoc('Good'),
      'codemods/components/Good.tsx': componentSource('Good'),
      'codemods/1.2.0/rename.mjs': codemod,
    });

    const message = only(await issuesOf(dir), 'invalid_codemod_version');
    expect(message).toBe(
      'Codemod folder "components" is not an exact semver version such as 1.2.0. Fix: it holds the components root codemods/components/; move that root out of codemods/ and update `components` in astryx.integration.mjs.',
    );

    const fixed = follow(dir, {
      move: [['codemods/components', 'components']],
      write: {
        [MANIFEST]: manifest({
          codemods: './codemods',
          components: './components',
        }),
      },
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });
  it('picks a new folder for codemods when codemods/ already holds something else', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({codemods: './', components: './components'}),
      ...good,
      '1.2.0/rename.mjs': codemod,
      'codemods/notes.mjs': 'export const notes = 1;\n',
    });

    const issues = await issuesOf(dir);
    const rootFix =
      'Fix: the codemods root is the package root, so everything in the package is read as a codemod or a version folder. Move each version folder into a new folder of their own, and set `codemods` to that folder in astryx.integration.mjs.';
    expect(
      issues
        .filter(issue => issue.code === 'invalid_codemod_version')
        .map(issue => issue.message),
    ).toEqual([
      `Codemod folder "codemods" is not an exact semver version such as 1.2.0. ${rootFix}`,
      `Codemod folder "components" is not an exact semver version such as 1.2.0. ${rootFix}`,
    ]);

    const fixed = follow(dir, {
      move: [['1.2.0', 'migrations/1.2.0']],
      write: {
        [MANIFEST]: manifest({
          codemods: './migrations',
          components: './components',
        }),
      },
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('moves contribution metadata out of the codemods root instead of into a version', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({codemods: './codemods'}),
      'codemods/1.2.0/rename.mjs': codemod,
      'codemods/guide.doc.mjs': topic('guide'),
    });

    const message = only(await issuesOf(dir), 'codemod_outside_version');
    expect(message).toBe(
      `Codemod file "codemods/guide.doc.mjs" is outside a version folder, so upgrade will never load it. Fix: guide.doc.mjs has type: 'generic', so it is not a codemod; move it into docs/ and set \`docs: './docs'\` in astryx.integration.mjs.`,
    );

    const fixed = follow(dir, {
      move: [['codemods/guide.doc.mjs', 'docs/guide.doc.mjs']],
      write: {[MANIFEST]: manifest({codemods: './codemods', docs: './docs'})},
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('names a theme source whose descriptor is a .doc.ts file', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({codemods: './codemods'}),
      'codemods/1.2.0/rename.mjs': codemod,
      'codemods/oceanTheme.doc.ts': themeDoc('ocean'),
      'codemods/oceanTheme.ts': themeSource('oceanTheme'),
    });

    const issues = (await issuesOf(dir)).filter(
      issue => issue.code === 'codemod_outside_version',
    );
    const move =
      "move oceanTheme.doc.ts and oceanTheme.ts (with any local files it imports) into themes/ocean/ and set `themes: './themes'` in astryx.integration.mjs. Also rename oceanTheme.doc.ts to oceanTheme.doc.mjs: a theme descriptor is a .doc.mjs file.";
    expect(issues.map(issue => issue.message)).toEqual([
      `Codemod file "codemods/oceanTheme.doc.ts" is outside a version folder, so upgrade will never load it. Fix: oceanTheme.doc.ts has type: 'theme', so it is not a codemod; ${move}`,
      `Codemod file "codemods/oceanTheme.ts" is outside a version folder, so upgrade will never load it. Fix: oceanTheme.ts is the source of oceanTheme.doc.ts, which has type: 'theme', so neither is a codemod; ${move}`,
    ]);

    const fixed = follow(dir, {
      move: [
        ['codemods/oceanTheme.doc.ts', 'themes/ocean/oceanTheme.doc.mjs'],
        ['codemods/oceanTheme.ts', 'themes/ocean/oceanTheme.ts'],
      ],
      write: {
        [MANIFEST]: manifest({codemods: './codemods', themes: './themes'}),
      },
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('moves a file a theme imports out of the codemods root with the theme', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({codemods: './codemods'}),
      'codemods/1.2.0/rename.mjs': codemod,
      'codemods/oceanTheme.doc.mjs': themeDoc('ocean'),
      'codemods/oceanTheme.ts': `import {tokens} from './oceanTokens';\nexport const oceanTheme = {tokens};\n`,
      'codemods/oceanTokens.ts': 'export const tokens = {};\n',
    });

    const [tokens] = (await issuesOf(dir)).filter(issue =>
      issue.message.includes('"codemods/oceanTokens.ts"'),
    );
    expect(tokens.message).toBe(
      `Codemod file "codemods/oceanTokens.ts" is outside a version folder, so upgrade will never load it. Fix: oceanTokens.ts is imported by oceanTheme.ts, the source of oceanTheme.doc.mjs, which has type: 'theme', so none of them is a codemod; move oceanTheme.doc.mjs and oceanTheme.ts (with any local files it imports) into themes/ocean/ and set \`themes: './themes'\` in astryx.integration.mjs.`,
    );

    const fixed = follow(dir, {
      move: [
        ['codemods/oceanTheme.doc.mjs', 'themes/ocean/oceanTheme.doc.mjs'],
        ['codemods/oceanTheme.ts', 'themes/ocean/oceanTheme.ts'],
        ['codemods/oceanTokens.ts', 'themes/ocean/oceanTokens.ts'],
      ],
      write: {
        [MANIFEST]: manifest({codemods: './codemods', themes: './themes'}),
      },
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('moves a theme source out of the codemods root with its descriptor', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({codemods: './codemods'}),
      'codemods/1.2.0/rename.mjs': codemod,
      'codemods/oceanTheme.doc.mjs': themeDoc('ocean'),
      'codemods/oceanTheme.ts': themeSource('oceanTheme'),
    });

    const issues = (await issuesOf(dir)).filter(
      issue => issue.code === 'codemod_outside_version',
    );
    const move =
      "move oceanTheme.doc.mjs and oceanTheme.ts (with any local files it imports) into themes/ocean/ and set `themes: './themes'` in astryx.integration.mjs.";
    expect(issues.map(issue => issue.message)).toEqual([
      `Codemod file "codemods/oceanTheme.doc.mjs" is outside a version folder, so upgrade will never load it. Fix: oceanTheme.doc.mjs has type: 'theme', so it is not a codemod; ${move}`,
      `Codemod file "codemods/oceanTheme.ts" is outside a version folder, so upgrade will never load it. Fix: oceanTheme.ts is the source of oceanTheme.doc.mjs, which has type: 'theme', so neither is a codemod; ${move}`,
    ]);

    const fixed = follow(dir, {
      move: [
        ['codemods/oceanTheme.doc.mjs', 'themes/ocean/oceanTheme.doc.mjs'],
        ['codemods/oceanTheme.ts', 'themes/ocean/oceanTheme.ts'],
      ],
      write: {
        [MANIFEST]: manifest({codemods: './codemods', themes: './themes'}),
      },
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });
});
