// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SideNavCollapseFocus.a11y.chromium.spec.ts
 * @input The built Storybook's `Core/SideNav` collapse-focus stories: a
 *   collapsible SideNav whose app collapses it from a `[` shortcut, with an
 *   icon-less "Reports" row the collapsed rail does not render, and a button
 *   outside the nav
 * @output Real-Chromium proof of `component:SideNav` AR3: focus on a row the
 *   collapsed rail removes moves to the collapse toggle, or, with no toggle,
 *   to the nearest row still in the rail; focus elsewhere is not moved
 * @position Testing; the unit cases are in SideNav.test.tsx
 *
 * SYNC: When modified, update the AR3 Verification row in SideNav.spec.md.
 */

import {expect, test, type Page} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(DEFAULT_STORYBOOK_DIR);
});

test.afterAll(async () => {
  await storybook?.close();
});

async function openStory(page: Page, story: string): Promise<void> {
  await page.goto(`${storybook.origin}/iframe.html?id=${story}&viewMode=story`);
  await page.getByRole('link', {name: 'Reports'}).waitFor();
}

test('focus on a row the collapsed rail removes moves to the collapse toggle', async ({
  page,
}) => {
  await openStory(page, 'core-sidenav--collapse-focus');
  const reports = page.getByRole('link', {name: 'Reports'});
  await reports.focus();
  await page.keyboard.press('[');

  await expect(reports).toHaveCount(0);
  await expect(
    page.getByRole('button', {name: 'Expand sidebar'}),
  ).toBeFocused();
});

test('without a toggle, focus moves to the nearest row still in the rail', async ({
  page,
}) => {
  await openStory(page, 'core-sidenav--collapse-focus-without-toggle');
  await page.getByRole('link', {name: 'Reports'}).focus();
  await page.keyboard.press('[');

  // Dashboard precedes Reports and keeps an icon-only row in the rail.
  await expect(page.getByRole('link', {name: 'Dashboard'})).toBeFocused();
});

test('focus outside the removed rows is not moved', async ({page}) => {
  await openStory(page, 'core-sidenav--collapse-focus');
  const elsewhere = page.getByRole('button', {name: 'Elsewhere'});
  await elsewhere.focus();
  await page.keyboard.press('[');

  await expect(page.getByRole('link', {name: 'Reports'})).toHaveCount(0);
  await expect(elsewhere).toBeFocused();

  // A row the rail keeps keeps its focus too.
  await page.keyboard.press('[');
  const team = page.getByRole('link', {name: 'Team'});
  await team.focus();
  await page.keyboard.press('[');
  await expect(team).toBeFocused();
});
