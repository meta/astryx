// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {afterEach, describe, expect, it} from 'vitest';

import {
  stablePackageNames,
  verificationWaits,
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
      waits: [1],
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
        waits: [0],
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

describe('verificationWaits', () => {
  it('waits 15 s first, grows by half to at most 60 s, and stops within 30 minutes', () => {
    const waits = verificationWaits();
    expect(waits.slice(0, 5)).toEqual([15_000, 22_500, 33_750, 50_625, 60_000]);
    expect(Math.max(...waits)).toBe(60_000);
    const total = waits.reduce((sum, wait) => sum + wait, 0);
    expect(total).toBeLessThanOrEqual(30 * 60_000);
    expect(total).toBeGreaterThan(29 * 60_000);
  });

  it('waits longer in total than the slowest propagation seen so far', () => {
    // A new Core version has taken more than 10 minutes to become readable.
    const total = verificationWaits().reduce((sum, wait) => sum + wait, 0);
    expect(total).toBeGreaterThan(2 * 10 * 60_000);
  });

  it('keeps a version that stays unreadable failing once the budget is spent', async () => {
    const sleeps = [];
    await expect(
      verifyPublishedPackages({
        packages: ['@astryxdesign/core'],
        version: '0.7.5',
        waits: verificationWaits({maxWaitMs: 100_000}),
        fetchImpl: async () => response({}, 404),
        sleep: async ms => sleeps.push(ms),
      }),
    ).rejects.toThrow('version document returned HTTP 404');
    expect(sleeps).toEqual([15_000, 22_500, 33_750]);
  });
});
