// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Stable `theme build` of a minimal plain-object theme: a name alone, or
 * a name and component styles with no `tokens`, builds as an empty theme
 * over the base instead of crashing.
 */

import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import {logger} from '../../logger.mjs';
import {themeBuild} from './build.mjs';
import {ensureCoreBuilt} from '../../../clients/cli/commands/ensure-core-built.mjs';

vi.setConfig({testTimeout: 120_000});

const CLI_ROOT = path.resolve(import.meta.dirname, '../../..');
const require = createRequire(import.meta.url);
const FIXTURE_LINKS = {
  '@astryxdesign': path.join(CLI_ROOT, 'node_modules/@astryxdesign'),
  react: path.dirname(require.resolve('react/package.json')),
};

/** @type {string} */
let dir;
beforeAll(() => ensureCoreBuilt(), 200_000);
beforeEach(() => {
  dir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-build-empty-')),
  );
  fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}\n');
  for (const [name, target] of Object.entries(FIXTURE_LINKS)) {
    const link = path.join(dir, 'node_modules', name);
    fs.mkdirSync(path.dirname(link), {recursive: true});
    fs.symlinkSync(target, link, 'dir');
  }
});
afterEach(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

/** @param {string} rel @param {string} text */
const write = (rel, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), {recursive: true});
  fs.writeFileSync(path.join(dir, rel), text);
};
/** @param {string} rel */
const exists = rel => fs.existsSync(path.join(dir, rel));

const THEME = `export default {name: 'p', tokens: {'--color-accent': '#123456'}};\n`;

/** @param {() => Promise<unknown>} run */
async function captured(run) {
  /** @type {string[]} */
  const lines = [];
  const silent = logger.silent;
  const {warn, log, error} = logger;
  logger.setSilent(false);
  logger.warn = (/** @type {string} */ l) => lines.push(l);
  logger.log = (/** @type {string} */ l) => lines.push(l);
  logger.error = (/** @type {string} */ l) => lines.push(l);
  try {
    let result;
    let err;
    try {
      result = await run();
    } catch (e) {
      err = e;
    }
    return {
      result: /** @type {any} */ (result),
      err: /** @type {any} */ (err),
      lines,
    };
  } finally {
    Object.assign(logger, {warn, log, error});
    logger.setSilent(silent);
  }
}

describe('a plain-object theme with no tokens', () => {
  it('a name alone builds as an empty theme over the base', async () => {
    write('p/p.ts', `export default {name: 'p'};\n`);
    const r = await captured(() => themeBuild('p/p.ts', {}, {cwd: dir}));
    expect(r.err).toBeUndefined();
    expect(r.result.data.tokenCount).toBe(0);
    expect(fs.readFileSync(path.join(dir, 'p/p.css'), 'utf8')).toContain(
      '[data-astryx-theme="p"]',
    );
  });

  it('a name and component styles builds those styles', async () => {
    write(
      'p/r.ts',
      `export default {name: 'r', components: {button: {base: {color: 'red'}}}};\n`,
    );
    const r = await captured(() => themeBuild('p/r.ts', {}, {cwd: dir}));
    expect(r.err).toBeUndefined();
    expect(r.result.data.componentCount).toBeGreaterThan(0);
    expect(fs.readFileSync(path.join(dir, 'p/r.css'), 'utf8')).toContain('red');
  });
});
