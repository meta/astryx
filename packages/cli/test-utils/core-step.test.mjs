// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file core-step.test.mjs
 * @input core-step.mjs; the release code's `maybeFetchCore`
 * @output The test utilities remove the same file the release code starts as
 *   the background Core step, and the removal fails when that file is missing.
 * @position A Node test; it starts no process (the start is a stub)
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {maybeFetchCore} from '../foundation/release/global-state.mjs';
import {CORE_STEP, removeCoreStep} from './core-step.mjs';

const made = [];
afterEach(() => {
  for (const dir of made.splice(0))
    fs.rmSync(dir, {recursive: true, force: true});
});

/** A CLI package folder that carries the step, and an empty release cache. */
function copyWithStep() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'core-step-'));
  made.push(work);
  const root = path.join(work, 'cli');
  const step = path.join(root, ...CORE_STEP);
  fs.mkdirSync(path.dirname(step), {recursive: true});
  fs.writeFileSync(step, '');
  const cacheDir = path.join(work, 'cache');
  fs.mkdirSync(cacheDir);
  return {root, step, cacheDir};
}

/** What the release code starts for the copy, with the start stubbed. */
function started(root, cacheDir) {
  const start = vi.fn();
  const did = maybeFetchCore({
    release: {version: '1.2.3', root},
    cacheDir,
    env: {},
    start,
    platform: 'linux',
  });
  return {did, worker: start.mock.calls[0]?.[0]};
}

describe('removeCoreStep', () => {
  it('names the file the release code starts as the background Core step', () => {
    const {root, step, cacheDir} = copyWithStep();
    expect(started(root, cacheDir)).toEqual({did: true, worker: step});
  });

  it('removes it, so the release code starts no step', () => {
    const {root, step, cacheDir} = copyWithStep();
    removeCoreStep(root);
    expect(fs.existsSync(step)).toBe(false);
    expect(started(root, cacheDir)).toEqual({did: false, worker: undefined});
  });

  it('fails when the step is not there', () => {
    const {root} = copyWithStep();
    removeCoreStep(root);
    expect(() => removeCoreStep(root)).toThrow(/ENOENT/);
  });
});
