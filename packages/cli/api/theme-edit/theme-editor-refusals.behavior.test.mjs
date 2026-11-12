// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Every refusal of `experimental theme editor` leads with a command
 * that runs: for each refusal code the editor raises, the first suggestion
 * is run exactly as printed, and it must exit 0.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {runCli} from '../../test-utils/run-cli.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

/** @param {string[]} args */
const cli = async args => {
  const r = await runCli(['--json', ...args], {cwd});
  return {status: r.status, body: JSON.parse(r.stdout || '{}')};
};

/**
 * The words of a printed command, as a POSIX shell reads them (single
 * quotes, as the suggestions quote).
 * @param {string} line
 */
function words(line) {
  /** @type {string[]} */
  const out = [];
  let cur = '';
  let inWord = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'") {
      const end = line.indexOf("'", i + 1);
      cur += line.slice(i + 1, end);
      i = end;
      inWord = true;
    } else if (c === ' ') {
      if (inWord) out.push(cur);
      cur = '';
      inWord = false;
    } else {
      cur += c;
      inWord = true;
    }
  }
  if (inWord) out.push(cur);
  return out;
}

/** @param {string} slug @param {(d: any) => void} edit */
const editSettings = (slug, edit) => {
  const file = path.join(cwd, `themes/${slug}/${slug}.settings.json`);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  edit(data);
  fs.writeFileSync(file, JSON.stringify(data));
};

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-refusals-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  expect(
    (await cli(['experimental', 'theme', 'editor', 'new', 't'])).status,
  ).toBe(0);
}, 120_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

const E = ['experimental', 'theme', 'editor'];

/** @type {Array<[string, string, string[], (() => unknown)?]>} */
const CASES = [
  [
    'a dial value',
    'ERR_THEME_BAD_VALUE',
    [...E, 'set', 't', 'spacing', 'roomyy'],
  ],
  [
    'a headings value',
    'ERR_THEME_BAD_VALUE',
    [...E, 'set', 't', 'headings', 'boldd'],
  ],
  [
    'a corners value',
    'ERR_THEME_BAD_VALUE',
    [...E, 'set', 't', 'corners', '1.5rem'],
  ],
  [
    'a mode',
    'ERR_THEME_BAD_VALUE',
    [...E, 'set', 't', 'color', 'red', '--on', 'button', '--mode', 'darkk'],
  ],
  [
    'a state',
    'ERR_THEME_UNKNOWN_STATE',
    [...E, 'set', 't', 'color', 'red', '--on', 'button', '--state', 'hoverr'],
  ],
  [
    'a step on a token',
    'ERR_THEME_BAD_VALUE',
    [...E, 'set', 't', '--color-accent', 'more'],
  ],
  [
    'a step on a property',
    'ERR_THEME_BAD_VALUE',
    [...E, 'set', 't', 'padding', 'more', '--on', 'card'],
  ],
  [
    'a CSS value the property does not take',
    'ERR_THEME_BAD_VALUE',
    [...E, 'set', 't', 'display', 'flexx', '--on', 'card'],
  ],
  [
    'a part in another case',
    'ERR_THEME_UNKNOWN_PART',
    [...E, 'set', 't', 'corners', 'pill', '--on', 'Button'],
  ],
  [
    'an unknown thing',
    'ERR_THEME_UNKNOWN_THING',
    [...E, 'set', 't', 'bg', 'red', '--on', 'card'],
  ],
  [
    'spacing in a state',
    'ERR_THEME_NO_EFFECT',
    [
      ...E,
      'set',
      't',
      'spacing',
      'roomy',
      '--on',
      'button',
      '--state',
      'hover',
    ],
  ],
  ['a theme that does not exist', 'ERR_UNKNOWN_THEME', [...E, 'show', 'nope']],
  ['a theme that exists', 'ERR_FILE_EXISTS', [...E, 'new', 't']],
  [
    'a setting that is not set',
    'ERR_THEME_NOT_SET',
    [...E, 'undo', 't', 'vibrancy'],
  ],
  [
    '--section given twice',
    'ERR_INVALID_ARGUMENT',
    [...E, 'show', 't', '--section', 'inputs', '--section', 'actions'],
  ],
  [
    'how with --at and --list',
    'ERR_INVALID_ARGUMENT',
    [...E, 'how', '--list', 'parts', '--at', '1,1'],
  ],
  [
    'two bad saved settings',
    'ERR_THEME_INVALID',
    [...E, 'show', 'b2'],
    async () => {
      await cli([...E, 'new', 'b2']);
      editSettings('b2', d => {
        d.settings = [
          {thing: 'color', value: 'red', source: 'property', on: 'buton'},
          {
            thing: 'color',
            value: 'red',
            source: 'property',
            on: 'button',
            state: 'banana',
          },
        ];
      });
    },
  ],
  [
    'settings that are not JSON, with no step to go back to',
    'ERR_THEME_INVALID',
    [...E, 'show', 'dj'],
    () => {
      fs.mkdirSync(path.join(cwd, 'themes/dj'), {recursive: true});
      fs.writeFileSync(path.join(cwd, 'themes/dj/dj.settings.json'), '{"x":');
    },
  ],
];

describe('every editor refusal leads with a command that runs', () => {
  for (const [what, code, args, setup] of CASES)
    it(`${code}: ${what}`, async () => {
      await setup?.();
      const r = await cli(args);
      expect(r.status, JSON.stringify(r.body)).not.toBe(0);
      expect(r.body.code ?? r.body.error?.code).toBe(code);
      const first = (r.body.suggestions ?? r.body.error?.suggestions ?? [])[0]
        ?.name;
      // The runner prefix (astryx, npx …, pnpm dlx …) is the user's; the
      // command starts at `experimental`.
      const argv = words(first);
      expect(argv, JSON.stringify(r.body)).toContain('experimental');
      const again = await cli(argv.slice(argv.indexOf('experimental')));
      expect(again.status, `${first}: ${JSON.stringify(again.body)}`).toBe(0);
    }, 240_000);
});
