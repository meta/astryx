// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file globalSetup for the `node` test project.
 * @input Shared ensureCoreBuilt helper and authored Sandbox template descriptors.
 * @output Builds Core, regenerates the Sandbox template registry and route
 *   wrappers, and packs the CLI once, before any test worker forks.
 * @position Referenced by vitest.config.ts's `node` project. The build-theme
 *   suites need a compiled Core; the Sandbox route contract imports generated
 *   template metadata and scans ignored wrappers that do not exist in a fresh
 *   checkout. The suites that place CLI copies unpack one shared tarball. Run
 *   these prerequisites here, serially and before the test workers, rather
 *   than depending on an unrelated build job or local generated files.
 *
 * SYNC: When modified, update this header.
 */

import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ensureCoreBuilt} from './packages/cli/clients/cli/commands/ensure-core-built.mjs';
import {packCli} from './packages/cli/test-utils/pack-cli.mjs';

/** @param {import('vitest/node').TestProject} project */
export default function setup(project) {
  ensureCoreBuilt();
  // The ignored registry and ~700 physical page wrappers are build outputs,
  // not fixtures to check in. The route-manifest test must see the same inputs
  // as `pnpm -F @astryxdesign/sandbox build` on a clean CI checkout.
  execFileSync(
    process.execPath,
    [fileURLToPath(new URL('./scripts/sync-templates.js', import.meta.url))],
    {
      cwd: fileURLToPath(new URL('.', import.meta.url)),
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  // `npm pack` costs about 5 s of CPU. Packing once here keeps that out of
  // every suite that places CLI copies, and out of their timed tests. A watch
  // session packs again before a rerun of this project's tests, so they see
  // CLI edits. A rerun of other projects' tests does not wait for it.
  const packDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-cli-tarball-'));
  const pack = () =>
    project.provide('astryxPackedCliTarball', packCli(packDir));
  pack();
  project.onTestsRerun(specs => {
    if (specs.some(spec => spec.project.name === project.name)) pack();
  });
  return () => fs.rmSync(packDir, {recursive: true, force: true});
}
