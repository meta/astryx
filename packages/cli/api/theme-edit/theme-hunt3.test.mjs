// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The third pass over `astryx experimental theme`: saved settings
 * checked on load with a fix that runs for each, steps on any base unit,
 * undo of base, mode and halves, text colors that cannot show, shell-safe
 * suggestions, editor themes named to the package commands and `compile`,
 * moved subcommand names, and build files that stay the same.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditNew,
  themeEditPreviewAdd,
  themeEditSet,
  themeEditShow,
  themeEditUndo,
} from './theme-edit.mjs';
import {lengthPx} from './_check.mjs';
import {findOverrides} from './_settings.mjs';
import {isSafeValue} from './_color.mjs';
import {quoteCommandArgument} from '../../foundation/env/package-manager.mjs';
import {tryLock} from '../../foundation/release/cache.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

import {withRealRenders} from '../../test-utils/theme-render-stub.mjs';
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
const {read} = projectFiles(() => cwd);

/** @param {string[]} args */
const cli = async args => {
  const r = await runCli(['--json', 'experimental', 'theme', ...args], {cwd});
  return {status: r.status, body: JSON.parse(r.stdout || '{}')};
};

/** @param {string} slug @param {any[]} settings */
const writeSettings = (slug, settings) => {
  const file = path.join(cwd, `themes/${slug}/${slug}.settings.json`);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  data.settings = settings;
  fs.writeFileSync(file, JSON.stringify(data));
};

/** @param {string} slug */
const drop = slug =>
  fs.rmSync(path.join(cwd, 'themes', slug), {recursive: true, force: true});

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt3-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('h', {cwd, like: 'neutral'});
}, 120_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

// First, before any other command in this process builds a theme.
describe('compile', () => {
  it('compile refuses the editor settings and checks an editor theme the editor way', async () => {
    // Each command in its own process, as a person runs them.
    const bin = path.resolve(
      import.meta.dirname,
      '../../clients/cli/bin/astryx.mjs',
    );
    const run = (/** @type {string[]} */ args) =>
      spawnSync(process.execPath, [bin, 'experimental', 'theme', ...args], {
        cwd,
        encoding: 'utf8',
      });
    expect(run(['editor', 'new', 'cc']).status).toBe(0);
    const settings = await cli(['compile', 'themes/cc/cc.settings.ts']);
    expect(settings.body.suggestions[0].name).toMatch(
      /compile themes\/cc\/cc\.theme\.ts$/,
    );
    const family = await cli([
      'compile',
      '--family',
      'themes/cc/cc.theme.ts',
      '--family-key',
      'cc',
    ]);
    expect(family.status).toBe(1);
    // The editor's build writes what compile writes, headers included.
    const fresh = run(['compile', 'themes/cc/cc.theme.ts', '--check']);
    expect(fresh.status, fresh.stdout + fresh.stderr).toBe(0);
    writeSettings('cc', [{thing: 'corners', value: 'large', source: 'dial'}]);
    const stale = await cli(['compile', 'themes/cc/cc.theme.ts', '--check']);
    expect(stale.status).toBe(1);
    expect(stale.body.error).toContain('does not match the build');
    drop('cc');
  }, 240_000);
});

describe('steps and saved values', () => {
  it('reads rem and em as pixels for a step', () => {
    expect(lengthPx('0.625rem')).toBe(10);
    expect(lengthPx('1em')).toBe(16);
    expect(lengthPx('6px')).toBe(6);
    expect(lengthPx('50%')).toBeNull();
  });

  it('steps corners from the base radius both ways', async () => {
    const more = await themeEditSet('h', 'corners', 'more', {cwd});
    await themeEditUndo('h', {cwd});
    const less = await themeEditSet('h', 'corners', 'less', {cwd});
    await themeEditUndo('h', {cwd});
    expect(more.data.setting.value).not.toBe(less.data.setting.value);
  }, 240_000);

  it('refuses saved corners that are not a rung or pixels, naming a fix for each bad setting', async () => {
    await themeEditNew('s1', {cwd});
    writeSettings('s1', [
      {thing: 'corners', value: 'calc(4px + 2px)', source: 'dial'},
      {thing: 'spacing', value: 'huge', source: 'dial'},
      {thing: 'corners', value: 'banana', source: 'dial', on: 'button'},
    ]);
    const r = await refusal(() => themeEditShow('s1', {cwd}));
    expect(r.code).toBe('ERR_THEME_INVALID');
    expect(r.message).not.toContain('more|less');
    expect(r.run).toEqual([
      expect.stringMatching(/undo s1 corners$/),
      expect.stringMatching(/undo s1 spacing$/),
      expect.stringMatching(/undo s1 corners --on button$/),
    ]);
    // Each fix runs on its own, in any order.
    await themeEditUndo('s1', {cwd, thing: 'spacing'});
    await themeEditUndo('s1', {cwd, thing: 'corners', on: 'button'});
    await themeEditSet('s1', 'corners', 'large', {cwd});
    expect(JSON.parse(read('themes/s1/s1.settings.json')).settings).toEqual([
      {thing: 'corners', value: 'large', source: 'dial'},
    ]);
    drop('s1');
  }, 240_000);

  it('a bad part setting is not passed over by a whole-theme change', async () => {
    await themeEditNew('s2', {cwd});
    writeSettings('s2', [
      {thing: 'corners', value: 'banana', source: 'dial', on: 'button'},
    ]);
    const r = await refusal(() => themeEditSet('s2', 'corners', 'pill', {cwd}));
    expect(r.code).toBe('ERR_THEME_INVALID');
    drop('s2');
  }, 240_000);

  it('checks where a saved setting applies', async () => {
    await themeEditNew('s3', {cwd});
    writeSettings('s3', [
      {thing: 'color', value: 'red', source: 'property', on: 'button, card'},
    ]);
    const r = await refusal(() => themeEditShow('s3', {cwd}));
    expect(r.message).toContain('not a part or group name');
    drop('s3');
  }, 240_000);
});

describe('undo', () => {
  it('base and mode go back to how the theme was made', async () => {
    await themeEditNew('u1', {cwd, like: 'neutral'});
    expect(
      (await refusal(() => themeEditUndo('u1', {cwd, thing: 'base'}))).code,
    ).toBe('ERR_THEME_NOT_SET');
    await themeEditSet('u1', 'base', 'none', {cwd});
    const back = await themeEditUndo('u1', {cwd, thing: 'base'});
    expect(back.data.setting.value).toBe('neutral');
    drop('u1');
  }, 240_000);

  it('takes the headings halves, a value in another case, and names --on for a part', async () => {
    await themeEditNew('u2', {cwd});
    await themeEditSet('u2', 'headings', 'bold', {cwd});
    await themeEditUndo('u2', {cwd, thing: 'headings', value: 'weight'});
    await themeEditSet('u2', 'headings', 'tight', {cwd});
    await themeEditUndo('u2', {cwd, thing: 'headings', value: 'tracking'});
    await themeEditSet('u2', 'font', 'Inter', {cwd});
    await themeEditUndo('u2', {cwd, thing: 'font', value: 'Inter'});
    await themeEditSet('u2', 'corners', '6px', {cwd, on: 'card'});
    const r = await refusal(() =>
      themeEditUndo('u2', {cwd, thing: 'corners', value: 'card'}),
    );
    expect(r.run[0]).toMatch(/undo u2 corners --on card$/);
    drop('u2');
  }, 240_000);
});

describe('set', () => {
  it('refuses a color on text, naming the text color token', async () => {
    const r = await refusal(() =>
      themeEditSet('h', 'color', '#ff0000', {cwd, on: 'text'}),
    );
    expect(r.code).toBe('ERR_THEME_NO_EFFECT');
    expect(r.run[0]).toMatch(/--color-text-primary '#ff0000'$/);
  });

  it('refuses blank scope flags', async () => {
    expect(
      (
        await refusal(() =>
          themeEditSet('h', 'corners', 'pill', {cwd, on: ' '}),
        )
      ).code,
    ).toBe('ERR_MISSING_ARGUMENT');
  });

  it('points a property written another way at the property', async () => {
    const r = await refusal(() =>
      themeEditSet('h', 'background_color', '#ff0000', {cwd, on: 'card'}),
    );
    expect(r.run[0]).toMatch(/set h background-color '#ff0000' --on card$/);
  });

  it('quotes every suggested value so a shell passes it unchanged', async () => {
    for (const value of ['$(id)', '`id`', "it's", 'a!b']) {
      const r = await refusal(() =>
        themeEditSet('h', 'background_color', value, {cwd, on: 'card'}),
      );
      // None of these is a color, so the set `background-color` would
      // refuse is left out; no line carries the value unquoted.
      for (const line of r.run)
        expect(line.replace(quoteCommandArgument(value), '')).not.toContain(
          value,
        );
      expect(quoteCommandArgument(value)).toMatch(/^'/);
    }
  });

  it('takes < and > inside a quoted string only', () => {
    expect(isSafeValue('">"')).toBe(true);
    expect(isSafeValue('"</style>"')).toBe(false);
    expect(isSafeValue('a > b')).toBe(false);
  });

  it('lifts the last of a property and its shorthand onto variants', () => {
    const lifted = findOverrides(
      '.astryx-button[data-variant="destructive"] { background-color: red; border-radius: 2px; }',
      {
        components: {
          button: {
            base: {
              backgroundColor: '#0f0',
              background: '#f00',
              border: '1px solid',
            },
          },
        },
      },
    );
    expect(lifted.map(x => x.prop)).toEqual(['background']);
  });

  it('a same value a later group setting hides moves last', async () => {
    await themeEditNew('m1', {cwd});
    await themeEditSet('m1', 'corners', '6px', {cwd, on: 'card'});
    await themeEditSet('m1', 'corners', 'round', {cwd, on: 'containers'});
    await themeEditSet('m1', 'corners', '6px', {cwd, on: 'card'});
    const settings = JSON.parse(read('themes/m1/m1.settings.json')).settings;
    expect(settings.at(-1)).toMatchObject({on: 'card', value: '6px'});
    drop('m1');
  }, 240_000);

  it('a change that changes nothing writes no preview', async () => {
    await themeEditSet('h', 'corners', 'large', {cwd});
    const preview = path.join(cwd, 'themes/h/preview.html');
    const before = fs.statSync(preview).mtimeMs;
    await themeEditSet('h', 'corners', 'large', {cwd});
    expect(fs.statSync(preview).mtimeMs).toBe(before);
    await themeEditUndo('h', {cwd, thing: 'corners'});
  }, 240_000);

  it('a theme source that no longer extends the settings is refused', async () => {
    await themeEditNew('t1', {cwd});
    fs.writeFileSync(
      path.join(cwd, 'themes/t1/t1.theme.ts'),
      "import {defineTheme} from '@astryxdesign/core/theme';\nexport const t1Theme = defineTheme({name: 't1'});\n",
    );
    const r = await refusal(() => themeEditSet('t1', 'corners', 'pill', {cwd}));
    expect(r.code).toBe('ERR_THEME_INVALID');
    expect(r.message).toContain('does not import');
    drop('t1');
  }, 120_000);
});

describe('names', () => {
  it('refuses a built-in name for new, and a hand-written theme for the editor', async () => {
    expect(
      (await refusal(() => themeEditNew('neutral', {cwd}))).run[0],
    ).toMatch(/new my-neutral --like neutral$/);
    fs.mkdirSync(path.join(cwd, 'themes/hand'), {recursive: true});
    fs.writeFileSync(path.join(cwd, 'themes/hand/hand.theme.ts'), '');
    const r = await refusal(() => themeEditShow('hand', {cwd}));
    expect(r.message).toContain('did not make');
    expect(r.run[0]).toMatch(/new my-hand$/);
    drop('hand');
  });
});

describe('builds that stay the same', () => {
  it('a stale lock is taken by one command only', () => {
    const lock = path.join(cwd, 'node_modules/.cache/astryx-theme/locks/x');
    fs.mkdirSync(lock, {recursive: true});
    fs.writeFileSync(
      path.join(lock, 'owner.json'),
      JSON.stringify({pid: 3999999, host: os.hostname(), at: 1}),
    );
    expect(tryLock(lock)).toBe(true);
    // The second finds a live holder (this process), not the stale one.
    expect(tryLock(lock)).toBe(false);
    fs.rmSync(lock, {recursive: true, force: true});
  });

  it('the preview route imports a b-2 theme by its module name', async () => {
    await themeEditNew('b-2', {cwd});
    await themeEditPreviewAdd(undefined, {
      cwd,
      path: 'src/app/b2',
      theme: 'b-2',
    });
    const route = fs
      .readdirSync(path.join(cwd, 'src/app/b2'), {recursive: true})
      .map(f => path.join(cwd, 'src/app/b2', String(f)))
      .filter(f => f.endsWith('.tsx'))
      .map(f => fs.readFileSync(f, 'utf8'))
      .join('\n');
    expect(route).toContain('b2Theme as theme');
    expect(route).not.toContain('b-2Theme');
    fs.rmSync(path.join(cwd, 'src/app/b2'), {recursive: true, force: true});
    drop('b-2');
  }, 240_000);

  it('a damaged palette.config.json is made again, its text kept beside it', async () => {
    await themeEditNew('pc', {cwd, settings: {accent: 'teal'}});
    const file = path.join(cwd, 'themes/pc/palette.config.json');
    fs.writeFileSync(file, '{"x":');
    const r = await themeEditSet('pc', 'corners', 'pill', {cwd});
    expect(r.data.setting.value).toBe('pill');
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toBeTruthy();
    expect(read('themes/pc/palette.config.damaged.json')).toBe('{"x":');
    expect(r.data.notes.join(' ')).toContain('palette.config.damaged.json');
    // A second damage keeps its own copy.
    fs.writeFileSync(file, '{"y":');
    await themeEditSet('pc', 'corners', 'square', {cwd});
    expect(read('themes/pc/palette.config.damaged-2.json')).toBe('{"y":');
    drop('pc');
  }, 240_000);

  it(
    'preview.html is the same on every build; a letter case change is no token change',
    () =>
      withRealRenders(async () => {
        await themeEditNew('lc', {cwd});
        const before = read('themes/lc/preview.html');
        expect(before).not.toMatch(/astryx-render-\d/);
        const r = await themeEditSet('lc', 'neutral', '#000000', {cwd});
        for (const c of r.data.changedTokens) {
          const [, from, to] = /: (.*) -> (.*)$/.exec(c) ?? [];
          if (from) expect(from.toLowerCase(), c).not.toBe(to.toLowerCase());
        }
        await themeEditUndo('lc', {cwd});
        expect(read('themes/lc/preview.html')).toBe(before);
        drop('lc');
      }),
    240_000,
  );

  it('show builds a damaged module again and says so', async () => {
    await themeEditNew('dj', {cwd});
    fs.writeFileSync(path.join(cwd, 'themes/dj/dj.js'), 'export const = ;');
    const r = await themeEditShow('dj', {cwd});
    expect(r.data.notes.join(' ')).toMatch(
      /could not be read|dj\.js differs from what the settings build/,
    );
    drop('dj');
  }, 240_000);
});

describe('the command line', () => {
  it('names an editor theme to the package commands', async () => {
    const r = await cli(['use', 'h']);
    expect(r.status).toBe(1);
    expect(r.body.error).toContain('a theme the editor made');
  }, 120_000);

  it('a moved name points where it went; a bare group answers --json', async () => {
    const moved = await cli(['build']);
    expect(moved.body.suggestions[0].name).toMatch(
      /experimental theme compile$/,
    );
    const help = await cli(['editor']);
    expect(help.status).toBe(0);
    expect(help.body.type).toBe('help');
  }, 120_000);

  it('new with two words suggests --like only for a built-in theme', async () => {
    const brand = await cli(['editor', 'new', 'my', 'brand']);
    expect(brand.body.suggestions[0].name).toMatch(/new my-brand$/);
    const like = await cli(['editor', 'new', 'my', 'neutral']);
    expect(like.body.suggestions[0].name).toMatch(/new my --like neutral$/);
  }, 120_000);
});

describe('data safety, pass 3', () => {
  it('a change never reads, keeps or takes back files the editor does not write', async () => {
    await themeEditNew('d1', {cwd});
    fs.writeFileSync(path.join(cwd, 'themes/d1/NOTES.md'), 'mine');
    fs.mkdirSync(path.join(cwd, 'themes/d1/tokens'), {recursive: true});
    fs.writeFileSync(path.join(cwd, 'themes/d1/tokens/mine.css'), 'x');
    await refusal(() => themeEditSet('d1', 'corners', 'banana', {cwd}));
    await themeEditSet('d1', 'corners', 'pill', {cwd});
    await themeEditUndo('d1', {cwd});
    expect(read('themes/d1/NOTES.md')).toBe('mine');
    expect(read('themes/d1/tokens/mine.css')).toBe('x');
    drop('d1');
  }, 240_000);

  it('new clears only what a stopped new left beside its marker, after every check', async () => {
    const {themeSource} = await import('./_settings.mjs');
    const dir = path.join(cwd, 'themes/kn');
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, '.astryx-new.json'), '{}');
    fs.writeFileSync(path.join(dir, 'kn.theme.ts'), themeSource('kn'));
    fs.writeFileSync(path.join(dir, 'kn.settings.ts'), '// half');
    fs.writeFileSync(path.join(dir, '.kn.css.tmp-abc'), 'x');
    // A stopped new: show names the way back.
    expect((await refusal(() => themeEditShow('kn', {cwd}))).run[0]).toMatch(
      /new kn$/,
    );
    // A refused new writes nothing, the leftovers included.
    await refusal(() =>
      themeEditNew('kn', {cwd, settings: {corners: 'banana'}}),
    );
    expect(fs.existsSync(path.join(dir, '.kn.css.tmp-abc'))).toBe(true);
    const r = await themeEditNew('kn', {cwd});
    expect(r.data.notes.join(' ')).toContain('a stopped `new` left');
    expect(fs.existsSync(path.join(dir, '.kn.css.tmp-abc'))).toBe(false);
    expect(fs.existsSync(path.join(dir, '.astryx-new.json'))).toBe(false);
    drop('kn');
  }, 240_000);

  it('new never touches hand-written files named like the theme', async () => {
    const dir = path.join(cwd, 'themes/acme');
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, 'acme.css'), ':root{--my-brand:#f00}');
    fs.writeFileSync(path.join(dir, 'acme.ts'), 'export const acme = {};');
    for (const settings of [{corners: 'banana'}, {}])
      expect(
        (await refusal(() => themeEditNew('acme', {cwd, settings}))).code,
      ).toMatch(/ERR_FILE_EXISTS|ERR_THEME_BAD_VALUE/);
    expect(read('themes/acme/acme.css')).toBe(':root{--my-brand:#f00}');
    expect(read('themes/acme/acme.ts')).toBe('export const acme = {};');
    drop('acme');
  }, 120_000);

  it('a folder of only system files counts as empty; a name in another case names the theme', async () => {
    fs.mkdirSync(path.join(cwd, 'themes/e2'), {recursive: true});
    fs.writeFileSync(path.join(cwd, 'themes/e2/.DS_Store'), '');
    await themeEditNew('e2', {cwd});
    expect((await refusal(() => themeEditNew('E2', {cwd}))).run[0]).toMatch(
      /show e2$/,
    );
    drop('e2');
  }, 240_000);

  it('a saved value that is not text is a bad setting with a quoted undo', async () => {
    await themeEditNew('nv', {cwd});
    writeSettings('nv', [
      {thing: 'corners', value: 12, source: 'dial'},
      {thing: 'color', value: 'red', source: 'property', on: 'button, body'},
    ]);
    const r = await refusal(() => themeEditShow('nv', {cwd}));
    expect(r.code).toBe('ERR_THEME_INVALID');
    expect(r.run).toContain(
      "astryx experimental theme editor undo nv color --on 'button, body'",
    );
    drop('nv');
  }, 240_000);

  it('undo skips a step that equals the settings now, and says when none is left', async () => {
    await themeEditNew('d2', {cwd});
    await themeEditSet('d2', 'corners', 'pill', {cwd});
    const f = path.join(cwd, 'themes/d2');
    const history = JSON.parse(fs.readFileSync(`${f}/d2.history.json`, 'utf8'));
    // An undo stopped between its writes: the settings are back, the
    // step is still on top.
    fs.writeFileSync(
      `${f}/d2.history.json`,
      JSON.stringify([
        ...history,
        fs.readFileSync(`${f}/d2.settings.json`, 'utf8'),
      ]),
    );
    await themeEditUndo('d2', {cwd});
    expect(JSON.parse(read('themes/d2/d2.settings.json')).settings).toEqual([]);
    fs.writeFileSync(
      `${f}/d2.history.json`,
      JSON.stringify([fs.readFileSync(`${f}/d2.settings.json`, 'utf8')]),
    );
    expect((await refusal(() => themeEditUndo('d2', {cwd}))).code).toBe(
      'ERR_THEME_NOTHING_TO_UNDO',
    );
    drop('d2');
  }, 240_000);

  it('show without the lock writes nothing', async () => {
    const edit = await import('./_edit.mjs');
    await themeEditNew('d3', {cwd});
    const preview = path.join(cwd, 'themes/d3/preview.html');
    const before = fs.statSync(preview).mtimeMs;
    const r = await edit.themeEditShow('d3', {
      cwd,
      .../** @type {any} */ ({readOnly: true}),
    });
    expect(r.data.notes.join(' ')).toContain('nothing was written');
    expect(fs.statSync(preview).mtimeMs).toBe(before);
    drop('d3');
  }, 240_000);
});

describe('fonts', () => {
  it('a family name with an apostrophe builds, and the theme stays readable', async () => {
    await themeEditNew('fo', {cwd});
    await themeEditSet('fo', 'font', "O'Reilly Sans", {cwd});
    await themeEditShow('fo', {cwd});
    await themeEditSet('fo', 'corners', 'more', {cwd});
    expect(read('themes/fo/fo.css')).toContain('"O\'Reilly Sans"');
    drop('fo');
  }, 240_000);
});

describe('one mode with a state', () => {
  it('never changes the other mode: variants are named, and a part with nothing to keep is refused', async () => {
    await themeEditNew('sm', {cwd, like: 'neutral'});
    const r = await refusal(() =>
      themeEditSet('sm', 'background-color', '#00ff00', {
        cwd,
        on: 'button',
        state: 'hover',
        mode: 'dark',
      }),
    );
    expect(r.code).toBe('ERR_THEME_NO_MODE');
    expect(r.run[0]).toMatch(/--when variant:\w+ --state hover --mode dark$/);
    expect(
      (
        await refusal(() =>
          themeEditSet('sm', 'background-color', '#00ff00', {
            cwd,
            on: 'tab',
            state: 'hover',
            mode: 'light',
          }),
        )
      ).code,
    ).toBe('ERR_THEME_NO_MODE');
    await themeEditSet('sm', 'background-color', '#00ff00', {
      cwd,
      on: 'button',
      when: 'variant:ghost',
      state: 'hover',
      mode: 'dark',
    });
    // Light keeps the ghost button's own color.
    expect(read('themes/sm/sm.css')).toMatch(
      /light-dark\(var\(--color-[a-z-]+\), #00ff00\)/,
    );
    drop('sm');
  }, 240_000);
});
