// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A saved setting's reach is pinned: each setting that reaches beyond its
 * own part records the parts it reached when it was made (`reached`, kept by
 * the setting's identity), and the build, show and the previews keep it there. Parts its
 * family gains later are offered once, with the same line that takes them,
 * and never applied. A setting with no record yet is recorded as it
 * reaches, with no word. `--only` on a setting the theme already holds
 * replaces it, so the look leaves the group, and a theme saved with both
 * still builds as it did. Against real bundled base themes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {themeEditNew, themeEditSet, themeEditUndo} from './theme-edit.mjs';
import {context} from './_context.mjs';
import {earlierReach, partsOf} from './_settings.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-saved-reach-', FIXTURE_PACKAGES);
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

const BIN = path.resolve(
  import.meta.dirname,
  '../../clients/cli/bin/astryx.mjs',
);

/** The text a person reads for a command, run as they run it. @param {string[]} args */
const cliText = args =>
  spawnSync(
    process.execPath,
    [BIN, 'experimental', 'theme', 'editor', ...args],
    {cwd, encoding: 'utf8', env: {...process.env, CI: '1'}},
  ).stdout;

/**
 * Makes the record of each saved setting whose key starts with `prefix`
 * hold only the part it is set on, as an editor whose groups were smaller
 * saved it.
 * @param {string} slug @param {string} prefix
 */
const narrowRecord = (slug, prefix) => {
  const data = saved(slug);
  for (const k of Object.keys(data.reached ?? {}))
    if (k.startsWith(prefix)) data.reached[k] = [k.split('|')[2]];
  save(slug, data);
};

/** @param {string} slug */
const settingsFile = slug =>
  path.join(cwd, 'themes', slug, `${slug}.settings.json`);

/** @param {string} slug */
const saved = slug => JSON.parse(fs.readFileSync(settingsFile(slug), 'utf8'));

/** @param {string} slug @param {any} data */
const save = (slug, data) =>
  fs.writeFileSync(settingsFile(slug), JSON.stringify(data, null, 2));

/** @param {string} slug @param {string} prop */
const partsWith = (slug, prop) =>
  [
    ...fs
      .readFileSync(path.join(cwd, 'themes', slug, `${slug}.css`), 'utf8')
      .matchAll(/([^{}]+)\{([^{}]*)\}/g),
  ]
    .filter(m => m[2].includes(`${prop}:`))
    .flatMap(m => [...m[1].matchAll(/\.astryx-([a-z][a-z0-9-]*)/g)])
    .map(m => m[1]);

describe('a saved setting and how far it reaches', () => {
  it('a setting keeps the reach it was made with; parts its family gains are offered once, never applied', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('grow', {cwd, like: 'neutral'});
    await themeEditSet('grow', 'border-color', '#ff0000', {
      cwd,
      on: 'text-input',
    });
    // The theme as an editor that reached only the field it named saved it.
    const data = saved('grow');
    const key = /** @type {string} */ (
      Object.keys(data.reached ?? {}).find(k => k.startsWith('border-color|'))
    );
    expect(data.reached[key]).toEqual(expect.arrayContaining(['text-area']));
    data.reached[key] = ['text-input'];
    save('grow', data);

    const r = /** @type {any} */ (
      await themeEditSet('grow', 'corners', '4px', {cwd})
    );
    // Built as recorded: the field gained since is not given the color.
    expect(partsWith('grow', 'border-color')).toContain('text-input');
    expect(partsWith('grow', 'border-color')).not.toContain('text-area');
    const offered = /** @type {any[]} */ (r.data.offered ?? []);
    expect(offered).toHaveLength(1);
    expect(offered[0].setting).toMatch(/^border-color = #ff0000 on text-input/);
    expect(offered[0].parts).toEqual(expect.arrayContaining(['text-area']));
    expect(offered[0].run).toMatch(/set grow border-color .*--on text-input/);
    expect(offered[0].run).not.toContain('--only');
    // Said once; the record is unchanged, so the offer stands.
    const again = /** @type {any} */ (
      await themeEditSet('grow', 'corners', '6px', {cwd})
    );
    expect(again.data.offered ?? []).toEqual([]);
    expect(partsWith('grow', 'border-color')).not.toContain('text-area');
    // The same change again, while the offer stands, changes nothing and
    // adds no undo step.
    const same = /** @type {any} */ (
      await themeEditSet('grow', 'corners', '6px', {cwd})
    );
    expect(same.data.notes.join('\n')).toMatch(/^no change: /m);
    // The offered line takes the parts and records the whole reach.
    await themeEditSet('grow', 'border-color', '#ff0000', {
      cwd,
      on: 'text-input',
    });
    expect(partsWith('grow', 'border-color')).toContain('text-area');
    expect(saved('grow').reached[key]).toEqual(
      expect.arrayContaining(['text-input', 'text-area']),
    );
    // An undo of the taken offer names the parts it takes back.
    const u = /** @type {any} */ (await themeEditUndo('grow', {cwd}));
    expect(u.data.undid).toMatch(/border-color .*on .*text-area/);
    expect(partsWith('grow', 'border-color')).not.toContain('text-area');
  }, 240_000);

  it('a setting saved with no record is recorded as it reaches, with no word', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('old', {cwd, like: 'neutral'});
    await themeEditSet('old', 'border-color', '#ff0000', {
      cwd,
      on: 'text-input',
    });
    const data = saved('old');
    delete data.reached;
    save('old', data);
    const r = /** @type {any} */ (
      await themeEditSet('old', 'corners', '4px', {cwd})
    );
    expect(r.data.offered ?? []).toEqual([]);
    expect(partsWith('old', 'border-color')).toContain('text-area');
    const rec = saved('old').reached ?? {};
    expect(
      rec[
        /** @type {string} */ (
          Object.keys(rec).find(k => k.startsWith('border-color|'))
        )
      ],
    ).toEqual(expect.arrayContaining(['text-area']));
  }, 240_000);

  it('a family setting an earlier editor saved keeps its own part; its family is offered', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('rel', {cwd, like: 'neutral'});
    await themeEditSet(
      'rel',
      'background-image',
      'linear-gradient(#ffffff, #e6e6e6)',
      {
        cwd,
        on: 'button',
      },
    );
    expect(partsWith('rel', 'background-image')).toContain('toggle-button');
    // (As an editor that reached only the part named saved it: no record.)
    const data = saved('rel');
    delete data.reached;
    save('rel', data);
    const r = /** @type {any} */ (
      await themeEditSet('rel', 'corners', '4px', {cwd})
    );
    expect(partsWith('rel', 'background-image')).toContain('button');
    expect(partsWith('rel', 'background-image')).not.toContain('toggle-button');
    const offer = (r.data.offered ?? []).find((/** @type {any} */ o) =>
      o.setting.startsWith('background-image'),
    );
    expect(offer?.parts).toEqual(expect.arrayContaining(['toggle-button']));
    expect(offer?.run).toMatch(/--on button$/);
  }, 240_000);

  it("a menu's setting an earlier editor saved keeps that menu; the rest is offered", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('menu', {cwd, like: 'neutral'});
    await themeEditSet('menu', 'border-radius', '3px', {
      cwd,
      on: 'context-menu',
    });
    const data = saved('menu');
    delete data.reached;
    save('menu', data);
    const r = /** @type {any} */ (
      await themeEditSet('menu', 'corners', '4px', {cwd})
    );
    expect(partsWith('menu', 'border-radius')).toContain('context-menu');
    expect(partsWith('menu', 'border-radius')).not.toContain('dropdown-menu');
    expect(
      (r.data.offered ?? []).some((/** @type {any} */ o) =>
        o.setting.startsWith('border-radius'),
      ),
    ).toBe(true);
  }, 240_000);

  it('a part setting saved with no record keeps its part, and its family is offered', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('fam', {cwd, like: 'neutral'});
    await themeEditSet(
      'fam',
      'background-image',
      'linear-gradient(#ffffff, #e6e6e6)',
      {
        cwd,
        on: 'button',
      },
    );
    const data = saved('fam');
    delete data.reached;
    save('fam', data);
    const r = /** @type {any} */ (
      await themeEditSet('fam', 'corners', '4px', {cwd})
    );
    // (It keeps the reach it was saved with; the rest of its family is
    // offered with the line that takes it.)
    const offered = /** @type {any[]} */ (r.data.offered ?? []);
    expect(offered).toHaveLength(1);
    expect(offered[0].parts).toEqual(expect.arrayContaining(['toggle-button']));
    expect(offered[0].run).toMatch(/--on button$/);
  }, 240_000);

  it('an input setting saved with no record keeps the members it matched; the rest are offered', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('inp', {cwd, like: 'neutral'});
    await themeEditSet('inp', 'padding-inline', '9px', {cwd, on: 'text-input'});
    const data = saved('inp');
    delete data.reached;
    save('inp', data);
    const r = /** @type {any} */ (
      await themeEditSet('inp', 'corners', '4px', {cwd})
    );
    // (The editors before family reach matched the values themselves: a
    // member that draws the thing another way is offered, never applied;
    // one that matched is not.)
    const ctxt = /** @type {any} */ (await context(cwd));
    const s = {
      thing: 'padding-inline',
      value: '9px',
      source: /** @type {const} */ ('property'),
      on: 'text-input',
    };
    const earlier = earlierReach(ctxt, s);
    const grown = partsOf(ctxt, {...s}).filter(t => !earlier.includes(t));
    const offered = /** @type {any[]} */ (r.data.offered ?? []);
    expect(earlier).toContain('number-input');
    expect(offered.flatMap(o => o.parts).sort()).toEqual(grown.sort());
    for (const t of grown)
      expect(partsWith('inp', 'padding-inline')).not.toContain(t);
  }, 240_000);

  it('--only on the same setting replaces it, so the look leaves the group', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('narrow', {cwd, like: 'neutral'});
    await themeEditSet('narrow', 'border-color', '#ff0000', {
      cwd,
      on: 'text-input',
    });
    expect(partsWith('narrow', 'border-color')).toContain('text-area');
    const r = /** @type {any} */ (
      await themeEditSet('narrow', 'border-color', '#ff0000', {
        cwd,
        on: 'text-input',
        only: true,
      })
    );
    // (The group version is named as the setting it replaces, never as a
    // copy listed twice.)
    expect(r.data.replaced).toEqual(
      expect.objectContaining({thing: 'border-color', on: 'text-input'}),
    );
    expect(r.data.replaced.only).toBeFalsy();
    expect(r.data.notes.join('\n')).toMatch(/^replaces border-color/m);
    expect(r.data.notes.join('\n')).not.toMatch(/listed twice/);
    const entries = saved('narrow').settings.filter(
      (/** @type {any} */ x) => x.thing === 'border-color',
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].only).toBe(true);
    expect(partsWith('narrow', 'border-color')).not.toContain('text-area');
  }, 240_000);

  it('a setting named on a group keeps its recorded members; the rest are offered with the group line', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('grp', {cwd, like: 'neutral'});
    await themeEditSet('grp', 'border-color', '#00ff00', {cwd, on: 'inputs'});
    const data = saved('grp');
    const key = /** @type {string} */ (
      Object.keys(data.reached).find(k => k.startsWith('border-color|'))
    );
    data.reached[key] = ['text-input'];
    save('grp', data);
    const r = /** @type {any} */ (
      await themeEditSet('grp', 'corners', '4px', {cwd})
    );
    expect(r.data.offered).toHaveLength(1);
    expect(r.data.offered[0].run).toContain('--on inputs');
    expect(r.data.offered[0].run).not.toContain('--only');
    expect(partsWith('grp', 'border-color')).not.toContain('text-area');
  }, 240_000);

  it('the text lists each offer under the status line, once', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('txt', {cwd, like: 'neutral'});
    await themeEditSet('txt', 'border-color', '#ff0000', {
      cwd,
      on: 'text-input',
    });
    narrowRecord('txt', 'border-color|');
    const out = cliText(['set', 'txt', 'corners', '4px']);
    expect(out).toMatch(
      /- border-color = #ff0000 on text-input would also reach .*text-area.*, drawn alike; to let it: .* set txt border-color '#ff0000' --on text-input$/m,
    );
    expect(out).not.toMatch(/reach more parts/);
    const again = cliText(['set', 'txt', 'corners', '6px']);
    expect(again).not.toMatch(/would also reach/);
  }, 240_000);

  it('a theme saved with a group setting and its --only twin opens and builds as it did', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('twin', {cwd, like: 'neutral'});
    await themeEditSet('twin', 'border-color', '#ff0000', {
      cwd,
      on: 'text-input',
    });
    // What an earlier editor wrote for `set … --only`: a second entry.
    const data = saved('twin');
    const group = data.settings.find(
      (/** @type {any} */ x) => x.thing === 'border-color',
    );
    data.settings.push({...group, value: '#0000ff', only: true});
    save('twin', data);
    const r = /** @type {any} */ (
      await themeEditSet('twin', 'corners', '4px', {cwd})
    );
    expect(r.data.action).toBe('set');
    const css = fs.readFileSync(
      path.join(cwd, 'themes', 'twin', 'twin.css'),
      'utf8',
    );
    expect(css).toMatch(/astryx-text-area[^{]*\{[^}]*border-color:\s*#ff0000/i);
    expect(
      saved('twin').settings.filter(
        (/** @type {any} */ x) => x.thing === 'border-color',
      ),
    ).toHaveLength(2);
  }, 240_000);

  it('undoing a narrowing names both entries', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('back', {cwd, like: 'neutral'});
    await themeEditSet('back', 'border-color', '#ff0000', {
      cwd,
      on: 'text-input',
    });
    await themeEditSet('back', 'border-color', '#ff0000', {
      cwd,
      on: 'text-input',
      only: true,
    });
    const u = /** @type {any} */ (await themeEditUndo('back', {cwd}));
    const undone = /** @type {string[]} */ (u.data.undone).join('\n');
    expect(undone).toMatch(/removed border-color = #ff0000 on text-input only/);
    expect(undone).toMatch(/put back border-color = #ff0000 on text-input/);
    expect(partsWith('back', 'border-color')).toContain('text-area');
  }, 240_000);

  it('an undo never offers again what a change already offered', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('once', {cwd, like: 'neutral'});
    await themeEditSet('once', 'border-color', '#ff0000', {
      cwd,
      on: 'text-input',
    });
    await themeEditSet('once', 'corners', '4px', {cwd});
    narrowRecord('once', 'border-color|');
    const said = /** @type {any} */ (
      await themeEditSet('once', 'corners', '6px', {cwd})
    );
    expect(said.data.offered?.length).toBe(1);
    const u = /** @type {any} */ (await themeEditUndo('once', {cwd}));
    expect(u.data.offered ?? []).toEqual([]);
  }, 240_000);

  it('undoing a change that named a growth names it no second time', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('once', {cwd, like: 'neutral'});
    await themeEditSet('once', 'border-color', '#ff0000', {
      cwd,
      on: 'text-input',
    });
    narrowRecord('once', 'border-color|');
    const r = /** @type {any} */ (
      await themeEditSet('once', 'corners', '4px', {cwd})
    );
    expect(r.data.widened?.[0]?.parts).toEqual(
      expect.arrayContaining(['text-area']),
    );
    const u = /** @type {any} */ (await themeEditUndo('once', {cwd}));
    expect(u.data.widened ?? []).toEqual([]);
  }, 240_000);

  it('--only says which saved setting it replaces and that the rest of the group goes back', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('rep', {cwd, like: 'neutral'});
    await themeEditSet('rep', 'border-color', '#ff0000', {
      cwd,
      on: 'text-input',
    });
    const r = /** @type {any} */ (
      await themeEditSet('rep', 'border-color', '#0000ff', {
        cwd,
        on: 'text-input',
        only: true,
      })
    );
    expect(r.data.replaced?.value).toBe('#ff0000');
    expect(r.data.notes.join('\n')).toMatch(
      /replaces border-color = #ff0000 on text-input: the rest of the group goes back to the base theme's value/,
    );
    const back = /** @type {any} */ (
      await themeEditSet('rep', 'border-color', '#ff0000', {
        cwd,
        on: 'text-input',
      })
    );
    expect(back.data.notes.join('\n')).toMatch(/it reaches the group again/);
    expect(
      saved('rep').settings.filter(
        (/** @type {any} */ x) => x.thing === 'border-color',
      ),
    ).toHaveLength(1);
  }, 240_000);
});
