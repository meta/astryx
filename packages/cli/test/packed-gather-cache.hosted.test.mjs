// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A run through the host entry (`@astryxdesign/cli/host`) keeps its catalog
 * as a run of the bin does (foundation/fs/gather-cache.mjs). The host here
 * acts as a real one: it reads its options from a file and deletes it before
 * the run, its package set is read-only, and it runs in an empty folder
 * outside any project. A second run with the same inputs hits and answers
 * byte for byte as the first; an edit to a file the gather read misses and
 * gives the fresh answer; a run of the bin in the same folder never uses the
 * hosted entry, whose answer depends on what the host passed; and a host that
 * runs the CLI as another command gets that command in its answer.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  usePackedCli,
  work,
  packed,
  project,
  widgets,
  writeTemplate,
  run,
  keptTmp,
  freshTmp,
  allInodes,
  userConfig,
  hasModuleHooks,
} from '../test-utils/packed-gather-cache-fixture.mjs';
import {REPO_ROOT} from '../test-utils/repo-root.mjs';
import {COMPONENT_REPLACES_CLI} from '../foundation/integrations/cli-requirement.mjs';

usePackedCli();

const ASK = ['search', 'sprocket counts', '--json'];

/** The package set the host passes: the installed CLI, Core and widgets. */
let root;
/** An empty folder outside any project, where the host runs. */
let empty;
/** The host program. */
let host;

beforeAll(() => {
  // The folder the packed CLI is installed in, as a package set: its
  // node_modules holds the CLI, the Core equal to it, and one integration,
  // which it does not declare: only the host's approval loads it.
  root = path.resolve(packed, '..', '..', '..');
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({name: 'package-set', private: true}),
  );
  writeTemplate('sprockets', 'Sprocket counts by team.');
  // A component whose replacement target is not in Core: its finding names
  // the command the host runs the CLI as.
  fs.writeFileSync(
    path.join(widgets, 'astryx.integration.mjs'),
    "export default {templates: './templates', components: './components'};\n",
  );
  fs.writeFileSync(
    path.join(widgets, 'package.json'),
    JSON.stringify({
      name: '@acme/widgets',
      version: '1.0.0',
      peerDependencies: {'@astryxdesign/cli': `>=${COMPONENT_REPLACES_CLI}`},
    }),
  );
  fs.mkdirSync(path.join(widgets, 'components'), {recursive: true});
  fs.writeFileSync(
    path.join(widgets, 'components', 'AcmeGauge.doc.mjs'),
    `export default ${JSON.stringify({
      type: 'component',
      name: 'AcmeGauge',
      displayName: 'AcmeGauge',
      import: '@acme/widgets/components/AcmeGauge',
      replaces: 'NoSuchCoreGauge',
      usage: {description: 'AcmeGauge for Acme apps.'},
      props: [],
    })};\n`,
  );
  fs.writeFileSync(
    path.join(widgets, 'components', 'AcmeGauge.tsx'),
    'export function AcmeGauge() { return null; }\n',
  );
  const modules = path.join(root, 'node_modules');
  fs.symlinkSync(
    path.join(REPO_ROOT, 'packages', 'core'),
    path.join(modules, '@astryxdesign', 'core'),
    'dir',
  );
  fs.mkdirSync(path.join(modules, '@acme'));
  fs.symlinkSync(widgets, path.join(modules, '@acme', 'widgets'), 'dir');
  for (const dir of [
    root,
    modules,
    path.join(modules, '@astryxdesign'),
    path.join(modules, '@acme'),
  ]) {
    fs.chmodSync(dir, 0o555);
  }
  empty = fs.mkdtempSync(path.join(work, 'empty-'));
  host = path.join(work, 'host.mjs');
  fs.writeFileSync(
    host,
    `import * as fs from 'node:fs';
const [configPath, ...argv] = process.argv.slice(2);
let config;
try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); }
finally { fs.rmSync(configPath, {force: true}); }
const {runHostedCli} = await import(${JSON.stringify(path.join(packed, 'host', 'index.mjs'))});
const {status} = await runHostedCli({
  argv, cwd: config.cwd, roots: [config.root],
  integrations: config.integrations, cliCommand: config.door,
});
process.exitCode = status;
`,
  );
});

afterAll(() => {
  // Writable again, so the work folder can be removed.
  const modules = path.join(root, 'node_modules');
  for (const dir of [
    root,
    modules,
    path.join(modules, '@astryxdesign'),
    path.join(modules, '@acme'),
  ]) {
    fs.chmodSync(dir, 0o755);
  }
});

/** How many hosted runs this file started: each gets a config of its own. */
let runs = 0;

/**
 * One hosted run, as a host makes it: a new config file, which the host
 * deletes after reading it, in the empty folder.
 * @param {string} tmp
 * @param {{ask?: string[], door?: string, cwd?: string}} [options] - the
 *   arguments, the command the host runs the CLI as, and the folder
 */
function hosted(tmp, {ask = ASK, door = 'acme-tool astryx', cwd = empty} = {}) {
  fs.mkdirSync(tmp, {recursive: true});
  const config = path.join(work, `host-config-${runs++}.json`);
  fs.writeFileSync(
    config,
    JSON.stringify({root, cwd, integrations: ['@acme/widgets'], door}),
  );
  const base = {...process.env};
  delete base.CI;
  const result = spawnSync(process.execPath, [host, config, ...ask], {
    cwd,
    encoding: 'utf8',
    env: {
      ...base,
      TMPDIR: tmp,
      TMP: tmp,
      TEMP: tmp,
      NO_UPDATE_NOTIFIER: '1',
      NODE_DISABLE_COMPILE_CACHE: '1',
      XDG_CACHE_HOME: tmp,
      XDG_CONFIG_HOME: userConfig(),
    },
  });
  expect(fs.existsSync(config)).toBe(false);
  return {status: result.status, stdout: result.stdout, stderr: result.stderr};
}

describe.skipIf(process.platform !== 'linux' || process.getuid?.() === 0)(
  'a hosted run',
  () => {
    it.skipIf(!hasModuleHooks)(
      'keeps its catalog: the next run hits and answers byte for byte the same',
      () => {
        const tmp = keptTmp('hosted');
        const first = hosted(tmp);
        expect(first.status, first.stderr).toBe(0);
        expect(first.stdout).toContain('sprockets');
        const kept = allInodes(tmp);
        expect(kept.size).toBeGreaterThan(0);

        const second = hosted(tmp);
        expect(allInodes(tmp)).toEqual(kept);
        expect(second.stdout).toBe(first.stdout);
        expect(second).toEqual(hosted(freshTmp()));
      },
      120_000,
    );

    it.skipIf(!hasModuleHooks)(
      'misses after an edit to a file it read, and gives the fresh answer',
      () => {
        const tmp = keptTmp('hosted-edit');
        hosted(tmp);
        const kept = allInodes(tmp);
        const doc = path.join(widgets, 'templates', 'sprockets.doc.mjs');
        const before = fs.readFileSync(doc, 'utf8');
        try {
          fs.writeFileSync(
            doc,
            before.replace(
              'Sprocket counts by team.',
              'Sprocket counts per quarter.',
            ),
          );
          const edited = hosted(tmp);
          expect(allInodes(tmp)).not.toEqual(kept);
          expect(edited.stdout).toContain('per quarter');
          expect(edited).toEqual(hosted(freshTmp()));
        } finally {
          fs.writeFileSync(doc, before);
        }
      },
      120_000,
    );

    it.skipIf(!hasModuleHooks)(
      'is never what a run of the bin in the same folder answers',
      () => {
        const tmp = keptTmp('hosted-then-bin');
        const answer = hosted(tmp);
        const bin = run(ASK.slice(0, -1), {tmp, cwd: empty});
        expect(bin).toEqual(
          run(ASK.slice(0, -1), {tmp: freshTmp(), cwd: empty}),
        );
        expect(bin.stdout).not.toBe(answer.stdout);
        // And the bin's entry is not what the next hosted run answers.
        expect(hosted(tmp).stdout).toBe(answer.stdout);
      },
      120_000,
    );

    it.skipIf(!hasModuleHooks)(
      'answers with the command each host runs it as',
      () => {
        // In the project, doctor reports the integration's replacement
        // finding, which names the command. Its cache row names the folder
        // and counts what it holds, which differ between two folders.
        const ask = ['doctor', '--json'];
        const doctor = (
          /** @type {string} */ tmp,
          /** @type {string} */ door,
        ) => {
          const r = hosted(tmp, {ask, door, cwd: project});
          return {
            ...r,
            stdout: r.stdout
              .split(tmp)
              .join('<cache>')
              .replace(/\(\d+ entr(?:y|ies), [\d.]+ MB\)/g, '(<count>)'),
          };
        };
        const tmp = keptTmp('hosted-doors');
        const acme = doctor(tmp, 'acme-tool astryx');
        expect(acme.status, acme.stderr).toBe(0);
        expect(acme.stdout).toContain('acme-tool astryx component --list');
        const other = doctor(tmp, 'other-tool astryx');
        expect(other.stdout).toContain('other-tool astryx component --list');
        expect(other).toEqual(
          doctor(keptTmp('hosted-doors-fresh'), 'other-tool astryx'),
        );
      },
      120_000,
    );
  },
);
