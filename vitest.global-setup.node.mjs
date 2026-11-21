// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file globalSetup for the `node` test project.
 * @input Shared ensureCoreBuilt helper and authored Sandbox template descriptors.
 * @output Holds this run's lease and builds Core. It rebuilds a Core build
 *   older than its sources once no earlier run is still running. It
 *   regenerates the Sandbox template registry and route wrappers, builds the
 *   theme editor's cache for the CLI's own Core, gives the folder the run
 *   builds each bundled theme once in, packs the CLI, points the home
 *   folder, the temp folder and every per-user folder at folders of this run
 *   and names the repository's package manager as the run's launcher, once,
 *   before any test worker forks. Its teardown fails the run when a test
 *   wrote into the checkout, or, on CI, changed the real cache or
 *   configuration folder.
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
import {
  checkoutState,
  writtenSince,
} from './packages/cli/test-utils/checkout-writes.mjs';
import {packCli} from './packages/cli/test-utils/pack-cli.mjs';
import {
  userCacheDir,
  userConfigDir,
} from './packages/cli/foundation/env/user-dirs.mjs';
import {
  changedSince,
  folderState,
  moveUserHome,
} from './packages/cli/test-utils/test-home.mjs';
import {repositoryUserAgent} from './packages/cli/test-utils/test-launcher.mjs';
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
  const root = fileURLToPath(new URL('.', import.meta.url));
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
    // No test reads or writes the developer's home folder. The home folder,
    // the temp folder and every per-user folder of every worker, and of every
    // process a test starts, point at folders of this run
    // (test-utils/test-home.mjs); each worker refuses to start otherwise.
    const userHome = fs.mkdtempSync(
      path.join(os.tmpdir(), 'astryx-test-user-'),
    );
    // The run's temp folder sits beside its home folder, not around it, as
    // on a developer's computer.
    const runTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-test-tmp-'));
    // The developer's real cache and configuration folders, read before the
    // home folder moves, for the teardown's check.
    const realFolders = [userCacheDir(), userConfigDir()];
    const realBefore = folderState(realFolders);
    moveUserHome(userHome, runTmp);
    // Tests read the package manager that started them from its user agent.
    // The run names the repository's own, so a run started with `node` or
    // `npx vitest` prints the same commands as one started with pnpm.
    process.env.npm_config_user_agent = repositoryUserAgent(root);
    // Every theme editor fixture that links the CLI's own Core reads the
    // same part data and component docs, which take a render of every
    // component to build. They are built once here, and each fixture starts
    // with a copy (test-utils/theme-cache.mjs). A build that fails leaves
    // each fixture to build its own.
    const themeCache = fs.mkdtempSync(
      path.join(os.tmpdir(), 'astryx-test-theme-cache-'),
    );
    try {
      execFileSync(
        process.execPath,
        [
          fileURLToPath(
            new URL(
              './packages/cli/test-utils/theme-cache-warm.mjs',
              import.meta.url,
            ),
          ),
          themeCache,
        ],
        {stdio: 'ignore'},
      );
      project.provide('astryxThemeCacheDir', themeCache);
    } catch {
      // Each fixture builds its own.
    }
    // A checkout with no theme dist builds a bundled theme for the fixtures
    // that install one: once for the run, in this folder, by the first
    // worker that needs it (test-utils/real-base-themes.mjs).
    // What the checkout holds before any test runs: the teardown fails the
    // run when a test wrote into it (checkout-writes.mjs).
    const checkoutBefore = checkoutState(root);
    const baseThemes = fs.mkdtempSync(
      path.join(os.tmpdir(), 'astryx-test-base-themes-'),
    );
    project.provide('astryxBaseThemesDir', baseThemes);
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
      // The packed CLI, the theme cache and the base themes are in the run's
      // temp folder, which moves aside with them.
      trashFolder(runTmp);
      trashFolder(userHome);
      const written = writtenSince(checkoutBefore, checkoutState(root));
      if (written.length) {
        endRun();
        // Vitest reports an error a teardown throws, and still exits 0.
        process.once('exit', () => (process.exitCode = 1));
        throw new Error(
          `tests wrote into the checkout (every fixture belongs in a temp folder): ${written.slice(0, 10).join('; ')}`,
        );
      }
      // On CI the run is the only writer of these folders, so a change is a
      // test's and fails the run. On a developer's computer another process
      // (the developer's own CLI, another checkout's run) may write them too,
      // so a change is reported, not failed.
      const touched = changedSince(realBefore, folderState(realFolders));
      if (touched.length) {
        const list = touched.slice(0, 10).join('; ');
        if (process.env.CI) {
          endRun();
          process.once('exit', () => (process.exitCode = 1));
          throw new Error(
            `tests changed the real per-user folders (every test runs in the run's home folder): ${list}`,
          );
        }
        console.warn(
          `The real per-user folders changed during the run, by a test or by another process on this computer: ${list}`,
        );
      }
      endRun();
    };
  } catch (error) {
    endRun();
    throw error;
  }
}
