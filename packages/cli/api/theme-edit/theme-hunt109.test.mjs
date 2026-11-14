// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Settings files edited by hand and names and flags typed loosely: a
 * null entry, a damaged mode or base, a missing or changed name, headings
 * halves listed twice or under the wrong half, a dial listed twice, a part
 * in other letters with --only, short unknown words, the theme-name rule,
 * a step past a dial's end, and a built-in theme that is not installed.
 * Every suggestion is followed, and it works.
 *
 * @position api/theme-edit — tests
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {themeEditNew} from './theme-edit.mjs';
import {splitCommand} from './_vet.mjs';
import {baseInstalled} from './_project.mjs';
import {LIKE} from './_tables.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';

const BIN = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../clients/cli/bin/astryx.mjs',
);
const T = 240_000;
const ED = ['experimental', 'theme', 'editor'];

/** @type {string} */
let cwd;
/** @type {string} */
let fresh;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hand-edits-', FIXTURE_PACKAGES);
  await themeEditNew('t', {cwd});
  fresh = fs.readFileSync(file(), 'utf8');
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

beforeEach(() => {
  fs.writeFileSync(file(), fresh);
  fs.rmSync(path.join(cwd, 'themes/t/t.history.json'), {force: true});
});

/**
 * Run the CLI with --json; the envelope it prints.
 * @param {string[]} args
 * @returns {any}
 */
const cli = args => {
  const r = spawnSync(process.execPath, [BIN, ...args, '--json'], {
    cwd,
    encoding: 'utf8',
  });
  return JSON.parse(r.stdout);
};

/**
 * Run a suggested editor command as printed (from `experimental` on).
 * @param {string} line
 */
const follow = line => {
  const args = splitCommand(line.slice(line.indexOf('experimental ')));
  if (!args) throw new Error(`cannot read ${line}`);
  return cli(args);
};

const file = () => path.join(cwd, 'themes/t/t.settings.json');
const data = () => JSON.parse(fs.readFileSync(file(), 'utf8'));
/** @param {(d: any) => void} fn */
const edit = fn => {
  const d = data();
  fn(d);
  fs.writeFileSync(file(), JSON.stringify(d, null, 2));
};

describe('a null entry in the settings list', () => {
  it(
    'set gives the file refusal, and its step back works',
    () => {
      cli([...ED, 'set', 't', 'corners', 'pill']);
      edit(d => d.settings.push(null));
      const r = cli([...ED, 'set', 't', 'font', 'inter']);
      expect(r.code).toBe('ERR_THEME_INVALID');
      const back = r.suggestions.find((/** @type {any} */ x) =>
        / editor undo t$/.test(x.name),
      );
      expect(back).toBeTruthy();
      expect(follow(back.name).error).toBeUndefined();
      expect(data().settings).toEqual([]);
      expect(
        cli([...ED, 'set', 't', 'corners', 'round']).error,
      ).toBeUndefined();
    },
    T,
  );
});

describe('a damaged mode or base saved by hand', () => {
  it(
    'a change reads it as meant, and undo steps back to that, keeping the history',
    () => {
      cli([...ED, 'set', 't', 'corners', 'pill']);
      edit(d => {
        d.mode = 'Dark-Only';
      });
      const r = cli([...ED, 'set', 't', 'spacing', 'roomy']);
      expect(r.data.notes).toContain(
        'mode was written "Dark-Only", so it is saved as dark-only',
      );
      expect(cli([...ED, 'undo', 't']).error).toBeUndefined();
      expect(data().mode).toBe('dark-only');
      expect(data().settings).toEqual([
        expect.objectContaining({thing: 'corners', value: 'pill'}),
      ]);
      // The step before it is still there.
      expect(cli([...ED, 'undo', 't']).error).toBeUndefined();
      expect(data().settings).toEqual([]);
    },
    T,
  );

  it(
    'like "none" is no base: show reads it, and set and undo work',
    () => {
      edit(d => {
        d.like = 'none';
      });
      expect(cli([...ED, 'show', 't']).error).toBeUndefined();
      expect(
        cli([...ED, 'set', 't', 'spacing', 'roomy']).error,
      ).toBeUndefined();
      expect(data()).not.toHaveProperty('like');
      expect(cli([...ED, 'undo', 't']).error).toBeUndefined();
    },
    T,
  );
});

describe('the name in the settings file', () => {
  it(
    'a missing or other name is the folder name, saved by the next change',
    () => {
      for (const change of [
        (/** @type {any} */ d) => delete d.name,
        (/** @type {any} */ d) => (d.name = 'other'),
      ]) {
        edit(change);
        const r = cli([...ED, 'set', 't', 'accent', '#7c3aed']);
        expect(r.error).toBeUndefined();
        expect(data().name).toBe('t');
      }
    },
    T,
  );
});

describe('headings halves', () => {
  it(
    'a half listed twice offers keep lines that work',
    () => {
      cli([...ED, 'set', 't', 'headings', 'tight']);
      edit(d =>
        d.settings.push({
          thing: 'headings',
          value: 'wide',
          source: 'dial',
          axis: 'tracking',
        }),
      );
      const r = cli([...ED, 'show', 't']);
      const keep = r.suggestions.find((/** @type {any} */ x) =>
        / editor set t headings tight$/.test(x.name),
      );
      expect(keep).toBeTruthy();
      expect(follow(keep.name).error).toBeUndefined();
      expect(
        data().settings.filter(
          (/** @type {any} */ x) => x.thing === 'headings',
        ),
      ).toEqual([expect.objectContaining({value: 'tight', axis: 'tracking'})]);
    },
    T,
  );

  it(
    'a value under the wrong half, or an axis on another dial, is refused with the undo that works',
    () => {
      edit(d => {
        d.settings = [
          {thing: 'headings', value: 'bold', source: 'dial', axis: 'tracking'},
        ];
      });
      const r = cli([...ED, 'show', 't']);
      expect(r.error).toContain('headings "bold" is not a tracking');
      expect(r.suggestions[0].name).toMatch(
        / editor undo t headings tracking$/,
      );
      expect(follow(r.suggestions[0].name).error).toBeUndefined();
      expect(data().settings).toEqual([]);
      edit(d => {
        d.settings = [
          {thing: 'corners', value: 'pill', source: 'dial', axis: 'x'},
        ];
      });
      const c = cli([...ED, 'show', 't']);
      expect(c.error).toContain('corners has an axis ("x")');
      expect(follow(c.suggestions[0].name).error).toBeUndefined();
    },
    T,
  );
});

describe('a dial listed twice by hand', () => {
  it(
    'set names every entry it replaces',
    () => {
      cli([...ED, 'set', 't', 'corners', 'pill']);
      edit(d =>
        d.settings.push({thing: 'corners', value: 'square', source: 'dial'}),
      );
      const r = cli([...ED, 'set', 't', 'corners', 'round']);
      expect(r.data.notes).toContain(
        'corners (whole theme) was listed twice (pill, square); each is replaced',
      );
      expect(
        data().settings.filter((/** @type {any} */ x) => x.thing === 'corners'),
      ).toHaveLength(1);
    },
    T,
  );
});

describe('--only with a part in other letters or misspelt', () => {
  it(
    'leads with the command on the part, --only kept, and it works',
    () => {
      for (const on of ['Text-Input', 'text-inptu']) {
        const r = cli([
          ...ED,
          'set',
          't',
          'border',
          '1px solid red',
          '--on',
          on,
          '--only',
        ]);
        expect(r.error, on).not.toContain('--only is for one member');
        expect(r.suggestions[0].name, on).toMatch(
          / editor set t border '1px solid red' --on text-input --only$/,
        );
        expect(follow(r.suggestions[0].name).error, on).toBeUndefined();
      }
    },
    T,
  );
});

describe('short unknown words', () => {
  it(
    'one to three letters get no did-you-mean names, only the lists',
    () => {
      for (const word of ['e', 'ra', 'ing']) {
        const r = cli([...ED, 'set', 't', word, 'pill']);
        expect(
          r.suggestions.filter(
            (/** @type {any} */ x) => x.reason === 'did you mean',
          ),
          word,
        ).toEqual([]);
      }
    },
    T,
  );
});

describe('the theme-name rule', () => {
  it(
    'states the dash rule new follows, in the refusal and in the help',
    () => {
      const r = cli([...ED, 'new', 'T']);
      expect(r.error).toContain('a dash only between letters or digits');
      const help = spawnSync(process.execPath, [BIN, ...ED, 'new', '--help'], {
        cwd,
        encoding: 'utf8',
      }).stdout;
      expect(help.replace(/\s+/g, ' ')).toContain(
        'a dash only between letters or digits',
      );
    },
    T,
  );
});

describe('a step past the end of a dial', () => {
  it(
    'is refused with the other way, which works',
    () => {
      cli([...ED, 'set', 't', 'spacing', 'spacious']);
      const r = cli([...ED, 'set', 't', 'spacing', 'more']);
      expect(r.code).toBe('ERR_THEME_NO_EFFECT');
      expect(r.error).toContain('already at its largest step');
      expect(r.suggestions[0].name).toMatch(/ editor set t spacing less$/);
      expect(follow(r.suggestions[0].name).error).toBeUndefined();
    },
    T,
  );
});

describe('a built-in theme that is not installed', () => {
  it(
    'leads with its install line, and the theme on no base works',
    () => {
      const missing = LIKE.find(b => !baseInstalled(cwd, b));
      if (!missing) return;
      const r = cli([...ED, 'show', missing]);
      expect(r.suggestions[0].name).toContain(`@astryxdesign/theme-${missing}`);
      expect(r.suggestions[1].name).toMatch(
        new RegExp(` editor new my-${missing} --like ${missing}$`),
      );
      const bare = r.suggestions.find((/** @type {any} */ x) =>
        new RegExp(` editor new my-${missing}$`).test(x.name),
      );
      expect(bare).toBeTruthy();
      expect(follow(bare.name).error).toBeUndefined();
    },
    T,
  );
});

describe('a value saved in another form', () => {
  it(
    'leaves the build current, so compile --check passes right after',
    () => {
      for (const [thing, value] of [
        ['corners', '0.5rem'],
        ['text-size', '15.5'],
      ]) {
        expect(cli([...ED, 'set', 't', thing, value]).error).toBeUndefined();
        const check = cli([
          'experimental',
          'theme',
          'compile',
          'themes/t/t.theme.ts',
          '--check',
        ]);
        expect(check.error, value).toBeUndefined();
      }
    },
    T,
  );
});

describe('an unknown word after preview', () => {
  it(
    'a typo of a subcommand leads with it; a theme here leads with its pages',
    () => {
      const typo = cli(['experimental', 'theme', 'preview', 'lst']);
      expect(typo.suggestions[0].name).toMatch(/ theme preview list$/);
      expect(
        typo.suggestions.map((/** @type {any} */ x) => x.name),
      ).not.toContainEqual(expect.stringMatching(/--theme lst$/));
      const theme = cli(['experimental', 'theme', 'preview', 't']);
      expect(theme.suggestions[0].name).toMatch(
        / theme preview add --theme t$/,
      );
    },
    T,
  );
});
