// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Golden reads: what `astryx` prints, as text and as JSON, for docs an
 *   integration contributes. Every doc kind reaches these readers through the
 *   doc compiler; these snapshots pin what a reader sees, so a change to the
 *   compiler that moves a byte of output fails here.
 *
 * Update after an intended output change: `vitest run -u` on this file, then
 * review the diff of `__golden__/`.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {CLI_ROOT} from '../foundation/fs/paths.mjs';
import {
  CLI_VERSION,
  linkThisCliAsProjectCli,
} from '../test-utils/release-fixtures.mjs';

const REPO_ROOT = path.resolve(CLI_ROOT, '..', '..');
const CLI_BIN = path.join(CLI_ROOT, 'clients', 'cli', 'bin', 'astryx.mjs');
const GOLDEN = path.join(CLI_ROOT, 'test', '__golden__');

let project;

/**
 * @param {string} rel
 * @param {string} text
 */
function write(rel, text) {
  const file = path.join(project, 'node_modules', '@acme', 'kit', rel);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, text);
}

/**
 * Run the CLI in the fixture project; machine paths become placeholders.
 * @param {string[]} args
 * @returns {string}
 */
function astryx(args) {
  const result = spawnSync(process.execPath, [CLI_BIN, ...args], {
    cwd: project,
    encoding: 'utf8',
    env: {...process.env, NO_COLOR: '1', FORCE_COLOR: '0', COLUMNS: '100'},
  });
  expect(result.status).toBe(0);
  return result.stdout
    .split(`"${CLI_VERSION}"`)
    .join('"<cli version>"')
    .split(project)
    .join('<project>')
    .split(REPO_ROOT)
    .join('<repo>');
}

/**
 * The entries of a `--json` list that the fixture contributed.
 * @param {string} out
 * @param {(entry: any) => boolean} mine
 */
function fixtureEntries(out, mine) {
  const parsed = JSON.parse(out);
  return `${JSON.stringify({...parsed, data: parsed.data.filter(mine)}, null, 2)}\n`;
}

beforeAll(() => {
  // Inside the repo, so the project finds this checkout's Core.
  project = fs.mkdtempSync(path.join(REPO_ROOT, '.astryx-golden-'));
  fs.writeFileSync(
    path.join(project, 'package.json'),
    JSON.stringify({
      name: 'golden-consumer',
      version: '1.0.0',
      dependencies: {'@acme/kit': '^1.0.0'},
    }),
  );
  // The consumer has the CLI installed, so the reads' hints run its `astryx`
  // bin; a project without one gets the scoped package instead.
  fs.mkdirSync(path.join(project, 'node_modules', '.bin'), {recursive: true});
  fs.writeFileSync(path.join(project, 'node_modules', '.bin', 'astryx'), '');
  linkThisCliAsProjectCli(project);
  write('package.json', JSON.stringify({name: '@acme/kit', version: '1.2.3'}));
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
    `/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export default {
  type: 'component',
  name: 'AcmeCard',
  displayName: 'Acme Card',
  category: 'Layout',
  keywords: ['zorblax', 'card'],
  usage: {
    description: 'A zorblax card that groups one topic.',
    bestPractices: [
      {guidance: true, description: 'Keep one idea per card.'},
      {guidance: false, description: 'Do not nest cards.'},
    ],
  },
  props: [
    {name: 'title', type: 'string', required: true, description: 'Heading text.'},
    {name: 'tone', type: "'calm' | 'loud'", default: "'calm'", description: 'Visual weight.'},
  ],
  playground: {defaults: {onPress: undefined, tone: 'calm'}},
};
export const docsZh = {
  usage: {description: '一张 zorblax 卡片。'},
  propDescriptions: {title: '标题文字。'},
};
`,
  );
  write(
    'templates/hero.tsx',
    'export default function Hero() { return <section>zorblax</section>; }\n',
  );
  write(
    'templates/hero.doc.mjs',
    "export default {type: 'block', name: 'Zorblax hero', description: 'A zorblax hero block.', aspectRatio: 2, componentsUsed: ['AcmeCard']};\n",
  );
  const topic = (/** @type {object} */ fields) =>
    `export default ${JSON.stringify(
      {
        type: 'generic',
        title: 'Acme guide',
        description: 'How zorblax cards fit together.',
        sections: [
          {
            title: 'Start',
            content: [{type: 'prose', text: 'Install the kit.'}],
          },
          {
            title: 'Colors',
            content: [
              {type: 'prose', text: 'Cards use the core tokens.'},
              {type: 'token-ref', topic: 'no-such-topic', section: 'x'},
            ],
          },
        ],
        ...fields,
      },
      null,
      2,
    )};\n`;
  write('docs/acme-guide.doc.mjs', topic({name: 'acme-guide'}));
  write('themes/ocean/oceanTheme.ts', 'export const oceanTheme = {};\n');
  write(
    'themes/ocean/oceanTheme.doc.mjs',
    "/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\nexport default {type: 'theme', name: 'ocean', displayName: 'Ocean', description: 'A zorblax blue.', maintained: true};\n",
  );
});

afterAll(() => {
  fs.rmSync(project, {recursive: true, force: true});
});

describe('golden reads of integration docs', () => {
  it.each([
    ['component-text.txt', ['component', 'AcmeCard']],
    ['component.json', ['component', 'AcmeCard', '--json']],
    ['component-zh.json', ['component', 'AcmeCard', '--zh', '--json']],
    ['component-props.json', ['component', 'AcmeCard', '--props', '--json']],
    ['template.json', ['template', 'hero', '--type', 'block', '--json']],
    ['docs-topic.json', ['docs', 'acme-guide', '--full', '--json']],
    ['docs-topic-text.txt', ['docs', 'acme-guide', '--full']],
    ['docs-index.txt', ['docs', 'acme-guide', '--index']],
    ['docs-section.json', ['docs', 'acme-guide', 'colors', '--json']],
    ['search.json', ['search', 'zorblax', '--json']],
    ['theme-add-list.json', ['theme', 'add', '--list', '--json']],
  ])('%s', async (name, args) => {
    await expect(astryx(args)).toMatchFileSnapshot(path.join(GOLDEN, name));
  });

  it('theme-list.json', async () => {
    await expect(
      fixtureEntries(
        astryx(['theme', 'list', '--json']),
        entry => entry.package === '@acme/kit',
      ),
    ).toMatchFileSnapshot(path.join(GOLDEN, 'theme-list.json'));
  });

  it('docs-list.json', async () => {
    await expect(
      fixtureEntries(
        astryx(['docs', '--json']),
        entry => entry.package === '@acme/kit',
      ),
    ).toMatchFileSnapshot(path.join(GOLDEN, 'docs-list.json'));
  });
});
