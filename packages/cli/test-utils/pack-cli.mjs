// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Packs this CLI the way it is published, for tests that place copies
 * of it.
 * @input packages/cli as it is on disk.
 * @output `packCli(dir)`: the path of the `.tgz` that `npm pack` writes to
 *   `dir`, holding what `prepack` writes (`PREPACK_FILES`).
 * @position Used by vitest.global-setup.node.mjs, which packs once for a
 *   whole node-project run, and by global-local-fixtures.mjs when no run
 *   provided a tarball.
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

/** This CLI package's folder. */
const CLI_DIR = fileURLToPath(new URL('..', import.meta.url));

/** The repository's folder, two levels above the package. */
const REPO_DIR = path.resolve(CLI_DIR, '..', '..');

/**
 * The files `prepack` writes into the published package, each with the
 * script that writes it.
 * @type {{file: string, script: string}[]}
 */
export const PREPACK_FILES = [
  {
    file: 'assets/templates/components.generated.json',
    script: 'scripts/generate-template-components.mjs',
  },
  {
    file: 'assets/docs.generated.json',
    script: 'scripts/generate-stored-docs.mjs',
  },
  {
    file: 'clients/cli/commands.generated.json',
    script: 'scripts/generate-command-list.mjs',
  },
  {
    file: 'assets/self-audit.generated.json',
    script: 'scripts/generate-self-audit.mjs',
  },
  {
    file: 'clients/cli/manifest.generated.json',
    script: 'scripts/generate-manifest.mjs',
  },
  {
    file: 'clients/cli/build-id.generated.json',
    script: 'scripts/generate-build-id.mjs',
  },
];

/**
 * PREPACK_FILES' scripts in the order `prepack` needs: a later stage reads
 * what an earlier one wrote, and the scripts within a stage are independent.
 */
const PREPACK_STAGES = [
  [
    'scripts/generate-template-components.mjs',
    'scripts/generate-stored-docs.mjs',
    'scripts/generate-command-list.mjs',
  ],
  ['scripts/generate-self-audit.mjs', 'scripts/generate-manifest.mjs'],
  ['scripts/generate-build-id.mjs'],
];

/** Runs scripts side by side in the current folder; exits 1 if any fails. */
const SIDE_BY_SIDE = `
const {spawn} = require('node:child_process');
const scripts = JSON.parse(process.argv[1]);
let failed = 0;
Promise.all(scripts.map(script => new Promise(done => {
  const child = spawn(process.execPath, [script], {stdio: ['ignore', 'ignore', 'pipe']});
  let stderr = '';
  child.stderr.on('data', d => (stderr += d));
  child.on('close', status => {
    if (status !== 0) {
      failed = 1;
      process.stderr.write(script + ' failed: ' + stderr);
    }
    done();
  });
}))).then(() => process.exit(failed));
`;

/**
 * Run each generator in `copy` at once, and wait for all of them; throw if one
 * fails or writes no file.
 * @param {{file: string, script: string}[]} entries
 * @param {string} copy
 */
function runSideBySide(entries, copy) {
  const result = spawnSync(
    process.execPath,
    ['-e', SIDE_BY_SIDE, JSON.stringify(entries.map(({script}) => script))],
    {cwd: copy, encoding: 'utf8'},
  );
  if (result.status !== 0) throw new Error(result.stderr);
  for (const {file, script} of entries) {
    // A generator that exits 0 without writing would ship a package
    // without its file: fail here instead.
    if (!fs.existsSync(path.join(copy, file))) {
      throw new Error(`${script} wrote no ${file}`);
    }
  }
}

/**
 * Pack this CLI into `dir` with `npm pack`, as a release is packed.
 *
 * It packs a copy of the package, with what `prepack` writes generated into
 * the copy (`--ignore-scripts` skips prepack, whose type step rewrites the
 * tree). The checkout never holds those files, so another run of the same
 * checkout keeps reading its sources while this one packs.
 * @param {string} dir an existing folder for the tarball
 * @returns {string} the tarball's path
 */
export function packCli(dir) {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-cli-pack-'));
  try {
    const copy = path.join(stage, 'packages', 'cli');
    const ownModules = path.join(CLI_DIR, 'node_modules');
    fs.cpSync(CLI_DIR, copy, {
      recursive: true,
      filter: source =>
        path.resolve(source) !== path.resolve(ownModules) &&
        !PREPACK_FILES.some(
          ({file}) => path.resolve(source) === path.join(CLI_DIR, file),
        ),
    });
    // What the copy's scripts resolve: the package's dependencies, the
    // repository's, and Core beside it.
    const link = (/** @type {string} */ target, /** @type {string} */ at) => {
      if (!fs.existsSync(target)) return;
      fs.mkdirSync(path.dirname(at), {recursive: true});
      fs.symlinkSync(
        target,
        at,
        process.platform === 'win32' ? 'junction' : 'dir',
      );
    };
    link(ownModules, path.join(copy, 'node_modules'));
    link(path.join(REPO_DIR, 'node_modules'), path.join(stage, 'node_modules'));
    link(
      path.join(REPO_DIR, 'packages', 'core'),
      path.join(stage, 'packages', 'core'),
    );
    // The generators run in their prepack order's stages, each stage's
    // scripts side by side: the stores, then the two that read them, then
    // the build id, which hashes everything before it.
    // Every generator runs in exactly one stage: a new one left out of the
    // stages would be skipped without a word.
    const staged = PREPACK_STAGES.flat();
    for (const {script} of PREPACK_FILES) {
      if (staged.filter(s => s === script).length !== 1) {
        throw new Error(`${script} is not in exactly one PREPACK_STAGES stage`);
      }
    }
    if (staged.length !== PREPACK_FILES.length) {
      throw new Error('PREPACK_STAGES names a script PREPACK_FILES does not');
    }
    for (const stage of PREPACK_STAGES) {
      runSideBySide(
        PREPACK_FILES.filter(({script}) => stage.includes(script)),
        copy,
      );
    }
    return npmPack(copy, dir);
  } finally {
    fs.rmSync(stage, {recursive: true, force: true});
  }
}

/**
 * @param {string} from the package folder to pack
 * @param {string} dir
 * @returns {string} the tarball's path
 */
function npmPack(from, dir) {
  const result = spawnSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['pack', '--ignore-scripts', '--json', '--pack-destination', dir],
    {cwd: from, encoding: 'utf8', shell: process.platform === 'win32'},
  );
  if (result.status !== 0) {
    throw new Error(`npm pack failed: ${result.stderr}`);
  }
  const [{filename}] = JSON.parse(result.stdout);
  return path.join(dir, filename);
}
