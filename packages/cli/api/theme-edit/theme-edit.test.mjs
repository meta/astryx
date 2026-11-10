// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for `astryx experimental theme` (the theme-edit API): refusals
 * with the command that works, families, typed modes, the lift pass, the
 * settings round trip, `how` and `explain` on real parts, and `colors`.
 * Every check runs against the Core and Neutral theme this repository builds.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  coreBuildLockDir,
  ensureBuiltOnce,
} from '../../clients/cli/commands/ensure-core-built.mjs';
import {REPO_ROOT} from '../../test-utils/repo-root.mjs';
import {
  themeEditExplain,
  themeEditNew,
  themeEditReset,
  themeEditSet,
  themeEditShow,
  themeEditUndo,
} from './theme-edit.mjs';
import {parsePoints} from './_adapter.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';

/** @type {string} */
let cwd;

/**
 * The error a call throws: its code, message and suggested commands.
 * @param {() => Promise<unknown>} fn
 */
async function refusal(fn) {
  try {
    await fn();
  } catch (e) {
    const err = /** @type {any} */ (e);
    return {
      code: err.code,
      message: String(err.message),
      run: (err.suggestions ?? []).map((/** @type {any} */ s) => s.name),
    };
  }
  throw new Error('expected a refusal');
}

/** @param {string} slug */
const settingsOf = slug =>
  fs.readFileSync(
    path.join(cwd, 'themes', slug, `${slug}.settings.json`),
    'utf8',
  );
/** @param {string} slug */
const settingsSourceOf = slug =>
  fs.readFileSync(
    path.join(cwd, 'themes', slug, `${slug}.settings.ts`),
    'utf8',
  );
/** @param {string} slug */
const sourceOf = slug =>
  fs.readFileSync(path.join(cwd, 'themes', slug, `${slug}.theme.ts`), 'utf8');

beforeAll(async () => {
  ensureBuiltOnce({
    isBuilt: () =>
      fs.existsSync(
        path.join(REPO_ROOT, 'packages/themes/neutral/dist/neutral.js'),
      ),
    build: () =>
      execFileSync('pnpm', ['-F', '@astryxdesign/theme-neutral', 'build'], {
        cwd: REPO_ROOT,
        stdio: 'pipe',
      }),
    lockDir: `${coreBuildLockDir(REPO_ROOT)}.neutral`,
  });
  cwd = makeLinkedFixture('astryx-theme-edit-', [
    '@astryxdesign',
    'react',
    'react-dom',
  ]);
  await themeEditNew('t', {cwd, like: 'neutral'});
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

describe('new', () => {
  it('writes the settings, the generated source, the build and a preview', () => {
    for (const f of [
      't.settings.json',
      't.theme.ts',
      't.css',
      't.js',
      'preview.html',
    ]) {
      expect(fs.existsSync(path.join(cwd, 'themes', 't', f))).toBe(true);
    }
    expect(settingsSourceOf('t')).toContain(
      "from '@astryxdesign/theme-neutral/built'",
    );
    expect(sourceOf('t')).toContain("import {tSettings} from './t.settings';");
    expect(JSON.parse(settingsOf('t'))).toMatchObject({
      name: 't',
      like: 'neutral',
      mode: 'both',
      settings: [],
    });
    // The render folder is removed after every render.
    expect(fs.existsSync(path.join(cwd, 'themes', '.astryx-render'))).toBe(
      false,
    );
  });

  it('caches the part data per Core version under node_modules/.cache', () => {
    const root = path.join(
      path.dirname(cwd),
      'node_modules',
      '.cache',
      'astryx-theme',
    );
    const [key] = fs.readdirSync(root);
    expect(fs.existsSync(path.join(root, key, 'parts.json'))).toBe(true);
  });

  it('refuses a theme that exists, naming what to run instead', async () => {
    const r = await refusal(() => themeEditNew('t', {cwd}));
    expect(r.code).toBe('ERR_FILE_EXISTS');
    expect(r.run).toContain('astryx experimental theme show t');
  });
});

describe('refusals', () => {
  it('refuses a token the part never reads and names the property that works; nothing is written', async () => {
    const before = settingsOf('t');
    const r = await refusal(() =>
      themeEditSet('t', '--color-on-info-muted', '#ffffff', {cwd, on: 'card'}),
    );
    expect(r.code).toBe('ERR_THEME_NO_EFFECT');
    expect(r.message).toContain('card never reads --color-on-info-muted');
    expect(r.message).toContain('Nothing was changed.');
    expect(r.run).toContain(
      'astryx experimental theme set t color "#ffffff" --on card',
    );
    expect(settingsOf('t')).toBe(before);
  });

  it('refuses an unknown part with near names', async () => {
    const r = await refusal(() =>
      themeEditSet('t', 'background', '#fff', {cwd, on: 'buton'}),
    );
    expect(r.code).toBe('ERR_THEME_UNKNOWN_PART');
    expect(r.run).toContain('button');
  });

  it('refuses a variant value the part does not have', async () => {
    const r = await refusal(() =>
      themeEditSet('t', 'background', '#fff', {
        cwd,
        on: 'button',
        when: 'variant:primry',
      }),
    );
    expect(r.code).toBe('ERR_THEME_UNKNOWN_VARIANT');
    expect(r.message).toContain('primary');
  });

  it('refuses a state the part does not have', async () => {
    const r = await refusal(() =>
      themeEditSet('t', 'background', '#fff', {
        cwd,
        on: 'button',
        state: 'pressed',
      }),
    );
    expect(r.code).toBe('ERR_THEME_UNKNOWN_STATE');
  });

  it('refuses a value of the wrong type', async () => {
    const r = await refusal(() =>
      themeEditSet('t', '--radius-element', 'red', {cwd}),
    );
    expect(r.code).toBe('ERR_THEME_BAD_VALUE');
    expect(r.message).toContain('--radius-element is a size');
  });

  it('refuses a step on something that is not a dial', async () => {
    const r = await refusal(() =>
      themeEditSet('t', '--color-accent', 'more', {cwd}),
    );
    expect(r.code).toBe('ERR_THEME_BAD_VALUE');
  });

  it('refuses a private variable and an unknown thing', async () => {
    expect(
      (await refusal(() => themeEditSet('t', '--_button-radius', '4px', {cwd})))
        .code,
    ).toBe('ERR_THEME_PRIVATE_TOKEN');
    const r = await refusal(() =>
      themeEditSet('t', 'gradient', '#fff, #000', {cwd, on: 'card'}),
    );
    expect(r.code).toBe('ERR_THEME_UNKNOWN_THING');
    expect(r.run[0]).toContain(
      'background "linear-gradient(#fff, #000)" --on card',
    );
  });

  it('refuses corners on a part that shows no edge', async () => {
    const r = await refusal(() =>
      themeEditSet('t', 'corners', 'round', {cwd, on: 'heading'}),
    );
    expect(r.code).toBe('ERR_THEME_NO_EFFECT');
    expect(r.message).toContain('changes nothing you see');
  });

  it('refuses a CSS property without --on, naming the command with it', async () => {
    const r = await refusal(() =>
      themeEditSet('t', 'box-shadow', 'none', {cwd}),
    );
    expect(r.code).toBe('ERR_MISSING_ARGUMENT');
    expect(r.run[0]).toBe(
      'astryx experimental theme set t box-shadow none --on <part>',
    );
  });
});

describe('typed modes', () => {
  it('refuses --mode on a size and names the command without it', async () => {
    const r = await refusal(() =>
      themeEditSet('t', '--radius-element', '4px', {cwd, mode: 'dark'}),
    );
    expect(r.code).toBe('ERR_THEME_NO_MODE');
    expect(r.run).toEqual([
      'astryx experimental theme set t --radius-element 4px',
    ]);
  });

  it('sets one side of a color and keeps the other from the base theme', async () => {
    const r = await themeEditSet('t', '--color-background-body', '#101010', {
      cwd,
      mode: 'dark',
    });
    expect(
      r.data.changedTokens.some(c =>
        c.startsWith('--color-background-body (dark)'),
      ),
    ).toBe(true);
    expect(
      r.data.changedTokens.some(c =>
        c.startsWith('--color-background-body (light)'),
      ),
    ).toBe(false);
    expect(settingsSourceOf('t')).toMatch(
      /"--color-background-body": \[\s*"[^"]+",\s*"#101010"\s*\]/,
    );
    await themeEditReset('t', '--color-background-body', {cwd, mode: 'dark'});
  });

  it('refuses --mode on a one-mode theme', async () => {
    await themeEditNew('night', {cwd});
    await themeEditSet('night', 'mode', 'dark-only', {cwd});
    const r = await refusal(() =>
      themeEditSet('night', '--color-accent', '#ff0000', {cwd, mode: 'dark'}),
    );
    expect(r.code).toBe('ERR_THEME_NO_MODE');
    expect(r.run).toEqual([
      'astryx experimental theme set night --color-accent "#ff0000"',
    ]);
  });
});

describe('families', () => {
  it('styling one input styles every input; --only styles just that one', async () => {
    const all = await themeEditSet('t', 'border', '1px solid #999999', {
      cwd,
      on: 'text-input',
    });
    expect(all.data.family?.name).toBe('inputs');
    expect(all.data.parts).toEqual(
      expect.arrayContaining(['text-input', 'text-area', 'selector']),
    );
    const one = await themeEditSet('t', 'border-color', '#ff0000', {
      cwd,
      on: 'text-area',
      only: true,
    });
    expect(one.data.parts).toEqual(['text-area']);
    await themeEditReset('t', 'border', {cwd, on: 'text-input'});
    await themeEditReset('t', 'border-color', {
      cwd,
      on: 'text-area',
      only: true,
    });
  });

  it('a container styles only itself unless --on names the family', async () => {
    const card = await themeEditSet('t', 'box-shadow', 'none', {
      cwd,
      on: 'card',
    });
    expect(card.data.parts).toEqual(['card']);
    expect(card.data.family).toBeNull();
    const all = await themeEditSet('t', 'box-shadow', 'none', {
      cwd,
      on: 'containers',
    });
    expect(all.data.parts).toEqual(
      expect.arrayContaining(['card', 'dialog', 'popover']),
    );
    await themeEditReset('t', 'box-shadow', {cwd, on: 'card'});
    await themeEditReset('t', 'box-shadow', {cwd, on: 'containers'});
  });

  it('--only is refused for a family that does not spread', async () => {
    const r = await refusal(() =>
      themeEditSet('t', 'box-shadow', 'none', {cwd, on: 'card', only: true}),
    );
    expect(r.code).toBe('ERR_INVALID_ARGUMENT');
    expect(r.run).toEqual([
      'astryx experimental theme set t box-shadow none --on card',
    ]);
  });
});

describe('lift pass', () => {
  it('repeats a heading setting on the level keys the base theme styles, once', async () => {
    const first = await themeEditSet('t', 'font-weight', '300', {
      cwd,
      on: 'heading',
    });
    expect(first.data.lifted).toEqual(
      expect.arrayContaining([
        'heading level:1 font-weight',
        'heading level:6 font-weight',
      ]),
    );
    // A prop named for the property is the author's choice and keeps winning.
    expect(first.data.lifted.some(x => x.includes('weight:'))).toBe(false);
    expect(JSON.parse(settingsOf('t')).lifted).toEqual(first.data.lifted);
    const next = await themeEditSet('t', 'corners', 'large', {cwd});
    expect(next.data.lifted).toEqual([]);
    await themeEditReset('t', 'corners', {cwd});
    await themeEditReset('t', 'font-weight', {cwd, on: 'heading'});
  });
});

describe('the theme module is yours', () => {
  it('keeps hand edits in <slug>.theme.ts through every change', async () => {
    const file = path.join(cwd, 'themes', 't', 't.theme.ts');
    const before = fs.readFileSync(file, 'utf8');
    const edited = before.replace(
      "  name: 't',",
      "  name: 't',\n  tokens: {'--color-border': '#123456'},",
    );
    fs.writeFileSync(file, edited);
    await themeEditSet('t', 'corners', 'small', {cwd});
    expect(fs.readFileSync(file, 'utf8')).toBe(edited);
    expect(
      fs.readFileSync(path.join(cwd, 'themes', 't', 't.css'), 'utf8'),
    ).toContain('#123456');
    await themeEditReset('t', 'corners', {cwd});
    fs.writeFileSync(file, before);
    await themeEditSet('t', 'corners', 'small', {cwd});
    await themeEditReset('t', 'corners', {cwd});
  });

  it('writes font families without quotes, so Core quotes them once', async () => {
    await themeEditSet('t', 'font', 'Mona Sans', {cwd});
    expect(settingsSourceOf('t')).toContain('"family": "Mona Sans"');
    expect(
      fs.readFileSync(path.join(cwd, 'themes', 't', 't.css'), 'utf8'),
    ).not.toContain('""Mona Sans""');
    await themeEditReset('t', 'font', {cwd});
  });
});

describe('settings round trip', () => {
  it('set, unset and undo put the settings back exactly', async () => {
    const start = settingsOf('t');
    const set = await themeEditSet('t', 'accent', '#7c3aed', {cwd});
    expect(
      set.data.changedTokens.some(c => c.startsWith('--color-accent (light)')),
    ).toBe(true);
    expect(set.data.notes.join(' ')).toMatch(
      /accent-colored text (is|and icons are) #[0-9a-f]{6}/,
    );
    expect(JSON.parse(settingsOf('t')).settings).toEqual([
      {thing: 'accent', value: '#7c3aed', source: 'dial'},
    ]);
    const step = await themeEditSet('t', 'spacing', 'more', {cwd});
    expect(step.data.setting.value).toBe('roomy');
    const undo = await themeEditUndo('t', {cwd});
    expect(undo.data.undone).toEqual(['removed spacing = roomy (whole theme)']);
    await themeEditReset('t', 'accent', {cwd});
    expect(JSON.parse(settingsOf('t')).settings).toEqual(
      JSON.parse(start).settings,
    );
    const r = await refusal(() => themeEditReset('t', 'accent', {cwd}));
    expect(r.code).toBe('ERR_THEME_NOT_SET');
  });

  it('show lists the settings and writes both pages', async () => {
    await themeEditSet('t', 'surfaces', 'outlined', {cwd});
    const r = await themeEditShow('t', {cwd, group: 'actions'});
    expect(r.data.settings.map(s => s.thing)).toContain('surfaces');
    expect(fs.readFileSync(path.join(cwd, r.data.sheet), 'utf8')).toContain(
      'astryx-button',
    );
    expect(r.data.sheetComponents).toBeGreaterThan(1);
    await themeEditReset('t', 'surfaces', {cwd});
  });
});

describe('explain on real parts, questions and settings', () => {
  it('a question names the banner text token, the direct property, and --when', async () => {
    const r = await themeEditExplain('white text in the banner', {cwd});
    expect(r.data.kind).toBe('question');
    expect(r.data.understood.parts).toContain('banner');
    const commands = r.data.results.flatMap(x => x.commands);
    expect(commands).toContain(
      'astryx experimental theme set <theme> color "#ffffff" --on banner   # direct: always works',
    );
    expect(
      r.data.results.some(x => x.text.includes('--when status:<value>')),
    ).toBe(true);
  });

  it('a question about soft shadows is answered with box-shadow and the shadow tokens', async () => {
    const r = await themeEditExplain('card soft shadow', {cwd});
    expect(r.data.results[0].commands[0]).toContain(
      'box-shadow "var(--shadow-low)" --on containers',
    );
  });

  it('explain lists what a part reads and its variants', async () => {
    const r = await themeEditExplain('banner', {cwd});
    const lines = /** @type {string[]} */ (r.data.lines).join('\n');
    expect(lines).toContain('--when status:');
    expect(lines).toMatch(/background +--color-info-muted/);
  });

  it('explain answers an aspect at the whole-theme level', async () => {
    const r = await themeEditExplain('colors', {cwd});
    expect(r.data.kind).toBe('aspect');
    expect(JSON.stringify(r.data)).toContain('--color-text-primary');
  });

  it('explains a token setting with its type and readers', async () => {
    const r = await themeEditExplain('--radius-element', {cwd});
    expect(r.data).toMatchObject({
      kind: 'setting',
      source: 'token',
      tokenType: 'size',
    });
  });

  it('--list tokens gives each token its type', async () => {
    const r = await themeEditExplain('radius-element', {cwd, list: 'tokens'});
    expect(r.data.items).toContainEqual(
      expect.objectContaining({name: '--radius-element', type: 'size'}),
    );
  });
});

describe('explain a picture', () => {
  /** A 4x2 RGB PNG: red, green, blue, white on top; black below. */
  function png() {
    const rows = [
      [0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ];
    /** @param {string} type @param {Buffer} body */
    const chunk = (type, body) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(body.length);
      return Buffer.concat([
        len,
        Buffer.from(type, 'latin1'),
        body,
        Buffer.alloc(4),
      ]);
    };
    const header = Buffer.alloc(13);
    header.writeUInt32BE(4, 0);
    header.writeUInt32BE(2, 4);
    header[8] = 8;
    header[9] = 2;
    return Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', header),
      chunk('IDAT', zlib.deflateSync(Buffer.from(rows.flat()))),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  }

  it('reads the exact color at points in plain Node', async () => {
    fs.writeFileSync(path.join(cwd, 'p.png'), png());
    const r = await themeEditExplain('p.png', {cwd, at: ['0,0;2,0', '3,1']});
    expect(r.data.points).toEqual([
      {at: '0,0', color: '#ff0000'},
      {at: '2,0', color: '#0000ff'},
      {at: '3,1', color: '#000000'},
    ]);
  });

  it('reads points in every accepted form', () => {
    expect(parsePoints(['1,2 3,4'])).toEqual([
      {x: 1, y: 2},
      {x: 3, y: 4},
    ]);
    expect(parsePoints(['1,2,3,4'])).toEqual([
      {x: 1, y: 2},
      {x: 3, y: 4},
    ]);
    expect(parsePoints(['1,2', '3,4'])).toEqual([
      {x: 1, y: 2},
      {x: 3, y: 4},
    ]);
  });

  it('refuses a file that is not a PNG', async () => {
    fs.writeFileSync(path.join(cwd, 'x.png'), 'nope');
    expect((await refusal(() => themeEditExplain('x.png', {cwd}))).code).toBe(
      'ERR_INVALID_ARGUMENT',
    );
  });
});

describe('the command', () => {
  it('takes a token name as the thing and refuses with exit 1 and a code in JSON', async () => {
    const r = await runCli(
      [
        '--json',
        'experimental',
        'theme',
        'set',
        't',
        '--color-on-info-muted',
        '#ffffff',
        '--on',
        'card',
      ],
      {cwd},
    );
    expect(r.status).toBe(1);
    const out = JSON.parse(r.stdout);
    expect(out.code).toBe('ERR_THEME_NO_EFFECT');
    expect(out.suggestions[0].name).toBe(
      'astryx experimental theme set t color "#ffffff" --on card',
    );
  });

  it('explains every subcommand in its help', async () => {
    const r = await runCli(['experimental', 'theme', 'set', '--help'], {cwd});
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('REFUSED');
    expect(r.stdout).toContain('--when <prop:value>');
  });

  it('names the stable command each experimental copy will replace', async () => {
    const compile = await runCli(
      ['experimental', 'theme', 'compile', '--help'],
      {cwd},
    );
    expect(compile.stdout).toContain('Will replace: astryx theme build');
    const fresh = await runCli(['experimental', 'theme', 'new', '--help'], {
      cwd,
    });
    expect(fresh.stdout).toContain(
      'Will replace: astryx theme template, astryx theme eject',
    );
  });
});
