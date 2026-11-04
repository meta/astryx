// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Publishing one package at most once, with retries the registry
 * decides (scripts/npm/publish-package.mjs).
 */

import {describe, expect, it} from 'vitest';

import {publishOnce, registryHas} from './publish-package.mjs';

/**
 * A fake registry and publisher. `publishes` lists each attempt's outcome:
 * `ok` (accepted), `lost` (accepted, but the client reported a failure, as
 * when the reply is lost), or `fail` (rejected, e.g. the transparency log's
 * 409). `present` is whether the version is already on the registry, and
 * `reads` overrides what each registry read returns.
 */
function fake({present = false, publishes = ['ok'], reads} = {}) {
  let onRegistry = present;
  const calls = {publish: 0, read: 0, sleeps: []};
  return {
    calls,
    options: {
      name: '@astryxdesign/vega',
      version: '0.7.6-canary.abc1234',
      retryWaitsMs: [20_000, 60_000],
      readIntervalMs: 5_000,
      sleep: async ms => {
        calls.sleeps.push(ms);
      },
      isPublished: async () => {
        const read = reads?.[calls.read];
        calls.read += 1;
        return read === undefined ? onRegistry : read;
      },
      publish: async () => {
        const outcome = publishes[calls.publish] ?? 'fail';
        calls.publish += 1;
        if (outcome === 'ok' || outcome === 'lost') onRegistry = true;
        return outcome === 'ok';
      },
    },
  };
}

describe('publishOnce', () => {
  it('does not publish a version already on the registry', async () => {
    const {calls, options} = fake({present: true});
    expect(await publishOnce(options)).toEqual({
      published: true,
      outcome: 'already-published',
      attempts: 0,
    });
    expect(calls.publish).toBe(0);
  });

  it('publishes once when the first attempt succeeds', async () => {
    const {calls, options} = fake({publishes: ['ok']});
    expect(await publishOnce(options)).toMatchObject({
      published: true,
      outcome: 'published',
      attempts: 1,
    });
    expect(calls.publish).toBe(1);
    expect(calls.sleeps).toEqual([]);
  });

  it('retries a rejected attempt (the transparency log 409) while the registry lacks the version', async () => {
    const {calls, options} = fake({publishes: ['fail', 'ok']});
    expect(await publishOnce(options)).toMatchObject({
      published: true,
      outcome: 'published',
      attempts: 2,
    });
    expect(calls.publish).toBe(2);
    // Four registry reads after the failure, then the first retry wait.
    expect(calls.sleeps).toEqual([5_000, 5_000, 5_000, 20_000]);
  });

  it('does not publish again when the registry has the version after a reported failure', async () => {
    const {calls, options} = fake({publishes: ['lost']});
    expect(await publishOnce(options)).toMatchObject({
      published: true,
      outcome: 'published-despite-error',
      attempts: 1,
    });
    expect(calls.publish).toBe(1);
  });

  it('waits for a version that appears on the registry a few seconds after a reported failure', async () => {
    // Pre-check, then three reads that still miss it, then it appears.
    const {calls, options} = fake({
      publishes: ['lost'],
      reads: [false, false, false, false],
    });
    expect(await publishOnce(options)).toMatchObject({
      outcome: 'published-despite-error',
    });
    expect(calls.publish).toBe(1);
    expect(calls.read).toBe(5);
  });

  it('fails a package that never reaches the registry, after every attempt', async () => {
    const {calls, options} = fake({publishes: ['fail', 'fail', 'fail']});
    expect(await publishOnce(options)).toEqual({
      published: false,
      outcome: 'failed',
      attempts: 3,
    });
    expect(calls.publish).toBe(3);
    expect(calls.sleeps.filter(ms => ms > 5_000)).toEqual([20_000, 60_000]);
  });

  it('never skips a package on an unknown registry read', async () => {
    // The pre-check cannot read the registry: it publishes (npm refuses a
    // second publish of a version, so this cannot publish twice).
    const unknown = fake({reads: [null], publishes: ['ok']});
    expect(await publishOnce(unknown.options)).toMatchObject({
      outcome: 'published',
    });
    expect(unknown.calls.publish).toBe(1);

    // After a failure, unknown reads do not count as published.
    const failing = fake({
      publishes: ['fail'],
      reads: [false, null, null, null, null],
    });
    expect(await publishOnce({...failing.options, attempts: 1})).toMatchObject({
      published: false,
      outcome: 'failed',
    });
  });
});

describe('registryHas', () => {
  const response = status => new Response('{}', {status});

  it('reads the exact version document', async () => {
    const urls = [];
    const fetchImpl = async url => {
      urls.push(url);
      return response(200);
    };
    expect(
      await registryHas({
        name: '@astryxdesign/vega',
        version: '0.7.6-canary.abc1234',
        registry: 'https://registry.example/',
        fetchImpl,
      }),
    ).toBe(true);
    expect(urls).toEqual([
      'https://registry.example/%40astryxdesign%2Fvega/0.7.6-canary.abc1234',
    ]);
  });

  it('answers false for 404 and unknown for any other status or a network error', async () => {
    const read = fetchImpl =>
      registryHas({name: '@astryxdesign/vega', version: '1.0.0', fetchImpl});
    expect(await read(async () => response(404))).toBe(false);
    expect(await read(async () => response(503))).toBe(null);
    expect(await read(async () => response(401))).toBe(null);
    expect(
      await read(async () => {
        throw new TypeError('fetch failed');
      }),
    ).toBe(null);
  });
});
