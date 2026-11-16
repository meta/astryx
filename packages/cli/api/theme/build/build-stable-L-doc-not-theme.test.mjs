// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Stable `theme build` of a module that is a doc, not a theme: a
 * `*.doc.*` file, or a default export shaped as a doc, is refused naming it
 * as a doc and nothing is written; a minimal theme and a theme with a
 * misspelled field still build.
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
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-build-doc-')),
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

const DOC = `/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\nexport default {type: 'theme', name: 'ocean', displayName: 'Ocean', description: 'Ocean theme.', maintained: true};\n`;

describe('a doc module built as a theme', () => {
  it('a *.doc.mjs file is refused as a doc, naming the theme source beside it, and nothing is written', async () => {
    write(
      't/oceanTheme.ts',
      `export default {name: 'ocean', tokens: {'--color-accent': '#0066cc'}};\n`,
    );
    write('t/oceanTheme.doc.mjs', DOC);
    const r = await captured(() =>
      themeBuild('t/oceanTheme.doc.mjs', {}, {cwd: dir}),
    );
    expect(r.err?.code).toBe('ERR_THEME_LOAD');
    expect(r.err.message).toContain('oceanTheme.doc.mjs is a doc module');
    expect(r.err.message).toContain(
      'Build the theme source itself, oceanTheme.ts.',
    );
    expect(r.err.suggestions?.[0]?.name).toContain(
      'theme build t/oceanTheme.ts',
    );
    expect(fs.readdirSync(path.join(dir, 't')).sort()).toEqual([
      'oceanTheme.doc.mjs',
      'oceanTheme.ts',
    ]);
  });

  it('a module whose default export is a doc is refused as a doc', async () => {
    write('t/notes.mjs', DOC);
    const r = await captured(() => themeBuild('t/notes.mjs', {}, {cwd: dir}));
    expect(r.err?.code).toBe('ERR_THEME_LOAD');
    expect(r.err.message).toContain('its default export is a doc');
    expect(fs.readdirSync(path.join(dir, 't'))).toEqual(['notes.mjs']);
  });

  it('a minimal theme and a theme with a misspelled field still build', async () => {
    write('t/p.ts', `export default {name: 'p'};\n`);
    const minimal = await captured(() => themeBuild('t/p.ts', {}, {cwd: dir}));
    expect(minimal.err).toBeUndefined();
    write(
      't/q.ts',
      `export default {name: 'q', tokenz: {'--color-accent': 'red'}};\n`,
    );
    const typo = await captured(() => themeBuild('t/q.ts', {}, {cwd: dir}));
    expect(typo.err).toBeUndefined();
    expect(typo.result.data.warnings.join('\n')).toContain('tokenz');
  });
});
