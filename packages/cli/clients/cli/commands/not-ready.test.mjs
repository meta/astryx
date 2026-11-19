// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Every command result that lists or returns a template marks one whose
 * doc sets `isReady: false`: its `--json` carries `isReady: false` (and `true`
 * for every other template it lists), and its text says `(not ready)`. No
 * output or shipped file still says `(WIP)`.
 *
 * The walk covers each response type in TEMPLATE_RESULTS with a made-up
 * unready page and block. Every other response type the CLI can return is in
 * NO_TEMPLATE_RESULTS, so a new response type fails here until it is placed in
 * one list or the other.
 *
 * @input a project with made-up integration templates, the CLI's manifest
 * @output the text and JSON of every command that lists or returns a template
 * @position packages/cli/clients/cli/commands — cross-command output rules
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

const CLI = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const REPO = path.resolve(CLI, '../..');
const SLOW = 120_000;

/**
 * The response types whose result lists or returns a template, each with the
 * command the walk runs for it.
 */
const TEMPLATE_RESULTS = {
  search: ['search', 'quokka roster'],
  'build.kit': ['build', 'a quokka roster page with a quokka table'],
  'template.list': ['template', '--list'],
  'template.show': ['template', 'quokka-unready', '--type', 'page'],
  'template.skeleton': [
    'template',
    'quokka-unready',
    '--type',
    'page',
    '--skeleton',
  ],
  'template.copy': ['template', 'quokka-unready', 'out', '--type', 'page'],
  'component.detail.blocks': ['component', 'Table', '--blocks'],
};

/** What each walked command's text says about the made-up unready template. */
const TEXT_MARKS = {
  search:
    'name:        quokka-unready\ndomain:      template\npackage:     @acme/pages\ndisplayName: Quokka Roster\nkind:        page (not ready)\n',
  // Build starts only from a ready page and lists only pages it could start
  // from, so its kit names the unready block alone.
  'build.kit': 'QuokkaTable (not ready)',
  'template.list': 'name:        Quokka Roster (not ready)\n',
  'template.show': 'template: quokka-unready (not ready)\n',
  'template.skeleton': '\n# quokka-unready (not ready) ',
  'template.copy': 'Copied template quokka-unready (not ready) to ',
  'component.detail.blocks': 'QuokkaTable (not ready) (@acme/blocks)',
};

/**
 * Response types that list or return no template. A template can appear in
 * them only inside a message, a hint, a suggestion or a command string.
 */
const NO_TEMPLATE_RESULTS = new Set([
  'blog.list',
  'blog.detail',
  'build.help',
  'component.list',
  'component.batch',
  'component.detail',
  'component.detail.props',
  'component.detail.source',
  'component.detail.showcase',
  // discover names a package's templates only by id, often for a package
  // the project has not installed, so its results carry neither.
  'discover.list',
  'discover.detail',
  'discover.detail.doc',
  'discover.item',
  'discover.search',
  'docs.list',
  'docs.detail',
  'docs.index',
  'docs.detail.section',
  'docs.node',
  'docs.skill',
  'docs.skills',
  'doctor',
  'integration.component-conflicts',
  'integration.doc-conflicts',
  // An authoring check: its conflicts name a package's own template files.
  'integration.template-conflicts',
  'integration.validate',
  'icon.search',
  'icon.detail',
  'icon.definitions',
  'icon.setIcons',
  'icon.list',
  'icon.add',
  'icon.addVariants',
  'icon.definitionMatches',
  'icon.mapMany',
  'icon.map',
  'icon.newDefinition',
  'icon.newSet',
  'icon.use',
  'render.page',
  'render.reverse',
  'help',
  'theme.app',
  'theme.build',
  'theme.build.check',
  'theme.build.batch',
  'themeEdit.how',
  'themeEdit.new',
  'themeEdit.set',
  'themeEdit.show',
  'themeEdit.undo',
  'theme.eject',
  'theme.list',
  // Pages the preview wrote into the app, not templates.
  'themeEdit.previewAdd',
  'themeEdit.previewApp',
  'themeEdit.previewList',
  'themeEdit.previewRemove',
  'theme.targets',
  'theme.template',
  'theme.palette.generate',
  'gap-report.categories',
  'gap-report.file',
  'hook.list',
  'hook.detail',
  'hook.detail.params',
  'init.run',
  'init.remove',
  'init.user',
  'integration.add',
  'integration.check',
  'integration.pack-check',
  'manifest',
  'swizzle.list',
  'swizzle.copy',
  'template.cdn',
  'upgrade.list',
  'upgrade.registry',
  'upgrade.status',
  'upgrade.run',
  'version',
]);

/** @type {string} */
let dir;

/**
 * @param {string[]} args
 * @param {string} [cwd]
 */
function run(args, cwd = dir) {
  const env = {...process.env, NO_COLOR: '1', COLUMNS: '100'};
  for (const key of Object.keys(env)) {
    if (key.startsWith('VITEST')) delete env[key];
  }
  const result = spawnSync(
    process.execPath,
    [path.join(CLI, 'clients', 'cli', 'bin', 'astryx.mjs'), ...args],
    {cwd, encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024},
  );
  expect(result.status, `${args.join(' ')}: ${result.stderr}`).toBe(0);
  return {stdout: result.stdout, stderr: result.stderr};
}

/**
 * Every object in `value` that names a template: one with `isReady`, or a
 * template search result.
 * @param {unknown} value
 * @returns {any[]}
 */
function templatesIn(value) {
  if (Array.isArray(value)) return value.flatMap(templatesIn);
  if (value == null || typeof value !== 'object') return [];
  const own = /** @type {any} */ (value);
  const nested = Object.values(own).flatMap(templatesIn);
  return 'isReady' in own || own.domain === 'template'
    ? [own, ...nested]
    : nested;
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-not-ready-walk-'));
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name: 'consumer',
      private: true,
      dependencies: {
        '@astryxdesign/core': '*',
        '@acme/pages': '1.0.0',
        '@acme/blocks': '1.0.0',
      },
    }),
  );
  const scope = path.join(dir, 'node_modules', '@astryxdesign');
  fs.mkdirSync(scope, {recursive: true});
  fs.symlinkSync(path.join(CLI, '..', 'core'), path.join(scope, 'core'), 'dir');
  const acme = path.join(dir, 'node_modules', '@acme', 'pages');
  const templates = path.join(acme, 'templates');
  fs.mkdirSync(templates, {recursive: true});
  fs.writeFileSync(
    path.join(acme, 'package.json'),
    JSON.stringify({name: '@acme/pages', version: '1.0.0'}),
  );
  fs.writeFileSync(
    path.join(acme, 'astryx.integration.mjs'),
    `export default { templates: './templates' };\n`,
  );
  /** @param {string} id @param {string} doc */
  const write = (id, doc) => {
    fs.writeFileSync(path.join(templates, `${id}.doc.mjs`), doc);
    fs.writeFileSync(
      path.join(templates, `${id}.tsx`),
      `import {Table} from '@astryxdesign/core/Table';\nexport default function Page() { return <Table columns={[]} data={[]} />; }\n`,
    );
  };
  write(
    'quokka-unready',
    `export default {type: 'page', name: 'Quokka Roster', description: 'A quokka roster as rows.', isReady: false};\n`,
  );
  write(
    'quokka-ready',
    `export default {type: 'page', name: 'Quokka Board', description: 'A quokka roster as cards.'};\n`,
  );
  // `component <Name> --blocks` reads blocks from packages that declare
  // `astryx.docs` and `astryx.blocks`.
  const blocksPkg = path.join(dir, 'node_modules', '@acme', 'blocks');
  fs.mkdirSync(path.join(blocksPkg, 'blocks'), {recursive: true});
  fs.mkdirSync(path.join(blocksPkg, 'docs'), {recursive: true});
  fs.writeFileSync(
    path.join(blocksPkg, 'package.json'),
    JSON.stringify({
      name: '@acme/blocks',
      version: '1.0.0',
      astryx: {docs: './docs', blocks: './blocks'},
    }),
  );
  fs.writeFileSync(
    path.join(blocksPkg, 'blocks', 'QuokkaTable.doc.mjs'),
    `export default {type: 'block', name: 'Quokka Table', description: 'A quokka roster table.', componentsUsed: ['Table'], isReady: false};\n`,
  );
  fs.writeFileSync(
    path.join(blocksPkg, 'blocks', 'QuokkaTable.tsx'),
    `export default function Block() { return null; }\n`,
  );
});
afterAll(() => fs.rmSync(dir, {recursive: true, force: true}));

describe('a template that is not ready', () => {
  it(
    'is marked in the JSON and the text of every result that lists or returns it',
    () => {
      for (const [type, args] of Object.entries(TEMPLATE_RESULTS)) {
        if (type === 'template.copy') {
          fs.rmSync(path.join(dir, 'out'), {recursive: true, force: true});
        }
        const json = JSON.parse(run(['--json', ...args]).stdout);
        expect(json.type, args.join(' ')).toBe(type);
        const named = templatesIn(json.data);
        if (type.startsWith('template.') && type !== 'template.list') {
          named.push(json.data);
        }
        expect(named.length, type).toBeGreaterThan(0);
        for (const t of named) {
          expect(typeof t.isReady, `${type}: ${JSON.stringify(t)}`).toBe(
            'boolean',
          );
        }
        const unready = named.filter(t => t.isReady === false);
        expect(
          unready.some(t =>
            [t.name, t.id, t.template].some(n =>
              ['quokka-unready', 'QuokkaTable'].includes(n),
            ),
          ),
          `${type}: ${JSON.stringify(unready)}`,
        ).toBe(true);
        for (const t of named.filter(t => t.isReady)) {
          expect(t.name, type).not.toBe('quokka-unready');
        }

        if (type === 'template.copy') {
          fs.rmSync(path.join(dir, 'out'), {recursive: true, force: true});
        }
        const {stdout, stderr} = run(args);
        expect(`${stdout}\n${stderr}`, type).toContain(TEXT_MARKS[type]);
        expect(`${stdout}\n${stderr}`, type).not.toContain('(WIP)');
      }
    },
    SLOW,
  );

  it('is checked in every response type that lists or returns a template', () => {
    const manifest = JSON.parse(run(['manifest', '--json'], REPO).stdout);
    const types = new Set(
      Object.values(
        manifest.data.responseTypes ?? manifest.responseTypes,
      ).flat(),
    );
    types.add('version');
    const unplaced = [...types].filter(
      t => !(t in TEMPLATE_RESULTS) && !NO_TEMPLATE_RESULTS.has(t),
    );
    expect(unplaced).toEqual([]);
  });

  it('is never tagged (WIP) in a file the CLI ships', () => {
    // The folders package.json publishes, minus tests.
    const shipped = [
      'clients',
      'api',
      'assets',
      'authoring',
      'foundation',
      'host',
    ];
    /** @param {string} at @returns {string[]} */
    const walk = at =>
      fs.readdirSync(at, {withFileTypes: true}).flatMap(entry => {
        const file = path.join(at, entry.name);
        if (entry.isDirectory()) {
          return entry.name === 'node_modules' || entry.name === '__tests__'
            ? []
            : walk(file);
        }
        return /\.(mjs|cjs|js|ts|md|json)$/.test(entry.name) &&
          !/\.test\./.test(entry.name)
          ? [file]
          : [];
      });
    const tagged = shipped
      .flatMap(folder => walk(path.join(CLI, folder)))
      .filter(file => fs.readFileSync(file, 'utf8').includes('(WIP)'))
      .map(file => path.relative(CLI, file));
    expect(tagged).toEqual([]);
  });
});
