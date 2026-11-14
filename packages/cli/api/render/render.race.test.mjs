// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A restore whose new folder another run creates while it runs: the
 * other run's write lands in the moment between this run's plan and its
 * write, which only a stand-in for the file system can place there.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {render} from './render.mjs';
import {makeLinkedFixture, removeLinkedFixture} from '../../test-utils/linked-fixture.mjs';

/** The folder another run creates just before this run moves its own into place. */
const race = {folder: '', done: false};

vi.mock('node:fs', async importOriginal => {
  const real = /** @type {typeof import('node:fs')} */ (await importOriginal());
  /** @type {typeof real.renameSync} */
  const renameSync = (from, to) => {
    if (!race.done && to === race.folder) {
      race.done = true;
      real.mkdirSync(path.join(race.folder, 'other'), {recursive: true});
      real.writeFileSync(path.join(race.folder, 'other', 'page.tsx'), 'the other run\n');
    }
    real.renameSync(from, to);
  };
  return {...real, renameSync, default: {...real, renameSync}};
});

/** @type {string} */
let dir;
const PAGE = 'export default function Page() {\n  return <p>Raced page</p>;\n}\n';

beforeAll(async () => {
  dir = makeLinkedFixture('astryx-render-race-', ['@astryxdesign', '@stylexjs', 'react', 'react-dom']);
  fs.writeFileSync(path.join(dir, 'page.tsx'), PAGE);
  await render('page.tsx', {cwd: dir});
}, 60_000);

afterAll(() => {
  removeLinkedFixture(dir);
});

describe('render --reverse --out: a new folder another run creates first', () => {
  it('writes into the folder that is still new under it, and leaves the other run\'s files as they are', async () => {
    race.folder = path.join(dir, 'together');
    const back = /** @type {any} */ (await render('page.html', {cwd: dir, reverse: true, out: 'together/mine/page.tsx'}));
    expect(race.done).toBe(true);
    expect(back.data).toMatchObject({exact: true, output: 'together/mine/page.tsx'});
    expect(fs.readFileSync(path.join(dir, 'together/mine/page.tsx'), 'utf8')).toBe(PAGE);
    expect(fs.readFileSync(path.join(dir, 'together/other/page.tsx'), 'utf8')).toBe('the other run\n');
  }, 60_000);
});
