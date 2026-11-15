// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  InMemoryConfigCache,
  cacheKey,
  configContentHash,
  NO_CONFIG_HASH,
} from './config-cache.mjs';
import {REPO_ROOT} from '../../test-utils/repo-root.mjs';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(REPO_ROOT, '.astryx-cache-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('InMemoryConfigCache', () => {
  it('stores and returns values by key', () => {
    const cache = new InMemoryConfigCache();
    expect(cache.get('a')).toBeUndefined();
    cache.set('a', 42);
    expect(cache.get('a')).toBe(42);
  });

  it('can store falsy values distinctly from a miss', () => {
    const cache = new InMemoryConfigCache();
    cache.set('zero', {value: 0});
    expect(cache.get('zero')).toEqual({value: 0});
    expect(cache.get('missing')).toBeUndefined();
  });
});

describe('configContentHash', () => {
  it('returns the sentinel when there is no config path', () => {
    expect(configContentHash(null)).toBe(NO_CONFIG_HASH);
    expect(configContentHash(undefined)).toBe(NO_CONFIG_HASH);
  });

  it('returns the sentinel for a missing file', () => {
    expect(configContentHash(path.join(tmpDir, 'nope.mjs'))).toBe(
      NO_CONFIG_HASH,
    );
  });

  it('is stable for the same bytes', () => {
    const file = path.join(tmpDir, 'astryx.config.mjs');
    fs.writeFileSync(file, 'export default { integrations: [] };\n');
    const a = configContentHash(file);
    const b = configContentHash(file);
    expect(a).toBe(b);
    expect(a).not.toBe(NO_CONFIG_HASH);
  });

  it('differs when the config content changes', () => {
    const file = path.join(tmpDir, 'astryx.config.mjs');
    fs.writeFileSync(file, 'export default { integrations: [] };\n');
    const before = configContentHash(file);
    fs.writeFileSync(file, 'export default { integrations: ["@x/y"] };\n');
    const after = configContentHash(file);
    expect(before).not.toBe(after);
  });
});

describe('cacheKey', () => {
  it('is stable for identical inputs and varies by kind', () => {
    const k1 = cacheKey('hash', '/cwd', 'components');
    const k2 = cacheKey('hash', '/cwd', 'components');
    const k3 = cacheKey('hash', '/cwd', 'templates');
    expect(k1).toBe(k2);
    expect(k1).not.toBe(k3);
  });

  it('varies by hash and cwd', () => {
    expect(cacheKey('h1', '/cwd', 'k')).not.toBe(cacheKey('h2', '/cwd', 'k'));
    expect(cacheKey('h', '/a', 'k')).not.toBe(cacheKey('h', '/b', 'k'));
  });
});
