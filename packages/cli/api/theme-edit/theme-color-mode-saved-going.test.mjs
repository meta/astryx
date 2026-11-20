// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A color set with no --mode in a one-mode theme is saved for that
 * mode: going back to both modes keeps it there, a color saved for the
 * other mode stays, and an undo with no --mode removes it.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {themeEditNew} from './theme-edit.mjs';
import {splitCommand} from './_vet.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

const T = 240_000;
const ED = ['experimental', 'theme', 'editor'];
/** @type {string} */
let cwd;
/** @type {string} */
let fresh;
const file = () => path.join(cwd, 'themes/t/t.settings.json');
beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-color-mode-saved-going-',
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
  fs.rmSync(path.join(cwd, 'themes/t/.history.json'), {force: true});
});

/** @returns {any} */
const saved = () => JSON.parse(fs.readFileSync(file(), 'utf8'));
/** @param {(d: any) => void} edit */
const editFile = edit => {
  const d = saved();
  edit(d);
  fs.writeFileSync(file(), `${JSON.stringify(d, null, 2)}\n`);
};

/**
 * An editor command with --json: its exit status and its result.
 * @param {string[]} args
 */
async function cli(args) {
  const r = await runCli([...ED, ...args, '--json'], {cwd});
  const text = [r.stdout, r.stderr].find(x => x.trim().startsWith('{')) ?? '{}';
  return {status: r.status, json: JSON.parse(text)};
}

/** The words of an offered line after the editor's name. @param {string} line */
const wordsOf = line => {
  const w = splitCommand(line);
  return w.slice(w.indexOf('editor') + 1);
};

/** The offered lines, as words after the editor's name. @param {any} json */
const offered = json =>
  (json.suggestions ?? []).map((/** @type {any} */ s) => wordsOf(s.name));

const css = () => fs.readFileSync(path.join(cwd, 'themes/t/t.css'), 'utf8');
const body = () =>
  /--color-background-body:\s*([^;]+);/.exec(css())?.[1]?.trim() ?? '';

describe('a color set in a dark-only theme', () => {
  it(
    'is saved for dark, and stays dark when the theme goes back to both modes',
    async () => {
      expect((await cli(['set', 't', 'mode', 'dark-only'])).status).toBe(0);
      expect(
        (await cli(['set', 't', '--color-background-body', '#111111'])).status,
      ).toBe(0);
      expect(saved().settings).toContainEqual(
        expect.objectContaining({
          thing: '--color-background-body',
          value: '#111111',
          mode: 'dark',
        }),
      );
      expect((await cli(['set', 't', 'mode', 'both'])).status).toBe(0);
      expect(body()).toMatch(/^light-dark\((?!#111111)[^,]+,\s*#111111\)$/);
      expect((await cli(['set', 't', 'mode', 'dark-only'])).status).toBe(0);
      expect((await cli(['undo', 't', '--color-background-body'])).status).toBe(
        0,
      );
      expect(
        saved().settings.filter(
          (/** @type {any} */ s) => s.thing === '--color-background-body',
        ),
      ).toEqual([]);
    },
    T,
  );

  it(
    'keeps the color saved for the other mode',
    async () => {
      expect((await cli(['set', 't', 'mode', 'dark-only'])).status).toBe(0);
      expect(
        (
          await cli([
            'set',
            't',
            '--color-background-body',
            '#fff8e7',
            '--mode',
            'light',
          ])
        ).status,
      ).toBe(0);
      expect(
        (await cli(['set', 't', '--color-background-body', '#111111'])).status,
      ).toBe(0);
      const held = saved()
        .settings.filter(
          (/** @type {any} */ s) => s.thing === '--color-background-body',
        )
        .map((/** @type {any} */ s) => [s.value, s.mode]);
      expect(held).toEqual(
        expect.arrayContaining([
          ['#fff8e7', 'light'],
          ['#111111', 'dark'],
        ]),
      );
      expect(body()).toBe('light-dark(#fff8e7, #111111)');
    },
    T,
  );
});
