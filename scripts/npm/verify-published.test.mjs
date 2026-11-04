// Copyright (c) Meta Platforms, Inc. and affiliates.

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {afterEach, describe, expect, it} from 'vitest';

import {
  NotYetReadableError,
  stablePackageNames,
  verificationWait,
  verifyPublishedPackages,
  verifyRegistryEntry,
} from './verify-published.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

function response(body, status = 200) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: {'content-type': 'application/json'},
  });
}

function registryFetch({
  versionStatus = 200,
  tag = '0.7.5',
  tarStatus = 200,
} = {}) {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    if (url.includes('/dist-tags')) return response({latest: tag});
    if (url.endsWith('.tgz')) return response('tarball', tarStatus);
    return response(
      {
        name: '@astryxdesign/core',
        version: '0.7.5',
        dist: {tarball: 'https://registry.npmjs.org/core-0.7.5.tgz'},
      },
      versionStatus,
    );
  };
  return {calls, fetchImpl};
}

describe('verifyRegistryEntry', () => {
  it('requires the exact version document, dist-tag, and tarball HTTP 200', async () => {
    const {calls, fetchImpl} = registryFetch();
    await verifyRegistryEntry({
      name: '@astryxdesign/core',
      version: '0.7.5',
      tag: 'latest',
      fetchImpl,
    });
    expect(calls).toEqual([
      'https://registry.npmjs.org/%40astryxdesign%2Fcore/0.7.5',
      'https://registry.npmjs.org/-/package/%40astryxdesign%2Fcore/dist-tags',
      'https://registry.npmjs.org/core-0.7.5.tgz',
    ]);
  });

  it('rejects a stale dist-tag', async () => {
    const {fetchImpl} = registryFetch({tag: '0.7.4'});
    await expect(
      verifyRegistryEntry({
        name: '@astryxdesign/core',
        version: '0.7.5',
        tag: 'latest',
        fetchImpl,
      }),
    ).rejects.toThrow('latest dist-tag is 0.7.4, expected 0.7.5');
  });

  it('rejects a tarball that is not readable', async () => {
    const {fetchImpl} = registryFetch({tarStatus: 404});
    await expect(
      verifyRegistryEntry({
        name: '@astryxdesign/core',
        version: '0.7.5',
        tag: 'latest',
        fetchImpl,
      }),
    ).rejects.toThrow('tarball returned HTTP 404');
  });
});

describe('verifyPublishedPackages', () => {
  it('retries registry propagation without rechecking packages already visible', async () => {
    const attempts = new Map();
    const sleeps = [];
    const fetchImpl = async url => {
      const name = url.includes('cli') ? 'cli' : 'core';
      if (!url.includes('/dist-tags') && !url.endsWith('.tgz')) {
        const seen = (attempts.get(name) ?? 0) + 1;
        attempts.set(name, seen);
        if (name === 'core' && seen === 1) return response({}, 404);
      }
      if (url.includes('/dist-tags')) return response({latest: '0.7.5'});
      if (url.endsWith('.tgz')) return response('tarball');
      return response({
        version: '0.7.5',
        dist: {tarball: `https://registry.npmjs.org/${name}-0.7.5.tgz`},
      });
    };
    await verifyPublishedPackages({
      packages: ['@astryxdesign/cli', '@astryxdesign/core'],
      version: '0.7.5',
      intervalMs: 1,
      fetchImpl,
      sleep: async ms => sleeps.push(ms),
    });
    expect(attempts).toEqual(
      new Map([
        ['cli', 1],
        ['core', 2],
      ]),
    );
    expect(sleeps).toEqual([1]);
  });

  it('reports the last registry failure after the retry budget', async () => {
    await expect(
      verifyPublishedPackages({
        packages: ['@astryxdesign/core'],
        version: '0.7.5',
        intervalMs: 0,
        windowMs: 0,
        fetchImpl: async () => response({}, 404),
        sleep: async () => {},
      }),
    ).rejects.toThrow(
      '@astryxdesign/core@0.7.5: @astryxdesign/core@0.7.5 version document returned HTTP 404',
    );
  });
});

describe('stablePackageNames', () => {
  it('matches stable publish scope and refuses a split version', () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'astryx-registry-verify-'),
    );
    roots.push(root);
    for (const [relative, manifest] of [
      ['packages/core', {name: '@astryxdesign/core', version: '0.7.5'}],
      [
        'packages/themes/neutral',
        {name: '@astryxdesign/theme-neutral', version: '0.7.5'},
      ],
      [
        'packages/lab',
        {
          name: '@astryxdesign/lab',
          version: '0.7.5',
          private: true,
          astryx: {canaryOnly: true},
        },
      ],
    ]) {
      fs.mkdirSync(path.join(root, relative), {recursive: true});
      fs.writeFileSync(
        path.join(root, relative, 'package.json'),
        JSON.stringify(manifest),
      );
    }
    expect(stablePackageNames(root, '0.7.5')).toEqual([
      '@astryxdesign/core',
      '@astryxdesign/theme-neutral',
    ]);
    const corePath = path.join(root, 'packages/core/package.json');
    fs.writeFileSync(
      corePath,
      JSON.stringify({name: '@astryxdesign/core', version: '0.7.4'}),
    );
    expect(() => stablePackageNames(root, '0.7.5')).toThrow(
      '@astryxdesign/core declares 0.7.4, expected 0.7.5',
    );
  });
});

describe('verification window', () => {
  /** A clock that moves only when the verifier sleeps. */
  function clock() {
    let time = 0;
    const sleeps = [];
    return {
      sleeps,
      now: () => time,
      sleep: async ms => {
        sleeps.push(ms);
        time += ms;
      },
    };
  }

  it('waits 15 s first and grows by half to at most 60 s', () => {
    expect(
      [1, 2, 3, 4, 5, 6].map(attempt => verificationWait(attempt)),
    ).toEqual([15_000, 22_500, 33_750, 50_625, 60_000, 60_000]);
  });

  it('starts no check after 8 minutes, then reports the packages as not yet readable', async () => {
    const time = clock();
    const result = verifyPublishedPackages({
      packages: ['@astryxdesign/core'],
      version: '0.7.5',
      fetchImpl: async () => response({}, 404),
      now: time.now,
      sleep: time.sleep,
    });
    await expect(result).rejects.toBeInstanceOf(NotYetReadableError);
    await expect(result).rejects.toThrow('version document returned HTTP 404');
    const total = time.sleeps.reduce((sum, wait) => sum + wait, 0);
    expect(total).toBeLessThanOrEqual(8 * 60_000);
    expect(total).toBeGreaterThan(7 * 60_000);
  });

  it('passes as soon as a slow package becomes readable inside the window', async () => {
    const time = clock();
    let coreReads = 0;
    await verifyPublishedPackages({
      packages: ['@astryxdesign/core'],
      version: '0.7.5',
      now: time.now,
      sleep: time.sleep,
      fetchImpl: async url => {
        if (url.includes('/dist-tags')) return response({latest: '0.7.5'});
        if (url.endsWith('.tgz')) return response('tarball');
        coreReads += 1;
        if (coreReads < 4) return response({}, 404);
        return response({
          version: '0.7.5',
          dist: {tarball: 'https://registry.npmjs.org/core-0.7.5.tgz'},
        });
      },
    });
    expect(time.sleeps).toEqual([15_000, 22_500, 33_750]);
  });

  it('exits 2, "not yet readable", when the window ends with packages unreadable', () => {
    const root = path.resolve(import.meta.dirname, '../..');
    const {version} = JSON.parse(
      fs.readFileSync(path.join(root, 'packages/core/package.json'), 'utf8'),
    );
    const result = spawnSync(
      process.execPath,
      [
        'scripts/npm/verify-published.mjs',
        '--version',
        version,
        '--registry',
        'http://127.0.0.1:9',
        '--window-ms',
        '0',
      ],
      {cwd: root, encoding: 'utf8', timeout: 20_000},
    );
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('not yet readable on the registry');
  });

  it('refuses a window that is not a number, which would never end', () => {
    const root = path.resolve(import.meta.dirname, '../..');
    const {version} = JSON.parse(
      fs.readFileSync(path.join(root, 'packages/core/package.json'), 'utf8'),
    );
    const result = spawnSync(
      process.execPath,
      [
        'scripts/npm/verify-published.mjs',
        '--version',
        version,
        '--window-ms',
        '8m',
      ],
      {cwd: root, encoding: 'utf8', timeout: 20_000},
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      '--window-ms must be a non-negative number of milliseconds',
    );
  });
});
