// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A theme made with the theme editor, shared with its saved state and
 * added with `theme add`: the receiver keeps editing it, and the editor's
 * next build updates the app copy the add wrote.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, expect, it, vi} from 'vitest';
import {themeAdd} from './add.mjs';
import {themeEditNew, themeEditSet} from '../../theme-edit/theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../../test-utils/base-theme-fixture.mjs';

// The renders are stood in for: this test is about the files the add and
// the editor write, not the rendered pages.
vi.mock('../../theme-edit/_preview.mjs', async importOriginal =>
  (await import('../../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let maker;
/** @type {string} */
let receiver;
/** @type {string} */
let bundle;

beforeAll(() => {
  maker = makeLinkedFixture('astryx-theme-add-editor-maker-', FIXTURE_PACKAGES);
  receiver = makeLinkedFixture(
    'astryx-theme-add-editor-receiver-',
    FIXTURE_PACKAGES,
  );
  for (const app of [maker, receiver]) writeFixtureBaseTheme(app, 'neutral');
  bundle = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-editor-bundle-'));
}, 120_000);

afterAll(() => {
  removeLinkedFixture(maker);
  removeLinkedFixture(receiver);
  fs.rmSync(bundle, {recursive: true, force: true});
});

it('an editor set after the add updates the app copy the add wrote', async () => {
  await themeEditNew('sunset', {cwd: maker});
  // (The bundle a builder shares: the editor's folder and its app copy.)
  fs.cpSync(path.join(maker, 'themes/sunset'), path.join(bundle, 'editor'), {
    recursive: true,
  });
  fs.cpSync(
    path.join(maker, 'src/themes/sunset'),
    path.join(bundle, 'app-copy'),
    {recursive: true},
  );

  const added = await themeAdd(bundle, {cwd: receiver});
  expect(added.data.copy?.editor?.files).toContain('sunset.settings.json');

  const before = fs.readFileSync(
    path.join(receiver, 'src/themes/sunset/sunset.css'),
    'utf8',
  );
  const set = await themeEditSet('sunset', 'corners', 'pill', {cwd: receiver});
  expect(/** @type {any} */ (set.data).appCopyStale).toBeUndefined();
  expect(
    fs.readFileSync(
      path.join(receiver, 'src/themes/sunset/sunset.css'),
      'utf8',
    ),
  ).not.toBe(before);
}, 300_000);
