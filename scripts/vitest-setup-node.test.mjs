// Copyright (c) Meta Platforms, Inc. and affiliates.

import Module, {createRequire} from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

describe("the node project's setup", () => {
  it('leaves no NODE_PATH, so a worker searches no package store for a fixture', () => {
    expect(process.env.NODE_PATH).toBeUndefined();
    const globalPaths = /** @type {any} */ (Module).globalPaths;
    expect(globalPaths.some((/** @type {string} */ p) => p.includes(`${path.sep}.pnpm${path.sep}`))).toBe(false);
  });

  it('resolves no workspace package from a folder outside the workspace', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-setup-'));
    try {
      const req = createRequire(path.join(dir, 'noop.js'));
      expect(() => req.resolve('@astryxdesign/theme-neutral/package.json')).toThrow();
      expect(() => req.resolve('@astryxdesign/core/package.json')).toThrow();
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
});
