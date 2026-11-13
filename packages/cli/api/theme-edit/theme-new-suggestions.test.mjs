// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Every `new` command a refusal suggests is followed, from many
 * combinations of options: the chain of suggestions reaches a `new` that is
 * accepted, never repeats a command, and keeps every valid option given.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {createRequire} from 'node:module';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew} from './theme-edit.mjs';
import {HEADING_TRACKING, HEADING_WEIGHTS, P} from './_tables.mjs';
import {AstryxError} from '../error.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;
/** @type {string} */
let installed;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-new-suggest-', FIXTURE_PACKAGES);
  await themeEditNew('mine', {cwd});
  // A base this fixture has installed, if any: only that one is kept.
  const req = createRequire(path.join(cwd, 'package.json'));
  installed =
    ['neutral', 'stone', 'y2k'].find(b => {
      try {
        req.resolve(`@astryxdesign/theme-${b}/built`);
        return true;
      } catch {
        return false;
      }
    }) ?? '';
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/**
 * The words of a printed command, as a POSIX shell reads single quotes.
 * @param {string} line
 */
function words(line) {
  /** @type {string[]} */
  const out = [];
  let cur = '';
  let quoted = false;
  let any = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quoted) {
      if (c === "'") quoted = false;
      else cur += c;
    } else if (c === "'") {
      quoted = true;
      any = true;
    } else if (c === ' ') {
      if (cur || any) out.push(cur);
      cur = '';
      any = false;
    } else cur += c;
  }
  if (cur || any) out.push(cur);
  return out;
}

/**
 * A `new` command as themeEditNew's arguments.
 * @param {string} line
 */
function parseNew(line) {
  const w = words(line.slice(P.length).trim());
  expect(w[0]).toBe('new');
  const name = w[1];
  /** @type {{like?: string, png: boolean, settings: Record<string, string | string[]>}} */
  const o = {png: false, settings: {}};
  for (let i = 2; i < w.length; i += 1) {
    const flag = w[i].replace(/^--/, '');
    if (flag === 'png') o.png = true;
    else if (flag === 'like') o.like = w[(i += 1)];
    else {
      const v = w[(i += 1)];
      const had = o.settings[flag];
      o.settings[flag] = flag === 'headings' ? [...[had ?? []].flat(), v] : v;
    }
  }
  return {name, ...o};
}

/** The flags a run was given, as `--flag value` strings. */
const flagsOf = (/** @type {ReturnType<typeof parseNew>} */ o) => [
  ...(o.like ? [`--like ${o.like}`] : []),
  ...Object.entries(o.settings).flatMap(([k, v]) =>
    [v].flat().map(x => `--${k} ${x}`),
  ),
  ...(o.png ? ['--png'] : []),
];

const axisOf = (/** @type {string} */ w) =>
  HEADING_WEIGHTS[w] !== undefined
    ? 'weight'
    : HEADING_TRACKING[w] !== undefined
      ? 'tracking'
      : null;

/** The options of `o` valid on their own, which every suggestion keeps. */
function validFlags(/** @type {ReturnType<typeof parseNew>} */ o) {
  const keep = [];
  if ((installed && o.like === installed) || o.like === 'none')
    keep.push(`--like ${o.like}`);
  if (o.settings.accent === 'red') keep.push('--accent red');
  if (o.settings.corners === 'pill') keep.push('--corners pill');
  const seen = new Set();
  for (const h of [o.settings.headings ?? []].flat()) {
    const axis = axisOf(h);
    if (!axis || seen.has(axis)) continue;
    seen.add(axis);
    keep.push(`--headings ${h}`);
  }
  if (o.png) keep.push('--png');
  return keep;
}

const HEADINGS = [
  [],
  ['bold'],
  ['BOLD'],
  ['tight', 'BOLD'],
  ['bold', 'heavy', 'medium'],
  ['bold', 'tight', 'heavy'],
  ['blah'],
  ['tight', 'tighter', 'heavy'],
];
const LIKES = [undefined, 'INSTALLED', 'Neutral', 'banana', 'none', 'mine'];
const NAMES = ['NEW', 'neutral', 'Bad Name!'];
const ACCENTS = [undefined, 'red', 'banana'];
const CORNERS = [undefined, 'pill', 'pil'];

const combos = Array.from({length: 96}, (_, i) => ({
  i,
  headings: HEADINGS[i % HEADINGS.length],
  like: LIKES[Math.floor(i / 2) % LIKES.length],
  name: NAMES[Math.floor(i / 3) % NAMES.length],
  accent: ACCENTS[Math.floor(i / 5) % ACCENTS.length],
  corners: CORNERS[Math.floor(i / 7) % CORNERS.length],
  png: i % 4 === 1,
}));

describe('every suggested new is accepted and keeps the valid options', () => {
  it('follows each refusal to an accepted new', async () => {
    const failures = [];
    for (const c of combos) {
      /** @type {ReturnType<typeof parseNew>} */
      const start = {
        name: c.name === 'NEW' ? `g${c.i}` : c.name,
        ...(c.like
          ? {like: c.like === 'INSTALLED' ? installed || 'neutral' : c.like}
          : {}),
        png: c.png,
        settings: {
          ...(c.headings.length ? {headings: c.headings} : {}),
          ...(c.accent ? {accent: c.accent} : {}),
          ...(c.corners ? {corners: c.corners} : {}),
        },
      };
      const want = validFlags(start);
      let run = start;
      const seen = new Set();
      let accepted = null;
      for (let hop = 0; hop < 6; hop += 1) {
        const line = `new ${run.name} ${flagsOf(run).join(' ')}`;
        if (seen.has(line)) {
          failures.push(`${c.i}: loop at ${line}`);
          break;
        }
        seen.add(line);
        try {
          await themeEditNew(run.name, {
            cwd,
            like: run.like,
            png: run.png,
            settings: run.settings,
          });
          accepted = run;
          fs.rmSync(path.join(cwd, 'themes', run.name), {
            recursive: true,
            force: true,
          });
          break;
        } catch (e) {
          if (!(e instanceof AstryxError)) throw e;
          const next = (e.suggestions ?? []).find(s =>
            s.name.startsWith(`${P} new `),
          );
          if (!next) {
            failures.push(`${c.i}: ${line} refused with no new: ${e.message}`);
            break;
          }
          run = parseNew(next.name);
          const lost = want.filter(f => !flagsOf(run).includes(f));
          if (lost.length)
            failures.push(`${c.i}: ${next.name} drops ${lost.join(', ')}`);
        }
      }
      if (!accepted && !failures.some(f => f.startsWith(`${c.i}:`)))
        failures.push(
          `${c.i}: never accepted from new ${start.name} ${flagsOf(start).join(' ')}`,
        );
    }
    expect(failures).toEqual([]);
  }, 900_000);
});
