// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Buttons, inputs, selectors and input groups share one height at
 * each size. A height set on a control is written as that size's token on
 * the controls group, so every control at that size moves with it, and it
 * replaces the other heights set on controls at that size. A saved height
 * that keeps one control apart is listed under missed, with the line that
 * makes it every control's height. Against a real bundled base theme.
 */

import fs from 'node:fs';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditHow,
  themeEditNew,
  themeEditSet,
  themeEditShow,
  themeEditUndo,
} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

/** Why a bundled theme could not be built here, when it could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-control-heights-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
}, 300_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {import('vitest').TestContext} ctx */
const needBases = ctx => {
  if (!unbuilt) return false;
  console.warn(`skipped: ${unbuilt}`);
  ctx.skip();
  return true;
};

/** @param {string} slug */
const settingsFile = slug =>
  path.join(cwd, 'themes', slug, `${slug}.settings.json`);

/** @param {string} slug */
const saved = slug => JSON.parse(fs.readFileSync(settingsFile(slug), 'utf8'));

/** @param {string} slug @param {any} data */
const save = (slug, data) =>
  fs.writeFileSync(settingsFile(slug), JSON.stringify(data, null, 2));

/**
 * The parts whose rule in the built CSS sets a token to a value.
 * @param {string} slug @param {string} token @param {string} value
 */
const partsSetting = (slug, token, value) =>
  [
    ...fs
      .readFileSync(path.join(cwd, 'themes', slug, `${slug}.css`), 'utf8')
      .matchAll(/([^{}]+)\{([^{}]*)\}/g),
  ]
    .filter(m => new RegExp(`${token}:\\s*${value}`).test(m[2]))
    .flatMap(m => [...m[1].matchAll(/\.astryx-([a-z][a-z0-9-]*)/g)])
    .map(m => m[1]);

/** @param {string} slug */
const heightMisses = async slug =>
  /** @type {any[]} */ (
    /** @type {any} */ ((await themeEditShow(slug, {cwd})).data).missed
  ).filter(m => /share one height at each size/.test(m.why));

describe('one control height per size', () => {
  it('a height on a button is the medium height of every control', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('one', {cwd, like: 'neutral'});
    const r = /** @type {any} */ (
      await themeEditSet('one', 'height', '31px', {cwd, on: 'button'})
    );
    expect(saved('one').settings).toEqual([
      expect.objectContaining({
        thing: '--size-element-md',
        value: '31px',
        source: 'token',
        on: 'controls',
      }),
    ]);
    expect(r.data.parts).toEqual(
      expect.arrayContaining([
        'button',
        'text-input',
        'selector',
        'input-group',
      ]),
    );
    expect(r.data.notes.join('\n')).toMatch(
      /is the height every control takes at md: written as --size-element-md on controls/,
    );
    const parts = partsSetting('one', '--size-element-md', '31px');
    for (const p of ['button', 'text-input', 'selector', 'input-group'])
      expect(parts).toContain(p);
    // A part that is not a control keeps the base's token.
    expect(parts).not.toContain('dialog-header');
  }, 240_000);

  it('a height with --when size:sm moves only the small controls', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('small', {cwd, like: 'neutral'});
    await themeEditSet('small', 'height', '24px', {
      cwd,
      on: 'text-input',
      when: 'size:sm',
    });
    expect(saved('small').settings).toEqual([
      expect.objectContaining({thing: '--size-element-sm', on: 'controls'}),
    ]);
  }, 240_000);

  it('--only keeps a height on its one input', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('alone', {cwd, like: 'neutral'});
    await themeEditSet('alone', 'height', '40px', {
      cwd,
      on: 'text-input',
      only: true,
    });
    // Its own size token, on it alone: the other controls keep theirs.
    expect(saved('alone').settings).toEqual([
      expect.objectContaining({
        thing: '--size-element-md',
        value: '40px',
        source: 'token',
        on: 'text-input',
      }),
    ]);
    expect(partsSetting('alone', '--size-element-md', '40px')).toEqual([
      'text-input',
    ]);
    expect(await heightMisses('alone')).toEqual([]);
  }, 240_000);

  it('a saved height that keeps a control apart is missed, and its line joins it to the others', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('split', {cwd, like: 'neutral'});
    // What an earlier editor saved: a button height at every size.
    const data = saved('split');
    data.settings.push({
      thing: 'height',
      value: '31px',
      source: 'property',
      on: 'button',
    });
    save('split', data);
    const before = await heightMisses('split');
    expect(before).toHaveLength(1);
    expect(before[0].part).toBe('button');
    expect(before[0].why).toMatch(
      /^button is 31px at every size, while the other controls are 28px at sm, 32px at md, 36px at lg/,
    );
    expect(before[0].line).toMatch(/ set split height 31px --on button$/);
    const r = /** @type {any} */ (
      await themeEditSet('split', 'height', '31px', {cwd, on: 'button'})
    );
    expect(r.data.notes.join('\n')).toMatch(
      /it replaces height = 31px on button/,
    );
    // It stays every control's height at the other sizes too.
    expect(saved('split').settings).toEqual([
      expect.objectContaining({
        thing: '--size-element-sm',
        value: '31px',
        on: 'controls',
      }),
      expect.objectContaining({
        thing: '--size-element-lg',
        value: '31px',
        on: 'controls',
      }),
      expect.objectContaining({
        thing: '--size-element-md',
        value: '31px',
        on: 'controls',
      }),
    ]);
    expect(await heightMisses('split')).toEqual([]);
  }, 240_000);

  it('controls set apart one by one are each missed until one height joins them', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('apart', {cwd, like: 'neutral'});
    const data = saved('apart');
    for (const [on, value] of [
      ['button', '20px'],
      ['text-input', '21px'],
    ])
      data.settings.push({thing: 'height', value, source: 'property', on});
    save('apart', data);
    expect((await heightMisses('apart')).map(m => m.part).sort()).toEqual([
      'button',
      'text-input',
    ]);
    await themeEditSet('apart', 'height', '21px', {cwd, on: 'text-input'});
    // The later of the two every-size heights stays at the other sizes; the
    // parts it reached that are not controls keep it.
    expect(saved('apart').settings).toEqual([
      expect.objectContaining({thing: 'height', on: 'text-area', only: true}),
      expect.objectContaining({
        thing: 'height',
        on: 'complex-selector',
        only: true,
      }),
      expect.objectContaining({thing: '--size-element-sm', value: '21px'}),
      expect.objectContaining({thing: '--size-element-lg', value: '21px'}),
      expect.objectContaining({thing: '--size-element-md', value: '21px'}),
    ]);
    expect(await heightMisses('apart')).toEqual([]);
  }, 240_000);

  it('a height on a text area stays on it: the inputs drawn alike are controls and keep the shared height', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('rows', {cwd, like: 'neutral'});
    const r = /** @type {any} */ (
      await themeEditSet('rows', 'height', 'auto', {cwd, on: 'text-area'})
    );
    expect(r.data.parts).toContain('text-area');
    expect(r.data.parts).not.toContain('text-input');
    expect(r.data.parts).not.toContain('selector');
    expect(await heightMisses('rows')).toEqual([]);
  }, 240_000);

  it("a padding on the inputs reaches a selector only at its sides, so it keeps the small controls' height", async ctx => {
    if (needBases(ctx)) return;
    // Bootstrap pads its inputs 4px on every side; at the small size a
    // selector padded so would be taller than the 25px controls beside it.
    await themeEditNew('padded', {cwd, like: 'neutral'});
    await themeEditSet('padded', 'padding', '4px', {cwd, on: 'inputs'});
    await themeEditSet('padded', 'height', '25px', {
      cwd,
      on: 'button',
      when: 'size:sm',
    });
    const css = fs.readFileSync(
      path.join(cwd, 'themes', 'padded', 'padded.css'),
      'utf8',
    );
    /** @param {string} cls */
    const rule = cls =>
      [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter(m => m[1].trim() === cls)
        .map(m => m[2])
        .join(';');
    expect(rule('.astryx-selector')).not.toMatch(
      /(^|;)\s*padding(-top|-bottom|-block)?\s*:/,
    );
    expect(rule('.astryx-selector')).toMatch(
      /padding-(left|right|inline-start|inline-end)\s*:\s*4px/,
    );
    expect(rule('.astryx-text-input')).toMatch(/padding/);
    expect(await heightMisses('padded')).toEqual([]);
  }, 240_000);

  it('--only keeps a height on its one button', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('ownbtn', {cwd, like: 'neutral'});
    await themeEditSet('ownbtn', 'height', '31px', {
      cwd,
      on: 'button',
      only: true,
    });
    expect(saved('ownbtn').settings).toEqual([
      expect.objectContaining({thing: '--size-element-md', on: 'button'}),
    ]);
    expect(partsSetting('ownbtn', '--size-element-md', '31px')).toEqual([
      'button',
    ]);
    // The same height set again keeps it.
    await themeEditSet('ownbtn', 'height', '31px', {
      cwd,
      on: 'button',
      only: true,
    });
    expect(saved('ownbtn').settings).toHaveLength(1);
  }, 240_000);

  it('a date and time input is a control: the shared height reaches it, a text area height does not', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('dt', {cwd, like: 'neutral'});
    const r = /** @type {any} */ (
      await themeEditSet('dt', 'height', '30px', {cwd, on: 'button'})
    );
    expect(r.data.parts).toContain('date-time-input');
    const t = /** @type {any} */ (
      await themeEditSet('dt', 'height', 'auto', {cwd, on: 'text-area'})
    );
    expect(t.data.parts).not.toContain('date-time-input');
  }, 240_000);

  it("a saved height for every size stays every control's height at the sizes a new one does not set", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('kept', {cwd, like: 'neutral'});
    const data = saved('kept');
    data.settings = [
      {thing: 'height', value: '31px', source: 'property', on: 'button'},
    ];
    save('kept', data);
    await themeEditSet('kept', 'height', '25px', {
      cwd,
      on: 'button',
      when: 'size:sm',
    });
    const tokens = Object.fromEntries(
      saved('kept')
        .settings.filter((/** @type {any} */ x) => x.on === 'controls')
        .map((/** @type {any} */ x) => [x.thing, x.value]),
    );
    expect(tokens).toEqual({
      '--size-element-sm': '25px',
      '--size-element-md': '31px',
      '--size-element-lg': '31px',
    });
    expect(
      saved('kept').settings.some(
        (/** @type {any} */ x) => x.thing === 'height',
      ),
    ).toBe(false);
  }, 240_000);

  it('a top or bottom padding alone on a selector is refused: its height sets them', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('padtop', {cwd, like: 'neutral'});
    await expect(
      themeEditSet('padtop', 'padding-top', '6px', {
        cwd,
        on: 'selector',
        only: true,
      }),
    ).rejects.toThrow(/keeps Core's top and bottom padding/);
    const r = /** @type {any} */ (
      await themeEditSet('padtop', 'padding-top', '6px', {cwd, on: 'inputs'})
    );
    expect(JSON.stringify(r.data.notes ?? r.notes ?? r)).toMatch(
      /selector[^"]*keep Core's top and bottom padding/,
    );
  }, 240_000);

  it('the same shared height set twice stays, and a word is not a height', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('twice', {cwd, like: 'neutral'});
    await themeEditSet('twice', 'height', '31px', {cwd, on: 'button'});
    await themeEditSet('twice', 'height', '31px', {cwd, on: 'text-input'});
    expect(saved('twice').settings).toEqual([
      expect.objectContaining({thing: '--size-element-md', value: '31px'}),
    ]);
    await expect(
      themeEditSet('twice', 'height', 'auto', {cwd, on: 'button'}),
    ).rejects.toThrow(/auto is not a size/);
  }, 240_000);

  it('a height on a group names a member for the one-control line', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('grp', {cwd, like: 'neutral'});
    const r = /** @type {any} */ (
      await themeEditSet('grp', 'height', '30px', {cwd, on: 'inputs'})
    );
    const note = r.data.notes.find((/** @type {string} */ n) =>
      /one control alone/.test(n),
    );
    expect(note).toMatch(/ --on (?!inputs\b)[a-z-]+ --only/);
  }, 240_000);

  it('undo of a control height named as it was set removes its size token', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('back', {cwd, like: 'neutral'});
    await themeEditSet('back', 'height', '31px', {cwd, on: 'button'});
    await themeEditUndo('back', {cwd, thing: 'height', on: 'button'});
    expect(saved('back').settings).toEqual([]);
  }, 240_000);

  it('a saved word height on controls or a top padding alone on a selector still opens; a new set of either is refused', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('older', {cwd, like: 'neutral'});
    // What an earlier editor saved.
    const data = saved('older');
    data.settings.push(
      {thing: 'height', value: 'auto', source: 'property', on: 'button'},
      {thing: 'height', value: 'auto', source: 'property', on: 'inputs'},
      {
        thing: 'padding-top',
        value: '6px',
        source: 'property',
        on: 'selector',
        only: true,
      },
    );
    save('older', data);
    await themeEditShow('older', {cwd});
    await themeEditSet('older', 'corners', 'round', {cwd});
    expect(saved('older').settings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({thing: 'height', on: 'button'}),
        expect.objectContaining({thing: 'height', on: 'inputs'}),
        expect.objectContaining({thing: 'padding-top', on: 'selector'}),
      ]),
    );
    await expect(
      themeEditSet('older', 'height', 'auto', {cwd, on: 'text-input'}),
    ).rejects.toMatchObject({code: 'ERR_THEME_BAD_VALUE'});
    await expect(
      themeEditSet('older', 'padding-bottom', '6px', {
        cwd,
        on: 'selector',
        only: true,
      }),
    ).rejects.toMatchObject({code: 'ERR_THEME_NO_EFFECT'});
  }, 240_000);

  it('a word height on a button variant that is not a size stays on that variant', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('variant', {cwd, like: 'neutral'});
    await themeEditSet('variant', 'height', 'auto', {
      cwd,
      on: 'button',
      when: 'variant:secondary',
    });
    expect(saved('variant').settings).toEqual([
      expect.objectContaining({
        thing: 'height',
        value: 'auto',
        source: 'property',
        on: 'button',
        when: 'variant:secondary',
      }),
    ]);
  }, 240_000);

  it('a least height on a button of fixed height stays on the button', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('floor', {cwd, like: 'neutral'});
    await themeEditSet('floor', 'min-height', '0', {cwd, on: 'button'});
    expect(saved('floor').settings).toEqual([
      expect.objectContaining({
        thing: 'min-height',
        value: '0',
        source: 'property',
        on: 'button',
      }),
    ]);
    expect(partsSetting('floor', '--size-element-md', '0')).toEqual([]);
  }, 240_000);

  it('a saved height on the inputs that a control height replaces stays on the text area', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('area', {cwd, like: 'neutral'});
    const data = saved('area');
    data.settings.push({
      thing: 'height',
      value: '40px',
      source: 'property',
      on: 'inputs',
    });
    save('area', data);
    const r = /** @type {any} */ (
      await themeEditSet('area', 'height', '30px', {cwd, on: 'button'})
    );
    expect(saved('area').settings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          thing: 'height',
          value: '40px',
          source: 'property',
          on: 'text-area',
        }),
        expect.objectContaining({
          thing: '--size-element-md',
          value: '30px',
          on: 'controls',
        }),
      ]),
    );
    expect(r.data.notes.join('\n')).toMatch(/text-area keeps 40px/);
  }, 240_000);

  it('a height on the inputs names the members that are not controls, which it does not reach', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('mixed', {cwd, like: 'neutral'});
    const r = /** @type {any} */ (
      await themeEditSet('mixed', 'height', '40px', {cwd, on: 'inputs'})
    );
    expect(r.data.notes.join('\n')).toMatch(
      /text-area(, [a-z-]+)* (is not a control|are not controls) and keeps? (its|their) own height \(for this height there too: [^\n]* set mixed height 40px --on text-area\b/,
    );
  }, 240_000);

  it('a height that reads the size token it is written as is refused', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('self', {cwd, like: 'neutral'});
    await expect(
      themeEditSet('self', 'height', 'calc(var(--size-element-md) + 4px)', {
        cwd,
        on: 'button',
      }),
    ).rejects.toThrow(/would read itself/);
    // Another size's token is not itself.
    await themeEditSet('self', 'height', 'calc(var(--size-element-sm) + 4px)', {
      cwd,
      on: 'button',
    });
    expect(saved('self').settings).toEqual([
      expect.objectContaining({thing: '--size-element-md', on: 'controls'}),
    ]);
  }, 240_000);

  it('a height on a text area stays on the text area', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('tall', {cwd, like: 'neutral'});
    const r = /** @type {any} */ (
      await themeEditSet('tall', 'height', '120px', {cwd, on: 'text-area'})
    );
    expect(r.data.parts).toEqual(['text-area']);
  }, 240_000);

  it('a saved top padding alone on a selector is said not to build', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('oldpad', {cwd, like: 'neutral'});
    const data = saved('oldpad');
    data.settings.push({
      thing: 'padding-top',
      value: '9px',
      source: 'property',
      on: 'selector',
      only: true,
    });
    save('oldpad', data);
    const shown = JSON.stringify(
      /** @type {any} */ (await themeEditShow('oldpad', {cwd})).data,
    );
    expect(shown).toMatch(/those top and bottom sides no longer build/);
    expect(shown).not.toMatch(
      /padding-top[^"]*kept and built as an earlier editor/,
    );
  }, 240_000);

  it('a saved height that is not a size is not counted as missed', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('word', {cwd, like: 'neutral'});
    const data = saved('word');
    data.settings.push({
      thing: 'height',
      value: 'auto',
      source: 'property',
      on: 'button',
    });
    save('word', data);
    expect(await heightMisses('word')).toEqual([]);
    const r = /** @type {any} */ (
      await themeEditSet('word', 'gap', '8px', {cwd, on: 'card'})
    );
    expect(JSON.stringify(r.data.missed ?? 0)).not.toMatch(/button/);
  }, 240_000);
  it('a carried height that reads the size tokens keeps the heights it showed at the other sizes', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('carry', {cwd, like: 'neutral'});
    const data = saved('carry');
    data.settings.push({
      thing: 'height',
      value: 'calc(var(--size-element-sm) + 4px)',
      source: 'property',
      on: 'button',
    });
    save('carry', data);
    await themeEditSet('carry', 'height', '31px', {cwd, on: 'button'});
    const tokens = Object.fromEntries(
      saved('carry')
        .settings.filter((/** @type {any} */ x) => x.on === 'controls')
        .map((/** @type {any} */ x) => [x.thing, x.value]),
    );
    // The button was 28px + 4px at every size; it stays so at sm and lg.
    expect(tokens).toEqual({
      '--size-element-sm': 'calc(28px + 4px)',
      '--size-element-lg': 'calc(28px + 4px)',
      '--size-element-md': '31px',
    });
  }, 240_000);

  it('a height in any CSS length unit is a control height; a percentage is not', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('units', {cwd, like: 'neutral'});
    await themeEditSet('units', 'height', '30pt', {cwd, on: 'button'});
    await themeEditSet('units', 'height', '2.5ch', {
      cwd,
      on: 'text-input',
      when: 'size:sm',
    });
    expect(saved('units').settings).toEqual([
      expect.objectContaining({thing: '--size-element-md', value: '30pt'}),
      expect.objectContaining({thing: '--size-element-sm', value: '2.5ch'}),
    ]);
    for (const value of ['calc(100% - 2px)', '50%'])
      await expect(
        themeEditSet('units', 'height', value, {cwd, on: 'button'}),
      ).rejects.toThrow(/is not a size/);
  }, 240_000);

  it("a control's height and its size token take the same values", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('same', {cwd, like: 'neutral'});
    // (A percentage is refused by both; a length CSS gives through env()
    // is taken by both.)
    for (const value of ['50%', 'calc(100% - 2px)']) {
      await expect(
        themeEditSet('same', 'height', value, {cwd, on: 'button'}),
        value,
      ).rejects.toThrow(/is not a size/);
      await expect(
        themeEditSet('same', '--size-element-md', value, {
          cwd,
          on: 'controls',
        }),
        value,
      ).rejects.toThrow(/is not a size/);
    }
    const env = 'env(safe-area-inset-top, 40px)';
    await themeEditSet('same', 'height', env, {cwd, on: 'button'});
    await themeEditSet('same', '--size-element-md', env, {
      cwd,
      on: 'controls',
    });
    expect(
      saved('same').settings.every(
        (/** @type {any} */ x) => x.thing === '--size-element-md',
      ),
    ).toBe(true);
  }, 240_000);

  it("a top padding on a file input's drop zone builds: only its field takes its height from the controls", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('drop', {cwd, like: 'neutral'});
    await themeEditSet('drop', 'padding-top', '20px', {
      cwd,
      on: 'file-input',
      when: 'mode:dropzone',
    });
    const css = fs.readFileSync(
      path.join(cwd, 'themes', 'drop', 'drop.css'),
      'utf8',
    );
    expect(css).toMatch(
      /\.astryx-file-input\[data-mode="dropzone"\][^{}]*\{[^{}]*padding-top:\s*20px/,
    );
  }, 240_000);

  it('a height that reads a size token set to read its own token back is refused, with or without --only', async ctx => {
    if (needBases(ctx)) return;
    for (const only of [false, true]) {
      const slug = only ? 'crossown' : 'cross';
      const flags = {cwd, on: 'button', ...(only ? {only: true} : {})};
      await themeEditNew(slug, {cwd, like: 'neutral'});
      await themeEditSet(slug, 'height', 'var(--size-element-lg)', flags);
      await expect(
        themeEditSet(slug, 'height', 'var(--size-element-md)', {
          ...flags,
          when: 'size:lg',
        }),
      ).rejects.toThrow(
        /reads --size-element-md, which reads --size-element-lg, which is the token this height is written as/,
      );
      expect(saved(slug).settings).toHaveLength(1);
    }
  }, 240_000);

  it('a carried height reads the size tokens as they were before the change, not as it sets them', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('carrynew', {cwd, like: 'neutral'});
    const data = saved('carrynew');
    data.settings.push({
      thing: 'height',
      value: 'calc(var(--size-element-sm) + 4px)',
      source: 'property',
      on: 'button',
    });
    save('carrynew', data);
    await themeEditSet('carrynew', 'height', '25px', {
      cwd,
      on: 'button',
      when: 'size:sm',
    });
    const tokens = Object.fromEntries(
      saved('carrynew')
        .settings.filter((/** @type {any} */ x) => x.on === 'controls')
        .map((/** @type {any} */ x) => [x.thing, x.value]),
    );
    expect(tokens).toEqual({
      '--size-element-sm': '25px',
      '--size-element-md': 'calc(28px + 4px)',
      '--size-element-lg': 'calc(28px + 4px)',
    });
  }, 240_000);

  it('a top padding on the whole file input reaches its drop zone, which does not grow with its content', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('dropall', {cwd, like: 'neutral'});
    const r = /** @type {any} */ (
      await themeEditSet('dropall', 'padding-top', '20px', {
        cwd,
        on: 'file-input',
        only: true,
      })
    );
    await themeEditSet('dropall', 'padding', '12px', {cwd, on: 'file-input'});
    const css = fs.readFileSync(
      path.join(cwd, 'themes', 'dropall', 'dropall.css'),
      'utf8',
    );
    /** @param {string} sel */
    const rule = sel =>
      [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter(m => m[1].trim() === sel)
        .map(m => m[2])
        .join(';');
    expect(rule('.astryx-file-input[data-mode="dropzone"]')).toMatch(
      /padding-bottom:\s*12px/,
    );
    expect(rule('.astryx-file-input')).not.toMatch(
      /padding-(top|bottom|block)[^:]*:/,
    );
    expect(r.data.notes.join('\n')).toMatch(
      /file-input takes them when mode:dropzone/,
    );
  }, 240_000);

  it('a height on a group that mixes controls with other parts stays a plain height on that group', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('mixedgroup', {cwd, like: 'neutral'});
    for (const on of ['accent-fills', 'inset-fields']) {
      await themeEditSet('mixedgroup', 'height', '30px', {cwd, on});
      expect(saved('mixedgroup').settings).toContainEqual(
        expect.objectContaining({
          thing: 'height',
          value: '30px',
          source: 'property',
          on,
        }),
      );
    }
    expect(
      saved('mixedgroup').settings.some(
        (/** @type {any} */ x) => x.on === 'controls',
      ),
    ).toBe(false);
  }, 240_000);

  it('--only on a control height that stays a plain height (a variant that is not a size, a state) is saved without it', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('onlyplain', {cwd, like: 'neutral'});
    await themeEditSet('onlyplain', 'height', '40px', {
      cwd,
      on: 'button',
      only: true,
      when: 'variant:secondary',
    });
    await themeEditSet('onlyplain', 'height', '42px', {
      cwd,
      on: 'button',
      only: true,
      state: 'hover',
    });
    const settings = saved('onlyplain').settings;
    expect(settings).toEqual([
      expect.objectContaining({thing: 'height', when: 'variant:secondary'}),
      expect.objectContaining({thing: 'height', state: 'hover'}),
    ]);
    for (const x of settings) expect(x.only).toBeUndefined();
  }, 240_000);

  it("a control height replaces a mixed group's plain height on its controls, which show joins without --only", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('mixshow', {cwd, like: 'neutral'});
    await themeEditSet('mixshow', 'height', '30px', {cwd, on: 'accent-fills'});
    const misses = await heightMisses('mixshow');
    expect(misses.length).toBeGreaterThan(0);
    for (const m of misses) {
      expect(m.line).not.toMatch(/--only/);
      expect(m.line).not.toMatch(/--on accent-fills/);
    }
    await themeEditSet('mixshow', 'height', '31px', {cwd, on: 'button'});
    const settings = saved('mixshow').settings;
    expect(settings).toContainEqual(
      expect.objectContaining({
        thing: '--size-element-md',
        value: '31px',
        on: 'controls',
      }),
    );
    expect(
      settings.some((/** @type {any} */ x) => x.on === 'accent-fills'),
    ).toBe(false);
    // The parts of the group that are not controls keep its height.
    expect(settings).toContainEqual(
      expect.objectContaining({thing: 'height', value: '30px'}),
    );
    expect(partsSetting('mixshow', 'height', '30px')).not.toContain('button');
  }, 240_000);

  it('--only replaces the plain height saved for that control, which would beat its own size token', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('ownplain', {cwd, like: 'neutral'});
    const data = saved('ownplain');
    data.settings.push({
      thing: 'height',
      value: '31px',
      source: 'property',
      on: 'button',
    });
    save('ownplain', data);
    const r = /** @type {any} */ (
      await themeEditSet('ownplain', 'height', '40px', {
        cwd,
        on: 'button',
        only: true,
      })
    );
    const settings = saved('ownplain').settings;
    expect(settings.some((/** @type {any} */ x) => x.thing === 'height')).toBe(
      false,
    );
    const own = Object.fromEntries(
      settings
        .filter((/** @type {any} */ x) => x.on === 'button')
        .map((/** @type {any} */ x) => [x.thing, x.value]),
    );
    // Its other sizes keep the height it had there.
    expect(own).toEqual({
      '--size-element-md': '40px',
      '--size-element-sm': '31px',
      '--size-element-lg': '31px',
    });
    expect(r.data.notes.join('\n')).toMatch(
      /it replaces height = 31px on button$/m,
    );
  }, 240_000);

  it('--only on a text input narrows a plain height saved on the inputs to the other inputs', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('ownnarrow', {cwd, like: 'neutral'});
    const data = saved('ownnarrow');
    data.settings.push({
      thing: 'height',
      value: '31px',
      source: 'property',
      on: 'inputs',
    });
    save('ownnarrow', data);
    await themeEditSet('ownnarrow', 'height', '40px', {
      cwd,
      on: 'text-input',
      only: true,
    });
    const settings = saved('ownnarrow').settings;
    expect(settings.some((/** @type {any} */ x) => x.on === 'inputs')).toBe(
      false,
    );
    expect(
      settings.some(
        (/** @type {any} */ x) => x.thing === 'height' && x.on === 'text-input',
      ),
    ).toBe(false);
    expect(settings).toContainEqual(
      expect.objectContaining({
        thing: '--size-element-md',
        value: '40px',
        on: 'text-input',
      }),
    );
    expect(settings).toContainEqual(
      expect.objectContaining({thing: 'height', value: '31px', on: 'selector'}),
    );
    expect(partsSetting('ownnarrow', '--size-element-md', '40px')).toEqual([
      'text-input',
    ]);
    // The other inputs still draw 31px beside the buttons: show lists them.
    // (Only the copies on controls count: a text area keeps the height
    // as its own.)
    const listed = (await heightMisses('ownnarrow')).map(m => m.part);
    const copied = settings
      .filter(
        (/** @type {any} */ x) =>
          x.thing === 'height' &&
          x.value === '31px' &&
          x.only === true &&
          listed.includes(String(x.on)),
      )
      .map((/** @type {any} */ x) => String(x.on));
    expect(copied).toContain('selector');
    // A later shared height joins them, never as their own size tokens.
    await themeEditSet('ownnarrow', 'height', '32px', {cwd, on: 'button'});
    const after = saved('ownnarrow').settings;
    for (const on of copied)
      expect(
        after.some(
          (/** @type {any} */ x) =>
            x.on === on && /^--size-element-|^height$/.test(x.thing),
        ),
        on,
      ).toBe(false);
    expect(
      (await heightMisses('ownnarrow'))
        .map(m => m.part)
        .filter(p => copied.includes(p)),
    ).toEqual([]);
  }, 240_000);

  it('the narrowed copies stay the group height when one of them is undone', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('narrowundo', {cwd, like: 'neutral'});
    const data = saved('narrowundo');
    data.settings.push({
      thing: 'height',
      value: '31px',
      source: 'property',
      on: 'inputs',
    });
    save('narrowundo', data);
    await themeEditSet('narrowundo', 'height', '40px', {
      cwd,
      on: 'text-input',
      only: true,
    });
    const before = (await heightMisses('narrowundo')).map(m => m.part);
    await themeEditUndo('narrowundo', {
      cwd,
      thing: 'height',
      on: 'selector',
      only: true,
    });
    const left = saved('narrowundo')
      .settings.filter(
        (/** @type {any} */ x) =>
          x.thing === 'height' &&
          x.value === '31px' &&
          x.only === true &&
          before.includes(String(x.on)),
      )
      .map((/** @type {any} */ x) => String(x.on));
    expect(before).toContain('selector');
    expect(left).not.toContain('selector');
    expect(left.length).toBeGreaterThan(0);
    const listed = (await heightMisses('narrowundo')).map(m => m.part);
    for (const on of left) expect(listed, on).toContain(on);
  }, 240_000);

  it('a height an older editor saved on one input with --only stays its own at the other sizes', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('oldonly', {cwd, like: 'neutral'});
    const data = saved('oldonly');
    data.settings.push({
      thing: 'height',
      value: '40px',
      source: 'property',
      on: 'text-input',
      only: true,
    });
    save('oldonly', data);
    await themeEditSet('oldonly', 'height', '32px', {cwd, on: 'button'});
    const settings = saved('oldonly').settings;
    const own = Object.fromEntries(
      settings
        .filter((/** @type {any} */ x) => x.on === 'text-input')
        .map((/** @type {any} */ x) => [x.thing, x.value]),
    );
    expect(own).toEqual({
      '--size-element-sm': '40px',
      '--size-element-lg': '40px',
    });
    // (Never carried to every control at the other sizes.)
    expect(
      settings.some(
        (/** @type {any} */ x) => x.on === 'controls' && x.value === '40px',
      ),
    ).toBe(false);
  }, 240_000);

  it('a saved word height is not carried as a size token', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('wordcarry', {cwd, like: 'neutral'});
    const data = saved('wordcarry');
    data.settings.push({
      thing: 'height',
      value: 'auto',
      source: 'property',
      on: 'button',
    });
    save('wordcarry', data);
    await themeEditSet('wordcarry', 'height', '31px', {cwd, on: 'button'});
    const after = saved('wordcarry').settings;
    expect(
      after.filter(
        (/** @type {any} */ x) =>
          /^--size-element-/.test(x.thing) && String(x.value) === 'auto',
      ),
    ).toEqual([]);
  }, 240_000);

  it('a shared height replaces a height kept on one control at that size, and says so', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('ownshared', {cwd, like: 'neutral'});
    await themeEditSet('ownshared', 'height', '40px', {
      cwd,
      on: 'button',
      only: true,
    });
    const r = /** @type {any} */ (
      await themeEditSet('ownshared', 'height', '31px', {
        cwd,
        on: 'text-input',
      })
    );
    expect(saved('ownshared').settings).toEqual([
      expect.objectContaining({
        thing: '--size-element-md',
        value: '31px',
        on: 'controls',
      }),
    ]);
    expect(r.data.notes.join('\n')).toMatch(
      /it replaces height = 40px on button, which was kept on button alone/,
    );
    expect(partsSetting('ownshared', '--size-element-md', '40px')).toEqual([]);
  }, 240_000);

  it('a saved --only height on a part that is not a control, beside a plain one, gives way to the later and the theme keeps opening', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('cardonly', {cwd, like: 'neutral'});
    const data = saved('cardonly');
    data.settings.push(
      {
        thing: 'height',
        value: '64px',
        source: 'property',
        on: 'card',
        only: true,
      },
      {thing: 'height', value: '56px', source: 'property', on: 'card'},
    );
    save('cardonly', data);
    await themeEditSet('cardonly', 'corners', 'round', {cwd});
    await themeEditSet('cardonly', 'spacing', 'roomy', {cwd});
    await themeEditShow('cardonly', {cwd});
    expect(
      saved('cardonly').settings.filter(
        (/** @type {any} */ x) => x.thing === 'height' && x.on === 'card',
      ),
    ).toEqual([
      {thing: 'height', value: '56px', source: 'property', on: 'card'},
    ]);
  }, 240_000);

  it("a control height replacing a group's size token keeps it on the group's parts that are not controls and read it", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('grouptoken', {cwd, like: 'neutral'});
    const data = saved('grouptoken');
    // What how, given a picture, wrote before.
    data.settings.push({
      thing: '--size-element-md',
      value: '40px',
      source: 'token',
      on: 'inputs',
    });
    save('grouptoken', data);
    await themeEditSet('grouptoken', 'height', '31px', {cwd, on: 'button'});
    const settings = saved('grouptoken').settings;
    expect(settings.some((/** @type {any} */ x) => x.on === 'inputs')).toBe(
      false,
    );
    expect(settings).toContainEqual(
      expect.objectContaining({
        thing: '--size-element-md',
        value: '31px',
        on: 'controls',
      }),
    );
    expect(settings).toContainEqual(
      expect.objectContaining({
        thing: '--size-element-md',
        value: '40px',
        on: 'complex-selector',
      }),
    );
    expect(partsSetting('grouptoken', '--size-element-md', '40px')).toEqual([
      'complex-selector',
    ]);
  }, 240_000);

  it('a size token saved on the button-like parts is a control height show lists', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('picbtn', {cwd, like: 'neutral'});
    // (An earlier picture answer wrote the medium size token on the
    // button-like parts only.)
    const data = saved('picbtn');
    data.settings.push({
      thing: '--size-element-md',
      value: '28px',
      source: 'token',
      on: 'button-like',
    });
    save('picbtn', data);
    const missed = await heightMisses('picbtn');
    expect(missed.length).toBe(1);
    expect(JSON.stringify(missed[0])).toMatch(/height 28px --on button\b/);
  }, 240_000);

  it('a compact select offers no block padding line, as its padding never sets its height', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('cmpsel', {cwd, like: 'neutral'});
    const {data} = /** @type {any} */ (
      await themeEditHow('selects compact', {cwd, theme: 'cmpsel'})
    );
    const [first] = data.results;
    expect(first.commands.join(' ;; ')).not.toMatch(/padding-block/);
    expect(first.text).not.toMatch(/second line/);
  }, 120_000);

  it('a padding on the file input under another condition still reaches its drop zone there', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('dropwhen', {cwd, like: 'neutral'});
    const r = /** @type {any} */ (
      await themeEditSet('dropwhen', 'padding', '20px', {
        cwd,
        on: 'file-input',
        when: 'status:error',
      })
    );
    const css = fs.readFileSync(
      path.join(cwd, 'themes', 'dropwhen', 'dropwhen.css'),
      'utf8',
    );
    const zone = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(
        m =>
          /\.astryx-file-input/.test(m[1]) &&
          /data-mode="dropzone"/.test(m[1]) &&
          /data-status="error"/.test(m[1]),
      )
      .map(m => m[2])
      .join(';');
    expect(zone).toMatch(/padding-top:\s*20px/);
    expect(r.data.notes.join('\n')).toMatch(
      /file-input takes them when status:error\+mode:dropzone/,
    );
  }, 240_000);
});
