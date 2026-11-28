// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How reads role words, sides and plain looks: a color "for
 * highlights" is the accent; "amber warnings" and status colors by hue are
 * the status colors; a status look that clashes names the status color;
 * chart colors name the data tokens; "no border except the bottom one"
 * keeps that side; a named color before a typed one is that value; a
 * blue-gray is the tinted gray; "clear" before errors is plain; less
 * contrast, a gentle dark mode, big type; deep and soft shades; a light
 * neutral fills the surfaces in light mode. Every line offered is run.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-how-roles-and-sides-',
    FIXTURE_PACKAGES,
  );
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
  await themeEditNew('q0', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} theme @param {string} ask */
const how = async (theme, ask) => {
  const {data} = /** @type {any} */ (await themeEditHow(ask, {cwd, theme}));
  return /** @type {Array<{text: string, commands: string[]}>} */ (
    data.results ?? []
  ).map(r => ({
    text: r.text,
    commands: r.commands.map(c => c.replace(/^.*? editor /, '')),
  }));
};

/** @param {Array<{commands: string[]}>} rs */
// (The readable-text line set's own check adds beside a fill is measured
// on its own: these asks read the rest.)
const writes = rs =>
  rs
    .filter(r => !/^readable text on that fill/.test(r.text))
    .flatMap(r => r.commands)
    .filter(c => /^(set|undo) /.test(c));

/** Run each line as offered. @param {string[]} lines */
const follow = async lines => {
  for (const line of lines) {
    const args =
      line.match(/'[^']*'|\S+/g)?.map(w => w.replace(/^'|'$/g, '')) ?? [];
    const r = await runCli(['experimental', 'theme', 'editor', ...args], cwd);
    expect(r.status, line).toBe(0);
  }
};

/** The one-step answer's commands. @param {Array<{text: string, commands: string[]}>} rs */
const top = rs => (rs[0]?.commands ?? []).filter(c => /^(set|undo) /.test(c));
/** @param {Array<{text: string}>} rs */
const texts = rs => rs.map(r => r.text).join('\n');

describe('roles', () => {
  it('highlights, warnings, a clash, charts', async () => {
    expect(writes(await how('q0', 'magenta #ff00e6 for highlights'))[0]).toBe(
      `set q0 accent '#ff00e6'`,
    );
    expect(
      top(
        await how(
          'q0',
          'dark only, chart-friendly palette, dense tables, amber warnings',
        ),
      ),
    ).toEqual([
      'set q0 mode dark-only',
      'set q0 spacing less --on table-row',
      `set q0 warning '#f59e0b'`,
    ]);
    const clash = await how(
      'q0',
      'the blue info banner clashes with the green',
    );
    expect(writes(clash)).toEqual([]);
    expect(texts(clash)).toMatch(/the info look is the info color/);
    const charts = await how('q0', 'chart colors');
    expect(texts(charts)).toMatch(/--color-data-categorical-/);
  }, 240_000);
});

describe('a light neutral', () => {
  it('fills the page, surfaces and cards in light mode; a darker one only grows the grays', async () => {
    const silver = (await how('q0', 'silver #c0c0c0 everywhere'))[0];
    expect(silver.commands).toEqual([
      "set q0 neutral '#c0c0c0'",
      "set q0 --color-background-body '#c0c0c0' --mode light",
      "set q0 --color-background-surface '#c0c0c0' --mode light",
      "set q0 --color-background-card '#c0c0c0' --mode light",
    ]);
    expect(silver.text).toMatch(/dark mode keeps the dark shades/);
    // (Text a part draws straight on the silver surfaces, a code block's
    // title, takes the nearest shade that reads there.)
    const silverAll = (await how('q0', 'silver #c0c0c0 everywhere')).flatMap(
      r => r.commands,
    );
    expect(silverAll).toContain(
      "set q0 --color-syntax-comment '#4f4f4f' --mode light",
    );
    // (So does a light tan.)
    expect(
      (await how('q0', 'neutral #d2b48c')).flatMap(r => r.commands),
    ).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^set q0 --color-syntax-comment '#[0-9a-f]{6}' --mode light$/,
        ),
      ]),
    );
    // (A code background the theme sets itself stays, so its title color
    // is left as it is.)
    await themeEditNew('q2', {cwd, like: 'neutral'});
    await themeEditSet('q2', '--color-syntax-background', '#1e1e1e', {cwd});
    const own = (await how('q2', 'silver #c0c0c0 everywhere')).flatMap(
      r => r.commands,
    );
    expect(own.join('\n')).not.toMatch(/--color-syntax-comment/);
    // (So does a code block filled as a part.)
    await themeEditNew('q3', {cwd, like: 'neutral'});
    await themeEditSet('q3', 'background-color', '#1e1e1e', {
      cwd,
      on: 'code-block',
    });
    const part = (await how('q3', 'silver #c0c0c0 everywhere')).flatMap(
      r => r.commands,
    );
    expect(part.join('\n')).not.toMatch(/--color-syntax-comment/);
    const slate = (await how('q0', 'slate grays')).flatMap(r => r.commands);
    expect(slate).toContain("set q0 neutral '#64748b'");
    expect(slate.join('\n')).not.toMatch(/--color-background-/);
    // (A lighter neutral worked out from the saved one names no color:
    // the surfaces stay as they are.)
    await themeEditNew('q1', {cwd, like: 'neutral'});
    await themeEditSet('q1', 'neutral', '#64748b', {cwd});
    const lighter = (await how('q1', 'lighter neutral')).flatMap(
      r => r.commands,
    );
    expect(lighter.join('\n')).toMatch(/ neutral '#/);
    expect(lighter.join('\n')).not.toMatch(/--color-background-/);
    // (A stated color with a comparative word still fills the surfaces.)
    expect(
      (await how('q1', 'a warmer neutral #f5f5dc')).flatMap(r => r.commands),
    ).toContain("set q1 --color-background-body '#f5f5dc' --mode light");
  }, 240_000);
});

describe('sides', () => {
  it('no border except the bottom one keeps that side', async () => {
    const lines = top(
      await how('q0', 'no border on inputs except the bottom one'),
    );
    expect(lines).toEqual([
      'set q0 border none --on inputs',
      "set q0 border-bottom '1px solid var(--color-border-control)' --on inputs",
    ]);
    await follow(lines);
  }, 240_000);
});

describe('plain looks', () => {
  it("a status's text at a typed size offers that size, never a step", async () => {
    const rs = await how('q0', 'warning text 10px');
    const offered = rs
      .filter(r => /no part draws only/.test(r.text))
      .flatMap(r => r.commands)
      .filter(c => /^set /.test(c));
    expect(offered.length).toBeGreaterThan(0);
    for (const c of offered)
      expect(c).toMatch(
        / (?:10px|0\.625rem) --on [\w-]+ --when [\w-]+:warning$/,
      );
    expect(rs.some(r => /^not used/.test(r.text))).toBe(false);
  });
  it("a status's text at a size and a weight writes both, and names only the parts it writes", async () => {
    for (const [ask, writes] of [
      ['warning text 10px bold', /size|font-size/],
      ['success text bold', /weight/],
    ]) {
      const r = (await how('q0', String(ask))).find(
        x => /no part draws only/.test(x.text) && x.commands.length,
      );
      const lines = (r?.commands ?? []).filter(c => /^set /.test(c));
      expect(lines.join(' '), String(ask)).toMatch(/weight (?:bold|700)/);
      expect(lines.join(' '), String(ask)).toMatch(writes);
      // (Every part the answer names gets a line.)
      const named = /each in its \w+ look: ([\w, -]+) \(/.exec(
        String(r?.text),
      )?.[1];
      for (const part of String(named).split(', '))
        expect(
          lines.some(c => c.includes(`--on ${part} `)),
          `${ask}: ${part}`,
        ).toBe(true);
    }
  });
  it("a status's text on a banner reaches its title and description, never its buttons or icon", async () => {
    for (const [ask, re] of [
      [
        'success text bold',
        /--font-weight-normal 700 --on banner --when status:success/,
      ],
      [
        'warning text 10px',
        /--text-supporting-size 0\.625rem --on banner --when status:warning/,
      ],
    ]) {
      const w = writes(await how('q0', String(ask))).join('\n');
      expect(w, String(ask)).toMatch(re);
      // (A banner's close and action buttons read the medium weight and
      // the label size of a button; its icon reads the large size.)
      expect(w, String(ask)).not.toMatch(
        /--font-weight-medium [^\n]*--on banner/,
      );
      expect(w, String(ask)).not.toMatch(/--text-large-size [^\n]*--on banner/);
      // (Nor a token its buttons read too: the title's label size is the
      // buttons' label size, so it is left, and said.)
      expect(w, String(ask)).not.toMatch(/--text-label-size [^\n]*--on banner/);
    }
    expect(JSON.stringify(await how('q0', 'warning text 10px'))).toMatch(
      /left as it is: banner's --text-label-size, which its buttons read too/,
    );
  });
  it("a status's alerts keep their status for size and weight", async () => {
    for (const [ask, status] of [
      ['success alerts with smaller text', 'success'],
      ['warning alerts bigger text', 'warning'],
    ]) {
      const w = writes(await how('q0', ask));
      expect(w.length, ask).toBeGreaterThan(0);
      for (const line of w)
        expect(line, ask).toMatch(new RegExp(`--when status:${status}$`));
    }
    // (Every banner, when no status is said.)
    expect(writes(await how('q0', 'banners smaller text'))[0]).not.toMatch(
      /--when/,
    );
  });
  it("a status's text size or weight is never the whole theme's; its color is the status's", async () => {
    for (const ask of [
      'warning text bigger',
      'danger text smaller',
      'success text bold',
      // (A status's messages or notes are its text.)
      'success messages in smaller text',
      'warning notes bigger',
    ]) {
      const rs = await how('q0', ask);
      // (Nothing is written for the whole theme's text.)
      expect(
        writes(rs.filter(r => !/no part draws only/.test(r.text))),
        ask,
      ).toEqual([]);
      expect(
        rs.some(r => /no part draws only a status's text/.test(r.text)),
        ask,
      ).toBe(true);
    }
    // (The parts that show the warning's text are offered, each in its
    // warning look: the banner and a field's status message.)
    const offered = (await how('q0', 'warning text bigger'))
      .filter(r => /no part draws only/.test(r.text))
      .flatMap(r => r.commands);
    expect(
      offered.some(l => /--on banner --when status:warning$/.test(l)),
    ).toBe(true);
    expect(
      offered.some(l => /--on field-status --when type:warning$/.test(l)),
    ).toBe(true);
    expect(writes(await how('q0', 'warning text darker'))[0]).toMatch(
      /^set q0 --color-text-warning /,
    );
  });
  it('a typed text size on a part is named as typed, never "not used"', async () => {
    const rs = await how('q0', 'menus 14px text');
    expect(rs.some(r => /each set to 14px/.test(r.text))).toBe(true);
    expect(rs.some(r => /^not used/.test(r.text))).toBe(false);
  });
  it('a color on a part is its text; a part placed in a screen owns its list; alerts are filled in their color', async () => {
    for (const ask of ['white on the CTA', 'white on accent buttons']) {
      const w = writes(await how('q0', ask));
      expect(w[0], ask).toMatch(
        /^set q0 color '#ffffff' --on button --when variant:primary/,
      );
      expect(
        w.some(c => /^set q0 accent /.test(c)),
        ask,
      ).toBe(false);
    }
    // (A hue on a part, or the last of a list of fills, is still its fill.)
    expect(writes(await how('q0', 'yellow on badges'))[0]).toMatch(
      /^set q0 background-color '#eab308' --on badge/,
    );
    expect(
      writes(
        await how('q0', 'green, blue, red, yellow on badges and status'),
      ).some(c => /^set q0 color '#eab308'/.test(c)),
    ).toBe(false);
    expect(
      writes(await how('q0', 'cards in the admin dashboard: 8px corners'))[0],
    ).toMatch(/--on card$/);
    // (Alerts said in a color are filled in it, as main reads them.)
    const blue = writes(await how('q0', 'blue alerts'));
    expect(blue[0]).toMatch(/^set q0 background-color '#2563eb' --on banner/);
    expect(blue.some(c => /danger|--color-error/.test(c))).toBe(false);
    expect(writes(await how('q0', 'red alerts'))[0]).toMatch(
      /^set q0 background-color '#dc2626' --on banner/,
    );
  });
  it('a status color list ends at its own items; an accent is never a status', async () => {
    const corners = writes(
      await how(
        'q0',
        'status colors green #15803d, amber #b45309, red #b91c1c, and 8px corners',
      ),
    );
    expect(corners).toEqual(
      expect.arrayContaining([
        `set q0 success '#15803d'`,
        `set q0 danger '#b91c1c'`,
      ]),
    );
    expect(corners.some(c => /corners|radius/.test(c))).toBe(true);
    // (A color said alone before a part the list names later is still
    // the theme's: the blue-gray is the neutral.)
    expect(
      top(
        await how(
          'q0',
          'medical records table view: dense compact rows, calm muted blue-gray, small 13px text, clear status colors: green #15803d stable, amber #b45309 pending, red #b91c1c critical, striped table rows',
        ),
      ),
    ).toContain(`set q0 neutral '#64748b'`);
    // (Only a gray: a hue said alone before a part is never the theme's.)
    expect(
      writes(await how('q0', 'red, blue buttons')).some(c =>
        /^set q0 accent /.test(c),
      ),
    ).toBe(false);
    // (A status may lead with its label.)
    expect(
      top(
        await how(
          'q0',
          'status colors: approved green #15803d, pending amber #b45309, rejected red #b91c1c',
        ),
      ),
    ).toEqual([
      `set q0 success '#15803d'`,
      `set q0 warning '#b45309'`,
      `set q0 danger '#b91c1c'`,
    ]);
    const accent = writes(
      await how('q0', 'status colors: green, amber, red, with a blue accent'),
    );
    expect(accent.some(c => /^set q0 accent /.test(c))).toBe(true);
    expect(accent.some(c => /^set q0 info /.test(c))).toBe(false);
  });
  it('status colors by hue, a typed value, blue-gray, clear errors', async () => {
    expect(
      top(
        await how(
          'q0',
          'status colors green #15803d, amber #b45309, red #b91c1c',
        ),
      ),
    ).toEqual([
      `set q0 success '#15803d'`,
      `set q0 warning '#b45309'`,
      `set q0 danger '#b91c1c'`,
    ]);
    expect(
      writes(await how('q0', 'light gray fill #F1F2F4 on cards'))[0],
    ).toMatch(/background-color '#f1f2f4' --on card/);
    // (A soft blue-gray said alone writes nothing, as main reads it.)
    expect(writes(await how('q0', 'calm soft blue-gray'))).toEqual([]);
    expect(top(await how('q0', 'clear error messages, larger text'))).toEqual([
      'set q0 text-size more',
    ]);
  }, 240_000);

  it('less contrast, a gentle dark mode, big type, deep and soft shades', async () => {
    expect(writes(await how('q0', 'less contrast'))).toEqual([
      `set q0 --color-text-primary '#333333' --mode light`,
      `set q0 --color-text-primary '#cccccc' --mode dark`,
    ]);
    // (A mood word for the dark mode names no page color: the page and the
    // surfaces keep their steps.)
    expect(writes(await how('q0', 'gentle dark mode'))).toEqual([]);
    expect(writes(await how('q0', 'softer dark mode please'))).toEqual([]);
    expect(writes(await how('q0', 'big readable text'))).toEqual([
      'set q0 text-size more',
    ]);
    expect(writes(await how('q0', 'deep teal accent'))[0]).toBe(
      `set q0 accent '#085952'`,
    );
    // (Soft is a pale shade, as main reads it.)
    expect(writes(await how('q0', 'soft coral accent'))[0]).toBe(
      `set q0 accent '#feeeee'`,
    );
    // (A soft color said as a tint is a pale wash of it, as main reads it.)
    const glass = writes(
      await how(
        'q0',
        'translucent glassy window frames, soft blue-tinted glass, white content',
      ),
    );
    expect(glass).toContain(
      `set q0 background-color '#eff6ff' --on containers --mode light`,
    );
    expect(glass.join('\n')).not.toMatch(/'#2563eb'/);
  }, 240_000);
});

describe('part words read in place', () => {
  it("an action is a button, never a menu's or a sheet's; a status before a part is its status look", async () => {
    for (const [ask, on] of [
      ['actions menu 8px corners', 'dropdown-menu'],
      ['the action sheet blue', 'bottom-sheet'],
    ]) {
      const w = writes(await how('q0', ask));
      expect(w.length, ask).toBeGreaterThan(0);
      expect(
        w.some(c => / --on button\b/.test(c)),
        ask,
      ).toBe(false);
      expect(w[0], ask).toMatch(new RegExp(` --on ${on}\\b`));
    }
    // (A call to action is the primary button, never every button.)
    for (const ask of [
      'a rounder call to action',
      'CTA buttons rounder',
      'make the call to action button rounder',
    ]) {
      const w = writes(await how('q0', ask));
      expect(w.length, ask).toBeGreaterThan(0);
      for (const c of w)
        expect(c, ask).toMatch(/ --on button --when variant:primary$/);
    }
    expect(writes(await how('q0', 'the action buttons rounder'))[0]).toMatch(
      / --on button$/,
    );
    // ("Action" names the button only before "button" or at the end of a
    // phrase: action items and an actions column are other things.)
    for (const ask of [
      'action items 8px corners',
      'action items blue',
      'the actions column bold',
    ]) {
      const w = writes(await how('q0', ask));
      expect(
        w.some(c => / --on button\b/.test(c)),
        ask,
      ).toBe(false);
    }
    // (A bare "actions" before a look reads as main reads it: the word in
    // its clause decides, never the word alone, so it names no part and
    // nothing is written.)
    for (const ask of ['actions 8px corners', 'actions 4px border']) {
      const rs = await how('q0', ask);
      expect(writes(rs), ask).toEqual([]);
      expect(texts(rs), ask).toMatch(/no part is called "actions?" here/);
    }
    {
      const rs = await how('q0', 'make the actions 8px corners');
      expect(writes(rs)).toEqual([]);
      expect(rs.some(r => /no part is called "action"/.test(r.text))).toBe(
        true,
      );
    }
    {
      const rs = await how('q0', 'actions blue');
      expect(writes(rs)).toEqual([]);
      expect(texts(rs)).toMatch(/no part is called "actions?" here/);
    }
    // ("very tight" before a type word is that type's, never the theme's
    // spacing dial at its far rung.)
    for (const [ask, own] of [
      ['very tight letter spacing', /^set q0 headings tight$/],
      ['very tight line height', /^set q0 --text-body-leading /],
    ]) {
      const w = writes(await how('q0', ask));
      expect(w[0], ask).toMatch(own);
      expect(w, ask).not.toContain('set q0 spacing tight');
    }
    expect(writes(await how('q0', 'very tight'))[0]).toBe(
      'set q0 spacing tight',
    );
    for (const [ask, when] of [
      ['white text in error banners', 'status:error'],
      ['white text in error toasts', 'type:error'],
    ]) {
      const rs = await how('q0', ask);
      expect(
        rs.some(r => /has no invalid state/.test(r.text)),
        ask,
      ).toBe(false);
      expect(
        writes(rs).some(c => c.includes(`--when ${when}`)),
        ask,
      ).toBe(true);
    }
  });
});
