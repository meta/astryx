// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A run of the bin loads only what its command uses. A run that prints
 * the version, in a folder with no project, loads none of the large parser,
 * schema and module-loader packages, and none of the CLI's own doc, discovery,
 * project and integration modules. The project, integration and contribution
 * modules use them. A component lookup loads no code-rewrite package, which
 * only patching an integration manifest uses. A module hook in the child
 * records every module that the run resolves.
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

const BIN = fileURLToPath(new URL('./bin/astryx.mjs', import.meta.url));
const CLI_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Packages that only project, integration and code-rewrite work uses. */
const LARGE_PACKAGES = [
  '@babel/core',
  '@babel/parser',
  'jiti',
  'jscodeshift',
  'postcss',
  'recast',
  'zod',
];

/**
 * The CLI's own modules that only doc, discovery, project and integration work
 * uses, as paths under the CLI root. A path that ends in `/` names a folder.
 */
const LARGE_CLI_MODULES = [
  'authoring/',
  'foundation/agent-docs/agent-docs.mjs',
  'foundation/config/project.mjs',
  'foundation/discovery/component-discovery.mjs',
  'foundation/doc-compiler/compile.mjs',
  'foundation/fs/module-loader.mjs',
  'foundation/integrations/integrations.mjs',
];

/** The runs that print the version, as text or as JSON. */
const VERSION_RUNS = ['--version', '-V', '--version --json'];

/** @type {string} */
let dir;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-startup-imports-'));
});

afterAll(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

/**
 * The name of the package a module URL is in, or null outside node_modules.
 * @param {string} url
 * @returns {string | null}
 */
function packageOf(url) {
  const marker = '/node_modules/';
  const at = url.lastIndexOf(marker);
  if (at === -1) return null;
  const parts = url.slice(at + marker.length).split('/');
  return parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
}

/**
 * Run the bin with `args` in an empty folder, with its own home folder, and
 * return the packages of the modules it resolved and the paths of the CLI's
 * own modules under the CLI root.
 * @param {string[]} args
 * @returns {{status: number | null, packages: Set<string>, cliModules: Set<string>}}
 */
function modulesLoadedBy(args) {
  const log = path.join(dir, 'resolved.txt');
  fs.rmSync(log, {force: true});
  const hook = path.join(dir, 'record-resolved.mjs');
  fs.writeFileSync(
    hook,
    [
      "import {appendFileSync} from 'node:fs';",
      "import {registerHooks} from 'node:module';",
      'registerHooks({',
      '  resolve(specifier, context, nextResolve) {',
      '    const result = nextResolve(specifier, context);',
      `    appendFileSync(${JSON.stringify(log)}, result.url + '\\n');`,
      '    return result;',
      '  },',
      '});',
      '',
    ].join('\n'),
  );
  const app = path.join(dir, 'app');
  const home = path.join(dir, 'home');
  fs.mkdirSync(app, {recursive: true});
  fs.mkdirSync(home, {recursive: true});
  const env = {...process.env};
  for (const key of Object.keys(env)) {
    if (key.startsWith('VITEST') || key === 'NODE_OPTIONS') delete env[key];
  }
  Object.assign(env, {
    HOME: home,
    USERPROFILE: home,
    XDG_CACHE_HOME: path.join(dir, 'cache'),
    XDG_CONFIG_HOME: path.join(home, '.config'),
    XDG_DATA_HOME: path.join(home, '.local', 'share'),
    XDG_STATE_HOME: path.join(dir, 'state'),
    CI: '1',
    NO_UPDATE_NOTIFIER: '1',
    NO_COLOR: '1',
  });
  const result = spawnSync(
    process.execPath,
    ['--import', pathToFileURL(hook).href, BIN, ...args],
    {cwd: app, env, encoding: 'utf8'},
  );
  const packages = new Set();
  const cliModules = new Set();
  for (const url of fs.readFileSync(log, 'utf8').split('\n')) {
    const name = packageOf(url);
    if (name != null) packages.add(name);
    else if (url.startsWith('file:')) {
      const file = fileURLToPath(url);
      if (file.startsWith(CLI_ROOT)) {
        cliModules.add(file.slice(CLI_ROOT.length).split(path.sep).join('/'));
      }
    }
  }
  return {status: result.status, packages, cliModules};
}

describe('a run of the bin that prints the version', () => {
  it('records the packages and CLI modules it loads, such as the command parser and the bin', () => {
    const {status, packages, cliModules} = modulesLoadedBy(['--version']);
    expect(status).toBe(0);
    expect(packages.has('commander')).toBe(true);
    expect(cliModules.has('clients/cli/bin/astryx.mjs')).toBe(true);
  });

  it.each(VERSION_RUNS)(
    'loads no parser, schema or module-loader package in a folder with no project (astryx %s)',
    run => {
      const {status, packages} = modulesLoadedBy(run.split(' '));
      expect(status).toBe(0);
      expect(LARGE_PACKAGES.filter(name => packages.has(name))).toEqual([]);
    },
  );

  it.each(VERSION_RUNS)(
    'loads no doc, discovery, project or integration module of the CLI (astryx %s)',
    run => {
      const {status, cliModules} = modulesLoadedBy(run.split(' '));
      expect(status).toBe(0);
      const loaded = [...cliModules];
      expect(
        LARGE_CLI_MODULES.filter(large =>
          loaded.some(file =>
            large.endsWith('/') ? file.startsWith(large) : file === large,
          ),
        ),
      ).toEqual([]);
    },
  );
});

describe('a component lookup in a folder with no project', () => {
  it('loads no code-rewrite package (astryx component Buttn)', () => {
    const {status, packages, cliModules} = modulesLoadedBy([
      'component',
      'Buttn',
    ]);
    // No component has that name, so the run ends with its suggestions.
    expect(status).toBe(1);
    expect(cliModules.has('clients/cli/commands/component.mjs')).toBe(true);
    expect(
      ['jscodeshift', 'recast'].filter(name => packages.has(name)),
    ).toEqual([]);
  });
});
