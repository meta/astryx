// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The stable build names a misspelled field at the line that writes it
 * wherever the source writes the theme object: in a member of a const, an
 * element of an array, a branch of a ternary, an object `Object.assign`
 * merges, and the argument of a `defineTheme()` call over any of these;
 * and plain bases that extend each other in a cycle are refused naming it.
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
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-build-fields-')),
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

const I = "import {defineTheme} from '@astryxdesign/core/theme';\n";

describe('a misspelled field in an object the theme reaches through an expression', () => {
  it('is named at the line that writes it', async () => {
    for (const [code, line] of [
      [
        `${I}const all = {a: {name: 'p',\n  tokenz: {'--color-accent': 'red'}}};\nexport default defineTheme(all.a);\n`,
        3,
      ],
      [
        `const list = [{name: 'p',\n  tokenz: {'--color-accent': 'red'}}];\nexport default list[0];\n`,
        2,
      ],
      [
        `const dark = false;\nexport default dark ? {name: 'p', tokens: {}} : {name: 'p',\n  tokenz: {'--color-accent': 'red'}};\n`,
        3,
      ],
      [
        `export default Object.assign({name: 'p'}, {\n  tokenz: {'--color-accent': 'red'}});\n`,
        2,
      ],
    ]) {
      write('p/p.ts', code);
      const r = await captured(() => themeBuild('p/p.ts', {}, {cwd: dir}));
      expect(r.err, code).toBeUndefined();
      expect(r.result.data.warnings.join('\n'), code).toContain(
        `tokenz (line ${line}): tokenz is no field defineTheme takes`,
      );
    }
  });
});

describe('plain themes whose bases extend each other in a cycle', () => {
  it('are refused naming the cycle, with tokens or without, never a stack overflow or a silent merge', async () => {
    for (const tokens of ['', ", tokens: {'--color-accent': 'red'}"]) {
      write(
        'p/p.ts',
        `const a = {name: 'a'${tokens}};\nconst b = {name: 'b', extends: a${tokens}};\na.extends = b;\nexport default {name: 'p', extends: a${tokens}};\n`,
      );
      const r = await captured(() => themeBuild('p/p.ts', {}, {cwd: dir}));
      expect(r.err?.message, tokens).not.toContain('Maximum call stack');
      expect(r.err?.code, tokens).toBe('ERR_THEME_INVALID');
      expect(r.err.message, tokens).toContain(
        'The themes extend each other in a cycle ("p" extends "a" extends "b" extends "a")',
      );
      expect(fs.existsSync(path.join(dir, 'p/p.css')), tokens).toBe(false);
    }
  });
});
