// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/HoverCard

/**
 * @file HoverCardTriggerRoles.a11y.browser.spec.ts
 * @input Built Storybook, a labelled HoverCard open on a role-less text trigger
 * @output Proof that the trigger names the card through aria-controls only and
 *   that the open card passes axe, in Chromium and WebKit
 * @position Browser regression for the labelled trigger's popup attributes
 */

import AxeBuilder from '@axe-core/playwright';
import {expect, test} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => storybook?.close());

test('a labelled card on a role-less trigger passes axe while open', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-hovercard--labelled-text-trigger&viewMode=story`,
  );
  const card = page.getByRole('dialog', {name: 'Jane Doe profile'});
  await expect(card).toBeVisible();
  const cardId = await card.getAttribute('id');
  const trigger = page
    .getByRole('paragraph')
    .getByText('Jane Doe', {exact: true});
  await expect(trigger).toHaveAttribute('aria-controls', cardId ?? '');
  await expect(trigger).not.toHaveAttribute('aria-haspopup');
  await expect(trigger).not.toHaveAttribute('aria-expanded');
  // A story is a page fragment with no landmarks or heading.
  const results = await new AxeBuilder({page})
    .disableRules(['landmark-one-main', 'page-has-heading-one', 'region'])
    .analyze();
  expect(
    results.violations.map(
      violation =>
        `${violation.id}: ${violation.nodes.map(node => node.target.join(' ')).join(', ')}`,
    ),
  ).toEqual([]);
});
