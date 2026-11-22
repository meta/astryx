// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The reason the shared Core prop check gives when there is no
 * TypeScript: with the project's install step, and worded for a folder
 * outside a project with none.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {projectTypeScript} from './unknown-core-props.mjs';

/** @type {string} */
let tmp;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-unknown-core-props-'));
});
afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

describe('projectTypeScript', () => {
  it('names the install step for a project, and none in the reason for a folder outside one', () => {
    const answer = /** @type {{skipped: string, reason: string}} */ (
      projectTypeScript([tmp])
    );
    expect(answer.skipped).toMatch(
      /^TypeScript is not installed in this project, so the props were not checked\. .*npm install -D typescript@6/,
    );
    expect(answer.reason).toBe(
      'TypeScript is not installed here, so the props were not checked.',
    );
  });
});
