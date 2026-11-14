// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The hundred-and-fifty-first pass, input readers: one repair for a
 * damaged saved mode or base everywhere; a comma read by the setting's
 * domain (a decimal comma for a ratio that takes a decimal, corners,
 * vibrancy and a spacing scale; thousands in a pixel length); pasted
 * entries read whatever output-only fields they carry; undo of two named
 * settings; lines the option reader builds checked by their command, and
 * never one that widens a change; new's comma values, base typos and name
 * readings; saved state and dial-mode words read as the reader reads them;
 * part words in part typos; color functions CSS does not take.
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  themeEditNew,
  themeEditSet,
  themeEditShow,
  themeEditUndo,
} from './theme-edit.mjs';
import {colorAsCssReads, parseColor} from './_color.mjs';
import {commaNumbers, stateSpelling} from './_normal.mjs';
import {partWords} from './_part-words.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

const BIN = path.resolve(
  import.meta.dirname,
  '../../clients/cli/bin/astryx.mjs',
);

/** @type {string} */
let cwd;
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt151-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, 240_000);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

const settingsFile = () => path.join(cwd, 'themes/t/t.settings.json');
/** @param {(d: any) => void} fn */
const editSaved = fn => {
  const d = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
  fn(d);
  fs.writeFileSync(settingsFile(), JSON.stringify(d, null, 2));
};
/** @param {() => unknown} run */
async function refusal(run) {
  try {
    await run();
  } catch (e) {
    return /** @type {any} */ (e);
  }
  throw new Error('expected a refusal');
}
const names = (/** @type {any} */ e) =>
  (e.suggestions ?? []).map((/** @type {any} */ s) => s.name);
/** The CLI's --json answer, run in the fixture. @param {string[]} args */
const cli = args =>
  JSON.parse(
    spawnSync(process.execPath, [BIN, ...args, '--json'], {
      cwd,
      encoding: 'utf8',
    }).stdout,
  );

describe('readers', () => {
  it('a comma color function CSS does not take is no color; the syntax CSS reads is offered', () => {
    for (const v of ['hsl(0, 100, 50)', 'hsl(0, 100%, 50)', 'rgb(255, 50%, 0)'])
      expect(parseColor(v)).toBeNull();
    expect(parseColor('hsl(0, 100%, 50%)')).not.toBeNull();
    expect(colorAsCssReads('hsl(0, 100, 50)')).toBe('hsl(0 100 50)');
    expect(colorAsCssReads('hsla(0, 100, 50, 1)')).toBe('hsl(0 100 50 / 1)');
  });

  it('the one comma rule reads thousands in a pixel length, else a decimal', () => {
    expect(commaNumbers('1,200px')).toBe('1200px');
    expect(commaNumbers('1,5px')).toBe('1.5px');
    expect(commaNumbers('1,125rem')).toBe('1.125rem');
    expect(commaNumbers('1,000', true)).toBe('1000');
  });

  it('the one state reader reads other letters and a colon', () => {
    expect(stateSpelling(':Hover')).toBe('hover');
    expect(stateSpelling('focusVisible')).toBe('focus-visible');
  });

  it("part words come from the part table's own words", () => {
    const w = partWords();
    expect(w.get('sidebar')).toBe('side-nav');
    expect(w.get('checkbox')).toBe('checks');
    expect(w.get('toggle')).toBe('switch');
  });
});

describe('set and undo', () => {
  it('offers the syntax CSS reads for a comma color it does not take', async () => {
    const e = await refusal(() =>
      themeEditSet('t', 'background-color', 'hsl(0, 100, 50)', {
        cwd,
        on: 'card',
      }),
    );
    expect(names(e)[0]).toMatch(
      /background-color 'hsl\(0 100 50\)' --on card$/,
    );
  }, 240_000);

  it('a part word typo is the part it names', async () => {
    const e = await refusal(() =>
      themeEditSet('t', 'padding', '8px', {cwd, on: 'sidebr'}),
    );
    expect(names(e)[0]).toMatch(/--on side-nav$/);
  }, 240_000);

  it('aspect-ratio 1,78 is the decimal 1.78', async () => {
    const e = await refusal(() =>
      themeEditSet('t', 'aspect-ratio', '1,78', {cwd, on: 'card'}),
    );
    expect(names(e)[0]).toMatch(/aspect-ratio 1\.78 --on card$/);
  }, 240_000);

  it('a decimal comma is read for corners, vibrancy and a spacing scale; thousands for a pixel length', async () => {
    const first = async (/** @type {string} */ t, /** @type {string} */ v) =>
      names(await refusal(() => themeEditSet('t', t, v, {cwd})))[0];
    expect(await first('corners', '7,5px')).toMatch(/corners 7\.5px$/);
    expect(await first('spacing', '1,125')).toMatch(/spacing roomy$/);
    expect(await first('--spacing-4', '1,000px')).toMatch(
      /--spacing-4 1000px$/,
    );
  }, 240_000);

  it('an entry pasted from show --json or set --json is one setting', async () => {
    const shown = await refusal(() =>
      themeEditSet(
        't',
        '{"thing":"padding","value":"8px","source":"property","on":"card","parts":["card"]}',
        undefined,
        {cwd},
      ),
    );
    expect(names(shown)).toEqual([
      'astryx experimental theme editor set t padding 8px --on card',
    ]);
    const listed = await refusal(() =>
      themeEditSet(
        't',
        '[{"thing":"corners","value":"pill","source":"dial"}]',
        undefined,
        {
          cwd,
        },
      ),
    );
    expect(names(listed)).toEqual([
      'astryx experimental theme editor set t corners pill',
    ]);
  }, 240_000);

  it('undo of two settings named without quotes gives one undo each', async () => {
    await themeEditSet('t', 'corners', 'pill', {cwd});
    await themeEditSet('t', 'padding', '8px', {cwd, on: 'card'});
    const e = await refusal(() =>
      themeEditUndo('t', {cwd, thing: 'corners', value: 'padding'}),
    );
    expect(names(e)).toEqual([
      'astryx experimental theme editor undo t corners',
      'astryx experimental theme editor undo t padding --on card',
    ]);
    await themeEditUndo('t', {cwd, thing: 'corners'});
    await themeEditUndo('t', {cwd, thing: 'padding', on: 'card'});
  }, 240_000);

  it('a saved state in other letters and a dial saved for one mode are read, so a change goes through', async () => {
    editSaved(d => {
      d.settings.push(
        {
          thing: 'background-color',
          value: 'red',
          source: 'property',
          on: 'card',
          state: 'Hover',
        },
        {thing: 'corners', value: 'pill', source: 'dial', mode: 'dark'},
      );
    });
    await themeEditSet('t', '--spacing-4', '12px', {cwd});
    const saved = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')).settings;
    expect(
      saved.find((/** @type {any} */ s) => s.thing === 'background-color')
        .state,
    ).toBe('hover');
    expect(
      saved.find((/** @type {any} */ s) => s.thing === 'corners').mode,
    ).toBeUndefined();
    editSaved(d => {
      d.settings = [];
    });
  }, 240_000);

  it('a saved base typo gets the same repair from show as from a change', async () => {
    editSaved(d => {
      d.like = 'ston';
    });
    try {
      const show = await refusal(() => themeEditShow('t', {cwd}));
      const change = await refusal(() =>
        themeEditSet('t', '--spacing-4', '12px', {cwd}),
      );
      expect(names(show)).toEqual(names(change));
      expect(names(show).at(-1)).toMatch(/set t base stone$/);
    } finally {
      editSaved(d => {
        d.like = 'neutral';
      });
    }
  }, 240_000);
});

describe('new', () => {
  it('a decimal comma on a dial is no color pair', async () => {
    const e = await refusal(() =>
      themeEditNew('v', {
        cwd,
        like: 'neutral',
        settings: {'text-size': '16,5'},
        check: true,
      }),
    );
    expect(names(e)).toContain(
      'astryx experimental theme editor new v --like neutral --text-size 16.5',
    );
  }, 240_000);

  it('a base typo keeps the other repairs, and says what it leaves out', async () => {
    const e = await refusal(() =>
      themeEditNew('v', {
        cwd,
        like: 'nuetral',
        settings: {spacing: 'romy'},
        check: true,
      }),
    );
    expect(names(e)).toContain(
      'astryx experimental theme editor new v --like neutral --spacing roomy',
    );
  }, 240_000);

  it('a name that reads as a built-in base keeps the base; a path names its last part', async () => {
    const neutral = await refusal(() =>
      themeEditNew('Neutral', {cwd, check: true}),
    );
    expect(names(neutral)[0]).toMatch(/new my-neutral --like neutral$/);
    const scoped = await refusal(() =>
      themeEditNew('@scope/brand', {cwd, check: true}),
    );
    expect(names(scoped)[0]).toMatch(/new brand$/);
  }, 240_000);
});

describe('lines the option reader builds', () => {
  it('are checked by their command', () => {
    const show = cli([
      'experimental',
      'theme',
      'editor',
      'show',
      't',
      '--secton',
      'buttons',
    ]);
    expect(show.suggestions[0].name).toMatch(/editor show t$/);
    const made = cli([
      'experimental',
      'theme',
      'editor',
      'new',
      'w',
      '--lkie',
      'nuetral',
    ]);
    expect(made.suggestions[0].name).toMatch(/editor new w --like neutral$/);
  }, 120_000);

  it('never leave out a value-less option that narrows the change', () => {
    const r = cli([
      'experimental',
      'theme',
      'editor',
      'show',
      't',
      '--section',
    ]);
    expect(r.suggestions[0].name).toMatch(/editor show t$/);
  }, 60_000);
});
