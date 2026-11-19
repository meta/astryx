// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A template doc that writes a command with a `{@command …}` token, or links
 * a doc with `{@link …}`, never prints the token: `astryx template`,
 * `astryx build` and `astryx search` show the command with the project's
 * command name in text and as the bare `astryx …` command in JSON
 * (spec:AST-081 FR5). A template's source prints byte for byte.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {REPO_ROOT} from '../../../test-utils/repo-root.mjs';
import {requireNatively} from '../../../test-utils/native-require.mjs';

const require = requireNatively(import.meta.url);
/** @type {typeof import('../../../api/template/template.mjs')} */
const {template} = require('../../../api/template/template.mjs');
/** @type {typeof import('../../../api/build/build.mjs')} */
const {build} = require('../../../api/build/build.mjs');

vi.setConfig({testTimeout: 60_000, hookTimeout: 60_000});

/** The command name the fixture's integration declares for running the CLI. */
const RUN = 'acme astryx';
const PAGE = 'Zebra roster board: read {@command docs icons} first.';
const BLOCK = 'Zebra roster strip: read {@command docs icons} first.';
const LINKED =
  'Zebra roster panel: theme it as {@link @astryxdesign/cli:generic:theme} says.';
const SOURCE =
  '// Run `astryx docs icons` for icons.\nexport default function Page() { return null; }\n';

/** @type {string} */
let dir;

beforeAll(() => {
  // Under the repository so the project resolves the workspace's Core.
  dir = fs.mkdtempSync(path.join(REPO_ROOT, '.astryx-template-doc-tokens-'));
  const pkg = path.join(dir, 'node_modules', '@acme', 'kit');
  fs.mkdirSync(path.join(pkg, 'templates'), {recursive: true});
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({name: 'app', dependencies: {'@acme/kit': '1.0.0'}}),
  );
  fs.writeFileSync(
    path.join(dir, 'astryx.config.mjs'),
    "export default {integrations: ['@acme/kit']};\n",
  );
  fs.writeFileSync(
    path.join(pkg, 'package.json'),
    JSON.stringify({name: '@acme/kit', version: '1.0.0'}),
  );
  fs.writeFileSync(
    path.join(pkg, 'astryx.integration.mjs'),
    `export default ${JSON.stringify({cliCommand: RUN, templates: './templates'})};\n`,
  );
  for (const [name, type, description] of [
    ['zebra-roster', 'page', PAGE],
    ['ZebraStrip', 'block', BLOCK],
    ['zebra-panel', 'page', LINKED],
  ]) {
    fs.writeFileSync(
      path.join(pkg, 'templates', `${name}.doc.mjs`),
      `export default ${JSON.stringify({
        type,
        name,
        category: 'Acme',
        description,
        keywords: ['zebra', 'roster'],
      })};\n`,
    );
    fs.writeFileSync(path.join(pkg, 'templates', `${name}.tsx`), SOURCE);
  }
  // A package of blocks for a component: `astryx component <Name> --blocks`
  // lists them.
  const blocks = path.join(dir, 'node_modules', '@acme', 'blocks');
  fs.mkdirSync(path.join(blocks, 'docs'), {recursive: true});
  fs.mkdirSync(path.join(blocks, 'blocks', 'Button'), {recursive: true});
  fs.writeFileSync(
    path.join(blocks, 'package.json'),
    JSON.stringify({
      name: '@acme/blocks',
      version: '1.0.0',
      astryx: {docs: 'docs', blocks: 'blocks'},
    }),
  );
  fs.writeFileSync(
    path.join(blocks, 'blocks', 'Button', 'ZebraBand.doc.mjs'),
    `export default ${JSON.stringify({
      name: 'ZebraBand',
      description: 'Zebra roster band: read {@command docs icons} first.',
      componentsUsed: ['Button'],
    })};\n`,
  );
  fs.writeFileSync(
    path.join(blocks, 'blocks', 'Button', 'ZebraBand.tsx'),
    SOURCE,
  );
  fs.writeFileSync(
    path.join(blocks, 'blocks', 'Button', 'ZebraLinkBand.doc.mjs'),
    `export default ${JSON.stringify({
      name: 'ZebraLinkBand',
      description:
        'Zebra roster link band: theme it as {@link @astryxdesign/cli:generic:theme} says.',
      componentsUsed: ['Button'],
    })};\n`,
  );
  fs.writeFileSync(
    path.join(blocks, 'blocks', 'Button', 'ZebraLinkBand.tsx'),
    SOURCE,
  );
});

afterAll(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

/** @param {string} out */
function expectLinkedText(out) {
  expect(out).toContain(
    `Zebra roster panel: theme it as \`${RUN} docs theme\` says.`,
  );
  expect(out).not.toContain('{@link');
}

/** @param {string} out */
function expectLinkedJson(out) {
  expect(out).toContain(
    'Zebra roster panel: theme it as `astryx docs theme` says.',
  );
  expect(out).not.toContain('{@link');
}

/** @param {string} out */
function expectText(out) {
  expect(out).toContain(
    `Zebra roster board: read \`${RUN} docs icons\` first.`,
  );
  expect(out).not.toContain('{@command');
}

/** @param {string} out */
function expectJson(out) {
  expect(out).toContain('Zebra roster board: read `astryx docs icons` first.');
  expect(out).not.toContain('{@command');
  expect(out).not.toContain(RUN);
}

describe('astryx template', () => {
  it('the list, in text and JSON', async () => {
    const text = await runCli(['template', '--list'], dir);
    expect(text.code).toBe(0);
    expectText(text.stdout);
    const json = await runCli(['template', '--list', '--json'], dir);
    expect(json.code).toBe(0);
    expectJson(json.stdout);
  });

  it('the skeleton, in text and JSON', async () => {
    const text = await runCli(['template', 'zebra-roster', '--skeleton'], dir);
    expect(text.code).toBe(0);
    expectText(text.stdout);
    const json = await runCli(
      ['template', 'zebra-roster', '--skeleton', '--json'],
      dir,
    );
    expect(json.code).toBe(0);
    expectJson(json.stdout);
  });

  it('the source prints byte for byte', async () => {
    const r = await runCli(['template', 'zebra-roster'], dir);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain(SOURCE.trimEnd());
    const json = await runCli(['template', 'zebra-roster', '--json'], dir);
    expect(JSON.parse(json.stdout).data.source).toBe(SOURCE);
  });
});

describe('astryx build', () => {
  it('names the template with its rendered description', async () => {
    const text = await runCli(['build', 'zebra roster board'], dir);
    expect(text.code).toBe(0);
    expect(text.stdout).toContain('zebra-roster');
    expect(text.stdout).not.toContain('{@command');
    expect(text.stdout).toContain(`\`${RUN} docs icons\``);
    const verbose = await runCli(
      ['build', 'zebra roster board', '--verbose'],
      dir,
    );
    expect(verbose.code).toBe(0);
    expectText(verbose.stdout);
    expect(verbose.stdout).not.toContain('`astryx docs icons`');
    const json = await runCli(['build', 'zebra roster board', '--json'], dir);
    expect(json.code).toBe(0);
    expect(json.stdout).toContain('zebra-roster');
    expect(json.stdout).not.toContain('{@command');
    expect(json.stdout).not.toContain(RUN);
  });
});

describe('astryx search', () => {
  it('a template hit, in text and JSON', async () => {
    const text = await runCli(
      ['search', 'zebra roster', '--type', 'template', '--verbose'],
      dir,
    );
    expect(text.code).toBe(0);
    expectText(text.stdout);
    const json = await runCli(
      ['search', 'zebra roster', '--type', 'template', '--json'],
      dir,
    );
    expect(json.code).toBe(0);
    expectJson(json.stdout);
  });
});

describe('a {@link} in a template description', () => {
  it('astryx template: the list and the skeleton', async () => {
    const list = await runCli(['template', '--list'], dir);
    expect(list.code).toBe(0);
    expectLinkedText(list.stdout);
    const listJson = await runCli(['template', '--list', '--json'], dir);
    expectLinkedJson(listJson.stdout);
    const skeleton = await runCli(
      ['template', 'zebra-panel', '--skeleton'],
      dir,
    );
    expect(skeleton.code).toBe(0);
    expectLinkedText(skeleton.stdout);
    const skeletonJson = await runCli(
      ['template', 'zebra-panel', '--skeleton', '--json'],
      dir,
    );
    expectLinkedJson(skeletonJson.stdout);
  });

  it('astryx build', async () => {
    const text = await runCli(
      ['build', 'zebra roster panel', '--verbose'],
      dir,
    );
    expect(text.code).toBe(0);
    expect(text.stdout).toContain('zebra-panel');
    expectLinkedText(text.stdout);
    const json = await runCli(['build', 'zebra roster panel', '--json'], dir);
    expect(json.stdout).toContain('zebra-panel');
    expectLinkedJson(json.stdout);
  });

  it('astryx search', async () => {
    const text = await runCli(
      ['search', 'zebra roster panel', '--type', 'template', '--verbose'],
      dir,
    );
    expect(text.code).toBe(0);
    expectLinkedText(text.stdout);
    const json = await runCli(
      ['search', 'zebra roster panel', '--type', 'template', '--json'],
      dir,
    );
    expectLinkedJson(json.stdout);
  });
});

describe('astryx component --blocks', () => {
  it("a block's description, in text and JSON", async () => {
    const text = await runCli(['component', 'Button', '--blocks'], dir);
    expect(text.code).toBe(0);
    expect(text.stdout).toContain(
      `Zebra roster band: read \`${RUN} docs icons\` first.`,
    );
    expect(text.stdout).not.toContain('{@command');
    const json = await runCli(
      ['component', 'Button', '--blocks', '--json'],
      dir,
    );
    expect(json.code).toBe(0);
    expect(json.stdout).toContain(
      'Zebra roster band: read `astryx docs icons` first.',
    );
    expect(json.stdout).not.toContain('{@command');
    expect(json.stdout).not.toContain(RUN);
  });

  it("a block's {@link}, in text and JSON", async () => {
    const text = await runCli(['component', 'Button', '--blocks'], dir);
    expect(text.stdout).toContain(
      `Zebra roster link band: theme it as \`${RUN} docs theme\` says.`,
    );
    expect(text.stdout).not.toContain('{@link');
    const json = await runCli(
      ['component', 'Button', '--blocks', '--json'],
      dir,
    );
    expect(json.stdout).toContain(
      'Zebra roster link band: theme it as `astryx docs theme` says.',
    );
    expect(json.stdout).not.toContain('{@link');
  });
});

describe('a {@pm} step renders for the project the API call names', () => {
  /** @type {string} */
  let yarnDir;
  beforeAll(() => {
    // A Yarn project, read from this process's folder, which uses pnpm.
    yarnDir = fs.mkdtempSync(path.join(REPO_ROOT, '.astryx-template-doc-pm-'));
    fs.writeFileSync(
      path.join(yarnDir, 'package.json'),
      JSON.stringify({
        name: 'yarn-app',
        packageManager: 'yarn@4.9.1',
        dependencies: {'@acme/stack': '1.0.0'},
      }),
    );
    fs.writeFileSync(path.join(yarnDir, 'yarn.lock'), '');
    fs.writeFileSync(
      path.join(yarnDir, 'astryx.config.mjs'),
      "export default {integrations: ['@acme/stack']};\n",
    );
    const pkg = path.join(yarnDir, 'node_modules', '@acme', 'stack');
    fs.mkdirSync(path.join(pkg, 'templates'), {recursive: true});
    fs.writeFileSync(
      path.join(pkg, 'package.json'),
      JSON.stringify({name: '@acme/stack', version: '1.0.0'}),
    );
    fs.writeFileSync(
      path.join(pkg, 'astryx.integration.mjs'),
      "export default {templates: './templates'};\n",
    );
    fs.writeFileSync(
      path.join(pkg, 'templates', 'zebra-stack.doc.mjs'),
      `export default ${JSON.stringify({
        type: 'page',
        name: 'zebra-stack',
        category: 'Acme',
        description: 'Zebra roster stack: run {@pm install zebra-kit} first.',
        keywords: ['zebra', 'stack'],
      })};\n`,
    );
    fs.writeFileSync(path.join(pkg, 'templates', 'zebra-stack.tsx'), SOURCE);
  });
  afterAll(() => {
    fs.rmSync(yarnDir, {recursive: true, force: true});
  });

  it('template(): the list and the skeleton', async () => {
    const list = /** @type {any} */ (
      await template(undefined, {list: true, cwd: yarnDir})
    );
    const entry = list.data.find(
      (/** @type {any} */ each) => each.id === 'zebra-stack',
    );
    expect(entry.description).toBe(
      'Zebra roster stack: run `yarn add zebra-kit` first.',
    );
    const skeleton = /** @type {any} */ (
      await template('zebra-stack', {skeleton: true, cwd: yarnDir})
    );
    expect(skeleton.data.description).toBe(
      'Zebra roster stack: run `yarn add zebra-kit` first.',
    );
  });

  it('build(): every part of one answer agrees', async () => {
    const kit = await build('zebra roster stack', {cwd: yarnDir});
    const text = JSON.stringify(kit);
    expect(text).toContain('yarn add zebra-kit');
    expect(text).not.toContain('pnpm add zebra-kit');
    expect(text).not.toContain('{@pm');
  });
});
