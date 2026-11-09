// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file build's tree end to end, offline: the network and subprocesses throw,
 * and build still answers. The block picker changes only the kit's blocks:
 * the start, its alternatives, and every other field stay build's own, the
 * block count is build's own, the blocks follow the picker's own ranking, and
 * each phrase pins the components it must get blocks from.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  requireNatively,
  stubBuiltin,
} from '../../test-utils/native-require.mjs';

/** The built-ins build must not reach: the network and subprocesses. */
const OFFLINE = [
  'http',
  'https',
  'http2',
  'net',
  'tls',
  'dgram',
  'dns',
  'dns/promises',
  'child_process',
];

/** @param {string} what */
const reached = what => () => {
  throw new Error(`build reached ${what}`);
};

// From before build loads, every function they export throws, so a function
// build keeps from its first load throws too. Their classes stay, because
// Node builds on them, but each class's connect, listen, bind, send, spawn
// and query throws.
const restoreOffline = OFFLINE.map(name =>
  stubBuiltin(`node:${name}`, real =>
    Object.fromEntries(
      Object.entries(real)
        .filter(
          ([key, value]) => typeof value === 'function' && !/^[A-Z]/u.test(key),
        )
        .map(([key]) => [key, reached(`${name}.${key}`)]),
    ),
  ),
);

const require = requireNatively(import.meta.url);
const {Socket, Server} = require('node:net');
const {Socket: UdpSocket} = require('node:dgram');
const {ChildProcess} = require('node:child_process');
const {Resolver} = require('node:dns');
const {Resolver: AsyncResolver} = require('node:dns/promises');

/**
 * Each query method of a DNS resolver class, named as `label` names it.
 * @param {string} label
 * @param {{prototype: any}} resolver
 * @returns {[string, any, string][]}
 */
const queries = (label, resolver) =>
  Object.getOwnPropertyNames(resolver.prototype)
    .filter(key => /^(?:resolve|reverse)/u.test(key))
    .map(
      key =>
        /** @type {[string, any, string]} */ ([
          `${label}.prototype.${key}`,
          resolver.prototype,
          key,
        ]),
    );

/** @type {[string, any, string][]} */
const STARTS = [
  ['net.Socket.prototype.connect', Socket.prototype, 'connect'],
  ['net.Server.prototype.listen', Server.prototype, 'listen'],
  ['dgram.Socket.prototype.bind', UdpSocket.prototype, 'bind'],
  ['dgram.Socket.prototype.connect', UdpSocket.prototype, 'connect'],
  ['dgram.Socket.prototype.send', UdpSocket.prototype, 'send'],
  [
    'child_process.ChildProcess.prototype.spawn',
    ChildProcess.prototype,
    'spawn',
  ],
  ...queries('dns.Resolver', Resolver),
  ...queries('dns/promises.Resolver', AsyncResolver),
];
const ownStarts = STARTS.map(([, target, key]) => target[key]);
for (const [what, target, key] of STARTS) target[key] = reached(what);

/** @type {typeof import('./build.mjs')} */
const {build} = require('./build.mjs');
/** @type {typeof import('./kit/kit.mjs')} */
const {buildKit} = require('./kit/kit.mjs');
/** @type {typeof import('./_adapter.mjs')} */
const {loadBlockPicker, withListingCache} = require('./_adapter.mjs');
/** @type {typeof import('./kit/signals.mjs')} */
const {kitSignals} = require('./kit/signals.mjs');
/** @type {typeof import('./blocks/blocks.mjs')} */
const {pickBlocks} = require('./blocks/blocks.mjs');

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

/**
 * Hand-written phrases and the components each must get blocks from. Which
 * blocks the picker names moves whenever the block catalog grows, so the test
 * reads the picker's own ranking for the order and pins only the components.
 * @type {[string, string[]][]}
 */
const PINNED = [
  ['analytics dashboard with a KPI row and a sortable table', ['Table']],
  ['settings page with notification toggles and a save bar', ['Switch']],
  ['empty state for a question bank with an import button', ['EmptyState']],
  ['login form with single sign-on buttons', ['Button', 'FormLayout']],
  ['calendar for booking appointments', ['Calendar']],
  ['kanban board for sprint tasks with a filter bar', ['Toolbar']],
];

/** @type {typeof globalThis.fetch} */
let realFetch;
beforeAll(() => {
  realFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error('build reached fetch');
  };
});
afterAll(() => {
  globalThis.fetch = realFetch;
  for (const restore of restoreOffline) restore();
  STARTS.forEach(([, target, key], index) => {
    target[key] = ownStarts[index];
  });
});

describe('the offline guard', () => {
  it('throws on each network and subprocess call that natively loaded code makes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-offline-'));
    try {
      const file = path.join(dir, 'calls.mjs');
      fs.writeFileSync(
        file,
        [
          "import {request} from 'node:http';",
          "import {get} from 'node:https';",
          "import {connect as connectHttp2} from 'node:http2';",
          "import {connect} from 'node:net';",
          "import {connect as connectTls} from 'node:tls';",
          "import {Socket as UdpSocket, createSocket} from 'node:dgram';",
          "import {lookup} from 'node:dns';",
          "import {Resolver, lookup as lookupAsync} from 'node:dns/promises';",
          "import {ChildProcess, spawnSync} from 'node:child_process';",
          "import {Socket} from 'node:net';",
          'export const calls = {',
          "  'http.request': () => request('http://127.0.0.1:9'),",
          "  'https.get': () => get('https://127.0.0.1:9'),",
          "  'http2.connect': () => connectHttp2('http://127.0.0.1:9').destroy(),",
          "  'net.connect': () => connect(9, '127.0.0.1'),",
          "  'tls.connect': () => connectTls(9, '127.0.0.1').destroy(),",
          "  'dgram.createSocket': () => createSocket('udp4').close(),",
          "  'dns.lookup': () => lookup('localhost', () => {}),",
          "  'dns/promises.lookup': () => lookupAsync('localhost').catch(() => {}),",
          "  'child_process.spawnSync': () => spawnSync('true'),",
          "  'net.Socket.prototype.connect': () =>",
          "    new Socket().connect(9, '127.0.0.1'),",
          "  'dgram.Socket.prototype.send': () =>",
          "    new UdpSocket('udp4').send('x', 9, '127.0.0.1'),",
          "  'dns/promises.Resolver.prototype.resolve4': () => {",
          '    const resolver = new Resolver();',
          "    resolver.setServers(['127.0.0.1']);",
          "    return resolver.resolve4('localhost').catch(() => {});",
          '  },',
          "  'child_process.ChildProcess.prototype.spawn': () =>",
          "    new ChildProcess().spawn({file: 'true', args: ['true']}),",
          '};',
          '',
        ].join('\n'),
      );
      /** @type {{calls: Record<string, () => unknown>}} */
      const {calls} = require(file);
      for (const [name, call] of Object.entries(calls)) {
        expect(call, name).toThrow(`build reached ${name}`);
      }
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
});

describe('build tree', () => {
  it('keeps a block the request names by its exact name in build’s slot', async () => {
    const phrase = 'calendar for booking appointments with CalendarTwoMonths';
    const answer = await build(phrase, {cwd: REPO});
    const own = await withListingCache(() => buildKit(phrase, {cwd: REPO}));
    if (answer?.type !== 'build.kit' || own.type !== 'build.kit')
      throw new Error('expected a kit');
    const k = own.data.blocks.findIndex(b => b.name === 'CalendarTwoMonths');
    expect(k).toBeGreaterThanOrEqual(0);
    expect(answer.data.blocks[k].name).toBe('CalendarTwoMonths');
  });

  it('runs with the network and subprocesses blocked', async () => {
    const cp = await import('node:child_process');
    const https = await import('node:https');
    expect(() => cp.execFileSync('true')).toThrow(/build reached/);
    expect(() => https.request('https://example.com')).toThrow(/build reached/);
    expect(() => globalThis.fetch('https://example.com')).toThrow(
      /build reached/,
    );
  });

  it('loads the block picker weights as plain numbers', () => {
    expect(loadBlockPicker()).not.toBeNull();
  });

  for (const [phrase, components] of PINNED) {
    it(`answers "${phrase}" offline with the picker's blocks`, async () => {
      const answer = await build(phrase, {cwd: REPO});
      const own = await withListingCache(() => buildKit(phrase, {cwd: REPO}));
      if (answer?.type !== 'build.kit' || own.type !== 'build.kit')
        throw new Error('expected a kit');
      // Only the blocks move: the start, its alternatives, and every other
      // field are build's own.
      expect({...answer.data, blocks: null}).toEqual({
        ...own.data,
        blocks: null,
      });
      expect(answer.data.start?.alternatives).toEqual(
        own.data.start?.alternatives,
      );
      // Every block is build's own entry, one search returned, or the picker's
      // own, each with its real score and reason; never more blocks than
      // build's own.
      expect(answer.data.blocks.length).toBe(own.data.blocks.length);
      for (const b of answer.data.blocks) {
        expect(b.score).toBeGreaterThan(0);
        expect(typeof b.reason).toBe('string');
        const mine = own.data.blocks.find(o => o.name === b.name);
        if (mine) expect(mine).toEqual(b);
      }
      // Build names the blocks the picker ranks, in its order, whatever blocks
      // the catalog holds.
      const signals = await withListingCache(() =>
        kitSignals(phrase, {cwd: REPO}),
      );
      const picker = loadBlockPicker();
      if (!picker) throw new Error('expected the block picker');
      expect(answer.data.blocks.map(b => b.name)).toEqual(
        pickBlocks(phrase, signals, picker).names,
      );
      // Each component the request names gets at least one of its own blocks:
      // a block belongs to the longest component name it starts with, as the
      // picker reads it.
      const byLength = signals.components
        .map(c => c.name)
        .sort((a, b) => b.length - a.length);
      const componentOf = (/** @type {string} */ name) =>
        byLength.find(c => name.startsWith(c));
      for (const component of components) {
        expect(
          answer.data.blocks.some(b => componentOf(b.name) === component),
          component,
        ).toBe(true);
      }
      // Never longer than build's own answer for the same request.
      expect(Buffer.byteLength(JSON.stringify(answer))).toBeLessThanOrEqual(
        Buffer.byteLength(JSON.stringify(own)),
      );
    });
  }
});
