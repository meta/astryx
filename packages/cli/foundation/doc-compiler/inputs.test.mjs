// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Every authored descriptor becomes exactly one compiler input.
 *
 * The repo check is the completeness oracle for what Core and the CLI ship:
 * every `.doc.mjs` under a descriptor root is read once, and nothing else is.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {Project} from '../config/project.mjs';
import {CLI_ROOT} from '../fs/paths.mjs';
import {collectDocInputs, packageSource} from './inputs.mjs';

const REPO_ROOT = path.resolve(CLI_ROOT, '..', '..');
const SKIP = new Set(['__tests__', '__fixtures__', 'fixtures', 'node_modules']);

/**
 * Every `.doc.mjs` under a directory, by real path.
 * @param {string} dir
 * @param {Set<string>} into
 */
function docFiles(dir, into) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name)) docFiles(full, into);
    } else if (entry.name.endsWith('.doc.mjs')) {
      into.add(fs.realpathSync(full));
    }
  }
  return into;
}

let tmpDir;

beforeEach(() => {
  // Inside the repo, so the project finds this checkout's Core.
  tmpDir = fs.mkdtempSync(path.join(REPO_ROOT, '.astryx-doc-inputs-'));
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({name: 'consumer', version: '1.0.0'}),
  );
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('collectDocInputs over what this repo ships', () => {
  it('reads every descriptor Core and the CLI ship exactly once', async () => {
    const {inputs, problems} = await collectDocInputs(
      await Project.load(tmpDir),
    );
    expect(problems).toEqual([]);

    // What ships comes from the packages themselves, not from the module under
    // test: Core's source, and every directory the CLI's package.json ships.
    const shipped = new Set();
    docFiles(path.join(REPO_ROOT, 'packages', 'core', 'src'), shipped);
    const {files} = JSON.parse(
      fs.readFileSync(path.join(CLI_ROOT, 'package.json'), 'utf-8'),
    );
    for (const entry of files) {
      if (entry.startsWith('!')) continue;
      const full = path.join(CLI_ROOT, entry);
      if (fs.statSync(full).isDirectory()) docFiles(full, shipped);
    }
    const read = inputs.map(input => input.file);
    const rel = (/** @type {string} */ file) => path.relative(REPO_ROOT, file);
    expect(read.filter(file => !shipped.has(file)).map(rel)).toEqual([]);
    expect([...shipped].filter(file => !read.includes(file)).map(rel)).toEqual(
      [],
    );
    expect(new Set(read).size).toBe(read.length);
    expect(new Set(inputs.map(input => input.id)).size).toBe(inputs.length);
  }, 120_000);

  it('pins the core docs that `component <Name>` reads but the list leaves out', async () => {
    const {inputs} = await collectDocInputs(await Project.load(tmpDir));
    // Each is readable by name; listing them would change `component --list`,
    // so a new entry here is a decision, not a silent drift.
    expect(
      inputs
        .filter(input => input.listed === false)
        .map(input => input.name)
        .sort(),
    ).toEqual([
      'Chat',
      'ChatComposerTokenElement',
      'ContextMenuItem',
      'Indicator',
      'Layer',
      'NavMenu',
      'Resizable',
      'SyntaxTheme',
    ]);
  });

  it('keys templates by type and directory, not by their display title', async () => {
    const {inputs} = await collectDocInputs(await Project.load(tmpDir));
    const byName = new Map(
      inputs
        .filter(input => input.root === 'templates')
        .map(input => [input.name, input]),
    );
    // A showcase shares its title with the block it shows; both stay inputs.
    expect(byName.get('block/BannerStatuses')?.source).toBe(
      '@astryxdesign/cli/assets/templates/blocks/components/Banner/BannerStatuses.doc.mjs',
    );
    expect(byName.get('block/BannerShowcase')?.source).toBe(
      '@astryxdesign/cli/assets/templates/blocks/components/Banner/BannerShowcase.doc.mjs',
    );
  });
});

describe('collectDocInputs over an integration', () => {
  /**
   * @param {string} rel
   * @param {string} text
   */
  function write(rel, text) {
    const file = path.join(tmpDir, 'node_modules', '@acme', 'kit', rel);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, text);
  }

  it('lists each descriptor once, owned by the package, with where it ships', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'consumer',
        version: '1.0.0',
        dependencies: {'@acme/kit': '^1.0.0'},
      }),
    );
    write(
      'package.json',
      JSON.stringify({name: '@acme/kit', version: '1.0.0'}),
    );
    write(
      'astryx.integration.mjs',
      "export default {components: './components', templates: './templates', docs: './docs', themes: './themes'};\n",
    );
    write(
      'components/AcmeCard.tsx',
      'export function AcmeCard() { return null; }\n',
    );
    write(
      'components/AcmeCard.doc.mjs',
      "export default {type: 'component', name: 'AcmeCard', displayName: 'Acme Card', usage: {description: 'A card.'}, props: []};\n",
    );
    write(
      'templates/hero.tsx',
      'export default function Hero() { return null; }\n',
    );
    write(
      'templates/hero.doc.mjs',
      "export default {type: 'block', name: 'Hero block', description: 'A hero.'};\n",
    );
    const topic = (/** @type {object} */ fields) =>
      `export default ${JSON.stringify({
        type: 'generic',
        title: 'Acme',
        description: 'Acme notes.',
        sections: [{title: 'Acme', content: [{type: 'prose', text: 'Hi.'}]}],
        ...fields,
      })};\n`;
    write('docs/acme-guide.doc.mjs', topic({name: 'acme-guide'}));
    write(
      'docs/theme-notes.doc.mjs',
      topic({name: 'theme-notes', extends: 'theme'}),
    );
    write('themes/ocean/oceanTheme.ts', 'export const oceanTheme = {};\n');
    write(
      'themes/ocean/oceanTheme.doc.mjs',
      "/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\nexport default {type: 'theme', name: 'ocean', displayName: 'Ocean', description: 'Blue.', maintained: true};\n",
    );

    const project = await Project.load(tmpDir);
    expect(await project.issues()).toEqual([]);
    const {inputs, problems} = await collectDocInputs(project);
    expect(problems).toEqual([]);
    expect(
      inputs
        .filter(input => input.owner === '@acme/kit')
        .map(({id, source, role}) => ({id, source, role})),
    ).toEqual([
      {
        id: '@acme/kit:components:AcmeCard',
        source: '@acme/kit/components/AcmeCard.doc.mjs',
        role: undefined,
      },
      {
        id: '@acme/kit:templates:block/hero',
        source: '@acme/kit/templates/hero.doc.mjs',
        role: undefined,
      },
      {
        id: '@acme/kit:themes:ocean',
        source: '@acme/kit/themes/ocean/oceanTheme.doc.mjs',
        role: undefined,
      },
      {
        id: '@acme/kit:docs:theme+theme-notes',
        source: '@acme/kit/docs/theme-notes.doc.mjs',
        role: 'extension',
      },
      {
        id: '@acme/kit:docs:acme-guide',
        source: '@acme/kit/docs/acme-guide.doc.mjs',
        role: 'base',
      },
    ]);
  });
});

describe('collectDocInputs problems', () => {
  /** @param {object} overrides */
  const project = overrides =>
    /** @type {any} */ ({
      cwd: os.tmpdir(),
      components: async () => [],
      templates: async () => [],
      themes: async () => [],
      iconSets: async () => ({sets: []}),
      docs: async () => ({entries: () => []}),
      ...overrides,
    });

  it('reports a file two roots both claim, and reads it once', async () => {
    const file = path.join(tmpDir, 'Shared.doc.mjs');
    fs.writeFileSync(file, 'export default {};\n');
    const {inputs, problems} = await collectDocInputs(
      project({
        components: async () => [
          {name: 'Shared', package: '@acme/kit', docPath: file},
        ],
        templates: async () => [
          {
            type: 'block',
            dirName: 'shared',
            package: '@acme/kit',
            docPath: file,
          },
        ],
      }),
    );
    expect(
      inputs.filter(input => input.file === fs.realpathSync(file)),
    ).toHaveLength(1);
    expect(problems).toEqual([
      {
        code: 'duplicate_file',
        provider: '@acme/kit',
        source: expect.stringMatching(/\/Shared\.doc\.mjs$/),
        message: expect.stringContaining(
          'is read as templates "block/shared" and as components "Shared"',
        ),
      },
    ]);
  });

  it('reports two files under one input id', async () => {
    const one = path.join(tmpDir, 'a', 'Card.doc.mjs');
    const two = path.join(tmpDir, 'b', 'Card.doc.mjs');
    for (const file of [one, two]) {
      fs.mkdirSync(path.dirname(file), {recursive: true});
      fs.writeFileSync(file, 'export default {};\n');
    }
    const {problems} = await collectDocInputs(
      project({
        components: async () => [
          {name: 'Card', package: '@acme/kit', docPath: one},
          {name: 'Card', package: '@acme/kit', docPath: two},
        ],
      }),
    );
    expect(problems).toEqual([
      {
        code: 'duplicate_id',
        provider: '@acme/kit',
        source: expect.stringMatching(/\/Card\.doc\.mjs$/),
        message: expect.stringContaining('both read as components "Card"'),
      },
    ]);
  });
});

describe('packageSource', () => {
  it('names the package a file ships in and its path inside it', () => {
    expect(
      packageSource(path.join(CLI_ROOT, 'api', 'docs', 'docs.doc.mjs')),
    ).toBe('@astryxdesign/cli/api/docs/docs.doc.mjs');
  });
});
