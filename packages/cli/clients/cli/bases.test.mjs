// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Bases: how a run picks its base, the one requirement check, help
 * that lists only what the base serves, the refusal, and the manifest. A
 * fixture project whose only base is `@acme/native-ui` stands in for a
 * component library that is not Core.
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';
import {afterEach, describe, expect, it} from 'vitest';
import {
  buildsOn,
  resolveBase,
  splitForBase,
} from '../../foundation/bases/resolve.mjs';
import {
  checkRequirements,
  declaredParts,
} from '../../foundation/bases/requirements.mjs';
import {BASE_STEPS} from '../../foundation/bases/steps.mjs';
import {coreBase} from '../../foundation/bases/core.mjs';
import {unknownCapabilityKeys} from '../../foundation/bases/steps.mjs';
import {refusesHereFirst} from './lib/base-gate.mjs';
import {rebaseManifest} from './lib/manifest.mjs';

const BIN = path.resolve(import.meta.dirname, 'bin', 'astryx.mjs');
const COMMANDS = path.resolve(import.meta.dirname, 'commands');
const SLOW = 60_000;
const CORE_ROOT = path.resolve(import.meta.dirname, '../../../core');

/** @type {string[]} */
const tmpDirs = [];
afterEach(() => {
  while (tmpDirs.length) {
    fs.rmSync(/** @type {string} */ (tmpDirs.pop()), {
      recursive: true,
      force: true,
    });
  }
});

/**
 * @param {string} file
 * @param {string} text
 */
function write(file, text) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, text);
}

/**
 * Install a package with an integration manifest into `dir`.
 * @param {string} dir
 * @param {string} name
 * @param {{manifest: string, peers?: Record<string, string>, files?: Record<string, string>}} spec
 */
function installPackage(dir, name, {manifest, peers, files = {}}) {
  const root = path.join(dir, 'node_modules', ...name.split('/'));
  write(
    path.join(root, 'package.json'),
    JSON.stringify({
      name,
      version: '2.1.0',
      type: 'module',
      ...(peers ? {peerDependencies: peers} : {}),
    }),
  );
  write(path.join(root, 'astryx.integration.mjs'), manifest);
  for (const [file, text] of Object.entries(files)) {
    write(path.join(root, file), text);
  }
  return root;
}

/**
 * A project that installs the given packages and the Astryx CLI, and no
 * Core.
 * @param {Record<string, {manifest: string, peers?: Record<string, string>, files?: Record<string, string>}>} packages
 * @returns {string}
 */
function project(packages) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-bases-'));
  tmpDirs.push(dir);
  write(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name: 'app',
      private: true,
      dependencies: Object.fromEntries(
        Object.keys(packages).map(name => [name, '2.1.0']),
      ),
      devDependencies: {'@astryxdesign/cli': '*'},
    }),
  );
  for (const [name, spec] of Object.entries(packages)) {
    installPackage(dir, name, spec);
  }
  return dir;
}

/** A base that serves content only. */
const CONTENT_BASE = {manifest: 'export default {base: {}};\n'};

/**
 * @param {string[]} args
 * @param {string} cwd
 */
function astryx(args, cwd) {
  const result = spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: 'utf-8',
    env: {...process.env, CI: '1'},
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    json: () => JSON.parse(result.stdout),
  };
}

/**
 * Every file under `dir`, relative, for proving a refused run wrote nothing.
 * @param {string} dir
 * @returns {string[]}
 */
function listFiles(dir) {
  return fs
    .readdirSync(dir, {recursive: true, withFileTypes: true})
    .filter(entry => entry.isFile())
    .map(entry => path.relative(dir, path.join(entry.parentPath, entry.name)))
    .sort();
}

/**
 * A loaded integration as Project.load returns one.
 * @param {string} dir
 * @param {string} name
 * @param {Record<string, unknown>} [extra]
 * @returns {any}
 */
function loaded(dir, name, extra = {}) {
  return {
    name,
    version: '2.1.0',
    __spec: name,
    __packageDir: path.join(dir, 'node_modules', ...name.split('/')),
    __manifestFile: 'astryx.integration.mjs',
    ...extra,
  };
}

describe('base resolution', () => {
  const none = () => false;

  it('answers from Core when no integration declares base', () => {
    const r = resolveBase({
      cwd: os.tmpdir(),
      integrations: [],
      projectHasCore: none,
    });
    expect(r.ok && r.base.core).toBe(true);
  });

  it('takes the one installed base in a project with no Core', () => {
    const dir = project({'@acme/native-ui': CONTENT_BASE});
    const r = resolveBase({
      cwd: dir,
      integrations: [
        loaded(dir, '@acme/native-ui', {base: {}, __autolinked: true}),
      ],
      projectHasCore: none,
    });
    expect(r.ok && r.base.name).toBe('@acme/native-ui');
  });

  it('answers from Core when the project installs Core beside another base', () => {
    const dir = project({'@acme/native-ui': CONTENT_BASE});
    const r = resolveBase({
      cwd: dir,
      integrations: [loaded(dir, '@acme/native-ui', {base: {}})],
      projectHasCore: () => true,
    });
    expect(r.ok && r.base.core).toBe(true);
  });

  it('fails with ERR_BASE_AMBIGUOUS for two bases and no Core', () => {
    const dir = project({
      '@acme/native-ui': CONTENT_BASE,
      '@acme/tv-ui': CONTENT_BASE,
    });
    const r = resolveBase({
      cwd: dir,
      integrations: [
        loaded(dir, '@acme/native-ui', {base: {}}),
        loaded(dir, '@acme/tv-ui', {base: {}}),
      ],
      projectHasCore: none,
    });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe('ERR_BASE_AMBIGUOUS');
    expect(!r.ok && r.message).toContain('--base @acme/tv-ui');
  });

  it('takes --base first, and names why a package is not a base', () => {
    const dir = project({
      '@acme/native-ui': CONTENT_BASE,
      '@acme/widgets': {manifest: 'export default {};\n'},
    });
    const integrations = [
      loaded(dir, '@acme/native-ui', {base: {}}),
      loaded(dir, '@acme/widgets'),
    ];
    const core = resolveBase({
      cwd: dir,
      integrations,
      requested: '@astryxdesign/core',
      projectHasCore: none,
    });
    expect(core.ok && core.base.core).toBe(true);
    const notBase = resolveBase({
      cwd: dir,
      integrations,
      requested: '@acme/widgets',
      projectHasCore: none,
    });
    expect(!notBase.ok && notBase.code).toBe('ERR_BASE_NOT_FOUND');
    expect(!notBase.ok && notBase.message).toContain('does not declare base');
    const broken = resolveBase({
      cwd: dir,
      integrations: [
        ...integrations,
        loaded(dir, '@acme/broken', {__loadError: 'Unexpected token'}),
      ],
      requested: '@acme/broken',
      projectHasCore: none,
    });
    expect(!broken.ok && broken.message).toBe(
      '--base @acme/broken: its integration manifest does not load: Unexpected token',
    );
    const missing = resolveBase({
      cwd: dir,
      integrations,
      requested: '@acme/nope',
      projectHasCore: none,
    });
    expect(!missing.ok && missing.message).toContain('is not installed');
  });

  it('takes the base an integration package is or builds on', () => {
    const dir = project({
      '@acme/native-ui': CONTENT_BASE,
      '@acme/charts': {
        manifest: 'export default {};\n',
        peers: {'@acme/native-ui': '*'},
      },
    });
    const base = loaded(dir, '@acme/native-ui', {base: {}});
    const local = loaded(dir, '@acme/charts', {__local: true});
    const r = resolveBase({
      cwd: dir,
      integrations: [base, local],
      projectHasCore: () => true,
    });
    expect(r.ok && r.base.name).toBe('@acme/native-ui');
    const self = resolveBase({
      cwd: dir,
      integrations: [{...base, __local: true}],
      projectHasCore: () => true,
    });
    expect(self.ok && self.base.name).toBe('@acme/native-ui');
  });
});

describe('a stored manifest', () => {
  it('follows the run base, as the published package reads it', () => {
    const stored = /** @type {any} */ ({
      name: 'astryx',
      base: {name: '@astryxdesign/core', version: '1.0.0', steps: BASE_STEPS},
      commands: [
        {
          name: 'theme',
          available: true,
          subcommands: [
            {name: 'theme build', requires: ['themes.compile'], available: true},
            {name: 'theme list', available: true},
          ],
        },
        {name: 'experimental', available: true, subcommands: [
          {name: 'experimental render', requires: ['render.page'], available: true},
        ]},
      ],
    });
    const onCore = rebaseManifest(stored, coreBase());
    expect(onCore.base.name).toBe('@astryxdesign/core');
    expect(onCore.commands[0].subcommands.map(c => c.available)).toEqual([true, true]);
    const native = rebaseManifest(stored, {
      name: '@acme/native-ui', core: false, dir: null, version: '2.1.0', adapters: {}, steps: [],
    });
    expect(native.base).toEqual({name: '@acme/native-ui', version: '2.1.0', steps: []});
    expect(native.commands[0].available).toBe(true);
    expect(native.commands[0].subcommands.map(c => c.available)).toEqual([false, true]);
    expect(native.commands[1].available).toBe(false);
  });
});

describe('the base declaration', () => {
  it('reports an adapter capability this CLI does not know', () => {
    expect(
      unknownCapabilityKeys({base: {adapters: {theme: './t.mjs', themes: './t.mjs'}}}),
    ).toEqual(['base.adapters.theme']);
  });
});

describe('integrations build on the bases they list as peers', () => {
  it('keeps only the integrations that are or build on the run base', () => {
    const dir = project({
      '@acme/native-ui': CONTENT_BASE,
      '@acme/native-charts': {
        manifest: 'export default {};\n',
        peers: {'@acme/native-ui': '*'},
      },
      '@acme/web-charts': {
        manifest: 'export default {};\n',
        peers: {'@astryxdesign/core': '*'},
      },
      '@acme/plain': {manifest: 'export default {};\n'},
      '@acme/both': {
        manifest: 'export default {};\n',
        peers: {'@astryxdesign/core': '*', '@acme/native-ui': '*'},
      },
    });
    const integrations = [
      loaded(dir, '@acme/native-ui', {base: {}}),
      loaded(dir, '@acme/native-charts'),
      loaded(dir, '@acme/web-charts'),
      loaded(dir, '@acme/plain'),
      loaded(dir, '@acme/both'),
    ];
    const native = splitForBase(integrations, {
      name: '@acme/native-ui',
      core: false,
      dir: null,
      version: null,
      adapters: {},
      steps: [],
    });
    expect(native.kept.map(i => i.name)).toEqual([
      '@acme/native-ui',
      '@acme/native-charts',
      '@acme/both',
    ]);
    expect(native.leftOut.map(l => [l.integration.name, l.buildsOn])).toEqual([
      ['@acme/web-charts', ['@astryxdesign/core']],
      ['@acme/plain', ['@astryxdesign/core']],
    ]);
    const core = splitForBase(integrations, coreBase());
    expect(core.kept.map(i => i.name)).toEqual([
      '@acme/web-charts',
      '@acme/plain',
      '@acme/both',
    ]);
    expect(core.leftOut.map(l => [l.integration.name, l.buildsOn])).toEqual([
      ['@acme/native-ui', []],
      ['@acme/native-charts', ['@acme/native-ui']],
    ]);
  });

  it('leaves every integration in when no integration declares base', () => {
    const integrations = [loaded(os.tmpdir(), '@acme/plain')];
    expect(splitForBase(integrations, coreBase()).kept).toBe(integrations);
  });

  it('builds on Core when the package lists no base', () => {
    const dir = project({
      '@acme/plain': {manifest: 'export default {};\n', peers: {react: '*'}},
    });
    expect(
      buildsOn(loaded(dir, '@acme/plain'), new Set(['@astryxdesign/core'])),
    ).toEqual(['@astryxdesign/core']);
  });
});

describe('the requirement check', () => {
  const doc = /** @type {any} */ ({
    name: 'demo',
    requires: ['themes.compile'],
    options: [{flag: '-s, --skeleton', requires: ['templates.skeleton']}],
    args: [{name: 'kind', requires: {theme: ['themes.scaffold']}}],
  });

  it('collects the command, then each given option, then each given argument value', () => {
    expect(
      declaredParts('demo', doc, {
        options: new Set(['--skeleton']),
        args: ['theme'],
      }).map(p => p.requires),
    ).toEqual([
      ['themes.compile'],
      ['templates.skeleton'],
      ['themes.scaffold'],
    ]);
    expect(
      declaredParts('demo', doc, {options: new Set(), args: ['component']}),
    ).toHaveLength(1);
  });

  it('passes every step on Core without loading anything', async () => {
    const verdict = await checkRequirements(
      'demo',
      doc,
      {options: new Set(), args: []},
      coreBase(),
    );
    expect(verdict.ok).toBe(true);
  });

  it('loads the declared adapter, hands it over, and refuses a step it does not export', async () => {
    const dir = project({
      '@acme/native-ui': {
        manifest: '',
        files: {
          'adapters/themes.mjs':
            'export function compile() { return "css"; }\n',
        },
      },
    });
    const base = {
      name: '@acme/native-ui',
      core: false,
      dir: path.join(dir, 'node_modules', '@acme', 'native-ui'),
      version: '2.1.0',
      adapters: {themes: './adapters/themes.mjs'},
      steps: BASE_STEPS.filter(step => step.startsWith('themes.')),
    };
    const ok = await checkRequirements(
      'theme build',
      doc,
      {options: new Set(), args: []},
      base,
    );
    expect(ok.ok).toBe(true);
    expect(ok.ok && typeof ok.adapters.themes.compile).toBe('function');

    const scaffold = await checkRequirements(
      'theme build',
      doc,
      {options: new Set(), args: ['theme']},
      base,
    );
    expect(!scaffold.ok && scaffold.requirement).toMatchObject({
      argument: {name: 'kind', value: 'theme'},
      missing: ['themes.scaffold'],
      reason: 'not-declared',
      module: null,
    });
    // A step the base serves passes only for a command that calls it.
    const notCaller = await checkRequirements(
      'experimental theme editor show',
      doc,
      {options: new Set(), args: []},
      base,
    );
    expect(!notCaller.ok && notCaller.requirement).toMatchObject({
      missing: ['themes.compile'],
      reason: 'not-declared',
    });

    const broken = await checkRequirements(
      'theme build',
      doc,
      {options: new Set(), args: []},
      {...base, adapters: {themes: './adapters/missing.mjs'}},
    );
    expect(!broken.ok && broken.requirement).toMatchObject({
      reason: 'failed-to-load',
      module: './adapters/missing.mjs',
    });
  });
});

/** The steps each command and part declares (spec:AST-114 FR5). */
const DECLARED = {
  'template --skeleton': ['templates.skeleton'],
  'template --cdn': ['templates.standalonePage'],
  'integration add theme': ['themes.scaffold'],
  'theme targets': ['themes.targets'],
  'theme template': ['themes.template'],
  'theme build': ['themes.compile'],
  'theme add': ['themes.appModule'],
  'theme use': ['themes.appModule'],
  'theme remove': ['themes.appModule'],
  'experimental render': ['render.page'],
  'experimental render --reverse': ['render.reverse'],
  'experimental theme compile': ['themes.compile'],
  'experimental theme add': ['themes.appModule'],
  'experimental theme use': ['themes.appModule'],
  'experimental theme remove': ['themes.appModule'],
  'experimental theme template': ['themes.template'],
  'experimental theme targets': ['themes.targets'],
  'experimental theme editor new': ['themes.targets', 'themes.compile'],
  'experimental theme editor set': ['themes.targets', 'themes.compile'],
  'experimental theme editor undo': ['themes.compile'],
  'experimental theme editor show': ['themes.compile'],
  'experimental theme editor how': ['themes.targets'],
  'experimental theme preview add': ['themes.appModule'],
  'experimental theme preview app': ['setup.guide', 'themes.appModule'],
};

describe('command declarations', () => {
  it('declare exactly the steps of the record, and only listed steps', async () => {
    /** @type {Record<string, string[]>} */
    const found = {};
    for (const file of fs.readdirSync(COMMANDS)) {
      if (!file.endsWith('.doc.mjs')) continue;
      const {doc} = await import(pathToFileURL(path.join(COMMANDS, file)).href);
      if (doc?.type !== 'command') continue;
      if (doc.requires) found[doc.name] = doc.requires;
      for (const option of doc.options ?? []) {
        if (option.requires) {
          found[`${doc.name} ${option.flag.match(/--[a-z-]+/)[0]}`] =
            option.requires;
        }
      }
      for (const arg of doc.args ?? []) {
        for (const [value, steps] of Object.entries(arg.requires ?? {})) {
          found[`${doc.name} ${value}`] = steps;
        }
      }
      if (doc.subcommands?.length)
        expect(doc.requires, doc.name).toBeUndefined();
    }
    expect(found).toEqual(DECLARED);
    for (const steps of Object.values(found)) {
      for (const step of steps) expect(BASE_STEPS).toContain(step);
    }
  });
});

describe('a project whose only base is not Core', () => {
  it(
    'hides what the base does not serve and counts it on one last line',
    () => {
      const dir = project({'@acme/native-ui': CONTENT_BASE});
      const theme = astryx(['theme', '--help'], dir);
      expect(theme.status).toBe(0);
      expect(theme.stdout).toMatch(/^ {2}list /m);
      expect(theme.stdout).not.toMatch(/^ {2}build /m);
      expect(theme.stdout).not.toContain('theme targets');
      expect(theme.stdout).not.toContain('experimental theme editor');
      const root = astryx(['--help'], dir);
      expect(root.stdout).not.toContain('experimental theme editor');
      expect(theme.stdout.trimEnd().split('\n').at(-1)).toBe(
        '6 commands hidden: the active base @acme/native-ui does not provide the steps they need.',
      );
      const hiddenGroup = astryx(['--json', 'experimental', 'theme', 'editor'], dir);
      expect(hiddenGroup.status).toBe(1);
      expect(hiddenGroup.json().code).toBe('ERR_BASE_CAPABILITY');
      const manifestOptions = astryx(['--json', 'manifest'], dir).json().data.commands
        .find(c => c.name === 'template').options;
      expect(manifestOptions.find(o => o.flag.includes('--skeleton')).available).toBe(false);
      expect(manifestOptions.find(o => o.flag.includes('--list')).available).toBe(true);
      const rootJson = astryx(['--json', 'help'], dir).json();
      expect(JSON.stringify(rootJson.data)).not.toContain('experimental theme editor');
      const experimentalJson = astryx(['experimental', '--help', '--json'], dir).json();
      expect(JSON.stringify(experimentalJson.data.subcommands)).not.toContain('editor set');
      const themeJson = astryx(['theme', '--help', '--json'], dir).json();
      expect(themeJson.data.description).not.toContain('experimental theme editor');
      const groupJson = astryx(['--json', 'experimental', 'theme'], dir);
      expect(groupJson.json().data.commands.map(c => c.name)).not.toContain('compile');
      const bare = astryx(['--json', '--base', '@acme/nope'], dir);
      expect(bare.status).toBe(1);
      expect(bare.json().code).toBe('ERR_BASE_NOT_FOUND');
      const experimental = astryx(['experimental', 'theme', '--help'], dir);
      expect(experimental.stdout).not.toContain('experimental theme targets');
      expect(experimental.stdout).not.toContain('experimental theme editor how');
      expect(experimental.stdout).toContain('component <Name>');
      const component = astryx(['component', '--help'], dir);
      expect(component.stdout).not.toContain('component Button');
      const search = astryx(['search', '--help'], dir);
      expect(search.stdout).toContain('search button');
      const template = astryx(['template', '--help'], dir);
      expect(template.stdout).not.toMatch(/^ +--skeleton/m);
      expect(template.stdout).not.toMatch(/^ +--cdn/m);
      expect(template.stdout).not.toContain('template --cdn');
      expect(template.stdout.trimEnd().split('\n').at(-1)).toBe(
        '2 options hidden: the active base @acme/native-ui does not provide the steps they need.',
      );
    },
    SLOW,
  );

  it(
    "names the step on a hidden command's own help",
    () => {
      const dir = project({'@acme/native-ui': CONTENT_BASE});
      const help = astryx(['theme', 'build', '--help'], dir);
      expect(help.status).toBe(0);
      expect(help.stdout.split('\n')[0]).toBe(
        'astryx theme build needs the themes.compile step; the active base @acme/native-ui does not provide it.',
      );
    },
    SLOW,
  );

  it(
    'refuses a hidden command with one line and exit 1, writing nothing',
    () => {
      const dir = project({'@acme/native-ui': CONTENT_BASE});
      fs.writeFileSync(path.join(dir, 'theme.ts'), 'export default {};\n');
      const before = listFiles(dir);
      const text = astryx(['theme', 'build', 'theme.ts'], dir);
      expect(text.status).toBe(1);
      expect(text.stderr.trim().split('\n')).toEqual([
        'Error: astryx theme build needs the themes.compile step; the active base @acme/native-ui does not provide it.',
      ]);
      expect(text.stdout).toBe('');

      const json = astryx(['--json', 'theme', 'build', 'theme.ts'], dir);
      expect(json.status).toBe(1);
      expect(json.json()).toEqual({
        apiVersion: 1,
        error:
          'astryx theme build needs the themes.compile step; the active base @acme/native-ui does not provide it.',
        code: 'ERR_BASE_CAPABILITY',
        requirement: {
          command: 'theme build',
          option: null,
          argument: null,
          requires: ['themes.compile'],
          missing: ['themes.compile'],
          reason: 'not-declared',
          base: {name: '@acme/native-ui', version: '2.1.0'},
        },
      });
      expect(listFiles(dir)).toEqual(before);
    },
    SLOW,
  );

  it(
    'refuses a hidden option and a hidden argument value the same way',
    () => {
      const dir = project({'@acme/native-ui': CONTENT_BASE});
      const option = astryx(
        ['--json', 'template', 'dashboard', '--skeleton'],
        dir,
      );
      expect(option.status).toBe(1);
      expect(option.json().requirement).toMatchObject({
        command: 'template',
        option: '--skeleton',
        missing: ['templates.skeleton'],
      });
      const value = astryx(
        ['--json', 'integration', 'add', 'theme', 'ocean'],
        dir,
      );
      expect(value.status).toBe(1);
      expect(value.json().requirement).toMatchObject({
        command: 'integration add',
        argument: {name: 'kind', value: 'theme'},
        missing: ['themes.scaffold'],
      });
    },
    SLOW,
  );

  it(
    "says --base names a dependency whose manifest does not load",
    () => {
      const dir = project({
        '@acme/native-ui': {manifest: 'export default {base: {}, oops'},
      });
      const r = astryx(['--json', '--base', '@acme/native-ui', 'blog'], dir);
      expect(r.status).toBe(1);
      expect(r.json().code).toBe('ERR_BASE_NOT_FOUND');
      expect(r.json().error).toContain('its integration manifest does not load');
    },
    SLOW,
  );

  it(
    'lists a declared step in help without loading its adapter, and loads it for a run',
    () => {
      const dir = project({
        '@acme/native-ui': {
          manifest:
            "export default {base: {adapters: {themes: './adapters/themes.mjs'}}};\n",
          files: {
            'adapters/themes.mjs':
              'throw new Error("an adapter module must not load here");\n',
          },
        },
      });
      const help = astryx(['theme', '--help'], dir);
      expect(help.status).toBe(0);
      expect(help.stdout).toMatch(/^ {2}targets /m);
      const r = astryx(['--json', 'theme', 'targets'], dir);
      expect(r.status).toBe(1);
      expect(r.json().requirement).toMatchObject({
        missing: ['themes.targets'],
        reason: 'failed-to-load',
        module: './adapters/themes.mjs',
      });
    },
    SLOW,
  );

  it(
    'counts the commands hidden at any depth on the root help',
    () => {
      const dir = project({'@acme/native-ui': CONTENT_BASE});
      const root = astryx(['--help'], dir);
      expect(root.stdout.trimEnd().split('\n').at(-1)).toMatch(
        /^\d+ commands hidden: the active base @acme\/native-ui does not provide the steps they need\.$/,
      );
    },
    SLOW,
  );

  it(
    'fails help when the base does not resolve',
    () => {
      const native = project({'@acme/native-ui': CONTENT_BASE});
      const valued = astryx(['--detail', 'compact', 'help', 'theme'], native);
      expect(valued.status).toBe(0);
      expect(valued.stdout).not.toMatch(/^ {2}build /m);
      expect(valued.stdout.trimEnd().split('\n').at(-1)).toMatch(/commands hidden/);
      const valuedMissing = astryx(
        ['--json', '--detail', 'compact', '--base', '@acme/nope', 'help'],
        native,
      );
      expect(valuedMissing.status).toBe(1);
      expect(valuedMissing.json().code).toBe('ERR_BASE_NOT_FOUND');
      const swizzle = astryx(['swizzle', '--list'], native);
      expect(swizzle.stdout).not.toContain('swizzle Button');
      const dir = project({'@acme/native-ui': CONTENT_BASE});
      const missing = astryx(['--json', '--base', '@acme/nope', 'help'], dir);
      expect(missing.status).toBe(1);
      expect(missing.json().code).toBe('ERR_BASE_NOT_FOUND');
      const two = project({'@acme/native-ui': CONTENT_BASE, '@acme/tv-ui': CONTENT_BASE});
      const ambiguous = astryx(['--help'], two);
      expect(ambiguous.status).toBe(1);
      expect(ambiguous.stderr).toContain('more than one base');
    },
    SLOW,
  );

  it(
    "keeps doctor's docs checks, leaving out links into Core's docs",
    () => {
      const dir = project({'@acme/native-ui': CONTENT_BASE});
      const r = astryx(['--json', 'doctor'], dir);
      const tree = r.json().data.checks.find(c => c.id === 'docs-tree');
      expect(tree.status).toBe('pass');
    },
    SLOW,
  );

  it(
    "warns about a base doc's broken link to its own package",
    () => {
      const dir = project({
        '@acme/native-ui': {
          manifest: "export default {base: {}, docs: './docs'};\n",
          files: {
            'docs/native-guide.doc.mjs': `export default {
  type: 'generic',
  name: 'native-guide',
  title: 'Native guide',
  category: 'guide',
  description: 'How to use the native library.',
  sections: [{id: 'intro', title: 'Intro', content: [{type: 'prose', text: 'See {@link @acme/native-ui:generic:tokens} and {@link generic:spacing}.'}]}],
};
`,
          },
        },
      });
      const r = astryx(['--json', 'doctor'], dir);
      const tree = r.json().data.checks.find(c => c.id === 'docs-tree');
      expect(tree.status).toBe('warn');
      expect(tree.message).toContain('@acme/native-ui:generic:tokens');
      expect(tree.message).toContain('"generic:spacing"');
    },
    SLOW,
  );

  it(
    'lists every command in the manifest with requires and available',
    () => {
      const dir = project({'@acme/native-ui': CONTENT_BASE});
      const r = astryx(['--json', 'manifest'], dir);
      expect(r.status).toBe(0);
      const envelope = r.json();
      expect(envelope.meta.answeredBy).toMatchObject({
        core: null,
        base: {name: '@acme/native-ui', version: '2.1.0'},
      });
      expect(envelope.data.base).toEqual({
        name: '@acme/native-ui',
        version: '2.1.0',
        steps: [],
      });
      const theme = envelope.data.commands.find(c => c.name === 'theme');
      expect(theme.available).toBe(true);
      const build = theme.subcommands.find(c => c.name === 'theme build');
      expect(build).toMatchObject({
        requires: ['themes.compile'],
        available: false,
      });
      const list = theme.subcommands.find(c => c.name === 'theme list');
      expect(list.available).toBe(true);
      expect(list.requires).toBeUndefined();
    },
    SLOW,
  );

  it(
    'fails before any work when --base names no base, or two bases compete',
    () => {
      const dir = project({'@acme/native-ui': CONTENT_BASE});
      const missing = astryx(['--json', '--base', '@acme/nope', 'blog'], dir);
      expect(missing.status).toBe(1);
      expect(missing.json().code).toBe('ERR_BASE_NOT_FOUND');

      const two = project({
        '@acme/native-ui': CONTENT_BASE,
        '@acme/tv-ui': CONTENT_BASE,
      });
      const ambiguous = astryx(['--json', 'blog'], two);
      expect(ambiguous.status).toBe(1);
      expect(ambiguous.json().code).toBe('ERR_BASE_AMBIGUOUS');
      const picked = astryx(['--base', '@acme/tv-ui', 'theme', '--help'], two);
      expect(picked.stdout).toContain('the active base @acme/tv-ui');
    },
    SLOW,
  );

  it(
    'reads none of Core: no Core templates, topics, or components',
    () => {
      const dir = project({'@acme/native-ui': CONTENT_BASE});
      const template = astryx(['--json', 'template', 'ai-chat'], dir);
      expect(template.status).toBe(1);
      expect(template.json().code).toBe('ERR_UNKNOWN_TEMPLATE');
      const topic = astryx(['--json', 'docs', 'tokens'], dir);
      expect(topic.status).toBe(1);
      expect(topic.json().code).toBe('ERR_UNKNOWN_TOPIC');
      const component = astryx(['--json', 'component', 'Button'], dir);
      expect(component.status).toBe(1);
      expect(component.json().code).toBe('ERR_UNKNOWN_COMPONENT');
      const listText = astryx(['component', '--list'], dir);
      expect(listText.stdout).not.toContain('@astryxdesign/core');
      const list = astryx(['--json', 'component', '--list'], dir);
      expect(list.status).toBe(0);
      expect(list.json().data.components).toEqual({});
      const hooks = astryx(['--json', 'hook', '--list'], dir);
      expect(hooks.status).toBe(0);
      const swizzle = astryx(['--json', 'swizzle', 'Button'], dir);
      expect(swizzle.json().code).toBe('ERR_UNKNOWN_COMPONENT');
      const search = astryx(['--json', 'search', 'button'], dir);
      expect(search.status).toBe(0);
      const found = search.json().data.results;
      expect(found.filter(r => r.package === '@astryxdesign/core')).toEqual([]);
    },
    SLOW,
  );

  it(
    'reads none of the Core a project installs when --base names another base',
    () => {
      const dir = project({'@acme/native-ui': CONTENT_BASE});
      fs.mkdirSync(path.join(dir, 'node_modules', '@astryxdesign'));
      fs.symlinkSync(
        CORE_ROOT,
        path.join(dir, 'node_modules', '@astryxdesign', 'core'),
        'dir',
      );
      const core = astryx(['--json', 'component', 'Button'], dir);
      expect(core.status).toBe(0);
      const native = astryx(
        ['--json', '--base', '@acme/native-ui', 'component', 'Button'],
        dir,
      );
      expect(native.status).toBe(1);
      expect(native.json().code).toBe('ERR_UNKNOWN_COMPONENT');
    },
    SLOW,
  );
});

describe('JSON help, suggestions, and codemods on a non-Core base', () => {
  it(
    'list only what the base serves, and no Core codemods',
    () => {
      const dir = project({'@acme/native-ui': CONTENT_BASE});
      const theme = astryx(['theme', '--help', '--json'], dir);
      expect(theme.json().data.subcommands.map(s => s.name)).toEqual([
        'palette',
        'list',
        'eject',
      ]);
      const template = astryx(['template', '--help', '--json'], dir);
      const flags = template.json().data.options.map(o => o.flags);
      expect(flags.some(f => f.includes('--skeleton'))).toBe(false);
      expect(flags.some(f => f.includes('--cdn'))).toBe(false);
      const typo = astryx(['--json', 'theme', 'buld'], dir);
      const named = typo.json().suggestions.map(s => s.name.split(' ').at(-1));
      expect([...named].sort()).toEqual(['eject', 'list', 'palette']);
      const help = astryx(['--json', 'help'], dir);
      expect(help.json().meta.answeredBy.base).toEqual({
        name: '@acme/native-ui',
        version: '2.1.0',
      });
      const codemods = astryx(['--json', 'upgrade', '--list'], dir);
      expect(codemods.status).toBe(0);
      expect(codemods.json().data).toEqual([]);
    },
    SLOW,
  );
});

describe('help reads the base --base names, and a bare group help', () => {
  it(
    'names only what the named base serves, with its command',
    () => {
      const dir = project({
        '@acme/native-ui': {
          manifest: "export default {base: {}, cliCommand: 'acme astryx'};\n",
        },
      });
      fs.mkdirSync(path.join(dir, 'node_modules', '@astryxdesign'));
      fs.symlinkSync(
        CORE_ROOT,
        path.join(dir, 'node_modules', '@astryxdesign', 'core'),
        'dir',
      );
      const theme = astryx(['--base', '@acme/native-ui', 'theme', '--help'], dir);
      expect(theme.stdout).not.toContain('experimental theme editor');
      const template = astryx(
        ['--base', '@acme/native-ui', 'template', '--help'],
        dir,
      );
      expect(template.stdout).toContain('acme astryx template');
      const onCore = astryx(['theme', '--help'], dir);
      expect(onCore.stdout).toContain('experimental theme editor');
    },
    SLOW,
  );

  it(
    'leaves unserved commands out of a bare group run',
    () => {
      const dir = project({'@acme/native-ui': CONTENT_BASE});
      const bare = astryx(['theme'], dir);
      expect(bare.stdout).not.toContain('experimental theme editor');
      expect(bare.stdout).not.toMatch(/^ {2}build /m);
    },
    SLOW,
  );
});

describe('a command that refuses outside a project', () => {
  it('refuses there before any base check', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-bases-empty-'));
    tmpDirs.push(empty);
    const doc = /** @type {any} */ ({
      name: 'theme use',
      outsideProject: 'refuse',
    });
    expect(refusesHereFirst(doc, empty)).toBe(true);
    expect(refusesHereFirst({...doc, outsideProject: 'same'}, empty)).toBe(
      false,
    );
    expect(
      refusesHereFirst(doc, project({'@acme/native-ui': CONTENT_BASE})),
    ).toBe(false);
  });

  it(
    'keeps its own refusal when --base names no base',
    () => {
      const empty = fs.mkdtempSync(
        path.join(os.tmpdir(), 'astryx-bases-empty-'),
      );
      tmpDirs.push(empty);
      const r = astryx(
        ['--json', '--base', '@acme/nope', 'theme', 'use', 'ocean'],
        empty,
      );
      expect(r.status).toBe(1);
      expect(r.json().code).not.toBe('ERR_BASE_NOT_FOUND');
      const plain = astryx(['--json', 'theme', 'use', 'ocean'], empty);
      expect(r.json().code).toBe(plain.json().code);
    },
    SLOW,
  );
});

/** A native base whose themes adapter compiles to plain token objects. */
const NATIVE_THEMES_ADAPTER = `
export function targets() {
  return {ok: true, value: {targets: [
    {key: 'button', component: 'Button', props: ['variant:primary'], states: ['pressed']},
    {key: 'switch-thumb', component: 'Switch', props: [], states: ['checked']},
  ]}};
}
export function compile({theme, name}) {
  const tokens = theme.value.tokens ?? {};
  if (tokens['radius-md'] === 'calc(1rem)') {
    return {ok: false, failure: {code: 'invalid-input', message: 'radius-md "calc(1rem)" has no native value.', at: {file: theme.file}}};
  }
  return {
    ok: true,
    value: {
      name,
      tokenCount: Object.keys(tokens).length,
      componentCount: 0,
      files: [{name: name + '.ts', role: 'module', contents: 'export const ' + theme.exportName + ' = ' + JSON.stringify({name, light: tokens}) + ' as const;\\n'}],
    },
    notices: ['components are web-only; not compiled'],
  };
}
export function appModule({themes, defaultSlug}) {
  const imports = themes.map((t, i) => 'import {' + t.exportName + ' as _t' + i + "} from '" + t.module + "';").join('\\n');
  const entries = themes.map((t, i) => JSON.stringify(t.slug) + ': _t' + i).join(', ');
  return {ok: true, value: {source: imports + '\\nexport const themes = {' + entries + '} as const;\\nexport const defaultThemeSlug = ' + JSON.stringify(defaultSlug) + ';\\n'}};
}
`;

/**
 * A project on the native base, with local theme sources.
 * @param {string} adapter the themes adapter module source
 * @param {string} [declaration] the `themes` adapter declaration
 * @returns {string}
 */
function nativeProject(adapter, declaration = "'./adapters/themes.mjs'") {
  const dir = project({
    '@acme/native-ui': {
      manifest: `export default {base: {adapters: {themes: ${declaration}}}};\n`,
      files: {'adapters/themes.mjs': adapter},
    },
  });
  write(path.join(dir, 'tsconfig.json'), '{}\n');
  for (const [slug, accent] of [['matcha', '#3f7d3a'], ['sencha', '#6b8e23']]) {
    const folder = path.join(dir, 'src', 'themes', slug);
    write(
      path.join(folder, `${slug}Theme.doc.mjs`),
      `/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\nexport default {type: 'theme', name: '${slug}', displayName: '${slug}', description: '${slug} theme.', maintained: false};\n`,
    );
    write(
      path.join(folder, `${slug}Theme.ts`),
      `export const ${slug}Theme = {name: '${slug}', tokens: {'color-accent': '${accent}'}};\n`,
    );
  }
  return dir;
}

describe("theme commands call the native base's themes adapter", () => {
  it(
    'theme targets lists the targets the adapter returns, filtered by the CLI',
    () => {
      const dir = nativeProject(NATIVE_THEMES_ADAPTER);
      const all = astryx(['--json', 'theme', 'targets'], dir);
      expect(all.status).toBe(0);
      expect(all.json().data).toEqual({
        filter: null,
        componentCount: 2,
        targets: [
          {key: 'button', component: 'Button', className: '', props: ['variant:primary'], states: ['pressed']},
          {key: 'switch-thumb', component: 'Switch', className: '', props: [], states: ['checked']},
        ],
      });
      const one = astryx(['--json', 'theme', 'targets', 'switch'], dir);
      expect(one.json().data.targets.map(t => t.key)).toEqual(['switch-thumb']);
      const none = astryx(['--json', 'theme', 'targets', 'Sliderx'], dir);
      expect(none.status).toBe(1);
      expect(none.json().code).toBe('ERR_UNKNOWN_COMPONENT');
    },
    SLOW,
  );

  it(
    'theme build writes the files compile returns, and --check compares them',
    () => {
      const dir = nativeProject(NATIVE_THEMES_ADAPTER);
      const source = 'src/themes/matcha/matchaTheme.ts';
      const built = astryx(['--json', 'theme', 'build', source], dir);
      expect(built.status, built.stderr).toBe(0);
      expect(built.json()).toMatchObject({
        type: 'theme.build.base',
        data: {
          name: 'matcha',
          base: '@acme/native-ui',
          tokenCount: 1,
          componentCount: 0,
          outputs: [{role: 'module', path: 'src/themes/matcha/matcha.ts'}],
          warnings: [],
          notices: ['components are web-only; not compiled'],
        },
      });
      const file = path.join(dir, 'src/themes/matcha/matcha.ts');
      expect(fs.readFileSync(file, 'utf8')).toBe(
        'export const matchaTheme = {"name":"matcha","light":{"color-accent":"#3f7d3a"}} as const;\n',
      );
      const fresh = astryx(['--json', 'theme', 'build', source, '--check'], dir);
      expect(fresh.status).toBe(0);
      expect(fresh.json().data).toMatchObject({upToDate: true, stale: []});
      fs.writeFileSync(file, 'export const matchaTheme = {};\n');
      const stale = astryx(['--json', 'theme', 'build', source, '--check'], dir);
      expect(stale.status).toBe(1);
      expect(stale.json().data.stale).toEqual([
        {path: 'src/themes/matcha/matcha.ts', reason: 'outdated'},
      ]);
      expect(fs.readFileSync(file, 'utf8')).toBe('export const matchaTheme = {};\n');

      const text = astryx(['theme', 'build', source], dir);
      expect(text.status).toBe(0);
      expect(text.stdout).toContain('[ok] src/themes/matcha/matcha.ts (module)');
      expect(text.stdout).toContain('[note] components are web-only; not compiled');
    },
    SLOW,
  );

  it(
    'turns a typed failure into the command error, writing nothing',
    () => {
      const dir = nativeProject(NATIVE_THEMES_ADAPTER);
      write(
        path.join(dir, 'src/themes/matcha/matchaTheme.ts'),
        "export const matchaTheme = {name: 'matcha', tokens: {'radius-md': 'calc(1rem)'}};\n",
      );
      const before = listFiles(dir);
      const r = astryx(['--json', 'theme', 'build', 'src/themes/matcha/matchaTheme.ts'], dir);
      expect(r.status).toBe(1);
      expect(r.json()).toMatchObject({
        code: 'ERR_THEME_INVALID',
        error: 'radius-md "calc(1rem)" has no native value. (src/themes/matcha/matchaTheme.ts)',
      });
      expect(listFiles(dir)).toEqual(before);
    },
    SLOW,
  );

  it(
    'theme add, use, and remove write the module appModule returns under the CLI header',
    () => {
      const dir = nativeProject(NATIVE_THEMES_ADAPTER);
      for (const slug of ['matcha', 'sencha']) {
        const b = astryx(['theme', 'build', `src/themes/${slug}/${slug}Theme.ts`], dir);
        expect(b.status, b.stderr).toBe(0);
      }
      const module = path.join(dir, 'src/astryx-themes.ts');
      const add = astryx(['--json', 'theme', 'add', 'matcha'], dir);
      expect(add.status, add.stderr).toBe(0);
      expect(add.json().data).toMatchObject({
        themes: [
          {slug: 'matcha', owner: './src/themes', module: './themes/matcha/matcha', stylesheet: null, source: 'local'},
        ],
        default: 'matcha',
        modulePath: 'src/astryx-themes.ts',
      });
      expect(fs.readFileSync(module, 'utf8')).toBe(
        [
          '/**',
          ' * @generated by `astryx theme` — do not edit manually.',
          ' * @astryx-theme-record {"themes":{"matcha":"./src/themes"},"defaultThemeSlug":"matcha"}',
          ' */',
          '',
          "import {matchaTheme as _t0} from './themes/matcha/matcha';",
          'export const themes = {"matcha": _t0} as const;',
          'export const defaultThemeSlug = "matcha";',
          '',
        ].join('\n'),
      );
      const text = astryx(['theme', 'add', 'sencha'], dir);
      expect(text.status, text.stderr).toBe(0);
      expect(text.stdout).not.toContain('@astryxdesign/core');
      const use = astryx(['--json', 'theme', 'use', 'sencha'], dir);
      expect(use.status, use.stderr).toBe(0);
      expect(fs.readFileSync(module, 'utf8')).toContain('export const defaultThemeSlug = "sencha";');
      const remove = astryx(['--json', 'theme', 'remove', 'matcha'], dir);
      expect(remove.status, remove.stderr).toBe(0);
      const after = fs.readFileSync(module, 'utf8');
      expect(after).toContain('{"themes":{"sencha":"./src/themes"},"defaultThemeSlug":"sencha"}');
      expect(after).not.toContain('matcha');
    },
    SLOW,
  );

  it(
    'fails with ERR_BASE_ADAPTER when a step throws or returns a malformed result',
    () => {
      const throwing = nativeProject(
        NATIVE_THEMES_ADAPTER.replace(
          'export function compile(',
          'export function compile() { throw new Error("no compiler"); }\nfunction compileOld(',
        ),
      );
      const before = listFiles(throwing);
      const thrown = astryx(['--json', 'theme', 'build', 'src/themes/matcha/matchaTheme.ts'], throwing);
      expect(thrown.status).toBe(1);
      expect(thrown.json()).toMatchObject({
        code: 'ERR_BASE_ADAPTER',
        error: 'The active base @acme/native-ui broke its themes.compile step in ./adapters/themes.mjs: it threw: no compiler',
      });
      expect(listFiles(throwing)).toEqual(before);

      const malformed = nativeProject(
        NATIVE_THEMES_ADAPTER.replace(
          'export function appModule(',
          'export function appModule() { return {ok: true, value: {source: 42}}; }\nfunction appModuleOld(',
        ),
      );
      expect(astryx(['theme', 'build', 'src/themes/matcha/matchaTheme.ts'], malformed).status).toBe(0);
      const bad = astryx(['--json', 'theme', 'add', 'matcha'], malformed);
      expect(bad.status).toBe(1);
      expect(bad.json()).toMatchObject({
        code: 'ERR_BASE_ADAPTER',
        error: 'The active base @acme/native-ui broke its themes.appModule step in ./adapters/themes.mjs: source is not a string.',
      });
      expect(fs.existsSync(path.join(malformed, 'src/astryx-themes.ts'))).toBe(false);
    },
    SLOW,
  );

  it(
    'refuses and hides a command that needs a served step but does not call it',
    () => {
      const dir = nativeProject(NATIVE_THEMES_ADAPTER);
      const before = listFiles(dir);
      for (const args of [
        ['experimental', 'theme', 'editor', 'show', 'matcha'],
        ['experimental', 'theme', 'editor', 'how', 'button'],
        ['experimental', 'theme', 'preview', 'add', 'matcha'],
      ]) {
        const r = astryx(['--json', ...args], dir);
        expect(r.status, args.join(' ')).toBe(1);
        expect(r.json()).toMatchObject({
          code: 'ERR_BASE_CAPABILITY',
          requirement: {reason: 'not-declared'},
        });
      }
      const editor = astryx(['--json', 'experimental', 'theme', 'editor'], dir);
      expect(editor.status).toBe(1);
      expect(editor.json().code).toBe('ERR_BASE_CAPABILITY');
      expect(editor.json().requirement.missing).toEqual(
        expect.arrayContaining(['themes.targets', 'themes.compile']),
      );
      expect(listFiles(dir)).toEqual(before);
      const help = astryx(['experimental', 'theme', '--help'], dir);
      expect(help.stdout).toMatch(/^ {2}compile /m);
      expect(help.stdout).toMatch(/^ {2}targets /m);
      expect(help.stdout).not.toMatch(/^ {2}editor /m);
      const manifest = astryx(['--json', 'manifest'], dir).json().data;
      const experimental = manifest.commands
        .find(c => c.name === 'experimental')
        .subcommands.find(c => c.name === 'experimental theme');
      const available = Object.fromEntries(
        experimental.subcommands.map(c => [c.name, c.available]),
      );
      expect(available).toMatchObject({
        'experimental theme compile': true,
        'experimental theme editor': false,
      });
    },
    SLOW,
  );

  it(
    'serves only the listed steps, and refuses a listed step the module does not export',
    () => {
      const dir = nativeProject(
        "export function targets() { return {ok: true, value: {targets: []}}; }\nexport function appModule() { throw new Error('not listed, never called'); }\n",
        "{module: './adapters/themes.mjs', steps: ['targets', 'compile']}",
      );
      const help = astryx(['theme', '--help'], dir);
      expect(help.stdout).toMatch(/^ {2}targets /m);
      expect(help.stdout).toMatch(/^ {2}build /m);
      expect(help.stdout).not.toMatch(/^ {2}add /m);

      const build = astryx(['--json', 'theme', 'build', 'src/themes/matcha/matchaTheme.ts'], dir);
      expect(build.status).toBe(1);
      expect(build.json()).toMatchObject({
        code: 'ERR_BASE_CAPABILITY',
        error:
          'astryx theme build needs the themes.compile step; the active base @acme/native-ui lists it but ./adapters/themes.mjs does not export it.',
        requirement: {
          missing: ['themes.compile'],
          reason: 'not-exported',
          module: './adapters/themes.mjs',
        },
      });
      const add = astryx(['--json', 'theme', 'add', 'matcha'], dir);
      expect(add.status).toBe(1);
      expect(add.json().requirement).toMatchObject({
        missing: ['themes.appModule'],
        reason: 'not-declared',
      });
      const manifest = astryx(['--json', 'manifest'], dir);
      expect(manifest.json().data.base.steps).toEqual(['themes.targets', 'themes.compile']);
    },
    SLOW,
  );
});
