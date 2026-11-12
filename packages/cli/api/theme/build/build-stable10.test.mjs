// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Stable batch 10 for theme build: a replace warning only for a build
 * that writes, a backslash in --out separates folders, the --check rebuild
 * line runs as printed, an editor theme built plainly is named, and a theme
 * file that is a link is refused with the real path.
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {logger} from '../../logger.mjs';
import {themeBuild} from './build.mjs';

vi.setConfig({testTimeout: 30000});

/** @type {string} */
let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-build-s10-'));
  fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"app"}');
});
afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/**
 * Run `run` with logger lines captured.
 * @param {() => Promise<unknown>} run
 */
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
    return {result, err: /** @type {any} */ (err), lines};
  } finally {
    Object.assign(logger, {warn, log, error});
    logger.setSilent(silent);
  }
}

const theme = (/** @type {string} */ name) =>
  `export default { name: '${name}', tokens: { '--color-bg': '#0a0a0a' } };\n`;

describe('N2: a replace warning only when the build writes', () => {
  it('says nothing about replacing when a later output refuses', async () => {
    fs.writeFileSync(path.join(tmpDir, 'reef.mjs'), theme('reef'));
    fs.writeFileSync(path.join(tmpDir, 'ocean.mjs'), theme('ocean'));
    await captured(() =>
      themeBuild('reef.mjs', {out: 'out/a.css'}, {cwd: tmpDir}),
    );
    // A file of the person's own where ocean's module goes.
    fs.writeFileSync(
      path.join(tmpDir, 'out/ocean.js'),
      'export const x = 1;\n',
    );
    const {err, lines} = await captured(() =>
      themeBuild('ocean.mjs', {out: 'out/a.css'}, {cwd: tmpDir}),
    );
    expect(err?.code).toBe('ERR_FILE_EXISTS');
    expect(lines.join('\n')).not.toMatch(/replaces it/);
  });
});

describe('N9: a backslash in --out separates folders', () => {
  it('writes into the folder, never a file named with a backslash', async () => {
    fs.writeFileSync(path.join(tmpDir, 'a.mjs'), theme('a'));
    await captured(() => themeBuild('a.mjs', {out: 'o\\x.css'}, {cwd: tmpDir}));
    expect(fs.existsSync(path.join(tmpDir, 'o', 'x.css'))).toBe(true);
    expect(fs.readdirSync(tmpDir).some(n => n.includes('\\'))).toBe(false);
  });
});

describe('N3: the --check rebuild line', () => {
  it('quotes a path with a space and uses the project invocation', async () => {
    fs.mkdirSync(path.join(tmpDir, 'my themes'));
    fs.writeFileSync(path.join(tmpDir, 'my themes', 'b.mjs'), theme('b'));
    const {lines} = await captured(() =>
      themeBuild('my themes/b.mjs', {check: true}, {cwd: tmpDir}),
    );
    const line = lines.join('\n').match(/Rebuild with: (.*)/)?.[1] ?? '';
    expect(line).toContain("'my themes/b.mjs'");
    expect(line).not.toMatch(/^astryx /);
  });
});

describe('F7-N4: a theme the editor made, built plainly', () => {
  it('builds, as released, and names the editor command', async () => {
    const dir = path.join(tmpDir, 'themes', 'g');
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, 'g.settings.json'), '{"settings":[]}');
    fs.writeFileSync(path.join(dir, 'g.theme.ts'), theme('g'));
    const {err, lines} = await captured(() =>
      themeBuild('themes/g/g.theme.ts', {}, {cwd: tmpDir}),
    );
    expect(err).toBeUndefined();
    expect(lines.join('\n')).toMatch(
      /is a theme the theme editor made .*experimental theme editor show g/,
    );
  });
});

describe('a theme file that is a link', () => {
  /**
   * A link at the app root to real/l.mjs, which imports `spec`.
   * @param {string} spec
   */
  const linked = spec => {
    const real = path.join(tmpDir, 'real');
    fs.mkdirSync(real, {recursive: true});
    fs.writeFileSync(
      path.join(real, 'l.mjs'),
      `import {c} from '${spec}';\nexport default { name: 'l', tokens: { '--color-bg': c } };\n`,
    );
    fs.symlinkSync(path.join(real, 'l.mjs'), path.join(tmpDir, 'l.mjs'));
    return real;
  };

  it('that does not load is refused with the real path, never a require stack', async () => {
    // The import exists beside neither the link nor the file it points to,
    // so it fails under any loader.
    linked('./nowhere.mjs');
    const {err} = await captured(() => themeBuild('l.mjs', {}, {cwd: tmpDir}));
    expect(err?.code).toBe('ERR_THEME_LOAD');
    expect(err.message).toContain('l.mjs is a link to real/l.mjs');
    expect(err.message).not.toContain('Require stack');
    expect(err.suggestions[0].name).toMatch(/ theme build real\/l\.mjs$/);
  });

  it('whose import resolves from either folder builds', async () => {
    const real = linked('./tokens.mjs');
    for (const dir of [tmpDir, real])
      fs.writeFileSync(
        path.join(dir, 'tokens.mjs'),
        "export const c = '#000';\n",
      );
    const {err} = await captured(() => themeBuild('l.mjs', {}, {cwd: tmpDir}));
    expect(err).toBeUndefined();
  });
});

describe('a link that fails for another reason', () => {
  it('keeps the normal remedy for a package that is not installed', async () => {
    const real = path.join(tmpDir, 'real');
    fs.mkdirSync(real);
    fs.writeFileSync(
      path.join(real, 'p.mjs'),
      "import x from 'not-installed-pkg-zz';\nexport default { name: 'p', tokens: { '--color-bg': x } };\n",
    );
    fs.symlinkSync(path.join(real, 'p.mjs'), path.join(tmpDir, 'p.mjs'));
    const {err} = await captured(() => themeBuild('p.mjs', {}, {cwd: tmpDir}));
    expect(err?.code).toBe('ERR_THEME_LOAD');
    expect(err.message).not.toContain('is a link to');
    expect(err.message).toContain('not-installed-pkg-zz');
  });

  it('suggests a build that keeps outputs inside the working folder', async () => {
    const app = path.join(tmpDir, 'app');
    const real = path.join(tmpDir, 'real');
    fs.mkdirSync(app);
    fs.mkdirSync(real);
    fs.writeFileSync(path.join(app, 'package.json'), '{"name":"app"}');
    fs.writeFileSync(
      path.join(real, 'l.mjs'),
      "import {c} from './nowhere.mjs';\nexport default { name: 'l', tokens: { '--color-bg': c } };\n",
    );
    fs.symlinkSync(path.join(real, 'l.mjs'), path.join(app, 'l.mjs'));
    const {err} = await captured(() => themeBuild('l.mjs', {}, {cwd: app}));
    expect(err?.code).toBe('ERR_THEME_LOAD');
    expect(err.suggestions[0].name).toMatch(
      / theme build \.\.\/real\/l\.mjs --out l\.css$/,
    );
  });
});
