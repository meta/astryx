// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A contrast problem whose failing color the theme typed (a copy of
 * an original) may be kept as designed, with a specific reason, for that
 * one place and ratio: it is offered as the problem's accept line, never
 * for a color the editor made; kept, it leaves the problems and show lists
 * it apart with the line that takes it back; drawn lower later, it is a
 * problem again. No official theme carries one.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {withAccepted} from './_settings.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

const T = 300_000;
/** @type {string} */
let cwd;
let unbuilt = '';
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-contrast-accepted-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  await themeEditNew('ac', {cwd, like: 'neutral'});
  await themeEditSet('ac', 'background-color', '#17a2b8', {
    cwd,
    on: 'button',
    when: 'variant:primary',
  });
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

const PLACE = /** @type {const} */ ({
  on: 'button',
  ground: 'button',
  mode: 'light',
});
/** @param {any} r */
const primary = r =>
  /** @type {Array<{problem: string, fix: string | null, accept?: string}>} */ (
    r.data.openProblems ?? r.data.newProblems
  ).filter(p => /^text in button \(variant primary\)/.test(p.problem));

describe('a contrast problem kept as designed', () => {
  it(
    'is offered for a typed color, as the problem accept line',
    async () => {
      if (unbuilt) return;
      const [p] = primary(await themeEditShow('ac', {cwd}));
      expect(p.accept).toBe(
        "astryx experimental theme editor set ac contrast-accepted '<why the original draws it so>' --on button --ground button --mode light",
      );
    },
    T,
  );

  it(
    'needs a specific reason, then leaves the problems and is listed apart',
    async () => {
      if (unbuilt) return;
      await expect(
        themeEditSet('ac', 'contrast-accepted', 'as designed', {cwd, ...PLACE}),
      ).rejects.toThrow(/said specifically/);
      await themeEditSet(
        'ac',
        'contrast-accepted',
        "matches the original's info button label",
        {cwd, ...PLACE},
      );
      const show = /** @type {any} */ (await themeEditShow('ac', {cwd}));
      expect(primary(show)).toEqual([]);
      expect(show.data.acceptedContrast).toEqual([
        expect.objectContaining({
          part: 'button',
          ground: 'button',
          mode: 'light',
          ratio: expect.any(Number),
          // (The text's own color as drawn, never its fill.)
          color: expect.stringMatching(/^#(?!17a2b8)[0-9a-f]{6}$/),
          reason: "matches the original's info button label",
          undo: 'astryx experimental theme editor set ac contrast-accepted none --on button --ground button --mode light',
        }),
      ]);
      expect(
        /** @type {string[]} */ (show.data.notes).filter(n =>
          /accepted as designed/.test(n),
        ),
      ).toEqual([]);
    },
    T,
  );

  it(
    'is a problem again when a later change draws it lower',
    async () => {
      if (unbuilt) return;
      await themeEditSet('ac', 'background-color', '#5bc0de', {
        cwd,
        on: 'button',
        when: 'variant:primary',
      });
      expect(primary(await themeEditShow('ac', {cwd})).length).toBeGreaterThan(
        0,
      );
    },
    T,
  );
});

describe('the accept line', () => {
  const data = /** @type {any} */ ({
    name: 't',
    mode: 'both',
    settings: [{thing: '--color-accent', value: '#17a2b8', source: 'token'}],
  });
  /** @param {string} fg @param {string} bg @param {number} r */
  const problem = (fg, bg, r) => ({
    key: 'text|button|button|--color-on-accent|button|--color-accent||Save|light',
    text: `text in button ("Save") is ${r}:1 in light (${fg} on button's ${bg}); text needs 4.5:1`,
    fix: 'x',
  });

  it('is never offered for colors the editor made', () => {
    expect(
      withAccepted(data, [problem('#ffffff', '#9a9a9a', 2.8)])[0],
    ).not.toHaveProperty('accept');
    expect(
      withAccepted(data, [problem('#ffffff', '#17a2b8', 3)])[0],
    ).toHaveProperty('accept');
  });

  it('is never offered, nor kept, on a surface drawn in a scheme of its own', () => {
    const lightbox = {
      key: 'text|button|lightbox|--color-on-accent|button|--color-accent||Next|light',
      text: `text in button ("Next") is 3:1 in dark (lightbox draws it in its dark scheme) (#ffffff on button's #17a2b8); text needs 4.5:1`,
      fix: 'x',
    };
    const kept = {
      ...data,
      accepted: [
        {
          part: 'button',
          ground: 'lightbox',
          mode: 'light',
          ratio: 3,
          reason: 'r s t',
        },
      ],
    };
    expect(withAccepted(data, [lightbox])[0]).not.toHaveProperty('accept');
    expect(withAccepted(kept, [lightbox])[0].note).toBeUndefined();
  });

  it('keeps a lower ratio than the one accepted a problem', () => {
    const kept = {
      ...data,
      accepted: [
        {
          part: 'button',
          ground: 'button',
          mode: 'light',
          ratio: 3,
          color: '#17a2b8',
          reason: 'r s t',
        },
      ],
    };
    expect(withAccepted(kept, [problem('#ffffff', '#17a2b8', 3)])[0].note).toBe(
      true,
    );
    expect(
      withAccepted(kept, [problem('#ffffff', '#17a2b8', 2.5)])[0].note,
    ).toBeUndefined();
  });
});

describe('the official themes', () => {
  it('keep no contrast problem as designed', () => {
    const themes = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../themes',
    );
    /** The theme's own files, its installs left out. @param {string} dir @returns {string[]} */
    const own = dir =>
      fs
        .readdirSync(dir, {withFileTypes: true})
        .flatMap(e =>
          e.name === 'node_modules' || e.name.startsWith('.')
            ? []
            : e.isDirectory()
              ? own(path.join(dir, e.name))
              : e.isFile() && /\.(json|ts|tsx|mjs|js)$/.test(e.name)
                ? [path.join(dir, e.name)]
                : [],
        );
    const carrying = own(themes)
      .filter(f =>
        /contrast-accepted|"accepted"\s*:/.test(fs.readFileSync(f, 'utf8')),
      )
      .map(f => path.relative(themes, f));
    expect(carrying).toEqual([]);
  });
});
