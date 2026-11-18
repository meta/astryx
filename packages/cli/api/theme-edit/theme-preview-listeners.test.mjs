// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The preview API leaves the caller's stop handling as it found it:
 * after preview add, app and remove, done or refused, the process has the
 * same SIGINT and SIGTERM listeners it had before, so a program that uses
 * the API can still be stopped with Ctrl-C or kill.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditNew,
  themeEditPreviewAdd,
  themeEditPreviewApp,
  themeEditPreviewRemove,
} from './theme-edit.mjs';
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
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-preview-listeners-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  fs.mkdirSync(path.join(cwd, 'src/app'), {recursive: true});
  fs.writeFileSync(
    path.join(cwd, 'src/app/layout.tsx'),
    "import '@astryxdesign/core/astryx.css';\nexport default function RootLayout({children}) { return children; }\n",
  );
  await themeEditNew('t', {cwd, like: 'neutral'});
}, 240_000);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** The stop listeners the process has now. */
const stops = () => ({
  SIGINT: process.listenerCount('SIGINT'),
  SIGTERM: process.listenerCount('SIGTERM'),
});

/**
 * Run an API call, done or refused, and give the listener counts before
 * and after it.
 * @param {() => Promise<unknown>} call
 */
async function around(call) {
  const before = stops();
  let refused = false;
  try {
    await call();
  } catch {
    refused = true;
  }
  return {before, after: stops(), refused};
}

describe('the preview API leaves no stop listener behind', () => {
  it('preview add, done and refused', async () => {
    const done = await around(() =>
      themeEditPreviewAdd(undefined, {cwd, theme: 't'}),
    );
    expect(done.refused).toBe(false);
    expect(done.after).toEqual(done.before);
    const refused = await around(() =>
      themeEditPreviewAdd(undefined, {cwd, theme: 'no-such-theme'}),
    );
    expect(refused.refused).toBe(true);
    expect(refused.after).toEqual(refused.before);
  }, 240_000);

  it('preview remove, done and refused', async () => {
    const done = await around(() => themeEditPreviewRemove(undefined, {cwd}));
    expect(done.refused).toBe(false);
    expect(done.after).toEqual(done.before);
    const refused = await around(() =>
      themeEditPreviewRemove(undefined, {cwd}),
    );
    expect(refused.refused).toBe(true);
    expect(refused.after).toEqual(refused.before);
  }, 240_000);

  it('preview app, done and refused', async () => {
    const done = await around(() =>
      themeEditPreviewApp('my-app', {cwd, theme: 't'}),
    );
    expect(done.refused).toBe(false);
    expect(done.after).toEqual(done.before);
    const refused = await around(() =>
      themeEditPreviewApp('my-app', {cwd, theme: 't'}),
    );
    expect(refused.refused).toBe(true);
    expect(refused.after).toEqual(refused.before);
  }, 240_000);
});
