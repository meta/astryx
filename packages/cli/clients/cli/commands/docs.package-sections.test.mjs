// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Sections that two packages add to one topic never collide.
 *
 * Two theme packages each document themselves by extending `theme`. Both add a
 * section with one title, and both add one whose title derives no key. Each package's
 * sections stay in the read, the index, a namespace read, and search, in
 * whatever order the app configures the packages. A section from the package
 * configured second takes a key that names its package; a collision with the
 * topic's own section keeps its numeric key.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {runCli} from '../../../test-utils/run-cli.mjs';

const SLOW = 60_000;

const GUIDE = 'authoring/quick-start';

/** @type {string} */
let tmpDir;

/**
 * The docs one made-up theme package ships: a section on `theme` titled
 * `Install`, one whose title derives no key, and a section on a placed guide
 * titled `Notes`.
 * @param {string} name
 */
const themePackage = name => ({
  [`${name}-theme.doc.mjs`]: {
    type: 'generic',
    name: `${name}-theme`,
    extends: 'theme',
    title: `${name} theme`,
    description: `Use the ${name} theme.`,
    sections: [
      {
        title: 'Install',
        content: [{type: 'prose', text: `Install the ${name} theme package.`}],
      },
      {
        title: '安装',
        content: [{type: 'prose', text: `Apply the ${name} theme.`}],
      },
      ...(name === 'ocean'
        ? [
            {
              title: 'Integration Themes',
              content: [
                {type: 'prose', text: 'Ocean is an integration theme.'},
              ],
            },
          ]
        : []),
    ],
  },
  [`${name}-notes.doc.mjs`]: {
    type: 'generic',
    name: `${name}-notes`,
    extends: GUIDE,
    title: `${name} notes`,
    description: `Notes on the ${name} theme.`,
    sections: [
      {
        title: 'Notes',
        content: [{type: 'prose', text: `Release notes for ${name}.`}],
      },
    ],
  },
});

const PACKAGES = {
  '@acme/ocean-theme': themePackage('ocean'),
  '@acme/dune-theme': themePackage('dune'),
  // An experimental theme package: search never returns its section.
  '@acme/lab-theme': {
    'lab-theme.doc.mjs': {
      type: 'generic',
      name: 'lab-theme',
      extends: 'theme',
      stability: 'experimental',
      title: 'lab theme',
      description: 'Use the lab theme.',
      sections: [
        {
          title: 'Install',
          content: [{type: 'prose', text: 'Install the lab theme package.'}],
        },
      ],
    },
  },
};

/** @param {string[]} integrations in configured order */
function scaffold(integrations) {
  fs.writeFileSync(
    path.join(tmpDir, 'astryx.config.mjs'),
    `export default {integrations: ${JSON.stringify(integrations)}};\n`,
  );
}

/** @param {string[]} args */
async function cli(args) {
  const read = await runCli(args, {cwd: tmpDir});
  expect(read.status, read.stderr).toBe(0);
  return read;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-docs-collide-'));
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({name: 'consumer', version: '1.0.0'}),
  );
  for (const [name, docs] of Object.entries(PACKAGES)) {
    const packageDir = path.join(tmpDir, 'node_modules', ...name.split('/'));
    fs.mkdirSync(path.join(packageDir, 'docs'), {recursive: true});
    fs.writeFileSync(
      path.join(packageDir, 'package.json'),
      JSON.stringify({name, version: '1.0.0'}),
    );
    fs.writeFileSync(
      path.join(packageDir, 'astryx.integration.mjs'),
      "export default {docs: './docs'};\n",
    );
    for (const [file, doc] of Object.entries(docs)) {
      fs.writeFileSync(
        path.join(packageDir, 'docs', file),
        `export const docs = ${JSON.stringify(doc, null, 2)};\n`,
      );
    }
  }
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe.each([
  ['ocean first', ['@acme/ocean-theme', '@acme/dune-theme'], 'ocean', 'dune'],
  ['dune first', ['@acme/dune-theme', '@acme/ocean-theme'], 'dune', 'ocean'],
])('astryx docs, %s', (_order, integrations, first, second) => {
  beforeEach(() => scaffold(integrations));

  it(
    'keeps both packages’ sections on the topic, the second keyed by its package',
    async () => {
      const read = await cli(['--json', 'docs', 'theme', '--full']);
      const {data} = JSON.parse(read.stdout);
      /** @param {string} name */
      const from = name =>
        data.sections
          .filter(
            (/** @type {{package: string}} */ each) =>
              each.package === `@acme/${name}-theme`,
          )
          .map((/** @type {any} */ each) => [each.id, each.title]);
      expect(from(first)[0]).toEqual(['install', 'Install']);
      expect(from(second)[0]).toEqual([
        `acme-${second}-theme-install`,
        'Install',
      ]);
      expect(from(first)).toHaveLength(first === 'ocean' ? 3 : 2);
      expect(from(second)).toHaveLength(second === 'ocean' ? 3 : 2);
      // A title only the case of the topic's own section sets apart keeps
      // the numeric key it always had.
      expect(from('ocean')).toContainEqual([
        'integration-themes-2',
        'Integration Themes',
      ]);
      const text = JSON.stringify(data.sections);
      expect(text).toContain(`Install the ${first} theme package.`);
      expect(text).toContain(`Install the ${second} theme package.`);
      expect(text).toContain(`Apply the ${first} theme.`);
      expect(text).toContain(`Apply the ${second} theme.`);
    },
    SLOW,
  );

  it(
    'reads the second package’s section by its key and lists both in the index',
    async () => {
      const section = await cli([
        'docs',
        'theme',
        `acme-${second}-theme-install`,
      ]);
      expect(section.stdout).toContain(`Install the ${second} theme package.`);
      expect(section.stdout).not.toContain(
        `Install the ${first} theme package.`,
      );
      const index = await cli(['docs', 'theme', '--index']);
      expect(index.stdout).toContain(`Install the ${first} theme package.`);
      expect(index.stdout).toContain(`Install the ${second} theme package.`);
    },
    SLOW,
  );

  it(
    'lists both packages’ sections of a placed guide in a namespace read',
    async () => {
      const read = await cli([
        '--json',
        'docs',
        'authoring',
        '--depth',
        'all',
        '--detail',
        'full',
      ]);
      expect(read.stdout).toContain(`Release notes for ${first}.`);
      expect(read.stdout).toContain(`Release notes for ${second}.`);
    },
    SLOW,
  );

  it(
    'finds both packages’ sections in search',
    async () => {
      for (const name of [first, second]) {
        const read = await cli([
          '--json',
          'search',
          `install the ${name} theme package`,
          '--type',
          'doc',
        ]);
        expect(read.stdout).toContain(`@acme/${name}-theme`);
      }
    },
    SLOW,
  );
});

describe.each([
  ['stable first', ['@acme/ocean-theme', '@acme/lab-theme']],
  ['experimental first', ['@acme/lab-theme', '@acme/ocean-theme']],
])('astryx search with an experimental package, %s', (_order, integrations) => {
  beforeEach(() => scaffold(integrations));

  it(
    'finds the stable package’s section and never the experimental one',
    async () => {
      const ocean = await cli([
        '--json',
        'search',
        'install the ocean theme package',
        '--type',
        'doc',
      ]);
      expect(ocean.stdout).toContain('@acme/ocean-theme');
      const lab = await cli([
        '--json',
        'search',
        'install the lab theme package',
        '--type',
        'doc',
      ]);
      expect(lab.stdout).not.toContain('@acme/lab-theme');
    },
    SLOW,
  );
});
