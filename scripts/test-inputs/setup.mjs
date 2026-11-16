// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Records the `node` project's inputs per test file, in a recording run.
 * @position vitest.config.ts adds it to the `node` project's `setupFiles`
 *   when ASTRYX_TEST_INPUTS_DIR is set (Main's full unit run). Each test file
 *   records under its repository path; what it touches after its last test
 *   is no longer its own.
 */

import path from 'node:path';
import {afterAll, expect} from 'vitest';
import './record.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');

globalThis.__astryxTestInputs?.switchTo(
  path.relative(ROOT, expect.getState().testPath).split(path.sep).join('/'),
);
afterAll(() => globalThis.__astryxTestInputs?.switchTo(undefined));
