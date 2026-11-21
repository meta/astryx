// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A contrast problem whose failing color the theme typed (a copy of
 * an original) may be kept as designed, with a specific reason, for that
 * exact pair of colors in that one place: it is offered as the problem's
 * accept line, refused for a color the editor made and on an official
 * theme; kept, it leaves the problems, and show lists it apart
 * with its reason and contrast; a change to either color makes it a problem
 * again; one undo takes it back. A miss in one variant of a part (a badge's
 * info label) is kept for that variant alone, named in the accept line,
 * show. No official theme carries one.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  themeEditNew,
  themeEditSet,
  themeEditShow,
  themeEditUndo,
} from './theme-edit.mjs';
import {withAccepted} from './_settings.mjs';
import {editorKeptContrastAt} from './_adapter.mjs';
import {acceptedContrastCheck} from '../doctor/theme-checks.mjs';
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

// (The miss is in the primary variant, so the acceptance names it.)
const PLACE = /** @type {const} */ ({
  on: 'button',
  when: 'variant:primary',
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
        "astryx experimental theme editor set ac contrast-accepted '<why the original draws it so>' --on button --when variant:primary --ground button --mode light",
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
          when: 'variant:primary',
          ground: 'button',
          mode: 'light',
          ratio: expect.any(Number),
          // (The exact pair: the text's own color as drawn, and its fill.)
          color: expect.stringMatching(/^#(?!17a2b8)[0-9a-f]{6}$/),
          groundColor: '#17a2b8',
          reason: "matches the original's info button label",
          undo: 'astryx experimental theme editor set ac contrast-accepted none --on button --when variant:primary --ground button --mode light',
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
    'lapses when either color of the pair changes, even to a better one',
    async () => {
      if (unbuilt) return;
      // A slightly darker fill reads a little better, but it is another
      // pair: the acceptance does not cover it.
      await themeEditSet('ac', 'background-color', '#138496', {
        cwd,
        on: 'button',
        when: 'variant:primary',
      });
      expect(primary(await themeEditShow('ac', {cwd})).length).toBeGreaterThan(
        0,
      );
      // Back to the pair accepted: kept again.
      await themeEditUndo('ac', {cwd});
      expect(primary(await themeEditShow('ac', {cwd}))).toEqual([]);
    },
    T,
  );

  it(
    'is taken back by one undo',
    async () => {
      if (unbuilt) return;
      await themeEditUndo('ac', {cwd});
      const show = /** @type {any} */ (await themeEditShow('ac', {cwd}));
      expect(show.data.acceptedContrast).toEqual([]);
      expect(primary(show).length).toBeGreaterThan(0);
    },
    T,
  );

  it(
    'is refused for a color the editor made',
    async () => {
      if (unbuilt) return;
      await themeEditNew('mc', {cwd, like: 'neutral'});
      // The primary button filled with one of the theme's own surface
      // colors, by reference: no color of that pair is one the theme typed.
      await themeEditSet(
        'mc',
        'background-color',
        'var(--color-background-muted)',
        {cwd, on: 'button', when: 'variant:primary'},
      );
      const made = primary(await themeEditShow('mc', {cwd}));
      expect(made.length).toBeGreaterThan(0);
      for (const p of made) expect(p.accept).toBeUndefined();
      await expect(
        themeEditSet(
          'mc',
          'contrast-accepted',
          "matches the original's primary button label",
          {cwd, ...PLACE},
        ),
      ).rejects.toThrow(/a made color must pass/);
    },
    T,
  );
});

describe('a contrast problem in one variant, kept as designed', () => {
  const BADGE = /** @type {const} */ ({
    on: 'badge',
    when: 'variant:info',
    ground: 'badge',
    mode: 'light',
  });
  /** @param {any} r */
  const info = r =>
    /** @type {Array<{problem: string, fix: string | null, accept?: string}>} */ (
      r.data.openProblems ?? r.data.newProblems
    ).filter(p => /^text in badge \(variant info\)/.test(p.problem));

  it(
    'names the variant in its accept line and covers that variant only',
    async () => {
      if (unbuilt) return;
      await themeEditNew('bv', {cwd, like: 'neutral'});
      // The original's info label: its fill, typed.
      await themeEditSet('bv', 'background-color', '#5bc0de', {
        cwd,
        on: 'badge',
        when: 'variant:info',
      });
      const [p] = info(await themeEditShow('bv', {cwd}));
      expect(p.accept).toBe(
        "astryx experimental theme editor set bv contrast-accepted '<why the original draws it so>' --on badge --when variant:info --ground badge --mode light",
      );
      // The badge as a whole has no such problem to keep.
      await expect(
        themeEditSet(
          'bv',
          'contrast-accepted',
          "matches the original's info label exactly",
          {cwd, on: 'badge', ground: 'badge', mode: 'light'},
        ),
      ).rejects.toThrow(/no contrast problem for badge on badge in light/);
      await themeEditSet(
        'bv',
        'contrast-accepted',
        "matches the original's info label exactly",
        {cwd, ...BADGE},
      );
      const show = /** @type {any} */ (await themeEditShow('bv', {cwd}));
      expect(info(show)).toEqual([]);
      expect(show.data.acceptedContrast).toEqual([
        expect.objectContaining({
          part: 'badge',
          when: 'variant:info',
          ground: 'badge',
          mode: 'light',
          groundColor: '#5bc0de',
          reason: "matches the original's info label exactly",
          undo: 'astryx experimental theme editor set bv contrast-accepted none --on badge --when variant:info --ground badge --mode light',
        }),
      ]);
      // doctor lists it too, read from the editor settings, with its variant.
      expect(
        acceptedContrastCheck(await editorKeptContrastAt(cwd)),
      ).toMatchObject({
        id: 'theme-accepted-contrast',
        status: 'info',
        message: expect.stringMatching(
          /bv: badge \(variant info\) on badge in light at [\d.]+:1 \(matches the original's info label exactly\)/,
        ),
      });
    },
    T,
  );

  it(
    'lapses when the variant fill changes',
    async () => {
      if (unbuilt) return;
      await themeEditSet('bv', 'background-color', '#46b8da', {
        cwd,
        on: 'badge',
        when: 'variant:info',
      });
      expect(info(await themeEditShow('bv', {cwd})).length).toBeGreaterThan(0);
      // doctor says so too: the acceptance no longer holds.
      expect(
        acceptedContrastCheck(await editorKeptContrastAt(cwd))?.message,
      ).toMatch(
        /no longer holds?, because a color changed[^]*bv: badge \(variant info\) on badge in light at [\d.]+:1, kept at/,
      );
      await themeEditUndo('bv', {cwd});
      // A fill that now passes leaves the acceptance with nothing to keep:
      // doctor says it is no longer needed, never that it is a problem.
      await themeEditSet('bv', 'background-color', '#0b4f5c', {
        cwd,
        on: 'badge',
        when: 'variant:info',
        mode: 'light',
      });
      expect(info(await themeEditShow('bv', {cwd}))).toEqual([]);
      const passing = acceptedContrastCheck(await editorKeptContrastAt(cwd));
      expect(passing?.status).toBe('info');
      expect(passing?.message).toMatch(
        /no longer needed: its colors changed and it now passes: bv: badge \(variant info\)/,
      );
      expect(passing?.message).not.toMatch(/a problem again/);
      await themeEditUndo('bv', {cwd});
      expect(info(await themeEditShow('bv', {cwd}))).toEqual([]);
      // Taken back by its own undo line.
      await themeEditSet('bv', 'contrast-accepted', 'none', {cwd, ...BADGE});
      expect(info(await themeEditShow('bv', {cwd})).length).toBeGreaterThan(0);
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
  const res = {light: {}, dark: {}};
  /** @param {string} fg @param {string} bg @param {number} r */
  const problem = (fg, bg, r) => ({
    key: 'text|button|button|--color-on-accent|button|--color-accent||Save|light',
    text: `text in button ("Save") is ${r}:1 in light (${fg} on button's ${bg}); text needs 4.5:1`,
    fix: 'x',
  });

  it('is never offered for colors the editor made', () => {
    expect(
      withAccepted(data, [problem('#ffffff', '#9a9a9a', 2.8)], res)[0],
    ).not.toHaveProperty('accept');
    expect(
      withAccepted(data, [problem('#ffffff', '#17a2b8', 3)], res)[0],
    ).toHaveProperty('accept');
  });

  it('covers only the exact pair accepted', () => {
    const kept = {
      ...data,
      accepted: [
        {
          part: 'button',
          ground: 'button',
          mode: 'light',
          ratio: 3,
          color: '#ffffff',
          groundColor: '#17a2b8',
          reason: 'r s t',
        },
      ],
    };
    expect(
      withAccepted(kept, [problem('#ffffff', '#17a2b8', 3)], res)[0].note,
    ).toBe(true);
    // Either color changed, worse or better, is another pair.
    for (const [fg, bg] of [
      ['#ffffff', '#5bc0de'],
      ['#ffffff', '#138496'],
      ['#eeeeee', '#17a2b8'],
    ])
      expect(
        withAccepted(kept, [problem(fg, bg, 2.5)], res)[0].note,
        `${fg} on ${bg}`,
      ).toBeUndefined();
  });
});

describe('an official theme', () => {
  it(
    'refuses to keep a contrast problem as designed',
    async () => {
      const official = makeLinkedFixture(
        'astryx-theme-contrast-official-',
        FIXTURE_PACKAGES,
      );
      try {
        writeFixtureBaseTheme(official, 'neutral');
        if (await installRealBaseThemes(official, ['neutral'])) return;
        const pkg = path.join(official, 'package.json');
        fs.writeFileSync(
          pkg,
          JSON.stringify({
            ...JSON.parse(fs.readFileSync(pkg, 'utf8')),
            name: '@astryxdesign/theme-sample',
          }),
        );
        await themeEditNew('of', {cwd: official, like: 'neutral'});
        await themeEditSet('of', 'background-color', '#17a2b8', {
          cwd: official,
          on: 'button',
          when: 'variant:primary',
        });
        await expect(
          themeEditSet(
            'of',
            'contrast-accepted',
            "matches the original's info button label",
            {cwd: official, ...PLACE},
          ),
        ).rejects.toThrow(/official Astryx theme/);
      } finally {
        removeLinkedFixture(official);
      }
    },
    T,
  );
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

describe('a kept pair, measured alone', () => {
  const data = /** @type {any} */ ({
    name: 'u',
    settings: [
      {
        source: 'property',
        thing: 'background-color',
        value: '#17a2b8',
        on: 'button',
      },
    ],
    accepted: [
      {
        part: 'button',
        ground: 'button',
        mode: 'light',
        ratio: 3.9,
        color: '#ffffff',
        groundColor: '#17a2b8',
        reason: "matches the original's info button label",
      },
    ],
  });
  /** @param {string} accent @param {string} ratio */
  const problem = (accent, ratio) =>
    withAccepted(
      data,
      [
        /** @type {any} */ ({
          key: 'text|button|button|--color-on-accent|button|--color-accent||Save|light',
          text: `text in button (#ffffff on button's --color-accent) is ${ratio}:1 in light`,
        }),
      ],
      {light: {'--color-accent': accent}, dark: {}},
    )[0];
  it('covers its own pair at its ratio', () => {
    expect(problem('#17a2b8', '3.90').note).toBe(true);
  });
  it('lapses when a color changes, even to one that reads better', () => {
    expect(problem('#138496', '4.40').note).toBeUndefined();
  });
  it('offers no keep line where the place is drawn in more than one pair', () => {
    const two = withAccepted(
      {...data, accepted: []},
      [
        /** @type {any} */ ({
          key: 'text|button|button|--color-on-accent|button|--color-accent||Save|light',
          text: "text in button (#ffffff on button's --color-accent) is 3.90:1 in light",
        }),
        /** @type {any} */ ({
          key: 'text|button|button|--color-on-accent|button|--color-danger||Delete|light',
          text: "text in button (#ffffff on button's --color-danger) is 3.50:1 in light",
        }),
      ],
      {
        light: {'--color-accent': '#17a2b8', '--color-danger': '#e8590c'},
        dark: {},
      },
    );
    expect(two.map(p => p.accept)).toEqual([undefined, undefined]);
  });
  it('lapses when the same pair is drawn lower (a see-through fill over a darker part)', () => {
    expect(problem('#17a2b8', '3.10').note).toBeUndefined();
  });
});
