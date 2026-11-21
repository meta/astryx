// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';
import {
  usePackedCli,
  work,
  packed,
  run,
  freshTmp,
  hasModuleHooks,
  BUILD_ID,
} from '../test-utils/packed-gather-cache-fixture.mjs';
import {ownModuleUrl} from '../foundation/fs/own-modules.mjs';

usePackedCli();

/** Commands whose runs load much of the CLI's module graph. */
const COMMANDS = [
  ['search', 'running totals'],
  ['component', 'Button'],
  ['docs'],
];

/** A preload that records each resolve as [specifier, parent, url]. */
const RESOLVE_LOG = `
import {registerHooks} from 'node:module';
import {writeFileSync} from 'node:fs';
const seen = [];
registerHooks({
  resolve(specifier, context, nextResolve) {
    const result = nextResolve(specifier, context);
    seen.push([specifier, context.parentURL ?? null, result.url]);
    return result;
  },
});
process.on('exit', () => writeFileSync(process.env.RESOLVE_LOG_FILE, JSON.stringify(seen)));
`;

/**
 * Runs a recorded run that loads the CLI's API, which imports most of its
 * modules, and notes, for each module hook the run registers in order, every
 * resolve it answers and every load it sees.
 */
const RECORDED_RUN = `
import {createRequire, syncBuiltinESMExports} from 'node:module';
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const builtin = createRequire(import.meta.url)('node:module');
const [cliRoot, out] = process.argv.slice(2);
const register = builtin.registerHooks;
// Every load in the run, as a hook registered before the run's sees them.
const runLoads = [];
let inRun = false;
register({
  load(url, context, nextLoad) {
    if (inRun) runLoads.push(url);
    return nextLoad(url, context);
  },
});
const hooks = [];
builtin.registerHooks = given => {
  const seen = {resolves: [], loads: []};
  hooks.push(seen);
  return register({
    resolve: given.resolve && ((specifier, context, nextResolve) => {
      const result = given.resolve(specifier, context, nextResolve);
      seen.resolves.push([specifier, context.parentURL ?? null, result.url, result.shortCircuit === true]);
      return result;
    }),
    load: given.load && ((url, context, nextLoad) => {
      seen.loads.push(url);
      return given.load(url, context, nextLoad);
    }),
  });
};
syncBuiltinESMExports();
const cache = await import(pathToFileURL(cliRoot + '/foundation/fs/gather-cache.mjs').href);
inRun = true;
await cache.recordRun(() => import(pathToFileURL(cliRoot + '/api/index.mjs').href));
inRun = false;
writeFileSync(out, JSON.stringify({hooks, runLoads}));
`;

/** The packed CLI's folder as a file URL ending in `/`. */
const rootUrl = () => `${pathToFileURL(fs.realpathSync(packed)).href}/`;

/**
 * The resolves whose import is one of the CLI's own modules, by its path.
 * @param {[string, string | null, string][]} resolves
 */
const ownResolves = resolves =>
  resolves.filter(
    ([specifier, parent]) =>
      ownModuleUrl(specifier, parent ?? undefined, rootUrl()) !== null,
  );

describe.skipIf(!hasModuleHooks)("the installed CLI's own modules", () => {
  it('resolve to the URL Node gives each of them', () => {
    const preload = path.join(work, 'resolve-log.mjs');
    fs.writeFileSync(preload, RESOLVE_LOG);
    const buildId = path.join(packed, BUILD_ID);
    const hidden = `${buildId}.hidden`;
    // Without a build id the CLI resolves as Node does: the log holds Node's
    // own answer for every import of the runs.
    fs.renameSync(buildId, hidden);
    /** @type {[string, string | null, string][]} */
    const seen = [];
    try {
      for (const [index, args] of COMMANDS.entries()) {
        const file = path.join(work, `resolves-${index}.json`);
        const result = run(args, {
          tmp: freshTmp(),
          env: {
            NODE_OPTIONS: `--import ${pathToFileURL(preload).href}`,
            RESOLVE_LOG_FILE: file,
          },
        });
        expect(result.status, result.stderr).toBe(0);
        seen.push(...JSON.parse(fs.readFileSync(file, 'utf8')));
      }
    } finally {
      fs.renameSync(hidden, buildId);
    }
    const own = ownResolves(seen);
    expect(own.length).toBeGreaterThan(300);
    for (const [specifier, parent, url] of own) {
      expect(
        ownModuleUrl(specifier, parent ?? undefined, rootUrl()),
        `${specifier} from ${parent}`,
      ).toBe(url);
    }
  }, 120_000);

  it('resolve by path under the recorder, which still sees each import and load', () => {
    const script = path.join(work, 'recorded-run.mjs');
    const out = path.join(work, 'recorded-run.json');
    fs.writeFileSync(script, RECORDED_RUN);
    execFileSync(process.execPath, [script, fs.realpathSync(packed), out]);
    const {hooks, runLoads} = JSON.parse(fs.readFileSync(out, 'utf8'));
    const [own, recorder, ...more] = hooks;
    expect(more).toEqual([]);
    // The recorder registers after the own-module hook, so it sees each import
    // of an own module, which the own-module hook then answers by path.
    const seen = ownResolves(recorder.resolves);
    expect(seen.length).toBeGreaterThan(100);
    const answered = new Set(
      own.resolves
        .filter(([, , , shortCircuit]) => shortCircuit)
        .map(([specifier, parent]) => `${specifier} ${parent}`),
    );
    for (const [specifier, parent, url] of seen) {
      expect(answered.has(`${specifier} ${parent}`), specifier).toBe(true);
      expect(url).toBe(ownModuleUrl(specifier, parent ?? undefined, rootUrl()));
    }
    // Each module the run loads, the recorder sees load.
    expect(runLoads.length).toBeGreaterThan(100);
    expect(new Set(recorder.loads)).toEqual(new Set(runLoads));
  }, 120_000);
});
