// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The global copy's background step that installs its own release's
 * Core into the per-user cache (spec AST-081 FR3, FR6), as its own detached
 * process, so commands that read Core outside a project work offline after
 * one online run.
 *
 * Started by `maybeFetchCore` (global-state.mjs) with one argument, the
 * per-user cache folder. It installs this release (CLI and Core, as a
 * project's matched release is installed) through the release cache, which
 * takes the install lock, records a failure for its backoff, and forgets it
 * on success. It writes nothing to any stream and never reaches a person: it
 * is not a command and takes no options.
 *
 * @input  argv[2]: the per-user cache folder
 * @output this release, Core included, in the release cache
 * @position foundation/release — one of the detached processes the CLI
 *   starts, beside refresh-worker.mjs and agent-text-worker.mjs.
 */

import {fileURLToPath} from 'node:url';
import {ensureRelease} from './cache.mjs';
import {readJson} from './project.mjs';

const cacheDir = process.argv[2];
if (cacheDir) {
  try {
    const pkg = readJson(
      fileURLToPath(new URL('../../package.json', import.meta.url)),
    );
    if (typeof pkg?.version === 'string') {
      ensureRelease(pkg.version, {cacheDir});
    }
  } catch {
    // A cache that cannot be written is tried again by a later run.
  }
}
