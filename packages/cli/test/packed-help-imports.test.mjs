// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A published CLI prints help without loading the project module where
 * no integration can load (clients/cli/index.mjs, through
 * foundation/integrations/may-have-integrations.mjs): no config, no manifest
 * of its own, no installed dependency that ships one. Nothing there declares a
 * command, so help reads the same. Where an integration can load, the project
 * still loads first. Run on the packed package, since a checkout loads every
 * command for help.
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {packPublishedCli} from '../test-utils/pack-published-cli.mjs';
import {runFolder} from '../test-utils/global-local-fixtures.mjs';
import {REPO_ROOT} from '../test-utils/repo-root.mjs';

/** @type {string} */
let work;
/** @type {string} */
let bin;
/** @type {string} */
let hook;

beforeAll(() => {
  work = fs.mkdtempSync(path.join(runFolder() ?? os.tmpdir(), 'packed-help-'));
  bin = path.join(
    packPublishedCli(work),
    'clients',
    'cli',
    'bin',
    'astryx.mjs',
  );
  // Async load hooks see every ES module; zod and the project module load
  // as ES modules here.
  const hooks = path.join(work, 'record-loaded-hooks.mjs');
  fs.writeFileSync(
    hooks,
    [
      "import {appendFileSync} from 'node:fs';",
      'export async function load(url, context, next) {',
      '  appendFileSync(process.env.LOADED_LOG, url + "\\n");',
      '  return next(url, context);',
      '}',
      '',
    ].join('\n'),
  );
  hook = path.join(work, 'record-loaded.mjs');
  fs.writeFileSync(
    hook,
    `import {register} from 'node:module';\nregister(${JSON.stringify(pathToFileURL(hooks).href)});\n`,
  );
}, 120_000);

afterAll(() => {
  if (work && !runFolder()) fs.rmSync(work, {recursive: true, force: true});
});

/**
 * Run the packed bin with `args` in a fresh project holding `files`, and
 * return what it loaded.
 * @param {Record<string, string>} files
 * @param {string[]} args
 */
function loadedBy(files, args) {
  const app = fs.mkdtempSync(path.join(work, 'app-'));
  // A project: it declares and installs Core, and nothing else.
  fs.writeFileSync(
    path.join(app, 'package.json'),
    JSON.stringify({name: 'app', dependencies: {'@astryxdesign/core': '*'}}),
  );
  fs.mkdirSync(path.join(app, 'node_modules', '@astryxdesign'), {
    recursive: true,
  });
  fs.symlinkSync(
    path.join(REPO_ROOT, 'packages', 'core'),
    path.join(app, 'node_modules', '@astryxdesign', 'core'),
    'dir',
  );
  for (const [name, text] of Object.entries(files)) {
    fs.writeFileSync(path.join(app, name), text);
  }
  const log = path.join(app, 'loaded.txt');
  const home = path.join(app, 'home');
  const env = {...process.env};
  for (const key of Object.keys(env)) {
    if (key.startsWith('VITEST') || key === 'NODE_OPTIONS') delete env[key];
  }
  Object.assign(env, {
    HOME: home,
    XDG_CACHE_HOME: path.join(home, 'cache'),
    XDG_CONFIG_HOME: path.join(home, 'config'),
    CI: '1',
    NO_UPDATE_NOTIFIER: '1',
    NO_COLOR: '1',
    LOADED_LOG: log,
  });
  const result = spawnSync(
    process.execPath,
    ['--import', pathToFileURL(hook).href, bin, ...args],
    {cwd: app, env, encoding: 'utf8'},
  );
  const loaded = fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '';
  return {
    status: result.status,
    stdout: result.stdout,
    zod: loaded.includes('/node_modules/zod/'),
    project: loaded.includes('/foundation/config/project.mjs'),
  };
}

const hasModuleHooks =
  typeof (/** @type {any} */ (await import('node:module')).registerHooks) ===
  'function';

describe.skipIf(!hasModuleHooks)(
  'help in a project where no integration can load',
  () => {
    it.each(['--help', 'help', 'manifest', 'blog --help'])(
      'loads no project module and no schema package (astryx %s)',
      run => {
        const {status, zod, project} = loadedBy({}, run.split(' '));
        expect(status).toBe(0);
        expect(project).toBe(false);
        expect(zod).toBe(false);
      },
    );

    it('still loads the project where a config can name integrations', () => {
      const {status, project} = loadedBy(
        {'astryx.config.mjs': 'export default {integrations: []};\n'},
        ['--help'],
      );
      expect(status).toBe(0);
      expect(project).toBe(true);
    });
  },
);
