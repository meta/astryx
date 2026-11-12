// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Data safety and value checks of `astryx experimental theme editor`,
 * from the chaos runs and the per-command hunts: a refused change puts the
 * theme back exactly and never removes a folder it did not make; every
 * accepted name builds; links are never written through; concurrent
 * commands on one theme run one after the other; settings edited by hand
 * are checked on load; token values are checked by their type.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditNew,
  themeEditSet,
  themeEditShow,
  themeEditUndo,
} from './theme-edit.mjs';
import {projectRoot} from './_adapter.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
import {withRealRenders} from '../../test-utils/theme-render-stub.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {projectFiles, refusal} from '../../test-utils/theme-edit-fixture.mjs';

// The page renders cost seconds and these tests read settings, builds and
// files: a stand-in renders unless a test asks for the real thing.
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

/** @type {string} */
let cwd;
const {read, exists} = projectFiles(() => cwd);

/** @param {string[]} args */
const cli = async args => {
  const r = await runCli(
    ['--json', 'experimental', 'theme', 'editor', ...args],
    {cwd},
  );
  return {status: r.status, body: JSON.parse(r.stdout || '{}')};
};

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('h', {cwd, like: 'neutral'});
}, 120_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('a refused change writes nothing', () => {
  it('a failed build puts every file back and keeps the folder', async () => {
    await themeEditNew('kd', {cwd, settings: {accent: '#7c3aed'}});
    await themeEditSet('kd', 'corners', 'pill', {cwd});
    fs.appendFileSync(path.join(cwd, 'themes/kd/kd.theme.ts'), 'oops(\n');
    fs.writeFileSync(path.join(cwd, 'themes/kd/kd.settings.json'), '');
    const before = fs.readdirSync(path.join(cwd, 'themes/kd')).sort();
    const r = await refusal(() => themeEditUndo('kd', {cwd}));
    expect(r.code).toBe('ERR_THEME_INVALID');
    expect(r.message).not.toContain(cwd);
    expect(r.message).toContain('is your own file');
    expect(fs.readdirSync(path.join(cwd, 'themes/kd')).sort()).toEqual(before);
    expect(read('themes/kd/kd.settings.json')).toBe('');
    fs.rmSync(path.join(cwd, 'themes/kd'), {recursive: true, force: true});
  }, 240_000);

  it('a refused new removes only what it made, never a link it found', async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-out-'));
    fs.symlinkSync(outside, path.join(cwd, 'themes/sym'), 'dir');
    try {
      const r = await refusal(() => themeEditNew('sym', {cwd}));
      expect(r.code).toBe('ERR_FILE_EXISTS');
      expect(fs.lstatSync(path.join(cwd, 'themes/sym')).isSymbolicLink()).toBe(
        true,
      );
      expect(fs.readdirSync(outside)).toEqual([]);
    } finally {
      fs.rmSync(path.join(cwd, 'themes/sym'), {force: true});
      fs.rmSync(outside, {recursive: true, force: true});
    }
  });
});

describe('names', () => {
  it('every name the check accepts builds, and the suggested name does too', async () => {
    for (const name of ['b-2', 'x--y', 'brand-']) {
      await themeEditNew(name, {cwd});
      expect(exists(`themes/${name}/${name}.js`), name).toBe(true);
      fs.rmSync(path.join(cwd, 'themes', name), {recursive: true, force: true});
    }
    // A folder of only system files counts as empty.
    fs.mkdirSync(path.join(cwd, 'themes/zz'));
    fs.writeFileSync(path.join(cwd, 'themes/zz/.DS_Store'), '');
    await themeEditNew('zz', {cwd});
    expect(exists('themes/zz/zz.js')).toBe(true);
    fs.rmSync(path.join(cwd, 'themes/zz'), {recursive: true, force: true});
  }, 240_000);

  it('refuses a long name and a file in the way with a code, and fixes a bad name', async () => {
    expect(
      (await refusal(() => themeEditNew('a'.repeat(300), {cwd}))).code,
    ).toBe('ERR_INVALID_ARGUMENT');
    fs.writeFileSync(path.join(cwd, 'themes/ff'), '');
    expect((await refusal(() => themeEditNew('ff', {cwd}))).code).toBe(
      'ERR_FILE_EXISTS',
    );
    fs.rmSync(path.join(cwd, 'themes/ff'));
    expect(
      (await refusal(() => themeEditNew('My Theme', {cwd}))).run[0],
    ).toMatch(/new my-theme$/);
    expect((await refusal(() => themeEditNew('q', {cwd, like: ''}))).code).toBe(
      'ERR_THEME_BAD_VALUE',
    );
  });
});

describe('new takes its flags as set does', () => {
  it('refuses a stray word, a flag given two values, and keeps both headings axes', async () => {
    const extra = await cli(['new', 'x1', 'neutral']);
    expect(extra.body.code).toBe('ERR_INVALID_ARGUMENT');
    expect(extra.body.suggestions[0].name).toMatch(/new x1 --like neutral$/);
    const twice = await cli([
      'new',
      'q4',
      '--corners',
      'pill',
      '--corners',
      'square',
    ]);
    expect(twice.body.code).toBe('ERR_INVALID_ARGUMENT');
    expect(exists('themes/q4')).toBe(false);
    const both = await cli([
      'new',
      'hd2',
      '--headings',
      'heavy',
      '--headings',
      'tight',
    ]);
    expect(both.status).toBe(0);
    expect(
      JSON.parse(read('themes/hd2/hd2.settings.json')).settings.map(
        (/** @type {any} */ s) => s.value,
      ),
    ).toEqual(['heavy', 'tight']);
    fs.rmSync(path.join(cwd, 'themes/hd2'), {recursive: true, force: true});
  }, 240_000);

  it('suggests new, not set, when a flag is refused', async () => {
    const r = await refusal(() =>
      themeEditNew('v1', {cwd, settings: {vibrancy: '60'}}),
    );
    expect(r.code).toBe('ERR_THEME_NO_EFFECT');
    expect(r.run[0]).toMatch(/new v1 --vibrancy 60 --accent '#7c3aed'$/);
  });

  it('refuses a font or text size that would not build', async () => {
    for (const font of ['x"; color: red; "', '   ', '</style><script>']) {
      const r = await refusal(() =>
        themeEditNew('f1', {cwd, settings: {font}}),
      );
      expect(['ERR_THEME_BAD_VALUE', 'ERR_MISSING_ARGUMENT'], font).toContain(
        r.code,
      );
    }
    for (const size of ['0', '-1', ' ', '0x10', '1e3'])
      expect(
        (
          await refusal(() =>
            themeEditNew('t0', {cwd, settings: {'text-size': size}}),
          )
        ).code,
        size,
      ).toMatch(/ERR_THEME_BAD_VALUE|ERR_MISSING_ARGUMENT/);
  });
});

describe('two commands at once', () => {
  it('on one theme, both changes land', async () => {
    await themeEditNew('cc', {cwd});
    await Promise.all([
      themeEditSet('cc', 'corners', 'pill', {cwd}),
      themeEditSet('cc', 'spacing', 'roomy', {cwd}),
    ]);
    const things = JSON.parse(read('themes/cc/cc.settings.json')).settings.map(
      (/** @type {any} */ s) => s.thing,
    );
    expect(things.sort()).toEqual(['corners', 'spacing']);
    fs.rmSync(path.join(cwd, 'themes/cc'), {recursive: true, force: true});
  }, 240_000);
});

describe('settings edited by hand', () => {
  it('a bad value or shape is refused on load, naming the key and undo', async () => {
    await themeEditNew('bv', {cwd});
    await themeEditSet('bv', 'text-size', 'large', {cwd});
    const file = path.join(cwd, 'themes/bv/bv.settings.json');
    const good = fs.readFileSync(file, 'utf8');
    // A value names the setting to remove; a broken shape, the step back.
    for (const [bad, fix] of /** @type {const} */ ([
      [good.replace('"large"', '"huge"'), /undo bv text-size$/],
      [JSON.stringify({name: 'bv', mode: 'both', settings: 5}), /undo bv$/],
    ])) {
      fs.writeFileSync(file, bad);
      const r = await refusal(() =>
        themeEditSet('bv', 'corners', 'small', {cwd}),
      );
      expect(r.code).toBe('ERR_THEME_INVALID');
      expect(r.run[0]).toMatch(fix);
      expect(fs.readFileSync(file, 'utf8')).toBe(bad);
    }
    fs.rmSync(path.join(cwd, 'themes/bv'), {recursive: true, force: true});
  }, 240_000);
});

describe('exact tokens', () => {
  it('checks every type, and refuses what would break a mode or the CSS', async () => {
    for (const [token, value] of [
      ['--duration-fast', 'red'],
      ['--ease-standard', '10px'],
      ['--shadow-low', 'banana'],
      ['--text-heading-1-weight', 'banana'],
      ['--font-weight-bold', '1200'],
      ['--color-background-body', 'initial'],
      ['--color-background-body', 'rgb(banana)'],
      ['--color-background-body', 'var(--spacing-4)'],
      ['--radius-element', '-8px'],
      ['--font-family-body', 'Inter; } body { display: none } x {'],
      ['--spacing-4', 'calc(var(--spacing-4) * 2)'],
      ['--color-accent', '<color>'],
    ])
      expect(
        (await refusal(() => themeEditSet('h', token, value, {cwd}))).code,
        `${token} ${value}`,
      ).toBe('ERR_THEME_BAD_VALUE');
    expect(
      (
        await refusal(() =>
          themeEditSet('h', '--shadow-low', '0 0 0 red', {cwd, mode: 'light'}),
        )
      ).code,
    ).toBe('ERR_THEME_NO_MODE');
    for (const [token, value] of [
      ['--radius-element', '2ch'],
      ['--radius-element', 'clamp(4px, 1vw, 12px)'],
      ['--text-body-leading', 'normal'],
      ['--color-syntax-keyword', 'red'],
      ['--text-display-1-size', '80px'],
      ['--color-icon-pink', 'red'],
    ]) {
      await themeEditSet('h', token, value, {cwd});
      await themeEditUndo('h', {cwd, thing: token});
    }
  }, 300_000);

  it('suggests a list command that works for an unknown token', async () => {
    const r = await refusal(() =>
      themeEditSet('h', '--color-accnt', 'red', {cwd}),
    );
    expect(r.run[0]).toMatch(/how --list tokens accnt$/);
  });

  it('accepts Core own shadows and a negative offset, and undo removes a shadow saved for one mode', async () => {
    const shadow =
      '0px 1px 1px light-dark(rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.2)), 0px 2px 8px light-dark(rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.2))';
    await themeEditSet('h', '--shadow-low', shadow, {cwd});
    await themeEditUndo('h', {cwd, thing: '--shadow-low'});
    await themeEditSet('h', '--focus-outline-offset', '-2px', {cwd});
    await themeEditUndo('h', {cwd, thing: '--focus-outline-offset'});
    const file = path.join(cwd, 'themes/h/h.settings.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    data.settings.push({
      thing: '--shadow-low',
      value: '0 0 0 red',
      source: 'token',
      mode: 'light',
    });
    fs.writeFileSync(file, JSON.stringify(data));
    await themeEditUndo('h', {cwd, thing: '--shadow-low', mode: 'light'});
    expect(
      JSON.parse(fs.readFileSync(file, 'utf8')).settings.some(
        (/** @type {any} */ s) => s.thing === '--shadow-low',
      ),
    ).toBe(false);
  }, 240_000);

  it('takes over a lock left by a command that stopped', async () => {
    const dir = path.join(
      path.dirname(cwd),
      'node_modules/.cache/astryx-theme/locks',
    );
    const {createHash} = await import('node:crypto');
    // The lock is named for the project as seen from the lock folder.
    fs.mkdirSync(dir, {recursive: true});
    const key = createHash('sha256')
      .update(
        path
          .relative(fs.realpathSync(dir), fs.realpathSync(cwd))
          .split(path.sep)
          .join('/'),
      )
      .digest('hex')
      .slice(0, 16);
    fs.mkdirSync(path.join(dir, `${key}-theme-h.lock`), {recursive: true});
    fs.writeFileSync(
      path.join(dir, `${key}-theme-h.lock`, 'owner.json'),
      JSON.stringify({pid: 2 ** 22 + 7, host: os.hostname(), at: Date.now()}),
    );
    const started = Date.now();
    await themeEditShow('h', {cwd});
    expect(Date.now() - started).toBeLessThan(25_000);
    expect(fs.existsSync(path.join(dir, `${key}-theme-h.lock`))).toBe(false);
  }, 120_000);

  it('an exact font family reaches phones too, and sizes do not', async () => {
    await themeEditSet('h', '--font-family-body', 'Georgia, serif', {cwd});
    const css = read('themes/h/h.css');
    const phone = css.slice(css.lastIndexOf('(pointer: coarse)'));
    expect(phone).toContain('--font-family-body: Georgia, serif');
    await themeEditUndo('h', {cwd, thing: '--font-family-body'});
    await themeEditSet('h', '--font-size-base', '1.25rem', {cwd});
    expect(read('themes/h/h.settings.ts')).not.toMatch(
      /adaptations[\s\S]*--font-size-base/,
    );
    await themeEditUndo('h', {cwd, thing: '--font-size-base'});
  }, 120_000);

  it('undo names the dial still writing the token', async () => {
    await themeEditSet('h', 'accent', '#7c3aed', {cwd});
    await themeEditSet('h', '--color-accent', '#ff0000', {cwd});
    const r = await themeEditUndo('h', {cwd, thing: '--color-accent'});
    expect(r.data.now).toContain('the generated accent color');
    await themeEditUndo('h', {cwd, thing: 'accent'});
  }, 240_000);
});

describe('type dials', () => {
  it('a text size keeps the base theme heading weights', async () => {
    const r = await themeEditSet('h', 'text-size', 'large', {cwd});
    expect(r.data.changedTokens.filter(x => /weight/.test(x))).toEqual([]);
    // The weights are written with the new scale, so Core never falls back
    // to its own.
    expect(read('themes/h/h.settings.ts')).toMatch(
      /"--text-heading-3-weight":/,
    );
    await themeEditUndo('h', {cwd, thing: 'text-size'});
  }, 120_000);
});

describe('where commands act', () => {
  it('from a subfolder of an app that declares Core, on the app', () => {
    const app = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-root-'));
    try {
      fs.writeFileSync(
        path.join(app, 'package.json'),
        JSON.stringify({dependencies: {'@astryxdesign/core': '*'}}),
      );
      fs.mkdirSync(path.join(app, 'src/app'), {recursive: true});
      expect(projectRoot(path.join(app, 'src/app'))).toBe(app);
      // A folder with no Core above it stays where it is.
      expect(projectRoot(cwd)).toBe(cwd);
    } finally {
      fs.rmSync(app, {recursive: true, force: true});
    }
  });

  it('never walks past the nearest package into another project', () => {
    const mono = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-mono-'));
    /** @param {string} rel @param {object} json */
    const pkg = (rel, json) => {
      fs.mkdirSync(path.join(mono, rel), {recursive: true});
      fs.writeFileSync(
        path.join(mono, rel, 'package.json'),
        JSON.stringify(json),
      );
    };
    try {
      pkg('.', {devDependencies: {'@astryxdesign/core': '*'}});
      pkg('packages/lib', {peerDependencies: {'@astryxdesign/core': '*'}});
      pkg('packages/tool', {name: 'tool'});
      fs.mkdirSync(path.join(mono, 'packages/lib/src'), {recursive: true});
      // Core only as a peer: the package itself.
      expect(projectRoot(path.join(mono, 'packages/lib/src'))).toBe(
        path.join(mono, 'packages/lib'),
      );
      // A package without Core inside an app with it: refused, naming it.
      let err;
      try {
        projectRoot(path.join(mono, 'packages/tool'));
      } catch (e) {
        err = /** @type {any} */ (e);
      }
      expect(err?.code).toBe('ERR_PROJECT_REQUIRED');
      expect(err?.suggestions?.[0]?.name).toBe('cd ../..');
      // A package.json that does not parse is never walked past.
      fs.writeFileSync(path.join(mono, 'packages/tool/package.json'), '{,}');
      err = undefined;
      try {
        projectRoot(path.join(mono, 'packages/tool'));
      } catch (e) {
        err = /** @type {any} */ (e);
      }
      expect(err?.message).toContain('not valid JSON');
    } finally {
      fs.rmSync(mono, {recursive: true, force: true});
    }
  });

  it('reading a built theme leaves no copy in the theme folder', async () => {
    await themeEditShow('h', {cwd});
    expect(
      fs
        .readdirSync(path.join(cwd, 'themes/h'))
        .filter(f => /\.load[-.]/.test(f)),
    ).toEqual([]);
  }, 120_000);
});

describe('rollback and recovery', () => {
  it('refuses a theme folder that is a link, and writes nothing through it', async () => {
    await themeEditNew('l1', {cwd});
    const away = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-away-'));
    fs.renameSync(path.join(cwd, 'themes/l1'), path.join(away, 'l1'));
    fs.symlinkSync(path.join(away, 'l1'), path.join(cwd, 'themes/l1'));
    const before = fs.readFileSync(
      path.join(away, 'l1/l1.settings.ts'),
      'utf8',
    );
    expect(
      (await refusal(() => themeEditSet('l1', 'corners', 'pill', {cwd}))).code,
    ).toBe('ERR_THEME_INVALID');
    expect(fs.readFileSync(path.join(away, 'l1/l1.settings.ts'), 'utf8')).toBe(
      before,
    );
    fs.rmSync(path.join(cwd, 'themes/l1'));
    fs.rmSync(away, {recursive: true, force: true});
  }, 120_000);

  it('a failed history write undoes the whole change', async () => {
    await themeEditNew('w1', {cwd});
    await themeEditSet('w1', 'corners', 'small', {cwd});
    const css = read('themes/w1/w1.css');
    const settings = read('themes/w1/w1.settings.json');
    fs.rmSync(path.join(cwd, 'themes/w1/w1.history.json'));
    fs.mkdirSync(path.join(cwd, 'themes/w1/w1.history.json'));
    expect(
      (await refusal(() => themeEditSet('w1', 'corners', 'pill', {cwd}))).code,
    ).toBe('ERR_WRITE_FAILED');
    expect(read('themes/w1/w1.css')).toBe(css);
    expect(read('themes/w1/w1.settings.json')).toBe(settings);
    fs.rmSync(path.join(cwd, 'themes/w1'), {recursive: true, force: true});
  }, 240_000);

  it('a refused build leaves files it does not own alone, even read-only ones', async () => {
    await themeEditNew('w2', {cwd});
    const dir = path.join(cwd, 'themes/w2');
    fs.writeFileSync(path.join(dir, 'NOTES.md'), 'mine');
    fs.chmodSync(path.join(dir, 'NOTES.md'), 0o444);
    const ts = path.join(dir, 'w2.theme.ts');
    fs.appendFileSync(ts, '\nexport const broken = ;\n');
    const own = fs.readFileSync(ts, 'utf8');
    const settingsTs = read('themes/w2/w2.settings.ts');
    expect(
      (await refusal(() => themeEditSet('w2', 'corners', 'pill', {cwd}))).code,
    ).toBe('ERR_THEME_INVALID');
    expect(read('themes/w2/w2.settings.ts')).toBe(settingsTs);
    expect(fs.readFileSync(ts, 'utf8')).toBe(own);
    expect(read('themes/w2/NOTES.md')).toBe('mine');
    fs.chmodSync(path.join(dir, 'NOTES.md'), 0o644);
    fs.rmSync(dir, {recursive: true, force: true});
  }, 240_000);

  it('a value made under looser rules names the command that fixes it', async () => {
    await themeEditNew('v1', {cwd});
    const file = path.join(cwd, 'themes/v1/v1.settings.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    data.settings.push({thing: 'text-size', value: '0', source: 'dial'});
    fs.writeFileSync(file, JSON.stringify(data));
    const r = await refusal(() => themeEditShow('v1', {cwd}));
    expect(r.message).not.toContain('damaged');
    expect(r.run[0]).toMatch(/undo v1 text-size$/);
    await themeEditUndo('v1', {cwd, thing: 'text-size'});
    await themeEditShow('v1', {cwd});
    fs.rmSync(path.join(cwd, 'themes/v1'), {recursive: true, force: true});
  }, 240_000);

  it('keeps the good undo steps after a damaged one', async () => {
    await themeEditNew('v2', {cwd});
    await themeEditSet('v2', 'corners', 'small', {cwd});
    await themeEditSet('v2', 'corners', 'large', {cwd});
    const hist = path.join(cwd, 'themes/v2/v2.history.json');
    const steps = JSON.parse(fs.readFileSync(hist, 'utf8'));
    fs.writeFileSync(hist, `\uFEFF${JSON.stringify(['not json', ...steps])}`);
    const r = await themeEditSet('v2', 'spacing', 'roomy', {cwd});
    expect(r.data.notes.join(' ')).toContain('1 damaged step');
    expect(JSON.parse(fs.readFileSync(hist, 'utf8'))).toHaveLength(
      steps.length + 1,
    );
    fs.rmSync(path.join(cwd, 'themes/v2'), {recursive: true, force: true});
  }, 240_000);

  it('takes quoted text and data URLs with a semicolon, never a breakout', async () => {
    const {isSafeValue} = await import('./_color.mjs');
    expect(isSafeValue('"a;b"')).toBe(true);
    expect(isSafeValue('url(data:image/png;base64,iVBOR==)')).toBe(true);
    expect(isSafeValue('"a\\"; color: red"')).toBe(true);
    expect(isSafeValue('red; color: blue')).toBe(false);
    expect(isSafeValue('"a"; b')).toBe(false);
    expect(isSafeValue('"</style>"')).toBe(false);
  });
});

describe('fix3', () => {
  it('never picks the home folder, even with Core installed there', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-home-'));
    const saved = process.env.HOME;
    try {
      fs.writeFileSync(
        path.join(home, 'package.json'),
        JSON.stringify({dependencies: {'@astryxdesign/core': '*'}}),
      );
      fs.mkdirSync(path.join(home, 'node_modules/@astryxdesign/core'), {
        recursive: true,
      });
      const code = path.join(home, 'code/app');
      fs.mkdirSync(path.join(code, '.git'), {recursive: true});
      process.env.HOME = home;
      expect(projectRoot(code)).toBe(code);
      expect(projectRoot(path.join(home, 'code'))).toBe(
        path.join(home, 'code'),
      );
    } finally {
      process.env.HOME = saved;
      fs.rmSync(home, {recursive: true, force: true});
    }
  });

  it('a step holding a value from an older release is passed with that value left out', async () => {
    await themeEditNew('f1', {cwd});
    await themeEditSet('f1', 'corners', 'small', {cwd});
    await themeEditSet('f1', 'text-size', '16', {cwd});
    const hist = path.join(cwd, 'themes/f1/f1.history.json');
    const steps = JSON.parse(fs.readFileSync(hist, 'utf8'));
    const top = JSON.parse(steps.at(-1));
    top.settings.push({thing: 'spacing', value: 'huge', source: 'dial'});
    steps[steps.length - 1] = JSON.stringify(top);
    fs.writeFileSync(hist, JSON.stringify(steps));
    const r = await themeEditUndo('f1', {cwd});
    expect(JSON.stringify(r.data)).toContain('left out spacing');
    const now = JSON.parse(read('themes/f1/f1.settings.json')).settings;
    expect(now.map((/** @type {any} */ x) => x.thing)).toEqual(['corners']);
    fs.rmSync(path.join(cwd, 'themes/f1'), {recursive: true, force: true});
  }, 240_000);

  it('no command removes a file it did not write in that run', async () => {
    const dir = path.join(cwd, 'themes/h');
    // A live process's temp file (this test's parent runs); a dead
    // process's editor temp file is swept, and that is tested elsewhere.
    const mine = [
      'notes.4194311.tmp',
      `.h.settings.json.astryx-${process.ppid}-abc.tmp`,
    ];
    for (const f of mine) fs.writeFileSync(path.join(dir, f), 'mine');
    await themeEditShow('h', {cwd});
    await themeEditSet('h', 'corners', 'small', {cwd});
    await themeEditUndo('h', {cwd});
    for (const f of mine) {
      expect(fs.readFileSync(path.join(dir, f), 'utf8')).toBe('mine');
      fs.rmSync(path.join(dir, f));
    }
  }, 120_000);

  it('a text size keeps the theme own weight tokens feeding the headings', async () => {
    await themeEditNew('f2', {cwd});
    await themeEditSet('f2', '--font-weight-semibold', '700', {cwd});
    await themeEditSet('f2', 'text-size', 'large', {cwd});
    const {resolvedTokens} = await import('./_settings.mjs');
    const {context} = await import('./_context.mjs');
    const res = await resolvedTokens(await context(cwd), 'f2');
    const semibold = Object.keys(res.light).filter(
      k =>
        /^--text-heading-\d-weight$/.test(k) &&
        /semibold/.test(
          read('themes/f2/f2.settings.ts').split(k)[1]?.split('\n')[0] ?? '',
        ),
    );
    expect(semibold.length).toBeGreaterThan(0);
    for (const k of semibold) expect(res.light[k]).toBe('700');
    fs.rmSync(path.join(cwd, 'themes/f2'), {recursive: true, force: true});
  }, 240_000);
});

describe('fix3: links, rollback, locks, paths', () => {
  it('refuses a link inside the theme folder, and leaves it', async () => {
    await themeEditNew('k1', {cwd});
    const away = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-away-'));
    const tokens = path.join(cwd, 'themes/k1/tokens');
    fs.rmSync(tokens, {recursive: true, force: true});
    fs.symlinkSync(away, tokens);
    expect(
      (await refusal(() => themeEditSet('k1', 'accent', '#7c3aed', {cwd})))
        .code,
    ).toBe('ERR_THEME_INVALID');
    expect(fs.lstatSync(tokens).isSymbolicLink()).toBe(true);
    expect(fs.readdirSync(away)).toEqual([]);
    fs.rmSync(path.join(cwd, 'themes/k1'), {recursive: true, force: true});
    fs.rmSync(away, {recursive: true, force: true});
  }, 120_000);

  it('keeps a palette.config.json the editor did not write', async () => {
    await themeEditNew('k2', {cwd});
    const file = path.join(cwd, 'themes/k2/palette.config.json');
    fs.writeFileSync(file, '{"note": "mine"}\n');
    await themeEditSet('k2', 'spacing', 'roomy', {cwd});
    expect(fs.readFileSync(file, 'utf8')).toBe('{"note": "mine"}\n');
    fs.rmSync(path.join(cwd, 'themes/k2'), {recursive: true, force: true});
  }, 120_000);

  it('show finds a build that does not match the settings and builds again', async () => {
    await themeEditNew('k3', {cwd});
    const css = path.join(cwd, 'themes/k3/k3.css');
    const old = new Date(Date.now() - 60_000);
    fs.utimesSync(css, old, old);
    const r = await themeEditShow('k3', {cwd});
    expect(r.data.notes.join(' ')).toContain('built again');
    const again = await themeEditShow('k3', {cwd});
    expect(again.data.notes.join(' ')).not.toContain('built again');
    fs.rmSync(path.join(cwd, 'themes/k3'), {recursive: true, force: true});
  }, 120_000);

  it('a lock folder that cannot be written is refused, naming it; a read-only command runs without it', async () => {
    const dir = path.join(
      path.dirname(cwd),
      'node_modules/.cache/astryx-theme/locks',
    );
    fs.mkdirSync(dir, {recursive: true});
    fs.chmodSync(dir, 0o555);
    try {
      const r = await refusal(() =>
        themeEditSet('h', 'corners', 'pill', {cwd}),
      );
      expect(r.code).toBe('ERR_WRITE_FAILED');
      expect(r.message).toContain('astryx-theme');
      expect((await themeEditShow('h', {cwd})).data.theme).toBe('h');
    } finally {
      fs.chmodSync(dir, 0o755);
    }
  }, 120_000);

  it('from a subfolder, the reply paths are absolute', async () => {
    const sub = path.join(cwd, 'src/deep');
    fs.mkdirSync(sub, {recursive: true});
    fs.writeFileSync(
      path.join(cwd, 'package.json'),
      JSON.stringify({dependencies: {'@astryxdesign/core': '*'}}),
    );
    try {
      const r = await themeEditShow('h', {cwd: sub});
      expect(JSON.stringify(r.data)).toContain(path.join(cwd, 'themes/h'));
    } finally {
      fs.rmSync(path.join(cwd, 'package.json'));
      fs.rmSync(path.join(cwd, 'src'), {recursive: true, force: true});
    }
  }, 120_000);
});
describe('hunt2: order and scope', () => {
  it('an exact token wins over a later dial, and a changed setting goes last', async () => {
    await themeEditNew('o1', {cwd});
    await themeEditSet('o1', '--radius-element', '3px', {cwd});
    await themeEditSet('o1', 'corners', 'large', {cwd});
    expect(read('themes/o1/o1.css')).toMatch(/--radius-element: 3px/);
    await themeEditSet('o1', 'background-color', '#00ff00', {
      cwd,
      on: 'button',
    });
    const r = await themeEditSet('o1', 'background', '#ff0000', {
      cwd,
      on: 'button',
    });
    expect(r.data.notes.join(' ')).toContain('comes after background-color');
    await themeEditSet('o1', 'background-color', '#0000ff', {
      cwd,
      on: 'button',
    });
    const things = JSON.parse(read('themes/o1/o1.settings.json')).settings.map(
      (/** @type {any} */ s) => s.thing,
    );
    expect(things.at(-1)).toBe('background-color');
    fs.rmSync(path.join(cwd, 'themes/o1'), {recursive: true, force: true});
  }, 240_000);

  it('a setting for both modes replaces the one-mode ones; one mode on a part with variants is refused', async () => {
    await themeEditNew('o2', {cwd});
    await themeEditSet('o2', '--color-background-surface', '#ff0000', {
      cwd,
      mode: 'dark',
    });
    const r = await themeEditSet(
      'o2',
      '--color-background-surface',
      '#00ff00',
      {
        cwd,
      },
    );
    expect(r.data.notes.join(' ')).toContain('replaces');
    expect(
      JSON.parse(read('themes/o2/o2.settings.json')).settings,
    ).toHaveLength(1);
    expect(
      (
        await refusal(() =>
          themeEditSet('o2', 'background-color', '#00ff00', {
            cwd,
            on: 'button',
            mode: 'light',
          }),
        )
      ).code,
    ).toBe('ERR_THEME_NO_MODE');
    fs.rmSync(path.join(cwd, 'themes/o2'), {recursive: true, force: true});
  }, 240_000);

  it('checks --when shape and group variants', async () => {
    expect(
      (
        await refusal(() =>
          themeEditSet('h', 'font-size', '13px', {
            cwd,
            on: 'button',
            when: 'size:sm:x',
          }),
        )
      ).code,
    ).toBe('ERR_THEME_BAD_VALUE');
    expect(
      (
        await refusal(() =>
          themeEditSet('h', 'font-size', '13px', {
            cwd,
            on: 'inputs',
            when: 'nonsense:value',
          }),
        )
      ).code,
    ).toBe('ERR_THEME_UNKNOWN_VARIANT');
  });

  it('a step on a part starts from the whole-theme setting', async () => {
    await themeEditNew('o3', {cwd});
    await themeEditSet('o3', 'corners', 'large', {cwd});
    // The card reads the container radius: large on no base makes it 18px,
    // and the next rung that shows the card rounder is round (24px).
    const r = await themeEditSet('o3', 'corners', 'more', {cwd, on: 'card'});
    expect(r.data.setting.value).toBe('round');
    const pill = await themeEditSet('o3', 'corners', 'pill', {cwd});
    expect(pill.data.changedTokens.join(' ')).toContain('--radius-element');
    expect(read('themes/o3/o3.css')).toMatch(/--radius-inner: 6px/);
    fs.rmSync(path.join(cwd, 'themes/o3'), {recursive: true, force: true});
  }, 240_000);
});

describe('hunt2: undo', () => {
  it('names what it removes, refuses scope flags alone, and resets base', async () => {
    await themeEditNew('u1', {cwd, like: 'neutral'});
    await themeEditSet('u1', 'corners', 'large', {cwd});
    expect(
      (
        await refusal(() =>
          themeEditUndo('u1', {cwd, thing: 'corners', value: 'pill'}),
        )
      ).code,
    ).toBe('ERR_THEME_NOT_SET');
    expect(
      (await refusal(() => themeEditUndo('u1', {cwd, on: 'card'}))).code,
    ).toBe('ERR_MISSING_ARGUMENT');
    // base was never changed: it stays as the theme was made.
    expect(
      (await refusal(() => themeEditUndo('u1', {cwd, thing: 'base'}))).code,
    ).toBe('ERR_THEME_NOT_SET');
    fs.rmSync(path.join(cwd, 'themes/u1'), {recursive: true, force: true});
  }, 240_000);

  it('removes a stored setting this Core does not know', async () => {
    await themeEditNew('u2', {cwd});
    const file = path.join(cwd, 'themes/u2/u2.settings.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    data.settings.push({
      thing: 'color',
      value: 'red',
      source: 'property',
      on: 'gone-part',
    });
    fs.writeFileSync(file, JSON.stringify(data));
    await themeEditUndo('u2', {cwd, thing: 'color', on: 'gone-part'});
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).settings).toEqual([]);
    fs.rmSync(path.join(cwd, 'themes/u2'), {recursive: true, force: true});
  }, 240_000);
});

describe('hunt2: files', () => {
  it('show builds again when the settings were edited by hand', async () => {
    await themeEditNew('s1', {cwd});
    await themeEditSet('s1', 'corners', 'small', {cwd});
    const file = path.join(cwd, 'themes/s1/s1.settings.json');
    fs.writeFileSync(
      file,
      fs.readFileSync(file, 'utf8').replace('"small"', '"large"'),
    );
    await themeEditShow('s1', {cwd});
    expect(read('themes/s1/s1.css')).toMatch(/--radius-element: 12px/);
    fs.rmSync(path.join(cwd, 'themes/s1'), {recursive: true, force: true});
  }, 240_000);

  it('reads a settings file with a BOM, refuses a link or a duplicate', async () => {
    await themeEditNew('s2', {cwd});
    const file = path.join(cwd, 'themes/s2/s2.settings.json');
    const text = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, `\uFEFF${text}`);
    await themeEditShow('s2', {cwd});
    const data = JSON.parse(text);
    const one = {thing: 'corners', value: 'small', source: 'dial'};
    fs.writeFileSync(
      file,
      JSON.stringify({...data, settings: [one, {...one, value: 'large'}]}),
    );
    expect((await refusal(() => themeEditShow('s2', {cwd}))).message).toContain(
      'listed twice',
    );
    const elsewhere = path.join(cwd, 'elsewhere.json');
    fs.writeFileSync(elsewhere, text);
    fs.rmSync(file);
    fs.symlinkSync(elsewhere, file);
    expect((await refusal(() => themeEditShow('s2', {cwd}))).code).toBe(
      'ERR_THEME_INVALID',
    );
    fs.rmSync(path.join(cwd, 'themes/s2'), {recursive: true, force: true});
    fs.rmSync(elsewhere);
  }, 240_000);

  it('a section of the sheet goes to its own file', async () => {
    // The file names come from the real sheet render, not the stand-in.
    await withRealRenders(async () => {
      await themeEditShow('h', {cwd});
      const full = read('themes/h/sheet.html');
      await themeEditShow('h', {cwd, section: 'Inputs'});
      expect(exists('themes/h/sheet-inputs.html')).toBe(true);
      expect(read('themes/h/sheet.html')).toBe(full);
    });
  }, 240_000);
});

describe('hunt2: words', () => {
  it('says when a change shows nothing, and names a typed path or case', async () => {
    const r = await themeEditSet('h', 'spacing', 'medium', {cwd});
    expect(r.data.notes.join(' ')).toContain('changes nothing you see');
    await themeEditUndo('h', {cwd, thing: 'spacing'});
    expect(
      (await refusal(() => themeEditShow('themes/h', {cwd}))).run[0],
    ).toMatch(/show h$/);
  }, 120_000);

  it('refuses a misspelled token in var(), headings --mode and font --when', async () => {
    expect(
      (
        await refusal(() =>
          themeEditSet('h', '--color-text-primary', 'var(--color-accnt)', {
            cwd,
          }),
        )
      ).code,
    ).toBe('ERR_THEME_UNKNOWN_TOKEN');
    expect(
      (
        await refusal(() =>
          themeEditSet('h', 'headings', 'bold', {cwd, mode: 'dark'}),
        )
      ).code,
    ).toBe('ERR_THEME_NO_MODE');
    expect(
      (
        await refusal(() =>
          themeEditSet('h', 'font', 'inter', {cwd, on: 'body', state: 'hover'}),
        )
      ).code,
    ).toBe('ERR_INVALID_ARGUMENT');
  });

  it('the copied commands name the experimental group in their refusals', async () => {
    const r = await runCli(['--json', 'experimental', 'theme', 'use', 'nope'], {
      cwd,
    });
    const body = JSON.parse(r.stdout || '{}');
    expect(JSON.stringify(body)).not.toMatch(/(?<!experimental )theme add/);
  }, 120_000);
});

describe('hunt2: type and token rules', () => {
  it('every token Core reads takes its own default value', async () => {
    const {context} = await import('./_context.mjs');
    const {checkSetting} = await import('./_check.mjs');
    const ctx = await context(cwd);
    const data = JSON.parse(read('themes/h/h.settings.json'));
    const refused = [];
    for (const [token, value] of Object.entries(
      ctx.project.core.tokenDefaults,
    )) {
      if (token.startsWith('--_')) continue;
      try {
        checkSetting(ctx, 'h', data, token, String(value), {}, false);
      } catch (e) {
        refused.push(`${token}: ${/** @type {any} */ (e).message}`);
      }
    }
    expect(refused).toEqual([]);
  }, 120_000);

  it('a role font keeps its font whatever the order, and a scale keeps the base heading weights', async () => {
    await themeEditNew('t1', {cwd});
    await themeEditSet('t1', 'font', 'serif', {cwd, on: 'heading'});
    await themeEditSet('t1', 'font', 'mono', {cwd});
    const ts = read('themes/t1/t1.settings.ts');
    expect(ts).toMatch(/"heading": \{[^}]*Georgia/);
    await themeEditSet('t1', 'text-size', 'large', {cwd});
    // The heading role carries the base weights, so the phone rule keeps
    // them too.
    expect(read('themes/t1/t1.settings.ts')).toMatch(/"weights": \{/);
    fs.rmSync(path.join(cwd, 'themes/t1'), {recursive: true, force: true});
  }, 240_000);

  it('refuses easings, families, colors and shadows the browser drops, and takes ones it reads', async () => {
    for (const [token, value] of [
      ['--ease-standard', 'cubic-bezier(2, 0, 0, 1)'],
      ['--ease-standard', 'steps(0)'],
      ['--ease-standard', 'linear(banana)'],
      ['--font-family-body', '42'],
      ['--font-family-body', 'url(evil)'],
      ['--color-text-primary', 'light-dark(banana, red)'],
      ['--color-text-primary', 'color-mix(in oklch, banana, red)'],
      ['--shadow-low', '0 1px -2px red'],
      ['--shadow-low', 'inset inset 0 0 red'],
      ['--duration-fast', '99999s'],
    ])
      expect(
        (await refusal(() => themeEditSet('h', token, value, {cwd}))).code,
        `${token} ${value}`,
      ).toBe('ERR_THEME_BAD_VALUE');
    const {context} = await import('./_context.mjs');
    const {checkSetting} = await import('./_check.mjs');
    const ctx = await context(cwd);
    const data = JSON.parse(read('themes/h/h.settings.json'));
    for (const [token, value] of [
      ['--shadow-low', '0 0 0 1px var(--color-border-emphasized)'],
      ['--shadow-low', '0 0 10px 2pt red'],
      ['--shadow-low', 'var(--shadow-med), 0 0 0 1px red'],
      ['--color-text-primary', 'oklch(from var(--color-accent) l c h / 0.5)'],
      ['--color-text-primary', 'Canvas'],
      ['--color-text-primary', 'var(--color-accent, #000)'],
      ['--duration-fast', '150MS'],
      ['--ease-standard', 'EASE'],
      ['--font-family-body', '"Noto Sans", 日本語, sans-serif'],
    ])
      expect(
        () => checkSetting(ctx, 'h', data, token, value, {}, false),
        `${token} ${value}`,
      ).not.toThrow();
  }, 240_000);

  it('a font name may hold an apostrophe; var( --x ) with spaces is a cycle', async () => {
    await themeEditSet('h', 'font', "O'Reilly Sans", {cwd});
    await themeEditUndo('h', {cwd, thing: 'font'});
    expect(
      (
        await refusal(() =>
          themeEditSet('h', '--spacing-4', 'calc(var( --spacing-4 ) * 2)', {
            cwd,
          }),
        )
      ).code,
    ).toBe('ERR_THEME_BAD_VALUE');
  }, 120_000);

  it('a saved token the rules no longer take names its undo; sizes say phones keep theirs', async () => {
    await themeEditNew('t2', {cwd});
    const file = path.join(cwd, 'themes/t2/t2.settings.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    data.settings.push({
      thing: '--duration-fast',
      value: 'red',
      source: 'token',
    });
    fs.writeFileSync(file, JSON.stringify(data));
    const r = await refusal(() =>
      themeEditSet('t2', 'corners', 'small', {cwd}),
    );
    expect(r.code).toBe('ERR_THEME_INVALID');
    expect(r.run[0]).toMatch(/undo t2 --duration-fast$/);
    await themeEditUndo('t2', {cwd, thing: '--duration-fast'});
    const size = await themeEditSet('t2', 'text-size', '10', {cwd});
    const notes = size.data.notes.join(' ');
    expect(notes).toContain('phones');
    expect(notes).toContain('outside reading sizes');
    fs.rmSync(path.join(cwd, 'themes/t2'), {recursive: true, force: true});
  }, 240_000);
});

describe('after #11180', () => {
  it('a command outside a project takes no lock, even with Core in the home folder', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-home2-'));
    const saved = process.env.HOME;
    try {
      fs.mkdirSync(path.join(home, 'node_modules/@astryxdesign/core'), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(home, 'node_modules/@astryxdesign/core/package.json'),
        '{"name":"@astryxdesign/core","version":"0.0.0"}',
      );
      // A folder outside any project: the command is refused, and the
      // Core in the home folder gets no lock folder.
      const away = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-away2-'));
      process.env.HOME = home;
      expect((await refusal(() => themeEditNew('z', {cwd: away}))).code).toBe(
        'ERR_PROJECT_REQUIRED',
      );
      fs.rmSync(away, {recursive: true, force: true});
      expect(fs.existsSync(path.join(home, 'node_modules/.cache'))).toBe(false);
      expect(fs.existsSync(path.join(home, 'themes'))).toBe(false);
    } finally {
      process.env.HOME = saved;
      fs.rmSync(home, {recursive: true, force: true});
    }
  });

  it('show names why the build did not match', async () => {
    await themeEditNew('w9', {cwd});
    const ts = path.join(cwd, 'themes/w9/w9.settings.ts');
    fs.writeFileSync(
      ts,
      fs.readFileSync(ts, 'utf8').replace(/\(CLI [^)]+\)/, '(CLI 0.0.1)'),
    );
    const r = await themeEditShow('w9', {cwd});
    expect(r.data.notes.join(' ')).toContain('built by CLI 0.0.1');
    fs.rmSync(path.join(cwd, 'themes/w9'), {recursive: true, force: true});
  }, 120_000);
});
