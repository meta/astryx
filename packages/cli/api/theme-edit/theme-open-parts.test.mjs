// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The open states page draws every part that opens a layer of its
 * own, a part of another part included (a menu's submenu and radio group, a
 * tab list's overflow menu, a top bar's menu); only an overlay's own parts
 * (a dialog's header) stay inside the overlay they belong to.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {openProject} from './_project.mjs';
import {showcaseItems} from './_preview.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {appPackages} from '../../test-utils/theme-edit-fixture.mjs';

/** @type {string} */
let cwd;

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-open-parts-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  fs.writeFileSync(
    path.join(cwd, 'package.json'),
    `${JSON.stringify(appPackages({packageManager: 'npm@10.9.0'}))}\n`,
  );
}, 120_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('the open states page', () => {
  it('draws open every part of another part that opens a layer of its own', async () => {
    const project = await openProject(cwd);
    const {items} = showcaseItems(project, 'overlays');
    /** @param {string} name */
    const drawnOpen = name =>
      items.some(i => i.name === name && (i.open || i.openable));
    for (const name of [
      'DropdownMenuSubMenu',
      'DropdownMenuRadioGroup',
      'TabMenu',
      'TopNavMenu',
    ])
      expect(drawnOpen(name), name).toBe(true);
    // An overlay's own part shows inside its overlay, never alone.
    for (const name of ['DialogHeader', 'DrawerHeader'])
      expect(
        items.some(i => i.name === name),
        name,
      ).toBe(false);
  }, 120_000);
});
