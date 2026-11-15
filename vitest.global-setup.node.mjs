// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file globalSetup for the `node` test project.
 * @input Shared ensureCoreBuilt helper and authored Sandbox template descriptors.
 * @output Holds this run's lease and builds Core. It rebuilds a Core build
 *   older than its sources once no earlier run is still running. It
 *   regenerates the Sandbox template registry and route wrappers, packs the
 *   CLI, and points the per-user folder at a folder of this run, once, before
 *   any test worker forks.
 * @position Referenced by vitest.config.ts's `node` project. The build-theme
 *   suites need a compiled Core; the Sandbox route contract imports generated
 *   template metadata and scans ignored wrappers that do not exist in a fresh
 *   checkout. The suites that place CLI copies unpack one shared tarball. Run
 *   these prerequisites here, serially and before the test workers, rather
 *   than depending on an unrelated build job or local generated files.
 *   Those suites unpack and keep their copies in this run's folder, which the
 *   teardown removes.
 *
 * SYNC: When modified, update this header.
 */

import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  ensureCoreBuiltForRun,
  registerTestRun,
} from './packages/cli/clients/cli/commands/ensure-core-built.mjs';
import {packCli} from './packages/cli/test-utils/pack-cli.mjs';
import {
  sweepTrash,
  trashFolder,
} from './packages/cli/test-utils/run-folder.mjs';

/**
 * Trash what an earlier run left in `packDir`. Its workers have stopped, and
 * the next run unpacks again.
 * @param {string} packDir
 */
function trashUnpackedClis(packDir) {
  for (const entry of fs.readdirSync(packDir)) {
    if (!entry.endsWith('.tgz')) trashFolder(path.join(packDir, entry));
  }
}

/** @param {import('vitest/node').TestProject} project */
export default async function setup(project) {
  // This run holds a lease for its whole length, so a later run's setup does
  // not rebuild Core under it. The returned teardown ends it, and so does the
  // process's exit: a run stopped with Ctrl-C calls no teardown.
  const endRun = registerTestRun();
  process.once('exit', endRun);
  try {
    // A stale Core is rebuilt only here, before the workers. A suite that
    // rebuilt it mid-run would delete dist under suites still reading it. The
    // wait for an earlier run is a timer, so Ctrl-C still stops this one.
    await ensureCoreBuiltForRun();
    // The ignored registry and ~700 physical page wrappers are build outputs,
    // not fixtures to check in. The route-manifest test must see the same
    // inputs as `pnpm -F @astryxdesign/sandbox build` on a clean CI checkout.
    execFileSync(
      process.execPath,
      [fileURLToPath(new URL('./scripts/sync-templates.js', import.meta.url))],
      {
        cwd: fileURLToPath(new URL('.', import.meta.url)),
        maxBuffer: 32 * 1024 * 1024,
      },
    );
    // An earlier run's child may have been stopped before it removed that
    // run's folder.
    sweepTrash(os.tmpdir(), Date.now());
    // The CLI records once-a-day notices in a per-user state file. Point the
    // per-user folder of every worker at a folder of this run, so no test
    // writes the developer's real one. macOS reads it under the home folder
    // only, so there the home folder moves too, and npm keeps its own cache.
    const userHome = fs.mkdtempSync(
      path.join(os.tmpdir(), 'astryx-test-user-'),
    );
    process.env.XDG_CONFIG_HOME = path.join(userHome, '.config');
    process.env.APPDATA = path.join(userHome, 'AppData', 'Roaming');
    if (process.platform === 'darwin') {
      process.env.npm_config_cache ??= path.join(os.homedir(), '.npm');
      process.env.HOME = userHome;
    }
    // `npm pack` costs about 5 s of CPU. Packing once here keeps that out of
    // every suite that places CLI copies, and out of their timed tests. A watch
    // session packs again before a rerun of this project's tests, so they see
    // CLI edits. A rerun of other projects' tests does not wait for it.
    const packDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'astryx-cli-tarball-'),
    );
    // The suites unpack the tarball and keep their placed copies in this
    // folder, thousands of files each. The teardown removes them once, after
    // every suite, so no suite's own hook spends that time on a busy machine.
    project.provide('astryxPackedCliRunDir', packDir);
    const pack = () =>
      project.provide('astryxPackedCliTarball', packCli(packDir));
    pack();
    project.onTestsRerun(specs => {
      if (specs.some(spec => spec.project.name === project.name)) {
        trashUnpackedClis(packDir);
        pack();
      }
    });
    return () => {
      // Vitest gives close() 10 s, and the folder holds thousands of files.
      // It moves aside at once, and a detached child removes it.
      trashFolder(packDir);
      trashFolder(userHome);
      endRun();
    };
  } catch (error) {
    endRun();
    throw error;
  }
}
