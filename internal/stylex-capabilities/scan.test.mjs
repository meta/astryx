// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const requireFromCore = createRequire(
  path.resolve(__dirname, '../../packages/core/package.json'),
);

const registry = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'capabilities.json'), 'utf8'),
);
const installedStylex = JSON.parse(
  fs.readFileSync(
    requireFromCore.resolve('@stylexjs/stylex/package.json'),
    'utf8',
  ),
);

describe('StyleX capability registry', () => {
  it('describes the installed StyleX version', () => {
    expect(registry.version).toBe(installedStylex.version);
  });
});
