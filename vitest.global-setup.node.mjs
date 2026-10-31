// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file globalSetup for the `node` test project.
 * @input Shared ensureCoreBuilt helper and authored Sandbox template descriptors.
 * @output Holds this run's lease, builds Core (again when its build is older
 *   than its sources and no earlier run is still running) and
 *   regenerates the Sandbox template registry and route wrappers once, before
 *   any test worker forks.
 * @position Referenced by vitest.config.ts's `node` project. The build-theme
 *   suites need a compiled Core; the Sandbox route contract imports generated
 *   template metadata and scans ignored wrappers that do not exist in a fresh
 *   checkout. Run both prerequisites here, serially and before the test workers,
 *   rather than depending on an unrelated build job or local generated files.
 *
 * SYNC: When modified, update this header.
 */

import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  ensureCoreBuiltForRun,
  registerTestRun,
} from './packages/cli/clients/cli/commands/ensure-core-built.mjs';

export default async function setup() {
  // This run holds a lease for its whole length, so a later run's setup does
  // not rebuild Core under it. The returned teardown ends it, and so does the
  // process's exit: a run stopped with Ctrl-C calls no teardown.
  const endRun = registerTestRun();
  process.once('exit', endRun);
  try {
    // A stale Core is rebuilt only here, before the workers: a suite that
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
  } catch (error) {
    endRun();
    throw error;
  }
  return endRun;
}
