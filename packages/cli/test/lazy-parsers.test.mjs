// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file foundation/runtime/lazy-parsers.mjs loads authoring/'s parsers on
 * first use, with Node's own loader as the CLI runs. Its `require` of an ES
 * module returns the module an `import` of it gives, so there is one zod and
 * one set of schemas however a parser is reached. zod is imported, never
 * required: its package resolves `require` to another copy. A published CLI
 * that validates nothing loads no zod.
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {CLI_ROOT} from '../foundation/fs/paths.mjs';
import {packPublishedCli} from '../test-utils/pack-published-cli.mjs';
import {runFolder} from '../test-utils/global-local-fixtures.mjs';
import {REPO_ROOT} from '../test-utils/repo-root.mjs';

/**
 * Run an ES module script with Node, outside Vitest's loader.
 * @param {string} source
 */
function runNatively(source) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', source], {
    cwd: CLI_ROOT,
    encoding: 'utf8',
  });
}

describe('the lazy parsers', () => {
  it('reach the same modules, schemas and zod an import does', () => {
    const at = (/** @type {string} */ file) =>
      JSON.stringify(pathToFileURL(path.join(CLI_ROOT, file)).href);
    const run = runNatively(`
      import {createRequire} from 'node:module';
      import * as zod from 'zod';
      const lazy = await import(${at('foundation/runtime/lazy-parsers.mjs')});
      // A parser call loads its module.
      lazy.knownIntegrationKeys();
      const required = createRequire(${at('foundation/runtime/lazy-parsers.mjs')})('../../authoring/integration/schema.mjs');
      const imported = await import(${at('authoring/integration/schema.mjs')});
      const docs = await import(${at('authoring/doctypes/_schema.mjs')});
      console.log(JSON.stringify({
        sameModule: required === imported,
        sameSchema: required.integrationSchema === imported.integrationSchema,
        importedZod: imported.integrationSchema instanceof zod.ZodType &&
          docs.AuthoredDocKindSchema instanceof zod.ZodType,
      }));
    `);
    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(run.stdout)).toEqual({
      sameModule: true,
      sameSchema: true,
      importedZod: true,
    });
  });

  it('are the only way the shared runtime reaches the parsers, and zod is never required', () => {
    /** @param {string} dir @returns {string[]} */
    const sources = dir =>
      fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          return entry.name === 'node_modules' ? [] : sources(file);
        }
        return /\.m?js$/.test(entry.name) && !/\.test\./.test(entry.name)
          ? [file]
          : [];
      });
    const offenders = ['foundation', 'api', 'clients', 'assets', 'authoring']
      .flatMap(root => sources(path.join(CLI_ROOT, root)))
      .filter(file => {
        const text = fs.readFileSync(file, 'utf8');
        if (/require\(\s*['"]zod['"]\s*\)/.test(text)) return true;
        // The shared runtime (foundation/, the CLI client and the codemods
        // every run may load) reaches a parser module that builds schemas
        // through the lazy parsers only. A command's own API subject may
        // import one it always uses.
        return (
          !file.startsWith(path.join(CLI_ROOT, 'authoring')) &&
          !file.startsWith(path.join(CLI_ROOT, 'api')) &&
          /from\s+['"](?:\.\.\/)+authoring\/(?:doctypes\/(?:[a-z-]+\/)?parse|config\/parse|integration\/schema|gap-report\/parse|discover\/parse|codemod\/parse)\.mjs['"]/.test(
            text,
          )
        );
      })
      .map(file => path.relative(CLI_ROOT, file));
    expect(offenders).toEqual([]);
  });
});

describe('a published CLI in a project with no config', () => {
  /** @type {string} */
  let work;
  /** @type {string} */
  let bin;
  /** @type {string} */
  let app;
  /** @type {string} */
  let hook;

  beforeAll(() => {
    work = fs.mkdtempSync(
      path.join(runFolder() ?? os.tmpdir(), 'lazy-parsers-'),
    );
    bin = path.join(
      packPublishedCli(work),
      'clients',
      'cli',
      'bin',
      'astryx.mjs',
    );
    app = path.join(work, 'app');
    fs.mkdirSync(path.join(app, 'node_modules', '@astryxdesign'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(app, 'package.json'),
      JSON.stringify({name: 'app', dependencies: {'@astryxdesign/core': '*'}}),
    );
    fs.symlinkSync(
      path.join(REPO_ROOT, 'packages', 'core'),
      path.join(app, 'node_modules', '@astryxdesign', 'core'),
      'dir',
    );
    hook = path.join(work, 'record-loaded.mjs');
    fs.writeFileSync(
      hook,
      [
        "import {appendFileSync} from 'node:fs';",
        "import {registerHooks} from 'node:module';",
        'registerHooks({load(url, context, next) {',
        '  appendFileSync(process.env.LOADED_LOG, url + "\\n");',
        '  return next(url, context);',
        '}});',
        '',
      ].join('\n'),
    );
  }, 120_000);

  afterAll(() => {
    if (work && !runFolder()) fs.rmSync(work, {recursive: true, force: true});
  });

  const hasModuleHooks =
    typeof (
      /** @type {any} */ (process).getBuiltinModule?.('node:module')
        ?.registerHooks
    ) === 'function';

  it.skipIf(!hasModuleHooks)(
    'loads no zod for a warm template list or search',
    () => {
      const home = path.join(work, 'home');
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
      });
      // The kept folder exists, so the first runs keep what they gather.
      fs.mkdirSync(path.join(home, 'cache', 'astryx', 'catalogs'), {
        recursive: true,
        mode: 0o700,
      });
      for (const ask of [
        ['template', '--list'],
        ['search', 'button'],
      ]) {
        // One log path for every run: a kept gather records the variables
        // it reads, the hook's among them.
        const log = path.join(work, `loaded-${ask[0]}.txt`);
        for (let run = 0; run < 3; run++) {
          fs.writeFileSync(log, '');
          const result = spawnSync(
            process.execPath,
            ['--import', pathToFileURL(hook).href, bin, ...ask],
            {cwd: app, encoding: 'utf8', env: {...env, LOADED_LOG: log}},
          );
          expect(result.status, result.stderr).toBe(0);
        }
        const loaded = fs.readFileSync(log, 'utf8');
        expect(loaded, ask.join(' ')).toContain('/clients/cli/bin/astryx.mjs');
        expect(loaded.includes('/node_modules/zod/'), ask.join(' ')).toBe(
          false,
        );
      }
    },
    120_000,
  );
});
