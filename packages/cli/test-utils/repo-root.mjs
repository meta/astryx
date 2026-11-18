// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The repository root: the folder that test projects are made in.
 * @input Nothing; the path comes from this file's own place in the repository.
 * @output `REPO_ROOT`, an absolute path without a trailing separator.
 * @position Imported by tests that make a temporary project inside the
 *   repository, so that the project resolves the workspace's packages. The path
 *   never changes during a run. `process.cwd()` changes while a CLI run that
 *   outlived its test still holds the process (run-cli.mjs).
 */

import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

export const REPO_ROOT = path.resolve(
  fileURLToPath(new URL('../../..', import.meta.url)),
);
