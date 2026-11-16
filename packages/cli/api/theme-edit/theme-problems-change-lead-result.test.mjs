// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Problems a change makes lead its result, each with the command that
 * fixes it; show ends with every problem the theme has now. A text token set
 * on the part the text sits on counts for that text. Every fix line is
 * followed, and it clears its problem.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {themeEditNew} from './theme-edit.mjs';
import {splitCommand} from './_vet.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

// The renders are stood in for: these tests are about settings, files and
// messages, not the rendered pages.
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

const T = 240_000;
const ED = ['experimental', 'theme', 'editor'];

/** @type {string} */
let cwd;
/** @type {string} */
let fresh;

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-problems-change-lead-result-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
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
const cli = async args => {
  const r = await runCli([...args, '--json'], cwd);
  return JSON.parse(r.stdout);
};

/**
 * Run a suggested editor command as printed (from `experimental` on).
 * @param {string} line
 */
const follow = async line => {
  const args = splitCommand(line.slice(line.indexOf('experimental ')));
  if (!args) throw new Error(`cannot read ${line}`);
  return await cli(args);
};

const file = () => path.join(cwd, 'themes/t/t.settings.json');

const data = () => JSON.parse(fs.readFileSync(file(), 'utf8'));
/** The suggestion names. @param {any} r */
const names = r => (r.suggestions ?? []).map((/** @type {any} */ x) => x.name);

/** Run the CLI as text; what it prints. @param {string[]} args */
const text = async args => (await runCli(args, cwd)).stdout;

describe('problems a change makes', () => {
  it(
    'lead the result under the status line, each with a fix that clears it',
    async () => {
      // (A border the color of the dark page draws nothing there.)
      await cli([...ED, 'set', 't', '--color-border', '#1b1b1b']);
      const out = await text([
        ...ED,
        'set',
        't',
        'background-color',
        '#FFE600',
        '--on',
        'card',
      ]);
      const lines = out.split('\n');
      expect(lines[0]).toMatch(
        /^\[ok\] t: background-color = #FFE600 on card, but it made \d+ new problems:$/,
      );
      expect(lines.slice(1, 4).join('\n')).toContain(
        'text in heading ("This week") is 1.27:1 in dark (--color-text-primary on card\'s #FFE600)',
      );

      const r = await cli([
        ...ED,
        'set',
        't',
        'background-color',
        '#FFE600',
        '--on',
        'card',
      ]);
      // Set again, nothing is new.
      expect(r.data.newProblems).toEqual([]);
      const shown = await cli([...ED, 'show', 't']);
      const open = shown.data.openProblems;
      const heading = open.find((/** @type {any} */ p) =>
        p.problem.startsWith('text in heading'),
      );
      expect(heading.fix).toMatch(
        / set t --color-text-primary '#000000' --on card --mode dark$/,
      );
      // Following each text fix clears every card text problem.
      const fixes = [
        ...new Set(
          open
            .filter(
              (/** @type {any} */ p) => p.fix && /on card's/.test(p.problem),
            )
            .map((/** @type {any} */ p) => p.fix),
        ),
      ];
      for (const fix of fixes)
        expect((await follow(fix)).error).toBeUndefined();
      const after = (await cli([...ED, 'show', 't'])).data.openProblems;
      expect(
        after.filter((/** @type {any} */ p) => /on card's/.test(p.problem)),
      ).toEqual([]);

      // The border's fix clears it too.
      const border = after.find((/** @type {any} */ p) =>
        p.problem.startsWith('the border --color-border'),
      );
      // (The nearest color that shows, not plain white.)
      expect(border.fix).toMatch(
        / set t --color-border '#[0-9a-f]{6}' --mode dark$/,
      );
      expect((await follow(border.fix)).error).toBeUndefined();
      expect((await cli([...ED, 'show', 't'])).data.openProblems).toEqual([]);
    },
    T,
  );

  it(
    'a border on a control gets a fix on that part, and following it clears it',
    async () => {
      const r = await cli([
        ...ED,
        'set',
        't',
        'border-color',
        '#f4f4f4',
        '--on',
        'text-input',
        '--only',
      ]);
      const problem = r.data.newProblems.find((/** @type {any} */ p) =>
        p.problem.startsWith('the border on text-input'),
      );
      expect(problem.fix).toMatch(
        / set t border-color '#[0-9a-f]{6}' --on text-input --only --mode light$/,
      );
      expect((await follow(problem.fix)).error).toBeUndefined();
      expect(
        (await cli([...ED, 'show', 't'])).data.openProblems.filter(
          (/** @type {any} */ p) =>
            p.problem.startsWith('the border on text-input'),
        ),
      ).toEqual([]);
    },
    T,
  );

  it(
    'a color that fails its contrast check is a new problem, and show ends with it',
    async () => {
      const r = await cli([...ED, 'set', 't', 'accent', '#FFE600']);
      expect(r.data.newProblems).toEqual([
        {
          problem: expect.stringContaining(
            'in light, your exact accent stands out from the page at only 1.12:1',
          ),
          fix: null,
        },
      ]);
      const out = (await text([...ED, 'show', 't'])).trimEnd().split('\n');
      const at = out.findIndex(l => l.startsWith('openProblems:'));
      expect(at).toBeGreaterThan(0);
      expect(out.slice(at + 1).join('\n')).toContain(
        'your exact accent stands out from the page at only 1.12:1',
      );
    },
    T,
  );

  it(
    'a change that only moves a ratio makes no new problem',
    async () => {
      await cli([
        ...ED,
        'set',
        't',
        'background-color',
        '#FFE600',
        '--on',
        'card',
      ]);
      const r = await cli([
        ...ED,
        'set',
        't',
        'background-color',
        '#FFEE00',
        '--on',
        'card',
      ]);
      expect(r.data.problems.length).toBeGreaterThan(0);
      expect(r.data.newProblems).toEqual([]);
    },
    T,
  );

  it(
    'a color check that failed before the change is no new problem',
    async () => {
      // The accent's own check fails at #FFEE00 and still fails at #FFE600
      // (a better ratio): only a check that passed before is new.
      const first = await cli([...ED, 'set', 't', 'accent', '#FFEE00']);
      expect(first.data.newProblems.length).toBeGreaterThan(0);
      const r = await cli([...ED, 'set', 't', 'accent', '#FFE600']);
      expect(r.data.newProblems).toEqual([]);
    },
    T,
  );

  it(
    'past eight failing pairs, every one is listed and compared, the text counts the rest, and following one fix makes none new',
    async () => {
      const r = await cli([
        ...ED,
        'set',
        't',
        'background-color',
        '#ffff66',
        '--on',
        'badge',
      ]);
      const made = r.data.newProblems;
      expect(made.length).toBeGreaterThan(8);
      const open = (await cli([...ED, 'show', 't'])).data.openProblems;
      expect(open.length).toBeGreaterThanOrEqual(made.length);
      const shown = await text([...ED, 'show', 't']);
      expect(shown).toContain(
        `and ${open.length - 8} more (--json lists every one, each with its fix)`,
      );
      const first = made.find((/** @type {any} */ p) => p.fix);
      const after = await follow(first.fix);
      expect(after.error).toBeUndefined();
      expect(after.data.newProblems).toEqual([]);
      const left = (await cli([...ED, 'show', 't'])).data.openProblems;
      expect(left.length).toBeLessThan(open.length);
    },
    T,
  );

  it(
    'a theme with none lists none, and its JSON list is empty',
    async () => {
      expect(await text([...ED, 'show', 't'])).not.toContain('openProblems');
      expect((await cli([...ED, 'show', 't'])).data.openProblems).toEqual([]);
    },
    T,
  );
});
