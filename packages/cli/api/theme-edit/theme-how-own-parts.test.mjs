// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how`: "its header" is the header of the nearest container
 * named in its clause, a piece placed on a container's edge is that
 * container's, a container's body is the container, a dialog's title bar
 * is its header, and a part said to span the full width fills what holds
 * it.
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
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
/** Why a bundled base could not be installed here, when one could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-how-own-parts-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  await themeEditNew('n', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** An answer's texts and set commands, after the theme name. @param {string} q */
const answer = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 'n'});
  const results = data.results ?? [];
  return {
    texts: results.map(r => r.text),
    sets: [
      ...new Set(
        results
          .flatMap(r => r.commands)
          .filter(c => / editor set /.test(c))
          .map(c => c.replace(/^.* editor set \S+ /, '')),
      ),
    ],
  };
};

/** @param {import('vitest').TestContext} test */
const needsBases = test => {
  if (unbuilt) {
    console.warn(`skipped: ${unbuilt}`);
    test.skip();
  }
};

const T = 300_000;

it(
  "binds 'its header' to the dialog just named, and the dialog body to the dialog",
  async test => {
    needsBases(test);
    const {sets, texts} = await answer(
      'dialog with no padding around its header, the header a full-width bar at the top; 10px padding in the dialog body',
    );
    expect(
      sets.filter(c => /app-shell-header|--on body\b|--on page\b/.test(c)),
    ).toEqual([]);
    expect(sets.filter(c => /720px/.test(c))).toEqual([]);
    // (No padding is the header's alone, and 10px the dialog's.)
    expect(sets).toEqual(
      expect.arrayContaining([
        'padding 0px --on dialog-header',
        "width '100%' --on dialog-header",
        'padding 10px --on dialog',
      ]),
    );
    expect(texts.join(' ')).not.toMatch(/contradict/);
  },
  T,
);

it(
  "writes a dialog's title bar across the full width as its header's width, nothing else",
  async test => {
    needsBases(test);
    const {sets} = await answer(
      'dialog title bar spans the full width at the top edge of the dialog',
    );
    expect(sets).toEqual(["width '100%' --on dialog-header"]);
  },
  T,
);

it(
  'keeps a header said with no owner as the app top bar',
  async test => {
    needsBases(test);
    const {sets} = await answer('a navy header');
    expect(sets).toContain("background-color '#1e3a8a' --on app-shell-header");
  },
  T,
);

it(
  'keeps an edge the sentence draws, and binds "its" to the nearest part before it',
  async test => {
    needsBases(test);
    expect(
      (await answer('a red border along the top edge of the card')).sets,
    ).toContain("border-top '1px solid #dc2626' --on card");
    expect(
      (await answer('a blue rule along the bottom edge of the dialog header'))
        .sets,
    ).toEqual([
      expect.stringMatching(
        /^border-bottom '1px solid #2563eb' --on (?:dialog-header|overlay-headers)$/,
      ),
    ]);
    const page = (
      await answer(
        'cards with 8px corners, and the page with a navy background on its header',
      )
    ).sets;
    expect(page).toContain("background-color '#1e3a8a' --on app-shell-header");
    expect(page.some(c => /--on card-header\b/.test(c))).toBe(false);
    expect(
      (await answer('a card inside a dialog with no padding around its header'))
        .sets,
    ).toContain('padding 0px --on dialog-header');
  },
  T,
);

it(
  'reads a header after an owner word with no header part as that part, said missing',
  async test => {
    needsBases(test);
    const {sets, texts} = await answer(
      'a menu with no padding around its header',
    );
    expect(sets).toEqual(['padding 0px --on dropdown-menu']);
    expect(texts.join(' ')).toMatch(/no menu header part of its own/);
  },
  T,
);

it(
  "binds 'its header' past a part said inside the owner, and reads a modal as the dialog",
  async test => {
    needsBases(test);
    const button = (
      await answer('a button in a dialog with no padding around its header')
    ).sets;
    expect(button).toContain('padding 0px --on dialog-header');
    expect(button.some(c => /--on button\b/.test(c))).toBe(false);
    const link = (
      await answer('a link in the drawer with a navy background on its header')
    ).sets;
    expect(link).toContain("background-color '#1e3a8a' --on drawer-header");
    expect(link.some(c => /--on link\b|--color-text-accent/.test(c))).toBe(
      false,
    );
    const modal = (await answer('modal with a navy background on its header'))
      .sets;
    expect(modal).toContain("background-color '#1e3a8a' --on dialog-header");
    expect(modal.some(c => /app-shell-header/.test(c))).toBe(false);
    const body = (await answer('the modal body background #f5f5f5')).sets;
    expect(body.some(c => /--color-background-body/.test(c))).toBe(false);
    expect(body.some(c => /#f5f5f5.* --on dialog\b/.test(c))).toBe(true);
  },
  T,
);

it(
  "binds 'its header' to the container past other words, and keeps an edge's own sentence",
  async test => {
    needsBases(test);
    const close = (await answer('a dialog with a close button in its header'))
      .sets;
    expect(close.some(c => /--on (?:button|app-shell-header)\b/.test(c))).toBe(
      false,
    );
    const bold = (await answer('a dialog with bold text in its header')).sets;
    expect(bold.length).toBeGreaterThan(0);
    expect(
      bold.every(c => /--on dialog-header(?:-title-block)?$/.test(c)),
    ).toBe(true);
    const both = (await answer('make the dialog and its header navy')).sets;
    expect(both.some(c => /--on dialog-header\b/.test(c))).toBe(true);
    expect(both.some(c => /app-shell-header/.test(c))).toBe(false);
    expect(
      (await answer('a dialog with 1.5px padding around its header')).sets,
    ).toContain('padding 1.5px --on dialog-header');
    expect(
      (
        await answer(
          'make the card red. a red border along the top edge of the card',
        )
      ).sets,
    ).toContain("border-top '1px solid #dc2626' --on card");
    expect(
      (
        await answer(
          'a red border on cards. the title bar sits at the top edge of the dialog',
        )
      ).sets.some(c => /--on dialog\b/.test(c)),
    ).toBe(false);
  },
  T,
);

it(
  'fills what holds a part said full width, lifting a width cap the theme set',
  async test => {
    needsBases(test);
    await themeEditNew('capped', {cwd, like: 'neutral'});
    await themeEditSet('capped', 'max-width', '600px', {cwd, on: 'dialog'});
    const {data} = await themeEditHow('the dialog full width', {
      cwd,
      theme: 'capped',
    });
    const sets = (data.results ?? [])
      .flatMap(r => r.commands)
      .filter(c => / editor set /.test(c))
      .map(c => c.replace(/^.* editor set \S+ /, ''));
    expect(sets).toEqual(
      expect.arrayContaining([
        "width '100%' --on dialog",
        'max-width none --on dialog',
      ]),
    );
    expect(sets.some(c => /750px/.test(c))).toBe(false);
  },
  T,
);

it(
  'keeps an edge that names its part, reads a decimal as no sentence end, and says a card title bar missing',
  async test => {
    needsBases(test);
    expect(
      (await answer('padding 24px along the left edge of the card')).sets,
    ).toContain('padding-left 24px --on card');
    expect(
      (await answer('a 4px blue accent bar along the left edge of the card'))
        .sets,
    ).toContain("border-left '4px solid var(--color-accent)' --on card");
    expect(
      (await answer('a navy stripe across the top edge of the dialog')).sets,
    ).toContain("border-top '1px solid #1e3a8a' --on dialog");
    const again = (
      await answer('the dialog header with 1.5px padding and the header navy')
    ).sets;
    expect(again).toContain("background-color '#1e3a8a' --on dialog-header");
    expect(again.some(c => /app-shell-header/.test(c))).toBe(false);
    const card = await answer('a card with a navy background on its title bar');
    expect(card.sets.some(c => /app-shell-header/.test(c))).toBe(false);
    expect(card.texts.join(' ')).toMatch(/no card title bar part of its own/);
  },
  T,
);

it(
  'keeps the side of an edge when the part is named first, and binds every "the header" said again',
  async test => {
    needsBases(test);
    expect(
      (await answer('a card with padding 24px along the left edge of the card'))
        .sets,
    ).toContain('padding-left 24px --on card');
    expect(
      (
        await answer(
          'a card with a 4px blue accent bar along the left edge of the card',
        )
      ).sets,
    ).toContain("border-left '4px solid var(--color-accent)' --on card");
    const again = (
      await answer(
        'dialog with no padding around its header, the header a full-width bar at the top, the header navy',
      )
    ).sets;
    expect(again).toContain("background-color '#1e3a8a' --on dialog-header");
    expect(again.some(c => /app-shell-header/.test(c))).toBe(false);
  },
  T,
);

it(
  "reads a piece placed on a container's edge as that container's, keeps a body's text as its text, and lists bodies",
  async test => {
    needsBases(test);
    const bar = (
      await answer(
        'the title bar runs along the top edge of the dialog and is navy',
      )
    ).sets;
    expect(bar).toContain("background-color '#1e3a8a' --on dialog-header");
    expect(bar.some(c => /app-shell-header/.test(c))).toBe(false);
    const close = (
      await answer('the close button sits at the top edge of the dialog, red')
    ).sets;
    expect(close.some(c => /--on button\b/.test(c))).toBe(false);
    expect(close.some(c => /dialog-header-close-icon/.test(c))).toBe(true);
    expect((await answer('the dialog body text white')).sets).toEqual([
      "--color-text-primary '#ffffff' --on dialog --mode dark",
    ]);
    const list = (await answer('the dialog body and the card body white')).sets;
    expect(list).toContain(
      "background-color '#ffffff' --on dialog --mode light",
    );
    expect(list.some(c => /--on card\b/.test(c))).toBe(true);
  },
  T,
);

it(
  'binds every piece joined by "and its", any case, and a piece placed past a decimal',
  async test => {
    needsBases(test);
    const both = (
      await answer('a dialog with no padding around its header and its footer')
    ).sets;
    expect(both).toContain('padding 0px --on dialog-header');
    expect(both.some(c => /app-shell-header|layout-footer/.test(c))).toBe(
      false,
    );
    expect(
      (await answer('Dialog body padding 10px')).sets.some(c =>
        /--color-background-body|--on body\b/.test(c),
      ),
    ).toBe(false);
    for (const q of [
      'the title bar is placed at the top edge of the dialog and is navy',
      'the title bar with 1.5px padding sits at the top edge of the dialog, navy',
    ])
      expect((await answer(q)).sets.some(c => /app-shell-header/.test(c))).toBe(
        false,
      );
  },
  T,
);

it(
  'keeps the edge of a stripe or an accent bar said with a placing verb',
  async test => {
    needsBases(test);
    expect(
      (
        await answer(
          'the card has a 4px blue accent bar that runs along the left edge of the card',
        )
      ).sets.some(c => /^border-left .* --on card$/.test(c)),
    ).toBe(true);
    expect(
      (
        await answer(
          'the dialog has a navy stripe that runs across the top edge of the dialog',
        )
      ).sets.some(c => /^border-top .* --on dialog$/.test(c)),
    ).toBe(true);
  },
  T,
);

it(
  'places only the piece its own placing verb places',
  async test => {
    needsBases(test);
    expect(
      (
        await answer(
          'make the header navy and add a red border that runs along the top edge of the card',
        )
      ).sets,
    ).toContain("background-color '#1e3a8a' --on app-shell-header");
    expect(
      (
        await answer(
          'a navy footer and a gray stripe that runs across the bottom edge of the dialog',
        )
      ).sets.some(c => /--on layout-footer\b/.test(c)),
    ).toBe(true);
  },
  T,
);

it(
  'reads a line height or a bar that is a part as nothing drawn',
  async test => {
    needsBases(test);
    expect(
      (
        await answer(
          'the title bar sits at the top edge of the dialog with a 1.5 line height',
        )
      ).sets.some(c => /^border/.test(c)),
    ).toBe(false);
    expect(
      (
        await answer('the tab bar sits at the bottom edge of the drawer')
      ).sets.some(c => /^border/.test(c)),
    ).toBe(false);
  },
  T,
);

it(
  "puts a look said for a container's piece on the piece alone, past a color's commas",
  async test => {
    needsBases(test);
    const both = (
      await answer('a drawer with its header navy and its footer white')
    ).sets;
    expect(both).toContain("background-color '#1e3a8a' --on drawer-header");
    expect(both.some(c => /'#1e3a8a' --on drawer\b(?!-)/.test(c))).toBe(false);
    const rgba = (
      await answer(
        'a dialog with an rgba(0, 0, 0, 0.05) background on its header',
      )
    ).sets;
    expect(rgba).toContain(
      "background-color 'rgba(0, 0, 0, 0.05)' --on dialog-header",
    );
    expect(rgba.some(c => /app-shell-header/.test(c))).toBe(false);
  },
  T,
);

it(
  'reads a footer bar after a container with none as the container, said missing',
  async test => {
    needsBases(test);
    const {sets, texts} = await answer('the dialog footer bar gray');
    expect(sets.some(c => /layout-footer/.test(c))).toBe(false);
    expect(texts.join(' ')).toMatch(/no dialog footer/);
  },
  T,
);

it(
  "never reads the last word of a longer part's name as the container",
  async test => {
    needsBases(test);
    for (const [q, wrong] of [
      [
        'a context menu with no padding around its header',
        /--on dropdown-menu\b/,
      ],
      ['a hover card with a navy background on its header', /--on card\b/],
      ['the side panel with no padding around its header', /--on containers\b/],
    ])
      expect((await answer(q)).sets.some(c => wrong.test(c))).toBe(false);
  },
  T,
);

it(
  'reads a share of the full width, and a body said with a text word, as before',
  async test => {
    needsBases(test);
    for (const q of [
      'make the dialog 80% of the full width',
      'make the dialog half the full width',
      'make the dialog three quarters of the full width',
    ])
      expect(
        (await answer(q)).sets.some(c => /width '100%'/.test(c)),
        q,
      ).toBe(false);
    expect(
      (await answer('the dialog body copy gray')).sets.some(c =>
        /background/.test(c),
      ),
    ).toBe(false);
    expect(
      (await answer('dialog body type 15px')).sets.some(c =>
        /^(?:width|height) /.test(c),
      ),
    ).toBe(false);
  },
  T,
);
